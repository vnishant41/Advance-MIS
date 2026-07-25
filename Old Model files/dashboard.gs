/*****************************************
 * MIS TRACKER v8 — dashboard.gs
 * All dashboard reads come from Master_Log only.
 * Phase 3: split into 4 cached RPCs that load progressively on the client:
 *   1. getDashStats         — KPI numbers
 *   2. getDashWeekTrend     — last 7 days bar chart
 *   3. getDashReportProgress — today, per report
 *   4. getDashPending       — kanban + recent entries
 * Each RPC is cached per-user under CACHE_NS.MLOG; cache busts on any write.
 * Reads use readSheetTail(MASTER_LOG, 300) — bounded scan.
 *****************************************/

const DASH_TAIL_ROWS = 300;
const DASH_TTL = 300; // 5 minutes

// ── PRIVATE: tail-read + role-aware filter ───────────────────────────────────
function _dashRows(user) {
  const all = readSheetTail(MASTER_LOG, DASH_TAIL_ROWS, MASTER_LOG_COLS);
  return _filterByRole(all, user);
}

function _filterByRole(rows, user) {
  if (user.role === ROLES.SUPER) return rows.filter(r => r[M_COL.LOG_ID - 1] && r[M_COL.ROW_STATUS - 1] !== 'Amended');

  if (user.role === ROLES.MANAGER) {
    const deptUsers = _usersRows().filter(u => (u[3] || '') === user.dept).map(u => String(u[0]).toLowerCase());
    const set = new Set(deptUsers);
    return rows.filter(r => r[M_COL.LOG_ID - 1] && r[M_COL.ROW_STATUS - 1] !== 'Amended' &&
      set.has(String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase()));
  }

  return rows.filter(r => r[M_COL.LOG_ID - 1] && r[M_COL.ROW_STATUS - 1] !== 'Amended' &&
    String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase() === user.email);
}

// ── 1. STATS (today KPIs) ────────────────────────────────────────────────────
function getDashStats() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const cacheKey = 'stats:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const today = ymd(new Date());
    const rows = _dashRows(user);
    const todayRows = rows.filter(r => ymd(r[M_COL.DATE - 1]) === today);

    const result = {
      success: true,
      today,
      stats: {
        done:    todayRows.filter(r => r[M_COL.STATUS - 1] === 'Done').length,
        pending: todayRows.filter(r => r[M_COL.STATUS - 1] === 'Pending').length,
        skip:    todayRows.filter(r => r[M_COL.STATUS - 1] === 'Skip').length,
        late:    todayRows.filter(r => r[M_COL.LATE - 1] === 'Yes').length,
        total:   todayRows.length
      }
    };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── 2. WEEK TREND ────────────────────────────────────────────────────────────
function getDashWeekTrend() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const cacheKey = 'trend:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const trend = {};
    for (let d = 6; d >= 0; d--) {
      const dd = new Date(); dd.setDate(dd.getDate() - d);
      trend[ymd(dd)] = { done: 0, pending: 0, total: 0 };
    }

    const rows = _dashRows(user);
    rows.forEach(r => {
      const ds = ymd(r[M_COL.DATE - 1]);
      if (!trend[ds]) return;
      trend[ds].total++;
      const s = r[M_COL.STATUS - 1];
      if (s === 'Done') trend[ds].done++;
      else if (s === 'Pending') trend[ds].pending++;
    });

    const result = { success: true, trend };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── 3. REPORT PROGRESS (today, per MIS report) ──────────────────────────────
function getDashReportProgress() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const cacheKey = 'progress:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const today = ymd(new Date());
    const rows = _dashRows(user).filter(r => ymd(r[M_COL.DATE - 1]) === today);

    const progress = {};
    rows.forEach(r => {
      if (r[M_COL.TYPE - 1] !== ENTRY_TYPE.MIS) return;
      const rpt = r[M_COL.TOPIC - 1];
      if (!progress[rpt]) progress[rpt] = { name: rpt, done: 0, pending: 0, skip: 0, late: false, employee: r[M_COL.ON_NAME - 1] };
      const s = r[M_COL.STATUS - 1];
      if (s === 'Done') progress[rpt].done++;
      else if (s === 'Pending') progress[rpt].pending++;
      else if (s === 'Skip') progress[rpt].skip++;
      if (r[M_COL.LATE - 1] === 'Yes') progress[rpt].late = true;
    });

    const result = { success: true, progress: Object.values(progress) };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── 4. PENDING (kanban summary + recent entries) ─────────────────────────────
