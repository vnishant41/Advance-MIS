# Investigation & Architectural Handoff Report: R3 & R4

**Focus**: Commodity-Basis Report History in Market & Intelligence Reports (R3) & System & Database Invariants (R4)  
**Agent**: `teamwork_explorer` (`explorer_r3_3`)  
**Target Milestone**: R3 & R4 Investigation & Architectural Blueprint  
**Timestamp**: 2026-10-29T07:54:00Z  

---

## 1. Observation

### 1.1 Frontend View Structure & Routing for Market & Intelligence Reports
- **Shell & Navigation (`app/templates/index.html:74-84`)**:
  The top navigation ribbon declares:
  ```html
  <nav class="topbar-nav" id="topbar-nav">
      <a href="#crishi" class="nav-item active" data-page="crishi" id="nav-crishi">
          <i class="fas fa-database"></i><span>Crishi Database</span>
      </a>
      <a href="#report" class="nav-item" data-page="report" id="nav-report">
          <i class="fas fa-file-invoice"></i><span>Report</span>
      </a>
      <a href="#admin" class="nav-item" data-page="admin" id="nav-admin">
          <i class="fas fa-cog"></i><span>Admin</span>
      </a>
  </nav>
  ```
- **SPA Dynamic Module Loader (`app/static/js/app.js:82-120`)**:
  Navigating to `#report` (or legacy aliases `#reports` and `#mis`) normalizes the route to `#report` and dynamically loads `app/static/js/report.js`:
  ```javascript
  if (page === 'mis' || page === 'reports') {
      window.location.hash = '#report';
      return;
  }
  ...
  const mod = await import(`./${moduleKey}.js?v=${Date.now()}`);
  this.modules[moduleKey] = mod.default;
  const container = document.getElementById('page-container');
  container.innerHTML = await this.modules[moduleKey].render();
  if (this.modules[moduleKey].init) {
      await this.modules[moduleKey].init();
  }
  ```
- **Market & Intelligence Reports Module (`app/static/js/report.js`)**:
  - **State Pre-declaration (`app/static/js/report.js:42-47`)**:
    `ReportModule` already has initial state keys defined for report history, but they are not yet connected to any tab buttons or view containers:
    ```javascript
    activeReportTab: 'dispatches', // 'dispatches' | 'commodity-history'
    selectedHistoryCommodity: 'ALL',
    historySearchQuery: '',
    historyFrequencyFilter: 'ALL', // 'ALL' | 'Daily' | 'Weekly'
    historyDbUpdates: [],
    isLoadingDbHistory: false,
    ```
  - **Header & Title (`app/static/js/report.js:82-91`)**:
    Title is explicitly rendered as:
    ```html
    <h2 style="font-size: 1.45rem; font-weight: 800; display: flex; align-items: center; gap: 10px; margin: 0;">
        <i class="fas fa-file-invoice" style="color: var(--accent);"></i>
        <span>Market & Intelligence Reports</span>
    </h2>
    ```
  - **Missing Tab Bar in `render()` (`app/static/js/report.js:78-147`)**:
    `ReportModule.render()` directly places `#report-date-hub`, `#report-dispatch-banner`, `#report-category-pills`, and `.crishi-table-card` inside `.crishi-view`. There is currently **no** `<div class="crishi-tabs">` element or view container for `#view-report-commodity-history`.
  - **3-in-1 Report Inspection Modal (`app/static/js/report.js:750-1033`)**:
    `ReportModule.openThreeSplitModal(id)` exists and provides a 3-panel split inspection:
    1. Email Transmission Preview (HTML sandbox iframe)
    2. Interactive PDF Viewer Canvas
    3. AI Document Intelligence Overview & Mandi Arrivals Table

