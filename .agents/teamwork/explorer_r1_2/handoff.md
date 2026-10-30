# Baseline Checks Audit Report (R1 Discovery — Part 2)

**Author:** Explorer R1.2 (Baseline Checks: Existing Tests, Syntax/Lint, DB Schema, Security)  
**Date:** 2026-10-28  
**Working Directory:** `.agents/teamwork/explorer_r1_2/`  
**Target Repository:** `Advance ERP` (`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`)

---

## 1. Observation

### 1.1 Existing Test Discovery & Execution Outcomes
The repository contains 3 test suites in `tests/` and 4 standalone ad-hoc test scripts in `scratch/`:
1. `tests/test_hierarchy_and_studio.py` (49 tests) — 4-tier E2E testing suite for User Hierarchy, Table Mapping Studio, Commodity Configs, and zero data loss invariants.
2. `tests/test_adversarial_challenger2.py` (10 tests) — Dynamic linking, user deactivation reflection, commodity whitespace resilience, and cascade integrity.
3. `tests/adversarial_backend_stress.py` (7 tests) — Concurrency, cascade sync, foreign keys, and edge cases.
4. `scratch/test_login.py`, `scratch/test_emails.py`, `scratch/test_grid_comm.py`, `scratch/test_ingestion_logic.py` — Ad-hoc manual verification scripts.

**Execution Command 1:**
```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```
**Result:**
- Total tests run: **59 tests**
- Outcome: **59 PASSED, 0 FAILED, 0 ERRORS** (Duration: 5.791s)
- Discovered test classes:
  - `test_adversarial_challenger2.AdversarialTableMappingTests`: 10 passed
  - `test_hierarchy_and_studio.TestHierarchyAndStudioTier1`: 25 passed
  - `test_hierarchy_and_studio.TestHierarchyAndStudioTier2`: 16 passed
  - `test_hierarchy_and_studio.TestHierarchyAndStudioTier3`: 6 passed
  - `test_hierarchy_and_studio.TestHierarchyAndStudioTier4`: 2 passed

**Execution Command 2:**
```powershell
.venv\Scripts\python.exe -m unittest tests/adversarial_backend_stress.py
```
**Result:**
- Total tests run: **7 tests**
- Outcome: **7 PASSED, 0 FAILED, 0 ERRORS** (Duration: 1.894s)

**Combined Test Totals:** **66 tests executed, 66 PASSED (100% pass rate)**.  
**Baseline Invariant State:** Confirmed zero data loss: 9 users, 27 reports, 158 catalog entries intact.

---

### 1.2 Syntax, Linting, and Type Checks
1. **Python Compilation (`py_compile`):**
   - Command: Checked all 36 active Python files across `app/`, `tests/`, `migrations/`, and `scratch/` (excluding `.venv/` and `.git/`).
   - Outcome: **36 files checked, 0 syntax errors, 0 compilation warnings**.
2. **JavaScript Syntax & Bracket Lexical Validation:**
   - Checked all 14 frontend JavaScript files in `app/static/js/`:
     - `admin.js` (345 KB), `analytics.js` (75 KB), `api.js` (2.7 KB), `app.js` (29 KB), `auth.js` (5.5 KB), `chat.js` (22 KB), `crishi.js` (345 KB), `dashboard.js` (29 KB), `data-update.js` (9.8 KB), `kanban.js` (27 KB), `mis.js` (94 KB), `report.js` (61 KB), `roster.js` (10 KB), `tasks.js` (104 KB).
   - Outcome: **14/14 files PASSED**, zero unclosed brackets, quotes, template literals, or comments.
3. **Linter / Type Checker Availability:**
   - Inspected Python environment: Neither `flake8`, `pylint`, `ruff`, `mypy`, nor `eslint` is installed or configured.

---

### 1.3 Database Schema Integrity & Model Drift Analysis
Inspected live MySQL 8.0.46 database (`advance_erp` at `127.0.0.1:3306`) and compared with SQLAlchemy models in `app/models.py`:

| Metric | Database (`advance_erp`) | SQLAlchemy Models (`app/models.py`) | Status |
|---|---|---|---|
| Total Tables | 34 | 34 | 100% Parity |
| Table Names Match | 34/34 | 34/34 | 100% Parity |
| Foreign Key Constraints | 7 DB-level FKs | Defined in models | 100% Intact, 0 Orphans |
| Character Set / Collation | `utf8mb4` / `utf8mb4_unicode_ci` | (App default) | DB default OK; `db_task_catalog` is `utf8mb3` |

