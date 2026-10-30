# Project: Advance ERP Quality Audit, Functional Verification, and Repair

## Architecture
- **Tech Stack**: Python 3.12, Flask 3.1.1, SQLAlchemy 2.0.51, Flask-SocketIO 5.5.1 (eventlet), APScheduler 3.11.0, PyMySQL 1.2.0, Vanilla ES6 JavaScript SPA.
- **Databases**:
  - Primary ERP Database: MySQL `advance_erp` (34 tables)
  - Surveillance Database: MySQL `agalabsdev_stage` (140+ tables)
- **Application Endpoints**:
  - Web Server listening on `0.0.0.0:5000` (live on `http://127.0.0.1:5000/` and Wi-Fi LAN `http://192.168.1.65:5000/`, active PID 5016).
  - 146 routes across 13 blueprints (`admin`, `analytics`, `auth`, `chat`, `core`, `crishi`, `dashboard`, `du`, `kanban`, `mis`, `notifications`, `roster`, `tasks`).
- **Core Modules**:
  1. CRISHI & Surveillance Data Grids (`crishi.py`, `crishi.js`, `surveillance.py`)
  2. Roster & Duty Scheduling (`roster.py`, `roster.js`)
  3. Email Ingestion & Processing (`email_ingestion.py`, `email_service.py`)
  4. PDF Parsing & Template Validation (`mis_report.py`, `pdf_parser.py`, `report.js`)
  5. Reporting & Dashboards (`dashboard.py`, `analytics.py`, `dashboard.js`, `analytics.js`)
  6. User Management & Hierarchy (`admin.py`, `auth.py`, `admin.js`)
  7. Commodity & Table Mapping (`admin.py`, `data_update.py`, `admin.js`)
  8. Background Jobs & Notifications (`scheduler.py`, `notifications.py`)
  9. External Integrations (Gmail IMAP/SMTP, WebSockets, Chart.js, PDF.js)

## Feature Inventory
| # | Feature / Work Item | Description | Milestone | Source |
|---|---------------------|-------------|-----------|--------|
| 1 | Baseline & Docs Setup | Document baseline checks, route catalog, and initial bug register in `docs/quality-audit/` | M1 | R1, R5 |
| 2 | Functional & Module Testing | Audit all 9 modules, trace E2E flows, test authenticated workflows, test responsive viewports (375x812, 768x1024, 1366x768, 1920x1080), create manual testing guide | M2 | R2 |
| 3 | Batch 1 Bug Remediation | Fix BUG-01 (`import os`), BUG-02 (SQL injection in `table-schema`), BUG-04 (`secure_filename` in PDF upload), BUG-11 (secure mutating endpoints with mandatory `@jwt_required()`), BUG-03 (server code sync) | M3 | R3 |
| 4 | Batch 2 Bug Remediation | Fix BUG-05 (dynamic user sync in modals), BUG-06 (UTC/IST date shift), BUG-07 (SQLAlchemy 2.0 `db.session.get()`), BUG-08 (JWT secret length), BUG-09 (dead logout selector), BUG-10 (mobile search box CSS), BUG-12 (mobile ribbon overflow) | M4 | R3 |
| 5 | Automated Test Coverage | Add automated unit/integration tests for BUG-01..12 and critical paths; execute full regression suite (104 tests passing) | M5 | R4 |
| 6 | Final Quality Audit Docs & Gate | Finalize all 5 docs in `docs/quality-audit/`, manual testing guide, setup & troubleshooting, forensic integrity verification | M6 | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Baseline Docs & Bug Register Setup | Create `docs/quality-audit/` initial files (`audit-report.md`, `bug-register.md`, `setup-and-troubleshooting.md`, `test-report.md`) | None | DONE |
| M2 | Module & Viewport Functional Verification | Perform end-to-end functional audit of all 9 modules and 4 responsive viewports; author `manual-testing-guide.md` | M1 | DONE |
| M3 | Batch 1 Bug Fixes (Critical & High) | Remediate BUG-01, BUG-02, BUG-04, BUG-11, and server sync | M1, M2 | DONE |
| M4 | Batch 2 Bug Fixes (Medium & Low) | Remediate BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-12 | M3 | DONE |
| M5 | Automated Tests & Regression Run | Author automated regression tests for repaired bugs and untested critical paths; run all tests (104/104 passed) | M3, M4 | DONE |
| M6 | Final Documentation & Forensic Audit | Complete all 5 docs in `docs/quality-audit/`, run forensic audit and gate checks | M5 | DONE |

## Gate Verification (Milestone 6)
- **auditor_m6**: CLEAN (0 integrity violations, 0 skipped tests, 0 facades, 100% genuine fixes, 0 secrets exposed, zero data loss)
- **reviewer_m6_1**: APPROVE (Backend code review, security hardening, tests verified)
- **reviewer_m6_2**: APPROVE (Frontend fixes, responsive CSS, documentation suite verified)
- **challenger_m6_1**: APPROVE (Backend adversarial stress: 40+ SQLi rejected, 13 path traversal rejected, 52 auth matrix tests passed)
- **challenger_m6_2**: APPROVE (Frontend adversarial challenge: user fallback, midnight IST offset, responsive CSS verified)
- **Gate Result: PASS**

## Interface Contracts & Invariant Guarantees
- Zero Data Loss: All 9 baseline users, 27 reports, and 158 table mappings remain 100% intact.
- Working Tree Preservation: Existing modified files (23 tracked) and untracked files (15 items) preserved intact.
- Authentication & Roles: SuperAdmin (`vaibhav@agalabs.com`, `nishant@agalabs.com`), Manager (`ram@agalabs.com`), Teammates (`bhawna`, `gopichand`, `nitesh`, `pankaj`).
- Test Compatibility: 104/104 tests pass with 100% pass rate and zero warnings.

## Code Layout
- `app/` - Core application package (models, routes, services, static, templates)
- `tests/` - Automated test suites (`test_hierarchy_and_studio.py`, `test_adversarial_challenger2.py`, `adversarial_backend_stress.py`, `test_batch1_fixes.py`, `test_batch2_fixes.py`, `test_quality_audit_regression.py`)
- `docs/quality-audit/` - Complete, synchronized documentation suite (5 deliverables):
  - `audit-report.md` (v2.0.0, 71.3 KB)
  - `bug-register.md` (v2.0.0, 31.7 KB, 12 bugs resolved)
  - `test-report.md` (v2.0.0, 24.5 KB, 104 tests documented)
  - `manual-testing-guide.md` (v2.0.0, 26.2 KB)
  - `setup-and-troubleshooting.md` (v2.0.0, 11.4 KB)
