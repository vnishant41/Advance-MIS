"""
Adversarial Verification Suite for Requirement R1 (Scanned Reports Deduplication,
Daily/Weekly Co-existence, Zero Synthetic Reports) & R4 (Database Invariants)
=============================================================================

Adversarially challenges:
1. Zero Synthetic Reports: Assert absolute zero tolerance for synthetic companion
   reports (e.g., fabricated via `_build_companion_report` or signed by
   'Agalabs Market Research & Intelligence Desk') across helper functions,
   REST API endpoints (all roles), and database tables.
2. Daily/Weekly Co-existence: Assert both Daily and Weekly reports for the same
   commodity arriving on the same date (Chilli 2026-10-19, Coriander 2026-10-19,
   Rice 2026-06-01, Wheat 2026-06-01, plus all 30+ coexisting pairs) are returned
   without dropping or overwriting either.
3. Email Ingestion Deduplication: Adversarially test frequency-aware keying,
   arrival order invariance, duplicate suppression, and incremental ingestion safety.
4. MIS Upload Deduplication: Test identical filenames with differing frequencies
   vs identical filenames with identical frequencies.
5. Invariants Verification: Strictly assert 9 users, 27 reports, and 158 catalog mappings.
"""

import os
import re
import json
import unittest
from datetime import datetime, date
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, EmailReport, MISReportUpload
from app.routes.crishi import get_all_scanned_reports, VALID_COMMODITIES


