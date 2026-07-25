/* ═══════════════════════════════════════════════════════════════
   DAILY ROADSTER — roadster.gs
   Task-rotation system with dashboard toggle (Done / Pending).
   Sheets used:
     • Daily_Roadster  — rotation config (Role | Employee | … )
     • Roadster_Log    — Date | Role | Employee | Status | Updated At
   ═══════════════════════════════════════════════════════════════ */

var ROADSTER_SHEET = 'Daily_Roadster';
var ROADSTER_LOG   = 'Roadster_Log';

// ── helpers ──────────────────────────────────────────────────────
function _ensureRoadsterLog() {
  var ss = SS;
  var sh = ss.getSheetByName(ROADSTER_LOG);
  if (!sh) {
    sh = ss.insertSheet(ROADSTER_LOG);
    sh.appendRow(['Date', 'Role', 'Employee', 'Status', 'Updated At']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return sh;
}

function _todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ── Get today's Roadster assignments for current user ────────────
// Returns: { success, tasks: [{ role, employee, status }] }
function getRoadsterTasks() {
  var user = getCurrentUser();
  if (!user) return { success: false, message: 'Not authenticated' };

  var ss   = SS;
  var tz   = Session.getScriptTimeZone();
  var today = _todayStr();

  // 1. Read rotation config → who is assigned what today
  var cfgSh = ss.getSheetByName(ROADSTER_SHEET);
  if (!cfgSh) return { success: true, tasks: [] };

  var cfgData = cfgSh.getDataRange().getValues().slice(1); // skip header
  // Expected columns: Role | Employee (email or name) | …extra optional cols
  var assignments = cfgData
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { role: String(r[0]).trim(), employee: String(r[1]).trim() }; });

  // 2. Filter by access
  var isManager = user.role === 'Manager' || user.role === 'SuperAdmin';
  if (!isManager) {
    // Teammates see only their own tasks
    var lc = user.email.toLowerCase();
    var nm = user.name.toLowerCase();
    assignments = assignments.filter(function (a) {
      return a.employee.toLowerCase() === lc || a.employee.toLowerCase() === nm;
    });
  }

  if (!assignments.length) return { success: true, tasks: [] };

  // 3. Read today's log entries
  var logSh = _ensureRoadsterLog();
  var logData = logSh.getDataRange().getValues().slice(1);
  var logMap = {}; // key = role::employee → status
  logData.forEach(function (r) {
    if (!r[0]) return;
    var d = Utilities.formatDate(new Date(r[0]), tz, 'yyyy-MM-dd');
    if (d === today) {
      logMap[String(r[1]).trim() + '::' + String(r[2]).trim()] = String(r[3]).trim();
    }
  });

  // 4. Merge: assignment + logged status (default Pending)
  var tasks = assignments.map(function (a) {
    var key = a.role + '::' + a.employee;
    return { role: a.role, employee: a.employee, status: logMap[key] || 'Pending' };
  });

  return { success: true, tasks: tasks };
}

// ── Toggle / update status ──────────────────────────────────────
// Called from client:  rpc('updateRoadsterStatus', role, status)
function updateRoadsterStatus(role, status) {
  var user = getCurrentUser();
  if (!user) return { success: false, message: 'Not authenticated' };

  var tz    = Session.getScriptTimeZone();
  var today = _todayStr();
  var now   = new Date();

  // Determine the employee name for this role from the config
  var ss    = SS;
  var cfgSh = ss.getSheetByName(ROADSTER_SHEET);
  if (!cfgSh) return { success: false, message: 'Daily_Roadster sheet not found' };

  var cfgData = cfgSh.getDataRange().getValues().slice(1);
  var match = null;
  for (var i = 0; i < cfgData.length; i++) {
    if (String(cfgData[i][0]).trim() === role) { match = cfgData[i]; break; }
  }
  if (!match) return { success: false, message: 'Role not found: ' + role };

  var employee = String(match[1]).trim();

  // Access check: teammates can only toggle their own
  if (user.role === 'Teammate') {
    var lc = user.email.toLowerCase();
    var nm = user.name.toLowerCase();
    if (employee.toLowerCase() !== lc && employee.toLowerCase() !== nm) {
      return { success: false, message: 'Not your task' };
    }
  }

  // Upsert into Roadster_Log
  var logSh = _ensureRoadsterLog();
  var logData = logSh.getDataRange().getValues();
  var found = false;
  for (var j = 1; j < logData.length; j++) {
    if (!logData[j][0]) continue;
    var d = Utilities.formatDate(new Date(logData[j][0]), tz, 'yyyy-MM-dd');
    if (d === today && String(logData[j][1]).trim() === role && String(logData[j][2]).trim() === employee) {
      // Update existing row
      logSh.getRange(j + 1, 4, 1, 2).setValues([[status, now]]);
      found = true;
      break;
    }
  }
  if (!found) {
    logSh.appendRow([new Date(today), role, employee, status, now]);
  }

  return { success: true, status: status };
}

// ── Dashboard integration helper ────────────────────────────────
// Call this from getDashStats or getDashPending so the dashboard
// receives roadsterTasks alongside other data.
function _getRoadsterForDashboard() {
  var result = getRoadsterTasks();
  return result.success ? (result.tasks || []) : [];
}

// ── CRUD for Roadster Configuration (called from UI) ─────────────

function getRoadsterConfigList() {
  var user = getCurrentUser();
  if (!user || (user.role !== 'Manager' && user.role !== 'SuperAdmin')) {
    return { success: false, message: 'Unauthorized' };
  }
  var ss = SS;
  var sh = ss.getSheetByName(ROADSTER_SHEET);
  if (!sh) return { success: true, data: [] };
  
  var data = sh.getDataRange().getValues().slice(1);
  var roles = data
    .filter(function(r) { return r[0] && r[1]; })
    .map(function(r) { return { role: String(r[0]).trim(), employee: String(r[1]).trim() }; });
  
  return { success: true, data: roles };
}

function saveRoadsterConfig(oldRole, newRole, employee) {
  var user = getCurrentUser();
  if (!user || (user.role !== 'Manager' && user.role !== 'SuperAdmin')) {
    return { success: false, message: 'Unauthorized' };
  }
  if (!newRole || !employee) return { success: false, message: 'Missing fields' };
  
  var ss = SS;
  var sh = ss.getSheetByName(ROADSTER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ROADSTER_SHEET);
    sh.appendRow(['Role', 'Employee', 'Notes']);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
  
  var data = sh.getDataRange().getValues();
  var found = false;
  
  // If editing an existing role, find and update it
  if (oldRole) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === oldRole) {
        sh.getRange(i + 1, 1, 1, 2).setValues([[newRole, employee]]);
        found = true;
        break;
      }
    }
  }
  
  // If no oldRole provided, or not found, append a new row
  if (!found) {
    sh.appendRow([newRole, employee, '']);
  }
  
  return { success: true };
}

function deleteRoadsterConfig(role) {
  var user = getCurrentUser();
  if (!user || (user.role !== 'Manager' && user.role !== 'SuperAdmin')) {
    return { success: false, message: 'Unauthorized' };
  }
  if (!role) return { success: false, message: 'Role not specified' };
  
  var ss = SS;
  var sh = ss.getSheetByName(ROADSTER_SHEET);
  if (!sh) return { success: false, message: 'Sheet not found' };
  
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === role) {
      sh.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: 'Role not found' };
}
