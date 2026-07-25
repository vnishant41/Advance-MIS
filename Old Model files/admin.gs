/*****************************************
 * MIS TRACKER v8 — admin.gs
 * Users, settings, module toggles, triggers, email senders.
 * sendLateAlerts is the trigger that replaces in-flow late emails.
 *****************************************/

// ── USERS ────────────────────────────────────────────────────────────────────
function getAllUsers() {
  try {
    const caller = assertRole(ROLES.MANAGER);

    const sh = getSheetOrThrow(USERS_SHEET);
    const rows = sh.getDataRange().getValues().slice(1);

    const filtered = rows.filter(r => {
      if (!r[0]) return false;
      if (caller.role === ROLES.SUPER) return true;
      // Manager: own dept OR any teammate
      return (r[3] || '') === caller.dept || r[2] === ROLES.TEAMMATE;
    }).map(r => {
      const u = {
        email:       String(r[0]).toLowerCase(),
        name:        r[1] || '',
        role:        r[2] || ROLES.TEAMMATE,
        dept:        r[3] || '',
        active:      String(r[4] || 'YES').toUpperCase() !== 'NO',
        commodities: String(r[6] || ''),
        backupOf:    String(r[7] || '').toLowerCase().trim()
      };
      // Only SuperAdmin can see passwords
      if (caller.role === ROLES.SUPER) u.password = String(r[5] || '');
      return u;
    });

    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function addUser(email, name, role, dept, password, commodities, backupOf) {
  try {
    const caller = assertRole(ROLES.MANAGER);

    role = role || ROLES.TEAMMATE;
    if (caller.role === ROLES.MANAGER && role !== ROLES.TEAMMATE) {
      return { success: false, message: 'Managers can only add Teammates' };
    }
    if (caller.role !== ROLES.SUPER && password) {
      return { success: false, message: 'Only SuperAdmin can set passwords' };
    }

    const targetEmail = String(email || '').toLowerCase().trim();
    if (!targetEmail) return { success: false, message: 'Email required' };

    const sh = getSheetOrThrow(USERS_SHEET);
    const existing = _usersRows();
    if (existing.some(r => String(r[0]).toLowerCase() === targetEmail)) {
      return { success: false, message: 'User already exists' };
    }

    const finalDept = dept || caller.dept || '';
    const row = [targetEmail, name || '', role, finalDept, 'YES', password || '', commodities || '', backupOf || ''];
    sh.getRange(sh.getLastRow() + 1, 1, 1, 8).setValues([row]);
    cacheBust(CACHE_NS.USERS); cacheBust(CACHE_NS.MLOG);
    logAudit({ action: 'USER_ADD', targetType: 'user', targetId: targetEmail, after: { name, role, dept: finalDept, commodities, backupOf } });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function updateUser(email, name, role, dept, active, password, commodities, backupOf) {
  try {
    const caller = assertRole(ROLES.MANAGER);

    const targetEmail = String(email || '').toLowerCase().trim();
    if (!targetEmail) return { success: false, message: 'Email required' };

    const sh = getSheetOrThrow(USERS_SHEET);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() !== targetEmail) continue;
      const targetRole = data[i][2] || ROLES.TEAMMATE;

      // Manager restrictions
      if (caller.role === ROLES.MANAGER) {
        if (targetRole === ROLES.MANAGER || targetRole === ROLES.SUPER) {
          return { success: false, message: 'Managers cannot edit Manager or SuperAdmin users' };
        }
        if (role && role !== ROLES.TEAMMATE) {
          return { success: false, message: 'Managers cannot promote to Manager or SuperAdmin' };
        }
        if (dept && dept !== caller.dept) {
          return { success: false, message: 'Managers cannot move users out of their department' };
        }
        if (password !== undefined) {
          return { success: false, message: 'Only SuperAdmin can change passwords' };
        }
      }

      const before = { name: data[i][1], role: targetRole, dept: data[i][3], active: data[i][4], commodities: data[i][6] || '', backupOf: data[i][7] || '' };
      const newRow = [
        data[i][0],
        name !== undefined && name !== null ? name : data[i][1],
        role || targetRole,
        dept || data[i][3] || '',
        active === false ? 'NO' : 'YES',
        password !== undefined && password !== null ? password : (data[i][5] || ''),
        commodities !== undefined && commodities !== null ? commodities : (data[i][6] || ''),
        backupOf !== undefined && backupOf !== null ? backupOf : (data[i][7] || '')
      ];
      sh.getRange(i + 1, 1, 1, 8).setValues([newRow]);
      cacheBust(CACHE_NS.USERS); cacheBust(CACHE_NS.MLOG);
      logAudit({ action: 'USER_UPDATE', targetType: 'user', targetId: targetEmail, before, after: { name: newRow[1], role: newRow[2], dept: newRow[3], active: newRow[4], commodities: newRow[6], backupOf: newRow[7] } });
      return { success: true };
    }
    return { success: false, message: 'User not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function removeUser(email) {
  try {
    const caller = assertRole(ROLES.MANAGER);

    const targetEmail = String(email || '').toLowerCase().trim();
    if (targetEmail === caller.email) return { success: false, message: 'Cannot remove yourself' };

    const sh = getSheetOrThrow(USERS_SHEET);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() !== targetEmail) continue;
      const targetRole = data[i][2] || ROLES.TEAMMATE;
      if (caller.role === ROLES.MANAGER && (targetRole === ROLES.MANAGER || targetRole === ROLES.SUPER)) {
        return { success: false, message: 'Managers cannot remove Manager or SuperAdmin users' };
      }
      const before = { name: data[i][1], role: data[i][2], dept: data[i][3], active: data[i][4] };
      sh.deleteRow(i + 1);
      cacheBust(CACHE_NS.USERS); cacheBust(CACHE_NS.MLOG);
      logAudit({ action: 'USER_REMOVE', targetType: 'user', targetId: targetEmail, before });
      return { success: true };
    }
    return { success: false, message: 'User not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SETTINGS WRITE ───────────────────────────────────────────────────────────
function saveSettings(settings) {
  try {
    const caller = assertRole(ROLES.MANAGER);

    const cfg = getOrCreateSheet(CONFIG_SHEET);
    const allowed = caller.role === ROLES.SUPER
      ? ['Window Start', 'Window End', 'Manager Email', 'Escalate Days', 'Lock Duplicate', 'Require Remarks',
         'Slack Webhook URL', 'Chat Webhook URL', 'SuperAdmin Email', 'Super Escalate Days', 'Backup Folder ID', 'Webhook API Key']
      : ['Window Start', 'Window End', 'Escalate Days', 'Require Remarks']; // Manager subset

    const desired = {
      'Window Start':        settings.windowStart,
      'Window End':          settings.windowEnd,
      'Manager Email':       settings.managerEmail,
      'Escalate Days':       settings.escalateDays,
      'Lock Duplicate':      settings.lockDuplicate ? 'YES' : 'NO',
      'Require Remarks':     settings.requireRemarks ? 'YES' : 'NO',
      'Slack Webhook URL':   settings.slackWebhookUrl,
      'Chat Webhook URL':    settings.chatWebhookUrl,
      'SuperAdmin Email':    settings.superAdminEmail,
      'Super Escalate Days': settings.superEscalateDays,
      'Backup Folder ID':    settings.backupFolderId,
      'Webhook API Key':     settings.webhookApiKey
    };

    const last = cfg.getLastRow();
    const existing = {};
    if (last >= SET_START_ROW) {
      const rows = cfg.getRange(SET_START_ROW, SET_COL, last - SET_START_ROW + 1, 2).getValues();
      rows.forEach((r, i) => { if (r[0]) existing[r[0]] = SET_START_ROW + i; });
    }

    const writes = [];   // { row, col, val }
    const appends = [];  // [key, val]
    allowed.forEach(k => {
      if (desired[k] === undefined) return;
      if (existing[k]) {
        writes.push({ row: existing[k], val: desired[k] });
      } else {
        appends.push([k, desired[k]]);
      }
    });

    // Updates: contiguous-friendly per row, but each is a single setValues call
    writes.forEach(w => cfg.getRange(w.row, SET_COL + 1, 1, 1).setValues([[w.val]]));

    // Appends batched
    if (appends.length) {
      const startRow = Math.max(cfg.getLastRow() + 1, SET_START_ROW);
      cfg.getRange(startRow, SET_COL, appends.length, 2).setValues(appends);
    }

    logAudit({ action: 'SETTINGS_UPDATE', targetType: 'settings', after: settings });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── PREFILL LAST ENTRY TOGGLE (SuperAdmin only) ──────────────────────────────
function togglePrefillLastEntry(enabled) {
  try {
    assertRole(ROLES.SUPER);
    const cfg = getOrCreateSheet(CONFIG_SHEET);
    const last = cfg.getLastRow();
    const key = 'Prefill Last Entry';
    const val = enabled ? 'YES' : 'NO';

    if (last >= SET_START_ROW) {
      const rows = cfg.getRange(SET_START_ROW, SET_COL, last - SET_START_ROW + 1, 2).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === key) {
          cfg.getRange(SET_START_ROW + i, SET_COL + 1, 1, 1).setValues([[val]]);
          logAudit({ action: 'SETTINGS_UPDATE', targetType: 'settings', after: { prefillLastEntry: enabled } });
          return { success: true };
        }
      }
    }
    // Key not found — append
    const appendRow = Math.max(cfg.getLastRow() + 1, SET_START_ROW);
    cfg.getRange(appendRow, SET_COL, 1, 2).setValues([[key, val]]);
    logAudit({ action: 'SETTINGS_UPDATE', targetType: 'settings', after: { prefillLastEntry: enabled } });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── MODULE TOGGLES (SuperAdmin only) ─────────────────────────────────────────
function saveModuleToggles(toggles) {
  try {
    assertRole(ROLES.SUPER);

    const cfg = getOrCreateSheet(CONFIG_SHEET);
    _ensureModulesBlock();

    const last = cfg.getLastRow();
    const existing = {};
    if (last >= MOD_START_ROW) {
      const rows = cfg.getRange(MOD_START_ROW, MOD_COL, last - MOD_START_ROW + 1, 2).getValues();
      rows.forEach((r, i) => { if (r[0]) existing[String(r[0]).toLowerCase()] = MOD_START_ROW + i; });
    }

    const writes = [];
    const appends = [];
    Object.keys(toggles || {}).forEach(k => {
      const key = k.toLowerCase();
      const val = toggles[k] ? 'YES' : 'NO';
      if (existing[key]) writes.push({ row: existing[key], val });
      else appends.push([key, val]);
    });

    writes.forEach(w => cfg.getRange(w.row, MOD_COL + 1, 1, 1).setValues([[w.val]]));
    if (appends.length) {
      const startRow = Math.max(cfg.getLastRow() + 1, MOD_START_ROW);
      cfg.getRange(startRow, MOD_COL, appends.length, 2).setValues(appends);
    }

    logAudit({ action: 'TOGGLES_UPDATE', targetType: 'modules', after: toggles });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── TRIGGERS ─────────────────────────────────────────────────────────────────
function setupTriggers() {
  assertRole(ROLES.SUPER);

  const KNOWN = [
    'sendDailyReminder', 'sendEODSummary', 'sendLateAlerts', 'checkPendingEscalation', 'sendDailyDigest',
    'notifyBlockedTasks', 'notifyAbsentees', 'notifyPersistentPending', 'escalateToSuperAdmin',
    'weeklyDriveBackup'
  ];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (KNOWN.indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sendDailyReminder').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('sendEODSummary').timeBased().atHour(18).everyDays(1).create();
  ScriptApp.newTrigger('checkPendingEscalation').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('sendLateAlerts').timeBased().everyMinutes(15).create();

  // Phase 5
  ScriptApp.newTrigger('notifyBlockedTasks').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('notifyAbsentees').timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger('notifyPersistentPending').timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger('escalateToSuperAdmin').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('weeklyDriveBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();

  logAudit({ action: 'TRIGGERS_INSTALLED', targetType: 'system' });
  return { success: true, message: 'Triggers installed: Reminder/Digest 9AM, EOD 6PM, Escalation 8AM, LateAlerts /15min, BlockedTasks /30min, Absentees/Pending 10AM, SuperEscalate 8AM, DriveBackup Sun 2AM' };
}

// ── EMAIL: DAILY REMINDER ────────────────────────────────────────────────────
function sendDailyReminder() {
  try {
    if (!isModuleEnabled(MODULES.MIS)) return;

    const employees = getEmployeeList();
    const reports = getReportList();
    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();

    const today = ymd(new Date());
    const submitted = {};
    const empEmails = {};
    rows.forEach(r => {
      if (!r[M_COL.LOG_ID - 1] || r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      if (ymd(r[M_COL.DATE - 1]) === today) {
        const name = r[M_COL.ON_NAME - 1];
        const topic = r[M_COL.TOPIC - 1];
        submitted[name + '::' + topic] = true;
      }
      const n = r[M_COL.ON_NAME - 1];
      const e = r[M_COL.ON_EMAIL - 1];
      if (n && e) empEmails[n] = e;
    });

    employees.forEach(emp => {
      const missing = reports.filter(rpt => rpt.dueToday && !submitted[emp + '::' + rpt.name]);
      const to = empEmails[emp];
      if (!missing.length || !to) return;
      MailApp.sendEmail({
        to,
        subject: 'MIS Reminder: ' + missing.length + ' pending',
        body: 'Hi ' + emp + ',\n\nPending today:\n' +
              missing.map(r => '- ' + r.name + (r.deadline ? ' (by ' + r.deadline + ')' : '')).join('\n') +
              '\n\nMIS Tracker'
      });
    });
  } catch (e) { Logger.log('sendDailyReminder: ' + e.message); }
}

// ── EMAIL: END-OF-DAY SUMMARY ────────────────────────────────────────────────
function sendEODSummary() {
  try {
    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();

    const today = ymd(new Date());
    const emp = {};
    rows.forEach(r => {
      if (!r[M_COL.LOG_ID - 1] || r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      if (ymd(r[M_COL.DATE - 1]) !== today) return;
      const name = r[M_COL.ON_NAME - 1];
      const email = r[M_COL.ON_EMAIL - 1];
      if (!emp[name]) emp[name] = { done: 0, pending: 0, skip: 0, email };
      const s = r[M_COL.STATUS - 1];
      if (s === 'Done') emp[name].done++;
      else if (s === 'Pending') emp[name].pending++;
      else if (s === 'Skip') emp[name].skip++;
    });

    Object.keys(emp).forEach(name => {
      const d = emp[name];
      if (!d.email) return;
      const total = d.done + d.pending;
      const pct = total > 0 ? Math.round(d.done / total * 100) : 0;
      MailApp.sendEmail({
        to: d.email,
        subject: 'MIS EOD: ' + pct + '% complete',
        body: 'Hi ' + name + ',\n\nDone: ' + d.done + '\nPending: ' + d.pending + '\nSkip: ' + d.skip + '\n' + pct + '%\n\nMIS Tracker'
      });
    });
  } catch (e) { Logger.log('sendEODSummary: ' + e.message); }
}

// ── EMAIL: LATE ALERTS (replaces in-flow email) ──────────────────────────────
// Triggered every 15 min. Reads Master_Log for is_late=Yes rows whose log_id
// is not yet in the "sent" Properties Service set.
function sendLateAlerts() {
  try {
    const settings = getSettings();
    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    if (last < 2) return;

    // Look back at most ~7 days to keep the scan bounded
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    const rows = sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();

    const props = PropertiesService.getScriptProperties();
    const sent = new Set(JSON.parse(props.getProperty(PROP_LATE_ALERTS) || '[]'));

    const newSent = [];
    rows.forEach(r => {
      const ts = r[M_COL.TS - 1] ? new Date(r[M_COL.TS - 1]) : null;
      if (!ts || ts < cutoff) return;
      if (r[M_COL.LATE - 1] !== 'Yes') return;
      if (r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      const logId = r[M_COL.LOG_ID - 1];
      if (!logId || sent.has(logId)) return;

      const empName = r[M_COL.ON_NAME - 1];
      const empEmail = r[M_COL.ON_EMAIL - 1];
      const report = r[M_COL.TOPIC - 1];
      const t = fmtDate(ts, 'HH:mm');
      const subject = 'Late: ' + report + ' by ' + empName;
      const body = 'Late submission.\n\n' + empName + '\n' + report + '\n' + t + '\n\nMIS Tracker';

      try {
        if (empEmail) MailApp.sendEmail({ to: empEmail, subject, body });
        if (settings.managerEmail) MailApp.sendEmail({ to: settings.managerEmail, subject, body });
        newSent.push(logId);
      } catch (e) { Logger.log('sendLateAlerts mail fail ' + logId + ': ' + e.message); }
    });

    if (newSent.length) {
      newSent.forEach(id => sent.add(id));
      // Cap stored set at 1000 newest IDs to bound property size
      const arr = Array.from(sent);
      const trimmed = arr.length > 1000 ? arr.slice(arr.length - 1000) : arr;
      props.setProperty(PROP_LATE_ALERTS, JSON.stringify(trimmed));
    }
  } catch (e) { Logger.log('sendLateAlerts: ' + e.message); }
}

// ── EMAIL: ESCALATION ────────────────────────────────────────────────────────
function checkPendingEscalation() {
  try {
    const settings = getSettings();
    if (!settings.managerEmail) return;

    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    if (last < 2) return;
    const rows = sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - settings.escalateDays);

    const counts = {};
    rows.forEach(r => {
      if (!r[M_COL.LOG_ID - 1]) return;
      if (r[M_COL.STATUS - 1] !== 'Pending') return;
      if (r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      const dt = r[M_COL.DATE - 1] ? new Date(r[M_COL.DATE - 1]) : null;
      if (!dt || dt >= cutoff) return;
      const k = r[M_COL.ON_NAME - 1] + '::' + r[M_COL.SUB - 1];
      counts[k] = (counts[k] || 0) + 1;
    });

    const alerts = Object.keys(counts).filter(k => counts[k] >= settings.escalateDays);
    if (!alerts.length) return;

    MailApp.sendEmail({
      to: settings.managerEmail,
      subject: 'MIS Escalation',
      body: 'Pending ' + settings.escalateDays + '+ days:\n\n' +
            alerts.map(k => '- ' + k + ' (' + counts[k] + ' days)').join('\n') +
            '\n\nMIS Tracker'
    });
  } catch (e) { Logger.log('checkPendingEscalation: ' + e.message); }
}

// ── ONE-CLICK BOOTSTRAP (run from script editor on first install) ────────────
function bootstrapEverything() {
  initLogSheets();
  initKanbanSheets();
  return { success: true, message: 'All sheets initialised. Now run setupTriggers() to install triggers.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRIVE BACKUP — Phase 5
   Weekly trigger copies the bound spreadsheet into a Drive folder, named
   "MIS Backup yyyy-MM-dd". Cleans up backups older than 12 weeks.
   ═══════════════════════════════════════════════════════════════════════════ */
function weeklyDriveBackup() {
  try {
    const settings = getSettings();
    const folderId = String(settings.backupFolderId || '').trim();
    if (!folderId) { Logger.log('weeklyDriveBackup: no folder configured'); return; }

    const folder = DriveApp.getFolderById(folderId);
    const ssFile = DriveApp.getFileById(SS.getId());
    const stamp = fmtDate(new Date(), 'yyyy-MM-dd');
    const copy = ssFile.makeCopy('MIS Backup ' + stamp, folder);

    // Prune backups older than 12 weeks (84 days). Match by name prefix.
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 84);
    const it = folder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.getName().indexOf('MIS Backup ') !== 0) continue;
      if (f.getDateCreated() < cutoff && f.getId() !== copy.getId()) f.setTrashed(true);
    }

    logAudit({ action: 'DRIVE_BACKUP', targetType: 'system', after: { fileId: copy.getId(), folderId } });
  } catch (e) { Logger.log('weeklyDriveBackup: ' + e.message); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUPERADMIN CONTROL CENTER — Phase 2
   All functions below require ROLES.SUPER.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── ALL USERS WITH last_login + total_entries ────────────────────────────────
function getControlCenterUsers() {
  try {
    assertRole(ROLES.SUPER);

    const sh = getSheetOrThrow(USERS_SHEET);
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 9).getValues();

    const counts = _entryCountsByEmail();

    const users = rows.filter(r => r[0]).map(r => {
      const email = String(r[0]).toLowerCase();
      return {
        email,
        name:        r[1] || '',
        role:        r[2] || ROLES.TEAMMATE,
        dept:        r[3] || '',
        active:      String(r[4] || 'YES').toUpperCase() !== 'NO',
        lastLogin:   r[8] ? String(r[8]) : '',
        totalEntries: counts[email] || 0
      };
    });

    return { success: true, data: users, modules: getEnabledModules(), labels: MODULE_LABELS };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// Single read of Master_Log → counts active rows per on_behalf_of_email.
function _entryCountsByEmail() {
  const sh = getSheet(MASTER_LOG);
  if (!sh) return {};
  const last = sh.getLastRow();
  if (last < 2) return {};
  const rows = sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();
  const out = {};
  rows.forEach(r => {
    if (!r[M_COL.LOG_ID - 1]) return;
    if (r[M_COL.ROW_STATUS - 1] === 'Amended') return;
    const em = String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase();
    if (!em) return;
    out[em] = (out[em] || 0) + 1;
  });
  return out;
}

// ── BULK ACTIVATE / DEACTIVATE ───────────────────────────────────────────────
function bulkSetActive(emails, active) {
  try {
    assertRole(ROLES.SUPER);
    if (!Array.isArray(emails) || !emails.length) return { success: false, message: 'No emails provided' };
    const targets = new Set(emails.map(e => String(e).toLowerCase().trim()));

    const sh = getSheetOrThrow(USERS_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'No users' };

    const data = sh.getRange(2, 1, last - 1, 5).getValues();
    let changed = 0;
    // Build the new column-5 values in one pass; write as one batched setValues.
    const newCol5 = data.map(r => {
      if (targets.has(String(r[0]).toLowerCase().trim())) {
        changed++;
        return [active ? 'YES' : 'NO'];
      }
      return [r[4]];
    });
    sh.getRange(2, 5, newCol5.length, 1).setValues(newCol5);
    cacheBust(CACHE_NS.USERS); cacheBust(CACHE_NS.MLOG);
    logAudit({ action: 'USER_BULK_ACTIVATE', targetType: 'user', targetId: emails.join(','), after: { active, changed } });
    return { success: true, changed };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── BULK AMEND BY FILTER ─────────────────────────────────────────────────────
// Marks every Active Master_Log row matching (employeeEmail, topic, entryDate,
// entryType) as "Amended". Mirrors to module log. SuperAdmin only.
function bulkAmendEntries(filter) {
  try {
    assertRole(ROLES.SUPER);
    if (!filter || !filter.employeeEmail || !filter.entryType) {
      return { success: false, message: 'employeeEmail + entryType required' };
    }

    const master = getSheetOrThrow(MASTER_LOG);
    const last = master.getLastRow();
    if (last < 2) return { success: true, count: 0 };

    const rows = master.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();
    const target = String(filter.employeeEmail).toLowerCase().trim();
    const dateStr = filter.entryDate ? ymd(filter.entryDate) : null;

    const matchedRows = [];
    const matchedIds = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[M_COL.LOG_ID - 1]) continue;
      if (r[M_COL.ROW_STATUS - 1] === 'Amended') continue;
      if (r[M_COL.TYPE - 1] !== filter.entryType) continue;
      if (String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase() !== target) continue;
      if (filter.topic && String(r[M_COL.TOPIC - 1] || '') !== String(filter.topic)) continue;
      if (dateStr && ymd(r[M_COL.DATE - 1]) !== dateStr) continue;
      matchedRows.push(i + 2);
      matchedIds.push(r[M_COL.LOG_ID - 1]);
    }

    if (!matchedRows.length) return { success: true, count: 0 };

    // Single batched write to row_status column: read whole column, mutate, write back.
    const statusCol = master.getRange(2, M_COL.ROW_STATUS, last - 1, 1).getValues();
    const matchSet = new Set(matchedRows);
    for (let i = 0; i < statusCol.length; i++) {
      if (matchSet.has(i + 2)) statusCol[i][0] = 'Amended';
    }
    master.getRange(2, M_COL.ROW_STATUS, statusCol.length, 1).setValues(statusCol);
    _mirrorAmendToModuleLog(filter.entryType, matchedIds);

    cacheBust(CACHE_NS.MLOG);
    logAudit({ action: 'BULK_AMEND', targetType: 'log', targetId: matchedIds.join(','), before: filter, after: { count: matchedRows.length } });
    return { success: true, count: matchedRows.length, logIds: matchedIds };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── TOGGLE GLOBAL DUPLICATE LOCK ─────────────────────────────────────────────
function toggleDuplicateLock() {
  try {
    assertRole(ROLES.SUPER);
    const cur = getSettings();
    const next = !cur.lockDuplicate;
    return saveSettings(Object.assign({}, cur, { lockDuplicate: next }));
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── MANUALLY TRIGGER ANY ALERT ───────────────────────────────────────────────
const _ALERT_WHITELIST = [
  'sendDailyReminder', 'sendEODSummary', 'sendLateAlerts', 'checkPendingEscalation',
  'sendDailyDigest', 'notifyBlockedTasks', 'notifyAbsentees', 'notifyPersistentPending',
  'escalateToSuperAdmin', 'weeklyDriveBackup'
];

function triggerAlert(name) {
  try {
    assertRole(ROLES.SUPER);
    if (_ALERT_WHITELIST.indexOf(name) === -1) return { success: false, message: 'Unknown alert: ' + name };
    if (name === 'sendDailyReminder')        sendDailyReminder();
    else if (name === 'sendEODSummary')      sendEODSummary();
    else if (name === 'sendLateAlerts')      sendLateAlerts();
    else if (name === 'checkPendingEscalation') checkPendingEscalation();
    else if (name === 'sendDailyDigest')        sendDailyDigest();
    else if (name === 'notifyBlockedTasks')     notifyBlockedTasks();
    else if (name === 'notifyAbsentees')        notifyAbsentees();
    else if (name === 'notifyPersistentPending') notifyPersistentPending();
    else if (name === 'escalateToSuperAdmin')   escalateToSuperAdmin();
    else if (name === 'weeklyDriveBackup')      weeklyDriveBackup();
    logAudit({ action: 'MANUAL_TRIGGER', targetType: 'trigger', targetId: name });
    return { success: true, message: 'Triggered: ' + name };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS — Phase 5
   Slack / Google Chat webhooks. Triggers for blocked tasks, absentees,
   persistent pending, and the escalation chain extending Manager → SuperAdmin.
   ═══════════════════════════════════════════════════════════════════════════ */

// Generic webhook poster. Slack and Chat both accept { text } JSON.
function _postWebhook(url, text) {
  if (!url || !text) return false;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { Logger.log('webhook fail: ' + e.message); return false; }
}

function notifyChannels(text) {
  const s = getSettings();
  let any = false;
  if (s.slackWebhookUrl) any = _postWebhook(s.slackWebhookUrl, text) || any;
  if (s.chatWebhookUrl)  any = _postWebhook(s.chatWebhookUrl,  text) || any;
  return any;
}

// ── BLOCKED TASKS NOTIFIER (every 30 min) ───────────────────────────────────
// Fires once per (taskId × notification round) using PropertiesService dedup.
function notifyBlockedTasks() {
  try {
    if (!isModuleEnabled(MODULES.NOTIFICATIONS) || !isModuleEnabled(MODULES.KANBAN)) return;
    const sh = getSheet(KANBAN_SHEET);
    if (!sh) return;
    const last = sh.getLastRow();
    if (last < 2) return;
    const data = sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
    const blocked = data.filter(r =>
      r[K_COL.ID - 1] && r[K_COL.STATUS - 1] === 'Blocked'
    );
    if (!blocked.length) return;

    const props = PropertiesService.getScriptProperties();
    const sentKey = 'BLOCKED_NOTIFIED';
    const sent = new Set(JSON.parse(props.getProperty(sentKey) || '[]'));

    const fresh = blocked.filter(r => !sent.has(String(r[K_COL.ID - 1])));
    if (!fresh.length) return;

    const lines = fresh.map(r => '• ' + (r[K_COL.TITLE - 1] || r[K_COL.ID - 1]) +
      ' (' + (r[K_COL.ASSIGNEE_NAME - 1] || r[K_COL.ASSIGNEE - 1]) + ')' +
      (r[K_COL.BLOCK_REASON - 1] ? ' — ' + r[K_COL.BLOCK_REASON - 1] : ''));
    notifyChannels('🚫 *Blocked tasks need attention*\n' + lines.join('\n'));

    fresh.forEach(r => sent.add(String(r[K_COL.ID - 1])));
    const arr = Array.from(sent);
    props.setProperty(sentKey, JSON.stringify(arr.length > 500 ? arr.slice(arr.length - 500) : arr));
  } catch (e) { Logger.log('notifyBlockedTasks: ' + e.message); }
}

// ── ABSENCE DETECTOR (daily) ────────────────────────────────────────────────
// No submission in 2+ days → alert that user's Manager.
function notifyAbsentees() {
  try {
    if (!isModuleEnabled(MODULES.NOTIFICATIONS)) return;
    const settings = getSettings();
    const today = ymd(new Date());
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return ymd(d); })();

    const tail = readSheetTail(MASTER_LOG, 1500, MASTER_LOG_COLS);
    const lastSeen = {};
    tail.forEach(r => {
      if (!r[M_COL.LOG_ID - 1] || r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      const em = String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase();
      const ds = ymd(r[M_COL.DATE - 1]);
      if (!lastSeen[em] || ds > lastSeen[em]) lastSeen[em] = ds;
    });

    const absentees = _usersRows()
      .filter(u => u[2] === ROLES.TEAMMATE && String(u[4] || 'YES').toUpperCase() !== 'NO')
      .map(u => ({ email: String(u[0]).toLowerCase(), name: u[1], dept: u[3] || '', last: lastSeen[String(u[0]).toLowerCase()] || '' }))
      .filter(u => !u.last || u.last < cutoff);

    if (!absentees.length) return;

    // Group by dept; alert each dept Manager (fall back to settings.managerEmail)
    const deptManager = {};
    _usersRows().forEach(u => {
      if (u[2] === ROLES.MANAGER && u[3]) deptManager[u[3]] = String(u[0]).toLowerCase();
    });

    const byDept = {};
    absentees.forEach(a => { (byDept[a.dept] = byDept[a.dept] || []).push(a); });

    Object.keys(byDept).forEach(dept => {
      const list = byDept[dept];
      const to = deptManager[dept] || settings.managerEmail;
      if (!to) return;
      const lines = list.map(a => '- ' + a.name + ' (' + a.email + ') — last entry: ' + (a.last || 'never'));
      MailApp.sendEmail({
        to,
        subject: 'MIS Absentees — ' + dept + ' — ' + list.length + ' user(s) missing 2+ days',
        body: 'These teammates have not submitted in 2+ days as of ' + today + ':\n\n' + lines.join('\n') + '\n\nMIS Tracker'
      });
      notifyChannels('📅 *Absent 2+ days* — ' + dept + ': ' + list.map(a => a.name).join(', '));
    });
  } catch (e) { Logger.log('notifyAbsentees: ' + e.message); }
}

// ── PERSISTENT-PENDING AUTO-FLAG (daily) ────────────────────────────────────
// Same component Pending 3 days running → notify Manager.
function notifyPersistentPending() {
  try {
    if (!isModuleEnabled(MODULES.NOTIFICATIONS)) return;
    const settings = getSettings();
    const today = ymd(new Date());
    const tail = readSheetTail(MASTER_LOG, 1500, MASTER_LOG_COLS);

    // For each (employee, topic, sub_topic), check 3 days back: Pending each day?
    const days = [];
    for (let i = 0; i < 3; i++) { const d = new Date(); d.setDate(d.getDate() - i); days.push(ymd(d)); }
    const dayset = new Set(days);

    const grid = {}; // key -> { dates: Set, employee, dept, topic, sub }
    tail.forEach(r => {
      if (!r[M_COL.LOG_ID - 1] || r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      const ds = ymd(r[M_COL.DATE - 1]);
      if (!dayset.has(ds)) return;
      if (r[M_COL.STATUS - 1] !== 'Pending') return;
      const key = String(r[M_COL.ON_EMAIL - 1] || '') + '||' + String(r[M_COL.TOPIC - 1] || '') + '||' + String(r[M_COL.SUB - 1] || '');
      if (!grid[key]) grid[key] = { dates: new Set(), employee: r[M_COL.ON_NAME - 1], topic: r[M_COL.TOPIC - 1], sub: r[M_COL.SUB - 1] };
      grid[key].dates.add(ds);
    });

    const flagged = Object.values(grid).filter(g => g.dates.size >= 3);
    if (!flagged.length) return;

    const lines = flagged.map(g => '- ' + g.employee + ' · ' + g.topic + ' / ' + g.sub);
    if (settings.managerEmail) {
      MailApp.sendEmail({
        to: settings.managerEmail,
        subject: 'MIS Persistent Pending — ' + flagged.length + ' factor(s) stuck 3 days',
        body: 'Pending each of the last 3 days:\n\n' + lines.join('\n') + '\n\nMIS Tracker'
      });
    }
    notifyChannels('⚠️ *Persistent pending* — ' + flagged.length + ' factor(s) stuck 3 days:\n' + lines.join('\n'));
  } catch (e) { Logger.log('notifyPersistentPending: ' + e.message); }
}

// ── EXTEND ESCALATION CHAIN ─────────────────────────────────────────────────
// If Manager-level escalation has been alerting for `superEscalateDays` more
// days with no resolution, also alert the SuperAdmin.
function escalateToSuperAdmin() {
  try {
    if (!isModuleEnabled(MODULES.NOTIFICATIONS)) return;
    const settings = getSettings();
    if (!settings.superAdminEmail) return;

    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    if (last < 2) return;
    const rows = sh.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();

    const cutoffMgr   = new Date(); cutoffMgr.setDate(cutoffMgr.getDate() - settings.escalateDays);
    const cutoffSuper = new Date(); cutoffSuper.setDate(cutoffSuper.getDate() - settings.escalateDays - settings.superEscalateDays);

    const stale = {};
    rows.forEach(r => {
      if (!r[M_COL.LOG_ID - 1]) return;
      if (r[M_COL.STATUS - 1] !== 'Pending') return;
      if (r[M_COL.ROW_STATUS - 1] === 'Amended') return;
      const dt = r[M_COL.DATE - 1] ? new Date(r[M_COL.DATE - 1]) : null;
      if (!dt || dt >= cutoffSuper) return;
      const k = r[M_COL.ON_NAME - 1] + '::' + r[M_COL.TOPIC - 1] + '::' + r[M_COL.SUB - 1];
      stale[k] = (stale[k] || 0) + 1;
    });

    const items = Object.keys(stale);
    if (!items.length) return;

    MailApp.sendEmail({
      to: settings.superAdminEmail,
      subject: 'MIS SuperAdmin Escalation — ' + items.length + ' item(s) ignored ' + (settings.escalateDays + settings.superEscalateDays) + '+ days',
      body: 'These items remain Pending past the Manager escalation window and require SuperAdmin attention:\n\n' +
            items.map(k => '- ' + k + ' (' + stale[k] + ' days)').join('\n') + '\n\nMIS Tracker'
    });
    notifyChannels('🔥 *SuperAdmin escalation* — ' + items.length + ' Pending item(s) past Manager+SuperAdmin windows.');
  } catch (e) { Logger.log('escalateToSuperAdmin: ' + e.message); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIT TRAIL — Phase 4
   ═══════════════════════════════════════════════════════════════════════════ */

// Best-effort: never blocks the calling write. Failures only logged.
function logAudit(opts) {
  try {
    const sh = SS.getSheetByName(AUDIT_LOG);
    if (!sh) return;
    const actor = currentEmail() || 'system';
    const onBehalfOf = opts && opts.onBehalfOfEmail
      ? String(opts.onBehalfOfEmail).toLowerCase()
      : actor;
    const isProxy = onBehalfOf && onBehalfOf !== actor;
    const row = [
      'A' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      new Date(),
      actor,
      String(opts.action || 'UNKNOWN'),
      String(opts.targetType || ''),
      String(opts.targetId || ''),
      opts.before === undefined ? '' : (typeof opts.before === 'string' ? opts.before : JSON.stringify(opts.before).slice(0, 5000)),
      opts.after  === undefined ? '' : (typeof opts.after === 'string'  ? opts.after  : JSON.stringify(opts.after).slice(0, 5000)),
      isProxy ? 'Yes' : 'No'
    ];
    sh.getRange(sh.getLastRow() + 1, 1, 1, AUDIT_LOG_COLS).setValues([row]);
  } catch (e) { Logger.log('logAudit: ' + e.message); }
}

function getAuditLog(filters) {
  try {
    assertRole(ROLES.SUPER);
    const sh = getSheet(AUDIT_LOG);
    if (!sh) return { success: true, data: [] };
    const last = sh.getLastRow();
    if (last < 2) return { success: true, data: [] };

    const f = filters || {};
    const userFilter   = f.user ? String(f.user).toLowerCase() : '';
    const actionFilter = f.action || '';
    const fromDate = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00') : null;
    const toDate   = f.dateTo   ? new Date(f.dateTo   + 'T23:59:59') : null;

    const rows = sh.getRange(2, 1, last - 1, AUDIT_LOG_COLS).getValues();
    const data = rows.filter(r => {
      if (!r[A_COL.ID - 1]) return false;
      if (userFilter && String(r[A_COL.ACTOR - 1]).toLowerCase() !== userFilter) return false;
      if (actionFilter && String(r[A_COL.ACTION - 1]) !== actionFilter) return false;
      const ts = r[A_COL.TS - 1] ? new Date(r[A_COL.TS - 1]) : null;
      if (fromDate && (!ts || ts < fromDate)) return false;
      if (toDate   && (!ts || ts > toDate))   return false;
      return true;
    }).slice(-1000).reverse().map(r => ({
      auditId:    r[A_COL.ID - 1],
      timestamp:  r[A_COL.TS - 1] ? fmtDate(r[A_COL.TS - 1], 'yyyy-MM-dd HH:mm:ss') : '',
      actor:      r[A_COL.ACTOR - 1],
      action:     r[A_COL.ACTION - 1],
      targetType: r[A_COL.TYPE - 1],
      targetId:   r[A_COL.TARGET - 1],
      before:     r[A_COL.BEFORE - 1],
      after:      r[A_COL.AFTER - 1],
      isProxy:    r[A_COL.IS_PROXY - 1] === 'Yes'
    }));

    return { success: true, data };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// List of distinct action names for filter dropdown.
function getAuditActions() {
  try {
    assertRole(ROLES.SUPER);
    const sh = getSheet(AUDIT_LOG);
    if (!sh) return { success: true, data: [] };
    const last = sh.getLastRow();
    if (last < 2) return { success: true, data: [] };
    const rows = sh.getRange(2, A_COL.ACTION, last - 1, 1).getValues();
    const set = new Set();
    rows.forEach(r => { if (r[0]) set.add(r[0]); });
    return { success: true, data: Array.from(set).sort() };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DAILY DIGEST — Phase 4
   Manager 9 AM email with yesterday's summary for own department.
   ═══════════════════════════════════════════════════════════════════════════ */
function sendDailyDigest() {
  try {
    const sh = getSheetOrThrow(MASTER_LOG);
    const last = sh.getLastRow();
    if (last < 2) return;

    // Yesterday in script timezone
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yStr = ymd(yest);

    // Look back ~3 days to keep scan bounded
    const tail = readSheetTail(MASTER_LOG, 800, MASTER_LOG_COLS);
    const yesterdayRows = tail.filter(r => r[M_COL.LOG_ID - 1] && r[M_COL.ROW_STATUS - 1] !== 'Amended' && ymd(r[M_COL.DATE - 1]) === yStr);

    // Per-dept aggregation
    const usersRows = _usersRows();
    const userByEmail = {};
    usersRows.forEach(u => { userByEmail[String(u[0]).toLowerCase()] = { name: u[1], dept: u[3] || '', role: u[2] }; });

    // Find managers (one digest per dept)
    const deptManagers = {};
    usersRows.forEach(u => {
      if (u[2] === ROLES.MANAGER && u[3]) deptManagers[u[3]] = String(u[0]).toLowerCase();
    });

    Object.keys(deptManagers).forEach(dept => {
      const mgrEmail = deptManagers[dept];
      const deptRows = yesterdayRows.filter(r => {
        const u = userByEmail[String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase()];
        return u && u.dept === dept;
      });
      if (!deptRows.length) return;

      const total = deptRows.length;
      const done    = deptRows.filter(r => r[M_COL.STATUS - 1] === 'Done').length;
      const pending = deptRows.filter(r => r[M_COL.STATUS - 1] === 'Pending').length;
      const skip    = deptRows.filter(r => r[M_COL.STATUS - 1] === 'Skip').length;
      const late    = deptRows.filter(r => r[M_COL.LATE - 1] === 'Yes').length;
      const pct     = (done + pending) > 0 ? Math.round(done / (done + pending) * 100) : 0;

      // Per-employee breakdown
      const perEmp = {};
      deptRows.forEach(r => {
        const em = String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase();
        if (!perEmp[em]) perEmp[em] = { name: r[M_COL.ON_NAME - 1], done: 0, pending: 0, skip: 0, late: 0 };
        const s = r[M_COL.STATUS - 1];
        if (s === 'Done') perEmp[em].done++;
        else if (s === 'Pending') perEmp[em].pending++;
        else if (s === 'Skip') perEmp[em].skip++;
        if (r[M_COL.LATE - 1] === 'Yes') perEmp[em].late++;
      });

      const empLines = Object.values(perEmp).map(e =>
        '  ' + e.name + ': ' + e.done + ' done, ' + e.pending + ' pending, ' + e.skip + ' skip' + (e.late ? ', ' + e.late + ' LATE' : '')
      ).join('\n');

      MailApp.sendEmail({
        to: mgrEmail,
        subject: 'MIS Daily Digest — ' + dept + ' — ' + yStr + ' (' + pct + '%)',
        body:
          'Yesterday\'s summary for ' + dept + ' (' + yStr + ')\n\n' +
          'Total entries: ' + total + '\n' +
          'Done: ' + done + ' (' + pct + '%)\n' +
          'Pending: ' + pending + '\n' +
          'Skip: ' + skip + '\n' +
          'Late submissions: ' + late + '\n\n' +
          'Per teammate:\n' + empLines + '\n\n' +
          'MIS Tracker'
      });
    });
  } catch (e) { Logger.log('sendDailyDigest: ' + e.message); }
}

// ── LEADER ACCESS CONTROL ─────────────────────────────────────────────────────
// Sheet "LeaderAccess" columns: email | allowed_views (comma-separated) | name (cached)

function getLeaderConfig() {
  try {
    assertRole(ROLES.SUPER);
    // Fetch all Leader-role users from Users sheet
    const usersSh = getSheetOrThrow(USERS_SHEET);
    const usersData = usersSh.getDataRange().getValues().slice(1);
    const leaders = usersData.filter(r => r[0] && r[2] === ROLES.LEADER && String(r[4] || 'YES').toUpperCase() !== 'NO')
      .map(r => ({ email: String(r[0]).toLowerCase(), name: r[1] || '', role: r[2] }));

    if (!leaders.length) return { success: true, data: [] };

    // Read existing access config
    const sh = getOrCreateSheet(LEADER_ACCESS_SHEET);
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
    const accessMap = {};
    rows.forEach(r => {
      const em = String(r[0] || '').toLowerCase().trim();
      if (em) accessMap[em] = String(r[1] || '').split(',').map(s => s.trim()).filter(Boolean);
    });

    const data = leaders.map(l => ({
      email: l.email,
      name:  l.name,
      views: accessMap[l.email] || []
    }));

    return { success: true, data };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function saveLeaderConfig(email, views) {
  try {
    assertRole(ROLES.SUPER);
    email = String(email || '').toLowerCase().trim();
    if (!email) return { success: false, message: 'Email required' };
    if (!Array.isArray(views)) views = [];
    const viewStr = views.join(',');

    const sh = getOrCreateSheet(LEADER_ACCESS_SHEET);
    // Ensure header
    if (sh.getLastRow() < 1) sh.appendRow(['email', 'allowed_views']);

    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
    let found = false;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').toLowerCase().trim() === email) {
        sh.getRange(i + 2, 2).setValue(viewStr);
        found = true;
        break;
      }
    }
    if (!found) sh.appendRow([email, viewStr]);

    logAudit({ action: 'LEADER_ACCESS_SAVE', targetType: 'leader', targetId: email, after: { views } });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function getMyLeaderAccess() {
  try {
    const caller = assertRole(ROLES.LEADER);
    const sh = getSheet(LEADER_ACCESS_SHEET);
    if (!sh || sh.getLastRow() < 2) return { success: true, views: [] };
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').toLowerCase().trim() === caller.email) {
        const views = String(rows[i][1] || '').split(',').map(s => s.trim()).filter(Boolean);
        return { success: true, views };
      }
    }
    return { success: true, views: [] };
  } catch (e) {
    return { success: false, views: [], message: e.message || String(e) };
  }
}
