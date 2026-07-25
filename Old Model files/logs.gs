/*****************************************
 * MIS TRACKER v8 — logs.gs
 * 4-sheet log: Master_Log + MIS_Log + DU_Log + Task_Log.
 * Every write goes to Master_Log AND its module log in batched setValues calls.
 * dedupAndAmend() merges what used to be checkDuplicate + amendOld into one read.
 * 24-hour amend lock: amend after 24h requires SuperAdmin role.
 *****************************************/

// ── HEADERS (Phase 4: +source_url, +confidence, +validated_by_email) ─────────
const MASTER_HEADERS = [
  'log_id','timestamp_submitted','submitted_by_email','on_behalf_of_email','on_behalf_of_name',
  'entry_type','entry_date','week_number','month_year','topic','sub_topic',
  'status','data_count','mode_or_extra','remarks','is_late','time_to_submit_min','row_status',
  'source_url','confidence','validated_by_email'
];
const MIS_HEADERS = [
  'log_id','timestamp_submitted','submitted_by_email','on_behalf_of_email','on_behalf_of_name',
  'entry_date','report','component','status','data_count','backup_by','remarks','is_late','time_to_submit_min','row_status','confidence'
];
const DU_HEADERS = [
  'log_id','timestamp_submitted','submitted_by_email','on_behalf_of_email','on_behalf_of_name',
  'entry_date','commodity','type','factor','status','mode','remarks','is_late','row_status','source_url','confidence'
];
const TASK_HEADERS = [
  'log_id','timestamp_submitted','submitted_by_email','on_behalf_of_email','on_behalf_of_name',
  'entry_date','task_name','priority','assignee_email','status','remarks','is_late','row_status','confidence'
];
const AUDIT_HEADERS = [
  'audit_id','timestamp','actor_email','action','target_type','target_id','before_json','after_json','is_proxy'
];

// Master_Log column indices (1-based)
const M_COL = Object.freeze({
  LOG_ID: 1, TS: 2, BY_EMAIL: 3, ON_EMAIL: 4, ON_NAME: 5,
  TYPE: 6, DATE: 7, WEEK: 8, MY: 9, TOPIC: 10, SUB: 11,
  STATUS: 12, COUNT: 13, MODE: 14, REMARKS: 15, LATE: 16, TIME: 17, ROW_STATUS: 18,
  SOURCE_URL: 19, CONFIDENCE: 20, VALIDATED_BY: 21
});

const A_COL = Object.freeze({
  ID: 1, TS: 2, ACTOR: 3, ACTION: 4, TYPE: 5, TARGET: 6, BEFORE: 7, AFTER: 8, IS_PROXY: 9
});

// Module log row_status column (1-based)
// Use string literals (not computed keys) to avoid load-order issues in GAS
const ROW_STATUS_COL = {
  'MIS_Log':  15,
  'DU_Log':   14,
  'Task_Log': 13
};

// ── BOOTSTRAP ────────────────────────────────────────────────────────────────
// Idempotent: safe to run repeatedly. Creates sheets, writes headers once,
// installs conditional-formatting rules once.
function initLogSheets() {
  _ensureSheet(MASTER_LOG, MASTER_HEADERS);
  _ensureSheet(MIS_LOG,    MIS_HEADERS);
  _ensureSheet(DU_LOG,     DU_HEADERS);
  _ensureSheet(TASK_LOG,   TASK_HEADERS);
  _ensureSheet(AUDIT_LOG,  AUDIT_HEADERS);
  _migrateLogHeaders();
  _ensureModulesBlock();
  _installConditionalFormatting();
  _protectAuditLog();
  return { success: true, message: 'Sheets ready: Master_Log / MIS_Log / DU_Log / Task_Log / Audit_Log' };
}

// Phase 4 migration: backfill new headers on sheets that already exist.
function _migrateLogHeaders() {
  [
    { name: MASTER_LOG, headers: MASTER_HEADERS },
    { name: MIS_LOG,    headers: MIS_HEADERS },
    { name: DU_LOG,     headers: DU_HEADERS },
    { name: TASK_LOG,   headers: TASK_HEADERS },
    { name: AUDIT_LOG,  headers: AUDIT_HEADERS }
  ].forEach(({ name, headers }) => {
    const sh = SS.getSheetByName(name);
    if (!sh) return;
    const lastCol = sh.getLastColumn();
    if (lastCol >= headers.length) return;
    const missing = headers.slice(lastCol);
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#FFFFFF');
  });
}

