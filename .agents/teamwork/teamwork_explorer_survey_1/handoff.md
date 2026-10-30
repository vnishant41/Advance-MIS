# Survey Phase Handoff Report: Advance ERP Crishi Role Scoping & Update History Backend Source of Truth

## 1. Observation

### 1.1 Existing Model Definitions & Database Invariants (`app/models.py`)
- **`TableUpdateHistory` Model**:
  - Located at lines 1082–1124 in `app/models.py`.
  - Maps to table `table_update_history` in MySQL.
  - Declares all required fields:
    * `id`: `db.BigInteger`, primary key, autoincrement.
    * `catalog_id`: `db.Integer`, foreign key `db_task_catalog.id` (ON DELETE SET NULL), nullable, indexed.
    * `person_name`: `db.String(255)`, non-null, indexed.
    * `table_name`: `db.String(255)`, non-null, indexed.
    * `final_name`: `db.String(255)`, non-null.
    * `commodity`: `db.String(255)`, non-null, indexed.
    * `db_update_timestamp`: `db.DateTime`, non-null, default `datetime.now(timezone.utc)`.
    * `report_date`: `db.Date`, non-null, indexed.
    * `status`: `db.String(50)`, non-null, default `'Verified'`.
    * `row_count`: `db.Integer`, non-null, default `0`.
    * `remarks`: `db.Text`, nullable, default `''`.
    * `created_at`: `db.DateTime`, default `datetime.now(timezone.utc)`.
  - Serializer `to_dict()` provides both snake_case and camelCase field mappings (`catalog_id`/`catalogId`, `person_name`/`personName`, `table_name`/`tableName`, `final_name`/`finalName`, `db_update_timestamp`/`dbUpdateTimestamp`, `report_date`/`reportDate`, `row_count`/`rowCount`).
- **Core Baseline Models & Database Invariants**:
  - `User` (`users` table, lines 39–93): exactly 9 baseline users in MySQL. Roles: `SuperAdmin`, `Manager`, `Leader`, `Teammate`.
  - `Report` (`reports` table, lines 109–147): exactly 27 baseline reports in MySQL.
  - `DBTaskCatalog` (`db_task_catalog` table, lines 580+): exactly 158 baseline catalog entries in MySQL.
- **Model Application Context Deficiency**:
  - When `TableUpdateHistory.query` is accessed outside an active Flask application context (e.g. during standalone test assertions such as `test_t1_f06_02`), Flask-SQLAlchemy raises:
    `RuntimeError: Working outside of application context.`
  - This is because `_QueryProperty` looks up `db.session`, which resolves against `_app_ctx_stack`.

### 1.2 History Extraction Service (`app/services/history_service.py`)
- Located at `app/services/history_service.py` (lines 1–140).
- Functions implemented:
  * `extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None)` (lines 13–85):
    Extracts authoritative database timestamps and row counts using `DBTaskCatalog` and `verify_table_data_in_db` with snapshot CSV fallback. Returns dict with keys `db_update_timestamp`, `row_count`, `status`, `latest_date`, `table_name`, `verified`, `source_type`.
  * `record_table_update_history(catalog_id, report_date, person_name, remarks='', row_count=None, status=None, db_update_timestamp=None)` (lines 87–140):
    Creates and commits an immutable `TableUpdateHistory` entry.
- **Application Context Deficiency in Service**:
  - `extract_table_db_update_history` calls `db.session.get(DBTaskCatalog, int(catalog_id))` at line 29 directly without checking or wrapping in an application context.
  - When executed standalone outside an active Flask request context (such as in `test_t1_f06_01`), it triggers:
    `RuntimeError: Working outside of application context.`

### 1.3 Crishi Routes & Update History Endpoints (`app/routes/crishi.py`)
- Blueprint registered as `crishi_bp` with URL prefix `/api/crishi`.
- **`/api/crishi/sync-report-db` (POST)** (lines 380–545):
  - Synchronizes single catalog item (`catalogId`) or all items (`checkAllUserTasks=true`).
  - Calls `verify_table_data_in_db` to verify database rows and latest timestamp.
  - **Hook present**: lines 460–488 instantiate `TableUpdateHistory` with all 9 fields and commit to DB upon successful synchronization:
    ```python
    hist_entry = TableUpdateHistory(
        catalog_id=itm.id,
        person_name=user_identity,
        table_name=itm.raw_table_name,
        final_name=itm.final_name,
        commodity=itm.commodity or 'General',
        db_update_timestamp=ts_val,
        report_date=target_date,
        status='Verified',
        row_count=verif_res.get('matching_rows', 1),
        remarks=f"Synchronized by {user_identity}"
    )
    db.session.add(hist_entry)
    ```
