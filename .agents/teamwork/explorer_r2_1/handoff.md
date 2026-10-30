# Handoff Report: Requirement R1 (Teammate and Admin Role Scoping Investigation)

## 1. Observation

1. **User Model and Role Definitions**:
   - In `app/models.py` (lines 39-55): `role = db.Column(db.String(50), nullable=False, default='Teammate')  # SuperAdmin, Manager, Leader, Teammate`.
   - In `app/models.py` (lines 56-59): Relational mappings `report_mappings` (`UserReportMapping`) and `commodity_mappings` (`UserCommodityMapping`).
   - In `app/models.py` (lines 68-92): `to_dict()` exports `role`, `commodities`, `reports`, `report_mappings`, `commodity_mappings`, `assignedCommodities`.
   - In `app/auth.py` (line 15): `ROLE_LEVEL = {'Teammate': 1, 'Manager': 2, 'SuperAdmin': 3}`. Verbatim observation: `'Leader'` is absent from `ROLE_LEVEL`.
   - In `app/auth.py` (line 124): `token = create_access_token(identity=user.email, additional_claims={'role': user.role})`.
   - In `app/auth.py` (lines 134-139, 143-151): Both `/login` and `/me` return `{'success': True, 'token': token, 'user': user.to_dict(), 'modules': modules}`.
   - In `app/static/js/auth.js` (lines 93-98): `window.currentUser = user;`.

2. **Database State Inspection**:
   - Querying users via `.venv\Scripts\python.exe` confirmed 9 baseline users intact:
     - Nishant (`nishant@agalabs.com`, role: `SuperAdmin`, commodities: `['Pulses', 'Tops']`, reports: 3)
     - Ram Gopal (`ram@agalabs.com`, role: `Manager`, commodities: `[]`, reports: 0)
     - Gopi (`gopichand@agalabs.com`, role: `Teammate`, commodities: `['Rice', 'Wheat']`, reports: 4)
     - Nitesh (`nitesh@agalabs.com`, role: `Teammate`, commodities: `['Bajra', 'Barley', 'Maize', 'Sugar']`, reports: 6)
     - Pankaj (`pankaj@agalabs.com`, role: `Teammate`, commodities: `['Chilli', 'Coriander', 'Cumin', 'Turmeric', 'Weather']`, reports: 8)
     - Damini (`damini@agalabs.com`, role: `Inactive`, commodities: `[]`, reports: 0)
     - Bhawna (`bhawna@agalabs.com`, role: `Teammate`, commodities: `['Cotton', 'Rapeseed', 'Soybeans', 'Weather']`, reports: 6)
     - Balram (`balram@agalabs.com`, role: `Teammate`, commodities: `[]`, reports: 0)
     - Vaibhav (`vaibhav@agalabs.com`, role: `SuperAdmin`, commodities: `[]`, reports: 0)
   - In `db_task_catalog`: 158 active table mappings. Assignees in `user_name` column: `Counter({'Gopi': 41, 'Nishant': 39, 'Nitesh': 34, 'Bhawna': 34, 'Pankaj': 7, 'Nishant, Bhawna, Pankaj, Nitesh, Gopi': 2, 'Pooja S. Verma': 1})`.
   - In `reports`: 27 reports mapped to users, e.g. `Bajra Weekly` (`user_id=5`, `primary_assignee='Nitesh'`), `Chilli Daily` (`user_id=6`, `primary_assignee='Pankaj'`).

3. **Surveillance Grid Endpoint and Service**:
   - In `app/routes/crishi.py` (lines 16-32):
     ```python
     @crishi_bp.route('/grid', methods=['GET'])
     @jwt_required(optional=True)
     def get_grid():
         force = request.args.get('refresh', 'false').lower() == 'true'
         target_date = request.args.get('date', '').strip() or None
         tasks, summary = get_surveillance_grid(target_date_str=target_date, force_refresh=force)
         return jsonify({
             'success': True,
             'count': len(tasks),
             'tasks': tasks,
             'summary': summary,
             'commodity_rollups': summary.get('commodity_rollups', []),
             'date_summary': summary.get('date_summary', {}),
             'selected_date': summary.get('date_summary', {}).get('selected_date', str(date.today()))
         })
     ```
   - In `app/services/surveillance.py` (lines 563-950): `get_surveillance_grid` retrieves all active `DBTaskCatalog` items and calculates metrics across all teammates without any role parameter or user filter.

4. **Teammate Portfolios UI**:
   - In `app/static/js/crishi.js` (lines 329-342, 4462-4475):
     HTML containers `<div class="teammate-workload-row" id="teammate-chips-container">` and `<div class="teammate-workload-row" id="date-teammate-chips-container">`.
   - In `app/static/js/crishi.js` (lines 928-972):
     `renderTeammateChips()` creates an `"All Teammates"` button followed by chips for each user in `priorityUsers` (`this.getActiveUsersSync()`). No check for user role exists in `renderTeammateChips()`.
   - In `app/static/js/crishi.js` (lines 353-363, 4486-4496): Hardcoded assignee dropdown options for `Nishant`, `Bhawna`, `Gopi`, `Pankaj`, `Nitesh`.

5. **Reports Endpoints and UI**:
   - In `app/routes/crishi.py` (lines 1165-1175):
     `get_all_reports()` executes `get_all_scanned_reports()` and returns all 290+ reports without role or commodity restrictions.
   - In `app/static/js/report.js` (lines 514-570):
     `renderCategoryPills()` displays category pills for all 16 authoritative commodities without checking `window.currentUser.role` or `window.currentUser.commodities`.

---

## 2. Logic Chain

