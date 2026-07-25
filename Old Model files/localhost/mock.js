/* ═══════════════════════════════════════════════════════════════
   MOCK DATA LAYER — replaces google.script.run for localhost
   ═══════════════════════════════════════════════════════════════ */

const TODAY = new Date().toISOString().slice(0, 10);

// ── BOOT payload (normally injected server-side) ──
const FULL_BOOT = {
  access: true,
  user: { email: 'admin@example.com', name: 'Nishant Admin', role: 'SuperAdmin', dept: 'Research' },
  modules: { mis: true, du: true, task: true, kanban: true, crossVal: true, analytics: true, audit: true },
  today: TODAY,
  window: { open: true, start: '08:00', end: '20:00', now: new Date().toTimeString().slice(0,5) }
};

// Start unauthenticated so we can see the new Login screen!
window.BOOT = { access: false };

// ── Fake delay helper ──
function delay(ms){ return new Promise(r => setTimeout(r, ms || 200 + Math.random()*300)); }

// ── Mock google.script.run ──
window.google = { script: { run: new Proxy({}, {
  get(_, prop) {
    if (prop === 'withSuccessHandler') return cb => new Proxy({}, {
      get(__, p2) {
        if (p2 === 'withFailureHandler') return () => new Proxy({}, { get(___, fn) { return (...args) => { delay().then(() => { const r = MOCK_HANDLERS[fn] ? MOCK_HANDLERS[fn](...args) : {success:true}; cb(r); }); }; } });
        return (...args) => { delay().then(() => { const r = MOCK_HANDLERS[p2] ? MOCK_HANDLERS[p2](...args) : {success:true}; cb(r); }); };
      }
    });
    return (...args) => console.log('google.script.run.' + prop, args);
  }
})}};

// ── rpc() override — called by JsCore.html ──
window.rpc = function(fn, ...args) {
  return delay().then(() => {
    if (MOCK_HANDLERS[fn]) return MOCK_HANDLERS[fn](...args);
    console.warn('No mock for rpc("' + fn + '")', args);
    return { success: true, message: 'Mock: no handler for ' + fn };
  });
};

// ═══════════════════════════════════════════════════════════════
// MOCK HANDLERS — one per server function name
// ═══════════════════════════════════════════════════════════════
const MOCK_HANDLERS = {};

MOCK_HANDLERS.authenticate = (email, pwd) => {
  if (pwd === 'admin123') return { success: true, data: FULL_BOOT };
  return { success: false, message: 'Invalid credentials. Try pwd: admin123' };
};

// ── Dashboard ──
MOCK_HANDLERS.getDashStats = () => ({
  success: true,
  stats: { total: 42, done: 28, pending: 10, late: 4 }
});

MOCK_HANDLERS.getDashWeekTrend = () => {
  const trend = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0,10);
    trend[k] = { total: 5 + Math.floor(Math.random()*15), done: 3 + Math.floor(Math.random()*10), pending: Math.floor(Math.random()*5) };
  }
  return { success: true, trend };
};

MOCK_HANDLERS.getDashReportProgress = () => ({
  success: true,
  progress: [
    { name: 'Daily Production', done: 8, pending: 2, skip: 1, late: false },
    { name: 'Quality Check', done: 5, pending: 3, skip: 0, late: true },
    { name: 'Inventory Update', done: 12, pending: 0, skip: 1, late: false }
  ]
});

MOCK_HANDLERS.getDashPending = () => ({
  success: true,
  kanban: { total: 18, open: 11, done: 7, blocked: 2, overdue: [{ title: 'Fix login bug' }], dueToday: [{ title: 'Deploy v2.1' }] },
  recentEntries: [
    { date: TODAY.slice(5), employee: 'Nishant', report: 'Daily Production', component: 'Line A', status: 'Done', entryType: 'MISReport', late: false, isProxy: false, submittedBy: '' },
    { date: TODAY.slice(5), employee: 'Ravi', report: 'Quality Check', component: 'QC-1', status: 'Pending', entryType: 'MISReport', late: true, isProxy: false, submittedBy: '' },
    { date: TODAY.slice(5), employee: 'Priya', report: 'Inventory', component: 'Warehouse', status: 'Done', entryType: 'DataUpdate', late: false, isProxy: true, submittedBy: 'admin@example.com' }
  ]
});

