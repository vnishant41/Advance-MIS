# Comprehensive Survey Report: User Hierarchy UI & Table Mapping Architecture

**Explorer 3: User Hierarchy UI Explorer**  
**Date:** 2026-10-28  
**Working Directory:** `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`

---

## 1. Executive Summary

This investigation surveys the frontend UI architecture, user and report management interfaces, modal system, state management, and automated testing frameworks in Advance ERP. 

Our investigation identified the exact causes of the issues described in the user request:
1. **Static Hardcoding in Table Mapping Studio:** In `app/static/js/admin.js` (lines 4046 & 3415–3420), assignee users and commodities are statically defined (`const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']` and `<select id="map-filter-user">`). Newly registered users never appear in Table Mapping Studio because options are never retrieved dynamically from the active database.
2. **Fragmented User & Report Management:** Currently, Users (`loadUsers`), Reports (`loadReports`), and Commodities/Factor Tasks (`loadCommodities`) exist as independent, disconnected tabs in `admin.js`. The user creation modal only accepts a comma-separated text string for commodities, with zero association to reports, report schedules, or backup personnel.
3. **Modal Collision Constraint:** The project currently uses a single global modal container (`#modal-overlay` in `app.js`). Invoking an internal popup for report timing or commodity mapping would destroy the parent User modal unless a dedicated submodal overlay system (`App.showSubModal`) is established.
4. **Automated Testing Suite:** The project has Python 3.12 with Flask 3.1.1 and Flask-SQLAlchemy in `.venv`. Standard library `unittest` with Flask's test client (`create_app().test_client()`) executes in under 0.5s with zero external dependencies, providing a robust, fast foundation for the R4 automated verification suite.

---

## 2. Existing Codebase Architecture & UI State Management

### 2.1 SPA Architecture & Routing
- **Entry Point:** `app/templates/index.html` loads vanilla ES6 modules via `<script type="module" src="/static/js/app.js?v=3.2"></script>`.
- **Top Ribbon Navigation:** Located in `index.html` (lines 74–84). The three primary active routes are:
  - `#crishi` &rarr; Crishi Database (`app/static/js/crishi.js`)
  - `#report` &rarr; Market & Intelligence Reports browser (`app/static/js/report.js`)
  - `#admin` &rarr; Admin Panel (`app/static/js/admin.js`)
- **Router Implementation:** In `app/static/js/app.js` (lines 57–120), `handleRoute()` dynamically imports the target JS module (`import('./${moduleKey}.js')`), renders HTML into `#page-container`, and invokes `module.init()`.

### 2.2 Existing User Management UI
- **Location:** `app/static/js/admin.js` lines 550–680 (`loadUsers`, `showUserModal`, `editUser`, `deleteUser`).
- **Data Source:** Fetches `GET /admin/users` (handled in `app/routes/admin.py` lines 89–98).
- **Display Structure:**
  - Glassmorphic container with User Management count and "Add User" button.
  - Search filter input (by name or email), Role filter dropdown (`SuperAdmin`, `Manager`, `Leader`, `Teammate`), and Status filter dropdown (`Active`, `Inactive`).
  - Table columns: `Name` (with avatar initial), `Email`, `Role` (tag), `Dept` (Department), `Status` (badge), and `Actions` (Edit, Remove).
- **User Modal (`showUserModal`):**
  - Inputs: Email (readonly on edit), Name, Role (select), Department (text input, defaults to 'Research'), Password (new password on edit), Commodities (single text input: `au-commodities` comma-separated).
  - Limitations: No report selection, no timing configuration, no backup selection, no hierarchical nesting.

### 2.3 Existing Report Management UI
- **Location:** `app/static/js/admin.js` lines 681–850 (`loadReports`, `showReportModal`, `deleteReport`).
- **Data Source:** Fetches `GET /admin/reports` and `GET /admin/users`.
- **Display Structure:**
  - Table columns: `Name`, `Frequency`, `Primary Assignee`, `Backup 1st`, `Backup 2nd`, `Deadline`, `Instructions`, `Actions`.
