"""
Adversarial Verification Suite for Requirements R2 & R3
=========================================================
Adversarial Challenger: teamwork_challenger (critic, specialist)
Validates:
1. Update History Commodity Filter & Alias Resolution across all 16 commodity families.
2. Adversarial Substring Collision Immunity (Tur vs Futures/Structure/Departure/Matured/Turmeric, Rice vs Prices, Non-existent tokens).
3. Client-Side Word Boundary Precision & Zero Turmeric/Prices False Positives on Scanned Reports.
4. Strict Teammate Scoping on Update History and Market Reports.
5. Database Invariants: Strictly 9 users, 27 reports, 158 catalog entries.
"""

import re
import unittest
import json
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import User, Report, DBTaskCatalog, TableUpdateHistory


class TestCommodityUpdateHistoryAliases(unittest.TestCase):
    """Stress-test GET /api/crishi/update-history?commodity=<query> across all major commodities and aliases."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls.admin_token = create_access_token(
                identity='vaibhav@agalabs.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            cls.headers = {'Authorization': f'Bearer {cls.admin_token}'}

    def _query(self, commodity):
        resp = self.client.get(
            f'/api/crishi/update-history?commodity={commodity}&limit=1000',
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, f"Query failed for commodity '{commodity}'")
        data = resp.get_json()
        self.assertTrue(data.get('success'), f"Success was not true for '{commodity}'")
        return data

    def test_all_16_canonical_commodities_non_zero(self):
        """Assert all 16 canonical commodities return > 0 records in update history."""
        canonical_16 = [
            'Pulses', 'Soybeans', 'Maize', 'Wheat', 'Rice', 'Rapeseed',
            'Chilli', 'Coriander', 'Cumin', 'Turmeric', 'Bajra', 'Barley',
            'Cotton', 'Sugar', 'Tops', 'Weather'
        ]
        for comm in canonical_16:
            data = self._query(comm)
            cnt = data.get('count', 0)
            self.assertGreater(cnt, 0, f"Canonical commodity '{comm}' returned 0 records in update history")

    def test_pulse_subcommodities_and_aliases(self):
        """Stress-test all pulse sub-commodities and aliases."""
        pulse_aliases = [
            'Chana', 'Chickpea', 'Bengal Gram',
            'Tur', 'Arhar', 'Pigeon Pea', 'Toor',
            'Urad', 'Black Matpe',
            'Moong', 'Green Gram',
            'Masoor', 'Lentil',
            'Pea', 'Pulses'
        ]
        counts = {}
        for alias in pulse_aliases:
            data = self._query(alias)
            cnt = data.get('count', 0)
            self.assertGreater(cnt, 0, f"Pulse alias '{alias}' returned 0 records")
            counts[alias] = cnt

        # Canonical equivalence checks:
        self.assertEqual(counts['Chana'], counts['Chickpea'])
        self.assertEqual(counts['Chana'], counts['Bengal Gram'])
        self.assertEqual(counts['Tur'], counts['Arhar'])
        self.assertEqual(counts['Tur'], counts['Pigeon Pea'])
        self.assertEqual(counts['Tur'], counts['Toor'])
        self.assertEqual(counts['Urad'], counts['Black Matpe'])
        self.assertEqual(counts['Moong'], counts['Green Gram'])
        self.assertEqual(counts['Masoor'], counts['Lentil'])

    def test_oilseed_aliases(self):
        """Stress-test oilseed aliases: Mustard, Canola, Sarson, Rai, Rapeseed, Soybean, Soybeans, SOPA."""
        mustard = self._query('Mustard')
        canola = self._query('Canola')
        sarson = self._query('Sarson')
        rai = self._query('Rai')
        rapeseed = self._query('Rapeseed')
        self.assertGreater(mustard['count'], 0)
        self.assertEqual(mustard['count'], canola['count'])
        self.assertEqual(mustard['count'], sarson['count'])
        self.assertEqual(mustard['count'], rai['count'])
        self.assertEqual(mustard['count'], rapeseed['count'])

        soybean = self._query('Soybean')
        soybeans = self._query('Soybeans')
        sopa = self._query('SOPA')
        self.assertGreater(soybeans['count'], 0)
        self.assertEqual(soybean['count'], soybeans['count'])
        self.assertEqual(soybeans['count'], sopa['count'])

    def test_grain_aliases(self):
        """Stress-test grain aliases: Corn, Makka, Maize, Gehun, Wheat, Paddy, Rice, Millet, Bajra, Jau, Barley."""
        corn = self._query('Corn')
        makka = self._query('Makka')
        maize = self._query('Maize')
        self.assertGreater(corn['count'], 0)
        self.assertEqual(corn['count'], maize['count'])
        self.assertEqual(makka['count'], maize['count'])

        wheat = self._query('Wheat')
        gehun = self._query('Gehun')
        self.assertGreater(wheat['count'], 0)
        self.assertEqual(wheat['count'], gehun['count'])

        rice = self._query('Rice')
        paddy = self._query('Paddy')
        self.assertGreater(rice['count'], 0)
        self.assertEqual(rice['count'], paddy['count'])

        bajra = self._query('Bajra')
        millet = self._query('Millet')
        self.assertGreater(bajra['count'], 0)
        self.assertEqual(bajra['count'], millet['count'])

        barley = self._query('Barley')
        jau = self._query('Jau')
        self.assertGreater(barley['count'], 0)
        self.assertEqual(barley['count'], jau['count'])

    def test_spice_and_other_aliases(self):
        """Stress-test spice and other commodity aliases: Jeera/Cumin, Dhaniya/Coriander, Chilli/Chili, Haldi/Turmeric, Kapas/Cotton, Sugarcane/Sugar."""
        jeera = self._query('Jeera')
        cumin = self._query('Cumin')
        jira = self._query('Jira')
        self.assertGreater(cumin['count'], 0)
        self.assertEqual(jeera['count'], cumin['count'])
        self.assertEqual(jira['count'], cumin['count'])

        dhaniya = self._query('Dhaniya')
        dhania = self._query('Dhania')
        coriander = self._query('Coriander')
        self.assertGreater(coriander['count'], 0)
        self.assertEqual(dhaniya['count'], coriander['count'])
        self.assertEqual(dhania['count'], coriander['count'])

        chilli = self._query('Chilli')
        chili = self._query('Chili')
        self.assertGreater(chilli['count'], 0)
        self.assertEqual(chilli['count'], chili['count'])

        turmeric = self._query('Turmeric')
        haldi = self._query('Haldi')
        self.assertGreater(turmeric['count'], 0)
        self.assertEqual(turmeric['count'], haldi['count'])

        cotton = self._query('Cotton')
        kapas = self._query('Kapas')
        self.assertGreater(cotton['count'], 0)
        self.assertEqual(cotton['count'], kapas['count'])

        sugar = self._query('Sugar')
        sugarcane = self._query('Sugarcane')
        self.assertGreater(sugar['count'], 0)
        self.assertEqual(sugar['count'], sugarcane['count'])

    def test_vegetable_aliases(self):
        """Stress-test vegetable aliases: Tomato, Potato, Onion, Tops."""
        tomato = self._query('Tomato')
        potato = self._query('Potato')
        onion = self._query('Onion')
        tops = self._query('Tops')

        self.assertGreater(tomato['count'], 0)
        self.assertGreater(potato['count'], 0)
        self.assertGreater(onion['count'], 0)
        self.assertGreater(tops['count'], 0)
        self.assertEqual(tomato['count'], potato['count'])
        self.assertEqual(potato['count'], onion['count'])
        self.assertGreaterEqual(tops['count'], tomato['count'])

    def test_weather_aliases(self):
        """Stress-test weather aliases: Monsoon, Rainfall, GIS, Weather."""
        monsoon = self._query('Monsoon')
        rainfall = self._query('Rainfall')
        gis = self._query('GIS')
        weather = self._query('Weather')

        self.assertGreater(weather['count'], 0)
        self.assertEqual(monsoon['count'], rainfall['count'])
        self.assertEqual(rainfall['count'], gis['count'])
        self.assertEqual(gis['count'], weather['count'])


class TestAdversarialSubstringCollisionImmunity(unittest.TestCase):
    """Stress-test regex word boundaries and immunity to substring collision false positives."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls.admin_token = create_access_token(
                identity='vaibhav@agalabs.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            cls.headers = {'Authorization': f'Bearer {cls.admin_token}'}

    def test_tur_collision_immunity(self):
        """Assert Tur matches pulse records and does NOT match records containing
        'Futures', 'Structure', 'Departure', 'Matured', or 'Turmeric' without genuine Tur content."""
        resp = self.client.get('/api/crishi/update-history?commodity=Tur&limit=1000', headers=self.headers)
        data = resp.get_json()
        records = data.get('records', [])
        self.assertGreater(len(records), 0, "Tur query should return records")

        tur_allowed_tokens = {'tur', 'arhar', 'toor', 'pigeon', 'pulse', 'pulses'}

        for r in records:
            comm = (r.get('commodity') or '').lower()
            fn = (r.get('final_name') or '').lower()

            # Must NEVER match Turmeric
            self.assertNotIn('turmeric', comm, f"Turmeric record leaked into Tur query: {r}")
            self.assertNotIn('turmeric', fn, f"Turmeric record leaked into Tur query: {r}")

            # Check for substring collision triggers
            for collision_word in ['futures', 'structure', 'departure', 'matured']:
                if collision_word in fn or collision_word in comm:
                    # If this collision word is present, it must be because genuine Tur/Arhar is present
                    has_legit_tur = any(tok in fn or tok in comm for tok in tur_allowed_tokens)
                    self.assertTrue(
                        has_legit_tur,
                        f"False positive collision: '{collision_word}' matched without genuine Tur tokens in record: {r}"
                    )

    def test_rice_collision_immunity(self):
        """Assert Rice does NOT match non-rice records containing 'Prices'."""
        resp = self.client.get('/api/crishi/update-history?commodity=Rice&limit=1000', headers=self.headers)
        data = resp.get_json()
        records = data.get('records', [])
        self.assertGreater(len(records), 0, "Rice query should return records")

        rice_allowed_tokens = {'rice', 'paddy', 'chawal', 'basmati'}
        for r in records:
            comm = (r.get('commodity') or '').lower()
            fn = (r.get('final_name') or '').lower()
            if 'prices' in fn or 'prices' in comm or 'price' in fn or 'price' in comm:
                has_legit_rice = any(tok in fn or tok in comm for tok in rice_allowed_tokens)
                self.assertTrue(
                    has_legit_rice,
                    f"False positive collision: 'Prices' matched without genuine Rice token in record: {r}"
                )

    def test_nonexistent_commodity_zero_records(self):
        """Assert query for non-existent commodity returns count == 0 and total == 0."""
        for ghost in ['NonExistentKryptonite', 'UnobtainiumXYZ99', 'FakeCropAlpha']:
            resp = self.client.get(f'/api/crishi/update-history?commodity={ghost}', headers=self.headers)
            data = resp.get_json()
            self.assertEqual(data.get('count'), 0, f"Ghost commodity '{ghost}' returned count > 0")
            self.assertEqual(data.get('total'), 0, f"Ghost commodity '{ghost}' returned total > 0")
            self.assertEqual(data.get('records'), [], f"Ghost commodity '{ghost}' returned non-empty records")

    def test_case_and_whitespace_insensitivity(self):
        """Assert mixed case and padded whitespace produce identical results."""
        clean = self.client.get('/api/crishi/update-history?commodity=Chana&limit=1000', headers=self.headers).get_json()
        mixed = self.client.get('/api/crishi/update-history?commodity=cHaNa&limit=1000', headers=self.headers).get_json()
        padded = self.client.get('/api/crishi/update-history?commodity=%20Chana%20&limit=1000', headers=self.headers).get_json()

        self.assertEqual(clean['count'], mixed['count'])
        self.assertEqual(clean['count'], padded['count'])