// ── MIS Form ──
MOCK_HANDLERS.getReportList = () => [
  { name: 'Daily Production', deadline: '10:00', primary: 'Line Manager', frequency: 'Daily', dueToday: true },
  { name: 'Quality Check', deadline: '12:00', primary: 'QC Lead', frequency: 'Daily', dueToday: true },
  { name: 'Inventory Update', deadline: '14:00', primary: 'Warehouse', frequency: 'Weekly', dueToday: false }
];

MOCK_HANDLERS.getComponentsForReport = (report) => [
  { name: 'Component A', assignee: 'Ravi', minCount: 5, lastStatus: 'Done', lastCount: 12, lastRemarks: '' },
  { name: 'Component B', assignee: 'Priya', minCount: 0, lastStatus: 'Pending', lastCount: 0, lastRemarks: 'Waiting on data' },
  { name: 'Component C', assignee: '', minCount: 10, lastStatus: 'Done', lastCount: 15, lastRemarks: '' },
  { name: 'Component D', assignee: 'Nishant', minCount: 0, lastStatus: 'Skip', lastCount: 0, lastRemarks: 'Holiday' }
];

MOCK_HANDLERS.submitMISEntries = (p) => ({ success: true, message: 'Saved ' + (p.entries||[]).length + ' entries!\nDone: 3 Pending: 1 Skip: 0' });

// ── Data Update ──
MOCK_HANDLERS.getCommodityList = () => ['Coffee', 'Tea', 'Sugar', 'Wheat'];

MOCK_HANDLERS.getTypeListForCommodity = (c) => {
  const m = { Coffee: ['Arabica','Robusta'], Tea: ['Green','Black','Oolong'], Sugar: ['Raw','Refined'], Wheat: ['HRW','SRW'] };
  return m[c] || ['Type A','Type B'];
};

MOCK_HANDLERS.getFactorsForCommodityType = (c, t) => [
  { factor: 'Price', mode: 'Manual', source: 'Bloomberg', lastStatus: 'Done', lastRemarks: '' },
  { factor: 'Volume', mode: 'API', source: 'Reuters', lastStatus: 'Pending', lastRemarks: 'API down' },
  { factor: 'Quality Index', mode: 'Manual', source: 'Lab Report', lastStatus: 'Done', lastRemarks: '' }
];

MOCK_HANDLERS.submitDataUpdate = (p) => ({ success: true, message: 'Saved ' + (p.factors||[]).length + ' factors!' });

// ── Tasks (Daily / Weekly / Monthly) ──
MOCK_HANDLERS.getTaskList = () => ({
  dailyTasks: [
    { name: 'Morning standup', assignee: 'All', priority: 'High', lastStatus: '', lastRemarks: '' },
    { name: 'Email follow-ups', assignee: 'Nishant', priority: 'Medium', lastStatus: '', lastRemarks: '' },
    { name: 'Check MIS reports', assignee: 'Nishant', priority: 'High', lastStatus: 'Done', lastRemarks: 'All clear' },
    { name: 'Update data feeds', assignee: 'Ravi', priority: 'Medium', lastStatus: '', lastRemarks: '' }
  ],
  weeklyTasks: [
    { name: 'Weekly report prep', assignee: 'Priya', priority: 'Low', lastStatus: '', lastRemarks: '' },
    { name: 'Team sync meeting', assignee: 'All', priority: 'High', lastStatus: '', lastRemarks: '' },
    { name: 'Code review backlog', assignee: 'Nishant', priority: 'Medium', lastStatus: '', lastRemarks: '' }
  ],
  monthlyTasks: [
    { name: 'Monthly analytics review', assignee: 'Nishant', priority: 'High', lastStatus: '', lastRemarks: '' },
    { name: 'Invoice processing', assignee: 'Admin', priority: 'Medium', lastStatus: '', lastRemarks: '' },
    { name: 'Performance reports', assignee: 'All', priority: 'Low', lastStatus: '', lastRemarks: '' }
  ]
});

