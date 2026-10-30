"""
Advance ERP — Comprehensive E2E Opaque-Box Test Suite
Covers:
- Tier 1: Feature Coverage (User Hierarchy, Table Mapping Studio Dynamic Assignees,
          Commodity Config Persistence, Report Timing Schedules, 1st & 2nd Backups)
- Tier 2: Boundary & Corner Cases (Empty lists, single/no backups, special chars,
          non-existent IDs, duplicate emails, Turmeric classification fix)
- Tier 3: Cross-Feature Combinations (Cascade updates on user rename, timing sync,
          multi-user assignment, user deactivation/reactivation)
- Tier 4: Real-World Scenarios (Full E2E user & mapping lifecycle, zero data loss preservation)
"""
import unittest
import json
import uuid
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import (
    User, Report, DBTaskCatalog,
    infer_commodity
)
try:
    from app.models import UserReportMapping, UserCommodityMapping
except ImportError:
    UserReportMapping = None
    UserCommodityMapping = None


class BaseE2ETestCase(unittest.TestCase):
    """Base test case managing Flask test client, auth headers, and non-destructive DB isolation."""

    app = None
    client = None
    baseline_user_count = 9
    baseline_report_count = 27
    baseline_mapping_count = 156
    baseline_user_emails = {
        'nishant@agalabs.com', 'ram@agalabs.com', 'gopichand@agalabs.com',
        'nitesh@agalabs.com', 'pankaj@agalabs.com', 'damini@agalabs.com',
        'bhawna@agalabs.com', 'balram@agalabs.com', 'vaibhav@agalabs.com'
    }

    @classmethod
    def setUpClass(cls):
        """Initialize app, verify database connectivity and baseline invariants."""
        try:
            cls.app = create_app()
        except Exception as e:
            cls.app = None
            cls.app_init_error = e
            return

        cls.app_init_error = None
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            # Clean up any leftover test entities matching 'test_e2e_%'
            cls._sweep_test_entities()

    @classmethod
    def tearDownClass(cls):
        """Final cleanup of any test entities and assertion of baseline invariants."""
        if cls.app:
            with cls.app.app_context():
                cls._sweep_test_entities()
                # Verify baseline invariants remain 100% intact
                total_users = User.query.count()
                total_reports = Report.query.count()
                total_mappings = DBTaskCatalog.query.count()
                assert total_users >= cls.baseline_user_count, f"Data loss detected in users: {total_users} < {cls.baseline_user_count}"
                assert total_reports >= cls.baseline_report_count, f"Data loss detected in reports: {total_reports} < {cls.baseline_report_count}"
                assert total_mappings >= cls.baseline_mapping_count, f"Data loss detected in mappings: {total_mappings} < {cls.baseline_mapping_count}"

    @classmethod
    def _sweep_test_entities(cls):
        """Remove any test records created during test execution."""
        try:
            # Delete test table mappings
            test_mappings = DBTaskCatalog.query.filter(
                (DBTaskCatalog.raw_table_name.like('test_e2e_%')) |
                (DBTaskCatalog.user_name.like('%Test E2E%')) |
                (DBTaskCatalog.user_name.like('%Lifecycle%'))
            ).all()
            for m in test_mappings:
                db.session.delete(m)

            # Delete test users (which cascades to user_report_mappings & user_commodity_mappings)
            test_users = User.query.filter(
                (User.email.like('test_e2e_%')) |
                (User.name.like('Test E2E%')) |
                (User.name.like('%Lifecycle%'))
            ).all()
            for u in test_users:
                db.session.delete(u)

            # Delete test reports
            test_reports = Report.query.filter(Report.name.like('test_e2e_%')).all()
            for r in test_reports:
                db.session.delete(r)

            db.session.commit()
        except Exception:
            db.session.rollback()

    def setUp(self):
        """Per-test setup: track created resources for tearDown."""
        if self.app_init_error:
            self.fail(f"Application failed to initialize in create_app(): {self.app_init_error}")
        self.created_emails = []
        self.created_mapping_ids = []
        self.created_report_ids = []

    def tearDown(self):
        """Per-test teardown: delete all resources tracked during the test."""
        if not self.app:
            return
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
        """Generate JWT auth headers for an active SuperAdmin user."""
        with self.app.app_context():
            token = create_access_token(identity=email)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def generate_email(self, prefix='test_e2e'):
        """Generate an isolated, unique test email."""
        uid = uuid.uuid4().hex[:8]
        email = f"{prefix}_{uid}@agalabs.com"
        self.created_emails.append(email)
        return email


# ============================================================================
# TIER 1: FEATURE COVERAGE (>=5 tests per feature category)
# ============================================================================

