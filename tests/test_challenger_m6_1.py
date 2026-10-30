"""
Advance ERP — Challenger M6.1 Backend Adversarial Test Suite
Author: Challenger M6.1 (Backend Adversarial Challenger)
Mission: Empirically challenge and stress-test:
  1. SQL injection, whitespace, and invalid characters on /api/admin/table-schema/<path:table_name>
  2. Path traversal payloads on PDF upload endpoints (/api/mis/upload-pdf and /api/mis/templates/auto-detect)
  3. Authentication boundary enforcement on state-mutating endpoints under unauth, expired, and malformed tokens
  4. Zero data loss baseline (9 users, 27 reports, 158 catalog mappings)
"""
import io
import os
import sys
import json
import time
import unittest
import urllib.parse
from datetime import timedelta
from flask_jwt_extended import create_access_token

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.models import (
    User, Report, DBTaskCatalog, MISReportUpload, TaskSkip
)


class ChallengerM61AdversarialSuite(unittest.TestCase):
    """Adversarial stress and verification harness for backend security and integrity."""

    EXPECTED_USERS = {
        'vaibhav@agalabs.com', 'nishant@agalabs.com', 'ram@agalabs.com',
        'gopichand@agalabs.com', 'nitesh@agalabs.com', 'pankaj@agalabs.com',
        'damini@agalabs.com', 'bhawna@agalabs.com', 'balram@agalabs.com'
    }

    EXPECTED_REPORTS_COUNT = 27
    EXPECTED_CATALOG_COUNT = 158

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            # Snapshot baseline state
            cls.initial_users_count = User.query.count()
            cls.initial_reports_count = Report.query.count()
            cls.initial_catalog_count = DBTaskCatalog.query.count()

            print(f"\n[Challenger M6.1 Pre-Test Baseline] "
                  f"Users: {cls.initial_users_count}, "
                  f"Reports: {cls.initial_reports_count}, "
                  f"Catalog: {cls.initial_catalog_count}")

            assert cls.initial_users_count >= len(cls.EXPECTED_USERS), (
                f"Initial users count {cls.initial_users_count} less than expected {len(cls.EXPECTED_USERS)}"
            )
            assert cls.initial_reports_count >= cls.EXPECTED_REPORTS_COUNT, (
                f"Initial reports count {cls.initial_reports_count} less than expected {cls.EXPECTED_REPORTS_COUNT}"
            )
            assert cls.initial_catalog_count >= 156, (
                f"Initial catalog count {cls.initial_catalog_count} less than expected 156"
            )

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            final_users = User.query.count()
            final_reports = Report.query.count()
            final_catalog = DBTaskCatalog.query.count()

            print(f"\n[Challenger M6.1 Post-Test Oracle] "
                  f"Users: {final_users}, Reports: {final_reports}, Catalog: {final_catalog}")

            assert final_users == cls.initial_users_count, (
                f"Zero Data Loss VIOLATION: Users changed from {cls.initial_users_count} to {final_users}"
            )
            assert final_reports == cls.initial_reports_count, (
                f"Zero Data Loss VIOLATION: Reports changed from {cls.initial_reports_count} to {final_reports}"
            )
            assert final_catalog == cls.initial_catalog_count, (
                f"Zero Data Loss VIOLATION: Catalog changed from {cls.initial_catalog_count} to {final_catalog}"
            )

    def get_valid_auth_headers(self, email='vaibhav@agalabs.com'):
        """Generate valid JWT auth headers for superadmin."""
        with self.app.app_context():
            token = create_access_token(identity=email)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def get_expired_auth_headers(self, email='vaibhav@agalabs.com'):
        """Generate expired JWT token (negative timedelta)."""
        with self.app.app_context():
            token = create_access_token(identity=email, expires_delta=timedelta(seconds=-300))
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def get_malformed_auth_headers(self):
        """Generate malformed JWT headers."""
        return {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.INVALID_PAYLOAD.SIGNATURE',
            'Content-Type': 'application/json'
        }

    # =========================================================================
    # 1. TABLE SCHEMA ROUTE ADVERSARIAL STRESS TESTING
    # =========================================================================
    def test_table_schema_unauthenticated_and_token_abuse(self):
        """Verify /api/admin/table-schema/<path:table_name> strictly rejects unauthenticated, expired, and malformed tokens."""
        url = '/api/admin/table-schema/db_task_catalog'

        # 1. No Authorization header
        res_no_auth = self.client.get(url)
        self.assertEqual(res_no_auth.status_code, 401,
                         f"Expected 401 for missing auth header, got {res_no_auth.status_code}")

        # 2. Expired JWT token
        res_expired = self.client.get(url, headers=self.get_expired_auth_headers())
        self.assertEqual(res_expired.status_code, 401,
                         f"Expected 401 for expired token, got {res_expired.status_code}")

        # 3. Malformed JWT token
        res_malformed = self.client.get(url, headers=self.get_malformed_auth_headers())
        self.assertIn(res_malformed.status_code, [401, 422],
                      f"Expected 401 or 422 for malformed token, got {res_malformed.status_code}")

        # 4. Truncated / empty bearer
        res_empty_bearer = self.client.get(url, headers={'Authorization': 'Bearer '})
        self.assertIn(res_empty_bearer.status_code, [401, 422],
                      f"Expected 401 or 422 for empty bearer, got {res_empty_bearer.status_code}")

        # 5. Non-bearer scheme
        res_basic = self.client.get(url, headers={'Authorization': 'Basic YWRtaW46cGFzc3dvcmQ='})
        self.assertIn(res_basic.status_code, [401, 422],
                      f"Expected 401 or 422 for Basic auth scheme, got {res_basic.status_code}")

    def test_table_schema_sql_injection_and_invalid_chars(self):
        """Stress /api/admin/table-schema/<path:table_name> with exhaustive SQL injection payloads, whitespace, and invalid characters."""
        headers = self.get_valid_auth_headers()

        hostile_table_names = [
            # SQL statement chaining & termination
            'test_table; DROP TABLE users; --',
            'test_table; DROP TABLE db_task_catalog; --',
            "test'; DROP TABLE users; --",
            'test"; DROP TABLE users; --',
            # Quoting & backtick breakouts
            'test` OR 1=1 --',
            '`users`',
            'test` UNION SELECT 1,2,3,4,5,6,7,8,9,10--',
            'test` AND SLEEP(2)--',
            'test` /*comment*/',
            # SQL keywords & boolean logic
            'SELECT * FROM users',
            '1=1',
            "' OR '1'='1",
            '" OR "1"="1',
            "admin' --",
            # Whitespace and formatting injection
            'table with spaces',
            'table\twith\ttabs',
            ' table_with_leading_space',
            'table_with_trailing_space ',
            # Slashes and path separators
            'table/name',
            '../table',
            '../../table',
            '..\\..\\table',
            'C:\\boot.ini',
            '/etc/passwd',
            # Shell and special characters
            'table$name',
            'table#name',
            'table?name',
            'table@name',
            'table!name',
            'table%name',
            'table^name',
            'table&name',
            'table*name',
            'table(name)',
            'table+name',
            'table=name',
            'table|name',
            'table\\name',
            'table.name',
            'table,name',
            'table:name',
            'table<name>',
            'table{name}',
            'table[name]',
            'table~name',
            # Null bytes and binary
            'table\x00name',
            # Unicode and emojis
            'unicode_táble',
            'unicode_漢字',
            'emoji_table_😀',
        ]

        for raw_payload in hostile_table_names:
            # We encode through urllib.parse.quote to ensure special characters (#, ?, tabs, spaces)
            # are transmitted in the HTTP URL path segment rather than truncated by HTTP clients
            encoded_path = urllib.parse.quote(raw_payload, safe='')
            res = self.client.get(f'/api/admin/table-schema/{encoded_path}', headers=headers, follow_redirects=True)

            self.assertEqual(
                res.status_code, 400,
                f"SQL injection / hostile character payload '{raw_payload}' (encoded '{encoded_path}') was NOT rejected with HTTP 400! Got {res.status_code}: {res.data}"
            )
            data = res.get_json() or {}
            self.assertFalse(data.get('success'), f"Expected success=False for payload '{raw_payload}'")
            self.assertIn('Invalid table name format', data.get('error', ''),
                          f"Expected 'Invalid table name format' error for '{raw_payload}'")

    def test_table_schema_accepts_valid_identifiers(self):
        """Verify /api/admin/table-schema/<path:table_name> accepts safe alphanumeric + underscore table names."""
        headers = self.get_valid_auth_headers()

        valid_names = [
            'users',
            'pyexcel_rakemovement',
            'db_task_catalog',
            'valid_identifier_123',
            'UPPERCASE_TABLE_NAME_456'
        ]

        for table in valid_names:
            res = self.client.get(f'/api/admin/table-schema/{table}', headers=headers)
            self.assertEqual(res.status_code, 200,
                             f"Expected 200 for valid table '{table}', got {res.status_code}: {res.data}")
            data = res.get_json()
            self.assertTrue(data.get('success'))
            self.assertEqual(data.get('table'), table)
            self.assertIsInstance(data.get('columns'), list)

    # =========================================================================
    # 2. PDF UPLOAD PATH TRAVERSAL ADVERSARIAL STRESS TESTING
    # =========================================================================
    def test_pdf_upload_unauthenticated_and_token_abuse(self):
        """Verify /api/mis/upload-pdf and /api/mis/templates/auto-detect strictly reject unauthenticated / invalid token calls."""
        endpoints = ['/api/mis/upload-pdf', '/api/mis/templates/auto-detect']
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

        for ep in endpoints:
            # 1. No auth
            data = {'file': (io.BytesIO(pdf_bytes), 'test.pdf'), 'reportType': 'test'}
            res = self.client.post(ep, data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 401, f"{ep} allowed request without Authorization header")

            # 2. Expired token
            data = {'file': (io.BytesIO(pdf_bytes), 'test.pdf'), 'reportType': 'test'}
            headers = self.get_expired_auth_headers()
            headers.pop('Content-Type', None)
            res = self.client.post(ep, data=data, headers=headers, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 401, f"{ep} allowed request with expired token")

            # 3. Malformed token
            data = {'file': (io.BytesIO(pdf_bytes), 'test.pdf'), 'reportType': 'test'}
            headers = self.get_malformed_auth_headers()
            headers.pop('Content-Type', None)
            res = self.client.post(ep, data=data, headers=headers, content_type='multipart/form-data')
            self.assertIn(res.status_code, [401, 422], f"{ep} did not reject malformed token with 401/422")

    def test_pdf_upload_path_traversal_neutralization(self):
        """Stress /api/mis/upload-pdf and /api/mis/templates/auto-detect with exhaustive path traversal payloads."""
        with self.app.app_context():
            token = create_access_token(identity='vaibhav@agalabs.com')

        headers = {'Authorization': f'Bearer {token}'}
        upload_folder = self.app.config.get('UPLOAD_FOLDER', 'uploads')
        upload_folder_abs = os.path.abspath(upload_folder)

        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

        path_traversal_filenames = [
            '../../evil_traversal_1.pdf',
            '..\\..\\evil_traversal_2.pdf',
            '../../../../../../../../Windows/System32/evil_traversal_3.pdf',
            '..\\..\\..\\..\\..\\..\\..\\..\\Windows\\win_evil_4.pdf',
            '/etc/evil_traversal_5.pdf',
            'C:\\evil_traversal_6.pdf',
            'D:\\evil_traversal_7.pdf',
            '....//....//nested_evil_8.pdf',
            '..%2f..%2fevil_traversal_9.pdf',
            'nested/folder/evil_traversal_10.pdf',
            'nested\\folder\\evil_traversal_11.pdf',
            'evil_traversal_12.pdf\x00.exe',
            '   ....evil_traversal_13.pdf   ',
        ]

        try:
            for bad_filename in path_traversal_filenames:
                data = {
                    'file': (io.BytesIO(pdf_bytes), bad_filename),
                    'reportType': 'AdversarialTest'
                }
                res = self.client.post(
                    '/api/mis/upload-pdf',
                    data=data,
                    headers=headers,
                    content_type='multipart/form-data'
                )

                # Ensure NO files escaped UPLOAD_FOLDER to parent directories
                parent_dir = os.path.dirname(upload_folder_abs)
                grandparent_dir = os.path.dirname(parent_dir)

                for base_dir in [parent_dir, grandparent_dir]:
                    if os.path.exists(base_dir):
                        for f in os.listdir(base_dir):
                            self.assertFalse(
                                'evil_traversal' in f,
                                f"SECURITY CRITICAL: Path traversal payload '{bad_filename}' escaped to {base_dir}! Found file: {f}"
                            )

                # Now check that all saved files stay strictly inside upload_folder_abs
                for fname in os.listdir(upload_folder_abs):
                    if 'evil_traversal' in fname:
                        full_saved_path = os.path.abspath(os.path.join(upload_folder_abs, fname))
                        self.assertTrue(
                            full_saved_path.startswith(upload_folder_abs),
                            f"File {fname} is outside upload directory {upload_folder_abs}"
                        )
                        # Verify the filename has no path separators
                        self.assertNotIn('/', fname)
                        self.assertNotIn('\\', fname)

                # Check auto-detect route as well
                data_auto = {
                    'file': (io.BytesIO(pdf_bytes), bad_filename)
                }
                res_auto = self.client.post(
                    '/api/mis/templates/auto-detect',
                    data=data_auto,
                    headers=headers,
                    content_type='multipart/form-data'
                )
                for base_dir in [parent_dir, grandparent_dir]:
                    if os.path.exists(base_dir):
                        for f in os.listdir(base_dir):
                            self.assertFalse(
                                'evil_traversal' in f,
                                f"SECURITY CRITICAL: Auto-detect traversal payload '{bad_filename}' escaped to {base_dir}! Found file: {f}"
                            )

        finally:
            # Clean up all created test artifacts inside upload_folder
            for fname in os.listdir(upload_folder_abs):
                if 'evil_traversal' in fname or 'unnamed_report' in fname:
                    try:
                        os.remove(os.path.join(upload_folder_abs, fname))
                    except Exception:
                        pass

            # Sweep any created MISReportUpload test rows
            with self.app.app_context():
                try:
                    MISReportUpload.query.filter(
                        (MISReportUpload.report_type == 'AdversarialTest') |
                        (MISReportUpload.original_filename.like('%evil_traversal%'))
                    ).delete(synchronize_session=False)
                    db.session.commit()
                except Exception:
                    db.session.rollback()

    # =========================================================================
    # 3. STATE-MUTATING ENDPOINTS AUTHENTICATION ADVERSARIAL STRESS
    # =========================================================================
    def test_state_mutating_endpoints_unconditional_rejection(self):
        """Adversarially test 13 state-mutating endpoints across 4 hostile auth states (52 matrix tests).
        Verifies every mutating route unconditionally rejects with HTTP 401 or 422.
        """
        mutating_endpoints = [
            ('DELETE', '/api/admin/table-mappings/999999', None),
            ('DELETE', '/api/admin/table-mappings/71', None),  # Real ID 71 — must NOT be deleted
            ('POST', '/api/crishi/pull', {'catalogId': 71, 'slaHours': 24}),
            ('POST', '/api/crishi/skip', {'catalogId': 71, 'reason': 'Hostile Attack'}),
            ('POST', '/api/crishi/roster/apply-week', {'week': 1}),
            ('PUT', '/api/roster/rake-zones', {'person': 'Nishant', 'zones': 'HostileZone'}),
            ('POST', '/api/roster/rake-date', {'date': '2026-11-01'}),
            ('PUT', '/api/roster/monthly-duties', {'duties': [{'person': 'Attacker', 'duty': 'None'}]}),
            ('POST', '/api/roster/apply-week', {'week': 1}),
            ('POST', '/api/roster/assign-backup', {'dutyRole': 'Scrapper', 'primaryUser': 'A', 'backupUser': 'B'}),
            ('POST', '/api/roster/generate-random', {'weeks': 5}),
            ('PUT', '/api/roster/scrapper-matrix', {'matrix': []}),
            ('POST', '/api/roster/structure', {'matrix': []}),
        ]

        hostile_auth_cases = [
            ('no_auth', {}),
            ('expired_token', self.get_expired_auth_headers()),
            ('malformed_token', self.get_malformed_auth_headers()),
            ('garbage_scheme', {'Authorization': 'InvalidScheme token123', 'Content-Type': 'application/json'}),
        ]

        for method, url, payload in mutating_endpoints:
            for auth_label, auth_headers in hostile_auth_cases:
                kwargs = {'headers': dict(auth_headers)}
                if payload is not None:
                    kwargs['data'] = json.dumps(payload)
                    kwargs['headers']['Content-Type'] = 'application/json'

                if method == 'DELETE':
                    res = self.client.delete(url, **kwargs)
                elif method == 'POST':
                    res = self.client.post(url, **kwargs)
                elif method == 'PUT':
                    res = self.client.put(url, **kwargs)
                else:
                    self.fail(f"Unsupported method {method}")

                self.assertIn(
                    res.status_code, [401, 422],
                    f"SECURITY FLAW: Endpoint {method} {url} under auth state '{auth_label}' "
                    f"failed to reject with 401/422! Got HTTP {res.status_code}: {res.data}"
                )

        # Assert ID 71 table mapping still exists and was not deleted by the unauth DELETE attempts
        with self.app.app_context():
            mapping_71 = db.session.get(DBTaskCatalog, 71)
            self.assertIsNotNone(mapping_71, "CRITICAL ERROR: DBTaskCatalog ID 71 was deleted by unauthenticated caller!")

    # =========================================================================
    # 4. ZERO DATA LOSS BASELINE ORACLE
    # =========================================================================
    def test_zero_data_loss_and_database_invariants(self):
        """Empirically verify 100% preservation of baseline users, reports, and catalog mappings."""
        with self.app.app_context():
            # 1. Users verification
            users = User.query.all()
            user_emails = {u.email.lower() for u in users}
            self.assertEqual(len(users), 9, f"Expected exactly 9 users, found {len(users)}")
            for expected_email in self.EXPECTED_USERS:
                self.assertIn(expected_email, user_emails,
                              f"Missing baseline user: {expected_email}")

            # 2. Reports verification
            reports = Report.query.all()
            self.assertEqual(len(reports), self.EXPECTED_REPORTS_COUNT,
                             f"Expected exactly {self.EXPECTED_REPORTS_COUNT} reports, found {len(reports)}")

            # 3. Table Catalog mappings verification
            catalog_count = DBTaskCatalog.query.count()
            self.assertEqual(catalog_count, self.EXPECTED_CATALOG_COUNT,
                             f"Expected {self.EXPECTED_CATALOG_COUNT} catalog mappings, found {catalog_count}")


if __name__ == '__main__':
    unittest.main()
