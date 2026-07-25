const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..');

const jsFiles = [
  'JsCore.html', 'JsDashboard.html', 'JsForms.html', 'JsRoadster.html',
  'JsKanban.html', 'JsRoadsterConfig.html', 'JsAdmin.html',
  'JsControl.html', 'JsResearch.html', 'JsAnalytics.html', 'JsAudit.html'
];

// Read all, strip outer <script></script> tags, combine into single <script>
let combined = '<script>\n';
for (const file of jsFiles) {
  let content = fs.readFileSync(path.join(base, file), 'utf8');
  // Strip opening <script> and closing </script>
  content = content.replace(/^\s*<script>\s*\r?\n?/, '').replace(/\s*<\/script>\s*$/, '');
  combined += `/* ── ${file.replace('.html','')} ──────────────────────────────────── */\n`;
  combined += content.trim() + '\n\n';
}
combined += '</script>\n';

fs.writeFileSync(path.join(base, 'Scripts.html'), combined, 'utf8');
console.log('Scripts.html created (' + jsFiles.length + ' JS files merged)');
console.log('Size:', combined.length, 'chars');
