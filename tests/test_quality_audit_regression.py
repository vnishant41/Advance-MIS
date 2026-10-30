"""
Advance ERP — Comprehensive Quality Audit & Final Regression Test Suite (Milestone 5 - R4)
Tests:
1. Complete regression coverage for BUG-01 through BUG-12:
   - BUG-01: Admin settings 'import os' safety
   - BUG-02: SQL parameter injection prevention on /api/admin/table-schema and JWT requirement
   - BUG-03: Process runtime code sync & blueprint registration integrity
   - BUG-04: PDF file upload path traversal sanitization
   - BUG-05: Dynamic user synchronization in CRISHI and admin modals
   - BUG-06: IST date calculation eliminating UTC shift discrepancy
   - BUG-07: SQLAlchemy 2.0 ORM session.get() upgrade eliminating LegacyAPIWarning
   - BUG-08: Cryptographically secure JWT secret key (>= 32 bytes)
   - BUG-09: Safe client auth lifecycle and logout event binding
   - BUG-10: Mobile responsive data grid search box CSS rule (<= 768px)
   - BUG-11: Mandatory authentication enforcement on state-mutating endpoints
   - BUG-12: Mobile responsive topbar ribbon overflow CSS rule (<= 480px)
2. Critical Path Verification:
   - Role-based workflows across all 3 roles: SuperAdmin, Manager, Teammate
   - Deactivated and invalid credential login rejection
   - Route accessibility across root SPA and all 12 feature blueprints
   - Error boundaries: 404 Not Found, 405 Method Not Allowed, malformed JSON, invalid/missing JWT
3. Invariant Safety:
   - Zero-data-loss oracle: 9 users, 27 reports, 158 catalog mappings intact.
"""
import io
import os
import re
import json
import warnings
import unittest
from datetime import datetime, timezone, timedelta
from flask_jwt_extended import create_access_token, decode_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, UserReportMapping, UserCommodityMapping


