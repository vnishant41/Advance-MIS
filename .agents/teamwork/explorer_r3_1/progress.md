# Progress — Requirement R1 Investigation

Last visited: 2026-10-29T07:57:30Z

- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Read ORIGINAL_REQUEST.md and PROJECT.md
- [x] Inspected scanned reports endpoints in `app/routes/crishi.py` (`get_all_scanned_reports()`, `GET /api/crishi/reports/all`, `GET /api/crishi/reports/pdf`, `POST /api/crishi/reports/sync-gmail`)
- [x] Inspected `app/services/email_ingestion.py` (`ingest_gmail_reports()`, `existing_reports_map`, deduplication keys)
- [x] Inspected `app/models.py` (`EmailReport`, `MISReportUpload`)
- [x] Inspected frontend handling in `app/static/js/report.js` and `app/static/js/crishi.js`
- [x] Discovered exact causes for dropped Daily/Weekly reports:
  - In `app/services/email_ingestion.py`, `comm_date_key = f"{comm}_{r_date_str}"` and `existing_reports_map[f"{c_tag}_{d_tag}"]` drop second report or overwrite in DB because frequency is absent from key.
  - In `app/routes/crishi.py`, `key = f"{clean_name}_{u_date}"` in MIS uploads drops reports with identical clean names regardless of frequency.
  - In `app/routes/crishi.py`, `_build_companion_report()` lines 1411-1442 injects 84 synthetic companion reports across all active dates to fabricate missing reports.
- [x] Verified co-existence of genuine Daily & Weekly reports in DB (33 dates have both Daily and Weekly genuine reports).
- [/] Validating regression test suite behavior with genuine reports only (task-230 running).
- [ ] Formulating architectural fix recommendations and writing handoff.md.