MOCK_HANDLERS.submitTaskEntries = (p) => {
  const tasks = p.tasks || [];
  const daily = tasks.filter(t => t.frequency === 'Daily').length;
  const weekly = tasks.filter(t => t.frequency === 'Weekly').length;
  const monthly = tasks.filter(t => t.frequency === 'Monthly').length;
  return { success: true, message: 'Saved ' + tasks.length + ' tasks! (D:' + daily + ' W:' + weekly + ' M:' + monthly + ')' };
};

// ── Kanban ──
const MOCK_TASKS = [
  { id:'T1', title:'Fix login bug', desc:'Users getting 403', assignedTo:'ravi@example.com', assignedToName:'Ravi', status:'Assigned', priority:'High', dueDate: TODAY, createdBy:'admin@example.com', tags:'bug,urgent', sprintId:'SP1', storyPoints:3, comments:[], dept:'Engineering', dependsOn:[], blockedReason:'' },
  { id:'T2', title:'Deploy v2.1', desc:'Production deployment', assignedTo:'priya@example.com', assignedToName:'Priya', status:'In Progress', priority:'High', dueDate: TODAY, createdBy:'admin@example.com', tags:'deploy', sprintId:'SP1', storyPoints:5, comments:[{by:'Priya',text:'Starting now',at:new Date().toISOString()}], dept:'DevOps', dependsOn:['T1'], blockedReason:'' },
  { id:'T3', title:'Write unit tests', desc:'Cover auth module', assignedTo:'admin@example.com', assignedToName:'Nishant', status:'Under Review', priority:'Medium', dueDate:'', createdBy:'admin@example.com', tags:'testing', sprintId:'SP1', storyPoints:2, comments:[], dept:'Engineering', dependsOn:[], blockedReason:'' },
  { id:'T4', title:'Update docs', desc:'API documentation refresh', assignedTo:'ravi@example.com', assignedToName:'Ravi', status:'Done', priority:'Low', dueDate:'', createdBy:'admin@example.com', tags:'docs', sprintId:'', storyPoints:1, comments:[], dept:'Engineering', dependsOn:[], blockedReason:'' },
  { id:'T5', title:'Database migration', desc:'Blocked by infra team', assignedTo:'priya@example.com', assignedToName:'Priya', status:'Blocked', priority:'High', dueDate:'2026-04-20', createdBy:'admin@example.com', tags:'infra', sprintId:'SP1', storyPoints:8, comments:[], dept:'DevOps', dependsOn:[], blockedReason:'Waiting on AWS approval' },
  { id:'T6', title:'Design new dashboard', desc:'Redesign KPI cards', assignedTo:'admin@example.com', assignedToName:'Nishant', status:'Assigned', priority:'Medium', dueDate:'2026-05-05', createdBy:'admin@example.com', tags:'design,ui', sprintId:'', storyPoints:3, comments:[], dept:'Design', dependsOn:[], blockedReason:'' }
];

MOCK_HANDLERS.getKanbanShell = () => {
  const counts = {}; ['Assigned','In Progress','Under Review','Done','Blocked'].forEach(s => { counts[s] = MOCK_TASKS.filter(t=>t.status===s).length; });
  return {
    success: true, counts,
    sprints: [{ id:'SP1', name:'Sprint 12', startDate:'2026-04-21', endDate:'2026-05-04', status:'Active', goal:'Ship v2.1' }],
    assignees: [...new Set(MOCK_TASKS.map(t=>t.assignedTo))],
    tags: [...new Set(MOCK_TASKS.flatMap(t=>(t.tags||'').split(',').map(x=>x.trim()).filter(Boolean)))],
    sprintVelocity: { sprint:{name:'Sprint 12'}, pct:45, doneTasks:2, totalTasks:5, donePoints:6, totalPoints:19 }
  };
};