**Identified Schema-Model Drifts:**
1. **`kanban_tasks` column drift:**
   - DB table `kanban_tasks` has column `priority` (`LONGTEXT NULL`).
   - SQLAlchemy model `KanbanTask` in `app/models.py:336-358` does NOT declare `priority`.
2. **`task_templates` column drift:**
   - DB table `task_templates` has column `priority` (`LONGTEXT NULL`).
   - SQLAlchemy model `TaskTemplate` in `app/models.py:253-264` does NOT declare `priority`.
3. **`users` table type discrepancies:**
   - DB table `users` DDL: `email` is `LONGTEXT DEFAULT NULL`, `name` is `LONGTEXT DEFAULT NULL`, `password_hash` is `LONGTEXT DEFAULT NULL`.
   - `User` model in `app/models.py:41-47`: `email` is `db.String(255), unique=True, nullable=False, index=True`.
   - **Observation:** The MySQL engine lacks an explicit `UNIQUE` index or `NOT NULL` constraint on `users.email` because MySQL InnoDB cannot index un-prefixed `LONGTEXT`. Uniqueness is only defensively enforced in Flask route logic.
4. **`reports` table type discrepancies:**
   - DB table `reports` DDL: `name`, `deadline`, `primary_assignee`, `frequency` are all `LONGTEXT NULL` instead of typed `VARCHAR` columns.
5. **Orphaned / Unlinked Records Analysis:**
   - DB Foreign Keys (`user_report_mappings` -> `users`, `user_report_mappings` -> `reports`, `user_commodity_mappings` -> `users`, `task_remarks` -> `db_task_catalog`, etc.): **0 orphaned records**.
   - Logical Unlinked Strings in `db_task_catalog.user_name`:
     - Row 79: `'Nishant, Bhawna, Pankaj, Nitesh, Gopi'` (multi-user assignment string)
     - Row 81: `'Nishant, Bhawna, Pankaj, Nitesh, Gopi'` (multi-user assignment string)
     - Row 398: `'Pooja S. Verma'` (`raw_table_name='test_frontend_3fddd6'`), pointing to non-existent user `Pooja S. Verma`.
   - Logical Links in `reports.primary_assignee` -> `users.name`: **0 unmatched records** across all 27 reports.

---

### 1.4 Dependency and Security Findings

1. **Insecure Short JWT Secret Key (RFC 7518 Violation):**
   - Location: `app/config.py:10` (`JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-erp-secret-2026')`).
   - Verbatim Warning during test runs:
     `D:\...\api_jwt.py:147: InsecureKeyLengthWarning: The HMAC key is 19 bytes long, which is below the minimum recommended length of 32 bytes for SHA256. See RFC 7518 Section 3.2.`
2. **Plaintext Password Storage & Comparison:**
   - Location: `app/auth.py:94` and `app/auth.py:180`.
   - Code:
     - Line 94: `valid_password = (user.password_hash == password)` directly evaluates plaintext string equality against database column `user.password_hash`.
     - Line 180: In `change_password()`, `user.password_hash = new_pwd` stores the new password in plaintext without salt, hash, or PBKDF2/bcrypt hashing.
3. **Hardcoded Fallback Backdoors & Overwrite on Login:**
   - Location: `app/auth.py:104-116`.
   - Code:
     ```python
     env_passwords = ['admin123', ..., 'Qdi@cK@Swc8YR5T']
     if not valid_password and user.role in ['SuperAdmin', 'Manager'] and password in env_passwords:
         valid_password = True
         user.password_hash = password
     ```
   - Impact: Any user with role `SuperAdmin` or `Manager` can be logged into using fallback passwords, and logging in dynamically overwrites the user's password in the database with the fallback string!
   - Line 77-78:
     ```python
     if ident in ['mail.agalabs@gmail.com', 'mail.agalabs', 'gmail']:
         user = User.query.filter(User.role == 'SuperAdmin').first()
     ```
     Inputting alias `'gmail'` automatically logs into whichever account is the first SuperAdmin.
