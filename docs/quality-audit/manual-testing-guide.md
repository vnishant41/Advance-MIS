# Advance ERP Manual Testing Guide & Module Verification Runbook

**Document Version:** 2.0.0 (Post-Remediation Final Verification Edition)  
**Audit Milestone:** Milestone 6 (Final Documentation & Synchronization - R5)  
**Execution Timestamp:** 2026-10-28T11:00:00Z  
**Target Repository:** `Advance ERP` (`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`)  
**Target URL:** `http://127.0.0.1:5000/` and Wi-Fi LAN `http://192.168.1.65:5000/`  
**Test Lead:** Worker Verify M2 / Quality Assurance & Architecture Specialist  
**Integrity Mode:** Zero Data Loss / Genuine Verification  

---

## 1. Document Overview & Objective

This document establishes the definitive, comprehensive manual testing procedure and operational runbook for Advance ERP. It provides software quality engineers, developers, and operational stakeholders with structured, step-by-step test workflows across:
- **All 9 core module domains** (Surveillance Grid, Roster, Email Ingestion, PDF Parsing, Dashboards, User Hierarchy, Table Mapping Studio, Background Schedulers, and External Integrations).
- **Three distinct authenticated role personas** (`SuperAdmin`, `Manager`, `Teammate`) plus negative testing for deactivated accounts.
- **Four standard target viewports** (Mobile `375x812`, Tablet `768x1024`, Laptop `1366x768`, Desktop `1920x1080`).

Each test case specifies exact navigation routes, UI interaction steps, test inputs, expected visual behavior, expected network API payloads/status codes, and responsive layout validations.

---

## 2. Test Environment & Credential Catalog

### 2.1 Target Hosts and Connectivity
| Network Interface | Host URL | Port | Health Status | Primary Purpose |
|---|---|---|---|---|
| **Loopback (Localhost)** | `http://127.0.0.1:5000/` | `5000` | **ONLINE (HTTP 200)** | Primary local verification host |
| **Localhost Alias** | `http://localhost:5000/` | `5000` | **ONLINE (HTTP 200)** | Standard local development testing |
| **Wi-Fi LAN IP** | `http://192.168.1.65:5000/` | `5000` | **ONLINE (HTTP 200)** | Cross-device testing (Mobile/Tablet on LAN) |
| *Obsolete Lease* | `http://10.60.165.77:5000/` | `5000` | *Connection Refused* | Deprecated DHCP lease; do not use |

### 2.2 Baseline User Credentials & Role Matrix
All test accounts are pre-seeded in MySQL `advance_erp.users`. Never delete these baseline records.

| Persona / Role | Email Address | Password | Active | Permitted Operations | Access Restrictions |
|---|---|---|---|---|---|
| **SuperAdmin** | `vaibhav@agalabs.com` | `admin123` | `True` | Complete system access: User creation/deactivation, Table Mapping Studio, Task Skip with justification, System settings, Full email triggers | None |
| **SuperAdmin (Alt)** | `nishant@agalabs.com` | `admin123` | `True` | Complete system administration, architectural oversight | None |
| **Manager** | `ram@agalabs.com` | `admin123` | `True` | Manager Task Pull (Monthly/Yearly SLAs), Roster assignment, Scrapper matrix edits, User table viewing | Blocked from System Settings, Task Skip, and direct Mapping deletions |
| **Teammate (Standard)** | `bhawna@agalabs.com` | `admin123` | `True` | Commodity surveillance, Daily task checklist submissions, Remarks, Report view | Blocked from `/api/admin/*`, Manager Pull, Task Skip |
| **Teammate (Rotation)** | `nitesh@agalabs.com` | `admin123` | `True` | Daily task checklist, Weather rotation duties | Standard Teammate restrictions |
| **Teammate (Custom)** | `gopichand@agalabs.com` | `agAlabs367$` | `True` | Scrapper duties, Commodity surveillance | Standard Teammate restrictions |
| **Teammate (Custom)** | `pankaj@agalabs.com` | `999199@pankaj` | `True` | Commodity surveillance, Duty submission | Standard Teammate restrictions |
| **Deactivated User** | `damini@agalabs.com` | `admin123` | `False` | Negative testing: Login must be rejected with HTTP 401 | Blocked from all sessions |

---