// Best-effort sheet-level protection for the audit log. App-layer immutability
// is the real guarantee: no exposed function modifies or deletes audit rows.
function _protectAuditLog() {
  try {
    const sh = SS.getSheetByName(AUDIT_LOG);
    if (!sh) return;
    const protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (protections && protections.length) return; // already protected
    const protection = sh.protect().setDescription('Audit Log — immutable. Do not edit.');
    protection.setWarningOnly(true);
  } catch (e) { Logger.log('_protectAuditLog: ' + e.message); }
}

function _ensureSheet(name, headers) {
  let sh = SS.getSheetByName(name);
  const created = !sh;
  if (created) sh = SS.insertSheet(name);

  // Header row: write only if first cell is empty (idempotent)
  const firstCell = sh.getRange(1, 1).getValue();
  if (!firstCell) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1E3A5F')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _ensureModulesBlock() {
  const cfg = getOrCreateSheet(CONFIG_SHEET);
  const head = cfg.getRange(MOD_START_ROW - 1, MOD_COL).getValue();
  if (head) return;
  cfg.getRange(MOD_START_ROW - 1, MOD_COL, 1, 2).setValues([['module','enabled']])
    .setFontWeight('bold');
  const seed = [
    [MODULES.MIS,'YES'], [MODULES.DU,'YES'], [MODULES.TASK,'YES'],
    [MODULES.KANBAN,'YES'], [MODULES.TEAM,'YES'],
    [MODULES.ANALYTICS,'YES'], [MODULES.NOTIFICATIONS,'YES'],
    [MODULES.CROSS_VAL,'YES'], [MODULES.COVERAGE,'YES'],
    [MODULES.LEADERBOARD,'YES'], [MODULES.AUDIT,'YES']
  ];
  cfg.getRange(MOD_START_ROW, MOD_COL, seed.length, 2).setValues(seed);
}

function _installConditionalFormatting() {
  [
    { name: MASTER_LOG, statusCol: M_COL.STATUS, lateCol: M_COL.LATE },
    { name: MIS_LOG,    statusCol: 9,  lateCol: 13 },
    { name: DU_LOG,     statusCol: 10, lateCol: 13 },
    { name: TASK_LOG,   statusCol: 10, lateCol: 12 }
  ].forEach(spec => {
    const sh = SS.getSheetByName(spec.name);
    if (!sh) return;
    if ((sh.getConditionalFormatRules() || []).length > 0) return; // already installed

    const lastCol = sh.getMaxColumns();
    const lastRow = Math.max(sh.getMaxRows(), 1000);
    const statusRange = sh.getRange(2, spec.statusCol, lastRow - 1, 1);
    const lateRange   = sh.getRange(2, spec.lateCol,   lastRow - 1, 1);

    const rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('Done').setBackground('#D5F5E3').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('Pending').setBackground('#FDEBD0').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('Skip').setBackground('#EAF2FF').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('Yes').setBackground('#FADBD8').setRanges([lateRange]).build()
    ];
    sh.setConditionalFormatRules(rules);
  });
}

// ── WRITE ────────────────────────────────────────────────────────────────────
// rows: array of objects with the canonical fields. Returns array of log_ids written.
// One setValues call per sheet (master + module log).
function writeLogBatch(moduleKey, rows) {
  if (!rows || !rows.length) return [];

  const master = getSheetOrThrow(MASTER_LOG);
  const moduleSheetName = _moduleSheetName(moduleKey);
  const moduleSheet = getSheetOrThrow(moduleSheetName);

  const masterRows = rows.map(_toMasterRow);
  const moduleRows = rows.map(r => _toModuleRow(moduleKey, r));

  master.getRange(master.getLastRow() + 1, 1, masterRows.length, MASTER_LOG_COLS).setValues(masterRows);
  moduleSheet.getRange(moduleSheet.getLastRow() + 1, 1, moduleRows.length, _moduleColCount(moduleKey)).setValues(moduleRows);

  cacheBust(CACHE_NS.MLOG);
  return rows.map(r => r.logId);
}

function _moduleSheetName(moduleKey) {
  if (moduleKey === MODULES.MIS)  return MIS_LOG;
  if (moduleKey === MODULES.DU)   return DU_LOG;
  if (moduleKey === MODULES.TASK) return TASK_LOG;
  throw new Error('Unknown moduleKey: ' + moduleKey);
}

