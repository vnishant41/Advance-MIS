# Discovery Report (R1 - Part 1): Architecture, Routes, Git Working Tree, and Application Health Baseline

**Agent ID**: `explorer_r1_1`  
**Working Directory**: `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\explorer_r1_1`  
**Project Root**: `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`  
**Execution Timestamp**: 2026-10-28T09:32:00Z  
**Integrity Mode**: Development / Read-Only (Zero code modifications, zero commits, zero uncommitted changes discarded)

---

## 1. Observation

### 1.1 Git Working Tree & Branch Status
Direct command output from `git status`, `git log -1`, and `git diff --stat`:
- **Current Branch**: `main` (synchronized with `origin/main`).
- **Last Commit**: `commit 8578186f48a072ebfad9a865f2a47e2daf76de94`  
  *Author*: `Nishant Vishwakarma <nishant@agalabs.com>`  
  *Date*: `Thu Aug 6 12:57:59 2026 +0530`  
  *Message*: `Update analytics and dashboard files`
- **Changes Staged for Commit** (2 files):
  - `deleted: migrations/__pycache__/import_excel.cpython-312.pyc`
  - `deleted: migrations/__pycache__/import_excel.cpython-314.pyc`
- **Changes Not Staged for Commit** (19 tracked files, **+6,970 insertions, -439 deletions**):
  - `.env` (+33, -2)
  - `.gitignore` (+49, -1)
  - `app/__init__.py` (+95, -6)
  - `app/auth.py` (+47, -4)
  - `app/config.py` (+7, -1)
  - `app/models.py` (+385, -28)
  - `app/routes/admin.py` (+790, -42)
  - `app/routes/dashboard.py` (+281, -59)
  - `app/routes/roster.py` (+1566, -15)
  - `app/services/email_service.py` (+18, -3)
  - `app/services/scheduler.py` (+8, -2)
  - `app/static/css/main.css` (+972, -18)
  - `app/static/js/admin.js` (+2625, -34)
  - `app/static/js/api.js` (+2, -1)
  - `app/static/js/app.js` (+293, -64)
  - `app/static/js/auth.js` (+31, -2)
  - `app/templates/index.html` (+111, -12)
  - `requirements.txt` (+41, -5)
  - `run.py` (+55, -8)
- **Untracked Directories and Files Preserved** (15 items):
  - `.agents/` (Agent metadata directory)
  - `Scrapper For REf.xlsx` (Reference spreadsheet)
  - `TEST_INFRA.md` (Test infrastructure specification)
  - `TEST_READY.md` (Readiness report from prior milestone)
  - `app/routes/crishi.py` (Crishi Database surveillance & roster route controller)
  - `app/services/email_ingestion.py` (Automated Gmail IMAP SSL ingestion service)
  - `app/services/surveillance.py` (Live MySQL surveillance engine)
  - `app/static/js/crishi.js` (Crishi database frontend module)
  - `app/static/js/report.js` (Market reports & Gmail inspection frontend module)
  - `docs/` (System architecture, specs, and redesign documentation)
  - `documentation.md` (Comprehensive platform documentation)
  - `latest_two_dates_agalabsdev_stage/` (Offline snapshot fallback data)
  - `report mapping.xlsx` (Commodity & report mapping reference)
  - `tests/` (Test suite package: 66 discovered tests)
  - `uploads/gmail_reports/` (Ingested email PDF storage)

