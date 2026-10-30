## 2026-10-28T05:43:42Z

Update Advance ERP to link commodity and assignee in Table Mapping Studio dynamically with the database users and reports tables, and merge user and report management into a unified hierarchical structure (User > Email > Role > Department > Reports with timing popups > Commodity with mapping popups > 1st and 2nd Backups) so that newly added users immediately reflect in "Edit Table Mapping".

Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP
Integrity mode: development

## Requirements

### R1. Dynamic User and Commodity Linking in Table Mapping Studio
Link the commodity and assignee in Table Mapping Studio dynamically to the database `users` table and `reports` table, replacing hardcoded user lists so that newly added users and configured commodities dynamically appear and are selectable in "Edit Table Mapping" and "Add New Table Mapping". Ensure full relational consistency between the tables so that changes to users or reports reflect across Table Mapping Studio.

### R2. Unified User and Report Hierarchy Management
Provide a unified user management interface implementing the hierarchy: User > Email > Role (determining panel access) > Department > Reports (with internal popup mapping for each report, including timing) > Commodity (with internal popup mapping) > 1st Backup and 2nd Backup. Each user record must support assigning multiple reports and commodities with their respective mapping configurations and fallback backups.

### R3. Database Schema and Existing Data Preservation
Preserve all existing database records in Advance ERP while updating the schema and relationships to support the merged User-Report hierarchy, commodity associations, and 1st/2nd backups. Provide and apply migration scripts to migrate existing users, reports, and table mappings to the updated relational structure without data loss.

### R4. Automated Verification Suite
Provide an automated verification suite that programmatically validates the end-to-end functionality: creating/updating a user with reports, commodities, and backups, verifying data persistence, and asserting that newly added users and commodities appear dynamically in Table Mapping Studio endpoints and UI modals without manual code edits.

## Acceptance Criteria

### Table Mapping Studio Integration
- [ ] In Table Mapping Studio ("Edit Table Mapping" and "Add New Table Mapping"), assignee options are dynamically retrieved from active users in the database rather than a static hardcoded array.
- [ ] Creating a new user through the user management interface causes that user to immediately appear in the assignee selection of "Edit Table Mapping".
- [ ] Commodity selections in Table Mapping Studio are dynamically populated from the database reports/commodities configuration.

### Merged User and Report Hierarchy
- [ ] The user management interface allows creating and editing a user with the full hierarchy: Name, Email, Role, Department, assigned Reports, assigned Commodities, and 1st & 2nd Backup assignees.
- [ ] Clicking on a report within a user's configuration opens an internal popup to configure that report's specific mapping details (e.g. timing / schedule).
- [ ] Clicking on a commodity within a user's configuration opens an internal popup to configure that commodity's specific mapping details.
- [ ] 1st Backup and 2nd Backup assignees can be selected and saved for user-report mappings.

### Data Preservation and Schema Integrity
- [ ] All pre-existing user records, report configurations, and table mapping entries are preserved intact after applying the schema update.
- [ ] Database relations between users, reports, commodities, and table mappings maintain relational integrity with no orphaned references.

### Programmatic Verification
- [ ] An automated test suite passes, verifying that adding a user via API/backend persists the hierarchy and makes the user immediately queryable by Table Mapping Studio.
- [ ] An automated test verifies that report timing configurations and backup assignments persist and retrieve correctly.


## 2026-10-28T09:20:24Z

Inspect, test, debug, and repair the existing Advance ERP application through a comprehensive functional audit, browser and module testing, prioritised bug fixing, automated test coverage, and documentation. Preserve existing working tree modifications, verify actual behaviour directly against the local application, and fix root causes in controlled batches.

Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP
Integrity mode: development

Application URL: http://10.60.165.77:5000/

## Requirements

### R1. Project Discovery, Baseline Establishment, and Bug Register
Inspect the complete repository, Git working tree, configuration, and running application without printing secrets or modifying code to force passes. Execute applicable baseline checks (application health, syntax, linting/typing if configured, existing tests discovered in the repo, database schema validation, API checks, and dependency/security checks) and record results. Deliver an architecture summary, route inventory, baseline results, and a prioritised bug register (classifying issues by CRITICAL, HIGH, MEDIUM, LOW) with reproduction steps, expected vs. actual behaviour, evidence, and root causes before major changes.

