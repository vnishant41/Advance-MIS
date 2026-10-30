# Requirement R1 Technical Investigation & Architectural Analysis Report: Teammate and Admin Role Scoping

## 1. Executive Summary

Requirement R1 mandates strict role-based access scoping between Admin roles (**SuperAdmin**, **Manager**, **Leader**) and **Teammate** roles across Advance ERP (Crishi):
- **Admin Roles (`SuperAdmin`, `Manager`, `Leader`)**: Must possess unrestricted full access to all commodities (16 authoritative categories), all scanned and ingested market reports (290+ reports), all monitored database tables (158 catalog mappings), and all teammate workload portfolios (including "All Teammates" and individual teammate chips).
- **Teammate Role**: When a teammate logs in, their access must be strictly constrained to their personal assignments:
  1. In **"Teammate Portfolios (Click to Filter Workload)"**, they must **only see their own portfolio chip**. All other teammates' chips and the "All Teammates" selector must be completely hidden.
  2. In the **Surveillance Grid** (`/crishi/grid` and UI views: Table-Basis, Commodity-Basis, Date-Basis), teammates must only see their assigned tables, commodities, and updates.
  3. In **Reports** (`/crishi/reports/all`, `report.js`), teammates must only see reports corresponding to their assigned commodities and assigned duties.
  4. Workload hint text and filters must automatically default and lock to their own portfolio.

### Key Architectural Discoveries
1. **Missing `Leader` in Role Hierarchy**: In `app/auth.py` (line 15), `ROLE_LEVEL = {'Teammate': 1, 'Manager': 2, 'SuperAdmin': 3}` completely omits `Leader`. Because `ROLE_LEVEL.get('Leader', 0)` evaluates to `0`, `role_at_least(user.role, 'Manager')` improperly downgrades `Leader` below `Teammate`, causing inconsistent authorization throughout the backend.
2. **Unrestricted Backend Endpoints**: The primary surveillance grid route (`GET /crishi/grid` in `app/routes/crishi.py`:16-32) and the reports route (`GET /crishi/reports/all` in `app/routes/crishi.py`:1165-1175) utilize `@jwt_required(optional=True)`. Neither endpoint inspects the authenticated user's role or identity; both serialize and return 100% of the 158 monitored tables, 290+ reports, and global teammate summary metrics to all clients.
3. **Frontend Chip & Filter Leakage**: In `app/static/js/crishi.js`:928-972 (`renderTeammateChips()`), the UI iterates through all active users and renders an "All Teammates" button followed by individual workload chips for Nishant, Bhawna, Gopi, Pankaj, and Nitesh without any role check. Teammates can click any other teammate's chip to inspect that person's complete surveillance workload.
4. **Authoritative Assignment Structure**: Assignments exist across three interconnected database layers:
   - `users.commodities` (comma-separated string) and `user_commodity_mappings` table (`user_id`, `commodity`).
   - `reports.user_id`, `reports.primary_assignee`, and `user_report_mappings` (`user_id`, `report_id`, `report_name`).
   - `db_task_catalog.user_name` (e.g. `'Bhawna'`, `'Gopi'`, or `'Nishant, Bhawna, Pankaj, Nitesh, Gopi'`) and `db_task_catalog.commodity_config` (JSON dictionary specifying per-commodity assignees).

---

## 2. Authentication and User Role Definitions

### 2.1 Database User Model (`app/models.py`, lines 39-94)
The `User` model defines:
- `id` (BigInteger, Primary Key)
- `email` (String(255), unique, indexed)
- `name` (String(255), nullable=False)
- `role` (String(50), nullable=False, default='Teammate')
  - Documented in code comment: `# SuperAdmin, Manager, Leader, Teammate`
- `department` (String(100), default='Research')
- `active` (Boolean, default=True)
- `password_hash` (String(255), nullable=False)
- `commodities` (Text, default='') — Comma-separated list of assigned commodities
- `backup_of`, `backup_1`, `backup_2` (String(255))
- `is_roster_sub_admin` (Boolean, default=False)
- `report_mappings` (Relationship to `UserReportMapping`)
- `commodity_mappings` (Relationship to `UserCommodityMapping`)