MOCK_HANDLERS.getKanbanColumn = (status) => ({
  success: true, tasks: MOCK_TASKS.filter(t => t.status === status)
});

MOCK_HANDLERS.createKanbanTask = (p) => {
  const id = 'T' + Date.now();
  MOCK_TASKS.push({ ...p, id, status:'Assigned', assignedToName: p.assignedTo.split('@')[0], createdBy:'admin@example.com', comments:[], blockedReason:'' });
  return { success:true, id };
};

MOCK_HANDLERS.updateKanbanTask = (p) => {
  const t = MOCK_TASKS.find(x=>x.id===p.id);
  if(t){ Object.assign(t, p); return {success:true}; }
  return {success:false, message:'Not found'};
};

MOCK_HANDLERS.deleteKanbanTask = (id) => { const i=MOCK_TASKS.findIndex(t=>t.id===id); if(i>=0){MOCK_TASKS.splice(i,1);return{success:true};} return{success:false}; };

MOCK_HANDLERS.bulkMoveKanban = (ids, status, reason) => {
  let moved = 0;
  ids.forEach(id => { const t=MOCK_TASKS.find(x=>x.id===id); if(t){t.status=status;if(reason)t.blockedReason=reason;moved++;} });
  return { success:true, moved, skipped:[] };
};

MOCK_HANDLERS.addTaskComment = (id, text) => {
  let t = MOCK_TASKS.find(x=>x.id===id);
  if (!t && typeof MOCK_KANBAN !== 'undefined') t = MOCK_KANBAN.find(x=>x.id===id);
  if(t){if(!t.comments)t.comments=[];t.comments.push({by:'Nishant Admin',text,at:new Date().toISOString()});return{success:true};}
  return{success:false};
};

// ── Admin ──
const MOCK_USERS = [
  { email:'admin@example.com', name:'Nishant Admin', role:'SuperAdmin', dept:'Research', active:true, lastLogin:TODAY, totalEntries:156 },
  { email:'ravi@example.com', name:'Ravi Kumar', role:'Manager', dept:'Engineering', active:true, lastLogin:TODAY, totalEntries:89 },
  { email:'priya@example.com', name:'Priya Sharma', role:'Teammate', dept:'DevOps', active:true, lastLogin:'2026-04-26', totalEntries:64 },
  { email:'amit@example.com', name:'Amit Patel', role:'Teammate', dept:'Research', active:false, lastLogin:'2026-04-10', totalEntries:23 }
];

MOCK_HANDLERS.getAllUsers = () => ({ success:true, data: MOCK_USERS });
MOCK_HANDLERS.addUser = () => ({ success:true });
MOCK_HANDLERS.updateUser = () => ({ success:true });
MOCK_HANDLERS.removeUser = (email) => { const i=MOCK_USERS.findIndex(u=>u.email===email); if(i>=0){MOCK_USERS.splice(i,1);return{success:true};} return{success:false,message:'Not found'}; };

MOCK_HANDLERS.getSettings = () => ({
  windowStart:'08:00', windowEnd:'20:00', managerEmail:'ravi@example.com',
  escalateDays:3, lockDuplicate:true, requireRemarks:true,
  slackWebhookUrl:'', chatWebhookUrl:'', superAdminEmail:'admin@example.com',
  superEscalateDays:2, backupFolderId:'', webhookApiKey:''
});
MOCK_HANDLERS.saveSettings = () => ({ success:true });
MOCK_HANDLERS.setupTriggers = () => ({ success:true, message:'Triggers installed (mock)' });

