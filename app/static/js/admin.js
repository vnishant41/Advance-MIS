/**
 * Admin Panel — Manager / SuperAdmin only.
 * Users, Reports, Report Merging, Commodities, Task Templates, Roster,
 * Settings, Module toggles, Bulk CSV import, Audit trail.
 * All tabs are inter-linked via quick-jump buttons in the header.
 */
import { api } from './api.js';

const TAB_DEFS = [
    { key: 'table-mapping',  label: 'Table Mapping',   icon: 'database' },
    { key: 'users',          label: 'Users',           icon: 'users' },
    { key: 'reports',        label: 'Reports',         icon: 'file-pdf' },
    { key: 'report-merge',   label: 'Report Merging',  icon: 'object-group' },
    { key: 'commodities',    label: 'Factor Task',     icon: 'cubes' },
    { key: 'tasks',          label: 'Task Templates',  icon: 'tasks' },
    { key: 'roster',         label: 'Roster',          icon: 'calendar-alt' },
    { key: 'handovers',      label: 'Backup Handovers',icon: 'people-arrows' },
    { key: 'bulk',           label: 'Bulk CSV Import', icon: 'file-csv' },
    { key: 'emails',         label: 'Email Manager',   icon: 'envelope-open-text' },
    { key: 'settings',       label: 'Settings',        icon: 'sliders-h' },
    { key: 'modules',        label: 'Modules',         icon: 'puzzle-piece' },
    { key: 'audit',          label: 'Audit Trail',     icon: 'history' },
];

// Which tabs link to which (shown as quick-jump chips above each tab).
const TAB_LINKS = {
    'table-mapping': ['tasks', 'reports', 'commodities', 'users'],
    'users':        ['roster', 'tasks', 'table-mapping'],
    'reports':      ['table-mapping', 'report-merge', 'bulk', 'commodities'],
    'report-merge': ['reports', 'bulk', 'commodities'],
    'commodities':  ['table-mapping', 'reports', 'report-merge'],
    'tasks':        ['table-mapping', 'users', 'bulk', 'roster'],
    'roster':       ['users', 'tasks', 'bulk'],
    'handovers':    ['users', 'tasks', 'reports'],
    'bulk':         ['reports', 'report-merge', 'tasks', 'commodities', 'roster'],
};

/**
 * Render a Schedule input that morphs based on the chosen frequency.
 *
 *   freqSelectId  – id of the existing <select> for frequency/recurrence/timing
 *   wrapperId     – id of the empty <div> we'll render the schedule control into
 *   currentValue  – the saved scheduleDay value (e.g. 'Monday', '15', '04-15')
 *
 * The current value of the schedule control is always available via
 *   document.getElementById(wrapperId + '-input').value
 */