### 2.2 Live Database Inhabitants
Inspection of the current database verifies 9 baseline users:
| ID | Name | Email | Role | Assigned Commodities | Assigned Reports Count |
|---|---|---|---|---|---|
| 1 | Nishant | nishant@agalabs.com | **SuperAdmin** | Pulses, Tops | 3 |
| 2 | Ram Gopal | ram@agalabs.com | **Manager** | (All via Admin role) | 0 |
| 3 | Gopi | gopichand@agalabs.com | **Teammate** | Rice, Wheat | 4 |
| 4 | Nitesh | nitesh@agalabs.com | **Teammate** | Bajra, Barley, Maize, Sugar | 6 |
| 5 | Pankaj | pankaj@agalabs.com | **Teammate** | Chilli, Coriander, Cumin, Turmeric, Weather | 8 |
| 6 | Damini | damini@agalabs.com | **Inactive** | None | 0 |
| 7 | Bhawna | bhawna@agalabs.com | **Teammate** | Cotton, Rapeseed, Soybeans, Weather | 6 |
| 8 | Balram | balram@agalabs.com | **Teammate** | None (General) | 0 |
| 9 | Vaibhav | vaibhav@agalabs.com | **SuperAdmin** | (All via Admin role) | 0 |

### 2.3 JWT Claims and Role Exposure (`app/auth.py`)
- **Login Generation** (`app/auth.py`, lines 124-139):
  ```python
  token = create_access_token(identity=user.email, additional_claims={'role': user.role})
  return jsonify({
      'success': True,
      'token': token,
      'user': user.to_dict(),
      'modules': modules,
  })
  ```
- **Client Session Exposure** (`app/static/js/auth.js`, lines 93-98):
  ```javascript
  setupUser(user, modules = {}) {
      this.user = user;
      this.modules = modules;
      window.currentUser = user;
      window.enabledModules = modules;
      ...
  }
  ```
  `window.currentUser` exposes `role`, `name`, `email`, `commodities`, `commodity_mappings`, and `report_mappings` globally throughout the frontend JavaScript runtime.

### 2.4 Critical Flaw in Role Hierarchy (`app/auth.py`, lines 15-20)
```python
ROLE_LEVEL = {'Teammate': 1, 'Manager': 2, 'SuperAdmin': 3}

def role_at_least(user_role, min_role):
    return ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)
```
- **Bug**: `ROLE_LEVEL` lacks `'Leader'`.
- **Impact**: Any user with `role == 'Leader'` has `ROLE_LEVEL.get('Leader', 0) == 0`. Calls to `role_at_least(user.role, 'Manager')` return `False`, locking Leaders out of admin-level views.
- **Required Fix**:
  ```python
  ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}
  ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}

  def is_admin_role(user_role):
      return user_role in ADMIN_ROLES
  ```

---

## 3. Teammate Portfolios Architecture & Population Mechanics

### 3.1 Backend Aggregation (`app/services/surveillance.py`, lines 770-800 & 901-916)
The summary dictionary returned by `get_surveillance_grid()` compiles per-user workload statistics from `db_task_catalog`:
```python
raw_u = item.user_name or 'Unassigned'
assignees_list = [u.strip() for u in raw_u.split(',') if u.strip()]
for u_name in assignees_list:
    if u_name not in user_stats:
        user_stats[u_name] = {'total': 0, 'updated': 0, 'pending': 0, 'windows': 0, ...}
    user_stats[u_name]['total'] += 1
...
teammates = {}
for u, st in user_stats.items():
    pct = int(round((st['updated'] / st['total']) * 100)) if st['total'] > 0 else 0
    teammates[u] = {
        'total': st['total'], 'updated': st['updated'], 'pending': st['pending'],
        'windows': st['windows'], 'pct': pct, ...
    }
summary['teammates'] = teammates
```
Currently, `summary['teammates']` contains metrics for all teammates unconditionally.

