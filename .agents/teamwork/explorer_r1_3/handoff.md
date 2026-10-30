# Explorer R1.3 Handoff Report: Module Inventory, End-to-End Tracing & Prioritized Bug Register

**Agent**: Explorer R1.3 (`87bc2260-fe89-44cc-8733-85e39e4e6ba2`)  
**Parent / Caller**: Lead Orchestrator (`db092fb1-a580-4d56-9d49-54540561fd69`)  
**Date**: 2026-10-28T09:40:00Z  
**Type**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

### 1.1 Discovered Core Modules Inventory
A total of 9 functional module domains were discovered and inspected across the frontend, API routes, services, and database layers:

1. **CRISHI & Surveillance Data Grids**:
   - **Frontend**: `app/static/js/crishi.js` (345 KB, modular SPA controller, multi-cadence tabs, teammate chips, date/commodity filters).
   - **Routes**: `app/routes/crishi.py` (`/api/crishi/grid`, `/api/crishi/pull`, `/api/crishi/skip`, `/api/crishi/sync-report-db`, `/api/crishi/remark`, `/api/crishi/manager-review`, `/api/crishi/source`, `/api/crishi/force-refresh`, `/api/crishi/reports/all`, `/api/crishi/reports/sync-gmail`, `/api/crishi/reports/gmail-status`, `/api/crishi/reports/pdf`).
   - **Services**: `app/services/surveillance.py` (live MySQL surveillance against `agalabsdev_stage` with fallback to `latest_two_dates_agalabsdev_stage` snapshot data).
   - **Models**: `DBTaskCatalog`, `ManagerTaskPull`, `TaskSkip`, `TaskRemark`, `TaskRemarkHistory`, `DBTaskVerification`.

2. **Roster & Duty Scheduling**:
   - **Frontend**: `app/static/js/crishi.js` (`#tab-roster`), `app/static/js/roster.js`.
   - **Routes**: `app/routes/roster.py` (`/api/roster/today`, `/api/roster/status`, `/api/roster/config`, `/api/roster/scrapper-matrix`, `/api/roster/week-detail`, `/api/roster/assign-backup`, `/api/roster/generate-random`, `/api/roster/structure`, `/api/roster/monthly-schedule`, `/api/roster/rake-zones`, `/api/roster/monthly-duties`, `/api/roster/apply-week`, `/api/roster/logs`) and `app/routes/crishi.py` (`/api/crishi/roster/*`).
   - **Logic**: Dynamic 5-week rotation matrix anchored to first Monday of the calendar month; automated Tuesday Rake Movement scheduling; live database checks on `pyexcel_rakemovement`, `pyexcel_cpi`, `pyexcel_daily_weather_data`.
   - **Models**: `RosterConfig`, `RosterLog`, `RosterSchedule`, `RosterDaySubstitution`.

3. **Email Ingestion & Processing**:
   - **Services**: `app/services/email_ingestion.py` (IMAP SSL client to `mail.agalabs@gmail.com:993`, batch header scanning, regex date/commodity parsing, PDF attachment extraction to `uploads/gmail_reports/`) and `app/services/email_service.py` (SMTP dispatch via `smtp.gmail.com:465/587`, HTML templates for daily digests).
   - **Routes**: `app/routes/admin.py` (`/api/admin/email-logs`, `/api/admin/email-test`, `/api/admin/email-trigger-digest`, `/api/admin/email-preview`) and `app/routes/crishi.py` (`/api/crishi/reports/sync-gmail`).
   - **Models**: `EmailReport`, `EmailLog`, `AppSetting`.

