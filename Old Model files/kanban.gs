/*****************************************
 * MIS TRACKER v8 — kanban.gs (Phase 3 rebuild)
 * Tasks + Sprints. Email-based identifiers. Batched writes only.
 *
 * Phase 3 additions:
 *  - Schema cols 17 (depends_on), 18 (blocked_reason), 19 (calendar_event_id)
 *    Backwards-compatible header migration via initKanbanSheets.
 *  - Per-column read: getKanbanColumn(status) — separate cached call per column.
 *  - Bulk move: bulkMoveKanban(ids, status, blockedReason).
 *  - Blocked status requires a reason (server-enforced).
 *  - "Done" requires all dependencies done (server-enforced).
 *  - Google Calendar sync: create/update/delete event per task with a dueDate.
 *  - Per-user CACHE_NS.KANBAN cache; bust on every write path.
 *****************************************/

// ── HEADERS ──────────────────────────────────────────────────────────────────
const KANBAN_HEADERS = [
  'id','title','description','assigned_to_email','assigned_to_name','status','priority',
  'due_date','created_by_email','created_at','updated_at','tags','sprint_id','story_points',
  'comments_json','dept','depends_on','blocked_reason','calendar_event_id','remark'
];
const SPRINT_HEADERS = ['id','name','start_date','end_date','status','goal'];

const KANBAN_COLS = 20;
const SPRINT_COLS = 6;

const K_COL = Object.freeze({
  ID: 1, TITLE: 2, DESC: 3, ASSIGNEE: 4, ASSIGNEE_NAME: 5, STATUS: 6, PRIORITY: 7,
  DUE: 8, BY: 9, CREATED: 10, UPDATED: 11, TAGS: 12, SPRINT: 13, POINTS: 14, COMMENTS: 15,
  DEPT: 16, DEPENDS: 17, BLOCK_REASON: 18, CAL_EVENT: 19, REMARK: 20
});

const KANBAN_STATUSES = ['Assigned', 'In Progress', 'Under Review', 'Done', 'Blocked'];

const KANBAN_TAIL = 1000; // max tasks read per call

// ── BOOTSTRAP ────────────────────────────────────────────────────────────────
function initKanbanSheets() {
  _ensureKanbanSheet(KANBAN_SHEET, KANBAN_HEADERS);
  _ensureKanbanSheet(SPRINT_SHEET, SPRINT_HEADERS);
  _migrateKanbanHeaders();
  return { success: true };
}