- **Crishi Database Module Tab Precedent (`app/static/js/crishi.js:182-187`, `828-920`)**:
  Tabs in `crishi.js` use the standardized `.crishi-tabs` and `.crishi-tab-btn` CSS classes:
  ```html
  <div class="crishi-tabs">
      <button class="crishi-tab-btn active" id="tab-surveillance">Database Surveillance</button>
      <button class="crishi-tab-btn" id="tab-roster">Weekly Roster & Rake Movement</button>
      <button class="crishi-tab-btn" id="tab-history">Update History</button>
  </div>
  ```
  Styled in `app/static/css/main.css:784-786`:
  ```css
  .crishi-tabs { display: flex; gap: 8px; background: var(--bg-card); padding: 4px; border-radius: 10px; border: 1px solid var(--border); }
  .crishi-tab-btn { padding: 8px 18px; border: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: .85rem; border-radius: 8px; cursor: pointer; transition: all var(--transition); }
  .crishi-tab-btn.active { background: var(--accent); color: #fff; box-shadow: 0 2px 10px var(--accent-glow); }
  ```

---

### 1.2 Backend Endpoints for Commodity History & Reports
- **`GET /api/crishi/reports/all` (`app/routes/crishi.py:1728-1775`)**:
  - Authenticated via `@jwt_required(optional=True)`.
  - Unrestricted for SuperAdmin and Manager (`is_admin_role`).
  - Scoped strictly to assigned commodities/reports for Teammates (`get_user_assigned_commodities(user)`).
  - Returns `{"success": true, "total": int, "reports": [...]}`.
  - Empirical verification via Python test client:
    - SuperAdmin (`vaibhav@agalabs.com`): 437 total scanned reports across all 16 commodities:
      - Bajra (6), Barley (6), Chilli (46), Coriander (46), Cotton (6), Cumin (40), Maize (42), Pulses (70), Rapeseed (8), Rice (41), Soybeans (14), Sugar (10), Tops (16), Turmeric (36), Weather (10), Wheat (40).
    - Teammate Bhawna (`bhawna@agalabs.com`): strictly 38 reports matching Cotton (6), Rapeseed (8), Soybeans (14), Weather (10).
    - Teammate Gopichand (`gopichand@agalabs.com`): strictly 81 reports matching Rice (41) and Wheat (40).
- **`GET /api/crishi/update-history` (`app/routes/crishi.py:547-649`)**:
  - Authenticated via `@jwt_required()`.
  - Supports query filters: `?commodity=`, `?teammate=`, `?search=`, `?status=`, `?date_from=`, `?date_to=`, `?limit=`, `?offset=`.
  - Multi-commodity alias matching built-in (`app/routes/crishi.py:596-607`):
    - `pulses` -> `pulses`, `bengal gram`, `tur`, `urad`, `moong`, `masoor`, `pea`, `chana`, `ipga`
    - `tops` -> `tops`, `vegetable`, `tomato`, `potato`, `onion`, `egg`, `poultry`, `forecasting`, `logistics`, `macro`
    - `rapeseed` -> `rapeseed`, `mustard`, `canola`, `oilseed`
    - `cumin` -> `cumin`, `jeera`
    - `coriander` -> `coriander`, `dhaniya`
    - `weather` -> `weather`, `monsoon`, `rainfall`, `temperature`, `gis`, `ndvi`
    - `soybeans` -> `soybean`, `sopa`
  - Rejects mutations with HTTP 405 (`app/routes/crishi.py:651-657`).
  - Empirical verification:
    - `commodity=Soybeans`: 311 records.
    - `commodity=Pulses`: 54 records.
    - `commodity=Wheat`: 29 records.
    - `commodity=Weather`: 14 records.
    - `commodity=Rice`: 5 records.
    - `commodity=Chilli`: 2 records.
    - Total update history records: 462 records.

---