function getDashPending() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const cacheKey = 'pending:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const today = ymd(new Date());
    const rows = _dashRows(user);
    const todayRows = rows.filter(r => ymd(r[M_COL.DATE - 1]) === today);

    let kanbanSummary = { total: 0, open: 0, done: 0, blocked: 0, overdue: [], dueToday: [] };
    if (isModuleEnabled(MODULES.KANBAN)) {
      const kData = getKanbanData();
      const tasks = kData.tasks || [];
      kanbanSummary = {
        total:    tasks.length,
        open:     tasks.filter(t => t.status !== 'Done').length,
        done:     tasks.filter(t => t.status === 'Done').length,
        blocked:  tasks.filter(t => t.status === 'Blocked').length,
        overdue:  tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'Done'),
        dueToday: tasks.filter(t => t.dueDate === today && t.status !== 'Done')
      };
    }

    const recentEntries = todayRows.slice(-10).reverse().map(r => ({
      logId:       r[M_COL.LOG_ID - 1],
      date:        fmtDate(r[M_COL.DATE - 1], 'dd-MMM'),
      employee:    r[M_COL.ON_NAME - 1],
      report:      r[M_COL.TOPIC - 1],
      component:   r[M_COL.SUB - 1],
      status:      r[M_COL.STATUS - 1],
      entryType:   r[M_COL.TYPE - 1],
      late:        r[M_COL.LATE - 1] === 'Yes',
      isProxy:     String(r[M_COL.BY_EMAIL - 1] || '').toLowerCase() !== String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase(),
      submittedBy: r[M_COL.BY_EMAIL - 1]
    }));

    const result = { success: true, kanban: kanbanSummary, recentEntries };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── BACKWARD COMPAT: aggregate (unused by new client; kept for direct callers) ─
function getDashboardData() {
  const stats = getDashStats();
  if (!stats.success) return stats;
  const trend = getDashWeekTrend();
  const progress = getDashReportProgress();
  const pending = getDashPending();
  return {
    success: true,
    user: getCurrentUser(),
    today: stats.today,
    todayStats: stats.stats,
    weekTrend: (trend.trend || {}),
    reportProgress: (progress.progress || []),
    kanban: (pending.kanban || {}),
    recentEntries: (pending.recentEntries || [])
  };
}