function _ensureKanbanSheet(name, headers) {
  let sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  if (!sh.getRange(1, 1).getValue()) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Adds any missing headers (cols 17/18/19) to existing Kanban sheets.
function _migrateKanbanHeaders() {
  const sh = SS.getSheetByName(KANBAN_SHEET);
  if (!sh) return;
  const last = sh.getLastColumn();
  if (last >= KANBAN_COLS) return;
  const missing = KANBAN_HEADERS.slice(last);
  sh.getRange(1, last + 1, 1, missing.length).setValues([missing])
    .setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#FFFFFF');
}

// ── PRIVATE: read + role filter ──────────────────────────────────────────────
function _readAllKanban() {
  const sh = getSheet(KANBAN_SHEET);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
}

function _kanbanRowToTask(r) {
  let comments = [];
  try { comments = JSON.parse(r[K_COL.COMMENTS - 1] || '[]'); }
  catch (e) { Logger.log('comments parse failed for ' + r[K_COL.ID - 1] + ': ' + e.message); }

  const assigneeRaw = String(r[K_COL.ASSIGNEE - 1] || '').toLowerCase();
  const assigneeNameRaw = String(r[K_COL.ASSIGNEE_NAME - 1] || '');
  const assigneeList = assigneeRaw.split(',').map(s => s.trim()).filter(Boolean);
  const assigneeNameList = assigneeNameRaw
    ? assigneeNameRaw.split(',').map(s => s.trim()).filter(Boolean)
    : assigneeList.map(e => resolveName(e));

  return {
    id:             String(r[K_COL.ID - 1]),
    title:          r[K_COL.TITLE - 1] || '',
    desc:           r[K_COL.DESC - 1] || '',
    assignedTo:     assigneeRaw,                 // comma-joined emails (back-compat string field)
    assignedToList: assigneeList,                // array of emails
    assignedToName: assigneeNameList.join(', '), // display string
    assignedToNameList: assigneeNameList,        // array of names
    status:         r[K_COL.STATUS - 1] || 'Assigned',
    priority:       r[K_COL.PRIORITY - 1] || 'Medium',
    dueDate:        r[K_COL.DUE - 1] ? ymd(r[K_COL.DUE - 1]) : '',
    createdBy:      String(r[K_COL.BY - 1] || '').toLowerCase(),
    createdAt:      _kFmtDateSafe(r[K_COL.CREATED - 1], 'dd-MMM-yy'),
    updatedAt:      _kFmtDateSafe(r[K_COL.UPDATED - 1], 'dd-MMM-yy HH:mm'),
    tags:           r[K_COL.TAGS - 1] || '',
    sprintId:       String(r[K_COL.SPRINT - 1] || ''),
    storyPoints:    parseInt(r[K_COL.POINTS - 1], 10) || 0,
    comments:       comments,
    dept:           r[K_COL.DEPT - 1] || '',
    dependsOn:      String(r[K_COL.DEPENDS - 1] || '').split(',').map(s => s.trim()).filter(Boolean),
    blockedReason:  r[K_COL.BLOCK_REASON - 1] || '',
    calendarEventId: r[K_COL.CAL_EVENT - 1] || '',
    remark:         r[K_COL.REMARK - 1] || ''
  };
}

function _filterTasksForUser(tasks, user) {
  if (user.role === ROLES.SUPER || user.role === ROLES.MANAGER) return tasks;
  const email = String(user.email || '').toLowerCase();
  return tasks.filter(t => {
    const inList = (t.assignedToList || []).indexOf(email) !== -1;
    const isCreator = String(t.createdBy || '').toLowerCase() === email;
    return inList || isCreator;
  });
}

// ── READ: full board (cached) ────────────────────────────────────────────────
function getKanbanData() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);

    const cacheKey = 'data:' + user.email;
    const cached = cacheGet(CACHE_NS.KANBAN, cacheKey);
    if (cached) return cached;

    const rows = _readAllKanban();
    const allTasks = rows.filter(r => r[K_COL.ID - 1]).map(_kanbanRowToTask);
    const visible = _filterTasksForUser(allTasks, user);

    const sprints = _readSprints();

    const result = { success: true, tasks: visible, sprints, user };
    cachePut(CACHE_NS.KANBAN, cacheKey, result, 300);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function _readSprints() {
  const sh = getSheet(SPRINT_SHEET);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SPRINT_COLS).getValues().filter(r => r[0]).map(r => ({
    id:        String(r[0]),
    name:      r[1] || '',
    startDate: r[2] ? ymd(r[2]) : '',
    endDate:   r[3] ? ymd(r[3]) : '',
    status:    r[4] || 'Active',
    goal:      r[5] || ''
  }));
}

// ── READ: shell (sprints + assignee/tag lists; no task bodies) ──────────────
function getKanbanShell() {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);

    const cacheKey = 'shell:' + user.email;
    const cached = cacheGet(CACHE_NS.KANBAN, cacheKey);
    if (cached) return cached;

    const rows = _readAllKanban();
    const allTasks = rows.filter(r => r[K_COL.ID - 1]).map(_kanbanRowToTask);
    const visible = _filterTasksForUser(allTasks, user);

    const assigneeSet = new Set();
    visible.forEach(t => (t.assignedToList || []).forEach(e => { if (e) assigneeSet.add(e); }));
    const assignees = Array.from(assigneeSet).sort();
    const tagSet = new Set();
    visible.forEach(t => String(t.tags || '').split(',').map(s => s.trim()).filter(Boolean).forEach(x => tagSet.add(x)));

    const sprints = _readSprints();
    const activeSprint = sprints.filter(s => s.status === 'Active')[0] || null;

    let sprintVelocity = null;
    if (activeSprint) {
      const inSprint = visible.filter(t => t.sprintId === activeSprint.id);
      const total = inSprint.reduce((a, t) => a + (t.storyPoints || 0), 0);
      const done  = inSprint.filter(t => t.status === 'Done').reduce((a, t) => a + (t.storyPoints || 0), 0);
      sprintVelocity = {
        sprint:     activeSprint,
        totalPoints: total,
        donePoints:  done,
        totalTasks:  inSprint.length,
        doneTasks:   inSprint.filter(t => t.status === 'Done').length,
        pct:         total > 0 ? Math.round(done / total * 100) : 0
      };
    }

    const counts = {};
    KANBAN_STATUSES.forEach(s => counts[s] = visible.filter(t => t.status === s).length);

    const result = {
      success:  true,
      statuses: KANBAN_STATUSES,
      counts,
      sprints,
      assignees,
      allUsers: getAllUsers(),
      tags: Array.from(tagSet).sort(),
      sprintVelocity,
      user
    };
    cachePut(CACHE_NS.KANBAN, cacheKey, result, 300);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── READ: single column (cached) ─────────────────────────────────────────────
