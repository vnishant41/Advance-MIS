/*****************************************
 * MIS TRACKER v8 — utils.gs
 * All constants and shared helpers.
 * Every other module reads constants from here.
 *****************************************/

// ── SPREADSHEET ──────────────────────────────────────────────────────────────
const SS = SpreadsheetApp.getActive();

// ── SHEET NAMES ──────────────────────────────────────────────────────────────
const USERS_SHEET        = 'Users';
const CONFIG_SHEET       = 'Config';
const KANBAN_SHEET       = 'Kanban Tasks';
const SPRINT_SHEET       = 'Kanban Sprints';
const MASTER_LOG         = 'Master_Log';
const MIS_LOG            = 'MIS_Log';
const DU_LOG             = 'DU_Log';
const TASK_LOG           = 'Task_Log';
const AUDIT_LOG          = 'Audit_Log';
const LEADER_ACCESS_SHEET = 'LeaderAccess';

// ── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  SUPER:    'SuperAdmin',
  MANAGER:  'Manager',
  LEADER:   'Leader',
  TEAMMATE: 'Teammate'
});
const ROLE_LEVEL = { Teammate: 1, Leader: 1.5, Manager: 2, SuperAdmin: 3 };

// ── ENTRY TYPES ──────────────────────────────────────────────────────────────
const ENTRY_TYPE = Object.freeze({
  MIS:  'MISReport',
  DU:   'DataUpdate',
  TASK: 'Task'
});

// ── MODULE KEYS (toggleable from Control Center) ─────────────────────────────
// Dashboard and Admin are NOT toggleable — they are always available
// (Admin is gated by role, Dashboard is the default landing).
const MODULES = Object.freeze({
  MIS:           'mis',
  DU:            'du',
  TASK:          'task',
  KANBAN:        'kanban',
  TEAM:          'team',
  ANALYTICS:     'analytics',
  NOTIFICATIONS: 'notifications',
  LEADERBOARD:   'leaderboard',
  AUDIT:         'audit'
});

// Display labels for the Control Center toggle UI.
const MODULE_LABELS = Object.freeze({
  mis:           'MIS Report Entry',
  du:            'Data Update Entry',
  task:          'Task Entry',
  kanban:        'Kanban Board',
  team:          'Team Dashboard',
  analytics:     'Analytics',
  notifications: 'Notifications',
  leaderboard:   'Leaderboard',
  audit:         'Audit Trail'
});

// ── CONFIG SHEET LAYOUT (existing v6 column blocks preserved) ────────────────
const EMP_COL = 2,  EMP_START_ROW = 3;
const RPT_COL = 6,  RPT_START_ROW = 3;
const COMP_RPT_COL = 10, COMP_START_ROW = 3;
const DU_COL  = 16, DU_START_ROW  = 3;
const TASK_COL = 22, TASK_START_ROW = 3;
const SET_COL = 28, SET_START_ROW = 3;

// ── NEW: APP_MODULES BLOCK (toggles) ─────────────────────────────────────────
const MOD_COL = 34, MOD_START_ROW = 3;

// ── LOG COLUMN COUNTS (Phase 4: +source_url, confidence, validated_by) ──────
const MASTER_LOG_COLS = 21;
const MIS_LOG_COLS    = 16;
const DU_LOG_COLS     = 16;
const TASK_LOG_COLS   = 14;
const AUDIT_LOG_COLS  = 9;

// Confidence values
const CONFIDENCE = Object.freeze({ HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' });

// ── PROPERTIES KEYS ──────────────────────────────────────────────────────────
const PROP_LATE_ALERTS = 'LATE_ALERTS_SENT';

// ── SHEET ACCESS ─────────────────────────────────────────────────────────────
function getSheet(name) {
  return SS.getSheetByName(name);
}

function getSheetOrThrow(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name + '. Run initLogSheets() from the script editor.');
  return sh;
}

function getOrCreateSheet(name) {
  let sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  return sh;
}

// ── ID + TIME HELPERS ────────────────────────────────────────────────────────
function newLogId() {
  return 'LOG' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function nowTs() { return new Date(); }

function tz() { return Session.getScriptTimeZone(); }

function fmtDate(d, pattern) {
  if (!d) return '';
  return Utilities.formatDate(d instanceof Date ? d : new Date(d), tz(), pattern);
}

function ymd(d) { return fmtDate(d, 'yyyy-MM-dd'); }

function monthYear(d) { return fmtDate(d, 'MMMM yyyy'); }

function getWeekNumber(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yr = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yr) / 86400000) + 1) / 7);
}