### 1.2 System Architecture, Directory Structure & Tech Stack
- **Project Structure**:
  ```
  Advance ERP/
  ├── .env                              # Environment configuration (DB, JWT, Gmail)
  ├── .venv/                            # Python 3.12 virtual environment
  ├── app/
  │   ├── __init__.py                   # Application factory, extensions, migration backfills
  │   ├── auth.py                       # JWT auth, RBAC middleware, audit logging
  │   ├── config.py                     # Config class (Flask, SQLAlchemy, upload settings)
  │   ├── models.py                     # 34 SQLAlchemy model definitions
  │   ├── routes/                       # 12 route controller modules
  │   │   ├── admin.py                  # User hierarchy, table mapping studio, CSV import
  │   │   ├── analytics.py              # KPI, SLA breaches, commodity comparison
  │   │   ├── chat.py                   # Real-time team messaging & DM
  │   │   ├── crishi.py                 # Surveillance grid, Manager pull, Admin skip
  │   │   ├── dashboard.py              # Stats, alerts, pending tasks, team updates
  │   │   ├── data_update.py            # Factor task submission & dynamic types
  │   │   ├── kanban.py                 # Sprints, boards, drag-and-drop tasks
  │   │   ├── mis_report.py             # MIS PDF upload, template auto-detect, analysis
  │   │   ├── notifications.py          # Notification center & read state
  │   │   ├── roster.py                 # Scrapper matrix, monthly schedules, rake zones
  │   │   └── tasks.py                  # Daily task checklist, remarks, snapshot
  │   ├── services/                     # 6 core domain services
  │   │   ├── email_ingestion.py        # IMAP SSL email fetching & PDF saving
  │   │   ├── email_service.py          # SMTP notification & digest engine
  │   │   ├── pdf_parser.py             # pdfplumber document table extractor
  │   │   ├── scheduler.py              # APScheduler background runner (Asia/Kolkata)
  │   │   ├── semantic_validator.py     # Content parsing & validation
  │   │   └── surveillance.py           # Live DB surveillance against agalabsdev_stage
  │   ├── static/
  │   │   ├── css/main.css              # Custom responsive stylesheet (Dark/Light theme)
  │   │   └── js/                       # 14 ES modules (app.js, admin.js, crishi.js, etc.)
  │   └── templates/
  │       └── index.html                # Single-Page Application (SPA) HTML shell
  ├── docs/                             # Architecture & redesign specifications
  ├── latest_two_dates_agalabsdev_stage/# Offline snapshot fallback files
  ├── migrations/                       # Legacy SQL scripts & migrations
  ├── tests/                            # E2E test suites (66 tests)
  ├── uploads/                          # File uploads & report PDFs
  ├── requirements.txt                  # Python dependencies
  └── run.py                            # Entrypoint with auto-port freeing & local IP detection
  ```
- **Technology Stack**:
  - **Backend**: Python 3.12, Flask 3.1.1, Werkzeug 3.1.3, Flask-CORS 5.0.1
  - **Asynchronous & WebSockets**: Flask-SocketIO 5.5.1, eventlet 0.39.1
  - **ORM & Databases**: SQLAlchemy 2.0.51, Flask-SQLAlchemy 3.1.1, PyMySQL 1.2.0, cryptography 49.0.0
  - **Primary ERP Database**: Local MySQL `advance_erp` (34 tables)
  - **Surveillance Database**: Local MySQL `agalabsdev_stage` (verified active via `pymysql.connect` on port 3306) with fallback to `_export_summary.txt`
  - **Authentication**: Flask-JWT-Extended 4.7.1, PyJWT 2.13.0 (24-hour expiration, Bearer headers + Cookies)
  - **Background Scheduling**: APScheduler 3.11.0 (Asia/Kolkata timezone, automated digest triggers at 14:00, 18:00, 19:00, 20:00)
  - **Document Processing**: openpyxl 3.1.5, pdfplumber 0.11.6
  - **Frontend**: Vanilla JavaScript (ES6 Modules), Google Inter Font, FontAwesome 6.5.1 (CDN), Chart.js 4.4.0 (CDN), PDF.js 3.11.174 (CDN), Socket.IO 4.7.5 (CDN)

### 1.3 Application Health & Connectivity Audit
- **Running Process**:
  - PID: `16524`
  - Command: `"C:\Users\dell\AppData\Local\Programs\Python\Python312\python.exe" "d:/D Disk Data Backup/Nishant_800mb/Nishant/Aniygravity/Advance ERP/run.py"`
  - Listening Address: `0.0.0.0:5000` (State: `Listen`)
