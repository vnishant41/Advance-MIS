/*****************************************
 * MIS TRACKER v8 — mis.gs
 * Submission entry points for MIS / Data Update / Task entries.
 * All three submit functions:
 *   1. assertRole + assertModule
 *   2. Resolve target user from email; reject unauthorised proxy
 *   3. withinSubmissionWindow check
 *   4. requireRemarks validation
 *   5. minCount validation (MIS only)
 *   6. dedupAndAmend (single Master_Log read)
 *   7. Compute is_late (no email send — handled by sendLateAlerts trigger)
 *   8. writeLogBatch (single batched setValues per sheet)
 * Status defaults to "Pending" everywhere; no last-entry pre-fill.
 *****************************************/

// ── CONFIG READS: REPORTS / COMPONENTS ───────────────────────────────────────
function getEmployeeList() {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < EMP_START_ROW) return [];
  return cfg.getRange(EMP_START_ROW, EMP_COL, last - EMP_START_ROW + 1, 1)
    .getValues().map(r => r[0]).filter(Boolean);
}

function getReportList() {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < RPT_START_ROW) return [];
  const data = cfg.getRange(RPT_START_ROW, RPT_COL, last - RPT_START_ROW + 1, 4).getValues();
  const dow = new Date().getDay();
  let allReports = data.filter(r => r[0]).map(r => {
    const freq = String(r[3] || 'Daily').trim();
    return {
      name:      r[0],
      deadline:  r[1] || '',
      primary:   r[2] || '',
      frequency: freq,
      dueToday:  _isDueToday(freq, dow)
    };
  });

  // Commodity-based filtering for Teammates/Leaders
  const caller = getCurrentUser();
  if (caller) {
    const comms = getUserCommodities(caller);
    if (comms !== null && comms.length > 0) {
      // Read component-report mappings to check which reports this user can access
      const compData = cfg.getRange(COMP_START_ROW, COMP_RPT_COL, last - COMP_START_ROW + 1, 3).getValues();
      const allowedReports = new Set();
      compData.forEach(r => {
        const reportName = String(r[0] || '');
        const compName = String(r[1] || '').toLowerCase();
        // Check if any component matches user's commodity keywords
        if (comms.some(c => compName.indexOf(c.toLowerCase()) >= 0 || reportName.toLowerCase().indexOf(c.toLowerCase()) >= 0)) {
          allowedReports.add(reportName);
        }
      });
      allReports = allReports.filter(r => allowedReports.has(r.name));
    } else if (comms !== null && comms.length === 0) {
      // User has no commodities assigned at all — show all (backward compat)
    }
  }

  return allReports;
}

function _isDueToday(freq, dow) {
  return freq === 'Daily' ||
         (freq === 'Weekly' && dow === 1) ||
         (freq === 'Monthly' && new Date().getDate() === 1) ||
         (freq === 'Mon-Fri' && dow >= 1 && dow <= 5) ||
         freq === 'always';
}

function getReportDeadline(name) {
  const list = getReportList();
  for (let i = 0; i < list.length; i++) if (list[i].name === name) return list[i].deadline;
  return '';
}

function getComponentsForReport(reportName) {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < COMP_START_ROW) return [];
  const data = cfg.getRange(COMP_START_ROW, COMP_RPT_COL, last - COMP_START_ROW + 1, 4).getValues();

  const comps = data.filter(r => r[0] === reportName && r[1]).map(r => ({
    name:        r[1],
    assignee:    r[2] || '',
    lastStatus:  'Pending',
    lastRemarks: '',
    lastDate:    ''
  }));

  if (!comps.length) return comps;

  const settings = getSettings();
  if (settings.prefillLastEntry) {
    try {
      const caller = getCurrentUser();
      const callerEmail = caller ? String(caller.email).toLowerCase() : '';
      const sh = getSheet(MIS_LOG);
      if (sh && callerEmail) {
        const logLast = sh.getLastRow();
        if (logLast >= 2) {
          // Read: on_behalf_of_email(col4), entry_date(col6), report(col7), component(col8), status(col9), remarks(col12)
          const logData = sh.getRange(2, 1, logLast - 1, 12).getValues();
          const today = ymd(new Date());
          const prefillMap = {};
          // Iterate in order — last row for each component wins
          logData.forEach(row => {
            const rowEmail = String(row[3] || '').toLowerCase();
            const rowReport = String(row[6] || '');
            if (rowEmail !== callerEmail || rowReport !== reportName) return;
            const rowDate = row[5] instanceof Date ? ymd(row[5]) : String(row[5]).slice(0, 10);
            if (rowDate !== today) return;
            const comp = String(row[7] || '');
            prefillMap[comp] = { status: String(row[8] || 'Pending'), remarks: String(row[11] || ''), date: rowDate };
          });
          comps.forEach(c => {
            const p = prefillMap[c.name];
            if (p) { c.lastStatus = p.status; c.lastRemarks = p.remarks; c.lastDate = p.date; }
          });
        }
      }
    } catch (_) {}
  }

  return comps;
}