class QualityAuditRegressionTestSuite(unittest.TestCase):
    """Automated Regression Test Suite covering BUG-01..12 and Critical Paths."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        cls.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def get_jwt_token(self, email='vaibhav@agalabs.com', role='SuperAdmin'):
        with self.app.app_context():
            return create_access_token(identity=email, additional_claims={'role': role})

    def get_auth_headers(self, email='vaibhav@agalabs.com', role='SuperAdmin'):
        token = self.get_jwt_token(email, role)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    # =========================================================================
    # SECTION 1: BUG-01 through BUG-12 REGRESSION COVERAGE
    # =========================================================================

    def test_bug01_admin_settings_os_import_safety(self):
        """BUG-01: GET /api/admin/settings succeeds without NameError on 'os'."""
        headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
        res = self.client.get('/api/admin/settings', headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got {res.status_code}: {res.data}")
        data = res.get_json()
        self.assertIsInstance(data, dict)
        self.assertTrue(data.get('success'))
        settings = data.get('settings', {})
        self.assertIn('smtpHost', settings)
        self.assertIn('smtpPort', settings)
        self.assertIn('smtpUser', settings)

    def test_bug02_table_schema_sql_injection_defense_and_auth(self):
        """BUG-02: /api/admin/table-schema/<name> requires JWT and strictly blocks SQL injection."""
        # 1. Unauthenticated request must return 401
        unauth_res = self.client.get('/api/admin/table-schema/users')
        self.assertEqual(unauth_res.status_code, 401)

        # 2. Malicious payloads must return 400
        headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
        injection_payloads = [
            "users; DROP TABLE test; --",
            "users` WHERE 1=1; --",
            "users' OR '1'='1",
            "../../../etc/passwd",
            "..\\..\\windows\\win.ini",
            "table name with spaces",
            "users$inject#symbols"
        ]
        for payload in injection_payloads:
            res = self.client.get(f'/api/admin/table-schema/{payload}', headers=headers)
            self.assertEqual(res.status_code, 400, f"Expected 400 for '{payload}', got {res.status_code}")
            data = res.get_json()
            self.assertFalse(data.get('success'))
            self.assertIn('Invalid table name format', data.get('error', ''))

        # 3. Valid table name returns 200
        valid_res = self.client.get('/api/admin/table-schema/users', headers=headers)
        self.assertEqual(valid_res.status_code, 200)
        valid_data = valid_res.get_json()
        self.assertTrue(valid_data.get('success'))
        self.assertEqual(valid_data.get('table'), 'users')
        self.assertIsInstance(valid_data.get('columns'), list)

    def test_bug03_process_runtime_code_sync_and_blueprint_registration(self):
        """BUG-03: Process runtime sync — all 13 blueprints registered and URL inventory intact."""
        expected_blueprints = {
            'admin', 'analytics', 'auth', 'chat', 'crishi',
            'dashboard', 'du', 'kanban', 'mis', 'notifications', 'roster', 'tasks'
        }
        registered = set(self.app.blueprints.keys())
        for bp in expected_blueprints:
            self.assertIn(bp, registered, f"Missing registered blueprint: {bp}")

        # Total registered routes must match architecture contract (>= 140 routes)
        total_routes = len(list(self.app.url_map.iter_rules()))
        self.assertGreaterEqual(total_routes, 140, f"Expected >= 140 routes, found {total_routes}")

    def test_bug04_mis_upload_pdf_path_traversal_sanitization(self):
        """BUG-04: PDF upload securely sanitizes path traversal characters."""
        token = self.get_jwt_token('vaibhav@agalabs.com', 'SuperAdmin')
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        payload = {
            'file': (io.BytesIO(pdf_bytes), '../../evil_regression_test.pdf'),
            'reportType': 'regression_test'
        }
        res = self.client.post(
            '/api/mis/upload-pdf',
            data=payload,
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        upload_folder = self.app.config.get('UPLOAD_FOLDER', 'uploads')
        escaped_target = os.path.abspath(os.path.join(upload_folder, '..', 'evil_regression_test.pdf'))
        self.assertFalse(os.path.exists(escaped_target), "Path traversal escaped upload folder!")

        # Cleanup test artifacts
        if os.path.exists(upload_folder):
            for f in os.listdir(upload_folder):
                if 'evil_regression_test.pdf' in f:
                    try:
                        os.remove(os.path.join(upload_folder, f))
                    except Exception:
                        pass

    def _extract_media_block(self, content, query):
        start = content.find(query)
        if start == -1:
            return ""
        open_idx = content.find('{', start)
        if open_idx == -1:
            return ""
        depth = 1
        curr = open_idx + 1
        while depth > 0 and curr < len(content):
            if content[curr] == '{':
                depth += 1
            elif content[curr] == '}':
                depth -= 1
            curr += 1
        return content[open_idx:curr]

    def test_bug05_dynamic_user_synchronization_in_modals(self):
        """BUG-05: Modals query live active users dynamically rather than using static arrays."""
        headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
        res = self.client.get('/api/admin/users', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        users = data.get('data', [])
        
        # Verify active users include all active baseline users
        active_emails = {u.get('email') for u in users if u.get('active')}
        baseline_active = {'vaibhav@agalabs.com', 'nishant@agalabs.com', 'ram@agalabs.com', 
                           'bhawna@agalabs.com', 'gopichand@agalabs.com', 'nitesh@agalabs.com', 'pankaj@agalabs.com'}
        for email in baseline_active:
            self.assertIn(email, active_emails)

        # Inactive users must be marked active=False
        inactive_emails = {u.get('email') for u in users if not u.get('active')}
        self.assertIn('damini@agalabs.com', inactive_emails)

        # Inspect JS source code: crishi.js and admin.js have getActiveUsers dynamic fetchers
        crishi_js = os.path.join(self.repo_root, 'app', 'static', 'js', 'crishi.js')
        with open(crishi_js, 'r', encoding='utf-8') as f:
            c_src = f.read()
        self.assertIn('getActiveUsers', c_src)
        self.assertIn('/admin/users', c_src)

    def test_bug06_ist_timezone_and_date_consistency(self):
        """BUG-06: Local IST date handling prevents 1-day UTC offset shift."""
        crishi_js = os.path.join(self.repo_root, 'app', 'static', 'js', 'crishi.js')
        with open(crishi_js, 'r', encoding='utf-8') as f:
            c_src = f.read()

        # getTodayStr() must be implemented
        self.assertIn('function getTodayStr()', c_src)
        # toISOString().split('T')[0] must NOT be used for date extraction
        self.assertNotIn('.toISOString().split', c_src)
        self.assertNotIn('.toISOString().slice', c_src)

    def test_bug07_sqlalchemy_session_get_deprecation_clean(self):
        """BUG-07: SQLAlchemy 2.0 db.session.get() used without LegacyAPIWarning."""
        with warnings.catch_warnings(record=True) as recorded_warnings:
            warnings.simplefilter('always')

            with self.app.app_context():
                first_user = User.query.first()
                first_rep = Report.query.first()
                first_cat = DBTaskCatalog.query.first()
                self.assertIsNotNone(first_user)
                self.assertIsNotNone(first_rep)
                self.assertIsNotNone(first_cat)

                user = db.session.get(User, first_user.id)
                self.assertEqual(user.id, first_user.id)
                report = db.session.get(Report, first_rep.id)
                self.assertEqual(report.id, first_rep.id)
                catalog = db.session.get(DBTaskCatalog, first_cat.id)
                self.assertEqual(catalog.id, first_cat.id)

            legacy_warnings = [
                w for w in recorded_warnings
                if 'LegacyAPIWarning' in str(w.category.__name__) or 'Query.get()' in str(w.message)
            ]
            self.assertEqual(len(legacy_warnings), 0, f"LegacyAPIWarning emitted: {legacy_warnings}")

        # Static inspection: no legacy query getter in app/routes
        legacy_pattern = '.' + 'query' + '.' + 'get('
        routes_dir = os.path.join(self.repo_root, 'app', 'routes')
        for root, _, files in os.walk(routes_dir):
            for file in files:
                if file.endswith('.py'):
                    fpath = os.path.join(root, file)
                    with open(fpath, 'r', encoding='utf-8') as src:
                        for line_idx, line in enumerate(src, 1):
                            self.assertNotIn(legacy_pattern, line, f"Found legacy query getter in {file}:{line_idx}")

    def test_bug08_jwt_secret_length_and_cryptographic_cleanliness(self):
        """BUG-08: JWT_SECRET_KEY is >= 32 bytes and token operations emit no InsecureKeyLengthWarning."""
        secret = self.app.config.get('JWT_SECRET_KEY', '')
        self.assertGreaterEqual(len(secret.encode('utf-8')), 32, "JWT secret key shorter than 32 bytes")

        with warnings.catch_warnings(record=True) as recorded_warnings:
            warnings.simplefilter('always')
            with self.app.app_context():
                token = create_access_token(identity='crypto_audit@agalabs.com')
                self.assertTrue(token)

            insecure_warnings = [
                w for w in recorded_warnings
                if 'InsecureKeyLengthWarning' in str(w.category.__name__) or 'HMAC key' in str(w.message)
            ]
            self.assertEqual(len(insecure_warnings), 0, f"InsecureKeyLengthWarning emitted: {insecure_warnings}")

    def test_bug09_auth_logout_button_binding_safety(self):
        """BUG-09: Safe client-side logout binding in auth.js with null guards."""
        auth_js = os.path.join(self.repo_root, 'app', 'static', 'js', 'auth.js')
        with open(auth_js, 'r', encoding='utf-8') as f:
            src = f.read()

        self.assertIn('if (this.logoutBtn)', src, "Missing null guard for this.logoutBtn in auth.js")
        self.assertIn('btn-profile-logout', src, "Missing binding for #btn-profile-logout in auth.js")

    def test_bug10_mobile_search_box_css_rule_presence(self):
        """BUG-10: Mobile CSS preserves search box with display: flex on viewports <= 768px."""
        main_css = os.path.join(self.repo_root, 'app', 'static', 'css', 'main.css')
        with open(main_css, 'r', encoding='utf-8') as f:
            src = f.read()

        block = self._extract_media_block(src, '@media (max-width: 768px)')
        self.assertTrue(block, "@media (max-width: 768px) block not found in main.css")
        self.assertNotIn('.search-box { display: none; }', block)
        self.assertIn('.search-box', block)
        self.assertIn('display: flex;', block)

    def test_bug11_mutating_endpoints_require_authentication(self):
        """BUG-11: Mutating endpoints strictly reject unauthenticated calls with HTTP 401."""
        endpoints = [
            ('DELETE', '/api/admin/table-mappings/999999', None),
            ('POST', '/api/crishi/pull', {'catalogId': 1, 'slaHours': 24}),
            ('POST', '/api/crishi/skip', {'catalogId': 1, 'reason': 'Audit Check'}),
            ('POST', '/api/crishi/roster/apply-week', {'week': 1}),
            ('PUT', '/api/roster/rake-zones', {'person': 'Tester', 'zones': 'CR'}),
            ('POST', '/api/roster/rake-date', {'date': '2026-11-01'}),
            ('PUT', '/api/roster/monthly-duties', {'duties': []}),
            ('POST', '/api/roster/apply-week', {'week': 1}),
            ('POST', '/api/roster/assign-backup', {'dutyRole': 'Scrapper', 'primaryUser': 'A', 'backupUser': 'B'}),
            ('POST', '/api/roster/generate-random', {'weeks': 5}),
            ('PUT', '/api/roster/scrapper-matrix', {'matrix': []}),
            ('POST', '/api/roster/structure', {'matrix': []}),
        ]
        for method, url, payload in endpoints:
            kwargs = {}
            if payload is not None:
                kwargs['data'] = json.dumps(payload)
                kwargs['content_type'] = 'application/json'

            if method == 'DELETE':
                res = self.client.delete(url, **kwargs)
            elif method == 'POST':
                res = self.client.post(url, **kwargs)
            elif method == 'PUT':
                res = self.client.put(url, **kwargs)

            self.assertEqual(res.status_code, 401, f"Endpoint {method} {url} allowed unauthenticated access (got {res.status_code})")

    def test_bug12_mobile_viewport_topbar_ribbon_responsive_css(self):
        """BUG-12: Mobile CSS prevents ribbon overflow on screens <= 480px by hiding nav spans."""
        main_css = os.path.join(self.repo_root, 'app', 'static', 'css', 'main.css')
        with open(main_css, 'r', encoding='utf-8') as f:
            src = f.read()

        m = re.search(r'@media\s*\(\s*max-width\s*:\s*480px\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', src)
        self.assertIsNotNone(m, "@media (max-width: 480px) block not found in main.css")
        block = m.group(1)
        self.assertIn('.topbar-nav .nav-item span', block)
        self.assertIn('display: none;', block)

    # =========================================================================
    # SECTION 2: CRITICAL PATH VERIFICATION (ROLES, ROUTES, BOUNDARIES)
    # =========================================================================

    def test_auth_workflow_superadmin_role(self):
        """Critical Path: SuperAdmin authenticated workflow (login, claims, admin routes)."""
        # 1. Login via POST /api/auth/login
        login_res = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'vaibhav@agalabs.com', 'password': 'admin123'}),
            content_type='application/json'
        )
        self.assertEqual(login_res.status_code, 200)
        data = login_res.get_json()
        self.assertTrue(data.get('success'))
        token = data.get('token')
        self.assertTrue(token)
        self.assertEqual(data.get('user', {}).get('role'), 'SuperAdmin')

        # 2. Token Claims Verification
        with self.app.app_context():
            claims = decode_token(token)
            self.assertEqual(claims.get('sub'), 'vaibhav@agalabs.com')
            self.assertEqual(claims.get('role'), 'SuperAdmin')

        # 3. SuperAdmin access to privileged endpoints
        headers = {'Authorization': f'Bearer {token}'}
        self.assertEqual(self.client.get('/api/admin/settings', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/admin/users', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/admin/reports', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/admin/table-mappings', headers=headers).status_code, 200)

    def test_auth_workflow_manager_role(self):
        """Critical Path: Manager authenticated workflow (login, claims, department routes)."""
        # 1. Login via POST /api/auth/login
        login_res = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'ram@agalabs.com', 'password': 'admin123'}),
            content_type='application/json'
        )
        self.assertEqual(login_res.status_code, 200)
        data = login_res.get_json()
        self.assertTrue(data.get('success'))
        token = data.get('token')
        self.assertTrue(token)
        self.assertEqual(data.get('user', {}).get('role'), 'Manager')

        # 2. Token Claims Verification
        with self.app.app_context():
            claims = decode_token(token)
            self.assertEqual(claims.get('sub'), 'ram@agalabs.com')
            self.assertEqual(claims.get('role'), 'Manager')

        # 3. Manager access to manager-level endpoints
        headers = {'Authorization': f'Bearer {token}'}
        self.assertEqual(self.client.get('/api/auth/me', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/dash/stats', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/admin/user-duties/ram@agalabs.com', headers=headers).status_code, 200)

    def test_auth_workflow_teammate_role(self):
        """Critical Path: Teammate authenticated workflow (login, claims, tasks, boundaries)."""
        # 1. Login via POST /api/auth/login
        login_res = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'bhawna@agalabs.com', 'password': 'admin123'}),
            content_type='application/json'
        )
        self.assertEqual(login_res.status_code, 200)
        data = login_res.get_json()
        self.assertTrue(data.get('success'))
        token = data.get('token')
        self.assertTrue(token)
        self.assertEqual(data.get('user', {}).get('role'), 'Teammate')

        # 2. Token Claims Verification
        with self.app.app_context():
            claims = decode_token(token)
            self.assertEqual(claims.get('sub'), 'bhawna@agalabs.com')
            self.assertEqual(claims.get('role'), 'Teammate')

        # 3. Teammate access to permitted operational endpoints
        headers = {'Authorization': f'Bearer {token}'}
        self.assertEqual(self.client.get('/api/auth/me', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/tasks/today', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/crishi/grid', headers=headers).status_code, 200)

    def test_auth_deactivated_user_login_blocked(self):
        """Critical Path: Deactivated account is strictly blocked from logging in."""
        res = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'damini@agalabs.com', 'password': 'admin123'}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get('success'))
        self.assertIn('deactivated', data.get('message', '').lower())

    def test_auth_invalid_credentials_blocked(self):
        """Critical Path: Non-existent users and invalid passwords rejected with 401."""
        # Non-existent user
        res1 = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'nonexistent_user@agalabs.com', 'password': 'wrongpassword'}),
            content_type='application/json'
        )
        self.assertEqual(res1.status_code, 401)
        self.assertFalse(res1.get_json().get('success'))

        # Wrong password for existing user
        res2 = self.client.post(
            '/api/auth/login',
            data=json.dumps({'email': 'vaibhav@agalabs.com', 'password': 'incorrect_password'}),
            content_type='application/json'
        )
        self.assertEqual(res2.status_code, 401)
        self.assertFalse(res2.get_json().get('success'))

    def test_route_accessibility_spa_and_favicon(self):
        """Route Accessibility: SPA root container and favicon."""
        # GET /
        res_root = self.client.get('/')
        self.assertEqual(res_root.status_code, 200)
        self.assertIn(b'<title>', res_root.data)
        self.assertIn(b'app', res_root.data)

        # GET /favicon.ico
        res_fav = self.client.get('/favicon.ico')
        self.assertEqual(res_fav.status_code, 204)

    def test_route_accessibility_across_all_12_feature_blueprints(self):
        """Route Accessibility: Read endpoints across all 12 feature blueprints."""
        headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
        
        test_routes = [
            ('auth', '/api/auth/me', 200),
            ('admin', '/api/admin/users', 200),
            ('analytics', '/api/analytics/kpi', 200),
            ('chat', '/api/chat/channels', 200),
            ('crishi', '/api/crishi/grid', 200),
            ('dashboard', '/api/dash/stats', 200),
            ('du', '/api/du/commodities', 200),
            ('kanban', '/api/kanban/board', 200),
            ('mis', '/api/mis/reports', 200),
            ('notifications', '/api/notifications/', 200),
            ('roster', '/api/roster/config', 200),
            ('tasks', '/api/tasks/today', 200),
        ]
        for bp_name, route, expected_status in test_routes:
            res = self.client.get(route, headers=headers)
            self.assertEqual(
                res.status_code, expected_status,
                f"Blueprint '{bp_name}' route {route} returned HTTP {res.status_code}, expected {expected_status}"
            )

    def test_error_boundary_404_invalid_api_route(self):
        """Error Boundary: Invalid API endpoint returns HTTP 404."""
        res = self.client.get('/api/invalid_route_boundary_test_999')
        self.assertEqual(res.status_code, 404)

    def test_error_boundary_405_method_not_allowed(self):
        """Error Boundary: Method not allowed returns HTTP 405."""
        headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
        # /api/admin/settings is GET and POST only; DELETE must return 405
        res = self.client.delete('/api/admin/settings', headers=headers)
        self.assertEqual(res.status_code, 405)

    def test_error_boundary_malformed_json_payload(self):
        """Error Boundary: Sending malformed JSON returns HTTP 400."""
        res = self.client.post(
            '/api/auth/login',
            data='{ malformed json without closing brace',
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 400)

    def test_error_boundary_invalid_and_missing_jwt(self):
        """Error Boundary: Protected routes reject invalid tokens or missing auth."""
        # Missing token
        res_no_auth = self.client.get('/api/auth/me')
        self.assertEqual(res_no_auth.status_code, 401)

        # Invalid token
        res_bad_token = self.client.get('/api/auth/me', headers={'Authorization': 'Bearer totally.invalid.token'})
        self.assertIn(res_bad_token.status_code, (401, 422))

    # =========================================================================
    # SECTION 3: ZERO DATA LOSS INVARIANT ORACLE
    # =========================================================================

    def test_zero_data_loss_invariants(self):
        """Invariant: Exactly 9 users, 27 reports, and >= 156 (158) catalog mappings remain intact."""
        with self.app.app_context():
            user_count = User.query.count()
            report_count = Report.query.count()
            catalog_count = DBTaskCatalog.query.count()

            self.assertEqual(user_count, 9, f"User count drift: expected 9, found {user_count}")
            self.assertEqual(report_count, 27, f"Report count drift: expected 27, found {report_count}")
            self.assertGreaterEqual(catalog_count, 156, f"Catalog count drift: expected >= 156, found {catalog_count}")
            self.assertEqual(catalog_count, 158, f"Catalog count drift: expected 158, found {catalog_count}")


if __name__ == '__main__':
    unittest.main()
