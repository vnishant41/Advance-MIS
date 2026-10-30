# Dispatch Assignment

## 2026-10-28T17:32:12Z

Implement role-based access scoping for Admins and Teammates, and an immutable person-basis update history tracking feature in Advance ERP (Crishi).

Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP
Integrity mode: development

## Requirements

### R1. Teammate and Admin Role Scoping
Admin roles (SuperAdmin, Manager, Leader) must have full unrestricted access to all commodities, reports, tables, and all teammate portfolios.
Teammate role: When a Teammate logs in, in "Teammate Portfolios (Click to Filter Workload)" they must only see their own portfolio chip (other teammates are completely hidden). In the surveillance grid and reports, teammates must only see their own assigned commodities, reports, and table updates.

### R2. Person-Basis Update History Tracking
Retrieve immutable person-basis update history directly from database update date/timestamps when data was updated in the database (e.g., Nishant updating Trade Flow – Pulses, Bhawna updating Trade Flow – Soybeans).
Update history records must include: person name, table name, final name (e.g. Trade Flow – Pulses), commodity, DB update date/timestamp, report date, status, row count, and remarks.

### R3. UI Integration in Crishi
Add a dedicated 'Update History' tab alongside the Surveillance and Roster tabs in Crishi.
For Admins: Provide access to view all teammates' update history, with the ability to filter by any teammate.
For Teammates: Restrict the view to their own update history only.
Clicking a teammate's portfolio chip in "Teammate Portfolios" allows viewing that teammate's update history directly.

### R4. Automated Testing and Verification
Create automated tests (using the existing test framework) verifying that access scoping is enforced between Admin and Teammate roles across endpoints and queries, and that update history entries accurately reflect database modifications.
Discover or seed isolated local development test accounts to execute the verification suite.

## Acceptance Criteria

### Role Scoping
- [ ] Users with Admin roles (SuperAdmin, Manager, Leader) have full access to all commodities, reports, tables, surveillance grid data, and all teammate portfolio chips.
- [ ] Users with the Teammate role only see their own portfolio chip in "Teammate Portfolios (Click to Filter Workload)", with all other teammates completely hidden.
- [ ] Users with the Teammate role only see their own assigned commodities, reports, and table updates in the surveillance grid and reports.

### Person-Basis Update History
- [ ] Update history records are retrieved directly from database update date/timestamp records.
- [ ] Each history record displays: person name, table name, final name (e.g. Trade Flow – Pulses), commodity, DB update date/timestamp, report date, status, row count, and remarks.
- [ ] Update history logs remain immutable and accurately reflect historical database updates.

### UI Integration
- [ ] A dedicated 'Update History' tab is present and navigable alongside the Surveillance and Roster tabs in Crishi.
- [ ] Admins can view all update history records and filter by individual teammates.
- [ ] Teammates viewing the 'Update History' tab can only see their own update records.
- [ ] Clicking a teammate's portfolio chip in "Teammate Portfolios" opens/filters that teammate's update history directly.

### Verification
- [ ] Automated tests verify that role scoping and data filtering are strictly enforced for Admin and Teammate roles.
- [ ] Automated tests verify that update history records are correctly generated and queried with all required fields.

---
Working directory for this orchestration: .agents/teamwork/orchestrator_r2/
Original request file: .agents/teamwork/ORIGINAL_REQUEST.md
Your role: Project Orchestrator