### 3.2 Frontend Chip Rendering (`app/static/js/crishi.js`, lines 928-972)
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

### 3.3 The Role Scoping Defect in Portfolios
When a user with `role === 'Teammate'` (e.g., Bhawna) logs in:
1. `renderTeammateChips()` renders the `"All Teammates"` chip.
2. It loops through all `priorityUsers` (`['Nishant', 'Bhawna', 'Gopi', 'Pankaj', 'Nitesh']`) and renders chips for all of them.
3. The hint header states: `"Showing tasks for all teammates"`.
4. The Assignee Filter dropdown (`#filter-assignee` and `#date-filter-assignee`) lists all assignees (`Nishant`, `Bhawna`, `Gopi`, `Pankaj`, `Nitesh`).
5. Clicking another teammate's chip filters and reveals that teammate's full table workload.

---

## 4. Commodity, Report, and Table Mapping Architecture

The application maps data across three relational layers:

### 4.1 Commodity Assignments
- Stored as a primary string attribute in `users.commodities` (e.g. `'Cotton, Rapeseed, Soybeans, Weather'`).
- Backed by relational rows in `user_commodity_mappings`:
  ```sql
  user_id | commodity | mapping_config
  --------+-----------+----------------
  7       | Cotton    | {}
  7       | Rapeseed  | {}
  7       | Soybeans  | {}
  7       | Weather   | {}
  ```

### 4.2 Report Assignments
- Defined in `reports`:
  `id`, `name`, `commodity`, `user_id` (FK to `users.id`), `primary_assignee`, `backup_1`, `backup_2`, `frequency`, `deadline`.
- Relational link via `user_report_mappings`:
  `user_id`, `report_id`, `report_name`, `timing_schedule`, `deadline`, `frequency`.
- For scanned/ingested reports (`EmailReport`, `MISReportUpload`), category is normalized into the 16 authoritative commodities via `infer_commodity()`.

### 4.3 Table Assignments
- Defined in `db_task_catalog`:
  - `user_name`: Assignee name string (e.g. `'Gopi'`, `'Nishant'`, `'Nitesh'`, `'Bhawna'`, `'Pankaj'`, or multi-assignee string `'Nishant, Bhawna, Pankaj, Nitesh, Gopi'`).
  - `commodity`: Normalized commodity string (e.g. `'Soybeans'`, `'Pulses'`, `'Rice'`, `'Wheat'`).
  - `commodity_config`: JSON configuration supporting per-commodity assignees:
    ```json
    {"Bajra": {"frequency": "Weekly", "cutoff_time": "18:00", "assigned_user": "Nitesh"}, "Maize": {"frequency": "Daily", "cutoff_time": "18:00", "assigned_user": "Nitesh"}}
    ```

### 4.4 Resolving Teammate Ownership
A table or report is owned by a teammate if:
1. `table.user_name` contains the user's name (`user.name`), OR
2. `table.commodity_config` explicitly specifies `assigned_user == user.name`, OR
3. `table.commodity` intersects with the user's assigned commodities (`user.commodities` / `user_commodity_mappings`).

---

## 5. Surveillance Grid and Reports Queries and Flow

### 5.1 Surveillance Grid Route (`app/routes/crishi.py`:16-32)
```python
@crishi_bp.route('/grid', methods=['GET'])
@jwt_required(optional=True)
def get_grid():
    force = request.args.get('refresh', 'false').lower() == 'true'
    target_date = request.args.get('date', '').strip() or None
    tasks, summary = get_surveillance_grid(target_date_str=target_date, force_refresh=force)
    return jsonify({
        'success': True,
        'count': len(tasks),
        'tasks': tasks,
        'summary': summary,
        'commodity_rollups': summary.get('commodity_rollups', []),
        'date_summary': summary.get('date_summary', {}),
        'selected_date': summary.get('date_summary', {}).get('selected_date', str(date.today()))
    })
```
- **Flaw**: Because `@jwt_required(optional=True)` is used and the user's role is never checked, no filtering occurs on the server.
- **Exposure**: All 158 monitored tables, completion metrics across all teammates, and full database timestamps are returned regardless of role.