// ── Control Center ──
MOCK_HANDLERS.getControlCenterUsers = () => ({
  success:true, data: MOCK_USERS,
  modules: { mis:true, du:true, task:true, kanban:true, crossVal:true, analytics:true, audit:true },
  labels: { mis:'MIS Reports', du:'Data Update', task:'Tasks', kanban:'Kanban Board', crossVal:'Research', analytics:'Analytics', audit:'Audit Trail' }
});
MOCK_HANDLERS.bulkSetActive = (emails, active) => ({ success:true, changed: emails.length });
MOCK_HANDLERS.saveModuleToggles = () => ({ success:true });
MOCK_HANDLERS.requestAmend = () => ({ success:true, message:'Entry unlocked (mock)' });
MOCK_HANDLERS.bulkAmendEntries = () => ({ success:true, count:3 });
MOCK_HANDLERS.toggleDuplicateLock = () => ({ success:true });
MOCK_HANDLERS.triggerAlert = (name) => ({ success:true, message: name + ' triggered (mock)' });

// ── Research ──
MOCK_HANDLERS.getEntriesAwaitingValidation = () => ({
  success:true, data:[
    { logId:'LOG001', date:TODAY, employee:'Ravi', entryType:'DataUpdate', topic:'Coffee::Arabica', subTopic:'Price', sourceUrl:'https://example.com', confidence:'High' },
    { logId:'LOG002', date:TODAY, employee:'Priya', entryType:'DataUpdate', topic:'Tea::Green', subTopic:'Volume', sourceUrl:'', confidence:'Medium' }
  ]
});
MOCK_HANDLERS.validateEntry = () => ({ success:true, message:'Entry validated (mock)' });
MOCK_HANDLERS.getCoverageHeatmap = () => ({
  success:true, cells:[
    { topic:'Coffee::Arabica', subTopic:'Price', coverage:92, done:23, total:25, lastDate:'27-Apr', stale:false },
    { topic:'Coffee::Arabica', subTopic:'Volume', coverage:64, done:16, total:25, lastDate:'25-Apr', stale:false },
    { topic:'Tea::Green', subTopic:'Quality', coverage:30, done:3, total:10, lastDate:'15-Apr', stale:true }
  ]
});
MOCK_HANDLERS.getOutlierAlerts = () => ({ success:true, data:[
  { date:TODAY, employee:'Ravi', topic:'Coffee', subTopic:'Price', value:245, mean:180, deviation:36 }
]});
MOCK_HANDLERS.getDataFreshness = () => ({ success:true, data:[
  { topic:'Sugar::Raw', subTopic:'Price', lastDoneDate:'2026-04-15', ageDays:13, sourceUrl:'https://example.com' }
]});
MOCK_HANDLERS.getResearcherAccuracy = () => ({ success:true, score:87, total:156, amended:8, outliers:3, amendRatePct:5, outlierRatePct:2, email:'admin@example.com' });
MOCK_HANDLERS.getWorkloadDistribution = () => ({ success:true, data:[
  { name:'Ravi', open:5, done:12, blocked:1, overdue:1, points:18 },
  { name:'Priya', open:3, done:8, blocked:0, overdue:0, points:11 },
  { name:'Nishant', open:2, done:15, blocked:0, overdue:0, points:8 }
]});
MOCK_HANDLERS.getDataLineage = () => ({ success:true, revisions:3, topic:'Coffee::Arabica', subTopic:'Price', data:[
  { timestamp:'28-Apr 09:15', researcher:'Ravi', status:'Done', dataCount:245, sourceUrl:'https://example.com', confidence:'High', validatedBy:'Priya', rowStatus:'Active', isProxy:false },
  { timestamp:'27-Apr 10:00', researcher:'Ravi', status:'Done', dataCount:180, sourceUrl:'https://example.com', confidence:'Medium', validatedBy:'', rowStatus:'Amended', isProxy:false }
]});