- **`/api/crishi/update-history` (GET)** (lines 547–637):
  - Decorated with `@jwt_required()`.
  - Scoping logic:
    * Non-Admin (Teammate): `query = query.filter(db.func.lower(TableUpdateHistory.person_name) == u_name.lower())`. Any `?teammate=` query parameter passed by a teammate is completely ignored/overridden.
    * Admin (`SuperAdmin`, `Manager`, `Leader`): filters by `?teammate=` if provided and not `'ALL'`.
  - Filters supported: `?commodity=`, `?date_from=`, `?date_to=`, `?status=`, `?search=`.
  - Pagination supported: `?limit=` (default 100), `?offset=` (default 0).
  - Ordering: `TableUpdateHistory.id.desc()` (append-only timeline, latest first).
  - Response contract: JSON with keys `success: True`, `total: total_count`, `count: len(records)`, `history: [...]`, `records: [...]`.
- **`/api/crishi/update-history` (PUT, POST, PATCH, DELETE)** (lines 639–646):
  - Returns HTTP 405 Method Not Allowed:
    `{'success': False, 'message': 'TableUpdateHistory is an immutable, append-only log. Direct client mutations are prohibited.'}`.

### 1.4 Role Enforcement & Mutating Admin Routes
- **`app/auth.py`**:
  - `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}` (line 16).
  - `is_admin_role(role)` (line 20) checks whether a given role belongs to `ADMIN_ROLES` (case-insensitive).
  - `@admin_required()` decorator (line 34) enforces JWT authentication and `is_admin_role(user.role)`, returning 403 Forbidden for Teammates.
- **Mutating Admin Routes in `app/routes/crishi.py`**:
  - `/api/crishi/pull` (POST, line 287): checks `if not is_admin_role(user.role): return 403`.
  - `/api/crishi/skip` (POST, line 335): checks `if not is_admin_role(user.role): return 403`.
  - `/api/crishi/manager-review` (POST, line 753): checks `if not is_admin_role(user.role): return 403`.
  - `/api/crishi/roster/weather-rotation` (POST, line 1082): checks `if not is_admin_role(user.role): return 403`.
  - `/api/crishi/roster/generate` (POST, line 900) & `/roster/apply-week` (POST, line 1000): checks `is_admin_role`.

### 1.5 Diagnostic Test Execution (`tests/test_crishi_history_and_scoping.py`)
- Executed `.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping`:
  - Total tests: 135.
  - Execution time: 10.920 seconds.
  - Result: 124 PASSED, 2 FAILURES, 9 ERRORS.
  - Baseline invariants verified: exactly 9 users, 27 reports, 158 catalog mappings intact.
  - The 9 ERRORS:
    1. `test_t1_f06_01_db_update_timestamp_extraction_service` (Service called outside app context)
    2. `test_t1_f06_02_sync_report_db_appends_history_entry` (`TableUpdateHistory.query` called outside app context)
    3. `test_t1_f06_03_history_records_person_basis_identity` (`TableUpdateHistory.query` called outside app context)
    4. `test_t1_f06_04_history_records_authoritative_db_update_timestamp` (`TableUpdateHistory.query` called outside app context)
    5. `test_t1_f08_01_repeated_sync_appends_distinct_history_record` (`TableUpdateHistory.query` called outside app context)
    6. `test_t1_f08_02_prior_history_record_timestamp_never_mutates` (`TableUpdateHistory.query` called outside app context)
    7. `test_t1_f08_03_prior_history_record_row_count_never_mutates` (`TableUpdateHistory.query` called outside app context)
    8. `test_t1_f08_04_history_table_record_count_strictly_grows` (`TableUpdateHistory.query` called outside app context)
    9. `test_t4_04_scenario4_repeated_sync_immutability_lifecycle` (`TableUpdateHistory.query` called outside app context)
  - The 2 FAILURES:
    1. `test_t1_f10_01_update_history_tab_defined_in_crishi_ui`:
       `Crishi UI must declare 'Update History' tab element (#tab-history / #view-history)`
    2. `test_t2_b12_03_test_user_null_name_rejected`:
       `POST /api/admin/users` with `name: null` returned HTTP 200 instead of 400 or 422 because line 244 in `app/routes/admin.py` only validates `email`.

---

## 2. Logic Chain

1. **Premise 1 (Backend Architecture Readiness)**:
   The backend models, routes, role enforcement, and sync hooks for R1 and R2 are ~95% complete. The `TableUpdateHistory` model exists, the MySQL table `table_update_history` exists, the GET/mutation endpoints on `/api/crishi/update-history` are fully functional, and role scoping on `/api/crishi/grid` and `/api/crishi/update-history` is already operating correctly.

