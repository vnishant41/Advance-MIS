# Review and Adversarial Challenge Report: Milestone 1 (R1)

**Reviewer**: reviewer_m1_2  
**Target Milestone**: Milestone 1: Backend Role Scoping & Auth Hierarchy (R1)  
**Worker Under Review**: worker_m1  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Observation 1: Critical Privilege Escalation in `role_at_least()` (`app/auth.py:28-31`)
- Prior code:
  ```python
  def role_at_least(user_role, min_role):
      return ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)
  ```
- Worker modification in `app/auth.py:28-31`:
  ```python
  ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}
  ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}
  _ADMIN_ROLES_LOWER = {r.lower() for r in ADMIN_ROLES}

  def role_at_least(user_role, min_role):
      if min_role in ADMIN_ROLES and is_admin_role(user_role):
          return True
      return ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)
  ```
- **Live Execution Result**:
  Command:
  ```powershell
  .venv\Scripts\python.exe -c "from app.auth import role_at_least; print(role_at_least('Leader', 'SuperAdmin')); print(role_at_least('Manager', 'SuperAdmin'))"
  ```
  Output:
  ```
  True
  True
  ```
- **Exploit Verification**:
  Endpoint `POST /api/admin/modules` requires `role_at_least(user.role, 'SuperAdmin')`.
  Invoking `POST /api/admin/modules` using a `Leader` JWT token returned `HTTP 200 {'success': True}`:
  ```powershell
  .venv\Scripts\python.exe -c "
  from app import create_app
  from flask_jwt_extended import create_access_token
  app = create_app()
  app.config['TESTING'] = True
  client = app.test_client()
  with app.app_context():
      t_leader = create_access_token('test_leader@agalabs.com', additional_claims={'role': 'Leader'})
      res = client.post('/api/admin/modules', json={'some_module': False}, headers={'Authorization': f'Bearer {t_leader}'})
      print(res.status_code, res.get_json())
  "
  ```
  Output:
  ```
  200 {'success': True}
  ```

---

### Observation 2: Teammate Data Leakage in `GET /crishi/grid` (`app/routes/crishi.py:67-116, 261-265`)
- In `is_task_assigned_to_teammate()` (`app/routes/crishi.py:67-116`):
  When a task is explicitly assigned to another user (e.g., `user_name = 'Nishant'`, `'Bhawna'`, or `'Pooja S. Verma'`), the function does NOT reject the task if the user does not match check #1. It falls through to check #3 (`task commodity vs user's assigned commodities`).
- Pankaj has commodities `'Chilli, Coriander, Cumin, Tur, Turmeric, Weather'`.
- Tasks with commodity `'Bengal Gram, Tur, Urad, Moong, Masoor, Pea'` (explicitly assigned to `Nishant`) matched rule #3 because of `'Tur'`.
- Tasks with commodity `'Weather'` (explicitly assigned to `Bhawna`) matched rule #3 because of `'Weather'`.
- **Live Execution Result**:
  When querying `GET /api/crishi/grid` as `pankaj@agalabs.com`:
  - Pankaj receives **31 Pulses tasks assigned to Nishant** (Tasks 72-77, 80, 82-87, 124-141, 214-217).
  - Pankaj receives **11 Weather tasks assigned to Bhawna** (Tasks 168-169, 173-174, 189-190, 203-207).
  - Pankaj receives **1 Chilli task assigned to Pooja S. Verma** (Task 398).
  - In `summary['recent_updates']`:
    ```
    Pankaj recent_updates:
     - user: Bhawna | table: None
    ```
    Bhawna's private database update is leaked inside Pankaj's `summary['recent_updates']`.

---

