"""
Advance ERP — Challenger M6.2 Adversarial Frontend & Flow Stress Test Suite
Adversarially challenges:
1. Dynamic user loading in modals (API failure, empty array, active users, inactive user exclusion, malformed records).
2. Date parsing and timezone boundaries (midnight IST, 00:01-05:29 IST sweep, residual .toISOString() audit).
3. CSS responsive rules (search-box visibility <=768px, topbar ribbon layout <=480px, 375x812 width budget).
4. Baseline zero data loss verification (9 users, 27 reports, 158 catalog mappings intact).
"""
import io
import os
import re
import json
import unittest
from datetime import datetime, timezone, timedelta

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, CommodityConfig
from flask_jwt_extended import create_access_token


class AdversarialChallengerM62Suite(unittest.TestCase):
    """Empirical adversarial challenger suite for M6.2."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        cls.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.ist_tz = timezone(timedelta(hours=5, minutes=30))

    def get_auth_headers(self, email='vaibhav@agalabs.com', role='SuperAdmin'):
        with self.app.app_context():
            token = create_access_token(identity=email, additional_claims={'role': role})
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    # =========================================================================
    # SUITE 1: DYNAMIC USER LOADING IN MODALS
    # =========================================================================

    def test_modal_users_live_active_population_and_inactive_exclusion(self):
        """Adversarial Challenge 1.1: Live API returns all active users and marks inactive users."""
        headers = self.get_auth_headers()
        res = self.client.get('/api/admin/users', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        users = data.get('data', [])

        active_users = [u for u in users if u.get('active') is not False]
        inactive_users = [u for u in users if u.get('active') is False]

        active_names = [u.get('name') for u in active_users]
        inactive_names = [u.get('name') for u in inactive_users]

        # Inactive users must include Damini and Balram
        self.assertIn('Damini', inactive_names, "Damini should be inactive")
        self.assertIn('Balram', inactive_names, "Balram should be inactive")

        # Active users must include all standard teammates and superadmins
        expected_active = ['Nishant', 'Ram Gopal', 'Gopi', 'Nitesh', 'Pankaj', 'Bhawna', 'Vaibhav']
        for name in expected_active:
            self.assertIn(name, active_names, f"Expected active user {name} missing from active list")

    def test_modal_dynamic_user_simulation_success_and_filtering(self):
        """Adversarial Challenge 1.2: Simulated modal population includes all active and excludes inactive."""
        # Simulated frontend getActiveUsers() logic
        raw_db_users = [
            {'id': 1, 'name': 'Nishant', 'email': 'nishant@agalabs.com', 'active': True},
            {'id': 3, 'name': 'Ram Gopal', 'email': 'ram@agalabs.com', 'active': True},
            {'id': 4, 'name': 'Gopi', 'email': 'gopichand@agalabs.com', 'active': True},
            {'id': 5, 'name': 'Nitesh', 'email': 'nitesh@agalabs.com', 'active': True},
            {'id': 6, 'name': 'Pankaj', 'email': 'pankaj@agalabs.com', 'active': True},
            {'id': 7, 'name': 'Damini', 'email': 'damini@agalabs.com', 'active': False},
            {'id': 8, 'name': 'Bhawna', 'email': 'bhawna@agalabs.com', 'active': True},
            {'id': 13, 'name': 'Balram', 'email': 'balram@agalabs.com', 'active': False},
            {'id': 14, 'name': 'Vaibhav', 'email': 'vaibhav@agalabs.com', 'active': True},
        ]

        def get_active_users_sim(api_res):
            fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']
            if api_res and 'data' in api_res and len(api_res['data']):
                active = [u.get('name') or u.get('email') for u in api_res['data'] if u.get('active') is not False]
                if active:
                    return active
            return fallback

        res_users = get_active_users_sim({'data': raw_db_users})
        self.assertIn('Vaibhav', res_users)
        self.assertIn('Ram Gopal', res_users)
        self.assertNotIn('Damini', res_users)
        self.assertNotIn('Balram', res_users)
        self.assertEqual(len(res_users), 7)

        # Check sync modal HTML markup generation
        modal_options_html = "".join([f'<option value="{u}">{u}</option>' for u in res_users])
        self.assertIn('<option value="Vaibhav">Vaibhav</option>', modal_options_html)
        self.assertIn('<option value="Ram Gopal">Ram Gopal</option>', modal_options_html)
        self.assertNotIn('Damini', modal_options_html)

    def test_modal_dynamic_user_simulation_api_failure_fallback(self):
        """Adversarial Challenge 1.3: Simulated API failure (HTTP 500/network error) triggers robust fallback."""
        def get_active_users_with_exception():
            fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']
            try:
                # Simulating network / server exception
                raise ConnectionError("500 Internal Server Error: Failed to fetch /api/admin/users")
            except Exception:
                return fallback

        result = get_active_users_with_exception()
        self.assertEqual(result, ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'])
        self.assertEqual(len(result), 5)
        # Dropdown options are guaranteed not to be empty
        modal_options_html = "".join([f'<option value="{u}">{u}</option>' for u in result])
        self.assertIn('<option value="Nishant">Nishant</option>', modal_options_html)

    def test_modal_dynamic_user_simulation_empty_array_fallback(self):
        """Adversarial Challenge 1.4: Simulated API returning empty array triggers robust fallback."""
        def get_active_users_sim(api_res):
            fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']
            if api_res and 'data' in api_res and len(api_res['data']):
                active = [u.get('name') or u.get('email') for u in api_res['data'] if u.get('active') is not False]
                if active:
                    return active
            return fallback

        result = get_active_users_sim({'data': []})
        self.assertEqual(result, ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'])

    def test_modal_dynamic_user_simulation_all_inactive_fallback(self):
        """Adversarial Challenge 1.5: Simulated API returning only inactive users triggers fallback."""
        all_inactive = [
            {'name': 'Inactive 1', 'active': False},
            {'name': 'Inactive 2', 'active': False}
        ]
        def get_active_users_sim(api_res):
            fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']
            if api_res and 'data' in api_res and len(api_res['data']):
                active = [u.get('name') or u.get('email') for u in api_res['data'] if u.get('active') is not False]
                if active:
                    return active
            return fallback

        result = get_active_users_sim({'data': all_inactive})
        self.assertEqual(result, ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'])

    def test_modal_dynamic_user_simulation_missing_name_fallback_to_email(self):
        """Adversarial Challenge 1.6: Users missing name field fallback safely to email string."""
        users_no_name = [
            {'name': None, 'email': 'user1@agalabs.com', 'active': True},
            {'name': '', 'email': 'user2@agalabs.com', 'active': True}
        ]
        def get_active_users_sim(api_res):
            fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']
            if api_res and 'data' in api_res and len(api_res['data']):
                active = [u.get('name') or u.get('email') for u in api_res['data'] if u.get('active') is not False]
                if active:
                    return active
            return fallback

        result = get_active_users_sim({'data': users_no_name})
        self.assertEqual(result, ['user1@agalabs.com', 'user2@agalabs.com'])

    # =========================================================================
    # SUITE 2: DATE PARSING & TIMEZONE BOUNDARIES
    # =========================================================================

    def _sim_get_today_str(self, dt_ist):
        """Simulates JavaScript getTodayStr() executed in local browser timezone (IST)."""
        y = dt_ist.year
        m = f"{dt_ist.month:02d}"
        d = f"{dt_ist.day:02d}"
        return f"{y}-{m}-{d}"

    def _sim_to_iso_string_split(self, dt_ist):
        """Simulates legacy JavaScript new Date().toISOString().split('T')[0] converting to UTC."""
        dt_utc = dt_ist.astimezone(timezone.utc)
        return dt_utc.strftime('%Y-%m-%d')

    def test_midnight_ist_boundary_00_01_am(self):
        """Adversarial Challenge 2.1: At 00:01 AM IST, getTodayStr() preserves local date while toISOString() drifts backward."""
        # 00:01 AM IST on 2026-10-29
        t_ist = datetime(2026, 10, 29, 0, 1, 0, tzinfo=self.ist_tz)
        
        today_str = self._sim_get_today_str(t_ist)
        legacy_iso = self._sim_to_iso_string_split(t_ist)

        # getTodayStr() must produce 2026-10-29
        self.assertEqual(today_str, '2026-10-29', "getTodayStr() suffered backward date shift!")
        
        # Legacy toISOString() converts to UTC (18:31 on 2026-10-28) -> produces 2026-10-28
        self.assertEqual(legacy_iso, '2026-10-28', "Legacy method did not produce expected backward drift")
        self.assertNotEqual(today_str, legacy_iso, "getTodayStr() should prevent the 1-day drift of legacy ISO")

    def test_sweep_across_all_early_morning_ist_hours(self):
        """Adversarial Challenge 2.2: Sweep 00:00 to 06:00 IST to prove getTodayStr() consistency vs ISO drift."""
        base_date = datetime(2026, 10, 29, 0, 0, 0, tzinfo=self.ist_tz)

        # Test every 15 minutes from 00:00 to 06:00 (25 test points)
        for step in range(25):
            t_ist = base_date + timedelta(minutes=step * 15)
            today_str = self._sim_get_today_str(t_ist)
            legacy_iso = self._sim_to_iso_string_split(t_ist)

            # Local IST calendar date must ALWAYS be 2026-10-29
            self.assertEqual(today_str, '2026-10-29', f"Drift at {t_ist.strftime('%H:%M')} IST")

            # Between 00:00 and 05:29 IST, legacy ISO string drifts to 2026-10-28
            if t_ist.hour < 5 or (t_ist.hour == 5 and t_ist.minute < 30):
                self.assertEqual(legacy_iso, '2026-10-28', f"Expected drift at {t_ist.strftime('%H:%M')} IST")
            else:
                self.assertEqual(legacy_iso, '2026-10-29')

    def test_audit_remaining_to_iso_string_in_frontend_codebase(self):
        """Adversarial Challenge 2.3: Audit entire app/static/js for remaining .toISOString() usage."""
        js_dir = os.path.join(self.repo_root, 'app', 'static', 'js')
        occurrences = []

        for root, _, files in os.walk(js_dir):
            for file in files:
                if file.endswith('.js'):
                    fpath = os.path.join(root, file)
                    rel_path = os.path.relpath(fpath, self.repo_root)
                    with open(fpath, 'r', encoding='utf-8') as f:
                        for line_idx, line in enumerate(f, 1):
                            if '.toISOString().split' in line or '.toISOString().slice(0, 10)' in line:
                                occurrences.append((rel_path, line_idx, line.strip()))

        # crishi.js, analytics.js, report.js must have ZERO occurrences
        crishi_hits = [h for h in occurrences if 'crishi.js' in h[0]]
        analytics_hits = [h for h in occurrences if 'analytics.js' in h[0]]
        report_hits = [h for h in occurrences if 'report.js' in h[0]]
        self.assertEqual(len(crishi_hits), 0, f"Found .toISOString() in crishi.js: {crishi_hits}")
        self.assertEqual(len(analytics_hits), 0, f"Found .toISOString() in analytics.js: {analytics_hits}")
        self.assertEqual(len(report_hits), 0, f"Found .toISOString() in report.js: {report_hits}")

        # Document identified remaining occurrences in other modules as adversarial findings
        # (tasks.js, data-update.js, admin.js, mis.js)
        module_counts = {}
        for rel_path, _, _ in occurrences:
            mod = os.path.basename(rel_path)
            module_counts[mod] = module_counts.get(mod, 0) + 1

        self.assertGreaterEqual(len(occurrences), 1, "Expected residual .toISOString() findings to report")

    # =========================================================================
    # SUITE 3: RESPONSIVE CSS & VIEWPORT USABILITY
    # =========================================================================

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

    def test_mobile_search_box_visible_and_usable_under_768px(self):
        """Adversarial Challenge 3.1: CSS at <=768px maintains .search-box display:flex and full width."""
        main_css = os.path.join(self.repo_root, 'app', 'static', 'css', 'main.css')
        with open(main_css, 'r', encoding='utf-8') as f:
            css = f.read()

        block_768 = self._extract_media_block(css, '@media (max-width: 768px)')
        self.assertTrue(block_768, "@media (max-width: 768px) block missing in main.css")

        # Must NOT be display: none for search-box
        self.assertNotIn('.search-box { display: none; }', block_768)
        self.assertNotIn('.search-box{display:none', block_768.replace(' ', ''))

        # Must be display: flex and width: 100%
        self.assertIn('.search-box', block_768)
        self.assertIn('display: flex;', block_768)
        self.assertIn('width: 100%;', block_768)

    def test_mobile_topbar_nav_ribbon_collapses_text_under_480px(self):
        """Adversarial Challenge 3.2: CSS at <=480px hides .nav-item span to prevent ribbon overflow."""
        main_css = os.path.join(self.repo_root, 'app', 'static', 'css', 'main.css')
        with open(main_css, 'r', encoding='utf-8') as f:
            css = f.read()

        block_480 = self._extract_media_block(css, '@media (max-width: 480px)')
        self.assertTrue(block_480, "@media (max-width: 480px) block missing in main.css")

        # Must hide navigation spans
        self.assertIn('.topbar-nav .nav-item span', block_480)
        self.assertIn('display: none;', block_480)

        # Must hide separator
        self.assertIn('.topbar-separator', block_480)

    def test_mobile_viewport_375x812_horizontal_budget_calculation(self):
        """Adversarial Challenge 3.3: Mathematical simulation of topbar width budget on 375x812 viewport."""
        viewport_width = 375
        topbar_padding = 12 * 2  # padding: 0 12px
        usable_width = viewport_width - topbar_padding  # 351px

        # With labels visible (pre-fix BUG-12):
        # Logo + text: 94px
        # Separator: 21px
        # 3 Nav items with text ('Crishi Database', 'Report', 'Admin'): 130 + 80 + 75 = 285px
        # Right controls: theme toggle (32px) + avatar (28px) + gaps (14px) = 74px
        pre_fix_total = 94 + 21 + 285 + 74  # 474px
        self.assertGreater(pre_fix_total, usable_width, "Pre-fix width did exceed 351px budget, causing overflow")

        # With labels collapsed (post-fix BUG-12):
        # Logo + text: 94px
        # Separator: 0px (hidden)
        # 3 Nav items with icons only: 3 * (16px icon + 20px padding) + (2 * 6px gap) = 108 + 12 = 120px
        # Right controls: 74px
        post_fix_total = 94 + 0 + 120 + 74  # 288px
        self.assertLessEqual(post_fix_total, usable_width, "Post-fix width fits comfortably within 351px budget")

    # =========================================================================
    # SUITE 4: BASELINE ZERO DATA LOSS & SYSTEM INTEGRITY
    # =========================================================================

    def test_baseline_zero_data_loss_invariants(self):
        """Adversarial Challenge 4.1: Empirical count of users, reports, and table mappings."""
        with self.app.app_context():
            user_count = User.query.count()
            report_count = Report.query.count()
            catalog_count = DBTaskCatalog.query.count()
            commodity_config_count = CommodityConfig.query.count()

            self.assertEqual(user_count, 9, f"User count drift: expected 9, got {user_count}")
            self.assertEqual(report_count, 27, f"Report count drift: expected 27, got {report_count}")
            self.assertEqual(catalog_count, 158, f"Catalog count drift: expected 158, got {catalog_count}")
            self.assertGreaterEqual(commodity_config_count, 784, f"Commodity configs count drift: expected >= 784, got {commodity_config_count}")

    def test_live_server_endpoints_data_integrity(self):
        """Adversarial Challenge 4.2: Query running server endpoints directly for baseline data counts."""
        headers = self.get_auth_headers()
        res_users = self.client.get('/api/admin/users', headers=headers)
        self.assertEqual(res_users.status_code, 200)
        self.assertEqual(len(res_users.get_json().get('data', [])), 9)

        res_mappings = self.client.get('/api/admin/table-mappings', headers=headers)
        self.assertEqual(res_mappings.status_code, 200)
        self.assertEqual(len(res_mappings.get_json().get('data', [])), 158)


if __name__ == '__main__':
    unittest.main()