## 3. Responsive Viewport Test Matrix & Emulation Setup

When testing, open Google Chrome or Microsoft Edge DevTools (`F12`), toggle Device Toolbar (`Ctrl+Shift+M`), and test each scenario under these 4 viewports:

| Viewport Category | Resolution (WxH) | Device Emulation Target | Key Responsive Invariants | Known Limitations / Discrepancies |
|---|---|---|---|---|
| **Mobile** | `375 x 812 px` | Apple iPhone X / 12 / 13 / 14 | Topbar ribbon collapses gracefully; grids collapse to 1 column; KPI cards to 2 columns; data grids enable horizontal swipe (`.crishi-table-responsive`). | **Resolved (M4):** Search box is fully functional with `display: flex; width: 100%` (BUG-10 resolved). Topbar nav labels hide gracefully on narrow mobile screens <= 480px via `display: none` (BUG-12 resolved). |
| **Tablet Portrait** | `768 x 1024 px` | Apple iPad / Tablet Portrait | Collapses multi-column forms to single column; 3-in-1 inspection modal collapses to single vertical scrollable view; touch targets >= 44px. | **Resolved (M4):** Search box is preserved and visible with responsive flex styling in portrait mode (BUG-10 resolved). |
| **Laptop** | `1366 x 768 px` | Standard 14-inch Laptop | Sidebar/Topbar visible; high-density 3-column split view for 3-in-1 inspection modal (`360px 1fr 320px`); table horizontal scrolling without clipping. | None. Optimal operational viewport. |
| **Desktop / Full HD**| `1920 x 1080 px` | 24-27 inch 1080p Monitor | 6-column KPI grid (`repeat(6, 1fr)`); full wide modal width 96vw up to 1520px; zero text truncation on multi-stream teammate chips. | None. Complete unconstrained layout. |

---

## 4. Module-by-Module Manual Testing Procedures (9 Core Domains)

---

### Domain 1: CRISHI & Surveillance Data Grids

- **Module Route / Navigation:** Login -> Topbar Ribbon -> Click **Crishi Database** (`#crishi`)
- **Primary Frontend Controller:** `app/static/js/crishi.js`
- **Primary Backend Blueprint:** `app/routes/crishi.py` (`/api/crishi/*`)
- **Underlying Tables:** `db_task_catalog`, `manager_task_pulls`, `task_skips`, `task_remarks`, `surveillance_verifications`

#### Test Scenario 1.1: Surveillance Grid View Modes & Filtering
1. **Action:** Log in as SuperAdmin (`vaibhav@agalabs.com` / `admin123`). Navigate to `#crishi`.
2. **Action:** Click between the three View Mode subtabs:
   - **Table View** (`#btn-view-table`)
   - **Commodity View** (`#btn-view-commodity`)
   - **Date View** (`#btn-view-date`)
3. **Action:** In Table View, click the cadence filter pills: **ALL**, **Daily**, **Weekly**, **Monthly**, **Yearly**.
4. **Action:** Click the Teammate Stream filter chips: **ALL**, **Nishant**, **Bhawna**, **Pankaj**, **Nitesh**, **Gopi**.
5. **Expected Visual Behavior:**
   - Grid updates dynamically without full-page reload.
   - Status pills render color-coded badges: Green for `Updated Today` / `Done`, Red for `Not Updated Today` / `Overdue`, Amber for `Awaiting Pull` / `Skip`, Light Blue for `Window Active`.
   - The aggregate summary cards (`Total Tables: 140+`, `Updated Today`, `Pending`) update instantly.
6. **Expected Network Behavior:**
   - Client issues `GET /api/crishi/grid?date=YYYY-MM-DD`.
   - Response status: HTTP `200 OK`.
   - Payload contains `success: true`, `count >= 114`, `commodity_rollups`, and `date_summary`.

#### Test Scenario 1.2: Manager Task Pull (Monthly / Yearly Tasks)
1. **Action:** Log in as Manager (`ram@agalabs.com` / `admin123`).
2. **Action:** In Table View, filter by `Cadence: Monthly`. Locate a task displaying the amber status pill `Awaiting Pull`.
3. **Action:** Click the **Pull Task** button in the action column.
4. **Action:** In the prompt modal, select SLA duration (e.g., `24 Hours`), enter operational remark: `Data released on portal; starting surveillance`, and click **Confirm Pull**.
5. **Expected Visual Behavior:**
   - Modal closes. A green success toast notification appears: `"Task pulled successfully. SLA deadline: YYYY-MM-DD HH:MM"`.
   - The status pill immediately transitions from `Awaiting Pull` to `Pull (In SLA)` with an active blue timer.