- **Report Modal (`showReportModal`):**
  - Inputs: Report Name, Frequency (`Daily`, `Weekly`, `Fortnightly`, `Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`), Deadline (HH:MM), Schedule Day (rendered via `renderScheduleControl`), Primary Assignee (`<select>` populated from users), Backup 1st (`<select>`), Backup 2nd (`<select>`), Instructions (`<textarea>`).
- **Limitations:** Reports are managed entirely apart from users. Assigning reports to users requires editing each report one-by-one rather than managing a user's entire portfolio in one unified hierarchical view.

### 2.4 Existing Commodity / Factor Task Management UI
- **Location:** `app/static/js/admin.js` lines 1035–1150 (`loadCommodities`, `showCommodityModal`).
- **Data Source:** Fetches `GET /admin/commodities` and `GET /admin/users`.
- **Display Structure:**
  - Table columns: `Commodity`, `Task Timing`, `Schedule Day`, `Factor or Task`, `User`, `Backup 1`, `Backup 2`, `Instructions`, `Actions`.

---

## 3. Analysis of Table Mapping Studio Static Binding Bug (R1)

### 3.1 Observed Static Bindings
In `app/static/js/admin.js`:

1. **Hardcoded Assignees in Modal (Lines 4046):**
   ```javascript
   openEditTableMappingModal(item = null) {
       const isEdit = Boolean(item && item.id);
       const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
       const harmonizedCommodities = [
           'Bajra', 'Barley', 'Bengal Gram', 'Chilli', 'Coriander', 'Cotton', 'Cumin',
           'Maize', 'Masoor', 'Moong', 'Pea', 'Pulses', 'Rapeseed', 'Rice', 'Soybeans',
           'Sugar', 'Tops', 'Tur', 'Turmeric', 'Urad', 'Weather', 'Wheat', 'Macro / All'
       ];
   ```
2. **Hardcoded Filter Dropdown in Table Mapping View (Lines 3413–3421):**
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

### 3.2 Root Cause Analysis
- When an administrator creates a new user via `loadUsers()` &rarr; `showUserModal()`, the new user is saved in the database `users` table.
- However, when the administrator navigates to **Table Mapping Studio**, `loadTableMapping()` only calls `api.get('/admin/table-mappings')`. It does **not** fetch the active users from `/admin/users` or commodities from `/admin/commodities`.
- In `openEditTableMappingModal()`, the checkboxes for `Assigned Teammate(s)` are generated by iterating over the hardcoded `authenticUsers` array:
  ```javascript
  ${authenticUsers.map(u => `
      <label class="lbl-modal-user">
          <input type="checkbox" class="chk-modal-user" value="${u}" ...>
          <span>${u}</span>
      </label>
  `).join('')}
  ```
- Any newly added user in the system is completely omitted from the options.

### 3.3 Dynamic Binding Solution Blueprint
1. In `loadTableMapping(container)`:
   - Call `Promise.all([api.get('/admin/table-mappings'), api.get('/admin/users'), api.get('/admin/reports'), api.get('/admin/commodities')])`.
   - Store active user list (`this._activeUsers = (usersRes.data || []).filter(u => u.active !== false)`) and active commodities (`this._activeCommodities = ...`).
   - Dynamically render the `<select id="map-filter-user">` options using `this._activeUsers.map(u => `<option value="${u.name}">${u.name}</option>`)`.
2. In `openEditTableMappingModal(item)`:
   - Derive `authenticUsers` dynamically:
     ```javascript
     const authenticUsers = (this._activeUsers && this._activeUsers.length)
         ? this._activeUsers.map(u => u.name)
         : ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']; // fallback
     ```
   - Derive `harmonizedCommodities` dynamically from the database commodities / report commodities.
   - Now, any user created in the User Management UI immediately appears in Table Mapping Studio and in all modals without page reload or hardcoded code modifications.

---

## 4. Unified Hierarchical User Management Interface Architecture (R2)

