# Project: Advance ERP Role Scoping and Immutable Update History Tracking

## Architecture
- **Authentication & Authorization**: `app/auth.py` and `app/models.py`. Role hierarchy: `SuperAdmin` (3), `Manager` (2), `Leader` (2), `Teammate` (1). Admin roles defined as `{'SuperAdmin', 'Manager', 'Leader'}`.
- **Surveillance & Report Scoping**: `app/routes/crishi.py`. Dual-branch access control for `GET /crishi/grid` and `GET /crishi/reports/all`. Admins have unrestricted visibility; Teammates receive strictly their assigned tables, commodity rollups, reports, and individual summary metrics.
- **Update History Tracking**:
  - Model: `TableUpdateHistory` in `app/models.py`. Stores immutable person-basis records: `person_name`, `table_name`, `final_name`, `commodity`, `db_update_timestamp`, `report_date`, `status`, `row_count`, `remarks`.
  - Service: `app/services/history_service.py` extracts DB update timestamps directly from MySQL `agalabsdev_stage` (and fallback CSV snapshots).
  - Sync Hook: `/api/crishi/sync-report-db` appends immutable records on verification.
  - Endpoint: `GET /api/crishi/update-history` with Admin/Teammate scoping.
- **Frontend Integration**:
  - `app/static/js/crishi.js`: Dedicated 'Update History' tab (`#tab-history` / `#view-history`) alongside Surveillance and Roster.
  - Teammate portfolio chips in `renderTeammateChips()`: For Teammates, hide "All Teammates" and other teammate chips, showing only the logged-in user's chip.
  - Interactive chip linking: Clicking a portfolio chip opens/filters that teammate's update history directly.
- **Automated Test Suite**:
  - `tests/test_crishi_history_and_scoping.py` (unit & integration tests for R1-R4).
  - Existing regression suite: `tests/test_quality_audit_regression.py` verified intact.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Leader Role in Auth Hierarchy | Add Leader (level 2) to ROLE_LEVEL and define ADMIN_ROLES in app/auth.py | M1 | Survey (R1) |
| 2 | Backend Surveillance Grid Scoping | Enforce role-based scoping in GET /crishi/grid for Admins vs Teammates | M1 | Survey (R1) |
| 3 | Backend Reports Scoping | Enforce role-based commodity/duty scoping in GET /crishi/reports/all | M1 | Survey (R1) |
| 4 | Admin Route Protection | Protect /crishi/pull, /crishi/skip, /crishi/manager-review to Admin roles only | M1 | Survey (R1) |
| 5 | TableUpdateHistory Model & DDL | Define immutable TableUpdateHistory model with all 9 required fields | M2 | Survey (R2) |
| 6 | Direct DB Update History Extraction | Query update timestamps directly from agalabsdev_stage and catalog mapping | M2 | Survey (R2) |
| 7 | Append-Only Verification Logging | Hook sync_report_db to append immutable records to TableUpdateHistory | M2 | Survey (R2) |
| 8 | Update History API Endpoint | Implement GET /api/crishi/update-history with role-based scoping | M2 | Survey (R2) |
| 9 | Teammate Portfolio Chips Scoping | Restrict portfolio chips to own chip for Teammates; show all for Admins | M3 | Survey (R1, R3) |
| 10 | Dedicated Update History Tab UI | Add Update History tab and panel in Crishi with filter controls and data table | M3 | Survey (R3) |
| 11 | Direct Portfolio Chip History Linking | Enable clicking a portfolio chip to open/filter that teammate's update history | M3 | Survey (R3) |
| 12 | Opaque-Box E2E Test Suite | Design 4-tier requirement-driven E2E test suite and publish TEST_READY.md | Track E2E | Survey (R4) |
| 13 | Automated Test Verification (R4) | Implement comprehensive tests for role scoping, update history, and immutability | M4 | Survey (R4) |
| 14 | Final E2E Pass & Adversarial Hardening | Execute 100% test pass, stress-test security boundaries, and pass Forensic Audit | M5 | Survey (All) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Role Scoping & Auth Hierarchy | Role definitions, Leader role, GET /crishi/grid scoping, GET /crishi/reports/all scoping, admin routes | none | PLANNED |
| M2 | Immutable Update History Backend & Service | TableUpdateHistory model, DB timestamp extraction service, append-only sync hook, GET /api/crishi/update-history | M1 | PLANNED |
| M3 | Crishi UI Integration | Update History tab, data table, filters, Teammate chip scoping, chip click history navigation | M1, M2 | PLANNED |
| M4 | Automated Verification Test Suite | tests/test_crishi_history_and_scoping.py covering R1, R2, R3, R4 with dev test accounts | M1, M2, M3 | PLANNED |
| M5 | Final Milestone: E2E Pass & Adversarial Hardening | 100% test suite pass (Tiers 1-4), Tier 5 adversarial testing, Forensic Integrity Audit | M4, Track E2E | PLANNED |

## E2E Testing Track
| Track | Name | Scope | Dependencies | Status |
|-------|------|-------|-------------|--------|
| E2E | Independent E2E Test Suite | Requirement-driven opaque-box tests covering all R1-R4 acceptance criteria -> TEST_READY.md | Survey complete | IN_PROGRESS |

## Interface Contracts
### Auth & Role Utilities (`app/auth.py`)
- `ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}`
- `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}`
- `is_admin_role(role: str) -> bool`: returns `role in ADMIN_ROLES`

### Surveillance Grid Endpoint (`GET /crishi/grid`)
- Headers: `Authorization: Bearer <jwt>`
- Query: `date=<YYYY-MM-DD>`, `refresh=<bool>`
- Admin response: `tasks` (all 158), `summary['teammates']` (all active teammates), all `commodity_rollups`.
- Teammate response: `tasks` (strictly user assigned tables), `summary['teammates']` (strictly `{<user_name>: {...}}`), `commodity_rollups` (strictly assigned commodities).

### Update History Model (`app/models.py`)
- Table name: `table_update_history`
- Columns:
  - `id`: Integer, primary_key=True
  - `person_name`: String(100), nullable=False
  - `table_name`: String(150), nullable=False
  - `final_name`: String(255), nullable=False
  - `commodity`: String(100), nullable=False
  - `db_update_timestamp`: DateTime, nullable=False
  - `report_date`: Date, nullable=False
  - `status`: String(50), nullable=False
  - `row_count`: Integer, nullable=False, default=0
  - `remarks`: Text, nullable=True
  - `catalog_id`: Integer, nullable=True
  - `created_at`: DateTime, default=datetime.utcnow

### Update History Endpoint (`GET /api/crishi/update-history`)
- Headers: `Authorization: Bearer <jwt>`
- Query params: `teammate`, `commodity`, `date_from`, `date_to`, `status`, `search`
- Admin response: can query any teammate or all records.
- Teammate response: `teammate` parameter forced to current user; returns only own update records.

## Code Layout
- `app/auth.py`: Authentication, JWT tokens, role hierarchy
- `app/models.py`: Database models (User, DBTaskCatalog, TableUpdateHistory)
- `app/routes/crishi.py`: Crishi API routes (/grid, /reports/all, /sync-report-db, /update-history)
- `app/services/surveillance.py` & `app/services/history_service.py`: Stage DB extraction and surveillance logic
- `app/static/js/crishi.js`: Crishi frontend SPA module, tab management, portfolio chips, update history view
- `app/static/js/report.js`: Report categories and pills scoping
- `tests/test_crishi_history_and_scoping.py`: Dedicated verification test suite