// ── Analytics ──
MOCK_HANDLERS.getKpiBreakdown = () => ({ success:true, doneRate:72, pendingRate:20, lateRate:8, slaBreach:3, total:200, counts:{done:144,pending:40,skip:12,late:16} });
MOCK_HANDLERS.getSlaBreaches = () => ({ success:true, data:[
  { topic:'Daily Production', subTopic:'Line A', breaches:5, lastBreach:'27-Apr', employees:'Ravi, Priya' }
]});
MOCK_HANDLERS.getPendingAnalysis = () => ({ success:true, data:[
  { topic:'Quality Check', subTopic:'QC-2', pending:8, done:2, lastDone:'20-Apr', lastPending:'27-Apr', pendingRate:80 }
]});
MOCK_HANDLERS.getCommodityComparison = (c) => ({
  success:true,
  today:    { date:'Today', total:12, done:8, pending:3, skip:1 },
  yesterday:{ date:'Yesterday', total:10, done:7, pending:2, skip:1 },
  lastWeek: { date:'Last Week', total:15, done:11, pending:3, skip:1 }
});
MOCK_HANDLERS.exportEntriesCsv = () => ({ success:true, count:25, csv:'date,employee,report\n2026-04-28,Nishant,Daily Production' });
MOCK_HANDLERS.exportEntriesPdf = () => ({ success:true, count:0, message:'No rows match filter' });

// ── Audit ──
MOCK_HANDLERS.getAuditActions = () => ({ success:true, data:['CREATE_USER','UPDATE_USER','DELETE_USER','SUBMIT_MIS','AMEND','TOGGLE_LOCK'] });
MOCK_HANDLERS.getAuditLog = () => ({ success:true, data:[
  { timestamp:'28-Apr 09:30', actor:'admin@example.com', action:'SUBMIT_MIS', targetType:'MISReport', targetId:'LOG0042', before:'', after:'Daily Production: 4 entries', isProxy:false },
  { timestamp:'27-Apr 18:00', actor:'admin@example.com', action:'UPDATE_USER', targetType:'User', targetId:'ravi@example.com', before:'role=Teammate', after:'role=Manager', isProxy:false },
  { timestamp:'27-Apr 10:15', actor:'ravi@example.com', action:'CREATE_USER', targetType:'User', targetId:'amit@example.com', before:'', after:'Added as Teammate', isProxy:false }
]});

// ── Daily Roadster ──
const MOCK_ROADSTER = [
  { role: 'AW',          employee: 'Nishant Admin', frequency: 'Daily',   remark: 'Check all AW reports',     status: 'Pending' },
  { role: 'Currency',    employee: 'Ravi Kumar',    frequency: 'Daily',   remark: 'USD/INR + EUR/INR update', status: 'Done' },
  { role: 'Agri-comm',   employee: 'Nishant Admin', frequency: 'Weekly',  remark: 'Monday review only',       status: 'Pending' },
  { role: 'Metals',      employee: 'Priya Sharma',  frequency: 'Daily',   remark: '',                         status: 'Pending' },
  { role: 'Energy',      employee: 'Nishant Admin', frequency: 'Monthly', remark: 'End-of-month summary',     status: 'Done' }
];

MOCK_HANDLERS.getRoadsterTasks = () => ({ success: true, tasks: MOCK_ROADSTER.map(t => ({...t})) });

MOCK_HANDLERS.updateRoadsterStatus = (role, status) => {
  const t = MOCK_ROADSTER.find(x => x.role === role);
  if (t) { t.status = status; return { success: true, status }; }
  return { success: false, message: 'Role not found: ' + role };
};

// ── Roadster Config (CRUD for Daily_Roadster sheet) ──
MOCK_HANDLERS.getRoadsterConfigList = () => ({
  success: true,
  data: MOCK_ROADSTER.map(t => ({ role: t.role, employee: t.employee, frequency: t.frequency, remark: t.remark }))
});

MOCK_HANDLERS.saveRoadsterConfig = (oldRole, role, employee, frequency, remark) => {
  if (oldRole) {
    const t = MOCK_ROADSTER.find(x => x.role === oldRole);
    if (t) { t.role = role; t.employee = employee; t.frequency = frequency || 'Daily'; t.remark = remark || ''; }
  } else {
    MOCK_ROADSTER.push({ role, employee, frequency: frequency || 'Daily', remark: remark || '', status: 'Pending' });
  }
  return { success: true };
};

