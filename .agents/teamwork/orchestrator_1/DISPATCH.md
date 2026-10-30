## 2026-10-28T20:11:57Z

Complete the implementation and verification for Advance ERP Crishi Role Scoping & Update History for production deployment in Advance ERP.

Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP
Integrity mode: development

## Requirements

### R1. Role-Based Access Scoping
Enforce role-based access scoping for Admins (SuperAdmin, Manager, Leader) and Teammates across the Advance ERP Crishi module:
- Admins have unrestricted access to all commodities, reports, tables, and teammate portfolio chips.
- Teammates (e.g., Bhawna, Gopi, Nitesh, Pankaj) see strictly their own portfolio chips, assigned commodities, assigned reports, and table tasks.
- Mutating admin routes (/api/crishi/pull, /api/crishi/skip, /api/crishi/manager-review, roster/weather rotation) strictly enforce @admin_required.

### R2. Person-Basis Database Update History & Extraction
Implement person-basis database update history and extraction:
- TableUpdateHistory model in app/models.py (table_update_history in MySQL) with fields: id, catalog_id, person_name, table_name, final_name, commodity, db_update_timestamp, report_date, status, row_count, remarks, created_at.
- app/services/history_service.py providing extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None) that handles running both inside and outside active Flask application contexts (e.g. using from flask import current_app or fallback to create_app().app_context()).
- Endpoint GET /api/crishi/update-history with JWT protection:
  * Admins can view all records and filter by ?teammate=, ?commodity=, ?date_from=, ?date_to=, ?status=, ?search=, ?limit=, ?offset=.
  * Teammates are strictly scoped to their own records (overriding any passed ?teammate parameter).
  * Endpoint returns JSON with `success: True`, `history: [...]`, `records: [...]`, `total: int`, `count: int`.
  * Direct mutations (PUT, POST, PATCH, DELETE) on /api/crishi/update-history return HTTP 405 Method Not Allowed (immutable append-only log).
- Hook in POST /api/crishi/sync-report-db to automatically append a TableUpdateHistory entry on synchronization.

### R3. UI Integration in Crishi
Integrate UI components in app/static/js/crishi.js and app/templates/index.html:
- Dedicated "Update History" tab (#tab-history / #view-history) rendering the table update timeline.
- Clicking a teammate portfolio chip filters the history by that teammate (for Admins) or shows own history (for Teammates).
- Teammate chip visibility rules: Teammates only see their own chip.

### R4. Comprehensive Testing & Non-Destructive Invariants
Verification resources are strictly `tests/test_crishi_history_and_scoping.py` and the database invariants:
- Run and pass the 135-test suite in `tests/test_crishi_history_and_scoping.py`:
  `.venv\Scripts\python.exe -m unittest tests.test_crishi_history_and_scoping`
- Maintain zero data loss on database invariants: exactly 9 users, 27 reports, 158 catalog mappings intact.


## 2026-10-29T07:37:28Z

Fix the commodity-basis update filter in update history, ensure scanned reports retain both Daily and Weekly reports received on the same date without generating synthetic companion reports, and add a commodity-basis report history tab or section inside Market & Intelligence Reports.

Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP
Integrity mode: development

## Requirements

### R1. Scanned Reports Deduplication and Genuine Reports Only
Fix the scanned reports deduplication logic so that when both Daily and Weekly reports for the same commodity arrive on the same date, neither report is dropped. Display only genuine reports received from Gmail, MIS uploads, and genuine document sources; do not generate or show synthetic companion reports.

### R2. Commodity Filter in Update History
Fix the commodity-basis update filter in Crishi update history so that selecting any commodity accurately filters updates, including matching across commodity aliases.

### R3. Commodity-Basis Report History in Market & Intelligence Reports
Provide a commodity-basis report history as an integrated tab or section inside the Market & Intelligence Reports view so users can inspect report history and database updates organized by commodity.

### R4. System and Database Invariants
Preserve existing database invariants (exact user count, report count, catalog entries intact) and ensure the application runs properly on port 5000 with role-based access control maintained.

## Acceptance Criteria

### Scanned Reports & Deduplication
- [ ] Both Daily and Weekly reports for a commodity on the same date are displayed in the scanned reports list without dropping either.
- [ ] No synthetic or mock companion reports are generated; only genuine incoming Gmail reports, MIS uploads, IPGA publications, and sample PDFs are listed.

### Update History Filtering
- [ ] Filtering update history by commodity works correctly and returns expected records matching commodity aliases.

### Market & Intelligence Reports History
- [ ] Market & Intelligence Reports includes an integrated tab or section for commodity-basis report history where users can view updates and reports by commodity.

### Verification & Invariants
- [ ] Database invariants (9 users, 27 reports, 158 catalog entries) remain intact.
- [ ] Existing project test suite and automated regression checks pass successfully.
