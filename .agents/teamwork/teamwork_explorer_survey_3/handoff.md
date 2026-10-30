# Survey Report: Test Suite & Database Invariant Constraints

**Explorer**: Explorer 3 (Survey Phase)  
**Target Module**: Advance ERP Crishi Role Scoping & Update History  
**Working Directory**: `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\teamwork_explorer_survey_3`  
**Date**: 2026-10-28T20:25:00Z  

---

## 1. Observation

### 1.1 Baseline Test Execution
- **Command Executed**:
  ```powershell
  .venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping
  ```
- **Overall Result**:
  - Total Tests: **135**
  - Execution Time: **10.757s**
  - Passed: **124**
  - Failures: **2**
  - Errors: **9**
  - Invariant Verification Status:
    `[migration] Zero data loss verified: 9 users, 27 reports, 158 catalog entries intact.` (logged cleanly 4 times during teardown of classes).

### 1.2 Verbatim Test Failures and Errors
From test output log:

#### A. 9 Errors — Missing Flask Application Context (`RuntimeError: Working outside of application context`)
1. **`test_t1_f06_01_db_update_timestamp_extraction_service`**:
   - Location: `tests/test_crishi_history_and_scoping.py:552`
   - Traceback:
     ```python
     res = extract_table_db_update_history(catalog_id=201, report_date='2026-07-01')
     # File "app\services\history_service.py", line 29, in extract_table_db_update_history
     catalog_item = db.session.get(DBTaskCatalog, int(catalog_id))
     # RuntimeError: Working outside of application context.
     ```
2. **`test_t1_f06_02_sync_report_db_appends_history_entry`**:
   - Location: `tests/test_crishi_history_and_scoping.py:571`
   - Traceback:
     ```python
     rec = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).first()
     # RuntimeError: Working outside of application context.
     ```
3. **`test_t1_f06_03_history_records_person_basis_identity`**:
   - Location: `tests/test_crishi_history_and_scoping.py:582`
   - Traceback:
     ```python
     rec = TableUpdateHistory.query.filter_by(catalog_id=201, person_name='Bhawna').order_by(TableUpdateHistory.id.desc()).first()
     # RuntimeError: Working outside of application context.
     ```
4. **`test_t1_f06_04_history_records_authoritative_db_update_timestamp`**:
   - Location: `tests/test_crishi_history_and_scoping.py:590`
   - Traceback:
     ```python
     rec = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.desc()).first()
     # RuntimeError: Working outside of application context.
     ```
5. **`test_t1_f08_01_repeated_sync_appends_distinct_history_record`**:
   - Location: `tests/test_crishi_history_and_scoping.py:688`
   - Traceback:
     ```python
     records = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).order_by(TableUpdateHistory.id.desc()).all()
     # RuntimeError: Working outside of application context.
     ```
6. **`test_t1_f08_02_prior_history_record_timestamp_never_mutates`**:
   - Location: `tests/test_crishi_history_and_scoping.py:697`
   - Traceback:
     ```python
     records = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.asc()).all()
     # RuntimeError: Working outside of application context.
     ```
7. **`test_t1_f08_03_prior_history_record_row_count_never_mutates`**:
   - Location: `tests/test_crishi_history_and_scoping.py:711`
   - Traceback:
     ```python
     records = TableUpdateHistory.query.filter_by(catalog_id=201).order_by(TableUpdateHistory.id.asc()).all()
     # RuntimeError: Working outside of application context.
     ```
8. **`test_t1_f08_04_history_table_record_count_strictly_grows`**:
   - Location: `tests/test_crishi_history_and_scoping.py:725`
   - Traceback:
     ```python
     before_count = TableUpdateHistory.query.count()
     # RuntimeError: Working outside of application context.
     ```
9. **`test_t4_04_scenario4_repeated_sync_immutability_lifecycle`**:
   - Location: `tests/test_crishi_history_and_scoping.py:1618`
   - Traceback:
     ```python
     rec1 = TableUpdateHistory.query.filter_by(catalog_id=201, report_date=date(2026, 7, 1)).order_by(TableUpdateHistory.id.desc()).first()
     # RuntimeError: Working outside of application context.
     ```

#### B. 2 Failures
1. **`test_t1_f10_01_update_history_tab_defined_in_crishi_ui`**:
   - Location: `tests/test_crishi_history_and_scoping.py:799`
   - Assertion:
     ```python
     self.assertTrue(
         'tab-history' in combined or 'view-history' in combined or 'Update History' in combined,
         "Crishi UI must declare 'Update History' tab element"
     )
     # AssertionError: False is not true : Crishi UI must declare 'Update History' tab element
     ```