MOCK_HANDLERS.deleteRoadsterConfig = (role) => {
  const i = MOCK_ROADSTER.findIndex(x => x.role === role);
  if (i >= 0) { MOCK_ROADSTER.splice(i, 1); return { success: true }; }
  return { success: false, message: 'Not found' };
};

// ── Kanban Mock Data ──
let kNextId = 1007;
const MOCK_KANBAN = [
  { id: 'T1001', title: 'check MIS', desc: 'check MIS', factor: '', priority: 'High', assignedTo: 'pankaj@example.com', assignedToName: 'Pankaj', assignedToList: ['pankaj@example.com'], assignedToNameList: ['Pankaj'], status: 'Under Review', dueDate: TODAY, remark: 'check MIS daily', createdAt: '2026-04-20', createdBy: 'admin@example.com', comments: [{by:'Pankaj',text:'MIS checked, all good',at:'2026-04-28T10:30:00Z'},{by:'Nishant Admin',text:'Approved. Mark as done tomorrow.',at:'2026-04-28T14:15:00Z'}] },
  { id: 'T1002', title: 'Deploy v2.1', desc: 'Production deployment of v2.1', factor: 'DevOps', priority: 'High', assignedTo: 'priya@example.com', assignedToName: 'Priya Sharma', assignedToList: ['priya@example.com'], assignedToNameList: ['Priya Sharma'], status: 'In Progress', dueDate: TODAY, remark: '', createdAt: '2026-04-21', createdBy: 'admin@example.com', comments: [{by:'Priya Sharma',text:'Starting deployment now',at:'2026-04-29T09:00:00Z'}] },
  { id: 'T1003', title: 'Write unit tests', desc: 'Cover auth module with tests', factor: 'QA', priority: 'Medium', assignedTo: 'admin@example.com', assignedToName: 'Nishant Admin', assignedToList: ['admin@example.com'], assignedToNameList: ['Nishant Admin'], status: 'Assigned', dueDate: '', remark: '', createdAt: '2026-04-22', createdBy: 'admin@example.com', comments: [] },
  { id: 'T1004', title: 'Update API docs', desc: 'API documentation refresh', factor: '', priority: 'Low', assignedTo: 'ravi@example.com', assignedToName: 'Ravi Kumar', assignedToList: ['ravi@example.com'], assignedToNameList: ['Ravi Kumar'], status: 'Done', dueDate: '', remark: 'Completed', createdAt: '2026-04-18', createdBy: 'admin@example.com', comments: [{by:'Ravi Kumar',text:'All docs updated',at:'2026-04-27T16:00:00Z'}] },
  { id: 'T1005', title: 'Database migration', desc: 'Schema update v3', factor: 'Infra', priority: 'High', assignedTo: 'priya@example.com', assignedToName: 'Priya Sharma', assignedToList: ['priya@example.com'], assignedToNameList: ['Priya Sharma'], status: 'Blocked', dueDate: '2026-04-20', remark: '', blockedReason: 'Waiting on AWS approval', createdAt: '2026-04-19', createdBy: 'admin@example.com', comments: [] },
  { id: 'T1006', title: 'Design new dashboard', desc: 'Redesign KPI cards', factor: 'Agri-comm', priority: 'Medium', assignedTo: 'admin@example.com', assignedToName: 'Nishant Admin', assignedToList: ['admin@example.com'], assignedToNameList: ['Nishant Admin'], status: 'Assigned', dueDate: '2026-05-05', remark: '', createdAt: '2026-04-25', createdBy: 'admin@example.com', comments: [] }
];

function kanbanByStatus(status) {
  return MOCK_KANBAN.filter(t => t.status === status);
}

MOCK_HANDLERS.getKanbanShell = () => {
  const counts = {};
  ['Assigned','In Progress','Under Review','Done','Blocked'].forEach(s => counts[s] = kanbanByStatus(s).length);
  return {
    success: true,
    counts,
    assignees: [...new Set(MOCK_KANBAN.map(t => t.assignedTo))],
    allUsers: [
      { email: 'admin@example.com', name: 'Nishant Admin' },
      { email: 'ravi@example.com',  name: 'Ravi Kumar' },
      { email: 'priya@example.com', name: 'Priya Sharma' },
      { email: 'pankaj@example.com', name: 'Pankaj' },
      { email: 'amit@example.com',  name: 'Amit Patel' }
    ],
    sprintVelocity: null
  };
};