// ── CONFIG READS: DATA UPDATE ────────────────────────────────────────────────
function getCommodityList() {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < DU_START_ROW) return [];
  const seen = {};
  let list = cfg.getRange(DU_START_ROW, DU_COL, last - DU_START_ROW + 1, 1)
    .getValues().map(r => r[0])
    .filter(v => { if (v && !seen[v]) { seen[v] = 1; return true; } return false; });

  // Commodity-based filtering for Teammates/Leaders
  const caller = getCurrentUser();
  if (caller) {
    const comms = getUserCommodities(caller);
    if (comms !== null && comms.length > 0) {
      list = list.filter(c => comms.some(uc => c.toLowerCase().indexOf(uc.toLowerCase()) >= 0 || uc.toLowerCase().indexOf(c.toLowerCase()) >= 0));
    }
    // comms === null → Manager+ → show all; comms.length === 0 → no assignment → show all (backward compat)
  }

  return list;
}

function getTypeListForCommodity(commodity) {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < DU_START_ROW) return [];
  const seen = {};
  return cfg.getRange(DU_START_ROW, DU_COL, last - DU_START_ROW + 1, 2).getValues()
    .filter(r => r[0] === commodity && r[1])
    .map(r => r[1])
    .filter(v => { if (!seen[v]) { seen[v] = 1; return true; } return false; });
}

function getFactorsForCommodityType(commodity, type) {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return [];
  const last = cfg.getLastRow();
  if (last < DU_START_ROW) return [];
  const data = cfg.getRange(DU_START_ROW, DU_COL, last - DU_START_ROW + 1, 5).getValues();

  const factors = data.filter(r => r[0] === commodity && r[1] === type && r[2]).map(r => ({
    factor:      r[2],
    mode:        r[3] || '',
    source:      r[4] || '',
    lastStatus:  'Pending',
    lastRemarks: '',
    lastDate:    ''
  }));

  if (!factors.length) return factors;

  const settings = getSettings();
  if (settings.prefillLastEntry) {
    try {
      const caller = getCurrentUser();
      const callerEmail = caller ? String(caller.email).toLowerCase() : '';
      const sh = getSheet(DU_LOG);
      if (sh && callerEmail) {
        const logLast = sh.getLastRow();
        if (logLast >= 2) {
          // Read: on_behalf_of_email(col4), entry_date(col6), commodity(col7), type(col8), factor(col9), status(col10), remarks(col12)
          const logData = sh.getRange(2, 1, logLast - 1, 12).getValues();
          const today = ymd(new Date());
          const prefillMap = {};
          logData.forEach(row => {
            const rowEmail = String(row[3] || '').toLowerCase();
            const rowComm = String(row[6] || '');
            const rowType = String(row[7] || '');
            if (rowEmail !== callerEmail || rowComm !== commodity || rowType !== type) return;
            const rowDate = row[5] instanceof Date ? ymd(row[5]) : String(row[5]).slice(0, 10);
            if (rowDate !== today) return;
            const factor = String(row[8] || '');
            prefillMap[factor] = { status: String(row[9] || 'Pending'), remarks: String(row[11] || ''), date: rowDate };
          });
          factors.forEach(f => {
            const p = prefillMap[f.factor];
            if (p) { f.lastStatus = p.status; f.lastRemarks = p.remarks; f.lastDate = p.date; }
          });
        }
      }
    } catch (_) {}
  }

  return factors;
}

