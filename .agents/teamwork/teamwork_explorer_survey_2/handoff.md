# Handoff Report: Frontend Source of Truth Survey for Crishi Role Scoping & Update History

## 1. Observation

### 1.1 Template Architecture & Navigation (`app/templates/index.html`)
- **App Shell & View Injection**:
  - `app/templates/index.html` (lines 58-121) defines the SPA shell with `.main-content` and `<div class="page-container" id="page-container">` (line 114).
  - Submodules (`crishi`, `report`, `admin`) are dynamically imported and rendered into `#page-container` by `app/static/js/app.js` (`handleRoute()`, lines 114-118):
    ```javascript
    const mod = await import(`./${moduleKey}.js?v=${Date.now()}`);
    this.modules[moduleKey] = mod.default;
    const container = document.getElementById('page-container');
    container.innerHTML = await this.modules[moduleKey].render();
    if (this.modules[moduleKey].init) await this.modules[moduleKey].init();
    ```
- **Top Ribbon Navigation**:
  - `index.html` lines 74-84: `#topbar-nav` contains top-level module links `#nav-crishi` (`href="#crishi"`), `#nav-report` (`href="#report"`), and `#nav-admin` (`href="#admin"`).
  - `#tab-history` and `#view-history` do not exist in `index.html`. They belong inside `app/static/js/crishi.js` under the inner subtab navigation (`.crishi-tabs` and `.crishi-view`).
- **User Profile & State in DOM**:
  - `index.html` lines 102-109:
    ```html
    <button class="topbar-profile-chip" id="btn-profile" title="User Profile & Security">
        <div class="user-avatar" id="user-avatar">V</div>
        <div class="topbar-user-meta">
            <span class="user-name" id="user-name">Vaibhav</span>
            <span class="user-role-badge" id="user-role">SuperAdmin</span>
        </div>
        <i class="fas fa-chevron-down topbar-chevron"></i>
    </button>
    ```

### 1.2 Authentication & User Role State
- **Storage**:
  - `app/static/js/api.js` lines 6-16: JWT token stored under key `erp_token` in `localStorage`:
    - `api.getToken()` -> `localStorage.getItem('erp_token')`
    - `api.setToken(token)` -> `localStorage.setItem('erp_token', token)`
    - `api.clearToken()` -> `localStorage.removeItem('erp_token')`
  - Automatic `Authorization: Bearer <token>` header attached to all requests by `api.request()` (line 21).
  - Root path prepends `/api` automatically (`fetch('/api' + endpoint)` line 33).
- **Session & User Profile**:
  - `app/static/js/auth.js` lines 93-97:
    ```javascript
    setupUser(user, modules = {}) {
        this.user = user;
        this.modules = modules;
        window.currentUser = user;
        window.enabledModules = modules;
        ...
    }
    ```
  - `window.currentUser` exposes `{ id, name, email, role, department }`.
- **Role Hierarchy & Definition**:
  - `app/auth.py` defines `ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}` and `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}`.
  - In existing frontend modules (`tasks.js`, `analytics.js`, `admin.js`):
    - Admin roles check: `['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role)`
    - Teammate check: `!['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role)` or `window.currentUser?.role === 'Teammate'`
  - Existing gap in `crishi.js`: Lines 5282 and 5469 currently only check `['SuperAdmin', 'Manager', 'Admin'].includes(loggedInRole)` (omitting `Leader`), and `renderTeammateChips()` has no role checking at all.

### 1.3 Crishi Module Structure & Tabs (`app/static/js/crishi.js`)
- **Module State**:
  - `CrishiModule` (line 83) currently declares:
    ```javascript
    activeTab: 'surveillance', // 'surveillance' | 'roster'
    surveillanceViewMode: 'table', // 'table' | 'commodity' | 'date'
    activeUserFilter: 'ALL',
    activeStatusFilter: 'ALL',
    activeSearchQuery: '',
    activeCommodityFilter: '',
    activeFrequencyFilter: '',
    ```