function getKanbanColumn(status) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);
    if (KANBAN_STATUSES.indexOf(status) === -1) return { success: false, message: 'Unknown status: ' + status };

    const cacheKey = 'col:' + status + ':' + user.email;
    const cached = cacheGet(CACHE_NS.KANBAN, cacheKey);
    if (cached) return cached;

    const rows = _readAllKanban();
    const allTasks = rows.filter(r => r[K_COL.ID - 1] && r[K_COL.STATUS - 1] === status).map(_kanbanRowToTask);
    const visible = _filterTasksForUser(allTasks, user);

    const result = { success: true, status, tasks: visible };
    cachePut(CACHE_NS.KANBAN, cacheKey, result, 300);
    return result;
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// Returns formatted date string, or '' for empty / epoch / invalid values.
// Avoids the "01-Jan-70" leak when a cell holds 0, '' or undefined.
function _kFmtDateSafe(v, pattern) {
  if (v === '' || v === null || v === undefined) return '';
  const d = (v instanceof Date) ? v : new Date(v);
  const ms = d.getTime();
  if (!isFinite(ms) || ms <= 0) return '';
  return fmtDate(d, pattern);
}

// ── PRIVATE: assignee list normalisation ─────────────────────────────────────
// Accepts string ("a@x.com, b@x.com") or array. Returns
// { emails: [...lowercased], names: [...resolved], users: [...findUser results], depts: [...] }
// or throws if any assignee is unknown.
function _normaliseAssignees(input) {
  let raw = [];
  if (Array.isArray(input)) raw = input.slice();
  else raw = String(input || '').split(',');
  const emails = raw.map(s => String(s).trim().toLowerCase()).filter(Boolean);
  if (!emails.length) throw new Error('At least one assignee is required');

  // Dedupe while preserving order.
  const seen = new Set();
  const unique = [];
  emails.forEach(e => { if (!seen.has(e)) { seen.add(e); unique.push(e); } });

  const users = unique.map(e => {
    const u = findUser(e);
    if (!u) throw new Error('Assignee not found: ' + e);
    return u;
  });
  return {
    emails: users.map(u => u.email),
    names:  users.map(u => u.name),
    users:  users,
    depts:  Array.from(new Set(users.map(u => u.dept).filter(Boolean)))
  };
}

// ── PRIVATE: dependency check ────────────────────────────────────────────────
// Throws if any of taskIds are not Done.
function _ensureDependenciesDone(rows, dependsOn) {
  if (!dependsOn || !dependsOn.length) return;
  const wanted = new Set(dependsOn);
  const blockers = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (wanted.has(String(r[K_COL.ID - 1]))) {
      if (r[K_COL.STATUS - 1] !== 'Done') blockers.push(r[K_COL.TITLE - 1] || r[K_COL.ID - 1]);
    }
  }
  if (blockers.length) throw new Error('Cannot mark Done — dependencies not Done: ' + blockers.join(', '));
}

