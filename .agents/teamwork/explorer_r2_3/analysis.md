# Requirement R3 & R4 Technical Investigation & Architecture Analysis Report: UI Integration in Crishi & Automated Testing

**Author:** explorer_r2_3  
**Date:** 2026-10-28  
**Scope:** UI Integration in Crishi (R3) & Automated Testing and Verification (R4) for Advance ERP  

---

## 1. Executive Summary

This investigation covers two interrelated core requirements for Advance ERP:
1. **Requirement R3 (UI Integration in Crishi)**:
   - Add a dedicated **'Update History'** tab alongside the existing Surveillance and Roster tabs in Crishi.
   - For Admins (**SuperAdmin**, **Manager**, **Leader**): Provide full access to view all teammates' update history with dynamic filtering by any teammate.
   - For Teammates: Restrict the view exclusively to their own update history records.
   - Clicking a teammate's portfolio chip in **"Teammate Portfolios"** directly links to or filters that teammate's update history.
   - Layout table columns: **Person Name**, **Table Name**, **Final Name**, **Commodity**, **DB Update Date/Timestamp**, **Report Date**, **Status**, **Row Count**, and **Remarks**.
2. **Requirement R4 (Automated Testing and Verification)**:
   - Create automated tests using the project's existing test framework (`unittest` + Flask `test_client()`) verifying role-based access scoping across Admin and Teammate roles.
   - Verify that update history entries accurately reflect database modifications.
   - Discover or seed isolated local development test accounts to execute the verification suite safely without corrupting the production database.

### Key Discoveries & Architectural Baseline:
- **Single Page Application (SPA) Structure:** Crishi is rendered entirely client-side via `app/static/js/crishi.js`, loaded dynamically by `app/static/js/app.js` into `<div id="page-container">` in `templates/index.html`.
- **Existing Tab Mechanism:** Tabs are managed via `.crishi-tabs` container with buttons `#tab-surveillance` and `#tab-roster`. Tab switching toggles the `.active` class on buttons and `.hidden` on panels `#view-surveillance` and `#view-roster`.
- **Teammate Workload Chips:** Handled in `renderTeammateChips()` (`crishi.js`:928–972), currently rendering all active users without role scoping.
- **Test Infrastructure:** Proven and operational in `tests/test_hierarchy_and_studio.py` and `tests/test_quality_audit_regression.py`. Tests use standard library `unittest` with `flask_jwt_extended` JWT authentication against local MySQL `advance_erp`.
- **Zero Data Loss Guarantee:** Invariants protect 9 baseline users, 27 baseline reports, and 158 table catalog mappings.

---

## 2. Investigation Task 1: Crishi Frontend Architecture & Tab Switching

### 2.1 Templates and Container Architecture
- **Root Entry Point:** `app/templates/index.html` serves as the single template container.
- **Page Container:** Lines 75–85 of `index.html` provide `<main class="main-content"><div id="page-container"></div></main>`.
- **Router Flow:** In `app/static/js/app.js` (lines 69–116):
  ```javascript
  const hash = window.location.hash || '#crishi';
  // ...
  const mod = await import(`./${moduleKey}.js?v=${Date.now()}`);
  this.modules[moduleKey] = mod.default;
  const container = document.getElementById('page-container');
  container.innerHTML = await this.modules[moduleKey].render();
  await this.modules[moduleKey].init();
  ```

### 2.2 Tab Navigation in `app/static/js/crishi.js`
In `CrishiModule.render()` (lines 173–180):
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

The panels are conditionally hidden based on `this.activeTab`:
- Surveillance Panel: `<div id="view-surveillance" class="${this.activeTab === 'surveillance' ? '' : 'hidden'}">` (`crishi.js`:196)
- Roster Panel: `<div id="view-roster" class="${this.activeTab === 'roster' ? '' : 'hidden'}">` (`crishi.js`:544)

In `CrishiModule.bindEvents()` (`crishi.js`:974–992):
```javascript
// Tab switching
document.getElementById('tab-surveillance')?.addEventListener('click', () => {
    this.activeTab = 'surveillance';
    document.getElementById('view-surveillance')?.classList.remove('hidden');
    document.getElementById('view-roster')?.classList.add('hidden');
    document.getElementById('tab-surveillance')?.classList.add('active');
    document.getElementById('tab-roster')?.classList.remove('active');
});

document.getElementById('tab-roster')?.addEventListener('click', () => {
    this.activeTab = 'roster';
    document.getElementById('view-surveillance')?.classList.add('hidden');
    document.getElementById('view-roster')?.classList.remove('hidden');
    document.getElementById('tab-surveillance')?.classList.remove('active');
    document.getElementById('tab-roster')?.classList.add('active');
    this.loadWeatherRotation();
});
```

