# Table Mapping Studio Dynamic Integration — Survey Report

**Explorer:** Explorer 2 (Table Mapping Explorer)  
**Target Module:** Table Mapping Studio (Frontend & Backend Integration)  
**Date:** 2026-10-28  
**Working Directory:** `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\explorer_survey_2\`

---

## Executive Summary

The Table Mapping Studio is the central control center in Advance MIS where raw MySQL database tables from `agalabsdev_stage` are registered, named with human-friendly business titles, and linked to Research Owners (Assignees), Cadences (Daily, Weekly, Monthly, etc.), Date Columns, Cutoff SLA times, and Harmonized Commodities.

**Core Findings**:
1. **Assignees are static and hardcoded**:
   - The assignee filter dropdown (`#map-filter-user`) in `app/static/js/admin.js` (lines 3413–3421) hardcodes five users: `Nishant`, `Bhawna`, `Pankaj`, `Nitesh`, `Gopi`.
   - The modal function `openEditTableMappingModal` in `app/static/js/admin.js` (line 4046) hardcodes:  
     `const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];`
   - Default fallbacks hardcode `'Nishant'` (lines 3986, 4003, 4075).
   - The live database `users` table currently has **9 active/inactive users** (`Nishant`, `Ram Gopal`, `Gopi`, `Nitesh`, `Pankaj`, `Damini`, `Bhawna`, `Balram`, `Vaibhav`). Users like `Ram Gopal`, `Vaibhav`, `Balram`, or any newly created user through User Management **never appear** in Table Mapping Studio.
2. **Commodities are static and hardcoded**:
   - `openEditTableMappingModal` hardcodes 23 commodities in `const harmonizedCommodities = [...]` (lines 4047–4071) and 22 entries in `COMMODITY_COLORS` (lines 4083–4106).
   - In the database, `CommodityConfig` contains 784 rows across 22 distinct commodities, and `Report` contains 27 canonical market reports across 15 commodity groups. Newly configured commodities in the database do not appear in the Table Mapping Studio.
3. **Data Flow Disconnect**:
   - While other admin tabs (such as Reports, Commodities, and Tasks) call `api.get('/admin/users')` in parallel via `Promise.all`, `loadTableMapping` in `admin.js` (line 3322) *only* calls `api.get('/admin/table-mappings')`. It never queries users, commodities, or reports.
4. **Clean Integration Path**:
   - Connect `loadTableMapping` and `openEditTableMappingModal` to fetch `/admin/users` and `/admin/commodities` (or a dedicated meta endpoint).
   - Populate filter dropdowns, assignee checkboxes, and the Granular Override Matrix dynamically.
   - Wire user creation/update in User Management to invalidate user cache and ensure instant propagation to Table Mapping Studio.

---

## 1. Architectural Code Mapping

### 1.1 Frontend Files & Components (`app/static/js/admin.js`)

| Component / Function | File & Lines | Purpose & Current Behavior |
| :--- | :--- | :--- |
| **Tab Definition** | `app/static/js/admin.js:10` | Menu entry `{ key: 'table-mapping', label: 'Table Mapping', icon: 'database' }`. |
| **Tab Quick-Links** | `app/static/js/admin.js:27` | `'table-mapping': ['tasks', 'reports', 'commodities', 'users']`. |
| **Router Dispatch** | `app/static/js/admin.js:220` | `else if (t === 'table-mapping') await this.loadTableMapping(container);`. |
| **`loadTableMapping`** | `app/static/js/admin.js:3320–3675` | Renders header, quick stats pills, search input, cadence/status filters, and the hardcoded `#map-filter-user`. Sets up sorting and table mapping listeners. |
| **`renderTableMappingRows`** | `app/static/js/admin.js:3677–3816` | Renders `<tbody>` rows, user avatar chips (`u.charAt(0)`), status badges, and action buttons (`.btn-edit-mapping`, `.btn-delete-mapping`). |
| **`openFetchDbTablesModal`** | `app/static/js/admin.js:3818–4042` | Calls `GET /admin/fetch-db-tables`. Discovers tables in `agalabsdev_stage`. "Map Table" and "Edit Mapping" buttons invoke `openEditTableMappingModal`. |
| **`openEditTableMappingModal`** | `app/static/js/admin.js:4044–4644` | Handles both "Add New Table Mapping" and "Edit Table Mapping: {rawTable}". Contains hardcoded `authenticUsers` (line 4046) and `harmonizedCommodities` (line 4047). Inspects table schema via `/admin/table-schema/<rawTable>`. Renders the Per-Commodity Specific Timing matrix. Submits via POST/PUT to `/admin/table-mappings`. |