// ── CREATE ───────────────────────────────────────────────────────────────────
// Manager+ only. Teammates cannot create tasks (they can only update status on
// tasks they're assigned to).
function createKanbanTask(payload) {
  try {
    const user = assertRole(ROLES.MANAGER);
    assertModule(MODULES.KANBAN);

    if (!payload || !payload.title) return { success: false, message: 'Title required' };

    const assignees = _normaliseAssignees(payload.assignedTo);

    if (user.role === ROLES.MANAGER) {
      const outOfDept = assignees.users.filter(u => u.dept && u.dept !== user.dept);
      if (outOfDept.length) {
        return { success: false, message: 'Managers can only assign within their own department: ' + outOfDept.map(u => u.email).join(', ') };
      }
    }

    const sh = _ensureKanbanSheet(KANBAN_SHEET, KANBAN_HEADERS);
    _migrateKanbanHeaders();
    const now = new Date();
    const baseDept = (user.role === ROLES.SUPER && payload.dept)
      ? payload.dept
      : (assignees.depts[0] || user.dept || '');
    const dependsOn = Array.isArray(payload.dependsOn) ? payload.dependsOn.join(',') : (payload.dependsOn || '');

    // Create one separate task row per assignee so each person sees only their own task.
    const warnings = [];
    const createdIds = [];
    for (let ai = 0; ai < assignees.emails.length; ai++) {
      const email = assignees.emails[ai];
      const name  = assignees.names[ai];
      const dept  = assignees.users[ai].dept || baseDept;
      const id    = 'T' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + '_' + ai;
      const row = [
        id, payload.title, payload.desc || '',
        email, name,
        'Assigned', payload.priority || 'Medium', payload.dueDate || '',
        user.email, now, now, payload.tags || '',
        payload.sprintId || '', parseInt(payload.storyPoints, 10) || 0,
        '[]', dept, dependsOn, '', '',
        String(payload.remark || '').trim()
      ];
      sh.getRange(sh.getLastRow() + 1, 1, 1, KANBAN_COLS).setValues([row]);

      const eventId = _syncCalendarForTask({
        id, title: payload.title, desc: payload.desc, dueDate: payload.dueDate,
        assigneeEmails: [email], status: 'Assigned'
      }, '', warnings);
      if (eventId) sh.getRange(sh.getLastRow(), K_COL.CAL_EVENT, 1, 1).setValues([[eventId]]);
      createdIds.push(id);
    }

    cacheBust(CACHE_NS.KANBAN); cacheBust(CACHE_NS.MLOG);
    return { success: true, id: createdIds[0], created: createdIds.length, warnings };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── UPDATE ───────────────────────────────────────────────────────────────────
// Permission rules:
//  - SuperAdmin: full edit on any task.
//  - Manager:   full edit on tasks in their own department (or department-less tasks).
//  - Teammate:  ONLY when they are an assignee — and ONLY status (+blockedReason
//               when moving to Blocked). Any other field change is rejected.
function updateKanbanTask(payload) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);

    const sh = getSheetOrThrow(KANBAN_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'Task not found' };

    const data = sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (String(r[K_COL.ID - 1]) !== String(payload.id)) continue;

      const dept = r[K_COL.DEPT - 1] || '';
      const assigneeList = String(r[K_COL.ASSIGNEE - 1] || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const isAssignee = assigneeList.indexOf(user.email) !== -1;
      const isManagerPlus = user.role === ROLES.SUPER ||
        (user.role === ROLES.MANAGER && (!dept || dept === user.dept));

      if (!isManagerPlus && !isAssignee) {
        return { success: false, message: 'Not authorised' };
      }

      // Teammate path: only status (+ blockedReason when Blocked) is allowed.
      if (!isManagerPlus) {
        const onlyStatusKeys = ['id', 'status', 'blockedReason'];
        const offendingKeys = Object.keys(payload).filter(k => onlyStatusKeys.indexOf(k) === -1 && payload[k] !== undefined);
        if (offendingKeys.length) {
          return { success: false, message: 'Assignees can only change status. Forbidden fields: ' + offendingKeys.join(', ') };
        }
      }

      const newStatus = payload.status || r[K_COL.STATUS - 1];
      const oldStatus = r[K_COL.STATUS - 1];

      let blockReason = r[K_COL.BLOCK_REASON - 1] || '';
      if (newStatus === 'Blocked') {
        const reason = String(payload.blockedReason || '').trim();
        if (!reason) return { success: false, message: 'Blocked reason is required' };
        blockReason = reason;
      } else if (oldStatus === 'Blocked' && newStatus !== 'Blocked') {
        blockReason = '';
      }

      if (newStatus === 'Done' && oldStatus !== 'Done') {
        const deps = String(r[K_COL.DEPENDS - 1] || '').split(',').map(s => s.trim()).filter(Boolean);
        _ensureDependenciesDone(data, deps);
      }

      let newRow;
      if (!isManagerPlus) {
        // Status / blockedReason only.
        newRow = r.slice();
        newRow[K_COL.STATUS - 1] = newStatus;
        newRow[K_COL.BLOCK_REASON - 1] = blockReason;
        newRow[K_COL.UPDATED - 1] = new Date();
      } else {
        // Manager+: full edit.
        let newAssigneeEmails = String(r[K_COL.ASSIGNEE - 1] || '');
        let newAssigneeNames  = String(r[K_COL.ASSIGNEE_NAME - 1] || '');
        let newDept = dept;
        if (payload.assignedTo !== undefined) {
          const ass = _normaliseAssignees(payload.assignedTo);
          if (user.role === ROLES.MANAGER) {
            const outOfDept = ass.users.filter(u => u.dept && u.dept !== user.dept);
            if (outOfDept.length) {
              return { success: false, message: 'Cannot reassign outside your department: ' + outOfDept.map(u => u.email).join(', ') };
            }
          }
          newAssigneeEmails = ass.emails.join(', ');
          newAssigneeNames  = ass.names.join(', ');
          newDept = ass.depts[0] || dept;
        }
        const newDeps = payload.dependsOn !== undefined
          ? (Array.isArray(payload.dependsOn) ? payload.dependsOn.join(',') : String(payload.dependsOn))
          : r[K_COL.DEPENDS - 1];
        newRow = [
          r[K_COL.ID - 1],
          payload.title !== undefined ? payload.title : r[K_COL.TITLE - 1],
          payload.desc !== undefined ? payload.desc : r[K_COL.DESC - 1],
          newAssigneeEmails,
          newAssigneeNames,
          newStatus,
          payload.priority !== undefined ? payload.priority : r[K_COL.PRIORITY - 1],
          payload.dueDate !== undefined ? payload.dueDate : r[K_COL.DUE - 1],
          r[K_COL.BY - 1],
          r[K_COL.CREATED - 1],
          new Date(),
          payload.tags !== undefined ? payload.tags : r[K_COL.TAGS - 1],
          payload.sprintId !== undefined ? payload.sprintId : r[K_COL.SPRINT - 1],
          payload.storyPoints !== undefined ? parseInt(payload.storyPoints, 10) || 0 : r[K_COL.POINTS - 1],
          r[K_COL.COMMENTS - 1] || '[]',
          newDept,
          newDeps,
          blockReason,
          r[K_COL.CAL_EVENT - 1] || '',
          payload.remark !== undefined ? String(payload.remark).trim() : (r[K_COL.REMARK - 1] || '')
        ];
      }

      sh.getRange(i + 2, 1, 1, KANBAN_COLS).setValues([newRow]);

      const warnings = [];
      const newEventId = _syncCalendarForTask({
        id:             r[K_COL.ID - 1],
        title:          newRow[K_COL.TITLE - 1],
        desc:           newRow[K_COL.DESC - 1],
        dueDate:        newRow[K_COL.DUE - 1],
        assigneeEmails: String(newRow[K_COL.ASSIGNEE - 1] || '').split(',').map(s => s.trim()).filter(Boolean),
        status:         newRow[K_COL.STATUS - 1]
      }, r[K_COL.CAL_EVENT - 1] || '', warnings);
      if (newEventId !== (r[K_COL.CAL_EVENT - 1] || '')) {
        sh.getRange(i + 2, K_COL.CAL_EVENT, 1, 1).setValues([[newEventId]]);
      }

      cacheBust(CACHE_NS.KANBAN); cacheBust(CACHE_NS.MLOG);
      return { success: true, warnings };
    }
    return { success: false, message: 'Task not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── BULK MOVE ────────────────────────────────────────────────────────────────
// Validates each task individually; applies all that pass in one batched write.
function bulkMoveKanban(ids, status, blockedReason) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);
    if (!Array.isArray(ids) || !ids.length) return { success: false, message: 'No task ids' };
    if (KANBAN_STATUSES.indexOf(status) === -1) return { success: false, message: 'Unknown status' };
    if (status === 'Blocked' && !String(blockedReason || '').trim()) {
      return { success: false, message: 'Blocked reason is required for bulk Blocked move' };
    }

    const sh = getSheetOrThrow(KANBAN_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'No tasks' };

    const data = sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
    const wanted = new Set(ids.map(String));
    const moved = [];
    const skipped = [];

    // Mutate in-memory; write back per affected column at the end.
    const statusCol = data.map(r => [r[K_COL.STATUS - 1]]);
    const reasonCol = data.map(r => [r[K_COL.BLOCK_REASON - 1] || '']);
    const updatedCol = data.map(r => [r[K_COL.UPDATED - 1]]);
    const calCol = data.map(r => [r[K_COL.CAL_EVENT - 1] || '']);
    const now = new Date();

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const id = String(r[K_COL.ID - 1]);
      if (!wanted.has(id)) continue;

      const dept = r[K_COL.DEPT - 1] || '';
      const assigneeList = String(r[K_COL.ASSIGNEE - 1] || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const isAssignee = assigneeList.indexOf(user.email) !== -1;
      const canMove = user.role === ROLES.SUPER ||
        (user.role === ROLES.MANAGER && (!dept || dept === user.dept)) ||
        isAssignee;
      if (!canMove) { skipped.push({ id, reason: 'unauthorised' }); continue; }

      if (status === 'Done') {
        const deps = String(r[K_COL.DEPENDS - 1] || '').split(',').map(s => s.trim()).filter(Boolean);
        try { _ensureDependenciesDone(data, deps); }
        catch (depErr) { skipped.push({ id, reason: depErr.message }); continue; }
      }

      statusCol[i][0] = status;
      updatedCol[i][0] = now;
      if (status === 'Blocked') reasonCol[i][0] = String(blockedReason).trim();
      else if (r[K_COL.STATUS - 1] === 'Blocked') reasonCol[i][0] = '';

      // Calendar sync — pass full assignee list
      const newEventId = _syncCalendarForTask({
        id, title: r[K_COL.TITLE - 1], desc: r[K_COL.DESC - 1],
        dueDate: r[K_COL.DUE - 1], assigneeEmails: assigneeList, status
      }, r[K_COL.CAL_EVENT - 1] || '', []);
      calCol[i][0] = newEventId;

      moved.push(id);
    }

    if (moved.length) {
      sh.getRange(2, K_COL.STATUS, statusCol.length, 1).setValues(statusCol);
      sh.getRange(2, K_COL.UPDATED, updatedCol.length, 1).setValues(updatedCol);
      sh.getRange(2, K_COL.BLOCK_REASON, reasonCol.length, 1).setValues(reasonCol);
      sh.getRange(2, K_COL.CAL_EVENT, calCol.length, 1).setValues(calCol);
      cacheBust(CACHE_NS.KANBAN); cacheBust(CACHE_NS.MLOG);
    }
    return { success: true, moved: moved.length, skipped };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
function deleteKanbanTask(taskId) {
  try {
    const user = assertRole(ROLES.MANAGER);
    assertModule(MODULES.KANBAN);

    const sh = getSheetOrThrow(KANBAN_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'Task not found' };

    const data = sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][K_COL.ID - 1]) !== String(taskId)) continue;
      if (user.role === ROLES.MANAGER && data[i][K_COL.DEPT - 1] && data[i][K_COL.DEPT - 1] !== user.dept) {
        return { success: false, message: 'Cannot delete tasks outside your department' };
      }
      // Best-effort: delete calendar event if present
      const eventId = data[i][K_COL.CAL_EVENT - 1];
      if (eventId) _deleteCalendarEvent(eventId);
      sh.deleteRow(i + 2);
      cacheBust(CACHE_NS.KANBAN); cacheBust(CACHE_NS.MLOG);
      return { success: true };
    }
    return { success: false, message: 'Task not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── COMMENT ──────────────────────────────────────────────────────────────────
function addTaskComment(taskId, comment) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    assertModule(MODULES.KANBAN);
    if (!comment || !String(comment).trim()) return { success: false, message: 'Empty comment' };

    const sh = getSheetOrThrow(KANBAN_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'Task not found' };

    const data = sh.getRange(2, 1, last - 1, KANBAN_COLS).getValues();
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (String(r[K_COL.ID - 1]) !== String(taskId)) continue;

      const dept = r[K_COL.DEPT - 1] || '';
      const assigneeList = String(r[K_COL.ASSIGNEE - 1] || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const isAssignee = assigneeList.indexOf(user.email) !== -1;
      const canComment =
        user.role === ROLES.SUPER ||
        (user.role === ROLES.MANAGER && (!dept || dept === user.dept)) ||
        isAssignee;
      if (!canComment) return { success: false, message: 'Not your task' };

      let comments = [];
      try { comments = JSON.parse(r[K_COL.COMMENTS - 1] || '[]'); }
      catch (e) { Logger.log('addTaskComment parse fail for ' + taskId + ': ' + e.message); }
      comments.push({ by: user.name, email: user.email, text: String(comment), at: new Date().toISOString() });

      // Write columns separately — they aren't adjacent in all schemas and the
      // 1×2 setValues was fragile.
      sh.getRange(i + 2, K_COL.COMMENTS, 1, 1).setValue(JSON.stringify(comments));
      sh.getRange(i + 2, K_COL.UPDATED, 1, 1).setValue(new Date());
      cacheBust(CACHE_NS.KANBAN);
      return { success: true };
    }
    return { success: false, message: 'Task not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SPRINTS ──────────────────────────────────────────────────────────────────
function createSprint(payload) {
  try {
    assertRole(ROLES.MANAGER);
    assertModule(MODULES.KANBAN);
    if (!payload || !payload.name) return { success: false, message: 'Sprint name required' };

    const sh = _ensureKanbanSheet(SPRINT_SHEET, SPRINT_HEADERS);
    const id = 'SP' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const row = [id, payload.name, payload.startDate || '', payload.endDate || '', 'Active', payload.goal || ''];
    sh.getRange(sh.getLastRow() + 1, 1, 1, SPRINT_COLS).setValues([row]);
    cacheBust(CACHE_NS.KANBAN);
    return { success: true, id };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function updateSprintStatus(sprintId, status) {
  try {
    assertRole(ROLES.MANAGER);
    assertModule(MODULES.KANBAN);
    const sh = getSheetOrThrow(SPRINT_SHEET);
    const last = sh.getLastRow();
    if (last < 2) return { success: false, message: 'Sprint not found' };
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(sprintId)) {
        sh.getRange(i + 2, 5, 1, 1).setValues([[status]]);
        cacheBust(CACHE_NS.KANBAN);
        return { success: true };
      }
    }
    return { success: false, message: 'Sprint not found' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── GOOGLE CALENDAR SYNC ─────────────────────────────────────────────────────
// Strategy: deployer's default calendar holds the source-of-truth event with
// every assignee added as a guest. Failures are non-fatal — they're surfaced as
// warnings so the client can toast the user without aborting the task write.
// Accepts task.assigneeEmails (array, preferred) or legacy task.assigneeEmail
// (string). warnings is an out-array; pass [] if you don't care.
function _syncCalendarForTask(task, oldEventId, warnings) {
  warnings = warnings || [];
  try {
    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) {
      warnings.push('Calendar unavailable; skipped sync for ' + (task.id || ''));
      return oldEventId || '';
    }

    const hasDue = !!task.dueDate;
    const isDone = task.status === 'Done';

    if (!hasDue || isDone) {
      if (oldEventId) _deleteCalendarEvent(oldEventId);
      return '';
    }

    const dateStr = task.dueDate instanceof Date ? ymd(task.dueDate) : String(task.dueDate);
    const date = new Date(dateStr + 'T00:00:00');
    const title = '[MIS] ' + (task.title || task.id);
    const description = (task.desc || '') + '\n\nTask: ' + task.id;

    let assigneeEmails = [];
    if (Array.isArray(task.assigneeEmails)) assigneeEmails = task.assigneeEmails;
    else if (task.assigneeEmail) assigneeEmails = String(task.assigneeEmail).split(',');
    assigneeEmails = assigneeEmails.map(s => String(s).trim().toLowerCase()).filter(Boolean);

    if (oldEventId) {
      try {
        const ev = cal.getEventById(oldEventId);
        if (ev) {
          ev.setTitle(title);
          ev.setDescription(description);
          ev.setAllDayDate(date);
          const existing = ev.getGuestList().map(g => g.getEmail().toLowerCase());
          assigneeEmails.forEach(a => { if (a && existing.indexOf(a) === -1) ev.addGuest(a); });
          return oldEventId;
        }
      } catch (e) { warnings.push('Calendar event update failed for ' + (task.id || '') + ': ' + e.message); }
    }

    const ev = cal.createAllDayEvent(title, date, { description, guests: assigneeEmails.join(',') });
    return ev.getId();
  } catch (e) {
    Logger.log('_syncCalendarForTask: ' + e.message);
    warnings.push('Calendar sync failed for ' + (task.id || '') + ': ' + e.message);
    return oldEventId || '';
  }
}

function _deleteCalendarEvent(eventId) {
  try {
    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) return;
    const ev = cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (e) { Logger.log('_deleteCalendarEvent: ' + e.message); }
}
