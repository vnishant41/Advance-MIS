const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..');

const views = [
  { id: 'dashboard', file: 'DashboardView.html' },
  { id: 'mis', file: 'MisFormView.html' },
  { id: 'du', file: 'DuFormView.html' },
  { id: 'task', file: 'TaskFormView.html' },
  { id: 'roadster', file: 'RoadsterView.html' },
  { id: 'kanban', file: 'KanbanView.html' },
  { id: 'research', file: 'ResearchView.html' },
  { id: 'analytics', file: 'AnalyticsView.html' },
  { id: 'roadsterConfig', file: 'RoadsterConfigView.html' },
  { id: 'admin', file: 'AdminView.html' },
  { id: 'control', file: 'ControlView.html' },
  { id: 'audit', file: 'AuditView.html' },
];

let out = '<!-- ── ALL VIEWS (merged) ──────────────────────────────────── -->\n';
for (const v of views) {
  const content = fs.readFileSync(path.join(base, v.file), 'utf8');
  out += `<div id="${v.id}" class="view">\n${content}</div>\n\n`;
}

fs.writeFileSync(path.join(base, 'Views.html'), out, 'utf8');
console.log('Views.html created (' + views.length + ' views merged)');
