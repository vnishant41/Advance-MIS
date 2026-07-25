const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();

function addSheet(name, headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(String(h || '').length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 1: Config — Column-block layout
//
// Block layout (all starting at row 3):
//   Col B  (2):  Employees (email only)
//   Col F  (6):  Reports (name, deadline, primary, freq)
//   Col J  (10): Components/Report mapping (report, component, assignee, minCount)
//   Col P  (16): Data Update (commodity, type, factor, mode, source)
//   Col V  (22): Tasks (name, assignee, priority, recurrence, dueDate)  ← dueDate is NEW col 26
//   Col AB (28): Settings (key, value)
//   Col AH (34): App Modules (module_key, enabled)
// ─────────────────────────────────────────────────────────────────────────────
const cfgHeaders = [
  '',            // A(1)
  'Employee',    // B(2)  EMP_COL
  '',            // C(3)
  '',            // D(4)
  '',            // E(5)
  'Report',      // F(6)  RPT_COL
  'Deadline',    // G(7)
  'Primary',     // H(8)
  'Frequency',   // I(9)
  'Comp_Report', // J(10) COMP_RPT_COL
  'Component',   // K(11)
  'Assignee',    // L(12)
  'MinCount',    // M(13)
  '',            // N(14)
  '',            // O(15)
  'Commodity',   // P(16) DU_COL
  'Type',        // Q(17)
  'Factor',      // R(18)
  'Mode',        // S(19)
  'Source',      // T(20)
  '',            // U(21)
  'Task_Name',   // V(22) TASK_COL
  'Assignee',    // W(23)
  'Priority',    // X(24)
  'Recurrence',  // Y(25)
  'DueDate',     // Z(26) ← NEW: task due date for timeline
  '',            // AA(27)
  'Setting',     // AB(28) SET_COL
  'Value',       // AC(29)
  '',            // AD(30)
  '',            // AE(31)
  '',            // AF(32)
  '',            // AG(33)
  'Module_Key',  // AH(34) MOD_COL
  'Enabled',     // AI(35)
];

const cfgRows = [
  // Section labels (row 2)
  ['','Employees','','','','Reports','','','','Components','','','','','','Data Update','','','','','','Tasks','','','','','','Settings','','','','','','App Modules',''],
  // Data row 1
  ['','admin@example.com','','','','Daily Production','10:00','Line Manager','Daily','Daily Production','Line A Output','Ravi','5','','','Coffee','Arabica','Price','Manual','Bloomberg','','Morning standup','All','High','daily','','','Window Start','08:00','','','','','mis','YES'],
  // Data row 2
  ['','ravi@example.com','','','','Quality Check','12:00','QC Lead','Daily','Daily Production','Line B Output','Priya','0','','','Coffee','Robusta','Volume','API','Reuters','','Email follow-ups','Nishant','Medium','daily','','','Window End','20:00','','','','','du','YES'],
  // Data row 3
  ['','priya@example.com','','','','Inventory Update','14:00','Warehouse','Weekly','Quality Check','QC Module 1','Ravi','10','','','Tea','Green','Quality Index','Manual','Lab Report','','Weekly report prep','Priya','Low','weekly','','','Manager Email','ravi@example.com','','','','','task','YES'],
  // Data row 4
  ['','leader@example.com','','','','Weekly Summary','17:00','Admin','Weekly','Quality Check','QC Module 2','Nishant','0','','','Tea','Black','Price','Manual','Bloomberg','','','','','','','','Escalate Days','3','','','','','kanban','YES'],
  // Data row 5
  ['','amit@example.com','','','','','','','','Inventory Update','Warehouse Stock','Amit','5','','','Sugar','Raw','Price','Manual','ICE','','','','','','','','Lock Duplicate','YES','','','','','crossVal','YES'],
  // Data row 6
  ['','','','','','','','','','Inventory Update','Raw Materials','Priya','0','','','Sugar','Refined','Volume','API','Reuters','','','','','','','','Require Remarks','YES','','','','','analytics','YES'],
  // Data row 7
  ['','','','','','','','','','','','','','','','Wheat','HRW','Price','Manual','CBOT','','','','','','','','SuperAdmin Email','admin@example.com','','','','','audit','YES'],
];
addSheet('Config', cfgHeaders, cfgRows);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 2: Users
// Columns: email | name | role | department | active | password
//
// Roles: Teammate | Leader | Manager | SuperAdmin
//   Leader (NEW) — limited view role between Teammate and Manager.
//   Access is individually configured per leader in the LeaderAccess sheet.
//   Leaders cannot access Admin, Control Center, Leader Access panel, or Audit Trail.
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Users',
  ['email', 'name', 'role', 'department', 'active', 'password'],
  [
    ['admin@example.com',  'Nishant Admin', 'SuperAdmin', 'Research',    'YES', 'changeme123'],
    ['ravi@example.com',   'Ravi Kumar',    'Manager',    'Engineering', 'YES', ''],
    ['leader@example.com', 'Priya Leader',  'Leader',     'Research',    'YES', ''],
    ['priya@example.com',  'Priya Sharma',  'Teammate',   'DevOps',      'YES', ''],
    ['amit@example.com',   'Amit Patel',    'Teammate',   'Research',    'NO',  ''],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 3: LeaderAccess  (NEW)
// Columns: email | allowed_views
//
// allowed_views is a comma-separated list of view keys the Leader can see.
// Valid view keys: dashboard, mis, du, task, roadster, kanban, research, analytics
// SuperAdmin configures this via the "Leader Access" panel in the sidebar.
// Leaders NEVER see: admin, control, leaderControl, audit (hardcoded deny).
// ─────────────────────────────────────────────────────────────────────────────
addSheet('LeaderAccess',
  ['email', 'allowed_views'],
  [
    ['leader@example.com', 'dashboard,kanban,analytics'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 4: Master_Log
// Universal log for all entry types. All submitted data lands here AND
// in the type-specific log (MIS_Log, DU_Log, Task_Log).
//
// NOTE (v8.1 update):
//   - confidence is always stored as 'Medium' (field removed from forms)
//   - source_url is always '' for MIS and Task entries
//   - source_url is always '' for DU entries (field removed from form)
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Master_Log',
  [
    'log_id', 'timestamp_submitted', 'submitted_by_email', 'on_behalf_of_email',
    'on_behalf_of_name', 'entry_type', 'entry_date', 'week_number', 'month_year',
    'topic', 'sub_topic', 'status', 'data_count', 'mode_or_extra', 'remarks',
    'is_late', 'time_to_submit_min', 'row_status', 'source_url', 'confidence',
    'validated_by_email'
  ],
  [
    ['LOG1001','2026-04-28 09:15','admin@example.com','admin@example.com','Nishant Admin','MISReport',  '2026-04-28',18,'April 2026','Daily Production','Line A Output','Done',  12,'',       'All good',          'No', 15, 'Active','','Medium',''],
    ['LOG1002','2026-04-28 09:16','admin@example.com','admin@example.com','Nishant Admin','MISReport',  '2026-04-28',18,'April 2026','Daily Production','Line B Output','Pending',0,'',       'Waiting on data',   'No', 16, 'Active','','Medium',''],
    ['LOG1003','2026-04-28 09:30','ravi@example.com', 'ravi@example.com', 'Ravi Kumar',   'DataUpdate', '2026-04-28',18,'April 2026','Coffee::Arabica', 'Price',        'Done',  245,'Manual','Bloomberg update',  'No', 30, 'Active','','Medium','priya@example.com'],
    ['LOG1004','2026-04-28 10:00','priya@example.com','priya@example.com','Priya Sharma', 'Task',       '2026-04-28',18,'April 2026','Morning standup', '',             'Done',  0,  'High', '',                  'No', 5,  'Active','','Medium',''],
    ['LOG1005','2026-04-28 11:00','ravi@example.com', 'ravi@example.com', 'Ravi Kumar',   'MISReport',  '2026-04-28',18,'April 2026','Quality Check',   'QC Module 1',  'Done',  8,  '',     'Checked',           'Yes',120,'Active','','Medium',''],
    ['LOG1006','2026-04-27 09:00','admin@example.com','admin@example.com','Nishant Admin','MISReport',  '2026-04-27',17,'April 2026','Daily Production', 'Line A Output', 'Done', 10,  '',     '',                  'No', 10, 'Amended','','Medium',''],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 5: MIS_Log
// Subset of Master_Log for MIS Report entries only.
//
// NOTE: confidence column is retained in sheet but always 'Medium' (v8.1).
// The "Confidence" form field was removed; value is fixed at Medium server-side.
// ─────────────────────────────────────────────────────────────────────────────
addSheet('MIS_Log',
  [
    'log_id', 'timestamp_submitted', 'submitted_by_email', 'on_behalf_of_email',
    'on_behalf_of_name', 'entry_date', 'report', 'component', 'status',
    'data_count', 'backup_by', 'remarks', 'is_late', 'time_to_submit_min',
    'row_status', 'confidence'
  ],
  [
    ['LOG1001','2026-04-28 09:15','admin@example.com','admin@example.com','Nishant Admin','2026-04-28','Daily Production','Line A Output','Done',  12,'','All good',        'No', 15, 'Active','Medium'],
    ['LOG1002','2026-04-28 09:16','admin@example.com','admin@example.com','Nishant Admin','2026-04-28','Daily Production','Line B Output','Pending', 0,'','Waiting on data', 'No', 16, 'Active','Medium'],
    ['LOG1005','2026-04-28 11:00','ravi@example.com', 'ravi@example.com', 'Ravi Kumar',   '2026-04-28','Quality Check',  'QC Module 1', 'Done',   8,'','Checked',          'Yes',120,'Active','Medium'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 6: DU_Log
// Subset of Master_Log for Data Update entries only.
//
// NOTE (v8.1 update):
//   - source_url is now always '' (the Source URL form field was removed).
//   - confidence is now always 'Medium' (the Confidence form field was removed).
// Both columns are retained for schema backward-compatibility.
// ─────────────────────────────────────────────────────────────────────────────
addSheet('DU_Log',
  [
    'log_id', 'timestamp_submitted', 'submitted_by_email', 'on_behalf_of_email',
    'on_behalf_of_name', 'entry_date', 'commodity', 'type', 'factor', 'status',
    'mode', 'remarks', 'is_late', 'row_status', 'source_url', 'confidence'
  ],
  [
    ['LOG1003','2026-04-28 09:30','ravi@example.com', 'ravi@example.com', 'Ravi Kumar',  '2026-04-28','Coffee','Arabica','Price', 'Done',   'Manual','Bloomberg update','No', 'Active','','Medium'],
    ['LOG2001','2026-04-28 10:00','priya@example.com','priya@example.com','Priya Sharma','2026-04-28','Tea',   'Green',  'Volume','Pending','API',   'API down',        'No', 'Active','','Medium'],
    ['LOG2002','2026-04-28 10:30','admin@example.com','admin@example.com','Nishant Admin','2026-04-28','Sugar', 'Raw',    'Price', 'Done',   'Manual','ICE update',      'No', 'Active','','Medium'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 7: Task_Log
// Columns: log_id | timestamp_submitted | submitted_by_email | on_behalf_of_email
//          on_behalf_of_name | entry_date | task_name | priority | assignee_email
//          status | remarks | is_late | row_status | confidence
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Task_Log',
  [
    'log_id', 'timestamp_submitted', 'submitted_by_email', 'on_behalf_of_email',
    'on_behalf_of_name', 'entry_date', 'task_name', 'priority', 'assignee_email',
    'status', 'remarks', 'is_late', 'row_status', 'confidence'
  ],
  [
    ['LOG1004','2026-04-28 10:00','priya@example.com','priya@example.com','Priya Sharma','2026-04-28','Morning standup', 'High',  'all@example.com',   'Done',   '',            'No','Active','Medium'],
    ['LOG3001','2026-04-28 11:00','admin@example.com','admin@example.com','Nishant Admin','2026-04-28','Email follow-ups','Medium','admin@example.com', 'Pending','3 remaining', 'No','Active','Medium'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 8: Kanban Tasks
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Kanban Tasks',
  [
    'id', 'title', 'description', 'assigned_to', 'assigned_to_name', 'status',
    'priority', 'due_date', 'created_by', 'tags', 'sprint_id', 'story_points',
    'department', 'depends_on', 'blocked_reason', 'created_at'
  ],
  [
    ['T1001','Fix login bug',       'Users getting 403 errors',        'ravi@example.com', 'Ravi Kumar',    'Assigned',    'High',  '2026-04-30','admin@example.com','bug,urgent','SP1',3,'Engineering','',              '',                      '2026-04-20'],
    ['T1002','Deploy v2.1',         'Production deployment',           'priya@example.com','Priya Sharma',  'In Progress', 'High',  '2026-04-28','admin@example.com','deploy',    'SP1',5,'DevOps',     'T1001',          '',                      '2026-04-21'],
    ['T1003','Write unit tests',    'Cover auth module',               'admin@example.com','Nishant Admin', 'Under Review','Medium','',           'admin@example.com','testing',   'SP1',2,'Engineering','',              '',                      '2026-04-22'],
    ['T1004','Update docs',         'API documentation refresh',       'ravi@example.com', 'Ravi Kumar',    'Done',        'Low',   '',           'admin@example.com','docs',      '',   1,'Engineering','',              '',                      '2026-04-18'],
    ['T1005','Database migration',  'Schema update v3',                'priya@example.com','Priya Sharma',  'Blocked',     'High',  '2026-04-20','admin@example.com','infra',     'SP1',8,'DevOps',     '',               'Waiting on AWS approval','2026-04-19'],
    ['T1006','Design new dashboard','Redesign KPI cards',              'admin@example.com','Nishant Admin', 'Assigned',    'Medium','2026-05-05', 'admin@example.com','design,ui', '',   3,'Design',     '',              '',                      '2026-04-25'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 9: Kanban Sprints
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Kanban Sprints',
  ['id', 'name', 'start_date', 'end_date', 'status', 'goal'],
  [
    ['SP1','Sprint 12','2026-04-21','2026-05-04','Active', 'Ship v2.1 with auth fix and deployment'],
    ['SP2','Sprint 13','2026-05-05','2026-05-18','Planned','Dashboard redesign and analytics'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 10: Daily_Roadster
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Daily_Roadster',
  ['Role', 'Employee'],
  [
    ['AW',       'Nishant Admin'],
    ['Currency', 'Ravi Kumar'],
    ['Agri-comm','Nishant Admin'],
    ['Metals',   'Priya Sharma'],
    ['Energy',   'Nishant Admin'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 11: Roadster_Log
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Roadster_Log',
  ['Date', 'Role', 'Employee', 'Status', 'Updated_At'],
  [
    ['2026-04-28','AW',      'Nishant Admin','Pending',''],
    ['2026-04-28','Currency','Ravi Kumar',   'Done',   '2026-04-28 09:30'],
    ['2026-04-28','Energy',  'Nishant Admin','Done',   '2026-04-28 10:15'],
    ['2026-04-27','AW',      'Nishant Admin','Done',   '2026-04-27 09:00'],
    ['2026-04-27','Currency','Ravi Kumar',   'Done',   '2026-04-27 11:00'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 12: Audit_Log
// ─────────────────────────────────────────────────────────────────────────────
addSheet('Audit_Log',
  ['audit_id', 'timestamp', 'actor_email', 'action', 'target_type', 'target_id', 'before_json', 'after_json', 'is_proxy'],
  [
    ['AUD001','2026-04-28 09:30','admin@example.com','MIS_SUBMIT',         'log',    'LOG1001',         '','Daily Production: 2 entries','No'],
    ['AUD002','2026-04-27 18:00','admin@example.com','UPDATE_USER',         'User',   'ravi@example.com','{"role":"Teammate"}','{"role":"Manager"}','No'],
    ['AUD003','2026-04-27 10:15','ravi@example.com', 'CREATE_USER',         'User',   'amit@example.com','','{"role":"Teammate","dept":"Research"}','No'],
    ['AUD004','2026-04-28 10:00','admin@example.com','ENTRY_AMEND',         'log',    'LOG1006',         '{"topic":"Daily Production","date":"2026-04-27"}','{"count":1}','No'],
    ['AUD005','2026-04-28 11:00','admin@example.com','TOGGLE_MODULE',       'Config', 'analytics',       '{"enabled":"YES"}','{"enabled":"NO"}','No'],
    ['AUD006','2026-04-28 12:00','admin@example.com','LEADER_ACCESS_SAVE',  'leader', 'leader@example.com','','{"views":["dashboard","kanban","analytics"]}','No'],
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 13: 📖 Documentation  (complete rewrite for v8.1)
// ─────────────────────────────────────────────────────────────────────────────
const docHeaders = ['Category', 'Feature / Function', 'Description', 'Access Level', 'Related Sheet(s)'];
const docRows = [
  // ── Title ──
  ['','MIS TRACKER v8.1 — COMPLETE FEATURE & SCHEMA REFERENCE','','',''],
  ['','Last updated: 2026-04-30  |  Version: 8.1  |  Stack: Google Apps Script + Vanilla JS SPA','','',''],
  ['','','','',''],

  // ── Role Hierarchy ──
  ['ROLES','Role Hierarchy (ascending)','Teammate  <  Leader (NEW)  <  Manager  <  SuperAdmin','','Users'],
  ['ROLES','Teammate','Can submit MIS, DU, Task entries. View own data on Dashboard and Kanban. Read-only Roadster view.','Teammate+','Users'],
  ['ROLES','Leader (NEW)','Limited-access role between Teammate and Manager. SuperAdmin individually configures which views each Leader can see via the Leader Access panel. Leaders never access Admin, Control, Leader Access, or Audit.','Leader+','Users, LeaderAccess'],
  ['ROLES','Manager','All Teammate abilities + view team data, proxy submit, validate Research, use Analytics, manage Roadster Plan.','Manager+','Users'],
  ['ROLES','SuperAdmin','All Manager abilities + user management, module toggles, bulk amend, audit log, Leader Access config, all Control Center tools.','SuperAdmin','All'],
  ['','','','',''],

  // ── Dashboard ──
  ['DASHBOARD','KPI Grid (2×2)','Four KPI boxes in a 2-column grid: Total Today / Done / Pending / Late. Responsive — collapses to 1-column on mobile.','All','Master_Log'],
  ['DASHBOARD','Quick Actions Strip (NEW)','Shortcut buttons below KPI grid: "Log MIS Report", "Log Data Update", "Log Tasks", "Kanban Board". Eliminates sidebar navigation for common actions.','All','—'],
  ['DASHBOARD','Today\'s Tasks Snapshot (NEW)','Mini stat card showing Done / Pending / Skipped / Total task counts for today. Loaded via getTaskSnapshot() RPC.','All','Task_Log'],
  ['DASHBOARD','Roadster + Task side-by-side','Roadster Tasks and Today\'s Tasks rendered in a two-column card layout for compact overview.','All','Daily_Roadster, Task_Log'],
  ['DASHBOARD','Today\'s Report Progress','Table of each MIS report with Done/Pending/Skip counts and Late flag.','All','Master_Log, Config'],
  ['DASHBOARD','Last 7 Days (Collapsible)','Bar chart of daily submission totals. Click the header to collapse/expand (toggle state is not persisted).','All','Master_Log'],
  ['DASHBOARD','Kanban Snapshot','Summary KPI boxes: Total / Open / Done / Blocked + overdue and due-today lists.','All','Kanban Tasks'],
  ['DASHBOARD','Recent Entries','Last 10 entries across all entry types with date, employee, topic, status, and type badges.','All','Master_Log'],
  ['','','','',''],

  // ── MIS Report ──
  ['MIS REPORT','Report Selection','Dropdown of configured reports with deadlines from Config sheet (col F-I).','All','Config'],
  ['MIS REPORT','Component Loading','Auto-loads per-report components with assignee and minCount from Config sheet (col J-M).','All','Config'],
  ['MIS REPORT','Status per Component','Each component row has a status dropdown: Pending / Done / Skip, plus data count and remarks fields.','All','MIS_Log'],
  ['MIS REPORT','Backup By','Optional free-text field to note who backed up the data entry.','All','MIS_Log'],
  ['MIS REPORT','Duplicate Check','Prevents re-submission for same date+report; "Force Amend" button available to override.','All','Master_Log'],
  ['MIS REPORT','Late Detection','Automatically flags submission as late if submitted after the report\'s configured deadline.','All','Config, MIS_Log'],
  ['MIS REPORT','Draft Auto-Save','Form state is auto-saved to localStorage on every field change; restored on page reload.','All','(localStorage)'],
  ['MIS REPORT','Keyboard Shortcuts','While a status field is focused: D = Done, P = Pending, S = Skip.','All','—'],
  ['MIS REPORT','REMOVED: Confidence','The Confidence (High/Medium/Low) dropdown was removed from the form. All entries are stored as "Medium" in the log.','—','MIS_Log (confidence col always Medium)'],
  ['MIS REPORT','REMOVED: Submit on Behalf','The "Submit on behalf of" email field was removed from the MIS form. Proxy submission is still available via Control Center → Proxy Entry.','—','—'],
  ['','','','',''],

  // ── Data Update ──
  ['DATA UPDATE','Commodity / Type Select','Cascading dropdowns: Commodity → Type → Factors loaded from Config sheet (col P-T).','All','Config'],
  ['DATA UPDATE','Factor Grid','Each factor row has status (Pending/Done/Skip), mode field, and remarks.','All','Config, DU_Log'],
  ['DATA UPDATE','Bulk Submit','All factors submitted at once for the selected commodity/type combination.','All','DU_Log, Master_Log'],
  ['DATA UPDATE','REMOVED: Source URL','The required Source URL field was removed. The source_url column in DU_Log is retained but will always be empty ("") for new entries.','—','DU_Log (source_url col always empty)'],
  ['DATA UPDATE','REMOVED: Confidence','The Confidence dropdown was removed. All DU entries are stored as "Medium" in DU_Log.','—','DU_Log (confidence col always Medium)'],
  ['DATA UPDATE','REMOVED: Submit on Behalf','Proxy email field removed from the DU form. Proxy submission still available via Control Center.','—','—'],
  ['','','','',''],

  // ── Tasks ──
  ['TASKS','Task Sections','Three collapsible sections: Daily / Weekly / Monthly, each with its own task list from Config (col V-Z).','All','Config, Task_Log'],
  ['TASKS','Status per Task','Each task row: status dropdown (Pending/Done/Skip) and remarks text field.','All','Task_Log'],
  ['TASKS','Quick All Done','Per-section "⚡ All Done" button to mark all tasks in a section as Done at once.','All','—'],
  ['TASKS','Due Date Badge (NEW)','If a task has a due date (from Config col Z or set at creation), a badge is shown beside the task name. Badge turns red if the due date has passed.','All','Config (col Z)'],
  ['TASKS','+ New Task Button (FIXED)','Opens a modal to add a new ad-hoc task. Previously broken (missing JS functions). Now fully functional with: Task Name, Frequency (Daily/Weekly/Monthly), and optional Due Date fields.','All','Config'],
  ['TASKS','addAdhocTask backend','New task is appended to the Config sheet task section (col V-Z). Task persists for all future sessions with the configured frequency. Due date stored in col Z.','All','Config'],
  ['TASKS','Submit All','Single "Submit All" button submits tasks across all three sections in one RPC call.','All','Task_Log, Master_Log'],
  ['','','','',''],

  // ── Leader Access (NEW) ──
  ['LEADER ACCESS','Overview (NEW)','A new role "Leader" with individually configured view access. SuperAdmin controls which of the 8 views each Leader can see. Leaders see a gated sidebar on login.','SuperAdmin (config) / Leader (use)','Users, LeaderAccess'],
  ['LEADER ACCESS','LeaderAccess Sheet (NEW)','New sheet with two columns: email (Leader\'s email) and allowed_views (comma-separated view keys). Created automatically on first save.','SuperAdmin','LeaderAccess'],
  ['LEADER ACCESS','Valid View Keys','dashboard, mis, du, task, roadster, kanban, research, analytics. Admin views (admin, control, leaderControl, audit) are always denied regardless of config.','SuperAdmin','LeaderAccess'],
  ['LEADER ACCESS','Leader Access Panel','Sidebar entry "Leader Access" (SuperAdmin only). Shows all Leader users in a table with a checkbox grid for each view. "Save" button per row calls saveLeaderConfig().','SuperAdmin','Users, LeaderAccess'],
  ['LEADER ACCESS','Boot Gating','At login, Leader users call getMyLeaderAccess() which returns their configured views. The sidebar is then restricted client-side to only show allowed views.','System','LeaderAccess'],
  ['','','','',''],

  // ── Kanban ──
  ['KANBAN','Board View','5-column board: Assigned → In Progress → Under Review → Done → Blocked. Columns scroll independently.','All','Kanban Tasks'],
  ['KANBAN','Column Scroll (FIXED)','Each Kanban column now scrolls independently with max-height: calc(100vh - 200px). The board no longer requires full-page scroll.','All','—'],
  ['KANBAN','Blocked Reason Banner (FIXED)','When a task has status "Blocked" and a blocked_reason is set, an amber banner is displayed directly on the card. Previously only visible in the detail modal.','All','Kanban Tasks'],
  ['KANBAN','Overdue Styling (FIXED)','Overdue tasks (due_date < today, status ≠ Done) now have a dark red card background (#2d1a1a) + bold red due date label. Previously only a subtle left border.','All','Kanban Tasks'],
  ['KANBAN','Empty Column State (FIXED)','Empty columns now show a "No tasks here" placeholder with a dashed border instead of a blank area.','All','—'],
  ['KANBAN','Create Task','Modal: title, description, factor tag, priority, assignees (multi-select), due date, remark. Managers+ can create; assignees see their tasks.','All','Kanban Tasks'],
  ['KANBAN','Inline Status Change','Status dropdown on each card for quick moves without opening the full modal.','All','Kanban Tasks'],
  ['KANBAN','Drag & Drop','Drag cards between columns; blocked moves require a reason.','All','Kanban Tasks'],
  ['KANBAN','Bulk Move','Select multiple cards then move all to a status column at once.','Manager+','Kanban Tasks'],
  ['KANBAN','Comments','Comment thread per task. Comment count shown on card. Full history in the Comments modal.','All','Kanban Tasks'],
  ['KANBAN','Search & Filters','Search by keyword. Filter by assignee, due date window (any/overdue/today/within 7 days).','All','(client-side)'],
  ['','','','',''],

  // ── Roadster ──
  ['ROADSTER','Daily View','Standalone page showing today\'s Roadster task assignments with Done/Pending toggle.','All','Daily_Roadster, Roadster_Log'],
  ['ROADSTER','Roadster Widget (Dashboard)','Dashboard card showing today\'s Roadster tasks with inline toggle. Uses getRoadsterTasks() RPC.','All','Daily_Roadster, Roadster_Log'],
  ['ROADSTER','KPI Boxes','Total Tasks / Done / Pending counts for the current day.','All','Roadster_Log'],
  ['ROADSTER','Roadster Plan','Manager+ page to add/edit/remove role assignments (role, employee, frequency, remark).','Manager+','Daily_Roadster'],
  ['','','','',''],

  // ── Research ──
  ['RESEARCH','Validation Queue','Entries awaiting second-researcher confirmation before clearing.','Manager+','Master_Log'],
  ['RESEARCH','Coverage Heatmap','Grid showing coverage % per (commodity::type, factor) combination with stale data flags.','Manager+','Master_Log'],
  ['RESEARCH','Outlier Alerts','Entries where data_count deviates >50% from the trailing 5-entry average.','Manager+','Master_Log'],
  ['RESEARCH','Data Freshness','Shows topics not updated within N configurable days.','Manager+','Master_Log'],
  ['RESEARCH','Researcher Accuracy','Per-researcher score: amend rate, outlier rate, timeliness.','Manager+','Master_Log'],
  ['RESEARCH','Team Workload','Per-member Kanban task distribution (open/done/blocked/overdue).','Manager+','Kanban Tasks'],
  ['RESEARCH','Data Lineage','Full revision history for a given topic/subtopic.','Manager+','Master_Log'],
  ['','','','',''],

  // ── Analytics ──
  ['ANALYTICS','KPI Breakdown','Done/Pending/Late rates with SLA breach counts.','Manager+','Master_Log'],
  ['ANALYTICS','SLA Breaches','Table of topics with repeated late submission patterns.','Manager+','Master_Log'],
  ['ANALYTICS','Pending Analysis','Chronically pending topics that never resolve.','Manager+','Master_Log'],
  ['ANALYTICS','Commodity Comparison','Today vs Yesterday vs Last Week for a selected commodity.','Manager+','Master_Log'],
  ['ANALYTICS','CSV Export','Download filtered entries as CSV file.','Manager+','Master_Log'],
  ['ANALYTICS','PDF Export','Generate a formatted PDF report of filtered entries.','SuperAdmin','Master_Log'],
  ['','','','',''],

  // ── Admin ──
  ['ADMIN','User Management','Add/edit/remove users. Fields: email, name, role (Teammate/Leader/Manager/SuperAdmin), department, active, password. Managers can only add Teammates.','Manager+','Users'],
  ['ADMIN','Settings','Configure: Window Start/End, Manager Email, Escalate Days, Lock Duplicate, Require Remarks, SuperAdmin Email, Webhook URLs, Backup Folder.','Manager+','Config (col AB-AC)'],
  ['ADMIN','Triggers','Install or reinstall Apps Script time-based triggers: Daily Reminder (9AM), EOD Summary (6PM), Late Alerts (every 15min), Escalation (8AM).','SuperAdmin','(Script Triggers)'],
  ['','','','',''],

  // ── Control Center ──
  ['CONTROL','User Bulk Actions','Activate or deactivate selected users in bulk. Filter by role/dept/active status.','SuperAdmin','Users'],
  ['CONTROL','Module Toggles','Enable/disable any module (mis, du, task, kanban, crossVal, analytics, audit, etc.). Changes apply on next page load.','SuperAdmin','Config (col AH-AI)'],
  ['CONTROL','Proxy Entry','Submit MIS, DU, or Task entries on behalf of any registered user. Pre-fills the on-behalf-of field and navigates to the form.','SuperAdmin','Master_Log'],
  ['CONTROL','Force Unlock','Unlock a specific entry by log_id, overriding the 24h amend window.','SuperAdmin','Master_Log'],
  ['CONTROL','Bulk Amend','Amend all entries for a user+type+date combination at once.','SuperAdmin','Master_Log'],
  ['CONTROL','Duplicate Lock Toggle','Toggle the global "Lock Duplicate" setting on or off.','SuperAdmin','Config'],
  ['CONTROL','Trigger Alert (Manual)','Fire any alert (Daily Reminder, EOD Summary, Late Alerts, Escalation) on-demand without waiting for the schedule.','SuperAdmin','(MailApp)'],
  ['','','','',''],

  // ── Leader Access ──
  ['LEADER PANEL','Leader Access Control','Table of all Leader-role users. Per-row checkbox grid for 8 view keys. Save button per row writes to LeaderAccess sheet.','SuperAdmin','Users, LeaderAccess'],
  ['LEADER PANEL','Sidebar Entry','"Leader Access" button in sidebar — only visible to SuperAdmin.','SuperAdmin','—'],
  ['','','','',''],

  // ── Audit ──
  ['AUDIT','Audit Trail','Immutable append-only log of all privileged actions. Sheet is write-protected; no exposed function modifies or deletes audit rows.','SuperAdmin','Audit_Log'],
  ['AUDIT','Actions Logged','MIS_SUBMIT, DU_SUBMIT, TASK_SUBMIT, ENTRY_AMEND, CREATE_USER, UPDATE_USER, TOGGLE_MODULE, LEADER_ACCESS_SAVE, and others.','SuperAdmin','Audit_Log'],
  ['AUDIT','Filter','Filter by actor email, action type, and date range.','SuperAdmin','Audit_Log'],
  ['AUDIT','CSV Export','Download filtered audit entries as CSV.','SuperAdmin','Audit_Log'],
  ['','','','',''],

  // ── System ──
  ['SYSTEM','Submission Window','All MIS, DU, Task submissions are rejected outside the configured Window Start/End times. Displayed as a badge in the top bar.','All','Config'],
  ['SYSTEM','Role-Based Access','Sidebar buttons and backend RPCs are gated by role. Teammates < Leaders < Managers < SuperAdmin. Leader sidebar additionally gated per-user by LeaderAccess sheet.','All','Users, LeaderAccess'],
  ['SYSTEM','Theme Toggle','Dark/Light mode. Choice persisted in localStorage (mis.theme).','All','(localStorage)'],
  ['SYSTEM','Draft Auto-Save','MIS, DU, and Task forms auto-save to localStorage on every field change. Draft is restored on next form load; cleared on successful submit.','All','(localStorage)'],
  ['SYSTEM','Cache Layer','Server-side CacheService caches computed RPC results (default 300s TTL). Cache is busted on any write operation via namespace versioning.','System','(CacheService)'],
  ['SYSTEM','Late Alerts','Automated email alerts for late submissions via time-triggered sendLateAlerts(). Runs every 15 minutes; sends once per user-report-date combination.','System','Config, Master_Log'],
  ['SYSTEM','Progressive Dashboard Load','Dashboard loads data in sequence (stats → roadster → trend → report progress → pending → task snapshot), showing skeletons until each section arrives.','System','—'],
  ['','','','',''],

  // ── Config Sheet Layout ──
  ['CONFIG SCHEMA','Col B (EMP_COL=2)','Employee email list. Row 3 onwards.','SuperAdmin','Config'],
  ['CONFIG SCHEMA','Col F–I (RPT_COL=6)','Reports: name, deadline (HH:MM), primary_owner, frequency (Daily/Weekly/Monthly/Mon-Fri/always).','Manager+','Config'],
  ['CONFIG SCHEMA','Col J–M (COMP_RPT_COL=10)','Component-to-report mapping: report_name, component_name, assignee, minCount (minimum data count required for Done status).','Manager+','Config'],
  ['CONFIG SCHEMA','Col P–T (DU_COL=16)','Data Update config: commodity, type, factor, mode (Manual/API), source_reference.','Manager+','Config'],
  ['CONFIG SCHEMA','Col V–Z (TASK_COL=22)','Task list: task_name, assignee, priority, recurrence (daily/weekly/monthly/always/mon-fri), due_date (NEW col Z for timeline).','Manager+','Config'],
  ['CONFIG SCHEMA','Col AB–AC (SET_COL=28)','Settings key-value pairs: Window Start, Window End, Manager Email, Escalate Days, Lock Duplicate, Require Remarks, Slack Webhook URL, Chat Webhook URL, SuperAdmin Email, Super Escalate Days, Backup Folder ID, Webhook API Key.','SuperAdmin','Config'],
  ['CONFIG SCHEMA','Col AH–AI (MOD_COL=34)','Module toggles: module_key → YES/NO. Keys: mis, du, task, kanban, team, analytics, notifications, crossVal, coverage, leaderboard, audit.','SuperAdmin','Config'],
  ['','','','',''],

  // ── LeaderAccess Schema ──
  ['LEADER ACCESS SCHEMA','email','Leader user\'s email address (lowercase). Must match a row in Users sheet with role = "Leader".','SuperAdmin','LeaderAccess'],
  ['LEADER ACCESS SCHEMA','allowed_views','Comma-separated list of view keys the Leader can access. Example: "dashboard,kanban,analytics". Empty = no access to any module view.','SuperAdmin','LeaderAccess'],
];
addSheet('📖 Documentation', docHeaders, docRows);

// ─────────────────────────────────────────────────────────────────────────────
// Write file
// ─────────────────────────────────────────────────────────────────────────────
const outPath = __dirname + '/../MIS_Tracker_Data.xlsx';
XLSX.writeFile(wb, outPath);
console.log('✅  MIS_Tracker_Data.xlsx regenerated successfully');
console.log('    Sheets: Config, Users, LeaderAccess, Master_Log, MIS_Log, DU_Log,');
console.log('            Task_Log, Kanban Tasks, Kanban Sprints, Daily_Roadster,');
console.log('            Roadster_Log, Audit_Log, 📖 Documentation');