// ── USER HELPERS ─────────────────────────────────────────────────────────────
function currentEmail() {
  try { return (Session.getActiveUser().getEmail() || '').toLowerCase(); }
  catch (e) { return ''; }
}

function _usersRows() {
  const sh = getSheet(USERS_SHEET);
  if (!sh) return [];
  const data = sh.getDataRange().getValues().slice(1);
  // Columns: 0=email, 1=name, 2=role, 3=dept, 4=active, 5=password, 6=commodities, 7=backup_of
  return data.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6] || '', r[7] || '']).filter(r => r[0]);
}

function findUser(email) {
  if (!email) return null;
  const target = String(email).toLowerCase().trim();
  const rows = _usersRows();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).toLowerCase().trim() === target) {
      return {
        email:       String(r[0]).toLowerCase().trim(),
        name:        r[1] || String(r[0]).split('@')[0],
        role:        r[2] || ROLES.TEAMMATE,
        dept:        r[3] || '',
        active:      String(r[4] || 'YES').toUpperCase() !== 'NO',
        password:    String(r[5] || ''),
        commodities: String(r[6] || ''),
        backupOf:    String(r[7] || '').toLowerCase().trim()
      };
    }
  }
  return null;
}

function getAllUsers() {
  return _usersRows().map(r => ({
    email:       String(r[0]).toLowerCase().trim(),
    name:        r[1] || String(r[0]).split('@')[0],
    role:        r[2] || ROLES.TEAMMATE,
    dept:        r[3] || '',
    active:      String(r[4] || 'YES').toUpperCase() !== 'NO',
    commodities: String(r[6] || ''),
    backupOf:    String(r[7] || '').toLowerCase().trim()
  })).filter(u => u.active);
}

function resolveName(email) {
  const u = findUser(email);
  return u ? u.name : (email || '');
}

// ── COMMODITY ACCESS HELPER ──────────────────────────────────────────────────
// Returns an array of commodity names the user can access, e.g. ['Coffee','Wheat'].
// Returns null if the user has unrestricted access (Manager+ roles).
// Merges own commodities + backup_of user's commodities (if backup is assigned).
function getUserCommodities(userOrEmail) {
  const u = typeof userOrEmail === 'string' ? findUser(userOrEmail) : userOrEmail;
  if (!u) return [];
  // Manager+ always have unrestricted access
  if (roleAtLeast(u.role, ROLES.MANAGER)) return null;

  const own = _parseCommodities(u.commodities);

  // If backup_of is set, merge the backup-target's commodities
  if (u.backupOf) {
    const backup = findUser(u.backupOf);
    if (backup) {
      const backupComms = _parseCommodities(backup.commodities);
      backupComms.forEach(c => { if (own.indexOf(c) === -1) own.push(c); });
    }
  }
  return own;
}

