# Worker Milestone 3 Dispatch: Frontend Unified User Hierarchy & Table Mapping Studio Dynamic Integration

Read `ORIGINAL_REQUEST.md` at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\ORIGINAL_REQUEST.md`

Read `PROJECT.md` at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\orchestrator\PROJECT.md`

Read Explorer 2 Survey Report at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\explorer_survey_2\survey_report.md`

Read Explorer 3 Survey Report at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\explorer_survey_3\survey_report.md`

Working directory:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\worker_m3\`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Scope & File Ownership:
You EXCLUSIVELY own:
- `app/templates/index.html`
- `app/static/js/app.js`
- `app/static/js/admin.js`

DO NOT edit `app/models.py`, `app/__init__.py`, `app/routes/admin.py`, or any test files.

## Detailed Tasks:

### 1. Submodal Architecture (`index.html` and `app.js`):
- In `app/templates/index.html`:
  - Add `#submodal-overlay` with `#submodal-card`, `#submodal-title`, `#submodal-body`, `#submodal-footer`, and `#submodal-close`. Set styles or CSS classes ensuring it sits above `#modal-overlay` (e.g. `z-index: 600`, fixed inset, hidden by default).
- In `app/static/js/app.js`:
  - Implement `App.showSubModal(title, bodyHtml, footerHtml, sizeClass)` and `App.hideSubModal()`.
  - Ensure opening and closing a submodal does NOT close or alter `#modal-overlay` or destroy parent modal state.

### 2. Unified User & Report Hierarchy Management UI (`admin.js`):
- Update `showUserModal(user = null)`:
  - Provide a wide modal (`modal-xl` or clean multi-column card layout) implementing the full hierarchy:
    1. **User Identity**: Name, Email, Password.
    2. **Role & Department**: Role (determining panel access), Department, Active status toggle.
    3. **Reports (with internal popup mapping for timing)**:
       - Display assigned reports as clickable chips/cards with badge showing timing schedule (e.g., "Daily 09:30 AM", deadline).
       - Provide report selector/search to add reports from database reports (`/api/admin/reports`).
       - Clicking on an assigned report opens `App.showSubModal` to configure timing details: Schedule/Timing (e.g. Time picker or input like "09:30 AM"), Frequency (Daily, Weekly, Monthly), Deadline ("10:00 AM"), and Instructions. Saving the submodal updates that report's mapping in the user's form state.
    4. **Commodity (with internal popup mapping)**:
       - Display assigned commodities as clickable badges/chips with color indicators.
       - Provide commodity selector from database commodities (`/api/du/commodities` or `/api/admin/commodities`).
       - Clicking on an assigned commodity opens `App.showSubModal` to configure mapping details (e.g. data source, priority, custom notes). Saving updates that commodity's mapping in form state.
    5. **1st Backup & 2nd Backup Assignees**:
       - Dropdowns populated dynamically with active users in the system (`/api/admin/users`).
       - Allow selecting primary fallback (1st Backup) and secondary fallback (2nd Backup).
  - On save (`saveUserModal`):
    - Send payload to `POST /api/admin/users` (for new) or `PUT /api/admin/users/<email>` (for edit) with:
      `name`, `email`, `role`, `department`, `password`, `backup_1`, `backup_2`, `reports` (array of objects with `report_id`, `report_name`, `timing_schedule`, `deadline`, `frequency`), `commodities` (array or string), `commodity_mappings`.
    - Invalidate cached user lists.
    - Refresh both User table and Table Mapping Studio cache so newly added users immediately reflect everywhere!

### 3. Dynamic User and Commodity Linking in Table Mapping Studio (`admin.js`):
- In `loadTableMapping()`:
  - Retrieve active users dynamically (from `/api/admin/table-mappings` `active_users` or `api.get('/api/admin/users')`).
  - Retrieve commodities dynamically (from `/api/admin/table-mappings` `commodities` or `api.get('/api/du/commodities')`).
  - Cache them in component state (`this.activeUsers`, `this.activeCommodities`).
  - Dynamically populate `#map-filter-user` dropdown with active users, keeping "All Assignees" at the top.
  - Dynamically populate commodity filter options.
- In `openEditTableMappingModal(item = null)`:
  - REMOVE hardcoded `const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];` at line 4046.
  - Dynamically build assignee checkboxes from `this.activeUsers` (and any existing assigned user on the item).
  - REMOVE hardcoded `const harmonizedCommodities = [...]` at line 4047.
  - Dynamically build commodity checkboxes from `this.activeCommodities`.
  - Replace static fallback `'Nishant'` (lines 3986, 4003, 4075) with the first active user from the database or the item's existing assignee.
  - In the Granular Override Matrix dropdowns (`comm-cfg-user`), populate `<option>` elements dynamically from `this.activeUsers`.
- Ensure newly added users immediately appear in the assignee selection of "Edit Table Mapping" and "Add New Table Mapping" without requiring a page reload or code edit.

### 4. Verification:
- Run test runner: `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`
- Verify that all 49 tests continue to pass.
- Verify that JavaScript syntax is valid and free of errors.
- Document exact changes and verification in `handoff.md`.

## 2026-10-28T06:29:53Z
You are Worker Milestone 3: Frontend Worker.
Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\worker_m3\
Tasks:
1. In `app/templates/index.html`: Add `#submodal-overlay` with `#submodal-card` and elements (z-index 600 above modal-overlay).
2. In `app/static/js/app.js`: Implement `App.showSubModal(title, bodyHtml, footerHtml, sizeClass)` and `App.hideSubModal()` without clobbering parent modal state.
3. In `app/static/js/admin.js`:
   - Build 5-tier Hierarchical User Management UI in `showUserModal(user)`:
     1. User & Email & Password
     2. Role & Department & Active toggle
     3. Reports with timing popup (shows timing schedule chip/badge, clicking opens `App.showSubModal` to configure timing schedule, deadline, frequency)
     4. Commodities with mapping popup (shows assigned commodities, clicking opens `App.showSubModal` to configure commodity mapping details)
     5. 1st Backup and 2nd Backup assignees (dropdowns dynamically populated from active users)
   - On save: send full hierarchy payload to `POST /api/admin/users` or `PUT /api/admin/users/<email>`. Invalidate user cache and refresh Table Mapping Studio.
   - In Table Mapping Studio:
     - Replace hardcoded `authenticUsers` (line 4046) and `#map-filter-user` (line 3413) with dynamically fetched active users from database.
     - Replace hardcoded `harmonizedCommodities` (line 4047) with dynamically fetched commodities from database.
     - Replace fallback `'Nishant'` (lines 3986, 4003, 4075) with dynamic fallback.
     - Ensure newly created users immediately appear in Edit/Add Table Mapping assignee checkboxes, filters, and matrix dropdowns.
4. Verify with `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v` and check JS syntax.
5. Write handoff report to `handoff.md` in your working directory and notify with `send_message`.