### 2.3 Existing CSS Styles in `app/static/css/main.css`
- `.crishi-tabs`: Lines 784–786:
  ```css
  .crishi-tabs { display: flex; gap: 8px; background: var(--bg-card); padding: 4px; border-radius: 10px; border: 1px solid var(--border); }
  .crishi-tab-btn { padding: 8px 18px; border: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: .85rem; border-radius: 8px; cursor: pointer; transition: all var(--transition); }
  .crishi-tab-btn.active { background: var(--accent); color: #fff; box-shadow: 0 2px 10px var(--accent-glow); }
  ```
- `.hidden`: `display: none !important;` (standard utility class).
- `.crishi-table`, `.crishi-table-card`, `.crishi-table-responsive`: Lines 788–800, supporting sticky headers, custom horizontal scrollbars, and monospace code tags.

---

## 3. Investigation Task 2: Teammate Portfolio Chips & Click Interactions

### 3.1 Current Rendering Implementation
In `CrishiModule.renderTeammateChips()` (`app/static/js/crishi.js`:928–972):
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

    containers.forEach(container => {
        container.innerHTML = html;
        container.querySelectorAll('.user-chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.user-chip-btn');
                if (!targetBtn) return;
                this.activeUserFilter = targetBtn.dataset.user;
                this.renderTeammateChips();
                this.applyFilters();
            });
        });
    });
}
```

### 3.2 Role Scoping Deficiency on Chips
- When a `Teammate` logs in, `priorityUsers` still contains all users (`Nishant`, `Bhawna`, `Pankaj`, `Nitesh`, `Gopi`), and the "All Teammates" chip is rendered.
- **Requirement R1 Violation**: Teammates must ONLY see their own portfolio chip.
- **Proposed Fix in `renderTeammateChips()`**:
  ```javascript
  const user = window.currentUser || {};
  const isTeammate = user.role === 'Teammate';
  const myName = (user.name || '').trim();

  let html = '';
  // Only Admins (SuperAdmin, Manager, Leader) see "All Teammates"
  if (!isTeammate) {
      html += `
          <button class="user-chip-btn ${this.activeUserFilter === 'ALL' ? 'active' : ''}" data-user="ALL">
              <span>All Teammates</span>
              <span class="badge" style="background: rgba(255,255,255,0.15); font-size: .72rem;">${this.tasks.length}</span>
          </button>
      `;
  }

  // Filter users to only the logged-in teammate if role is Teammate
  const visibleUsers = isTeammate 
      ? priorityUsers.filter(u => u.toLowerCase() === myName.toLowerCase()) 
      : priorityUsers;
  ```

### 3.3 Linking Portfolio Chips to Update History
Requirement R3 states:
> *"Clicking a teammate's portfolio chip in 'Teammate Portfolios' allows viewing that teammate's update history directly."*

To satisfy this seamlessly without breaking surveillance filtering:
1. Each portfolio chip is equipped with a direct **Update History Quick-Action Button**:
   ```html
   <button class="user-chip-btn ${isActive ? 'active' : ''}" data-user="${u}">
       <span class="user-chip-name">${u}</span>
       <span class="badge">${st.updated}/${st.total}</span>
       <span class="chip-history-action" data-history-user="${u}" title="View ${u}'s DB Update History" style="margin-left: 6px; padding: 2px 5px; border-radius: 4px; background: rgba(96,165,250,0.2); color: #60a5fa;">
           <i class="fas fa-history"></i>
       </span>
   </button>
   ```
2. When the user clicks the `.chip-history-action` icon (or double-clicks/selects in history context):
   - Switches `this.activeTab = 'history'` (activating `#tab-history`).
   - Sets `this.historyFilters.teammate = u`.
   - Calls `this.loadUpdateHistory()`.
   - Updates the UI smoothly.
3. In addition, when in the Surveillance view, clicking the chip updates the hint bar to show:
   ```html
   Showing workload for Nishant · <a href="javascript:void(0)" onclick="CrishiModule.switchToHistoryTab('${u}')" style="color: #60a5fa; text-decoration: underline;"><i class="fas fa-history"></i> View Nishant's Update History</a>
   ```

