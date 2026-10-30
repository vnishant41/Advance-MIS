# Challenger Report: Milestone 1 — Backend Role Scoping & Auth Hierarchy (R1)

## 1. Observation

1. **Database Baseline Invariant Check**:
   - Command: `.venv\Scripts\python.exe -c "from app import create_app; from app.models import User, Report, DBTaskCatalog; app=create_app(); ..."`
   - Output:
     ```
     [migration] Zero data loss verified: 9 users, 27 reports, 158 catalog entries intact.
     Users: 9, Reports: 27, Catalog: 158
     ```
   - All 9 baseline users, 27 reports, and 158 catalog records remain undamaged in the database.

2. **Boundary Conditions on `GET /api/crishi/grid` (`app/routes/crishi.py:120-155`)**:
   - **No token (Unauthenticated dev mode)**: Returned HTTP 200 with all 140 active tasks (`len(data['tasks']) == 140`) and active teammate summary keys: `['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj']` (`len >= 5`).
   - **Malformed Bearer tokens**: Probed with headers `{'Authorization': 'Bearer '}`, `'Bearer not-a-jwt'`, `'Bearer a.b'`, `'Bearer header.payload.signature_garbage'`, and `'Bearer ???!@#$%^&*()'`. All returned HTTP 422 Unprocessable Entity (`{"msg": "..."}`), preventing any 500 internal server crash or unauthorized bypass.
   - **Expired tokens**: Token generated with `expires_delta=timedelta(seconds=-60)` returned HTTP 401 Unauthorized (`{"msg": "The token has expired"}`).
   - **Non-existent user email with Teammate claim**: Token with `identity='ghost_teammate_999@nowhere.com'`, `claims={'role': 'Teammate'}` returned HTTP 200, strictly scoped to 0 tasks (`len(tasks) == 0`), and `summary['teammates']` contains strictly `['Ghost_Teammate_999']` (length 1).
   - **Deactivated user account (`damini@agalabs.com`, `active=False`)**: Token with `role='Teammate'` scoped to 0 tasks and 1 chip (`['Damini']`); calling mutating admin route `POST /api/crishi/pull` was strictly blocked with HTTP 403 Forbidden (`Access denied: Admin role required`).

3. **Multi-User Task Assignment & Isolation (`app/routes/crishi.py:67-116`)**:
   - Inspected catalog item ID 79 / 81 (`pyexcel_dashboard_news` / `ipga_arrivals_marketwise`) where `user_name = 'Nishant, Bhawna, Pankaj, Nitesh, Gopi'`.
   - Polled `GET /api/crishi/grid` for each assigned teammate:
     * Bhawna: ID 79 & 81 present in `tasks` (36 scoped tasks).
     * Pankaj: ID 79 & 81 present in `tasks` (40 scoped tasks).
     * Nitesh: ID 79 & 81 present in `tasks` (33 scoped tasks).
     * Gopichand: ID 79 & 81 present in `tasks` (29 scoped tasks).
   - Polled with unassigned teammate token (`isolated_stranger@agalabs.com` with `commodities='Coffee, Tea'`): ID 79 & 81 strictly absent (`0` tasks returned).

4. **Weather Rotation Edge Cases (`app/routes/crishi.py:34-65, 103-116`)**:
   - Current weather rotation duty resolved via `get_current_weather_assignee()`: returned `'bhawna'`.
   - Identified 11 dedicated weather catalog tasks (IDs: 168, 169, 173, 174, 189, 190, 203, 204, 205, 206, 207) with `commodity == 'Weather'`.
   - Bhawna's grid contains all 11 dedicated weather tasks.
   - Gopichand (assigned strictly `'Rice, Wheat'`, no weather rotation duty): receives strictly `0` dedicated weather tasks (`len(weather_ids.intersection(gopi_ids)) == 0`).

5. **Teammate Isolation Assertions (`app/routes/crishi.py:163-190`)**:
   - Queried `GET /api/crishi/grid` for each teammate:
     * Bhawna: `summary['teammates']` = `{'Bhawna': {...}}` (`len == 1`).
     * Gopichand: `summary['teammates']` = `{'Gopi': {...}}` (`len == 1`).
     * Pankaj: `summary['teammates']` = `{'Pankaj': {...}}` (`len == 1`).
     * Nitesh: `summary['teammates']` = `{'Nitesh': {...}}` (`len == 1`).
   - Queried `GET /api/crishi/grid` for Admin roles:
     * SuperAdmin (`nishant@agalabs.com`): `len(summary['teammates']) == 5` (`['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj']`).
     * SuperAdmin (`vaibhav@agalabs.com`): `len(summary['teammates']) == 5`.
     * Manager (`ram@agalabs.com`): `len(summary['teammates']) == 5`.
     * Leader (`leader_test@agalabs.com`): `len(summary['teammates']) == 5`.

6. **Summary Math Consistency (`app/routes/crishi.py:210-259`)**:
   - For all Teammates (Bhawna, Gopi, Pankaj, Nitesh):
     * `total_tasks == len(tasks)` (Exact match).
     * `total_tasks == completed + pending` (Exact match).
     * `total_tasks == updated_today + pending_action` (Exact match).
     * `completed == updated_today` and `pending == pending_action` (Exact match).
     * `completion_pct == round((completed / total_tasks) * 100)` (Exact match).
     * `sum(cadence_summary[k]['total']) == total_tasks` (Exact match across Daily, Weekly, Monthly, Cycle Windows).
   - For Admins:
     * `total_tasks == len(tasks) == 140`.
     * Exact status breakdown: `FAIL (88) + AWAITING_PULL (46) + PASS (4) + SKIP (2) == 140`.

