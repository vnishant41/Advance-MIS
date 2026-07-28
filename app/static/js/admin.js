/**
 * Admin Panel — Manager / SuperAdmin only.
 * Users, Reports, Report Merging, Commodities, Task Templates, Roster,
 * Settings, Module toggles, Bulk CSV import, Audit trail.
 * All tabs are inter-linked via quick-jump buttons in the header.
 */
import { api } from './api.js';

const TAB_DEFS = [
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
    'users':        ['roster', 'tasks', 'handovers'],
    'reports':      ['report-merge', 'bulk', 'commodities'],
    'report-merge': ['reports', 'bulk', 'commodities'],
    'commodities':  ['reports', 'report-merge', 'bulk'],
    'tasks':        ['users', 'bulk', 'roster', 'handovers'],
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
    currentTab: 'users',

    async render() {
        const tabsHtml = TAB_DEFS.map(t =>
            `<button class="tab${t.key === 'users' ? ' active' : ''}" data-tab="${t.key}"><i class="fas fa-${t.icon}"></i> ${t.label}</button>`
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
        if (!['SuperAdmin', 'Manager'].includes(window.currentUser?.role)) {
            document.getElementById('admin-content').innerHTML = '<div class="glass-card" style="padding:48px; text-align:center;"><i class="fas fa-lock" style="font-size:2rem; color:var(--danger);"></i><h3 style="margin-top:12px;">Access Denied</h3><p style="color:var(--text-muted);">Admin access requires Manager or SuperAdmin role.</p></div>';
            return;
        }

        this.currentTab = 'users';
        document.querySelectorAll('#admin-tabs .tab').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
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
        if      (t === 'users')        await this.loadUsers(container);
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

    showUserModal(user = null) {
        const isEdit = !!user;
        const bodyHtml = `
            <div class="form-row"><label>Email *</label><input type="email" id="au-email" value="${user?.email || ''}" style="width:100%;" ${isEdit ? 'readonly' : ''} required></div>
            <div class="form-grid">
                <div class="form-row"><label>Name *</label><input type="text" id="au-name" value="${user?.name || ''}" style="width:100%;" required></div>
                <div class="form-row"><label>Role</label><select id="au-role" style="width:100%;"><option value="Teammate" ${user?.role === 'Teammate' ? 'selected' : ''}>Teammate</option><option value="Leader" ${user?.role === 'Leader' ? 'selected' : ''}>Leader</option><option value="Manager" ${user?.role === 'Manager' ? 'selected' : ''}>Manager</option><option value="SuperAdmin" ${user?.role === 'SuperAdmin' ? 'selected' : ''}>SuperAdmin</option></select></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Department</label><input type="text" id="au-dept" value="${user?.department || 'Research'}" style="width:100%;"></div>
                <div class="form-row"><label>${isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="text" id="au-pwd" style="width:100%;" placeholder="${isEdit ? 'Unchanged' : 'Set password'}"></div>
            </div>
            <div class="form-row"><label>Commodities (comma-separated)</label><input type="text" id="au-commodities" value="${user?.commodities || ''}" style="width:100%;"></div>
        `;

        App.showModal(isEdit ? 'Edit User' : 'Add User', bodyHtml,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-user">Save</button>');

        setTimeout(() => {
            document.getElementById('btn-save-user')?.addEventListener('click', async () => {
                const email = document.getElementById('au-email').value.trim();
                const name = document.getElementById('au-name').value.trim();
                if (!email || !name) { App.showToast('Email and name required', 'warning'); return; }
                const payload = {
                    email, name,
                    role: document.getElementById('au-role').value,
                    department: document.getElementById('au-dept').value,
                    commodities: document.getElementById('au-commodities').value
                };
                const pwd = document.getElementById('au-pwd').value;
                if (pwd) payload.password = pwd;
                try {
                    if (isEdit) await api.put(`/admin/users/${encodeURIComponent(email)}`, payload);
                    else await api.post('/admin/users', payload);
                    App.closeModal();
                    App.showToast(isEdit ? 'User updated' : 'User added', 'success');
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed', 'error');
                }
            });
        }, 50);
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
            const [data, users] = await Promise.all([api.get('/admin/roster'), api.get('/admin/users')]);
            const items = data.data || [];
            this._userList = users.data || [];
            const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header" style="margin-bottom: 12px;">
                        <h3 class="card-title"><i class="fas fa-calendar-alt" style="color:var(--accent);margin-right:8px;"></i>Roster (${items.length})</h3>
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
            `;
            this._rosCache = items;
            this._wireFilterAndSort('roster-table', 'roster-search', { freq: 'roster-freq-filter' }, 'role');
            document.getElementById('btn-add-ros').addEventListener('click', () => this.showRosterModal());
            document.getElementById('btn-ros-sample').addEventListener('click', () => this.downloadSample('roster'));
            document.getElementById('btn-ros-bulk').addEventListener('click', () => this.switchTab('bulk'));
        } catch(e) { container.innerHTML = '<p class="error-text">Failed to load roster</p>'; }
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
            const [settingsData, logsData] = await Promise.all([
                api.get('/admin/settings'),
                api.get('/admin/email-logs')
            ]);
            const s = settingsData.settings || {};
            const logs = logsData.logs || [];
            const escAttr = (val) => App.escapeHtml(val || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            container.innerHTML = `
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px; margin-bottom:16px;">
                    <!-- Configuration Card -->
                    <div class="glass-card" style="padding:24px;">
                        <div class="card-header" style="margin-bottom:16px;">
                            <h3 class="card-title"><i class="fas fa-envelope-open-text" style="color:var(--accent);margin-right:8px;"></i>SMTP Configuration &amp; Digest Settings</h3>
                        </div>
                        
                        <div class="form-row" style="margin-bottom: 20px;">
                            <label style="font-weight:700;">Global Email Master Switch</label>
                            <select id="email-digest-enabled" style="width:100%;">
                                <option value="YES" ${s.emailDigestEnabled === 'YES' ? 'selected' : ''}>Yes — Enable All System Email Dispatches</option>
                                <option value="NO" ${s.emailDigestEnabled !== 'YES' ? 'selected' : ''}>No — Pause All System Email Dispatches</option>
                            </select>
                            <p style="font-size:.75rem; color:var(--text-muted); margin-top:4px;">When disabled, no automatically scheduled digest or reminder emails will be sent.</p>
                        </div>

                        <h4 style="margin-bottom:12px; font-size:.9rem; font-weight:700; color:var(--accent); border-bottom:1px solid var(--border); padding-bottom:6px;">
                            <i class="fas fa-clock" style="margin-right:6px;"></i>Multi-Stage Digest Schedules
                        </h4>
                        
                        <div class="form-grid" style="margin-bottom: 20px;">
                            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--bg-primary);">
                                <label style="font-weight:600; font-size:.85rem; display:block; margin-bottom:4px;">1. Teammate Reminder (Pending tasks)</label>
                                <div style="font-size:.78rem; color:var(--text-muted); margin-bottom:8px;">Sends a direct reminder of pending tasks to teammates.</div>
                                <div style="display:flex; gap:8px;">
                                    <select id="email-teammate-reminder-enabled" style="flex:1;">
                                        <option value="YES" ${s.emailTeammateReminderEnabled === 'YES' ? 'selected' : ''}>Enabled</option>
                                        <option value="NO" ${s.emailTeammateReminderEnabled !== 'YES' ? 'selected' : ''}>Disabled</option>
                                    </select>
                                    <input type="time" id="email-teammate-reminder-time" value="${s.emailTeammateReminderTime || '14:00'}" style="flex:1;">
                                </div>
                            </div>
                            
                            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--bg-primary);">
                                <label style="font-weight:600; font-size:.85rem; display:block; margin-bottom:4px;">2. Teammate Final Update (Full stats)</label>
                                <div style="font-size:.78rem; color:var(--text-muted); margin-bottom:8px;">Sends daily stats and report update scores to teammates.</div>
                                <div style="display:flex; gap:8px;">
                                    <select id="email-teammate-final-enabled" style="flex:1;">
                                        <option value="YES" ${s.emailTeammateFinalEnabled === 'YES' ? 'selected' : ''}>Enabled</option>
                                        <option value="NO" ${s.emailTeammateFinalEnabled !== 'YES' ? 'selected' : ''}>Disabled</option>
                                    </select>
                                    <input type="time" id="email-teammate-final-time" value="${s.emailTeammateFinalTime || '18:00'}" style="flex:1;">
                                </div>
                            </div>
                        </div>

                        <div class="form-grid" style="margin-bottom: 20px;">
                            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--bg-primary);">
                                <label style="font-weight:600; font-size:.85rem; display:block; margin-bottom:4px;">3. Manager Digest (Team status)</label>
                                <div style="font-size:.78rem; color:var(--text-muted); margin-bottom:8px;">Sends team-wide KPI overview and task sheets to manager.</div>
                                <div style="display:flex; gap:8px;">
                                    <select id="email-manager-digest-enabled" style="flex:1;">
                                        <option value="YES" ${s.emailManagerDigestEnabled === 'YES' ? 'selected' : ''}>Enabled</option>
                                        <option value="NO" ${s.emailManagerDigestEnabled !== 'YES' ? 'selected' : ''}>Disabled</option>
                                    </select>
                                    <input type="time" id="email-manager-digest-time" value="${s.emailManagerDigestTime || '19:00'}" style="flex:1;">
                                </div>
                            </div>
                            
                            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--bg-primary);">
                                <label style="font-weight:600; font-size:.85rem; display:block; margin-bottom:4px;">4. Leader Digest (Research updates)</label>
                                <div style="font-size:.78rem; color:var(--text-muted); margin-bottom:8px;">Sends detailed teamwise research update to leaders.</div>
                                <div style="display:flex; gap:8px;">
                                    <select id="email-leader-digest-enabled" style="flex:1;">
                                        <option value="YES" ${s.emailLeaderDigestEnabled === 'YES' ? 'selected' : ''}>Enabled</option>
                                        <option value="NO" ${s.emailLeaderDigestEnabled !== 'YES' ? 'selected' : ''}>Disabled</option>
                                    </select>
                                    <input type="time" id="email-leader-digest-time" value="${s.emailLeaderDigestTime || '20:00'}" style="flex:1;">
                                </div>
                            </div>
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
                            <button class="btn btn-primary" id="btn-save-email-settings"><i class="fas fa-save"></i> Save Settings</button>
                        </div>
                    </div>

                    <!-- Operations Card -->
                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div class="glass-card" style="padding:20px; flex:1;">
                            <h4 style="font-size:.9rem; font-weight:700; color:var(--warning); margin-bottom:8px;">
                                <i class="fas fa-paper-plane" style="margin-right:6px;"></i>Send Test Email
                            </h4>
                            <p style="font-size:.78rem; color:var(--text-muted); margin-bottom:12px;">Test the SMTP connection immediately by sending a test email.</p>
                            <div class="form-row">
                                <label style="font-size:.75rem;">Recipient Email</label>
                                <input type="email" id="email-test-recipient" placeholder="Enter recipient email..." style="width:100%; font-size:.8rem; padding:8px 12px; margin-bottom:10px;">
                            </div>
                            <button class="btn btn-outline btn-sm" id="btn-run-email-test" style="width:100%; justify-content:center;">
                                <i class="fas fa-paper-plane"></i> Send Test Email
                            </button>
                        </div>

                        <div class="glass-card" style="padding:20px; flex:1;">
                            <h4 style="font-size:.9rem; font-weight:700; color:var(--danger); margin-bottom:8px;">
                                <i class="fas fa-play" style="margin-right:6px;"></i>Manual Trigger
                            </h4>
                            <p style="font-size:.78rem; color:var(--text-muted); margin-bottom:12px;">Force-send a specific email digest stage or all stages immediately.</p>
                            <div class="form-row" style="margin-bottom: 12px;">
                                <label style="font-size:.75rem;">Digest Stage to Send</label>
                                <select id="email-digest-stage-select" style="width:100%; font-size:.8rem; padding:8px 12px;">
                                    <option value="all">All Stages</option>
                                    <option value="teammate-reminder">1. Teammate Reminder (Pending only)</option>
                                    <option value="teammate-final">2. Teammate Final (Full stats)</option>
                                    <option value="manager-digest">3. Manager Digest (Team status)</option>
                                    <option value="leader-digest">4. Leader Digest (Research updates)</option>
                                </select>
                            </div>
                            <button class="btn btn-outline btn-sm" id="btn-run-email-digest" style="width:100%; justify-content:center; border-color:var(--danger); color:var(--danger);">
                                <i class="fas fa-rocket"></i> Trigger Selected Stage
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Logs List Card -->
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

            // Save Settings Click handler
            document.getElementById('btn-save-email-settings').addEventListener('click', async () => {
                try {
                    await api.post('/admin/settings', {
                        emailDigestEnabled: document.getElementById('email-digest-enabled').value,
                        emailTeammateReminderEnabled: document.getElementById('email-teammate-reminder-enabled').value,
                        emailTeammateReminderTime: document.getElementById('email-teammate-reminder-time').value,
                        emailTeammateFinalEnabled: document.getElementById('email-teammate-final-enabled').value,
                        emailTeammateFinalTime: document.getElementById('email-teammate-final-time').value,
                        emailManagerDigestEnabled: document.getElementById('email-manager-digest-enabled').value,
                        emailManagerDigestTime: document.getElementById('email-manager-digest-time').value,
                        emailLeaderDigestEnabled: document.getElementById('email-leader-digest-enabled').value,
                        emailLeaderDigestTime: document.getElementById('email-leader-digest-time').value,
                        
                        smtpHost: document.getElementById('email-smtp-host').value.trim(),
                        smtpPort: document.getElementById('email-smtp-port').value.trim(),
                        smtpUser: document.getElementById('email-smtp-user').value.trim(),
                        smtpPassword: document.getElementById('email-smtp-password').value,
                        smtpFrom: document.getElementById('email-smtp-from').value.trim(),
                    });
                    App.showToast('Email Settings saved', 'success');
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
                if (!confirm(`This will immediately send out the daily email digest for stage "${stage}". Proceed?`)) return;
                
                const btn = document.getElementById('btn-run-email-digest');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Triggering...';
                try {
                    const res = await api.post('/admin/email-trigger-digest', { stage });
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
};