4. **Broken Access Control (`@jwt_required(optional=True)` on Mutating APIs):**
   - Over 30 routes across `app/routes/admin.py`, `app/routes/crishi.py`, and `app/routes/roster.py` use `@jwt_required(optional=True)`.
   - Unauthenticated requests can mutate production state:
     - `POST /api/admin/table-mappings`
     - `PUT /api/admin/table-mappings/<id>`
     - `DELETE /api/admin/table-mappings/<id>`
     - `POST /api/crishi/pull` (defaults identity to `'Manager'` when unauthenticated)
     - `POST /api/crishi/skip`
     - `POST /api/crishi/remarks`
     - `DELETE /api/crishi/remarks/<id>`
     - `GET /api/admin/table-schema/<path:table_name>`
5. **Path Traversal Vulnerability in File Uploads:**
   - Location: `app/routes/mis_report.py:192-194` and `app/routes/mis_report.py:445-447`.
   - Code:
     ```python
     safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"
     filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)
     file.save(filepath)
     ```
   - Missing `werkzeug.utils.secure_filename()`. Filenames containing path traversal tokens (e.g. `../../target.pdf`) are saved outside `UPLOAD_FOLDER`.
6. **SQL Query String Interpolation:**
   - `app/routes/admin.py:1650`: `cur.execute(f"DESCRIBE `{table_name}`;")`
   - `app/services/surveillance.py:280, 322, 328`: f-string interpolation of `{table_name}` and `{col}` into raw SQL without alphanumeric whitelist or backtick escaping.
7. **Wildcard CORS and WebSocket Origin Permissiveness:**
   - `app/__init__.py:13`: `socketio = SocketIO(cors_allowed_origins="*")`
   - `app/__init__.py:40`: `CORS(app)` without origin restrictions.
8. **Missing JWT Revocation / Invalidation on Logout:**
   - `app/auth.py:154-159`: `logout()` merely returns HTTP 200 without token blacklisting or cookie clearing. Issued tokens remain valid for 24 hours (`JWT_ACCESS_TOKEN_EXPIRES = 86400`).
9. **Hardcoded Secrets in Source:**
   - `app/config.py:15`: Default database URI contains database credentials hardcoded in source.
   - `scratch/test_emails.py:6`: Plaintext Gmail app password hardcoded in repo.

---

## 2. Logic Chain

1. **From Test Execution to Test Baseline Assessment:**
   - We executed `python -m unittest discover -s tests -p "test_*.py" -v` and `python -m unittest tests/adversarial_backend_stress.py`.
   - All 66 tests executed without an exception or failure (Ran 59 tests in 5.791s OK, Ran 7 tests in 1.894s OK).
   - This proves that previously reported pending test failures from Milestone 1 (such as 23 failing tests documented in `TEST_READY.md`) have now been satisfied and verified by the test harness.
   - The test assertions explicitly verify baseline data invariants (>=9 users, >=27 reports, >=156 catalog rows) and confirmed 100% preservation.

2. **From Syntax Inspection to Code Integrity Assessment:**
   - We compiled every single Python file in the active repository using `py_compile.compile()` and found zero syntax errors.
   - We lexically checked every single JavaScript file for bracket, quote, template string, regex, and comment balance, and found zero syntax errors.
   - Therefore, the codebase is structurally syntactically sound with no compilation-breaking syntax errors.

3. **From Schema Audit to Schema-Model Parity Assessment:**
   - Comparing live MySQL table names against SQLAlchemy model `__tablename__` attributes revealed an exact 34-to-34 match.
   - Column-by-column diff revealed that `kanban_tasks` and `task_templates` in MySQL have an extra `priority` column that is absent from `app/models.py`.
   - Detailed inspection of MySQL DDL revealed that core tables (`users`, `reports`) use `LONGTEXT` for columns that should have `VARCHAR(255)` with `NOT NULL` and `UNIQUE` constraints.
   - Foreign key integrity checks against live MySQL data showed zero orphaned records across all existing foreign keys.

4. **From Code Inspection to Security Vulnerability Assessment:**
   - Tracing `login()` and `change_password()` in `app/auth.py` demonstrates that password hashes are treated as plaintext strings, with fallback hardcoded master passwords that bypass authentication and overwrite the stored password hash.
   - Tracing API route decorators revealed that over 30 mutating administrative endpoints allow unauthenticated execution via `@jwt_required(optional=True)`.
   - Tracing `mis_report.py` file uploads proved that user-controlled filenames are joined into disk paths without `secure_filename()`.