1. **Observation 1 & 2** show that users in the database are assigned specific commodities and reports (e.g. Bhawna is assigned Cotton, Rapeseed, Soybeans, Weather; Gopi is assigned Rice, Wheat). Admin users (SuperAdmin: Nishant, Vaibhav; Manager: Ram Gopal) have administrative responsibilities across all commodities.
2. **Observation 1** shows that `ROLE_LEVEL` in `app/auth.py` omits `Leader`. Therefore, any route relying on `role_at_least(user.role, 'Manager')` evaluates `Leader` as 0 (lower than `Teammate` = 1), causing Leaders to fail role checks. Defining `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}` and updating `ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}` resolves this defect and aligns with Requirement R1.
3. **Observation 3** shows that `GET /crishi/grid` sends all 158 monitored tables, full date summaries, and all teammate workload metrics to any requester because it does not inspect the authenticated JWT user or role.
4. **Observation 4** shows that `renderTeammateChips()` in `crishi.js` renders the `"All Teammates"` button and all individual teammate chips indiscriminately. As a result, when a Teammate logs in, they see all other teammates' chips, contrary to Requirement R1.
5. **Observation 5** shows that `GET /crishi/reports/all` and `renderCategoryPills()` in `report.js` expose all 290+ reports and all 16 commodity pills to all users, regardless of whether a Teammate is assigned to those commodities.
6. Combining Steps 1–5 demonstrates that enforcing Requirement R1 requires a coordinated two-tier scoping implementation:
   - **Backend API Layer**: `GET /crishi/grid` and `GET /crishi/reports/all` must inspect `get_current_user()`. If the user is an Admin (`SuperAdmin`, `Manager`, `Leader`), full unrestricted data is returned. If the user is a `Teammate`, the returned `tasks`, `summary['teammates']`, `commodity_rollups`, and `reports` must be filtered strictly to that teammate's assigned tables and commodities.
   - **Frontend UI Layer**: `renderTeammateChips()` in `crishi.js` must check `window.currentUser?.role`. If `Teammate`, it must suppress the "All Teammates" chip and all other teammates' chips, rendering strictly the logged-in teammate's own chip, while locking the assignee filter and scoping `renderCategoryPills()` in `report.js`.

---

## 3. Caveats

1. **Roster Scrapper Matrix**: `app/routes/roster.py` contains daily rotating duties and weather rotations. Weather table assignment in `DBTaskCatalog` is dynamically synced to the active weather duty assignee via `POST /crishi/roster/weather-rotation`. When a teammate is on active weather duty, weather tables are assigned to them.
2. **Multi-User Table Assignments**: Certain tables in `DBTaskCatalog` (such as `pyexcel_market_report` and `pyexcel_dashboard_news`) have multiple comma-separated users in `user_name` (e.g. `'Nishant, Bhawna, Pankaj, Nitesh, Gopi'`) and per-commodity configs in `commodity_config`. Filtering logic for teammates must parse comma-separated assignees and inspect `commodity_config` to avoid false negatives.
3. **Dev / Unauthenticated Mode**: If a request to `/crishi/grid` is made without a JWT token (e.g., local dev smoke checks), the backend should default gracefully to the full grid to preserve existing development and baseline workflows.

---

## 4. Conclusion

Requirement R1 is fully investigated and ready for implementation.
The implementation requires:
1. **`app/auth.py`**:
   - Add `'Leader': 2` to `ROLE_LEVEL` and define `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}` and `is_admin_role(role)`.
2. **`app/routes/crishi.py`**:
   - Scope `GET /crishi/grid`: Admins receive all 158 tables and all teammate summaries; Teammates receive only their assigned tables, their own `summary['teammates']` entry, their assigned commodity rollups, and scoped KPI metrics.
   - Scope `GET /crishi/reports/all`: Admins receive all 290+ reports; Teammates receive only reports matching their assigned commodities.
   - Restrict administrative routes (`/crishi/pull`, `/crishi/skip`, `/crishi/manager-review`, `/crishi/source`) to Admin roles (`SuperAdmin`, `Manager`, `Leader`).
3. **`app/static/js/crishi.js`**:
   - Modify `renderTeammateChips()`: If `Teammate`, omit "All Teammates" and other teammate chips; render only the logged-in teammate's chip; update workload hint text; lock assignee dropdown.
4. **`app/static/js/report.js`**:
   - Modify `renderCategoryPills()`: If `Teammate`, display only pills for assigned commodities.

---

## 5. Verification Method

To verify the role scoping once implemented:

1. **Backend Automated Tests**:
   Execute the test suite using:
   ```powershell
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
   ```
2. **Role Scoping Test Assertions**:
   - Generate access token for SuperAdmin `nishant@agalabs.com`:
     - `GET /api/crishi/grid` -> Returns `count >= 156`, `len(summary['teammates']) >= 5`.
     - `GET /api/crishi/reports/all` -> Returns `len(reports) >= 290`.
   - Generate access token for Teammate `bhawna@agalabs.com`:
     - `GET /api/crishi/grid` -> Returns only tasks matching Bhawna's assigned commodities (`Cotton`, `Rapeseed`, `Soybeans`, `Weather`) or `user_name == 'Bhawna'`.
     - In `summary['teammates']`, only `'Bhawna'` is present. No metrics for Gopi, Pankaj, or Nitesh are present.
     - `GET /api/crishi/reports/all` -> Returns only reports for `Cotton`, `Rapeseed`, `Soybeans`, `Weather`. Reports for `Bajra`, `Chilli`, `Rice`, etc. are absent.
     - `POST /api/crishi/pull` -> Returns HTTP 403 Forbidden.
     - `POST /api/crishi/skip` -> Returns HTTP 403 Forbidden.
   - Invalidate / Baseline Check:
     Verify baseline counts remain intact (9 users, 27 reports, 158 catalog mappings) with zero data loss.
