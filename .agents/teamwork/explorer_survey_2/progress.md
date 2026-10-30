# Progress — Explorer 2 (Table Mapping Explorer)

- **Status**: Investigation completed; writing survey report and handoff
- **Last visited**: 2026-10-28T05:58:30Z
- **Current Step**: Synthesizing survey findings into `survey_report.md` and `handoff.md`.
- **Completed Steps**:
  1. Located all frontend code in `app/static/js/admin.js` (`loadTableMapping`, `renderTableMappingRows`, `openFetchDbTablesModal`, `openEditTableMappingModal`).
  2. Located all backend endpoints in `app/routes/admin.py` (`/table-mappings`, `/fetch-db-tables`, `/table-schema`, `/users`, `/commodities`, `/reports`) and model `DBTaskCatalog` in `app/models.py`.
  3. Identified all hardcoded assignee arrays (`authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']` at line 4046, `#map-filter-user` at line 3413, fallback `'Nishant'` at lines 3986, 4003, 4075).
  4. Identified all hardcoded commodity arrays (`harmonizedCommodities` at line 4047, `COMMODITY_COLORS` at line 4083).
  5. Verified database contents in live MySQL (`users` table has 9 users, `commodity_configs` has 22 commodities, `reports` has 27 reports).
  6. Mapped out exact dynamic data flow, cache invalidation, and UI rendering mechanism to make newly added users and configured commodities immediately selectable.