// ── TEAM DASHBOARD (Manager+) ────────────────────────────────────────────────
function getTeamDashboard() {
  try {
    const user = assertRole(ROLES.MANAGER);
    assertModule(MODULES.TEAM);

    const cacheKey = 'team:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const today = ymd(new Date());
    const rows = _dashRows(user);

    const allUsers = _usersRows();
    const scopedUsers = (user.role === ROLES.SUPER) ? allUsers : allUsers.filter(u => (u[3] || '') === user.dept);

    const empStats = {};
    scopedUsers.forEach(u => {
      const em = String(u[0]).toLowerCase();
      empStats[em] = {
        email: em, name: u[1] || em, role: u[2] || ROLES.TEAMMATE, dept: u[3] || '',
        done: 0, pending: 0, skip: 0, late: 0, total: 0, lastActive: ''
      };
    });

    rows.forEach(r => {
      const em = String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase();
      if (!empStats[em]) return;
      const ds = ymd(r[M_COL.DATE - 1]);
      if (ds === today) {
        empStats[em].total++;
        const s = r[M_COL.STATUS - 1];
        if (s === 'Done') empStats[em].done++;
        else if (s === 'Pending') empStats[em].pending++;
        else if (s === 'Skip') empStats[em].skip++;
        if (r[M_COL.LATE - 1] === 'Yes') empStats[em].late++;
      }
      if (!empStats[em].lastActive || ds > empStats[em].lastActive) empStats[em].lastActive = ds;
    });

    let kanbanSummary = { total: 0, blocked: [], review: [], overdue: [] };
    let sprintInfo = null;
    if (isModuleEnabled(MODULES.KANBAN)) {
      const kData = getKanbanData();
      const tasks = kData.tasks || [];
      kanbanSummary = {
        total:   tasks.length,
        blocked: tasks.filter(t => t.status === 'Blocked'),
        review:  tasks.filter(t => t.status === 'Under Review'),
        overdue: tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'Done')
      };
      const activeSprint = (kData.sprints || []).filter(s => s.status === 'Active')[0];
      if (activeSprint) {
        const sprintTasks = tasks.filter(t => t.sprintId === activeSprint.id);
        sprintInfo = {
          sprint:     activeSprint,
          total:      sprintTasks.length,
          done:       sprintTasks.filter(t => t.status === 'Done').length,
          points:     sprintTasks.reduce((a, t) => a + (t.storyPoints || 0), 0),
          donePoints: sprintTasks.filter(t => t.status === 'Done').reduce((a, t) => a + (t.storyPoints || 0), 0)
        };
      }
    }

    const result = {
      success: true,
      today,
      team: Object.values(empStats),
      kanban: kanbanSummary,
      sprint: sprintInfo
    };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── MY TASK TABLE ────────────────────────────────────────────────────────────
function getMyTaskTable() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const cacheKey = 'mytable:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const rows = _dashRows(user);

    const logEntries = rows.slice(-200).reverse().map(r => ({
      logId:       r[M_COL.LOG_ID - 1],
      date:        fmtDate(r[M_COL.DATE - 1], 'dd-MMM-yy'),
      employee:    r[M_COL.ON_NAME - 1],
      report:      r[M_COL.TOPIC - 1],
      component:   r[M_COL.SUB - 1],
      status:      r[M_COL.STATUS - 1],
      count:       r[M_COL.COUNT - 1],
      remarks:     r[M_COL.REMARKS - 1],
      entryType:   r[M_COL.TYPE - 1],
      late:        r[M_COL.LATE - 1] === 'Yes',
      timeTaken:   r[M_COL.TIME - 1] || 0,
      rowStatus:   r[M_COL.ROW_STATUS - 1],
      submittedBy: r[M_COL.BY_EMAIL - 1],
      isProxy:     String(r[M_COL.BY_EMAIL - 1] || '').toLowerCase() !== String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase()
    }));

    let kanbanTasks = [];
    if (isModuleEnabled(MODULES.KANBAN)) {
      const kData = getKanbanData();
      kanbanTasks = kData.tasks || [];
    }

    const result = {
      success: true,
      log:    logEntries,
      kanban: kanbanTasks,
      recur:  getTaskList(),
      user
    };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANALYTICS — Phase 4
   KPIs, SLA breaches, commodity comparison, pending analysis, exports.
   All reads scope to caller's role (Teammate=self, Manager=dept, Super=all).
   ═══════════════════════════════════════════════════════════════════════════ */

const ANALYTICS_TAIL = 1500;

function _analyticsRows(user) {
  return _filterByRole(readSheetTail(MASTER_LOG, ANALYTICS_TAIL, MASTER_LOG_COLS), user);
}

// ── KPI BREAKDOWN ───────────────────────────────────────────────────────────
// done rate, pending rate, late rate, SLA breach count for the configured window.
function getKpiBreakdown() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);

    const cacheKey = 'kpi:' + user.email;
    const cached = cacheGet(CACHE_NS.MLOG, cacheKey);
    if (cached) return cached;

    const rows = _analyticsRows(user);
    const total = rows.length;
    const done    = rows.filter(r => r[M_COL.STATUS - 1] === 'Done').length;
    const pending = rows.filter(r => r[M_COL.STATUS - 1] === 'Pending').length;
    const skip    = rows.filter(r => r[M_COL.STATUS - 1] === 'Skip').length;
    const late    = rows.filter(r => r[M_COL.LATE - 1] === 'Yes').length;
    const slaBreach = late; // SLA = on-time submission; late === breach.

    const result = {
      success: true,
      total,
      doneRate:    total ? Math.round(done / total * 100) : 0,
      pendingRate: total ? Math.round(pending / total * 100) : 0,
      skipRate:    total ? Math.round(skip / total * 100) : 0,
      lateRate:    total ? Math.round(late / total * 100) : 0,
      slaBreach,
      counts: { total, done, pending, skip, late }
    };
    cachePut(CACHE_NS.MLOG, cacheKey, result, DASH_TTL);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SLA BREACHES (per component) ─────────────────────────────────────────────
