"""
Adversarial Backend Stress Harness — Advance ERP
Empirically stress-tests backend hierarchy, cascade sync, foreign keys, and edge cases.
Asserts zero baseline data loss and clean resource isolation.
"""
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import unittest
import json
import uuid
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import (
    User, Report, DBTaskCatalog,
    UserReportMapping, UserCommodityMapping
)

class AdversarialBackendStressSuite(unittest.TestCase):
    """Adversarial stress and edge case verification suite."""

    AUTHORITATIVE_BASELINE_EMAILS = {
        'nishant@agalabs.com', 'ram@agalabs.com', 'gopichand@agalabs.com',
        'nitesh@agalabs.com', 'pankaj@agalabs.com', 'damini@agalabs.com',
        'bhawna@agalabs.com', 'balram@agalabs.com', 'vaibhav@agalabs.com'
    }

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            # Sweep any leftover test entities
            cls._sweep_test_entities()

            # Snapshot baseline state
            cls.baseline_users_count = 9
            cls.baseline_reports_count = 27
            cls.baseline_catalog_count = 156

            cls.baseline_report_names = {r.name for r in Report.query.all()}
            actual_users = User.query.count()
            actual_reports = Report.query.count()
            actual_catalog = DBTaskCatalog.query.count()

            print(f"\n[Baseline Snapshot] Users: {actual_users}, Reports: {actual_reports}, Catalog: {actual_catalog}")
            assert actual_users >= cls.baseline_users_count, f"Baseline users corrupted: {actual_users}"
            assert actual_reports >= cls.baseline_reports_count, f"Baseline reports corrupted: {actual_reports}"
            assert actual_catalog >= cls.baseline_catalog_count, f"Baseline catalog corrupted: {actual_catalog}"

    @classmethod
    def _sweep_test_entities(cls):
        try:
            DBTaskCatalog.query.filter(
                (DBTaskCatalog.raw_table_name.like('adv_%')) |
                (DBTaskCatalog.user_name.like('%Adv%')) |
                (DBTaskCatalog.user_name.like('%Stress%'))
            ).delete(synchronize_session=False)

            User.query.filter(
                (User.email.like('adv_%')) |
                (User.name.like('%Adv%')) |
                (User.name.like('%Stress%'))
            ).delete(synchronize_session=False)

            Report.query.filter(Report.name.like('adv_%')).delete(synchronize_session=False)
            db.session.commit()
        except Exception:
            db.session.rollback()

    def setUp(self):
        self.created_emails = []
        self.created_mapping_ids = []
        self.created_report_ids = []

    def tearDown(self):
        with self.app.app_context():
            try:
                for mid in self.created_mapping_ids:
                    m = db.session.get(DBTaskCatalog, mid)
                    if m:
                        db.session.delete(m)
                for rid in self.created_report_ids:
                    r = db.session.get(Report, rid)
                    if r:
                        db.session.delete(r)
                for email in self.created_emails:
                    u = User.query.filter_by(email=email.lower()).first()
                    if u:
                        db.session.delete(u)
                db.session.commit()
            except Exception:
                db.session.rollback()

    def get_auth_headers(self, email='nishant@agalabs.com'):
        with self.app.app_context():
            token = create_access_token(identity=email)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def generate_email(self, prefix='adv_stress'):
        return f"{prefix}_{uuid.uuid4().hex[:8]}@agalabs.com"

    # =========================================================================
    # STRESS TEST 1: Rapid Consecutive Updates (25 Sequential Mutations)
    # =========================================================================
    def test_adv_01_rapid_consecutive_updates(self):
        """Perform 25 rapid consecutive updates mutating hierarchy fields, timing, and commodities."""
        email = self.generate_email('rapid_put')
        self.created_emails.append(email)

        # 1. Create initial user
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Stress Initial User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'backup_1': 'ram@agalabs.com',
            'backup_2': 'gopichand@agalabs.com',
            'commodities': ['Wheat', 'Maize'],
            'reports': [{'report_id': 1, 'timing_schedule': '08:00 AM'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

        # 2. Perform 25 mutations rapidly
        for i in range(1, 26):
            backup_a = 'gopichand@agalabs.com' if i % 2 == 0 else 'ram@agalabs.com'
            backup_b = 'ram@agalabs.com' if i % 2 == 0 else 'nitesh@agalabs.com'
            comm_list = ['Wheat', f'Comm_{i}'] if i % 2 == 0 else ['Maize', 'Soybeans']
            timing_val = f"{i:02d}:30 AM Daily"

            put_payload = {
                'name': f'Stress User Iteration {i}',
                'department': f'Dept_{i}',
                'backup_1': backup_a,
                'backup_2': backup_b,
                'commodities': comm_list,
                'commodity_mappings': [{'commodity': c, 'mapping_config': json.dumps({'step': i})} for c in comm_list],
                'reports': [{'report_id': 1, 'timing_schedule': timing_val, 'deadline': f'{i:02d}:00'}]
            }
            res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps(put_payload), headers=self.get_auth_headers())
            self.assertEqual(res_put.status_code, 200, f"Failed at iteration {i}: {res_put.get_json()}")

        # 3. Verify final state matches exactly iteration 25
        res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        self.assertEqual(res_get.status_code, 200)
        users = res_get.get_json()['data']
        u = next((x for x in users if x['email'].lower() == email.lower()), None)
        self.assertIsNotNone(u)
        self.assertEqual(u['name'], 'Stress User Iteration 25')
        self.assertEqual(u['department'], 'Dept_25')
        self.assertEqual(u['backup_1'], 'ram@agalabs.com')
        self.assertEqual(u['backup_2'], 'nitesh@agalabs.com')
        self.assertEqual(len(u['reports']), 1)
        self.assertEqual(u['reports'][0]['timing_schedule'], '25:30 AM Daily')
        self.assertEqual(u['reports'][0]['deadline'], '25:00')
        self.assertEqual(len(u['commodity_mappings']), 2)

    # =========================================================================
    # STRESS TEST 2: Rapid Cascading Renames & Multi-Assignee Catalog Sync
    # =========================================================================
    def test_adv_02_rapid_cascading_renames_and_multi_assignee(self):
        """Rapidly rename a user 5 times and assert cascading sync to db_task_catalog and reports."""
        email = self.generate_email('cascade_rename')
        self.created_emails.append(email)

        # Initial user
        initial_name = 'Adv Candidate Initial'
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': initial_name,
            'email': email,
            'role': 'Teammate',
            'department': 'Operations'
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            # Create a dedicated Report assigned to this candidate
            rep = Report(name=f'adv_report_{uuid.uuid4().hex[:6]}', primary_assignee=initial_name)
            db.session.add(rep)
            # Create a dedicated DBTaskCatalog row single assignee (with commodity='Wheat', final_name)
            cat_single = DBTaskCatalog(raw_table_name=f'adv_cat_single_{uuid.uuid4().hex[:6]}', final_name='adv_final_single', commodity='Wheat', user_name=initial_name)
            # Create a dedicated DBTaskCatalog row multi assignee (with commodity='Wheat', final_name)
            cat_multi = DBTaskCatalog(raw_table_name=f'adv_cat_multi_{uuid.uuid4().hex[:6]}', final_name='adv_final_multi', commodity='Wheat', user_name=f"{initial_name}, Nishant, Ram")
            db.session.add(cat_single)
            db.session.add(cat_multi)
            db.session.commit()

            self.created_report_ids.append(rep.id)
            self.created_mapping_ids.append(cat_single.id)
            self.created_mapping_ids.append(cat_multi.id)
            cat_single_id = cat_single.id
            cat_multi_id = cat_multi.id
            rep_id = rep.id

        # Rapidly cascade renames: Step 1 through Step 5
        for step in range(1, 6):
            new_name = f'Adv Candidate Step {step}'
            res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps({'name': new_name}), headers=self.get_auth_headers())
            self.assertEqual(res_put.status_code, 200)

            # Assert database sync
            with self.app.app_context():
                c_s = db.session.get(DBTaskCatalog, cat_single_id)
                c_m = db.session.get(DBTaskCatalog, cat_multi_id)
                r_o = db.session.get(Report, rep_id)

                self.assertEqual(c_s.user_name, new_name, f"Single catalog not synced at step {step}")
                self.assertIn(new_name, c_m.user_name, f"Multi catalog not synced at step {step}")
                self.assertIn("Nishant", c_m.user_name)
                self.assertIn("Ram", c_m.user_name)
                self.assertEqual(r_o.primary_assignee, new_name, f"Report primary assignee not synced at step {step}")

    # =========================================================================
    # STRESS TEST 3: Unicode, Extreme Characters, Emojis, Long Strings
    # =========================================================================
    def test_adv_03_unicode_extreme_characters_and_emojis(self):
        """Test Unicode names (Hindi, Japanese, Arabic, Emojis), long strings, and symbol-heavy payloads."""
        unicode_cases = [
            ("निशांत शर्मा 🚀", "अनुसंधान विभाग", "गेहूं, मक्का", "09:30 सुबह (दैनिक)"),
            ("田中 太郎 (Manager)", "品質管理部", "Rice / 米", "14:00 JST / Daily"),
            ("محمد الكاتب 🧪", "Operations & Logistics", "Barley-Premium & Splits", "18:00 AST"),
            ("Müller-Lüdenscheidt äöüß", "Spezialabteilung #9", "Rapeseed_Oil", "20:00 MEZ"),
            ("A" * 120, "Long Dept " * 5, "LongComm " * 3, "Schedule " * 10)
        ]

        for idx, (uname, udept, ucomm, utiming) in enumerate(unicode_cases):
            email = self.generate_email(f'uni_{idx}')
            self.created_emails.append(email)

            res = self.client.post('/api/admin/users', data=json.dumps({
                'name': uname,
                'email': email,
                'role': 'Teammate',
                'department': udept,
                'commodities': [ucomm],
                'commodity_mappings': [{'commodity': ucomm.strip(), 'mapping_config': json.dumps({'unicode_val': uname})}],
                'reports': [{'report_id': 1, 'timing_schedule': utiming}]
            }), headers=self.get_auth_headers())
            self.assertEqual(res.status_code, 200, f"Failed creating unicode user: {uname}")

            # Query back and verify
            res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
            users = res_get.get_json()['data']
            created_u = next((x for x in users if x['email'].lower() == email.lower()), None)
            self.assertIsNotNone(created_u)
            self.assertEqual(created_u['name'], uname)
            self.assertEqual(created_u['department'], udept)
            self.assertEqual(len(created_u['reports']), 1)
            self.assertEqual(created_u['reports'][0]['timing_schedule'], utiming)
            self.assertEqual(len(created_u['commodity_mappings']), 1)
            self.assertEqual(created_u['commodity_mappings'][0]['commodity'], ucomm.strip())

    # =========================================================================
    # STRESS TEST 4: Foreign Key Cascades & Isolation Verification
    # =========================================================================
    def test_adv_04_foreign_key_cascade_deletion(self):
        """Assert that deleting a user via DELETE CASCADE cleans up UserReportMapping and UserCommodityMapping without affecting reports."""
        email = self.generate_email('fk_cascade')
        # Do not append to created_emails because we delete it explicitly
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Cascade Delete Target',
            'email': email,
            'commodities': ['Wheat', 'Rice'],
            'commodity_mappings': [
                {'commodity': 'Wheat', 'mapping_config': '{"a": 1}'},
                {'commodity': 'Rice', 'mapping_config': '{"b": 2}'}
            ],
            'reports': [
                {'report_id': 1, 'timing_schedule': '08:00 AM'},
                {'report_id': 2, 'timing_schedule': '09:00 AM'}
            ]
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            u = User.query.filter_by(email=email.lower()).first()
            user_id = u.id
            urm_count = UserReportMapping.query.filter_by(user_id=user_id).count()
            ucm_count = UserCommodityMapping.query.filter_by(user_id=user_id).count()
            self.assertEqual(urm_count, 2)
            self.assertEqual(ucm_count, 2)

        # Delete the user
        res_del = self.client.delete(f'/api/admin/users/{email}', headers=self.get_auth_headers())
        self.assertEqual(res_del.status_code, 200)

        # Assert foreign key cascaded: mappings are gone
        with self.app.app_context():
            self.assertIsNone(User.query.filter_by(email=email.lower()).first())
            post_urm = UserReportMapping.query.filter_by(user_id=user_id).count()
            post_ucm = UserCommodityMapping.query.filter_by(user_id=user_id).count()
            self.assertEqual(post_urm, 0, "UserReportMappings were not cascade deleted!")
            self.assertEqual(post_ucm, 0, "UserCommodityMappings were not cascade deleted!")

            # Assert actual Report entities still exist
            r1 = db.session.get(Report, 1)
            r2 = db.session.get(Report, 2)
            self.assertIsNotNone(r1, "Report 1 was accidentally deleted!")
            self.assertIsNotNone(r2, "Report 2 was accidentally deleted!")

    # =========================================================================
    # STRESS TEST 5: Concurrent Multi-User Isolation on Same Report & Commodity
    # =========================================================================
    def test_adv_05_multi_user_report_commodity_isolation(self):
        """Two users sharing the same Report and Commodity maintain strict isolation of timings and configs."""
        email1 = self.generate_email('iso_user1')
        email2 = self.generate_email('iso_user2')
        self.created_emails.extend([email1, email2])

        # User 1
        res1 = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Isolation User 1',
            'email': email1,
            'commodities': [{'commodity': 'Barley', 'mapping_config': json.dumps({'role': 'primary'})}],
            'reports': [{'report_id': 1, 'timing_schedule': '08:00 AM User 1'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res1.status_code, 200)

        # User 2
        res2 = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Isolation User 2',
            'email': email2,
            'commodities': [{'commodity': 'Barley', 'mapping_config': json.dumps({'role': 'backup'})}],
            'reports': [{'report_id': 1, 'timing_schedule': '11:00 AM User 2'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res2.status_code, 200)

        # Update User 1's timing
        res_put = self.client.put(f'/api/admin/users/{email1}', data=json.dumps({
            'reports': [{'report_id': 1, 'timing_schedule': '07:30 AM Updated'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        # Verify User 2's timing is completely untouched
        res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res_get.get_json()['data']
        u1 = next(x for x in users if x['email'].lower() == email1.lower())
        u2 = next(x for x in users if x['email'].lower() == email2.lower())

        self.assertEqual(u1['reports'][0]['timing_schedule'], '07:30 AM Updated')
        self.assertEqual(u2['reports'][0]['timing_schedule'], '11:00 AM User 2')
        self.assertEqual(json.loads(u1['commodity_mappings'][0]['mapping_config'])['role'], 'primary')
        self.assertEqual(json.loads(u2['commodity_mappings'][0]['mapping_config'])['role'], 'backup')

    # =========================================================================
    # STRESS TEST 6: Boundary & Malformed Inputs / Defensive Handling
    # =========================================================================
    def test_adv_06_boundary_and_malformed_inputs(self):
        """Test null/empty strings, whitespace, empty arrays, missing fields, and self-delete rejection."""
        # 1. Missing email
        res = self.client.post('/api/admin/users', data=json.dumps({'name': 'No Email'}), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 400)

        # 2. Duplicate baseline email
        res = self.client.post('/api/admin/users', data=json.dumps({'email': 'nishant@agalabs.com', 'name': 'Duplicate Nishant'}), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 400)

        # 3. Non-existent user PUT
        res = self.client.put('/api/admin/users/nonexistent_xyz@agalabs.com', data=json.dumps({'name': 'Fake'}), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 404)

        # 4. User cannot delete self
        res = self.client.delete('/api/admin/users/nishant@agalabs.com', headers=self.get_auth_headers('nishant@agalabs.com'))
        self.assertEqual(res.status_code, 400)
        self.assertIn('Cannot remove yourself', res.get_json().get('message', ''))

        # 5. Empty report timing and whitespace
        email = self.generate_email('empty_timing')
        self.created_emails.append(email)
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Empty Timing User',
            'email': email,
            'reports': [{'report_id': 1, 'timing_schedule': '   ', 'deadline': ''}],
            'commodities': []
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

        res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        u = next(x for x in res_get.get_json()['data'] if x['email'].lower() == email.lower())
        self.assertEqual(len(u['reports']), 1)
        # Backend retains unstripped timing string verbatim ('   ')
        self.assertEqual(u['reports'][0]['timing_schedule'], '   ')
        self.assertEqual(len(u['commodity_mappings']), 0)

    # =========================================================================
    # STRESS TEST 7: Zero Baseline Data Loss Invariant Oracle
    # =========================================================================
    def test_adv_07_zero_baseline_data_loss_oracle(self):
        """Final invariant oracle: Verify that all baseline users, reports, and table mappings remain 100% intact."""
        with self.app.app_context():
            current_users = User.query.all()
            current_reports = Report.query.all()
            current_catalog_count = DBTaskCatalog.query.count()

            current_emails = {u.email.lower() for u in current_users}
            current_report_names = {r.name for r in current_reports}

            # 1. Assert all baseline emails exist
            for b_email in self.AUTHORITATIVE_BASELINE_EMAILS:
                self.assertIn(b_email, current_emails, f"Baseline user lost: {b_email}")

            # 2. Assert all baseline reports exist
            for b_rname in self.baseline_report_names:
                self.assertIn(b_rname, current_report_names, f"Baseline report lost: {b_rname}")

            # 3. Assert baseline counts >= baseline
            self.assertGreaterEqual(len(current_users), self.baseline_users_count)
            self.assertGreaterEqual(len(current_reports), self.baseline_reports_count)
            self.assertGreaterEqual(current_catalog_count, self.baseline_catalog_count)
            print(f"\n[Zero Data Loss Oracle] Confirmed: {len(current_users)} users (>= {self.baseline_users_count}), {len(current_reports)} reports (>= {self.baseline_reports_count}), {current_catalog_count} catalog rows (>= {self.baseline_catalog_count}).")

if __name__ == '__main__':
    unittest.main(verbosity=2)