class TestHierarchyAndStudioTier1(BaseE2ETestCase):
    """
    Tier 1: Feature Coverage.
    Validates:
    - Feature 1: User creation with full hierarchy (User > Email > Role > Department > Reports with timing > Commodity with mapping > 1st & 2nd Backup)
    - Feature 2: Immediate reflection of user in Table Mapping Studio endpoints
    - Feature 3: Commodity configuration persistence & Table Mapping Studio
    - Feature 4: Report timing / schedule retrieval and updates
    - Feature 5: 1st & 2nd Backup assignment persistence and retrieval
    """

    # ── Feature 1: User Creation with Full Hierarchy ─────────────────────────

    def test_t1_f1_01_create_user_with_full_hierarchy_success(self):
        """POST /api/admin/users creates a user with full hierarchy and returns success."""
        email = self.generate_email('test_e2e_f1_full')
        payload = {
            'name': 'Test E2E Hierarchy User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh',
            'reports': [
                {
                    'report_id': 1,
                    'report_name': 'Bajra Weekly',
                    'frequency': 'Weekly',
                    'timing_schedule': '09:00 AM',
                    'deadline': '18:00'
                }
            ],
            'commodities': [
                {
                    'commodity': 'Bajra',
                    'mapping_config': json.dumps({'factor': 'Weekly Price', 'source': 'Agmarknet'})
                }
            ]
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertIn(res.status_code, [200, 201], f"Unexpected status: {res.status_code}, data: {res.get_data(as_text=True)}")
        data = res.get_json()
        self.assertTrue(data.get('success'), f"Expected success=True: {data}")

    def test_t1_f1_02_created_user_retrieved_in_users_list(self):
        """Created user is queryable via GET /api/admin/users with core fields matching."""
        email = self.generate_email('test_e2e_f1_retrieval')
        payload = {
            'name': 'Test E2E Retrieval User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }
        self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)
        users = res.get_json().get('data', [])
        matched = next((u for u in users if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(matched, f"User {email} not found in users list: {users}")
        self.assertEqual(matched['name'], 'Test E2E Retrieval User')
        self.assertEqual(matched['role'], 'Teammate')
        self.assertEqual(matched['department'], 'Research')
        self.assertTrue(matched.get('active', True))

    def test_t1_f1_03_created_user_reports_hierarchy_retrieval(self):
        """Assigned reports in hierarchy are returned with timing schedule and deadline."""
        email = self.generate_email('test_e2e_f1_reports')
        payload = {
            'name': 'Test E2E Reports User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [
                {
                    'report_id': 1,
                    'report_name': 'Bajra Weekly',
                    'frequency': 'Weekly',
                    'timing_schedule': '10:30 AM',
                    'deadline': '17:30'
                }
            ]
        }
        self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        user = next((u for u in users if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        reports = user.get('reports') or user.get('report_mappings') or []
        self.assertTrue(len(reports) >= 1, f"Expected reports assigned: {user}")
        r0 = reports[0]
        schedule = r0.get('timing_schedule') or r0.get('timingSchedule') or r0.get('timing')
        self.assertEqual(schedule, '10:30 AM')

    def test_t1_f1_04_created_user_commodity_mappings_retrieval(self):
        """Assigned commodities in hierarchy are returned with mapping config."""
        email = self.generate_email('test_e2e_f1_commodities')
        cfg = {'factor': 'Mandi Arrivals', 'source': 'APMC'}
        payload = {
            'name': 'Test E2E Commodity User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'commodities': [
                {
                    'commodity': 'Chilli',
                    'mapping_config': json.dumps(cfg)
                }
            ]
        }
        self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        user = next((u for u in users if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        comm_mappings = user.get('commodity_mappings') or user.get('assignedCommodities') or []
        self.assertTrue(len(comm_mappings) >= 1, f"Expected commodity mappings in user: {user}")
        c0 = comm_mappings[0]
        self.assertEqual(c0.get('commodity'), 'Chilli')

    def test_t1_f1_05_created_user_backups_retrieval(self):
        """Backup assignees backup_1 and backup_2 are returned in user data."""
        email = self.generate_email('test_e2e_f1_backups')
        payload = {
            'name': 'Test E2E Backups User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }
        self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        user = next((u for u in users if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        b1 = user.get('backup_1') or user.get('backup1')
        b2 = user.get('backup_2') or user.get('backup2')
        self.assertEqual(b1, 'Ram Gopal')
        self.assertEqual(b2, 'Nitesh')

    # ── Feature 2: Immediate Reflection in Table Mapping Studio ─────────────

    def test_t1_f2_01_immediate_reflection_in_users_endpoint(self):
        """Newly created user immediately reflects in /api/admin/users without server restart."""
        email = self.generate_email('test_e2e_f2_immediate')
        name = 'Test E2E Immediate User'
        payload = {'name': name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'}
        res_post = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertTrue(res_post.get_json().get('success'))

        res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        self.assertEqual(res_get.status_code, 200)
        user_names = [u.get('name') for u in res_get.get_json().get('data', [])]
        self.assertIn(name, user_names, "Newly created user not immediately queryable in users list")

    def test_t1_f2_02_immediate_reflection_in_table_mappings_active_users(self):
        """Table Mapping Studio endpoint (/api/admin/table-mappings) reflects active user options."""
        email = self.generate_email('test_e2e_f2_tm_users')
        name = 'Test E2E TM Option User'
        payload = {'name': name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'}
        self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        active_users = data.get('active_users') or data.get('users')
        if active_users is not None:
            self.assertIn(name, active_users)
        else:
            # If table-mappings endpoint delegates active users to /api/admin/users, assert user exists there
            res_users = self.client.get('/api/admin/users', headers=self.get_auth_headers())
            names = [u['name'] for u in res_users.get_json().get('data', [])]
            self.assertIn(name, names)

    def test_t1_f2_03_create_table_mapping_with_new_user_as_assignee(self):
        """A new table mapping can be assigned to the newly created user."""
        email = self.generate_email('test_e2e_f2_assign')
        user_name = 'Test E2E Assignee User'
        self.client.post('/api/admin/users', data=json.dumps({
            'name': user_name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'
        }), headers=self.get_auth_headers())

        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        mapping_payload = {
            'raw_table_name': raw_table,
            'assigned_user': user_name,
            'commodity': 'Bajra',
            'final_business_name': 'Test Final Bajra Mapping',
            'frequency': 'Daily',
            'target_cutoff_time': '18:30'
        }
        res = self.client.post('/api/admin/table-mappings', data=json.dumps(mapping_payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200, f"Failed to create mapping: {res.get_data(as_text=True)}")
        item = res.get_json().get('item') or {}
        if item.get('id'):
            self.created_mapping_ids.append(item['id'])
        self.assertTrue(res.get_json().get('success'))

    def test_t1_f2_04_filter_table_mappings_by_assigned_user(self):
        """GET /api/admin/table-mappings?user=<username> filters mappings by the newly assigned user."""
        email = self.generate_email('test_e2e_f2_filter')
        user_name = 'Test E2E Filter User'
        self.client.post('/api/admin/users', data=json.dumps({
            'name': user_name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'
        }), headers=self.get_auth_headers())

        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_post = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': user_name,
            'commodity': 'Cotton',
            'final_business_name': 'Test Cotton Filter',
            'frequency': 'Weekly'
        }), headers=self.get_auth_headers())
        item = res_post.get_json().get('item') or {}
        if item.get('id'):
            self.created_mapping_ids.append(item['id'])

        res_filter = self.client.get(f'/api/admin/table-mappings?user={user_name}', headers=self.get_auth_headers())
        self.assertEqual(res_filter.status_code, 200)
        items = res_filter.get_json().get('data', [])
        self.assertTrue(any(i.get('raw_table_name') == raw_table for i in items), f"Mapping {raw_table} not found in user filter: {items}")

    def test_t1_f2_05_search_table_mappings_by_assigned_user(self):
        """GET /api/admin/table-mappings?q=<search> finds mappings assigned to the new user."""
        email = self.generate_email('test_e2e_f2_search')
        user_name = 'Test E2E Search User'
        self.client.post('/api/admin/users', data=json.dumps({
            'name': user_name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'
        }), headers=self.get_auth_headers())

        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_post = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': user_name,
            'commodity': 'Maize',
            'final_business_name': 'Test Search Final',
            'frequency': 'Daily'
        }), headers=self.get_auth_headers())
        item = res_post.get_json().get('item') or {}
        if item.get('id'):
            self.created_mapping_ids.append(item['id'])

        res_search = self.client.get(f'/api/admin/table-mappings?q={user_name}', headers=self.get_auth_headers())
        self.assertEqual(res_search.status_code, 200)
        items = res_search.get_json().get('data', [])
        self.assertTrue(any(i.get('raw_table_name') == raw_table for i in items))

    # ── Feature 3: Commodity Config Persistence & Table Mapping Studio ───────

    def test_t1_f3_01_user_commodity_config_json_persistence(self):
        """User commodity mapping stores structured configuration JSON."""
        email = self.generate_email('test_e2e_f3_user_cfg')
        cfg = {'factor': 'Spot Prices', 'frequency': 'Daily', 'source': 'NCDEX'}
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Comm Cfg User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'commodities': [{'commodity': 'Turmeric', 'mapping_config': json.dumps(cfg)}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        user = next((u for u in users if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        comm_mappings = user.get('commodity_mappings') or user.get('assignedCommodities') or []
        self.assertTrue(len(comm_mappings) >= 1)
        config_val = comm_mappings[0].get('mapping_config') or comm_mappings[0].get('config')
        self.assertIn('NCDEX', str(config_val))

    def test_t1_f3_02_create_table_mapping_with_commodity_config(self):
        """Table mapping created with commodity_config dictionary persists successfully."""
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        comm_cfg = {'mode': 'Manual', 'source': 'Agmarknet API', 'threshold': 100}
        res = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': 'Ram Gopal',
            'commodity': 'Bajra',
            'final_business_name': 'Bajra Mandi Pipeline',
            'commodity_config': comm_cfg
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)
        item = res.get_json().get('item') or {}
        if item.get('id'):
            self.created_mapping_ids.append(item['id'])
        self.assertTrue(res.get_json().get('success'))

    def test_t1_f3_03_retrieve_table_mapping_with_commodity_config(self):
        """GET /api/admin/table-mappings returns commodity_config for mapped tables."""
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        comm_cfg = {'sla': '18:00', 'priority': 'HIGH'}
        res_post = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': 'Ram Gopal',
            'commodity': 'Coriander',
            'final_business_name': 'Coriander Live Feeds',
            'commodity_config': comm_cfg
        }), headers=self.get_auth_headers())
        item = res_post.get_json().get('item') or {}
        mid = item.get('id')
        if mid:
            self.created_mapping_ids.append(mid)

        res_get = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        items = res_get.get_json().get('data', [])
        matched = next((i for i in items if i.get('raw_table_name') == raw_table), None)
        self.assertIsNotNone(matched)
        cfg_retrieved = matched.get('commodity_config') or matched.get('commodityConfig')
        self.assertIn('HIGH', str(cfg_retrieved))

    def test_t1_f3_04_update_table_mapping_commodity_config(self):
        """PUT /api/admin/table-mappings/<id> updates commodity_config successfully."""
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_post = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': 'Ram Gopal',
            'commodity': 'Wheat',
            'final_business_name': 'Wheat Arrivals Initial',
            'commodity_config': {'version': 1}
        }), headers=self.get_auth_headers())
        mid = res_post.get_json()['item']['id']
        self.created_mapping_ids.append(mid)

        updated_cfg = {'version': 2, 'verified': True}
        res_put = self.client.put(f'/api/admin/table-mappings/{mid}', data=json.dumps({
            'commodity_config': updated_cfg
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        res_check = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        matched = next((i for i in res_check.get_json().get('data', []) if i.get('id') == mid), None)
        self.assertIsNotNone(matched)
        self.assertIn('version', str(matched.get('commodity_config')))

    def test_t1_f3_05_filter_table_mappings_by_commodity(self):
        """GET /api/admin/table-mappings?commodity=<commodity> returns filtered mappings."""
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_post = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': 'Nitesh',
            'commodity': 'Turmeric',
            'final_business_name': 'Turmeric Pricing Filter Test',
            'frequency': 'Daily'
        }), headers=self.get_auth_headers())
        mid = res_post.get_json()['item']['id']
        self.created_mapping_ids.append(mid)

        res_filter = self.client.get('/api/admin/table-mappings?commodity=Turmeric', headers=self.get_auth_headers())
        self.assertEqual(res_filter.status_code, 200)
        items = res_filter.get_json().get('data', [])
        self.assertTrue(any(i.get('raw_table_name') == raw_table for i in items))

    # ── Feature 4: Report Timing / Schedule Retrieval and Updates ────────────

    def test_t1_f4_01_report_timing_schedule_creation(self):
        """User report assignment stores and returns timing_schedule."""
        email = self.generate_email('test_e2e_f4_timing')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Timing User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '09:15 AM'}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        r0 = (user.get('reports') or user.get('report_mappings') or [])[0]
        schedule = r0.get('timing_schedule') or r0.get('timingSchedule')
        self.assertEqual(schedule, '09:15 AM')

    def test_t1_f4_02_report_deadline_creation(self):
        """User report assignment stores and returns deadline."""
        email = self.generate_email('test_e2e_f4_deadline')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Deadline User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 2, 'report_name': 'Barley Weekly', 'deadline': '16:45'}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        r0 = (user.get('reports') or user.get('report_mappings') or [])[0]
        self.assertEqual(r0.get('deadline'), '16:45')

    def test_t1_f4_03_update_report_timing_via_user_hierarchy(self):
        """PUT /api/admin/users/<email> updates report timing_schedule."""
        email = self.generate_email('test_e2e_f4_update_timing')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Update Timing User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '09:00 AM'}]
        }), headers=self.get_auth_headers())

        # Update timing schedule to 11:30 AM
        res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '11:30 AM'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        res_check = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res_check.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        r0 = (user.get('reports') or user.get('report_mappings') or [])[0]
        schedule = r0.get('timing_schedule') or r0.get('timingSchedule')
        self.assertEqual(schedule, '11:30 AM')

    def test_t1_f4_04_update_report_deadline_via_user_hierarchy(self):
        """PUT /api/admin/users/<email> updates report deadline."""
        email = self.generate_email('test_e2e_f4_update_deadline')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Update Deadline User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'deadline': '17:00'}]
        }), headers=self.get_auth_headers())

        # Update deadline to 19:30
        res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'deadline': '19:30'}]
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        res_check = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res_check.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        r0 = (user.get('reports') or user.get('report_mappings') or [])[0]
        self.assertEqual(r0.get('deadline'), '19:30')

    def test_t1_f4_05_multiple_reports_with_distinct_timing_schedules(self):
        """User assigned 2 reports maintains independent timing schedules."""
        email = self.generate_email('test_e2e_f4_multi_sched')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Multi Sched User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [
                {'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '08:00 AM', 'deadline': '12:00'},
                {'report_id': 2, 'report_name': 'Barley Weekly', 'timing_schedule': '02:00 PM', 'deadline': '18:00'}
            ]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        reps = user.get('reports') or user.get('report_mappings') or []
        self.assertEqual(len(reps), 2)
        schedules = {r.get('report_name'): (r.get('timing_schedule') or r.get('timingSchedule')) for r in reps}
        self.assertEqual(schedules.get('Bajra Weekly'), '08:00 AM')
        self.assertEqual(schedules.get('Barley Weekly'), '02:00 PM')

    # ── Feature 5: 1st & 2nd Backup Assignment Persistence and Retrieval ─────

    def test_t1_f5_01_persist_both_backups(self):
        """User creation persists both backup_1 and backup_2."""
        email = self.generate_email('test_e2e_f5_both_backups')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Both Backups User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertEqual(user.get('backup_1') or user.get('backup1'), 'Ram Gopal')
        self.assertEqual(user.get('backup_2') or user.get('backup2'), 'Nitesh')

    def test_t1_f5_02_update_backup_1_only(self):
        """PUT /api/admin/users/<email> updates backup_1 while keeping backup_2 intact."""
        email = self.generate_email('test_e2e_f5_upd_b1')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Upd B1 User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }), headers=self.get_auth_headers())

        self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'backup_1': 'Gopi'
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertEqual(user.get('backup_1') or user.get('backup1'), 'Gopi')
        self.assertEqual(user.get('backup_2') or user.get('backup2'), 'Nitesh')

    def test_t1_f5_03_update_backup_2_only(self):
        """PUT /api/admin/users/<email> updates backup_2 while keeping backup_1 intact."""
        email = self.generate_email('test_e2e_f5_upd_b2')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Upd B2 User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }), headers=self.get_auth_headers())

        self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'backup_2': 'Pankaj'
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertEqual(user.get('backup_1') or user.get('backup1'), 'Ram Gopal')
        self.assertEqual(user.get('backup_2') or user.get('backup2'), 'Pankaj')

    def test_t1_f5_04_clear_backup_2_keeping_backup_1(self):
        """PUT /api/admin/users/<email> can clear backup_2 to empty string."""
        email = self.generate_email('test_e2e_f5_clr_b2')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Clr B2 User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }), headers=self.get_auth_headers())

        self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'backup_2': ''
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertEqual(user.get('backup_1') or user.get('backup1'), 'Ram Gopal')
        b2 = user.get('backup_2') or user.get('backup2') or ''
        self.assertEqual(b2, '')

    def test_t1_f5_05_backup_aliases_compatibility(self):
        """User dictionary serialization supports backup_1/backup1 and backup_2/backup2."""
        email = self.generate_email('test_e2e_f5_aliases')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Aliases User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh'
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        has_b1 = 'backup_1' in user or 'backup1' in user
        has_b2 = 'backup_2' in user or 'backup2' in user
        self.assertTrue(has_b1 and has_b2, f"Expected backup keys in user serialization: {user.keys()}")


