# Advance ERP Prioritized Bug Register

**Document Version:** 2.0.0 (Post-Remediation Final Bug Register Edition)  
**Audit Milestone:** Milestone 6 (Final Documentation & Synchronization - R5)  
**Execution Timestamp:** 2026-10-28T11:00:00Z  
**Target Repository:** `Advance ERP` (`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`)  
**Audit Lead:** Worker Final Docs M6 / Quality Assurance & Architecture Specialist  
**Integrity Mode:** Development / Zero-Data-Loss / Post-Remediation Verified  

---

## 1. Bug Register Overview & Severity Distribution

During the comprehensive functional audit, codebase discovery, and live module verification, **12 distinct software defects** were identified, reproduced, cataloged, and **100% remediated across Milestone 3 and Milestone 4**. Each bug has been analyzed for root cause, concrete evidence, affected source lines, remediation implementation, and verified through dedicated automated regression tests (104 tests passing, zero warnings).

### Severity Summary Table

| Severity | Identified | Resolved | Resolution Rate | Criteria | Bug IDs |
|---|---|---|---|---|---|
| **CRITICAL** | 2 | 2 | **100%** | Production crash (HTTP 500) or high-risk vulnerability (arbitrary SQL execution) affecting core operations. | `BUG-01`, `BUG-02` |
| **HIGH** | 3 | 3 | **100%** | In-memory process code desynchronization, path traversal vulnerability in file upload handlers, or unauthenticated destructive API endpoints. | `BUG-03`, `BUG-04`, `BUG-11` |
| **MEDIUM** | 3 | 3 | **100%** | Functional data omission (hardcoded user lists), calendar date shift in early-morning IST hours, or ORM deprecation warnings. | `BUG-05`, `BUG-06`, `BUG-07` |
| **LOW** | 4 | 4 | **100%** | Insecure key length warnings, dead DOM event listeners, or responsive CSS mobile layout flaws. | `BUG-08`, `BUG-09`, `BUG-10`, `BUG-12` |
| **Total** | **12** | **12** | **100%** | **All 12 Confirmed Defects Remediated & Verified** | `BUG-01` .. `BUG-12` |

---

## 2. Prioritized Bug Index

| Bug ID | Title | Severity | Affected Module / Layer | Primary File & Lines | Status / Milestone |
|---|---|---|---|---|---|
| **BUG-01** | Missing `import os` causing HTTP 500 in `/api/admin/settings` | **CRITICAL** | Backend REST API | `app/routes/admin.py:464-468` | **Resolved (M3)** |
| **BUG-02** | Unescaped SQL Parameter Interpolation in `/api/admin/table-schema` | **CRITICAL** | Security & Backend API | `app/routes/admin.py:1640-1650` | **Resolved (M3)** |
| **BUG-03** | Running Server Process Out of Sync with Working Tree Code | **HIGH** | Server Runtime | `run.py`, PID 16524 -> PID 5016 | **Resolved (M3, Active PID 5016)** |
| **BUG-04** | Missing File Name Sanitization in `/api/mis/upload-pdf` | **HIGH** | Security & Document Ingestion | `app/routes/mis_report.py:191-195` | **Resolved (M3)** |
| **BUG-05** | Hardcoded Teammate Lists in CRISHI & Admin Modals | **MEDIUM** | Frontend UI & Data Flow | `app/static/js/crishi.js:882, 5008`, `admin.js:2494` | **Resolved (M4)** |
| **BUG-06** | UTC vs IST 1-Day Date Shift Discrepancy at Midnight | **MEDIUM** | Frontend Date Utility | `app/static/js/crishi.js:2095, 2524, 4870, 5009` | **Resolved (M4)** |
| **BUG-07** | SQLAlchemy 2.0 Deprecated `Query.get()` Legacy Warnings | **MEDIUM** | Database ORM Layer | `app/routes/admin.py:176`, `crishi.py:356` | **Resolved (M4)** |
| **BUG-08** | Short JWT HMAC Secret Key Emitting Cryptographic Warning | **LOW** | Configuration & Auth | `app/config.py:10` | **Resolved (M4)** |
| **BUG-09** | Dead/Orphaned Selector `#btn-logout` in `auth.js` | **LOW** | Frontend Auth Lifecycle | `app/static/js/auth.js:16, 21-23` | **Resolved (M4)** |
| **BUG-10** | Mobile Responsive CSS Hides Data Grid Search Box | **LOW** | Responsive Layout | `app/static/css/main.css:469` | **Resolved (M4)** |
| **BUG-11** | Unprotected Mutating Endpoints via `@jwt_required(optional=True)` | **HIGH** | Security & RBAC | `app/routes/admin.py:1464,1621`, `crishi.py:35,77` | **Resolved (M3)** |
| **BUG-12** | Mobile Viewport Topbar Ribbon Overflow on Screens <= 480px | **LOW** | Responsive Layout | `app/static/css/main.css:119-235, 457` | **Resolved (M4)** |

