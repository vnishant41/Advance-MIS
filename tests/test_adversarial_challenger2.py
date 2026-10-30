"""
Advance ERP — Adversarial Challenger 2 Test Suite
Author: Challenger 2 (Adversarial Table Mapping Challenger)
Mission: Empirically verify Table Mapping Studio dynamic linking, active user reflection,
         commodity configuration dynamism, user deactivation/deletion integrity,
         and edge-case robustness without trusting claims or logs.
"""
import unittest
import json
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import (
    User, Report, DBTaskCatalog, CommodityConfig,
    UserReportMapping, UserCommodityMapping
)


class AdversarialTableMappingTests(unittest.TestCase):
    """Adversarial stress and verification harness for Table Mapping Studio dynamic linking."""

    app = None
    client = None
    baseline_user_count = 9
    baseline_report_count = 27
    baseline_mapping_count = 156

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls._clean_adversarial_records()

    @classmethod
    def tearDownClass(cls):
        if cls.app:
            with cls.app.app_context():
                cls._clean_adversarial_records()
                # Verify baseline invariants
                u_cnt = User.query.count()
                r_cnt = Report.query.count()
                m_cnt = DBTaskCatalog.query.count()
                assert u_cnt >= cls.baseline_user_count, f"Zero data loss failure: users {u_cnt} < {cls.baseline_user_count}"
                assert r_cnt >= cls.baseline_report_count, f"Zero data loss failure: reports {r_cnt} < {cls.baseline_report_count}"
                assert m_cnt >= cls.baseline_mapping_count, f"Zero data loss failure: mappings {m_cnt} < {cls.baseline_mapping_count}"

    @classmethod
    def _clean_adversarial_records(cls):
        try:
            # Delete mappings
            for m in DBTaskCatalog.query.filter(
                (DBTaskCatalog.raw_table_name.like('test_adv_%')) |
                (DBTaskCatalog.user_name.like('%Adversarial%')) |
                (DBTaskCatalog.user_name.like('%Empirical%'))
            ).all():
                db.session.delete(m)

            # Delete commodity configs
            for cc in CommodityConfig.query.filter(
                (CommodityConfig.commodity.like('test_adv_%')) |
                (CommodityConfig.commodity.like('%Exotic%')) |
                (CommodityConfig.commodity.like('%Quinoa%'))
            ).all():
                db.session.delete(cc)

            # Delete reports
            for r in Report.query.filter(Report.name.like('test_adv_%')).all():
                db.session.delete(r)

            # Delete users
            for u in User.query.filter(
                (User.email.like('test_adv_%')) |
                (User.name.like('%Adversarial%')) |
                (User.name.like('%Empirical%'))
            ).all():
                db.session.delete(u)

            db.session.commit()
        except Exception:
            db.session.rollback()

    def setUp(self):
        self.created_emails = []
        self.created_mapping_ids = []
        self.created_comm_ids = []
        self.created_report_ids = []

    def tearDown(self):
        with self.app.app_context():
            try:
                for mid in self.created_mapping_ids:
                    m = db.session.get(DBTaskCatalog, mid)
                    if m:
                        db.session.delete(m)
                for cid in self.created_comm_ids:
                    c = db.session.get(CommodityConfig, cid)
                    if c:
                        db.session.delete(c)
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

    def auth_headers(self, email='nishant@agalabs.com'):
        with self.app.app_context():
            token = create_access_token(identity=email)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 1: Brand new user dynamically reflects in GET /api/admin/table-mappings
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_01_brand_new_user_instantly_in_table_mappings_active_users(self):
        """Verify that adding a brand new user via API instantly reflects in
        GET /api/admin/table-mappings active_users without server restart or hardcoded edits."""
        email = 'test_adv_alpha_newuser@agalabs.com'
        name = 'Empirical Alpha Dynamic User'
        self.created_emails.append(email)

        # 1. Create user via API
        payload = {
            'name': name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'password123',
            'active': True
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.auth_headers())
        self.assertEqual(res.status_code, 200, f"Failed to create user: {res.data}")

        # 2. Query Table Mappings endpoint immediately
        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200)
        data = res_tm.get_json()

        self.assertIn('active_users', data, "active_users key missing in response")
        self.assertIn('users', data, "users key missing in response")
        self.assertIn(name, data['active_users'], f"New user '{name}' not found in active_users: {data['active_users']}")
        self.assertIn(name, data['users'], f"New user '{name}' not found in users: {data['users']}")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 2: User deactivation properly updates active user selections
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_02_user_deactivation_instantly_drops_from_active_users(self):
        """Verify that deactivating a user (active=False) properly updates active user selections,
        and reactivating immediately restores them."""
        email = 'test_adv_beta_toggle@agalabs.com'
        name = 'Empirical Beta Toggle User'
        self.created_emails.append(email)

        # 1. Create user (active=True)
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'active': True
        }), headers=self.auth_headers())
        self.assertEqual(res.status_code, 200)

        # Confirm active
        res_tm1 = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertIn(name, res_tm1.get_json()['active_users'])

        # 2. Deactivate user (active=False) via PUT
        res_deact = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'active': False
        }), headers=self.auth_headers())
        self.assertEqual(res_deact.status_code, 200)

        # 3. Immediately query table-mappings: user MUST be excluded from active_users
        res_tm2 = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm2.status_code, 200)
        active_list = res_tm2.get_json()['active_users']
        self.assertNotIn(name, active_list, f"Deactivated user '{name}' should NOT be in active_users: {active_list}")

        # 4. Reactivate user (active=True) via PUT
        res_react = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'active': True
        }), headers=self.auth_headers())
        self.assertEqual(res_react.status_code, 200)

        # 5. Immediately query table-mappings: user MUST be restored to active_users
        res_tm3 = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertIn(name, res_tm3.get_json()['active_users'], f"Reactivated user '{name}' missing from active_users")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 3: Brand new commodities in commodity_configs appear dynamically
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_03_brand_new_commodity_in_commodity_configs_appears_dynamically(self):
        """Verify that newly added commodities in commodity_configs appear dynamically
        in Table Mapping Studio endpoints."""
        comm_name = 'DragonFruit_Exotic_Adv'
        with self.app.app_context():
            cc = CommodityConfig(
                commodity=comm_name,
                type='Daily',
                factor='Arrivals',
                primary_assignee='Nishant',
                source='APMC'
            )
            db.session.add(cc)
            db.session.commit()
            self.created_comm_ids.append(cc.id)

        # Query GET /api/admin/table-mappings
        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200)
        data = res_tm.get_json()

        self.assertIn('commodities', data, "commodities key missing in response")
        self.assertIn(comm_name, data['commodities'],
                      f"New commodity '{comm_name}' not reflected in Table Mapping Studio commodities list")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 4: Newly added commodities in reports appear dynamically
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_04_newly_added_commodity_in_reports_appears_dynamically(self):
        """Verify that newly configured commodities from reports also appear dynamically
        in Table Mapping Studio commodities endpoint."""
        comm_name = 'Quinoa_Superfood_Adv'
        with self.app.app_context():
            rep = Report(
                name='test_adv_quinoa_daily_bulletin',
                commodity=comm_name,
                deadline='17:00',
                frequency='Daily',
                primary_assignee='Nishant'
            )
            db.session.add(rep)
            db.session.commit()
            self.created_report_ids.append(rep.id)

        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200)
        commodities = res_tm.get_json().get('commodities', [])
        self.assertIn(comm_name, commodities, f"Commodity '{comm_name}' from report missing in commodities")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 5: Deleting a test user does NOT orphan or corrupt table mappings
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_05_delete_user_assigned_to_mapping_does_not_orphan_or_corrupt_mapping(self):
        """Verify that deleting a test user does NOT orphan or corrupt table mappings:
        The table mapping must remain intact with its raw_table_name, user_name, and configs,
        and GET /api/admin/table-mappings must continue functioning with HTTP 200."""
        email = 'test_adv_gamma_delete@agalabs.com'
        user_name = 'Empirical Gamma Deletable'
        raw_table = 'test_adv_gamma_tbl_1'
        self.created_emails.append(email)

        # 1. Create user
        res_u = self.client.post('/api/admin/users', data=json.dumps({
            'name': user_name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'active': True
        }), headers=self.auth_headers())
        self.assertEqual(res_u.status_code, 200)

        # 2. Create table mapping assigned to this user
        res_m = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'final_business_name': 'Gamma Market Feed',
            'commodity': 'Pulses',
            'assigned_user': user_name,
            'frequency': 'Daily',
            'date_column': 'Date',
            'due_time': '18:00',
            'is_active': True,
            'commodity_config': {'Pulses': {'frequency': 'Daily', 'cutoff_time': '18:00'}}
        }), headers=self.auth_headers())
        self.assertEqual(res_m.status_code, 200, f"Failed to map table: {res_m.data}")
        mapping_id = res_m.get_json()['item']['id']
        self.created_mapping_ids.append(mapping_id)

        # 3. Delete the user via DELETE /api/admin/users/<email>
        res_del = self.client.delete(f'/api/admin/users/{email}', headers=self.auth_headers())
        self.assertEqual(res_del.status_code, 200, f"User delete failed: {res_del.data}")

        # 4. Assert mapping in DB is completely intact and not corrupted
        with self.app.app_context():
            cat = db.session.get(DBTaskCatalog, mapping_id)
            self.assertIsNotNone(cat, "Mapping was unexpectedly deleted when assigned user was removed!")
            self.assertEqual(cat.raw_table_name, raw_table)
            self.assertEqual(cat.user_name, user_name, "Mapping user_name was corrupted")
            self.assertEqual(cat.final_name, 'Gamma Market Feed')
            self.assertTrue(cat.is_active)
            self.assertIn('Pulses', cat.commodity_config)

        # 5. Assert GET /api/admin/table-mappings returns HTTP 200 and loads mapping cleanly
        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200, "GET /api/admin/table-mappings crashed after user deletion")
        tm_data = res_tm.get_json()
        matching_mappings = [m for m in tm_data['mappings'] if m['id'] == mapping_id]
        self.assertEqual(len(matching_mappings), 1, "Mapping not present in GET /api/admin/table-mappings")
        self.assertEqual(matching_mappings[0]['user'], user_name)

        # 6. Assert deleted user is no longer in active_users
        self.assertNotIn(user_name, tm_data['active_users'],
                         "Deleted user still unexpectedly present in active_users")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 6: User deletion cascades hierarchy child records without orphaned rows
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_06_delete_user_cascades_hierarchy_mappings_cleanly(self):
        """Verify that deleting a user removes associated user_report_mappings and
        user_commodity_mappings via database ON DELETE CASCADE, preventing orphaned rows."""
        email = 'test_adv_delta_cascade@agalabs.com'
        user_name = 'Empirical Delta Cascade User'
        self.created_emails.append(email)

        # Create user with reports and commodities
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': user_name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'reports': [{'report_name': 'Daily Cotton Price', 'timing_schedule': '09:00', 'deadline': '10:00'}],
            'commodities': [{'commodity': 'Cotton', 'mapping_config': {'alert': 'high'}}]
        }), headers=self.auth_headers())
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            u = User.query.filter_by(email=email).first()
            self.assertIsNotNone(u)
            u_id = u.id
            self.assertGreater(UserReportMapping.query.filter_by(user_id=u_id).count(), 0)
            self.assertGreater(UserCommodityMapping.query.filter_by(user_id=u_id).count(), 0)

        # Delete user
        res_del = self.client.delete(f'/api/admin/users/{email}', headers=self.auth_headers())
        self.assertEqual(res_del.status_code, 200)

        # Verify child records were cleanly cascaded
        with self.app.app_context():
            rm_count = UserReportMapping.query.filter_by(user_id=u_id).count()
            cm_count = UserCommodityMapping.query.filter_by(user_id=u_id).count()
            self.assertEqual(rm_count, 0, f"Orphaned UserReportMapping rows remain: {rm_count}")
            self.assertEqual(cm_count, 0, f"Orphaned UserCommodityMapping rows remain: {cm_count}")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 7: Unicode, symbols and apostrophes in user names dynamic reflection
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_07_unicode_symbols_user_name_dynamic_reflection(self):
        """Verify that user names with apostrophes, accents, and unicode symbols
        dynamically reflect without JSON serialization errors or SQL corruption."""
        email = 'test_adv_unicode_user@agalabs.com'
        name = "Dr. René François-O'Connor & Søn 🌾"
        self.created_emails.append(email)

        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'active': True
        }), headers=self.auth_headers())
        self.assertEqual(res.status_code, 200)

        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200)
        self.assertIn(name, res_tm.get_json()['active_users'],
                      f"Unicode user name '{name}' not found verbatim in active_users")

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 8: Empty or whitespace-padded commodity in CommodityConfig handled gracefully
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_08_commodity_configs_whitespace_and_empty_resilience(self):
        """Verify that CommodityConfig entries with whitespace padding are trimmed,
        and empty/blank commodity entries do not crash GET /api/admin/table-mappings."""
        comm_padded = '   Cardamom_Padded_Adv   '
        with self.app.app_context():
            cc1 = CommodityConfig(commodity=comm_padded, type='Daily', factor='Prices')
            cc2 = CommodityConfig(commodity='   ', type='Daily', factor='Prices')
            db.session.add_all([cc1, cc2])
            db.session.commit()
            self.created_comm_ids.extend([cc1.id, cc2.id])

        res_tm = self.client.get('/api/admin/table-mappings', headers=self.auth_headers())
        self.assertEqual(res_tm.status_code, 200)
        commodities = res_tm.get_json().get('commodities', [])
        # Stripped version should be present
        self.assertIn('Cardamom_Padded_Adv', commodities)
        # Empty string should NOT be present
        self.assertNotIn('', commodities)
        self.assertNotIn('   ', commodities)

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 9: Multi-user comma-separated assignment & cascade update on rename
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_09_multi_user_comma_separated_assignment_and_rename_cascade(self):
        """Verify that comma-separated assignees in DBTaskCatalog allow searching
        by either user, and renaming one user updates the entry without corrupting the co-assignee."""
        email1 = 'test_adv_multi_u1@agalabs.com'
        email2 = 'test_adv_multi_u2@agalabs.com'
        name1 = 'Empirical Assignee One'
        name2 = 'Empirical Assignee Two'
        raw_table = 'test_adv_multi_user_tbl'
        self.created_emails.extend([email1, email2])

        # Create both users
        self.client.post('/api/admin/users', data=json.dumps({
            'name': name1, 'email': email1, 'role': 'Teammate', 'department': 'Research'
        }), headers=self.auth_headers())
        self.client.post('/api/admin/users', data=json.dumps({
            'name': name2, 'email': email2, 'role': 'Teammate', 'department': 'Research'
        }), headers=self.auth_headers())

        # Create mapping assigned to both
        res_m = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'final_business_name': 'Joint Surveillance Stream',
            'commodity': 'Bajra',
            'assigned_user': f"{name1}, {name2}",
            'frequency': 'Daily',
            'due_time': '18:00'
        }), headers=self.auth_headers())
        self.assertEqual(res_m.status_code, 200)
        mapping_id = res_m.get_json()['item']['id']
        self.created_mapping_ids.append(mapping_id)

        # Filter by user 1
        res_f1 = self.client.get(f'/api/admin/table-mappings?user={name1}', headers=self.auth_headers())
        self.assertTrue(any(m['id'] == mapping_id for m in res_f1.get_json()['mappings']))

        # Filter by user 2
        res_f2 = self.client.get(f'/api/admin/table-mappings?user={name2}', headers=self.auth_headers())
        self.assertTrue(any(m['id'] == mapping_id for m in res_f2.get_json()['mappings']))

        # Rename user 1
        name1_renamed = 'Empirical Assignee One (Promoted)'
        res_ren = self.client.put(f'/api/admin/users/{email1}', data=json.dumps({
            'name': name1_renamed
        }), headers=self.auth_headers())
        self.assertEqual(res_ren.status_code, 200)

        # Verify mapping updated to contain new name and original name2
        with self.app.app_context():
            cat = db.session.get(DBTaskCatalog, mapping_id)
            self.assertIn(name1_renamed, cat.user_name)
            self.assertIn(name2, cat.user_name)

    # ─────────────────────────────────────────────────────────────────────────────
    # Test 10: Zero baseline data loss guarantee
    # ─────────────────────────────────────────────────────────────────────────────
    def test_adv_10_zero_baseline_data_loss_preservation(self):
        """Empirically verify all 9 baseline users, 27 baseline reports,
        and 156 baseline table mappings are 100% intact."""
        with self.app.app_context():
            u_count = User.query.count()
            r_count = Report.query.count()
            m_count = DBTaskCatalog.query.count()

            self.assertGreaterEqual(u_count, 9, f"Baseline users corrupted: {u_count} < 9")
            self.assertGreaterEqual(r_count, 27, f"Baseline reports corrupted: {r_count} < 27")
            self.assertGreaterEqual(m_count, 156, f"Baseline mappings corrupted: {m_count} < 156")

            # Verify core baseline user emails exist
            baseline_emails = [
                'nishant@agalabs.com', 'ram@agalabs.com', 'gopichand@agalabs.com',
                'nitesh@agalabs.com', 'pankaj@agalabs.com', 'damini@agalabs.com',
                'bhawna@agalabs.com', 'balram@agalabs.com', 'vaibhav@agalabs.com'
            ]
            for be in baseline_emails:
                u = User.query.filter_by(email=be).first()
                self.assertIsNotNone(u, f"Baseline user {be} missing!")


if __name__ == '__main__':
    unittest.main()