6. **Expected Network Behavior:**
   - `POST /api/crishi/pull` with payload `{"catalogId": <id>, "slaHours": 24}`.
   - Response status: HTTP `200 OK`.
   - Response body: `{"success": true, "pull": {"id": ..., "status": "Open", "sla_hours": 24}}`.

#### Test Scenario 1.3: SuperAdmin Task Skip with Mandatory Justification
1. **Action:** Log in as SuperAdmin (`vaibhav@agalabs.com` / `admin123`).
2. **Action:** Locate a pending table row. Click the **Skip** button.
3. **Action:** In the Skip Task modal, leave the justification field empty and click **Submit**.
4. **Expected Behavior (Validation):** UI highlights the reason box in red or displays an alert `"Mandatory reason required for skip"`. Zero network mutation occurs.
5. **Action:** Enter reason: `"National holiday / Mandi closed"`. Click **Submit**.
6. **Expected Visual Behavior:** Status pill transitions to Amber `Skip`. The row is marked as administratively exempted for the day.
7. **Expected Network Behavior:**
   - `POST /api/crishi/skip` with `{"catalogId": <id>, "reason": "National holiday / Mandi closed"}`.
   - Response status: HTTP `200 OK`.
   - Payload: `{"success": true, "message": "Task ... marked as skipped for YYYY-MM-DD."}`.

#### Test Scenario 1.4: Remark Submission and Audit Trail History
1. **Action:** On any table row, click the **Remark / Chat** icon button.
2. **Action:** In the Remark modal, type: `"Verified data against state civil supplies portal"`. Click **Save Remark**.
3. **Action:** Click the **History** tab in the modal.
4. **Expected Visual Behavior:**
   - A compact blue pill displays the latest remark snippet in the data grid.
   - History list displays the remark timestamp (UTC+5:30), author name (`Vaibhav`), and remark text.
5. **Expected Network Behavior:**
   - `POST /api/crishi/remark` -> HTTP `200 OK`.
   - `GET /api/crishi/remark/history/<catalog_id>` -> HTTP `200 OK` with `history: [...]`.

---

### Domain 2: Roster & Scheduling

- **Module Route / Navigation:** `#crishi` -> Click **Roster** subtab in top-left view selector
- **Primary Frontend Controller:** `app/static/js/roster.js`, `app/static/js/crishi.js`
- **Primary Backend Blueprint:** `app/routes/roster.py` (`/api/roster/*`)
- **Underlying Tables:** `roster_configs`, `roster_schedules`, `roster_logs`, `roster_day_substitutions`

#### Test Scenario 2.1: Daily Duty Allocation Inspection
1. **Action:** Log in as any authenticated user (`vaibhav`, `ram`, or `bhawna`).
2. **Action:** Navigate to `#crishi` -> **Roster** subtab.
3. **Expected Visual Behavior:**
   - Displays the current day's banner: Day name, date, and assigned duty leads.
   - Duty cards render assignees for:
     - **Scrapper Duty Lead** (Primary and Backup).
     - **Weather Rotation Duty** (Primary and Backup).
     - **Daily Commodity Verification**.
   - Timing badges indicate active duty hours (e.g. `09:30 - 18:30 IST`).
4. **Expected Network Behavior:**
   - `GET /api/roster/today` -> HTTP `200 OK`.
   - Payload structure: `{"success": true, "today": "YYYY-MM-DD", "tasks": [...]}`.

#### Test Scenario 2.2: 5-Week Scrapper Matrix & Tuesday Rake Movement
1. **Action:** Under the Roster tab, scroll down to the **5-Week Scrapper Matrix**.
2. **Expected Visual Behavior:**
   - 5 rows representing Week 1 through Week 5 of the current month.
   - Teammates (`Nishant`, `Bhawna`, `Pankaj`, `Nitesh`, `Gopi`) mapped across weekdays.
   - Tuesdays feature an explicit **Rake Movement** indicator with designated Zone assignees.