// Parse comma-separated commodity string into a clean array
function _parseCommodities(str) {
  return String(str || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ── SETTINGS (read-only helper here; saveSettings lives in admin.gs) ─────────
function defaultSettings() {
  return {
    windowStart:        '08:00',
    windowEnd:          '20:00',
    managerEmail:       '',
    escalateDays:       3,
    lockDuplicate:      true,
    requireRemarks:     true,
    // Phase 5
    slackWebhookUrl:    '',
    chatWebhookUrl:     '',
    superAdminEmail:    '',
    superEscalateDays:  2,
    backupFolderId:     '',
    webhookApiKey:      '',
    prefillLastEntry:   false
  };
}

function getSettings() {
  try {
    const cfg = getSheet(CONFIG_SHEET);
    if (!cfg) return defaultSettings();
    const last = cfg.getLastRow();
    if (last < SET_START_ROW) return defaultSettings();
    const rows = cfg.getRange(SET_START_ROW, SET_COL, last - SET_START_ROW + 1, 2).getValues();
    const s = defaultSettings();
    rows.forEach(r => {
      const k = String(r[0] || '').trim();
      const v = String(r[1] || '').trim();
      if (!k) return;
      if (k === 'Window Start')        s.windowStart  = v || s.windowStart;
      if (k === 'Window End')          s.windowEnd    = v || s.windowEnd;
      if (k === 'Manager Email')       s.managerEmail = v;
      if (k === 'Escalate Days')       s.escalateDays = parseInt(v, 10) || 3;
      if (k === 'Lock Duplicate')      s.lockDuplicate  = v.toUpperCase() !== 'NO';
      if (k === 'Require Remarks')     s.requireRemarks = v.toUpperCase() !== 'NO';
      if (k === 'Slack Webhook URL')   s.slackWebhookUrl = v;
      if (k === 'Chat Webhook URL')    s.chatWebhookUrl  = v;
      if (k === 'SuperAdmin Email')    s.superAdminEmail = v;
      if (k === 'Super Escalate Days') s.superEscalateDays = parseInt(v, 10) || 2;
      if (k === 'Backup Folder ID')    s.backupFolderId = v;
      if (k === 'Webhook API Key')     s.webhookApiKey  = v;
      if (k === 'Prefill Last Entry')  s.prefillLastEntry = v.toUpperCase() === 'YES';
    });
    return s;
  } catch (e) {
    return defaultSettings();
  }
}

function withinSubmissionWindow() {
  const s = getSettings();
  const now = fmtDate(new Date(), 'HH:mm');
  return {
    open:  now >= s.windowStart && now <= s.windowEnd,
    start: s.windowStart,
    end:   s.windowEnd,
    now:   now
  };
}

// ── MODULE TOGGLES (read from Config App_Modules block) ──────────────────────
function _readModulesBlock() {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return {};
  const last = cfg.getLastRow();
  if (last < MOD_START_ROW) return {};
  const rows = cfg.getRange(MOD_START_ROW, MOD_COL, last - MOD_START_ROW + 1, 2).getValues();
  const out = {};
  rows.forEach(r => {
    const k = String(r[0] || '').trim().toLowerCase();
    if (!k) return;
    out[k] = String(r[1] || 'YES').toUpperCase() !== 'NO';
  });
  return out;
}

function getEnabledModules() {
  const stored = _readModulesBlock();
  const all = Object.values(MODULES);
  const out = {};
  all.forEach(k => { out[k] = (k in stored) ? stored[k] : true; });
  return out;
}

function isModuleEnabled(key) {
  const m = getEnabledModules();
  return !!m[String(key || '').toLowerCase()];
}

// ── ROLE CHECK ───────────────────────────────────────────────────────────────
function roleAtLeast(userRole, minRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

// ── CACHE LAYER ──────────────────────────────────────────────────────────────
// Versioned namespace bust: bumping a namespace's version effectively
// invalidates every key under that namespace without enumerating them.
// CacheService entries are size-capped (~100KB / key, ~9MB total per script);
// we cache computed RPC results (small) rather than raw sheet rows.

const CACHE_NS = Object.freeze({
  MLOG:   'mlog',    // anything derived from Master_Log
  KANBAN: 'kanban',  // anything derived from Kanban Tasks / Sprints
  USERS:  'users'    // anything derived from Users sheet
});

function _cache() { return CacheService.getScriptCache(); }
function _props() { return PropertiesService.getScriptProperties(); }

function _nsVersion(namespace) {
  const key = 'cache_v_' + namespace;
  let v = _props().getProperty(key);
  if (!v) { v = String(Date.now()); _props().setProperty(key, v); }
  return v;
}

function cacheGet(namespace, key) {
  try {
    const full = namespace + ':' + _nsVersion(namespace) + ':' + key;
    const json = _cache().get(full);
    return json ? JSON.parse(json) : null;
  } catch (e) { return null; }
}

function cachePut(namespace, key, value, ttlSeconds) {
  try {
    const full = namespace + ':' + _nsVersion(namespace) + ':' + key;
    _cache().put(full, JSON.stringify(value), ttlSeconds || 300);
  } catch (e) { /* size limit, transient — silent */ }
}

function cacheBust(namespace) {
  _props().setProperty('cache_v_' + namespace, String(Date.now()));
}

// ── PARTIAL READS ────────────────────────────────────────────────────────────
// Reads only the last `maxRows` rows from a sheet. Avoids the cost of
// getDataRange().getValues() once the sheet grows large.
function readSheetTail(sheetName, maxRows, numCols) {
  const sh = getSheetOrThrow(sheetName);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const startRow = Math.max(2, last - maxRows + 1);
  const numRows = last - startRow + 1;
  return sh.getRange(startRow, 1, numRows, numCols).getValues();
}