4. **PDF Parsing & Template Validation**:
   - **Frontend**: `app/static/js/report.js` (3-in-1 inspection modal: Email HTML + PDF.js canvas + AI Report Analysis), `app/static/js/mis.js`.
   - **Routes**: `app/routes/mis_report.py` (`/api/mis/upload-pdf`, `/api/mis/analysis/<upload_id>`, `/api/mis/analysis/all`, `/api/mis/templates`, `/api/mis/semantic-feedback`, `/api/mis/templates/auto-detect`).
   - **Services**: `app/services/pdf_parser.py` (uses `pdfplumber` to extract bounding boxes against `MISTemplate`, tolerance checks: strict ±5pt / relaxed ±25pt, mismatch heuristic detection) and `app/services/semantic_validator.py` (calls local Ollama `http://localhost:11434/api/generate` with model `llama3` for semantic consistency).
   - **Models**: `MISReportUpload`, `MISTemplate`, `MISLLMFeedback`.

5. **Reporting & Dashboards**:
   - **Frontend**: `app/static/js/dashboard.js`, `app/static/js/analytics.js`, `app/static/js/mis.js`.
   - **Routes**: `app/routes/dashboard.py` (`/api/dash/stats`, `/api/dash/week-trend`, `/api/dash/report-progress`, `/api/dash/pending`, `/api/dash/team`, `/api/dash/alerts`) and `app/routes/analytics.py` (`/api/analytics/kpi`, `/api/analytics/sla-breaches`, `/api/analytics/commodity-comparison`, `/api/analytics/team-updates`, `/api/analytics/export/csv`).
   - **Visuals**: Chart.js 4.4.0 integration, real-time SLA metrics, 7-day trend analysis.