### 4.1 Hierarchy Definition
The user request mandates the exact hierarchy:
```
User (Name, Password)
  └── Email (Unique Identifier & Auth)
        └── Role (SuperAdmin, Manager, Leader, Teammate — determining panel access)
              └── Department (Research, Tech, etc.)
                    └── Reports (Multi-assigned; each with internal timing & mapping popup)
                          └── Commodity (Multi-assigned; each with internal mapping popup)
                                └── 1st Backup & 2nd Backup (Assignees for failover)
```

### 4.2 UI Structure & Component Breakdown

```
┌────────────────────────────────────────────────────────────────────────┐
│  ADD / EDIT USER — UNIFIED HIERARCHICAL MANAGER (modal-xl)            │
├────────────────────────────────────────────────────────────────────────┤
│ [1] IDENTITY & AUTHENTICATION                                          │
│     • Full Name *           • Email Address * (unique)                 │
│     • Password (hashed)     • Active Status (Active / Inactive)        │
├────────────────────────────────────────────────────────────────────────┤
│ [2] ACCESS CONTROL & DEPARTMENT                                        │
│     • Role: [ SuperAdmin | Manager | Leader | Teammate ]               │
│       └─ Panel Access Badge: [Full Admin & Crishi DB Access]           │
│     • Department: [ Research | Analytics | Technology | Logistics ]    │
├────────────────────────────────────────────────────────────────────────┤
│ [3] ASSIGNED REPORTS PORTFOLIO                                         │
│     • Quick-Add Report Dropdown: [Select Report to Assign... ▼] [+Add] │
│     • Configured Reports Sub-Table:                                    │
│       ┌─────────────────┬──────────────┬──────────┬────────┬─────────┐ │
│       │ Report Name     │ Cadence/SLA  │ Backup 1 │Backup 2│ Actions │ │
│       ├─────────────────┼──────────────┼──────────┼────────┼─────────┤ │
│       │ Pulses Daily    │ Daily @18:00 │ Bhawna   │ Nitesh │ [⚙ Map] │ │
│       │ Pulses Weekly   │ Mon @18:00   │ Bhawna   │ Nitesh │ [⚙ Map] │ │
│       └─────────────────┴──────────────┴──────────┴────────┴─────────┘ │
│       (Clicking [⚙ Map] opens Internal Report Timing Popup)            │
├────────────────────────────────────────────────────────────────────────┤
│ [4] ASSIGNED COMMODITIES PORTFOLIO                                     │
│     • Quick-Add Commodity: [Select Commodity... ▼] [+Add]             │
│     • Configured Commodities Sub-Table:                                │
│       ┌─────────────────┬──────────────┬──────────┬────────┬─────────┐ │
│       │ Commodity       │ Task Timing  │ Backup 1 │Backup 2│ Actions │ │
│       ├─────────────────┼──────────────┼──────────┼────────┼─────────┤ │
│       │ Pulses [badge]  │ Daily        │ Bhawna   │ Gopi   │ [⚙ Map] │ │
│       │ Tops   [badge]  │ Daily        │ Bhawna   │ —      │ [⚙ Map] │ │
│       └─────────────────┴──────────────┴──────────┴────────┴─────────┘ │
│       (Clicking [⚙ Map] opens Internal Commodity Mapping Popup)        │
├────────────────────────────────────────────────────────────────────────┤
│ [5] DEFAULT FALLBACK BACKUPS                                           │
│     • 1st Backup Assignee: [ Select User ▼ ] (e.g. Bhawna)             │
│     • 2nd Backup Assignee: [ Select User ▼ ] (e.g. Nitesh)             │
│     (Used as default fallback if not individually overridden)          │
├────────────────────────────────────────────────────────────────────────┤
│ [Cancel]                                                 [Save User]   │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Internal Popup Architecture (Submodal System)

To satisfy acceptance criteria without losing state in the parent User modal, we introduce a nested submodal overlay:

```
┌──────────────────────────────────────────────────────────────────┐
│ DOM Root                                                         │
│  ├── #modal-overlay (z-index: 500)                               │
│  │     └── #modal-card.glass-card (Parent User Modal)            │
│  │                                                               │
│  └── #submodal-overlay (z-index: 600, hidden by default)         │
│        └── #submodal-card.glass-card (Internal Mapping Popup)    │
│              ├── Submodal Title                                  │
│              ├── Submodal Body (Timing / Mapping Controls)       │
│              └── Submodal Footer ([Cancel] [Apply Mapping])      │
└──────────────────────────────────────────────────────────────────┘
```

#### Report Timing Internal Popup:
When the user clicks `[⚙ Map]` on a report:
- **Title:** `Configure Report Mapping: <Report Name>`
- **Fields:**
  1. **Frequency:** Select (`Daily`, `Weekly`, `Fortnightly`, `Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`).
  2. **Schedule Day:** Dynamic selector based on frequency (`Monday`..`Sunday`, day `1`..`31`, or yearly date `MM-DD`) reusing the existing `renderScheduleControl()`.
  3. **Deadline SLA:** Cutoff time text input (e.g. `18:00`).
  4. **Backup Assignees:**
     - 1st Backup: Dropdown of all users in the system (defaults to user's 1st backup).
     - 2nd Backup: Dropdown of all users in the system (defaults to user's 2nd backup).
  5. **Instructions:** Rich/plain textarea for operational instructions (shown on Today/Tasks).
- **Behavior on "Apply":** Updates the in-memory report mapping configuration for this user, closes `#submodal-overlay`, and updates the report row badges in the parent modal.