### 1.2 Backend Files & Endpoints (`app/routes/admin.py` & `app/models.py`)

| Endpoint / Model | File & Lines | Purpose & Current Behavior |
| :--- | :--- | :--- |
| **`DBTaskCatalog` (Model)** | `app/models.py:728–775` | Master registry table `db_task_catalog`. Columns: `id`, `user_name`, `commodity`, `raw_table_name`, `final_name`, `frequency`, `date_column`, `target_cutoff_time`, `source_name`, `source_url`, `commodity_config`, `is_active`, `created_at`. `to_dict()` provides snake_case and camelCase aliases. |
| **`GET /admin/table-mappings`** | `app/routes/admin.py:1141–1167` | Returns all mappings. Accepts query filters: `user`, `commodity`, `frequency`, `q`. |
| **`POST /admin/table-mappings`** | `app/routes/admin.py:1170–1251` | Validates `raw_table`, `user_name`, `final_name`. Cleans commodities with `COMMODITY_NORM_MAP`. Checks duplicate `(raw_table_name, commodity, user_name)`. Saves record. Invalidates `_SURVEILLANCE_CACHE['timestamp']`. |
| **`PUT /admin/table-mappings/<id>`** | `app/routes/admin.py:1253–1325` | Updates existing record fields. Invalidates `_SURVEILLANCE_CACHE['timestamp']`. |
| **`DELETE /admin/table-mappings/<id>`** | `app/routes/admin.py:1327–1345` | Deletes mapping. Invalidates `_SURVEILLANCE_CACHE['timestamp']`. |
| **`GET /admin/fetch-db-tables`** | `app/routes/admin.py:1405–1510` | Auto-discovers tables from MySQL live connection or snapshot CSVs. Matches mapped tables in `DBTaskCatalog`. |
| **`GET /admin/table-schema/<table_name>`** | `app/routes/admin.py:1347–1403` | Executes `DESCRIBE \`table_name\`` or parses CSV header to return column names, types, and date detection flags. |
| **`GET /admin/users`** | `app/routes/admin.py:89–98` | Returns active and inactive users from `users` table. Accessible to Managers and SuperAdmins. |
| **`GET /admin/commodities`** | `app/routes/admin.py:299–304` | Returns all `CommodityConfig` records. |
| **`GET /du/commodities`** | `app/routes/data_update.py:131–150` | Returns distinct sorted commodity list `['Bajra', 'Barley', 'Bengal Gram', ... 'Wheat']`. |

---

## 2. Hardcoded Assignees and Commodities Audit

### 2.1 Hardcoded Assignee Locations

1. **Assignee Filter Dropdown in Table Mapping Studio**  
   *File:* `app/static/js/admin.js:3413–3421`  
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

2. **Modal Assignees Array in `openEditTableMappingModal`**  
   *File:* `app/static/js/admin.js:4046`  
   ```javascript
   const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
   ```

3. **Fallback Defaults**  
   *File:* `app/static/js/admin.js:3986`: `assigned_user: targetTbl.mapped_info?.assigned_user || targetTbl.mappedUser || 'Nishant'`  
   *File:* `app/static/js/admin.js:4003`: `assigned_user: 'Nishant'`  
   *File:* `app/static/js/admin.js:4075`: `const user = item ? item.assigned_user : 'Nishant';`

4. **Assigned Teammate Checkboxes Generation**  
   *File:* `app/static/js/admin.js:4218–4224`  
   ```html
   ${authenticUsers.map(u => `
       <label style="..." class="lbl-modal-user">
           <input type="checkbox" class="chk-modal-user" value="${u}" ${user.includes(u) ? 'checked' : ''}>
           <span style="font-weight: 700;">${u}</span>
       </label>
   `).join('')}
   ```

5. **Granular Override Matrix Assignee Dropdown**  
   *File:* `app/static/js/admin.js:4451–4454`  
   ```html
   <select class="comm-cfg-user" data-comm="${cName}">
       <option value="" ${!chosenUser ? 'selected' : ''}>Inherit Assignee (${currentDefaultUser.split(',')[0] || 'Default'})</option>
       ${authenticUsers.map(u => `
           <option value="${u}" ${chosenUser === u ? 'selected' : ''}>${u}</option>
       `).join('')}
   </select>
   ```

### 2.2 Hardcoded Commodity Locations