---

## 3. Detailed Bug Records

---

### BUG-01 (CRITICAL): Missing `import os` causing HTTP 500 in `/api/admin/settings`

- **Bug ID:** `BUG-01`
- **Title:** Missing `import os` in `app/routes/admin.py` causes unhandled `NameError` crash on GET `/api/admin/settings`
- **Severity:** **CRITICAL**
- **Affected File(s):** `app/routes/admin.py`
- **Affected Line(s):** Lines 464–468 (and module header lines 1–17)
- **Status:** **Resolved / Fixed (Milestone 3)**

#### Reproduction Steps:
1. Obtain a valid JWT access token by sending a `POST` request to `http://127.0.0.1:5000/api/auth/login` with credentials `vaibhav@agalabs.com` / `admin123`.
2. Send an authenticated HTTP request:
   ```powershell
   $token = (Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/auth/login' -Method Post -Body (@{email='vaibhav@agalabs.com';password='admin123'} | ConvertTo-Json) -ContentType 'application/json').token
   Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/admin/settings" -Headers @{ Authorization = "Bearer $token" }
   ```
3. Observe the HTTP response code and payload.

#### Expected Behavior:
The server returns HTTP `200 OK` with a JSON payload containing application settings, current active configurations, and default SMTP parameters (`smtpHost`, `smtpPort`, `smtpUser`, `smtpFrom`).

#### Actual Behavior (Pre-Fix):
The server crashes with HTTP `500 Internal Server Error` and returns the following Python traceback:
```text
File "d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\app\routes\admin.py", line 464, in get_settings
  'smtpHost': os.getenv('SMTP_HOST', 'smtp.gmail.com'),
NameError: name 'os' is not defined. Did you forget to import 'os'?
```

#### Remediation Implemented:
Added module-level `import os`, `import re`, `import glob` at line 4 of `app/routes/admin.py`.

#### Verification Evidence:
1. Live REST API call against `http://127.0.0.1:5000/api/admin/settings` returns HTTP `200 OK` with `smtpHost: "smtp.gmail.com"`, `smtpPort: "465"`, `smtpUser: "mail.agalabs.com"`, and `success: true`.
2. Automated unit test `TestBatch1Fixes.test_bug01_get_settings_succeeds_without_name_error` in `tests/test_batch1_fixes.py` passed with 0 errors.

---

### BUG-02 (CRITICAL): Unescaped SQL Parameter Interpolation in `/api/admin/table-schema`

- **Bug ID:** `BUG-02`
- **Title:** Direct raw f-string SQL query execution in `/api/admin/table-schema/<path:table_name>` permits arbitrary SQL injection
- **Severity:** **CRITICAL**
- **Affected File(s):** `app/routes/admin.py`
- **Affected Line(s):** Lines 1640–1650
- **Status:** **Resolved / Fixed (Milestone 3)**

#### Reproduction Steps:
1. Inspect the route definition at `app/routes/admin.py:1640`.
2. Notice the route decorator:
   ```python
   @admin_bp.route('/table-schema/<path:table_name>', methods=['GET'])
   @jwt_required(optional=True)
   def get_table_schema(table_name):
   ```
3. Notice that `optional=True` permits unauthenticated requests.
4. Sending an HTTP GET request with a maliciously crafted table name such as:
   `http://127.0.0.1:5000/api/admin/table-schema/test%60;%20SELECT%20sleep(5);%20--`
   causes the database driver to parse and execute arbitrary injected SQL statements.

#### Expected Behavior:
1. The administrative endpoint must enforce mandatory authentication (`@jwt_required()`) and verify administrator privileges.
2. The `table_name` parameter must be strictly validated against an alphanumeric and underscore regex pattern (`^[a-zA-Z0-9_]+$`).
3. Schema column metadata must be retrieved using safe parameterized queries against MySQL's `information_schema.COLUMNS` or validated against known table names.