### 1.3 System & Database Invariant Verification
- **Exact Counts in MySQL (`advance_erp`)**:
  - Verified via direct SQLAlchemy query on live MySQL database:
    ```
    Users: 9
    Reports: 27
    Catalog: 158
    UpdateHistory: 462
    ```
  - **User Invariant (Strictly 9 Users)**:
    1. `nishant@agalabs.com` (SuperAdmin, Comm: Pulses, Tops)
    2. `ram@agalabs.com` (Manager)
    3. `gopichand@agalabs.com` (Teammate, Comm: Rice, Wheat)
    4. `nitesh@agalabs.com` (Teammate, Comm: Bajra, Barley, Maize, Sugar)
    5. `pankaj@agalabs.com` (Teammate, Comm: Chilli, Coriander, Cumin, Turmeric, Weather)
    6. `damini@agalabs.com` (Inactive)
    7. `bhawna@agalabs.com` (Teammate, Comm: Cotton, Rapeseed, Soybeans, Weather)
    8. `balram@agalabs.com` (Teammate)
    9. `vaibhav@agalabs.com` (SuperAdmin)
  - **Report Invariant (Strictly 27 Reports)**:
    1. Bajra Weekly
    2. Barley Weekly
    3. Chilli Daily
    4. Chilli Weekly
    5. Coriander Daily
    6. Coriander Weekly
    7. Cotton Weekly
    8. Cumin Daily
    9. Cumin Weekly
    10. Maize Daily
    11. Maize Weekly
    12. Pulses Daily
    13. Pulses Weekly
    14. Rapeseed Daily
    15. Rapeseed Weekly
    16. Rice Daily
    17. Rice Weekly
    18. Soybeans Daily
    19. Soybeans Weekly
    20. Sugar Daily
    21. Sugar Weekly
    22. Tops Daily
    23. Turmeric Daily
    24. Turmeric Weekly
    25. Weather Daily
    26. Wheat Daily
    27. Wheat Weekly
  - **Catalog Invariant (Strictly 158 Catalog Mappings)**:
    `DBTaskCatalog.query.count() == 158`.
- **Runtime Startup Assertion (`app/__init__.py:233-242`)**:
  ```python
  u_count = User.query.count()
  r_count = Report.query.count()
  t_count = DBTaskCatalog.query.count()
  if u_count > 0 or r_count > 0 or t_count > 0:
      assert u_count >= 9, f"Data loss detected: Expected >= 9 users, found {u_count}"
      assert r_count >= 27, f"Data loss detected: Expected >= 27 reports, found {r_count}"
      assert t_count >= 156, f"Data loss detected: Expected >= 156 catalog entries, found {t_count}"
  print(f"[migration] Zero data loss verified: {u_count} users, {r_count} reports, {t_count} catalog entries intact.")
  ```
- **Primary Test Suite (`tests/test_crishi_history_and_scoping.py`)**:
  - Test command: `.\.venv\Scripts\python.exe -m unittest tests/test_crishi_history_and_scoping.py`
  - Result: **135/135 tests passing in 16.043s**, with 0 errors and 0 failures.
  - Confirms baseline assertions:
    - `test_t1_f12_01_baseline_user_count_exactly_nine`: PASSED
    - `test_t1_f12_02_baseline_report_count_exactly_27`: PASSED
    - `test_t1_f12_03_baseline_catalog_mappings_exactly_158`: PASSED
    - `test_t2_b12_04_catalog_count_never_drops_below_158`: PASSED
    - `test_t2_b12_05_report_count_never_drops_below_27`: PASSED
- **Port 5000 & Server Listener (`run.py:37-83`)**:
  - Verification via PowerShell:
    - Process on port 5000: PID 16568 (`python.exe`).
    - `Invoke-WebRequest -Uri 'http://localhost:5000/'` returns `StatusCode: 200 OK`.
    - Auto-port liberation logic in `free_port(5000)` prevents stale process lockouts.

---

## 2. Logic Chain

1. **Premise 1 (R3 View Location)**: Users interact with "Market & Intelligence Reports" exclusively via `#report` in `app/templates/index.html` and `app/static/js/app.js`, which renders `ReportModule` from `app/static/js/report.js`.
2. **Premise 2 (R3 Tab Placement)**: `ReportModule` in `report.js` currently renders only a single view (Live Dispatches) and already has the properties `activeReportTab: 'dispatches'` and `selectedHistoryCommodity: 'ALL'` partially declared. Placing a `.crishi-tabs` bar immediately below the header (`.crishi-header`) creates two clean top-level tabs:
   - `#tab-report-dispatches` ("Live Dispatches & Daily Archive")
   - `#tab-report-commodity-history` ("Commodity Report & Update History")