### R2. Browser-Based and Module-by-Module Functional Verification
Audit and test all accessible pages, routes, navigation menus, and core modules (including CRISHI and data grids, roster and scheduling, email ingestion and processing, PDF parsing and document processing, reporting and dashboards, user management and permissions, commodity and table mapping, background jobs, and integrations). Trace flows end-to-end (Frontend → API/route → service/logic → database/external integration → response → frontend rendering), verifying data correctness, input validation, interactive controls, state persistence, error handling, and responsive layout across mobile (375x812), tablet (768x1024), laptop (1366x768), and desktop (1920x1080) viewports. Inspect local database or seed scripts to identify or create a local development test user for authenticated workflows. If direct browser access to the network address is unavailable, perform verification via source-code inspection, local HTTP checks, API tests, and existing test tools.

### R3. Prioritised Root-Cause Bug Remediation
Group confirmed issues into manageable batches and fix root causes rather than hiding symptoms, preserving existing modifications, untracked files, and the existing design system without redesigning interfaces during functional repair. Implement the smallest appropriate fix for each confirmed bug, obtaining explicit approval before destructive operations or major architectural changes, and without suppressing exceptions, removing failing tests, or hardcoding fake API responses.

### R4. Automated Test Coverage and Final Regression Testing
Add automated tests using the project's existing testing tools (or Playwright where suitable) for repaired bugs and untested critical functionality, using isolated test data without deleting or resetting real data. Repeat all baseline checks, verify application startup, APIs, database operations, routes, user workflows, and fixed bugs, reporting final outcomes separately as PASSED, FAILED, BLOCKED, or NOT RUN.

### R5. Quality Documentation and Checkpoint Guidance
Create or update documentation in `docs/quality-audit/` (audit-report.md, bug-register.md, test-report.md, manual-testing-guide.md, and setup-and-troubleshooting.md) detailing executed commands, findings, fixes, passed tests, remaining limitations, and required manual actions. At each major checkpoint, provide clear explanations of what was inspected, what failed, what changed, why, test outcomes, and exact commands for any needed manual actions.

## Acceptance Criteria

### Discovery & Baseline
- [ ] Complete inventory of discovered application pages, routes, modules, APIs, and critical user workflows is documented.
- [ ] Baseline checks (syntax, lint/type checks if configured, existing unit/integration tests discovered in the repo, DB schema validation, dependency/security checks) are run and recorded before making code changes.
- [ ] Initial prioritised bug register is created classifying issues as CRITICAL, HIGH, MEDIUM, or LOW with reproduction steps, actual vs expected behaviour, evidence, and root causes.

### Functional & Module Testing
- [ ] All accessible pages and navigation routes are tested for load status, data accuracy, form validation, search/sorting/filtering/pagination, and state persistence.
- [ ] Discovered modules (including CRISHI, roster, email ingestion, PDF parsing, reporting, user management, and table mapping) are traced end-to-end across frontend, API, service, and database layers.
- [ ] Authenticated workflows are tested using local development user accounts discovered or seeded in the local database.
- [ ] Browser console errors, failed network requests, and access restriction enforcement are verified and logged.
- [ ] UI layouts and responsive behaviour are verified across mobile (375x812), tablet (768x1024), laptop (1366x768), and desktop (1920x1080) viewports.

### Remediation & Safety
- [ ] Bug fixes address root causes in small batches without suppressing exceptions, removing tests, or hardcoding mock responses.
- [ ] Existing untracked files and working tree modifications are preserved throughout.
- [ ] Explicit approval is obtained before destructive operations, database resets, or major architectural changes.

### Automated Testing & Regression
- [ ] Automated tests are added using the project's existing test framework for repaired bugs and untested critical paths using isolated test data.
- [ ] Baseline checks and regression tests are repeated post-fix, with results categorized as PASSED, FAILED, BLOCKED, or NOT RUN.

### Documentation & Reporting
- [ ] Audit report, bug register, test report, manual testing guide, and setup/troubleshooting docs are created or updated in `docs/quality-audit/`.
- [ ] Checkpoint updates explain inspections, failures, changes, test outcomes, and exact manual commands required.