#### Actual Behavior (Pre-Fix):
The endpoint accepted unauthenticated requests and executed:
```python
cur.execute(f"DESCRIBE `{table_name}`;")
```
An attacker supplying a table name containing backtick escaping (`\``) could break out of identifier quoting and execute arbitrary SQL commands.

#### Remediation Implemented:
1. Replaced `@jwt_required(optional=True)` with mandatory `@jwt_required()` in `app/routes/admin.py`.
2. Implemented strict regular expression validation:
   ```python
   if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
       return jsonify({'success': False, 'error': 'Invalid table name format'}), 400
   ```
3. Switched live MySQL query execution to safe parameterized queries against `information_schema.COLUMNS`:
   ```python
   cur.execute(
       """SELECT COLUMN_NAME AS Field, COLUMN_TYPE AS Type 
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s""",
       (table_name,)
   )
   ```

#### Verification Evidence:
1. Live REST API call without authentication returns HTTP `401 Unauthorized` (`"Missing Authorization Header"`).
2. Live REST API call with SQL injection string `test\`; SELECT sleep(1); --` returns HTTP `400 Bad Request` (`{"error": "Invalid table name format", "success": false}`).
3. Automated unit tests `test_bug02_table_schema_requires_jwt_and_rejects_unauthenticated`, `test_bug02_table_schema_rejects_sql_injection_attempts`, and `test_bug02_table_schema_accepts_valid_identifier_with_auth` in `tests/test_batch1_fixes.py` passed with 0 errors.

---

### BUG-03 (HIGH): Running Server Process Out of Sync with Working Tree Code

- **Bug ID:** `BUG-03`
- **Title:** Background development server PID `16524` runs stale in-memory bytecode out of sync with disk modifications
- **Severity:** **HIGH**
- **Affected File(s):** `run.py`, Active Process PID `16524`
- **Affected Line(s):** Runtime Environment
- **Status:** **Resolved / Fixed (Milestone 3)**

#### Reproduction Steps:
1. Inspect the start time of the running process via PowerShell:
   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = 16524" | Select-Object ProcessId, CreationDate, CommandLine
   ```
2. Note process launch timestamp: `2026-10-28 10:25:59`.
3. Check modification timestamps of `app/routes/admin.py` and `app/models.py`.
4. Make an HTTP request to `GET /api/admin/table-mappings`.

#### Expected Behavior:
The running application should return the latest JSON schema containing newly implemented fields (`mappings`, `active_users`, `commodities`, and `success: true`) matching current disk code.

#### Actual Behavior (Pre-Fix):
The response payload contained the legacy structure `{ "count": 158, "data": [...] }` without the newly added properties because the process in memory had not reloaded the disk files modified after 10:25:59.

#### Remediation Implemented:
Cleanly terminated stale dev server PID 16524 via `Stop-Process -Id 16524 -Force` and launched `.venv\Scripts\python.exe run.py` (new active PID 5016).

#### Verification Evidence:
1. New process PID 5016 bound cleanly to `0.0.0.0:5000`.
2. Live HTTP GET `/api/admin/settings` executes cleanly without `NameError: os`.
3. Live HTTP requests verify latest disk bytecode is actively executing.

---

### BUG-04 (HIGH): Missing File Name Sanitization in `/api/mis/upload-pdf`

- **Bug ID:** `BUG-04`
- **Title:** Unsanitized file names in PDF report upload endpoint permit directory traversal attacks
- **Severity:** **HIGH**
- **Affected File(s):** `app/routes/mis_report.py`
- **Affected Line(s):** Lines 191–195 (and lines 445–447)
- **Status:** **Resolved / Fixed (Milestone 3)**

#### Reproduction Steps:
1. Inspect lines 191–195 in `app/routes/mis_report.py`.
2. Notice filename construction:
   ```python
   timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
   safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"
   filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)
   file.save(filepath)
   ```
3. Submit a multipart form upload with filename `../../test_traversal.pdf`.
4. On Windows, `os.path.join(".../uploads", "20261028_120000_../../test_traversal.pdf")` resolves upward, saving the file outside the designated `UPLOAD_FOLDER`.

#### Expected Behavior:
Filenames provided by clients must be sanitized using Werkzeug's industry-standard `secure_filename()` function, stripping directory traversal characters (`../`, `..\`) and null bytes.

#### Actual Behavior (Pre-Fix):
The code only replaced spaces with underscores (`file.filename.replace(' ', '_')`), leaving path separators and traversal tokens intact.

#### Remediation Implemented:
Imported `secure_filename` from `werkzeug.utils` in `app/routes/mis_report.py`. Sanitized uploaded filenames in both `/upload-pdf` (line 193) and `/auto-detect` (line 448):
```python
clean_name = secure_filename(file.filename) or 'unnamed_report.pdf'
safe_name = f"{timestamp}_{clean_name}"
filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)
```

#### Verification Evidence:
1. Automated unit test `TestBatch1Fixes.test_bug04_mis_upload_pdf_sanitizes_path_traversal` in `tests/test_batch1_fixes.py` uploads `../../evil_path_traversal.pdf` and asserts no file escapes `UPLOAD_FOLDER`.
2. Test executes and passes with 0 failures and 0 errors.

---

### BUG-05 (MEDIUM): Hardcoded Teammate Lists in CRISHI & Admin Modals

- **Bug ID:** `BUG-05`
- **Title:** Hardcoded user arrays in `crishi.js` and `admin.js` omit newly created or non-standard active users
- **Severity:** **MEDIUM**
- **Affected File(s):** `app/static/js/crishi.js`, `app/static/js/admin.js`
- **Affected Line(s):** `crishi.js:882, 5008, 5593`, `admin.js:2494`
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Log in to the application and open the Crishi Database view.
2. Click the `Sync Report` button (`#btn-sync-report` / `openSyncReportModal()`).
3. Inspect the `Assignee` dropdown menu in the modal.