### 5.2 Reports Catalog Route (`app/routes/crishi.py`:1165-1175)
```python
@crishi_bp.route('/reports/all', methods=['GET'])
@jwt_required(optional=True)
def get_all_reports():
    data = get_all_scanned_reports()
    return jsonify({
        'success': True,
        'total': len(data),
        'reports': data
    })
```
- **Flaw**: Returns all 290+ scanned market reports across all 16 commodities to any requester without role filtering.

### 5.3 PDF Retrieval Route (`app/routes/crishi.py`:1214-1240)
```python
@crishi_bp.route('/reports/pdf', methods=['GET'])
@jwt_required(optional=True)
def get_report_pdf():
    ...
    return send_file(abs_path, mimetype='application/pdf')
```
- **Flaw**: Teammates can fetch PDF files for any commodity report simply by supplying query parameters (`file=...&cat=...`).

---

## 6. Comprehensive Scoping Inventory & Recommendations

To guarantee complete compliance with Requirement R1, role scoping must be implemented using a **defense-in-depth model**:
1. **Server-Side Enforcement**: Strict filtering at the API layer so unauthorized commodities, reports, and table rows are never transmitted over the network to Teammates.
2. **Client-Side Scoping**: Strict UI presentation logic hiding the "All Teammates" chip, other teammate chips, unauthorized dropdown options, and unauthorized commodity category pills.

### 6.1 Backend Endpoints Requiring Scoping

| Endpoint | File & Line | Current Behavior | Target Behavior for Admins (`SuperAdmin`, `Manager`, `Leader`) | Target Behavior for Teammates (`Teammate`) |
|---|---|---|---|---|
| `GET /api/crishi/grid` | `app/routes/crishi.py`:16-32 | Returns all 158 tables and all teammates in `summary`. | Returns full unrestricted grid, all 158 tables, all commodity rollups, and all teammate metrics. | Filter `tasks` strictly to teammate's assigned tables and commodities. Filter `summary['teammates']` to only `{user.name: user_stats}`. Filter `commodity_rollups` to assigned commodities. Recalculate scoped KPI counters. |
| `GET /api/crishi/reports/all` | `app/routes/crishi.py`:1165-1175 | Returns all 290+ reports across all commodities. | Returns all 290+ scanned reports across all 16 commodities. | Filter `reports` strictly to records whose `category` matches one of the teammate's assigned commodities or whose `report_name` is assigned to them. |
| `GET /api/crishi/reports/pdf` | `app/routes/crishi.py`:1214-1240 | Sends PDF for any report without validation. | Full unrestricted access to download/view all report PDFs. | Reject (HTTP 403) if the requested PDF's commodity category is not among the teammate's assigned commodities. |
| `POST /api/crishi/pull` | `app/routes/crishi.py`:34-74 | Allows any authenticated user to trigger Manager Pull. | Allowed for SuperAdmin, Manager, Leader. | Reject with HTTP 403 Forbidden (Teammates cannot perform manager pulls). |
| `POST /api/crishi/skip` | `app/routes/crishi.py`:76-113 | Allows any authenticated user to trigger Admin Skip. | Allowed for SuperAdmin, Manager, Leader. | Reject with HTTP 403 Forbidden (Teammates cannot approve administrative skips). |
| `POST /api/crishi/sync-report-db` | `app/routes/crishi.py`:115-250 | Syncs DB verification; accepts any `userName` or `catalogId`. | Full access to sync any table or all users. | Restrict to catalog items assigned to the teammate; force `user_identity = user.name`. |
| `POST /api/crishi/remark` | `app/routes/crishi.py`:252-338 | Adds operational remark to any table. | Allowed on all tables. | Only allowed on tables assigned to the teammate (HTTP 403 otherwise). |
| `POST /api/crishi/manager-review` | `app/routes/crishi.py`:357-449 | Submits manager review. | Allowed for SuperAdmin, Manager, Leader. | Reject with HTTP 403 Forbidden. |
| `PUT /api/crishi/source` | `app/routes/crishi.py`:451-477 | Edits table source URL/pipeline. | Allowed for SuperAdmin, Manager, Leader. | Reject with HTTP 403 Forbidden. |
| `GET /api/mis/reports` | `app/routes/mis_report.py`:20-55 | Filters if not `role_at_least(user.role, 'Manager')` (blocking Leaders). | Treat `Leader` as Admin role (`is_admin_role`), returning all reports. | Return only reports assigned to the teammate. |

