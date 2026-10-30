"""
Empirical Challenger 2 Adversarial Stress Test Harness
Focus: Update History Extraction, Immutability, Concurrency, and Context Decoupling.
Author: Challenger 2 (Empirical Challenger)
"""
import sys
import os
import unittest
import threading
import subprocess
from datetime import datetime, date, timezone
from flask import has_app_context
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, TableUpdateHistory, _SafeQueryProperty
from app.services.history_service import extract_table_db_update_history, record_table_update_history


class TestChallenger2EmpiricalUpdateHistory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            cls.admin_token = create_access_token(
                identity='nishant@agalabs.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            cls.teammate_token = create_access_token(
                identity='bhawna@agalabs.com',
                additional_claims={'role': 'Teammate'}
            )
            cls.admin_headers = {
                'Authorization': f'Bearer {cls.admin_token}',
                'Content-Type': 'application/json'
            }
            cls.teammate_headers = {
                'Authorization': f'Bearer {cls.teammate_token}',
                'Content-Type': 'application/json'
            }

    @classmethod
    def tearDownClass(cls):
        # Assert database invariants are strictly intact
        with cls.app.app_context():
            u_count = User.query.count()
            r_count = Report.query.count()
            c_count = DBTaskCatalog.query.count()
            assert u_count == 9, f"Invariant failure: Users count={u_count}, expected 9"
            assert r_count == 27, f"Invariant failure: Reports count={r_count}, expected 27"
            assert c_count == 158, f"Invariant failure: Catalogs count={c_count}, expected 158"

    # =========================================================================
    # 1. Extraction & Immutability: Repeated Sync Appends Monotonically
    # =========================================================================
    def test_01_repeated_sync_strictly_appends_distinct_monotonic_records(self):
        """
        Verify that repeated calls to POST /api/crishi/sync-report-db strictly append
        distinct history records without overwriting or mutating prior rows or timestamps,
        and history record counts strictly grow monotonically.
        """
        payload = {
            'catalogId': 201,
            'reportDate': '2026-07-01',
            'userName': 'Bhawna'
        }

        # Baseline count before calls
        initial_count = TableUpdateHistory.query.count()

        created_record_ids = []
        snapshots = {}

        # Execute 5 repeated sync calls
        for iteration in range(1, 6):
            res = self.client.post('/api/crishi/sync-report-db', json=payload, headers=self.admin_headers)
            self.assertEqual(res.status_code, 200, f"Call {iteration} failed: {res.data}")
            data = res.get_json()
            self.assertTrue(data.get('success'), f"Call {iteration} did not return success=True")

            current_count = TableUpdateHistory.query.count()
            expected_count = initial_count + iteration

            # Check monotonic growth
            self.assertEqual(
                current_count, expected_count,
                f"History count did not grow monotonically: expected {expected_count}, got {current_count}"
            )

            # Retrieve the newly inserted record
            latest_record = TableUpdateHistory.query.order_by(TableUpdateHistory.id.desc()).first()
            self.assertIsNotNone(latest_record)
            self.assertNotIn(latest_record.id, created_record_ids, "Record ID must be unique and distinct")
            created_record_ids.append(latest_record.id)

            # Take a snapshot of the record's immutable fields
            snapshots[latest_record.id] = {
                'id': latest_record.id,
                'db_update_timestamp': latest_record.db_update_timestamp,
                'report_date': latest_record.report_date,
                'person_name': latest_record.person_name,
                'table_name': latest_record.table_name,
                'final_name': latest_record.final_name,
                'commodity': latest_record.commodity,
                'status': latest_record.status,
                'row_count': latest_record.row_count,
                'created_at': latest_record.created_at
            }

        # Verify all created records have strictly ascending distinct primary keys
        self.assertEqual(len(created_record_ids), 5)
        self.assertEqual(created_record_ids, sorted(created_record_ids))

        # Re-fetch all created records and verify that none of the older rows mutated
        for rec_id, initial_snap in snapshots.items():
            current_row = TableUpdateHistory.query.filter_by(id=rec_id).first()
            self.assertIsNotNone(current_row, f"Record {rec_id} was deleted or missing")
            self.assertEqual(current_row.id, initial_snap['id'])
            self.assertEqual(current_row.db_update_timestamp, initial_snap['db_update_timestamp'])
            self.assertEqual(current_row.report_date, initial_snap['report_date'])
            self.assertEqual(current_row.person_name, initial_snap['person_name'])
            self.assertEqual(current_row.table_name, initial_snap['table_name'])
            self.assertEqual(current_row.final_name, initial_snap['final_name'])
            self.assertEqual(current_row.commodity, initial_snap['commodity'])
            self.assertEqual(current_row.status, initial_snap['status'])
            self.assertEqual(current_row.row_count, initial_snap['row_count'])
            self.assertEqual(current_row.created_at, initial_snap['created_at'])

    # =========================================================================
    # 2. Immutability: Direct HTTP Mutations Rejected with 405
    # =========================================================================
    def test_02_direct_mutations_on_update_history_rejected_405(self):
        """
        Verify that direct mutations (PUT, POST, PATCH, DELETE) on /api/crishi/update-history
        return HTTP 405 Method Not Allowed to preserve log immutability.
        """
        # Baseline check
        initial_record = TableUpdateHistory.query.first()
        self.assertIsNotNone(initial_record)
        target_id = initial_record.id
        orig_remarks = initial_record.remarks
        orig_status = initial_record.status

        # 1. PUT attempt
        res_put = self.client.put(
            '/api/crishi/update-history',
            json={'id': target_id, 'remarks': 'Tampered by Challenger', 'status': 'Hacked'},
            headers=self.admin_headers
        )
        self.assertEqual(res_put.status_code, 405, f"PUT returned {res_put.status_code}, expected 405")

        # 2. POST attempt
        res_post = self.client.post(
            '/api/crishi/update-history',
            json={'id': target_id, 'remarks': 'Tampered by Challenger'},
            headers=self.admin_headers
        )
        self.assertEqual(res_post.status_code, 405, f"POST returned {res_post.status_code}, expected 405")

        # 3. PATCH attempt
        res_patch = self.client.patch(
            '/api/crishi/update-history',
            json={'id': target_id, 'remarks': 'Tampered by Challenger'},
            headers=self.admin_headers
        )
        self.assertEqual(res_patch.status_code, 405, f"PATCH returned {res_patch.status_code}, expected 405")

        # 4. DELETE attempt
        res_del = self.client.delete(
            f'/api/crishi/update-history?id={target_id}',
            headers=self.admin_headers
        )
        self.assertEqual(res_del.status_code, 405, f"DELETE returned {res_del.status_code}, expected 405")

        # Confirm target row in DB is completely unmutated
        re_fetched = TableUpdateHistory.query.filter_by(id=target_id).first()
        self.assertIsNotNone(re_fetched)
        self.assertEqual(re_fetched.remarks, orig_remarks)
        self.assertEqual(re_fetched.status, orig_status)

    # =========================================================================
    # 3. History Extraction Service Inside and Outside Active Flask Context
    # =========================================================================
    def test_03_extract_table_db_update_history_inside_and_outside_context(self):
        """
        Verify that extract_table_db_update_history accurately extracts table timestamps
        and row counts from live database queries both inside and outside active Flask contexts.
        """
        # A. Inside active Flask application context
        with self.app.app_context():
            self.assertTrue(has_app_context())
            res_inside = extract_table_db_update_history(catalog_id=201, report_date='2026-07-01')
            self.assertIsInstance(res_inside, dict)
            self.assertIn('db_update_timestamp', res_inside)
            self.assertIn('row_count', res_inside)
            self.assertIn('status', res_inside)
            self.assertIn('table_name', res_inside)
            self.assertIn('verified', res_inside)
            self.assertIsInstance(res_inside['db_update_timestamp'], datetime)
            self.assertIsInstance(res_inside['row_count'], int)
            self.assertIn(res_inside['status'], ['Verified', 'Pending'])

        # B. Outside active Flask application context (tested in fresh isolated thread)
        outside_results = {}
        thread_errors = []

        def worker_outside():
            try:
                # Strictly assert NO application context exists on this thread
                if has_app_context():
                    thread_errors.append("has_app_context() was unexpectedly True on fresh thread")
                    return
                # Extract by catalog_id
                res_out = extract_table_db_update_history(catalog_id=201, report_date='2026-07-01')
                outside_results['catalog'] = res_out

                # Extract by raw_table_name
                res_raw = extract_table_db_update_history(
                    raw_table_name=res_inside['table_name'],
                    report_date='2026-07-01'
                )
                outside_results['raw'] = res_raw

                # Edge cases
                res_empty = extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None)
                outside_results['empty'] = res_empty

                res_none = extract_table_db_update_history(catalog_id=999999, report_date='2026-07-01')
                outside_results['none'] = res_none
            except Exception as e:
                thread_errors.append(f"{type(e).__name__}: {str(e)}")

        t = threading.Thread(target=worker_outside)
        t.start()
        t.join(timeout=10.0)

        self.assertEqual(len(thread_errors), 0, f"Outside context extraction failed: {thread_errors}")
        res_outside = outside_results['catalog']

        # C. Compare values between inside and outside context runs
        self.assertEqual(res_inside['table_name'], res_outside['table_name'])
        self.assertEqual(res_inside['row_count'], res_outside['row_count'])
        self.assertEqual(res_inside['status'], res_outside['status'])
        self.assertEqual(res_inside['verified'], res_outside['verified'])
        self.assertEqual(
            res_inside['db_update_timestamp'].isoformat()[:16],
            res_outside['db_update_timestamp'].isoformat()[:16]
        )

        # D. Validate raw extraction outside context
        self.assertEqual(outside_results['raw']['table_name'], res_inside['table_name'])
        self.assertEqual(outside_results['raw']['row_count'], res_inside['row_count'])

        # E. Validate edge cases outside context
        self.assertEqual(outside_results['empty']['row_count'], 0)
        self.assertEqual(outside_results['empty']['status'], 'Pending')
        self.assertEqual(outside_results['none']['row_count'], 0)
        self.assertEqual(outside_results['none']['status'], 'Pending')

    # =========================================================================
    # 4. Concurrency & Context Decoupling across Threads
    # =========================================================================
    def test_04_concurrent_threads_querying_table_update_history_without_context(self):
        """
        Verify that TableUpdateHistory.query does not crash with
        RuntimeError: Working outside of application context when queried in external threads.
        """
        errors = []
        thread_results = []

        def worker_thread(thread_idx):
            try:
                # Ensure worker thread has no app context prior to query
                if has_app_context():
                    errors.append(f"Thread {thread_idx} unexpectedly had an active app context")
                    return

                # Query count
                cnt = TableUpdateHistory.query.count()
                # Query latest
                latest = TableUpdateHistory.query.order_by(TableUpdateHistory.id.desc()).first()

                thread_results.append({
                    'thread_idx': thread_idx,
                    'count': cnt,
                    'latest_id': latest.id if latest else None
                })
            except Exception as e:
                errors.append(f"Thread {thread_idx} raised {type(e).__name__}: {str(e)}")

        threads = []
        for i in range(10):
            t = threading.Thread(target=worker_thread, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join(timeout=10.0)

        # Assert zero errors occurred across all 10 concurrent threads
        self.assertEqual(len(errors), 0, f"Concurrent thread errors encountered: {errors}")
        self.assertEqual(len(thread_results), 10, "Not all threads reported results")

        # Assert all threads saw consistent count and latest_id
        baseline_cnt = thread_results[0]['count']
        baseline_latest = thread_results[0]['latest_id']
        for tr in thread_results:
            self.assertEqual(tr['count'], baseline_cnt)
            self.assertEqual(tr['latest_id'], baseline_latest)

    # =========================================================================
    # 5. Shell Script / Subprocess Context Decoupling
    # =========================================================================
    def test_05_subprocess_shell_query_executes_without_context_error(self):
        """
        Verify that TableUpdateHistory.query executes cleanly in an external Python subprocess
        without any explicit Flask app_context wrappers.
        """
        cmd = [
            sys.executable,
            "-c",
            "from app.models import TableUpdateHistory; print(f'SUBPROCESS_COUNT={TableUpdateHistory.query.count()}')"
        ]

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )

        self.assertEqual(
            proc.returncode, 0,
            f"Subprocess query crashed with code {proc.returncode}:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
        self.assertIn("SUBPROCESS_COUNT=", proc.stdout)
        self.assertNotIn("RuntimeError", proc.stderr)
        self.assertNotIn("Working outside of application context", proc.stderr)

    # =========================================================================
    # 6. Session Commit in _SafeQueryProperty Prevents Stale Reads Without Breaking Models
    # =========================================================================
    def test_06_safe_query_property_session_commit_and_model_isolation(self):
        """
        Verify that session commits inside _SafeQueryProperty prevent stale read
        isolation phenomena without impacting other models.
        """
        # Baseline count via query property
        c1 = TableUpdateHistory.query.count()

        # Commit a new entry within an explicit context
        with self.app.app_context():
            rec = record_table_update_history(
                catalog_id=201,
                report_date='2026-07-01',
                person_name='EmpiricalChallenger',
                remarks='Testing stale read isolation'
            )
            created_id = rec.id

        # Access TableUpdateHistory.query immediately: session.commit() inside _SafeQueryProperty
        # guarantees the newly committed record is instantly visible to the query
        c2 = TableUpdateHistory.query.count()
        self.assertEqual(c2, c1 + 1, "New record was not immediately visible through TableUpdateHistory.query")

        found = TableUpdateHistory.query.filter_by(id=created_id).first()
        self.assertIsNotNone(found, "Record could not be retrieved by ID")
        self.assertEqual(found.person_name, 'EmpiricalChallenger')

        # Verify other models continue to use default query properties and are unaffected
        with self.app.app_context():
            u_cnt = User.query.count()
            r_cnt = Report.query.count()
            c_cnt = DBTaskCatalog.query.count()
            self.assertEqual(u_cnt, 9, f"User.query.count() impacted: {u_cnt}")
            self.assertEqual(r_cnt, 27, f"Report.query.count() impacted: {r_cnt}")
            self.assertEqual(c_cnt, 158, f"DBTaskCatalog.query.count() impacted: {c_cnt}")

        # Verify only TableUpdateHistory uses _SafeQueryProperty
        self.assertIsInstance(TableUpdateHistory.__dict__['query'], _SafeQueryProperty)
        self.assertNotIsInstance(User.__dict__.get('query'), _SafeQueryProperty)
        self.assertNotIsInstance(Report.__dict__.get('query'), _SafeQueryProperty)
        self.assertNotIsInstance(DBTaskCatalog.__dict__.get('query'), _SafeQueryProperty)


if __name__ == '__main__':
    unittest.main()