#### Expected Behavior:
The dropdown menu is populated with all active users retrieved dynamically from `/api/admin/users` or `app.state.users`.

#### Actual Behavior (Pre-Fix):
The dropdown only displays five hardcoded names:
```javascript
const priorityUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
```
Active system users such as `Vaibhav`, `Ram Gopal`, `Balram`, or any newly added teammates cannot be selected as report assignees from this modal.

#### Concrete Evidence:
Direct code inspection in `app/static/js/crishi.js:5008`:
```javascript
function openSyncReportModal(catalogId) {
    ...
    const priorityUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
    assigneeSelect.innerHTML = priorityUsers.map(u => `<option value="${u}">${u}</option>`).join('');
```
Identical hardcoded arrays existed in `crishi.js:882`, `crishi.js:5593`, and `admin.js:2494`.

#### Root Cause Analysis:
Prototype mockup arrays were left in the codebase during early frontend development and never wired to the dynamic user store.

#### Remediation Implemented:
1. In `app/static/js/crishi.js`:
   - Added asynchronous `getActiveUsers()` and synchronous `getActiveUsersSync()` helper methods to `CrishiModule` that dynamically query `/api/admin/users` or `window.App.state.users`, caching active user names with graceful fallback to defaults.
   - Prefetched active users during `CrishiModule.init()`.
   - Updated `renderTeammateChips()` (line 882 / 936) to use `this.getActiveUsersSync()`.
   - Updated `openSyncReportModal()` (line 5008 / 5062) to be `async` and dynamically populate users via `await this.getActiveUsers()`.
   - Updated `openSubAdminModal()` (line 5593 / 5647) to be `async` and dynamically populate active users via `await this.getActiveUsers()`.
2. In `app/static/js/admin.js`:
   - Updated `showAdminEditMonthlyModal()` (line 2494) to be `async` and dynamically populate teammates from `this._userList` or fetch `/api/admin/users`, ensuring all active users can be selected with graceful fallback.

#### Verification Evidence:
1. Automated regression test `TestBatch2Fixes.test_bug05_dynamic_users_in_crishi_and_admin_js` in `tests/test_batch2_fixes.py` verified that static arrays in modals were replaced with dynamic user population querying `/admin/users` with graceful fallback.
2. Verified live UI modal flows execute without JS errors.

---

### BUG-06 (MEDIUM): UTC vs IST 1-Day Date Shift Discrepancy at Midnight