### 6.2 Frontend Code Requiring Scoping

| File | Functions & Lines | Required Scoping Modification |
|---|---|---|
| `app/static/js/crishi.js` | `renderTeammateChips()` (lines 928-972) | Check `const isAdmin = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role);`. If `!isAdmin`: completely omit the "All Teammates" chip and chips for other teammates. Render **only** the logged-in teammate's chip (`window.currentUser.name`). Set `this.activeUserFilter = window.currentUser.name`. Update hint `#user-workload-hint` and `#date-user-workload-hint` to indicate personal workload. |
| `app/static/js/crishi.js` | `render()` & filter initialization (lines 353-363, 4486-4496) | For Teammates, hide or lock the Assignee dropdown (`#filter-assignee` and `#date-filter-assignee`) so they cannot select other users. Scope the commodity dropdown to only the teammate's assigned commodities. |
| `app/static/js/crishi.js` | `init()` & `loadGrid()` (lines 820-848) | If user is a Teammate, automatically initialize `this.activeUserFilter = window.currentUser.name` so that local filter computations remain strictly bound to the user. |
| `app/static/js/crishi.js` | `applyFilters()` (lines 3671-3770) | When `!isAdmin`, enforce an invariant that `matchUser` strictly matches `window.currentUser.name` and `matchComm` strictly matches the teammate's assigned commodities. |
| `app/static/js/report.js` | `renderCategoryPills()` (lines 514-570) | If user is a Teammate, filter `priorityCategories` to include **only** commodities assigned to `window.currentUser` (from `window.currentUser.assignedCommodities` or `window.currentUser.commodities`). Hide all other commodity pills. |
| `app/static/js/report.js` | `renderDateHub()` & `renderDispatchBanner()` (lines 253-497) | Scope report counts and commodity badges displayed in the intelligence banner to only reflect the teammate's assigned reports and commodities. |
| `app/static/js/auth.js` | `setupUser()` (lines 93-117) | Ensure `user.role` is stored and dispatched accurately, and admin UI items are made visible for `Leader` as well where appropriate. |

---

## 7. Concrete Implementation Design & Code Snippets

### 7.1 Backend Role Helper (`app/auth.py`)
```python
# Before (app/auth.py:15):
ROLE_LEVEL = {'Teammate': 1, 'Manager': 2, 'SuperAdmin': 3}

# Proposed Update:
ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}
ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}

def is_admin_role(user_role):
    """Returns True if the role is an Admin role (SuperAdmin, Manager, Leader)."""
    return (user_role or '').strip() in ADMIN_ROLES
```