#### Commodity Mapping Internal Popup:
When the user clicks `[⚙ Map]` on a commodity:
- **Title:** `Configure Commodity Mapping: <Commodity Name>`
- **Fields:**
  1. **Task Timing:** Select (`Daily`, `Weekly`, `Monthly`, `Cycle Window`, `Yearly`, `Occasionally`).
  2. **Schedule Day:** Cadence control (e.g. Day of month, ISO Day).
  3. **Factor / Task Description:** e.g., `Spot Mandi Price`, `Arrivals Surveillance`, `Production Estimates`.
  4. **Data Source:** Source name or URL.
  5. **Backup Assignees:**
     - 1st Backup: Dropdown of all users.
     - 2nd Backup: Dropdown of all users.
  6. **Instructions:** Operational notes.
- **Behavior on "Apply":** Saves commodity mapping configuration to user's state, closes `#submodal-overlay`, and refreshes the commodity list in the parent modal.

---

## 5. Modal / Popup System & UI Styling Survey

### 5.1 Existing Modal Implementation (`app.js` & `main.css`)
- In `app/templates/index.html`:
  ```html
  <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal-card glass-card" id="modal-card">
          <div class="modal-header">
              <h3 id="modal-title">Modal</h3>
              <button class="btn-icon modal-close" id="modal-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
      </div>
  </div>
  ```
- Sizing classes in `main.css`:
  - Default `.modal-card`: `width: 560px; max-width: 90vw; max-height: 85vh;`
  - `.modal-lg`: `width: 900px; max-width: 95vw; max-height: 90vh;`
  - `.modal-xl`: `width: 1100px; max-width: 96vw; max-height: 92vh;`
  - `.modal-wide`: `width: 96vw; max-width: 1520px; max-height: 94vh;`
- Styling attributes:
  - Glass card: `backdrop-filter: blur(16px); background: var(--bg-card); border: 1px solid var(--glass-border);`
  - Theme support: Dark theme default (`data-theme="dark"`), Light theme override (`data-theme="light"`).
  - Colors: CSS variables `--accent: #3b82f6`, `--success: #10b981`, `--warning: #f59e0b`, `--danger: #ef4444`.

### 5.2 Submodal Extension Design
In `app/static/js/app.js`, add:
```javascript
App.showSubModal(title, bodyHtml, footerHtml, sizeClass = '')
App.closeSubModal()
```
And in `app/templates/index.html` (or created dynamically on first call):
```html
<div id="submodal-overlay" class="submodal-overlay hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px); z-index:600; display:flex; align-items:center; justify-content:center;">
    <div class="modal-card glass-card" id="submodal-card" style="width:620px; max-width:92vw; max-height:88vh; box-shadow: 0 25px 70px rgba(0,0,0,0.6);">
        <div class="modal-header">
            <h3 id="submodal-title">Mapping Configuration</h3>
            <button class="btn-icon" id="submodal-close"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" id="submodal-body"></div>
        <div class="modal-footer" id="submodal-footer"></div>
    </div>
</div>
```
This isolates the internal popup completely from `#modal-overlay`, allowing safe nesting without state destruction.