function getSlaBreaches() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);

    const rows = _analyticsRows(user).filter(r => r[M_COL.LATE - 1] === 'Yes');
    const grouped = {};
    rows.forEach(r => {
      const key = String(r[M_COL.TOPIC - 1] || '') + '||' + String(r[M_COL.SUB - 1] || '');
      if (!grouped[key]) grouped[key] = {
        topic: r[M_COL.TOPIC - 1], subTopic: r[M_COL.SUB - 1],
        breaches: 0, lastBreach: '', employees: new Set()
      };
      grouped[key].breaches++;
      const ds = ymd(r[M_COL.DATE - 1]);
      if (!grouped[key].lastBreach || ds > grouped[key].lastBreach) grouped[key].lastBreach = ds;
      if (r[M_COL.ON_NAME - 1]) grouped[key].employees.add(r[M_COL.ON_NAME - 1]);
    });

    const data = Object.values(grouped).map(g => ({
      topic: g.topic,
      subTopic: g.subTopic,
      breaches: g.breaches,
      lastBreach: g.lastBreach,
      employees: Array.from(g.employees).join(', ')
    })).sort((a, b) => b.breaches - a.breaches);

    return { success: true, data };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── COMMODITY COMPARISON (today vs yesterday vs last week) ───────────────────
function getCommodityComparison(commodity) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);

    const today    = ymd(new Date());
    const yest     = ymdShift(today, -1);
    const lastWeek = ymdShift(today, -7);

    const rows = _analyticsRows(user).filter(r =>
      r[M_COL.TYPE - 1] === ENTRY_TYPE.DU &&
      String(r[M_COL.TOPIC - 1] || '').split('::')[0] === commodity
    );

    const slice = (dateStr) => {
      const dayRows = rows.filter(r => ymd(r[M_COL.DATE - 1]) === dateStr);
      return {
        date:    dateStr,
        total:   dayRows.length,
        done:    dayRows.filter(r => r[M_COL.STATUS - 1] === 'Done').length,
        pending: dayRows.filter(r => r[M_COL.STATUS - 1] === 'Pending').length,
        skip:    dayRows.filter(r => r[M_COL.STATUS - 1] === 'Skip').length
      };
    };

    return {
      success: true,
      commodity,
      today:    slice(today),
      yesterday: slice(yest),
      lastWeek: slice(lastWeek)
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function ymdShift(s, days) {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}

// ── PENDING ANALYSIS — factors consistently never completed ──────────────────
function getPendingAnalysis() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);

    const rows = _analyticsRows(user);
    const stats = {};
    rows.forEach(r => {
      const key = String(r[M_COL.TOPIC - 1] || '') + '||' + String(r[M_COL.SUB - 1] || '');
      if (!stats[key]) stats[key] = { topic: r[M_COL.TOPIC - 1], subTopic: r[M_COL.SUB - 1], total: 0, pending: 0, done: 0, lastDone: '', lastPending: '' };
      const ds = ymd(r[M_COL.DATE - 1]);
      stats[key].total++;
      if (r[M_COL.STATUS - 1] === 'Pending') {
        stats[key].pending++;
        if (!stats[key].lastPending || ds > stats[key].lastPending) stats[key].lastPending = ds;
      } else if (r[M_COL.STATUS - 1] === 'Done') {
        stats[key].done++;
        if (!stats[key].lastDone || ds > stats[key].lastDone) stats[key].lastDone = ds;
      }
    });

    // Persistent-pending: never had a Done OR last Done is much older than last Pending.
    const flagged = Object.values(stats)
      .filter(s => s.pending > 0 && (s.done === 0 || (s.lastDone && s.lastPending && s.lastDone < s.lastPending)))
      .map(s => ({
        topic: s.topic,
        subTopic: s.subTopic,
        pending: s.pending,
        done: s.done,
        lastDone: s.lastDone || '—',
        lastPending: s.lastPending,
        pendingRate: s.total ? Math.round(s.pending / s.total * 100) : 0
      }))
      .sort((a, b) => b.pendingRate - a.pendingRate);

    return { success: true, data: flagged.slice(0, 200) };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── EXPORTS (CSV + PDF) ──────────────────────────────────────────────────────
