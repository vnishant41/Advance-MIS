"""
Adversarial Challenger Stress Harness for Requirement R1 & Regression Tests
=============================================================================
Executed by teamwork_challenger (challenger_r3_iter2_1).
Empirically asserts:
1. Scanned reports deduplication preserves both Daily & Weekly reports for:
   - Chilli on 2026-10-19
   - Coriander on 2026-10-19
   - Rice on 2026-06-01
   - Wheat on 2026-06-01
2. Zero synthetic reports signed by 'Agalabs Market Research & Intelligence Desk':
   - get_all_scanned_reports()
   - REST API GET /api/crishi/reports/all for all 7 role permutations
   - Database tables EmailReport, MISReportUpload, Report
3. AST verification that synthetic companion generators are not invoked.
4. Word boundary collision verification (Pulses & Tur vs Turmeric).
5. Database invariants: 9 users, 27 reports, 158 catalog mappings.
"""

import sys
import re
import json
import ast
import unittest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, EmailReport, MISReportUpload
from app.routes.crishi import get_all_scanned_reports


class R1AdversarialChallengerStressTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

    def setUp(self):
        self.ctx = self.app.app_context()
        self.ctx.push()

    def tearDown(self):
        db.session.rollback()
        self.ctx.pop()

    def test_r1_specified_commodities_and_dates_coexistence(self):
        """Verify both Daily and Weekly reports for Chilli (2026-10-19), Coriander (2026-10-19),
        Rice (2026-06-01), and Wheat (2026-06-01) coexist without dropping either."""
        reports = get_all_scanned_reports()
        
        targets = [
            ("Chilli", "2026-10-19"),
            ("Coriander", "2026-10-19"),
            ("Rice", "2026-06-01"),
            ("Wheat", "2026-06-01")
        ]
        
        for comm, dt in targets:
            matching = [
                r for r in reports 
                if (r.get('category') or '').lower() == comm.lower() and r.get('date') == dt
            ]
            self.assertGreaterEqual(
                len(matching), 2,
                f"Failed: Expected at least 2 reports for {comm} on {dt}, but found {len(matching)}: {matching}"
            )
            
            # Check frequencies
            freqs = set()
            for r in matching:
                text = f"{r.get('report_name', '')} {r.get('subject', '')} {r.get('report_type', '')}"
                if re.search(r'\b(weekly|wkly|week)\b', text, re.I):
                    freqs.add("Weekly")
                else:
                    freqs.add("Daily")
            
            self.assertIn("Daily", freqs, f"Missing Daily report for {comm} on {dt}")
            self.assertIn("Weekly", freqs, f"Missing Weekly report for {comm} on {dt}")
            
            # Ensure filenames / IDs are distinct
            ids = [r.get('id') for r in matching]
            self.assertEqual(len(ids), len(set(ids)), f"Duplicate IDs detected for {comm} on {dt}: {ids}")

    def test_r1_zero_synthetic_reports_everywhere(self):
        """Strictly assert 0 synthetic reports signed by 'Agalabs Market Research & Intelligence Desk'."""
        synthetic_signature = 'Agalabs Market Research & Intelligence Desk'
        
        # 1. Scanned reports
        scanned = get_all_scanned_reports()
        found_in_scanned = []
        for r in scanned:
            blob = json.dumps(r, default=str)
            if synthetic_signature in blob:
                found_in_scanned.append(r.get('id'))
        self.assertEqual(
            len(found_in_scanned), 0,
            f"Adversarial Failure: Found {len(found_in_scanned)} synthetic reports in get_all_scanned_reports(): {found_in_scanned}"
        )

        # 2. Database models
        er_hits = EmailReport.query.filter(EmailReport.email_body_html.like(f"%{synthetic_signature}%")).count()
        self.assertEqual(er_hits, 0, f"Found {er_hits} synthetic records in EmailReport table")

        mis_hits = MISReportUpload.query.filter(MISReportUpload.uploaded_by.like(f"%{synthetic_signature}%")).count()
        self.assertEqual(mis_hits, 0, f"Found {mis_hits} synthetic records in MISReportUpload table")

        rep_hits = Report.query.filter(Report.name.like(f"%{synthetic_signature}%")).count()
        self.assertEqual(rep_hits, 0, f"Found {rep_hits} synthetic records in Report table")

        # 3. REST API across all user roles
        roles_to_test = [
            (None, None),
            ('SuperAdmin', 'vaibhav@agalabs.com'),
            ('Manager', 'ram@agalabs.com'),
            ('Leader', 'ram@agalabs.com'),
            ('Teammate', 'gopichand@agalabs.com'),
            ('Teammate', 'nitesh@agalabs.com'),
            ('Inactive', 'damini@agalabs.com')
        ]
        
        for role, email in roles_to_test:
            headers = {}
            if email:
                tok = create_access_token(identity=email, additional_claims={'role': role})
                headers['Authorization'] = f"Bearer {tok}"
            
            resp = self.client.get('/api/crishi/reports/all', headers=headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            reports = data.get('reports', [])
            
            synthetic_api = [
                r for r in reports
                if synthetic_signature in json.dumps(r, default=str)
            ]
            self.assertEqual(
                len(synthetic_api), 0,
                f"Adversarial Failure: API returned {len(synthetic_api)} synthetic reports for role {role}"
            )

    def test_r1_companion_generator_elimination(self):
        """Inspect app/routes/crishi.py AST to ensure synthetic companion loop is completely gone and never called."""
        import app.routes.crishi as crishi_mod
        src_path = crishi_mod.__file__
        with open(src_path, 'r', encoding='utf-8') as f:
            code = f.read()

        # Check for the synthetic companion loop pattern
        self.assertNotIn("synthetic_reports.append", code, "Detected synthetic_reports.append in crishi.py")
        self.assertNotIn("companion_freq", code, "Detected companion_freq loop in crishi.py")

        tree = ast.parse(code)
        calls_to_companion = [
            node.lineno for node in ast.walk(tree)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == '_build_companion_report'
        ]
        self.assertEqual(len(calls_to_companion), 0, f"_build_companion_report is still called at: {calls_to_companion}")

    def test_r3_word_boundary_zero_leakage_assertion(self):
        """Assert Turmeric (30+ reports) NEVER leaks into Pulses or Tur queries."""
        reports = get_all_scanned_reports()
        
        escape_regex = lambda s: re.escape(s or '')
        match_word = lambda text, token: bool(re.search(r'(^|[^a-zA-Z])' + escape_regex(token) + r'([^a-zA-Z]|$)', text or '', re.I))
        
        pulse_subs = ['bengal gram', 'chana', 'chickpea', 'tur', 'arhar', 'toor', 'pigeon pea', 'urad', 'black matpe', 'moong', 'mung', 'green gram', 'masoor', 'lentil', 'pea', 'peas']
        pulse_sub_aliases = {
            'tur': ['tur', 'arhar', 'toor', 'pigeon pea']
        }

        # Filter pulses as client-side report.js does
        pulses_filtered = [
            r for r in reports 
            if (r.get('category') or '').lower() == 'pulses' 
            or any((r.get('category') or '').lower() == s or match_word(r.get('report_name'), s) or match_word(r.get('subject'), s) for s in pulse_subs)
        ]
        
        tur_filtered = [
            r for r in reports 
            if any((r.get('category') or '').lower() == tok or match_word(r.get('report_name'), tok) or match_word(r.get('subject'), tok) for tok in pulse_sub_aliases['tur'])
            or ((r.get('category') or '').lower() == 'pulses' and any(match_word(r.get('report_name'), tok) or match_word(r.get('subject'), tok) for tok in pulse_sub_aliases['tur']))
        ]
        
        turmeric_in_pulses = [r for r in pulses_filtered if (r.get('category') or '').lower() == 'turmeric']
        turmeric_in_tur = [r for r in tur_filtered if (r.get('category') or '').lower() == 'turmeric']
        
        self.assertEqual(len(turmeric_in_pulses), 0, f"Leaked {len(turmeric_in_pulses)} Turmeric reports into Pulses!")
        self.assertEqual(len(turmeric_in_tur), 0, f"Leaked {len(turmeric_in_tur)} Turmeric reports into Tur!")
        self.assertEqual(len(pulses_filtered), 64, f"Expected 64 Pulses reports, got {len(pulses_filtered)}")
        self.assertEqual(len(tur_filtered), 2, f"Expected 2 Tur reports, got {len(tur_filtered)}")

    def test_r4_database_invariants(self):
        """Strictly verify 9 users, 27 reports, 158 catalog mappings."""
        u_count = User.query.count()
        r_count = Report.query.count()
        c_count = DBTaskCatalog.query.count()
        
        self.assertEqual(u_count, 9, f"User count invariant violated: {u_count} != 9")
        self.assertEqual(r_count, 27, f"Report count invariant violated: {r_count} != 27")
        self.assertEqual(c_count, 158, f"Catalog count invariant violated: {c_count} != 158")

    def test_r1_exact_report_details_for_target_commodities(self):
        """Stress-test detailed metadata for Chilli (2026-10-19), Coriander (2026-10-19),
        Rice (2026-06-01), and Wheat (2026-06-01) to ensure genuine physical origins."""
        scanned = get_all_scanned_reports()
        
        checks = {
            ("Chilli", "2026-10-19"): {"expected_min": 2, "must_have_freqs": {"Daily", "Weekly"}},
            ("Coriander", "2026-10-19"): {"expected_min": 2, "must_have_freqs": {"Daily", "Weekly"}},
            ("Rice", "2026-06-01"): {"expected_min": 2, "must_have_freqs": {"Daily", "Weekly"}},
            ("Wheat", "2026-06-01"): {"expected_min": 2, "must_have_freqs": {"Daily", "Weekly"}},
        }
        
        for (comm, dt), conf in checks.items():
            matches = [r for r in scanned if (r.get('category') or '').lower() == comm.lower() and r.get('date') == dt]
            self.assertGreaterEqual(len(matches), conf['expected_min'])
            
            observed_freqs = set()
            for r in matches:
                # Assert valid report structure
                self.assertTrue(r.get('id'), f"Missing ID for report in {comm} {dt}")
                self.assertTrue(r.get('report_name'), f"Missing report_name for {comm} {dt}")
                self.assertTrue(r.get('filename'), f"Missing filename for {comm} {dt}")
                self.assertIn(r.get('folder'), ['gmail_reports', 'Report Sample', 'uploads'])
                
                # Check frequency classification
                is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{r.get('report_name', '')} {r.get('subject', '')}", re.I))
                observed_freqs.add("Weekly" if is_weekly else "Daily")
            
            self.assertEqual(observed_freqs, conf['must_have_freqs'], f"Frequency mismatch for {comm} {dt}")

    def test_r1_zero_synthetic_across_all_nine_users(self):
        """Iterate through all 9 users in DB and verify their GET /api/crishi/reports/all returns strictly 0 synthetic reports."""
        synthetic_signature = 'Agalabs Market Research & Intelligence Desk'
        users = User.query.all()
        self.assertEqual(len(users), 9)
        
        for u in users:
            tok = create_access_token(identity=u.email, additional_claims={'role': u.role})
            resp = self.client.get('/api/crishi/reports/all', headers={'Authorization': f"Bearer {tok}"})
            self.assertEqual(resp.status_code, 200, f"Failed for user {u.email}")
            
            data = resp.get_json()
            reports = data.get('reports', [])
            
            for r in reports:
                blob = json.dumps(r, default=str)
                self.assertNotIn(
                    synthetic_signature, blob,
                    f"Adversarial Failure: Synthetic report found in user {u.email}'s reports list! Report ID: {r.get('id')}"
                )

    def test_r2_update_history_alias_filtering_regression(self):
        """Stress-test GET /api/crishi/update-history?commodity=... to ensure alias resolver works
        bidirectionally without substring collision."""
        tok = create_access_token(identity='vaibhav@agalabs.com', additional_claims={'role': 'SuperAdmin'})
        headers = {'Authorization': f"Bearer {tok}"}
        
        # Test valid commodities with aliases
        res_pulses = self.client.get('/api/crishi/update-history?commodity=Pulses', headers=headers)
        self.assertEqual(res_pulses.status_code, 200)
        data_pulses = res_pulses.get_json()
        self.assertGreater(data_pulses.get('total', 0), 0)
        
        # Turmeric should NOT match Tur or Pulses
        res_turmeric = self.client.get('/api/crishi/update-history?commodity=Turmeric', headers=headers)
        self.assertEqual(res_turmeric.status_code, 200)
        data_turmeric = res_turmeric.get_json()
        # Verify no pulse items in turmeric updates
        for u in data_turmeric.get('history', []):
            self.assertNotEqual((u.get('commodity') or '').lower(), 'pulses')
            self.assertNotEqual((u.get('commodity') or '').lower(), 'chana')

        # Non-existent commodity returns 0
        res_none = self.client.get('/api/crishi/update-history?commodity=NonExistentKryptonite', headers=headers)
        self.assertEqual(res_none.status_code, 200)
        data_none = res_none.get_json()
        self.assertEqual(data_none.get('total', 0), 0)


if __name__ == '__main__':
    unittest.main()