### 7.2 Backend Teammate Surveillance Grid Scoping (`app/routes/crishi.py`)
```python
def get_user_assigned_commodities(user):
    """Collects authoritative set of normalized commodity names assigned to a user."""
    comms = set()
    if user.commodities:
        for c in user.commodities.split(','):
            c = c.strip()
            if c:
                comms.add(c.lower())
    for cm in (user.commodity_mappings or []):
        if cm.commodity and cm.commodity.strip():
            comms.add(cm.commodity.strip().lower())
    return comms

@crishi_bp.route('/grid', methods=['GET'])
@jwt_required(optional=True)
def get_grid():
    user = get_current_user()
    is_admin = bool(user and is_admin_role(user.role))

    force = request.args.get('refresh', 'false').lower() == 'true'
    target_date = request.args.get('date', '').strip() or None
    tasks, summary = get_surveillance_grid(target_date_str=target_date, force_refresh=force)

    # If Admin or unauthenticated dev mode: full unrestricted access
    if is_admin or not user:
        return jsonify({
            'success': True,
            'count': len(tasks),
            'tasks': tasks,
            'summary': summary,
            'commodity_rollups': summary.get('commodity_rollups', []),
            'date_summary': summary.get('date_summary', {}),
            'selected_date': summary.get('date_summary', {}).get('selected_date', str(date.today()))
        })

    # Teammate Role Scoping:
    u_name = (user.name or '').strip().lower()
    user_comms = get_user_assigned_commodities(user)

    def is_task_assigned_to_teammate(t):
        t_user = (t.get('user') or '').lower()
        assignees = [a.strip() for a in t_user.split(',') if a.strip()]
        if u_name in assignees or (u_name in t_user and len(u_name) > 2):
            return True
        t_comm = (t.get('commodity') or '').lower()
        t_comm_parts = [p.strip() for p in t_comm.split(',') if p.strip()]
        if any(p in user_comms for p in t_comm_parts):
            return True
        # Check commodity_config
        cfg = t.get('commodity_config') or {}
        if isinstance(cfg, dict):
            for c_name, c_data in cfg.items():
                if isinstance(c_data, dict) and c_data.get('assigned_user', '').lower() == u_name:
                    return True
        return False

    scoped_tasks = [t for t in tasks if is_task_assigned_to_teammate(t)]
    
    # Scope summary teammates to only current user
    scoped_teammates = {}
    if user.name in summary.get('teammates', {}):
        scoped_teammates[user.name] = summary['teammates'][user.name]
    else:
        # Fallback case-insensitive match
        for k, v in summary.get('teammates', {}).items():
            if k.lower() == u_name:
                scoped_teammates[k] = v
                break

    # Scope commodity rollups
    scoped_rollups = [
        r for r in summary.get('commodity_rollups', [])
        if any(c in user_comms for c in [p.strip().lower() for p in r.get('commodity', '').split(',')])
    ]

    # Recalculate scoped KPI counters
    scoped_updated = len([t for t in scoped_tasks if t.get('is_updated_today')])
    scoped_total = len(scoped_tasks)
    scoped_pct = int(round((scoped_updated / scoped_total) * 100)) if scoped_total > 0 else 0
    scoped_pending = scoped_total - scoped_updated
    scoped_windows = len([t for t in scoped_tasks if t.get('today_status') in ('WINDOW_ACTIVE', 'AWAITING_WINDOW')])
    scoped_correction = len([t for t in scoped_tasks if t.get('today_status') == 'NEED_CORRECTION'])

    scoped_summary = dict(summary)
    scoped_summary['total_tasks'] = scoped_total
    scoped_summary['updated_today'] = scoped_updated
    scoped_summary['pending_action'] = scoped_pending
    scoped_summary['completion_rate'] = scoped_pct
    scoped_summary['cycle_windows'] = scoped_windows
    scoped_summary['need_correction'] = scoped_correction
    scoped_summary['teammates'] = scoped_teammates
    scoped_summary['commodity_rollups'] = scoped_rollups

    return jsonify({
        'success': True,
        'count': len(scoped_tasks),
        'tasks': scoped_tasks,
        'summary': scoped_summary,
        'commodity_rollups': scoped_rollups,
        'date_summary': summary.get('date_summary', {}),
        'selected_date': summary.get('date_summary', {}).get('selected_date', str(date.today()))
    })
```