// CSV: returns string. PDF: returns base64-encoded bytes for client download.
function exportEntriesCsv(filters) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);
    const rows = _filterAnalyticsRows(user, filters);
    const headers = ['log_id','date','employee','entry_type','topic','sub_topic','status','data_count','remarks','source_url','confidence','validated_by','is_late','submitted_by','row_status'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      lines.push([
        r[M_COL.LOG_ID - 1],
        ymd(r[M_COL.DATE - 1]),
        r[M_COL.ON_NAME - 1],
        r[M_COL.TYPE - 1],
        r[M_COL.TOPIC - 1],
        r[M_COL.SUB - 1],
        r[M_COL.STATUS - 1],
        r[M_COL.COUNT - 1] || 0,
        r[M_COL.REMARKS - 1] || '',
        r[M_COL.SOURCE_URL - 1] || '',
        r[M_COL.CONFIDENCE - 1] || '',
        r[M_COL.VALIDATED_BY - 1] || '',
        r[M_COL.LATE - 1],
        r[M_COL.BY_EMAIL - 1],
        r[M_COL.ROW_STATUS - 1]
      ].map(_csvCell).join(','));
    });
    return { success: true, csv: lines.join('\n'), count: rows.length };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function exportEntriesPdf(filters) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.ANALYTICS);
    const rows = _filterAnalyticsRows(user, filters);

    const f = filters || {};
    const filterLine =
      'User: ' + (f.user || 'all') +
      ' · Type: ' + (f.entryType || 'all') +
      ' · Date: ' + (f.dateFrom || '…') + ' → ' + (f.dateTo || '…');

    let html = '<html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif; font-size:10px; color:#222;} ' +
      'h1{font-size:14px;} .meta{color:#555; font-size:10px; margin-bottom:8px;} ' +
      'table{border-collapse:collapse; width:100%;} ' +
      'th,td{border:1px solid #ccc; padding:4px 6px; text-align:left;} ' +
      'th{background:#1e3a5f; color:#fff;}' +
      '</style></head><body>';
    html += '<h1>MIS Tracker — Entry Export</h1>';
    html += '<div class="meta">Generated: ' + fmtDate(new Date(), 'yyyy-MM-dd HH:mm') + ' · ' + filterLine + ' · ' + rows.length + ' rows</div>';
    html += '<table><thead><tr><th>Date</th><th>Employee</th><th>Type</th><th>Topic</th><th>Sub</th><th>Status</th><th>Source</th><th>Confidence</th><th>Validated</th></tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>' +
        '<td>' + _h(ymd(r[M_COL.DATE - 1])) + '</td>' +
        '<td>' + _h(r[M_COL.ON_NAME - 1]) + '</td>' +
        '<td>' + _h(r[M_COL.TYPE - 1]) + '</td>' +
        '<td>' + _h(r[M_COL.TOPIC - 1]) + '</td>' +
        '<td>' + _h(r[M_COL.SUB - 1]) + '</td>' +
        '<td>' + _h(r[M_COL.STATUS - 1]) + '</td>' +
        '<td>' + _h(r[M_COL.SOURCE_URL - 1] || '') + '</td>' +
        '<td>' + _h(r[M_COL.CONFIDENCE - 1] || '') + '</td>' +
        '<td>' + _h(r[M_COL.VALIDATED_BY - 1] || '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></body></html>';

    const blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
    const base64 = Utilities.base64Encode(blob.getBytes());
    return { success: true, base64, filename: 'mis-export-' + fmtDate(new Date(), 'yyyyMMdd-HHmm') + '.pdf', count: rows.length };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function _filterAnalyticsRows(user, filters) {
  const f = filters || {};
  const rows = _analyticsRows(user);
  const userFilter = f.user ? String(f.user).toLowerCase() : '';
  return rows.filter(r => {
    if (f.entryType && r[M_COL.TYPE - 1] !== f.entryType) return false;
    if (f.commodity) {
      const topic = String(r[M_COL.TOPIC - 1] || '');
      if (r[M_COL.TYPE - 1] === ENTRY_TYPE.DU) {
        if (topic.split('::')[0] !== f.commodity) return false;
      } else if (topic !== f.commodity) {
        return false;
      }
    }
    if (userFilter && String(r[M_COL.ON_EMAIL - 1] || '').toLowerCase() !== userFilter) return false;
    if (f.dateFrom) { if (ymd(r[M_COL.DATE - 1]) < f.dateFrom) return false; }
    if (f.dateTo)   { if (ymd(r[M_COL.DATE - 1]) > f.dateTo)   return false; }
    return true;
  });
}

function _csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = (v instanceof Date) ? fmtDate(v, 'yyyy-MM-dd HH:mm') : String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function _h(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