- **Tabs in `render()`**:
  - `crishi.js` lines 173-180 define `.crishi-tabs`:
    ```html
    <div class="crishi-tabs">
        <button class="crishi-tab-btn ${this.activeTab === 'surveillance' ? 'active' : ''}" id="tab-surveillance">
            <i class="fas fa-shield-alt"></i> Live DB Surveillance
        </button>
        <button class="crishi-tab-btn ${this.activeTab === 'roster' ? 'active' : ''}" id="tab-roster">
            <i class="fas fa-calendar-alt"></i> Weekly Roster & Rake Movement
        </button>
    </div>
    ```
  - View containers:
    - Line 196: `<div id="view-surveillance" class="${this.activeTab === 'surveillance' ? '' : 'hidden'}">`
    - Line 544: `<div id="view-roster" class="${this.activeTab === 'roster' ? '' : 'hidden'}">`
  - There is currently **no** `#tab-history` and **no** `#view-history`.
- **Event Listeners for Tabs**:
  - `crishi.js` lines 975-991: Tab click handlers directly manipulate class lists on `#view-surveillance`, `#view-roster`, `#tab-surveillance`, and `#tab-roster`.

### 1.4 Teammate Portfolio Chips (`app/static/js/crishi.js`)
- **Containers**:
  - Line 339: `#teammate-chips-container` in Table Basis Update panel (`#surveillance-table-panel`)
  - Line 4472: `#date-teammate-chips-container` in Date-Wise panel (`#surveillance-date-panel`)
- **Rendering Logic**:
  - `renderTeammateChips()` lines 928-972:
    ```javascript
    renderTeammateChips() {
        const containers = [
            document.getElementById('teammate-chips-container'),
            document.getElementById('date-teammate-chips-container')
        ].filter(Boolean);
        if (containers.length === 0) return;

        const tm = this.summary.teammates || {};
        const priorityUsers = this.getActiveUsersSync();

        let html = `
            <button class="user-chip-btn ${this.activeUserFilter === 'ALL' ? 'active' : ''}" data-user="ALL">
                <span>All Teammates</span>
                <span class="badge" style="background: rgba(255,255,255,0.15); font-size: .72rem;">${this.tasks.length}</span>
            </button>
        `;

        priorityUsers.forEach(u => {
            const st = tm[u];
            if (!st) return;
            const isActive = this.activeUserFilter === u;
            html += `
                <button class="user-chip-btn ${isActive ? 'active' : ''}" data-user="${u}">
                    <span>${u}</span>
                    <span class="badge" style="background: ${isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}; font-size: .72rem;">
                        ${st.updated}/${st.total} (${st.pct}%)
                    </span>
                    ${st.windows > 0 ? `<span style="color: #0ea5e9; font-size: .7rem;" title="Has active 15th-20th cycle window"><i class="fas fa-calendar-alt"></i></span>` : ''}
                </button>
            `;
        });
        ...
    ```
- **Click Handling**:
  - Lines 962-970:
    ```javascript
    container.querySelectorAll('.user-chip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.user-chip-btn');
            if (!targetBtn) return;
            this.activeUserFilter = targetBtn.dataset.user;
            this.renderTeammateChips();
            this.applyFilters();
        });
    });
    ```
- **Current Defect / Leak**:
  - The "All Teammates" button is prepended unconditionally regardless of role.
  - If a Teammate logs in, `this.activeUserFilter` is `'ALL'` by default, and if `this.summary.teammates` is scoped to 1 key, `getActiveUsersSync()` still returns all users, meaning chip visibility is not role-gated in the UI.

### 1.5 Mutating Admin Action Controls in Crishi
- Table Row Actions (`getActionButtonsHtml(t)`, lines 4044-4069):
  - `.btn-manager-review` ("Action", calls `/api/crishi/manager-review`)
  - `.btn-quick-sync-db` ("Verify", calls `openSyncReportModal()`)
  - `.btn-action-pull` ("Pull", calls `/api/crishi/pull`)
  - `.btn-action-skip` ("Skip", calls `/api/crishi/skip`)
  - Currently rendered for all users; when Teammate clicks them, backend returns 403 Forbidden.