---

## 4. Investigation Task 3: 'Update History' Tab Layout & Component Specifications

### 4.1 Tab Structure & Navigation Header
In `CrishiModule.render()`:
```html
<div class="crishi-tabs">
    <button class="crishi-tab-btn ${this.activeTab === 'surveillance' ? 'active' : ''}" id="tab-surveillance">
        <i class="fas fa-shield-alt"></i> Live DB Surveillance
    </button>
    <button class="crishi-tab-btn ${this.activeTab === 'roster' ? 'active' : ''}" id="tab-roster">
        <i class="fas fa-calendar-alt"></i> Weekly Roster & Rake Movement
    </button>
    <button class="crishi-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" id="tab-history">
        <i class="fas fa-history"></i> Update History
    </button>
</div>
```

### 4.2 Interactive Filter Bar Design
Inside `<div id="view-history" class="${this.activeTab === 'history' ? '' : 'hidden'}">`:
- **Search Input (`#history-search`)**: Monitored search field filtering by table name, business title, commodity, or remarks.
- **Teammate Selector (`#history-filter-teammate`)**:
  - For Admins: `<select id="history-filter-teammate"><option value="ALL">All Teammates</option><option value="Nishant">Nishant</option>...</select>`.
  - For Teammates: Disabled/locked selector showing only their own name, or replaced with a badge `<span class="badge">My Portfolio: Bhawna</span>`.
- **Commodity Selector (`#history-filter-commodity`)**: Dropdown of the 16 authoritative commodities.
- **Report Date / Period Picker (`#history-filter-date`)**: Date input for selecting specific report dates.
- **Status Filter (`#history-filter-status`)**: Dropdown (`All Statuses`, `PASS / Verified`, `Pending`, `Need Correction`).
- **Action Buttons**:
  - `<button id="btn-refresh-history" class="btn btn-outline btn-sm"><i class="fas fa-sync-alt"></i> Refresh</button>`
  - `<button id="btn-sync-now" class="btn btn-primary btn-sm"><i class="fas fa-database"></i> Verify from MySQL</button>`

### 4.3 9 Mandatory Table Columns Specification
The table inside `#view-history` follows the Crishi data grid design system:

