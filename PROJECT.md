# Project: Advance ERP Crishi Role Scoping & Update History

## Architecture
- **Backend**: Flask application (`app/`), SQLAlchemy ORM (`app/models.py`), JWT authentication (`app/auth.py`), Crishi routes (`app/routes/crishi.py`), Admin routes (`app/routes/admin.py`), History extraction service (`app/services/history_service.py`).
- **Database**: MySQL (`advance_erp`), core tables: `users` (9 baseline), `reports` (27 baseline), `db_task_catalog` (158 baseline), `table_update_history`.
- **Frontend**: Vanilla JavaScript SPA shell (`app/templates/index.html`), dynamic module loader (`app/static/js/app.js`), Crishi module (`app/static/js/crishi.js`), Auth (`app/static/js/auth.js`), API client (`app/static/js/api.js`).
- **Testing**: Unittest test suite with 135 tests (`tests/test_crishi_history_and_scoping.py`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Role-based Access Scoping | Admins have unrestricted access to commodities, reports, tables; Teammates scoped strictly to own portfolio | M1 & M2 | ORIGINAL_REQUEST §R1 |
| 2 | Mutating Admin Route Guarding | `/api/crishi/pull`, `/api/crishi/skip`, `/api/crishi/manager-review`, roster rotation enforce `@admin_required` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | TableUpdateHistory Model & Table | `table_update_history` in MySQL with 9 fields and dual camelCase/snake_case serialization | M1 | ORIGINAL_REQUEST §R2 |
| 4 | Fallback App Context in History Service | `extract_table_db_update_history` runs standalone outside active Flask context using fallback | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Context-Safe Model Queries | `TableUpdateHistory.query` operates seamlessly inside and outside active request contexts | M1 | Survey Findings |
| 6 | Admin User Validation | `POST /api/admin/users` validates non-null, non-empty `name` (returning 400/422) | M1 | Survey Findings |
| 7 | GET /api/crishi/update-history Endpoint | Scoped history extraction with admin query filters, teammate personal scoping, and 405 on mutations | M1 | ORIGINAL_REQUEST §R2 |
| 8 | Auto-Sync History Append Hook | `POST /api/crishi/sync-report-db` automatically commits `TableUpdateHistory` record on sync | M1 | ORIGINAL_REQUEST §R2 |
| 9 | Update History Tab & View in UI | Dedicated `#tab-history` and `#view-history` timeline in Crishi UI | M2 | ORIGINAL_REQUEST §R3 |
| 10 | Teammate Portfolio Chip Scoping | Teammates only see their own chip; Admins see all chips + All Teammates | M2 | ORIGINAL_REQUEST §R3 |
| 11 | Chip-Linked History Filtering | Clicking a portfolio chip filters update history by teammate (Admins) or shows own history (Teammates) | M2 | ORIGINAL_REQUEST §R3 |
| 12 | 135-Test Suite Pass & DB Invariants | 135/135 tests passing; strictly exactly 9 users, 27 reports, 158 catalog mappings intact | M3 | ORIGINAL_REQUEST §R4 |
| 13 | Interactive Column Header Sort Buttons | Clickable sorting buttons on all 10 table headers (`ID`, `Report Date`, `Commodity`, `Table Name`, `Final Name`, `Updated By`, `DB Timestamp`, `Row Count`, `Status`, `Remarks`) with bidirectional indicators | M2 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Context Decoupling & API Hardening | `app/services/history_service.py`, `app/models.py`, `app/routes/admin.py` | None | COMPLETED |
| M2 | Frontend UI Integration & Role Scoping | `app/static/js/crishi.js`, `app/templates/index.html` | M1 | COMPLETED |
| M3 | Full Suite Verification & Forensic Audit | Pass 135/135 tests, zero data loss assertion, adversarial challenger & forensic auditor | M1, M2 | COMPLETED |

## Interface Contracts
### Service: `extract_table_db_update_history`
- Signature: `extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None) -> dict`
- Keys: `db_update_timestamp`, `row_count`, `status`, `latest_date`, `table_name`, `verified`, `source_type`
- Execution: Must succeed both inside active Flask application context and standalone outside context (auto-pushes app context if `not has_app_context()`).

### Endpoint: `GET /api/crishi/update-history`
- Security: `@jwt_required()`
- Query params: `teammate`, `commodity`, `date_from`, `date_to`, `status`, `search`, `limit`, `offset`
- Response: `{"success": true, "history": [...], "records": [...], "total": int, "count": int}`
- Mutations: PUT, POST, PATCH, DELETE return HTTP 405 Method Not Allowed.

### UI Selectors
- Tab button: `#tab-history` inside `.crishi-tabs`
- View container: `#view-history` inside `.crishi-view`
- Chips container: `#history-teammate-chips-container`
- Filters: `#history-search`, `#history-filter-commodity`, `#history-filter-date-from`, `#history-filter-date-to`, `#history-filter-status`, `#btn-refresh-history`
- Table: `#history-master-table`, `#history-tbody`, `#history-records-count`

## Code Layout
- Backend Models: `app/models.py`
- Backend Services: `app/services/history_service.py`
- Routes: `app/routes/crishi.py`, `app/routes/admin.py`
- Auth: `app/auth.py`
- Frontend Shell: `app/templates/index.html`
- Frontend Scripts: `app/static/js/crishi.js`, `app/static/js/auth.js`, `app/static/js/api.js`
- Test Suite: `tests/test_crishi_history_and_scoping.py`