function _moduleColCount(moduleKey) {
  if (moduleKey === MODULES.MIS)  return MIS_LOG_COLS;
  if (moduleKey === MODULES.DU)   return DU_LOG_COLS;
  if (moduleKey === MODULES.TASK) return TASK_LOG_COLS;
  throw new Error('Unknown moduleKey: ' + moduleKey);
}

function _toMasterRow(r) {
  return [
    r.logId,
    r.timestampSubmitted,
    r.submittedByEmail,
    r.onBehalfOfEmail,
    r.onBehalfOfName,
    r.entryType,
    r.entryDate,
    r.weekNumber,
    r.monthYear,
    r.topic || '',
    r.subTopic || '',
    r.status || 'Pending',
    r.dataCount || 0,
    r.modeOrExtra || '',
    r.remarks || '',
    r.isLate ? 'Yes' : 'No',
    r.timeToSubmitMin || 0,
    r.rowStatus || 'Active',
    r.sourceUrl || '',
    r.confidence || CONFIDENCE.MEDIUM,
    r.validatedByEmail || ''
  ];
}

function _toModuleRow(moduleKey, r) {
  const conf = r.confidence || CONFIDENCE.MEDIUM;
  if (moduleKey === MODULES.MIS) {
    return [
      r.logId, r.timestampSubmitted, r.submittedByEmail, r.onBehalfOfEmail, r.onBehalfOfName,
      r.entryDate, r.topic, r.subTopic, r.status || 'Pending', r.dataCount || 0,
      r.modeOrExtra || '', r.remarks || '', r.isLate ? 'Yes' : 'No', r.timeToSubmitMin || 0, r.rowStatus || 'Active', conf
    ];
  }
  if (moduleKey === MODULES.DU) {
    // topic stores "commodity::type" (set by submitDataUpdate); split for module log
    const [commodity, type] = String(r.topic || '').split('::');
    return [
      r.logId, r.timestampSubmitted, r.submittedByEmail, r.onBehalfOfEmail, r.onBehalfOfName,
      r.entryDate, commodity || '', type || '', r.subTopic || '',
      r.status || 'Pending', r.modeOrExtra || '', r.remarks || '',
      r.isLate ? 'Yes' : 'No', r.rowStatus || 'Active', r.sourceUrl || '', conf
    ];
  }
  if (moduleKey === MODULES.TASK) {
    return [
      r.logId, r.timestampSubmitted, r.submittedByEmail, r.onBehalfOfEmail, r.onBehalfOfName,
      r.entryDate, r.topic, r.modeOrExtra || 'Medium', r.assigneeEmail || '',
      r.status || 'Pending', r.remarks || '', r.isLate ? 'Yes' : 'No', r.rowStatus || 'Active', conf
    ];
  }
  throw new Error('Unknown moduleKey: ' + moduleKey);
}