- Roster Tab Admin Actions (lines 566-595):
  - `#btn-random-assign-duties`, `#btn-add-roster-duty`, `#btn-manage-roster-people`, `#btn-save-roster-direct`, `#btn-apply-scrapper-week`.

### 1.6 Verification Test Assertions (`tests/test_crishi_history_and_scoping.py`)
- `test_t1_f10_01_update_history_tab_defined_in_crishi_ui` (lines 794-802):
  ```python
  crishi_js = self.get_crishi_js_content()
  index_html = self.get_index_html_content()
  combined = crishi_js + index_html
  self.assertTrue(
      'tab-history' in combined or 'view-history' in combined or 'Update History' in combined,
      "Crishi UI must declare 'Update History' tab element"
  )
  ```
- `test_t1_f11_01_crishi_js_binds_portfolio_chip_to_history_navigation` (lines 847-853):
  Requires `'renderTeammateChips' in crishi_js`.
- `test_t1_f11_04_chip_click_activates_history_tab_view` (lines 873-879):
  Requires `'activeUserFilter' in crishi_js or 'history' in crishi_js`.
- `test_t2_b11_01_chip_click_with_null_dataset` (lines 1299-1302):
  Requires `'dataset' in crishi_js or 'getAttribute' in crishi_js or 'user-chip-btn' in crishi_js`.

---

## 2. Logic Chain

1. **Role Identification**:
   - `auth.js` line 96 stores the authenticated user profile in `window.currentUser`.
   - Admin roles are `{'SuperAdmin', 'Manager', 'Leader'}` (and optional `'Admin'`).
   - A helper `isAdminRole()` (`['SuperAdmin', 'Manager', 'Leader', 'Admin'].includes(window.currentUser?.role)`) unambiguously separates Admins from Teammates.

2. **Teammate Chip Visibility Scoping**:
   - In `renderTeammateChips()`:
     - When `isAdminRole()` is true:
       - Render "All Teammates" chip (`data-user="ALL"`).
       - Render chips for all active teammates present in `this.summary.teammates` (Bhawna, Gopi, Nitesh, Pankaj, Nishant). Exclude deactivated users like Damini.
     - When `isAdminRole()` is false (`isTeammate`):
       - Omit "All Teammates" chip entirely.
       - Render **only** the chip matching the logged-in teammate's name (`window.currentUser?.name` or the single key in `this.summary.teammates`).
       - If `this.activeUserFilter === 'ALL'` or not matching the user's name, lock `this.activeUserFilter` to the teammate's name.
       - Update hint `#user-workload-hint` to indicate personal portfolio scope.

3. **Update History Tab Integration**:
   - Add button to `.crishi-tabs` (line 173):
     `<button class="crishi-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" id="tab-history"><i class="fas fa-history"></i> Update History</button>`
   - Add container `#view-history` right after `#view-roster` (line 815):
     `<div id="view-history" class="${this.activeTab === 'history' ? '' : 'hidden'}">...</div>`
   - Inside `#view-history`, include:
     1. Teammate chips row with container `#history-teammate-chips-container` (linked in `renderTeammateChips()`).
     2. Filter bar: `#history-search`, `#history-filter-commodity`, `#history-filter-date-from`, `#history-filter-date-to`, `#history-filter-status`, `#btn-refresh-history`.
     3. Responsive table `#history-master-table` with `#history-tbody` and `#history-records-count`.

4. **Interactive Chip Linking & History Data Fetching**:
   - When a teammate chip is clicked:
     - Sets `this.activeUserFilter = targetBtn.dataset.user`.
     - Re-renders chips via `renderTeammateChips()`.
     - Calls `this.applyFilters()`.
     - If `this.activeTab === 'history'`, triggers `this.loadUpdateHistory()`.
   - In `loadUpdateHistory()`:
     - For Admins: query param `?teammate=${this.activeUserFilter}` is passed if not `'ALL'`.
     - For Teammates: query param is defaulted to `window.currentUser?.name` (the backend enforces this server-side regardless).
     - Passes additional filters (`commodity`, `date_from`, `date_to`, `status`, `search`).
     - Calls `api.get('/crishi/update-history?' + params.toString())`.
     - Parses `res.history || res.records || []` and renders into `#history-tbody`.

