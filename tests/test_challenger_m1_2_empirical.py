"""
Empirical Challenger Test Suite for Milestone 1: Backend Role Scoping & Auth Hierarchy (R1)
Targeted at:
1. Boundary conditions on /api/crishi/grid:
   - No token (dev mode fallback returns full grid)
   - Malformed Bearer tokens (non-JWT, bad base64, garbage strings return 401/422)
   - Expired tokens (return 401 Unauthorized)
   - Non-existent user emails:
     * With explicit Teammate claim -> strictly scoped to 0 tasks, 1 teammate chip
     * Without claim -> falls back to dev mode
   - Deactivated user emails:
     * Inactive user with Teammate claim -> scoped to 0 tasks, 1 chip
     * Inactive user on mutating admin routes -> 401/403 blocked
2. Comma-separated assignees and weather rotation edge cases:
   - Multi-user tables (e.g. pyexcel_market_report with 'Nishant, Bhawna, Pankaj, Nitesh, Gopi')
   - Accessible by every assigned teammate (Bhawna, Pankaj, Nitesh, Gopichand)
   - Completely blocked from non-assigned teammates
   - Weather rotation:
     * Dedicated weather tables (commodity == 'Weather') accessible to Bhawna (assigned Weather)
     * Strictly blocked from teammates with no weather duties (e.g. Gopichand)
3. Teammate isolation assertions:
   - summary['teammates'] length is exactly 1 for Teammates
   - summary['teammates'] length >= 5 for Admins
   - Teammate cannot see other teammates' chip/data
4. Summary math consistency:
   - For Teammates: total_tasks == completed + pending == updated_today + pending_action == len(tasks)
   - For Admins: total_tasks == len(tasks) == 140
   - completion_pct == round(completed / total_tasks * 100)
   - cadence totals sum to total_tasks
5. Invariant preservation:
   - Exactly 9 users, 27 reports, 158 catalog mappings
"""
import unittest
from datetime import datetime, date, timedelta, timezone
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import User, Report, DBTaskCatalog, AppSetting
from app.auth import is_admin_role, ADMIN_ROLES