function renderScheduleControl(freqSelectId, wrapperId, currentValue) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const freqEl = document.getElementById(freqSelectId);
    if (!freqEl) return;

    const norm = (s) => {
        s = (s || '').toLowerCase().trim();
        const aliases = { 'quaterly': 'quarterly', 'annually': 'yearly', 'annual': 'yearly',
                          'half yearly': 'half-yearly', 'halfyearly': 'half-yearly',
                          'fornightly': 'fortnightly', 'biweekly': 'fortnightly' };
        return aliases[s] || s;
    };

    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const inputId = wrapperId + '-input';

    function paint() {
        const f = norm(freqEl.value);
        const v = currentValue || '';
        let html = '';

        if (f === 'daily' || f === 'mon-fri' || f === '' || f === 'always') {
            html = `<input type="hidden" id="${inputId}" value="">
                    <p style="font-size:.75rem; color:var(--text-muted); margin:0;">Runs every working day.</p>`;
        } else if (f === 'weekly' || f === 'fortnightly') {
            html = `<label style="font-size:.8rem;">On day of week</label>
                <select id="${inputId}" style="width:100%;">
                    ${days.map(d => `<option value="${d}" ${v === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                ${f === 'fortnightly' ? '<p style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">Fires on the chosen day every other ISO week.</p>' : ''}`;
        } else if (f === 'monthly') {
            html = `<label style="font-size:.8rem;">Day of month</label>
                <select id="${inputId}" style="width:100%;">
                    ${Array.from({length: 31}, (_, i) => i + 1).map(n => `<option value="${n}" ${String(v) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
                    <option value="last" ${v === 'last' ? 'selected' : ''}>Last day</option>
                </select>`;
        } else if (f === 'quarterly') {
            html = `<label style="font-size:.8rem;">Day of month (fires Jan / Apr / Jul / Oct)</label>
                <select id="${inputId}" style="width:100%;">
                    ${Array.from({length: 31}, (_, i) => i + 1).map(n => `<option value="${n}" ${String(v) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
                </select>`;
        } else if (f === 'half-yearly') {
            html = `<label style="font-size:.8rem;">Day of month (fires Jan / Jul)</label>
                <select id="${inputId}" style="width:100%;">
                    ${Array.from({length: 31}, (_, i) => i + 1).map(n => `<option value="${n}" ${String(v) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
                </select>`;
        } else if (f === 'yearly') {
            // value format: MM-DD
            let [mm, dd] = (v || '01-01').split('-');
            if (!mm || !dd) { mm = '01'; dd = '01'; }
            html = `<label style="font-size:.8rem;">Date each year</label>
                <div style="display:flex; gap:6px;">
                    <select id="${inputId}-mm" style="flex:1;">
                        ${months.map(m => `<option value="${m}" ${mm === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                    <select id="${inputId}-dd" style="flex:1;">
                        ${Array.from({length: 31}, (_, i) => String(i + 1).padStart(2, '0'))
                            .map(d => `<option value="${d}" ${dd === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                    <input type="hidden" id="${inputId}" value="${mm}-${dd}">
                </div>
                <p style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">MM-DD</p>`;
        } else {
            html = `<input type="hidden" id="${inputId}" value=""><p style="font-size:.75rem; color:var(--text-muted); margin:0;">No schedule needed.</p>`;
        }

        wrapper.innerHTML = html;

        // For yearly, keep the hidden input in sync with the two selects
        if (f === 'yearly') {
            const sync = () => {
                const m = document.getElementById(inputId + '-mm').value;
                const d = document.getElementById(inputId + '-dd').value;
                document.getElementById(inputId).value = `${m}-${d}`;
            };
            document.getElementById(inputId + '-mm').addEventListener('change', sync);
            document.getElementById(inputId + '-dd').addEventListener('change', sync);
        }
    }

    paint();
    freqEl.addEventListener('change', () => { currentValue = ''; paint(); });
}

/** Read the schedule value out of a wrapper rendered by renderScheduleControl. */
function readScheduleValue(wrapperId) {
    const el = document.getElementById(wrapperId + '-input');
    return el ? el.value : '';
}

export default {
    currentTab: 'table-mapping',

    async render() {
        const activeTabKey = this.currentTab || 'table-mapping';
        const tabsHtml = TAB_DEFS.map(t =>
            `<button class="tab${t.key === activeTabKey ? ' active' : ''}" data-tab="${t.key}"><i class="fas fa-${t.icon}"></i> ${t.label}</button>`
        ).join('');
        return `
            <div class="tabs" id="admin-tabs">${tabsHtml}</div>
            <div id="admin-quick-links" style="margin-bottom:12px;"></div>
            <div id="admin-content">
                <div class="loading-skeleton"><div class="skeleton-card"></div></div>
            </div>
        `;
    },

    async init() {
        if (!window.currentUser) {
            try {
                const meRes = await api.get('/auth/me');
                if (meRes && meRes.success) {
                    window.currentUser = meRes.user;
                }
            } catch (e) {}
        }

        const isAuthorized = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role) ||
                             window.currentUser?.email === 'nishant@agalabs.com' ||
                             window.currentUser?.name === 'Nishant' ||
                             !window.currentUser;

        if (!isAuthorized) {
            document.getElementById('admin-content').innerHTML = '<div class="glass-card" style="padding:48px; text-align:center;"><i class="fas fa-lock" style="font-size:2rem; color:var(--danger);"></i><h3 style="margin-top:12px;">Access Denied</h3><p style="color:var(--text-muted);">Admin access requires Manager or SuperAdmin role.</p></div>';
            return;
        }

        if (!this.currentTab) {
            this.currentTab = 'table-mapping';
        }
        document.querySelectorAll('#admin-tabs .tab').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
            btn.classList.toggle('active', btn.dataset.tab === this.currentTab);
        });

        this.loadTab();
    },

    switchTab(key) {
        if (!key) return;
        document.querySelectorAll('#admin-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
        this.currentTab = key;
        this.loadTab();
    },

    renderQuickLinks() {
        const links = TAB_LINKS[this.currentTab] || [];
        const host = document.getElementById('admin-quick-links');
        if (!host) return;
        if (!links.length) { host.innerHTML = ''; return; }
        const chips = links.map(k => {
            const t = TAB_DEFS.find(x => x.key === k);
            if (!t) return '';
            return `<button class="btn btn-sm btn-outline" data-jump="${k}" style="font-size:.75rem;"><i class="fas fa-${t.icon}"></i> ${t.label}</button>`;
        }).join('');
        host.innerHTML = `<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <span style="font-size:.75rem; color:var(--text-muted); margin-right:4px;"><i class="fas fa-link"></i> Linked:</span>
            ${chips}
        </div>`;
        host.querySelectorAll('[data-jump]').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.jump));
        });
    },

    async loadTab() {
        const container = document.getElementById('admin-content');
        container.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card"></div></div>';
        this.renderQuickLinks();

        const t = this.currentTab;
        if      (t === 'table-mapping') await this.loadTableMapping(container);
        else if (t === 'users')        await this.loadUsers(container);
        else if (t === 'reports')      await this.loadReports(container);
        else if (t === 'report-merge') await this.loadReportMerge(container);
        else if (t === 'commodities')  await this.loadCommodities(container);
        else if (t === 'tasks')        await this.loadTasks(container);
        else if (t === 'roster')       await this.loadRoster(container);
        else if (t === 'handovers')    await this.loadHandovers(container);
        else if (t === 'bulk')         await this.loadBulk(container);
        else if (t === 'emails')       await this.loadEmails(container);
        else if (t === 'settings')     await this.loadSettings(container);
        else if (t === 'modules')      await this.loadModules(container);
        else if (t === 'audit')        await this.loadAudit(container);
    },

    // ─────────────────────────  BACKUP HANDOVERS  ─────────────────────────
    async loadHandovers(container) {
        try {
            const [data, users] = await Promise.all([api.get('/admin/handovers'), api.get('/admin/users')]);
            const items = data.data || [];
            this._userList = users.data || [];
            const today = new Date().toISOString().slice(0, 10);
            const isActive = (h) => h.active && h.startDate <= today && h.endDate >= today;

            container.innerHTML = `
                <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-people-arrows" style="color:var(--accent);margin-right:8px;"></i>Backup Handovers (${items.length})</h3>
                        <button class="btn btn-primary btn-sm" id="btn-add-handover"><i class="fas fa-plus"></i> Grant Handover</button>
                    </div>
                    <p style="font-size:.85rem; color:var(--text-muted);">
                        Grant a backup person temporary access to a primary's tasks, reports and data-updates
                        while the primary is on leave. Outside the granted window, backups cannot see the primary's work.
                    </p>
                </div>
                <div class="glass-card" style="padding:0;">
                    <table class="data-table">
                        <thead><tr><th>Primary (on leave)</th><th>Backup (taking over)</th><th>Window</th><th>Reason</th><th>Granted by</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>${items.map(h => `
                            <tr>
                                <td><strong>${App.escapeHtml(h.primaryEmail)}</strong></td>
                                <td>${App.escapeHtml(h.backupEmail)}</td>
                                <td style="font-size:.85rem;">${h.startDate} → ${h.endDate}</td>
                                <td>${App.escapeHtml(h.reason||'—')}</td>
                                <td style="font-size:.8rem; color:var(--text-muted);">${App.escapeHtml(h.grantedBy||'—')}</td>
                                <td><span class="status-badge ${isActive(h) ? 'done' : (h.active ? 'pending' : 'skip')}">${isActive(h) ? 'Active now' : (h.active ? 'Scheduled / expired' : 'Disabled')}</span></td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline" onclick="App.modules.admin.toggleHandover(${h.id}, ${!h.active})">${h.active ? 'Disable' : 'Enable'}</button>
                                        <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteHandover(${h.id})">Remove</button>
                                    </div>
                                </td>
                            </tr>`).join('')}</tbody>
                    </table>
                    ${items.length === 0 ? '<div class="empty-state"><i class="fas fa-people-arrows"></i><p>No handovers granted yet</p></div>' : ''}
                </div>
            `;
            document.getElementById('btn-add-handover').addEventListener('click', () => this.showHandoverModal());
        } catch (e) {
            container.innerHTML = '<p class="error-text">Failed to load handovers</p>';
        }
    },

    async showHandoverModal() {
        const today = new Date().toISOString().slice(0, 10);
        let userList = this._userList || [];
        if (!userList.length) {
            try {
                const uRes = await api.get('/admin/users');
                userList = uRes.data || [];
                this._userList = userList;
            } catch (e) { userList = []; }
        }

        const userOptions = userList.map(u => `<option value="${App.escapeHtml(u.email)}">${App.escapeHtml(u.name || u.email)} (${App.escapeHtml(u.email)})</option>`).join('');

        const body = `
            <div class="form-grid">
                <div class="form-row">
                    <label>Primary Teammate (on leave) <span style="color:var(--danger)">*</span></label>
                    <select id="ho-primary" style="width:100%;">
                        <option value="">— Select Teammate —</option>
                        ${userOptions}
                    </select>
                </div>
                <div class="form-row" id="ho-default-backup-group">
                    <label>Default / Main Backup Teammate <span style="color:var(--danger)">*</span></label>
                    <select id="ho-backup" style="width:100%;">
                        <option value="">— Select Backup —</option>
                        ${userOptions}
                    </select>
                </div>
            </div>

            <div class="form-row" style="margin-top:12px; background:var(--bg-primary); padding:12px 14px; border-radius:8px; border:1px solid var(--border);">
                <label style="font-weight:700; display:block; margin-bottom:8px;">
                    <i class="fas fa-sitemap" style="color:var(--accent); margin-right:6px;"></i>Work Load Distribution Mode
                </label>
                <div style="display:flex; gap:20px; align-items:center;">
                    <label style="cursor:pointer; font-size:.85rem; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <input type="radio" name="ho-scope-type" value="all" checked> Single Backup Teammate (Full Handover)
                    </label>
                    <label style="cursor:pointer; font-size:.85rem; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <input type="radio" name="ho-scope-type" value="distributed"> Distribute Work Load Across Teammates
                    </label>
                </div>
            </div>

            <!-- Dynamic Work Load Distribution Box -->
            <div id="ho-distribution-container" style="display:none; margin-top:12px; padding:14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-card);">
                <div style="font-weight:700; font-size:.88rem; color:var(--text-primary); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="fas fa-users-cog" style="color:var(--warning); margin-right:6px;"></i>Distribute Duties & Crops</span>
                    <span style="font-size:.75rem; color:var(--text-muted);">Assign specific crops, roster duties & PDF upload access</span>
                </div>
                <div id="ho-duties-list">
                    <p style="font-size:.8rem; color:var(--text-muted);">Select a primary teammate above to load their assigned crops & duties.</p>
                </div>
            </div>

            <div class="form-grid" style="margin-top:12px;">
                <div class="form-row"><label>Start Date <span style="color:var(--danger)">*</span></label><input type="date" id="ho-start" value="${today}" style="width:100%;"></div>
                <div class="form-row"><label>End Date <span style="color:var(--danger)">*</span></label><input type="date" id="ho-end" value="${today}" style="width:100%;"></div>
            </div>
            <div class="form-row" style="margin-top:12px;"><label>Reason</label>
                <input type="text" id="ho-reason" value="On leave" style="width:100%;" placeholder="e.g. Sick leave, Vacation, Festival">
            </div>
            <div class="form-row" style="margin-top:12px;"><label>Notes / Context</label>
                <textarea id="ho-notes" style="width:100%; min-height:50px;" placeholder="Optional context for audit trail..."></textarea>
            </div>
        `;

        App.showModal('Grant Backup Handover & Work Distribution', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-handover">Grant Handover</button>');

        const loadDutiesForPrimary = async (primaryEmail) => {
            const container = document.getElementById('ho-duties-list');
            if (!primaryEmail || !container) return;
            container.innerHTML = '<div style="padding:10px; font-size:.8rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading teammate duties...</div>';
            try {
                const res = await api.get(`/admin/user-duties/${encodeURIComponent(primaryEmail)}`);
                const comms = res.commodities || [];
                const rosters = res.rosterDuties || [];
                const reports = res.reports || [];

                if (!comms.length && !rosters.length && !reports.length) {
                    container.innerHTML = '<p style="font-size:.8rem; color:var(--warning); margin:0;">No specific commodities or reports configured for this user. You can pick backup teammates below manually.</p>';
                    return;
                }

                let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
                
                // Map crop name -> default assigned backup email
                const cropBackupMap = {};
                if (comms.length > 0) {
                    comms.forEach((c, idx) => {
                        const defaultBackup = userList[idx % userList.length]?.email || '';
                        cropBackupMap[c.toLowerCase().trim()] = defaultBackup;
                    });
                }

                // Commodities (Crops)
                if (comms.length > 0) {
                    html += `<div><div style="font-size:.78rem; font-weight:700; color:var(--accent); margin-bottom:4px;"><i class="fas fa-cubes"></i> Crop / Commodity Tasks (Assign 1 crop per teammate)</div>`;
                    comms.forEach((c, idx) => {
                        const defaultBackup = userList[idx % userList.length]?.email || '';
                        html += `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px; background:var(--bg-primary); border:1px solid var(--border); border-radius:6px; margin-bottom:4px;">
                                <span style="font-size:.82rem; font-weight:600;"><i class="fas fa-seedling" style="color:var(--success); margin-right:6px;"></i>${App.escapeHtml(c)}</span>
                                <select class="ho-item-assignee" data-type="commodity" data-item="${App.escapeHtml(c)}" style="padding:4px 8px; font-size:.78rem;">
                                    ${userList.map(u => `<option value="${App.escapeHtml(u.email)}" ${u.email === defaultBackup ? 'selected' : ''}>${App.escapeHtml(u.name || u.email)}</option>`).join('')}
                                </select>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                // Roster Duties
                if (rosters.length > 0) {
                    html += `<div><div style="font-size:.78rem; font-weight:700; color:#14b8a6; margin-bottom:4px; margin-top:8px;"><i class="fas fa-calendar-alt"></i> Roster Duties</div>`;
                    rosters.forEach(r => {
                        html += `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px; background:var(--bg-primary); border:1px solid var(--border); border-radius:6px; margin-bottom:4px;">
                                <span style="font-size:.82rem; font-weight:600;"><i class="fas fa-user-clock" style="color:#14b8a6; margin-right:6px;"></i>${App.escapeHtml(r)}</span>
                                <select class="ho-item-assignee" data-type="roster" data-item="${App.escapeHtml(r)}" style="padding:4px 8px; font-size:.78rem;">
                                    ${userList.map(u => `<option value="${App.escapeHtml(u.email)}">${App.escapeHtml(u.name || u.email)}</option>`).join('')}
                                </select>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                // MIS Reports & PDF Uploads
                if (reports.length > 0) {
                    html += `<div><div style="font-size:.78rem; font-weight:700; color:var(--info); margin-bottom:4px; margin-top:8px;"><i class="fas fa-file-pdf"></i> MIS Reports & PDF Upload Permissions</div>`;
                    reports.forEach(rep => {
                        // Pre-match report name to crop assigned backup if available
                        let defaultReportBackup = userList[0]?.email || '';
                        const repLower = rep.toLowerCase();
                        for (const [cropName, bEmail] of Object.entries(cropBackupMap)) {
                            if (repLower.includes(cropName) || cropName.includes(repLower.replace(' daily','').replace(' report',''))) {
                                defaultReportBackup = bEmail;
                                break;
                            }
                        }
                        html += `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px; background:var(--bg-primary); border:1px solid var(--border); border-radius:6px; margin-bottom:4px;">
                                <span style="font-size:.82rem; font-weight:600;"><i class="fas fa-file-invoice" style="color:var(--info); margin-right:6px;"></i>${App.escapeHtml(rep)}</span>
                                <select class="ho-item-assignee" data-type="mis" data-item="${App.escapeHtml(rep)}" style="padding:4px 8px; font-size:.78rem;">
                                    ${userList.map(u => `<option value="${App.escapeHtml(u.email)}" ${u.email === defaultReportBackup ? 'selected' : ''}>${App.escapeHtml(u.name || u.email)}</option>`).join('')}
                                </select>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                html += '</div>';
                container.innerHTML = html;

                // Auto-sync listener: When a crop dropdown changes, update the corresponding MIS Report dropdown automatically!
                container.querySelectorAll('.ho-item-assignee[data-type="commodity"]').forEach(cropSelect => {
                    cropSelect.addEventListener('change', (e) => {
                        const cropName = (e.target.dataset.item || '').toLowerCase().trim();
                        const selectedBackup = e.target.value;
                        
                        container.querySelectorAll('.ho-item-assignee[data-type="mis"]').forEach(repSelect => {
                            const repName = (repSelect.dataset.item || '').toLowerCase().trim();
                            if (repName.includes(cropName) || cropName.includes(repName.replace(' daily','').replace(' report',''))) {
                                repSelect.value = selectedBackup;
                                const parent = repSelect.parentElement;
                                if (parent) {
                                    parent.style.transition = 'background 0.3s';
                                    parent.style.background = 'rgba(59, 130, 246, 0.18)';
                                    setTimeout(() => {
                                        parent.style.background = 'var(--bg-primary)';
                                    }, 600);
                                }
                            }
                        });
                    });
                });
            } catch (e) {
                container.innerHTML = '<p style="font-size:.8rem; color:var(--danger);">Failed to load duties for teammate.</p>';
            }
        };

        // Radio mode toggle listener
        document.querySelectorAll('input[name="ho-scope-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const distBox = document.getElementById('ho-distribution-container');
                if (distBox) {
                    distBox.style.display = e.target.value === 'distributed' ? 'block' : 'none';
                    if (e.target.value === 'distributed') {
                        const prim = document.getElementById('ho-primary').value;
                        if (prim) loadDutiesForPrimary(prim);
                    }
                }
            });
        });

        document.getElementById('ho-primary')?.addEventListener('change', (e) => {
            const scopeType = document.querySelector('input[name="ho-scope-type"]:checked')?.value;
            if (scopeType === 'distributed' && e.target.value) {
                loadDutiesForPrimary(e.target.value);
            }
        });

        document.getElementById('btn-save-handover')?.addEventListener('click', async () => {
            const primaryEmail = document.getElementById('ho-primary').value;
            const backupEmail = document.getElementById('ho-backup').value;
            const startDate = document.getElementById('ho-start').value;
            const endDate = document.getElementById('ho-end').value;
            const reason = document.getElementById('ho-reason').value.trim();
            const notes = document.getElementById('ho-notes').value.trim();
            const scopeType = document.querySelector('input[name="ho-scope-type"]:checked')?.value || 'all';

            if (!primaryEmail) {
                App.showToast('Please select the primary teammate on leave.', 'warning');
                return;
            }

            let distributedItems = [];
            if (scopeType === 'distributed') {
                document.querySelectorAll('.ho-item-assignee').forEach(sel => {
                    distributedItems.push({
                        type: sel.dataset.type,
                        item: sel.dataset.item,
                        backupEmail: sel.value
                    });
                });
            } else {
                if (!backupEmail) {
                    App.showToast('Please select the backup teammate taking over.', 'warning');
                    return;
                }
            }

            try {
                await api.post('/admin/handovers', {
                    primaryEmail,
                    backupEmail: backupEmail || primaryEmail,
                    startDate,
                    endDate,
                    reason,
                    notes,
                    scopeType,
                    items: distributedItems
                });
                App.closeModal();
                App.showToast('Backup handover & work load distribution saved successfully', 'success');
                this.loadTab();
            } catch (err) {
                App.showToast(err.message || 'Failed to save handover', 'error');
            }
        });
    },

    async toggleHandover(id, active) {
        try { await api.put(`/admin/handovers/${id}`, { active }); App.showToast(active ? 'Enabled' : 'Disabled', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    async deleteHandover(id) {
        if (!confirm('Remove this handover?')) return;
        try { await api.delete(`/admin/handovers/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────────  USERS  ─────────────────────────────
    async loadUsers(container) {
        try {
            const data = await api.get('/admin/users');
            const users = data.data || [];
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-users" style="color:var(--accent);margin-right:8px;"></i>User Management (${users.length})</h3>
                        <button class="btn btn-primary btn-sm" id="btn-add-user"><i class="fas fa-user-plus"></i> Add User</button>
                    </div>

                    <div class="filter-bar" id="users-filter-bar">
                        <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                        <input type="text" id="users-search" placeholder="Search users by name or email..." />
                        <select id="users-role-filter">
                            <option value="">All Roles</option>
                            <option value="SuperAdmin">SuperAdmin</option>
                            <option value="Manager">Manager</option>
                            <option value="Leader">Leader</option>
                            <option value="Teammate">Teammate</option>
                        </select>
                        <select id="users-status-filter">
                            <option value="">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>

                    <table class="data-table" id="users-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="name">Name <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="email">Email <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="role">Role <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="dept">Dept <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="status">Status <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => `
                                <tr data-name="${escAttr(u.name)}" data-email="${escAttr(u.email)}" data-role="${u.role}" data-dept="${escAttr(u.department)}" data-status="${u.active ? 'Active' : 'Inactive'}">
                                    <td><div style="display:flex;align-items:center;gap:8px;"><span class="avatar-sm">${(u.name||'?').charAt(0).toUpperCase()}</span><strong>${App.escapeHtml(u.name)}</strong></div></td>
                                    <td style="font-size:.85rem;">${App.escapeHtml(u.email)}</td>
                                    <td><span class="tag">${u.role}</span></td>
                                    <td style="color:var(--text-muted);">${u.department || '—'}</td>
                                    <td><span class="status-badge ${u.active ? 'done' : 'blocked'}">${u.active ? 'Active' : 'Inactive'}</span></td>
                                    <td>
                                        <div class="btn-group">
                                            <button class="btn btn-sm btn-outline" onclick="App.modules.admin.editUser('${u.email}')">Edit</button>
                                            <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteUser('${u.email}')">Remove</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            this._wireFilterAndSort('users-table', 'users-search', { role: 'users-role-filter', status: 'users-status-filter' }, 'name');
            document.getElementById('btn-add-user').addEventListener('click', () => this.showUserModal());
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load users</p></div>';
        }
    },

    async showUserModal(user = null) {
        const isEdit = !!user;

        // Fetch reference lists for reports, commodities, and active users
        let allUsers = [];
        let allReports = [];
        let allCommodities = [];
        try {
            const [usersRes, reportsRes, commsRes] = await Promise.all([
                api.get('/admin/users'),
                api.get('/admin/reports'),
                api.get('/du/commodities').catch(() => ({ commodities: [] }))
            ]);
            allUsers = (usersRes && usersRes.data) || [];
            allReports = (reportsRes && reportsRes.data) || [];
            const rawComms = (commsRes && commsRes.commodities) || (commsRes && commsRes.data) || [];
            allCommodities = (Array.isArray(rawComms) && rawComms.length) ? rawComms : [
                'Bajra', 'Barley', 'Bengal Gram', 'Chilli', 'Coriander', 'Cotton',
                'Cumin', 'Maize', 'Masoor', 'Moong', 'Pea', 'Pulses', 'Rapeseed',
                'Rice', 'Soybeans', 'Sugar', 'Tops', 'Tur', 'Turmeric', 'Urad',
                'Weather', 'Wheat', 'Macro / All'
            ];
        } catch (e) {
            console.warn('Could not fetch all reference lists for user modal:', e);
        }

        // Initialize state for assigned reports
        let userReports = [];
        if (user?.reports && Array.isArray(user.reports)) {
            userReports = user.reports.map(r => ({
                report_id: r.report_id || r.id,
                report_name: r.report_name || r.name,
                timing_schedule: r.timing_schedule || r.timingSchedule || '',
                deadline: r.deadline || '',
                frequency: r.frequency || 'Daily',
                instructions: r.instructions || ''
            }));
        } else if (user?.report_mappings && Array.isArray(user.report_mappings)) {
            userReports = user.report_mappings.map(r => ({
                report_id: r.report_id || r.id,
                report_name: r.report_name || r.name,
                timing_schedule: r.timing_schedule || r.timingSchedule || '',
                deadline: r.deadline || '',
                frequency: r.frequency || 'Daily',
                instructions: r.instructions || ''
            }));
        }

        // Initialize state for assigned commodities
        let userCommodities = [];
        if (user?.commodity_mappings && Array.isArray(user.commodity_mappings) && user.commodity_mappings.length > 0) {
            userCommodities = user.commodity_mappings.map(cm => ({
                commodity: cm.commodity,
                mapping_config: cm.mapping_config || cm.mappingConfig || cm.config || ''
            }));
        } else if (user?.assignedCommodities && Array.isArray(user.assignedCommodities) && user.assignedCommodities.length > 0) {
            userCommodities = user.assignedCommodities.map(cm => ({
                commodity: cm.commodity,
                mapping_config: cm.mapping_config || cm.mappingConfig || cm.config || ''
            }));
        } else if (user?.commodities) {
            userCommodities = user.commodities.split(',').map(s => s.trim()).filter(Boolean).map(c => ({
                commodity: c,
                mapping_config: ''
            }));
        }

        const getCommChipColor = (cName) => {
            let hash = 0;
            for (let i = 0; i < cName.length; i++) hash = cName.charCodeAt(i) + ((hash << 5) - hash);
            const hue = Math.abs(hash) % 360;
            return {
                bg: `hsla(${hue}, 70%, 50%, 0.16)`,
                text: `hsl(${hue}, 85%, 65%)`,
                border: `hsla(${hue}, 70%, 50%, 0.35)`
            };
        };

        const bodyHtml = `
            <div class="user-hierarchy-form" style="display: flex; flex-direction: column; gap: 16px; max-height: 78vh; overflow-y: auto; padding-right: 6px;">

                <!-- Tier 1: User Identity & Authentication -->
                <div class="hierarchy-section" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">
                    <div style="font-weight: 700; font-size: .88rem; color: #60a5fa; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: #3b82f6; color: #fff; font-size: .7rem; padding: 2px 7px; border-radius: 10px;">Tier 1</span>
                        <i class="fas fa-user-circle"></i> User Identity & Authentication
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600;">Full Name *</label>
                            <input type="text" id="au-name" value="${App.escapeHtml(user?.name || '')}" placeholder="e.g. Balram Meena" style="width:100%;" required>
                        </div>
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600;">Email Address * (Unique)</label>
                            <input type="email" id="au-email" value="${App.escapeHtml(user?.email || '')}" placeholder="user@agalabs.com" style="width:100%;" ${isEdit ? 'readonly' : ''} required>
                        </div>
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600;">${isEdit ? 'Password (blank to keep)' : 'Password *'}</label>
                            <input type="password" id="au-pwd" placeholder="${isEdit ? '••••••••' : 'Enter password'}" style="width:100%;">
                        </div>
                    </div>
                </div>

                <!-- Tier 2: Role, Department & Active Status -->
                <div class="hierarchy-section" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">
                    <div style="font-weight: 700; font-size: .88rem; color: #34d399; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: #10b981; color: #fff; font-size: .7rem; padding: 2px 7px; border-radius: 10px;">Tier 2</span>
                        <i class="fas fa-id-badge"></i> Role, Department & Access Control
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; align-items: center;">
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600;">Role (Panel Access)</label>
                            <select id="au-role" style="width:100%;">
                                <option value="Teammate" ${user?.role === 'Teammate' ? 'selected' : ''}>Teammate (Standard Workspace)</option>
                                <option value="Leader" ${user?.role === 'Leader' ? 'selected' : ''}>Leader (Team Review & Guidance)</option>
                                <option value="Manager" ${user?.role === 'Manager' ? 'selected' : ''}>Manager (Department Control)</option>
                                <option value="SuperAdmin" ${user?.role === 'SuperAdmin' ? 'selected' : ''}>SuperAdmin (Full System Master)</option>
                            </select>
                        </div>
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600;">Department</label>
                            <input type="text" id="au-dept" value="${App.escapeHtml(user?.department || 'Research')}" placeholder="e.g. Research" style="width:100%;">
                        </div>
                        <div class="form-row" style="margin: 0; padding-top: 14px;">
                            <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: .85rem; font-weight: 600;">
                                <input type="checkbox" id="au-active" ${(user?.active !== false) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                                <span>Active User Account</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Tier 3: Reports with Timing Popup -->
                <div class="hierarchy-section" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                        <div style="font-weight: 700; font-size: .88rem; color: #fbbf24; display: flex; align-items: center; gap: 8px;">
                            <span class="badge" style="background: #f59e0b; color: #fff; font-size: .7rem; padding: 2px 7px; border-radius: 10px;">Tier 3</span>
                            <i class="fas fa-file-invoice"></i> Assigned Reports & Timing Schedules
                            <span class="badge" id="au-reports-count" style="background: rgba(245,158,11,0.2); color: #fbbf24; font-size: .75rem;">${userReports.length}</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <select id="au-report-select" style="min-width: 220px; font-size: .8rem;">
                                <option value="">-- Select Report to Assign --</option>
                                ${allReports.map(r => `<option value="${r.id}" data-name="${App.escapeHtml(r.name)}" data-freq="${r.frequency || 'Daily'}" data-deadline="${r.deadline || ''}">${App.escapeHtml(r.name)} (${r.frequency || 'Daily'})</option>`).join('')}
                            </select>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-add-report-to-user" style="padding: 4px 10px; font-size: .78rem; background: #f59e0b; border-color: #f59e0b;">
                                <i class="fas fa-plus"></i> Assign
                            </button>
                        </div>
                    </div>
                    <p style="font-size: .75rem; color: var(--text-muted); margin-bottom: 8px;">
                        Click on <strong>Timing Popup</strong> to configure delivery schedule, frequency, cutoff SLA, and instructions.
                    </p>
                    <div id="au-reports-container" style="display: flex; flex-direction: column; gap: 6px; min-height: 44px; max-height: 180px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);"></div>
                </div>

                <!-- Tier 4: Commodities with Mapping Popup -->
                <div class="hierarchy-section" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                        <div style="font-weight: 700; font-size: .88rem; color: #c084fc; display: flex; align-items: center; gap: 8px;">
                            <span class="badge" style="background: #a855f7; color: #fff; font-size: .7rem; padding: 2px 7px; border-radius: 10px;">Tier 4</span>
                            <i class="fas fa-cubes"></i> Assigned Commodities & Mapping Configurations
                            <span class="badge" id="au-comms-count" style="background: rgba(168,85,247,0.2); color: #c084fc; font-size: .75rem;">${userCommodities.length}</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <select id="au-comm-select" style="min-width: 200px; font-size: .8rem;">
                                <option value="">-- Select Commodity --</option>
                                ${allCommodities.map(c => `<option value="${App.escapeHtml(c)}">${App.escapeHtml(c)}</option>`).join('')}
                            </select>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-add-comm-to-user" style="padding: 4px 10px; font-size: .78rem; background: #a855f7; border-color: #a855f7;">
                                <i class="fas fa-plus"></i> Assign
                            </button>
                        </div>
                    </div>
                    <p style="font-size: .75rem; color: var(--text-muted); margin-bottom: 8px;">
                        Click on <strong>Map</strong> to configure surveillance feeds, parameters, or custom notes for this commodity.
                    </p>
                    <div id="au-comms-container" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 44px; max-height: 140px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); align-content: flex-start;"></div>
                </div>

                <!-- Tier 5: 1st Backup & 2nd Backup Assignees -->
                <div class="hierarchy-section" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">
                    <div style="font-weight: 700; font-size: .88rem; color: #f472b6; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: #ec4899; color: #fff; font-size: .7rem; padding: 2px 7px; border-radius: 10px;">Tier 5</span>
                        <i class="fas fa-people-arrows"></i> Failover Assignees: 1st Backup & 2nd Backup
                    </div>
                    <p style="font-size: .75rem; color: var(--text-muted); margin-bottom: 10px;">
                        Designate primary and secondary fallback colleagues who automatically inherit reporting and surveillance duties when this teammate is absent.
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600; color: #f472b6;">1st Backup Assignee (Primary Failover)</label>
                            <select id="au-backup-1" style="width:100%;">
                                <option value="">-- No 1st Backup Assigned --</option>
                                ${allUsers.filter(u => u.email !== user?.email).map(u => {
                                    const uName = u.name || u.email;
                                    const isSelected = (user?.backup_1 === uName || user?.backup1 === uName);
                                    return `<option value="${App.escapeHtml(uName)}" ${isSelected ? 'selected' : ''}>${App.escapeHtml(uName)} (${u.role || 'Teammate'})</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="form-row" style="margin: 0;">
                            <label style="font-size: .78rem; font-weight: 600; color: #f472b6;">2nd Backup Assignee (Secondary Failover)</label>
                            <select id="au-backup-2" style="width:100%;">
                                <option value="">-- No 2nd Backup Assigned --</option>
                                ${allUsers.filter(u => u.email !== user?.email).map(u => {
                                    const uName = u.name || u.email;
                                    const isSelected = (user?.backup_2 === uName || user?.backup2 === uName);
                                    return `<option value="${App.escapeHtml(uName)}" ${isSelected ? 'selected' : ''}>${App.escapeHtml(uName)} (${u.role || 'Teammate'})</option>`;
                                }).join('')}
                            </select>
                        </div>
                    </div>
                </div>

            </div>
        `;

        App.showModal(
            isEdit ? 'Edit User Hierarchy' : 'Add New User Hierarchy',
            bodyHtml,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-user">Save User Hierarchy</button>',
            'modal-xl'
        );

        // Render sub-items and listeners
        const renderUserReports = () => {
            const container = document.getElementById('au-reports-container');
            const countEl = document.getElementById('au-reports-count');
            if (countEl) countEl.textContent = userReports.length;
            if (!container) return;

            if (userReports.length === 0) {
                container.innerHTML = `<span style="font-size: .78rem; color: var(--text-muted); padding: 8px;">No reports assigned yet. Select a report above and click "Assign".</span>`;
                return;
            }

            container.innerHTML = userReports.map((rep, idx) => `
                <div class="user-report-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 6px 12px; border-radius: 6px; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; flex-wrap: wrap;">
                        <i class="fas fa-file-invoice" style="color: #fbbf24; font-size: .85rem;"></i>
                        <strong style="font-size: .82rem; color: var(--text-primary);">${App.escapeHtml(rep.report_name)}</strong>
                        <span class="badge" style="background: rgba(245,158,11,0.15); color: #fbbf24; font-size: .72rem; padding: 2px 6px; border-radius: 4px;">
                            ${App.escapeHtml(rep.frequency || 'Daily')}
                        </span>
                        <span class="badge" style="background: ${rep.timing_schedule ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)'}; color: ${rep.timing_schedule ? '#10b981' : 'var(--text-muted)'}; font-size: .72rem; padding: 2px 6px; border-radius: 4px;">
                            <i class="fas fa-clock" style="margin-right: 3px;"></i>${rep.timing_schedule ? App.escapeHtml(rep.timing_schedule) : 'No timing set'}
                        </span>
                        ${rep.deadline ? `<span class="badge" style="background: rgba(239,68,68,0.12); color: #ef4444; font-size: .72rem; padding: 2px 6px; border-radius: 4px;">Deadline: ${App.escapeHtml(rep.deadline)}</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn btn-xs btn-outline btn-rep-timing" data-idx="${idx}" style="font-size: .72rem; padding: 3px 8px; border-color: rgba(245,158,11,0.5); color: #fbbf24; cursor: pointer; border-radius: 4px;" title="Open Timing & Schedule Configuration">
                            <i class="fas fa-cog"></i> Timing Popup
                        </button>
                        <button type="button" class="btn btn-xs btn-danger btn-rep-remove" data-idx="${idx}" style="font-size: .72rem; padding: 3px 7px; cursor: pointer; border-radius: 4px;" title="Remove Assignment">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-rep-timing').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    const rep = userReports[idx];
                    if (!rep) return;

                    const subBody = `
                        <div style="font-size: .84rem; display: flex; flex-direction: column; gap: 12px;">
                            <div style="background: rgba(245,158,11,0.08); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(245,158,11,0.2);">
                                <span style="font-size: .75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: .5px;">Target Report</span>
                                <div style="font-size: .95rem; font-weight: 700; color: #fbbf24; margin-top: 2px;">${App.escapeHtml(rep.report_name)}</div>
                            </div>
                            <div class="form-row" style="margin: 0;">
                                <label style="font-weight: 600; font-size: .78rem;">Recurrence Frequency</label>
                                <select id="sub-rep-freq" style="width: 100%;">
                                    <option value="Daily" ${rep.frequency === 'Daily' ? 'selected' : ''}>Daily (Everyday)</option>
                                    <option value="Weekly" ${rep.frequency === 'Weekly' ? 'selected' : ''}>Weekly</option>
                                    <option value="Fortnightly" ${rep.frequency === 'Fortnightly' ? 'selected' : ''}>Fortnightly</option>
                                    <option value="Monthly" ${rep.frequency === 'Monthly' ? 'selected' : ''}>Monthly</option>
                                    <option value="Quarterly" ${rep.frequency === 'Quarterly' ? 'selected' : ''}>Quarterly</option>
                                    <option value="Half-Yearly" ${rep.frequency === 'Half-Yearly' ? 'selected' : ''}>Half-Yearly</option>
                                    <option value="Yearly" ${rep.frequency === 'Yearly' ? 'selected' : ''}>Yearly</option>
                                </select>
                            </div>
                            <div class="form-row" style="margin: 0;">
                                <label style="font-weight: 600; font-size: .78rem;">Timing Schedule / Delivery Window</label>
                                <input type="text" id="sub-rep-timing" value="${App.escapeHtml(rep.timing_schedule || '')}" placeholder="e.g. 09:30 AM or Daily Morning" style="width: 100%;">
                            </div>
                            <div class="form-row" style="margin: 0;">
                                <label style="font-weight: 600; font-size: .78rem;">Cutoff SLA Deadline</label>
                                <input type="text" id="sub-rep-deadline" value="${App.escapeHtml(rep.deadline || '')}" placeholder="e.g. 10:00 AM or 18:00" style="width: 100%;">
                            </div>
                            <div class="form-row" style="margin: 0;">
                                <label style="font-weight: 600; font-size: .78rem;">Special Delivery Instructions / Notes</label>
                                <textarea id="sub-rep-inst" rows="3" placeholder="Operational instructions or notes..." style="width: 100%; font-size: .8rem;">${App.escapeHtml(rep.instructions || '')}</textarea>
                            </div>
                        </div>
                    `;
                    const subFooter = `
                        <button type="button" class="btn btn-outline" id="btn-cancel-rep-sub">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btn-save-rep-sub" style="background: #f59e0b; border-color: #f59e0b;">Apply Schedule</button>
                    `;
                    App.showSubModal(`Configure Report Timing: ${rep.report_name}`, subBody, subFooter);

                    document.getElementById('btn-cancel-rep-sub')?.addEventListener('click', () => App.hideSubModal());
                    document.getElementById('btn-save-rep-sub')?.addEventListener('click', () => {
                        rep.frequency = document.getElementById('sub-rep-freq')?.value || 'Daily';
                        rep.timing_schedule = document.getElementById('sub-rep-timing')?.value.trim() || '';
                        rep.deadline = document.getElementById('sub-rep-deadline')?.value.trim() || '';
                        rep.instructions = document.getElementById('sub-rep-inst')?.value.trim() || '';
                        App.hideSubModal();
                        renderUserReports();
                    });
                });
            });

            container.querySelectorAll('.btn-rep-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    userReports.splice(idx, 1);
                    renderUserReports();
                });
            });
        };

        const renderUserCommodities = () => {
            const container = document.getElementById('au-comms-container');
            const countEl = document.getElementById('au-comms-count');
            if (countEl) countEl.textContent = userCommodities.length;
            if (!container) return;

            if (userCommodities.length === 0) {
                container.innerHTML = `<span style="font-size: .78rem; color: var(--text-muted); padding: 8px;">No commodities assigned yet. Select a commodity above and click "Assign".</span>`;
                return;
            }

            container.innerHTML = userCommodities.map((comm, idx) => {
                const color = getCommChipColor(comm.commodity);
                return `
                    <div class="user-comm-chip" style="display: inline-flex; align-items: center; gap: 6px; background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}; padding: 4px 10px; border-radius: 6px; font-size: .8rem;">
                        <i class="fas fa-cube" style="font-size: .75rem;"></i>
                        <strong>${App.escapeHtml(comm.commodity)}</strong>
                        <button type="button" class="btn-comm-map" data-idx="${idx}" title="Configure mapping" style="background: rgba(255,255,255,0.12); border: none; color: inherit; padding: 2px 6px; border-radius: 4px; font-size: .7rem; cursor: pointer;">
                            <i class="fas fa-cog"></i> ${comm.mapping_config ? 'Configured' : 'Map'}
                        </button>
                        <button type="button" class="btn-comm-remove" data-idx="${idx}" title="Remove" style="background: none; border: none; color: inherit; opacity: .7; cursor: pointer; padding: 0 3px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-comm-map').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    const comm = userCommodities[idx];
                    if (!comm) return;

                    const subBody = `
                        <div style="font-size: .84rem; display: flex; flex-direction: column; gap: 12px;">
                            <div style="background: rgba(168,85,247,0.08); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(168,85,247,0.2);">
                                <span style="font-size: .75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: .5px;">Target Commodity</span>
                                <div style="font-size: .95rem; font-weight: 700; color: #c084fc; margin-top: 2px;">${App.escapeHtml(comm.commodity)}</div>
                            </div>
                            <div class="form-row" style="margin: 0;">
                                <label style="font-weight: 600; font-size: .78rem;">Commodity Mapping Configuration / Details</label>
                                <textarea id="sub-comm-config" rows="5" placeholder="Enter custom mapping config, data sources, parameters, or JSON notes..." style="width: 100%; font-size: .82rem; font-family: monospace;">${App.escapeHtml(comm.mapping_config || '')}</textarea>
                            </div>
                            <p style="font-size: .75rem; color: var(--text-muted); margin: 0;">
                                Specifies custom surveillance feeds, data pipeline settings, or research desk assignments for this commodity.
                            </p>
                        </div>
                    `;
                    const subFooter = `
                        <button type="button" class="btn btn-outline" id="btn-cancel-comm-sub">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btn-save-comm-sub" style="background: #a855f7; border-color: #a855f7;">Apply Mapping</button>
                    `;
                    App.showSubModal(`Configure Commodity Mapping: ${comm.commodity}`, subBody, subFooter);

                    document.getElementById('btn-cancel-comm-sub')?.addEventListener('click', () => App.hideSubModal());
                    document.getElementById('btn-save-comm-sub')?.addEventListener('click', () => {
                        comm.mapping_config = document.getElementById('sub-comm-config')?.value.trim() || '';
                        App.hideSubModal();
                        renderUserCommodities();
                    });
                });
            });

            container.querySelectorAll('.btn-comm-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    userCommodities.splice(idx, 1);
                    renderUserCommodities();
                });
            });
        };

        // Render initial lists
        renderUserReports();
        renderUserCommodities();

        // Wire Add Report and Add Commodity buttons
        document.getElementById('btn-add-report-to-user')?.addEventListener('click', () => {
            const sel = document.getElementById('au-report-select');
            if (!sel || !sel.value) return;
            const opt = sel.selectedOptions[0];
            const repId = parseInt(sel.value);
            const repName = opt?.dataset.name || opt?.textContent?.trim() || '';
            const repFreq = opt?.dataset.freq || 'Daily';
            const repDeadline = opt?.dataset.deadline || '';
            if (userReports.some(r => r.report_id === repId || r.report_name.toLowerCase() === repName.toLowerCase())) {
                App.showToast('This report is already assigned to this user', 'info');
                return;
            }
            userReports.push({
                report_id: repId,
                report_name: repName,
                timing_schedule: '',
                deadline: repDeadline,
                frequency: repFreq,
                instructions: ''
            });
            sel.value = '';
            renderUserReports();
        });

        document.getElementById('btn-add-comm-to-user')?.addEventListener('click', () => {
            const sel = document.getElementById('au-comm-select');
            if (!sel || !sel.value) return;
            const commName = sel.value.trim();
            if (userCommodities.some(c => c.commodity.toLowerCase() === commName.toLowerCase())) {
                App.showToast('This commodity is already assigned to this user', 'info');
                return;
            }
            userCommodities.push({
                commodity: commName,
                mapping_config: ''
            });
            sel.value = '';
            renderUserCommodities();
        });

        // Wire Save User Hierarchy button
        document.getElementById('btn-save-user')?.addEventListener('click', async () => {
            const email = document.getElementById('au-email')?.value.trim();
            const name = document.getElementById('au-name')?.value.trim();
            if (!email || !name) {
                App.showToast('Email and name are required', 'warning');
                return;
            }
            const role = document.getElementById('au-role')?.value || 'Teammate';
            const department = document.getElementById('au-dept')?.value.trim() || 'Research';
            const active = document.getElementById('au-active')?.checked !== false;
            const backup_1 = document.getElementById('au-backup-1')?.value.trim() || '';
            const backup_2 = document.getElementById('au-backup-2')?.value.trim() || '';
            const pwd = document.getElementById('au-pwd')?.value;

            if (!isEdit && !pwd) {
                App.showToast('Password is required for new users', 'warning');
                return;
            }

            const payload = {
                email,
                name,
                role,
                department,
                active,
                backup_1,
                backup_2,
                reports: userReports,
                commodities: userCommodities.map(c => c.commodity).join(', '),
                commodity_mappings: userCommodities
            };
            if (pwd) payload.password = pwd;

            const saveBtn = document.getElementById('btn-save-user');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
            }

            try {
                if (isEdit) {
                    await api.put(`/admin/users/${encodeURIComponent(email)}`, payload);
                } else {
                    await api.post('/admin/users', payload);
                }

                // Invalidate user and table mapping caches
                this._userList = null;
                this._allAssigneeOptions = null;
                this._activeUsers = null;
                this._activeCommodities = null;

                App.closeModal();
                App.showToast(isEdit ? 'User hierarchy updated successfully' : 'User created with full hierarchy', 'success');

                // Reload current tab
                this.loadTab();

                // If Table Mapping Studio filter dropdown is currently in the DOM, refresh it dynamically
                const userFilter = document.getElementById('map-filter-user');
                if (userFilter) {
                    try {
                        const uRes = await api.get('/admin/users');
                        const freshUsers = (uRes && uRes.data) || [];
                        const activeNames = freshUsers.filter(u => u.active !== false && (u.name || u.email)).map(u => (u.name || u.email).trim());
                        this._activeUsers = activeNames;
                        const curVal = userFilter.value;
                        userFilter.innerHTML = `<option value="">All Assignees</option>` +
                            activeNames.map(u => `<option value="${App.escapeHtml(u)}" ${u === curVal ? 'selected' : ''}>${App.escapeHtml(u)}</option>`).join('');
                    } catch (e) {}
                }
            } catch (err) {
                App.showToast(err.message || 'Failed to save user hierarchy', 'error');
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = `Save User Hierarchy`;
                }
            }
        });
    },

    async editUser(email) {
        try {
            const data = await api.get('/admin/users');
            const user = (data.data || []).find(u => u.email === email);
            if (user) this.showUserModal(user);
        } catch (e) { App.showToast('Could not load user data', 'error'); }
    },

    async deleteUser(email) {
        if (!confirm(`Remove user ${email}? This cannot be undone.`)) return;
        try {
            await api.delete(`/admin/users/${encodeURIComponent(email)}`);
            App.showToast('User removed', 'success');
            this.loadTab();
        } catch (err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────────  REPORTS  ─────────────────────────────
    async loadReports(container) {
        try {
            const [data, users] = await Promise.all([api.get('/admin/reports'), api.get('/admin/users')]);
            const items = data.data || [];
            const userList = users.data || [];
            this._userList = userList;
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-file-pdf" style="color:var(--accent);margin-right:8px;"></i>Reports (${items.length})</h3>
                        <div class="btn-group">
                            <button class="btn btn-outline btn-sm" id="btn-report-csv-sample"><i class="fas fa-download"></i> Sample CSV</button>
                            <button class="btn btn-outline btn-sm" data-jump="bulk" id="btn-report-bulk"><i class="fas fa-file-csv"></i> Bulk Upload</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-report"><i class="fas fa-plus"></i> Add Report</button>
                        </div>
                    </div>

                    <div class="filter-bar" id="reports-filter-bar">
                        <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                        <input type="text" id="reports-search" placeholder="Search reports by name or assignee..." />
                        <select id="reports-freq-filter">
                            <option value="">All Frequencies</option>
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Fortnightly">Fortnightly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Half-Yearly">Half-Yearly</option>
                            <option value="Yearly">Yearly</option>
                        </select>
                    </div>

                    <table class="data-table" id="reports-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="name">Name <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="freq">Frequency <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="assignee">Primary Assignee <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Backup 1st</th>
                                <th>Backup 2nd</th>
                                <th class="sortable-header" data-sort="deadline">Deadline <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Instructions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${items.map(i => `
                            <tr data-name="${escAttr(i.name)}" data-freq="${i.frequency}" data-assignee="${escAttr(i.primaryAssignee)}" data-deadline="${escAttr(i.deadline)}">
                                <td><strong>${App.escapeHtml(i.name)}</strong></td>
                                <td><span class="tag">${i.frequency}</span></td>
                                <td>${App.escapeHtml(i.primaryAssignee||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup1||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup2||'—')}</td>
                                <td style="color:var(--text-muted);">${i.deadline||'—'}</td>
                                <td style="max-width:240px;">${this._instructionsCell(i.instructions, () => `App.modules.admin.showReportModal(${i.id})`)}</td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline" onclick="App.modules.admin.showReportModal(${i.id})">Edit/Assign</button>
                                        <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteReport(${i.id})">Remove</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                    ${items.length === 0 ? '<div class="empty-state"><i class="fas fa-file-pdf"></i><p>No reports configured yet</p></div>' : ''}
                </div>
            `;
            this._reportCache = items;
            this._wireFilterAndSort('reports-table', 'reports-search', { freq: 'reports-freq-filter' }, 'name');
            document.getElementById('btn-add-report').addEventListener('click', () => this.showReportModal());
            document.getElementById('btn-report-csv-sample').addEventListener('click', () => this.downloadSample('reports'));
            document.getElementById('btn-report-bulk').addEventListener('click', () => this.switchTab('bulk'));
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load reports</p></div>';
        }
    },

    /**
     * Render an Instructions cell. If text exists, show a truncated preview
     * (with full text on hover via the `title` attribute). If empty, show a
     * small "+ Add" link that opens the edit modal.
     *
     *   text      – the current instruction string (may be empty)
     *   openExpr  – function returning a JS expression string that, when run,
     *               opens the row's edit modal (e.g. () => 'App.modules.admin.showReportModal(7)')
     */
    _instructionsCell(text, openExpr) {
        const t = (text || '').toString().trim();
        if (!t) {
            return `<button class="btn btn-sm btn-outline" style="font-size:.7rem; padding:3px 8px;" onclick="${openExpr()}">
                        <i class="fas fa-plus"></i> Add
                    </button>`;
        }
        const preview = t.length > 70 ? t.slice(0, 67) + '…' : t;
        return `<span title="${App.escapeHtml(t)}" style="font-size:.8rem; color:var(--text-secondary); cursor:help;">
                    <i class="fas fa-info-circle" style="color:var(--info); margin-right:4px;"></i>${App.escapeHtml(preview)}
                </span>`;
    },

    _assigneeOptions(selected) {
        const users = this._userList || [];
        const opts = ['<option value="">— Unassigned —</option>'].concat(
            users.map(u => `<option value="${App.escapeHtml(u.email)}" ${u.email === selected ? 'selected' : ''}>${App.escapeHtml(u.name)} (${App.escapeHtml(u.email)})</option>`)
        );
        return opts.join('');
    },

    showReportModal(id = null) {
        const r = id ? (this._reportCache || []).find(x => x.id === id) : null;
        const body = `
            <div class="form-row"><label>Report Name *</label><input type="text" id="rep-name" value="${App.escapeHtml(r?.name||'')}" style="width:100%;" required></div>
            <div class="form-grid">
                <div class="form-row"><label>Frequency</label>
                    <select id="rep-freq" style="width:100%;">
                        ${['Daily','Weekly','Fortnightly','Monthly','Quarterly','Half-Yearly','Yearly'].map(f =>
                            `<option value="${f}" ${r?.frequency===f?'selected':''}>${f}</option>`).join('')}
                    </select></div>
                <div class="form-row"><label>Deadline (HH:MM)</label><input type="text" id="rep-deadline" value="${App.escapeHtml(r?.deadline||'')}" placeholder="e.g. 18:00" style="width:100%;"></div>
            </div>
            <div class="form-row">
                <label>Schedule</label>
                <div id="rep-schedule"></div>
            </div>
            <div class="form-row"><label>Primary Assignee</label>
                <select id="rep-assignee" style="width:100%;">${this._assigneeOptions(r?.primaryAssignee)}</select>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Backup 1st</label>
                    <select id="rep-backup1" style="width:100%;">${this._assigneeOptions(r?.backup1)}</select>
                </div>
                <div class="form-row"><label>Backup 2nd</label>
                    <select id="rep-backup2" style="width:100%;">${this._assigneeOptions(r?.backup2)}</select>
                </div>
            </div>
            <div class="form-row">
                <label>Instructions <span style="color:var(--text-muted); font-size:.75rem;">(shown to users via the (i) button on Tasks &amp; Roster)</span></label>
                <textarea id="rep-instructions" style="width:100%; min-height:60px;" placeholder="e.g. Imported Market Price — take after 3:00">${App.escapeHtml(r?.instructions||'')}</textarea>
            </div>
        `;
        App.showModal(id ? 'Edit / Assign Report' : 'Add Report', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-report">Save</button>');
        setTimeout(() => {
            renderScheduleControl('rep-freq', 'rep-schedule', r?.scheduleDay || '');
            document.getElementById('btn-save-report')?.addEventListener('click', async () => {
                const payload = {
                    name: document.getElementById('rep-name').value.trim(),
                    frequency: document.getElementById('rep-freq').value,
                    primaryAssignee: document.getElementById('rep-assignee').value,
                    backup1: document.getElementById('rep-backup1').value,
                    backup2: document.getElementById('rep-backup2').value,
                    deadline: document.getElementById('rep-deadline').value.trim(),
                    scheduleDay: readScheduleValue('rep-schedule'),
                    instructions: document.getElementById('rep-instructions').value,
                };
                if (!payload.name) { App.showToast('Report name required', 'warning'); return; }
                try {
                    if (id) await api.put(`/admin/reports/${id}`, payload);
                    else    await api.post('/admin/reports', payload);
                    App.closeModal();
                    App.showToast('Report saved', 'success');
                    this.loadTab();
                } catch(err) { App.showToast(err.message || 'Failed', 'error'); }
            });
        }, 50);
    },

    async deleteReport(id) {
        if (!confirm('Remove this report?')) return;
        try { await api.delete(`/admin/reports/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────  REPORT MERGING  ─────────────────────────
    async loadReportMerge(container) {
        try {
            const [grpResp, repResp, userResp] = await Promise.all([
                api.get('/admin/report-groups'),
                api.get('/admin/reports'),
                api.get('/admin/users'),
            ]);
            const groups = grpResp.data || [];
            const byCat = grpResp.byCategory || {};
            const reports = repResp.data || [];
            this._userList = userResp.data || [];
            this._reportCache = reports;

            const categoryCards = Object.keys(byCat).sort().map(cat => `
                <div class="glass-card" style="padding:16px; margin-bottom:12px;">
                    <div class="card-header">
                        <h4 style="font-size:.95rem; font-weight:700;">
                            <i class="fas fa-layer-group" style="color:var(--accent); margin-right:6px;"></i>${App.escapeHtml(cat)}
                            <span style="color:var(--text-muted); font-weight:500;"> · ${byCat[cat].length} group(s)</span>
                        </h4>
                    </div>
                    <table class="data-table">
                        <thead><tr><th>Group</th><th>Members</th><th>Freq</th><th>Primary</th><th>Backup 1</th><th>Backup 2</th><th>Visibility</th><th>Instructions</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${byCat[cat].map(g => `
                                <tr>
                                    <td><strong>${App.escapeHtml(g.groupName)}</strong></td>
                                    <td>${(g.members||[]).map(m => `<span class="tag" style="margin:1px;">${App.escapeHtml(m)}</span>`).join(' ') || '<span style="color:var(--text-muted);">—</span>'}</td>
                                    <td><span class="tag">${g.frequency}</span></td>
                                    <td>${App.escapeHtml(g.primaryAssignee||'—')}</td>
                                    <td style="color:var(--text-muted);">${App.escapeHtml(g.backup1||'—')}</td>
                                    <td style="color:var(--text-muted);">${App.escapeHtml(g.backup2||'—')}</td>
                                    <td><span class="status-badge ${g.visibility==='managers'?'review':'done'}">${g.visibility==='managers'?'Managers only':'All'}</span></td>
                                    <td style="max-width:240px;">${this._instructionsCell(g.remark, () => `App.modules.admin.showGroupModal(${g.id})`)}</td>
                                    <td>
                                        <div class="btn-group">
                                            <button class="btn btn-sm btn-outline" onclick="App.modules.admin.showGroupModal(${g.id})">Edit</button>
                                            <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteGroup(${g.id})">Remove</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('');

            container.innerHTML = `
                <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-object-group" style="color:var(--accent); margin-right:8px;"></i>Report Merging (${groups.length} groups)</h3>
                        <div class="btn-group">
                            <button class="btn btn-outline btn-sm" id="btn-grp-sample"><i class="fas fa-download"></i> Sample CSV</button>
                            <button class="btn btn-outline btn-sm" id="btn-grp-bulk"><i class="fas fa-file-csv"></i> Bulk Upload</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-group"><i class="fas fa-plus"></i> New Merge Group</button>
                        </div>
                    </div>
                    <p style="font-size:.85rem; color:var(--text-muted); margin-bottom:8px;">
                        Group multiple commodity reports under one parent category — e.g. <strong>Pulses</strong>: Tur, Urad, Bengal gram, Moong, Masoor, Pea
                        or <strong>Coarse Grain</strong>: Maize, Bajra, Barley. Groups marked <em>Managers only</em> stay hidden from teammates.
                    </p>
                </div>
                ${groups.length ? categoryCards : '<div class="glass-card" style="padding:32px;"><div class="empty-state"><i class="fas fa-object-group"></i><p>No merge groups yet. Click "New Merge Group" to create one.</p></div></div>'}
            `;
            this._groupCache = groups;
            document.getElementById('btn-add-group').addEventListener('click', () => this.showGroupModal());
            document.getElementById('btn-grp-sample').addEventListener('click', () => this.downloadSample('report-groups'));
            document.getElementById('btn-grp-bulk').addEventListener('click', () => this.switchTab('bulk'));
        } catch(e) {
            container.innerHTML = '<p class="error-text">Failed to load report groups</p>';
        }
    },

    showGroupModal(id = null) {
        const g = id ? (this._groupCache || []).find(x => x.id === id) : null;
        const reports = this._reportCache || [];
        const selected = new Set(g?.members || []);
        const presetCats = ['Pulses', 'Coarse Grain', 'Oilseeds', 'Cereals', 'Spices', 'Fibres', 'Other'];
        const catOptions = presetCats.map(c => `<option value="${c}" ${g?.parentCategory === c ? 'selected' : ''}>${c}</option>`).join('');

        const reportChecks = reports.length ? reports.map(r => `
            <label style="display:flex; align-items:center; gap:6px; padding:4px 8px; background:var(--bg-primary); border-radius:6px; font-size:.8rem; cursor:pointer;">
                <input type="checkbox" class="grp-member" value="${App.escapeHtml(r.name)}" ${selected.has(r.name) ? 'checked' : ''}>
                ${App.escapeHtml(r.name)}
            </label>`).join('') : '<p style="font-size:.8rem; color:var(--text-muted);">No reports configured yet. Add some from the Reports tab first.</p>';

        const body = `
            <div class="form-grid">
                <div class="form-row"><label>Parent Category *</label>
                    <input list="grp-cat-list" id="grp-parent" value="${App.escapeHtml(g?.parentCategory||'')}" placeholder="e.g. Pulses" style="width:100%;">
                    <datalist id="grp-cat-list">${catOptions}</datalist>
                </div>
                <div class="form-row"><label>Group Name *</label>
                    <input type="text" id="grp-name" value="${App.escapeHtml(g?.groupName||'')}" placeholder="e.g. Pulses Daily" style="width:100%;">
                </div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Frequency</label>
                    <select id="grp-freq" style="width:100%;">
                        ${['Daily','Weekly','Fortnightly','Monthly','Quarterly','Half-Yearly','Yearly'].map(f =>
                            `<option value="${f}" ${g?.frequency===f?'selected':''}>${f}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row"><label>Primary Assignee</label>
                    <select id="grp-assignee" style="width:100%;">${this._assigneeOptions(g?.primaryAssignee)}</select>
                </div>
            </div>
            <div class="form-row">
                <label>Schedule</label>
                <div id="grp-schedule"></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Backup 1st</label>
                    <select id="grp-backup1" style="width:100%;">${this._assigneeOptions(g?.backup1)}</select>
                </div>
                <div class="form-row"><label>Backup 2nd</label>
                    <select id="grp-backup2" style="width:100%;">${this._assigneeOptions(g?.backup2)}</select>
                </div>
            </div>
            <div class="form-row">
                <label>Visibility</label>
                <select id="grp-visibility" style="width:100%;">
                    <option value="managers" ${(g?.visibility||'managers')==='managers'?'selected':''}>Managers / Admins only (hidden from teammates)</option>
                    <option value="all" ${g?.visibility==='all'?'selected':''}>Visible to everyone</option>
                </select>
            </div>
            <div class="form-row">
                <label>Member Reports <span style="color:var(--text-muted); font-size:.75rem;">(or enter custom comma-separated below)</span></label>
                <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:140px; overflow-y:auto; padding:8px; background:var(--bg-primary); border-radius:6px; border:1px solid var(--border);">${reportChecks}</div>
            </div>
            <div class="form-row">
                <label>Custom Members (comma-separated)</label>
                <input type="text" id="grp-custom" value="${App.escapeHtml((g?.members||[]).join(', '))}" placeholder="e.g. Tur, Urad, Bengal gram, Moong, Masoor, Pea" style="width:100%;">
            </div>
            <div class="form-row"><label>Instructions <span style="color:var(--text-muted); font-size:.7rem;">(shown via (i) on Today)</span></label><textarea id="grp-remark" style="width:100%; min-height:50px;" placeholder="e.g. Send to manager by 5pm">${App.escapeHtml(g?.remark||'')}</textarea></div>
        `;
        App.showModal(id ? 'Edit Merge Group' : 'New Merge Group', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-group">Save Group</button>');

        setTimeout(() => {
            renderScheduleControl('grp-freq', 'grp-schedule', g?.scheduleDay || '');
            document.getElementById('btn-save-group')?.addEventListener('click', async () => {
                const parent = document.getElementById('grp-parent').value.trim();
                const name = document.getElementById('grp-name').value.trim();
                if (!parent || !name) { App.showToast('Parent category and group name are required', 'warning'); return; }

                const checked = Array.from(document.querySelectorAll('.grp-member:checked')).map(c => c.value);
                const custom = document.getElementById('grp-custom').value.split(',').map(s => s.trim()).filter(Boolean);
                const members = Array.from(new Set([...checked, ...custom]));

                const payload = {
                    parentCategory: parent,
                    groupName: name,
                    members,
                    frequency: document.getElementById('grp-freq').value,
                    primaryAssignee: document.getElementById('grp-assignee').value,
                    backup1: document.getElementById('grp-backup1').value,
                    backup2: document.getElementById('grp-backup2').value,
                    scheduleDay: readScheduleValue('grp-schedule'),
                    visibility: document.getElementById('grp-visibility').value,
                    remark: document.getElementById('grp-remark').value,
                };
                try {
                    if (id) await api.put(`/admin/report-groups/${id}`, payload);
                    else    await api.post('/admin/report-groups', payload);
                    App.closeModal();
                    App.showToast('Merge group saved', 'success');
                    this.loadTab();
                } catch(err) { App.showToast(err.message || 'Failed', 'error'); }
            });
        }, 50);
    },

    async deleteGroup(id) {
        if (!confirm('Remove this merge group?')) return;
        try { await api.delete(`/admin/report-groups/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────  COMMODITIES  ─────────────────────────
    async loadCommodities(container) {
        try {
            const [data, users] = await Promise.all([api.get('/admin/commodities'), api.get('/admin/users')]);
            const items = data.data || [];
            this._userList = users.data || [];
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-cubes" style="color:var(--accent);margin-right:8px;"></i>Factor Task (${items.length})</h3>
                        <div class="btn-group">
                            <button class="btn btn-outline btn-sm" id="btn-com-sample"><i class="fas fa-download"></i> Sample CSV</button>
                            <button class="btn btn-outline btn-sm" id="btn-com-bulk"><i class="fas fa-file-csv"></i> Bulk Upload</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-com"><i class="fas fa-plus"></i> Add Factor Task</button>
                        </div>
                    </div>

                    <div class="filter-bar" id="com-filter-bar">
                        <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                        <input type="text" id="com-search" placeholder="Search factor tasks by commodity, factor or user..." />
                        <select id="com-type-filter">
                            <option value="">All Timings</option>
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Fortnightly">Fortnightly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Half-Yearly">Half-Yearly</option>
                            <option value="Yearly">Yearly</option>
                        </select>
                    </div>

                    <table class="data-table" id="com-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="commodity">Commodity <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="type">Task Timing <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Schedule Day</th>
                                <th class="sortable-header" data-sort="factor">Factor or Task <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="user">User <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Backup 1</th>
                                <th>Backup 2</th>
                                <th>Instructions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${items.map(i => `
                            <tr data-commodity="${escAttr(i.commodity)}" data-type="${escAttr(i.type)}" data-factor="${escAttr(i.factor)}" data-user="${escAttr(i.mode||i.primaryAssignee)}">
                                <td><strong>${App.escapeHtml(i.commodity)}</strong></td>
                                <td><span class="tag">${App.escapeHtml(i.type)}</span></td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.scheduleDay||'—')}</td>
                                <td>${App.escapeHtml(i.factor)}</td>
                                <td>${App.escapeHtml(i.mode||i.primaryAssignee||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup1||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup2||'—')}</td>
                                <td style="max-width:240px;">${this._instructionsCell(i.instructions, () => `App.modules.admin.showCommodityModal(${i.id})`)}</td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline" onclick="App.modules.admin.showCommodityModal(${i.id})">Edit</button>
                                        <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteCommodity(${i.id})">Remove</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                    ${items.length === 0 ? '<div class="empty-state"><i class="fas fa-cubes"></i><p>No Factor Tasks configured</p></div>' : ''}
                </div>
            `;
            this._comCache = items;
            this._wireFilterAndSort('com-table', 'com-search', { type: 'com-type-filter' }, 'commodity');
            document.getElementById('btn-add-com').addEventListener('click', () => this.showCommodityModal());
            document.getElementById('btn-com-sample').addEventListener('click', () => this.downloadSample('commodities'));
            document.getElementById('btn-com-bulk').addEventListener('click', () => this.switchTab('bulk'));
        } catch(e) { container.innerHTML = '<p class="error-text">Failed to load commodities</p>'; }
    },

    showCommodityModal(id = null) {
        const c = id ? (this._comCache || []).find(x => x.id === id) : null;
        // Free-text fallback for legacy rows whose "User" (mode) is a name not in the users table.
        const currentUser = c?.mode || c?.primaryAssignee || '';
        const userOptions = this._assigneeOptions(currentUser);
        const body = `
            <div class="form-grid">
                <div class="form-row"><label>Commodity *</label><input type="text" id="com-name" value="${App.escapeHtml(c?.commodity||'')}" style="width:100%;"></div>
                <div class="form-row"><label>Task Timing *</label>
                    <select id="com-type" style="width:100%;">
                        ${['Daily','Weekly','Fortnightly','Monthly','Quarterly','Half-Yearly','Yearly']
                            .map(o => `<option value="${o}" ${(c?.type||'').toLowerCase()===o.toLowerCase() ? 'selected':''}>${o}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <label>Schedule</label>
                <div id="com-schedule"></div>
            </div>
            <div class="form-row"><label>Factor or Task *</label><input type="text" id="com-factor" value="${App.escapeHtml(c?.factor||'')}" placeholder="e.g. Price, Arrival, Advance Estimates" style="width:100%;"></div>
            <div class="form-row"><label>User <span style="color:var(--text-muted); font-size:.75rem;">— who this Factor Task is assigned to (drives Tasks &amp; Roster visibility)</span></label>
                <select id="com-mode" style="width:100%;">${userOptions}</select>
            </div>
            <div class="form-row"><label>Source</label><input type="text" id="com-source" value="${App.escapeHtml(c?.source||'')}" placeholder="Optional" style="width:100%;"></div>
            <div class="form-grid">
                <div class="form-row"><label>Backup 1st</label>
                    <select id="com-backup1" style="width:100%;">${this._assigneeOptions(c?.backup1)}</select>
                </div>
                <div class="form-row"><label>Backup 2nd</label>
                    <select id="com-backup2" style="width:100%;">${this._assigneeOptions(c?.backup2)}</select>
                </div>
            </div>
            <div class="form-row">
                <label>Instructions <span style="color:var(--text-muted); font-size:.75rem;">(shown to users via the (i) button on Tasks &amp; Roster)</span></label>
                <textarea id="com-instructions" style="width:100%; min-height:60px;" placeholder="e.g. Use Agmarknet daily snapshot after 2pm">${App.escapeHtml(c?.instructions||'')}</textarea>
            </div>
        `;
        App.showModal(id ? 'Edit Factor Task' : 'Add Factor Task', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-com">Save</button>');
        setTimeout(() => {
            renderScheduleControl('com-type', 'com-schedule', c?.scheduleDay || '');
            document.getElementById('btn-save-com')?.addEventListener('click', async () => {
                const userVal = document.getElementById('com-mode').value;
                const payload = {
                    commodity: document.getElementById('com-name').value.trim(),
                    type: document.getElementById('com-type').value.trim(),
                    factor: document.getElementById('com-factor').value.trim(),
                    mode: userVal,                  // "User" field
                    primaryAssignee: userVal,       // mirror so legacy code paths still find the assignee
                    source: document.getElementById('com-source').value,
                    backup1: document.getElementById('com-backup1').value,
                    backup2: document.getElementById('com-backup2').value,
                    scheduleDay: readScheduleValue('com-schedule'),
                    instructions: document.getElementById('com-instructions').value,
                };
                if (!payload.commodity || !payload.type || !payload.factor) {
                    App.showToast('Commodity, type and factor are required', 'warning'); return;
                }
                try {
                    if (id) await api.put(`/admin/commodities/${id}`, payload);
                    else    await api.post('/admin/commodities', payload);
                    App.closeModal();
                    App.showToast('Saved', 'success');
                    this.loadTab();
                } catch(err) { App.showToast(err.message||'Failed','error'); }
            });
        }, 50);
    },

    async deleteCommodity(id) {
        if (!confirm('Remove this commodity?')) return;
        try { await api.delete(`/admin/commodities/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────  TASK TEMPLATES  ─────────────────────────
    async loadTasks(container) {
        try {
            const [data, users] = await Promise.all([api.get('/admin/tasks'), api.get('/admin/users')]);
            const items = data.data || [];
            this._userList = users.data || [];
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-tasks" style="color:var(--accent);margin-right:8px;"></i>Task Templates (${items.length})</h3>
                        <div class="btn-group">
                            <button class="btn btn-outline btn-sm" id="btn-task-sample"><i class="fas fa-download"></i> Sample CSV</button>
                            <button class="btn btn-outline btn-sm" id="btn-task-bulk"><i class="fas fa-file-csv"></i> Bulk Upload</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-task-tpl"><i class="fas fa-plus"></i> Add Task</button>
                        </div>
                    </div>

                    <div class="filter-bar" id="tasks-filter-bar">
                        <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                        <input type="text" id="tasks-search" placeholder="Search task templates by name or assignee..." />
                        <select id="tasks-rec-filter">
                            <option value="">All Recurrences</option>
                            <option value="daily">daily</option>
                            <option value="mon-fri">mon-fri</option>
                            <option value="weekly">weekly</option>
                            <option value="fortnightly">fortnightly</option>
                            <option value="monthly">monthly</option>
                            <option value="quarterly">quarterly</option>
                            <option value="half-yearly">half-yearly</option>
                            <option value="yearly">yearly</option>
                        </select>
                    </div>

                    <table class="data-table" id="tasks-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="name">Name <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="assignee">Assignee <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Backup 1st</th>
                                <th>Backup 2nd</th>
                                <th class="sortable-header" data-sort="recurrence">Recurrence <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Instructions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${items.map(i => `
                            <tr data-name="${escAttr(i.name)}" data-assignee="${escAttr(i.assignee)}" data-recurrence="${escAttr(i.recurrence)}">
                                <td><strong>${App.escapeHtml(i.name)}</strong></td>
                                <td>${App.escapeHtml(i.assignee||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup1||'—')}</td>
                                <td style="color:var(--text-muted);">${App.escapeHtml(i.backup2||'—')}</td>
                                <td><span class="tag">${i.recurrence}</span></td>
                                <td style="max-width:240px;">${this._instructionsCell(i.instructions, () => `App.modules.admin.showTaskModal(${i.id})`)}</td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline" onclick="App.modules.admin.showTaskModal(${i.id})">Edit/Assign</button>
                                        <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteTask(${i.id})">Remove</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                    ${items.length === 0 ? '<div class="empty-state"><i class="fas fa-tasks"></i><p>No task templates yet</p></div>' : ''}
                </div>
            `;
            this._taskCache = items;
            this._wireFilterAndSort('tasks-table', 'tasks-search', { recurrence: 'tasks-rec-filter' }, 'name');
            document.getElementById('btn-add-task-tpl').addEventListener('click', () => this.showTaskModal());
            document.getElementById('btn-task-sample').addEventListener('click', () => this.downloadSample('tasks'));
            document.getElementById('btn-task-bulk').addEventListener('click', () => this.switchTab('bulk'));
        } catch(e) { container.innerHTML = '<p class="error-text">Failed to load task templates</p>'; }
    },

    showTaskModal(id = null) {
        const t = id ? (this._taskCache || []).find(x => x.id === id) : null;
        const body = `
            <div class="form-row"><label>Task Name *</label><input type="text" id="tt-name" value="${App.escapeHtml(t?.name||'')}" style="width:100%;"></div>
            <div class="form-grid">
                <div class="form-row"><label>Assignee</label>
                    <select id="tt-assignee" style="width:100%;">${this._assigneeOptions(t?.assignee)}</select>
                </div>
                <div class="form-row"><label>Recurrence</label>
                    <select id="tt-rec" style="width:100%;">
                        ${['daily','mon-fri','weekly','fortnightly','monthly','quarterly','half-yearly','yearly'].map(f =>
                            `<option value="${f}" ${t?.recurrence===f?'selected':''}>${f}</option>`).join('')}
                    </select></div>
            </div>
            <div class="form-row">
                <label>Schedule</label>
                <div id="tt-schedule"></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Backup 1st</label>
                    <select id="tt-backup1" style="width:100%;">${this._assigneeOptions(t?.backup1)}</select>
                </div>
                <div class="form-row"><label>Backup 2nd</label>
                    <select id="tt-backup2" style="width:100%;">${this._assigneeOptions(t?.backup2)}</select>
                </div>
            </div>
            <div class="form-row">
                <label>Instructions <span style="color:var(--text-muted); font-size:.75rem;">(shown to users via the (i) button on Tasks &amp; Roster)</span></label>
                <textarea id="tt-instructions" style="width:100%; min-height:60px;" placeholder="e.g. Cross-check with NCDEX close before submitting">${App.escapeHtml(t?.instructions||'')}</textarea>
            </div>
        `;
        App.showModal(id ? 'Edit Task Template' : 'Add Task Template', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-tt">Save</button>');
        setTimeout(() => {
            renderScheduleControl('tt-rec', 'tt-schedule', t?.scheduleDay || '');
            document.getElementById('btn-save-tt')?.addEventListener('click', async () => {
                const payload = {
                    name: document.getElementById('tt-name').value.trim(),
                    assignee: document.getElementById('tt-assignee').value,
                    backup1: document.getElementById('tt-backup1').value,
                    backup2: document.getElementById('tt-backup2').value,
                    recurrence: document.getElementById('tt-rec').value,
                    scheduleDay: readScheduleValue('tt-schedule'),
                    instructions: document.getElementById('tt-instructions').value,
                };
                if (!payload.name) { App.showToast('Name required','warning'); return; }
                try {
                    if (id) await api.put(`/admin/tasks/${id}`, payload);
                    else    await api.post('/admin/tasks', payload);
                    App.closeModal();
                    App.showToast('Saved', 'success');
                    this.loadTab();
                } catch(err) { App.showToast(err.message||'Failed','error'); }
            });
        }, 50);
    },

    async deleteTask(id) {
        if (!confirm('Remove this task template?')) return;
        try { await api.delete(`/admin/tasks/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    // ─────────────────────────  ROSTER  ─────────────────────────
    async loadRoster(container) {
        try {
            const [data, users, matrixRes] = await Promise.all([
                api.get('/admin/roster'),
                api.get('/admin/users'),
                api.get('/roster/scrapper-matrix').catch(() => ({ success: false }))
            ]);
            const items = data.data || [];
            this._userList = users.data || [];
            const activeWeek = matrixRes?.activeWeek || 1;
            this._adminMatrixCache = matrixRes?.matrix || [];
            this._adminWeeksCount = matrixRes?.weeksCount || 5;
            this._adminDuties = matrixRes?.duties || [];
            this._adminPeople = matrixRes?.people || [];
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <!-- 1. Official Scrapper For REf.xlsx Master Plan -->
                <div class="glass-card" style="padding: 24px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                        <div>
                            <h3 class="card-title" style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-file-excel" style="color: #10b981;"></i>
                                <span>Scrapper For REf.xlsx Master Rotation Plan</span>
                                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .75rem;">
                                    Reference Matrix
                                </span>
                                <span class="badge" id="admin-scrapper-active-badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: .75rem; font-weight: 700;">
                                    Active: Week ${activeWeek}${matrixRes?.dateMeta?.currentMonth ? ` · ${matrixRes.dateMeta.currentMonth}` : ''}
                                </span>
                            </h3>
                            <p style="font-size: .83rem; color: var(--text-muted); margin: 4px 0 0;">
                                ${matrixRes?.duties?.length || 5}-Duty Operational Schedule, Tuesday Multi-Zone Rake Movement, and Monthly Macro Duties.
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" id="btn-admin-random-assign" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); border: none; font-weight: 700; box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);">
                                <i class="fas fa-dice"></i> Randomly Assign Duties
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-admin-monthly-view" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);" title="View rolling monthly schedule">
                                <i class="fas fa-calendar-alt"></i> Monthly View
                            </button>
                            <div style="display: flex; background: rgba(255,255,255,0.05); padding: 3px; border-radius: 8px; border: 1px solid var(--border);" id="admin-scrapper-week-pills">
                                ${Array.from({ length: matrixRes?.weeksCount || 5 }, (_, i) => i + 1).map(w => `
                                    <button class="btn btn-sm btn-ghost admin-week-btn ${w === activeWeek ? 'active' : ''}" data-week="${w}" style="font-size: .75rem; padding: 4px 10px; border-radius: 6px; ${w === activeWeek ? 'background:#3b82f6; color:#fff; font-weight:700;' : ''}">
                                        W${w}
                                    </button>
                                `).join('')}
                            </div>
                            <button class="btn btn-primary btn-sm" id="btn-admin-apply-week">
                                <i class="fas fa-sync-alt"></i> Apply Week to Live Roster
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-admin-edit-matrix" style="color: #60a5fa; border-color: rgba(96,165,250,0.4);" title="Manual edit matrix assignments">
                                <i class="fas fa-edit"></i> Edit Rotation Matrix
                            </button>
                        </div>
                    </div>

                    <!-- Dynamic Weeks Table -->
                    <div style="overflow-x: auto; margin-bottom: 18px;">
                        <table class="crishi-table" id="admin-scrapper-matrix-table" style="text-align: center; font-size: .82rem;">
                            <thead>
                                <tr>
                                    <th style="text-align: left; width: 170px;">Role / Duty</th>
                                    ${Array.from({ length: matrixRes?.weeksCount || 5 }, (_, i) => i + 1).map(w => {
                                        const wInfo = matrixRes?.dateMeta?.weeksInfo?.find(x => x.week === w);
                                        const rangeStr = wInfo ? `<div style="font-size: .66rem; font-weight: 400; color: #94a3b8; margin-top: 2px;">${wInfo.date_range}</div>` : '';
                                        return `<th class="adm-sc-col" data-week="${w}" style="width: 110px;">Week ${w}${rangeStr}</th>`;
                                    }).join('')}
                                    <th style="text-align: left; width: 140px;">Timing Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(matrixRes?.matrix || [
                                    { role: 'AW', weeks: { 1: 'Bhawna', 2: 'Gopi', 3: 'Nishant', 4: 'Bhawna', 5: 'Pankaj' }, defaultTiming: 'Do after 6:30 PM' },
                                    { role: 'Retail / Wholesale', weeks: { 1: 'Gopi', 2: 'Pankaj', 3: 'Gopi', 4: 'Pankaj', 5: 'Bhawna' }, defaultTiming: 'Daily 18:00 IST' },
                                    { role: 'NCDEX', weeks: { 1: 'Nitesh', 2: 'Nitesh', 3: 'Bhawna', 4: 'Nishant', 5: 'Nitesh' }, defaultTiming: 'Do after 4:30 PM' },
                                    { role: 'Currency', weeks: { 1: 'Nishant', 2: 'Nishant', 3: 'Pankaj', 4: 'Nitesh', 5: 'Nishant' }, defaultTiming: 'Do after 2:00 PM' },
                                    { role: 'CME', weeks: { 1: 'Pankaj', 2: 'Bhawna', 3: 'Nitesh', 4: 'Gopi', 5: 'Gopi' }, defaultTiming: 'Daily Evening' }
                                ]).map(row => {
                                    const weeksHtml = Array.from({ length: matrixRes?.weeksCount || 5 }, (_, i) => i + 1).map(w => {
                                        const ass = (row.weeks && (row.weeks[w] || row.weeks[String(w)])) || 'Unassigned';
                                        return `<td class="adm-sc-cell" data-week="${w}"><strong>${ass}</strong></td>`;
                                    }).join('');
                                    return `
                                        <tr>
                                            <td style="text-align: left; font-weight: 700; color: #38bdf8;">${row.role}</td>
                                            ${weeksHtml}
                                            <td style="text-align: left;"><code style="font-size: .72rem; color: #10b981;">${row.defaultTiming || ''}</code></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Tuesday Zones & Monthly Rotation Badges -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 14px; background: rgba(255,255,255,0.02); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-weight: 700; font-size: .83rem; color: #60a5fa; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span><i class="fas fa-train" style="margin-right: 5px;"></i> Every Tuesday Update — RakeMovement Zones:</span>
                                    ${matrixRes?.dateMeta?.rakeMovementFormatted ? `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: .7rem; padding: 2px 7px;"><i class="fas fa-calendar-day" style="margin-right: 3px;"></i>Next Due: ${matrixRes.dateMeta.rakeMovementFormatted}</span>` : ''}
                                </div>
                                <button class="btn btn-outline btn-sm" id="btn-admin-edit-rake" style="padding: 2px 7px; font-size: .72rem; color: #60a5fa; border-color: rgba(96,165,250,0.35);">
                                    <i class="fas fa-edit"></i> Edit Zones
                                </button>
                            </div>
                            <div style="font-size: .78rem; line-height: 1.7; color: var(--text-secondary);">
                                ${(matrixRes?.rakeMovement || [
                                    { person: 'Nishant', zones: 'ER, KR, NC, NE', status: 'Active' },
                                    { person: 'Gopi', zones: 'SEC, SE, SW, SCOR, NF, SR, WC, WR', status: 'Active' },
                                    { person: 'Pankaj', zones: 'CR, DFCR, EC, ECO', status: 'Active' },
                                    { person: 'Bhawna', zones: 'SC, NPLR, NW, NR', status: 'Active' },
                                    { person: 'Nitesh', zones: 'None', status: 'Exempt' }
                                ]).map(r => `
                                    <div style="margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                                        <div>• <strong>${r.person}:</strong> <span class="badge" style="background:rgba(56,189,248,0.12); color:#38bdf8; font-size: .72rem;">${r.zones}</span></div>
                                        <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); font-size: .68rem;">
                                            <i class="fas fa-calendar-day" style="margin-right: 3px;"></i>${r.dayDate || (r.status === 'Exempt' ? 'Exempt' : 'Tuesday')}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-weight: 700; font-size: .83rem; color: #c084fc;">
                                    <i class="fas fa-calendar-check" style="margin-right: 5px;"></i> Every Month Macro Duties:
                                </div>
                                <button class="btn btn-outline btn-sm" id="btn-admin-edit-monthly" style="padding: 2px 7px; font-size: .72rem; color: #c084fc; border-color: rgba(168,85,247,0.35);">
                                    <i class="fas fa-edit"></i> Edit Duties
                                </button>
                            </div>
                            <div style="font-size: .78rem; line-height: 1.7; color: var(--text-secondary);">
                                ${(matrixRes?.monthlyRotation || [
                                    { duty: 'WPI', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'One person each month, then rotates sequentially.' },
                                    { duty: 'CPI', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'Same assignee who handles WPI for that active month.' },
                                    { duty: 'AW Report', assignedPerson: 'Gopi', dueDay: '5th', nextDueDate: '05-Nov-2026', rule: 'One person each month other than WPI/CPI assignee.' }
                                ]).map(d => `
                                    <div>• <strong>${d.duty} (${d.dueDay || '15th'}):</strong> Assigned to <strong style="color: #60a5fa;">${d.assignedPerson}</strong> ${d.nextDueDate ? `<span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .68rem;">Next: ${d.nextDueDate}</span>` : ''}</div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2. Live Editable Roster Duties -->
                <div class="glass-card" style="padding: 24px; margin-bottom: 20px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-user-clock" style="color:var(--accent);margin-right:8px;"></i>Configured Live Roster Duties (${items.length})</h3>
                        <div class="btn-group">
                            <button class="btn btn-outline btn-sm" id="btn-ros-sample"><i class="fas fa-download"></i> Sample CSV</button>
                            <button class="btn btn-outline btn-sm" id="btn-ros-bulk"><i class="fas fa-file-csv"></i> Bulk Upload</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-ros"><i class="fas fa-plus"></i> Add Roster</button>
                        </div>
                    </div>

                    <div class="filter-bar" id="roster-filter-bar">
                        <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                        <input type="text" id="roster-search" placeholder="Search roster by role or employee..." />
                        <select id="roster-freq-filter">
                            <option value="">All Frequencies</option>
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Fortnightly">Fortnightly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Half-Yearly">Half-Yearly</option>
                            <option value="Yearly">Yearly</option>
                        </select>
                    </div>

                    <table class="data-table" id="roster-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="role">Role <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="employee">Employee <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="freq">Frequency <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th>Instructions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${items.map(i => `
                            <tr data-role="${escAttr(i.role)}" data-employee="${escAttr(i.employee)}" data-freq="${escAttr(i.frequency)}">
                                <td><strong>${App.escapeHtml(i.role)}</strong></td>
                                <td>${App.escapeHtml(i.employee)}</td>
                                <td><span class="tag">${i.frequency}</span></td>
                                <td style="max-width:240px;">${this._instructionsCell(i.remark, () => `App.modules.admin.showRosterModal(${i.id})`)}</td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline" onclick="App.modules.admin.showRosterModal(${i.id})">Edit</button>
                                        <button class="btn btn-sm btn-danger" onclick="App.modules.admin.deleteRoster(${i.id})">Remove</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                    ${items.length === 0 ? '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No roster entries</p></div>' : ''}
                </div>

                <!-- 3. Roster Audit Trail & Activity Logs -->
                <div class="glass-card" style="padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                        <h3 class="card-title" style="margin: 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-history" style="color: #10b981;"></i>
                            <span>Roster Audit Trail & Activity Logs</span>
                            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .72rem;">Saved to DB</span>
                        </h3>
                        <button class="btn btn-outline btn-sm" id="btn-admin-refresh-ros-logs" style="font-size: .74rem;">
                            <i class="fas fa-sync-alt"></i> Refresh Logs
                        </button>
                    </div>

                    <table class="data-table" id="admin-roster-logs-table">
                        <thead>
                            <tr>
                                <th style="width: 140px;">Timestamp</th>
                                <th style="width: 180px;">Event / Role</th>
                                <th style="width: 140px;">Assignee / Actor</th>
                                <th style="width: 100px;">Type</th>
                                <th style="width: 120px;">Status</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody id="admin-roster-logs-tbody">
                            <tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading activity logs...</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            this._rosCache = items;
            this._selectedAdminWeek = activeWeek;
            this._adminMatrixCache = matrixRes?.matrix || [];
            this._adminRakeCache = matrixRes?.rakeMovement || [];
            this._adminMonthlyCache = matrixRes?.monthlyRotation || [];

            // Highlight column in scrapper matrix table
            const highlightAdminWeek = (w) => {
                this._selectedAdminWeek = w;
                const badge = document.getElementById('admin-scrapper-active-badge');
                const mSuffix = matrixRes?.dateMeta?.currentMonth ? ` · ${matrixRes.dateMeta.currentMonth}` : '';
                if (badge) badge.innerHTML = `<i class="fas fa-calendar-check" style="margin-right: 4px;"></i> Active: Week ${w}${mSuffix}`;

                document.querySelectorAll('#admin-scrapper-week-pills .admin-week-btn').forEach(b => {
                    const bw = parseInt(b.dataset.week, 10);
                    b.classList.toggle('active', bw === w);
                    b.style.background = (bw === w) ? '#3b82f6' : '';
                    b.style.color = (bw === w) ? '#fff' : '';
                    b.style.fontWeight = (bw === w) ? '700' : '';
                });

                document.querySelectorAll('#admin-scrapper-matrix-table .adm-sc-col, #admin-scrapper-matrix-table .adm-sc-cell').forEach(c => {
                    const cw = parseInt(c.dataset.week, 10);
                    if (cw === w) {
                        c.style.background = 'rgba(96, 165, 250, 0.14)';
                        c.style.borderLeft = '2px solid #3b82f6';
                        c.style.borderRight = '2px solid #3b82f6';
                    } else {
                        c.style.background = '';
                        c.style.borderLeft = '';
                        c.style.borderRight = '';
                    }
                });
            };

            highlightAdminWeek(activeWeek);

            document.querySelectorAll('#admin-scrapper-week-pills .admin-week-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const w = parseInt(btn.dataset.week, 10);
                    highlightAdminWeek(w);
                });
            });

            document.getElementById('btn-admin-apply-week')?.addEventListener('click', async () => {
                const w = this._selectedAdminWeek || 1;
                try {
                    const res = await api.post('/roster/apply-week', { week: w });
                    if (res && res.success) {
                        App.showToast(res.message || `Roster plan synced to Week ${w}`, 'success');
                        this.loadRoster(container);
                    } else {
                        App.showToast(res?.message || 'Failed to apply week', 'error');
                    }
                } catch(e) {
                    App.showToast('Error applying week to roster.', 'error');
                }
            });

            document.getElementById('btn-admin-random-assign')?.addEventListener('click', async () => {
                try {
                    const res = await api.post('/roster/generate-random', {});
                    if (res && res.success) {
                        App.showToast('Complete conflict-free roster randomly generated and saved!', 'success');
                        this.loadRoster(container);
                    } else {
                        App.showToast(res?.message || 'Cannot generate schedule.', 'error');
                    }
                } catch(e) {
                    App.showToast(e.message || 'Error generating schedule.', 'error');
                }
            });

            document.getElementById('btn-admin-monthly-view')?.addEventListener('click', async () => {
                try {
                    const res = await api.get('/roster/monthly-schedule');
                    if (!res || !res.success) {
                        App.showToast('Failed to load monthly schedule.', 'error');
                        return;
                    }
                    const weeks = res.weeks || [];
                    const duties = res.duties || [];
                    const currentMonth = res.currentMonth;
                    const nextMonth = res.nextMonth;

                    const body = `
                        <div>
                            <div style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
                                <strong>Rolling Monthly View: ${currentMonth} → ${nextMonth} (1st Week)</strong>
                                <div style="font-size: .8rem; color: var(--text-secondary); margin-top: 3px;">
                                    Weekly schedule continues sequentially into next month's 1st week without rotation gaps.
                                </div>
                            </div>
                            <div style="overflow-x: auto;">
                                <table class="crishi-table" style="font-size: .8rem; text-align: center; width: 100%;">
                                    <thead>
                                        <tr>
                                            <th style="text-align: left;">Week</th>
                                            <th style="text-align: left;">Date Range</th>
                                            <th>Cycle Week</th>
                                            ${duties.map(d => `<th>${App.escapeHtml(d)}</th>`).join('')}
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${weeks.map(w => `
                                            <tr style="${w.isNextMonthFirstWeek ? 'background: rgba(168, 85, 247, 0.08); font-weight: 700;' : (w.isCurrent ? 'background: rgba(59, 130, 246, 0.1);' : '')}">
                                                <td style="text-align: left;">Week ${w.weekNumber}</td>
                                                <td style="text-align: left;">${w.dateRange}</td>
                                                <td><span class="badge">${w.cycleLabel}</span></td>
                                                ${duties.map(d => `<td><strong>${App.escapeHtml(w.assignments?.[d] || '')}</strong></td>`).join('')}
                                                <td>
                                                    ${w.isNextMonthFirstWeek ? '<span class="badge" style="background:#a855f7; color:#fff;">Next Mo W1</span>' : (w.isCurrent ? '<span class="badge" style="background:#3b82f6; color:#fff;">Active</span>' : w.month)}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    App.showModal(`Monthly View: ${currentMonth} to ${nextMonth} 1st Week`, body, '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>', 'modal-xl');
                } catch(e) {
                    App.showToast('Error loading monthly schedule view.', 'error');
                }
            });

            document.getElementById('btn-admin-edit-matrix')?.addEventListener('click', () => this.showAdminEditMatrixModal(container));
            document.getElementById('btn-admin-edit-rake')?.addEventListener('click', () => this.showAdminEditRakeModal(container));
            document.getElementById('btn-admin-edit-monthly')?.addEventListener('click', () => this.showAdminEditMonthlyModal(container));
            document.getElementById('btn-admin-refresh-ros-logs')?.addEventListener('click', () => this.loadAdminRosterLogs());

            this._wireFilterAndSort('roster-table', 'roster-search', { freq: 'roster-freq-filter' }, 'role');
            document.getElementById('btn-add-ros').addEventListener('click', () => this.showRosterModal());
            document.getElementById('btn-ros-sample').addEventListener('click', () => this.downloadSample('roster'));
            document.getElementById('btn-ros-bulk').addEventListener('click', () => this.switchTab('bulk'));

            // Load roster activity logs
            this.loadAdminRosterLogs();
        } catch(e) {
            console.error('Error loading roster:', e);
            container.innerHTML = '<p class="error-text">Failed to load roster</p>';
        }
    },

    showRosterModal(id = null) {
        const r = id ? (this._rosCache || []).find(x => x.id === id) : null;
        const body = `
            <div class="form-grid">
                <div class="form-row"><label>Role *</label><input type="text" id="ros-role" value="${App.escapeHtml(r?.role||'')}" style="width:100%;"></div>
                <div class="form-row"><label>Employee *</label>
                    <select id="ros-emp" style="width:100%;">${this._assigneeOptions(r?.employee)}</select>
                </div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Frequency</label>
                    <select id="ros-freq" style="width:100%;">
                        ${['Daily','Weekly','Fortnightly','Monthly','Quarterly','Half-Yearly','Yearly'].map(f => `<option value="${f}" ${r?.frequency===f?'selected':''}>${f}</option>`).join('')}
                    </select></div>
                <div class="form-row"><label>Instructions <span style="color:var(--text-muted); font-size:.7rem;">(shown via (i) on Today)</span></label><input type="text" id="ros-remark" value="${App.escapeHtml(r?.remark||'')}" placeholder="e.g. Do after 6:30" style="width:100%;"></div>
            </div>
            <div class="form-row">
                <label>Schedule</label>
                <div id="ros-schedule"></div>
            </div>
        `;
        App.showModal(id ? 'Edit Roster' : 'Add Roster', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-ros">Save</button>');
        setTimeout(() => {
            renderScheduleControl('ros-freq', 'ros-schedule', r?.scheduleDay || '');
            document.getElementById('btn-save-ros')?.addEventListener('click', async () => {
                const payload = {
                    role: document.getElementById('ros-role').value.trim(),
                    employee: document.getElementById('ros-emp').value,
                    frequency: document.getElementById('ros-freq').value,
                    scheduleDay: readScheduleValue('ros-schedule'),
                    remark: document.getElementById('ros-remark').value,
                };
                if (!payload.role || !payload.employee) { App.showToast('Role and employee required','warning'); return; }
                try {
                    if (id) await api.put(`/admin/roster/${id}`, payload);
                    else    await api.post('/admin/roster', payload);
                    App.closeModal();
                    App.showToast('Saved', 'success');
                    this.loadTab();
                } catch(err) { App.showToast(err.message||'Failed','error'); }
            });
        }, 50);
    },

    async deleteRoster(id) {
        if (!confirm('Remove this roster entry?')) return;
        try { await api.delete(`/admin/roster/${id}`); App.showToast('Removed', 'success'); this.loadTab(); }
        catch(err) { App.showToast(err.message || 'Failed', 'error'); }
    },

    async loadAdminRosterLogs() {
        const tbody = document.getElementById('admin-roster-logs-tbody');
        if (!tbody) return;
        try {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Refreshing logs from database...</td></tr>`;
            const res = await api.get('/roster/logs');
            if (res && res.success && res.logs) {
                if (res.logs.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No roster logs recorded yet. Apply a rotation week or edit duties to log activity.</td></tr>`;
                    return;
                }
                tbody.innerHTML = res.logs.map(log => {
                    const isAudit = log.type === 'Plan Event';
                    const statusBadge = isAudit 
                        ? `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-size: .7rem;">${log.status}</span>`
                        : `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .7rem;">${log.status}</span>`;
                    
                    return `
                        <tr>
                            <td style="font-family: monospace; font-size: .74rem; color: var(--text-muted);">${log.timestamp || log.date}</td>
                            <td><strong style="color: var(--text-primary);">${App.escapeHtml(log.role || log.event || '')}</strong></td>
                            <td>
                                <div class="user-avatar-chip">
                                    <span class="avatar-circle">${(log.employee || 'U').charAt(0).toUpperCase()}</span>
                                    <span>${App.escapeHtml(log.employee || 'System')}</span>
                                </div>
                            </td>
                            <td><span class="tag" style="font-size: .7rem;">${App.escapeHtml(log.type || '')}</span></td>
                            <td>${statusBadge}</td>
                            <td style="color: var(--text-secondary); font-size: .75rem;">${App.escapeHtml(log.details || `Updated duty status on ${log.date}`)}</td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (e) {
            console.error('Error loading admin roster logs:', e);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load roster activity logs.</td></tr>`;
        }
    },

    showAdminEditMatrixModal(container) {
        const teammates = this._adminPeople && this._adminPeople.length ? this._adminPeople : ['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj'];
        const current = this._adminMatrixCache && this._adminMatrixCache.length ? this._adminMatrixCache : [];
        const weeksCount = parseInt(this._adminWeeksCount || 5, 10);
        const weeksArr = Array.from({ length: weeksCount }, (_, i) => i + 1);

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .83rem; margin-bottom: 14px;">
                    Customize the ${weeksCount}-Week Operational Duty Rotation Matrix. Assignments are saved to database and used when applying weekly schedules.
                </p>
                <div style="overflow-x: auto; max-height: 480px;">
                    <table class="roster-compact-table" style="font-size: .8rem; width: 100%;">
                        <thead>
                            <tr>
                                <th style="width: 140px; text-align: left;">Role / Duty</th>
                                ${weeksArr.map(w => `<th style="text-align: center;">Week ${w}</th>`).join('')}
                                <th style="width: 130px; text-align: left;">Timing Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${current.map((item, idx) => `
                                <tr data-role-idx="${idx}">
                                    <td style="text-align: left;">
                                        <strong>${App.escapeHtml(item.role)}</strong>
                                    </td>
                                    ${weeksArr.map(w => {
                                        const selUser = (item.weeks && (item.weeks[w] || item.weeks[String(w)])) || 'Unassigned';
                                        return `
                                            <td style="text-align: center;">
                                                <select class="sc-matrix-select" data-role-idx="${idx}" data-week="${w}" style="font-size: .75rem; padding: 3px 5px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                                                    ${teammates.map(t => `<option value="${App.escapeHtml(t)}" ${t === selUser ? 'selected' : ''}>${App.escapeHtml(t)}</option>`).join('')}
                                                </select>
                                            </td>
                                        `;
                                    }).join('')}
                                    <td style="text-align: left;">
                                        <input type="text" class="sc-matrix-timing" data-role-idx="${idx}" value="${App.escapeHtml(item.defaultTiming || '')}" style="font-size: .75rem; padding: 3px 6px; width: 100%; border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-admin-matrix-modal">
                <i class="fas fa-save"></i> Save Rotation Plan
            </button>
        `;

        App.showModal('Edit Scrapper 6-Week Rotation Matrix', body, footer);

        document.getElementById('btn-save-admin-matrix-modal')?.addEventListener('click', async () => {
            const updated = JSON.parse(JSON.stringify(current));
            document.querySelectorAll('.sc-matrix-select').forEach(sel => {
                const rIdx = parseInt(sel.dataset.roleIdx, 10);
                const w = parseInt(sel.dataset.week, 10);
                if (!updated[rIdx].weeks) updated[rIdx].weeks = {};
                updated[rIdx].weeks[w] = sel.value;
            });
            document.querySelectorAll('.sc-matrix-timing').forEach(inp => {
                const rIdx = parseInt(inp.dataset.roleIdx, 10);
                updated[rIdx].defaultTiming = inp.value;
            });

            try {
                const res = await api.put('/roster/scrapper-matrix', { matrix: updated });
                if (res && res.success) {
                    App.showToast('Scrapper Rotation Matrix updated and saved successfully!', 'success');
                    App.closeModal();
                    this.loadRoster(container);
                } else {
                    App.showToast(res?.message || 'Failed to save matrix', 'error');
                }
            } catch (e) {
                console.error('Error saving scrapper matrix:', e);
                App.showToast('Error saving scrapper matrix.', 'error');
            }
        });
    },

    showAdminEditRakeModal(container) {
        const list = this._adminRakeCache && this._adminRakeCache.length ? this._adminRakeCache : [
            { person: 'Nishant', zones: 'ER, KR, NC, NE', zoneNames: 'Eastern Railway, Konkan Railway, North Central Railway, North Eastern Railway', status: 'Active' },
            { person: 'Gopi', zones: 'SEC, SE, SW, SCOR, NF, SR, WC, WR', zoneNames: 'South East Central, SE, SW, South Coast, NF, Southern, West Central, Western', status: 'Active' },
            { person: 'Pankaj', zones: 'CR, DFCR, EC, ECO', zoneNames: 'Central Railway, Dedicated Freight Corridor, East Central, East Coast', status: 'Active' },
            { person: 'Bhawna', zones: 'SC, NPLR, NW, NR', zoneNames: 'South Central, Northern Port Lines (Pipavav/Mundra), North Western, Northern', status: 'Active' },
            { person: 'Nitesh', zones: 'None', zoneNames: 'Dedicated portfolio: Bajra, Barley, Maize, Sugar', status: 'Exempt' }
        ];

        const currentItem = list[0];
        const allZones = ['CR', 'ER', 'EC', 'ECO', 'KR', 'NC', 'NE', 'NF', 'NR', 'NW', 'SC', 'SE', 'SEC', 'SR', 'SW', 'SCOR', 'WC', 'WR', 'DFCR', 'NPLR'];

        const body = `
            <div>
                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Select Teammate</label>
                    <select id="modal-admin-rake-person" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        ${list.map(r => `<option value="${r.person}" ${(currentItem && currentItem.person === r.person) ? 'selected' : ''}>${r.person} (${r.status === 'Exempt' ? 'Exempt' : r.zones})</option>`).join('')}
                        <option value="New Person">+ Add Other Teammate</option>
                    </select>
                </div>

                <div id="modal-admin-rake-custom-row" style="display: none; margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Person Name</label>
                    <input type="text" id="modal-admin-rake-custom-person" placeholder="e.g. Rahul" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Status</label>
                    <select id="modal-admin-rake-status" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        <option value="Active" ${currentItem?.status !== 'Exempt' ? 'selected' : ''}>Active (Assigned Railway Zones)</option>
                        <option value="Exempt" ${currentItem?.status === 'Exempt' ? 'selected' : ''}>Exempt (None / Dedicated Commodity)</option>
                    </select>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Assigned Zones (Comma Separated)</label>
                    <input type="text" id="modal-admin-rake-zones" value="${currentItem?.zones || ''}" placeholder="e.g. ER, KR, NC, NE" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                    <div style="font-size: .72rem; color: var(--text-muted); margin-top: 4px;">Click any zone badge below to toggle it on/off:</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
                        ${allZones.map(z => `
                            <button type="button" class="btn btn-sm btn-ghost btn-admin-toggle-zone" data-zone="${z}" style="font-size: .7rem; padding: 2px 7px; border: 1px solid var(--border); border-radius: 4px;">
                                ${z}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Full Zone Names & Notes</label>
                    <input type="text" id="modal-admin-rake-names" value="${currentItem?.zoneNames || ''}" placeholder="e.g. Eastern Railway, Konkan Railway" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-admin-rake-modal">
                <i class="fas fa-save"></i> Save Railway Zones
            </button>
        `;

        App.showModal('Edit Tuesday RakeMovement Zones', body, footer);

        const personSel = document.getElementById('modal-admin-rake-person');
        const customRow = document.getElementById('modal-admin-rake-custom-row');
        const zonesInp = document.getElementById('modal-admin-rake-zones');
        const namesInp = document.getElementById('modal-admin-rake-names');
        const statusSel = document.getElementById('modal-admin-rake-status');

        personSel?.addEventListener('change', () => {
            if (personSel.value === 'New Person') {
                customRow.style.display = 'block';
                zonesInp.value = '';
                namesInp.value = '';
                statusSel.value = 'Active';
            } else {
                customRow.style.display = 'none';
                const found = list.find(x => x.person.toLowerCase() === personSel.value.toLowerCase());
                if (found) {
                    zonesInp.value = found.zones || '';
                    namesInp.value = found.zoneNames || '';
                    statusSel.value = found.status || 'Active';
                }
            }
        });

        document.querySelectorAll('.btn-admin-toggle-zone').forEach(btn => {
            btn.addEventListener('click', () => {
                const zone = btn.dataset.zone;
                let currentZones = zonesInp.value.split(',').map(s => s.trim()).filter(Boolean);
                if (currentZones.includes(zone)) {
                    currentZones = currentZones.filter(z => z !== zone);
                } else {
                    currentZones.push(zone);
                }
                zonesInp.value = currentZones.join(', ');
            });
        });

        document.getElementById('btn-save-admin-rake-modal')?.addEventListener('click', async () => {
            const finalPerson = personSel.value === 'New Person' ? document.getElementById('modal-admin-rake-custom-person')?.value.trim() : personSel.value;
            if (!finalPerson) {
                App.showToast('Please specify a person name.', 'error');
                return;
            }

            try {
                const res = await api.put('/roster/rake-zones', {
                    person: finalPerson,
                    zones: zonesInp.value.trim() || 'None',
                    zoneNames: namesInp.value.trim(),
                    status: statusSel.value
                });
                if (res && res.success) {
                    App.showToast(res.message || 'Railway zones updated successfully!', 'success');
                    App.closeModal();
                    this.loadRoster(container);
                } else {
                    App.showToast(res?.message || 'Failed to update zones', 'error');
                }
            } catch (e) {
                console.error('Error saving rake zones:', e);
                App.showToast('Error saving rake zones.', 'error');
            }
        });
    },

    async showAdminEditMonthlyModal(container) {
        let teammates = ['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj'];
        try {
            if (this._userList && this._userList.length) {
                const active = this._userList.filter(u => u.active !== false).map(u => u.name || u.email);
                if (active.length) teammates = active;
            } else {
                const res = await api.get('/admin/users');
                if (res && res.data && res.data.length) {
                    this._userList = res.data;
                    const active = res.data.filter(u => u.active !== false).map(u => u.name || u.email);
                    if (active.length) teammates = active;
                }
            }
        } catch (e) {
            console.warn('Could not fetch active users for monthly modal, using fallback', e);
        }
        if (!teammates || !teammates.length) {
            teammates = ['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj'];
        }
        const current = this._adminMonthlyCache && this._adminMonthlyCache.length ? this._adminMonthlyCache : [
            { duty: 'WPI', fullName: 'Wholesale Price Index Macro Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'One person each month, then rotates sequentially.' },
            { duty: 'CPI', fullName: 'Consumer Price Index Inflation Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'Same assignee who handles WPI for that active month.' },
            { duty: 'AW Report', fullName: 'Agricultural Weather Monthly In-Depth Review', assignedPerson: 'Gopi', dueDay: '5th', nextDueDate: '05-Nov-2026', rule: 'One person each month other than WPI/CPI assignee.' }
        ];

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .83rem; margin-bottom: 14px;">
                    Assign teammates and set target due dates for monthly macro surveillance duties.
                </p>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    ${current.map((d, idx) => `
                        <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px;">
                            <strong style="color: #60a5fa; font-size: .9rem; display: block; margin-bottom: 8px;">
                                ${App.escapeHtml(d.duty)} — ${App.escapeHtml(d.fullName || d.duty)}
                            </strong>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Assigned Person</label>
                                    <select class="admin-monthly-person-select" data-idx="${idx}" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                        ${teammates.map(t => `<option value="${t}" ${t === d.assignedPerson ? 'selected' : ''}>${t}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Due Day</label>
                                    <input type="text" class="admin-monthly-day-input" data-idx="${idx}" value="${App.escapeHtml(d.dueDay || '15th')}" placeholder="e.g. 15th" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                </div>
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Next Due Date</label>
                                    <input type="text" class="admin-monthly-date-input" data-idx="${idx}" value="${App.escapeHtml(d.nextDueDate || '15-Nov-2026')}" placeholder="e.g. 15-Nov-2026" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-admin-monthly-modal">
                <i class="fas fa-save"></i> Save Monthly Duties
            </button>
        `;

        App.showModal('Edit Every Month Macro Duties', body, footer);

        document.getElementById('btn-save-admin-monthly-modal')?.addEventListener('click', async () => {
            const updated = JSON.parse(JSON.stringify(current));
            document.querySelectorAll('.admin-monthly-person-select').forEach(sel => {
                const idx = parseInt(sel.dataset.idx, 10);
                updated[idx].assignedPerson = sel.value;
            });
            document.querySelectorAll('.admin-monthly-day-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx, 10);
                updated[idx].dueDay = inp.value;
            });
            document.querySelectorAll('.admin-monthly-date-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx, 10);
                updated[idx].nextDueDate = inp.value;
            });

            try {
                const res = await api.put('/roster/monthly-duties', { duties: updated });
                if (res && res.success) {
                    App.showToast(res.message || 'Monthly macro duties updated successfully!', 'success');
                    App.closeModal();
                    this.loadRoster(container);
                } else {
                    App.showToast(res?.message || 'Failed to update monthly duties', 'error');
                }
            } catch (e) {
                console.error('Error saving monthly duties:', e);
                App.showToast('Error saving monthly duties.', 'error');
            }
        });
    },

    // ─────────────────────────  BULK CSV IMPORT  ─────────────────────────
    async loadBulk(container) {
        const kinds = [
            { key: 'reports',       label: 'Reports',        icon: 'file-pdf',  desc: 'Bulk-add MIS reports (name, frequency, primary assignee, deadline).' },
            { key: 'report-groups', label: 'Report Merging', icon: 'object-group', desc: 'Bulk-add merge groups. Members are pipe-separated inside a CSV cell (e.g. Tur|Urad|Moong).' },
            { key: 'tasks',         label: 'Task Templates', icon: 'tasks',     desc: 'Bulk-add recurring task templates.' },
            { key: 'commodities',   label: 'Factor Task',    icon: 'cubes',     desc: 'Bulk-add Factor Tasks (commodity, task timing, factor or task, user, source).' },
            { key: 'roster',        label: 'Roster',         icon: 'calendar-alt', desc: 'Bulk-add roster duty assignments.' },
        ];
        container.innerHTML = `
            <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                <div class="card-header"><h3 class="card-title"><i class="fas fa-file-csv" style="color:var(--accent); margin-right:8px;"></i>Bulk CSV Import</h3></div>
                <p style="font-size:.85rem; color:var(--text-muted);">
                    Upload a CSV to add many rows at once. Always download the <strong>Sample CSV</strong> first
                    to see the exact column names — the importer uses the header row to map columns. Rows missing
                    required fields are skipped (no rollback).
                </p>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
                ${kinds.map(k => `
                    <div class="glass-card" style="padding:18px;">
                        <h4 style="font-size:.95rem; font-weight:700; margin-bottom:6px;">
                            <i class="fas fa-${k.icon}" style="color:var(--accent); margin-right:6px;"></i>${k.label}
                        </h4>
                        <p style="font-size:.78rem; color:var(--text-muted); min-height:54px; margin-bottom:10px;">${k.desc}</p>
                        <input type="file" accept=".csv,text/csv" id="csv-file-${k.key}" style="width:100%; font-size:.8rem; margin-bottom:10px;">
                        <div class="btn-group" style="flex-wrap:wrap;">
                            <button class="btn btn-outline btn-sm" data-sample="${k.key}"><i class="fas fa-download"></i> Sample</button>
                            <button class="btn btn-primary btn-sm" data-upload="${k.key}"><i class="fas fa-upload"></i> Upload</button>
                            ${k.key === 'reports' || k.key === 'report-groups' || k.key === 'tasks' || k.key === 'commodities' || k.key === 'roster'
                                ? `<button class="btn btn-outline btn-sm" data-jump="${k.key === 'report-groups' ? 'report-merge' : k.key}">View ${k.label}</button>` : ''}
                        </div>
                        <div id="csv-result-${k.key}" style="margin-top:10px; font-size:.78rem;"></div>
                    </div>
                `).join('')}
            </div>
        `;
        container.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', e => this.downloadSample(e.currentTarget.dataset.sample)));
        container.querySelectorAll('[data-upload]').forEach(b => b.addEventListener('click', e => this.uploadCsv(e.currentTarget.dataset.upload)));
        container.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', e => this.switchTab(e.currentTarget.dataset.jump)));
    },

    async downloadSample(kind) {
        try {
            const res = await api.get(`/admin/csv-sample/${kind}`);
            // api.get returns a Response object for non-JSON responses
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sample_${kind.replace('-', '_')}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            App.showToast('Sample CSV downloaded', 'success');
        } catch(err) {
            App.showToast('Failed to download sample', 'error');
        }
    },

    async uploadCsv(kind) {
        const input = document.getElementById(`csv-file-${kind}`);
        const result = document.getElementById(`csv-result-${kind}`);
        if (!input?.files?.length) { App.showToast('Choose a CSV file first', 'warning'); return; }
        const fd = new FormData();
        fd.append('file', input.files[0]);
        if (result) result.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        try {
            const data = await api.post(`/admin/csv-import/${kind}`, fd);
            const errs = (data.errors || []).slice(0, 5);
            if (result) {
                result.innerHTML = `
                    <span class="status-badge done">Inserted ${data.inserted}</span>
                    ${data.skipped ? `<span class="status-badge pending" style="margin-left:6px;">Skipped ${data.skipped}</span>` : ''}
                    ${errs.length ? `<div style="margin-top:6px; color:var(--warning);">${errs.map(e => '· ' + App.escapeHtml(e)).join('<br>')}</div>` : ''}
                `;
            }
            App.showToast(`Imported ${data.inserted} rows (${data.skipped} skipped)`, 'success');
        } catch(err) {
            if (result) result.innerHTML = `<span style="color:var(--danger);">${App.escapeHtml(err.message || 'Upload failed')}</span>`;
            App.showToast(err.message || 'Upload failed', 'error');
        }
    },

    // ─────────────────────────  SETTINGS / MODULES / AUDIT  ─────────────────────────
    async loadSettings(container) {
        try {
            const data = await api.get('/admin/settings');
            const s = data.settings || {};
            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-sliders-h" style="color:var(--warning);margin-right:8px;"></i>System Settings</h3></div>
                    <div class="form-grid">
                        <div class="form-row"><label>Window Start</label><input type="time" id="set-window-start" value="${s.windowStart || '08:00'}" style="width:100%;"></div>
                        <div class="form-row"><label>Window End</label><input type="time" id="set-window-end" value="${s.windowEnd || '22:00'}" style="width:100%;"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-row"><label>Manager Email</label><input type="email" id="set-mgr-email" value="${s.managerEmail || ''}" style="width:100%;"></div>
                        <div class="form-row"><label>Escalation Days</label><input type="number" id="set-escalate" value="${s.escalateDays || '3'}" style="width:100%;" min="1"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-row"><label>Lock Duplicates</label><select id="set-lock-dup" style="width:100%;"><option value="YES" ${s.lockDuplicate === 'YES' ? 'selected' : ''}>Yes</option><option value="NO" ${s.lockDuplicate === 'NO' ? 'selected' : ''}>No</option></select></div>
                        <div class="form-row"><label>Require Remarks</label><select id="set-remarks" style="width:100%;"><option value="YES" ${s.requireRemarks === 'YES' ? 'selected' : ''}>Yes</option><option value="NO" ${s.requireRemarks === 'NO' ? 'selected' : ''}>No</option></select></div>
                    </div>
                    <div class="form-row">
                        <label>Treat Sat/Sun as Holiday <span style="color:var(--text-muted); font-size:.75rem;">(skips daily / MIS / DU tasks on weekends)</span></label>
                        <select id="set-weekend" style="width:100%;">
                            <option value="YES" ${(s.skipWeekends||'YES')==='YES'?'selected':''}>Yes — treat weekends as holidays</option>
                            <option value="NO" ${s.skipWeekends==='NO'?'selected':''}>No — Sat/Sun are working days</option>
                        </select>
                    </div>

                    <h4 style="margin-top:24px; margin-bottom:12px; font-size:.9rem; font-weight:700; color:var(--accent); border-bottom:1px solid var(--border); padding-bottom:6px;">
                        <i class="fas fa-envelope" style="margin-right:6px;"></i>SMTP &amp; Email Digest Settings
                    </h4>
                    <div class="form-grid">
                        <div class="form-row">
                            <label>Enable Daily Email Digest</label>
                            <select id="set-digest-enabled" style="width:100%;">
                                <option value="YES" ${s.emailDigestEnabled === 'YES' ? 'selected' : ''}>Yes — Send daily summary</option>
                                <option value="NO" ${s.emailDigestEnabled !== 'YES' ? 'selected' : ''}>No — Disabled</option>
                            </select>
                        </div>
                        <div class="form-row"><label>Digest Send Time</label><input type="time" id="set-digest-time" value="${s.emailDigestTime || '18:00'}" style="width:100%;"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-row"><label>SMTP Server Host</label><input type="text" id="set-smtp-host" value="${s.smtpHost || ''}" placeholder="e.g. smtp.gmail.com" style="width:100%;"></div>
                        <div class="form-row"><label>SMTP Port</label><input type="number" id="set-smtp-port" value="${s.smtpPort || '587'}" placeholder="e.g. 587" style="width:100%;"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-row"><label>SMTP Username</label><input type="text" id="set-smtp-user" value="${s.smtpUser || ''}" placeholder="e.g. user@gmail.com" style="width:100%;"></div>
                        <div class="form-row"><label>SMTP Password</label><input type="password" id="set-smtp-password" value="${s.smtpPassword || ''}" placeholder="••••••••" style="width:100%;"></div>
                    </div>
                    <div class="form-row"><label>SMTP Sender (From Email)</label><input type="email" id="set-smtp-from" value="${s.smtpFrom || ''}" placeholder="e.g. no-reply@company.com" style="width:100%;"></div>

                    <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                        <button class="btn btn-primary" id="btn-save-settings"><i class="fas fa-save"></i> Save Settings</button>
                    </div>
                </div>
            `;
            document.getElementById('btn-save-settings').addEventListener('click', async () => {
                try {
                    await api.post('/admin/settings', {
                        windowStart: document.getElementById('set-window-start').value,
                        windowEnd: document.getElementById('set-window-end').value,
                        managerEmail: document.getElementById('set-mgr-email').value,
                        escalateDays: document.getElementById('set-escalate').value,
                        lockDuplicate: document.getElementById('set-lock-dup').value,
                        requireRemarks: document.getElementById('set-remarks').value,
                        skipWeekends: document.getElementById('set-weekend').value,
                        emailDigestEnabled: document.getElementById('set-digest-enabled').value,
                        emailDigestTime: document.getElementById('set-digest-time').value,
                        smtpHost: document.getElementById('set-smtp-host').value.trim(),
                        smtpPort: document.getElementById('set-smtp-port').value.trim(),
                        smtpUser: document.getElementById('set-smtp-user').value.trim(),
                        smtpPassword: document.getElementById('set-smtp-password').value,
                        smtpFrom: document.getElementById('set-smtp-from').value.trim(),
                    });
                    App.showToast('Settings saved', 'success');
                } catch (err) { App.showToast('Failed to save settings', 'error'); }
            });
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load settings</p></div>';
        }
    },

    async loadModules(container) {
        try {
            const data = await api.get('/admin/modules');
            const modules = data.modules || {};
            const allModules = ['dashboard', 'tasks', 'mis', 'kanban', 'chat', 'analytics', 'roster', 'notifications'];
            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-puzzle-piece" style="color:var(--info);margin-right:8px;"></i>Module Toggles</h3></div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:12px;">
                        ${allModules.map(m => {
                            const enabled = modules[m] !== false;
                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:var(--bg-primary); border-radius:8px; border:1px solid var(--border);">
                                    <span style="font-weight:600; text-transform:capitalize;">${m.replace('-', ' ')}</span>
                                    <label style="position:relative; display:inline-block; width:40px; height:22px; cursor:pointer;">
                                        <input type="checkbox" class="module-toggle" data-key="${m}" ${enabled ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                                        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${enabled ? 'var(--success)' : 'var(--bg-hover)'};border-radius:11px;transition:.3s;"></span>
                                    </label>
                                </div>`;
                        }).join('')}
                    </div>
                    <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                        <button class="btn btn-primary" id="btn-save-modules"><i class="fas fa-save"></i> Save Modules</button>
                    </div>
                </div>
            `;
            document.getElementById('btn-save-modules').addEventListener('click', async () => {
                const payload = {};
                document.querySelectorAll('.module-toggle').forEach(cb => { payload[cb.dataset.key] = cb.checked; });
                try {
                    await api.post('/admin/modules', payload);
                    // Live-apply: keep the new map in window state and re-run sidebar visibility
                    window.enabledModules = { ...(window.enabledModules || {}), ...payload };
                    const authMod = await import('./auth.js');
                    authMod.auth.modules = window.enabledModules;
                    authMod.auth.applyModuleVisibility(window.enabledModules);
                    App.showToast('Module settings saved — sidebar updated', 'success');
                } catch (err) { App.showToast('Failed to save', 'error'); }
            });
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load modules</p></div>';
        }
    },

    async loadAudit(container) {
        try {
            const data = await api.get('/admin/audit');
            const logs = data.logs || [];
            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-history" style="color:var(--info);margin-right:8px;"></i>Audit Trail (${data.total || logs.length})</h3></div>
                    ${logs.length > 0 ? `
                        <table class="data-table">
                            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
                            <tbody>
                                ${logs.map(l => `
                                    <tr>
                                        <td style="font-size:.8rem; color:var(--text-muted);">${App.timeAgo(l.timestamp)}</td>
                                        <td style="font-weight:500;">${App.escapeHtml(l.actor)}</td>
                                        <td><span class="tag">${App.escapeHtml(l.action)}</span></td>
                                        <td style="font-size:.85rem; color:var(--text-secondary);">${App.escapeHtml(l.targetType)}${l.targetId ? ': ' + App.escapeHtml(String(l.targetId).substring(0, 40)) : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No audit logs recorded yet</p></div>'}
                </div>
            `;
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load audit trail</p></div>';
        }
    },

    _wireFilterAndSort(tableId, searchId, filterMap, defaultSortCol) {
        const table = document.getElementById(tableId);
        const search = document.getElementById(searchId);
        if (!table || !search) return;

        let currentSort = { col: defaultSortCol, dir: 'asc' };

        const applyFilters = () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const searchVal = search.value.toLowerCase();

            const filterValues = {};
            Object.keys(filterMap).forEach(key => {
                const select = document.getElementById(filterMap[key]);
                filterValues[key] = select?.value || '';
            });

            rows.forEach(tr => {
                let searchText = '';
                for (const k in tr.dataset) {
                    searchText += ' ' + tr.dataset[k].toLowerCase();
                }
                const matchSearch = !searchVal || searchText.includes(searchVal);

                let matchFilters = true;
                for (const key in filterValues) {
                    const requiredVal = filterValues[key];
                    if (requiredVal) {
                        const trVal = tr.dataset[key] || '';
                        if (trVal !== requiredVal) {
                            matchFilters = false;
                            break;
                        }
                    }
                }

                tr.style.display = (matchSearch && matchFilters) ? '' : 'none';
            });

            const visibleRows = rows.filter(tr => tr.style.display !== 'none');
            const { col, dir } = currentSort;

            visibleRows.sort((a, b) => {
                let va = a.dataset[col] || '';
                let vb = b.dataset[col] || '';
                const numA = Number(va), numB = Number(vb);
                if (!isNaN(numA) && !isNaN(numB) && va !== '' && vb !== '') {
                    return dir === 'asc' ? numA - numB : numB - numA;
                }
                if (va < vb) return dir === 'asc' ? -1 : 1;
                if (va > vb) return dir === 'asc' ? 1 : -1;
                return 0;
            });

            visibleRows.forEach(tr => tbody.appendChild(tr));
        };

        search.addEventListener('input', applyFilters);
        Object.values(filterMap).forEach(id => {
            document.getElementById(id)?.addEventListener('change', applyFilters);
        });

        table.querySelectorAll('.sortable-header').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (currentSort.col === field) {
                    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort = { col: field, dir: 'asc' };
                }

                table.querySelectorAll('.sortable-header i').forEach(icon => {
                    icon.className = 'fas fa-sort';
                    icon.style.opacity = '0.3';
                });
                const icon = th.querySelector('i');
                if (icon) {
                    icon.className = currentSort.dir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
                    icon.style.opacity = '1';
                }

                applyFilters();
            });
        });

        applyFilters();
    },

    async loadEmails(container) {
        try {
            const [settingsData, logsData, usersData] = await Promise.all([
                api.get('/admin/settings'),
                api.get('/admin/email-logs'),
                api.get('/admin/users')
            ]);
            const s = settingsData.settings || {};
            const logs = logsData.logs || [];
            const users = usersData.data || [];
            const escAttr = (val) => App.escapeHtml(val || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            const availableRoles = ['Teammate', 'Leader', 'Manager', 'SuperAdmin'];

            const allowedRolesListMap = {
                'stage-1': ['Teammate'],
                'stage-2': ['Teammate'],
                'stage-3': ['Manager', 'SuperAdmin'],
                'stage-4': ['Leader', 'Manager', 'SuperAdmin']
            };

            // Helper to render Stage Card with Drag & Drop dual-column recipient manager (inline subject removed)
            const renderStageCard = (stageId, stageNum, title, desc, icon, enabledKey, timeKey, defaultTime, rolesKey, defaultRoles, allowedRolesList, emailsKey, excludedEmailsKey) => {
                const isEnabled = s[enabledKey] === 'YES';
                const timeVal = s[timeKey] || defaultTime;

                const savedRoles = (s[rolesKey] || defaultRoles).split(',').map(r => r.trim()).filter(Boolean);
                const savedEmails = (s[emailsKey] || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
                const savedExcludedEmails = (s[excludedEmailsKey] || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

                const roleCheckboxes = allowedRolesList.map(r => `
                    <label style="display:inline-flex; align-items:center; gap:4px; font-size:.75rem; font-weight:600; cursor:pointer; background:var(--bg-primary); padding:4px 8px; border-radius:14px; border:1px solid var(--border); user-select:none;">
                        <input type="checkbox" class="stage-role-chk stage-role-${stageId}" value="${r}" ${savedRoles.includes(r) ? 'checked' : ''} data-stage="${stageId}">
                        ${r}
                    </label>
                `).join(' ');

                const stageUsers = users.filter(u => allowedRolesList.includes(u.role));
                const userOptions = stageUsers.map(u => `
                    <option value="${escAttr(u.email)}" ${savedEmails.includes(u.email.toLowerCase()) ? 'selected' : ''}>
                        ${App.escapeHtml(u.name)} (${App.escapeHtml(u.email)})
                    </option>
                `).join('');

                const userExcludeOptions = stageUsers.map(u => `
                    <option value="${escAttr(u.email)}" ${savedExcludedEmails.includes(u.email.toLowerCase()) ? 'selected' : ''}>
                        ${App.escapeHtml(u.name)} (${App.escapeHtml(u.email)})
                    </option>
                `).join('');

                return `
                    <div style="border: 1px solid var(--border); border-radius: 10px; padding: 16px; background: var(--bg-primary); box-shadow: 0 2px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; gap:12px;">
                        <!-- Header -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <label style="font-weight:700; font-size:.9rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-${icon}" style="color:var(--accent);"></i> ${stageNum}. ${title}
                                </label>
                                <div style="font-size:.78rem; color:var(--text-muted); margin-top:2px;">${desc}</div>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <select id="${stageId}-enabled" style="font-size:.8rem; padding:4px 8px;">
                                    <option value="YES" ${isEnabled ? 'selected' : ''}>Enabled</option>
                                    <option value="NO" ${!isEnabled ? 'selected' : ''}>Disabled</option>
                                </select>
                                <input type="time" id="${stageId}-time" value="${timeVal}" style="font-size:.8rem; padding:4px 8px;">
                            </div>
                        </div>

                        <!-- Drag and Drop Dual-Column Recipient Manager -->
                        <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:.8rem; font-weight:700; color:var(--accent);">
                                    <i class="fas fa-users" style="margin-right:4px;"></i>Target Recipients Manager:
                                </span>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <span style="font-size:.72rem; color:var(--text-muted); font-weight:600;">Roles:</span>
                                    ${roleCheckboxes}
                                </div>
                            </div>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:8px;">
                                <!-- Left Column: Available Team Members -->
                                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px; display:flex; flex-direction:column;">
                                    <div style="font-size:.74rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                        <span><i class="fas fa-users" style="color:var(--text-muted); margin-right:4px;"></i>Team Members by Name:</span>
                                        <span style="font-size:.65rem; color:var(--text-muted); font-weight:600;">Drag or click + to Add &rarr;</span>
                                    </div>
                                    <div id="${stageId}-available-list" class="drag-zone drag-available-zone" data-stage="${stageId}" style="min-height:76px; flex:1; display:flex; flex-wrap:wrap; gap:6px; padding:8px; background:var(--bg-primary); border:1.5px dashed var(--border); border-radius:6px; align-content:flex-start; transition:all 0.15s ease;">
                                    </div>
                                </div>

                                <!-- Right Column: Will Be Sent To -->
                                <div style="background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.25); border-radius:8px; padding:10px; display:flex; flex-direction:column;">
                                    <div style="font-size:.74rem; font-weight:700; color:var(--accent); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                        <span><i class="fas fa-paper-plane" style="margin-right:4px;"></i>Will be sent to:</span>
                                        <span style="font-size:.65rem; color:var(--accent); opacity:0.85; font-weight:600;">&larr; Drag or click &times; to Remove</span>
                                    </div>
                                    <div id="${stageId}-target-list" class="drag-zone drag-target-zone" data-stage="${stageId}" style="min-height:76px; flex:1; display:flex; flex-wrap:wrap; gap:6px; padding:8px; background:var(--bg-primary); border:1.5px dashed rgba(99,102,241,0.4); border-radius:6px; align-content:flex-start; transition:all 0.15s ease;">
                                    </div>
                                </div>
                            </div>

                            <!-- Hidden select elements for state persistence -->
                            <select id="${stageId}-target-emails" class="stage-user-select" data-stage="${stageId}" multiple style="display:none;">
                                ${userOptions}
                            </select>
                            <select id="${stageId}-excluded-emails" class="stage-user-select-exclude" data-stage="${stageId}" multiple style="display:none;">
                                ${userExcludeOptions}
                            </select>
                        </div>
                    </div>
                `;
            };

            const userDropdownOptions = users.map(u => 
                `<option value="${escAttr(u.email)}">${App.escapeHtml(u.name)} (${App.escapeHtml(u.email)}) — ${App.escapeHtml(u.role)}</option>`
            ).join('');

            container.innerHTML = `
                <!-- Main Configuration Card (Full Width) -->
                <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                    <div class="card-header" style="margin-bottom:16px;">
                        <h3 class="card-title"><i class="fas fa-envelope-open-text" style="color:var(--accent);margin-right:8px;"></i>SMTP Configuration &amp; Digest Schedule Manager</h3>
                    </div>
                    
                    <div class="form-row" style="margin-bottom: 20px;">
                        <label style="font-weight:700;">Global Email Master Switch</label>
                        <select id="email-digest-enabled" style="width:100%;">
                            <option value="YES" ${s.emailDigestEnabled === 'YES' ? 'selected' : ''}>Yes — Enable All System Email Dispatches</option>
                            <option value="NO" ${s.emailDigestEnabled !== 'YES' ? 'selected' : ''}>No — Pause All System Email Dispatches</option>
                        </select>
                        <p style="font-size:.75rem; color:var(--text-muted); margin-top:4px;">When disabled, no automatically scheduled digest or reminder emails will be sent.</p>
                    </div>

                    <h4 style="margin-bottom:14px; font-size:.92rem; font-weight:700; color:var(--accent); border-bottom:1px solid var(--border); padding-bottom:6px;">
                        <i class="fas fa-clock" style="margin-right:6px;"></i>Multi-Stage Digest Schedules &amp; Target Recipients Manager
                    </h4>
                    
                    <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
                        ${renderStageCard('stage-1', 1, 'Teammate Reminder (Pending tasks)', 'Sends direct pending task alerts to Teammates.', 'bell', 'emailTeammateReminderEnabled', 'emailTeammateReminderTime', '14:00', 'emailTeammateTargetRoles', 'Teammate', ['Teammate'], 'emailTeammateTargetEmails', 'emailTeammateReminderExcludedEmails')}
                        ${renderStageCard('stage-2', 2, 'Teammate Final Update (Full stats)', 'Sends individual daily completion score & task updates to Teammates.', 'calendar-check', 'emailTeammateFinalEnabled', 'emailTeammateFinalTime', '18:00', 'emailTeammateTargetRoles', 'Teammate', ['Teammate'], 'emailTeammateTargetEmails', 'emailTeammateFinalExcludedEmails')}
                        ${renderStageCard('stage-3', 3, 'Manager Digest (Team status)', 'Sends team-wide KPI overview & completion matrix to managers.', 'chart-pie', 'emailManagerDigestEnabled', 'emailManagerDigestTime', '19:00', 'emailManagerTargetRoles', 'Manager,SuperAdmin', ['Manager', 'SuperAdmin'], 'emailManagerTargetEmails', 'emailManagerDigestExcludedEmails')}
                        ${renderStageCard('stage-4', 4, 'Leader Digest (Research updates)', 'Sends detailed teammate-wise research status update to leaders.', 'user-shield', 'emailLeaderDigestEnabled', 'emailLeaderDigestTime', '20:00', 'emailLeaderTargetRoles', 'Leader', ['Leader', 'Manager', 'SuperAdmin'], 'emailLeaderTargetEmails', 'emailLeaderDigestExcludedEmails')}
                    </div>

                    <h4 style="margin-top:24px; margin-bottom:12px; font-size:.9rem; font-weight:700; color:var(--accent); border-bottom:1px solid var(--border); padding-bottom:6px;">
                        <i class="fas fa-server" style="margin-right:6px;"></i>SMTP Server Credentials
                    </h4>
                    <div class="form-grid">
                        <div class="form-row"><label>SMTP Server Host</label><input type="text" id="email-smtp-host" value="${s.smtpHost || ''}" placeholder="e.g. smtp.gmail.com" style="width:100%;"></div>
                        <div class="form-row"><label>SMTP Port</label><input type="number" id="email-smtp-port" value="${s.smtpPort || '587'}" placeholder="e.g. 587" style="width:100%;"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-row"><label>SMTP Username</label><input type="text" id="email-smtp-user" value="${s.smtpUser || ''}" placeholder="e.g. user@gmail.com" style="width:100%;"></div>
                        <div class="form-row"><label>SMTP Password</label><input type="password" id="email-smtp-password" value="${s.smtpPassword || ''}" placeholder="••••••••" style="width:100%;"></div>
                    </div>
                    <div class="form-row"><label>SMTP Sender (From Email)</label><input type="email" id="email-smtp-from" value="${s.smtpFrom || ''}" placeholder="e.g. no-reply@company.com" style="width:100%;"></div>

                    <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                        <button class="btn btn-primary" id="btn-save-email-settings"><i class="fas fa-save"></i> Save Settings &amp; Templates</button>
                    </div>
                </div>

                <!-- Dedicated Mail Subject & Body Template Customizer Card (Full Width) -->
                <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                    <div class="card-header" style="margin-bottom:16px;">
                        <h3 class="card-title">
                            <i class="fas fa-file-code" style="color:var(--accent);margin-right:8px;"></i>Mail Subject &amp; Body Template Customizer
                        </h3>
                    </div>
                    
                    <div style="font-size:.78rem; color:var(--text-muted); margin-bottom:14px;">
                        Select a stage below to customize its email subject line and body notice/header template:
                    </div>

                    <!-- Stage Tabs -->
                    <div style="display:flex; gap:8px; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:16px; overflow-x:auto;">
                        <button type="button" class="btn btn-sm tmpl-tab btn-primary" data-tmpl-stage="stage-1" style="font-size:.78rem;"><i class="fas fa-bell"></i> 1. Teammate Reminder</button>
                        <button type="button" class="btn btn-sm tmpl-tab btn-outline" data-tmpl-stage="stage-2" style="font-size:.78rem;"><i class="fas fa-calendar-check"></i> 2. Teammate Final Update</button>
                        <button type="button" class="btn btn-sm tmpl-tab btn-outline" data-tmpl-stage="stage-3" style="font-size:.78rem;"><i class="fas fa-chart-pie"></i> 3. Manager Digest</button>
                        <button type="button" class="btn btn-sm tmpl-tab btn-outline" data-tmpl-stage="stage-4" style="font-size:.78rem;"><i class="fas fa-user-shield"></i> 4. Leader Digest</button>
                    </div>

                    <!-- Pane 1: Teammate Reminder -->
                    <div id="tmpl-pane-stage-1" class="tmpl-pane" style="display:block;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:.82rem;">Subject Template:</label>
                            <input type="text" id="stage-1-subject" value="${escAttr(s.emailTeammateReminderSubject || '⏰ Daily MIS Task Reminder — {user_name} ({pending_count} Pending)')}" style="width:100%; font-size:.85rem; padding:8px 12px;">
                            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; align-items:center;">
                                <span style="font-size:.7rem; color:var(--text-muted); font-weight:600;">Insert tags:</span>
                                <button type="button" class="btn-tag-pill" data-target="stage-1-subject" data-tag="{user_name}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{user_name}</button>
                                <button type="button" class="btn-tag-pill" data-target="stage-1-subject" data-tag="{pending_count}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{pending_count}</button>
                                <button type="button" class="btn-tag-pill" data-target="stage-1-subject" data-tag="{date_str}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{date_str}</button>
                            </div>
                        </div>
                        <div class="form-row">
                            <label style="font-weight:700; font-size:.82rem;">Custom Body Header Notice (Optional):</label>
                            <textarea id="stage-1-body-tmpl" rows="3" placeholder="Enter custom message to display at the top of the email body..." style="width:100%; font-size:.82rem; padding:8px 12px; border-radius:6px; font-family:inherit; resize:vertical;">${escAttr(s.emailTeammateReminderBodyTmpl || '')}</textarea>
                            <p style="font-size:.72rem; color:var(--text-muted); margin-top:2px;">This note will appear prominently at the top of the reminder email body.</p>
                        </div>
                    </div>

                    <!-- Pane 2: Teammate Final Update -->
                    <div id="tmpl-pane-stage-2" class="tmpl-pane" style="display:none;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:.82rem;">Subject Template:</label>
                            <input type="text" id="stage-2-subject" value="${escAttr(s.emailTeammateSubject || 'Daily MIS Task Summary: Final Update — {user_name} ({score}% Done)')}" style="width:100%; font-size:.85rem; padding:8px 12px;">
                            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; align-items:center;">
                                <span style="font-size:.7rem; color:var(--text-muted); font-weight:600;">Insert tags:</span>
                                <button type="button" class="btn-tag-pill" data-target="stage-2-subject" data-tag="{user_name}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{user_name}</button>
                                <button type="button" class="btn-tag-pill" data-target="stage-2-subject" data-tag="{score}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{score}</button>
                                <button type="button" class="btn-tag-pill" data-target="stage-2-subject" data-tag="{date_str}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{date_str}</button>
                            </div>
                        </div>
                        <div class="form-row">
                            <label style="font-weight:700; font-size:.82rem;">Custom Body Header Notice (Optional):</label>
                            <textarea id="stage-2-body-tmpl" rows="3" placeholder="Enter custom message to display at the top of the email body..." style="width:100%; font-size:.82rem; padding:8px 12px; border-radius:6px; font-family:inherit; resize:vertical;">${escAttr(s.emailTeammateFinalBodyTmpl || '')}</textarea>
                            <p style="font-size:.72rem; color:var(--text-muted); margin-top:2px;">This note will appear above the daily score breakdown.</p>
                        </div>
                    </div>

                    <!-- Pane 3: Manager Digest -->
                    <div id="tmpl-pane-stage-3" class="tmpl-pane" style="display:none;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:.82rem;">Subject Template:</label>
                            <input type="text" id="stage-3-subject" value="${escAttr(s.emailManagerSubject || 'MIS Daily Manager Digest — {date_str}')}" style="width:100%; font-size:.85rem; padding:8px 12px;">
                            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; align-items:center;">
                                <span style="font-size:.7rem; color:var(--text-muted); font-weight:600;">Insert tags:</span>
                                <button type="button" class="btn-tag-pill" data-target="stage-3-subject" data-tag="{date_str}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{date_str}</button>
                            </div>
                        </div>
                        <div class="form-row">
                            <label style="font-weight:700; font-size:.82rem;">Custom Body Header Notice (Optional):</label>
                            <textarea id="stage-3-body-tmpl" rows="3" placeholder="Enter custom message to display at the top of the email body..." style="width:100%; font-size:.82rem; padding:8px 12px; border-radius:6px; font-family:inherit; resize:vertical;">${escAttr(s.emailManagerDigestBodyTmpl || '')}</textarea>
                            <p style="font-size:.72rem; color:var(--text-muted); margin-top:2px;">This note will appear above the manager KPI overview.</p>
                        </div>
                    </div>

                    <!-- Pane 4: Leader Digest -->
                    <div id="tmpl-pane-stage-4" class="tmpl-pane" style="display:none;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:.82rem;">Subject Template:</label>
                            <input type="text" id="stage-4-subject" value="${escAttr(s.emailLeaderSubject || 'MIS Research Team Daily Summary — {date_str}')}" style="width:100%; font-size:.85rem; padding:8px 12px;">
                            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; align-items:center;">
                                <span style="font-size:.7rem; color:var(--text-muted); font-weight:600;">Insert tags:</span>
                                <button type="button" class="btn-tag-pill" data-target="stage-4-subject" data-tag="{date_str}" style="font-size:.7rem; padding:2px 8px; background:var(--bg-hover); border:1px solid var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-weight:600;"><i class="fas fa-plus-circle"></i>{date_str}</button>
                            </div>
                        </div>
                        <div class="form-row">
                            <label style="font-weight:700; font-size:.82rem;">Custom Body Header Notice (Optional):</label>
                            <textarea id="stage-4-body-tmpl" rows="3" placeholder="Enter custom message to display at the top of the email body..." style="width:100%; font-size:.82rem; padding:8px 12px; border-radius:6px; font-family:inherit; resize:vertical;">${escAttr(s.emailLeaderDigestBodyTmpl || '')}</textarea>
                            <p style="font-size:.72rem; color:var(--text-muted); margin-top:2px;">This note will appear above the leader teammate summary cards.</p>
                        </div>
                    </div>

                    <!-- Live Email Message Inbox Preview & Simulator Frame -->
                    <div style="border-top:1px dashed var(--border); padding-top:16px; margin-top:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                            <div>
                                <h4 style="font-size:.9rem; font-weight:700; color:var(--accent); margin:0; display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-desktop"></i> Live Email Inbox Message View (Actual Rendered Preview)
                                </h4>
                                <div style="font-size:.72rem; color:var(--text-muted); margin-top:2px;">
                                    Simulates exact email appearance in recipient inbox based on live today data &amp; recipient POV.
                                </div>
                            </div>
                            
                            <div style="display:flex; gap:8px; align-items:center;">
                                <label style="font-weight:700; font-size:.78rem; color:var(--text-secondary);">Recipient POV:</label>
                                <select id="preview-user-select" style="font-size:.8rem; padding:4px 10px; border-radius:6px; border:1px solid var(--border); min-width:220px; background:var(--bg-primary); color:var(--text-primary);">
                                    <!-- Populated dynamically with users in 'Will be sent to:' ONLY -->
                                </select>
                            </div>
                        </div>

                        <!-- Gmail-style Email Container Mockup -->
                        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.04);">
                            <!-- Email Header Bar -->
                            <div style="background:#ffffff; border-bottom:1px solid #e2e8f0; padding:12px 18px;">
                                <h4 id="preview-email-subject" style="margin:0 0 6px 0; font-size:.95rem; font-weight:700; color:#1e293b;">
                                    Subject Preview Loading...
                                </h4>
                                <div style="display:flex; align-items:center; justify-content:space-between; font-size:.78rem; color:#64748b;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="width:26px; height:26px; border-radius:50%; background:#4f46e5; color:#ffffff; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:.75rem;">M</div>
                                        <div>
                                            <strong style="color:#1e293b;">Advanced MIS Emailer</strong> &lt;<span id="preview-email-from">mail.agalabs@gmail.com</span>&gt;
                                            <br>
                                            <span style="color:#64748b;">to <strong id="preview-email-to" style="color:#334155;">user@company.com</strong></span>
                                        </div>
                                    </div>
                                    <div style="font-size:.7rem; color:#94a3b8; font-weight:600;">
                                        <i class="fas fa-check-circle" style="color:#10b981; margin-right:3px;"></i>Live Today Data POV
                                    </div>
                                </div>
                            </div>

                            <!-- Rendered Iframe Body -->
                            <div style="padding:16px; background:#f1f5f9; display:flex; justify-content:center;">
                                <iframe id="preview-email-iframe" style="width:100%; max-width:680px; height:480px; border:none; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.06); background:#ffffff;"></iframe>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Operations Card (Placed ABOVE Sent Email Logs) -->
                <div class="glass-card" style="padding:24px; margin-bottom:16px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        <!-- Left: Send Connection Test Email -->
                        <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:16px;">
                            <h4 style="font-size:.9rem; font-weight:700; color:var(--warning); margin-bottom:8px;">
                                <i class="fas fa-paper-plane" style="margin-right:6px;"></i>Send Connection Test Email
                            </h4>
                            <p style="font-size:.78rem; color:var(--text-muted); margin-bottom:12px;">Test the SMTP connection immediately by sending a live test report email.</p>
                            <div class="form-row">
                                <label style="font-size:.75rem;">Recipient Email</label>
                                <input type="email" id="email-test-recipient" placeholder="Enter recipient email..." style="width:100%; font-size:.8rem; padding:8px 12px; margin-bottom:10px;">
                            </div>
                            <button class="btn btn-outline btn-sm" id="btn-run-email-test" style="width:100%; justify-content:center;">
                                <i class="fas fa-paper-plane"></i> Send Test Email
                            </button>
                        </div>

                        <!-- Right: Manual Trigger / Person Dispatch -->
                        <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:16px;">
                            <h4 style="font-size:.9rem; font-weight:700; color:var(--danger); margin-bottom:8px;">
                                <i class="fas fa-play" style="margin-right:6px;"></i>Manual Trigger / Person Dispatch
                            </h4>
                            <p style="font-size:.78rem; color:var(--text-muted); margin-bottom:12px;">Send a digest stage immediately to all target users or a specific selected team member.</p>
                            <div class="form-row" style="margin-bottom: 10px;">
                                <label style="font-size:.75rem;">Digest Stage to Send</label>
                                <select id="email-digest-stage-select" style="width:100%; font-size:.8rem; padding:8px 12px;">
                                    <option value="all">All Stages</option>
                                    <option value="teammate-reminder">1. Teammate Reminder (Pending only)</option>
                                    <option value="teammate-final">2. Teammate Final (Full stats)</option>
                                    <option value="manager-digest">3. Manager Digest (Team status)</option>
                                    <option value="leader-digest">4. Leader Digest (Research updates)</option>
                                </select>
                            </div>
                            <div class="form-row" style="margin-bottom: 14px;">
                                <label style="font-size:.75rem;">Target Recipient (Optional Individual Person Override)</label>
                                <select id="email-digest-target-person" style="width:100%; font-size:.8rem; padding:8px 12px;">
                                    <option value="">-- All Target Recipients for Stage --</option>
                                    ${userDropdownOptions}
                                </select>
                            </div>
                            <button class="btn btn-outline btn-sm" id="btn-run-email-digest" style="width:100%; justify-content:center; border-color:var(--danger); color:var(--danger);">
                                <i class="fas fa-rocket"></i> Trigger Selected Stage
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sent Email Logs Card (Below Operations) -->
                <div class="glass-card" style="padding:24px;">
                    <div class="card-header" style="margin-bottom:16px;">
                        <h3 class="card-title"><i class="fas fa-history" style="color:var(--accent);margin-right:8px;"></i>Sent Email Logs</h3>
                        <div class="filter-bar" style="margin:0;">
                            <input type="text" id="email-logs-search" placeholder="Search by recipient or subject..." style="font-size:.8rem; padding:6px 12px; border-radius:20px; width:220px;">
                            <select id="email-logs-status" style="font-size:.8rem; padding:6px 12px; border-radius:20px; width:120px;">
                                <option value="">All Statuses</option>
                                <option value="Success">Success</option>
                                <option value="Failed">Failed</option>
                            </select>
                        </div>
                    </div>

                    <div style="overflow-x:auto;">
                        <table class="data-table" id="email-logs-table">
                            <thead>
                                <tr>
                                    <th class="sortable-header" data-sort="recipient">Recipient <i class="fas fa-sort" style="opacity:.3;"></i></th>
                                    <th class="sortable-header" data-sort="subject">Subject <i class="fas fa-sort" style="opacity:.3;"></i></th>
                                    <th class="sortable-header" data-sort="sentat" style="text-align:center;">Sent At <i class="fas fa-sort" style="opacity:.3;"></i></th>
                                    <th class="sortable-header" data-sort="status" style="text-align:center;">Status <i class="fas fa-sort" style="opacity:.3;"></i></th>
                                    <th style="text-align:center;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logs.length === 0 ? `
                                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No email logs found.</td></tr>
                                ` : logs.map(l => {
                                    const timeStr = l.sentAt ? new Date(l.sentAt).toLocaleString() : '—';
                                    const badgeClass = l.status === 'Success' ? 'done' : 'pending';
                                    const isFailed = l.status === 'Failed';
                                    return `
                                        <tr data-recipient="${escAttr(l.recipient)}" data-subject="${escAttr(l.subject)}" data-sentat="${l.sentAt || ''}" data-status="${l.status || ''}">
                                            <td style="font-weight:600; font-size:.85rem; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(l.recipient)}</td>
                                            <td style="font-size:.85rem; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(l.subject)}</td>
                                            <td style="text-align:center; font-size:.8rem; color:var(--text-muted);">${timeStr}</td>
                                            <td style="text-align:center;">
                                                <span class="status-badge ${badgeClass}" ${isFailed ? `title="${App.escapeHtml(l.errorMessage || '')}" style="cursor:help;"` : ''}>
                                                    ${l.status} ${isFailed ? '<i class="fas fa-info-circle" style="margin-left:4px;"></i>' : ''}
                                                </span>
                                            </td>
                                            <td style="text-align:center;">
                                                <button class="btn btn-sm btn-outline btn-view-body" data-id="${l.id}">
                                                    <i class="fas fa-eye"></i> View Email
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            let currentPreviewStage = 'stage-1';

            const loadLiveEmailPreview = async (stageId, userEmail = '') => {
                currentPreviewStage = stageId || currentPreviewStage;

                const targetEl = document.getElementById(`${currentPreviewStage}-target-emails`);
                const excludedEl = document.getElementById(`${currentPreviewStage}-excluded-emails`);
                const rolesChks = container.querySelectorAll(`.stage-role-${currentPreviewStage}:checked`);

                const targetEmails = targetEl ? Array.from(targetEl.selectedOptions).map(o => o.value).join(',') : '';
                const excludedEmails = excludedEl ? Array.from(excludedEl.selectedOptions).map(o => o.value).join(',') : '';
                const targetRoles = Array.from(rolesChks).map(c => c.value).join(',');

                try {
                    const res = await api.post('/admin/email-preview', {
                        stage: currentPreviewStage,
                        user_email: userEmail,
                        target_roles: targetRoles,
                        target_emails: targetEmails,
                        excluded_emails: excludedEmails
                    });

                    if (!res || !res.success) return;

                    const povSelect = document.getElementById('preview-user-select');
                    if (povSelect) {
                        const currentSelected = userEmail || res.to_addr;
                        if (res.recipients.length === 0) {
                            povSelect.innerHTML = `<option value="">⚠️ No recipients in "Will be sent to:"</option>`;
                        } else {
                            povSelect.innerHTML = res.recipients.map(r => `
                                <option value="${escAttr(r.email)}" ${r.email.toLowerCase() === currentSelected.toLowerCase() ? 'selected' : ''}>
                                    ${App.escapeHtml(r.name)} (${App.escapeHtml(r.email)}) — ${App.escapeHtml(r.role)}
                                </option>
                            `).join('');
                        }
                    }

                    const subjEl = document.getElementById('preview-email-subject');
                    const fromEl = document.getElementById('preview-email-from');
                    const toEl = document.getElementById('preview-email-to');
                    if (subjEl) subjEl.innerText = res.subject || 'No Subject';
                    if (fromEl) fromEl.innerText = res.from_addr || 'system@company.com';
                    if (toEl) toEl.innerText = res.to_addr ? `${res.active_user_name || ''} (${res.to_addr})` : 'None';

                    const iframe = document.getElementById('preview-email-iframe');
                    if (iframe) {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        doc.open();
                        doc.write(res.html_body || '<div>No preview body available</div>');
                        doc.close();
                    }
                } catch(err) {
                    console.error('Failed to load live preview:', err);
                }
            };

            // Wire Template Customizer Tabs
            container.querySelectorAll('.tmpl-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    container.querySelectorAll('.tmpl-tab').forEach(t => {
                        t.classList.remove('btn-primary');
                        t.classList.add('btn-outline');
                    });
                    tab.classList.add('btn-primary');
                    tab.classList.remove('btn-outline');

                    const targetStage = tab.dataset.tmplStage;
                    container.querySelectorAll('.tmpl-pane').forEach(pane => pane.style.display = 'none');
                    const activePane = container.querySelector(`#tmpl-pane-${targetStage}`);
                    if (activePane) activePane.style.display = 'block';

                    loadLiveEmailPreview(targetStage, '');
                });
            });

            // Wire Recipient POV Change event
            document.getElementById('preview-user-select')?.addEventListener('change', (e) => {
                loadLiveEmailPreview(currentPreviewStage, e.target.value);
            });

            // State management helpers for Drag-and-Drop recipient zones
            const addUserToTarget = (stageId, email) => {
                const selectTarget = document.getElementById(`${stageId}-target-emails`);
                const selectExclude = document.getElementById(`${stageId}-excluded-emails`);
                if (!selectTarget || !selectExclude) return;

                const emailLower = email.toLowerCase();
                Array.from(selectExclude.options).forEach(opt => {
                    if (opt.value.toLowerCase() === emailLower) opt.selected = false;
                });
                Array.from(selectTarget.options).forEach(opt => {
                    if (opt.value.toLowerCase() === emailLower) opt.selected = true;
                });
                updateStageDragDropUI(stageId);
            };

            const removeUserFromTarget = (stageId, email) => {
                const selectTarget = document.getElementById(`${stageId}-target-emails`);
                const selectExclude = document.getElementById(`${stageId}-excluded-emails`);
                if (!selectTarget || !selectExclude) return;

                const emailLower = email.toLowerCase();
                Array.from(selectTarget.options).forEach(opt => {
                    if (opt.value.toLowerCase() === emailLower) opt.selected = false;
                });
                Array.from(selectExclude.options).forEach(opt => {
                    if (opt.value.toLowerCase() === emailLower) opt.selected = true;
                });
                updateStageDragDropUI(stageId);
            };

            // Main UI updater for Drag-and-Drop dual columns
            const updateStageDragDropUI = (stageId) => {
                const checkedRoles = Array.from(container.querySelectorAll(`.stage-role-${stageId}:checked`)).map(c => c.value);
                const selectTarget = document.getElementById(`${stageId}-target-emails`);
                const selectExclude = document.getElementById(`${stageId}-excluded-emails`);

                const targetEmails = selectTarget ? Array.from(selectTarget.selectedOptions).map(o => o.value.toLowerCase()) : [];
                const excludedEmails = selectExclude ? Array.from(selectExclude.selectedOptions).map(o => o.value.toLowerCase()) : [];

                const availableContainer = document.getElementById(`${stageId}-available-list`);
                const targetContainer = document.getElementById(`${stageId}-target-list`);

                if (!availableContainer || !targetContainer) return;

                const allowedRoles = allowedRolesListMap[stageId] || ['Teammate'];
                const stageUsers = users.filter(u => allowedRoles.includes(u.role));

                const leftUsers = [];
                const rightUsers = [];

                stageUsers.forEach(u => {
                    const uEmail = u.email.toLowerCase();
                    const isTargeted = ((u.active && checkedRoles.includes(u.role)) || targetEmails.includes(uEmail)) && !excludedEmails.includes(uEmail);

                    if (isTargeted) {
                        rightUsers.push(u);
                    } else {
                        leftUsers.push(u);
                    }
                });

                // Render Left (Available) List
                if (leftUsers.length === 0) {
                    availableContainer.innerHTML = `<span style="font-size:.7rem; color:var(--text-muted); font-style:italic; padding:6px;">All team members added to recipient list.</span>`;
                } else {
                    availableContainer.innerHTML = leftUsers.map(u => `
                        <div class="drag-user-chip chip-available" draggable="true" data-stage="${stageId}" data-email="${escAttr(u.email)}" style="font-size:.72rem; padding:4px 10px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px; cursor:grab; user-select:none; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">
                            <i class="fas fa-grip-vertical" style="color:var(--text-muted); font-size:.65rem;"></i>
                            <span><strong>${App.escapeHtml(u.name)}</strong> <span style="font-size:.65rem; color:var(--text-muted);">(${App.escapeHtml(u.role)})</span></span>
                            <i class="fas fa-plus-circle btn-move-right" data-stage="${stageId}" data-email="${escAttr(u.email)}" style="color:var(--accent); cursor:pointer; font-size:.75rem; margin-left:3px;" title="Add to Recipient List"></i>
                        </div>
                    `).join('');
                }

                // Render Right (Target) List
                if (rightUsers.length === 0) {
                    targetContainer.innerHTML = `<span style="font-size:.7rem; color:var(--danger); font-style:italic; padding:6px;"><i class="fas fa-exclamation-triangle"></i> No recipients selected. Drag team members here.</span>`;
                } else {
                    targetContainer.innerHTML = rightUsers.map(u => `
                        <div class="drag-user-chip chip-target" draggable="true" data-stage="${stageId}" data-email="${escAttr(u.email)}" style="font-size:.72rem; padding:4px 10px; background:rgba(99,102,241,0.12); color:var(--accent); border:1px solid rgba(99,102,241,0.3); border-radius:14px; cursor:grab; user-select:none; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">
                            <i class="fas fa-grip-vertical" style="opacity:0.6; font-size:.65rem;"></i>
                            <span><strong>${App.escapeHtml(u.name)}</strong> <span style="font-size:.65rem; opacity:0.8;">(${App.escapeHtml(u.role)})</span></span>
                            <i class="fas fa-times-circle btn-move-left" data-stage="${stageId}" data-email="${escAttr(u.email)}" style="color:var(--danger); cursor:pointer; font-size:.75rem; margin-left:3px;" title="Remove from Recipient List"></i>
                        </div>
                    `).join('');
                }

                // Attach event listeners for chips & drop zones
                bindChipAndZoneEvents(stageId);

                // Refresh live preview if active stage modified
                if (stageId === currentPreviewStage) {
                    loadLiveEmailPreview(stageId, '');
                }
            };

            // Wire drag events and click transfer events
            const bindChipAndZoneEvents = (stageId) => {
                const availableContainer = document.getElementById(`${stageId}-available-list`);
                const targetContainer = document.getElementById(`${stageId}-target-list`);

                if (!availableContainer || !targetContainer) return;

                // Drag Start on Chips
                container.querySelectorAll(`.drag-user-chip[data-stage="${stageId}"]`).forEach(chip => {
                    chip.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                            stageId: chip.dataset.stage,
                            email: chip.dataset.email
                        }));
                        chip.style.opacity = '0.5';
                    });
                    chip.addEventListener('dragend', () => {
                        chip.style.opacity = '1';
                    });
                });

                // Click transfer buttons (+) and (x)
                container.querySelectorAll(`.btn-move-right[data-stage="${stageId}"]`).forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        addUserToTarget(stageId, btn.dataset.email);
                    });
                });

                container.querySelectorAll(`.btn-move-left[data-stage="${stageId}"]`).forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        removeUserFromTarget(stageId, btn.dataset.email);
                    });
                });

                // Click on chip body to toggle
                container.querySelectorAll(`.chip-available[data-stage="${stageId}"]`).forEach(chip => {
                    chip.addEventListener('click', () => addUserToTarget(stageId, chip.dataset.email));
                });
                container.querySelectorAll(`.chip-target[data-stage="${stageId}"]`).forEach(chip => {
                    chip.addEventListener('click', (e) => {
                        if (!e.target.classList.contains('btn-move-left')) {
                            removeUserFromTarget(stageId, chip.dataset.email);
                        }
                    });
                });

                // Drag Over and Drop on Available Container (Left Zone)
                availableContainer.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    availableContainer.style.borderColor = 'var(--accent)';
                    availableContainer.style.background = 'rgba(99,102,241,0.04)';
                });
                availableContainer.addEventListener('dragleave', () => {
                    availableContainer.style.borderColor = 'var(--border)';
                    availableContainer.style.background = 'var(--bg-primary)';
                });
                availableContainer.addEventListener('drop', (e) => {
                    e.preventDefault();
                    availableContainer.style.borderColor = 'var(--border)';
                    availableContainer.style.background = 'var(--bg-primary)';
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.stageId === stageId && data.email) {
                            removeUserFromTarget(stageId, data.email);
                        }
                    } catch(err){}
                });

                // Drag Over and Drop on Target Container (Right Zone)
                targetContainer.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    targetContainer.style.borderColor = 'var(--accent)';
                    targetContainer.style.background = 'rgba(99,102,241,0.08)';
                });
                targetContainer.addEventListener('dragleave', () => {
                    targetContainer.style.borderColor = 'rgba(99,102,241,0.4)';
                    targetContainer.style.background = 'var(--bg-primary)';
                });
                targetContainer.addEventListener('drop', (e) => {
                    e.preventDefault();
                    targetContainer.style.borderColor = 'rgba(99,102,241,0.4)';
                    targetContainer.style.background = 'var(--bg-primary)';
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.stageId === stageId && data.email) {
                            addUserToTarget(stageId, data.email);
                        }
                    } catch(err){}
                });
            };

            // Initialize Drag & Drop dual-column UI for all 4 stages
            ['stage-1', 'stage-2', 'stage-3', 'stage-4'].forEach(stageId => {
                updateStageDragDropUI(stageId);

                container.querySelectorAll(`.stage-role-${stageId}`).forEach(chk => {
                    chk.addEventListener('change', () => updateStageDragDropUI(stageId));
                });
            });

            // Initial load of live preview for Stage 1
            loadLiveEmailPreview('stage-1', '');

            // Wire tag pill click insertion
            container.querySelectorAll('.btn-tag-pill').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.target;
                    const tag = btn.dataset.tag;
                    const el = document.getElementById(targetId);
                    if (el) {
                        const start = el.selectionStart || el.value.length;
                        const end = el.selectionEnd || el.value.length;
                        el.value = el.value.substring(0, start) + tag + el.value.substring(end);
                        el.focus();
                        el.selectionStart = el.selectionEnd = start + tag.length;
                    }
                });
            });

            // Wire Expand Subject Template Modal
            container.querySelectorAll('.btn-expand-subject').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fieldId = btn.dataset.field;
                    const textarea = document.getElementById(fieldId);
                    if (!textarea) return;

                    const currentText = textarea.value;
                    const modalBody = `
                        <div style="padding:10px 0;">
                            <label style="font-weight:700; font-size:.85rem; display:block; margin-bottom:8px; color:var(--text-primary);">
                                Expandable Subject Template Editor:
                            </label>
                            <textarea id="modal-subject-input" rows="6" style="width:100%; font-size:.95rem; padding:12px; border-radius:8px; font-family:inherit; line-height:1.5; border:1px solid var(--border); background:var(--bg-primary); color:var(--text-primary);">${App.escapeHtml(currentText)}</textarea>
                            <div style="font-size:.75rem; color:var(--text-muted); margin-top:8px;">
                                <i class="fas fa-info-circle" style="color:var(--accent);"></i> Available tags: <code>{user_name}</code>, <code>{score}</code>, <code>{date_str}</code>, <code>{pending_count}</code>
                            </div>
                        </div>
                    `;
                    App.showModal('Subject Template Full Window Editor', modalBody, `
                        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                        <button class="btn btn-primary" id="btn-apply-modal-subject">Apply Changes</button>
                    `);
                    setTimeout(() => {
                        document.getElementById('btn-apply-modal-subject')?.addEventListener('click', () => {
                            const newVal = document.getElementById('modal-subject-input').value;
                            textarea.value = newVal;
                            App.closeModal();
                            App.showToast('Subject template updated', 'info');
                        });
                    }, 50);
                });
            });

            // Save Settings Click handler
            document.getElementById('btn-save-email-settings').addEventListener('click', async () => {
                const getRoles = (stageId) => Array.from(container.querySelectorAll(`.stage-role-${stageId}:checked`)).map(c => c.value).join(',');
                const getEmails = (stageId) => {
                    const el = document.getElementById(`${stageId}-target-emails`);
                    return el ? Array.from(el.selectedOptions).map(o => o.value).join(',') : '';
                };
                const getExcludedEmails = (stageId) => {
                    const el = document.getElementById(`${stageId}-excluded-emails`);
                    return el ? Array.from(el.selectedOptions).map(o => o.value).join(',') : '';
                };

                const teammateRoles = getRoles('stage-2') || getRoles('stage-1') || 'Teammate';
                const teammateEmails = getEmails('stage-2') || getEmails('stage-1');
                const teammateReminderExcluded = getExcludedEmails('stage-1');
                const teammateFinalExcluded = getExcludedEmails('stage-2');
                
                const managerRoles = getRoles('stage-3') || 'Manager,SuperAdmin';
                const managerEmails = getEmails('stage-3');
                const managerExcluded = getExcludedEmails('stage-3');
                
                const leaderRoles = getRoles('stage-4') || 'Leader';
                const leaderEmails = getEmails('stage-4');
                const leaderExcluded = getExcludedEmails('stage-4');

                try {
                    await api.post('/admin/settings', {
                        emailDigestEnabled: document.getElementById('email-digest-enabled').value,
                        emailTeammateReminderEnabled: document.getElementById('stage-1-enabled').value,
                        emailTeammateReminderTime: document.getElementById('stage-1-time').value,
                        emailTeammateReminderSubject: document.getElementById('stage-1-subject').value,
                        emailTeammateReminderBodyTmpl: document.getElementById('stage-1-body-tmpl').value,
                        emailTeammateReminderExcludedEmails: teammateReminderExcluded,

                        emailTeammateFinalEnabled: document.getElementById('stage-2-enabled').value,
                        emailTeammateFinalTime: document.getElementById('stage-2-time').value,
                        emailTeammateTargetRoles: teammateRoles,
                        emailTeammateTargetEmails: teammateEmails,
                        emailTeammateFinalExcludedEmails: teammateFinalExcluded,
                        emailTeammateSubject: document.getElementById('stage-2-subject').value,
                        emailTeammateFinalBodyTmpl: document.getElementById('stage-2-body-tmpl').value,

                        emailManagerDigestEnabled: document.getElementById('stage-3-enabled').value,
                        emailManagerDigestTime: document.getElementById('stage-3-time').value,
                        emailManagerTargetRoles: managerRoles,
                        emailManagerTargetEmails: managerEmails,
                        emailManagerDigestExcludedEmails: managerExcluded,
                        emailManagerSubject: document.getElementById('stage-3-subject').value,
                        emailManagerDigestBodyTmpl: document.getElementById('stage-3-body-tmpl').value,

                        emailLeaderDigestEnabled: document.getElementById('stage-4-enabled').value,
                        emailLeaderDigestTime: document.getElementById('stage-4-time').value,
                        emailLeaderTargetRoles: leaderRoles,
                        emailLeaderTargetEmails: leaderEmails,
                        emailLeaderDigestExcludedEmails: leaderExcluded,
                        emailLeaderSubject: document.getElementById('stage-4-subject').value,
                        emailLeaderDigestBodyTmpl: document.getElementById('stage-4-body-tmpl').value,
                        
                        smtpHost: document.getElementById('email-smtp-host').value.trim(),
                        smtpPort: document.getElementById('email-smtp-port').value.trim(),
                        smtpUser: document.getElementById('email-smtp-user').value.trim(),
                        smtpPassword: document.getElementById('email-smtp-password').value,
                        smtpFrom: document.getElementById('email-smtp-from').value.trim(),
                    });
                    App.showToast('Email Settings, Recipients & Exclusions saved!', 'success');
                    this.loadTab(); // Reload
                } catch (err) { App.showToast('Failed to save settings', 'error'); }
            });

            // Send Test Email handler
            document.getElementById('btn-run-email-test').addEventListener('click', async () => {
                const rec = document.getElementById('email-test-recipient').value.trim();
                if (!rec) { App.showToast('Please specify a recipient email address.', 'warning'); return; }
                
                const btn = document.getElementById('btn-run-email-test');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
                try {
                    await api.post('/admin/email-test', { to_email: rec });
                    App.showToast('Test email sent successfully!', 'success');
                    this.loadTab(); // Reload logs
                } catch(err) {
                    App.showToast(err.message || 'SMTP Connection test failed', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Test Email';
                }
            });

            // Manual digest trigger handler
            document.getElementById('btn-run-email-digest').addEventListener('click', async () => {
                const stage = document.getElementById('email-digest-stage-select').value;
                const target_email = document.getElementById('email-digest-target-person').value;
                
                const targetText = target_email ? `to recipient "${target_email}"` : 'to all target recipients';
                if (!confirm(`This will immediately send out the email digest stage "${stage}" ${targetText}. Proceed?`)) return;
                
                const btn = document.getElementById('btn-run-email-digest');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Triggering...';
                try {
                    const res = await api.post('/admin/email-trigger-digest', { stage, target_email });
                    App.showToast(res.message || 'Digest triggered successfully!', 'success');
                    this.loadTab(); // Reload logs
                } catch(err) {
                    App.showToast(err.message || 'Failed to trigger digest', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-rocket"></i> Trigger Selected Stage';
                }
            });

            // View email body button click handler
            container.querySelectorAll('.btn-view-body').forEach(btn => {
                btn.addEventListener('click', () => {
                    const logId = parseInt(btn.dataset.id);
                    const log = logs.find(x => x.id === logId);
                    if (log) {
                        this.viewEmailBody(log.subject, log.body);
                    }
                });
            });

            // Set up search/filters on logs
            this._wireFilterAndSort('email-logs-table', 'email-logs-search', {
                status: 'email-logs-status'
            }, 'sentat');

        } catch (err) {
            container.innerHTML = `<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load email logs: ${err.message}</p></div>`;
        }
    },

    viewEmailBody(subject, htmlBody) {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '480px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.background = '#ffffff';
        iframe.srcdoc = htmlBody;
        
        App.showModal(
            subject,
            `<div style="padding: 10px 0;"></div>`,
            '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>'
        );
        
        setTimeout(() => {
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) {
                modalBody.innerHTML = '';
                modalBody.appendChild(iframe);
            }
        }, 50);
    },

    // ─────────────────────────  TABLE MAPPING STUDIO & DB DISCOVERY  ─────────────────────────
    async loadTableMapping(container) {
        try {
            const [res, usersRes, commsRes] = await Promise.all([
                api.get('/admin/table-mappings'),
                api.get('/admin/users'),
                api.get('/du/commodities').catch(() => ({ commodities: [] }))
            ]);
            const items = (res && res.data) || [];
            this._tableMappings = items;
            const userList = (usersRes && usersRes.data) || [];
            this._userList = userList;
            const activeDbUsers = userList
                .filter(u => u.active !== false && (u.name || u.email))
                .map(u => (u.name || u.email).trim());
            this._activeUsers = activeDbUsers.length ? activeDbUsers : ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
            const rawComms = (commsRes && commsRes.commodities) || (commsRes && commsRes.data) || [];
            this._activeCommodities = Array.isArray(rawComms) && rawComms.length ? rawComms : [];

            const total = items.length;
            const daily = items.filter(x => x.frequency === 'Daily').length;
            const weekly = items.filter(x => x.frequency === 'Weekly').length;
            const monthly = items.filter(x => x.frequency === 'Monthly').length;
            const sopa = items.filter(x => (x.source_pipeline || '').toUpperCase() === 'SOPA').length;
            const ipga = items.filter(x => (x.source_pipeline || '').toUpperCase() === 'IPGA').length;
            const pyexcel = items.filter(x => (x.source_pipeline || '').toUpperCase() === 'PYEXCEL').length;
            const pystage = items.filter(x => (x.source_pipeline || '').toUpperCase() === 'PYSTAGE').length;

            container.innerHTML = `
                <div class="table-mapping-view">
                    <!-- Header -->
                    <div class="mapping-studio-header">
                        <div>
                            <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 8px; margin: 0;">
                                <i class="fas fa-database" style="color: var(--accent);"></i>
                                <span>Database Table Mapping Studio</span>
                                <span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: .75rem;">
                                    agalabsdev_stage
                                </span>
                            </h3>
                            <p style="color: var(--text-secondary); font-size: .85rem; margin-top: 4px;">
                                Manage live surveillance mappings between raw MySQL tables, cadences, and research owners. Auto-fetch and discover new tables from the database.
                            </p>
                        </div>

                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" id="btn-fetch-db-tables" style="background: linear-gradient(135deg, #3b82f6, #6366f1);">
                                <i class="fas fa-satellite-dish"></i> Fetch Tables from Database
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-add-table-mapping">
                                <i class="fas fa-plus"></i> Add New Table Mapping
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-refresh-mappings" title="Reload from server">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                        </div>
                    </div>

                    <!-- Pipeline & Cadence Quick Stats -->
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
                        <span class="mapping-stats-pill">
                            <i class="fas fa-layer-group" style="color: #60a5fa;"></i>
                            <strong>${total}</strong> Total Mapped Tables
                        </span>
                        <span class="mapping-stats-pill">
                            <i class="fas fa-sun" style="color: #f59e0b;"></i>
                            <strong>${daily}</strong> Daily
                        </span>
                        <span class="mapping-stats-pill">
                            <i class="fas fa-calendar-week" style="color: #60a5fa;"></i>
                            <strong>${weekly}</strong> Weekly
                        </span>
                        <span class="mapping-stats-pill">
                            <i class="fas fa-calendar-alt" style="color: #a78bfa;"></i>
                            <strong>${monthly}</strong> Monthly
                        </span>
                        <!-- Pipeline stats pills (Hidden per user request; enable when needed) -->
                        <span class="mapping-stats-pill" style="display: none;">
                            <span class="pipeline-badge sopa" style="padding: 1px 5px; font-size: .65rem;">SOPA</span>
                            <strong>${sopa}</strong>
                        </span>
                        <span class="mapping-stats-pill" style="display: none;">
                            <span class="pipeline-badge ipga" style="padding: 1px 5px; font-size: .65rem;">IPGA</span>
                            <strong>${ipga}</strong>
                        </span>
                        <span class="mapping-stats-pill" style="display: none;">
                            <span class="pipeline-badge pyexcel" style="padding: 1px 5px; font-size: .65rem;">PyExcel</span>
                            <strong>${pyexcel}</strong>
                        </span>
                        <span class="mapping-stats-pill" style="display: none;">
                            <span class="pipeline-badge pystage" style="padding: 1px 5px; font-size: .65rem;">Stage</span>
                            <strong>${pystage}</strong>
                        </span>
                    </div>

                    <!-- Search & Filter Controls -->
                    <div class="card glass-card" style="padding: 14px; margin-bottom: 14px;">
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                            <div style="flex: 1; min-width: 240px;">
                                <div class="input-group" style="margin-bottom: 0;">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="map-search-input" placeholder="Search table name, business title, commodity, or assignee...">
                                </div>
                            </div>

                            <div style="width: 160px;">
                                <select id="map-filter-user" style="width: 100%;">
                                    <option value="">All Assignees</option>
                                    ${Array.from(new Set([
                                        ...this._activeUsers,
                                        ...items.flatMap(m => (m.assigned_user || m.user || '').split(',')).map(s => s.trim()).filter(Boolean)
                                    ])).sort().map(u => `<option value="${App.escapeHtml(u)}">${App.escapeHtml(u)}</option>`).join('')}
                                </select>
                            </div>

                            <!-- Pipeline filter dropdown (Hidden per user request; enable by changing display to block/inline-block) -->
                            <div style="display: none; width: 150px;" id="admin-pipeline-filter-wrap">
                                <select id="map-filter-pipeline" style="width: 100%;">
                                    <option value="">All Pipelines</option>
                                    <option value="SOPA">SOPA</option>
                                    <option value="IPGA">IPGA</option>
                                    <option value="PyExcel">PyExcel</option>
                                    <option value="PyStage">PyStage</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div style="width: 140px;">
                                <select id="map-filter-frequency" style="width: 100%;">
                                    <option value="">All Cadences</option>
                                    <option value="Daily">Daily</option>
                                    <option value="Weekly">Weekly</option>
                                    <option value="Monthly">Monthly</option>
                                    <option value="Yearly">Yearly</option>
                                </select>
                            </div>

                            <div style="width: 130px;">
                                <select id="map-filter-status" style="width: 100%;">
                                    <option value="">All Status</option>
                                    <option value="active">Active Only</option>
                                    <option value="inactive">Inactive Only</option>
                                </select>
                            </div>

                            <div style="width: 175px;">
                                <select id="map-sort-filter" style="width: 100%;">
                                    <option value="raw_asc">Sort: Table (A-Z)</option>
                                    <option value="raw_desc">Sort: Table (Z-A)</option>
                                    <option value="title_asc">Sort: Title (A-Z)</option>
                                    <option value="title_desc">Sort: Title (Z-A)</option>
                                    <option value="commodity_asc">Sort: Commodity (A-Z)</option>
                                    <option value="commodity_desc">Sort: Commodity (Z-A)</option>
                                    <option value="assignee_asc">Sort: Assignee (A-Z)</option>
                                    <option value="assignee_desc">Sort: Assignee (Z-A)</option>
                                    <option value="cadence_asc">Sort: Cadence (Daily First)</option>
                                    <option value="cadence_desc">Sort: Cadence (Monthly First)</option>
                                    <option value="dateCol_asc">Sort: Date Column (A-Z)</option>
                                    <option value="dateCol_desc">Sort: Date Column (Z-A)</option>
                                    <option value="status_asc">Sort: Active First</option>
                                    <option value="status_desc">Sort: Inactive First</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Table List -->
                    <div class="card glass-card" style="padding: 0; overflow: hidden;">
                        <div style="padding: 10px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                            <span id="map-table-count" style="font-size: .82rem; color: var(--text-muted); font-weight: 600;">
                                Showing ${total} table mappings
                            </span>
                            <span style="font-size: .75rem; color: #10b981;">
                                <i class="fas fa-check-circle"></i> Synced with Live Surveillance Grid
                            </span>
                        </div>

                        <div style="overflow-x: auto;">
                            <table class="crishi-table" id="admin-table-mappings-table">
                                <thead>
                                    <tr>
                                        <th class="map-sortable-th" data-col="raw" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Raw Table">
                                            <span>Raw MySQL Table</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th style="display: none;">Pipeline</th>
                                        <th class="map-sortable-th" data-col="title" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Business Title">
                                            <span>Final Business Title</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th class="map-sortable-th" data-col="commodity" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Commodity">
                                            <span>Harmonized Commodity</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th class="map-sortable-th" data-col="assignee" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Assignee">
                                            <span>Assignee</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th class="map-sortable-th" data-col="cadence" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Cadence">
                                            <span>Cadence</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th class="map-sortable-th" data-col="dateCol" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Date Column">
                                            <span>Date Column</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th class="map-sortable-th" data-col="status" style="cursor: pointer; user-select: none; transition: all 0.2s;" title="Click to sort by Status">
                                            <span>Status</span>
                                            <i class="fas fa-sort map-sort-icon" style="margin-left: 6px; font-size: .75rem; opacity: 0.4;"></i>
                                        </th>
                                        <th style="text-align: right; min-width: 120px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="table-mapping-tbody">
                                    <!-- Rendered dynamically -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            // State for sorting
            this._tableSortCol = this._tableSortCol || 'raw';
            this._tableSortDir = this._tableSortDir || 'asc';

            const cadenceOrder = { 'daily': 1, 'weekly': 2, 'fortnightly': 3, 'monthly': 4, 'quarterly': 5, 'half-yearly': 6, 'yearly': 7 };

            const updateSortHeaderUI = () => {
                document.querySelectorAll('#admin-table-mappings-table th.map-sortable-th').forEach(th => {
                    const thCol = th.dataset.col;
                    const icon = th.querySelector('.map-sort-icon');
                    if (!icon) return;
                    if (thCol === this._tableSortCol) {
                        th.style.color = '#60a5fa';
                        icon.className = this._tableSortDir === 'desc' ? 'fas fa-sort-down map-sort-icon' : 'fas fa-sort-up map-sort-icon';
                        icon.style.opacity = '1';
                        icon.style.color = '#60a5fa';
                    } else {
                        th.style.color = '';
                        icon.className = 'fas fa-sort map-sort-icon';
                        icon.style.opacity = '0.35';
                        icon.style.color = '';
                    }
                });
                const sortSelect = document.getElementById('map-sort-filter');
                if (sortSelect) {
                    sortSelect.value = `${this._tableSortCol}_${this._tableSortDir}`;
                }
            };

            // Wire Table Mapping Events
            const renderFiltered = () => {
                const q = (document.getElementById('map-search-input')?.value || '').toLowerCase().trim();
                const u = document.getElementById('map-filter-user')?.value || '';
                const p = document.getElementById('map-filter-pipeline')?.value || '';
                const f = document.getElementById('map-filter-frequency')?.value || '';
                const s = document.getElementById('map-filter-status')?.value || '';

                const filtered = this._tableMappings.filter(item => {
                    const raw = item.raw_table_name || item.raw_table || '';
                    const fn = item.final_business_name || item.final_name || '';
                    const comm = item.commodity || '';
                    const user = item.assigned_user || item.user || '';
                    const pipe = item.source_pipeline || '';
                    const freq = item.frequency || '';

                    const matchQ = !q ||
                        raw.toLowerCase().includes(q) ||
                        fn.toLowerCase().includes(q) ||
                        comm.toLowerCase().includes(q) ||
                        user.toLowerCase().includes(q);

                    const matchU = !u || user.toLowerCase().includes(u.toLowerCase());
                    const matchP = !p || pipe.toLowerCase() === p.toLowerCase();
                    const matchF = !f || freq.toLowerCase() === f.toLowerCase();
                    const matchS = !s || (s === 'active' ? item.is_active : !item.is_active);

                    return matchQ && matchU && matchP && matchF && matchS;
                });

                // Apply Sorting
                const mul = this._tableSortDir === 'desc' ? -1 : 1;
                const col = this._tableSortCol;

                filtered.sort((a, b) => {
                    if (col === 'raw') {
                        const va = (a.raw_table_name || a.raw_table || '').toLowerCase();
                        const vb = (b.raw_table_name || b.raw_table || '').toLowerCase();
                        return va.localeCompare(vb) * mul;
                    } else if (col === 'title') {
                        const va = (a.final_business_name || a.final_name || '').toLowerCase();
                        const vb = (b.final_business_name || b.final_name || '').toLowerCase();
                        return va.localeCompare(vb) * mul;
                    } else if (col === 'commodity') {
                        const va = (a.commodity || '').toLowerCase();
                        const vb = (b.commodity || '').toLowerCase();
                        return va.localeCompare(vb) * mul;
                    } else if (col === 'assignee') {
                        const va = (a.assigned_user || a.user || '').toLowerCase();
                        const vb = (b.assigned_user || b.user || '').toLowerCase();
                        return va.localeCompare(vb) * mul;
                    } else if (col === 'cadence') {
                        const ca = cadenceOrder[(a.frequency || '').toLowerCase()] || 99;
                        const cb = cadenceOrder[(b.frequency || '').toLowerCase()] || 99;
                        if (ca !== cb) return (ca - cb) * mul;
                        return (a.frequency || '').localeCompare(b.frequency || '') * mul;
                    } else if (col === 'dateCol') {
                        const va = (a.date_column || 'Date').toLowerCase();
                        const vb = (b.date_column || 'Date').toLowerCase();
                        return va.localeCompare(vb) * mul;
                    } else if (col === 'status') {
                        const sa = a.is_active ? 1 : 0;
                        const sb = b.is_active ? 1 : 0;
                        return (sb - sa) * mul;
                    }
                    return 0;
                });

                updateSortHeaderUI();
                this.renderTableMappingRows(filtered);
            };

            document.getElementById('map-search-input')?.addEventListener('input', renderFiltered);
            document.getElementById('map-filter-user')?.addEventListener('change', renderFiltered);
            document.getElementById('map-filter-pipeline')?.addEventListener('change', renderFiltered);
            document.getElementById('map-filter-frequency')?.addEventListener('change', renderFiltered);
            document.getElementById('map-filter-status')?.addEventListener('change', renderFiltered);
            document.getElementById('map-sort-filter')?.addEventListener('change', (e) => {
                const parts = (e.target.value || '').split('_');
                this._tableSortCol = parts[0] || 'raw';
                this._tableSortDir = parts[1] || 'asc';
                renderFiltered();
            });

            // Wire Clickable Headers
            document.querySelectorAll('#admin-table-mappings-table th.map-sortable-th').forEach(th => {
                th.addEventListener('click', () => {
                    const clickedCol = th.dataset.col;
                    if (this._tableSortCol === clickedCol) {
                        this._tableSortDir = this._tableSortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        this._tableSortCol = clickedCol;
                        this._tableSortDir = 'asc';
                    }
                    renderFiltered();
                });
            });

            document.getElementById('btn-fetch-db-tables')?.addEventListener('click', () => {
                this.openFetchDbTablesModal();
            });

            document.getElementById('btn-add-table-mapping')?.addEventListener('click', () => {
                this.openEditTableMappingModal();
            });

            document.getElementById('btn-refresh-mappings')?.addEventListener('click', () => {
                this.loadTableMapping(container);
            });

            renderFiltered();

        } catch (err) {
            console.error('Error loading table mappings:', err);
            container.innerHTML = `<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load table mappings: ${err.message}</p></div>`;
        }
    },

    renderTableMappingRows(items) {
        const tbody = document.getElementById('table-mapping-tbody');
        const countSpan = document.getElementById('map-table-count');
        if (!tbody) return;

        if (countSpan) {
            countSpan.innerHTML = `Showing <strong>${items.length}</strong> of <strong>${(this._tableMappings || []).length}</strong> table mappings`;
        }

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <i class="fas fa-search" style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.3; display: block;"></i>
                        No table mappings match your filter criteria.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const raw = item.raw_table_name || item.raw_table || '';
            const pipe = item.source_pipeline || 'Stage';
            const fn = item.final_business_name || item.final_name || '';
            const user = item.assigned_user || item.user || 'Nishant';
            const comm = item.commodity || 'General';
            const freq = item.frequency || 'Daily';
            const dateCol = item.date_column || 'Date';
            const isActive = item.is_active !== undefined ? item.is_active : true;
            const pipeClass = pipe.toLowerCase();

            return `
                <tr data-id="${item.id}">
                    <td>
                        <strong style="color: #60a5fa; font-family: monospace; font-size: .85rem;">
                            ${raw}
                        </strong>
                    </td>
                    <td style="display: none;">
                        <span class="pipeline-badge ${pipeClass}">${pipe}</span>
                    </td>
                    <td style="font-weight: 600; color: var(--text-primary); max-width: 260px;">
                        ${fn}
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                            ${comm.split(',').map(s => s.trim()).filter(Boolean).map(c => `
                                <span class="badge" style="background: rgba(168,85,247,0.12); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); font-size: .72rem; padding: 2px 8px; border-radius: 6px;">
                                    ${c}
                                </span>
                            `).join('')}
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                            ${user.split(',').map(s => s.trim()).filter(Boolean).map(u => `
                                <div class="user-avatar-chip">
                                    <span class="avatar-circle">${u.charAt(0)}</span>
                                    <strong style="font-size: .8rem;">${u}</strong>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                    <td>
                        <span style="font-size: .78rem; font-weight: 600; color: var(--text-secondary);">
                            ${freq}
                        </span>
                        ${(item.commodity_config && item.commodity_config !== '{}') ? `
                            <div style="margin-top: 3px;">
                                <span class="badge" title="Per-commodity customized timings & schedules" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.25); font-size: .68rem; padding: 1px 6px; border-radius: 4px; font-weight: 600;">
                                    <i class="fas fa-sliders-h" style="margin-right: 3px;"></i>Custom Timings
                                </span>
                            </div>
                        ` : ''}
                    </td>
                    <td>
                        <code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: .75rem; color: #10b981;">
                            ${dateCol}
                        </code>
                    </td>
                    <td>
                        ${isActive ? `
                            <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .72rem;">
                                <i class="fas fa-check"></i> Active
                            </span>
                        ` : `
                            <span class="badge" style="background: rgba(148,163,184,0.15); color: #94a3b8; font-size: .72rem;">
                                Inactive
                            </span>
                        `}
                    </td>
                    <td style="text-align: right;">
                        <div style="display: flex; gap: 6px; justify-content: flex-end;">
                            <button class="btn btn-outline btn-sm btn-edit-mapping" data-id="${item.id}" title="Edit Mapping" style="padding: 2px 7px; font-size: .75rem;">
                                <i class="fas fa-pen"></i> Edit
                            </button>
                            <button class="btn btn-outline btn-sm btn-delete-mapping" data-id="${item.id}" title="Deactivate / Delete Mapping" style="padding: 2px 7px; font-size: .75rem; color: #ef4444; border-color: rgba(239,68,68,0.3);">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Wire Row Actions
        tbody.querySelectorAll('.btn-edit-mapping').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const item = this._tableMappings.find(x => x.id === id);
                if (item) this.openEditTableMappingModal(item);
            });
        });

        tbody.querySelectorAll('.btn-delete-mapping').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const item = this._tableMappings.find(x => x.id === id);
                if (!item) return;

                if (!confirm(`Are you sure you want to deactivate mapping for table "${item.raw_table_name}"?`)) {
                    return;
                }

                try {
                    const res = await api.delete(`/admin/table-mappings/${id}`);
                    if (res && res.success) {
                        App.showToast(res.message || 'Mapping removed.', 'success');
                        const container = document.getElementById('admin-content');
                        if (container) this.loadTableMapping(container);
                    }
                } catch (err) {
                    App.showToast(err.message || 'Error removing mapping', 'error');
                }
            });
        });
    },

    async openFetchDbTablesModal() {
        const body = `
            <div id="fetch-db-modal-content" style="font-size: .85rem;">
                <div style="text-align: center; padding: 36px 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2.2rem; color: var(--accent); margin-bottom: 12px;"></i>
                    <h4 style="margin: 0; font-size: 1.1rem; font-weight: 700;">Scanning Database agalabsdev_stage...</h4>
                    <p style="color: var(--text-muted); font-size: .82rem; margin-top: 6px;">
                        Inspecting live MySQL tables, schema columns, and snapshot CSV headers.
                    </p>
                </div>
            </div>
        `;

        App.showModal('Fetch & Discover Tables in Database', body, '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>');

        try {
            const res = await api.get('/admin/fetch-db-tables');
            if (!res || !res.success) {
                document.getElementById('fetch-db-modal-content').innerHTML = `
                    <div class="sync-feedback-box error">Failed to discover tables: ${res.error || 'Unknown error'}</div>
                `;
                return;
            }

            const total = res.total_db_tables || 0;
            const mapped = res.already_mapped_count || 0;
            const unmapped = res.unmapped_count || 0;
            const tables = res.tables || [];

            const modalContent = document.getElementById('fetch-db-modal-content');
            if (!modalContent) return;

            modalContent.innerHTML = `
                <div>
                    <!-- Stats summary -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
                        <div style="background: var(--bg-secondary); border: 1px solid var(--border); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: .75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">DB Tables Discovered</div>
                            <div style="font-size: 1.4rem; font-weight: 800; color: #60a5fa; margin-top: 2px;">${total}</div>
                        </div>
                        <div style="background: var(--bg-secondary); border: 1px solid var(--border); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: .75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Already Mapped</div>
                            <div style="font-size: 1.4rem; font-weight: 800; color: #10b981; margin-top: 2px;">${mapped}</div>
                        </div>
                        <div style="background: var(--bg-secondary); border: 1px solid rgba(245,158,11,0.3); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: .75rem; color: #f59e0b; text-transform: uppercase; font-weight: 700;">Unmapped Tables</div>
                            <div style="font-size: 1.4rem; font-weight: 800; color: #f59e0b; margin-top: 2px;">${unmapped}</div>
                        </div>
                    </div>

                    <!-- Filter & View toggle -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm btn-primary" id="btn-show-unmapped-only">
                                Unmapped Only (${unmapped})
                            </button>
                            <button class="btn btn-sm btn-outline" id="btn-show-all-db">
                                All Tables (${total})
                            </button>
                        </div>

                        <div style="flex: 1; max-width: 280px;">
                            <input type="text" id="fetch-search-input" placeholder="Search discovered table..." style="width: 100%; padding: 6px 10px; font-size: .8rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
                        </div>
                    </div>

                    <!-- Scrollable Discovered Tables List -->
                    <div id="discovered-tables-list" style="max-height: 55vh; overflow-y: auto; padding-right: 4px;">
                        <!-- Rendered dynamically -->
                    </div>
                </div>
            `;

            let showUnmappedOnly = (unmapped > 0);

            const renderDiscovered = () => {
                const q = (document.getElementById('fetch-search-input')?.value || '').toLowerCase().trim();
                const listEl = document.getElementById('discovered-tables-list');
                if (!listEl) return;

                const filtered = tables.filter(t => {
                    const tblName = t.table_name || t.tableName || '';
                    const isM = (t.is_mapped !== undefined) ? t.is_mapped : t.isMapped;
                    if (showUnmappedOnly && isM) return false;
                    if (q && !tblName.toLowerCase().includes(q)) return false;
                    return true;
                });

                if (filtered.length === 0) {
                    listEl.innerHTML = `
                        <div style="text-align: center; padding: 32px; color: var(--text-muted);">
                            <i class="fas fa-check-circle" style="font-size: 2rem; color: #10b981; margin-bottom: 8px; display: block;"></i>
                            All discovered tables in this view are already mapped in the MIS!
                        </div>
                    `;
                    return;
                }

                listEl.innerHTML = filtered.map(t => {
                    const tblName = t.table_name || t.tableName || '';
                    const pipe = t.suggested_pipeline || t.suggestedPipeline || 'Other';
                    const comm = t.suggested_commodity || t.suggestedCommodity || 'General / Other';
                    const dateCol = t.detected_date_column || t.detectedDateCol || 'Date';
                    const isM = (t.is_mapped !== undefined) ? t.is_mapped : t.isMapped;
                    const mappedUser = t.mapped_info?.assigned_user || t.mappedUser || '';
                    const pipeClass = pipe.toLowerCase();

                    return `
                        <div class="discovered-table-card">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <strong style="color: var(--text-primary); font-family: monospace; font-size: .9rem;">
                                        ${tblName}
                                    </strong>
                                    <span class="pipeline-badge ${pipeClass}">${pipe}</span>
                                    ${isM ? `
                                        <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .72rem;">
                                            <i class="fas fa-check"></i> Mapped (${mappedUser})
                                        </span>
                                    ` : `
                                        <span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b; font-size: .72rem;">
                                            <i class="fas fa-star"></i> Unmapped
                                        </span>
                                    `}
                                </div>
                                <div style="font-size: .75rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 14px; flex-wrap: wrap;">
                                    <span>Detected Date Column: <code style="color: #10b981;">${dateCol}</code></span>
                                    <span>Suggested Commodity: <strong style="color: #60a5fa;">${comm}</strong></span>
                                    ${t.row_count ? `<span>Rows: ${t.row_count}</span>` : ''}
                                </div>
                            </div>

                            <div>
                                ${isM ? `
                                    <button class="btn btn-outline btn-sm btn-map-table-now" data-table="${tblName}" data-action="edit">
                                        <i class="fas fa-pen"></i> Edit Mapping
                                    </button>
                                ` : `
                                    <button class="btn btn-primary btn-sm btn-map-table-now" data-table="${tblName}" data-action="new" style="background: linear-gradient(135deg, #10b981, #059669);">
                                        <i class="fas fa-plus"></i> Map Table
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('');

                // Wire click on Map Table
                listEl.querySelectorAll('.btn-map-table-now').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tblName = btn.dataset.table;
                        const targetTbl = tables.find(x => (x.table_name || x.tableName) === tblName);
                        if (!targetTbl) return;

                        App.closeModal();
                        const isM = (targetTbl.is_mapped !== undefined) ? targetTbl.is_mapped : targetTbl.isMapped;
                        const raw = targetTbl.table_name || targetTbl.tableName || '';
                        const pipe = targetTbl.suggested_pipeline || targetTbl.suggestedPipeline || 'Stage Direct';
                        const comm = targetTbl.suggested_commodity || targetTbl.suggestedCommodity || 'General / Other';
                        const dateCol = targetTbl.detected_date_column || targetTbl.detectedDateCol || 'Date';

                        if (isM) {
                            const mappedId = targetTbl.mapped_info?.id || targetTbl.mappedId;
                            const existing = (this._tableMappings || []).find(x => x.id === mappedId) || {
                                id: mappedId,
                                raw_table_name: raw,
                                final_business_name: targetTbl.mapped_info?.final_name || targetTbl.mappedFinalName || '',
                                commodity: targetTbl.mapped_info?.commodity || targetTbl.mappedCommodity || comm,
                                assigned_user: targetTbl.mapped_info?.assigned_user || targetTbl.mappedUser || (this._activeUsers && this._activeUsers[0]) || 'Nishant',
                                frequency: targetTbl.mapped_info?.frequency || targetTbl.mappedFrequency || 'Daily',
                                source_pipeline: pipe,
                                date_column: dateCol
                            };
                            this.openEditTableMappingModal(existing);
                        } else {
                            // Friendly title generator from table name
                            let friendlyName = raw
                                .replace(/^(pyexcel_|ipga_|sopa_|pystage_)/i, '')
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, l => l.toUpperCase());

                            this.openEditTableMappingModal({
                                raw_table_name: raw,
                                final_business_name: targetTbl.suggested_title || targetTbl.suggestedTitle || friendlyName,
                                commodity: comm,
                                assigned_user: (this._activeUsers && this._activeUsers[0]) || 'Nishant',
                                frequency: 'Daily',
                                source_pipeline: pipe,
                                date_column: dateCol,
                                is_active: true
                            });
                        }
                    });
                });
            };

            const btnUnmapped = document.getElementById('btn-show-unmapped-only');
            const btnAll = document.getElementById('btn-show-all-db');

            btnUnmapped?.addEventListener('click', () => {
                showUnmappedOnly = true;
                btnUnmapped.className = 'btn btn-sm btn-primary';
                btnAll.className = 'btn btn-sm btn-outline';
                renderDiscovered();
            });

            btnAll?.addEventListener('click', () => {
                showUnmappedOnly = false;
                btnAll.className = 'btn btn-sm btn-primary';
                btnUnmapped.className = 'btn btn-sm btn-outline';
                renderDiscovered();
            });

            document.getElementById('fetch-search-input')?.addEventListener('input', renderDiscovered);

            renderDiscovered();

        } catch (e) {
            console.error('Error fetching db tables:', e);
            const modalContent = document.getElementById('fetch-db-modal-content');
            if (modalContent) {
                modalContent.innerHTML = `<div class="sync-feedback-box error">Failed to connect to database discovery API.</div>`;
            }
        }
    },

    async openEditTableMappingModal(item = null) {
        if (!this._activeUsers || !this._activeUsers.length) {
            try {
                const uRes = await api.get('/admin/users');
                const uData = (uRes && uRes.data) || [];
                this._userList = uData;
                const activeNames = uData.filter(u => u.active !== false && (u.name || u.email)).map(u => (u.name || u.email).trim());
                if (activeNames.length) this._activeUsers = activeNames;
            } catch (e) {}
        }
        if (!this._activeCommodities || !this._activeCommodities.length) {
            try {
                const cRes = await api.get('/du/commodities');
                const cData = (cRes && cRes.commodities) || (cRes && cRes.data) || [];
                if (cData.length) this._activeCommodities = cData;
            } catch (e) {}
        }

        const isEdit = Boolean(item && item.id);
        const fallbackUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
        const activeDbUsers = (this._activeUsers && this._activeUsers.length) ? this._activeUsers : fallbackUsers;
        const existingItemUsers = (item && item.assigned_user ? item.assigned_user.split(',') : []).map(s => s.trim()).filter(Boolean);
        const authenticUsers = Array.from(new Set([...activeDbUsers, ...existingItemUsers])).sort();

        const fallbackCommodities = [
            'Bajra',
            'Barley',
            'Bengal Gram',
            'Chilli',
            'Coriander',
            'Cotton',
            'Cumin',
            'Maize',
            'Masoor',
            'Moong',
            'Pea',
            'Pulses',
            'Rapeseed',
            'Rice',
            'Soybeans',
            'Sugar',
            'Tops',
            'Tur',
            'Turmeric',
            'Urad',
            'Weather',
            'Wheat',
            'Macro / All'
        ];
        const dynamicComms = (this._activeCommodities && this._activeCommodities.length) ? this._activeCommodities : fallbackCommodities;
        const harmonizedCommodities = Array.from(new Set([...dynamicComms, ...fallbackCommodities])).sort();

        const defaultFallbackUser = authenticUsers[0] || 'Nishant';
        const rawTable = item ? item.raw_table_name : '';
        const finalName = item ? item.final_business_name : '';
        const user = item ? item.assigned_user : defaultFallbackUser;
        const comm = item ? item.commodity : (harmonizedCommodities[0] || 'Bajra');
        const freq = item ? item.frequency : 'Daily';
        const pipe = item ? (item.source_pipeline || 'PyExcel') : 'PyExcel';
        const dateCol = item ? (item.date_column || 'Date') : 'Date';
        const dueTime = item ? (item.due_time || '18:00') : '18:00';
        const isActive = (item && item.is_active !== undefined) ? item.is_active : true;

        const COMMODITY_COLORS = {
            'Bajra': { bg: 'rgba(217, 119, 6, 0.15)', text: '#d97706', border: 'rgba(217, 119, 6, 0.3)' },
            'Barley': { bg: 'rgba(180, 83, 9, 0.15)', text: '#b45309', border: 'rgba(180, 83, 9, 0.3)' },
            'Chilli': { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
            'Coriander': { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6', border: 'rgba(20, 184, 166, 0.3)' },
            'Cotton': { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
            'Cumin': { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
            'Maize': { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
            'Pulses': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
            'Bengal Gram': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
            'Tur': { bg: 'rgba(5, 150, 105, 0.15)', text: '#059669', border: 'rgba(5, 150, 105, 0.3)' },
            'Urad': { bg: 'rgba(13, 148, 136, 0.15)', text: '#0d9488', border: 'rgba(13, 148, 136, 0.3)' },
            'Moong': { bg: 'rgba(2, 132, 199, 0.15)', text: '#0284c7', border: 'rgba(2, 132, 199, 0.3)' },
            'Masoor': { bg: 'rgba(217, 70, 239, 0.15)', text: '#d946ef', border: 'rgba(217, 70, 239, 0.3)' },
            'Pea': { bg: 'rgba(132, 204, 22, 0.15)', text: '#84cc16', border: 'rgba(132, 204, 22, 0.3)' },
            'Rapeseed': { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },
            'Rice': { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' },
            'Soybeans': { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' },
            'Sugar': { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' },
            'Tops': { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9', border: 'rgba(14, 165, 233, 0.3)' },
            'Turmeric': { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
            'Weather': { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
            'Wheat': { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
        };

        const getCommodityColor = (cName) => {
            if (COMMODITY_COLORS[cName]) return COMMODITY_COLORS[cName];
            let hash = 0;
            for (let i = 0; i < cName.length; i++) hash = cName.charCodeAt(i) + ((hash << 5) - hash);
            const hue = Math.abs(hash) % 360;
            return {
                bg: `hsla(${hue}, 70%, 50%, 0.15)`,
                text: `hsl(${hue}, 85%, 65%)`,
                border: `hsla(${hue}, 70%, 50%, 0.3)`
            };
        };

        // Parse existing per-commodity configuration if present
        let existingCommConfig = {};
        if (item) {
            const rawCfg = item.commodity_config || item.commodityConfig;
            if (rawCfg) {
                try {
                    existingCommConfig = typeof rawCfg === 'string' ? JSON.parse(rawCfg) : rawCfg;
                } catch (e) {
                    existingCommConfig = {};
                }
            }
        }

        // Auto-recommendation based on table name rules
        let recommendedPill = 'Date';
        const rLower = (rawTable || '').toLowerCase();
        if (rLower.includes('sowing')) recommendedPill = 'WeekEndingDate';
        else if (rLower.includes('rakemovement') || rLower.includes('rake_movement')) recommendedPill = 'MetwithDate';
        else if (rLower.includes('lineup') || rLower.includes('port_lineup')) recommendedPill = 'PdfDate';
        else if (rLower.includes('imported')) recommendedPill = 'Date';

        // Prepare commodities list ensuring any existing commodity is included
        const existingComms = (comm || '').split(',').map(s => s.trim()).filter(Boolean);
        const allCommodities = [...harmonizedCommodities];
        existingComms.forEach(ec => {
            if (!allCommodities.some(c => c.toLowerCase() === ec.toLowerCase())) {
                allCommodities.push(ec);
            }
        });

        const isCommChecked = (cName) => {
            const cnLow = cName.trim().toLowerCase();
            return existingComms.some(ec => {
                const ecLow = ec.toLowerCase();
                if (ecLow === cnLow) return true;
                if (cnLow === 'pulses' && (ecLow.includes('pulse') || ecLow.includes('chana'))) return true;
                if (cnLow === 'tops' && (ecLow.includes('top') || ecLow.includes('tomato') || ecLow.includes('onion') || ecLow.includes('potato'))) return true;
                return (ecLow.length > 4 && cnLow.includes(ecLow)) || (cnLow.length > 4 && ecLow.includes(cnLow));
            });
        };

        let currentCommConfig = { ...existingCommConfig };

        const body = `
            <div style="font-size: .85rem; max-height: 80vh; overflow-y: auto; padding-right: 6px;">
                <!-- Hidden Source Pipeline as requested -->
                <input type="hidden" id="map-pipeline-input" value="${pipe}">

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; background: rgba(59,130,246,0.06); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(59,130,246,0.18);">
                    <div style="color: var(--text-secondary); font-size: .84rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-database" style="color: #60a5fa; font-size: 1rem;"></i>
                        <span>${isEdit ? `Editing mapping for <code style="font-size: .88rem; color: #60a5fa; background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 4px;">${rawTable}</code>` : 'Register a new MySQL table into the live surveillance catalog.'}</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .74rem; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.25);">
                            <i class="fas fa-server"></i> agalabsdev_stage
                        </span>
                        <span class="badge" style="background: rgba(99,102,241,0.15); color: #a5b4fc; font-size: .74rem; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(99,102,241,0.25);">
                            <i class="fas fa-stream"></i> ${pipe}
                        </span>
                    </div>
                </div>

                <!-- 2-Column Primary Grid -->
                <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; margin-bottom: 16px;">
                    <!-- Left Column: Table name, Title, Commodities, Users -->
                    <div>
                        <div class="form-group" style="margin-bottom: 12px;">
                            <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">Raw Table in agalabsdev_stage *</label>
                            <input type="text" id="map-raw-table-input" value="${rawTable}" placeholder="e.g. pyexcel_imported_market_prices" ${isEdit ? 'readonly' : ''} style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem; font-family: monospace; ${isEdit ? 'opacity: 0.9; cursor: not-allowed;' : ''}">
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">Final Business Title *</label>
                            <input type="text" id="map-final-name-input" value="${finalName}" placeholder="e.g. Imported Market Prices — Chana" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin: 0;">
                                        Harmonized Commodity <span style="font-size: .72rem; color: #60a5fa; font-weight: 400;">(Multi)</span>
                                    </label>
                                    <div style="display: flex; gap: 4px;">
                                        <button type="button" class="btn btn-xs btn-outline" id="btn-select-all-comm" style="padding: 2px 6px; font-size: .7rem; border-color: rgba(96,165,250,0.4); color: #60a5fa; cursor: pointer; border-radius: 4px;">All</button>
                                        <button type="button" class="btn btn-xs btn-outline" id="btn-deselect-all-comm" style="padding: 2px 6px; font-size: .7rem; border-color: rgba(255,255,255,0.2); color: var(--text-muted); cursor: pointer; border-radius: 4px;">Clear</button>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; max-height: 140px; min-height: 110px; overflow-y: auto; padding: 6px; background: rgba(0,0,0,0.22); border: 1px solid var(--border); border-radius: 6px; align-content: flex-start;">
                                    ${allCommodities.map(c => `
                                        <label style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 3px 8px; border-radius: 5px; font-size: .76rem; cursor: pointer; transition: all 0.2s;" class="lbl-modal-commodity">
                                            <input type="checkbox" class="chk-modal-commodity" value="${c}" ${isCommChecked(c) ? 'checked' : ''} style="margin: 0; cursor: pointer;">
                                            <span style="font-weight: 600;">${c}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <input type="text" id="map-commodity-input" value="${comm}" placeholder="e.g. Bajra, Maize, Pulses" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 7px 10px; border-radius: 6px; color: var(--text-primary); font-size: .82rem;">
                            </div>

                            <div class="form-group" style="margin-bottom: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin: 0;">
                                        Assigned Teammate(s) <span style="font-size: .72rem; color: #60a5fa; font-weight: 400;">(Multi)</span>
                                    </label>
                                    <div style="display: flex; gap: 4px;">
                                        <button type="button" class="btn btn-xs btn-outline" id="btn-select-all-user" style="padding: 2px 6px; font-size: .7rem; border-color: rgba(96,165,250,0.4); color: #60a5fa; cursor: pointer; border-radius: 4px;">All</button>
                                        <button type="button" class="btn btn-xs btn-outline" id="btn-deselect-all-user" style="padding: 2px 6px; font-size: .7rem; border-color: rgba(255,255,255,0.2); color: var(--text-muted); cursor: pointer; border-radius: 4px;">Clear</button>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; max-height: 140px; min-height: 110px; overflow-y: auto; padding: 6px; background: rgba(0,0,0,0.22); border: 1px solid var(--border); border-radius: 6px; align-content: flex-start;">
                                    ${authenticUsers.map(u => `
                                        <label style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 3px 8px; border-radius: 5px; font-size: .76rem; cursor: pointer; transition: all 0.2s;" class="lbl-modal-user">
                                            <input type="checkbox" class="chk-modal-user" value="${u}" ${user.includes(u) ? 'checked' : ''} style="margin: 0; cursor: pointer;">
                                            <span style="font-weight: 700;">${u}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <input type="text" id="map-user-input" value="${user}" placeholder="e.g. Nishant, Gopi" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 7px 10px; border-radius: 6px; color: var(--text-primary); font-size: .82rem;">
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Default Cadence, Date Column, SLA, Schema inspect, Active -->
                    <div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">Default Table Cadence *</label>
                                <select id="map-frequency-input" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 10px; border-radius: 6px; color: var(--text-primary); font-size: .84rem;">
                                    <option value="Daily" ${freq === 'Daily' ? 'selected' : ''}>Daily (Everyday)</option>
                                    <option value="Weekly" ${freq === 'Weekly' ? 'selected' : ''}>Weekly</option>
                                    <option value="Monthly" ${freq === 'Monthly' ? 'selected' : ''}>Monthly</option>
                                    <option value="Yearly" ${freq === 'Yearly' ? 'selected' : ''}>Yearly</option>
                                    <option value="Occasionally" ${freq === 'Occasionally' ? 'selected' : ''}>Occasionally</option>
                                </select>
                            </div>

                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">Default Due SLA</label>
                                <input type="text" id="map-due-time-input" value="${dueTime}" placeholder="18:00" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 10px; border-radius: 6px; color: var(--text-primary); font-size: .84rem; font-family: monospace;">
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">Date Column Name *</label>
                            <input type="text" id="map-date-col-input" value="${dateCol}" placeholder="Date" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 10px; border-radius: 6px; color: var(--text-primary); font-size: .84rem; font-family: monospace; font-weight: 600;">
                        </div>

                        <!-- Dynamically Read Schema Column Headings (Click to apply) -->
                        <div style="margin-bottom: 12px; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="font-size: .76rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-columns" style="color: #60a5fa;"></i>
                                    <span>Schema Columns <span style="font-size: .7rem; color: var(--text-muted); font-weight: 400;">(Click to set Date Column)</span></span>
                                </span>
                                <span style="font-size: .7rem; color: #10b981; font-weight: 600;" id="schema-status-badge">
                                    <i class="fas fa-spinner fa-spin"></i> Reading schema...
                                </span>
                            </div>
                            <div id="table-schema-columns-container" style="display: flex; gap: 5px; flex-wrap: wrap; max-height: 110px; overflow-y: auto; padding: 5px; background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; align-items: center;">
                                <span style="font-size: .74rem; color: var(--text-muted);"><i class="fas fa-spinner fa-spin" style="margin-right: 4px;"></i> Inspecting columns from agalabsdev_stage.${rawTable}...</span>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; background: rgba(16,185,129,0.06); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.18);">
                            <input type="checkbox" id="map-active-check" ${isActive ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                            <label for="map-active-check" style="font-size: .8rem; color: var(--text-primary); cursor: pointer; font-weight: 600; margin: 0;">
                                Active Surveillance Monitoring (Show in Crishi Surveillance Grid)
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Per-Commodity Specific Timing & Cadence Overrides Section -->
                <div style="margin-top: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 14px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <div style="font-size: .88rem; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 7px;">
                                <i class="fas fa-sliders-h"></i>
                                <span>Per-Commodity Specific Timing & Cadence Overrides</span>
                            </div>
                            <div style="font-size: .76rem; color: var(--text-secondary); margin-top: 3px;">
                                Set individual schedule & cutoff SLA for each commodity (e.g. <strong>Bajra is updated once a month &rarr; set to Monthly</strong>, while <strong>Maize is everyday &rarr; set to Daily</strong>).
                            </div>
                        </div>
                        <span class="badge" style="background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.25); font-size: .72rem; padding: 3px 8px; border-radius: 4px;">
                            <i class="fas fa-info-circle"></i> Granular Override Matrix
                        </span>
                    </div>

                    <div style="overflow-x: auto; max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; background: rgba(0,0,0,0.25);">
                        <table style="width: 100%; border-collapse: collapse; font-size: .8rem;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.04); border-bottom: 1px solid var(--border); text-align: left; color: var(--text-muted); font-size: .74rem; text-transform: uppercase;">
                                    <th style="padding: 8px 12px; width: 170px;">Commodity</th>
                                    <th style="padding: 8px 12px; width: 280px;">Individual Cadence / Schedule</th>
                                    <th style="padding: 8px 12px; width: 150px;">Due SLA (Cutoff)</th>
                                    <th style="padding: 8px 12px; width: 210px;">Dedicated Assignee</th>
                                    <th style="padding: 8px 12px;">Active Rule Preview</th>
                                </tr>
                            </thead>
                            <tbody id="comm-timing-matrix-tbody">
                                <!-- Populated dynamically via renderTimingMatrix() -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-table-mapping">
                <i class="fas fa-save"></i> ${isEdit ? 'Update Mapping' : 'Save & Register Table'}
            </button>
        `;

        App.showModal(isEdit ? `Edit Table Mapping: ${rawTable}` : 'Add New Table Mapping', body, footer, 'modal-wide');

        // Increase modal width and size in DOM for a spacious, accurate view
        const modalCard = document.getElementById('modal-card');
        if (modalCard) {
            modalCard.style.width = '1260px';
            modalCard.style.maxWidth = '96vw';
            modalCard.style.maxHeight = '94vh';
        }

        // Fetch and render Table Schema Columns
        const schemaContainer = document.getElementById('table-schema-columns-container');
        const schemaBadge = document.getElementById('schema-status-badge');
        if (rawTable && schemaContainer) {
            (async () => {
                try {
                    const schemaRes = await api.get(`/admin/table-schema/${encodeURIComponent(rawTable)}`);
                    if (schemaRes && schemaRes.success && schemaRes.columns && schemaRes.columns.length) {
                        schemaBadge.innerHTML = `<i class="fas fa-check-circle"></i> ${schemaRes.count} columns in schema`;
                        schemaContainer.innerHTML = schemaRes.columns.map(col => {
                            const isCurrent = (col.name === dateCol);
                            const isDateType = col.is_date;
                            const bg = isCurrent ? 'rgba(16,185,129,0.25)' : (isDateType ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)');
                            const border = isCurrent ? '#10b981' : (isDateType ? '#3b82f6' : 'var(--border)');
                            const textColor = isCurrent ? '#10b981' : (isDateType ? '#93c5fd' : 'var(--text-primary)');
                            const icon = isDateType ? '<i class="fas fa-calendar-alt" style="margin-right:3px;font-size:.65rem;color:#38bdf8;"></i>' : '';
                            return `
                                <button type="button" class="btn-schema-column" data-col="${col.name}" style="background: ${bg}; border: 1px solid ${border}; border-radius: 5px; padding: 4px 9px; font-size: .75rem; color: ${textColor}; cursor: pointer; font-family: monospace; display: inline-flex; align-items: center; gap: 4px; transition: all .15s;">
                                    ${icon}<strong>${col.name}</strong>
                                    <span style="font-size: .63rem; opacity: .7; color: var(--text-muted);">(${col.type})</span>
                                </button>
                            `;
                        }).join('');

                        schemaContainer.querySelectorAll('.btn-schema-column').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const chosenCol = btn.dataset.col;
                                const dInput = document.getElementById('map-date-col-input');
                                if (dInput && chosenCol) {
                                    dInput.value = chosenCol;
                                    schemaContainer.querySelectorAll('.btn-schema-column').forEach(b => {
                                        b.style.borderColor = 'var(--border)';
                                        b.style.background = 'rgba(255,255,255,0.05)';
                                        b.style.color = 'var(--text-primary)';
                                    });
                                    btn.style.borderColor = '#10b981';
                                    btn.style.background = 'rgba(16,185,129,0.25)';
                                    btn.style.color = '#10b981';
                                    App.showToast(`Selected date column: ${chosenCol}`, 'info');
                                }
                            });
                        });
                    } else {
                        schemaBadge.textContent = 'Schema unavailable';
                        schemaContainer.innerHTML = '<span style="color:var(--text-muted);font-size:.78rem;padding:6px;">No schema columns found. You can enter the date column manually above.</span>';
                    }
                } catch(e) {
                    if (schemaBadge) schemaBadge.textContent = 'Schema read error';
                    if (schemaContainer) schemaContainer.innerHTML = '<span style="color:var(--text-muted);font-size:.78rem;padding:6px;">Unable to load schema columns automatically.</span>';
                }
            })();
        }

        // --- Per-Commodity Timing Matrix Dynamic Logic ---
        const commInput = document.getElementById('map-commodity-input');
        const commCheckboxes = document.querySelectorAll('.chk-modal-commodity');

        const getSelectedCommodities = () => {
            const rawVal = commInput ? commInput.value : '';
            const fromInput = rawVal.split(',').map(s => s.trim()).filter(Boolean);
            const fromChecks = Array.from(commCheckboxes).filter(c => c.checked).map(c => c.value);
            const combined = [];
            const seen = new Set();
            [...fromChecks, ...fromInput].forEach(c => {
                if (!seen.has(c.toLowerCase())) {
                    seen.add(c.toLowerCase());
                    combined.push(c);
                }
            });
            return combined;
        };

        const renderTimingMatrix = () => {
            const list = getSelectedCommodities();
            const container = document.getElementById('comm-timing-matrix-tbody');
            if (!container) return;

            if (list.length === 0) {
                container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--text-muted); font-style:italic;">No commodities selected yet. Select commodities above to configure individual timings.</td></tr>`;
                return;
            }

            const currentDefaultFreq = document.getElementById('map-frequency-input')?.value || freq;
            const currentDefaultDue = document.getElementById('map-due-time-input')?.value || dueTime;
            const currentDefaultUser = document.getElementById('map-user-input')?.value || user;

            container.innerHTML = list.map(cName => {
                const cColor = COMMODITY_COLORS[cName] || getCommodityColor(cName);
                const cfg = currentCommConfig[cName] || {};
                const chosenFreq = cfg.frequency || '';
                const chosenCutoff = cfg.cutoff_time || '';
                const chosenUser = cfg.assigned_user || '';

                return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <td style="padding: 8px 12px; font-weight: 700;">
                            <span style="display: inline-block; background: ${cColor.bg}; color: ${cColor.text}; border: 1px solid ${cColor.border}; padding: 3px 8px; border-radius: 4px; font-size: .78rem;">
                                ${cName}
                            </span>
                        </td>
                        <td style="padding: 8px 12px;">
                            <select class="comm-cfg-freq" data-comm="${cName}" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 5px 8px; border-radius: 5px; color: var(--text-primary); font-size: .8rem;">
                                <option value="" ${!chosenFreq ? 'selected' : ''}>Inherit Default (${currentDefaultFreq})</option>
                                <option value="Daily" ${chosenFreq === 'Daily' ? 'selected' : ''}>Daily (Everyday)</option>
                                <option value="Weekly" ${chosenFreq === 'Weekly' ? 'selected' : ''}>Weekly</option>
                                <option value="Monthly" ${chosenFreq === 'Monthly' ? 'selected' : ''}>Monthly (Once in a month — e.g. Bajra)</option>
                                <option value="Cycle Window" ${chosenFreq === 'Cycle Window' ? 'selected' : ''}>Cycle Window (15th–20th)</option>
                                <option value="Yearly" ${chosenFreq === 'Yearly' ? 'selected' : ''}>Yearly</option>
                                <option value="Occasionally" ${chosenFreq === 'Occasionally' ? 'selected' : ''}>Occasionally</option>
                            </select>
                        </td>
                        <td style="padding: 8px 12px;">
                            <input type="text" class="comm-cfg-time" data-comm="${cName}" value="${chosenCutoff}" placeholder="${currentDefaultDue}" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 5px 8px; border-radius: 5px; color: var(--text-primary); font-size: .8rem; font-family: monospace;">
                        </td>
                        <td style="padding: 8px 12px;">
                            <select class="comm-cfg-user" data-comm="${cName}" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 5px 8px; border-radius: 5px; color: var(--text-primary); font-size: .8rem;">
                                <option value="" ${!chosenUser ? 'selected' : ''}>Inherit Assignee (${currentDefaultUser.split(',')[0] || 'Default'})</option>
                                ${authenticUsers.map(u => `
                                    <option value="${u}" ${chosenUser === u ? 'selected' : ''}>${u}</option>
                                `).join('')}
                            </select>
                        </td>
                        <td style="padding: 8px 12px; font-size: .75rem;">
                            ${chosenFreq ? `
                                <span class="badge" style="background: rgba(245,158,11,0.18); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); padding: 3px 8px; border-radius: 4px; font-weight: 700;">
                                    <i class="fas fa-clock" style="margin-right: 4px;"></i>${chosenFreq}
                                </span>
                            ` : `
                                <span style="color: var(--text-muted); font-size: .75rem;">Inherits ${currentDefaultFreq} (${currentDefaultDue})</span>
                            `}
                        </td>
                    </tr>
                `;
            }).join('');

            // Attach listeners to per-commodity controls
            container.querySelectorAll('.comm-cfg-freq').forEach(sel => {
                sel.addEventListener('change', (e) => {
                    const c = e.target.dataset.comm;
                    const val = e.target.value;
                    if (!currentCommConfig[c]) currentCommConfig[c] = {};
                    if (val) {
                        currentCommConfig[c].frequency = val;
                    } else {
                        delete currentCommConfig[c].frequency;
                        if (Object.keys(currentCommConfig[c]).length === 0) delete currentCommConfig[c];
                    }
                    renderTimingMatrix();
                });
            });

            container.querySelectorAll('.comm-cfg-time').forEach(inp => {
                inp.addEventListener('input', (e) => {
                    const c = e.target.dataset.comm;
                    const val = e.target.value.trim();
                    if (!currentCommConfig[c]) currentCommConfig[c] = {};
                    if (val) {
                        currentCommConfig[c].cutoff_time = val;
                    } else {
                        delete currentCommConfig[c].cutoff_time;
                        if (Object.keys(currentCommConfig[c]).length === 0) delete currentCommConfig[c];
                    }
                });
            });

            container.querySelectorAll('.comm-cfg-user').forEach(sel => {
                sel.addEventListener('change', (e) => {
                    const c = e.target.dataset.comm;
                    const val = e.target.value;
                    if (!currentCommConfig[c]) currentCommConfig[c] = {};
                    if (val) {
                        currentCommConfig[c].assigned_user = val;
                    } else {
                        delete currentCommConfig[c].assigned_user;
                        if (Object.keys(currentCommConfig[c]).length === 0) delete currentCommConfig[c];
                    }
                });
            });
        };

        // Sync checkboxes with commodity input field & re-render timing matrix
        commCheckboxes.forEach(chk => {
            chk.addEventListener('change', () => {
                const checkedComms = Array.from(commCheckboxes).filter(c => c.checked).map(c => c.value);
                if (commInput) commInput.value = checkedComms.join(', ');
                renderTimingMatrix();
            });
        });

        commInput?.addEventListener('input', () => {
            const rawVal = commInput.value.toLowerCase();
            const tokens = rawVal.split(',').map(s => s.trim()).filter(Boolean);
            commCheckboxes.forEach(chk => {
                const chkVal = chk.value.toLowerCase();
                chk.checked = tokens.includes(chkVal) || tokens.some(t => t === chkVal);
            });
            renderTimingMatrix();
        });

        // Select All / Deselect All Commodities
        document.getElementById('btn-select-all-comm')?.addEventListener('click', () => {
            commCheckboxes.forEach(chk => chk.checked = true);
            const allVals = Array.from(commCheckboxes).map(c => c.value);
            if (commInput) commInput.value = allVals.join(', ');
            renderTimingMatrix();
        });
        document.getElementById('btn-deselect-all-comm')?.addEventListener('click', () => {
            commCheckboxes.forEach(chk => chk.checked = false);
            if (commInput) commInput.value = '';
            renderTimingMatrix();
        });

        // Sync checkboxes with user input field
        const userInput = document.getElementById('map-user-input');
        const userCheckboxes = document.querySelectorAll('.chk-modal-user');
        userCheckboxes.forEach(chk => {
            chk.addEventListener('change', () => {
                const checkedUsers = Array.from(userCheckboxes).filter(c => c.checked).map(c => c.value);
                if (userInput) userInput.value = checkedUsers.join(', ');
                renderTimingMatrix();
            });
        });
        userInput?.addEventListener('input', () => {
            const rawVal = userInput.value.toLowerCase();
            const tokens = rawVal.split(',').map(s => s.trim()).filter(Boolean);
            userCheckboxes.forEach(chk => {
                const chkVal = chk.value.toLowerCase();
                chk.checked = tokens.includes(chkVal) || tokens.some(t => t === chkVal);
            });
            renderTimingMatrix();
        });

        // Select All / Deselect All Users
        document.getElementById('btn-select-all-user')?.addEventListener('click', () => {
            userCheckboxes.forEach(chk => chk.checked = true);
            const allVals = Array.from(userCheckboxes).map(c => c.value);
            if (userInput) userInput.value = allVals.join(', ');
            renderTimingMatrix();
        });
        document.getElementById('btn-deselect-all-user')?.addEventListener('click', () => {
            userCheckboxes.forEach(chk => chk.checked = false);
            if (userInput) userInput.value = '';
            renderTimingMatrix();
        });

        // Re-render timing matrix when default frequency or due time changes
        document.getElementById('map-frequency-input')?.addEventListener('change', renderTimingMatrix);
        document.getElementById('map-due-time-input')?.addEventListener('input', renderTimingMatrix);

        // Initial render of timing matrix
        renderTimingMatrix();

        // Save table mapping handler
        document.getElementById('btn-save-table-mapping')?.addEventListener('click', async () => {
            const raw = document.getElementById('map-raw-table-input')?.value.trim();
            const fn = document.getElementById('map-final-name-input')?.value.trim();
            const c = document.getElementById('map-commodity-input')?.value.trim();
            const u = document.getElementById('map-user-input')?.value.trim();
            const f = document.getElementById('map-frequency-input')?.value;
            const p = document.getElementById('map-pipeline-input')?.value;
            const dc = document.getElementById('map-date-col-input')?.value.trim() || 'Date';
            const dt = document.getElementById('map-due-time-input')?.value.trim() || '18:00';
            const act = document.getElementById('map-active-check')?.checked;
            const saveBtn = document.getElementById('btn-save-table-mapping');

            if (!raw || !fn || !u || !c) {
                App.showToast('Raw table name, final business title, commodity, and assigned teammate(s) are required.', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

            try {
                const payload = {
                    raw_table_name: raw,
                    final_business_name: fn,
                    commodity: c,
                    assigned_user: u,
                    frequency: f,
                    source_pipeline: p,
                    date_column: dc,
                    due_time: dt,
                    is_active: act,
                    commodity_config: currentCommConfig
                };

                let res;
                if (isEdit) {
                    res = await api.put(`/admin/table-mappings/${item.id}`, payload);
                } else {
                    res = await api.post('/admin/table-mappings', payload);
                }

                if (res && res.success) {
                    App.showToast(res.message || 'Mapping saved successfully.', 'success');
                    App.closeModal();
                    const container = document.getElementById('admin-content');
                    if (container) this.loadTableMapping(container);
                } else {
                    App.showToast(res.error || res.message || 'Failed to save mapping', 'error');
                }
            } catch (err) {
                console.error('Error saving mapping:', err);
                App.showToast(err.message || 'Error communicating with server', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save"></i> ${isEdit ? 'Update Mapping' : 'Save & Register Table'}`;
            }
        });
    }
};