---

## 6. Survey of Test Framework Setup & R4 Verification Suite

### 6.1 Testing Environment Survey
- **Python Version:** Python 3.12.9 in `.venv`.
- **Framework Availability:** Python's built-in `unittest` runner is pre-installed and requires no extra dependencies.
- **Execution Speed:** Executing Flask `test_client()` requests in `unittest` takes **< 0.5 seconds**.
- **Pytest:** Currently not installed in `.venv`. We will provide a native Python test runner (`tests/test_hierarchy_and_studio.py`) executable via `python -m unittest tests/test_hierarchy_and_studio.py` which works instantly without requiring external pip packages.

### 6.2 Proposed Test Suite Structure for R4
Create `tests/test_hierarchy_and_studio.py` containing:

1. **Test Case 1: Dynamic User Discovery in Table Mapping Studio**
   - Create a new active user (e.g. `test_analyst@agalabs.com`, Name: `AnalystTest`) via `/admin/users` POST.
   - Query `/admin/users` & `/admin/table-mappings`.
   - Assert `AnalystTest` is returned in the active assignees list.
   - Assert `DBTaskCatalog` endpoint allows assignment of `AnalystTest` without errors.

2. **Test Case 2: Full Hierarchy Persistence (User > Email > Role > Dept > Reports > Commodities > Backups)**
   - Create a user with:
     - Name: `Pooja Sharma`
     - Email: `pooja@agalabs.com`
     - Role: `Teammate`
     - Department: `Research`
     - Assigned Reports: `['Bajra Weekly', 'Maize Daily']` with customized schedule/deadline.
     - Assigned Commodities: `['Bajra', 'Maize']` with customized factor/task timing.
     - 1st Backup: `Nitesh`, 2nd Backup: `Pankaj`.
   - Verify persistence in database.
   - Retrieve user via `GET /admin/users` and verify all assigned reports, commodities, timing configurations, and backup assignees match.

3. **Test Case 3: Table Mapping Studio Dynamic Popups & Options Assertion**
   - Query table mappings with the newly created user and commodities.
   - Verify that endpoints feeding the UI modals return the new user as an active option.

4. **Test Case 4: Data Preservation Assertion**
   - Verify that all pre-existing 9 users, 27 reports, and 156 table mappings remain intact with no orphaned foreign keys or nullified records.

---

## 7. Concrete Implementation Recommendations for Plan & Execution

| Component | Target File | Action Required |
|-----------|-------------|-----------------|
| **Submodal System** | `app/static/js/app.js` & `main.css` | Add `App.showSubModal()`, `App.closeSubModal()`, and `#submodal-overlay` styling (`z-index: 600`). |
| **Table Mapping Studio Dynamic Users** | `app/static/js/admin.js` | In `loadTableMapping()`: fetch `/admin/users` dynamically and populate `<select id="map-filter-user">`. In `openEditTableMappingModal()`: derive `authenticUsers` from `this._activeUsers`. |
| **Unified User Hierarchy Modal** | `app/static/js/admin.js` | Replace flat `showUserModal()` with the 5-tier hierarchical modal supporting multi-report & commodity portfolios with `[⚙ Map]` buttons. |
| **Internal Popups** | `app/static/js/admin.js` | Implement `showReportTimingPopup(report)` and `showCommodityMappingPopup(comm)` rendering into `App.showSubModal()`. |
| **Backend API Extensions** | `app/routes/admin.py` | Ensure `/admin/users` POST and PUT endpoints accept, store, and return the full hierarchy (reports, commodities, timing overrides, and 1st/2nd backups). |
| **Automated Verification Suite** | `tests/test_hierarchy_and_studio.py` | Write comprehensive `unittest` test suite covering R1, R2, R3, and R4. |

---
**Report generated by Explorer 3 (User Hierarchy UI Explorer)**  
*Ready for synthesis and implementation planning.*