1. **Harmonized Commodities Array in `openEditTableMappingModal`**  
   *File:* `app/static/js/admin.js:4047–4071`  
   ```javascript
   const harmonizedCommodities = [
       'Bajra', 'Barley', 'Bengal Gram', 'Chilli', 'Coriander', 'Cotton',
       'Cumin', 'Maize', 'Masoor', 'Moong', 'Pea', 'Pulses', 'Rapeseed',
       'Rice', 'Soybeans', 'Sugar', 'Tops', 'Tur', 'Turmeric', 'Urad',
       'Weather', 'Wheat', 'Macro / All'
   ];
   ```

2. **Commodity Color Theme Mapping**  
   *File:* `app/static/js/admin.js:4083–4106`  
   Fixed 22 entries in `COMMODITY_COLORS`. Any commodity not in this map falls back to line 4421 default blue.

3. **Backend Commodity Normalization Map**  
   *File:* `app/services/surveillance.py:27–58`  
   Dictionary mapping variants to canonical commodity names (e.g. `'chana': 'Bengal Gram'`).

---

## 3. Data Flow Analysis

### 3.1 Current Data Flow
```
[User clicks Table Mapping Tab]
   │
   ▼
loadTableMapping(container)
   │
   ├──> api.get('/admin/table-mappings') ────> DBTaskCatalog.query.all()
   │
   ├──> Renders HTML with HARDCODED #map-filter-user ('Nishant', 'Bhawna', ...)
   │
   └──> User clicks "Add New Table Mapping" / "Edit"
          │
          ▼
        openEditTableMappingModal(item)
          │
          ├──> Reads hardcoded authenticUsers = ['Nishant', 'Bhawna', ...]
          ├──> Reads hardcoded harmonizedCommodities = ['Bajra', 'Barley', ...]
          ├──> Checks DB schema: api.get('/admin/table-schema/<rawTable>')
          └──> User saves mapping ───> api.post/put('/admin/table-mappings')
```

### 3.2 Target Dynamic Data Flow
```
[User clicks Table Mapping Tab]
   │
   ▼
loadTableMapping(container)
   │
   ├──> Promise.all([
   │      api.get('/admin/table-mappings'),
   │      api.get('/admin/users'),               <── Fetch DB users dynamically
   │      api.get('/du/commodities')             <── Fetch DB commodities dynamically
   │    ])
   │
   ├──> Store this._adminUsers and this._adminCommodities in AdminModule cache
   │
   ├──> Dynamically populate #map-filter-user with all active database users
   │
   └──> User clicks "Add New Table Mapping" / "Edit"
          │
          ▼
        openEditTableMappingModal(item)
          │
          ├──> Uses dynamic this._adminUsers (or fresh api.get('/admin/users'))
          ├──> Teammate checkboxes generated from active DB users
          ├──> Harmonized Commodity checkboxes generated from DB commodities
          ├──> Granular Override Matrix assignee dropdowns generated from active DB users
          ├──> Dynamic HSL color generator for any arbitrary configured commodity
          │
          └──> User saves mapping ───> api.post/put('/admin/table-mappings')
```

---

## 4. Detailed Dynamic Linking Architecture

### 4.1 Assignee Dynamic Linking Implementation

1. **Extracting Users from Database**:
   - `GET /admin/users` already returns the active user records from `User.query.all()`.
   - In `admin.js`:
     ```javascript
     const userList = (usersRes && usersRes.data) || [];
     this._userList = userList;
     // Active users list:
     const activeUserNames = userList
         .filter(u => u.active !== false && (u.name || u.email))
         .map(u => (u.name || u.email).trim());
     
     // Include any legacy/existing assignees on the table mappings
     const existingAssignees = (this._tableMappings || [])
         .flatMap(m => (m.assigned_user || m.user || '').split(','))
         .map(s => s.trim())
         .filter(Boolean);
     
     const allAssigneeOptions = Array.from(new Set([...activeUserNames, ...existingAssignees])).sort();
     this._allAssigneeOptions = allAssigneeOptions;
     ```

2. **Dynamic Filter Dropdown Population**:
   Replace static HTML in `loadTableMapping`:
   ```javascript
   const userSelect = document.getElementById('map-filter-user');
   if (userSelect) {
       const prevVal = userSelect.value;
       userSelect.innerHTML = `<option value="">All Assignees</option>` +
           allAssigneeOptions.map(u => `<option value="${App.escapeHtml(u)}" ${u === prevVal ? 'selected' : ''}>${App.escapeHtml(u)}</option>`).join('');
   }
   ```