class TestChallengerM1Empirical(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.client = cls.app.test_client()

    def test_01_db_invariants_preserved(self):
        """Invariant preservation: Verify exactly 9 users, 27 reports, 158 catalog items."""
        with self.app.app_context():
            user_count = User.query.count()
            report_count = Report.query.count()
            catalog_count = DBTaskCatalog.query.count()

            self.assertEqual(user_count, 9, f"Expected 9 users, found {user_count}")
            self.assertEqual(report_count, 27, f"Expected 27 reports, found {report_count}")
            self.assertEqual(catalog_count, 158, f"Expected 158 catalog items, found {catalog_count}")

    def test_02_boundary_no_token_grid(self):
        """Boundary: Query /api/crishi/grid with no token. Dev mode returns unrestricted grid."""
        res = self.client.get('/api/crishi/grid')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertIn('tasks', data)
        self.assertIn('summary', data)
        # Unauthenticated dev mode gets all 140 active tasks and active teammates >= 5
        self.assertEqual(len(data['tasks']), 140)
        self.assertGreaterEqual(len(data['summary']['teammates']), 5)

    def test_03_boundary_malformed_tokens(self):
        """Boundary: Query /api/crishi/grid with malformed Bearer tokens."""
        malformed_headers = [
            {'Authorization': 'Bearer '},
            {'Authorization': 'Bearer not-a-jwt'},
            {'Authorization': 'Bearer a.b'},
            {'Authorization': 'Bearer header.payload.signature_garbage'},
            {'Authorization': 'Bearer ???!@#$%^&*()'},
        ]
        for h in malformed_headers:
            res = self.client.get('/api/crishi/grid', headers=h)
            # In Flask-JWT-Extended, invalid tokens return 422 Unprocessable Entity
            self.assertIn(res.status_code, [401, 422], f"Header {h} gave unexpected status {res.status_code}")

    def test_04_boundary_expired_token(self):
        """Boundary: Query /api/crishi/grid with expired token."""
        with self.app.app_context():
            expired_token = create_access_token(
                identity='bhawna@agalabs.com',
                expires_delta=timedelta(seconds=-60),
                additional_claims={'role': 'Teammate'}
            )
        res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {expired_token}'})
        # Flask-JWT-Extended returns 401 for expired tokens
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertIn('expired', str(data).lower())

    def test_05_boundary_nonexistent_and_inactive_users(self):
        """Boundary: Query /api/crishi/grid with non-existent and inactive user tokens."""
        with self.app.app_context():
            # Non-existent user with explicit Teammate claim -> scoped to 0 tasks, exactly 1 chip
            token_ghost_teammate = create_access_token(
                identity='ghost_teammate_999@nowhere.com',
                additional_claims={'role': 'Teammate'}
            )
            # Non-existent user with SuperAdmin claim -> full grid
            token_ghost_admin = create_access_token(
                identity='ghost_admin_999@nowhere.com',
                additional_claims={'role': 'SuperAdmin'}
            )
            # Deactivated user Damini with Teammate claim
            token_damini = create_access_token(
                identity='damini@agalabs.com',
                additional_claims={'role': 'Teammate'}
            )

        # Ghost teammate: 0 tasks, 1 chip
        res1 = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token_ghost_teammate}'})
        self.assertEqual(res1.status_code, 200)
        d1 = res1.get_json()
        self.assertEqual(len(d1['tasks']), 0)
        self.assertEqual(len(d1['summary']['teammates']), 1)
        chip_name = list(d1['summary']['teammates'].keys())[0]
        self.assertTrue('ghost' in chip_name.lower())

        # Deactivated user with Teammate claim: 0 tasks, 1 chip
        res2 = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token_damini}'})
        self.assertEqual(res2.status_code, 200)
        d2 = res2.get_json()
        self.assertEqual(len(d2['tasks']), 0)
        self.assertEqual(len(d2['summary']['teammates']), 1)
        self.assertIn('Damini', d2['summary']['teammates'])

        # Mutating admin route (/api/crishi/pull) with deactivated user -> must return 401 or 403
        with self.app.app_context():
            cid = DBTaskCatalog.query.first().id
        res_pull = self.client.post(
            '/api/crishi/pull',
            json={'catalogId': cid, 'slaHours': 24},
            headers={'Authorization': f'Bearer {token_damini}'}
        )
        self.assertIn(res_pull.status_code, [401, 403])

    def test_06_multi_assignee_accessibility_and_isolation(self):
        """
        Multi-user tables (e.g. pyexcel_market_report assigned to 'Nishant, Bhawna, Pankaj, Nitesh, Gopi'):
        - Accessible by every assigned teammate: Bhawna, Pankaj, Nitesh, Gopichand
        - Completely blocked from non-assigned teammate (e.g. isolated stranger)
        """
        with self.app.app_context():
            multi_task = DBTaskCatalog.query.filter(
                DBTaskCatalog.user_name.like('%Nishant%'),
                DBTaskCatalog.user_name.like('%Bhawna%'),
                DBTaskCatalog.user_name.like('%Pankaj%')
            ).first()
            self.assertIsNotNone(multi_task, "Multi-assignee catalog item must exist")
            multi_tbl = multi_task.raw_table_name
            multi_id = multi_task.id

            t_bhawna = create_access_token('bhawna@agalabs.com', additional_claims={'role': 'Teammate'})
            t_pankaj = create_access_token('pankaj@agalabs.com', additional_claims={'role': 'Teammate'})
            t_nitesh = create_access_token('nitesh@agalabs.com', additional_claims={'role': 'Teammate'})
            t_gopi = create_access_token('gopichand@agalabs.com', additional_claims={'role': 'Teammate'})
            t_unassigned = create_access_token(
                'isolated_stranger@agalabs.com',
                additional_claims={'role': 'Teammate', 'commodities': 'Coffee, Tea'}
            )

        for name, tok in [('Bhawna', t_bhawna), ('Pankaj', t_pankaj), ('Nitesh', t_nitesh), ('Gopi', t_gopi)]:
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {tok}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            task_ids = [t['id'] for t in data['tasks']]
            self.assertIn(
                multi_id, task_ids,
                f"Assigned teammate {name} should have access to multi-assigned table {multi_tbl} (id={multi_id})"
            )

        # Unassigned teammate must NOT have access to multi_id
        res_stranger = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_unassigned}'})
        self.assertEqual(res_stranger.status_code, 200)
        stranger_ids = [t['id'] for t in res_stranger.get_json()['tasks']]
        self.assertNotIn(
            multi_id, stranger_ids,
            f"Unassigned stranger must NOT see multi-assigned table {multi_tbl}"
        )

    def test_07_weather_rotation_scoping(self):
        """
        Weather rotation edge cases:
        Verify dedicated weather tables (commodity == 'Weather') are accessible to Bhawna
        (who has Weather assigned), while completely blocked from Gopichand (who has only Rice, Wheat).
        """
        with self.app.app_context():
            from app.routes.crishi import get_current_weather_assignee
            current_weather = get_current_weather_assignee()

            t_bhawna = create_access_token('bhawna@agalabs.com', additional_claims={'role': 'Teammate'})
            t_gopi = create_access_token('gopichand@agalabs.com', additional_claims={'role': 'Teammate'})

            # Query grid for Bhawna and Gopichand
            r_bhawna = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_bhawna}'}).get_json()
            r_gopi = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_gopi}'}).get_json()

            # Dedicated weather tasks (commodity == 'Weather')
            dedicated_weather_tasks = DBTaskCatalog.query.filter(
                DBTaskCatalog.commodity == 'Weather',
                DBTaskCatalog.is_active == True
            ).all()
            self.assertGreater(len(dedicated_weather_tasks), 0, "Dedicated weather tasks must exist")
            weather_ids = {w.id for w in dedicated_weather_tasks}

            bhawna_ids = {t['id'] for t in r_bhawna['tasks']}
            gopi_ids = {t['id'] for t in r_gopi['tasks']}

            # Bhawna has Weather assigned and must see all dedicated weather tasks
            self.assertTrue(
                weather_ids.issubset(bhawna_ids),
                f"Bhawna must see all {len(weather_ids)} dedicated weather tasks"
            )

            # Gopichand does NOT have Weather assigned and must NOT see any dedicated weather task
            gopi_weather_overlap = weather_ids.intersection(gopi_ids)
            self.assertEqual(
                len(gopi_weather_overlap), 0,
                f"Gopichand must NOT see any dedicated weather tasks, but saw: {gopi_weather_overlap}"
            )

    def test_08_teammate_isolation_summary_teammates_length(self):
        """
        Teammate isolation assertions:
        - summary['teammates'] length is exactly 1 for Teammates (containing ONLY their own chip)
        - summary['teammates'] length >= 5 for Admins (SuperAdmin, Manager, Leader)
        """
        with self.app.app_context():
            teammates = [
                ('bhawna@agalabs.com', 'Bhawna'),
                ('gopichand@agalabs.com', 'Gopi'),
                ('pankaj@agalabs.com', 'Pankaj'),
                ('nitesh@agalabs.com', 'Nitesh')
            ]
            admins = [
                ('nishant@agalabs.com', 'SuperAdmin'),
                ('vaibhav@agalabs.com', 'SuperAdmin'),
                ('ram@agalabs.com', 'Manager'),
                ('leader_test@agalabs.com', 'Leader')
            ]

            # Generate tokens inside app context
            teammate_tokens = [
                (expected_name, email, create_access_token(email, additional_claims={'role': 'Teammate'}))
                for email, expected_name in teammates
            ]
            admin_tokens = [
                (role, email, create_access_token(email, additional_claims={'role': role}))
                for email, role in admins
            ]

        # Test all teammates
        for expected_name, email, token in teammate_tokens:
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            summary = data['summary']
            self.assertIn('teammates', summary)
            tm_dict = summary['teammates']
            self.assertEqual(
                len(tm_dict), 1,
                f"Teammate {email} must see exactly 1 teammate chip, saw {len(tm_dict)}: {list(tm_dict.keys())}"
            )
            # Ensure the single key corresponds to this user
            key = list(tm_dict.keys())[0]
            self.assertTrue(
                expected_name.lower() in key.lower() or key.lower() in expected_name.lower(),
                f"Expected name '{expected_name}' not matching key '{key}'"
            )

        # Test all admin roles
        for role, email, token in admin_tokens:
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            summary = data['summary']
            self.assertIn('teammates', summary)
            tm_dict = summary['teammates']
            self.assertGreaterEqual(
                len(tm_dict), 5,
                f"Admin {role} ({email}) must see >= 5 teammate chips, saw {len(tm_dict)}: {list(tm_dict.keys())}"
            )

    def test_09_summary_math_consistency(self):
        """
        Summary math consistency:
        - For Teammates: total_tasks == completed + pending == updated_today + pending_action == len(tasks)
        - For Admins: total_tasks == len(tasks) == 140
        - completion_pct == round(completed / total_tasks * 100) if total_tasks > 0 else 0
        - cadence totals sum to total_tasks
        """
        with self.app.app_context():
            teammates = [
                ('bhawna@agalabs.com', 'Teammate'),
                ('gopichand@agalabs.com', 'Teammate'),
                ('pankaj@agalabs.com', 'Teammate'),
                ('nitesh@agalabs.com', 'Teammate')
            ]
            admins = [
                ('nishant@agalabs.com', 'SuperAdmin'),
                ('leader_test@agalabs.com', 'Leader')
            ]
            tm_tokens = [(e, r, create_access_token(e, additional_claims={'role': r})) for e, r in teammates]
            adm_tokens = [(e, r, create_access_token(e, additional_claims={'role': r})) for e, r in admins]

        # 1. Test Teammate math consistency
        for email, role, token in tm_tokens:
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            tasks = data['tasks']
            summary = data['summary']

            total_tasks = summary['total_tasks']
            completed = summary['completed']
            pending = summary['pending']
            updated_today = summary['updated_today']
            pending_action = summary['pending_action']
            completion_pct = summary.get('completion_pct', 0)

            # a. total_tasks equals length of returned tasks list
            self.assertEqual(total_tasks, len(tasks), f"Teammate {email}: total_tasks != len(tasks)")

            # b. completed + pending equals total_tasks
            self.assertEqual(completed + pending, total_tasks, f"Teammate {email}: completed + pending != total_tasks")

            # c. updated_today + pending_action equals total_tasks
            self.assertEqual(updated_today + pending_action, total_tasks, f"Teammate {email}: updated_today + pending_action != total_tasks")

            # d. completed == updated_today and pending == pending_action
            self.assertEqual(completed, updated_today)
            self.assertEqual(pending, pending_action)

            # e. Completion percentage math
            expected_pct = int(round((completed / total_tasks) * 100)) if total_tasks > 0 else 0
            self.assertEqual(completion_pct, expected_pct)

            # f. Cadence summary sums to total_tasks
            cadence = summary.get('cadence_summary')
            if cadence and isinstance(cadence, dict):
                cadence_total = sum(v.get('total', 0) for v in cadence.values())
                self.assertEqual(cadence_total, total_tasks, f"Teammate {email}: Cadence total != total_tasks")

        # 2. Test Admin math consistency
        for email, role, token in adm_tokens:
            res = self.client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            tasks = data['tasks']
            summary = data['summary']

            total_tasks = summary['total_tasks']
            self.assertEqual(total_tasks, len(tasks), f"Admin {email}: total_tasks != len(tasks)")
            self.assertEqual(total_tasks, 140, f"Admin {email}: expected 140 active tasks")

            # In Admin summary, verify all sub-counters account for tasks
            updated_today = summary['updated_today']
            pending_action = summary['pending_action']
            cycle_windows = summary.get('cycle_windows', 0)
            awaiting_pull = summary.get('awaiting_pull', 0)
            # Sum must account for tasks
            self.assertGreaterEqual(total_tasks, updated_today + pending_action)


if __name__ == '__main__':
    unittest.main()