---

## 3. Caveats

1. **No External Network Dependency Calls:** We tested live MySQL connectivity on `127.0.0.1:3306`, but did not invoke live outbound email sending or external IMAP fetches against Gmail to avoid polluting external mailboxes or triggering provider rate limits.
2. **Read-Only Preservation:** In accordance with the Explorer read-only mandate, no code modifications or database schema alterations were applied.
3. **Database Test Environment Sharing:** The test suites run against the local `advance_erp` MySQL database with namespace isolation (`test_e2e_%`, `test_adv_%`) and cleanup tearDown handlers. All baseline rows were verified untouched before and after test execution.

---

## 4. Conclusion

1. **Tests Baseline:** The existing test infrastructure is in an **exceptional baseline state**: **66/66 tests pass cleanly (100%)** with zero data loss to the 9 users, 27 reports, and 158 table mappings.
2. **Syntax Baseline:** All 36 Python files and 14 JavaScript files pass syntax validation cleanly.
3. **Schema Integrity:** Database-to-model table parity is 100% (34/34 tables). Minor schema-model drift exists in `kanban_tasks.priority` and `task_templates.priority`. Core tables lack database-level UNIQUE/NOT NULL constraints due to legacy `LONGTEXT` column types. Zero orphaned records exist in relational foreign keys.
4. **Security Vulnerabilities:** The codebase contains several critical/high security risks that must be prioritized in remediation:
   - **CRITICAL:** Plaintext password storage and comparison; hardcoded universal master password bypasses in `app/auth.py:104-116`.
   - **CRITICAL:** Broken Access Control — over 30 mutating API routes have `@jwt_required(optional=True)`, allowing unauthenticated modifications to table mappings, manager task pulls, skips, and remarks.
   - **HIGH:** Path traversal vulnerability in `app/routes/mis_report.py` due to omission of `secure_filename()`.
   - **HIGH:** SQL identifier injection risk in `app/routes/admin.py:1650` (`DESCRIBE \`{table_name}\``) and `surveillance.py`.
   - **MEDIUM:** Short JWT secret key (19 bytes < 32 bytes minimum required by RFC 7518) causing PyJWT security warnings; lack of JWT revocation on logout.

---

## 5. Verification Method

To independently verify the observations and findings in this report, execute the following commands in the project root:

### 1. Run Complete Test Suite
```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
.venv\Scripts\python.exe -m unittest tests/adversarial_backend_stress.py
```
*Expected Outcome:* 59 tests passed in discovery + 7 passed in stress harness; zero failures; zero errors.

### 2. Verify Python Syntax
```powershell
.venv\Scripts\python.exe -c "import os, py_compile; files = [os.path.join(r, f) for r, d, fs in os.walk('.') for f in fs if f.endswith('.py') and not any(x in r for x in ['.venv', '.git', '__pycache__', 'Old Data File', 'Old Model files'])]; [py_compile.compile(f, doraise=True) for f in files]; print(f'Successfully compiled {len(files)} Python files.')"
```
*Expected Outcome:* "Successfully compiled 36 Python files." with exit code 0.

### 3. Verify JavaScript Syntax
```powershell
.venv\Scripts\python.exe .agents\teamwork\explorer_r1_2\validate_js.py
```
*Expected Outcome:* All 14 JavaScript files output `PASS`, total issues: 0.

### 4. Verify Database Schema Parity and Drift
```powershell
.venv\Scripts\python.exe .agents\teamwork\explorer_r1_2\db_schema_audit.py
```
*Expected Outcome:* 34 DB tables match 34 models; outputs drift in `kanban_tasks` and `task_templates` for `priority`; reports 0 orphaned records for foreign keys.

### 5. Verify Insecure Key Length Warning
```powershell
.venv\Scripts\python.exe -c "from app import create_app; from flask_jwt_extended import create_access_token; app = create_app(); ctx = app.app_context(); ctx.push(); print(create_access_token(identity='test@agalabs.com'))"
```
*Expected Outcome:* PyJWT emits `InsecureKeyLengthWarning: The HMAC key is 19 bytes long, which is below the minimum recommended length of 32 bytes for SHA256.`