3. **Dynamic Teammates Checkboxes in Modal**:
   In `openEditTableMappingModal`:
   ```javascript
   const authenticUsers = (this._allAssigneeOptions && this._allAssigneeOptions.length)
       ? this._allAssigneeOptions
       : ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
   ```
   Both the multi-select teammate checkboxes and the `.comm-cfg-user` select dropdown in the Granular Override Matrix will use this dynamic array.

### 4.2 Commodity Dynamic Linking Implementation

1. **Extracting Commodities from Database**:
   - Call `api.get('/du/commodities')` (or query `api.get('/admin/commodities')`).
   - Extract unique commodity strings.
   - Combine with existing commodities on the table mapping:
     ```javascript
     const dbCommodities = (commsRes && commsRes.commodities) || (commsRes && commsRes.data && commsRes.data.map(c => c.commodity)) || [];
     const existingComms = (comm || '').split(',').map(s => s.trim()).filter(Boolean);
     const allCommodities = Array.from(new Set([...dbCommodities, ...existingComms])).sort();
     ```

2. **Deterministic Color Palette Generator**:
   Replace static `COMMODITY_COLORS` lookup with fallback generator:
   ```javascript
   function getCommodityColor(cName) {
       if (COMMODITY_COLORS[cName]) return COMMODITY_COLORS[cName];
       let hash = 0;
       for (let i = 0; i < cName.length; i++) hash = cName.charCodeAt(i) + ((hash << 5) - hash);
       const hue = Math.abs(hash) % 360;
       return {
           bg: `hsla(${hue}, 75%, 55%, 0.16)`,
           text: `hsl(${hue}, 80%, 65%)`,
           border: `hsla(${hue}, 75%, 55%, 0.32)`
       };
   }
   ```

### 4.3 Immediate Reflection of Newly Created Users

When a new user is created in the User Management modal (`showUserModal` / `btn-save-user` in `admin.js:638–660`):
1. `POST /admin/users` successfully creates the user in the database.
2. In the success callback, invalidate cached user state:
   ```javascript
   this._userList = null;
   this._allAssigneeOptions = null;
   ```
3. When the user navigates to the Table Mapping Studio or clicks "Add New Table Mapping" / "Edit Table Mapping":
   - `loadTableMapping` automatically fetches fresh users from `GET /admin/users`.
   - Even if `openEditTableMappingModal` is invoked directly, add an async guard:
     ```javascript
     if (!this._userList || !this._userList.length) {
         try {
             const uRes = await api.get('/admin/users');
             this._userList = uRes.data || [];
             this._allAssigneeOptions = ...;
         } catch(e) {}
     }
     ```
   - Consequently, newly created users **immediately appear** in both the filter dropdown and the assignee checkboxes without requiring a browser page reload or manual code edits.

### 4.4 Relational Consistency Between Database Tables

To satisfy R1 and R3 (full relational consistency):
1. **Name Update Synchronization**:
   In `app/routes/admin.py:update_user(email)`:
   When `target.name` is updated from `old_name` to `new_name`:
   ```python
   if 'name' in data and data['name'].strip() and data['name'].strip() != target.name:
       old_name = target.name
       new_name = data['name'].strip()
       target.name = new_name
       
       # Propagate to DBTaskCatalog
       mappings = DBTaskCatalog.query.filter(DBTaskCatalog.user_name.ilike(f"%{old_name}%")).all()
       for m in mappings:
           # Replace in comma-separated list
           parts = [u.strip() for u in m.user_name.split(',') if u.strip()]
           updated_parts = [new_name if p.lower() == old_name.lower() else p for p in parts]
           m.user_name = ', '.join(updated_parts)
           
           # Replace in commodity_config JSON if present
           if m.commodity_config:
               try:
                   cfg = json.loads(m.commodity_config)
                   changed = False
                   for c_name, c_val in cfg.items():
                       if isinstance(c_val, dict) and c_val.get('assigned_user', '').lower() == old_name.lower():
                           c_val['assigned_user'] = new_name
                           changed = True
                   if changed:
                       m.commodity_config = json.dumps(cfg)
               except Exception:
                   pass
       
       # Propagate to Reports
       Report.query.filter_by(primary_assignee=old_name).update({'primary_assignee': new_name})
       Report.query.filter_by(backup_1=old_name).update({'backup_1': new_name})
       Report.query.filter_by(backup_2=old_name).update({'backup_2': new_name})
       
       # Propagate to CommodityConfigs
       CommodityConfig.query.filter_by(primary_assignee=old_name).update({'primary_assignee': new_name})
       CommodityConfig.query.filter_by(mode=old_name).update({'mode': new_name})
   ```