3. **Premise 3 (R3 Content Organisation)**: Inspecting reports and database updates organized by commodity requires two complementary views when a user selects a commodity (e.g., Soybeans):
   - **Market Report History**: All historical scanned market reports for that commodity (fetched via `GET /api/crishi/reports/all`), complete with frequency badges (Daily/Weekly), date stamps, sender, and 3-in-1 inspection popup trigger.
   - **Database Updates**: All table sync audit logs for that commodity (fetched via `GET /api/crishi/update-history?commodity=<name>`), displaying raw MySQL table names, final business titles, timestamps, row counts, and status.
4. **Premise 4 (R4 Invariant Safety)**:
   - All backend data queries (`GET /api/crishi/reports/all` and `GET /api/crishi/update-history`) are strictly read-only and enforce existing role-based access control (SuperAdmin sees all, Teammate sees assigned commodities/updates).
   - Neither the frontend changes in `report.js` nor the API calls alter any records in `users`, `reports`, or `db_task_catalog`.
   - Therefore, the baseline invariants (exactly 9 users, 27 reports, 158 catalog mappings) remain completely unaltered and guaranteed.
5. **Premise 5 (Verification Consistency)**: The project test suite `tests/test_crishi_history_and_scoping.py` actively asserts baseline counts before and after test execution. Maintaining read-only operations ensures this 135-test suite continues passing at 100%.

---

## 3. Caveats

- **No Caveats on Invariants**: The 9 users, 27 reports, and 158 catalog mappings are immutable baselines validated both in database storage and in the active test suite.
- **Teammate Scoping Nuance**: When a Teammate views `#tab-report-commodity-history`, the commodity selector should only list commodities within their assigned portfolio (or all commodities where they have assigned tasks), matching the scoping already enforced by the backend routes.
- **Test Suite Scope**: The primary project test suite (`tests/test_crishi_history_and_scoping.py`) passes 135/135 tests. The secondary legacy test file `tests/test_adversarial_m1_challenger1.py` contains hardcoded expectations around report counts (expecting 339 or 14 reports) which relates directly to Requirement R1 (handled by peer agents).

---

## 4. Conclusion & Recommended Architectural Fix Strategy

To implement Requirement R3 while preserving R4 invariants, execute the following surgical changes exclusively in `app/static/js/report.js`:

### 4.1 Architecture of `ReportModule` in `app/static/js/report.js`

#### Step A: Tab Navigation Bar in `render()` (`app/static/js/report.js:80-147`)
Directly below `.crishi-header` (line 98), insert the tab ribbon:
```html
<!-- Module Tabs: Dispatches vs Commodity History -->
<div class="crishi-tabs" style="margin-top: 14px; display: flex; gap: 8px;">
    <button class="crishi-tab-btn ${this.activeReportTab === 'dispatches' ? 'active' : ''}" id="tab-report-dispatches">
        <i class="fas fa-layer-group"></i> Live Dispatches & Daily Archive
    </button>
    <button class="crishi-tab-btn ${this.activeReportTab === 'commodity-history' ? 'active' : ''}" id="tab-report-commodity-history">
        <i class="fas fa-history"></i> Commodity Report & Update History
    </button>
</div>
```

#### Step B: Dual View Containers
Wrap the existing dispatches markup in:
```html
<div id="view-report-dispatches" class="${this.activeReportTab === 'dispatches' ? '' : 'hidden'}">
    <!-- Existing #report-date-hub, #report-dispatch-banner, #report-category-pills, .crishi-table-card -->
</div>
```
And add the dedicated Commodity-Basis Report History container:
```html
<div id="view-report-commodity-history" class="${this.activeReportTab === 'commodity-history' ? '' : 'hidden'}">
    <!-- Dynamically rendered via renderCommodityHistoryView() -->
</div>
```

