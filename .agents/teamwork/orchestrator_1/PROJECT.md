# Project: Scanned Reports Deduplication, Commodity Filter & Market History

## Architecture
- **Backend Services**:
  - `app/services/email_ingestion.py`: Gmail dispatches ingestion with frequency detection (`Daily` vs `Weekly`) and composite frequency-aware deduplication keys.
  - `app/services/history_service.py`: Centralized `COMMODITY_ALIASES_MAP`, alias resolver, and `build_commodity_history_filter` utilizing MySQL `REGEXP` token boundary matching with fallback.
- **Backend Routes**:
  - `app/routes/crishi.py`:
    - `get_update_history` (`GET /api/crishi/update-history`): Invokes `build_commodity_history_filter` for bidirectional commodity alias matching across `commodity` and `final_name` without false positive substring collisions.
    - `get_all_scanned_reports` (`GET /api/crishi/reports/all`): Elimination of synthetic companion reports (removal of lines 1411-1442) and frequency-aware deduplication for Gmail and MIS uploads (`f"mis_{clean_name}_{u_freq}_{u_date}"`).
- **Frontend Modules**:
  - `app/static/js/crishi.js`: Update History dropdown `#history-filter-commodity` enriched with grouped pulse sub-commodities and alias indicators.
  - `app/static/js/report.js`: Integration of `.crishi-tabs` with `#tab-report-dispatches` and `#tab-report-commodity-history`, `#view-report-commodity-history` container with commodity dropdown, quick pills, frequency filter, overview banner, Market Reports panel, and Database Updates panel with token boundary RegExp protection.
- **Database**:
  - MySQL (`advance_erp`): `users` (9 baseline), `reports` (27 baseline), `db_task_catalog` (158 baseline), `table_update_history` (audit records intact).

## Feature Inventory
Every feature from the Survey phase is mapped, implemented, and verified:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Frequency-Aware Ingestion Deduplication | Key on `f"{comm}_{freq}_{r_date_str}"` in `email_ingestion.py` so same-date Daily & Weekly reports are both ingested and never overwritten | M1 | Survey R1 |
| 2 | Elimination of Synthetic Companion Reports | Remove synthetic companion loop (`crishi.py:1411-1442`) so only genuine reports from Gmail, MIS uploads, IPGA, and sample PDFs are listed | M1 | Survey R1 |
| 3 | Frequency-Aware MIS Upload Deduplication | Key MIS uploads on `f"mis_{clean_name}_{u_freq}_{u_date}"` so same-date Daily and Weekly uploads are not dropped | M1 | Survey R1 |
| 4 | Bidirectional Commodity Alias Resolver | Centralized alias mapping in `history_service.py` (`COMMODITY_ALIASES_MAP`, `build_commodity_history_filter`) using token word boundaries | M1 | Survey R2 |
| 5 | Update History Endpoint Alias Filtering | Use alias filter in `GET /api/crishi/update-history` to match records by commodity and aliases without substring collisions | M1 | Survey R2 |
| 6 | Crishi Update History UI Filter Enhancement | Update `#history-filter-commodity` in `crishi.js` with grouped sub-commodities and alias options | M2 | Survey R2 |
| 7 | Market & Intelligence Reports Tab Integration | Add `.crishi-tabs` and dual views (`#view-report-dispatches` and `#view-report-commodity-history`) in `report.js` | M2 | Survey R3 |
| 8 | Commodity History Filter Controls & Banner | Add `#commodity-history-select`, quick pills, frequency filter, search, and overview statistics banner in `report.js` | M2 | Survey R3 |
| 9 | Dual Commodity History Panels | Render Market Reports History and Database Updates sub-panels with 3-in-1 report inspection in `report.js` | M2 | Survey R3 |
| 10| System & Database Invariants Verification | Verify 9 users, 27 reports, 158 catalog mappings intact, pass 135/135 tests, ensure port 5000 operation | M3 | Survey R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Ingestion & Alias Filtering | `app/services/email_ingestion.py`, `app/routes/crishi.py`, `app/services/history_service.py` | None | COMPLETED |
| M2 | Frontend UI Integration & Tabs | `app/static/js/crishi.js`, `app/static/js/report.js` | M1 | COMPLETED |
| M3 | Comprehensive Verification & Forensic Audit | Pass 135/135 tests, zero data loss assertion, adversarial challenger & forensic auditor | M1, M2 | COMPLETED |

## Interface Contracts
### Service: `build_commodity_history_filter`
- Signature: `build_commodity_history_filter(comm_param, dialect_name='mysql') -> BinaryExpression`
- Resolves aliases (e.g., `Chana` -> `Pulses`, `Mustard` -> `Rapeseed`, `Corn` -> `Maize`, `Jeera` -> `Cumin`, `Dhaniya` -> `Coriander`).
- Uses word boundaries `r'(^|[^a-zA-Z])(tokens)([^a-zA-Z]|$)'` on `commodity` and `final_name` to prevent substring collisions (`tur` in `Futures`, `rice` in `Prices`).

### Endpoint: `GET /api/crishi/reports/all`
- Returns only genuine reports (`total: 354`).
- Contains exactly 0 synthetic companion reports signed by `Agalabs Market Research & Intelligence Desk`.
- Preserves both Daily and Weekly reports for the same commodity on the same date.

### Endpoint: `GET /api/crishi/update-history`
- Query param `?commodity=...` matches canonical names and all aliases.
- Non-existent commodities return `total: 0, count: 0`.

### UI Selectors in `report.js`:
- Module tabs: `#tab-report-dispatches`, `#tab-report-commodity-history`
- Views: `#view-report-dispatches`, `#view-report-commodity-history`
- Commodity selector: `#commodity-history-select`
- Quick pills: `#commodity-history-pills`
- Frequency filter: `#commodity-history-frequency`
- Search: `#commodity-history-search`
- Sub-panels: `#subview-comm-reports`, `#subview-comm-dbupdates`

## Code Layout
- Backend Services: `app/services/email_ingestion.py`, `app/services/history_service.py`
- Backend Routes: `app/routes/crishi.py`
- Frontend Scripts: `app/static/js/crishi.js`, `app/static/js/report.js`
- Test Suite: `tests/test_crishi_history_and_scoping.py`
