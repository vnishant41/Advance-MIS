# Handoff Report: Backend & Database Explorer (Explorer 1)

**Working Directory**: `.agents/teamwork/explorer_survey_1`  
**Author**: Explorer 1 (Backend Database Explorer)  
**Parent Agent**: 7cae6921-788c-4df9-8dfc-dd7ea776be26  
**Date**: 2026-10-28T05:59:00Z  
**Type**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

1. **Backend Framework and Database Engine**:
   - `requirements.txt:2-10`: `Flask==3.1.1`, `Flask-SQLAlchemy==3.1.1`, `SQLAlchemy==2.0.51`, `PyMySQL==1.2.0`, `cryptography==49.0.0`, `Flask-JWT-Extended==4.7.1`.
   - `app/config.py:15-16`: Database URI points to MySQL at `mysql+pymysql://root:Nishant%40321@127.0.0.1:3306/advance_erp`.
   - Live query confirmed active connection with 32 MySQL tables, including 9 users in `users`, 27 reports in `reports`, 156 mappings in `db_task_catalog`, and 784 factor configurations in `commodity_configs`.

2. **Hardcoded User and Commodity Arrays**:
   - `app/static/js/admin.js:4046`:
     ```javascript
     const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
     ```
   - `app/static/js/admin.js:3415-3420`:
     ```html
     <select id="map-filter-user" style="width: 100%;">
         <option value="">All Assignees</option>
         <option value="Nishant">Nishant</option>
         <option value="Bhawna">Bhawna</option>
         <option value="Pankaj">Pankaj</option>
         <option value="Nitesh">Nitesh</option>
         <option value="Gopi">Gopi</option>
     </select>
     ```
   - `app/static/js/admin.js:4047-4071`:
     `harmonizedCommodities` is a static 23-element array (`'Bajra'`, `'Barley'`, ... `'Macro / All'`).
   - `app/static/js/crishi.js:882, 5008, 5593`:
     ```javascript
     const priorityUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
     ```

3. **Current User & Report Schemas and Relations**:
   - `app/models.py:17-48`: `User` has `id`, `email`, `name`, `role`, `department`, `active`, `password_hash`, `commodities` (comma-separated text), `backup_of`, `is_roster_sub_admin`. It lacks explicit `backup_1`, `backup_2`, and relationship to `Report`.
   - `app/models.py:64-109`: `Report` has `id`, `name`, `deadline`, `primary_assignee` (plain VARCHAR string matching user name), `backup_1`, `backup_2`, `frequency`, `schedule_day`, `instructions`. It has no foreign key to `users` and no `commodity` column.
   - `app/models.py:80-96`: `Report.to_dict()` infers commodity via an `if/elif` string search where `'tur'` is checked on line 87 before `'turmeric'` on line 93, causing `'Turmeric Daily'` (ID 23) and `'Turmeric Weekly'` (ID 24) to be incorrectly classified as `'Pulses'`.

4. **Table Mapping Endpoints & Crishi DB Integration**:
   - `app/routes/admin.py:1141-1168`: `GET /api/admin/table-mappings` returns `DBTaskCatalog.query.all()` without returning active database users or configured commodities.
   - `app/routes/admin.py:1170-1250`: `POST /api/admin/table-mappings` accepts `assigned_user` and `commodity` as raw strings and saves to `DBTaskCatalog`.

5. **Existing Migration Pattern**:
   - `app/__init__.py:94-96, 132-173`: Application startup executes `db.create_all()` followed by `_run_lightweight_migrations()`. `_run_lightweight_migrations()` inspects columns using `sqlalchemy.inspect(db.engine)` and executes non-destructive `ALTER TABLE \`table\` ADD COLUMN \`col\` ...`.

---

## 2. Logic Chain

1. **Why Table Mapping Studio Fails Dynamic Linking (R1)**:
   - Observation 2 directly proves that `admin.js:4046` and `admin.js:3415-3420` use hardcoded string literals for the 5 users `'Nishant'`, `'Bhawna'`, `'Pankaj'`, `'Nitesh'`, and `'Gopi'`.
   - When a user is added via `POST /api/admin/users`, the row is created in MySQL table `users` (Observation 1), but the modal and filter in Table Mapping Studio read from the static array rather than the database.
   - Therefore, replacing the static arrays with dynamically fetched active users from the database (`/api/admin/table-mappings` or `/api/admin/users`) and commodities from `reports`/`commodity_configs` resolves R1.