| Col # | Field Name | Width % | Alignment | Render Format / Visual Presentation |
|---|---|---|---|---|
| 1 | **Person Name** | 9% | Left | `<span class="user-avatar-chip"><i class="fas fa-user-circle"></i> Nishant</span>` |
| 2 | **Table Name** | 16% | Left | `<span class="table-code-tag">pyexcel_trade_flow</span>` (monospace code badge) |
| 3 | **Final Name** | 22% | Left | `<strong style="color: #f1f5f9;">Trade Flow – Pulses</strong>` (with full sub-commodity tooltip) |
| 4 | **Commodity** | 10% | Left | Commodity color-coded badge, e.g. `<span class="badge badge-pulses">Pulses</span>` |
| 5 | **DB Update Timestamp** | 13% | Center | Exact database update timestamp, e.g. `2026-10-28 17:35:10` (ISO/IST formatted) |
| 6 | **Report Date** | 8% | Center | Target business date, e.g. `2026-07-01` or `28-Oct-2026` |
| 7 | **Status** | 8% | Center | Color-coded status badge: `PASS` (#10b981), `VERIFIED` (#3b82f6), `NEED_CORRECTION` (#f59e0b) |
| 8 | **Row Count** | 6% | Right | Formatted count: `<span class="badge" style="font-weight: 700;">292 rows</span>` |
| 9 | **Remarks** | 8% | Left | Ellipsis remark text with hover tooltip; includes delay notes or source pipeline tags |

---

## 5. Investigation Task 4: Test Infrastructure & Isolated Test Accounts

### 5.1 Test Framework Baseline
- **Location:** `tests/test_hierarchy_and_studio.py` and `tests/test_quality_audit_regression.py`.
- **Harness:** Python standard library `unittest` (executed via `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`).
- **Application Factory:** `app = create_app()`, using `app.test_client()`.
- **Database Engine:** MySQL (`mysql+pymysql://root:Nishant%40321@127.0.0.1:3306/advance_erp`).
- **Execution Speed:** Baseline tests run in ~1.2 seconds with 0 warnings.

### 5.2 JWT Authentication in Tests
Authentication headers are generated programmatically using `flask_jwt_extended`:
```python
def get_auth_headers(self, email='vaibhav@agalabs.com', role='SuperAdmin'):
    with self.app.app_context():
        token = create_access_token(identity=email, additional_claims={'role': role})
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
```

### 5.3 Account Inventory for Role Scoping Verification
Baseline accounts available in the database:
1. **SuperAdmin Account:**
   - Email: `vaibhav@agalabs.com` / `nishant@agalabs.com`
   - Role: `SuperAdmin`
   - Permissions: Unrestricted access to all commodities, reports, tables, and teammates.
2. **Manager Account:**
   - Email: `ram@agalabs.com`
   - Role: `Manager`
   - Permissions: Full administrative access to all teammate portfolios and update history.
3. **Leader Account:**
   - Role: `Leader`
   - Requirement R1 explicitly defines `Leader` as an Admin role.
   - Test Seed Account: `test_e2e_leader@agalabs.com` (created dynamically with `role='Leader'`).
4. **Teammate Accounts (Domain Specific):**
   - `bhawna@agalabs.com` (role: `Teammate`, assigned: `Cotton, Rapeseed, Soybeans, Weather`)
   - `gopichand@agalabs.com` (role: `Teammate`, assigned: `Rice, Wheat`)
   - `pankaj@agalabs.com` (role: `Teammate`, assigned: `Chilli, Coriander, Cumin, Turmeric, Weather`)
   - `nitesh@agalabs.com` (role: `Teammate`, assigned: `Bajra, Barley, Maize, Sugar`)

### 5.4 Test Isolation & Invariant Safety Oracle
All test resources (users, verifications, history entries) must adhere to the project safety contract:
- Named with prefix: `test_e2e_*`
- Registered in `self.created_emails`, `self.created_history_ids`, and cleaned up in `tearDown()` and `tearDownClass()`.
- Zero Data Loss Oracle assertions:
  ```python
  assert User.query.count() >= 9
  assert Report.query.count() >= 27
  assert DBTaskCatalog.query.count() >= 158
  ```

---

## 6. Investigation Task 5: API Design for `GET /api/crishi/update-history`

### 6.1 Endpoint Specification
- **URL:** `GET /api/crishi/update-history`
- **Authentication:** Mandatory `@jwt_required()`
- **Query Parameters:**
  - `teammate` (or `person`): Name or email of teammate to filter by (e.g. `'Nishant'`, `'Bhawna'`, `'ALL'`).
  - `commodity`: Filter by commodity (e.g. `'Pulses'`, `'Soybeans'`).
  - `table`: Filter by raw MySQL table name (e.g. `'pyexcel_trade_flow'`).
  - `date`: Filter by report date (e.g. `'2026-07-01'`).
  - `limit`: Page size limit (default `100`, max `500`).
  - `offset`: Pagination offset (default `0`).

### 6.2 Access Scoping Logic
```python
@crishi_bp.route('/update-history', methods=['GET'])
@jwt_required()
def get_update_history():
    """
    Retrieves immutable person-basis update history records directly from DB update date/timestamps.
    Enforces role scoping:
      - Admin roles (SuperAdmin, Manager, Leader) can view all or filter by any teammate.
      - Teammate roles are strictly scoped to their own portfolio history.
    """
    email = get_jwt_identity()
    user = User.query.filter_by(email=email, active=True).first()
    if not user:
        return jsonify({'success': False, 'message': 'User not found or inactive'}), 401

    is_admin = user.role in ['SuperAdmin', 'Manager', 'Leader']
    requested_teammate = request.args.get('teammate', '').strip()
    commodity_filter = request.args.get('commodity', '').strip()
    table_filter = request.args.get('table', '').strip()
    date_filter = request.args.get('date', '').strip()
    limit = min(int(request.args.get('limit', 100)), 500)
    offset = int(request.args.get('offset', 0))

    query = TableUpdateHistory.query

    # Enforce Scoping (R1 & R3)
    if not is_admin:
        # Teammate is locked to their own person_name
        query = query.filter(TableUpdateHistory.person_name.ilike(f"%{user.name}%"))
    else:
        # Admins can filter by specific teammate or view all
        if requested_teammate and requested_teammate.upper() != 'ALL':
            query = query.filter(TableUpdateHistory.person_name.ilike(f"%{requested_teammate}%"))

    if commodity_filter and commodity_filter.upper() != 'ALL':
        query = query.filter(TableUpdateHistory.commodity.ilike(f"%{commodity_filter}%"))

    if table_filter:
        query = query.filter(TableUpdateHistory.table_name.ilike(f"%{table_filter}%"))

    if date_filter:
        try:
            parsed_date = datetime.strptime(date_filter, '%Y-%m-%d').date()
            query = query.filter_by(report_date=parsed_date)
        except Exception:
            pass

    total_count = query.count()
    records = query.order_by(TableUpdateHistory.db_update_timestamp.desc(), TableUpdateHistory.id.desc()).offset(offset).limit(limit).all()

    return jsonify({
        'success': True,
        'count': len(records),
        'total': total_count,
        'records': [r.to_dict() for r in records],
        'role': user.role,
        'is_admin': is_admin,
        'user_name': user.name
    })
```

### 6.3 Response Payload Example
```json
{
  "success": true,
  "count": 2,
  "total": 42,
  "is_admin": false,
  "role": "Teammate",
  "user_name": "Bhawna",
  "records": [
    {
      "id": 14,
      "personName": "Bhawna",
      "tableName": "pyexcel_trade_flow",
      "finalName": "Trade Flow – Soybeans & Edible Oils",
      "commodity": "Soybeans",
      "dbUpdateTimestamp": "2026-07-20 14:12:08",
      "reportDate": "2026-07-01",
      "status": "PASS",
      "rowCount": 99,
      "remarks": "Updated via MySQL agalabsdev_stage"
    },
    {
      "id": 12,
      "personName": "Bhawna",
      "tableName": "sopa_spot_price",
      "finalName": "SOPA Daily Soybean Spot Rates",
      "commodity": "Soybeans",
      "dbUpdateTimestamp": "2026-10-28 16:45:00",
      "reportDate": "2026-10-28",
      "status": "VERIFIED",
      "rowCount": 24,
      "remarks": "Verified via Live DB Sync"
    }
  ]
}
```

---

## 7. Investigation Task 6: Proposed Automated Test Suite Design (Requirement R4)

We propose adding a comprehensive, dedicated automated test file:  
`tests/test_crishi_history_and_scoping.py`

### 7.1 Test Structure Overview (5-Tier Coverage)

```
tests/test_crishi_history_and_scoping.py
├── TestRoleScopingEnforcement (Tier 1: Access Scoping)
│   ├── test_superadmin_unrestricted_grid_access
│   ├── test_manager_unrestricted_grid_access
│   ├── test_leader_unrestricted_grid_access
│   ├── test_teammate_scoped_grid_access
│   ├── test_teammate_portfolio_chips_hidden_in_ui_and_api
│   └── test_teammate_reports_scoping
│
├── TestUpdateHistoryFieldsAndRetrieval (Tier 2: 9 Mandatory Fields)
│   ├── test_update_history_all_nine_fields_present
│   ├── test_update_history_person_basis_nishant_pulses
│   ├── test_update_history_person_basis_bhawna_soybeans
│   └── test_update_history_filtering_by_commodity_and_date
│
├── TestUpdateHistoryRoleScoping (Tier 3: Scoping on History Endpoint)
│   ├── test_admin_can_view_all_update_history
│   ├── test_admin_can_filter_by_teammate
│   ├── test_teammate_restricted_to_own_history
│   └── test_teammate_cannot_spoof_teammate_param
│
├── TestDatabaseModificationReflectionAndImmutability (Tier 4: Live DB Sync)
│   ├── test_sync_db_appends_new_history_record
│   ├── test_history_records_are_immutable_on_repeated_sync
│   └── test_accurate_row_count_and_timestamp_reflection
│
└── TestIsolationAndZeroDataLossGuarantee (Tier 5: Data Safety)
    ├── test_zero_data_loss_users_reports_mappings_intact
    └── test_tear_down_sweeper_cleans_test_e2e_records
```

### 7.2 Key Concrete Test Implementations

#### Test 1: Teammate Scoping on Update History
```python
def test_teammate_restricted_to_own_history(self):
    """Teammate (Bhawna) can only receive her own update history, even if passing teammate='Nishant'."""
    headers = self.get_auth_headers('bhawna@agalabs.com', 'Teammate')
    res = self.client.get('/api/crishi/update-history?teammate=Nishant', headers=headers)
    self.assertEqual(res.status_code, 200)
    data = res.get_json()
    self.assertTrue(data.get('success'))
    self.assertFalse(data.get('is_admin'))
    # Every record returned must belong strictly to Bhawna
    for rec in data.get('records', []):
        self.assertIn('bhawna', rec['personName'].lower())
        self.assertNotIn('nishant', rec['personName'].lower())
```

#### Test 2: Leader Has Admin Access Scoping
```python
def test_leader_has_admin_unrestricted_access(self):
    """Leader role is recognized as Admin and has unrestricted access to all teammate history."""
    headers = self.get_auth_headers('test_e2e_leader@agalabs.com', 'Leader')
    res = self.client.get('/api/crishi/update-history?teammate=ALL', headers=headers)
    self.assertEqual(res.status_code, 200)
    data = res.get_json()
    self.assertTrue(data.get('success'))
    self.assertTrue(data.get('is_admin'))
    # Leader can see records from multiple distinct teammates
    persons = {r['personName'] for r in data.get('records', [])}
    self.assertGreater(len(persons), 1)
```

#### Test 3: Verification of All 9 Mandatory Fields
```python
def test_update_history_contains_all_nine_required_fields(self):
    """Every update history item contains all 9 required fields with non-empty values."""
    headers = self.get_auth_headers('vaibhav@agalabs.com', 'SuperAdmin')
    res = self.client.get('/api/crishi/update-history', headers=headers)
    self.assertEqual(res.status_code, 200)
    data = res.get_json()
    self.assertTrue(len(data.get('records', [])) > 0)
    required_keys = [
        'personName', 'tableName', 'finalName', 'commodity',
        'dbUpdateTimestamp', 'reportDate', 'status', 'rowCount', 'remarks'
    ]
    for rec in data['records']:
        for k in required_keys:
            self.assertIn(k, rec, f"Missing required field {k} in record: {rec}")
            self.assertIsNotNone(rec[k], f"Field {k} is None in record: {rec}")
```

#### Test 4: Immutability on Repeated Modifications
```python
def test_update_history_is_immutable_and_appends_on_db_sync(self):
    """Syncing a table update creates a new immutable record rather than mutating existing logs."""
    headers = self.get_auth_headers('bhawna@agalabs.com', 'Teammate')
    # Count initial records
    res1 = self.client.get('/api/crishi/update-history', headers=headers)
    initial_count = res1.get_json().get('total', 0)

    # Perform a sync update
    sync_res = self.client.post('/api/crishi/sync-report-db', data=json.dumps({
        'catalogId': 1,
        'reportDate': '2026-10-28',
        'userName': 'Bhawna'
    }), headers=headers)
    self.assertEqual(sync_res.status_code, 200)

    # Count records after sync
    res2 = self.client.get('/api/crishi/update-history', headers=headers)
    new_count = res2.get_json().get('total', 0)
    self.assertGreater(new_count, initial_count, "Expected new immutable log entry to be appended")
```

---

## 8. Summary of Proposed Changes for Implementation

| File | Change Category | Description |
|---|---|---|
| `app/auth.py` | Role Hierarchy | Update `ROLE_LEVEL` to add `'Leader': 2` so `Leader` is treated as an Admin role alongside `Manager` and `SuperAdmin`. |
| `app/models.py` | Schema & Model | Add `TableUpdateHistory` model (`table_update_history`) with all 9 fields and indexes on `person_name`, `commodity`, `report_date`, `db_update_timestamp`. |
| `app/routes/crishi.py` | REST API | Implement `GET /api/crishi/update-history` with JWT auth and role scoping (Admins view all / filter by teammate; Teammates view own). |
| `app/routes/crishi.py` | Append-Only Logging | In `/sync-report-db` and `/manager-review`, append a new immutable `TableUpdateHistory` record. |
| `app/static/js/crishi.js` | Tab UI | Add `#tab-history` button and `#view-history` panel with 9 columns, interactive search, commodity dropdown, teammate selector, and date filters. |
| `app/static/js/crishi.js` | Teammate Chips | Update `renderTeammateChips()` to only show the logged-in teammate's chip for `Teammate` role; add direct update history shortcut link/action on each chip. |
| `tests/test_crishi_history_and_scoping.py` | Automated Tests | Create 5-tier test suite verifying access scoping, 9 mandatory fields, immutability, isolated test accounts, and zero data loss. |

---