6. **User Management & Hierarchy**:
   - **Frontend**: `app/static/js/admin.js` (`showUserModal`, 5-tier hierarchical modal, internal timing and mapping submodals via `#submodal-overlay`).
   - **Routes**: `app/routes/admin.py` (`/api/admin/users`, `/api/admin/users/<email>`, `/api/admin/user-duties/<email>`), `app/auth.py` (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`).
   - **Relational Sync**: Cascades user name updates across `db_task_catalog.user_name` (handling single names and CSV tokens) and `reports` (`primary_assignee`, `backup_1`, `backup_2`).
   - **Models**: `User`, `UserReportMapping`, `UserCommodityMapping`, `AuditLog`.

7. **Commodity & Table Mapping**:
   - **Frontend**: `app/static/js/admin.js` (Table Mapping Studio, Granular Override Matrix), `app/static/js/data-update.js`.
   - **Routes**: `app/routes/admin.py` (`/api/admin/table-mappings`, `/api/admin/table-schema/<path:table_name>`, `/api/admin/fetch-db-tables`), `app/routes/data_update.py` (`/api/du/commodities`, `/api/du/types/<commodity>`, `/api/du/factors/<commodity>/<type_name>`, `/api/du/submit`).
   - **Models**: `DBTaskCatalog`, `CommodityConfig`, `Report`.

8. **Background Jobs & Notification Dispatcher**:
   - **Service**: `app/services/scheduler.py` (APScheduler BackgroundScheduler with `ZoneInfo('Asia/Kolkata')`, interval job executing every 5 minutes).
   - **Tasks**: Scans daily user task deadlines, emits Socket.IO push alerts to private user email rooms, triggers scheduled multi-stage email digests (Teammate Reminder at 14:00, Teammate Final at 18:00, Manager Digest at 19:00, Leader Digest at 20:00).
   - **Models**: `Notification`, `AppSetting`.

9. **External Integrations**:
   - **Databases**: Dual MySQL schemas `advance_erp` (34 relational tables) and `agalabsdev_stage` (140+ raw surveillance tables).
   - **Email**: Gmail IMAP SSL (`imap.gmail.com:993`) and Gmail SMTP SSL/TLS (`smtp.gmail.com:465/587`).
   - **Websockets**: Flask-SocketIO eventlet server for real-time room notifications.
   - **Frontend Libraries**: Chart.js 4.4.0 (visualizations), PDF.js 3.11.174 (in-browser document rendering).

---

### 1.2 Test Users and Authentication Discovery
Inspected local MySQL database `advance_erp.users` and authentication logic in `app/auth.py`:
- Built-in fallback master password for development: `admin123` (accepted for `SuperAdmin` and `Manager` roles in `app/auth.py:102-117`).
- Active Accounts verified:
  - **SuperAdmin**: `vaibhav@agalabs.com` (verified working with `admin123`, issued JWT token with role `SuperAdmin`).
  - **SuperAdmin**: `nishant@agalabs.com` (verified working with `admin123`, issued JWT token with role `SuperAdmin`).
  - **Manager**: `ram@agalabs.com` (Manager role, access to approval workflows and settings).
  - **Teammates**: `bhawna@agalabs.com`, `gopichand@agalabs.com`, `nitesh@agalabs.com`, `pankaj@agalabs.com` (Teammate roles, assigned daily tasks, roster shifts, and commodities).
  - **Inactive**: `damini@agalabs.com` (`active=False`), `balram@agalabs.com` (`active=False`).
- Baseline Invariants: Exactly 9 users, 27 reports, and 158 task catalog entries exist in the database.

---

### 1.3 Prioritized Bug Register

| Bug ID | Title | Severity | Affected File(s) | Line(s) | Status |
|---|---|---|---|---|---|
| **BUG-01** | Missing `import os` causing HTTP 500 in `/api/admin/settings` | **CRITICAL** | `app/routes/admin.py` | 464-468 | Confirmed |
| **BUG-02** | Unescaped SQL Parameter Interpolation in `/api/admin/table-schema` | **CRITICAL** | `app/routes/admin.py` | 1640-1650 | Confirmed |
| **BUG-03** | Running Server Process Out of Sync with Working Tree Code | **HIGH** | `run.py`, PID 16524 | Runtime | Confirmed |
| **BUG-04** | Missing File Name Sanitization in `/api/mis/upload-pdf` | **HIGH** | `app/routes/mis_report.py` | 191-194 | Confirmed |
| **BUG-05** | Hardcoded Teammate Lists in CRISHI & Admin Modals | **MEDIUM** | `app/static/js/crishi.js`, `admin.js` | 882, 5008, 2494 | Confirmed |
| **BUG-06** | UTC vs IST 1-Day Date Shift Discrepancy at Midnight | **MEDIUM** | `app/static/js/crishi.js` | 2095, 4870, 5009 | Confirmed |
| **BUG-07** | SQLAlchemy 2.0 Deprecated `Query.get()` Legacy Warnings | **MEDIUM** | `app/routes/admin.py`, `crishi.py` | Multiple | Confirmed |
| **BUG-08** | Short JWT HMAC Secret Key Emitting Cryptographic Warning | **LOW** | `app/config.py` | 10 | Confirmed |
| **BUG-09** | Dead/Orphaned Selector `#btn-logout` in `auth.js` | **LOW** | `app/static/js/auth.js` | 16, 21-23 | Confirmed |
| **BUG-10** | Mobile Responsive CSS Hides Data Grid Search Box | **LOW** | `app/static/css/main.css` | 469 | Confirmed |

---

### 1.4 Detailed Bug Records

#### BUG-01 (CRITICAL): Missing `import os` in `app/routes/admin.py`
- **Reproduction**:
  1. Authenticate as SuperAdmin (`POST /api/auth/login` with `vaibhav@agalabs.com` / `admin123`).
  2. Send `GET /api/admin/settings` with `Authorization: Bearer <token>`.
- **Actual Behavior**:
  Server returns `500 Internal Server Error` with traceback:
  ```text
  File ".../app/routes/admin.py", line 464, in get_settings
    'smtpHost': os.getenv('SMTP_HOST', 'smtp.gmail.com'),
  NameError: name 'os' is not defined. Did you forget to import 'os'?
  ```
- **Expected Behavior**: Returns HTTP 200 with JSON payload containing application settings and default SMTP configuration.
- **Evidence**: Verbatim traceback captured during live HTTP check on port 5000. Verified lines 1-17 of `app/routes/admin.py` omit `import os`.
- **Root Cause**: `os` was only imported locally inside `get_table_schema()` (line 1671) and `fetch_db_tables()` (line 1706), but `get_settings()` calls `os.getenv` without `os` existing in the module scope.

#### BUG-02 (CRITICAL): Unescaped SQL Parameter Interpolation in `/api/admin/table-schema`
- **Reproduction**:
  Inspect `app/routes/admin.py:1640-1650`. Note route decorator `@admin_bp.route('/table-schema/<path:table_name>', methods=['GET'])` with `@jwt_required(optional=True)`.
- **Actual Behavior**:
  The function executes `cur.execute(f"DESCRIBE `{table_name}`;")` directly using raw f-string interpolation. If `table_name` contains closing backticks and SQL statements, raw SQL is executed without sanitization or parameter binding, accessible even to unauthenticated requests.
- **Expected Behavior**: Table name should be strictly validated against regex `^[a-zA-Z0-9_]+$` and queried safely via `information_schema.columns` or parameterized statements, with proper authentication required.
- **Evidence**: Source inspection of lines 1640-1650 in `app/routes/admin.py`.
- **Root Cause**: Missing input validation and reliance on raw f-string SQL query execution.

#### BUG-03 (HIGH): Running Server Process Out of Sync with Working Tree Code
- **Reproduction**:
  Compare process PID 16524 start time (`2026-10-28 10:25:59`) with file modification times on disk. Query `GET /api/admin/table-mappings`.
- **Actual Behavior**:
  The running server returns `{ "count": 158, "data": [...] }` without the newly added `mappings`, `active_users`, and `commodities` properties because `run.py` was executed with `use_reloader=False` and has not reloaded code modified after 10:25:59.
- **Expected Behavior**: The running application should serve the latest bytecode corresponding to current working tree files.
- **Evidence**: PID 16524 command line inspected via `Get-CimInstance Win32_Process`. Response payload inspected via `Invoke-RestMethod`.
- **Root Cause**: `socketio.run(app, ... use_reloader=False)` does not monitor file modifications; daemon requires clean restart.

#### BUG-04 (HIGH): Missing File Name Sanitization in `/api/mis/upload-pdf`
- **Reproduction**:
  Inspect `app/routes/mis_report.py:191-195`.
- **Actual Behavior**:
  Filename construction uses `safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"` before passing to `os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)`. Filenames containing path traversal sequences (e.g. `../../`) are not sanitized.
- **Expected Behavior**: Use `werkzeug.utils.secure_filename(file.filename)` to strip directory traversal sequences.
- **Evidence**: `app/routes/mis_report.py` line 192 vs `app/routes/chat.py` line 227 (where `secure_filename` is properly used).
- **Root Cause**: Manual partial string replacement instead of standard sanitization utility.

#### BUG-05 (MEDIUM): Hardcoded Teammate Lists in CRISHI & Admin Modals
- **Reproduction**:
  Open `app/static/js/crishi.js` line 5008 (`openSyncReportModal`), line 882, line 5593, and `app/static/js/admin.js` line 2494.
- **Actual Behavior**:
  Dropdown options and duty mappings are populated from static arrays: `const priorityUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];`. Users not in this list (e.g. `Balram`, `Vaibhav`, `Ram Gopal`, or newly added users) cannot be selected in the sync modal.
- **Expected Behavior**: Modals should dynamically populate users from active database records via `/api/admin/users`.
- **Evidence**: Direct string match in `crishi.js` and `admin.js`.
- **Root Cause**: Incomplete migration from static arrays to dynamic API data during earlier refactoring.

#### BUG-06 (MEDIUM): UTC vs IST 1-Day Date Shift Discrepancy at Midnight
- **Reproduction**:
  Inspect `app/static/js/crishi.js` lines 2095, 2524, 4870, 5009 (`new Date().toISOString().split('T')[0]`) vs lines 46-54 (`getTodayStr()`).
- **Actual Behavior**:
  Calling `.toISOString()` extracts the UTC date. In India (IST, UTC+5:30), between 00:00 midnight and 05:29 AM, `.toISOString()` returns yesterday's calendar date, causing review actions, CSV exports, and sync tasks triggered in the early morning to record an incorrect operating date.
- **Expected Behavior**: Use `getTodayStr()` or local date calculations formatted to `YYYY-MM-DD` in the user's local timezone.
- **Evidence**: Confirmed date extraction discrepancy in `crishi.js`.
- **Root Cause**: Inconsistent date utility usage across JavaScript functions.

#### BUG-07 (MEDIUM): SQLAlchemy 2.0 Deprecated `Query.get()` Legacy Warnings
- **Reproduction**:
  Run unittest suite: `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`.
- **Actual Behavior**:
  Executes with 12+ warnings: `LegacyAPIWarning: The Query.get() method is considered legacy as of the 1.x series of SQLAlchemy and becomes a legacy construct in 2.0. The method is now available as Session.get()`.
- **Expected Behavior**: Clean test run without deprecation warnings by invoking `db.session.get(Model, id)`.
- **Evidence**: Emitted in test output on `app/routes/admin.py:176, 1550, 1624`.
- **Root Cause**: Older SQLAlchemy 1.x syntax running under SQLAlchemy 2.0.51.

#### BUG-08 (LOW): Short JWT HMAC Secret Key Emitting Cryptographic Warning
- **Reproduction**:
  Run `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`.
- **Actual Behavior**:
  Logs `InsecureKeyLengthWarning: The HMAC key is 19 bytes long, which is below the minimum recommended length of 32 bytes for SHA256. See RFC 7518 Section 3.2.`
- **Expected Behavior**: Default fallback key in `app/config.py` should be at least 32 bytes (256 bits).
- **Evidence**: Line 10 of `app/config.py`: `JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-erp-secret-2026')` (19 characters).
- **Root Cause**: Default string length in configuration file.

#### BUG-09 (LOW): Dead/Orphaned Selector `#btn-logout` in `auth.js`
- **Reproduction**:
  Inspect `app/static/js/auth.js:16, 21-23` and search `app/templates/index.html`.
- **Actual Behavior**:
  `auth.init()` queries `document.getElementById('btn-logout')`. The element does not exist in `index.html` (logout is handled in `app.js:467` via `#btn-profile-logout`).
- **Expected Behavior**: Dead listener should be cleaned up.
- **Evidence**: `btn-logout` does not exist anywhere in `index.html`.
- **Root Cause**: Leftover code from earlier UI redesign.

#### BUG-10 (LOW): Mobile Responsive CSS Hides Data Grid Search Box
- **Reproduction**:
  Inspect `app/static/css/main.css:469`: `@media (max-width: 768px) { .search-box { display: none; } }`.
- **Actual Behavior**:
  On viewports 375x812 (mobile) and 768x1024 (tablet portrait), `.search-box` is hidden, making table search inputs inaccessible on mobile devices.
- **Expected Behavior**: Search input should collapse into an icon or adapt to full-width instead of being hidden.
- **Evidence**: Line 469 in `app/static/css/main.css`.
- **Root Cause**: Hardcoded `display: none` in responsive stylesheet.

---

## 2. Logic Chain

1. **Module Discovery**:
   - Starting from `app/__init__.py`, 12 Blueprint registrations and 6 service modules were mapped directly to route handlers.
   - SPA architecture was traced from `app/templates/index.html` through ES module entry point `app/static/js/app.js` and modular page controllers (`crishi.js`, `report.js`, `admin.js`, `dashboard.js`, `roster.js`).
   - The UI consolidation was traced: Top navigation was streamlined to three primary operational hubs (`#crishi`, `#report`, `#admin`), with legacy routes redirected smoothly to `#crishi` or `#report`.

2. **End-to-End Tracing**:
   - For every module, the complete request lifecycle was verified: Frontend user action -> Fetch/REST API request with JWT bearer token -> Flask Blueprint route -> Service logic and database queries (`advance_erp` and `agalabsdev_stage`) -> JSON serialization -> Dynamic DOM rendering and Chart.js / PDF.js visualization.

3. **Defect Identification**:
   - Static AST parsing and targeted API execution against the running application uncovered concrete defects.
   - Attempting to access Admin Settings revealed a 100% reproducible HTTP 500 error due to `NameError: name 'os' is not defined`.
   - Code inspection of `app/routes/admin.py:1650` revealed unescaped SQL parameter interpolation on unauthenticated endpoints.
   - PID 16524 inspection proved runtime code divergence between running bytecode and disk modifications due to disabled reloader.

---

## 3. Caveats & Nuances

- **Strict Read-Only Mode**: In accordance with explorer constraints, no source code files or database records were modified or deleted. All bug fixes must be executed in subsequent remediation batches.
- **Running Server Restart**: Dev server PID 16524 should be restarted by the orchestrator / repair agent once BUG-01 (`import os`) is fixed on disk to re-synchronize running memory with the working tree.
- **Semantic Validator Dependency**: `semantic_validator.py` expects a local Ollama instance on port 11434 (`http://localhost:11434/api/generate`). It contains proper `try/except` fallbacks when Ollama is offline.

---

## 4. Conclusion & State Dump

- Discovered and traced all 9 core module domains across frontend, API routes, services, database schemas, and background schedulers.
- Verified local test user accounts (`vaibhav@agalabs.com` / `admin123` SuperAdmin, `ram@agalabs.com` Manager, 4 Teammates).
- Compiled a comprehensive, prioritized Bug Register containing 10 categorized issues (2 Critical, 2 High, 3 Medium, 3 Low) with reproduction steps, actual vs. expected behavior, and root causes.
- The system is architecturally sound and functionally rich, but requires targeted remediation of BUG-01 (missing `import os`), BUG-02 (SQL injection), BUG-03 (daemon restart), and BUG-04/05 before full production deployment.

---

## 5. Verification Method

To independently verify all findings and reproduction steps:

1. **Verify BUG-01 (Admin Settings 500 Crash)**:
   ```powershell
   $token = (Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/auth/login' -Method Post -Body (@{email='vaibhav@agalabs.com';password='admin123'} | ConvertTo-Json) -ContentType 'application/json').token
   Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/admin/settings" -Headers @{ Authorization = "Bearer $token" }
   ```
   *Expected Output*: Fails with HTTP 500 InternalServerError (`NameError: name 'os' is not defined`).

2. **Verify BUG-02 (SQL Injection in table-schema)**:
   Inspect lines 1640-1650 in `app/routes/admin.py` to confirm raw string interpolation `cur.execute(f"DESCRIBE `{table_name}`;")`.

3. **Verify Existing Automated Test Suite & Deprecation Warnings (BUG-07 & BUG-08)**:
   ```powershell
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
   ```
   *Expected Output*: 59 tests run and pass, with `InsecureKeyLengthWarning` and `LegacyAPIWarning: The Query.get() method is considered legacy` logged.

4. **Verify Zero Data Loss & Active Accounts**:
   ```powershell
   .venv\Scripts\python.exe -c "from app import create_app, db; from app.models import User, Report, DBTaskCatalog; app=create_app(); ctx=app.app_context(); ctx.push(); print(f'Users: {User.query.count()}, Reports: {Report.query.count()}, Catalog: {DBTaskCatalog.query.count()}')"
   ```
   *Expected Output*: `Users: 9, Reports: 27, Catalog: 158`.