2. **Backend Payload Validation**:
   In `POST /admin/table-mappings` and `PUT /admin/table-mappings/<id>`:
   Validate that the `assigned_user` refers to valid database users, logging a warning or preventing orphaned assignments.

---

## 5. Frontend State Management & Cache Architecture

| State Variable | Location | Current State | Required Update |
| :--- | :--- | :--- | :--- |
| `this._tableMappings` | `AdminModule` (`admin.js:3324`) | Array of table mappings | Keep; refreshed on `loadTableMapping`. |
| `this._userList` | `AdminModule` (`admin.js:686`) | Loaded only in `loadReports`, `loadCommodities`, `loadTasks` | Must also be loaded in `loadTableMapping` and cached on `AdminModule`. |
| `this._commodityList` | `AdminModule` | Did not exist for Table Mapping | Add `this._commodityList` populated from `api.get('/du/commodities')`. |
| `this._allAssigneeOptions` | `AdminModule` | Did not exist; hardcoded | Add array of active DB user names + current table assignees. |
| User Cache Invalidation | `showUserModal` save handler | Only reloaded user table | Add cache invalidation `this._userList = null; this._allAssigneeOptions = null;`. |

---

## 6. Proposed Code Changes

### 6.1 `app/static/js/admin.js`
1. **In `loadTableMapping(container)`**:
   - Change line 3322 to:
     ```javascript
     const [res, usersRes, commsRes] = await Promise.all([
         api.get('/admin/table-mappings'),
         api.get('/admin/users'),
         api.get('/du/commodities')
     ]);
     const items = (res && res.data) || [];
     this._tableMappings = items;
     this._userList = (usersRes && usersRes.data) || [];
     this._commodityList = (commsRes && commsRes.commodities) || [];
     ```
   - Dynamically render `#map-filter-user` options based on `this._userList` and existing assignees.
2. **In `openEditTableMappingModal(item = null)`**:
   - Make `openEditTableMappingModal` an `async` function (or ensure users/commodities are preloaded).
   - Replace hardcoded `authenticUsers` array with dynamic user list:
     ```javascript
     const activeUsers = (this._userList || [])
         .filter(u => u.active !== false && (u.name || u.email))
         .map(u => (u.name || u.email).trim());
     const existingAssignees = (this._tableMappings || [])
         .flatMap(m => (m.assigned_user || m.user || '').split(','))
         .map(s => s.trim())
         .filter(Boolean);
     const authenticUsers = Array.from(new Set([...activeUsers, ...existingAssignees])).sort();
     ```
   - Replace hardcoded `harmonizedCommodities` array with dynamic commodities from `this._commodityList`.
   - Replace fixed `COMMODITY_COLORS` lookup with dynamic color generator function.
3. **In `showUserModal` save handler (line 653)**:
   - Reset `this._userList = null; this._allAssigneeOptions = null;`.

### 6.2 `app/routes/admin.py`
1. **In `update_user(email)`**:
   - Add propagation of `name` changes to `DBTaskCatalog.user_name` and `commodity_config` JSON.
2. **In `add_table_mapping()` & `update_table_mapping(id)`**:
   - Ensure `user_name` and `commodity` properly validate against database records.

---

## 7. Verification Strategy

1. **Direct Verification of Database State**:
   - Run python verification script:
     ```bash
     .venv\Scripts\python.exe -c "
     from app import create_app; from app.models import User, DBTaskCatalog, CommodityConfig;
     app = create_app();
     with app.app_context():
         users = [u.name for u in User.query.filter_by(active=True).all()]
         print('Active users:', users)
         comms = sorted(list(set(c.commodity for c in CommodityConfig.query.all())))
         print('Active commodities:', len(comms))
     "
     ```
2. **API Endpoint Verification**:
   - Verify `GET /api/admin/users` returns all active database users.
   - Verify `GET /api/du/commodities` returns all active commodities.
   - Verify `GET /api/admin/table-mappings` returns mapped catalog items.
3. **End-to-End User Creation & Table Mapping Test**:
   - Programmatically create a new user `TestAnalyst` via `POST /api/admin/users`.
   - Verify `TestAnalyst` immediately appears in `/api/admin/users`.
   - In UI / test suite: verify `TestAnalyst` appears in `#map-filter-user` and `chk-modal-user` checkboxes.
   - Map a table to `TestAnalyst` via `POST /api/admin/table-mappings`.
   - Assert mapping is created in `DBTaskCatalog` with `user_name='TestAnalyst'`.