3. **Action:** Log in as SuperAdmin or Manager. Click **Edit Rake Zones**.
4. **Action:** Change zone allocation for a teammate and click **Save Zones**.
5. **Expected Network Behavior:**
   - `GET /api/roster/scrapper-matrix` -> HTTP `200 OK` (retrieves active week and cell statuses).
   - `PUT /api/roster/rake-zones` -> HTTP `200 OK` (`{"success": true, "message": "Rake zones updated"}`).

#### Test Scenario 2.3: Teammate Backup Reassignment
1. **Action:** As Manager (`ram@agalabs.com`), locate an upcoming duty day where a teammate is on leave.
2. **Action:** Click the **Assign Backup** button.
3. **Action:** Select absent user (`Bhawna`), select replacement backup (`Nitesh`), specify date, and click **Reassign**.
4. **Expected Visual Behavior:**
   - Schedule reflects replacement with a tagged badge: `Nitesh (Backup for Bhawna)`.
   - Notification is generated for Nitesh.
5. **Expected Network Behavior:**
   - `POST /api/roster/assign-backup` with `{"originalUser": "Bhawna", "backupUser": "Nitesh", "date": "YYYY-MM-DD"}`.
   - Response status: HTTP `200 OK`.

---

### Domain 3: Email Ingestion & Processing

- **Module Route / Navigation:** `#report` -> **Gmail Reports** section / `#admin` -> **Email Logs**
- **Primary Service / Logic:** `app/services/email_ingestion.py`, `app/services/email_service.py`
- **Underlying Tables:** `email_reports`, `email_logs`, `app_settings`

#### Test Scenario 3.1: Automated Gmail Ingestion Inspection
1. **Action:** Navigate to `#report`.
2. **Expected Visual Behavior:**
   - The report repository lists ingested market reports with metadata: Subject, Sender, Received Date/Time, Commodity, and File Size.
   - Clicking on a report card opens the 3-in-1 inspection modal.
3. **Action:** Click **Sync Gmail** (`#btn-sync-gmail`).
4. **Expected Network Behavior:**
   - `POST /api/crishi/reports/sync-gmail`.
   - Response status: HTTP `200 OK`.
   - Payload: `{"success": true, "new_reports": <count>, "message": "Gmail sync complete"}`.

#### Test Scenario 3.2: Daily HTML Digest Email Preview
1. **Action:** Log in as SuperAdmin (`vaibhav@agalabs.com`).
2. **Action:** Navigate to `#admin` -> **Email Administration**.
3. **Action:** Click **Preview Daily Digest** (`#btn-email-preview`).
4. **Action:** Select digest stage: `14:00 Teammate Reminder`, `18:00 Cutoff`, `19:00 Manager Review`, or `20:00 Leadership Summary`.
5. **Expected Visual Behavior:**
   - An iframe renders the responsive HTML email template.
   - Contains executive KPI cards, completed tasks table, pending tasks table, and direct portal action buttons.
6. **Expected Network Behavior:**
   - `POST /api/admin/email-preview` with `{"stage": "19:00"}`.
   - Response status: HTTP `200 OK`.
   - Payload returns `{ "success": true, "html": "<html>...</html>" }`.

---

### Domain 4: PDF Parsing & Document Processing

- **Module Route / Navigation:** Topbar Ribbon -> Click **Report** (`#report`)
- **Primary Frontend Controller:** `app/static/js/report.js`, `app/static/js/mis.js`
- **Primary Service / Logic:** `app/services/pdf_parser.py`, `app/services/semantic_validator.py`
- **Underlying Tables:** `mis_report_uploads`, `mis_templates`, `mis_llm_feedbacks`

#### Test Scenario 4.1: 3-in-1 Inspection Modal (Email + PDF + AI Analysis)
1. **Action:** In `#report`, click the **Inspect** button on any market report item (e.g., SOPA Daily Report).
2. **Expected Visual Behavior:**
   - Opens the 3-in-1 inspection modal (`.modal-split-3`):
     - **Left Pane (360px):** Email metadata (Sender, Date, Subject, Attachments).
     - **Center Pane (Flexible 1fr):** PDF.js canvas viewer with page navigation, zoom, and text layer.
     - **Right Pane (320px):** AI Extraction Analysis, extracted tables, and spatial tolerance badges.
   - Green pill indicates `Matched Template`; tolerance values display within strict (±5pt) or relaxed (±25pt) bounds.