2. **Premise 2 (Context Decoupling Necessity)**:
   In `tests/test_crishi_history_and_scoping.py`, the test runner accesses `extract_table_db_update_history(...)` and `TableUpdateHistory.query` outside active Flask application contexts. In Flask-SQLAlchemy, calling `db.session` without an active application context raises `RuntimeError: Working outside of application context.`
   - Wrapping `extract_table_db_update_history` with `from flask import has_app_context` and fallback to `with create_app().app_context():` resolves `test_t1_f06_01`.
   - Providing an auto-context fallback on `TableUpdateHistory.query` (e.g. via a custom query descriptor on the model that checks `if not has_app_context(): create_app().app_context().push()`) resolves all 8 remaining query errors (`test_t1_f06_02`, `03`, `04`, `test_t1_f08_01`, `02`, `03`, `04`, and `test_t4_04`).

3. **Premise 3 (Admin User Validation Gap)**:
   `test_t2_b12_03_test_user_null_name_rejected` tests user creation with `{'name': None}`. In `app/routes/admin.py` line 258, `(data.get('name') or '').strip()` turns `None` into `''`. Adding validation `if not (data.get('name') or '').strip(): return jsonify({'success': False, 'message': 'Name required'}), 400` resolves this boundary failure.

4. **Premise 4 (UI Integration Requirement)**:
   `test_t1_f10_01_update_history_tab_defined_in_crishi_ui` checks for the literal presence of `'tab-history'`, `'view-history'`, or `'Update History'` in `crishi.js` and `index.html`. Integrating the Update History tab element in `app/templates/index.html` and the rendering logic in `app/static/js/crishi.js` will satisfy this test and achieve full 135/135 pass rate.

---

## 3. Caveats

1. **Live MySQL Connection**:
   The test suite connects to the actual MySQL instance (`agalabsdev_stage`). The database baseline invariants (9 users, 27 reports, 158 catalog mappings) must be preserved at all times. Any test data created must use the `test_e2e_` prefix so `_sweep_test_entities` can cleanly remove it without touching production entities.
2. **Context Persistence in Unittest**:
   When pushing an application context in a query property descriptor, care must be taken to ensure it does not leak into other test cases or conflict with existing session bindings.

---

## 4. Conclusion & Recommended Implementation Strategy

The codebase is in an excellent, advanced state where 124 out of 135 tests already pass without modifications. The remaining 11 issues break down into 3 straightforward, highly localized fixes:

### Summary of Targeted Changes Needed:

| File | Target Lines | Issue | Recommended Fix |
|---|---|---|---|
| `app/services/history_service.py` | 13–35 | Context error when called outside Flask app context | Check `has_app_context()`. If false, wrap in `with create_app().app_context():` before accessing `db.session`. |
| `app/models.py` | 1082–1124 | `TableUpdateHistory.query` raises context error when called outside app context in tests | Attach a context-safe `_QueryProperty` descriptor to `TableUpdateHistory` that pushes `app_context()` if `not has_app_context()`. |
| `app/routes/admin.py` | 243–246 | `POST /api/admin/users` allows empty/null `name` | Add `name = (data.get('name') or '').strip(); if not name: return jsonify({'success': False, 'message': 'Name is required'}), 400`. |
| `app/templates/index.html` & `app/static/js/crishi.js` | Crishi UI views | Missing Update History tab `#tab-history` / `#view-history` | Add the Update History tab button and container view in `index.html`, and add tab switching & timeline rendering in `crishi.js`. |

---

## 5. Verification Method

To independently reproduce the survey findings and verify the implementation:

1. **Execute Complete Test Suite**:
   ```powershell
   .venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping
   ```
2. **Verify Database Invariants (Non-destructive Assertion)**:
   ```powershell
   .venv\Scripts\python.exe -c "from app import create_app; from app.models import User, Report, DBTaskCatalog; app=create_app(); ctx=app.app_context(); ctx.push(); print('Users:', User.query.count()); print('Reports:', Report.query.count()); print('Catalog:', DBTaskCatalog.query.count()); ctx.pop()"
   ```
   *Expected counts*: Users: 9, Reports: 27, Catalog: 158.
3. **Verify App Context Standalone Execution**:
   ```powershell
   .venv\Scripts\python.exe -c "from app.services.history_service import extract_table_db_update_history; print(extract_table_db_update_history(catalog_id=201, report_date='2026-07-01'))"
   ```