// ── DEDUP + AMEND (single read of Master_Log) ────────────────────────────────
// opts: { user, onBehalfOfEmail, topic, entryDate, entryType, force }
// Returns:
//   { duplicate: false }                         -> no match, proceed with insert
//   { duplicate: true, locked: false, at }       -> match exists, force=false
//   { duplicate: true, locked: true, requiresSuperAdmin: true, oldestAgeHours }
//                                                -> match > 24h, caller not SuperAdmin
//   { amended: true, count: N, logIds: [...] }   -> N old rows amended, proceed with insert
function dedupAndAmend(opts) {
  const master = getSheetOrThrow(MASTER_LOG);
  const last = master.getLastRow();
  if (last < 2) return { duplicate: false };

  const values = master.getRange(2, 1, last - 1, MASTER_LOG_COLS).getValues();
  const targetEmail = String(opts.onBehalfOfEmail || '').toLowerCase().trim();
  const targetDateStr = ymd(opts.entryDate);
  const matches = []; // { sheetRow, ts, logId }

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[M_COL.LOG_ID - 1]) continue;
    if (r[M_COL.ROW_STATUS - 1] === 'Amended') continue;
    if (r[M_COL.TYPE - 1] !== opts.entryType) continue;
    if (String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase().trim() !== targetEmail) continue;
    if (String(r[M_COL.TOPIC - 1] || '') !== String(opts.topic || '')) continue;
    if (ymd(r[M_COL.DATE - 1]) !== targetDateStr) continue;
    matches.push({
      sheetRow: i + 2,
      ts: r[M_COL.TS - 1] ? new Date(r[M_COL.TS - 1]) : null,
      logId: r[M_COL.LOG_ID - 1]
    });
  }

  if (matches.length === 0) return { duplicate: false };

  // 24h lock check
  const now = Date.now();
  const oldestTs = matches.reduce((min, m) => {
    if (!m.ts) return min;
    return (min === null || m.ts.getTime() < min) ? m.ts.getTime() : min;
  }, null);
  const ageHours = oldestTs !== null ? (now - oldestTs) / 3600000 : 0;

  if (!opts.force) {
    return {
      duplicate: true,
      locked: false,
      at: matches[0].ts ? fmtDate(matches[0].ts, 'HH:mm') : 'earlier',
      logId: matches[0].logId
    };
  }

  // force=true: caller wants to amend
  const isSuper = opts.user && opts.user.role === ROLES.SUPER;
  if (ageHours > 24 && !isSuper) {
    return {
      duplicate: true,
      locked: true,
      requiresSuperAdmin: true,
      oldestAgeHours: Math.round(ageHours),
      logId: matches[0].logId
    };
  }

  // Single batched write to row_status column: read whole column, mutate in memory, write back.
  const statusCol = master.getRange(2, M_COL.ROW_STATUS, last - 1, 1).getValues();
  const matchSet = new Set(matches.map(m => m.sheetRow));
  for (let i = 0; i < statusCol.length; i++) {
    if (matchSet.has(i + 2)) statusCol[i][0] = 'Amended';
  }
  master.getRange(2, M_COL.ROW_STATUS, statusCol.length, 1).setValues(statusCol);

  // Mirror to module log: find rows by log_id and flip their row_status
  _mirrorAmendToModuleLog(opts.entryType, matches.map(m => m.logId));

  cacheBust(CACHE_NS.MLOG);
  logAudit({
    action: 'ENTRY_AMEND', targetType: 'log',
    targetId: matches.map(m => m.logId).join(','),
    before: { entryType: opts.entryType, topic: opts.topic, date: targetDateStr, email: targetEmail },
    after: { count: matches.length }
  });
  return {
    amended: true,
    count: matches.length,
    logIds: matches.map(m => m.logId)
  };
}

function _mirrorAmendToModuleLog(entryType, logIds) {
  if (!logIds.length) return;
  const moduleKey = _entryTypeToModuleKey(entryType);
  const sheetName = _moduleSheetName(moduleKey);
  const sh = getSheet(sheetName);
  if (!sh) return;
  const last = sh.getLastRow();
  if (last < 2) return;
  const statusCol = ROW_STATUS_COL[sheetName];
  // Single read of (id, row_status) column pair → modify in memory → single write back.
  const ids      = sh.getRange(2, 1,         last - 1, 1).getValues();
  const statuses = sh.getRange(2, statusCol, last - 1, 1).getValues();
  const wanted = new Set(logIds);
  let changed = 0;
  for (let i = 0; i < ids.length; i++) {
    if (wanted.has(ids[i][0])) { statuses[i][0] = 'Amended'; changed++; }
  }
  if (changed) sh.getRange(2, statusCol, statuses.length, 1).setValues(statuses);
}

function _entryTypeToModuleKey(entryType) {
  if (entryType === ENTRY_TYPE.MIS)  return MODULES.MIS;
  if (entryType === ENTRY_TYPE.DU)   return MODULES.DU;
  if (entryType === ENTRY_TYPE.TASK) return MODULES.TASK;
  throw new Error('Unknown entryType: ' + entryType);
}

// ── REQUEST AMEND BY LOG ID (24h lock) ───────────────────────────────────────
// SuperAdmin override path. Flips a specific log_id to Amended in both master + module log.
function requestAmend(logId) {
  const user = assertRole(ROLES.SUPER);
  const master = getSheetOrThrow(MASTER_LOG);
  const last = master.getLastRow();
  if (last < 2) return { success: false, message: 'No log rows' };
  const ids = master.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === logId) {
      const entryType = master.getRange(i + 2, M_COL.TYPE).getValue();
      master.getRange(i + 2, M_COL.ROW_STATUS, 1, 1).setValues([['Amended']]);
      _mirrorAmendToModuleLog(entryType, [logId]);
      cacheBust(CACHE_NS.MLOG);
      logAudit({ action: 'SUPER_AMEND', targetType: 'log', targetId: logId });
      return { success: true, message: 'Amended ' + logId };
    }
  }
  return { success: false, message: 'log_id not found: ' + logId };
}