3. **Expected Network Behavior:**
   - `GET /api/mis/analysis/<upload_id>` -> HTTP `200 OK`.
   - Embedded PDF fetched via `GET /uploads/gmail_reports/<filename>`.

#### Test Scenario 4.2: Manual PDF Upload & Template Auto-Detection
1. **Action:** In `#report`, click **Upload MIS Report** (`#btn-upload-pdf`).
2. **Action:** Choose a valid PDF file from disk. Click **Process Report**.
3. **Expected Visual Behavior:**
   - Upload progress bar animates.
   - Document parses successfully; template auto-detect matches the commodity structure.
4. **Expected Network Behavior:**
   - `POST /api/mis/upload-pdf` with `multipart/form-data`.
   - Response status: HTTP `200 OK` with `upload_id` and extracted fields.

---

### Domain 5: Reporting & Dashboards

- **Module Route / Navigation:** `#crishi` / Analytics subviews
- **Primary Frontend Controller:** `app/static/js/dashboard.js`, `app/static/js/analytics.js`
- **Primary Backend Blueprint:** `app/routes/dashboard.py`, `app/routes/analytics.py`

#### Test Scenario 5.1: Real-Time Operational KPI Widgets
1. **Action:** Navigate to `#crishi`. Observe top KPI widgets:
   - Total Monitored Tables (`140+`).
   - Tables Updated Today.
   - Pending Daily Updates.
   - SLA Deadline Breaches.
2. **Expected Visual Behavior:**
   - Numbers match the database state in `advance_erp.master_log` and `db_task_catalog`.
   - Progress fill bars reflect percentage completion for the current day.
3. **Expected Network Behavior:**
   - `GET /api/dash/stats` -> HTTP `200 OK` (returns counts, velocity, today date).
   - `GET /api/dash/week-trend` -> HTTP `200 OK` (7-day historical submission velocity).

#### Test Scenario 5.2: SLA Breach & Velocity Charts
1. **Action:** Navigate to Analytics view or trigger the SLA modal.
2. **Expected Visual Behavior:**
   - Chart.js renders a bar/line chart displaying on-time vs. late submissions across team members.
   - Chart adapts to current theme (dark backgrounds with glowing accents vs. light clean backgrounds).
3. **Expected Network Behavior:**
   - `GET /api/analytics/sla-breaches` -> HTTP `200 OK`.
   - `GET /api/analytics/kpi` -> HTTP `200 OK` with `doneRate`, `pendingRate`, `lateRate`.

---

### Domain 6: User Management & Permissions

- **Module Route / Navigation:** Topbar Ribbon -> Click **Admin** (`#admin`) -> **User Management**
- **Primary Frontend Controller:** `app/static/js/admin.js`
- **Primary Backend Blueprint:** `app/routes/admin.py`, `app/auth.py`
- **Underlying Tables:** `users`, `user_report_mappings`, `user_commodity_mappings`, `audit_log`

#### Test Scenario 6.1: RBAC Access Control Enforcement
1. **Action (Teammate Attempt):** Log in as Teammate (`bhawna@agalabs.com` / `admin123`).
2. **Action:** Attempt to click the **Admin** navigation tab (`#nav-admin`) or directly call `GET /api/admin/users`.
3. **Expected Behavior:**
   - The UI disables or hides the Admin link for Teammates, or redirects to `#crishi`.
   - Direct HTTP call to `GET /api/admin/users` returns HTTP `403 Forbidden` (`{"success": false, "message": "Access denied: requires Manager"}`).
4. **Action (Manager Attempt):** Log in as Manager (`ram@agalabs.com` / `admin123`).
5. **Expected Behavior:**
   - Can view the user table (`GET /api/admin/users` returns HTTP `200 OK`).
   - Blocked from accessing system configuration (`GET /api/admin/settings`).
6. **Action (SuperAdmin Attempt):** Log in as SuperAdmin (`vaibhav@agalabs.com` / `admin123`).
7. **Expected Behavior:** Full administrative access to users, reports, commodities, and settings.

