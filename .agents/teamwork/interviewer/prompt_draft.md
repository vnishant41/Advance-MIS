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