2. **`test_t2_b12_03_test_user_null_name_rejected`**:
   - Location: `tests/test_crishi_history_and_scoping.py:1361`
   - Assertion:
     ```python
     self.assertIn(res.status_code, [400, 422])
     # AssertionError: 200 not found in [400, 422]
     ```
   - Observed in `app/routes/admin.py:243-268`: `add_user()` validates `email`, but defaults `name` to `(data.get('name') or '').strip()` without rejecting `None` or empty strings.

---

### 1.3 Test Suite Architecture & Fixtures

`tests/test_crishi_history_and_scoping.py` contains **1 base class** and **4 test classes**, totaling **135 test methods**:

```
BaseCrishiHistoryTestCase (unittest.TestCase)
├── TestTier1FeatureCoverage (60 tests: Features 1-12, 5 tests each)
├── TestTier2BoundaryCornerCases (60 tests: Features 1-12 Boundaries, 5 tests each)
├── TestTier3CrossFeatureInteractions (10 tests: Cross-role, composite filters, immutability)
└── TestTier4RealWorldScenarios (5 tests: Comprehensive end-to-end user workflows)
```

#### A. Fixture Lifecycle & Invariant Protection
1. **`setUpClass`**:
   - Calls `create_app()` with `TESTING = True`.
   - Initializes `self.client = self.app.test_client()`.
   - Executes `self._sweep_test_entities()` inside `app.app_context()` to purge any orphan test data.
2. **`tearDownClass`**:
   - Sweeps test artifacts with `cls._sweep_test_entities()`.
   - Strictly asserts:
     - `User.query.count() == 9`
     - `Report.query.count() == 27`
     - `DBTaskCatalog.query.count() == 158`
3. **Artifact Cleanup Mechanism (`_sweep_test_entities`)**:
   - Deletes from `TableUpdateHistory` where `table_name LIKE 'test_e2e_%'` or `person_name LIKE 'Test E2E%'`.
   - Deletes from `DBTaskCatalog` where `raw_table_name LIKE 'test_e2e_%'` or `final_name LIKE 'Test E2E%'`.
   - Deletes from `Report` where `name LIKE 'test_e2e_%'`.
   - Deletes from `User` where email/name matches test prefixes (`test_e2e_%`, `%test_null%`, `%ghost_user%`, `Test E2E%`, `Duplicate User%`, `No Email%`).
4. **Per-Test Cleanup (`setUp` / `tearDown`)**:
   - `setUp` tracks `self.created_history_ids`, `self.created_user_ids`, `self.created_emails`.
   - `tearDown` deletes these specific records by ID/email within `app.app_context()`.

#### B. Authentication & JWT Tokens
- Uses `flask_jwt_extended.create_access_token` inside `self.app.app_context()`:
  ```python
  create_access_token(identity=email, additional_claims={'role': role})
  ```
- Generates real signed JWT tokens with claims matching production.
- Dedicated header helpers provided:
  - `get_admin_headers()`: `vaibhav@agalabs.com` (SuperAdmin)
  - `get_manager_headers()`: `ram@agalabs.com` (Manager)
  - `get_leader_headers()`: `test_e2e_leader@agalabs.com` (Leader)
  - `get_bhawna_headers()`: `bhawna@agalabs.com` (Teammate)
  - `get_gopi_headers()`: `gopichand@agalabs.com` (Teammate)
  - `get_nitesh_headers()`: `nitesh@agalabs.com` (Teammate)
  - `get_pankaj_headers()`: `pankaj@agalabs.com` (Teammate)

#### C. UI Inspection Helpers
- Reads `app/static/js/crishi.js` and `app/templates/index.html` via UTF-8 filesystem inspection helpers `get_crishi_js_content()` and `get_index_html_content()`.

---

### 1.4 Database Invariant Entities

Direct inspection of MySQL database (`advance_erp`) yielded the exact baseline state:

#### A. Exactly 9 Baseline Users
| ID | Email | Name | Role | Assigned Commodities | Active |
|---|---|---|---|---|---|
| 1 | `nishant@agalabs.com` | Nishant | SuperAdmin | Pulses, Tops | True |
| 3 | `ram@agalabs.com` | Ram Gopal | Manager | *(unrestricted)* | True |
| 4 | `gopichand@agalabs.com` | Gopi | Teammate | Rice, Wheat | True |
| 5 | `nitesh@agalabs.com` | Nitesh | Teammate | Bajra, Barley, Maize, Sugar | True |
| 6 | `pankaj@agalabs.com` | Pankaj | Teammate | Chilli, Coriander, Cumin, Turmeric, Weather | True |
| 7 | `damini@agalabs.com` | Damini | Inactive | *(none)* | False |
| 8 | `bhawna@agalabs.com` | Bhawna | Teammate | Cotton, Rapeseed, Soybeans, Weather | True |
| 13 | `balram@agalabs.com` | Balram | Teammate | *(none)* | False |
| 14 | `vaibhav@agalabs.com` | Vaibhav | SuperAdmin | *(unrestricted)* | True |

#### B. Exactly 27 Baseline Reports
All 27 reports are active with distinct commodity tags:
1. `Bajra Weekly` (Bajra)
2. `Barley Weekly` (Barley)
3. `Chilli Daily` (Chilli)
4. `Chilli Weekly` (Chilli)
5. `Coriander Daily` (Coriander)
6. `Coriander Weekly` (Coriander)
7. `Cotton Weekly` (Cotton)
8. `Cumin Daily` (Cumin)
9. `Cumin Weekly` (Cumin)
10. `Maize Daily` (Maize)
11. `Maize Weekly` (Maize)
12. `Pulses Daily` (Pulses)
13. `Pulses Weekly` (Pulses)
14. `Rapeseed Daily` (Rapeseed)
15. `Rapeseed Weekly` (Rapeseed)
16. `Rice Daily` (Rice)
17. `Rice Weekly` (Rice)
18. `Soybeans Daily` (Soybeans)
19. `Soybeans Weekly` (Soybeans)
20. `Sugar Daily` (Sugar)
21. `Sugar Weekly` (Sugar)
22. `Tops Daily` (Tops)
23. `Turmeric Daily` (Turmeric)
24. `Turmeric Weekly` (Turmeric)
25. `Weather Daily` (Weather)
26. `Wheat Daily` (Wheat)
27. `Wheat Weekly` (Wheat)

#### C. Exactly 158 Baseline Catalog Mappings (`DBTaskCatalog`)
- **Total Rows**: 158
- **Active Status**: 140 Active (`is_active=True`), 18 Inactive (`is_active=False`)
- **Assignee Breakdown (`user_name`)**:
  - `Gopi`: 41
  - `Nishant`: 39
  - `Bhawna`: 36
  - `Nitesh`: 34
  - `Pankaj`: 7
  - `Pooja S. Verma`: 1
- **Frequency Breakdown**:
  - Monthly: 61
  - Daily: 49
  - Weekly: 46
  - Yearly: 2
- **Commodity Breakdown**:
  - Wheat: 29
  - Soybeans: 19
  - Weather: 11
  - Maize: 10
  - Sugar: 10
  - Rice: 5
  - Macro: 5
  - Agronomics: 4
  - Chilli: 4
  - Rapeseed: 3
  - Multi-commodity bundles (e.g. Bengal Gram, Tur, Urad, Moong, Masoor, Pea): 35
  - Others: 24

---

## 2. Logic Chain

1. **Test Infrastructure & App Context**:
   - Flask-SQLAlchemy 3.x binds model sessions (`Model.query` and `db.session`) to the active Flask application context.
   - When HTTP requests execute via `self.client`, Flask automatically pushes and tears down the context for the duration of the request.
   - In 25 places in `tests/test_crishi_history_and_scoping.py`, the test author explicitly wrapped ORM operations inside `with self.app.app_context():`.
   - In 8 tests (`test_t1_f06_02`, `test_t1_f06_03`, `test_t1_f06_04`, `test_t1_f08_01`, `test_t1_f08_02`, `test_t1_f08_03`, `test_t1_f08_04`, `test_t4_04`), lines referencing `TableUpdateHistory.query` occurred immediately after `self.client.post(...)` without `with self.app.app_context():`.
   - Therefore, these 8 tests failed with `RuntimeError: Working outside of application context.`