#### Test Scenario 6.2: User Details & Duty Mapping Submodal
1. **Action:** As SuperAdmin, click on user `Bhawna` in the user management table.
2. **Action:** Click **View Duties** (`#btn-user-duties`).
3. **Expected Visual Behavior:**
   - Modal displays Bhawna's assigned commodities (`Soybeans`, `Wheat`, etc.), assigned reports, and roster shift history.
4. **Expected Network Behavior:**
   - `GET /api/admin/user-duties/bhawna@agalabs.com` -> HTTP `200 OK`.

#### Test Scenario 6.3: Relational Cascade on User Name Update
1. **Action:** As SuperAdmin, edit user name (e.g. modify test user).
2. **Expected Behavior:**
   - Name update cascades through `db_task_catalog.user_name` (updating both single assignees and multi-token comma-separated assignments).
   - Invariant: Zero orphaned foreign keys.

---

### Domain 7: Commodity & Table Mapping

- **Module Route / Navigation:** `#admin` -> **Table Mapping Studio**
- **Primary Frontend Controller:** `app/static/js/admin.js`
- **Primary Backend Blueprint:** `app/routes/admin.py`
- **Underlying Tables:** `db_task_catalog`, `commodity_configs`, `reports`

#### Test Scenario 7.1: Table Mapping Studio Catalog Integrity
1. **Action:** As SuperAdmin, navigate to `#admin` -> **Table Mapping Studio**.
2. **Expected Visual Behavior:**
   - Displays all 158 baseline mapped tables.
   - Shows Raw Table Name, Business Final Name, Commodity, Cadence, Date Column, Due Time, and Assignee.
3. **Expected Network Behavior:**
   - `GET /api/admin/table-mappings` -> HTTP `200 OK`.
   - Response contains `count: 158`, `data: [...]`.

#### Test Scenario 7.2: Database Table Discovery
1. **Action:** In Mapping Studio, click **Fetch Database Tables** (`#btn-fetch-db-tables`).
2. **Expected Visual Behavior:**
   - Scans MySQL `agalabsdev_stage` (or disk snapshot).
   - Lists available unmapped tables eligible for new mapping creation.
3. **Expected Network Behavior:**
   - `GET /api/admin/fetch-db-tables` -> HTTP `200 OK` with table array.

---

### Domain 8: Background Jobs & Notifications

- **Module Route / Navigation:** Topbar -> Bell Icon (`#notif-btn`)
- **Primary Service / Logic:** `app/services/scheduler.py`
- **Underlying Tables:** `notifications`, `app_settings`

#### Test Scenario 8.1: In-App Notification Center
1. **Action:** Click the Notification Bell icon (`#notif-btn`) in the topbar.
2. **Expected Visual Behavior:**
   - Drops down the Notification Panel (`.notif-panel`).
   - Lists recent task deadline alerts, system messages, and review requests.
   - Unread items feature an accent indicator.
3. **Action:** Click **Mark All as Read** (`#btn-mark-all-read`).
4. **Expected Visual Behavior:**
   - Unread counter badge hides or sets to 0. All items transition to read state.
5. **Expected Network Behavior:**
   - `GET /api/notifications/` -> HTTP `200 OK`.
   - `POST /api/notifications/read-all` -> HTTP `200 OK`.

---

### Domain 9: External Integrations & Infrastructure

- **Module Route / Navigation:** Global application shell
- **Primary Services:** Socket.IO, MySQL connection pool, Theme engine

#### Test Scenario 9.1: Real-Time WebSocket Gateway
1. **Action:** Open two separate browser tabs (one as SuperAdmin, one as Teammate).
2. **Action:** In Tab 1, perform an action (e.g., submit remark or pull task).
3. **Expected Visual Behavior:**
   - Tab 2 receives the Socket.IO broadcast event within < 1.0 second.
   - Live grid updates without requiring manual browser refresh.
4. **Expected Network Behavior:**
   - Browser Network tab shows active WebSocket handshake (`ws://127.0.0.1:5000/socket.io/?EIO=4&transport=websocket`).

#### Test Scenario 9.2: Theme Toggle (Dark Mode vs. Light Mode)
1. **Action:** Click the Sun/Moon theme button (`#btn-theme`) in the topbar.
2. **Expected Visual Behavior:**
   - Instant visual transition from dark theme (`#0f172a`) to light theme (`#f8fafc`).
   - All glassmorphism cards, text contrast, borders, and charts re-render cleanly.
   - Refreshing the browser preserves the chosen theme via `localStorage.getItem('theme')`.

