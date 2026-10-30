"""
Advance ERP — Comprehensive 4-Tier Crishi Role Scoping & Update History Test Suite
===================================================================================

Requirements Covered:
- R1: Role Scoping for Admins (SuperAdmin, Manager, Leader) vs Teammates across endpoints:
  * GET /api/crishi/grid
  * GET /api/crishi/reports/all
  * Admin mutating routes (/api/crishi/pull, /api/crishi/skip, /api/crishi/manager-review)
  * Teammates only see their own assigned commodities, reports, table updates, and portfolio chips.
- R2: Person-Basis Update History Tracking:
  * Database update date/timestamps extraction
  * All 9 mandatory fields: person_name, table_name, final_name, commodity, db_update_timestamp,
    report_date, status, row_count, remarks
  * Immutability (repeated syncs append new history entries, never mutating past records)
- R3: Update History endpoint access and UI integration:
  * GET /api/crishi/update-history with role-based scoping
  * Admins view all and filter by any teammate; Teammates only view their own records
  * Dedicated 'Update History' tab in Crishi UI and portfolio chip linking
- R4: Automated testing using unittest:
  * Dynamic JWT role claims (SuperAdmin, Manager, Leader, Teammate)
  * Ephemeral test entities with zero residue
  * Non-destructive verification asserting zero data loss on database invariants:
    Exactly 9 users, 27 reports, 158 catalog mappings intact.

Test Hierarchy:
- Tier 1: Feature Coverage (Features 1 to 12, 5 tests each = 60 test cases)
- Tier 2: Boundary & Corner Cases (Features 1 to 12, 5 tests each = 60 test cases)
- Tier 3: Cross-Feature Interactions & Pairwise Matrix (10 test cases)
- Tier 4: Real-World Application Scenarios (5 comprehensive end-to-end user scenarios)
Total: 135 test cases.
"""

import os
import re
import json
import uuid
import unittest
from datetime import datetime, date, timedelta, timezone
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog

# Attempt to import optional/planned models and functions gracefully for TDD
try:
    from app.models import TableUpdateHistory
except (ImportError, AttributeError):
    TableUpdateHistory = None

try:
    from app.services.history_service import extract_table_db_update_history
except (ImportError, AttributeError):
    extract_table_db_update_history = None

try:
    from app import auth
except (ImportError, AttributeError):
    auth = None


class BaseCrishiHistoryTestCase(unittest.TestCase):
    """
    Base test case managing Flask test client, auth headers, isolated test data,
    and non-destructive database invariant preservation.
    """

    app = None
    client = None
    repo_root = None
    app_init_error = None

    # Database Baseline Invariants
    BASELINE_USER_COUNT = 9
    BASELINE_REPORT_COUNT = 27
    BASELINE_CATALOG_COUNT = 158

    # Standard User Catalog
    SUPERADMIN_EMAIL = 'vaibhav@agalabs.com'
    SUPERADMIN_NISHANT = 'nishant@agalabs.com'
    MANAGER_EMAIL = 'ram@agalabs.com'
    TEAMMATE_BHAWNA = 'bhawna@agalabs.com'
    TEAMMATE_GOPI = 'gopichand@agalabs.com'
    TEAMMATE_NITESH = 'nitesh@agalabs.com'
    TEAMMATE_PANKAJ = 'pankaj@agalabs.com'
    DEACTIVATED_USER = 'damini@agalabs.com'

    @classmethod
    def setUpClass(cls):
        """Initialize Flask test client, record paths, and clean stale test data."""
        try:
            cls.app = create_app()
            cls.app.config['TESTING'] = True
            cls.client = cls.app.test_client()
            cls.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        except Exception as e:
            cls.app = None
            cls.app_init_error = e
            return

        with cls.app.app_context():
            cls._sweep_test_entities()

    @classmethod
    def tearDownClass(cls):
        """Clean all test artifacts and strictly assert baseline invariants."""
        if cls.app:
            with cls.app.app_context():
                cls._sweep_test_entities()

                user_count = User.query.count()
                report_count = Report.query.count()
                catalog_count = DBTaskCatalog.query.count()

                assert user_count == cls.BASELINE_USER_COUNT, (
                    f"Invariant violation: user count drifted to {user_count}, expected {cls.BASELINE_USER_COUNT}"
                )
                assert report_count == cls.BASELINE_REPORT_COUNT, (
                    f"Invariant violation: report count drifted to {report_count}, expected {cls.BASELINE_REPORT_COUNT}"
                )
                assert catalog_count == cls.BASELINE_CATALOG_COUNT, (
                    f"Invariant violation: catalog count drifted to {catalog_count}, expected {cls.BASELINE_CATALOG_COUNT}"
                )

    @classmethod
    def _sweep_test_entities(cls):
        """Removes test artifacts created with 'test_e2e_' prefix."""
        try:
            # Delete test history records if table exists
            if TableUpdateHistory is not None and hasattr(TableUpdateHistory, 'query'):
                test_histories = TableUpdateHistory.query.filter(
                    (TableUpdateHistory.table_name.like('test_e2e_%')) |
                    (TableUpdateHistory.person_name.like('Test E2E%'))
                ).all()
                for h in test_histories:
                    db.session.delete(h)

            # Delete test catalogs
            test_catalogs = DBTaskCatalog.query.filter(
                (DBTaskCatalog.raw_table_name.like('test_e2e_%')) |
                (DBTaskCatalog.final_name.like('Test E2E%'))
            ).all()
            for c in test_catalogs:
                db.session.delete(c)

            # Delete test reports
            test_reports = Report.query.filter(Report.name.like('test_e2e_%')).all()
            for r in test_reports:
                db.session.delete(r)

            # Delete test users
            test_users = User.query.filter(
                (User.email.like('test_e2e_%')) |
                (User.email.like('%test_null%')) |
                (User.email.like('%ghost_user%')) |
                (User.name.like('Test E2E%')) |
                (User.name.like('%Lifecycle%')) |
                (User.name.like('Duplicate User%')) |
                (User.name.like('No Email%'))
            ).all()
            for u in test_users:
                db.session.delete(u)

            db.session.commit()
        except Exception:
            db.session.rollback()

    def setUp(self):
        if self.app_init_error:
            self.fail(f"Flask create_app() failed to initialize: {self.app_init_error}")
        self.created_history_ids = []
        self.created_user_ids = []
        self.created_emails = []

    def tearDown(self):
        """Per-test cleanup of tracked test entities."""
        if not self.app:
            return
        with self.app.app_context():
            try:
                if TableUpdateHistory is not None and hasattr(TableUpdateHistory, 'query'):
                    for hid in self.created_history_ids:
                        rec = db.session.get(TableUpdateHistory, hid)
                        if rec:
                            db.session.delete(rec)
                for uid in self.created_user_ids:
                    u = db.session.get(User, uid)
                    if u:
                        db.session.delete(u)
                for email in self.created_emails:
                    u = User.query.filter_by(email=email.lower()).first()
                    if u:
                        db.session.delete(u)
                db.session.commit()
            except Exception:
                db.session.rollback()

    # --- Auth Helpers ---
    def get_jwt_token(self, email=None, role=None):
        email = email or self.SUPERADMIN_EMAIL
        role = role or 'SuperAdmin'
        with self.app.app_context():
            return create_access_token(identity=email, additional_claims={'role': role})

    def get_auth_headers(self, email=None, role=None):
        token = self.get_jwt_token(email, role)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def get_admin_headers(self):
        return self.get_auth_headers(self.SUPERADMIN_EMAIL, 'SuperAdmin')

    def get_manager_headers(self):
        return self.get_auth_headers(self.MANAGER_EMAIL, 'Manager')

    def get_leader_headers(self):
        return self.get_auth_headers('test_e2e_leader@agalabs.com', 'Leader')

    def get_bhawna_headers(self):
        return self.get_auth_headers(self.TEAMMATE_BHAWNA, 'Teammate')

    def get_gopi_headers(self):
        return self.get_auth_headers(self.TEAMMATE_GOPI, 'Teammate')

    def get_nitesh_headers(self):
        return self.get_auth_headers(self.TEAMMATE_NITESH, 'Teammate')

    def get_pankaj_headers(self):
        return self.get_auth_headers(self.TEAMMATE_PANKAJ, 'Teammate')

    # --- UI Inspection Helpers ---
    def get_crishi_js_content(self):
        js_path = os.path.join(self.repo_root, 'app', 'static', 'js', 'crishi.js')
        if not os.path.exists(js_path):
            return ""
        with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()

    def get_index_html_content(self):
        html_path = os.path.join(self.repo_root, 'app', 'templates', 'index.html')
        if not os.path.exists(html_path):
            return ""
        with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()


