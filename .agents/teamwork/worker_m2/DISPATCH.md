# Worker Milestone 2 Dispatch: Backend Hierarchy APIs & Relational Sync

Read `ORIGINAL_REQUEST.md` at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\ORIGINAL_REQUEST.md`

Read `PROJECT.md` at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\orchestrator\PROJECT.md`

Read `TEST_READY.md` at:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\TEST_READY.md`

Read `tests/test_hierarchy_and_studio.py`.

Working directory:
`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP\.agents\teamwork\worker_m2\`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Scope & File Ownership:
You EXCLUSIVELY own:
- `app/routes/admin.py`

DO NOT edit `app/models.py`, `app/__init__.py`, `app/static/js/admin.js`, or any test files.

## Task:
1. In `app/routes/admin.py`:
   - In `add_user()` (`POST /api/admin/users`):
     - Support `backup_1` and `backup_2` from the payload.
     - Robustly handle `commodities`: if passed as a list (e.g. `['Wheat', 'Cotton']`), join as comma-separated string `", ".join(c)`. If passed as string, store as is.
     - Persist `user.backup_1 = backup_1` and `user.backup_2 = backup_2`.
     - Support `reports` payload (list of report objects or dicts `{report_id, report_name, timing_schedule, deadline, frequency}`). Insert corresponding `UserReportMapping` records.
     - Support `commodity_mappings` or `commodities` payload list. Insert corresponding `UserCommodityMapping` records.
     - Return the created user with full hierarchy (`to_dict()`).
   - In `update_user()` (`PUT /api/admin/users/<email>`):
     - Support updating `backup_1`, `backup_2`, `role`, `department`, `active`, `commodities`, `name`.
     - If `name` changed (e.g., `old_name = user.name; new_name = data.get('name')`):
       - Cascade update to `DBTaskCatalog`: update `db_task_catalog.user_name` where `user_name == old_name` (or if comma-separated, replace `old_name` with `new_name`).
       - Cascade update to `Report`: update `reports.primary_assignee = new_name` where `primary_assignee == old_name`. Also update `backup_1` / `backup_2` on reports if matching.
     - Support updating assigned `reports` and `commodities`:
       - Replace or upsert `UserReportMapping` and `UserCommodityMapping` records for this user.
     - Return updated user with full hierarchy.
   - In `get_users()` (`GET /api/admin/users`):
     - Ensure all users return their full hierarchy in `to_dict()`.
   - In `get_table_mappings()` (`GET /api/admin/table-mappings`):
     - Enrich the response with `active_users`: list of active user names from `User.query.filter_by(active=True).all()`.
     - Enrich with `commodities`: unique sorted list of commodities from `CommodityConfig` and `Report`.
     - Preserve existing `mappings` array for full backwards compatibility!

2. Verification:
   - Run the automated test runner:
     `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`
   - Ensure all 49 tests pass with 0 failures and 0 errors!
   - Verify that zero data loss is maintained: 9 baseline users, 27 baseline reports, 156 baseline table mappings intact.
3. Write your handoff report to `handoff.md` in your working directory and notify with `send_message`.