5. **Tab Switching Unification**:
   - Implement `switchTab(tabName)` handling `'surveillance'`, `'roster'`, and `'history'`:
     - Sets `this.activeTab = tabName`.
     - Toggles `.active` on `#tab-surveillance`, `#tab-roster`, `#tab-history`.
     - Toggles `.hidden` on `#view-surveillance`, `#view-roster`, `#view-history`.
     - When switching to `'history'`, invokes `this.loadUpdateHistory()`.
     - When switching to `'roster'`, invokes `this.loadWeatherRotation()`.

---

## 3. Caveats

1. **Backend Dependency**:
   - The frontend calls `GET /api/crishi/update-history`, which is currently returning HTTP 404 (awaiting Milestone 2 implementation). The UI code should gracefully display an informative empty/loading state if the endpoint is not yet reachable.
2. **Deactivated Users**:
   - Test `test_t2_b04_01` specifically checks that deactivated user 'Damini' is excluded from teammate chips. The backend already filters active users in `summary['teammates']`. The frontend must strictly use `this.summary.teammates` keys rather than any static fallback list to guarantee Damini is never rendered.
3. **Report Scoping in `report.js`**:
   - `report.js` dynamically generates commodity category pills from the items returned by `api.get('/crishi/reports/all')`. Once Milestone 1 backend scopes `/api/crishi/reports/all` for Teammates, `report.js` will automatically reflect the correct commodity pills with no changes required.

---

## 4. Conclusion

The authoritative frontend architecture is clean, modular, and centered on `app/static/js/crishi.js` and `app/templates/index.html`.
To fulfill R1, R2, and R3:
1. **Teammate Chip Visibility**: Update `renderTeammateChips()` in `crishi.js` to inspect `window.currentUser?.role`. For Teammates (`!isAdmin`), hide the "All Teammates" chip and render only their own chip.
2. **Dedicated Update History Tab**: Add `#tab-history` and `#view-history` to `crishi.js` (and optionally reference in `index.html`).
3. **Interactive Chip History Linking**: In `#view-history`, include `#history-teammate-chips-container` so chip clicks update `this.activeUserFilter` and reload `/api/crishi/update-history` for Admins, while keeping own history for Teammates.
4. **Action Button Role Gating**: In `getActionButtonsHtml()`, hide manager review, pull, and skip buttons for Teammate users to match the backend `@admin_required` enforcement.

---

## 5. Verification Method

### 5.1 Verification Commands
To verify the test suite directly against the codebase:
```powershell
.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping.BaseCrishiHistoryTestCase.test_t1_f10_01_update_history_tab_defined_in_crishi_ui
.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping.BaseCrishiHistoryTestCase.test_t1_f11_01_crishi_js_binds_portfolio_chip_to_history_navigation
.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping.BaseCrishiHistoryTestCase.test_t1_f11_04_chip_click_activates_history_tab_view
.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping.BaseCrishiHistoryTestCase.test_t2_b11_01_chip_click_with_null_dataset
```

### 5.2 Files to Inspect
1. `app/templates/index.html` (lines 74-85, 102-109, 114)
2. `app/static/js/crishi.js` (lines 83-100, 173-195, 339, 928-972, 975-992, 4044-4070)
3. `app/static/js/auth.js` (lines 93-97)
4. `app/static/js/api.js` (lines 6-35)
5. `tests/test_crishi_history_and_scoping.py` (lines 794-886, 1299-1328)

### 5.3 Invalidation Conditions
- If the test suite requires `#tab-history` to be located in `index.html` rather than `crishi.js`: Test `test_t1_f10_01` concatenates `crishi_js + index_html`, so defining it in `crishi.js` (or both) succeeds.
- If additional roles are added beyond `SuperAdmin`, `Manager`, `Leader`, ensure `isAdminRole()` checks `ADMIN_ROLES` or `ROLE_LEVEL`.