class TestClientSideReportFilteringPrecision(unittest.TestCase):
    """Stress-test client-side report filtering precision in app/static/js/report.js against live & synthetic data."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls.admin_token = create_access_token(
                identity='vaibhav@agalabs.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            cls.headers = {'Authorization': f'Bearer {cls.admin_token}'}
            resp = cls.client.get('/api/crishi/reports/all', headers=cls.headers).get_json()
            cls.live_reports = resp.get('reports', [])

    @staticmethod
    def _client_side_filter(reports, comm='ALL', freq='ALL', search=''):
        """Exact Python port of report.js getFilteredHistoryReports logic."""
        escape_regex = lambda s: re.escape(s or '')
        match_word = lambda text, token: bool(re.search(r'(^|[^a-zA-Z])' + escape_regex(token) + r'([^a-zA-Z]|$)', text or '', re.I))

        pulse_subs = ['bengal gram', 'chana', 'chickpea', 'tur', 'arhar', 'toor', 'pigeon pea', 'urad', 'black matpe', 'moong', 'mung', 'green gram', 'masoor', 'lentil', 'pea', 'peas']
        pulse_sub_aliases = {
            'bengal gram': ['bengal gram', 'chana', 'chickpea'],
            'chana': ['bengal gram', 'chana', 'chickpea'],
            'tur': ['tur', 'arhar', 'toor', 'pigeon pea'],
            'urad': ['urad', 'black matpe'],
            'moong': ['moong', 'mung', 'green gram'],
            'masoor': ['masoor', 'lentil'],
            'pea': ['pea', 'peas']
        }
        comm_lower = comm.lower()
        res = []

        for r in reports:
            r_cat = (r.get('category') or '').lower()
            r_name = (r.get('report_name') or '').lower()
            r_subj = (r.get('subject') or '').lower()

            if comm != 'ALL':
                if comm_lower == 'pulses':
                    is_pulse = r_cat == 'pulses' or any(r_cat == s or match_word(r_name, s) or match_word(r_subj, s) for s in pulse_subs)
                    if not is_pulse:
                        continue
                elif comm_lower in pulse_subs:
                    match_tokens = pulse_sub_aliases.get(comm_lower, [comm_lower])
                    match_sub = any(r_cat == tok or match_word(r_name, tok) or match_word(r_subj, tok) for tok in match_tokens)
                    match_gen_pulse = (r_cat == 'pulses') and any(match_word(r_name, tok) or match_word(r_subj, tok) for tok in match_tokens)
                    if not match_sub and not match_gen_pulse:
                        continue
                elif comm_lower in ('rapeseed', 'mustard'):
                    match_rape = r_cat in ('rapeseed', 'mustard') or any(match_word(r_name, t) or match_word(r_subj, t) for t in ('rapeseed', 'mustard'))
                    if not match_rape:
                        continue
                elif comm_lower in ('maize', 'corn'):
                    match_maize = r_cat in ('maize', 'corn') or any(match_word(r_name, t) or match_word(r_subj, t) for t in ('maize', 'corn'))
                    if not match_maize:
                        continue
                elif comm_lower in ('cumin', 'jeera'):
                    match_cumin = r_cat in ('cumin', 'jeera') or any(match_word(r_name, t) or match_word(r_subj, t) for t in ('cumin', 'jeera'))
                    if not match_cumin:
                        continue
                elif comm_lower in ('coriander', 'dhaniya'):
                    match_coriander = r_cat in ('coriander', 'dhaniya') or any(match_word(r_name, t) or match_word(r_subj, t) for t in ('coriander', 'dhaniya'))
                    if not match_coriander:
                        continue
                elif comm_lower in ('tops', 'tomato', 'potato', 'onion'):
                    match_tops = r_cat in ('tops', 'tomato', 'potato', 'onion') or any(match_word(r_name, t) or match_word(r_subj, t) for t in ('tops', 'tomato', 'potato', 'onion'))
                    if not match_tops:
                        continue
                else:
                    match_other = r_cat == comm_lower or match_word(r_name, comm_lower) or match_word(r_subj, comm_lower)
                    if not match_other:
                        continue

            if freq != 'ALL':
                is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{r.get('report_name', '')} {r.get('subject', '')}", re.I))
                r_freq = 'Weekly' if is_weekly else 'Daily'
                if r_freq != freq:
                    continue

            if search:
                combined = f"{r.get('report_name', '')} {r.get('subject', '')} {r.get('sender', '')} {r.get('category', '')} {r.get('date', '')}".lower()
                if search.lower() not in combined:
                    continue

            res.append(r)
        return res

    def test_live_scanned_reports_pulses_and_tur_zero_turmeric_leakage(self):
        """Assert zero Turmeric leakage when querying Pulses or Tur across all 354 live reports."""
        pulses_filtered = self._client_side_filter(self.live_reports, comm='Pulses')
        tur_filtered = self._client_side_filter(self.live_reports, comm='Tur')
        turmeric_filtered = self._client_side_filter(self.live_reports, comm='Turmeric')

        self.assertEqual(len(pulses_filtered), 64, f"Expected exactly 64 Pulses reports, got {len(pulses_filtered)}")
        self.assertEqual(len(tur_filtered), 2, f"Expected exactly 2 Tur reports, got {len(tur_filtered)}")
        self.assertEqual(len(turmeric_filtered), 31, f"Expected 31 Turmeric reports, got {len(turmeric_filtered)}")

        # Check zero Turmeric leakage into Pulses
        turmeric_in_pulses = [r for r in pulses_filtered if (r.get('category') or '').lower() == 'turmeric']
        self.assertEqual(len(turmeric_in_pulses), 0, f"Turmeric leaked into Pulses: {turmeric_in_pulses}")

        # Check zero Turmeric leakage into Tur
        turmeric_in_tur = [r for r in tur_filtered if (r.get('category') or '').lower() == 'turmeric']
        self.assertEqual(len(turmeric_in_tur), 0, f"Turmeric leaked into Tur: {turmeric_in_tur}")

        # Check exact Tur reports
        tur_names = [r.get('report_name') for r in tur_filtered]
        self.assertIn('IPGA Weekly Tur Update - 12 Oct 2026', tur_names)
        self.assertIn('IPGA Weekly Tur Update - 05 Oct 2026', tur_names)

    def test_live_scanned_reports_rice_zero_prices_false_positives(self):
        """Assert Rice returns exactly 37 genuine reports with zero false positive matches from Prices."""
        rice_filtered = self._client_side_filter(self.live_reports, comm='Rice')
        self.assertEqual(len(rice_filtered), 37, f"Expected exactly 37 Rice reports, got {len(rice_filtered)}")

        for r in rice_filtered:
            cat = (r.get('category') or '').lower()
            name = (r.get('report_name') or '').lower()
            subj = (r.get('subject') or '').lower()
            # Must be either category rice or have genuine rice token
            is_genuine = (cat == 'rice') or ('rice' in name or 'rice' in subj or 'paddy' in name or 'paddy' in subj)
            self.assertTrue(is_genuine, f"Non-rice report matched in Rice filter: {r}")

    def test_quick_pill_counts_exact_match(self):
        """Assert quick pill count calculation in report.js line 427 matches exact category count."""
        # report.js line 427:
        # this.reports.filter(r => (r.category || '').toLowerCase() === c.toLowerCase() || (c === 'Pulses' && ((r.category || '').toLowerCase() === 'pulses' || ['chana','tur','urad','moong','masoor','pea'].some(s => (r.category||'').toLowerCase() === s)))).length
        pulse_pill_count = len([
            r for r in self.live_reports
            if (r.get('category') or '').lower() == 'pulses' or (
                (r.get('category') or '').lower() == 'pulses' or any(
                    (r.get('category') or '').lower() == s for s in ['chana', 'tur', 'urad', 'moong', 'masoor', 'pea']
                )
            )
        ])
        self.assertEqual(pulse_pill_count, 64, f"Quick pill count for Pulses was {pulse_pill_count}, expected 64")

        turmeric_pill_count = len([
            r for r in self.live_reports
            if (r.get('category') or '').lower() == 'turmeric'
        ])
        self.assertEqual(turmeric_pill_count, 30, f"Quick pill count for Turmeric was {turmeric_pill_count}, expected 30")

    def test_adversarial_synthetic_collision_edge_cases(self):
        """Construct synthetic adversarial documents with tricky substring and punctuation combinations."""
        synthetic_dossiers = [
            {'category': 'Turmeric', 'report_name': 'Turmeric Daily Dossier 2026', 'subject': 'Haldi Market Trends'},
            {'category': 'General', 'report_name': 'Futures and Options Overview', 'subject': 'Derivatives Trading'},
            {'category': 'Logistics', 'report_name': 'Structure of Western Railway Rakes', 'subject': 'Freight Departure'},
            {'category': 'Wheat', 'report_name': 'Matured Wheat Crops in Haryana', 'subject': 'Harvest Survey'},
            {'category': 'Macro', 'report_name': 'Daily Wholesale Spot Prices Index', 'subject': 'CPI and Inflation Prices'},
            {'category': 'Wheat', 'report_name': 'Wheat Mandi Prices and Arrivals', 'subject': 'Punjab Prices'},
            {'category': 'Pulses', 'report_name': 'IPGA Weekly Tur Update - 19 Oct 2026', 'subject': 'Pigeon Pea Overview'},
            {'category': 'Pulses', 'report_name': 'Arhar / Tur Daily Mandi Pricing', 'subject': 'Desi Tur Bulletin'},
            {'category': 'Pulses', 'report_name': '(Tur) Special Export Bulletin', 'subject': 'Red Gram Shipments'},
            {'category': 'Rice', 'report_name': 'Basmati Rice Export Prices & Rakes', 'subject': 'Paddy & Rice Spot Prices'},
            {'category': 'Rice', 'report_name': 'Karnal Rice Market Daily Digest', 'subject': 'Daily Rice Update'},
        ]

        # Query Tur:
        tur_res = self._client_side_filter(synthetic_dossiers, comm='Tur')
        tur_names = [r['report_name'] for r in tur_res]
        self.assertIn('IPGA Weekly Tur Update - 19 Oct 2026', tur_names)
        self.assertIn('Arhar / Tur Daily Mandi Pricing', tur_names)
        self.assertIn('(Tur) Special Export Bulletin', tur_names)
        self.assertNotIn('Turmeric Daily Dossier 2026', tur_names)
        self.assertNotIn('Futures and Options Overview', tur_names)
        self.assertNotIn('Structure of Western Railway Rakes', tur_names)
        self.assertNotIn('Matured Wheat Crops in Haryana', tur_names)

        # Query Pulses:
        pulses_res = self._client_side_filter(synthetic_dossiers, comm='Pulses')
        pulses_names = [r['report_name'] for r in pulses_res]
        self.assertIn('IPGA Weekly Tur Update - 19 Oct 2026', pulses_names)
        self.assertIn('Arhar / Tur Daily Mandi Pricing', pulses_names)
        self.assertIn('(Tur) Special Export Bulletin', pulses_names)
        self.assertNotIn('Turmeric Daily Dossier 2026', pulses_names)

        # Query Rice:
        rice_res = self._client_side_filter(synthetic_dossiers, comm='Rice')
        rice_names = [r['report_name'] for r in rice_res]
        self.assertIn('Basmati Rice Export Prices & Rakes', rice_names)
        self.assertIn('Karnal Rice Market Daily Digest', rice_names)
        # Verify non-rice price reports are rejected
        self.assertNotIn('Daily Wholesale Spot Prices Index', rice_names)
        self.assertNotIn('Wheat Mandi Prices and Arrivals', rice_names)


class TestTeammateScopingAdversarial(unittest.TestCase):
    """Stress-test role-based scoping on update history and market reports for Teammates."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls.admin_token = create_access_token(
                identity='vaibhav@agalabs.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            cls.gopi_token = create_access_token(
                identity='gopichand@agalabs.com',
                additional_claims={'role': 'Teammate'}
            )
            cls.bhawna_token = create_access_token(
                identity='bhawna@agalabs.com',
                additional_claims={'role': 'Teammate'}
            )
            cls.pankaj_token = create_access_token(
                identity='pankaj@agalabs.com',
                additional_claims={'role': 'Teammate'}
            )

    def test_teammate_cannot_access_unowned_history(self):
        """Teammates querying update-history only see their own records, even when attempting teammate parameter bypass."""
        gopi_headers = {'Authorization': f'Bearer {self.gopi_token}'}

        # Gopi's base update history
        resp = self.client.get('/api/crishi/update-history?limit=1000', headers=gopi_headers)
        data = resp.get_json()
        self.assertTrue(data.get('success'))
        records = data.get('records', [])
        self.assertGreater(len(records), 0)
        for r in records:
            self.assertEqual(r['person_name'].lower(), 'gopi', f"Leaked record not belonging to Gopi: {r}")

        # Adversarial bypass attempt: Gopi passes ?teammate=Bhawna
        bypass_resp = self.client.get('/api/crishi/update-history?teammate=Bhawna&limit=1000', headers=gopi_headers)
        bypass_data = bypass_resp.get_json()
        bypass_records = bypass_data.get('records', [])
        for r in bypass_records:
            self.assertEqual(
                r['person_name'].lower(), 'gopi',
                f"Teammate successfully spoofed another user's update history: {r}"
            )
        self.assertEqual(len(records), len(bypass_records))

    def test_teammate_unassigned_commodity_history(self):
        """Teammate querying an unassigned commodity in update-history receives 0 records."""
        gopi_headers = {'Authorization': f'Bearer {self.gopi_token}'}
        # Gopi owns Rice & Wheat, NOT Soybeans or Pulses
        resp = self.client.get('/api/crishi/update-history?commodity=Soybeans', headers=gopi_headers)
        data = resp.get_json()
        self.assertEqual(data.get('count'), 0, f"Gopi saw records for unassigned Soybeans: {data.get('count')}")

        resp_pulse = self.client.get('/api/crishi/update-history?commodity=Chana', headers=gopi_headers)
        self.assertEqual(resp_pulse.get_json().get('count'), 0)

        # But Gopi can query Wheat
        resp_wheat = self.client.get('/api/crishi/update-history?commodity=Wheat', headers=gopi_headers)
        self.assertGreater(resp_wheat.get_json().get('count'), 0)

    def test_teammate_market_reports_scoping(self):
        """Teammates querying GET /api/crishi/reports/all only see reports within their assigned scope."""
        admin_headers = {'Authorization': f'Bearer {self.admin_token}'}
        gopi_headers = {'Authorization': f'Bearer {self.gopi_token}'}
        bhawna_headers = {'Authorization': f'Bearer {self.bhawna_token}'}
        pankaj_headers = {'Authorization': f'Bearer {self.pankaj_token}'}

        admin_data = self.client.get('/api/crishi/reports/all', headers=admin_headers).get_json()
        gopi_data = self.client.get('/api/crishi/reports/all', headers=gopi_headers).get_json()
        bhawna_data = self.client.get('/api/crishi/reports/all', headers=bhawna_headers).get_json()
        pankaj_data = self.client.get('/api/crishi/reports/all', headers=pankaj_headers).get_json()

        admin_total = admin_data.get('total', 0)
        self.assertGreaterEqual(admin_total, 350, "Admin should see full report catalog")

        # Gopi is scoped to Rice, Wheat
        self.assertLess(gopi_data.get('total', 0), admin_total)
        gopi_cats = set(r.get('category') for r in gopi_data.get('reports', []))
        self.assertTrue(gopi_cats.issubset({'Rice', 'Wheat'}), f"Gopi categories leaked outside Rice/Wheat: {gopi_cats}")

        # Bhawna is scoped to Cotton, Rapeseed, Soybeans, Weather
        self.assertLess(bhawna_data.get('total', 0), admin_total)
        bhawna_cats = set(r.get('category') for r in bhawna_data.get('reports', []))
        self.assertTrue(
            bhawna_cats.issubset({'Cotton', 'Rapeseed', 'Soybeans', 'Weather'}),
            f"Bhawna categories leaked outside assignment: {bhawna_cats}"
        )

        # Pankaj is scoped to Chilli, Coriander, Cumin, Turmeric, Weather
        self.assertLess(pankaj_data.get('total', 0), admin_total)
        pankaj_cats = set(r.get('category') for r in pankaj_data.get('reports', []))
        self.assertTrue(
            pankaj_cats.issubset({'Chilli', 'Coriander', 'Cumin', 'Turmeric', 'Weather'}),
            f"Pankaj categories leaked outside assignment: {pankaj_cats}"
        )


class TestSystemAndDatabaseInvariants(unittest.TestCase):
    """Verify strictly 9 users, 27 reports, 158 catalog mappings."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True

    def test_database_invariants(self):
        """Assert exact invariant counts for users, reports, and db task catalogs."""
        with self.app.app_context():
            u_count = User.query.count()
            r_count = Report.query.count()
            c_count = DBTaskCatalog.query.count()

            self.assertEqual(u_count, 9, f"Invariant violated: expected 9 users, found {u_count}")
            self.assertEqual(r_count, 27, f"Invariant violated: expected 27 reports, found {r_count}")
            self.assertEqual(c_count, 158, f"Invariant violated: expected 158 catalogs, found {c_count}")


if __name__ == '__main__':
    unittest.main()