---

## 5. Cross-Viewport Visual & Usability Inspection Matrix

| Viewport | Test Procedure & Visual Expectations | Expected CSS Rule Applied | Pass/Fail Criteria |
|---|---|---|---|
| **Mobile (375x812)** | 1. Open mobile emulation in Chrome DevTools.<br>2. Verify `.sidebar` is hidden (`display: none !important`).<br>3. Verify `.main-content` margin is `0`.<br>4. Verify data grid enables horizontal touch scrolling (`overflow-x: auto`).<br>5. Check for topbar crowding. | `@media (max-width: 768px)` | **PASS:** Grid is scrollable; cards stack vertically. Search box is accessible (BUG-10 resolved); nav labels hide on narrow widths <= 480px preventing ribbon overflow (BUG-12 resolved). |
| **Tablet (768x1024)** | 1. Emulate iPad portrait mode (768px width).<br>2. Form grids collapse to 1 column.<br>3. Modals take up max 95vw.<br>4. Rotate to landscape (1024px width): 3-in-1 inspection modal collapses if <= 1200px. | `@media (max-width: 768px)` (portrait)<br>`@media (max-width: 1200px)` (landscape) | **PASS:** Touch targets accessible, layout adjusts smoothly between orientations. |
| **Laptop (1366x768)** | 1. Emulate standard 1366x768 resolution.<br>2. Sidebar visible (260px), topbar visible (60px).<br>3. 3-in-1 inspection modal displays full 3-column split view (`360px 1fr 320px`).<br>4. KPI grid shows 3 columns. | `@media (max-width: 1400px)` | **PASS:** Optimal display. Zero clipping, all columns legible without cramped wrapping. |
| **Desktop (1920x1080)** | 1. Emulate Full HD monitor.<br>2. Crishi KPI grid displays full 6 columns.<br>3. High-density data grid displays all 12 metadata columns simultaneously. | Standard Desktop (no max-width media query) | **PASS:** Complete widescreen presentation with maximum data visibility. |

---

## 6. Manual Testing Execution Sign-Off Template

When executing a quality pass prior to release, record results using this structured table:

```markdown
### Quality Test Run Sign-off
- **Run Date:** YYYY-MM-DD
- **Tester:** [Name / Role]
- **Target Host:** http://127.0.0.1:5000/
- **Server PID / Commit:** [PID / Git Commit SHA]

| # | Test Scenario | Viewport | Account Tested | Result (PASS / FAIL / BLOCKED) | Notes / Defect Reference |
|---|---|---|---|---|---|
| 1 | 1.1 Surveillance Grid Filtering | Desktop | SuperAdmin | PASSED | Loaded 140 tables in 452ms |
| 2 | 1.2 Manager Task Pull | Laptop | Manager | PASSED | Status transitioned to Pull |
| 3 | 1.3 SuperAdmin Task Skip | Laptop | SuperAdmin | PASSED | Reason validation confirmed |
| 4 | 2.1 Daily Duty Allocation | Desktop | Teammate | PASSED | Shift hours displayed |
| 5 | 2.2 5-Week Scrapper Matrix | Desktop | Manager | PASSED | Tuesday Rake zones verified |
| 6 | 3.1 Gmail Ingestion Inspection | Laptop | SuperAdmin | PASSED | PDF report card opened |
| 7 | 4.1 3-in-1 Inspection Modal | Laptop | Teammate | PASSED | Canvas viewer rendered |
| 8 | 5.1 Real-Time KPI Widgets | Desktop | SuperAdmin | PASSED | Invariant counts verified |
| 9 | 6.1 RBAC Enforcement | Desktop | Teammate | PASSED | 403 Forbidden verified |
| 10| 7.1 Table Mapping Studio | Desktop | SuperAdmin | PASSED | 158 mappings intact |
| 11| 8.1 In-App Notifications | Laptop | Teammate | PASSED | Unread counter decremented |
| 12| 9.1 WebSocket Real-Time Alert | Desktop | All | PASSED | Push alert received < 1s |
| 13| Responsive Mobile Layout | Mobile 375x812 | Teammate | PASSED | BUG-10 & BUG-12 remediated and verified |
```