### 7.3 Frontend Teammate Chips Scoping (`app/static/js/crishi.js`)
```javascript
// In renderTeammateChips():
renderTeammateChips() {
    const containers = [
        document.getElementById('teammate-chips-container'),
        document.getElementById('date-teammate-chips-container')
    ].filter(Boolean);
    if (containers.length === 0) return;

    const isAdmin = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role);
    const tm = this.summary.teammates || {};
    const priorityUsers = this.getActiveUsersSync();

    let html = '';

    if (isAdmin) {
        // Admin: Show "All Teammates" and all teammate chips
        html += `
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

        // Set hint
        const hintEl = document.getElementById('user-workload-hint');
        const dateHintEl = document.getElementById('date-user-workload-hint');
        if (hintEl) hintEl.textContent = this.activeUserFilter === 'ALL' ? 'Showing tasks for all teammates' : `Showing tasks for ${this.activeUserFilter}`;
        if (dateHintEl) dateHintEl.textContent = this.activeUserFilter === 'ALL' ? 'Showing tasks for all teammates' : `Showing tasks for ${this.activeUserFilter}`;
    } else {
        // Teammate Role: Hide "All Teammates" and hide other teammates completely!
        const myName = window.currentUser?.name || 'My Portfolio';
        const st = tm[myName] || { updated: 0, total: this.tasks.length, pct: 0, windows: 0 };
        this.activeUserFilter = myName;

        html = `
            <button class="user-chip-btn active" data-user="${myName}">
                <span><i class="fas fa-user-circle" style="margin-right: 4px;"></i>${myName}</span>
                <span class="badge" style="background: rgba(255,255,255,0.25); font-size: .72rem;">
                    ${st.updated}/${st.total} (${st.pct}%)
                </span>
                ${st.windows > 0 ? `<span style="color: #0ea5e9; font-size: .7rem;" title="Has active 15th-20th cycle window"><i class="fas fa-calendar-alt"></i></span>` : ''}
            </button>
        `;

        const hintEl = document.getElementById('user-workload-hint');
        const dateHintEl = document.getElementById('date-user-workload-hint');
        if (hintEl) hintEl.textContent = `Showing your assigned workload: ${myName}`;
        if (dateHintEl) dateHintEl.textContent = `Showing your assigned workload: ${myName}`;

        // Lock / hide assignee dropdowns for Teammate
        ['filter-assignee', 'date-filter-assignee'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = `<option value="${myName}">${myName}</option>`;
                el.disabled = true;
            }
        });
    }

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

---

## 8. Verification & Automated Test Strategy

To verify the role scoping implementation without modifying or corrupting real production/stage database data:
1. **Isolated Dev Accounts**:
   - SuperAdmin: `nishant@agalabs.com` / `vaibhav@agalabs.com`
   - Manager: `ram@agalabs.com`
   - Leader: Create or configure a test Leader (e.g. `leader@agalabs.com` or temporary test user)
   - Teammates: `bhawna@agalabs.com` (assigned Cotton, Rapeseed, Soybeans, Weather), `gopichand@agalabs.com` (assigned Rice, Wheat), `nitesh@agalabs.com` (assigned Bajra, Barley, Maize, Sugar), `pankaj@agalabs.com` (assigned Chilli, Coriander, Cumin, Turmeric, Weather).
2. **Automated Integration Tests**:
   - `test_admin_full_access()`: Authenticate as `SuperAdmin`, `Manager`, and `Leader`. Verify `GET /api/crishi/grid` returns >= 156 items, and `summary['teammates']` contains all teammates. Verify `GET /api/crishi/reports/all` returns all reports across all 16 commodities.
   - `test_teammate_grid_scoping()`: Authenticate as `bhawna@agalabs.com`. Verify `GET /api/crishi/grid` returns only tables for Bhawna's assigned commodities (`Soybeans`, `Rapeseed`, `Cotton`, `Weather`) and tables assigned to `Bhawna`. Verify `summary['teammates']` contains only `Bhawna`. Verify tables assigned only to `Gopi` or `Nitesh` are strictly absent.
   - `test_teammate_reports_scoping()`: Authenticate as `bhawna@agalabs.com`. Verify `GET /api/crishi/reports/all` returns only reports for `Soybeans`, `Rapeseed`, `Cotton`, and `Weather`. Verify reports for `Bajra`, `Chilli`, and `Rice` are absent.
   - `test_teammate_action_restrictions()`: Verify `POST /api/crishi/pull` and `POST /api/crishi/skip` return HTTP 403 Forbidden when called by a Teammate token.
   - `test_teammate_portfolio_chips()`: Verify DOM rendering contains only one chip (`Bhawna`) and no "All Teammates" chip when authenticated as a Teammate.