7. **Test Executions**:
   - `tests/test_challenger_m1_2_empirical.py`: Ran 9 tests in 1.027s — **OK (9/9 passed)**.
   - `tests/test_quality_audit_regression.py`: Ran 24 tests in 2.085s — **OK (24/24 passed)**.
   - `tests/test_crishi_history_and_scoping.py` (M1 Tier 1): Ran 7 tests in 0.904s — **OK (7/7 passed)**.

---

## 2. Logic Chain

1. **Boundary & Auth Resilience (Observation 2)**:
   - Malformed tokens produce clean HTTP 422 errors, and expired tokens produce HTTP 401 errors. Neither condition causes unhandled exceptions or leaks scoped surveillance data.
   - Ephemeral or non-existent teammate claims are gracefully handled without crashing: an unknown teammate identity receives a scoped grid of 0 tasks and a single isolated chip representing themselves.
   - Deactivated users attempting to invoke mutating administrative routes (`/api/crishi/pull`) are strictly blocked with HTTP 403 / 401.

2. **Multi-User Assignment & Weather Isolation Integrity (Observations 3, 4)**:
   - In `app/routes/crishi.py`, `is_task_assigned_to_teammate()` splits `user_name` by comma and normalizes assignee strings. Multi-user tasks (e.g. `pyexcel_dashboard_news`, `ipga_arrivals_marketwise`) are correctly resolved for each listed individual (`Bhawna`, `Pankaj`, `Nitesh`, `Gopi`), while an unassigned teammate is strictly filtered out.
   - Dedicated weather tasks (`commodity == 'Weather'`) are properly isolated: Bhawna (who has Weather in her commodities and is the active weather rotation assignee) receives all 11 dedicated weather tasks, while Gopichand (assigned only Rice and Wheat) receives 0 dedicated weather tasks.

3. **Teammate Isolation & Admin Parity (Observation 5)**:
   - In `app/routes/crishi.py:163-190`, `summary['teammates']` is strictly pruned to only the caller's entry when the user is authenticated as a Teammate. The length of `summary['teammates']` is exactly 1 for all teammates.
   - For all Admin roles (`SuperAdmin`, `Manager`, `Leader`), `summary['teammates']` contains all 5 active system users (`len >= 5`), confirming full unrestricted oversight.

4. **Summary Math Consistency (Observation 6)**:
   - Teammate summary metrics are recalculated dynamically from the scoped task list: `total_tasks == completed + pending == updated_today + pending_action == len(tasks)`.
   - Cadence breakdowns sum exactly to `total_tasks`.
   - Admin global counters completely reconcile the 140 active catalog tasks across all operational statuses (`PASS`, `FAIL`, `AWAITING_PULL`, `SKIP`).

5. **Invariant Preservation (Observation 1)**:
   - Direct database queries confirm that all 9 users, 27 reports, and 158 catalog mappings remain completely intact without any data drift or orphaned rows.

---

## 3. Caveats

- **Frontend Update History Tab (R3 / M3)**: This review was strictly focused on Milestone 1: Backend Role Scoping & Auth Hierarchy (R1). The frontend UI rendering of the Update History tab and interactive chip click filtering are scheduled for Milestone 3 per `PROJECT.md`.
- **Database Catalog Active Invariant**: Of the 158 rows in `DBTaskCatalog`, exactly 140 have `is_active=True` and 18 have `is_active=False`. Unrestricted admin grid views return these 140 active tasks by design, while the underlying table retains all 158 rows.

---

## 4. Conclusion

The implementation of **Milestone 1: Backend Role Scoping & Auth Hierarchy (R1)** is robust, secure, mathematically consistent, and non-destructive. All boundary conditions, multi-user assignment edge cases, weather rotation duty isolation, teammate portfolio chip isolation, and baseline database invariants have been empirically verified and pass all tests.

**Verdict: APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this challenger audit:

1. **Execute the Empirical Challenger Test Harness**:
   ```powershell
   .venv\Scripts\python.exe -m unittest tests/test_challenger_m1_2_empirical.py -v
   ```
   *Expected outcome*: `Ran 9 tests ... OK` with invariant verification: 9 users, 27 reports, 158 catalog entries intact.

2. **Execute Full Quality Audit Regression Suite**:
   ```powershell
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_quality_*.py" -v
   ```
   *Expected outcome*: `Ran 24 tests ... OK`.

3. **Execute Milestone 1 Feature Tests**:
   ```powershell
   .venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f01_01_superadmin_unrestricted_grid_all_active_tasks tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f02_01_bhawna_grid_scoped_to_assigned_tasks tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f03_01_admin_unrestricted_reports_access_all_27 tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f04_01_bhawna_summary_contains_only_own_chip tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f05_01_leader_role_in_auth_hierarchy tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f05_03_leader_can_execute_task_pull tests.test_crishi_history_and_scoping.TestTier1FeatureCoverage.test_t1_f05_05_teammate_strictly_forbidden_from_admin_mutating_routes -v
   ```
   *Expected outcome*: `Ran 7 tests ... OK`.