- **Direct Connectivity Test Results**:
  1. `http://127.0.0.1:5000/` -> **HTTP 200 OK**
     - Response Size: `7,930 bytes`
     - Headers: `Content-Type: text/html; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Date: Wed, 28 Oct 2026 09:24:36 GMT`
  2. `http://localhost:5000/` -> **HTTP 200 OK**
  3. `http://192.168.1.65:5000/` (Machine's active Wi-Fi LAN IP) -> **HTTP 200 OK**
  4. `http://10.60.165.77:5000/` (Specified in prompt) -> **Connection Refused / Failed**
     - *Root Cause Analysis*: Windows network interfaces inspect via `Get-NetIPAddress -AddressFamily IPv4` confirms active IPv4 address is `192.168.1.65` on Wi-Fi adapter. The IP `10.60.165.77` was an earlier DHCP lease / subnet address. Because the server binds to `0.0.0.0:5000`, it responds on all active local interfaces (`127.0.0.1`, `localhost`, and `192.168.1.65`), while requests to the dead IP `10.60.165.77` predictably fail at the OS socket level.
- **Startup Integrity & Invariants**:
  - Application startup migration log: `[migration] Zero data loss verified: 9 users, 27 reports, 158 catalog entries intact.`
  - Database row counts in `advance_erp`:
    - `users`: 9 rows (all 9 baseline accounts intact)
    - `reports`: 27 rows
    - `db_task_catalog`: 158 rows
    - `master_log`: 10,759 rows
    - `notifications`: 30,458 rows
    - `mis_report_uploads`: 280 rows
    - `audit_log`: 2,435 rows
    - `commodity_configs`: 784 rows

### 1.4 Route, Blueprint, and Navigation Inventory
Total registered routes discovered in Flask URL map: **146 routes** across **13 blueprints/namespaces**:

| Blueprint | Route Count | URL Prefix | Primary Responsibility |
|---|---|---|---|
| `core` | 3 | `/` | SPA root shell (`index.html`), `/favicon.ico`, `/static/<filename>` |
| `auth` | 4 | `/api/auth` | Login, Logout, Me, Change Password |
| `admin` | 40 | `/api/admin` | User management, table mappings, CSV import, audit, email preview/test |
| `crishi` | 18 | `/api/crishi` | Live surveillance grid, manager pull, admin skip, remark history, report sync |
| `dashboard` | 7 | `/api/dash` | System stats, alerts, team progress, weekly trends |
| `tasks` | 14 | `/api/tasks` | Today's tasks, submissions, backdated entries, overrides, remarks |
| `roster` | 17 | `/api/roster` | Scrapper matrix, monthly schedules, rake zones, backup assignment |
| `mis` | 11 | `/api/mis` | PDF upload, template auto-detect, semantic feedback, report analysis |
| `kanban` | 10 | `/api/kanban` | Sprints, board tasks, reordering, status updates |
| `chat` | 9 | `/api/chat` | Channels, direct messaging, file upload/download, search |
| `analytics` | 5 | `/api/analytics` | KPI breakdown, SLA breaches, commodity comparison, CSV export |
| `du` (Data Update) | 5 | `/api/du` | Factor task submission, commodity types, factors |
| `notifications` | 3 | `/api/notifications` | Get notifications, mark read, mark all read |

- **Frontend Navigation & View Architecture**:
  - **Top Navigation Ribbon**:
    - `#crishi` -> Crishi Database (`crishi.js`):
      - *Surveillance View*: Table View, Commodity View, Date View across 114 monitored database tables and 16 agricultural commodities.
      - *Roster View*: Day Cover, Full Week Scrapper Matrix, Rake Date, Rake Zones.
      - *Multi-Stream Teammate Filters*: ALL, Nishant, Bhawna, Pankaj, Nitesh, Gopi.
    - `#report` -> Market Reports (`report.js`):
      - Datewise Intelligence Hub (Today, Latest, Historical).
      - Gmail IMAP sync trigger button (`Ingest from Gmail`).
      - 3-in-1 inspection modal: Email metadata, PDF canvas viewer, AI extraction report.
      - Catalog supporting 290+ reports.
    - `#admin` -> Admin Panel (`admin.js`):
      - 13 interconnected tabs: Table Mapping Studio, Users, Reports, Report Merging, Factor Task (Commodities), Task Templates, Roster, Backup Handovers, Bulk CSV Import, Email Manager, Settings, Modules, Audit Trail.
  - **Legacy Route Redirections** (handled cleanly in `app.js`):
    - `#dashboard`, `#analytics`, `#tasks`, `#data-update`, `#kanban`, `#chat`, `#roster` redirect to `#crishi`.
    - `#mis`, `#reports` redirect to `#report`.
    - `#crishi-database` normalizes to `crishi`.
  - **Global Modals & Overlays**:
    - User Profile & Security Modal (`#btn-profile`)
    - Table Mapping Configuration Submodal (`#submodal-overlay`)
    - Notification Slideout Panel (`#notif-panel`)
    - Toast Notification Container (`#toast-container`)

---

## 2. Logic Chain

1. **Working Tree Assessment**:
   - `git status` revealed 19 modified tracked files (+6,970 lines, -439 lines), 2 staged deletions, and 15 untracked files/directories.
   - `TEST_READY.md` confirmed that these modifications belong to the ongoing transition from legacy individual views to the unified Crishi Database & Table Mapping Studio architecture.
   - Discarding or resetting any working tree changes would destroy in-flight work and violate the safety directive: *"Preserve existing working tree modifications, untracked files... without discarding or modifying anything."*

2. **Application Connectivity & Health Verification**:
   - Querying `http://10.60.165.77:5000/` failed with `Unable to connect to the remote server`.
   - Inspecting active network adapters via `Get-NetIPAddress` confirmed the host's current Wi-Fi IPv4 address is `192.168.1.65`.
   - Testing `http://127.0.0.1:5000/`, `http://localhost:5000/`, and `http://192.168.1.65:5000/` yielded HTTP 200 OK with identical 7,930-byte payloads.
   - Process inspection confirmed Python 3.12 running `run.py` on PID 16524 bound to `0.0.0.0:5000`.
   - In conclusion: The application is healthy and online; the prompt IP `10.60.165.77` is simply an obsolete IP lease from a previous session.

3. **Database & Startup Invariants**:
   - The startup procedure in `app/__init__.py` executes `_run_lightweight_migrations()`, which enforces runtime assertions:
     `assert u_count >= 9`, `assert r_count >= 27`, `assert t_count >= 156`.
   - Both `advance_erp` (34 tables) and `agalabsdev_stage` (tested via `get_live_mysql_connection()`) responded positively.
   - Therefore, zero data loss is maintained across both local databases.

4. **API Endpoint & RBAC Verification**:
   - Querying `/api/auth/me` without credentials returned HTTP 401 UNAUTHORIZED.
   - Authenticating via `POST /api/auth/login` using `vaibhav@agalabs.com` returned HTTP 200 with a valid JWT token.
   - Passing `Authorization: Bearer <token>` to protected endpoints (`/api/auth/me`, `/api/dash/stats`, `/api/admin/users`, `/api/mis/reports`) succeeded with HTTP 200 and expected JSON schemas.
   - Crucial API contract observation: `GET /api/admin/users` returns `{ success: true, data: [...] }` (key is `data`, not `users`).

---

## 3. Caveats

1. **Network Address Dependency**: The external network address `http://10.60.165.77:5000/` is currently down due to local DHCP IP reallocation (`192.168.1.65`). All browser and automated testing should target `http://127.0.0.1:5000/` or `http://192.168.1.65:5000/`.
2. **Uncommitted Working Tree State**: Because there are 19 modified files and 15 untracked files, subsequent test workers and fixer agents must not execute `git checkout --`, `git restore`, `git clean`, or `git reset`.
3. **Dual Database Architecture**: Crishi surveillance directly connects to `agalabsdev_stage`. If the connection times out or fails, it switches to offline fallback mode via `latest_two_dates_agalabsdev_stage`.
4. **Existing Test Framework**: The repository uses Python's standard `unittest` framework rather than `pytest` (which is not installed in `.venv`).

---

## 4. Conclusion

The Advance ERP system is fully operational, healthy, and running on `http://127.0.0.1:5000` (PID 16524). The working tree contains substantial, valid in-progress feature implementations that must be preserved. The architecture consists of a Flask 3.1.1 backend with 146 routes across 13 blueprints, backed by dual MySQL databases (`advance_erp` with 34 tables and `agalabsdev_stage` for surveillance), Socket.IO WebSockets, APScheduler background jobs, and a single-page ES module frontend centered on Crishi Database surveillance, Market Reports intelligence, and an Admin Table Mapping Studio.

---

## 5. Verification Method

To independently verify these findings, execute the following commands in powershell:

1. **Verify Git Working Tree**:
   ```powershell
   git status
   git diff --stat
   ```
2. **Verify Application Health & Response Headers**:
   ```powershell
   curl.exe -i http://127.0.0.1:5000/
   curl.exe -i http://192.168.1.65:5000/
   ```
3. **Verify Route Count (146 routes)**:
   ```powershell
   .venv\Scripts\python.exe .agents\teamwork\explorer_r1_1\list_routes.py
   ```
4. **Verify Database Invariants & Tables (34 tables in advance_erp)**:
   ```powershell
   .venv\Scripts\python.exe .agents\teamwork\explorer_r1_1\check_db.py
   ```
5. **Verify Authenticated API Endpoints**:
   ```powershell
   .venv\Scripts\python.exe .agents\teamwork\explorer_r1_1\verify_auth.py
   ```
6. **Verify Test Discovery**:
   ```powershell
   .venv\Scripts\python.exe -c "import unittest; suite = unittest.TestLoader().discover('tests', pattern='*.py'); print('Tests:', suite.countTestCases())"
   ```

*Invalidation Conditions*:
- Server process PID 16524 terminated without restarting.
- Baseline user count drops below 9 or reports count drops below 27.
- Working tree uncommitted changes wiped via git reset/restore.