// ── CONFIG READS: TASKS ──────────────────────────────────────────────────────
function getTaskList() {
  const cfg = getSheet(CONFIG_SHEET);
  if (!cfg) return { dailyTasks: [], weeklyTasks: [], monthlyTasks: [] };
  const last = cfg.getLastRow();
  if (last < TASK_START_ROW) return { dailyTasks: [], weeklyTasks: [], monthlyTasks: [] };
  // Read 5 columns: name, assignee, priority, recurrence, dueDate
  const data = cfg.getRange(TASK_START_ROW, TASK_COL, last - TASK_START_ROW + 1, 5).getValues();
  const dow = new Date().getDay();
  const todayStr = ymd(new Date());
  const daily = [], weekly = [], monthly = [];

  // Get caller info for filtering
  const caller = getCurrentUser();
  const callerEmail = caller ? String(caller.email).toLowerCase() : '';
  const isRestricted = caller && !roleAtLeast(caller.role, ROLES.MANAGER);

  data.filter(r => r[0]).forEach(r => {
    const rec = String(r[3] || 'always').trim().toLowerCase();
    const dueDate = r[4] ? ymd(r[4] instanceof Date ? r[4] : new Date(r[4])) : '';
    const assignee = String(r[1] || '').toLowerCase().trim();
    const task = { name: r[0], assignee: r[1] || '', priority: r[2] || 'Medium', dueDate };

    // For Teammates/Leaders: only show tasks assigned to them
    if (isRestricted && assignee && assignee !== callerEmail) return;

    if (rec === 'daily' || rec === 'always' || rec === 'mon-fri') {
      const show = rec === 'daily' || rec === 'always' || (rec === 'mon-fri' && dow >= 1 && dow <= 5);
      if (show) daily.push(task);
    } else if (rec === 'weekly') {
      if (dow === 1) weekly.push(task);
      else weekly.push(task); // show all week
    } else if (rec === 'monthly') {
      monthly.push(task);
    } else {
      daily.push(task);
    }
  });

  return { dailyTasks: daily, weeklyTasks: weekly, monthlyTasks: monthly };
}

function addAdhocTask(payload) {
  try {
    const caller = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.TASK);

    const name = String((payload && payload.name) || '').trim();
    const freq = String((payload && payload.freq) || 'Daily').trim();
    const dueDate = String((payload && payload.dueDate) || '').trim();
    if (!name) return { success: false, message: 'Task name is required' };

    const validFreqs = ['Daily', 'Weekly', 'Monthly'];
    const recurrence = validFreqs.includes(freq) ? freq.toLowerCase() : 'daily';

    const cfg = getSheetOrThrow(CONFIG_SHEET);
    const dueDateVal = dueDate ? new Date(dueDate) : '';

    // Find next empty row in the task column section (TASK_COL)
    const lastRow = cfg.getLastRow();
    let nextRow = TASK_START_ROW;
    if (lastRow >= TASK_START_ROW) {
      const colVals = cfg.getRange(TASK_START_ROW, TASK_COL, lastRow - TASK_START_ROW + 1, 1).getValues();
      for (let i = colVals.length - 1; i >= 0; i--) {
        if (colVals[i][0]) { nextRow = TASK_START_ROW + i + 1; break; }
      }
    }

    cfg.getRange(nextRow, TASK_COL, 1, 5).setValues([[name, caller.name, 'Medium', recurrence, dueDateVal]]);

    cacheBust(CACHE_NS.MLOG);
    return { success: true, task: { name, assignee: caller.name, priority: 'Medium', dueDate } };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function getTaskSnapshot() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const sh = getSheet(TASK_LOG);
    if (!sh || sh.getLastRow() < 2) return { success: true, snapshot: [] };

    const todayStr = ymd(new Date());
    const userEmail = String(user.email).toLowerCase();
    const isManagerPlus = user.role === ROLES.SUPER || user.role === ROLES.MANAGER;

    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues();
    // Task_Log (0-indexed): 3=on_behalf_of_email, 5=entry_date, 6=task_name, 7=priority, 8=assignee_email, 9=status, 10=remarks, 12=row_status
    const tasks = rows
      .filter(r => {
        const date = r[5] ? ymd(r[5] instanceof Date ? r[5] : new Date(r[5])) : '';
        if (date !== todayStr) return false;
        if (String(r[12] || 'Active') === 'Amended') return false;
        if (!isManagerPlus) {
          const owner = String(r[3] || '').toLowerCase();
          const assignee = String(r[8] || '').toLowerCase();
          return owner === userEmail || assignee === userEmail;
        }
        return true;
      })
      .map(r => ({
        name:     String(r[6] || ''),
        priority: String(r[7] || 'Medium'),
        assignee: String(r[8] || ''),
        status:   String(r[9] || 'Pending'),
        remarks:  String(r[10] || '')
      }));

    return { success: true, snapshot: tasks };
  } catch (e) {
    return { success: false, snapshot: [], message: e.message };
  }
}