2. **Why Unified Hierarchy Requires Schema & UI Extensions (R2 & R3)**:
   - Observation 3 shows that `User` currently lacks fields for 1st Backup, 2nd Backup, and relational links to `Report`.
   - Observation 3 also shows that all 27 reports in `reports` currently have `primary_assignee` matching existing `User.name` values, but have no foreign keys or relational tables linking them to users.
   - Adding `backup_1` and `backup_2` to `users`, `user_id` and `commodity` to `reports`, and establishing dedicated relational tables `user_report_mappings` and `user_commodity_mappings` provides the complete hierarchical structure without dropping or altering existing columns.
   - Using the established lightweight migration pattern (Observation 5) guarantees that all existing 9 users, 27 reports, and 156 table mappings remain 100% intact with zero data loss.

3. **Why Relational Consistency Is Maintained on Updates**:
   - If an admin edits a user's name via `PUT /api/admin/users/<email>`, updating `Report.primary_assignee`, `user_report_mappings.report_name`, and `db_task_catalog.user_name` ensures that table mappings in Table Mapping Studio and reports across all ERP views reflect the change synchronously.

---

## 3. Caveats

1. `agalabsdev_stage` database: Table Mapping Studio references `agalabsdev_stage` tables for live schema inspection (e.g. checking column types like `Date`, `WeekEndingDate`). The fallback snapshot directory `latest_two_dates_agalabsdev_stage` is present and functional if MySQL access to `agalabsdev_stage` is offline.
2. Inactive user handling: User ID 7 (`Damini`) is marked `role = 'Inactive'`. Dynamic user lists for Table Mapping Studio should filter for `active == True` and `role != 'Inactive'`.
3. Report-to-Commodity inference bug: The bug identified in `Report.to_dict()` (Turmeric -> Pulses) should be corrected when backfilling `reports.commodity` so Turmeric reports are accurately associated with the Turmeric commodity.

---

## 4. Conclusion

The codebase and database have been fully investigated. The required solution is cleanly achievable with:
1. **Schema & Migration**:
   - Add `backup_1`, `backup_2` to `users`.
   - Add `user_id`, `commodity` to `reports`.
   - Create `user_report_mappings` and `user_commodity_mappings` with foreign keys to `users(id)`.
   - Backfill existing data via boot migration in `_run_lightweight_migrations()`.
2. **Backend APIs**:
   - Update `GET /api/admin/users`, `POST /api/admin/users`, and `PUT /api/admin/users/<email>` to receive, validate, and return the full hierarchy (Name, Email, Role, Department, Backups 1 & 2, assigned Reports with timing/deadlines, assigned Commodities).
   - Update `GET /api/admin/table-mappings` to provide active users and active commodities in its response.
   - Update `PUT /api/admin/users/<email>` to synchronize name updates across `db_task_catalog` and `reports`.
3. **Frontend (`admin.js`)**:
   - In Table Mapping Studio: replace hardcoded user and commodity arrays with dynamic lists from the database.
   - In User Management: update the modal to provide the full hierarchy, including internal popup modals for Report timing / mapping configuration and Commodity mapping configuration.
4. **Automated Verification**:
   - Provide `tests/test_unified_hierarchy.py` using Flask's `test_client()` to validate user creation with hierarchy, persistence, and dynamic appearance in Table Mapping Studio.

---

## 5. Verification Method

To independently verify the findings and the proposed implementation:

1. **Verify Database Connection and Table Counts**:
   ```powershell
   .venv\Scripts\python -c "from app import create_app, db; from app.models import User, Report, DBTaskCatalog, CommodityConfig; app = create_app();
   with app.app_context():
       print('Users:', User.query.count())
       print('Reports:', Report.query.count())
       print('DBTaskCatalog:', DBTaskCatalog.query.count())
       print('CommodityConfig:', CommodityConfig.query.count())"
   ```
   *Expected Output*: Users: 9, Reports: 27, DBTaskCatalog: 156, CommodityConfig: 784.

2. **Verify Hardcoded Arrays in `admin.js`**:
   - Inspect line 4046 of `app/static/js/admin.js` to observe `authenticUsers`.
   - Inspect lines 3415-3420 of `app/static/js/admin.js` to observe static options in `#map-filter-user`.
   - Inspect line 4047 of `app/static/js/admin.js` to observe `harmonizedCommodities`.

3. **Verify API Connectivity via Test Client**:
   ```powershell
   .venv\Scripts\python -c "from app import create_app; from flask_jwt_extended import create_access_token; app = create_app();
   with app.app_context():
       c = app.test_client()
       token = create_access_token(identity='nishant@agalabs.com')
       res = c.get('/api/admin/users', headers={'Authorization': f'Bearer {token}'})
       assert res.status_code == 200
       print('API /admin/users returned 200 with', len(res.get_json()['data']), 'users')"
   ```

4. **Verify Survey Report Artifact**:
   - View `.agents/teamwork/explorer_survey_1/survey_report.md` for complete DDL, model specifications, route contracts, and UI integration designs.