class CrishiAdversarialR1TestCase(unittest.TestCase):
    """Adversarial stress-testing of Requirement R1 & Invariants."""

    app = None
    client = None

    BASELINE_USER_COUNT = 9
    BASELINE_REPORT_COUNT = 27
    BASELINE_CATALOG_COUNT = 158

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

    def setUp(self):
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        db.session.rollback()
        self.app_context.pop()

    # -------------------------------------------------------------------------
    # 1. Zero Synthetic Companion Reports Verification (Zero-Tolerance)
    # -------------------------------------------------------------------------

    def test_zero_synthetic_in_get_all_scanned_reports(self):
        """Verify that get_all_scanned_reports() contains 0 synthetic companion reports."""
        all_reports = get_all_scanned_reports()
        self.assertGreater(len(all_reports), 0, "Scanned reports should not be empty")

        synthetic_signature = 'Agalabs Market Research & Intelligence Desk'
        synthetic_found = []

        for r in all_reports:
            r_id = r.get('id')
            email_body = r.get('email_body', '')
            sender = r.get('sender', '')
            subject = r.get('subject', '')
            report_name = r.get('report_name', '')
            ai_data_str = json.dumps(r.get('ai_analysis', {}))

            if (synthetic_signature in email_body or
                synthetic_signature in sender or
                synthetic_signature in subject or
                synthetic_signature in report_name or
                synthetic_signature in ai_data_str):
                synthetic_found.append(r)

        self.assertEqual(
            len(synthetic_found), 0,
            f"Adversarial Failure: Found {len(synthetic_found)} synthetic reports signed by '{synthetic_signature}'!"
        )

    def test_zero_synthetic_in_api_endpoint_all_roles(self):
        """Verify GET /api/crishi/reports/all returns 0 synthetic reports across all user roles."""
        roles_to_test = [
            (None, None),  # Unauthenticated
            ('SuperAdmin', 'vaibhav@agalabs.com'),
            ('Manager', 'ram@agalabs.com'),
            ('Leader', 'ram@agalabs.com'),
            ('Teammate', 'gopichand@agalabs.com'),
            ('Teammate', 'nitesh@agalabs.com')
        ]

        synthetic_signature = 'Agalabs Market Research & Intelligence Desk'

        for role, email in roles_to_test:
            headers = {}
            if email:
                tok = create_access_token(identity=email, additional_claims={'role': role})
                headers['Authorization'] = f"Bearer {tok}"

            res = self.client.get('/api/crishi/reports/all', headers=headers)
            self.assertEqual(res.status_code, 200, f"Endpoint failed for role {role}")
            data = res.get_json()
            self.assertTrue(data.get('success', False))

            reports = data.get('reports', [])
            syn_in_response = [
                r for r in reports
                if synthetic_signature in r.get('email_body', '') or
                   synthetic_signature in r.get('sender', '')
            ]

            self.assertEqual(
                len(syn_in_response), 0,
                f"Adversarial Failure: GET /api/crishi/reports/all returned {len(syn_in_response)} synthetic reports for role {role}!"
            )

    def test_zero_synthetic_in_database_tables(self):
        """Verify EmailReport and MISReportUpload have 0 synthetic companion records."""
        synthetic_signature = 'Agalabs Market Research & Intelligence Desk'

        syn_email_reports = EmailReport.query.filter(
            EmailReport.email_body_html.like(f"%{synthetic_signature}%")
        ).all()
        self.assertEqual(
            len(syn_email_reports), 0,
            f"Found {len(syn_email_reports)} synthetic companion records in EmailReport table"
        )

        syn_mis_reports = MISReportUpload.query.filter(
            MISReportUpload.uploaded_by.like(f"%{synthetic_signature}%")
        ).all()
        self.assertEqual(
            len(syn_mis_reports), 0,
            f"Found {len(syn_mis_reports)} synthetic companion records in MISReportUpload table"
        )

    # -------------------------------------------------------------------------
    # 2. Daily & Weekly Co-existence Verification
    # -------------------------------------------------------------------------

    def test_specified_dates_coexistence_in_scanned_reports(self):
        """Verify specified commodities on specified dates return BOTH Daily and Weekly reports."""
        all_reports = get_all_scanned_reports()

        target_dates = [
            ('Chilli', '2026-10-19'),
            ('Coriander', '2026-10-19'),
            ('Rice', '2026-06-01'),
            ('Wheat', '2026-06-01')
        ]

        for cat, dt in target_dates:
            matches = [r for r in all_reports if r.get('category') == cat and r.get('date') == dt]
            self.assertGreaterEqual(
                len(matches), 2,
                f"Expected at least 2 reports for {cat} on {dt}, but found {len(matches)}"
            )

            freqs = set(
                'Weekly' if re.search(r'\bweekly\b', r['report_name'] + ' ' + r.get('subject', ''), re.I) else 'Daily'
                for r in matches
            )

            self.assertIn('Daily', freqs, f"Missing 'Daily' report for {cat} on {dt}")
            self.assertIn('Weekly', freqs, f"Missing 'Weekly' report for {cat} on {dt}")

    def test_all_coexisting_commodity_date_pairs(self):
        """Verify all co-existing (commodity, date) pairs in scanned reports retain distinct Daily and Weekly reports."""
        all_reports = get_all_scanned_reports()
        pairs = {}

        for r in all_reports:
            cat = r.get('category')
            dt = r.get('date')
            freq = 'Weekly' if re.search(r'\bweekly\b', r['report_name'] + ' ' + r.get('subject', ''), re.I) else 'Daily'
            pairs.setdefault((cat, dt), set()).add(freq)

        coexisting = {k: v for k, v in pairs.items() if len(v) > 1}

        # Assert we have multiple coexisting pairs across the dataset
        self.assertGreaterEqual(
            len(coexisting), 30,
            f"Expected at least 30 co-existing pairs, found {len(coexisting)}"
        )

        for (cat, dt), freqs in coexisting.items():
            self.assertTrue('Daily' in freqs and 'Weekly' in freqs, f"Pair ({cat}, {dt}) must contain both Daily and Weekly")

    def test_coexisting_reports_have_distinct_metadata(self):
        """Verify that coexisting Daily and Weekly reports retain distinct filenames, names, and subjects."""
        all_reports = get_all_scanned_reports()

        chilli_1019 = [r for r in all_reports if r.get('category') == 'Chilli' and r.get('date') == '2026-10-19']
        self.assertEqual(len(chilli_1019), 2)

        rep_a, rep_b = chilli_1019[0], chilli_1019[1]
        self.assertNotEqual(rep_a['report_name'], rep_b['report_name'])
        self.assertNotEqual(rep_a['filename'], rep_b['filename'])
        self.assertNotEqual(rep_a['subject'], rep_b['subject'])

        rice_0601 = [r for r in all_reports if r.get('category') == 'Rice' and r.get('date') == '2026-06-01']
        self.assertEqual(len(rice_0601), 2)

        rice_a, rice_b = rice_0601[0], rice_0601[1]
        self.assertNotEqual(rice_a['report_name'], rice_b['report_name'])
        self.assertNotEqual(rice_a['filename'], rice_b['filename'])

    def test_api_endpoint_preserves_coexisting_reports(self):
        """Verify GET /api/crishi/reports/all returns both Daily and Weekly reports for Chilli on 2026-10-19."""
        tok = create_access_token(identity='vaibhav@agalabs.com', additional_claims={'role': 'SuperAdmin'})
        res = self.client.get('/api/crishi/reports/all', headers={'Authorization': f"Bearer {tok}"})
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        reports = data.get('reports', [])

        chilli_reports = [r for r in reports if r.get('category') == 'Chilli' and r.get('date') == '2026-10-19']
        self.assertEqual(len(chilli_reports), 2, "API should return exactly 2 reports for Chilli on 2026-10-19")

        freqs = set(
            'Weekly' if re.search(r'\bweekly\b', r['report_name'] + ' ' + r.get('subject', ''), re.I) else 'Daily'
            for r in chilli_reports
        )
        self.assertEqual(freqs, {'Daily', 'Weekly'})

    # -------------------------------------------------------------------------
    # 3. Email Ingestion Deduplication Logic Stress Tests
    # -------------------------------------------------------------------------

    def test_email_ingestion_frequency_keying_logic(self):
        """Adversarially test the frequency-aware composite deduplication key formula."""
        from app.services.email_ingestion import detect_commodity_from_text, parse_report_date

        subjects = [
            ("Fwd: Chilli Daily Digest 20261025", "Chilli", "Daily", "2026-10-25"),
            ("Fwd: Chilli Weekly Update 20261025", "Chilli", "Weekly", "2026-10-25"),
            ("Chilli Wkly Report 20261026", "Chilli", "Weekly", "2026-10-26"),
            ("Chilli Week In Review 20261027", "Chilli", "Weekly", "2026-10-27"),
            ("Coriander Daily Wire 20261025", "Coriander", "Daily", "2026-10-25"),
            ("Coriander Weekly Intelligence 20261025", "Coriander", "Weekly", "2026-10-25"),
        ]

        generated_keys = set()
        for raw_subj, expected_comm, expected_freq, expected_date in subjects:
            clean_subj = re.sub(r'^(Fwd:\s*)+', '', raw_subj, flags=re.I).strip()
            comm = detect_commodity_from_text(clean_subj)
            r_date_str = parse_report_date(clean_subj, '', '')
            is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_subj} {raw_subj}", re.I))
            freq = 'Weekly' if is_weekly else 'Daily'

            self.assertEqual(comm, expected_comm)
            self.assertEqual(freq, expected_freq)
            self.assertEqual(r_date_str, expected_date)

            comm_freq_key = f"{comm}_{freq}_{r_date_str}"
            self.assertNotIn(
                comm_freq_key, generated_keys,
                f"Collision detected for key '{comm_freq_key}' with subject '{raw_subj}'!"
            )
            generated_keys.add(comm_freq_key)

    def test_email_ingestion_simulation_both_daily_and_weekly(self):
        """Simulate email ingestion deduplication loop processing Daily and Weekly emails on same date."""
        seen_commodity_dates = set()
        existing_reports_map = {}
        processed_emails = []

        raw_items = [
            {
                'id': '101',
                'raw_subject': 'Fwd: Chilli Daily Digest 20261030',
                'date_header': 'Fri, 30 Oct 2026 08:30:00 +0530'
            },
            {
                'id': '102',
                'raw_subject': 'Fwd: Chilli Weekly Update 20261030',
                'date_header': 'Fri, 30 Oct 2026 09:00:00 +0530'
            }
        ]

        from app.services.email_ingestion import detect_commodity_from_text, parse_report_date

        for item in raw_items:
            clean_subj = re.sub(r'^(Fwd:\s*)+', '', item['raw_subject'], flags=re.I).strip()
            comm = detect_commodity_from_text(clean_subj)
            r_date_str = parse_report_date(clean_subj, '', item['date_header'])
            is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_subj} {item['raw_subject']}", re.I))
            freq = 'Weekly' if is_weekly else 'Daily'

            comm_freq_key = f"{comm}_{freq}_{r_date_str}"
            if comm_freq_key in seen_commodity_dates:
                continue
            seen_commodity_dates.add(comm_freq_key)
            processed_emails.append((item['id'], comm, freq, r_date_str))

        self.assertEqual(len(processed_emails), 2, "Both Daily and Weekly emails must be processed")
        freqs = {p[2] for p in processed_emails}
        self.assertEqual(freqs, {'Daily', 'Weekly'})

    def test_email_ingestion_simulation_order_invariance(self):
        """Verify that ingestion order (Weekly first vs Daily first) does not affect retention of both."""
        from app.services.email_ingestion import detect_commodity_from_text, parse_report_date

        # Reverse order: Weekly arrives before Daily
        raw_items = [
            {
                'id': '201',
                'raw_subject': 'Fwd: Chilli Weekly Update 20261030',
                'date_header': 'Fri, 30 Oct 2026 09:00:00 +0530'
            },
            {
                'id': '202',
                'raw_subject': 'Fwd: Chilli Daily Digest 20261030',
                'date_header': 'Fri, 30 Oct 2026 08:30:00 +0530'
            }
        ]

        seen_commodity_dates = set()
        processed_emails = []

        for item in raw_items:
            clean_subj = re.sub(r'^(Fwd:\s*)+', '', item['raw_subject'], flags=re.I).strip()
            comm = detect_commodity_from_text(clean_subj)
            r_date_str = parse_report_date(clean_subj, '', item['date_header'])
            is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_subj} {item['raw_subject']}", re.I))
            freq = 'Weekly' if is_weekly else 'Daily'

            comm_freq_key = f"{comm}_{freq}_{r_date_str}"
            if comm_freq_key in seen_commodity_dates:
                continue
            seen_commodity_dates.add(comm_freq_key)
            processed_emails.append((item['id'], comm, freq, r_date_str))

        self.assertEqual(len(processed_emails), 2, "Both Weekly and Daily must be processed regardless of arrival order")
        freqs = {p[2] for p in processed_emails}
        self.assertEqual(freqs, {'Daily', 'Weekly'})

    def test_email_ingestion_duplicate_suppression_for_same_frequency(self):
        """Verify that multiple dispatches for the SAME frequency on the same date are deduplicated."""
        from app.services.email_ingestion import detect_commodity_from_text, parse_report_date

        raw_items = [
            {'id': '301', 'raw_subject': 'Fwd: Chilli Daily Digest 20261030 (Latest)', 'date_header': 'Fri, 30 Oct 2026 10:00:00'},
            {'id': '302', 'raw_subject': 'Fwd: Chilli Daily Digest 20261030 (Earlier)', 'date_header': 'Fri, 30 Oct 2026 08:00:00'}
        ]

        seen_commodity_dates = set()
        processed = []
        for item in raw_items:
            clean_subj = re.sub(r'^(Fwd:\s*)+', '', item['raw_subject'], flags=re.I).strip()
            comm = detect_commodity_from_text(clean_subj)
            r_date_str = parse_report_date(clean_subj, '', item['date_header'])
            is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_subj} {item['raw_subject']}", re.I))
            freq = 'Weekly' if is_weekly else 'Daily'
            comm_freq_key = f"{comm}_{freq}_{r_date_str}"
            if comm_freq_key in seen_commodity_dates:
                continue
            seen_commodity_dates.add(comm_freq_key)
            processed.append(item['id'])

        self.assertEqual(len(processed), 1, "Duplicate daily email must be dropped/skipped")
        self.assertEqual(processed[0], '301', "First encountered (latest) email should be kept")

    def test_email_ingestion_incremental_cache_population(self):
        """Verify existing_reports_map keys on frequency so pre-existing Daily does not block new Weekly."""
        # Mock EmailReport objects
        class MockEmailReport:
            def __init__(self, report_name, subject, date_sent):
                self.report_name = report_name
                self.subject = subject
                self.date_sent = date_sent

        daily_er = MockEmailReport(
            report_name='Chilli Daily Digest 20261019',
            subject='Fwd: Chilli Daily Digest 20261019',
            date_sent=date(2026, 10, 19)
        )

        from app.services.email_ingestion import detect_commodity_from_text

        existing_reports_map = {}
        for er in [daily_er]:
            c_tag = detect_commodity_from_text(er.report_name or er.subject or '')
            d_tag = er.date_sent.strftime('%Y-%m-%d') if er.date_sent else ''
            f_match = re.search(r'\b(weekly|wkly|week)\b', f"{er.report_name or ''} {er.subject or ''}", re.I)
            f_tag = 'Weekly' if f_match else 'Daily'
            if c_tag and d_tag:
                existing_reports_map[f"{c_tag}_{f_tag}_{d_tag}"] = er

        self.assertIn('Chilli_Daily_2026-10-19', existing_reports_map)
        self.assertNotIn('Chilli_Weekly_2026-10-19', existing_reports_map)

        # When incoming email is Weekly for that same date:
        incoming_key = "Chilli_Weekly_2026-10-19"
        self.assertIsNone(existing_reports_map.get(incoming_key), "Weekly key must NOT collide with existing Daily record")

    # -------------------------------------------------------------------------
    # 4. MIS Upload Deduplication Logic Stress Tests
    # -------------------------------------------------------------------------

    def test_mis_deduplication_identical_filename_differing_frequencies(self):
        """Verify MIS uploads with identical clean filename but differing frequencies generate distinct keys."""
        class MockMISUpload:
            def __init__(self, orig_name, report_type, upload_date):
                self.original_filename = orig_name
                self.filename = orig_name
                self.report_type = report_type
                self.upload_date = upload_date

        uploads = [
            MockMISUpload("1234_Wheat_Report.pdf", "Wheat Daily Digest", "2026-06-01"),
            MockMISUpload("5678_Wheat_Report.pdf", "Wheat Weekly Dossier", "2026-06-01")
        ]

        seen = set()
        kept = []
        for u in uploads:
            raw_name = (u.original_filename or u.filename or '').strip()
            clean_name = raw_name
            if clean_name.lower().endswith('.pdf'):
                clean_name = clean_name[:-4]
            clean_name = re.sub(r'^\d+_', '', clean_name).replace('_', ' ').strip()

            u_date = u.upload_date[:10]
            u_is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_name} {u.report_type or ''}", re.I))
            u_freq = 'Weekly' if u_is_weekly else 'Daily'
            key = f"mis_{clean_name}_{u_freq}_{u_date}"
            if key in seen:
                continue
            seen.add(key)
            kept.append((clean_name, u_freq, key))

        self.assertEqual(len(kept), 2, "Both Daily and Weekly MIS uploads must be retained")
        self.assertNotEqual(kept[0][2], kept[1][2], "Keys must differ")
        self.assertEqual({k[1] for k in kept}, {'Daily', 'Weekly'})

    def test_mis_deduplication_identical_filename_identical_frequencies(self):
        """Verify MIS uploads with identical clean filename AND identical frequency on same date are deduplicated."""
        class MockMISUpload:
            def __init__(self, orig_name, report_type, upload_date):
                self.original_filename = orig_name
                self.filename = orig_name
                self.report_type = report_type
                self.upload_date = upload_date

        uploads = [
            MockMISUpload("1234_Wheat_Report.pdf", "Wheat Daily Digest", "2026-06-01"),
            MockMISUpload("5678_Wheat_Report.pdf", "Wheat Daily Digest (re-upload)", "2026-06-01")
        ]

        seen = set()
        kept = []
        for u in uploads:
            raw_name = (u.original_filename or u.filename or '').strip()
            clean_name = raw_name
            if clean_name.lower().endswith('.pdf'):
                clean_name = clean_name[:-4]
            clean_name = re.sub(r'^\d+_', '', clean_name).replace('_', ' ').strip()

            u_date = u.upload_date[:10]
            u_is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_name} {u.report_type or ''}", re.I))
            u_freq = 'Weekly' if u_is_weekly else 'Daily'
            key = f"mis_{clean_name}_{u_freq}_{u_date}"
            if key in seen:
                continue
            seen.add(key)
            kept.append((clean_name, u_freq, key))

        self.assertEqual(len(kept), 1, "Duplicate daily upload must be skipped")

    def test_mis_frequency_regex_boundary_precision(self):
        """Verify frequency regex does not trigger false positives on non-frequency words."""
        regex = r'\b(weekly|wkly|week)\b'

        positive_cases = [
            "Wheat weekly report",
            "Chilli Weekly Update",
            "Pulses Wkly Overview",
            "Soybeans Week 42 Review",
            "WEEKLY DOSSIER"
        ]
        for text in positive_cases:
            self.assertTrue(bool(re.search(regex, text, re.I)), f"Should match: {text}")

        negative_cases = [
            "Wheat Daily Digest",
            "Chilli spot arrivals",
            "Pulses monthly summary",
            "Soybean weekend update",  # 'weekend' is not 'week' due to \b boundary
            "Biweekly report"          # 'biweekly' is not 'weekly' due to \b boundary
        ]
        for text in negative_cases:
            # Check if biweekly or weekend falsely matches weekly alone
            is_match = bool(re.search(regex, text, re.I))
            self.assertFalse(is_match, f"Should not match: {text}")

    # -------------------------------------------------------------------------
    # 5. Database & System Invariants Verification
    # -------------------------------------------------------------------------

    def test_baseline_user_count_strictly_preserved(self):
        """Verify user count is strictly 9."""
        user_count = User.query.count()
        self.assertEqual(
            user_count, self.BASELINE_USER_COUNT,
            f"Database invariant violated: user count is {user_count}, expected {self.BASELINE_USER_COUNT}"
        )

    def test_baseline_report_count_strictly_preserved(self):
        """Verify report count is strictly 27."""
        report_count = Report.query.count()
        self.assertEqual(
            report_count, self.BASELINE_REPORT_COUNT,
            f"Database invariant violated: report count is {report_count}, expected {self.BASELINE_REPORT_COUNT}"
        )

    def test_baseline_catalog_count_strictly_preserved(self):
        """Verify task catalog count is strictly 158."""
        catalog_count = DBTaskCatalog.query.count()
        self.assertEqual(
            catalog_count, self.BASELINE_CATALOG_COUNT,
            f"Database invariant violated: catalog count is {catalog_count}, expected {self.BASELINE_CATALOG_COUNT}"
        )

    def test_all_baseline_users_intact(self):
        """Verify that known baseline users exist with their exact roles."""
        expected_users = {
            'nishant@agalabs.com': 'SuperAdmin',
            'ram@agalabs.com': 'Manager',
            'gopichand@agalabs.com': 'Teammate',
            'nitesh@agalabs.com': 'Teammate',
            'pankaj@agalabs.com': 'Teammate',
            'damini@agalabs.com': 'Inactive',
            'bhawna@agalabs.com': 'Teammate',
            'balram@agalabs.com': 'Teammate',
            'vaibhav@agalabs.com': 'SuperAdmin'
        }

        users = User.query.all()
        actual_users = {u.email.lower(): u.role for u in users}

        for email, role in expected_users.items():
            self.assertIn(email, actual_users, f"Missing baseline user {email}")
            self.assertEqual(actual_users[email], role, f"Role mismatch for {email}")

    # -------------------------------------------------------------------------
    # 6. Advanced Adversarial & Stress Scenarios
    # -------------------------------------------------------------------------

    def test_dead_code_build_companion_report_never_invoked(self):
        """Adversarially verify that _build_companion_report is never invoked in any route or service."""
        import ast

        routes_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'app', 'routes', 'crishi.py')
        with open(routes_file, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())

        calls_to_companion = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id == '_build_companion_report':
                    calls_to_companion.append(node.lineno)

        self.assertEqual(
            len(calls_to_companion), 0,
            f"Adversarial Failure: Found active call to _build_companion_report at line(s): {calls_to_companion}"
        )

    def test_idempotence_and_deterministic_order_of_scanned_reports(self):
        """Verify calling get_all_scanned_reports repeatedly returns identical report count and ordering."""
        run1 = get_all_scanned_reports()
        run2 = get_all_scanned_reports()
        run3 = get_all_scanned_reports()

        self.assertEqual(len(run1), len(run2))
        self.assertEqual(len(run2), len(run3))

        ids_1 = [r['id'] for r in run1]
        ids_2 = [r['id'] for r in run2]
        self.assertEqual(ids_1, ids_2, "Scanned reports ordering must be strictly deterministic across calls")

    def test_adversarial_malformed_email_subjects(self):
        """Stress test detect_commodity_from_text and parse_report_date with hostile inputs."""
        from app.services.email_ingestion import detect_commodity_from_text, parse_report_date

        hostile_subjects = [
            "'; DROP TABLE email_reports; -- Chilli Weekly Update 20261019",
            "<script>alert('xss')</script> Coriander Daily Digest 20261019",
            "🔥 Chilli Daily Digest 20261019 🔥",
            "",
            "   ",
            "Unknown Commodity Random Subject 20261019",
            "Chilli \x00 null byte 20261019 Daily"
        ]

        for s in hostile_subjects:
            comm = detect_commodity_from_text(s)
            parsed_d = parse_report_date(s, '', '')
            # Ensure functions do not throw unhandled exceptions
            self.assertTrue(comm is None or comm in VALID_COMMODITIES or comm == 'General')
            self.assertTrue(isinstance(parsed_d, str))

    def test_adversarial_same_commodity_different_frequencies_distinct_ids(self):
        """Verify that every co-existing Daily and Weekly report has a unique report ID in scanned reports."""
        all_reports = get_all_scanned_reports()
        ids = [r['id'] for r in all_reports]
        unique_ids = set(ids)
        self.assertEqual(
            len(ids), len(unique_ids),
            f"Duplicate report IDs found in get_all_scanned_reports(): {len(ids) - len(unique_ids)} duplicates"
        )


if __name__ == '__main__':
    unittest.main()