#### Step C: UI Controls in `#view-report-commodity-history`
The commodity history view will contain:
1. **Control Bar**:
   - Commodity Selector dropdown (`#commodity-history-select`): Options for "All Commodities" + 16 authoritative commodities (`Bajra`, `Barley`, `Chilli`, `Coriander`, `Cotton`, `Cumin`, `Maize`, `Pulses`, `Rapeseed`, `Rice`, `Soybeans`, `Sugar`, `Tops`, `Turmeric`, `Weather`, `Wheat`).
   - Commodity Quick Pills (`#commodity-history-pills`): Clickable pills with report counts per commodity.
   - Frequency Selector (`#commodity-history-frequency`): `ALL`, `Daily`, `Weekly`.
   - Keyword Search (`#commodity-history-search`): Filter by report name, subject, table name, or assignee.
   - Sub-view Tab Toggle (`#subtab-comm-reports` vs `#subtab-comm-dbupdates`):
     - `[ Market Reports History (${reportCount}) ]`
     - `[ Database Table Updates (${dbUpdateCount}) ]`
   - Refresh Button (`#btn-refresh-commodity-history`).
2. **Commodity Overview Badge**:
   Displays selected commodity badge, total archive reports, total verified DB syncs, and latest activity timestamp.
3. **Dual Table Panels**:
   - **Market Reports Panel**: Table displaying Report Name, Commodity badge, Operating Date, Frequency (Daily/Weekly), Subject, Sender, Status, and "Inspect (3-in-1)" button wired to `openThreeSplitModal(r.id)`.
   - **Database Updates Panel**: Table displaying ID, Report Date, Commodity, Final Business Title, Raw MySQL Table Name, Updated By, DB Update Timestamp, Row Count, Status, and Remarks.

#### Step D: Dynamic Data Loading & State Management
- When switching to `#tab-report-commodity-history` or selecting a commodity:
  - Call `this.loadCommodityDbUpdates(this.selectedHistoryCommodity)` which queries `GET /api/crishi/update-history?commodity=${encodeURIComponent(comm)}`.
  - Filter `this.reports` for the selected commodity and frequency using `this.getFilteredCommodityReports()`.
  - Render both panels seamlessly.

#### Step E: Event Binding
In `bindStaticEvents()` or `bindTabEvents()`:
- Wire tab clicks on `#tab-report-dispatches` and `#tab-report-commodity-history` to toggle active classes and `.hidden` visibility.
- Wire `#commodity-history-select` change and `#commodity-history-pills` clicks to update `this.selectedHistoryCommodity` and reload.
- Wire `#commodity-history-search` (with 250ms debounce) and `#commodity-history-frequency` change.
- Wire inspection clicks on `.btn-inspect-history-report` to `this.openThreeSplitModal(id)`.

---

## 5. Verification Method

### 5.1 Test Suite Verification
Run the 135-test suite in the project virtual environment:
```powershell
.\.venv\Scripts\python.exe -m unittest tests/test_crishi_history_and_scoping.py
```
**Expected Result**: `Ran 135 tests ... OK` with zero failures.

### 5.2 Direct Database Invariant Check
Execute the following verification one-liner:
```powershell
.\.venv\Scripts\python.exe -c "from app import create_app; from app.models import User, Report, DBTaskCatalog; app = create_app(); ctx = app.app_context(); ctx.push(); u = User.query.count(); r = Report.query.count(); c = DBTaskCatalog.query.count(); print(f'Users={u} (expected 9), Reports={r} (expected 27), Catalogs={c} (expected 158)'); assert u == 9 and r == 27 and c == 158, 'Invariant violated!'"
```
**Expected Output**:
```
Users=9 (expected 9), Reports=27 (expected 27), Catalogs=158 (expected 158)
```

### 5.3 Application Server & Port 5000 Health Check
Verify the server responds on port 5000:
```powershell
powershell -Command "Invoke-WebRequest -Uri 'http://localhost:5000/' -UseBasicParsing | Select-Object -Property StatusCode, StatusDescription"
```
**Expected Output**: `StatusCode: 200, StatusDescription: OK`.

### 5.4 Invalidation Conditions
The solution is invalid if:
1. `User.query.count()` drifts from 9, `Report.query.count()` drifts from 27, or `DBTaskCatalog.query.count()` drifts from 158.
2. Market & Intelligence Reports (`#report`) fails to display the Commodity-Basis Report History tab.
3. Teammates can view unassigned commodity reports or unassigned table update history records.
4. The application fails to bind or run on port 5000.