2. **Standalone History Service Context Requirement**:
   - In `test_t1_f06_01_db_update_timestamp_extraction_service`, `extract_table_db_update_history` is intentionally called directly without an active app context.
   - Requirement R2 states:
     *"extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None) that handles running both inside and outside active Flask application contexts (e.g. using from flask import current_app or fallback to create_app().app_context())."*
   - In `app/services/history_service.py:29`, the function attempts `db.session.get(DBTaskCatalog, int(catalog_id))` unconditionally. Without checking `has_app_context()`, it crashes with `RuntimeError`.

3. **UI Element Declaration**:
   - `test_t1_f10_01_update_history_tab_defined_in_crishi_ui` checks for `'tab-history'`, `'view-history'`, or `'Update History'` in `app/static/js/crishi.js` and `app/templates/index.html`.
   - Grep search confirms neither string is present in those UI files yet.
   - Therefore, the test failed as expected for an unimplemented UI component.

4. **API Validation on Null User Name**:
   - `test_t2_b12_03_test_user_null_name_rejected` sends `POST /api/admin/users` with `'name': None`.
   - In `app/routes/admin.py:258`, `name` is parsed as `(data.get('name') or '').strip()` without validating presence. The user is created and returns 200 OK instead of 400 Bad Request.
   - Adding a check:
     ```python
     name = (data.get('name') or '').strip()
     if not name:
         return jsonify({'success': False, 'message': 'Name required'}), 400
     ```
     directly resolves this failure.

5. **Invariant Stability**:
   - During and after all test runs, the database stayed strictly at 9 users, 27 reports, and 158 catalog mappings.
   - The test cleanup hooks (`_sweep_test_entities` and `tearDown`) reliably rolled back/cleaned all ephemeral entities.

---

## 3. Caveats

1. **Read-Only Survey Scope**:
   - In accordance with explorer survey instructions, no source files or test scripts were modified during this investigation.
2. **Context Resolution Strategy**:
   - Two approaches exist for the 8 test ORM errors:
     - *Approach A*: Update `BaseCrishiHistoryTestCase.setUp` to push `self.app.app_context()` and `tearDown` to pop it. Note: If done, `test_t1_f06_01` must explicitly test without context (or verify fallback).
     - *Approach B*: Update `app/services/history_service.py` with fallback app context, AND ensure the 8 test methods in `tests/test_crishi_history_and_scoping.py` (or `setUp`) execute with an active application context.
   - Both approaches preserve non-destructive testing and satisfy requirements.

---

## 4. Conclusion

The test suite in `tests/test_crishi_history_and_scoping.py` is comprehensive, high-quality, and structurally sound:
- **124 out of 135 tests (91.9%) already pass cleanly.**
- All 11 non-passing tests (9 errors, 2 failures) have isolated, well-understood root causes:
  1. Missing context fallback in `app/services/history_service.py` (1 error).
  2. Missing app context in 8 test assertions querying `TableUpdateHistory.query` (8 errors).
  3. Missing UI tab `#tab-history` / `#view-history` in `app/templates/index.html` and `app/static/js/crishi.js` (1 failure).
  4. Missing non-empty `name` check in `POST /api/admin/users` in `app/routes/admin.py` (1 failure).
- The database invariants (9 users, 27 reports, 158 catalog mappings) are 100% verified and preserved across test execution.

---

## 5. Verification Method

To independently reproduce and verify this survey:

1. **Run the baseline test suite**:
   ```powershell
   .venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping
   ```
   *Expected result*: Ran 135 tests, FAILED (failures=2, errors=9), `[migration] Zero data loss verified: 9 users, 27 reports, 158 catalog entries intact.`

2. **Verify Database Invariants via CLI**:
   ```powershell
   @'
   from app import create_app, db
   from app.models import User, Report, DBTaskCatalog
   app = create_app()
   with app.app_context():
       print("Users:", User.query.count())
       print("Reports:", Report.query.count())
       print("Catalogs:", DBTaskCatalog.query.count())
   '@ | .venv\Scripts\python.exe
   ```
   *Expected output*: `Users: 9`, `Reports: 27`, `Catalogs: 158`.

3. **Verify Exact Locations of Identified Issues**:
   - `app/services/history_service.py:28-35` (lack of `has_app_context()` check)
   - `app/routes/admin.py:243-258` (missing name validation in `add_user`)
   - `app/templates/index.html` & `app/static/js/crishi.js` (absence of `#tab-history` / `#view-history`)
   - `tests/test_crishi_history_and_scoping.py:571, 582, 590, 688, 697, 711, 725, 1618` (unwrapped `TableUpdateHistory.query`)