MOCK_HANDLERS.getKanbanColumn = (status) => ({
  success: true,
  tasks: kanbanByStatus(status)
});

MOCK_HANDLERS.createKanbanTask = (payload) => {
  const assignees = Array.isArray(payload.assignedTo) ? payload.assignedTo : [payload.assignedTo];
  const allUsers = [
    { email: 'admin@example.com', name: 'Nishant Admin' },
    { email: 'ravi@example.com',  name: 'Ravi Kumar' },
    { email: 'priya@example.com', name: 'Priya Sharma' },
    { email: 'pankaj@example.com', name: 'Pankaj' },
    { email: 'amit@example.com',  name: 'Amit Patel' }
  ];
  assignees.forEach(email => {
    const u = allUsers.find(x => x.email === email) || { email, name: email };
    MOCK_KANBAN.push({
      id: 'T' + (kNextId++),
      title: payload.title,
      desc: payload.desc || '',
      factor: payload.factor || '',
      priority: payload.priority || 'Medium',
      assignedTo: email,
      assignedToName: u.name,
      assignedToList: [email],
      assignedToNameList: [u.name],
      status: 'Assigned',
      dueDate: payload.dueDate || '',
      remark: payload.remark || '',
      createdAt: TODAY,
      createdBy: 'admin@example.com'
    });
  });
  return { success: true, message: assignees.length + ' task(s) created' };
};

MOCK_HANDLERS.updateKanbanTask = (payload) => {
  const t = MOCK_KANBAN.find(x => x.id === payload.id);
  if (!t) return { success: false, message: 'Not found' };
  if (payload.title !== undefined)   t.title = payload.title;
  if (payload.desc !== undefined)    t.desc = payload.desc;
  if (payload.factor !== undefined)  t.factor = payload.factor;
  if (payload.priority !== undefined) t.priority = payload.priority;
  if (payload.status !== undefined)  t.status = payload.status;
  if (payload.dueDate !== undefined) t.dueDate = payload.dueDate;
  if (payload.remark !== undefined)  t.remark = payload.remark;
  if (payload.blockedReason)         t.blockedReason = payload.blockedReason;
  if (payload.assignedTo && Array.isArray(payload.assignedTo)) {
    t.assignedToList = payload.assignedTo;
    t.assignedTo = payload.assignedTo.join(',');
  }
  return { success: true };
};

MOCK_HANDLERS.deleteKanbanTask = (id) => {
  const i = MOCK_KANBAN.findIndex(x => x.id === id);
  if (i >= 0) { MOCK_KANBAN.splice(i, 1); return { success: true }; }
  return { success: false, message: 'Not found' };
};

MOCK_HANDLERS.bulkMoveKanban = (ids, status, reason) => {
  let moved = 0;
  ids.forEach(id => {
    const t = MOCK_KANBAN.find(x => x.id === id);
    if (t) { t.status = status; if (reason) t.blockedReason = reason; moved++; }
  });
  return { success: true, moved };
};

MOCK_HANDLERS.getKanbanDashSummary = () => {
  const total = MOCK_KANBAN.length;
  const done = kanbanByStatus('Done').length;
  const blocked = kanbanByStatus('Blocked').length;
  const overdue = MOCK_KANBAN.filter(t => t.dueDate && t.dueDate < TODAY && t.status !== 'Done').length;
  return {
    success: true,
    summary: { total, open: total - done, done, blocked },
    overdue: MOCK_KANBAN.filter(t => t.dueDate && t.dueDate < TODAY && t.status !== 'Done')
      .map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, assignedToName: t.assignedToName }))
  };
};

console.log('✅ Mock data layer loaded — all RPC calls return demo data');