- **Bug ID:** `BUG-06`
- **Title:** `.toISOString().split('T')[0]` converts Indian Standard Time (UTC+5:30) to UTC, causing a 1-day date shift between 00:00 and 05:29 AM
- **Severity:** **MEDIUM**
- **Affected File(s):** `app/static/js/crishi.js`
- **Affected Line(s):** Lines 2095, 2524, 4870, 5009
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Set the client system time or browser session to 02:00 AM IST (UTC+5:30) on October 29.
2. Trigger an action in `crishi.js` that calls `new Date().toISOString().split('T')[0]`, such as submitting a manager review, performing a CSV export, or saving a sync mapping.

#### Expected Behavior:
The date recorded for the operation corresponds to the local operational calendar day (`2026-10-29`).

#### Actual Behavior:
`new Date().toISOString()` converts the timestamp to UTC (which is `2026-10-28 20:30:00Z`), resulting in `.split('T')[0]` returning `2026-10-28` (yesterday's date). Operations performed in the early morning hours before 05:30 AM IST are misattributed to the prior day.

#### Concrete Evidence:
In `app/static/js/crishi.js:46-54`, a local date helper `getTodayStr()` exists:
```javascript
function getTodayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
```
However, lines 2095, 2524, 4870, and 5009 bypass this helper and invoke `new Date().toISOString().split('T')[0]` directly.

#### Root Cause Analysis:
Inconsistent date formatting calls across different functions in `crishi.js`.

#### Remediation Implemented:
1. Standardized local calendar date calculation in `app/static/js/crishi.js` by defining `getTodayStr()`:
   ```javascript
   function getTodayStr() {
       const d = new Date();
       const y = d.getFullYear();
       const m = String(d.getMonth() + 1).padStart(2, '0');
       const day = String(d.getDate()).padStart(2, '0');
       return `${y}-${m}-${day}`;
   }
   ```
2. Replaced all occurrences of `new Date().toISOString().slice(0, 10)` and `new Date().toISOString().split('T')[0]` at lines 2095, 2524, 4870, and 5009 with `getTodayStr()`.
3. Exposed `getTodayStr()` on `CrishiModule` and aliased `getTodayIsoDate()` to `getTodayStr()` for full backward compatibility across SPA views.

#### Verification Evidence:
1. Automated unit test `TestBatch2Fixes.test_bug06_get_today_str_and_no_utc_iso_split_in_crishi_js` in `tests/test_batch2_fixes.py` verified that `getTodayStr()` is present and zero occurrences of `.toISOString().split` or `.toISOString().slice` remain in `crishi.js`.
2. Verified that roster CSV export filenames and sync modal dates correctly reflect the local operational calendar day.

---

### BUG-07 (MEDIUM): SQLAlchemy 2.0 Deprecated `Query.get()` Legacy Warnings

- **Bug ID:** `BUG-07`
- **Title:** Deprecated `Query.get()` method calls trigger `LegacyAPIWarning` under SQLAlchemy 2.0.51
- **Severity:** **MEDIUM**
- **Affected File(s):** `app/routes/admin.py`, `app/routes/crishi.py`
- **Affected Line(s):** `admin.py:176, 1550, 1624`, `crishi.py:356, 427, 459, 580`
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Run the test discovery suite:
   ```powershell
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
   ```
2. Inspect the test execution console output.

#### Expected Behavior:
Automated test suite executes cleanly with zero warnings.

#### Actual Behavior:
More than a dozen deprecation warnings are emitted during test execution:
```text
LegacyAPIWarning: The Query.get() method is considered legacy as of the 1.x series of SQLAlchemy and becomes a legacy construct in 2.0. The method is now available as Session.get().
```

#### Concrete Evidence:
Calls such as `User.query.get(user_id)` at `admin.py:176` and `Report.query.get(report_id)` at `crishi.py:356`.

#### Root Cause Analysis:
Legacy SQLAlchemy 1.x query syntax running against SQLAlchemy 2.0.51 runtime.

#### Remediation Implemented:
1. Upgraded all legacy `Model.query.get(id)` occurrences across the backend route architecture to modern SQLAlchemy 2.0 `db.session.get(Model, id)`:
   - `app/routes/admin.py`: Updated lines 179 (`Report`), 223 (`Report`), 558 (`Report`), 610 (`CommodityConfig`), 661 (`TaskTemplate`), 704 (`RosterConfig`), 793 (`BackupActivation`), 952 (`ReportGroup`), 1553 (`DBTaskCatalog`), 1627 (`DBTaskCatalog`).
   - `app/routes/crishi.py`: Updated lines 43, 88, 163, 267, 377, 460 (`DBTaskCatalog`).
   - `app/routes/roster.py`: Line 88 (`RosterConfig`).
   - `app/routes/mis_report.py`: Lines 321 (`MISReportUpload`), 392 (`MISTemplate`).
   - `app/routes/notifications.py`: Line 26 (`Notification`).
   - `app/routes/chat.py`: Line 310 (`ChatMessage`).
   - `app/routes/tasks.py`: Line 1041 (`TaskOverride`).
2. Upgraded all test suite files (`tests/test_adversarial_challenger2.py`, `tests/test_hierarchy_and_studio.py`, `tests/adversarial_backend_stress.py`) to use `db.session.get(Model, id)`.

#### Verification Evidence:
1. Automated unit test discovery (`.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`) runs 73 tests with 0 failures, 0 errors, and zero `LegacyAPIWarning` messages.
2. Adversarial stress test (`.venv\Scripts\python.exe -m unittest tests/adversarial_backend_stress.py`) runs 7 tests with 0 failures, 0 errors, and zero `LegacyAPIWarning` messages.
3. Static code inspection confirms 0 occurrences of `.query.get(` across `app/` and `tests/`.

---

### BUG-08 (LOW): Short JWT HMAC Secret Key Emitting Cryptographic Warning

- **Bug ID:** `BUG-08`
- **Title:** Default fallback `JWT_SECRET_KEY` is 19 bytes, violating RFC 7518 Section 3.2 minimum 32-byte requirement
- **Severity:** **LOW**
- **Affected File(s):** `app/config.py`
- **Affected Line(s):** Line 10
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Execute Python script initializing JWT access token without defining `JWT_SECRET_KEY` in environment:
   ```powershell
   .venv\Scripts\python.exe -c "from app import create_app; from flask_jwt_extended import create_access_token; app = create_app(); ctx = app.app_context(); ctx.push(); create_access_token(identity='test@agalabs.com')"
   ```

#### Expected Behavior:
Tokens are generated without cryptographic security warnings.

#### Actual Behavior:
PyJWT emits an `InsecureKeyLengthWarning`:
```text
InsecureKeyLengthWarning: The HMAC key is 19 bytes long, which is below the minimum recommended length of 32 bytes for SHA256. See RFC 7518 Section 3.2.
```

#### Concrete Evidence:
In `app/config.py:10`:
```python
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-erp-secret-2026')
```
The fallback string `'jwt-erp-secret-2026'` has a length of 19 ASCII characters (19 bytes), whereas HMAC-SHA256 requires at least 32 bytes (256 bits) of key material.

#### Root Cause Analysis:
Short default fallback string in configuration.

#### Remediation Implemented:
1. Updated the fallback `JWT_SECRET_KEY` in `app/config.py:10` to `'jwt-advance-erp-super-secret-key-32bytes-2026-production'` (55 bytes), satisfying RFC 7518 Section 3.2 HMAC-SHA256 requirements.
2. Updated the development `.env` file to define `JWT_SECRET_KEY=jwt-advance-erp-super-secret-key-32bytes-2026-production`.

#### Verification Evidence:
1. Automated unit test `TestBatch2Fixes.test_bug08_jwt_secret_key_length_and_no_warning` in `tests/test_batch2_fixes.py` asserted that key length is >= 32 bytes and token generation produces 0 warnings.
2. Running test discovery suite executes with 0 `InsecureKeyLengthWarning` messages.

---

### BUG-09 (LOW): Dead/Orphaned Selector `#btn-logout` in `auth.js`

- **Bug ID:** `BUG-09`
- **Title:** Event listener binding on nonexistent DOM element `#btn-logout`
- **Severity:** **LOW**
- **Affected File(s):** `app/static/js/auth.js`
- **Affected Line(s):** Lines 16, 21–23
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Inspect `auth.init()` in `app/static/js/auth.js`.
2. Search for `id="btn-logout"` across all files in `app/templates/`.

#### Expected Behavior:
Event listeners are attached only to DOM elements that exist in the active template, or code checks for element existence before binding.

#### Actual Behavior (Pre-Fix):
`auth.init()` queried `document.getElementById('btn-logout')`. The element does not exist in `app/templates/index.html` (the modernized SPA performs logout via `#btn-profile-logout` inside the user profile modal in `app.js:467`).

#### Concrete Evidence:
Search query `grep_search(Query='btn-logout')` returns hits only in `auth.js:16` and nowhere in HTML or other templates.

#### Root Cause Analysis:
Leftover legacy event binding from an older navigation header layout.

#### Remediation Implemented:
1. Added null guard checks in `app/static/js/auth.js:16, 21-23` before attaching event listeners to `this.logoutBtn`.
2. Added listener binding for `#btn-profile-logout` so the profile modal logout trigger gracefully delegates to `auth.logout()`.

#### Verification Evidence:
1. Automated unit test `TestBatch2Fixes.test_bug09_auth_js_logout_null_check` in `tests/test_batch2_fixes.py` verified presence of null checks and support for `#btn-profile-logout`.
2. Manual verification confirmed login and logout lifecycle functions properly without console exceptions.

---

### BUG-10 (LOW): Mobile Responsive CSS Hides Data Grid Search Box

- **Bug ID:** `BUG-10`
- **Title:** Media query `@media (max-width: 768px)` hides `.search-box`, disabling search capability on mobile viewports
- **Severity:** **LOW**
- **Affected File(s):** `app/static/css/main.css`
- **Affected Line(s):** Line 469
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Open Advance ERP in a mobile viewport (375x812) or portrait tablet (768x1024).
2. Attempt to search for a database table or commodity in the Crishi data grid.

#### Expected Behavior:
The search input adapts responsively (e.g., collapses to an icon or flows as a full-width input below filter tabs), allowing mobile users to filter and search records.

#### Actual Behavior (Pre-Fix):
The search box completely disappeared from the interface due to `display: none`.

#### Concrete Evidence:
In `app/static/css/main.css:469`:
```css
@media (max-width: 768px) {
    .search-box {
        display: none;
    }
}
```

#### Root Cause Analysis:
Overly aggressive responsive breakpoint rule that suppresses functionality rather than restructuring layout.

#### Remediation Implemented:
Updated the `@media (max-width: 768px)` media query in `app/static/css/main.css:469-476` to preserve search capability as a responsive full-width input:
```css
@media (max-width: 768px) {
  .search-box {
    display: flex;
    width: 100%;
    margin-top: 8px;
  }
  .search-box input {
    width: 100%;
  }
  ...
}
```

#### Verification Evidence:
1. Automated unit test `TestBatch2Fixes.test_bug10_search_box_accessible_on_mobile` in `tests/test_batch2_fixes.py` verified that `.search-box` is not suppressed with `display: none` and is configured as `display: flex; width: 100%`.
2. Verified visual appearance across mobile viewports (375x812 and 768x1024).

---

### BUG-11 (HIGH): Unprotected Mutating Endpoints via `@jwt_required(optional=True)`

- **Bug ID:** `BUG-11`
- **Title:** State-mutating administrative endpoints use `@jwt_required(optional=True)`, allowing unauthenticated callers to delete mappings, skip tasks, and mutate duty schedules
- **Severity:** **HIGH**
- **Affected File(s):** `app/routes/admin.py`, `app/routes/crishi.py`, `app/routes/roster.py`
- **Affected Line(s):** `admin.py:1464, 1547, 1621`, `crishi.py:35, 77, 116`, `roster.py:1098, 1227, 1372, 1432, 1470, 1521`
- **Status:** **Resolved / Fixed (Milestone 3)**

#### Reproduction Steps:
1. Identify a table mapping ID in `db_task_catalog` (e.g. ID `71`).
2. Send an unauthenticated HTTP request without an `Authorization` header:
   ```powershell
   # Test unauthenticated task skip
   Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/crishi/skip' -Method Post -Body (@{catalogId=71;reason='Unauthenticated Test'} | ConvertTo-Json) -ContentType 'application/json'
   ```
3. Observe that the endpoint processes the mutation and assigns the actor to `'Admin'` or `'System'`.
4. Similarly, inspect `DELETE /api/admin/table-mappings/<int:id>`:
   ```python
   @admin_bp.route('/table-mappings/<int:id>', methods=['DELETE'])
   @jwt_required(optional=True)
   def delete_table_mapping(id):
   ```
   An unauthenticated caller can delete any table catalog row without providing JWT credentials.

#### Expected Behavior:
All state-mutating endpoints (`POST`, `PUT`, `DELETE`) must enforce mandatory JWT authentication (`@jwt_required()`) and verify appropriate role permissions before performing deletions or updates.

#### Actual Behavior (Pre-Fix):
Endpoints decorated with `@jwt_required(optional=True)` allowed unauthenticated HTTP clients to execute destructive mutations, recording fallback identities such as `'Admin'` or `'Manager'` in audit logs.

#### Remediation Implemented:
Enforced mandatory `@jwt_required()` (removing `optional=True`) across all mutating routes:
1. `DELETE /api/admin/table-mappings/<int:id>` in `app/routes/admin.py`
2. `POST /api/crishi/pull`, `POST /api/crishi/skip`, and `POST /api/crishi/roster/apply-week` in `app/routes/crishi.py`
3. `PUT /api/roster/rake-zones`, `POST /api/roster/rake-date`, `PUT /api/roster/monthly-duties`, `POST /api/roster/apply-week`, `POST /api/roster/assign-backup`, `POST /api/roster/generate-random`, `PUT /api/roster/scrapper-matrix`, and `POST /api/roster/structure` in `app/routes/roster.py`.

#### Verification Evidence:
1. Live REST API tests against `DELETE /api/admin/table-mappings/999999`, `POST /api/crishi/pull`, and `POST /api/crishi/skip` without JWT return HTTP `401 Unauthorized`.
2. Automated unit test `TestBatch1Fixes.test_bug11_mutating_endpoints_reject_unauthenticated_requests` in `tests/test_batch1_fixes.py` tests all 12 mutating endpoints and confirms HTTP `401 Unauthorized` for every unauthenticated attempt with 0 failures.

---

### BUG-12 (LOW): Mobile Viewport Topbar Ribbon Overflow on Screens <= 480px

- **Bug ID:** `BUG-12`
- **Title:** Fixed-size topbar elements and full nav item text labels cause ribbon crowding and horizontal overflow on mobile viewports (< 480px)
- **Severity:** **LOW**
- **Affected File(s):** `app/static/css/main.css`, `app/templates/index.html`
- **Affected Line(s):** `main.css:119-235, 457-474`
- **Status:** **Resolved / Fixed (Milestone 4)**

#### Reproduction Steps:
1. Open Advance ERP in a mobile viewport (375x812, e.g. iPhone standard viewport).
2. Inspect the top header bar (`.topbar`).
3. Calculate the cumulative horizontal width of child elements:
   - Logo + icon: ~70px
   - Topbar separator: ~21px
   - Navigation links (`Crishi Database`, `Report`, `Admin`): ~290px
   - Action controls (Theme toggle, Notifications, User avatar): ~112px
   - Total required width: ~493px.

#### Expected Behavior:
On mobile screens (width <= 768px and particularly <= 480px), navigation text labels (`.topbar-nav .nav-item span`) collapse or hide, leaving only icons (`fas fa-database`, `fas fa-file-invoice`, `fas fa-cog`), or the navigation wraps gracefully without causing horizontal scroll clipping.

#### Actual Behavior (Pre-Fix):
`.topbar-nav .nav-item span` remained visible at all screen widths. On 375px screens, the combined width exceeded the viewport width, causing visual clipping, squished buttons, or horizontal overflowing of the topbar ribbon.

#### Concrete Evidence:
In `app/static/css/main.css:457-474`, the `@media (max-width: 768px)` block hid `.topbar-user-meta` and `.topbar-date`, but did not hide `.topbar-nav .nav-item span`, nor did it enable horizontal touch scrolling for the nav strip.

#### Root Cause Analysis:
When navigation was transitioned from a collapsible sidebar to a top ribbon navigation bar, the responsive styling for nav items was not updated to hide text labels on mobile screens.

#### Remediation Implemented:
Added responsive breakpoint rule in `app/static/css/main.css:483-493` for mobile screens `<= 480px`:
```css
@media (max-width: 480px) {
  .topbar-nav .nav-item span {
    display: none;
  }
  .topbar-nav .nav-item {
    padding: 7px 10px;
  }
  .topbar-separator {
    display: none;
  }
}
```

#### Verification Evidence:
1. Automated unit test `TestBatch2Fixes.test_bug12_topbar_nav_responsive_rule_480px` in `tests/test_batch2_fixes.py` verified that `@media (max-width: 480px)` hides `.topbar-nav .nav-item span` via `display: none;`.
2. Verified responsive viewport layout on 375x812: navigation links collapse to clean icons without horizontal ribbon overflow.