// ── PROXY AUTHORISATION ──────────────────────────────────────────────────────
// Resolves target user from payload.onBehalfOfEmail. Enforces:
//  - Teammate: target must equal self
//  - Manager:  target must be in same dept
//  - SuperAdmin: any registered user
function _resolveTarget(caller, payloadOnBehalfOfEmail) {
  const requested = String(payloadOnBehalfOfEmail || '').toLowerCase().trim();
  if (!requested || requested === caller.email) return { ok: true, target: caller, isProxy: false };

  if (caller.role === ROLES.TEAMMATE) {
    return { ok: false, message: 'Teammates can only submit for themselves' };
  }
  const target = findUser(requested);
  if (!target) return { ok: false, message: 'Target user not found: ' + requested };
  if (!target.active) return { ok: false, message: 'Target user is inactive' };

  if (caller.role === ROLES.MANAGER && target.dept !== caller.dept) {
    return { ok: false, message: 'Managers can only submit for their own department' };
  }
  return { ok: true, target, isProxy: true };
}

// ── SUBMIT: MIS ──────────────────────────────────────────────────────────────
function submitMISEntries(payload) {
  try {
    const caller = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.MIS);

    const tgt = _resolveTarget(caller, payload && payload.onBehalfOfEmail);
    if (!tgt.ok) return { success: false, message: tgt.message };

    const win = withinSubmissionWindow();
    if (!win.open) return { success: false, message: 'Submission window closed: ' + win.start + '–' + win.end + ' (now ' + win.now + ')' };

    const settings = getSettings();
    const entries = (payload && payload.entries) || [];
    if (!entries.length) return { success: false, message: 'No entries to submit' };
    if (!payload.report) return { success: false, message: 'Report name missing' };

    if (settings.requireRemarks) {
      const missing = entries.filter(e => (e.status === 'Skip' || e.status === 'Pending') && !String(e.remarks || '').trim()).map(e => e.component);
      if (missing.length) return { success: false, message: 'Remarks required for:\n' + missing.slice(0, 5).join('\n') };
    }

    const entryDate = new Date(payload.date || new Date());

    const dup = dedupAndAmend({
      user: caller, onBehalfOfEmail: tgt.target.email, topic: payload.report,
      entryDate, entryType: ENTRY_TYPE.MIS, force: !!payload.forceAmend
    });
    if (dup.duplicate && !dup.locked) return { success: false, duplicate: true, message: "Already submitted '" + payload.report + "' today (at " + dup.at + ').' };
    if (dup.locked) return { success: false, locked: true, requiresSuperAdmin: true, message: 'Original submission is older than 24h. SuperAdmin approval required.' };

    const submittedAt = new Date();
    const isLate = _isLateMIS(payload.report, submittedAt);
    const tt = payload.formOpenTime ? Math.round((submittedAt.getTime() - payload.formOpenTime) / 60000) : 0;

    const rows = entries.map(e => ({
      logId:              newLogId(),
      timestampSubmitted: submittedAt,
      submittedByEmail:   (caller.email === currentEmail() || !currentEmail()) ? caller.email : (caller.email + '\n[Google: ' + currentEmail() + ']'),
      onBehalfOfEmail:    tgt.target.email,
      onBehalfOfName:     tgt.target.name,
      entryType:          ENTRY_TYPE.MIS,
      entryDate:          entryDate,
      weekNumber:         getWeekNumber(entryDate),
      monthYear:          monthYear(entryDate),
      topic:              payload.report,
      subTopic:           e.component,
      status:             e.status || 'Pending',
      dataCount:          0,
      modeOrExtra:        payload.backupBy || '',
      remarks:            e.remarks || '',
      isLate:             isLate,
      timeToSubmitMin:    tt,
      rowStatus:          'Active',
      sourceUrl:          '',
      confidence:         CONFIDENCE.MEDIUM,
      validatedByEmail:   ''
    }));

    const logIds = writeLogBatch(MODULES.MIS, rows);

    const done = entries.filter(e => e.status === 'Done').length;
    const pending = entries.filter(e => e.status === 'Pending').length;
    const skip = entries.filter(e => e.status === 'Skip').length;
    const pct = (done + pending) > 0 ? Math.round(done / (done + pending) * 100) : 0;

    logAudit({
      action: 'MIS_SUBMIT', targetType: 'log', targetId: logIds.join(','),
      onBehalfOfEmail: tgt.target.email,
      after: { report: payload.report, count: rows.length, done, pending, skip, isLate, isProxy: tgt.isProxy }
    });

    return {
      success: true,
      isProxy: tgt.isProxy,
      amendedCount: dup.amended ? dup.count : 0,
      message: 'Saved ' + rows.length + ' entries.' +
               (isLate ? '\nLATE (deadline: ' + getReportDeadline(payload.report) + ')' : '') +
               '\nDone: ' + done + ' Pending: ' + pending + ' Skip: ' + skip + '\nProgress: ' + pct + '%'
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function _isLateMIS(reportName, at) {
  try {
    const dl = getReportDeadline(reportName);
    if (!dl) return false;
    return fmtDate(at, 'HH:mm') > dl;
  } catch (e) {
    return false;
  }
}

function _normaliseConfidence(c) {
  const v = String(c || '').trim();
  if (v === CONFIDENCE.HIGH || v === CONFIDENCE.LOW) return v;
  return CONFIDENCE.MEDIUM;
}

// ── SUBMIT: DATA UPDATE ──────────────────────────────────────────────────────
function submitDataUpdate(payload) {
  try {
    const caller = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.DU);

    const tgt = _resolveTarget(caller, payload && payload.onBehalfOfEmail);
    if (!tgt.ok) return { success: false, message: tgt.message };

    const win = withinSubmissionWindow();
    if (!win.open) return { success: false, message: 'Submission window closed: ' + win.start + '–' + win.end + ' (now ' + win.now + ')' };

    const settings = getSettings();
    const factors = (payload && payload.factors) || [];
    if (!factors.length) return { success: false, message: 'No factors to submit' };
    if (!payload.commodity || !payload.type) return { success: false, message: 'Commodity/type missing' };

    if (settings.requireRemarks) {
      const missing = factors.filter(f => (f.status === 'Skip' || f.status === 'Pending') && !String(f.remarks || '').trim()).map(f => f.factor);
      if (missing.length) return { success: false, message: 'Remarks required for:\n' + missing.slice(0, 5).join('\n') };
    }

    const entryDate = new Date(payload.date || new Date());
    const topic = payload.commodity + '::' + payload.type;

    const dup = dedupAndAmend({
      user: caller, onBehalfOfEmail: tgt.target.email, topic,
      entryDate, entryType: ENTRY_TYPE.DU, force: !!payload.forceAmend
    });
    if (dup.duplicate && !dup.locked) return { success: false, duplicate: true, message: 'Already submitted ' + payload.commodity + '/' + payload.type + ' today (at ' + dup.at + ').' };
    if (dup.locked) return { success: false, locked: true, requiresSuperAdmin: true, message: 'Original submission is older than 24h. SuperAdmin approval required.' };

    const submittedAt = new Date();
    const tt = payload.formOpenTime ? Math.round((submittedAt.getTime() - payload.formOpenTime) / 60000) : 0;

    const rows = factors.map(f => ({
      logId:              newLogId(),
      timestampSubmitted: submittedAt,
      submittedByEmail:   (caller.email === currentEmail() || !currentEmail()) ? caller.email : (caller.email + '\n[Google: ' + currentEmail() + ']'),
      onBehalfOfEmail:    tgt.target.email,
      onBehalfOfName:     tgt.target.name,
      entryType:          ENTRY_TYPE.DU,
      entryDate:          entryDate,
      weekNumber:         getWeekNumber(entryDate),
      monthYear:          monthYear(entryDate),
      topic:              topic,
      subTopic:           f.factor,
      status:             f.status || 'Pending',
      dataCount:          0,
      modeOrExtra:        f.mode || '',
      remarks:            f.remarks || '',
      isLate:             false,
      timeToSubmitMin:    tt,
      rowStatus:          'Active',
      sourceUrl:          '',
      confidence:         CONFIDENCE.MEDIUM,
      validatedByEmail:   ''
    }));

    const logIds = writeLogBatch(MODULES.DU, rows);

    const done = factors.filter(f => f.status === 'Done').length;
    const pending = factors.filter(f => f.status === 'Pending').length;
    const skip = factors.filter(f => f.status === 'Skip').length;

    logAudit({
      action: 'DU_SUBMIT', targetType: 'log', targetId: logIds.join(','),
      onBehalfOfEmail: tgt.target.email,
      after: { commodity: payload.commodity, type: payload.type, count: rows.length, done, pending, skip, isProxy: tgt.isProxy }
    });

    return {
      success: true,
      isProxy: tgt.isProxy,
      amendedCount: dup.amended ? dup.count : 0,
      message: 'Saved ' + rows.length + ' factors.\nDone: ' + done + ' Pending: ' + pending + ' Skip: ' + skip
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SUBMIT: TASKS ────────────────────────────────────────────────────────────
function submitTaskEntries(payload) {
  try {
    const caller = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.TASK);

    const tgt = _resolveTarget(caller, payload && payload.onBehalfOfEmail);
    if (!tgt.ok) return { success: false, message: tgt.message };

    const win = withinSubmissionWindow();
    if (!win.open) return { success: false, message: 'Submission window closed: ' + win.start + '–' + win.end + ' (now ' + win.now + ')' };

    const tasks = (payload && payload.tasks) || [];
    if (!tasks.length) return { success: false, message: 'No tasks to submit' };

    const entryDate = new Date(payload.date || new Date());
    const submittedAt = new Date();
    const tt = payload.formOpenTime ? Math.round((submittedAt.getTime() - payload.formOpenTime) / 60000) : 0;
    const confidence = _normaliseConfidence(payload.confidence);

    // Dedup not applied to tasks (each task is independent and can be re-submitted same day intentionally).
    const rows = tasks.map(t => ({
      logId:              newLogId(),
      timestampSubmitted: submittedAt,
      submittedByEmail:   (caller.email === currentEmail() || !currentEmail()) ? caller.email : (caller.email + '\n[Google: ' + currentEmail() + ']'),
      onBehalfOfEmail:    tgt.target.email,
      onBehalfOfName:     tgt.target.name,
      entryType:          ENTRY_TYPE.TASK,
      entryDate:          entryDate,
      weekNumber:         getWeekNumber(entryDate),
      monthYear:          monthYear(entryDate),
      topic:              t.name,
      subTopic:           '',
      status:             t.status || 'Pending',
      dataCount:          0,
      modeOrExtra:        t.priority || 'Medium',
      assigneeEmail:      String(t.assignee || '').toLowerCase(),
      remarks:            t.remarks || '',
      isLate:             false,
      timeToSubmitMin:    tt,
      rowStatus:          'Active',
      sourceUrl:          '',
      confidence:         confidence,
      validatedByEmail:   ''
    }));

    const logIds = writeLogBatch(MODULES.TASK, rows);

    const done = tasks.filter(t => t.status === 'Done').length;
    const pending = tasks.filter(t => t.status === 'Pending').length;

    logAudit({
      action: 'TASK_SUBMIT', targetType: 'log', targetId: logIds.join(','),
      onBehalfOfEmail: tgt.target.email,
      after: { count: rows.length, done, pending, isProxy: tgt.isProxy }
    });

    return {
      success: true,
      isProxy: tgt.isProxy,
      message: 'Saved ' + rows.length + ' tasks.\nDone: ' + done + ' Pending: ' + pending
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SMART TASK ALERT (Manager+) ───────────────────────────────────────────────
// payload: { taskName, note, priority, notify, selectedEmails[] }
function addTodayTask(payload) {
  try {
    const caller = assertRole(ROLES.MANAGER);

    const taskName = String(payload.taskName || '').trim();
    if (!taskName) return { success: false, message: 'Task name is required' };

    const note      = String(payload.note || '').trim();
    const priority  = String(payload.priority || 'Normal');
    const notify    = String(payload.notify || 'none');
    const createdAt = new Date();
    const alertId   = 'ALT-' + createdAt.getTime();
    const dateStr   = ymd(createdAt);

    // Resolve recipient emails
    let targetEmails = [];
    if (notify === 'all') {
      targetEmails = getAllUsers().map(u => u.email).filter(e => e !== caller.email);
    } else if (notify === 'selected') {
      targetEmails = (Array.isArray(payload.selectedEmails) ? payload.selectedEmails : [])
        .map(e => String(e).toLowerCase().trim()).filter(Boolean);
    }

    // Write to Today_Alerts sheet
    const sh = getOrCreateSheet('Today_Alerts');
    if (sh.getLastRow() === 0 || (sh.getLastRow() === 1 && !sh.getRange(1, 1).getValue())) {
      sh.getRange(1, 1, 1, 8).setValues([['alert_id', 'date', 'created_by', 'task_name', 'note', 'priority', 'notify_target', 'notified_at']]);
    }
    const notifiedAt = targetEmails.length ? Utilities.formatDate(createdAt, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : '';
    sh.appendRow([alertId, dateStr, caller.email, taskName, note, priority, targetEmails.join(','), notifiedAt]);

    // Send email
    if (targetEmails.length) {
      _sendTaskAlertEmail(taskName, note, priority, targetEmails, caller.name || caller.email);
    }

    logAudit({ action: 'TODAY_ALERT_ADD', targetType: 'alert', targetId: alertId,
      after: { taskName, priority, notify, recipientCount: targetEmails.length } });

    return { success: true, alertId, recipientCount: targetEmails.length };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function _sendTaskAlertEmail(taskName, note, priority, emails, senderName) {
  try {
    const subject = (priority === 'Urgent' ? '[URGENT] ' : '') + 'Team Task: ' + taskName;
    const body =
      '<div style="font-family:sans-serif;max-width:520px;">' +
      '<h2 style="color:' + (priority === 'Urgent' ? '#dc2626' : '#1e40af') + ';margin-bottom:4px;">' +
      (priority === 'Urgent' ? '🔴 Urgent Task' : '📋 New Task') + '</h2>' +
      '<h3 style="margin-top:0;">' + taskName + '</h3>' +
      (note ? '<p style="color:#374151;">' + note + '</p>' : '') +
      '<p style="color:#6b7280;font-size:13px;">Assigned by: ' + senderName + '</p>' +
      '</div>';
    emails.forEach(function(email) {
      try { MailApp.sendEmail({ to: email, subject: subject, htmlBody: body }); } catch (_) {}
    });
  } catch (_) {}
}

// Returns today's urgent alerts for the current user (for dashboard banner)
function getTodayAlerts() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const userEmail = String(user.email).toLowerCase();
    const sh = getSheet('Today_Alerts');
    if (!sh || sh.getLastRow() < 2) return { success: true, alerts: [] };

    const today = ymd(new Date());
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();

    const alerts = data
      .filter(function(r) {
        if (String(r[1]) !== today) return false;
        if (String(r[5]) !== 'Urgent') return false;
        const targets = String(r[6] || '').split(',').map(function(e) { return e.trim(); }).filter(Boolean);
        return targets.length === 0 || targets.indexOf(userEmail) !== -1;
      })
      .map(function(r) { return { alertId: String(r[0]), taskName: String(r[3]), note: String(r[4]), priority: String(r[5]) }; });

    return { success: true, alerts: alerts };
  } catch (e) {
    return { success: true, alerts: [] };
  }
}

// Returns active team members for the "Selected Members" dropdown
function getActiveTeamEmails() {
  try {
    assertRole(ROLES.MANAGER);
    return { success: true, data: getAllUsers().map(function(u) { return { email: u.email, name: u.name }; }) };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}
