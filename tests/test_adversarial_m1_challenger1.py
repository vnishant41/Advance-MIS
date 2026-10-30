"""
Adversarial Empirical Challenge Test Suite for Milestone 1:
Backend Role Scoping & Auth Hierarchy (R1)

Author: challenger_m1_1 (Empirical Challenger)
Target:
  1. Role escalation attacks on mutating administrative endpoints:
     - /api/crishi/pull
     - /api/crishi/skip
     - /api/crishi/manager-review
     - /api/crishi/source
     - /api/crishi/roster/apply-week
     with forged roles, mixed casing ('tEAmMaTe', 'user'), empty roles, None, unknown roles,
     and forged claims for existing Teammates.
  2. Cross-user data leakage and isolation on GET /api/crishi/grid across all teammates:
     - bhawna@agalabs.com
     - gopichand@agalabs.com
     - pankaj@agalabs.com
     - nitesh@agalabs.com
  3. Report scoping validation on GET /api/crishi/reports/all:
     - ensure unassigned commodities never leak.
  4. Leader role unrestricted parity with SuperAdmin and Manager across all endpoints.
  5. Baseline database invariant verification:
     - 9 users, 27 reports, 158 catalog items undamaged.
"""

import unittest
from datetime import date, datetime, timezone
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.auth import is_admin_role, role_at_least, ROLE_LEVEL, ADMIN_ROLES
from app.models import (
    User, Report, DBTaskCatalog, ManagerTaskPull, TaskSkip, DBTaskVerification, AppSetting
)


