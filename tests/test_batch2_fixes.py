"""
Automated regression test suite for Milestone 4 (Batch 2 Bug Remediation):
- BUG-05: Dynamic Active Users in CRISHI & Admin Modals
- BUG-06: IST Local Date Calculation Eliminating UTC Offset Shift
- BUG-07: SQLAlchemy 2.0 db.session.get Upgrade Eliminating LegacyAPIWarning
- BUG-08: Secure Fallback JWT_SECRET_KEY (>= 32 bytes) Eliminating InsecureKeyLengthWarning
- BUG-09: Safe Logout Binding in auth.js with Null Checks
- BUG-10: Mobile Responsive Search Box Accessible on Viewports <= 768px
- BUG-12: Mobile Ribbon Responsive Overflow Prevention on Viewports <= 480px
"""
import os
import re
import warnings
import unittest
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import User, DBTaskCatalog, Report


class TestBatch2Fixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

    def get_auth_token(self, email='vaibhav@agalabs.com'):
        with self.app.app_context():
            return create_access_token(identity=email)

    def auth_headers(self, email='vaibhav@agalabs.com'):
        return {'Authorization': f'Bearer {self.get_auth_token(email)}'}

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-08: Fallback JWT Secret Key length >= 32 bytes, no InsecureKeyLengthWarning
    # ─────────────────────────────────────────────────────────────────────────────
    def test_bug08_jwt_secret_key_length_and_no_warning(self):
        """Verifies JWT_SECRET_KEY is at least 32 bytes and token generation emits 0 warnings."""
        secret_key = self.app.config.get('JWT_SECRET_KEY', '')
        self.assertGreaterEqual(len(secret_key.encode('utf-8')), 32,
                                f"JWT_SECRET_KEY is {len(secret_key.encode('utf-8'))} bytes, expected >= 32 bytes")

        with warnings.catch_warnings(record=True) as recorded_warnings:
            warnings.simplefilter('always')
            with self.app.app_context():
                token = create_access_token(identity='audit_test@agalabs.com')
                self.assertTrue(token)
            
            insecure_warnings = [
                w for w in recorded_warnings 
                if 'InsecureKeyLengthWarning' in str(w.category.__name__) or 'HMAC key' in str(w.message)
            ]
            self.assertEqual(len(insecure_warnings), 0,
                             f"InsecureKeyLengthWarning was emitted: {insecure_warnings}")

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-07: SQLAlchemy 2.0 db.session.get upgrade eliminates LegacyAPIWarning
    # ─────────────────────────────────────────────────────────────────────────────
    def test_bug07_no_query_get_in_source_code(self):
        """Verifies that no Model.query.get() calls exist in routes or tests."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        target_dirs = [
            os.path.join(repo_root, 'app', 'routes'),
            os.path.join(repo_root, 'tests')
        ]
        
        violations = []
        for d in target_dirs:
            for root, _, files in os.walk(d):
                for f in files:
                    if f.endswith('.py') and f != 'test_batch2_fixes.py':
                        fpath = os.path.join(root, f)
                        with open(fpath, 'r', encoding='utf-8') as src:
                            for idx, line in enumerate(src, 1):
                                if '.query.get(' in line:
                                    violations.append(f"{os.path.relpath(fpath, repo_root)}:{idx} -> {line.strip()}")
        
        self.assertEqual(len(violations), 0, f"Found legacy Query.get calls: {violations}")

    def test_bug07_live_session_get_execution_without_legacy_warning(self):
        """Verifies that live endpoints invoking db.session.get execute cleanly with 0 LegacyAPIWarnings."""
        with warnings.catch_warnings(record=True) as recorded_warnings:
            warnings.simplefilter('always')
            
            with self.app.app_context():
                first_cat = DBTaskCatalog.query.first()
                first_rep = Report.query.first()
                first_user = User.query.first()
                self.assertIsNotNone(first_cat)
                self.assertIsNotNone(first_rep)
                self.assertIsNotNone(first_user)
                
                # Verify db.session.get cleanly retrieves instances
                cat = db.session.get(DBTaskCatalog, first_cat.id)
                rep = db.session.get(Report, first_rep.id)
                usr = db.session.get(User, first_user.id)
                self.assertEqual(cat.id, first_cat.id)
                self.assertEqual(rep.id, first_rep.id)
                self.assertEqual(usr.id, first_user.id)

            # Test an API endpoint that previously called Query.get
            res = self.client.get('/api/crishi/grid', headers=self.auth_headers())
            self.assertEqual(res.status_code, 200)

            legacy_warnings = [
                w for w in recorded_warnings
                if 'LegacyAPIWarning' in str(w.category.__name__) or 'Query.get()' in str(w.message)
            ]
            self.assertEqual(len(legacy_warnings), 0,
                             f"LegacyAPIWarning was emitted: {legacy_warnings}")

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-06: IST Local Date Calculation in crishi.js
    # ─────────────────────────────────────────────────────────────────────────────
    def test_bug06_get_today_str_and_no_utc_iso_split_in_crishi_js(self):
        """Verifies getTodayStr() is defined and toISOString is not used for date formatting in crishi.js."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        crishi_js = os.path.join(repo_root, 'app', 'static', 'js', 'crishi.js')
        
        with open(crishi_js, 'r', encoding='utf-8') as f:
            content = f.read()

        # getTodayStr must be defined
        self.assertIn('function getTodayStr()', content, "getTodayStr() function is not defined in crishi.js")
        
        # toISOString must not be used for date extraction
        self.assertNotIn('.toISOString().split', content, "toISOString().split was found in crishi.js")
        self.assertNotIn('.toISOString().slice', content, "toISOString().slice was found in crishi.js")

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-05: Dynamic Users in crishi.js and admin.js
    # ─────────────────────────────────────────────────────────────────────────────
    def test_bug05_dynamic_users_in_crishi_and_admin_js(self):
        """Verifies static priorityUsers arrays in sync modals are replaced with dynamic active users."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        crishi_js = os.path.join(repo_root, 'app', 'static', 'js', 'crishi.js')
        admin_js = os.path.join(repo_root, 'app', 'static', 'js', 'admin.js')

        with open(crishi_js, 'r', encoding='utf-8') as f:
            c_content = f.read()

        # CrishiModule must have getActiveUsers helper
        self.assertIn('getActiveUsers()', c_content, "getActiveUsers() is missing in crishi.js")
        self.assertIn('getActiveUsersSync()', c_content, "getActiveUsersSync() is missing in crishi.js")
        self.assertIn('/admin/users', c_content, "crishi.js must query /admin/users for active users")

        with open(admin_js, 'r', encoding='utf-8') as f:
            a_content = f.read()

        # admin.js showAdminEditMonthlyModal must query /admin/users or _userList
        self.assertIn('async showAdminEditMonthlyModal', a_content, "showAdminEditMonthlyModal must be async")
        self.assertIn('/admin/users', a_content, "showAdminEditMonthlyModal must dynamically query users")

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-09: Safe Logout Binding in auth.js
    # ─────────────────────────────────────────────────────────────────────────────
    def test_bug09_auth_js_logout_null_check(self):
        """Verifies auth.js guards against missing #btn-logout and binds #btn-profile-logout."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        auth_js = os.path.join(repo_root, 'app', 'static', 'js', 'auth.js')

        with open(auth_js, 'r', encoding='utf-8') as f:
            content = f.read()

        self.assertIn('if (this.logoutBtn)', content, "Null check for this.logoutBtn missing in auth.js")
        self.assertIn('btn-profile-logout', content, "Handling for btn-profile-logout missing in auth.js")

    # ─────────────────────────────────────────────────────────────────────────────
    # BUG-10 & BUG-12: Responsive CSS rules in main.css
    # ─────────────────────────────────────────────────────────────────────────────
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

    def test_bug10_search_box_accessible_on_mobile(self):
        """Verifies .search-box is not suppressed with display: none in @media (max-width: 768px)."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        main_css = os.path.join(repo_root, 'app', 'static', 'css', 'main.css')

        with open(main_css, 'r', encoding='utf-8') as f:
            content = f.read()

        block_768 = self._extract_media_block(content, '@media (max-width: 768px)')
        self.assertTrue(block_768, "@media (max-width: 768px) block not found in main.css")

        self.assertNotIn('.search-box { display: none; }', block_768,
                         ".search-box must not be display: none in 768px media query")
        self.assertIn('.search-box', block_768,
                      ".search-box must be styled in 768px media query")
        self.assertIn('display: flex;', block_768,
                      ".search-box must be display: flex on mobile")

    def test_bug12_topbar_nav_responsive_rule_480px(self):
        """Verifies responsive rule for screens <= 480px hides .topbar-nav .nav-item span."""
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        main_css = os.path.join(repo_root, 'app', 'static', 'css', 'main.css')

        with open(main_css, 'r', encoding='utf-8') as f:
            content = f.read()

        block_480 = self._extract_media_block(content, '@media (max-width: 480px)')
        self.assertTrue(block_480, "@media (max-width: 480px) block not found in main.css")

        self.assertIn('.topbar-nav .nav-item span', block_480,
                      ".topbar-nav .nav-item span must be targeted in 480px media query")
        self.assertIn('display: none;', block_480,
                      ".topbar-nav .nav-item span must have display: none on <= 480px screens")


if __name__ == '__main__':
    unittest.main()
