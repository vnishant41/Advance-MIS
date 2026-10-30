## 2026-10-28T17:51:37Z

You are worker_m1.
Working directory: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\worker_m1\
Original request file: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\ORIGINAL_REQUEST.md
Scope document: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\PROJECT.md
Explorer findings: d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\explorer_r2_1\analysis.md and handoff.md

You MUST read ORIGINAL_REQUEST.md before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write Ownership:
You EXCLUSIVELY own `app/auth.py` and `app/routes/crishi.py` (specifically grid, reports/all, and administrative route protections). Do NOT touch other files.

Milestone Scope: Milestone 1 — Backend Role Scoping & Auth Hierarchy (R1)
1. In `app/auth.py`:
   - Add `'Leader': 2` to `ROLE_LEVEL`. Ensure `ROLE_LEVEL = {'Teammate': 1, 'Leader': 2, 'Manager': 2, 'SuperAdmin': 3}`.
   - Define `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}`.
   - Define helper `def is_admin_role(role: str) -> bool: return role in ADMIN_ROLES`.
   - Update `admin_required()` / role checking decorators to recognize any role in `ADMIN_ROLES`.
2. In `app/routes/crishi.py`:
   - In `get_grid()` (`GET /crishi/grid`):
     - Authenticate optionally via JWT (`get_current_user()` or `get_jwt_identity()`).
     - If unauthenticated, preserve existing dev behavior (return full grid).
     - If authenticated as an Admin role (`is_admin_role(user.role)`: `SuperAdmin`, `Manager`, `Leader`), return full unrestricted grid (all 158 tasks, all commodity rollups, and all teammates in `summary['teammates']`).
     - If authenticated as `Teammate`:
       - Filter `tasks` strictly to tasks where `task['user_name']` contains the teammate's name (handle comma-separated names) or matches the teammate's assigned commodities or weather rotation duty.
       - Filter `commodity_rollups` to strictly include only this teammate's assigned commodities.
       - Filter `summary['teammates']` to strictly contain only this teammate's entry: `{user.name: summary['teammates'][user.name]}` (all other teammates completely hidden).
       - Recalculate summary metrics (`total_tasks`, `completed`, `pending`, `success_rate`, etc.) to match the scoped tasks.
   - In `get_all_reports()` (`GET /crishi/reports/all`):
     - If authenticated as `Teammate`, filter returned reports to only those matching user's assigned commodities or assigned reports (`user.report_mappings`). If Admin, return all reports.
   - In mutating administrative endpoints in `crishi.py` (`/crishi/pull`, `/crishi/skip`, `/crishi/manager-review`, etc.):
     - Require that caller has an Admin role (`is_admin_role()`); return HTTP 403 Forbidden for Teammates.
3. Verification:
   - Run tests: `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_quality_*.py"` to ensure zero regressions on existing tests.
   - Run an inline or script verification testing SuperAdmin token vs Teammate token (`bhawna@agalabs.com` or `gopichand@agalabs.com`) on `/api/crishi/grid` and `/api/crishi/reports/all`.
   - Document commands and output in your handoff report.

Deliver your handoff report to `d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\worker_m1\handoff.md` and notify via send_message.