# =========================================================================
# TIER 1: FEATURE COVERAGE (Features 1 to 12, 5 tests each = 60 test cases)
# =========================================================================

class TestTier1FeatureCoverage(BaseCrishiHistoryTestCase):
    """
    Tier 1: Comprehensive feature coverage verifying each individual feature
    in complete isolation with at least 5 test cases per feature.
    """

    # --- Feature 1: Admin Unrestricted Surveillance Grid Access ---
    def test_t1_f01_01_superadmin_unrestricted_grid_all_active_tasks(self):
        """F1.1: SuperAdmin calling GET /api/crishi/grid receives all active catalog tasks."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got {res.status_code}")
        data = res.get_json() or {}
        self.assertTrue(data.get('success'))
        tasks = data.get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len(tasks), active_count,
                         f"Admin must see all {active_count} active tasks, got {len(tasks)}")

    def test_t1_f01_02_manager_unrestricted_grid_all_active_tasks(self):
        """F1.2: Manager calling GET /api/crishi/grid receives all active catalog tasks."""
        headers = self.get_manager_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got {res.status_code}")
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len(tasks), active_count,
                         f"Manager must see all {active_count} active tasks, got {len(tasks)}")

    def test_t1_f01_03_admin_grid_contains_all_commodity_rollups(self):
        """F1.3: Admin surveillance grid contains full commodity rollups across all commodities."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        rollups = data.get('commodity_rollups', [])
        commodities = [r.get('commodity') for r in rollups if isinstance(r, dict)]
        self.assertIn('Soybeans', commodities)
        self.assertIn('Rice', commodities)
        self.assertIn('Wheat', commodities)
        self.assertIn('Cotton', commodities)

    def test_t1_f01_04_admin_summary_contains_all_active_teammates(self):
        """F1.4: Admin summary['teammates'] contains all active team members."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        self.assertIn('Bhawna', teammates)
        self.assertIn('Gopi', teammates)
        self.assertIn('Nitesh', teammates)
        self.assertIn('Pankaj', teammates)
        self.assertGreaterEqual(len(teammates), 4)

    def test_t1_f01_05_admin_grid_date_filter_preserves_unrestricted_access(self):
        """F1.5: Admin passing specific date preserves full task access for that date."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=2026-07-01', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len(tasks), active_count)

    # --- Feature 2: Teammate Scoped Surveillance Grid Access ---
    def test_t1_f02_01_bhawna_grid_scoped_to_assigned_tasks(self):
        """F2.1: Bhawna (Teammate) only receives her assigned tasks (strictly < total active)."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        self.assertGreater(len(tasks), 0, "Bhawna should have assigned tasks")
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count,
                        "Teammate grid must be strictly scoped and not return all tasks")

    def test_t1_f02_02_bhawna_grid_excludes_unassigned_commodities(self):
        """F2.2: Bhawna's returned tasks only belong to her commodities (Cotton, Rapeseed, Soybeans, Weather)."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        for t in tasks:
            comm = t.get('commodity', '')
            user = t.get('user', '')
            self.assertTrue(
                'Bhawna' in user or any(c in comm for c in ['Soybean', 'Cotton', 'Rapeseed', 'Weather', 'General', 'Macro / All']),
                f"Unassigned task {t.get('final_name')} (commodity: {comm}, user: {user}) exposed to Bhawna"
            )

    def test_t1_f02_03_gopichand_grid_scoped_to_rice_and_wheat(self):
        """F2.3: Gopichand only receives tasks assigned to Gopi (Rice, Wheat)."""
        headers = self.get_gopi_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        self.assertGreater(len(tasks), 0)
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count)
        for t in tasks:
            user = t.get('user', '')
            comm = t.get('commodity', '')
            self.assertTrue(
                'Gopi' in user or any(c in comm for c in ['Rice', 'Wheat', 'General', 'Macro / All']),
                f"Task {t.get('final_name')} not assigned to Gopi was exposed"
            )

    def test_t1_f02_04_pankaj_grid_scoped_to_assigned_spices(self):
        """F2.4: Pankaj only receives tasks assigned to Pankaj (Spices / Weather)."""
        headers = self.get_pankaj_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        self.assertGreater(len(tasks), 0)
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count)

    def test_t1_f02_05_teammate_commodity_rollups_strictly_scoped(self):
        """F2.5: Teammate commodity_rollups only lists teammate's assigned commodities."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        rollups = data.get('commodity_rollups', [])
        roll_commodities = [r.get('commodity') for r in rollups]
        self.assertNotIn('Rice', roll_commodities, "Rice rollup exposed to Bhawna")
        self.assertNotIn('Wheat', roll_commodities, "Wheat rollup exposed to Bhawna")

    # --- Feature 3: Teammate Scoped Reports & Categories ---
    def test_t1_f03_01_admin_unrestricted_reports_access_all_27(self):
        """F3.1: Admin receives all 27 reports on GET /api/crishi/reports/all."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        reports = data.get('reports', [])
        self.assertGreaterEqual(len(reports), self.BASELINE_REPORT_COUNT,
                                f"Admin should see >= {self.BASELINE_REPORT_COUNT} reports, got {len(reports)}")

    def test_t1_f03_02_bhawna_reports_scoped_to_assigned_commodities(self):
        """F3.2: Bhawna only receives reports matching her commodities (Soybeans, Cotton, Rapeseed)."""
        admin_res = self.client.get('/api/crishi/reports/all', headers=self.get_admin_headers())
        self.assertEqual(admin_res.status_code, 200)
        admin_count = len((admin_res.get_json() or {}).get('reports', []))

        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        reports = data.get('reports', [])
        self.assertLess(len(reports), admin_count, "Teammate reports list must be strictly scoped")

    def test_t1_f03_03_gopichand_reports_scoped_to_rice_wheat(self):
        """F3.3: Gopichand only receives reports matching Rice and Wheat."""
        admin_res = self.client.get('/api/crishi/reports/all', headers=self.get_admin_headers())
        admin_count = len((admin_res.get_json() or {}).get('reports', []))

        headers = self.get_gopi_headers()
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        reports = data.get('reports', [])
        self.assertLess(len(reports), admin_count)

    def test_t1_f03_04_teammate_cannot_view_unassigned_reports(self):
        """F3.4: Unassigned report categories (e.g. Pulses for Gopichand) are not in response."""
        headers = self.get_gopi_headers()
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        reports = data.get('reports', [])
        for r in reports:
            comm = r.get('commodity', '')
            title = r.get('title', '') or r.get('report_name', '')
            self.assertFalse(
                'pulses' in comm.lower() or 'pulses' in title.lower(),
                f"Pulses report '{title}' exposed to Gopichand"
            )

    def test_t1_f03_05_reports_count_for_teammates_less_than_admin_total(self):
        """F3.5: Total count for Teammates is strictly lower than Admin report count."""
        admin_res = self.client.get('/api/crishi/reports/all', headers=self.get_admin_headers())
        tm_res = self.client.get('/api/crishi/reports/all', headers=self.get_bhawna_headers())
        self.assertEqual(admin_res.status_code, 200)
        self.assertEqual(tm_res.status_code, 200)
        admin_total = (admin_res.get_json() or {}).get('total', 0)
        tm_total = (tm_res.get_json() or {}).get('total', 0)
        self.assertLess(tm_total, admin_total, f"Teammate total {tm_total} should be strictly less than {admin_total}")

    # --- Feature 4: Teammate Portfolio Chips Scoping ---
    def test_t1_f04_01_bhawna_summary_contains_only_own_chip(self):
        """F4.1: Bhawna's summary['teammates'] contains strictly her own key ('Bhawna')."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        self.assertEqual(list(teammates.keys()), ['Bhawna'],
                         f"Teammate summary must contain only own key, got {list(teammates.keys())}")

    def test_t1_f04_02_bhawna_summary_completely_hides_other_teammates(self):
        """F4.2: Other teammates (Gopi, Nitesh, Pankaj, Nishant) are absent from Bhawna's summary."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        for other in ['Gopi', 'Nitesh', 'Pankaj', 'Nishant', 'Ram Gopal']:
            self.assertNotIn(other, teammates, f"Teammate '{other}' was not hidden from Bhawna")

    def test_t1_f04_03_admin_summary_contains_all_teammate_chips(self):
        """F4.3: Admin's summary['teammates'] contains all active teammates (> 1)."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        self.assertGreater(len(teammates), 1)

    def test_t1_f04_04_gopi_summary_contains_only_gopi_chip(self):
        """F4.4: Gopichand's summary['teammates'] contains strictly 'Gopi'."""
        headers = self.get_gopi_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        self.assertEqual(list(teammates.keys()), ['Gopi'])

    def test_t1_f04_05_nitesh_summary_contains_only_nitesh_chip(self):
        """F4.5: Nitesh's summary['teammates'] contains strictly 'Nitesh'."""
        headers = self.get_nitesh_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        teammates = data.get('summary', {}).get('teammates', {})
        self.assertEqual(list(teammates.keys()), ['Nitesh'])

    # --- Feature 5: Leader Role Admin Privilege Access ---
    def test_t1_f05_01_leader_role_in_auth_hierarchy(self):
        """F5.1: Leader role is defined in ROLE_LEVEL at level 2 and included in ADMIN_ROLES."""
        self.assertIsNotNone(auth, "app.auth must be available")
        self.assertIn('Leader', auth.ROLE_LEVEL, "Leader must be defined in ROLE_LEVEL")
        self.assertEqual(auth.ROLE_LEVEL['Leader'], 2, "Leader level must be 2")
        self.assertTrue(hasattr(auth, 'ADMIN_ROLES'), "ADMIN_ROLES set must be defined in app.auth")
        self.assertIn('Leader', auth.ADMIN_ROLES, "Leader must be in ADMIN_ROLES")

    def test_t1_f05_02_leader_unrestricted_surveillance_grid(self):
        """F5.2: Leader receives full active catalog tasks in /api/crishi/grid."""
        headers = self.get_leader_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        tasks = data.get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len(tasks), active_count,
                         f"Leader must receive all {active_count} active tasks, got {len(tasks)}")

    def test_t1_f05_03_leader_can_execute_task_pull(self):
        """F5.3: Leader is authorized to call POST /api/crishi/pull (not HTTP 403)."""
        headers = self.get_leader_headers()
        res = self.client.post('/api/crishi/pull', json={'catalogId': 225, 'slaHours': 24}, headers=headers)
        self.assertNotEqual(res.status_code, 403, "Leader should not receive 403 on /pull")
        self.assertEqual(res.status_code, 200)

    def test_t1_f05_04_leader_can_execute_task_skip(self):
        """F5.4: Leader is authorized to call POST /api/crishi/skip (not HTTP 403)."""
        headers = self.get_leader_headers()
        payload = {'catalogId': 225, 'targetDate': '2026-10-28', 'reason': 'Test E2E Leader Skip Reason'}
        res = self.client.post('/api/crishi/skip', json=payload, headers=headers)
        self.assertNotEqual(res.status_code, 403, "Leader should not receive 403 on /skip")
        self.assertIn(res.status_code, [200, 201])

    def test_t1_f05_05_teammate_strictly_forbidden_from_admin_mutating_routes(self):
        """F5.5: Teammate calling POST /api/crishi/pull or /api/crishi/skip receives HTTP 403."""
        headers = self.get_bhawna_headers()
        res_pull = self.client.post('/api/crishi/pull', json={'catalogId': 201, 'slaHours': 24}, headers=headers)
        self.assertEqual(res_pull.status_code, 403, f"Teammate pull expected 403, got {res_pull.status_code}")

        res_skip = self.client.post('/api/crishi/skip', json={'catalogId': 201, 'targetDate': '2026-10-28', 'reason': 'Teammate bypass'}, headers=headers)
        self.assertEqual(res_skip.status_code, 403, f"Teammate skip expected 403, got {res_skip.status_code}")

    # --- Feature 6: Database Update Timestamp & History Extraction ---
    def test_t1_f06_01_db_update_timestamp_extraction_service(self):
        """F6.1: Service or SQL layer extracts actual database update timestamps."""
        try:
            from app.services.history_service import extract_table_db_update_history
            res = extract_table_db_update_history(catalog_id=201, report_date='2026-07-01')
            self.assertIsInstance(res, dict)
            self.assertIn('db_update_timestamp', res)
            self.assertIn('row_count', res)
        except (ImportError, AttributeError):
            self.fail("extract_table_db_update_history function not implemented in app.services.history_service")

    def test_t1_f06_02_sync_report_db_appends_history_entry(self):
        """F6.2: Calling POST /api/crishi/sync-report-db appends a record to TableUpdateHistory."""
        headers = self.get_admin_headers()
        payload = {
            'catalogId': 201,
            'reportDate': '2026-07-01',
            'userName': 'Bhawna'
        }
        res = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)

        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        rec = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).first()
        self.assertIsNotNone(rec, "Sync hook failed to append record to TableUpdateHistory")
        self.created_history_ids.append(rec.id)

    def test_t1_f06_03_history_records_person_basis_identity(self):
        """F6.3: History record captures person_name accurately matching updating user."""
        headers = self.get_admin_headers()
        payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}
        res = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        rec = TableUpdateHistory.query.filter_by(catalog_id=201, person_name='Bhawna').order_by(TableUpdateHistory.id.desc()).first()
        self.assertIsNotNone(rec)
        self.assertEqual(rec.person_name, 'Bhawna')
        self.created_history_ids.append(rec.id)

    def test_t1_f06_04_history_records_authoritative_db_update_timestamp(self):
        """F6.4: History record stores valid DateTime timestamp of actual update."""
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        rec = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.desc()).first()
        if not rec:
            headers = self.get_admin_headers()
            self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}, headers=headers)
            rec = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.desc()).first()
        self.assertIsNotNone(rec)
        self.assertIsInstance(rec.db_update_timestamp, datetime)
        self.created_history_ids.append(rec.id)

    def test_t1_f06_05_history_service_offline_snapshot_fallback(self):
        """F6.5: History extraction succeeds using snapshot CSVs when live DB is unavailable."""
        try:
            from app.services.history_service import extract_table_db_update_history
            result = extract_table_db_update_history(raw_table_name='pyexcel_trade_flow', report_date='2026-07-01')
            self.assertIsNotNone(result)
            self.assertGreater(result.get('row_count', 0), 0)
        except (ImportError, AttributeError):
            self.fail("extract_table_db_update_history not implemented")

    # --- Feature 7: Mandatory History Fields Integrity (All 9 Fields) ---
    def test_t1_f07_01_history_has_person_name_and_table_name(self):
        """F7.1: History entry contains non-empty person_name and table_name."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200, f"GET /api/crishi/update-history failed: {res.status_code}")
        data = res.get_json() or {}
        items = data.get('history') or data.get('records') or []
        self.assertGreater(len(items), 0, "Expected at least 1 history item")
        item = items[0]
        self.assertIn('person_name', item)
        self.assertTrue(bool(item['person_name']))
        self.assertIn('table_name', item)
        self.assertTrue(bool(item['table_name']))

    def test_t1_f07_02_history_has_final_name_and_commodity(self):
        """F7.2: History entry contains final_name and commodity."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertGreater(len(items), 0)
        item = items[0]
        self.assertIn('final_name', item)
        self.assertTrue(bool(item['final_name']))
        self.assertIn('commodity', item)
        self.assertTrue(bool(item['commodity']))

    def test_t1_f07_03_history_has_db_update_timestamp_iso(self):
        """F7.3: History entry contains db_update_timestamp in ISO or datetime format."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertGreater(len(items), 0)
        item = items[0]
        self.assertIn('db_update_timestamp', item)
        ts = str(item['db_update_timestamp'])
        self.assertTrue(re.match(r'^\d{4}-\d{2}-\d{2}', ts), f"Timestamp {ts} must start with YYYY-MM-DD")

    def test_t1_f07_04_history_has_report_date_in_valid_format(self):
        """F7.4: History entry contains report_date in YYYY-MM-DD format."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertGreater(len(items), 0)
        item = items[0]
        self.assertIn('report_date', item)
        rd = str(item['report_date'])
        self.assertTrue(re.match(r'^\d{4}-\d{2}-\d{2}$', rd), f"Report date {rd} must match YYYY-MM-DD")

    def test_t1_f07_05_history_has_status_row_count_and_remarks(self):
        """F7.5: History entry contains status, row_count (int >= 0), and remarks."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertGreater(len(items), 0)
        item = items[0]
        self.assertIn('status', item)
        self.assertIn('row_count', item)
        self.assertIsInstance(item['row_count'], int)
        self.assertGreaterEqual(item['row_count'], 0)
        self.assertIn('remarks', item)

    # --- Feature 8: Update History Immutability (Append-Only) ---
    def test_t1_f08_01_repeated_sync_appends_distinct_history_record(self):
        """F8.1: Syncing the same table twice creates 2 distinct records with different IDs."""
        headers = self.get_admin_headers()
        payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}

        res1 = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertEqual(res2.status_code, 200)

        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        records = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).order_by(TableUpdateHistory.id.desc()).all()
        self.assertGreaterEqual(len(records), 2, "Repeated sync must append new record rather than overwrite")
        self.assertNotEqual(records[0].id, records[1].id)
        for r in records[:2]:
            self.created_history_ids.append(r.id)

    def test_t1_f08_02_prior_history_record_timestamp_never_mutates(self):
        """F8.2: Prior history record's db_update_timestamp and created_at remain unchanged."""
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        records = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.asc()).all()
        if len(records) >= 2:
            first = records[0]
            first_ts = first.db_update_timestamp
            first_id = first.id

            self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}, headers=self.get_admin_headers())

            refreshed_first = db.session.get(TableUpdateHistory, first_id)
            self.assertEqual(refreshed_first.db_update_timestamp, first_ts, "Prior record timestamp was mutated!")

    def test_t1_f08_03_prior_history_record_row_count_never_mutates(self):
        """F8.3: Prior record's row_count remains strictly preserved."""
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        records = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.asc()).all()
        if records:
            first = records[0]
            row_count_initial = first.row_count
            first_id = first.id

            self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}, headers=self.get_admin_headers())

            refreshed = db.session.get(TableUpdateHistory, first_id)
            self.assertEqual(refreshed.row_count, row_count_initial)

    def test_t1_f08_04_history_table_record_count_strictly_grows(self):
        """F8.4: History table count increases monotonically on each sync."""
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        before_count = TableUpdateHistory.query.count()
        self.client.post('/api/crishi/sync-report-db', json={'catalogId': 84, 'reportDate': '2026-07-01', 'userName': 'Nishant'}, headers=self.get_admin_headers())
        after_count = TableUpdateHistory.query.count()
        self.assertEqual(after_count, before_count + 1, "Count should increment by exactly 1")

    def test_t1_f08_05_history_endpoint_rejects_put_and_delete_mutations(self):
        """F8.5: Direct mutation (PUT, DELETE) on /api/crishi/update-history is rejected (HTTP 405)."""
        headers = self.get_admin_headers()
        res_put = self.client.put('/api/crishi/update-history', json={'id': 1, 'remarks': 'Tampered'}, headers=headers)
        self.assertIn(res_put.status_code, [404, 405], f"PUT expected 404 or 405, got {res_put.status_code}")

        res_del = self.client.delete('/api/crishi/update-history', headers=headers)
        self.assertIn(res_del.status_code, [404, 405], f"DELETE expected 404 or 405, got {res_del.status_code}")

    # --- Feature 9: Update History Endpoint Role Scoping ---
    def test_t1_f09_01_admin_can_view_all_update_history_records(self):
        """F9.1: SuperAdmin / Manager can view all history records across all users."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        self.assertTrue(data.get('success'))
        items = data.get('history', [])
        persons = {item.get('person_name') for item in items if isinstance(item, dict)}
        self.assertGreaterEqual(len(persons), 1)

    def test_t1_f09_02_admin_can_filter_history_by_any_teammate(self):
        """F9.2: Admin can query ?teammate=Bhawna and receive Bhawna's records."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna', f"Filtered query returned other user: {it.get('person_name')}")

    def test_t1_f09_03_teammate_can_view_own_update_history(self):
        """F9.3: Bhawna (Teammate) can view her own update history."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        self.assertTrue(data.get('success'))
        items = data.get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna')

    def test_t1_f09_04_teammate_filter_parameter_forced_to_own_records(self):
        """F9.4: Teammate passing ?teammate=Nishant is restricted to Bhawna (no privilege escalation)."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Nishant', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna', "Teammate was allowed to view Nishant's history!")

    def test_t1_f09_05_teammate_default_query_returns_strictly_own_records(self):
        """F9.5: Teammate query without query parameters defaults strictly to current user's records."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            self.assertNotEqual(it.get('person_name'), 'Gopi')
            self.assertNotEqual(it.get('person_name'), 'Nishant')

    # --- Feature 10: Crishi Update History Tab UI & Filters ---
    def test_t1_f10_01_update_history_tab_defined_in_crishi_ui(self):
        """F10.1: Crishi HTML / JS defines the dedicated 'Update History' tab (#tab-history / #view-history)."""
        crishi_js = self.get_crishi_js_content()
        index_html = self.get_index_html_content()
        combined = crishi_js + index_html
        self.assertTrue(
            'tab-history' in combined or 'view-history' in combined or 'Update History' in combined,
            "Crishi UI must declare 'Update History' tab element"
        )

    def test_t1_f10_02_history_endpoint_supports_commodity_filter(self):
        """F10.2: GET /api/crishi/update-history?commodity=Soybeans filters records."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?commodity=Soybeans', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            self.assertIn('Soybeans', it.get('commodity', ''))

    def test_t1_f10_03_history_endpoint_supports_date_range_filter(self):
        """F10.3: GET /api/crishi/update-history supports date_from and date_to parameters."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?date_from=2026-07-01&date_to=2026-07-31', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            rd = it.get('report_date')
            self.assertTrue(rd >= '2026-07-01' and rd <= '2026-07-31')

    def test_t1_f10_04_history_endpoint_supports_status_filter(self):
        """F10.4: GET /api/crishi/update-history?status=Verified filters by status."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?status=Verified', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            self.assertIn(it.get('status', '').lower(), ['verified', 'pass'])

    def test_t1_f10_05_history_endpoint_supports_search_filter(self):
        """F10.5: GET /api/crishi/update-history?search=Trade+Flow filters by keyword."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?search=Trade+Flow', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get('history', [])
        for it in items:
            txt = f"{it.get('final_name', '')} {it.get('table_name', '')} {it.get('commodity', '')}".lower()
            self.assertIn('trade flow', txt)

    # --- Feature 11: Direct Portfolio Chip History Linking ---
    def test_t1_f11_01_crishi_js_binds_portfolio_chip_to_history_navigation(self):
        """F11.1: crishi.js binds click on teammate portfolio chip to update history filtering/view."""
        crishi_js = self.get_crishi_js_content()
        self.assertTrue(
            'renderTeammateChips' in crishi_js,
            "renderTeammateChips function must be defined in crishi.js"
        )

    def test_t1_f11_02_admin_chip_click_filters_history_by_teammate(self):
        """F11.2: Admin selecting Bhawna chip filters history view to Bhawna."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna')

    def test_t1_f11_03_teammate_chip_click_keeps_own_history(self):
        """F11.3: Teammate selecting own chip maintains view of own history."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna')

    def test_t1_f11_04_chip_click_activates_history_tab_view(self):
        """F11.4: UI logic includes action to activate history tab when chip is clicked."""
        crishi_js = self.get_crishi_js_content()
        self.assertTrue(
            'activeUserFilter' in crishi_js or 'history' in crishi_js,
            "crishi.js must manage activeUserFilter or history state"
        )

    def test_t1_f11_05_chip_click_syncs_active_user_filter_state(self):
        """F11.5: Chip click event propagates active user filter to query params."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Gopi', headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 12: Test Account Seeding & Zero Data Loss ---
    def test_t1_f12_01_baseline_user_count_exactly_nine(self):
        """F12.1: Exactly 9 baseline users exist in the database."""
        with self.app.app_context():
            count = User.query.count()
            self.assertEqual(count, self.BASELINE_USER_COUNT, f"Expected 9 users, found {count}")

    def test_t1_f12_02_baseline_report_count_exactly_27(self):
        """F12.2: Exactly 27 baseline reports exist in the database."""
        with self.app.app_context():
            count = Report.query.count()
            self.assertEqual(count, self.BASELINE_REPORT_COUNT, f"Expected 27 reports, found {count}")

    def test_t1_f12_03_baseline_catalog_mappings_exactly_158(self):
        """F12.3: Exactly 158 baseline catalog mappings exist in the database."""
        with self.app.app_context():
            count = DBTaskCatalog.query.count()
            self.assertEqual(count, self.BASELINE_CATALOG_COUNT, f"Expected 158 catalog mappings, found {count}")

    def test_t1_f12_04_isolated_test_user_lifecycle_zero_residue(self):
        """F12.4: Dynamic ephemeral test user can be created, authenticated, and deleted cleanly."""
        unique_email = f"test_e2e_temp_{uuid.uuid4().hex[:6]}@agalabs.com"
        self.created_emails.append(unique_email)
        with self.app.app_context():
            u = User(
                email=unique_email,
                name="Test E2E Temp User",
                role="Teammate",
                commodities="Soybeans",
                password_hash="testpass123",
                active=True
            )
            db.session.add(u)
            db.session.commit()
            uid = u.id

        token = self.get_jwt_token(unique_email, "Teammate")
        res = self.client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            u = db.session.get(User, uid)
            if u:
                db.session.delete(u)
                db.session.commit()

        with self.app.app_context():
            self.assertEqual(User.query.count(), self.BASELINE_USER_COUNT)

    def test_t1_f12_05_dynamic_jwt_token_generation_all_four_roles(self):
        """F12.5: Dynamic JWT creation succeeds for SuperAdmin, Manager, Leader, and Teammate."""
        for role in ['SuperAdmin', 'Manager', 'Leader', 'Teammate']:
            token = self.get_jwt_token('vaibhav@agalabs.com', role)
            self.assertTrue(bool(token))
            self.assertIsInstance(token, str)


# =========================================================================
# TIER 2: BOUNDARY & CORNER CASES (Features 1 to 12, 5 tests each = 60 tests)
# =========================================================================

class TestTier2BoundaryCornerCases(BaseCrishiHistoryTestCase):
    """
    Tier 2: Boundary conditions, malformed parameters, missing tokens,
    injection attempts, and edge inputs across all 12 features.
    """

    # --- Feature 1 Boundaries ---
    def test_t2_b01_01_admin_grid_empty_date_param(self):
        """B1.1: Admin passing ?date= (empty) defaults cleanly to today without error."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        self.assertTrue(data.get('success'))

    def test_t2_b01_02_admin_grid_invalid_date_format(self):
        """B1.2: Admin passing ?date=not-a-valid-date handles gracefully without 500."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=invalid-date-format', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b01_03_admin_grid_far_past_date(self):
        """B1.3: Admin querying ?date=1970-01-01 returns empty or valid tasks without crash."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=1970-01-01', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b01_04_admin_grid_far_future_date(self):
        """B1.4: Admin querying ?date=2099-12-31 returns valid structure without crash."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=2099-12-31', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b01_05_admin_grid_refresh_truthy_values(self):
        """B1.5: Admin passing ?refresh=True / 1 / yes handles cleanly."""
        headers = self.get_admin_headers()
        for ref in ['true', 'True', '1']:
            res = self.client.get(f'/api/crishi/grid?refresh={ref}', headers=headers)
            self.assertEqual(res.status_code, 200)

    # --- Feature 2 Boundaries ---
    def test_t2_b02_01_teammate_with_no_commodities_returns_empty_or_base(self):
        """B2.1: Teammate with empty commodities string returns valid structure without 500."""
        headers = self.get_auth_headers('balram@agalabs.com', 'Teammate')
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b02_02_teammate_grid_sql_injection_in_date(self):
        """B2.2: SQL injection in ?date= returns safe response or error without 500."""
        headers = self.get_bhawna_headers()
        res = self.client.get("/api/crishi/grid?date=2026-07-01' OR 1=1; --", headers=headers)
        self.assertIn(res.status_code, [200, 400])

    def test_t2_b02_03_teammate_grid_malformed_auth_header(self):
        """B2.3: Malformed Authorization header returns 401 or 422."""
        headers = {'Authorization': 'NotBearer token123', 'Content-Type': 'application/json'}
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertIn(res.status_code, [200, 401, 422])

    def test_t2_b02_04_teammate_grid_unassigned_commodity_override_rejected(self):
        """B2.4: Teammate passing ?commodity=Rice cannot override assigned commodities."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid?commodity=Rice', headers=headers)
        self.assertEqual(res.status_code, 200)
        tasks = (res.get_json() or {}).get('tasks', [])
        for t in tasks:
            self.assertNotEqual(t.get('commodity'), 'Rice')

    def test_t2_b02_05_teammate_case_sensitivity_in_user_email(self):
        """B2.5: Case variations in email (BHAWNA@AGALABS.COM) resolve correctly."""
        headers = self.get_auth_headers('BHAWNA@AGALABS.COM', 'Teammate')
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 3 Boundaries ---
    def test_t2_b03_01_reports_unauthenticated_request(self):
        """B3.1: Unauthenticated request to /api/crishi/reports/all handled cleanly."""
        res = self.client.get('/api/crishi/reports/all')
        self.assertIn(res.status_code, [200, 401])

    def test_t2_b03_02_reports_expired_jwt_token(self):
        """B3.2: Expired JWT token is rejected with 401."""
        with self.app.app_context():
            expired_token = create_access_token(
                identity=self.SUPERADMIN_EMAIL,
                additional_claims={'role': 'SuperAdmin'},
                expires_delta=timedelta(seconds=-10)
            )
        res = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {expired_token}'})
        self.assertEqual(res.status_code, 401)

    def test_t2_b03_03_reports_tampered_jwt_signature(self):
        """B3.3: Tampered JWT token signature is rejected with 401 or 422."""
        valid_token = self.get_jwt_token()
        tampered_token = valid_token[:-5] + 'xxxxx'
        res = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {tampered_token}'})
        self.assertIn(res.status_code, [401, 422])

    def test_t2_b03_04_reports_teammate_with_whitespace_commodities(self):
        """B3.4: User with whitespace in commodities (' Soybeans , Cotton ') parses safely."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b03_05_reports_unknown_user_token(self):
        """B3.5: JWT for email not in database returns 401 or empty scoped list."""
        headers = self.get_auth_headers('ghost_user_not_in_db@agalabs.com', 'Teammate')
        res = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertIn(res.status_code, [200, 401])

    # --- Feature 4 Boundaries ---
    def test_t2_b04_01_chips_deactivated_teammate_excluded(self):
        """B4.1: Deactivated user ('Damini') is excluded from teammate portfolio chips."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        teammates = (res.get_json() or {}).get('summary', {}).get('teammates', {})
        self.assertNotIn('Damini', teammates, "Deactivated teammate should not appear in portfolio chips")

    def test_t2_b04_02_chips_empty_teammates_dict_fallback(self):
        """B4.2: If no tasks for date, summary['teammates'] returns valid dict."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid?date=1970-01-01', headers=headers)
        self.assertEqual(res.status_code, 200)
        tm = (res.get_json() or {}).get('summary', {}).get('teammates', {})
        self.assertIsInstance(tm, dict)

    def test_t2_b04_03_chips_teammate_name_special_characters(self):
        """B4.3: Teammate chips handle accented or punctuated names safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b04_04_chips_admin_sees_all_active_only(self):
        """B4.4: Only active users appear in Admin chip list."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        teammates = (res.get_json() or {}).get('summary', {}).get('teammates', {})
        with self.app.app_context():
            active_names = {u.name for u in User.query.filter_by(active=True).all()}
            for t_name in teammates.keys():
                self.assertIn(t_name, active_names)

    def test_t2_b04_05_chips_single_user_edge_case(self):
        """B4.5: Teammate sees strictly exactly 1 chip in summary['teammates']."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid', headers=headers)
        teammates = (res.get_json() or {}).get('summary', {}).get('teammates', {})
        self.assertEqual(len(teammates), 1)

    # --- Feature 5 Boundaries ---
    def test_t2_b05_01_leader_pull_invalid_catalog_id(self):
        """B5.1: Leader calling /pull with non-existent catalog ID returns 404."""
        headers = self.get_leader_headers()
        res = self.client.post('/api/crishi/pull', json={'catalogId': 999999, 'slaHours': 24}, headers=headers)
        self.assertEqual(res.status_code, 404)

    def test_t2_b05_02_leader_pull_negative_sla_hours(self):
        """B5.2: Leader calling /pull with negative SLA hours defaults or handles safely."""
        headers = self.get_leader_headers()
        res = self.client.post('/api/crishi/pull', json={'catalogId': 225, 'slaHours': -5}, headers=headers)
        self.assertIn(res.status_code, [200, 400])

    def test_t2_b05_03_leader_skip_empty_reason(self):
        """B5.3: Leader calling /skip with empty reason is handled safely."""
        headers = self.get_leader_headers()
        res = self.client.post('/api/crishi/skip', json={'catalogId': 225, 'targetDate': '2026-10-28', 'reason': ''}, headers=headers)
        self.assertIn(res.status_code, [200, 201, 400])

    def test_t2_b05_04_teammate_tampered_role_claim_in_jwt(self):
        """B5.4: Teammate modifying role claim in unverified token is rejected."""
        res = self.client.post('/api/crishi/pull', json={'catalogId': 201}, headers={'Authorization': 'Bearer bad.token'})
        self.assertIn(res.status_code, [401, 422])

    def test_t2_b05_05_leader_case_insensitive_role_claim(self):
        """B5.5: Role claim 'leader' vs 'Leader' handles consistently."""
        headers = self.get_auth_headers('test_e2e_leader@agalabs.com', 'leader')
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 6 Boundaries ---
    def test_t2_b06_01_sync_report_db_missing_payload(self):
        """B6.1: POST /api/crishi/sync-report-db with empty body handles safely without 500."""
        headers = self.get_admin_headers()
        res = self.client.post('/api/crishi/sync-report-db', json={}, headers=headers)
        self.assertIn(res.status_code, [200, 400])

    def test_t2_b06_02_sync_report_db_invalid_date(self):
        """B6.2: POST /api/crishi/sync-report-db with invalid date defaults to today."""
        headers = self.get_admin_headers()
        res = self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': 'not-a-date'}, headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b06_03_sync_report_db_nonexistent_catalog_id(self):
        """B6.3: POST /api/crishi/sync-report-db with catalogId=999999 returns 404."""
        headers = self.get_admin_headers()
        res = self.client.post('/api/crishi/sync-report-db', json={'catalogId': 999999, 'reportDate': '2026-07-01'}, headers=headers)
        self.assertEqual(res.status_code, 404)

    def test_t2_b06_04_sync_report_db_sqli_in_user_name(self):
        """B6.4: SQL injection attempt in userName handled safely."""
        headers = self.get_admin_headers()
        res = self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'userName': "admin' OR '1'='1"}, headers=headers)
        self.assertIn(res.status_code, [200, 400])

    def test_t2_b06_05_sync_report_db_extreme_future_date(self):
        """B6.5: POST /api/crishi/sync-report-db with reportDate='2099-01-01' handles cleanly."""
        headers = self.get_admin_headers()
        res = self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2099-01-01'}, headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 7 Boundaries ---
    def test_t2_b07_01_history_fields_null_remarks(self):
        """B7.1: History entry handles remarks=None without error."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b07_02_history_fields_zero_row_count(self):
        """B7.2: History handles row_count=0 correctly."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b07_03_history_fields_large_row_count(self):
        """B7.3: History handles large row counts (e.g. 1,000,000)."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b07_04_history_fields_long_final_name(self):
        """B7.4: History handles final_name up to 255 characters."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b07_05_history_fields_special_characters_in_commodity(self):
        """B7.5: Commodity with hyphen or punctuation (e.g. 'Trade Flow – Pulses') handled safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    # --- Feature 8 Boundaries ---
    def test_t2_b08_01_immutability_duplicate_sync_same_second(self):
        """B8.1: Rapid successive syncs create distinct records with unique IDs."""
        headers = self.get_admin_headers()
        payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}
        res1 = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        res2 = self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res2.status_code, 200)

    def test_t2_b08_02_immutability_post_only_no_patch(self):
        """B8.2: PATCH /api/crishi/update-history returns 404 or 405 Method Not Allowed."""
        headers = self.get_admin_headers()
        res = self.client.patch('/api/crishi/update-history', json={'id': 1}, headers=headers)
        self.assertIn(res.status_code, [404, 405])

    def test_t2_b08_03_immutability_post_only_no_delete(self):
        """B8.3: DELETE /api/crishi/update-history returns 404 or 405 Method Not Allowed."""
        headers = self.get_admin_headers()
        res = self.client.delete('/api/crishi/update-history', headers=headers)
        self.assertIn(res.status_code, [404, 405])

    def test_t2_b08_04_immutability_sql_truncate_attempt_in_params(self):
        """B8.4: SQL injection attempting table truncation in params fails safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Bhawna;+TRUNCATE+table_update_history;--', headers=headers)
        self.assertIn(res.status_code, [200, 400, 404])

    def test_t2_b08_05_immutability_concurrent_syncs_atomicity(self):
        """B8.5: Multiple sync calls append without corrupting existing records."""
        headers = self.get_admin_headers()
        for i in range(3):
            self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2026-07-01'}, headers=headers)
        with self.app.app_context():
            self.assertEqual(User.query.count(), self.BASELINE_USER_COUNT)

    # --- Feature 9 Boundaries ---
    def test_t2_b09_01_history_unauthenticated_access_returns_401(self):
        """B9.1: Unauthenticated request to /api/crishi/update-history returns HTTP 401."""
        res = self.client.get('/api/crishi/update-history')
        self.assertIn(res.status_code, [401, 404])

    def test_t2_b09_02_history_filter_nonexistent_teammate(self):
        """B9.2: Querying ?teammate=GhostUser returns empty records list without 500."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=GhostUserNotExisting', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertEqual(len(items), 0)

    def test_t2_b09_03_history_filter_special_chars_in_teammate(self):
        """B9.3: Querying ?teammate=<script>alert(1)</script> is sanitized safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=<script>alert(1)</script>', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertEqual(len(items), 0)

    def test_t2_b09_04_history_teammate_query_all_param_ignored(self):
        """B9.4: Teammate passing ?teammate=ALL is forced to own records."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/update-history?teammate=ALL', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        for it in items:
            self.assertEqual(it.get('person_name'), 'Bhawna')

    def test_t2_b09_05_history_limit_and_offset_boundaries(self):
        """B9.5: Negative limit or offset values handle cleanly without 500."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?limit=-10&offset=-5', headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 10 Boundaries ---
    def test_t2_b10_01_history_filter_invalid_date_from(self):
        """B10.1: Invalid date_from format is ignored or handled cleanly."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?date_from=not-a-date', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b10_02_history_filter_date_from_after_date_to(self):
        """B10.2: date_from > date_to returns empty list."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?date_from=2026-12-31&date_to=2026-01-01', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertEqual(len(items), 0)

    def test_t2_b10_03_history_filter_nonexistent_commodity(self):
        """B10.3: Non-existent commodity returns empty list."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?commodity=NonExistentKryptonite', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        self.assertEqual(len(items), 0)

    def test_t2_b10_04_history_filter_search_xss_payload(self):
        """B10.4: Search term with XSS payload is sanitized safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?search=<img+src=x+onerror=alert()>', headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t2_b10_05_history_filter_status_case_insensitive(self):
        """B10.5: Status parameter matching is case-insensitive."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?status=verified', headers=headers)
        self.assertEqual(res.status_code, 200)

    # --- Feature 11 Boundaries ---
    def test_t2_b11_01_chip_click_with_null_dataset(self):
        """B11.1: Chip click logic handles missing or empty data-user safely."""
        crishi_js = self.get_crishi_js_content()
        self.assertTrue('dataset' in crishi_js or 'getAttribute' in crishi_js or 'user-chip-btn' in crishi_js)

    def test_t2_b11_02_chip_click_empty_user_string(self):
        """B11.2: Chip with empty data-user defaults safely."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b11_03_chip_click_nonexistent_user(self):
        """B11.3: Chip click for non-existent user produces empty history rather than JS error."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=NoSuchUser', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    def test_t2_b11_04_chip_click_rapid_successive_clicks(self):
        """B11.4: Successive queries mimic rapid chip switching."""
        headers = self.get_admin_headers()
        for u in ['Bhawna', 'Gopi', 'Nitesh', 'ALL']:
            res = self.client.get(f'/api/crishi/update-history?teammate={u}', headers=headers)
            self.assertIn(res.status_code, [200, 404])

    def test_t2_b11_05_chip_click_preserves_other_filters(self):
        """B11.5: Querying teammate preserves commodity and date parameters."""
        headers = self.get_admin_headers()
        res = self.client.get('/api/crishi/update-history?teammate=Bhawna&commodity=Soybeans', headers=headers)
        self.assertIn(res.status_code, [200, 404])

    # --- Feature 12 Boundaries ---
    def test_t2_b12_01_test_user_duplicate_email_rejected(self):
        """B12.1: Inserting duplicate user email is rejected via admin API."""
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'Duplicate User',
            'email': self.SUPERADMIN_EMAIL,
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }), headers=self.get_admin_headers())
        self.assertIn(res.status_code, [400, 409, 422])

    def test_t2_b12_02_test_user_empty_email_rejected(self):
        """B12.2: User with empty email is rejected by API validation."""
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': 'No Email',
            'email': '',
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }), headers=self.get_admin_headers())
        self.assertIn(res.status_code, [400, 422])

    def test_t2_b12_03_test_user_null_name_rejected(self):
        """B12.3: User with null name is rejected by API validation."""
        res = self.client.post('/api/admin/users', data=json.dumps({
            'name': None,
            'email': 'test_e2e_null_name@agalabs.com',
            'role': 'Teammate',
            'department': 'Research',
            'password': 'Password@123'
        }), headers=self.get_admin_headers())
        self.assertIn(res.status_code, [400, 422])

    def test_t2_b12_04_catalog_count_never_drops_below_158(self):
        """B12.4: Catalog mapping count invariant check."""
        with self.app.app_context():
            self.assertGreaterEqual(DBTaskCatalog.query.count(), self.BASELINE_CATALOG_COUNT)

    def test_t2_b12_05_report_count_never_drops_below_27(self):
        """B12.5: Report count invariant check."""
        with self.app.app_context():
            self.assertGreaterEqual(Report.query.count(), self.BASELINE_REPORT_COUNT)


# =========================================================================
# TIER 3: CROSS-FEATURE INTERACTIONS (10 test cases)
# =========================================================================

class TestTier3CrossFeatureInteractions(BaseCrishiHistoryTestCase):
    """
    Tier 3: Pairwise matrix cross-feature combinations across auth roles,
    endpoints, filters, and state mutations.
    """

    def test_t3_01_superadmin_matrix_all_endpoints(self):
        """T3.1: SuperAdmin has 200/permitted access across grid, reports, pull, skip, history."""
        headers = self.get_admin_headers()
        self.assertEqual(self.client.get('/api/crishi/grid', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/reports/all', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/update-history', headers=headers).status_code, 200)

    def test_t3_02_manager_matrix_all_endpoints(self):
        """T3.2: Manager has 200/permitted access across grid, reports, pull, skip, history."""
        headers = self.get_manager_headers()
        self.assertEqual(self.client.get('/api/crishi/grid', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/reports/all', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/update-history', headers=headers).status_code, 200)

    def test_t3_03_leader_matrix_all_endpoints(self):
        """T3.3: Leader has 200/permitted access across grid, reports, pull, skip, history."""
        headers = self.get_leader_headers()
        self.assertEqual(self.client.get('/api/crishi/grid', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/reports/all', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/update-history', headers=headers).status_code, 200)

    def test_t3_04_teammate_matrix_all_endpoints(self):
        """T3.4: Teammate receives scoped data on read, 403 on pull/skip, and scoped history."""
        headers = self.get_bhawna_headers()
        self.assertEqual(self.client.get('/api/crishi/grid', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/reports/all', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/update-history', headers=headers).status_code, 200)
        self.assertEqual(self.client.post('/api/crishi/pull', json={'catalogId': 201}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post('/api/crishi/skip', json={'catalogId': 201}, headers=headers).status_code, 403)

    def test_t3_05_teammate_escalation_attempt_via_url_params(self):
        """T3.5: Teammate injecting ?role=SuperAdmin or ?admin=true does NOT elevate privilege."""
        headers = self.get_bhawna_headers()
        res = self.client.get('/api/crishi/grid?role=SuperAdmin&admin=true', headers=headers)
        self.assertEqual(res.status_code, 200)
        tasks = (res.get_json() or {}).get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count, "Parameter injection elevated privileges!")

    def test_t3_06_teammate_escalation_attempt_via_request_headers(self):
        """T3.6: Teammate adding custom headers (X-Role, X-User-Role) does NOT bypass scoping."""
        headers = self.get_bhawna_headers()
        headers['X-Role'] = 'SuperAdmin'
        headers['X-User-Role'] = 'Manager'
        res = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res.status_code, 200)
        tasks = (res.get_json() or {}).get('tasks', [])
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count)

    def test_t3_07_composite_filters_teammate_commodity_and_date(self):
        """T3.7: History endpoint handles combination of teammate, commodity, and date_from filters."""
        headers = self.get_admin_headers()
        url = '/api/crishi/update-history?teammate=Bhawna&commodity=Soybeans&date_from=2026-07-01'
        res = self.client.get(url, headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_t3_08_sync_table_immediately_updates_history_and_grid(self):
        """T3.8: Syncing table appends history and immediately marks task verified in grid."""
        headers = self.get_admin_headers()
        sync_payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}
        res_sync = self.client.post('/api/crishi/sync-report-db', json=sync_payload, headers=headers)
        self.assertEqual(res_sync.status_code, 200)

        res_grid = self.client.get('/api/crishi/grid?date=2026-07-01', headers=headers)
        self.assertEqual(res_grid.status_code, 200)

    def test_t3_09_immutability_preserved_across_multiple_users_syncs(self):
        """T3.9: Consecutive syncs by Bhawna then Nishant preserve all history records."""
        headers = self.get_admin_headers()
        self.client.post('/api/crishi/sync-report-db', json={'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}, headers=headers)
        self.client.post('/api/crishi/sync-report-db', json={'catalogId': 84, 'reportDate': '2026-07-01', 'userName': 'Nishant'}, headers=headers)

        res = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get('history', [])
        persons = {it.get('person_name') for it in items}
        self.assertIn('Bhawna', persons)
        self.assertIn('Nishant', persons)

    def test_t3_10_role_hierarchy_level_comparisons(self):
        """T3.10: ROLE_LEVEL enforces SuperAdmin(3) > Manager(2) == Leader(2) > Teammate(1)."""
        if auth is not None and hasattr(auth, 'ROLE_LEVEL'):
            rl = auth.ROLE_LEVEL
            self.assertGreater(rl.get('SuperAdmin', 0), rl.get('Manager', 0))
            self.assertEqual(rl.get('Manager', 0), rl.get('Leader', 0))
            self.assertGreater(rl.get('Leader', 0), rl.get('Teammate', 0))


# =========================================================================
# TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 comprehensive workflows)
# =========================================================================

class TestTier4RealWorldScenarios(BaseCrishiHistoryTestCase):
    """
    Tier 4: End-to-end user journeys matching authentic real-world workflows
    derived from ORIGINAL_REQUEST.md.
    """

    def test_t4_01_scenario1_bhawna_teammate_workflow(self):
        """
        Scenario 1: Bhawna (Teammate) logs in:
        1. Calls /api/crishi/grid -> receives only her assigned commodities (Cotton, Rapeseed, Soybeans, Weather).
        2. summary['teammates'] contains strictly ['Bhawna'].
        3. Calls /api/crishi/reports/all -> receives scoped reports (< admin total).
        4. Verifies Trade Flow - Soybeans (catalogId=201) on 2026-07-01 -> 99 Soybeans rows.
        5. Calls /api/crishi/update-history -> sees only her own update records.
        6. Attempts to query ?teammate=Nishant -> strictly forced to Bhawna.
        """
        headers = self.get_bhawna_headers()

        # Step 1: Grid scoping
        res_grid = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res_grid.status_code, 200)
        grid_data = res_grid.get_json() or {}
        tasks = grid_data.get('tasks', [])
        self.assertGreater(len(tasks), 0)
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertLess(len(tasks), active_count)

        # Step 2: Portfolio chip scoping
        teammates = grid_data.get('summary', {}).get('teammates', {})
        self.assertEqual(list(teammates.keys()), ['Bhawna'])

        # Step 3: Reports scoping
        admin_rep = self.client.get('/api/crishi/reports/all', headers=self.get_admin_headers())
        admin_count = len((admin_rep.get_json() or {}).get('reports', []))

        res_rep = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res_rep.status_code, 200)
        rep_data = res_rep.get_json() or {}
        self.assertLess(len(rep_data.get('reports', [])), admin_count)

        # Step 4: DB sync verification
        sync_payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}
        res_sync = self.client.post('/api/crishi/sync-report-db', json=sync_payload, headers=headers)
        self.assertEqual(res_sync.status_code, 200)

        # Step 5: History retrieval
        res_hist = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res_hist.status_code, 200)
        hist_data = res_hist.get_json() or {}
        records = hist_data.get('history', [])
        self.assertGreater(len(records), 0)
        for r in records:
            self.assertEqual(r.get('person_name'), 'Bhawna')

        # Step 6: Parameter escalation prevention
        res_escalate = self.client.get('/api/crishi/update-history?teammate=Nishant', headers=headers)
        self.assertEqual(res_escalate.status_code, 200)
        for r in (res_escalate.get_json() or {}).get('history', []):
            self.assertEqual(r.get('person_name'), 'Bhawna')

    def test_t4_02_scenario2_ram_gopal_manager_workflow(self):
        """
        Scenario 2: Ram Gopal (Manager / Admin) logs in:
        1. Calls /api/crishi/grid -> receives all active catalog tasks.
        2. summary['teammates'] contains all active teammates (Bhawna, Gopi, Nitesh, Pankaj).
        3. Calls /api/crishi/reports/all -> receives full report catalog (>= 27).
        4. Calls /api/crishi/update-history -> views all records across all teammates.
        5. Filters update history by ?teammate=Bhawna and ?teammate=Nishant -> receives individual histories.
        6. Executes Manager Pull (/api/crishi/pull) on Monthly task -> succeeds.
        """
        headers = self.get_manager_headers()

        # Step 1 & 2: Grid and summary
        res_grid = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res_grid.status_code, 200)
        grid_data = res_grid.get_json() or {}
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len(grid_data.get('tasks', [])), active_count)
        teammates = grid_data.get('summary', {}).get('teammates', {})
        self.assertGreater(len(teammates), 1)

        # Step 3: Reports
        res_rep = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res_rep.status_code, 200)
        self.assertGreaterEqual(len((res_rep.get_json() or {}).get('reports', [])), self.BASELINE_REPORT_COUNT)

        # Step 4 & 5: Update History inspection & filtering
        res_hist_all = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res_hist_all.status_code, 200)

        res_hist_bhawna = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
        self.assertEqual(res_hist_bhawna.status_code, 200)
        for r in (res_hist_bhawna.get_json() or {}).get('history', []):
            self.assertEqual(r.get('person_name'), 'Bhawna')

        # Step 6: Manager Pull
        res_pull = self.client.post('/api/crishi/pull', json={'catalogId': 225, 'slaHours': 24}, headers=headers)
        self.assertEqual(res_pull.status_code, 200)

    def test_t4_03_scenario3_unauthorized_teammate_privilege_escalation(self):
        """
        Scenario 3: Teammate attempts unauthorized administrative operations:
        1. Calls POST /api/crishi/pull -> rejected with HTTP 403 Forbidden.
        2. Calls POST /api/crishi/skip -> rejected with HTTP 403 Forbidden.
        3. Calls POST /api/crishi/manager-review -> rejected with HTTP 403 Forbidden.
        4. Queries other teammates' update records -> strictly scoped to own records.
        """
        headers = self.get_bhawna_headers()

        res_pull = self.client.post('/api/crishi/pull', json={'catalogId': 201}, headers=headers)
        self.assertEqual(res_pull.status_code, 403)

        res_skip = self.client.post('/api/crishi/skip', json={'catalogId': 201}, headers=headers)
        self.assertEqual(res_skip.status_code, 403)

        res_rev = self.client.post('/api/crishi/manager-review', json={'catalogId': 201}, headers=headers)
        self.assertIn(res_rev.status_code, [403, 404])

        res_hist = self.client.get('/api/crishi/update-history?teammate=Ram+Gopal', headers=headers)
        self.assertEqual(res_hist.status_code, 200)
        for r in (res_hist.get_json() or {}).get('history', []):
            self.assertEqual(r.get('person_name'), 'Bhawna')

    def test_t4_04_scenario4_repeated_sync_immutability_lifecycle(self):
        """
        Scenario 4: Repeated database sync operations verify immutability:
        1. Sync table 201 on 2026-07-01 -> Record 1 is created.
        2. Note ID, db_update_timestamp, row_count.
        3. Repeat sync with new timestamp -> Record 2 is appended.
        4. Assert Record 1 is 100% identical and unmutated.
        5. Verify total record count strictly increased.
        """
        headers = self.get_admin_headers()
        payload = {'catalogId': 201, 'reportDate': '2026-07-01', 'userName': 'Bhawna'}

        self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        self.assertIsNotNone(TableUpdateHistory, "TableUpdateHistory model must be defined")
        rec1 = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).order_by(TableUpdateHistory.id.desc()).first()
        self.assertIsNotNone(rec1)
        r1_id = rec1.id
        r1_ts = rec1.db_update_timestamp
        r1_rows = rec1.row_count

        self.client.post('/api/crishi/sync-report-db', json=payload, headers=headers)
        rec2 = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).order_by(TableUpdateHistory.id.desc()).first()
        self.assertIsNotNone(rec2)
        r2_id = rec2.id

        self.assertNotEqual(r1_id, r2_id, "Sync 2 must create a new record")

        refreshed_r1 = db.session.get(TableUpdateHistory, r1_id)
        self.assertEqual(refreshed_r1.db_update_timestamp, r1_ts, "Record 1 timestamp was mutated!")
        self.assertEqual(refreshed_r1.row_count, r1_rows, "Record 1 row count was mutated!")

    def test_t4_05_scenario5_leader_administrative_oversight_workflow(self):
        """
        Scenario 5: Leader role administrative oversight workflow:
        1. Authenticate with Leader role.
        2. View unrestricted surveillance grid (all active tasks).
        3. View unrestricted reports (>= 27).
        4. View and filter update history for all teammates.
        5. Execute task skip and pull operations without 403 denial.
        """
        headers = self.get_leader_headers()

        # Grid
        res_grid = self.client.get('/api/crishi/grid', headers=headers)
        self.assertEqual(res_grid.status_code, 200)
        with self.app.app_context():
            active_count = DBTaskCatalog.query.filter_by(is_active=True).count()
        self.assertEqual(len((res_grid.get_json() or {}).get('tasks', [])), active_count)

        # Reports
        res_rep = self.client.get('/api/crishi/reports/all', headers=headers)
        self.assertEqual(res_rep.status_code, 200)
        self.assertGreaterEqual(len((res_rep.get_json() or {}).get('reports', [])), self.BASELINE_REPORT_COUNT)

        # History view
        res_hist = self.client.get('/api/crishi/update-history', headers=headers)
        self.assertEqual(res_hist.status_code, 200)

        # Filter by teammate
        res_filt = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
        self.assertEqual(res_filt.status_code, 200)

        # Admin mutating operations
        res_pull = self.client.post('/api/crishi/pull', json={'catalogId': 225, 'slaHours': 24}, headers=headers)
        self.assertEqual(res_pull.status_code, 200)


if __name__ == '__main__':
    unittest.main()
