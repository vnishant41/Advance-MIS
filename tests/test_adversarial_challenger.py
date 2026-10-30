"""
Adversarial Challenger Test Suite: Crishi Role Scoping & Update History
======================================================================
Empirical verification of:
1. Role-based scoping bypass resistance (Teammates attempting ?teammate=...)
2. Mutating endpoint authorization (Strict HTTP 403 for non-admins)
3. Admin portfolio freedom (Admins viewing any teammate portfolio & ALL)
4. Parameter tampering & SQL injection resistance
5. Direct mutation rejection (HTTP 405 for PUT, POST, PATCH, DELETE on /update-history)
6. Baseline database invariants preservation
"""

import unittest
from urllib.parse import urlencode
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import User, Report, DBTaskCatalog, TableUpdateHistory


class AdversarialChallengerTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

    def get_token(self, email, role=None):
        with self.app.app_context():
            u = User.query.filter_by(email=email).first()
            r = role or (u.role if u else 'Teammate')
            return create_access_token(identity=email, additional_claims={'role': r})

    def get_headers(self, email, role=None):
        token = self.get_token(email, role)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    # =========================================================================
    # 1. ADVERSARIAL ROLE SCOPING
    # =========================================================================
    def test_teammates_cannot_bypass_scoping_with_teammate_param(self):
        """Teammates querying ?teammate=X must only see their own records, never leaked records."""
        teammates = [
            ('bhawna@agalabs.com', 'Bhawna'),
            ('gopichand@agalabs.com', 'Gopi'),
            ('nitesh@agalabs.com', 'Nitesh'),
            ('pankaj@agalabs.com', 'Pankaj')
        ]
        tamper_attempts = ['Nishant', 'ALL', 'all', 'Vaibhav', 'Ram Gopal', 'SuperAdmin', 'admin']

        for email, name in teammates:
            headers = self.get_headers(email, 'Teammate')
            for target in tamper_attempts:
                with self.subTest(teammate=name, bypass=target):
                    res = self.client.get(f'/api/crishi/update-history?teammate={target}', headers=headers)
                    self.assertEqual(res.status_code, 200)
                    data = res.get_json()
                    self.assertTrue(data.get('success'))
                    records = data.get('records', [])
                    for rec in records:
                        self.assertEqual(
                            rec.get('person_name', '').lower(),
                            name.lower(),
                            f"Scoping leak! Teammate {name} requested teammate={target} and received record belonging to {rec.get('person_name')}"
                        )

    def test_admins_can_freely_filter_any_teammate_portfolio(self):
        """SuperAdmin, Manager, and Leader can view any teammate's portfolio or all records."""
        admin_specs = [
            ('vaibhav@agalabs.com', 'SuperAdmin'),
            ('ram@agalabs.com', 'Manager'),
            ('test_e2e_leader@agalabs.com', 'Leader')
        ]

        for email, role in admin_specs:
            headers = self.get_headers(email, role)

            # Filter Bhawna
            with self.subTest(admin=role, filter='Bhawna'):
                res = self.client.get('/api/crishi/update-history?teammate=Bhawna', headers=headers)
                self.assertEqual(res.status_code, 200)
                data = res.get_json()
                self.assertTrue(data.get('success'))
                recs = data.get('records', [])
                self.assertGreater(len(recs), 0, f"Admin {role} should see Bhawna's records")
                for r in recs:
                    self.assertEqual(r.get('person_name'), 'Bhawna')

            # Filter Nishant
            with self.subTest(admin=role, filter='Nishant'):
                res = self.client.get('/api/crishi/update-history?teammate=Nishant', headers=headers)
                self.assertEqual(res.status_code, 200)
                data = res.get_json()
                self.assertTrue(data.get('success'))
                recs = data.get('records', [])
                self.assertGreater(len(recs), 0, f"Admin {role} should see Nishant's records")
                for r in recs:
                    self.assertEqual(r.get('person_name'), 'Nishant')

            # Query ALL records
            with self.subTest(admin=role, filter='ALL'):
                res = self.client.get('/api/crishi/update-history?teammate=ALL', headers=headers)
                self.assertEqual(res.status_code, 200)
                data = res.get_json()
                self.assertTrue(data.get('success'))
                recs = data.get('records', [])
                distinct_people = {r.get('person_name') for r in recs}
                self.assertGreater(len(distinct_people), 1, f"Admin {role} query ?teammate=ALL must return multiple teammates")

    # =========================================================================
    # 2. MUTATING ROUTE ACCESS CONTROL (HTTP 403)
    # =========================================================================
    def test_non_admin_mutations_strictly_rejected_with_403(self):
        """Teammates and non-admins must be rejected with HTTP 403 on mutating endpoints."""
        endpoints = [
            ('/api/crishi/pull', {'catalogId': 201, 'slaHours': 24}),
            ('/api/crishi/skip', {'catalogId': 201, 'reason': 'Challenger test skip'}),
            ('/api/crishi/manager-review', {'catalogId': 201, 'action': 'VERIFIED'}),
            ('/api/crishi/roster/weather-rotation', {'weeks': [{'week': 1, 'assignee': 'Bhawna'}]})
        ]
        non_admins = [
            ('bhawna@agalabs.com', 'Teammate'),
            ('gopichand@agalabs.com', 'Teammate'),
            ('nitesh@agalabs.com', 'Teammate'),
            ('pankaj@agalabs.com', 'Teammate'),
        ]

        for ep, payload in endpoints:
            for email, role in non_admins:
                with self.subTest(endpoint=ep, user=email):
                    headers = self.get_headers(email, role)
                    res = self.client.post(ep, headers=headers, json=payload)
                    self.assertEqual(
                        res.status_code,
                        403,
                        f"Endpoint {ep} allowed non-admin {email} ({role}) with status {res.status_code}!"
                    )
                    data = res.get_json() or {}
                    self.assertFalse(data.get('success', False))

    def test_unauthenticated_mutations_rejected_with_401(self):
        """Mutating endpoints without JWT token must return 401 Unauthorized."""
        endpoints = [
            ('/api/crishi/pull', {'catalogId': 201, 'slaHours': 24}),
            ('/api/crishi/skip', {'catalogId': 201, 'reason': 'Challenger test skip'}),
            ('/api/crishi/manager-review', {'catalogId': 201, 'action': 'VERIFIED'}),
            ('/api/crishi/roster/weather-rotation', {'weeks': [{'week': 1, 'assignee': 'Bhawna'}]})
        ]
        for ep, payload in endpoints:
            with self.subTest(endpoint=ep):
                res = self.client.post(ep, json=payload)
                self.assertEqual(res.status_code, 401)

    # =========================================================================
    # 3. DIRECT MUTATIONS ON UPDATE-HISTORY (HTTP 405)
    # =========================================================================
    def test_direct_mutations_on_update_history_return_405(self):
        """Direct mutations (PUT, POST, PATCH, DELETE) against /api/crishi/update-history must return 405."""
        methods = ['post', 'put', 'patch', 'delete']
        admin_headers = self.get_headers('vaibhav@agalabs.com', 'SuperAdmin')
        teammate_headers = self.get_headers('bhawna@agalabs.com', 'Teammate')

        for m in methods:
            func = getattr(self.client, m)
            # Authenticated admin
            with self.subTest(method=m, auth='admin'):
                res = func('/api/crishi/update-history', headers=admin_headers, json={'dummy': 1})
                self.assertEqual(res.status_code, 405, f"Method {m.upper()} did not return 405 for admin")
                data = res.get_json()
                self.assertFalse(data.get('success'))
                self.assertIn('immutable', data.get('message', '').lower())

            # Authenticated teammate
            with self.subTest(method=m, auth='teammate'):
                res = func('/api/crishi/update-history', headers=teammate_headers, json={'dummy': 1})
                self.assertEqual(res.status_code, 405, f"Method {m.upper()} did not return 405 for teammate")

            # Unauthenticated
            with self.subTest(method=m, auth='unauthenticated'):
                res = func('/api/crishi/update-history', json={'dummy': 1})
                self.assertEqual(res.status_code, 405, f"Method {m.upper()} did not return 405 for unauth")

    # =========================================================================
    # 4. BOUNDARY & INJECTION TESTING
    # =========================================================================
    def test_sql_injection_resistance_in_update_history_filters(self):
        """SQL injection attacks in query parameters must not break query or leak data."""
        sqli_payloads = [
            "' OR '1'='1",
            "Bhawna'--",
            "' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12--",
            "'; DROP TABLE table_update_history; --",
            "1' AND SLEEP(2) AND '1'='1",
            "\" OR \"\"=\"",
            "admin'/*",
        ]
        admin_headers = self.get_headers('vaibhav@agalabs.com', 'SuperAdmin')
        tm_headers = self.get_headers('bhawna@agalabs.com', 'Teammate')

        for attack in sqli_payloads:
            with self.subTest(attack=attack):
                params = {
                    'teammate': attack,
                    'commodity': attack,
                    'status': attack,
                    'search': attack
                }
                qs = urlencode(params)

                # Test against admin
                res_admin = self.client.get(f'/api/crishi/update-history?{qs}', headers=admin_headers)
                self.assertEqual(res_admin.status_code, 200, f"Admin query crashed on SQLi payload: {attack}")
                data_admin = res_admin.get_json()
                self.assertTrue(data_admin.get('success'))

                # Test against teammate
                res_tm = self.client.get(f'/api/crishi/update-history?{qs}', headers=tm_headers)
                self.assertEqual(res_tm.status_code, 200, f"Teammate query crashed on SQLi payload: {attack}")
                data_tm = res_tm.get_json()
                self.assertTrue(data_tm.get('success'))
                # Crucial check: Even with SQLi payload in ?teammate, teammate only receives Bhawna records!
                for r in data_tm.get('records', []):
                    self.assertEqual(
                        r.get('person_name', '').lower(),
                        'bhawna',
                        f"SQL injection caused scoping breach for teammate! Got record for {r.get('person_name')}"
                    )

    def test_tampered_limits_offsets_dates_handled_gracefully(self):
        """Edge-case / tampered pagination and date boundaries must be sanitized without 500 errors."""
        admin_headers = self.get_headers('vaibhav@agalabs.com', 'SuperAdmin')
        cases = [
            {'limit': '-10'},
            {'limit': '0'},
            {'limit': 'abc'},
            {'offset': '-50'},
            {'offset': 'xyz'},
            {'date_from': 'not-a-date'},
            {'date_to': '9999-99-99'},
            {'date_from': '2026-02-31'},  # Invalid calendar day
            {'date_from': '2026/01/01'},  # Wrong format
            {'limit': '1', 'offset': '0'},
            {'search': 'a' * 500},        # Very long search string
        ]
        for c in cases:
            with self.subTest(case=c):
                qs = urlencode(c)
                res = self.client.get(f'/api/crishi/update-history?{qs}', headers=admin_headers)
                self.assertEqual(res.status_code, 200, f"Server returned {res.status_code} for query params {c}")
                data = res.get_json()
                self.assertTrue(data.get('success'))
                self.assertIsInstance(data.get('records'), list)
                self.assertIsInstance(data.get('total'), int)

    # =========================================================================
    # 5. DATABASE INVARIANTS PRESERVATION
    # =========================================================================
    def test_database_invariants_preserved(self):
        """Zero data loss: Users=9, Reports=27, Catalogs=158."""
        with self.app.app_context():
            u_count = User.query.count()
            r_count = Report.query.count()
            c_count = DBTaskCatalog.query.count()

            self.assertEqual(u_count, 9, f"User count drifted to {u_count}, expected 9")
            self.assertEqual(r_count, 27, f"Report count drifted to {r_count}, expected 27")
            self.assertEqual(c_count, 158, f"Catalog count drifted to {c_count}, expected 158")


if __name__ == '__main__':
    unittest.main()