### Observation 3: Global System Metrics Leakage in `summary['pipeline_summary']` (`app/routes/crishi.py:221-236`)
- In `get_grid()`:
  `scoped_summary = dict(summary)` recalculates `total_tasks`, `cadence_summary`, `date_summary`, etc., but **leaves `pipeline_summary` completely un-scoped**:
  ```python
  pipeline_summary: {'IPGA': {'pending': 13, 'total': 13, 'updated': 0}, 'Other': {'pending': 2, 'total': 2, 'updated': 0}, 'PyExcel': {'pending': 70, 'total': 72, 'updated': 2}, 'PyStage': {'pending': 37, 'total': 38, 'updated': 1}, 'SOPA': {'pending': 14, 'total': 15, 'updated': 1}}
  ```
  The sum across pipelines is 140 tasks (the entire company's active task inventory). For a teammate whose `total_tasks` is 36, this exposes global pipeline counts and represents an internal state inconsistency.

---

### Observation 4: Destructive / Mutating Administrative Endpoints Left Unprotected (`app/routes/crishi.py:768-782, 942-980`)
1. **`POST /api/crishi/roster/generate` (`crishi.py:768-782`)**:
   - Decorated with `@jwt_required(optional=True)`.
   - Executes:
     ```python
     RosterSchedule.query.delete()
     ```
   - Zero role verification.
   - **Live Exploit**: Unauthenticated request `POST /api/crishi/roster/generate` succeeded with `HTTP 200`.
2. **`POST /api/crishi/roster/weather-rotation` (`crishi.py:942-980`)**:
   - Decorated with `@jwt_required(optional=True)`.
   - Mutates `AppSetting`, `Report.primary_assignee`, `CommodityConfig`, and `DBTaskCatalog.user_name`.
   - Zero role verification.
   - **Live Exploit**: Authenticated `Teammate` request `POST /api/crishi/roster/weather-rotation` succeeded with `HTTP 200`.
3. **`POST /api/crishi/reports/sync-gmail` (`crishi.py:1509-1522`)**:
   - Decorated with `@jwt_required(optional=True)`.
   - Triggers live IMAP ingestion with external mail services.
   - Zero role verification.

---

### Observation 5: Defective Case-Sensitivity in `role_at_least()` (`app/auth.py:28`)
- In `app/auth.py:28`:
  `ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}`.
  Calling `role_at_least('teammate', 'manager')`:
  Both `'teammate'` and `'manager'` are missing from `ROLE_LEVEL` (which has Title-case keys), returning default `0`.
  `0 >= 0` evaluates to `True`.
  A lowercase `'teammate'` token role bypasses role-level checks for any lowercase role.

---

### Observation 6: Independent Test Suite Pass
- Baseline quality regression suite:
  ```powershell
  .venv\Scripts\python.exe -m unittest discover -s tests -p "test_quality_*.py"
  ```
  Result: `Ran 24 tests ... OK` (9 users, 27 reports, 158 catalog entries intact).
- Milestone 1 tests in `tests/test_crishi_history_and_scoping.py`:
  - 25 Tier 1 tests (`test_t1_f01` to `test_t1_f05`): `Ran 25 tests ... OK`.
  - 25 Tier 2 tests (`test_t2_b01` to `test_t2_b05`): `Ran 25 tests ... OK`.
- **Reason tests passed despite critical bugs**:
  The existing test suite only tested isolated positive paths (Bhawna, Gopi) and did NOT test multi-assignee negative exclusions (e.g., asserting that Pankaj does NOT receive Nishant's tasks), nor did it test `role_at_least('Leader', 'SuperAdmin')`.

---

## 2. Logic Chain

1. **Hierarchy Invalidation**:
   - The contract in `PROJECT.md` specifies `SuperAdmin` (level 3) > `Manager` (level 2) == `Leader` (level 2) > `Teammate` (level 1).
   - In `app/auth.py`, `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}`.
   - The condition `if min_role in ADMIN_ROLES and is_admin_role(user_role): return True` short-circuits whenever `min_role` is `'SuperAdmin'`.
   - Since `Leader` and `Manager` return `True` for `is_admin_role()`, they are improperly granted SuperAdmin privileges across the entire application (including module toggles, role management, password resets in `app/routes/admin.py`).
   - Therefore, the authentication hierarchy is compromised.

2. **Teammate Isolation Invalidation**:
   - Requirement §R1 states: *"Users with the Teammate role only see their own assigned commodities, reports, and table updates in the surveillance grid and reports... other teammates completely hidden."*
   - In `app/routes/crishi.py:is_task_assigned_to_teammate()`, task assignment checks are evaluated with OR logic rather than respecting explicit individual assignees.
   - When a task is explicitly assigned to `Nishant`, but lists multi-commodity keywords that intersect with Pankaj's assigned commodities, Pankaj receives Nishant's task in his surveillance grid.
   - Furthermore, because that task is in Pankaj's task list, Bhawna's and Nishant's updates are pulled into Pankaj's `summary['recent_updates']`.
   - Therefore, Teammate Isolation is breached.

3. **Mutating Route Protection Invalidation**:
   - Acceptance Criteria §R1 and PROJECT.md Feature 4 mandate administrative protection on mutating routes.
   - While `pull`, `skip`, `manager-review`, and `source` were protected, `roster/generate` (which executes `RosterSchedule.query.delete()`) and `roster/weather-rotation` (which modifies `AppSetting`, `Report`, and `DBTaskCatalog`) remain open to unauthenticated callers or Teammates via `@jwt_required(optional=True)`.
   - Therefore, mutating administrative routes are vulnerable.

---

## 3. Caveats

- Database Invariants are preserved: The SQLite database currently maintains 9 baseline users, 27 reports, and 158 catalog entries intact. No data corruption was observed during testing.
- Features 6 to 12 in `tests/test_crishi_history_and_scoping.py` belong to Milestone 2, 3, and 4 (Update History backend, sync hooks, and UI) and were appropriately not implemented by `worker_m1`. The test failures on those specific classes are expected milestone-scope boundaries.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The work submitted for Milestone 1 does not meet security, isolation, and robustness standards. The following changes are required before Milestone 1 can be approved:

1. **Fix `role_at_least()` in `app/auth.py`**:
   - Remove the short-circuit `if min_role in ADMIN_ROLES and is_admin_role(user_role): return True`.
   - Use normalized case-insensitive level lookup:
     ```python
     ROLE_LEVEL_NORMALIZED = {k.lower(): v for k, v in ROLE_LEVEL.items()}
     u_lvl = ROLE_LEVEL_NORMALIZED.get((user_role or '').strip().lower(), 0)
     m_lvl = ROLE_LEVEL_NORMALIZED.get((min_role or '').strip().lower(), 0)
     return u_lvl >= m_lvl
     ```
   - Verify that `role_at_least('Leader', 'Manager') == True`, `role_at_least('Leader', 'SuperAdmin') == False`, and `role_at_least('Manager', 'SuperAdmin') == False`.

2. **Fix Task Assignment and Scoping in `app/routes/crishi.py`**:
   - In `is_task_assigned_to_teammate()`: If a task has an explicit assigned user (`raw_user`) and it is a single individual (not a shared/comma-separated task) that does not match the teammate, it MUST NOT match based purely on generic commodity keywords.
   - Ensure Pankaj receives only tasks assigned to Pankaj (or shared duties) and does NOT receive Nishant's Pulses tasks or Bhawna's Weather tasks.
   - Recalculate `summary['pipeline_summary']` so that it aggregates counts strictly over `scoped_tasks` instead of returning global system totals.

3. **Protect All Mutating Endpoints in `app/routes/crishi.py`**:
   - Enforce `is_admin_role(user.role)` on:
     - `POST /crishi/roster/generate`
     - `POST /crishi/roster/weather-rotation`
     - `POST /crishi/reports/sync-gmail`
   - Return HTTP 401 for unauthenticated callers and HTTP 403 for Teammates.

4. **Add Adversarial Regression Tests**:
   - Add unit tests verifying `role_at_least('Leader', 'SuperAdmin') is False`.
   - Add unit tests verifying `POST /api/admin/modules` returns 403 for Leader.
   - Add unit tests verifying Pankaj's `GET /api/crishi/grid` contains 0 tasks assigned to Nishant or Bhawna, and 0 entries from Bhawna in `recent_updates`.
   - Add unit tests verifying `POST /api/crishi/roster/generate` and `POST /api/crishi/roster/weather-rotation` return 401/403 for non-admins.

---

## 5. Verification Method

Run the following commands to reproduce every finding independently:

1. **Privilege Escalation Reproduction**:
   ```powershell
   .venv\Scripts\python.exe -c "
   from app import create_app
   from app.auth import role_at_least
   from flask_jwt_extended import create_access_token
   assert role_at_least('Leader', 'SuperAdmin') is False, 'VULNERABILITY: Leader has SuperAdmin privilege!'
   "
   ```
   *Expected once fixed*: Assertion passes without raising AssertionError.

2. **Teammate Task & Update Isolation Reproduction**:
   ```powershell
   .venv\Scripts\python.exe -c "
   from app import create_app
   from flask_jwt_extended import create_access_token
   app = create_app()
   app.config['TESTING'] = True
   client = app.test_client()
   with app.app_context():
       token = create_access_token('pankaj@agalabs.com', additional_claims={'role': 'Teammate'})
       res = client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {token}'}).get_json()
       # Check tasks
       for t in res['tasks']:
           u = t.get('user_name') or t.get('user') or ''
           if u == 'Nishant':
               raise AssertionError(f'LEAK: Pankaj received Nishant task {t.get(\"id\")} {t.get(\"final_name\")}')
       # Check recent updates
       for ru in res['summary']['recent_updates']:
           if ru.get('user') != 'Pankaj':
               raise AssertionError(f'LEAK: Pankaj received recent update from {ru.get(\"user\")}')
       print('Teammate Isolation: PASS')
   "
   ```
   *Expected once fixed*: Prints `Teammate Isolation: PASS`.

3. **Mutating Route Protection Reproduction**:
   ```powershell
   .venv\Scripts\python.exe -c "
   from app import create_app
   from flask_jwt_extended import create_access_token
   app = create_app()
   app.config['TESTING'] = True
   client = app.test_client()
   with app.app_context():
       t_tm = create_access_token('bhawna@agalabs.com', additional_claims={'role': 'Teammate'})
       r_gen = client.post('/api/crishi/roster/generate')
       assert r_gen.status_code in (401, 403), f'Unprotected roster generate: {r_gen.status_code}'
       r_rot = client.post('/api/crishi/roster/weather-rotation', json={'weeks': []}, headers={'Authorization': f'Bearer {t_tm}'})
       assert r_rot.status_code == 403, f'Teammate allowed weather rotation: {r_rot.status_code}'
       print('Mutating Routes Protection: PASS')
   "
   ```
   *Expected once fixed*: Prints `Mutating Routes Protection: PASS`.