# ============================================================================
# TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature category)
# ============================================================================

class TestHierarchyAndStudioTier2(BaseE2ETestCase):
    """
    Tier 2: Boundary & Corner Cases.
    Validates:
    - Empty reports and commodities lists
    - Single backup or no backups
    - Special characters & unicode in user names and commodities
    - Non-existent user/mapping ID responses (404)
    - Duplicate email rejection (400)
    - Turmeric commodity classification check (verify not misclassified as Pulses)
    """

    def test_t2_01_create_user_empty_reports_and_commodities(self):
        """User creation with empty reports and empty commodities succeeds with 200."""
        email = self.generate_email('test_e2e_t2_empty_both')
        payload = {
            'name': 'Test E2E Empty Hierarchy User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [],
            'commodities': []
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get('success'))

    def test_t2_02_create_user_empty_reports_populated_commodities(self):
        """User creation with empty reports but populated commodities succeeds."""
        email = self.generate_email('test_e2e_t2_empty_rep')
        payload = {
            'name': 'Test E2E Empty Rep User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [],
            'commodities': [{'commodity': 'Bajra'}]
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

    def test_t2_03_create_user_empty_commodities_populated_reports(self):
        """User creation with empty commodities but populated reports succeeds."""
        email = self.generate_email('test_e2e_t2_empty_comm')
        payload = {
            'name': 'Test E2E Empty Comm User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly'}],
            'commodities': []
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

    def test_t2_04_create_user_only_first_backup(self):
        """User with backup_1 populated and backup_2 empty succeeds."""
        email = self.generate_email('test_e2e_t2_only_b1')
        payload = {
            'name': 'Test E2E Only B1 User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': 'Ram Gopal',
            'backup_2': ''
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

    def test_t2_05_create_user_no_backups(self):
        """User with no backups configured succeeds."""
        email = self.generate_email('test_e2e_t2_no_backups')
        payload = {
            'name': 'Test E2E No Backups User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'backup_1': '',
            'backup_2': ''
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

    def test_t2_06_special_characters_in_user_name(self):
        """User name containing unicode, quotes, and ampersands persists without corruption."""
        email = self.generate_email('test_e2e_t2_special_name')
        special_name = "O'Connor & Şons - Test (Research)"
        payload = {
            'name': special_name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)

        res_get = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res_get.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        self.assertEqual(user['name'], special_name)

    def test_t2_07_special_characters_in_commodity_and_table_mapping(self):
        """Table mapping with complex commodity strings and symbols persists properly."""
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        comm = "Chilli & Pepper / Dry (Special)"
        res = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': 'Ram Gopal',
            'commodity': comm,
            'final_business_name': "Chilli Mandi Prices (2026)"
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 200)
        mid = res.get_json()['item']['id']
        self.created_mapping_ids.append(mid)

        res_check = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        item = next((i for i in res_check.get_json().get('data', []) if i['id'] == mid), None)
        self.assertIsNotNone(item)
        self.assertIn('Chilli', item['commodity'])

    def test_t2_08_update_nonexistent_user_returns_404(self):
        """PUT /api/admin/users/nonexistent@agalabs.com returns HTTP 404."""
        res = self.client.put('/api/admin/users/nonexistent_xyz_999999@agalabs.com', data=json.dumps({
            'name': 'Does Not Exist'
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_09_update_nonexistent_table_mapping_returns_404(self):
        """PUT /api/admin/table-mappings/999999 returns HTTP 404."""
        res = self.client.put('/api/admin/table-mappings/999999', data=json.dumps({
            'final_name': 'Does Not Exist'
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_10_delete_nonexistent_table_mapping_returns_404(self):
        """DELETE /api/admin/table-mappings/999999 returns HTTP 404."""
        res = self.client.delete('/api/admin/table-mappings/999999', headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_11_duplicate_email_rejection(self):
        """Attempting to create a user with an already registered email returns HTTP 400."""
        # 'nishant@agalabs.com' is an existing baseline SuperAdmin user
        payload = {
            'name': 'Duplicate User',
            'email': 'nishant@agalabs.com',
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_12_missing_email_rejection(self):
        """POST /api/admin/users without email returns HTTP 400."""
        payload = {
            'name': 'Missing Email User',
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }
        res = self.client.post('/api/admin/users', data=json.dumps(payload), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_13_missing_required_mapping_fields_rejection(self):
        """POST /api/admin/table-mappings without required fields returns HTTP 400."""
        res = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'commodity': 'Bajra'
        }), headers=self.get_auth_headers())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.get_json().get('success'))

    def test_t2_14_turmeric_classification_not_pulses(self):
        """Verify Turmeric reports are classified as 'Turmeric', never misclassified as 'Pulses'."""
        report = Report(name='Turmeric Daily Spot Price')
        d = report.to_dict()
        self.assertEqual(d.get('commodity'), 'Turmeric', f"Turmeric report incorrectly classified as: {d.get('commodity')}")

    def test_t2_15_turmeric_weekly_classification(self):
        """Verify NCDEX Turmeric report is classified as 'Turmeric'."""
        report = Report(name='NCDEX Turmeric Weekly Review')
        d = report.to_dict()
        self.assertEqual(d.get('commodity'), 'Turmeric')

    def test_t2_16_tur_pulse_classification_remains_pulses(self):
        """Verify genuine 'Tur' reports are correctly classified as 'Pulses'."""
        report = Report(name='Tur Daily Mandi Price')
        d = report.to_dict()
        self.assertEqual(d.get('commodity'), 'Pulses')


# ============================================================================
# TIER 3: CROSS-FEATURE COMBINATIONS
# ============================================================================

class TestHierarchyAndStudioTier3(BaseE2ETestCase):
    """
    Tier 3: Cross-Feature Combinations.
    Validates:
    - User rename cascade to db_task_catalog and reports
    - Report timing schedule update & user hierarchy sync
    - Multiple users assigned to the same report or commodity
    - User active status deactivation and reactivation
    """

    def test_t3_01_user_rename_cascades_to_table_mappings(self):
        """Updating user name via PUT /api/admin/users/<email> cascades to db_task_catalog.user_name."""
        email = self.generate_email('test_e2e_t3_cascade_tm')
        orig_name = 'Test E2E Original Name TM'
        new_name = 'Test E2E Renamed TM'

        # Create user
        self.client.post('/api/admin/users', data=json.dumps({
            'name': orig_name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'
        }), headers=self.get_auth_headers())

        # Create table mapping assigned to orig_name
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_map = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': orig_name,
            'commodity': 'Bajra',
            'final_business_name': 'Cascade Test Table'
        }), headers=self.get_auth_headers())
        mid = res_map.get_json()['item']['id']
        self.created_mapping_ids.append(mid)

        # Update user name to new_name
        res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'name': new_name
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        # Assert table mapping user_name cascaded to new_name
        res_check = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        item = next((i for i in res_check.get_json().get('data', []) if i['id'] == mid), None)
        self.assertIsNotNone(item)
        self.assertEqual(item.get('user') or item.get('userName'), new_name)

    def test_t3_02_user_rename_cascades_to_reports(self):
        """Updating user name via PUT /api/admin/users/<email> cascades to reports.primary_assignee."""
        email = self.generate_email('test_e2e_t3_cascade_rep')
        orig_name = 'Test E2E Original Name Rep'
        new_name = 'Test E2E Renamed Rep'

        # Create user
        self.client.post('/api/admin/users', data=json.dumps({
            'name': orig_name, 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Password@123'
        }), headers=self.get_auth_headers())

        # Create test report with primary_assignee = orig_name
        with self.app.app_context():
            rep = Report(name=f"test_e2e_report_{uuid.uuid4().hex[:6]}", primary_assignee=orig_name)
            db.session.add(rep)
            db.session.commit()
            rid = rep.id
            self.created_report_ids.append(rid)

        # Update user name
        self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'name': new_name
        }), headers=self.get_auth_headers())

        # Assert report primary_assignee cascaded to new_name
        with self.app.app_context():
            updated_rep = db.session.get(Report, rid)
            self.assertEqual(updated_rep.primary_assignee, new_name)

    def test_t3_03_report_timing_schedule_update_and_hierarchy_sync(self):
        """Updating report timing via user endpoint syncs across hierarchy queries."""
        email = self.generate_email('test_e2e_t3_timing_sync')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Timing Sync User',
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '08:30 AM'}]
        }), headers=self.get_auth_headers())

        # Update to 10:45 AM
        self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '10:45 AM'}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        r0 = (user.get('reports') or user.get('report_mappings') or [])[0]
        schedule = r0.get('timing_schedule') or r0.get('timingSchedule')
        self.assertEqual(schedule, '10:45 AM')

    def test_t3_04_multiple_users_assigned_to_same_commodity(self):
        """Two distinct users assigned the same commodity maintain independent configurations."""
        email1 = self.generate_email('test_e2e_t3_multi_c1')
        email2 = self.generate_email('test_e2e_t3_multi_c2')

        cfg1 = {'source': 'Source A', 'rate': 10}
        cfg2 = {'source': 'Source B', 'rate': 20}

        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'User C1', 'email': email1, 'role': 'Teammate', 'department': 'Research', 'password': 'Pass1',
            'commodities': [{'commodity': 'Cotton', 'mapping_config': json.dumps(cfg1)}]
        }), headers=self.get_auth_headers())

        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'User C2', 'email': email2, 'role': 'Teammate', 'department': 'Research', 'password': 'Pass2',
            'commodities': [{'commodity': 'Cotton', 'mapping_config': json.dumps(cfg2)}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        u1 = next((u for u in users if u['email'].lower() == email1.lower()), None)
        u2 = next((u for u in users if u['email'].lower() == email2.lower()), None)

        c1 = (u1.get('commodity_mappings') or u1.get('assignedCommodities') or [])[0]
        c2 = (u2.get('commodity_mappings') or u2.get('assignedCommodities') or [])[0]

        self.assertIn('Source A', str(c1.get('mapping_config') or c1.get('config')))
        self.assertIn('Source B', str(c2.get('mapping_config') or c2.get('config')))

    def test_t3_05_multiple_users_assigned_to_same_report(self):
        """Two distinct users assigned the same report maintain separate timing schedules."""
        email1 = self.generate_email('test_e2e_t3_multi_r1')
        email2 = self.generate_email('test_e2e_t3_multi_r2')

        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'User R1', 'email': email1, 'role': 'Teammate', 'department': 'Research', 'password': 'Pass1',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '08:00 AM'}]
        }), headers=self.get_auth_headers())

        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'User R2', 'email': email2, 'role': 'Teammate', 'department': 'Research', 'password': 'Pass2',
            'reports': [{'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '11:00 AM'}]
        }), headers=self.get_auth_headers())

        res = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        users = res.get_json().get('data', [])
        u1 = next((u for u in users if u['email'].lower() == email1.lower()), None)
        u2 = next((u for u in users if u['email'].lower() == email2.lower()), None)

        r1 = (u1.get('reports') or u1.get('report_mappings') or [])[0]
        r2 = (u2.get('reports') or u2.get('report_mappings') or [])[0]

        s1 = r1.get('timing_schedule') or r1.get('timingSchedule')
        s2 = r2.get('timing_schedule') or r2.get('timingSchedule')
        self.assertEqual(s1, '08:00 AM')
        self.assertEqual(s2, '11:00 AM')

    def test_t3_06_user_deactivation_and_reactivation_toggle(self):
        """User active status can be toggled via PUT without corrupting mappings."""
        email = self.generate_email('test_e2e_t3_active_toggle')
        self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Test E2E Toggle User', 'email': email, 'role': 'Teammate', 'department': 'Research', 'password': 'Pass'
        }), headers=self.get_auth_headers())

        # Deactivate
        self.client.put(f'/api/admin/users/{email}', data=json.dumps({'active': False}), headers=self.get_auth_headers())
        res1 = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        u_deact = next((u for u in res1.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertFalse(u_deact['active'])

        # Reactivate
        self.client.put(f'/api/admin/users/{email}', data=json.dumps({'active': True}), headers=self.get_auth_headers())
        res2 = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        u_react = next((u for u in res2.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertTrue(u_react['active'])


# ============================================================================
# TIER 4: REAL-WORLD APPLICATION SCENARIOS & ZERO DATA LOSS
# ============================================================================

class TestHierarchyAndStudioTier4(BaseE2ETestCase):
    """
    Tier 4: Real-World Application Scenarios.
    Validates:
    - Complete end-to-end user & mapping lifecycle
    - Zero data loss guarantee: all 9 baseline users, 27 reports, and 156 table mappings preserved intact
    """

    def test_t4_01_full_lifecycle_workflow(self):
        """
        Full Production Lifecycle:
        1. SuperAdmin creates user with 2 assigned reports (with timing & deadlines) and 2 commodities (with JSON configs) + backups.
        2. Verify user in /api/admin/users with complete hierarchy.
        3. Verify user in Table Mapping Studio endpoints.
        4. Assign table mapping to user.
        5. Update user name & report timing schedules.
        6. Verify relational cascade across table mappings and reports.
        7. Clean up test table mapping and user.
        """
        email = self.generate_email('test_e2e_t4_lifecycle')
        orig_name = 'Arun Kumar E2E'
        updated_name = 'Arun K. Sharma E2E'

        # Step 1: Create user with full hierarchy
        create_payload = {
            'name': orig_name,
            'email': email,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'StrongPassword@2026',
            'backup_1': 'Ram Gopal',
            'backup_2': 'Nitesh',
            'reports': [
                {'report_id': 1, 'report_name': 'Bajra Weekly', 'frequency': 'Weekly', 'timing_schedule': '09:00 AM', 'deadline': '18:00'},
                {'report_id': 2, 'report_name': 'Barley Weekly', 'frequency': 'Weekly', 'timing_schedule': '10:00 AM', 'deadline': '17:00'}
            ],
            'commodities': [
                {'commodity': 'Bajra', 'mapping_config': json.dumps({'factor': 'Weekly Price', 'source': 'Agmarknet'})},
                {'commodity': 'Barley', 'mapping_config': json.dumps({'factor': 'Mandi Arrivals', 'source': 'APMC'})}
            ]
        }
        res_post = self.client.post('/api/admin/users', data=json.dumps(create_payload), headers=self.get_auth_headers())
        self.assertIn(res_post.status_code, [200, 201])

        # Step 2: Verify user hierarchy
        res_users = self.client.get('/api/admin/users', headers=self.get_auth_headers())
        user = next((u for u in res_users.get_json().get('data', []) if u['email'].lower() == email.lower()), None)
        self.assertIsNotNone(user)
        self.assertEqual(user['name'], orig_name)
        self.assertEqual(user.get('backup_1') or user.get('backup1'), 'Ram Gopal')
        self.assertEqual(user.get('backup_2') or user.get('backup2'), 'Nitesh')
        reports = user.get('reports') or user.get('report_mappings') or []
        self.assertEqual(len(reports), 2)

        # Step 3: Create table mapping assigned to user
        raw_table = f"test_e2e_raw_{uuid.uuid4().hex[:6]}"
        res_map = self.client.post('/api/admin/table-mappings', data=json.dumps({
            'raw_table_name': raw_table,
            'assigned_user': orig_name,
            'commodity': 'Bajra',
            'final_business_name': 'Bajra Mandi Surveillance Pipeline',
            'frequency': 'Daily',
            'target_cutoff_time': '18:30'
        }), headers=self.get_auth_headers())
        self.assertEqual(res_map.status_code, 200)
        mid = res_map.get_json()['item']['id']
        self.created_mapping_ids.append(mid)

        # Step 4: Verify mapping query
        res_query = self.client.get(f'/api/admin/table-mappings?user={orig_name}', headers=self.get_auth_headers())
        items = res_query.get_json().get('data', [])
        self.assertTrue(any(i['raw_table_name'] == raw_table for i in items))

        # Step 5: Update user name and report timing
        res_put = self.client.put(f'/api/admin/users/{email}', data=json.dumps({
            'name': updated_name,
            'reports': [
                {'report_id': 1, 'report_name': 'Bajra Weekly', 'timing_schedule': '11:15 AM'}
            ]
        }), headers=self.get_auth_headers())
        self.assertEqual(res_put.status_code, 200)

        # Step 6: Verify cascade in table mappings
        res_tm = self.client.get('/api/admin/table-mappings', headers=self.get_auth_headers())
        matched_tm = next((i for i in res_tm.get_json().get('data', []) if i['id'] == mid), None)
        self.assertIsNotNone(matched_tm)
        self.assertEqual(matched_tm.get('user') or matched_tm.get('userName'), updated_name)

        # Step 7: Delete table mapping
        res_del = self.client.delete(f'/api/admin/table-mappings/{mid}', headers=self.get_auth_headers())
        self.assertEqual(res_del.status_code, 200)
        self.created_mapping_ids.remove(mid)

        # Step 8: Delete user
        res_del_u = self.client.delete(f'/api/admin/users/{email}', headers=self.get_auth_headers())
        self.assertEqual(res_del_u.status_code, 200)
        self.created_emails.remove(email)

    def test_t4_02_zero_data_loss_preservation(self):
        """Verify all 9 original baseline users, 27 reports, and 156 table mappings exist intact."""
        with self.app.app_context():
            user_count = User.query.count()
            report_count = Report.query.count()
            mapping_count = DBTaskCatalog.query.count()

            self.assertGreaterEqual(user_count, self.baseline_user_count,
                                    f"Expected >= {self.baseline_user_count} users, got {user_count}")
            self.assertGreaterEqual(report_count, self.baseline_report_count,
                                    f"Expected >= {self.baseline_report_count} reports, got {report_count}")
            self.assertGreaterEqual(mapping_count, self.baseline_mapping_count,
                                    f"Expected >= {self.baseline_mapping_count} mappings, got {mapping_count}")

            # Verify every baseline email is present
            existing_emails = {u.email.lower() for u in User.query.all()}
            for base_email in self.baseline_user_emails:
                self.assertIn(base_email.lower(), existing_emails,
                              f"Baseline user {base_email} was deleted or lost!")


if __name__ == '__main__':
    unittest.main()