class TestAdversarialMilestone1Challenger1(unittest.TestCase):
    """Adversarial stress and penetration tests for Milestone 1 Backend Role Scoping."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            # Snapshot baseline invariants
            cls.baseline_users = [(u.id, u.email, u.name, u.role) for u in User.query.order_by(User.id).all()]
            cls.baseline_reports = [(r.id, r.commodity, r.name) for r in Report.query.order_by(Report.id).all()]
            cls.baseline_catalog = [(c.id, c.final_name, c.user_name, c.commodity) for c in DBTaskCatalog.query.order_by(DBTaskCatalog.id).all()]

            cls.user_count = len(cls.baseline_users)
            cls.report_count = len(cls.baseline_reports)
            cls.catalog_count = len(cls.baseline_catalog)

            cls.first_catalog_id = cls.baseline_catalog[0][0]

    def setUp(self):
        self.app_ctx = self.app.app_context()
        self.app_ctx.push()

    def tearDown(self):
        # Clean up any transient pull/skip/verification records created during tests
        try:
            ManagerTaskPull.query.filter(ManagerTaskPull.pulled_by.like('%adversarial%')).delete(synchronize_session=False)
            ManagerTaskPull.query.filter(ManagerTaskPull.pulled_by.like('%leader%')).delete(synchronize_session=False)
            TaskSkip.query.filter(TaskSkip.reason.like('%Adversarial%')).delete(synchronize_session=False)
            DBTaskVerification.query.filter(DBTaskVerification.reviewer_name.like('%Leader%')).delete(synchronize_session=False)
            db.session.commit()
        except Exception:
            db.session.rollback()
        self.app_ctx.pop()

    # ------------------------------------------------------------------------
    # 1. ROLE ESCALATION TESTS
    # ------------------------------------------------------------------------

    def test_01_is_admin_role_rejection_of_forged_and_invalid_inputs(self):
        """Adversarial evaluation of is_admin_role helper on diverse forged inputs."""
        # Non-admin or forged roles must all evaluate to False
        invalid_roles = [
            None,
            "",
            " ",
            "   ",
            123,
            {},
            [],
            "Teammate",
            "teammate",
            "tEAmMaTe",
            "TEAMMATE",
            "user",
            "User",
            "USER",
            "Guest",
            "guest",
            "Analyst",
            "analyst",
            "Viewer",
            "viewer",
            "admin",            # only exact ADMIN_ROLES allowed: SuperAdmin, Manager, Leader
            "ADMIN",
            "ADMINISTRATOR",
            "administrator",
            "root",
            "ROOT",
            "super_admin",
            "superadmin_fake",
            "SuperAdmin; DROP TABLE users;",
            "Leader\x00",
            "Manager OR 1=1",
            "Inactive",
            "operator",
            "member"
        ]
        for role in invalid_roles:
            with self.subTest(role=role):
                self.assertFalse(
                    is_admin_role(role),
                    f"is_admin_role('{role}') unexpectedly returned True! Role escalation flaw."
                )

        # Valid admin roles must evaluate to True
        valid_roles = [
            "SuperAdmin", "superadmin", "SUPERADMIN", " SuperAdmin ",
            "Manager", "manager", "MANAGER", " Manager ",
            "Leader", "leader", "LEADER", " Leader "
        ]
        for role in valid_roles:
            with self.subTest(role=role):
                self.assertTrue(
                    is_admin_role(role),
                    f"is_admin_role('{role}') returned False for a valid admin role!"
                )

    def test_02_role_hierarchy_level_and_at_least(self):
        """Verify ROLE_LEVEL structure and test role_at_least behavior."""
        self.assertIn('Leader', ROLE_LEVEL)
        self.assertEqual(ROLE_LEVEL['Leader'], 2)
        self.assertEqual(ROLE_LEVEL['Manager'], 2)
        self.assertEqual(ROLE_LEVEL['SuperAdmin'], 3)
        self.assertEqual(ROLE_LEVEL['Teammate'], 1)

        # Leader satisfies Manager and Teammate requirement
        self.assertTrue(role_at_least('Leader', 'Manager'))
        self.assertTrue(role_at_least('Leader', 'Leader'))
        self.assertTrue(role_at_least('Leader', 'Teammate'))

        # Teammate fails Manager/Leader/SuperAdmin requirement
        self.assertFalse(role_at_least('Teammate', 'Manager'))
        self.assertFalse(role_at_least('Teammate', 'Leader'))
        self.assertFalse(role_at_least('Teammate', 'SuperAdmin'))
        self.assertTrue(role_at_least('Teammate', 'Teammate'))

        # Forged/unknown roles fail
        for fake in ['user', 'tEAmMaTe', '', None, 'Guest']:
            self.assertFalse(role_at_least(fake, 'Teammate'))
            self.assertFalse(role_at_least(fake, 'Manager'))

    def test_02b_vulnerability_role_at_least_superadmin_flattening(self):
        """
        EMPIRICAL VULNERABILITY PROBE:
        In app/auth.py lines 28-31:
            if min_role in ADMIN_ROLES and is_admin_role(user_role):
                return True
        Because 'SuperAdmin' is in ADMIN_ROLES, this causes role_at_least('Leader', 'SuperAdmin')
        and role_at_least('Manager', 'SuperAdmin') to return True.
        This collapses Level 3 (SuperAdmin) down to Level 2 (Manager/Leader).
        """
        is_leader_superadmin = role_at_least('Leader', 'SuperAdmin')
        is_manager_superadmin = role_at_least('Manager', 'SuperAdmin')
        # We record this empirical finding:
        # Both evaluate to True due to min_role in ADMIN_ROLES check
        self.assertTrue(
            is_leader_superadmin and is_manager_superadmin,
            "Confirmed: role_at_least flattens SuperAdmin checks for any admin role"
        )

    def test_03_mutating_admin_endpoints_escalation_attacks(self):
        """
        Attempt privilege escalation on all 5 mutating administrative endpoints:
          - POST /api/crishi/pull
          - POST /api/crishi/skip
          - POST /api/crishi/manager-review
          - PUT  /api/crishi/source
          - POST /api/crishi/roster/apply-week
        Testing: unauthenticated, invalid token, forged non-admin claims.
        All must be rejected with HTTP 401 or 403 (never 200).
        """
        endpoints = [
            ('POST', '/api/crishi/pull', {'catalogId': self.first_catalog_id, 'slaHours': 24}),
            ('POST', '/api/crishi/skip', {'catalogId': self.first_catalog_id, 'targetDate': '2026-10-28', 'reason': 'Adversarial Test Skip'}),
            ('POST', '/api/crishi/manager-review', {'catalogId': self.first_catalog_id, 'action': 'VERIFIED', 'customMessage': 'Adversarial review'}),
            ('PUT',  '/api/crishi/source', {'catalogId': self.first_catalog_id, 'sourceName': 'Test Source'}),
            ('POST', '/api/crishi/roster/apply-week', {'week': 1}),
        ]

        def call_endpoint(method, url, payload, headers=None):
            h = headers or {}
            if method == 'POST':
                return self.client.post(url, json=payload, headers=h)
            elif method == 'PUT':
                return self.client.put(url, json=payload, headers=h)
            raise ValueError(method)

        for method, url, payload in endpoints:
            # 1. Missing Authorization header -> 401
            res = call_endpoint(method, url, payload, headers={})
            self.assertEqual(res.status_code, 401, f"{method} {url} without auth must return 401, got {res.status_code}")

            # 2. Invalid bearer token -> 401 or 422
            res = call_endpoint(method, url, payload, headers={'Authorization': 'Bearer junk.token.payload'})
            self.assertIn(res.status_code, [401, 422], f"{method} {url} with junk token must return 401/422, got {res.status_code}")

            # 3. Forged non-admin roles in ephemeral tokens
            forged_claims_tests = [
                ('Teammate', 'test_adv_teammate@agalabs.com'),
                ('teammate', 'test_adv_teammate_lower@agalabs.com'),
                ('tEAmMaTe', 'test_adv_teammate_mixed@agalabs.com'),
                ('user', 'test_adv_user@agalabs.com'),
                ('', 'test_adv_empty@agalabs.com'),
                (None, 'test_adv_none@agalabs.com'),
                ('Guest', 'test_adv_guest@agalabs.com'),
                ('Analyst', 'test_adv_analyst@agalabs.com'),
                ('Viewer', 'test_adv_viewer@agalabs.com'),
                ('ADMINISTRATOR', 'test_adv_admin_pseudo@agalabs.com'),
                ('root', 'test_adv_root@agalabs.com'),
            ]

            for fake_role, fake_email in forged_claims_tests:
                claims = {'role': fake_role} if fake_role is not None else {}
                token = create_access_token(identity=fake_email, additional_claims=claims)
                headers = {'Authorization': f'Bearer {token}'}
                res = call_endpoint(method, url, payload, headers=headers)
                self.assertIn(
                    res.status_code, [401, 403],
                    f"Privilege escalation vulnerability! {method} {url} allowed role='{fake_role}', got HTTP {res.status_code}"
                )
                self.assertNotEqual(res.status_code, 200)

    def test_04_existing_teammate_forged_admin_claim_prevented_by_db_role(self):
        """
        Adversarial scenario: A registered database Teammate (bhawna@agalabs.com) crafts
        a JWT token with additional_claims={'role': 'SuperAdmin'}.
        The backend MUST check her authoritative database role (Teammate) and deny access with HTTP 403.
        """
        forged_admin_token = create_access_token(
            identity='bhawna@agalabs.com',
            additional_claims={'role': 'SuperAdmin'}
        )
        headers = {'Authorization': f'Bearer {forged_admin_token}'}

        endpoints = [
            ('POST', '/api/crishi/pull', {'catalogId': self.first_catalog_id, 'slaHours': 24}),
            ('POST', '/api/crishi/skip', {'catalogId': self.first_catalog_id, 'targetDate': '2026-10-28', 'reason': 'Adversarial Forged SuperAdmin'}),
            ('POST', '/api/crishi/manager-review', {'catalogId': self.first_catalog_id, 'action': 'VERIFIED'}),
            ('PUT',  '/api/crishi/source', {'catalogId': self.first_catalog_id, 'sourceName': 'Hacked Source'}),
            ('POST', '/api/crishi/roster/apply-week', {'week': 1}),
        ]

        for method, url, payload in endpoints:
            if method == 'POST':
                res = self.client.post(url, json=payload, headers=headers)
            else:
                res = self.client.put(url, json=payload, headers=headers)

            self.assertEqual(
                res.status_code, 403,
                f"Security breach! DB Teammate forged SuperAdmin claim and bypassed {method} {url} with status {res.status_code}"
            )

    def test_05_vulnerability_inactive_and_arbitrary_email_claim_escalation(self):
        """
        EMPIRICAL VULNERABILITY PROBE:
        In app/auth.py lines 76-88:
            user = User.query.filter_by(email=email, active=True).first()
            if not user:
                claims = get_jwt()
                if claims and 'role' in claims:
                    user = User(email=email, role=claims.get('role', 'Teammate'), active=True)
        This has two critical security consequences:
          1. Deactivated users (damini@agalabs.com, active=False) who claim 'SuperAdmin'
             have User.query.filter_by(active=True) return None, which triggers the fallback,
             re-activating them as active=True with role='SuperAdmin'!
          2. Any arbitrary unregistered email (e.g. attacker@evil.com) with a token
             claiming role='SuperAdmin' is accepted as a valid SuperAdmin!
        """
        # Test 1: Deactivated DB user damini@agalabs.com
        damini_token = create_access_token(identity='damini@agalabs.com', additional_claims={'role': 'SuperAdmin'})
        res_damini = self.client.post(
            '/api/crishi/pull',
            json={'catalogId': self.first_catalog_id, 'slaHours': 24},
            headers={'Authorization': f'Bearer {damini_token}'}
        )
        damini_bypassed = (res_damini.status_code == 200)

        # Test 2: Arbitrary unregistered email
        hacker_token = create_access_token(identity='attacker@evil.com', additional_claims={'role': 'SuperAdmin'})
        res_hacker = self.client.post(
            '/api/crishi/pull',
            json={'catalogId': self.first_catalog_id, 'slaHours': 24},
            headers={'Authorization': f'Bearer {hacker_token}'}
        )
        hacker_bypassed = (res_hacker.status_code == 200)

        # Assert that both bypasses occurred empirically (confirming the vulnerability)
        self.assertTrue(
            damini_bypassed and hacker_bypassed,
            "Confirmed: get_current_user() fallback permits inactive accounts and arbitrary emails to escalate to SuperAdmin"
        )

    # ------------------------------------------------------------------------
    # 2. DATA LEAKAGE VERIFICATION ON GET /api/crishi/grid
    # ------------------------------------------------------------------------

    def test_06_surveillance_grid_summary_teammates_isolation(self):
        """
        Query GET /api/crishi/grid for each teammate and assert:
          - Only the logged-in teammate's name appears in summary['teammates'].
          - Zero other teammates appear anywhere in summary['teammates'].
        """
        teammate_configs = [
            ('bhawna@agalabs.com', 'Bhawna'),
            ('gopichand@agalabs.com', 'Gopi'),
            ('pankaj@agalabs.com', 'Pankaj'),
            ('nitesh@agalabs.com', 'Nitesh'),
        ]

        all_system_teammates = {'Bhawna', 'Gopi', 'Pankaj', 'Nitesh', 'Nishant', 'Ram Gopal', 'Balram', 'Vaibhav'}

        for email, expected_name in teammate_configs:
            token = create_access_token(identity=email)
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)

            data = res.get_json()
            summary = data.get('summary', {})
            teammates_dict = summary.get('teammates', {})

            # 1. Must contain ONLY the user's key
            keys = list(teammates_dict.keys())
            self.assertEqual(
                keys, [expected_name],
                f"Data leakage for {email}! summary['teammates'] contains keys {keys}, expected strictly [{expected_name}]"
            )

            # 2. Check string serialization of summary['teammates'] for any other teammate names
            serialized = str(teammates_dict)
            forbidden_names = all_system_teammates - {expected_name}
            for forbidden in forbidden_names:
                self.assertNotIn(
                    f"'{forbidden}'", serialized,
                    f"Teammate name leakage! '{forbidden}' found in summary['teammates'] for {email}"
                )

    def test_07_surveillance_grid_tasks_cross_user_leakage(self):
        """
        Query GET /api/crishi/grid for all teammates and assert that tasks exclusively
        assigned to one teammate never leak into another teammate's grid.
        """
        teammate_emails = [
            'bhawna@agalabs.com',
            'gopichand@agalabs.com',
            'pankaj@agalabs.com',
            'nitesh@agalabs.com'
        ]

        grids = {}
        for email in teammate_emails:
            token = create_access_token(identity=email)
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            grids[email] = data.get('tasks', [])

        # Build mapping of catalog_id to user_name from the active catalog
        catalog_map = {c.id: (c.user_name or '').strip() for c in DBTaskCatalog.query.all()}

        # Bhawna: check that strictly Gopi-only, Nitesh-only, Pankaj-only tasks never appear
        for t in grids['bhawna@agalabs.com']:
            u_name = (t.get('user_name') or t.get('user') or '').strip().lower()
            comms = (t.get('commodity') or '').strip().lower()
            # If a task is solely assigned to Gopi (Rice/Wheat) and has no weather duty
            if u_name == 'gopi' and 'weather' not in comms and 'weather' not in (t.get('final_name') or '').lower():
                self.fail(f"Task leakage to Bhawna: {t.get('final_name')} assigned to Gopi leaked into Bhawna's grid!")
            if u_name == 'nitesh' and 'weather' not in comms and 'weather' not in (t.get('final_name') or '').lower():
                self.fail(f"Task leakage to Bhawna: {t.get('final_name')} assigned to Nitesh leaked into Bhawna's grid!")

        # Gopichand: check that Bhawna-only, Nitesh-only, Pankaj-only tasks never appear
        for t in grids['gopichand@agalabs.com']:
            u_name = (t.get('user_name') or t.get('user') or '').strip().lower()
            if u_name == 'bhawna':
                self.fail(f"Task leakage to Gopi: {t.get('final_name')} assigned to Bhawna leaked into Gopi's grid!")
            if u_name == 'nitesh':
                self.fail(f"Task leakage to Gopi: {t.get('final_name')} assigned to Nitesh leaked into Gopi's grid!")
            if u_name == 'pankaj':
                self.fail(f"Task leakage to Gopi: {t.get('final_name')} assigned to Pankaj leaked into Gopi's grid!")

        # Nitesh: check that Bhawna-only, Gopi-only, Pankaj-only tasks never appear
        for t in grids['nitesh@agalabs.com']:
            u_name = (t.get('user_name') or t.get('user') or '').strip().lower()
            if u_name == 'bhawna':
                self.fail(f"Task leakage to Nitesh: {t.get('final_name')} assigned to Bhawna leaked into Nitesh's grid!")
            if u_name == 'gopi':
                self.fail(f"Task leakage to Nitesh: {t.get('final_name')} assigned to Gopi leaked into Nitesh's grid!")

    def test_08_surveillance_grid_commodity_rollups_isolation(self):
        """
        Verify that Teammates only receive commodity rollups matching their assigned commodities.
        """
        # Bhawna: Cotton, Rapeseed, Soybeans, Weather
        token_bhawna = create_access_token(identity='bhawna@agalabs.com')
        res_bhawna = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token_bhawna}'})
        rollups_bhawna = res_bhawna.get_json().get('commodity_rollups', [])
        comms_bhawna = [r['commodity'].lower() for r in rollups_bhawna]
        for c in comms_bhawna:
            self.assertTrue(
                any(allowed in c for allowed in ['cotton', 'rapeseed', 'soybean', 'weather', 'rainfall']),
                f"Commodity rollup leakage for Bhawna: unexpected commodity rollup '{c}'"
            )
        self.assertNotIn('rice', comms_bhawna)
        self.assertNotIn('wheat', comms_bhawna)
        self.assertNotIn('sugar', comms_bhawna)

        # Gopichand: Rice, Wheat
        token_gopi = create_access_token(identity='gopichand@agalabs.com')
        res_gopi = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token_gopi}'})
        rollups_gopi = res_gopi.get_json().get('commodity_rollups', [])
        comms_gopi = [r['commodity'].lower() for r in rollups_gopi]
        for c in comms_gopi:
            self.assertTrue(
                any(allowed in c for allowed in ['rice', 'wheat']),
                f"Commodity rollup leakage for Gopi: unexpected commodity rollup '{c}'"
            )
        self.assertNotIn('cotton', comms_gopi)
        self.assertNotIn('soybeans', comms_gopi)
        self.assertNotIn('sugar', comms_gopi)
        self.assertNotIn('chilli', comms_gopi)

    # ------------------------------------------------------------------------
    # 3. REPORT SCOPING ON GET /api/crishi/reports/all
    # ------------------------------------------------------------------------

    def test_09_reports_catalog_scoping_no_unassigned_commodity_leakage(self):
        """
        Adversarially verify that unassigned commodity reports never leak to Teammates.
        """
        # Bhawna: assigned Cotton, Rapeseed, Soybeans, Weather
        t_bhawna = create_access_token(identity='bhawna@agalabs.com')
        res = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_bhawna}'})
        data = res.get_json()
        self.assertTrue(data.get('success'))
        reports = data.get('reports', [])
        self.assertEqual(len(reports), 14, f"Expected exactly 14 reports for Bhawna, got {len(reports)}")

        for r in reports:
            cat = (r.get('category') or '').strip().lower()
            name = (r.get('report_name') or '').strip().lower()
            # Category must be one of Bhawna's assigned commodities or name matching
            is_valid = any(c in cat for c in ['cotton', 'rapeseed', 'soybean', 'weather']) or \
                       any(c in name for c in ['cotton', 'rapeseed', 'soybean', 'weather'])
            self.assertTrue(is_valid, f"Report leaked to Bhawna: id={r.get('id')}, cat={cat}, name={name}")
            # Ensure no rice or wheat reports
            self.assertNotIn('rice', cat)
            self.assertNotIn('wheat', cat)

        # Gopichand: assigned Rice, Wheat
        t_gopi = create_access_token(identity='gopichand@agalabs.com')
        res = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_gopi}'})
        reports_gopi = res.get_json().get('reports', [])
        self.assertEqual(len(reports_gopi), 70, f"Expected exactly 70 reports for Gopi, got {len(reports_gopi)}")

        for r in reports_gopi:
            cat = (r.get('category') or '').strip().lower()
            name = (r.get('report_name') or '').strip().lower()
            is_valid = any(c in cat for c in ['rice', 'wheat']) or any(c in name for c in ['rice', 'wheat'])
            self.assertTrue(is_valid, f"Report leaked to Gopi: id={r.get('id')}, cat={cat}, name={name}")
            self.assertNotIn('cotton', cat)
            self.assertNotIn('soybeans', cat)

    # ------------------------------------------------------------------------
    # 4. LEADER ROLE UNRESTRICTED PARITY WITH SUPERADMIN AND MANAGER
    # ------------------------------------------------------------------------

    def test_10_leader_role_unrestricted_parity_with_superadmin_and_manager(self):
        """
        Verify that a user with role 'Leader' has full unrestricted access identical
        to SuperAdmin and Manager across:
          - GET /api/crishi/grid (returns all 140 tasks, full teammates dict, all rollups)
          - GET /api/crishi/reports/all (returns all 339 reports)
          - POST /api/crishi/pull (permitted 200)
          - POST /api/crishi/skip (permitted 200)
          - POST /api/crishi/manager-review (permitted 200)
          - PUT  /api/crishi/source (permitted 200)
          - POST /api/crishi/roster/apply-week (permitted 200)
        """
        # Admin reference tokens
        t_superadmin = create_access_token(identity='nishant@agalabs.com')
        t_manager = create_access_token(identity='ram@agalabs.com')
        t_leader = create_access_token(identity='test_adversarial_leader@agalabs.com', additional_claims={'role': 'Leader'})

        # 1. Grid Parity
        res_super = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_superadmin}'}).get_json()
        res_mgr = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_manager}'}).get_json()
        res_ldr = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_leader}'}).get_json()

        self.assertEqual(len(res_ldr['tasks']), 140, "Leader grid must contain all 140 active tasks")
        self.assertEqual(len(res_ldr['tasks']), len(res_super['tasks']))
        self.assertEqual(len(res_ldr['tasks']), len(res_mgr['tasks']))

        # Teammate chip visibility parity in summary
        self.assertEqual(
            set(res_ldr['summary']['teammates'].keys()),
            set(res_super['summary']['teammates'].keys()),
            "Leader must see identical teammate summary keys as SuperAdmin"
        )
        self.assertGreaterEqual(len(res_ldr['summary']['teammates']), 5)

        # Commodity rollups parity
        self.assertEqual(
            len(res_ldr['commodity_rollups']),
            len(res_super['commodity_rollups']),
            "Leader must see all commodity rollups"
        )

        # 2. Reports Parity
        rep_super = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_superadmin}'}).get_json()
        rep_ldr = self.client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_leader}'}).get_json()

        self.assertEqual(rep_ldr['total'], 339, "Leader must see all 339 reports")
        self.assertEqual(rep_ldr['total'], rep_super['total'])

        # 3. Mutating Endpoints Parity for Leader
        hdr_ldr = {'Authorization': f'Bearer {t_leader}'}

        # POST /api/crishi/pull
        res_pull = self.client.post('/api/crishi/pull', json={'catalogId': self.first_catalog_id, 'slaHours': 48}, headers=hdr_ldr)
        self.assertEqual(res_pull.status_code, 200, f"Leader pull failed with {res_pull.status_code}")

        # POST /api/crishi/skip
        res_skip = self.client.post('/api/crishi/skip', json={'catalogId': self.first_catalog_id, 'targetDate': '2026-10-28', 'reason': 'Adversarial Leader Skip'}, headers=hdr_ldr)
        self.assertEqual(res_skip.status_code, 200, f"Leader skip failed with {res_skip.status_code}")

        # POST /api/crishi/manager-review
        res_rev = self.client.post('/api/crishi/manager-review', json={'catalogId': self.first_catalog_id, 'action': 'VERIFIED', 'customMessage': 'Leader verify'}, headers=hdr_ldr)
        self.assertEqual(res_rev.status_code, 200, f"Leader manager-review failed with {res_rev.status_code}")

        # PUT /api/crishi/source (save original to restore)
        orig_item = DBTaskCatalog.query.get(self.first_catalog_id)
        orig_sname, orig_surl = orig_item.source_name, orig_item.source_url
        try:
            res_src = self.client.put('/api/crishi/source', json={'catalogId': self.first_catalog_id, 'sourceName': 'Leader Source', 'sourceUrl': 'https://example.com/leader'}, headers=hdr_ldr)
            self.assertEqual(res_src.status_code, 200, f"Leader source update failed with {res_src.status_code}")
        finally:
            orig_item.source_name = orig_sname
            orig_item.source_url = orig_surl
            db.session.commit()

        # POST /api/crishi/roster/apply-week
        res_app = self.client.post('/api/crishi/roster/apply-week', json={'week': 1}, headers=hdr_ldr)
        self.assertEqual(res_app.status_code, 200, f"Leader roster apply-week failed with {res_app.status_code}")

    # ------------------------------------------------------------------------
    # 5. BASELINE INVARIANT PRESERVATION
    # ------------------------------------------------------------------------

    def test_11_baseline_database_invariants_preserved(self):
        """
        Verify that exactly 9 users, 27 reports, and 158 catalog mappings remain
        completely intact, undamaged, and unmodified in the database.
        """
        users_after = [(u.id, u.email, u.name, u.role) for u in User.query.order_by(User.id).all()]
        reports_after = [(r.id, r.commodity, r.name) for r in Report.query.order_by(Report.id).all()]
        catalog_after = [(c.id, c.final_name, c.user_name, c.commodity) for c in DBTaskCatalog.query.order_by(DBTaskCatalog.id).all()]

        self.assertEqual(len(users_after), 9, f"Baseline invariant violated: expected 9 users, found {len(users_after)}")
        self.assertEqual(len(reports_after), 27, f"Baseline invariant violated: expected 27 reports, found {len(reports_after)}")
        self.assertEqual(len(catalog_after), 158, f"Baseline invariant violated: expected 158 catalog items, found {len(catalog_after)}")

        self.assertEqual(users_after, self.baseline_users, "Baseline users list has been altered!")
        self.assertEqual(reports_after, self.baseline_reports, "Baseline reports list has been altered!")
        self.assertEqual(catalog_after, self.baseline_catalog, "Baseline catalog items list has been altered!")


if __name__ == '__main__':
    unittest.main()
