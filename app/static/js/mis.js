/**
 * MIS Report — Report entry submission + PDF upload & analysis + Format Setup.
 */
import { api } from './api.js';

export default {
    currentTab: 'pdf',
    pdfDoc: null,
    numPages: 0,
    boxes: [], // { id, label, type, page, x0, y0, x1, y1 }
    scale: 1.5,
    isDrawing: false,
    drawPage: null,         // which page the user is currently drawing on
    startX: 0, startY: 0,
    currentBox: null,
    savedTemplates: [],

    async render() {
        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);

        return `
            <div class="tabs" id="mis-tabs">
                <button class="tab active" data-tab="my"><i class="fas fa-clipboard-check"></i> My Reports</button>
                <button class="tab" data-tab="pdf"><i class="fas fa-file-pdf"></i> PDF Analysis</button>
                <button class="tab" data-tab="history"><i class="fas fa-history"></i> Analysis History</button>
                ${isMgr ? '<button class="tab" data-tab="format"><i class="fas fa-ruler-combined"></i> Format Setup</button>' : ''}
            </div>

            <div id="mis-content">
                <div class="loading-skeleton"><div class="skeleton-card"></div></div>
            </div>
        `;
    },

    async init() {
        // Honor deep-link params (e.g. #mis?tab=pdf&report=Maize+Daily) coming
        // from the Tasks page Upload button.
        const params = window.routeParams || {};
        const requestedTab = ['my', 'pdf', 'history', 'format'].includes(params.tab) ? params.tab : 'my';
        this.currentTab = requestedTab;
        this._preselectReport = params.report || '';

        // Mark the right tab visually
        document.querySelectorAll('#mis-tabs .tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === this.currentTab);
            b.addEventListener('click', (e) => {
                document.querySelectorAll('#mis-tabs .tab').forEach(x => x.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentTab = e.currentTarget.dataset.tab;
                this._preselectReport = '';   // clear once a tab is manually clicked
                this.loadTab();
            });
        });

        this.loadTab();
    },

    async loadTab() {
        const container = document.getElementById('mis-content');
        container.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card"></div></div>';

        if (this.currentTab === 'my') await this.loadMyReports(container);
        else if (this.currentTab === 'pdf') this.loadPdfUpload(container);
        else if (this.currentTab === 'history') await this.loadHistory(container);
        else if (this.currentTab === 'format') this.loadFormatSetup(container);
    },

    async loadMyReports(container) {
        const user = window.currentUser || {};
        const isMgr = ['SuperAdmin', 'Manager'].includes(user.role);

        try {
            const [reportsData, templatesData, historyData] = await Promise.all([
                api.get('/mis/reports'),
                api.get('/mis/templates'),
                api.get('/mis/analysis/all'),
            ]);
            const reports = reportsData.reports || [];
            const templates = templatesData.templates || [];
            const history = historyData.analyses || [];

            // Researchers see only their own reports; managers see everyone's
            // so they can supervise.
            const mine = isMgr
                ? reports
                : reports.filter(r => (r.primaryAssignee || '').toLowerCase() === (user.email || '').toLowerCase());

            const templateByType = {};
            templates.forEach(t => { templateByType[t.reportType] = t; });

            // Most recent analysis per reportType
            const latestByType = {};
            history.forEach(a => {
                if (!a.reportType) return;
                const prev = latestByType[a.reportType];
                if (!prev || new Date(a.uploadDate) > new Date(prev.uploadDate)) {
                    latestByType[a.reportType] = a;
                }
            });

            // Today's uploads per reportType
            const todayStr = new Date().toISOString().slice(0, 10);
            const uploadedToday = (rt) => {
                const a = latestByType[rt];
                return a && (a.uploadDate || '').slice(0, 10) === todayStr;
            };

            let header = `
                <div class="glass-card" style="padding: 20px 24px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <h3 class="card-title" style="margin-bottom:4px;"><i class="fas fa-clipboard-check" style="color:var(--accent); margin-right:8px;"></i>My Reports</h3>
                            <div style="font-size:.8rem; color:var(--text-muted);">
                                ${isMgr ? 'Manager view — all reports' : `Reports assigned to ${App.escapeHtml(user.name || user.email)}`}
                                · ${mine.length} report${mine.length === 1 ? '' : 's'}
                            </div>
                        </div>
                        <div style="display:flex; gap:18px; align-items:center;">
                            <div style="text-align:center;">
                                <div style="font-size:1.4rem; font-weight:700; color:var(--accent);">${mine.filter(r => r.dueToday).length}</div>
                                <div style="font-size:.7rem; color:var(--text-muted);">Due today</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:1.4rem; font-weight:700; color:var(--success);">${mine.filter(r => uploadedToday(r.name)).length}</div>
                                <div style="font-size:.7rem; color:var(--text-muted);">Uploaded today</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            if (mine.length === 0) {
                container.innerHTML = header + `
                    <div class="glass-card" style="padding:32px; text-align:center;">
                        <i class="fas fa-inbox" style="font-size:2.5rem; color:var(--text-muted);"></i>
                        <p style="margin-top:12px; color:var(--text-muted);">No reports are assigned to you yet.</p>
                        <p style="font-size:.85rem; color:var(--text-muted);">Ask your manager to assign reports to your email in the Reports admin.</p>
                    </div>
                `;
                return;
            }

            // Sort: due-today + not-uploaded first, then due-today + uploaded, then rest
            mine.sort((a, b) => {
                const rank = (r) => {
                    const due = !!r.dueToday;
                    const up = uploadedToday(r.name);
                    if (due && !up) return 0;
                    if (due && up) return 1;
                    if (!due && !up) return 2;
                    return 3;
                };
                return rank(a) - rank(b);
            });

            const cards = mine.map(r => {
                const tpl = templateByType[r.name];
                const latest = latestByType[r.name];
                const todayDone = uploadedToday(r.name);
                const due = !!r.dueToday;

                const borderColor = todayDone ? 'var(--success)' : due ? 'var(--accent)' : 'var(--border)';
                const statusBadge = todayDone
                    ? `<span style="background:var(--success); color:#fff; padding:3px 8px; border-radius:999px; font-size:.7rem; font-weight:600;">UPLOADED TODAY</span>`
                    : due
                        ? `<span style="background:var(--accent); color:#fff; padding:3px 8px; border-radius:999px; font-size:.7rem; font-weight:600;">DUE TODAY</span>`
                        : `<span style="background:var(--bg-primary); color:var(--text-muted); padding:3px 8px; border-radius:999px; font-size:.7rem; font-weight:600; border:1px solid var(--border);">Not due</span>`;

                const tplBadge = tpl
                    ? `<span style="font-size:.7rem; color:var(--success);"><i class="fas fa-check-circle"></i> Template (${(tpl.layoutConfig || []).length})</span>`
                    : `<span style="font-size:.7rem; color:var(--warning);"><i class="fas fa-exclamation-triangle"></i> No template — ask admin</span>`;

                let scoreLine = '';
                if (latest) {
                    const score = latest.qualityScore || 0;
                    const sColor = score >= 90 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
                    scoreLine = `
                        <div style="margin-top:10px; padding:8px 10px; background:var(--bg-primary); border-radius:6px; font-size:.8rem;">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--text-muted);">Last upload</span>
                                <span style="color:${sColor}; font-weight:700;">${score}%</span>
                            </div>
                            <div style="color:var(--text-muted); font-size:.7rem; margin-top:2px;">
                                ${App.escapeHtml(latest.filename || '')} · ${App.timeAgo ? App.timeAgo(latest.uploadDate) : new Date(latest.uploadDate).toLocaleDateString()}
                            </div>
                            ${latest.summary ? `<div style="margin-top:4px; color:var(--text-secondary);">${App.escapeHtml(latest.summary.slice(0, 120))}${latest.summary.length > 120 ? '…' : ''}</div>` : ''}
                        </div>
                    `;
                }

                return `
                    <div class="glass-card" data-report="${App.escapeHtml(r.name)}" style="padding:16px; border-left:4px solid ${borderColor};">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; font-size:1rem;">${App.escapeHtml(r.name)}</div>
                                <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">
                                    <i class="fas fa-clock"></i> ${App.escapeHtml(r.frequency || '—')} · Deadline ${App.escapeHtml(r.deadline || 'N/A')}
                                </div>
                                <div style="margin-top:4px;">${tplBadge}</div>
                            </div>
                            ${statusBadge}
                        </div>
                        ${scoreLine}
                        <div style="display:flex; gap:6px; margin-top:12px;">
                            <input type="file" accept=".pdf" class="my-rep-file" data-report="${App.escapeHtml(r.name)}" style="display:none;"/>
                            <button class="btn btn-primary btn-sm my-rep-upload" data-report="${App.escapeHtml(r.name)}" style="flex:1;">
                                <i class="fas fa-upload"></i> ${todayDone ? 'Re-upload' : "Upload today's PDF"}
                            </button>
                            ${latest ? `<button class="btn btn-outline btn-sm my-rep-view" data-id="${latest.id}" title="View last analysis"><i class="fas fa-eye"></i></button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = header + `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px;">${cards}</div>`;

            container.querySelectorAll('.my-rep-upload').forEach(btn => {
                btn.addEventListener('click', () => {
                    const rt = btn.dataset.report;
                    const fileInput = container.querySelector(`.my-rep-file[data-report="${rt.replace(/"/g, '\\"')}"]`);
                    if (fileInput) fileInput.click();
                });
            });
            container.querySelectorAll('.my-rep-file').forEach(input => {
                input.addEventListener('change', () => this.handleMyReportUpload(input.files, input.dataset.report));
            });
            container.querySelectorAll('.my-rep-view').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.dataset.id);
                    this.showAnalysisDetail(id);
                });
            });
        } catch (err) {
            container.innerHTML = `<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load reports: ${App.escapeHtml(err.message || '')}</p></div>`;
        }
    },

    async handleMyReportUpload(files, reportType) {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            App.showToast('Please upload a PDF file', 'error');
            return;
        }

        const eta = file.size > 5 * 1024 * 1024 ? 60 : 35;
        App.startProgress('Checking PDF', {
            etaSeconds: eta,
            subtitle: `Verifying ${file.name} against ${reportType}...`,
        });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('reportType', reportType);

        try {
            const result = await api.post('/mis/upload-pdf', formData);
            App.endProgress();

            if (result.precheckFailed) {
                this.showPrecheckError(result.precheck, file.name);
                return;
            }

            // Refresh the list to show new status + score
            await this.loadMyReports(document.getElementById('mis-content'));
            // Show the analysis detail modal so they see the breakdown right away
            if (result.upload && result.upload.id) {
                this.showAnalysisDetail(result.upload.id);
            }
        } catch (err) {
            App.endProgress();
            App.showToast(err.message || 'Upload failed', 'error');
        }
    },

    async loadReportEntry(container) {
        // ... (Same as before) ...
        try {
            const data = await api.get('/mis/reports');
            const reports = data.reports || [];

            let html = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-clipboard-list" style="color:var(--accent);margin-right:8px;"></i>Select Report</h3>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
            `;

            reports.forEach(r => {
                const dueClass = r.dueToday ? 'border-color: var(--accent); box-shadow: 0 0 8px var(--accent-glow);' : '';
                html += `
                    <div class="report-card" style="padding: 16px; background: var(--bg-primary); border-radius: 8px; border: 1px solid var(--border); cursor: pointer; transition: all .2s; ${dueClass}" data-report="${App.escapeHtml(r.name)}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 700; font-size: .95rem; margin-bottom: 4px;">${App.escapeHtml(r.name)}</div>
                                <div style="font-size: .8rem; color: var(--text-muted);">
                                    <i class="fas fa-clock"></i> ${r.frequency} · Deadline: ${r.deadline || 'N/A'}
                                </div>
                                <div style="font-size: .8rem; color: var(--text-muted); margin-top: 2px;">
                                    <i class="fas fa-user"></i> ${r.primaryAssignee || 'Unassigned'}
                                </div>
                            </div>
                            ${r.dueToday ? '<span class="status-badge active" style="font-size:.7rem;">DUE TODAY</span>' : '<span class="status-badge skip" style="font-size:.7rem;">Not Due</span>'}
                        </div>
                    </div>
                `;
            });

            html += '</div></div><div id="mis-components-area" style="margin-top: 16px;"></div>';
            container.innerHTML = html;

            container.querySelectorAll('.report-card').forEach(card => {
                card.addEventListener('click', () => {
                    container.querySelectorAll('.report-card').forEach(c => c.style.borderColor = 'var(--border)');
                    card.style.borderColor = 'var(--accent)';
                    this.loadComponents(card.dataset.report);
                });
            });
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px; text-align:center;"><p class="error-text">Failed to load reports</p></div>';
        }
    },

    async loadComponents(reportName) {
        const area = document.getElementById('mis-components-area');
        area.innerHTML = '<div class="glass-card" style="padding:24px;"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading components...</p></div></div>';

        try {
            const data = await api.get(`/mis/components/${encodeURIComponent(reportName)}`);
            const comps = data.components || [];

            if (comps.length === 0) {
                area.innerHTML = `<div class="glass-card" style="padding:24px;"><div class="empty-state"><i class="fas fa-info-circle"></i><p>No components configured for ${App.escapeHtml(reportName)}</p></div></div>`;
                return;
            }

            let html = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-puzzle-piece" style="color:var(--success);margin-right:8px;"></i>${App.escapeHtml(reportName)} — Components</h3>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr><th>Component</th><th>Assignee</th><th>Min Count</th><th>Status</th><th>Remarks</th></tr>
                        </thead>
                        <tbody>
            `;

            comps.forEach((c, i) => {
                html += `
                    <tr>
                        <td style="font-weight:600;">${App.escapeHtml(c.componentName)}</td>
                        <td style="font-size:.85rem;color:var(--text-muted);">${c.assignee || '—'}</td>
                        <td style="text-align:center;">${c.minCount}</td>
                        <td>
                            <select class="mis-comp-status" data-idx="${i}" style="width:100px;">
                                <option value="Done" ${c.lastStatus === 'Done' ? 'selected' : ''}>Done</option>
                                <option value="Pending" ${c.lastStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="Skip" ${c.lastStatus === 'Skip' ? 'selected' : ''}>Skip</option>
                            </select>
                        </td>
                        <td><input type="text" class="mis-comp-remarks" data-idx="${i}" placeholder="Optional..." value="${App.escapeHtml(c.lastRemarks || '')}" style="width:100%;"></td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                        <button class="btn btn-outline" id="mis-mark-all">Mark All Done</button>
                        <button class="btn btn-primary" id="mis-submit-btn"><i class="fas fa-paper-plane"></i> Submit</button>
                    </div>
                </div>
            `;

            area.innerHTML = html;

            document.getElementById('mis-mark-all').addEventListener('click', () => {
                document.querySelectorAll('.mis-comp-status').forEach(s => s.value = 'Done');
            });

            document.getElementById('mis-submit-btn').addEventListener('click', async () => {
                const btn = document.getElementById('mis-submit-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

                const entries = [];
                document.querySelectorAll('.mis-comp-status').forEach(s => {
                    const idx = s.dataset.idx;
                    entries.push({
                        component: comps[idx].componentName,
                        status: s.value,
                        remarks: document.querySelector(`.mis-comp-remarks[data-idx="${idx}"]`)?.value || ''
                    });
                });

                try {
                    const result = await api.post('/mis/submit', { report: reportName, entries });
                    App.showToast(result.message || 'Report submitted', 'success');
                } catch (err) {
                    App.showToast(err.message || 'Failed to submit', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                }
            });
        } catch (err) {
            area.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load components</p></div>';
        }
    },

    loadPdfUpload(container) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 32px;">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-file-pdf" style="color:var(--danger);margin-right:8px;"></i>Strict Template Validation</h3>
                </div>
                <div id="pdf-drop-zone" style="border: 2px dashed var(--border); border-radius: 12px; padding: 48px; text-align: center; cursor: pointer; transition: all .3s;">
                    <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h4 style="margin-bottom: 8px;">Drag & drop your MIS PDF report here</h4>
                    <p style="color: var(--text-muted); margin-bottom: 16px;">or click to browse files</p>
                    <input type="file" id="pdf-file-input" accept=".pdf" style="display:none;">
                    <div class="form-row" style="max-width:340px; margin: 0 auto 12px;">
                        <label>Report Type *</label>
                        <select id="pdf-report-type" style="width:100%;">
                            <option value="">Loading templates...</option>
                        </select>
                        <p style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">
                            Templates are defined in <strong>Format Setup</strong>.
                        </p>
                    </div>
                    <button class="btn btn-primary" id="pdf-browse-btn"><i class="fas fa-folder-open"></i> Browse Files</button>
                </div>
                <div id="pdf-analysis-result" style="margin-top: 20px; display: none;"></div>
            </div>
        `;

        const dropZone = document.getElementById('pdf-drop-zone');
        const fileInput = document.getElementById('pdf-file-input');

        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; dropZone.style.background = 'rgba(59,130,246,0.05)'; });
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--border)'; dropZone.style.background = ''; });
        });
        dropZone.addEventListener('drop', e => this.handlePdfUpload(e.dataTransfer.files));

        document.getElementById('pdf-browse-btn').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => this.handlePdfUpload(fileInput.files));

        this.populateReportTypeDropdown('pdf-report-type');
    },

    async populateReportTypeDropdown(selectId, opts) {
        // selectId may be a single id or array of ids; opts: { showTemplateMarker: bool }
        const ids = Array.isArray(selectId) ? selectId : [selectId];
        const selects = ids.map(id => document.getElementById(id)).filter(Boolean);
        if (selects.length === 0) return;

        try {
            const [reportsData, templatesData] = await Promise.all([
                api.get('/mis/reports'),
                api.get('/mis/templates'),
            ]);
            const reports = reportsData.reports || [];
            const templateByType = {};
            (templatesData.templates || []).forEach(t => { templateByType[t.reportType] = t; });

            if (reports.length === 0) {
                selects.forEach(s => {
                    s.innerHTML = '<option value="">— No reports defined — add one in Reports admin —</option>';
                    s.disabled = true;
                });
                return;
            }

            // Sort: with-template first, then alphabetical
            const sorted = reports.slice().sort((a, b) => {
                const ta = templateByType[a.name] ? 0 : 1;
                const tb = templateByType[b.name] ? 0 : 1;
                if (ta !== tb) return ta - tb;
                return (a.name || '').localeCompare(b.name || '');
            });

            // If the user arrived via a "Upload" deep-link from the Tasks page,
            // prefer the report carried in that param over the previous value.
            const preferred = this._preselectReport || '';

            selects.forEach(sel => {
                sel.disabled = false;
                const previous = preferred || sel.value || sel.dataset.previous || '';
                const showMarker = !opts || opts.showTemplateMarker !== false;
                sel.innerHTML = '<option value="">Select report type...</option>'
                    + sorted.map(r => {
                        const tpl = templateByType[r.name];
                        const marker = showMarker
                            ? (tpl ? ` ✓ template (${(tpl.layoutConfig || []).length})` : ' — no template')
                            : '';
                        const sel_attr = r.name === previous ? ' selected' : '';
                        return `<option value="${App.escapeHtml(r.name)}"${sel_attr}>${App.escapeHtml(r.name)}${marker}</option>`;
                    }).join('');
                if (preferred) {
                    sel.value = preferred;
                    sel.dataset.previous = preferred;
                    // brief highlight so the user notices the selection was made for them
                    sel.style.borderColor = 'var(--accent)';
                    sel.style.boxShadow = '0 0 0 2px var(--accent-glow)';
                    setTimeout(() => { sel.style.borderColor = ''; sel.style.boxShadow = ''; }, 1600);
                }
                sel.addEventListener('change', () => { sel.dataset.previous = sel.value; });
            });
            // Clear the one-shot preselect so manually visiting the tab later doesn't override.
            if (preferred) this._preselectReport = '';
        } catch (err) {
            selects.forEach(s => {
                s.innerHTML = '<option value="">Failed to load report list</option>';
                s.disabled = true;
            });
        }
    },

    // Render an upfront error modal for a precheck-failed upload response.
    // The backend ran a fast page-1 check (name + date) and rejected the file
    // before doing the expensive full analysis.
    showPrecheckError(precheck, fileName) {
        const pc = precheck || {};
        const expected = (pc.expectedTokens || []).join(', ') || '—';
        const body = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="padding:12px 14px; background:rgba(239,68,68,0.10); border-left:4px solid var(--danger); border-radius:6px;">
                    <div style="font-weight:700; color:var(--danger); margin-bottom:4px;">
                        <i class="fas fa-exclamation-triangle"></i> Upload rejected
                    </div>
                    <div style="font-size:.85rem; color:var(--text-secondary);">${App.escapeHtml(pc.reason || 'Precheck failed.')}</div>
                </div>
                <div style="padding:10px 14px; background:var(--bg-primary); border-radius:6px; font-size:.85rem;">
                    <div style="display:grid; grid-template-columns: 130px 1fr; gap:6px 14px;">
                        <span style="color:var(--text-muted);">File</span>
                        <span style="word-break:break-all;">${App.escapeHtml(fileName || '—')}</span>
                        <span style="color:var(--text-muted);">Expected keywords</span>
                        <span>${App.escapeHtml(expected)}</span>
                        <span style="color:var(--text-muted);">Extracted name</span>
                        <span style="font-weight:600; color:${pc.nameMatch ? 'var(--success)' : 'var(--danger)'};">${App.escapeHtml(pc.extractedName || '(not found)')}</span>
                        <span style="color:var(--text-muted);">Extracted date</span>
                        <span style="font-weight:600; color:${pc.dateFound ? 'var(--success)' : 'var(--danger)'};">${App.escapeHtml(pc.extractedDate || '(not found)')}</span>
                    </div>
                </div>
                <div style="font-size:.78rem; color:var(--text-muted);">
                    Fix one of: pick the correct report type from the dropdown, or upload the matching PDF.
                </div>
            </div>
        `;
        const footer = `<button class="btn btn-primary" onclick="App.closeModal()">Got it</button>`;
        App.showModal('Wrong file for this report type', body, footer);
    },

    async handlePdfUpload(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            App.showToast('Please upload a PDF file', 'error');
            return;
        }

        const rt = document.getElementById('pdf-report-type')?.value || '';
        if (!rt) {
            App.showToast('Please specify a Report Type to validate against', 'warning');
            return;
        }

        // PDF upload runs parsing + template validation.
        // First call is slow (Ollama cold-load ~60s); warm calls ~20-25s.
        const eta = file.size > 5 * 1024 * 1024 ? 60 : 35;
        App.startProgress('Checking PDF', {
            etaSeconds: eta,
            subtitle: `Verifying report name & date in ${file.name}...`,
        });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('reportType', rt);

        try {
            const result = await api.post('/mis/upload-pdf', formData);
            App.endProgress();

            // Backend ran a fast precheck (page 1 only). If it failed, show
            // the upfront modal — no full-analysis UI is rendered.
            if (result.precheckFailed) {
                this.showPrecheckError(result.precheck, file.name);
                return;
            }

            this.showAnalysisResult(result.upload);
        } catch (err) {
            App.endProgress();
            App.showToast(err.message || 'PDF analysis failed', 'error');
        }
    },


    renderSemanticVerdict(analysis, uploadId, reportType) {
        const semantic = (analysis && analysis.llm) || null;
        if (!semantic) return '';

        if (!semantic.available) {
            return `
                <div style="margin-bottom:14px; padding:10px 14px; background:rgba(148,163,184,0.08); border-left:3px solid var(--text-muted); border-radius:6px; font-size:.85rem; color:var(--text-muted);">
                    <i class="fas fa-shield-check"></i> Advanced Text Verification skipped: ${App.escapeHtml(semantic.error || 'Engine unavailable')}
                </div>
            `;
        }

        const sections = semantic.sections || [];
        const verdictColor = (v) => v === 'ok' ? 'var(--success)' : v === 'suspect' ? 'var(--warning)' : 'var(--danger)';
        const verdictIcon = (v) => v === 'ok' ? 'fa-check-circle' : v === 'suspect' ? 'fa-exclamation-triangle' : 'fa-times-circle';

        const sectionRows = sections.map((s, i) => {
            const heading = App.escapeHtml(s.heading || '(unnamed)');
            const reason = App.escapeHtml(s.reason || '');
            const v = (s.verdict || 'ok').toLowerCase();
            const fbKey = `semanticfb-${uploadId}-${i}`;
            return `
                <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-bottom:1px solid var(--border);">
                    <i class="fas ${verdictIcon(v)}" style="color:${verdictColor(v)}; margin-top:3px;"></i>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:.85rem;">${heading}</div>
                        <div style="color:var(--text-muted); font-size:.75rem; margin-top:2px;">${reason}</div>
                    </div>
                    <div style="display:flex; gap:4px;" data-semantic-feedback="${fbKey}">
                        <button title="Verdict is correct" class="semantic-fb-btn" data-fb="up"
                            data-report-type="${App.escapeHtml(reportType || '')}"
                            data-upload-id="${uploadId}"
                            data-section="${heading}"
                            data-verdict="${v}"
                            data-reason="${reason}"
                            style="background:transparent; border:1px solid var(--border); color:var(--success); cursor:pointer; padding:2px 6px; border-radius:3px;">
                            <i class="fas fa-thumbs-up"></i>
                        </button>
                        <button title="Verdict is wrong" class="semantic-fb-btn" data-fb="down"
                            data-report-type="${App.escapeHtml(reportType || '')}"
                            data-upload-id="${uploadId}"
                            data-section="${heading}"
                            data-verdict="${v}"
                            data-reason="${reason}"
                            style="background:transparent; border:1px solid var(--border); color:var(--danger); cursor:pointer; padding:2px 6px; border-radius:3px;">
                            <i class="fas fa-thumbs-down"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="margin-bottom:14px; padding:12px 16px; background:rgba(16,185,129,0.08); border-left:4px solid var(--success); border-radius:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="font-weight:700; color:var(--success);"><i class="fas fa-shield-check"></i> Advanced Text Verification</div>
                </div>
                ${semantic.overall ? `<p style="margin:4px 0 8px; font-size:.85rem; color:var(--text-primary);">${App.escapeHtml(semantic.overall)}</p>` : ''}
                ${sectionRows ? `<div style="margin-top:8px;">${sectionRows}</div>` : '<p style="color:var(--text-muted); font-size:.8rem;">No per-section verdicts returned.</p>'}
                ${semantic.error ? `<div style="color:var(--warning); font-size:.75rem; margin-top:6px;">Note: ${App.escapeHtml(semantic.error)}</div>` : ''}
            </div>
        `;
    },

    async submitSemanticFeedback(btn) {
        const payload = {
            reportType: btn.dataset.reportType,
            uploadId: Number(btn.dataset.uploadId),
            section: btn.dataset.section,
            verdict: btn.dataset.verdict,
            reason: btn.dataset.reason,
            feedback: btn.dataset.fb,
        };
        try {
            await api.post('/mis/semantic-feedback', payload);
            const group = btn.closest('[data-semantic-feedback]');
            if (group) {
                group.querySelectorAll('.semantic-fb-btn').forEach(b => {
                    b.disabled = true;
                    b.style.opacity = '0.45';
                });
                btn.style.background = btn.dataset.fb === 'up' ? 'var(--success)' : 'var(--danger)';
                btn.style.color = '#fff';
                btn.style.opacity = '1';
            }
            App.showToast('Feedback saved — future runs will use this', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to save feedback', 'error');
        }
    },

    renderCategoryBadges(analysis) {
        const order = ['Sections', 'Comm', 'Table', 'Chart', 'Image'];
        const icons = {
            Sections: 'fa-list-ul',
            Comm: 'fa-align-left',
            Table: 'fa-table',
            Chart: 'fa-chart-bar',
            Image: 'fa-image',
        };
        const status = analysis.categoryStatus || {};
        const detail = analysis.categoryDetail || {};

        const cards = order.map(cat => {
            const s = status[cat] || 'absent';
            const d = detail[cat] || { passed: 0, partial: 0, total: 0, failedLabels: [] };

            let color, bg, iconCls, sub;
            if (s === 'green') {
                color = 'var(--success)';
                bg = 'rgba(16, 185, 129, 0.10)';
                iconCls = 'fa-check-circle';
                sub = `All ${d.total} matched`;
            } else if (s === 'red') {
                color = 'var(--danger)';
                bg = 'rgba(239, 68, 68, 0.10)';
                iconCls = 'fa-times-circle';
                const shifted = d.partial ? ` · ${d.partial} shifted` : '';
                sub = `${d.passed}/${d.total} matched${shifted}`;
            } else {
                color = 'var(--text-muted)';
                bg = 'rgba(148, 163, 184, 0.08)';
                iconCls = 'fa-minus-circle';
                sub = 'Not required';
            }

            const tip = (s === 'red' && d.failedLabels && d.failedLabels.length)
                ? ` title="Failed: ${App.escapeHtml(d.failedLabels.join(', '))}"`
                : '';

            return `
                <div class="glass-card"${tip} style="padding:16px; border-left:4px solid ${color}; background:${bg};">
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <i class="fas ${icons[cat]}" style="color:${color}; font-size:1.3rem;"></i>
                            <span style="font-weight:700; font-size:1rem;">${cat}</span>
                        </div>
                        <i class="fas ${iconCls}" style="color:${color}; font-size:1.4rem;"></i>
                    </div>
                    <div style="margin-top:6px; font-size:.85rem; color:var(--text-muted);">${sub}</div>
                </div>
            `;
        }).join('');

        return `<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:12px;">${cards}</div>`;
    },

    renderElementDetail(results, analysis) {
        const keys = Object.keys(results);
        if (keys.length === 0) return '';

        // Use the saved template's box order (if available) to group results into
        // sections under headings, matching the Format Setup layout.
        const sectionTypes = new Set(['heading', 'name', 'date']);
        const statusPill = (s) => {
            // SHIFTED means the element IS present, just not at the exact saved
            // coordinates → render as a passing variant in green (with the SHIFTED
            // label retained so admins can spot what drifted if they want to retune
            // the template).
            let color, label;
            if (s === 'pass') { color = 'var(--success)'; label = 'PASS'; }
            else if (s === 'partial') { color = 'var(--success)'; label = 'PASS · shifted'; }
            else { color = 'var(--danger)'; label = 'FAIL'; }
            return `<span style="color:${color}; font-weight:700; font-size:.85rem;">${label}</span>`;
        };

        let html = '';
        const templateBoxes = (analysis && analysis.templateBoxes) ? analysis.templateBoxes : null;

        const extractedText = (analysis && analysis.extractedText) || {};
        const labelOf = (b) => {
            const txt = extractedText[b.label];
            // For headings/names/dates show the actual PDF text; fall back to the box label.
            if (txt && (sectionTypes.has(b.type) || b.type === 'heading')) return txt;
            return b.label;
        };

        if (Array.isArray(templateBoxes) && templateBoxes.length) {
            const byPage = {};
            templateBoxes.forEach(b => { (byPage[b.page] = byPage[b.page] || []).push(b); });
            const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b);

            html = pages.map(p => {
                const pageBoxes = byPage[p].slice().sort((a, b) => a.y0 - b.y0);
                const sections = [];
                let current = { heading: null, children: [] };
                pageBoxes.forEach(b => {
                    if (sectionTypes.has(b.type)) {
                        if (current.heading || current.children.length) sections.push(current);
                        current = { heading: b, children: [] };
                    } else {
                        current.children.push(b);
                    }
                });
                if (current.heading || current.children.length) sections.push(current);

                return `
                    <div style="margin-bottom:14px;">
                        <div style="font-size:.72rem; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Page ${p}</div>
                        ${sections.map(s => {
                            const hs = s.heading ? statusPill(results[s.heading.label] || 'fail') : '';
                            let headRow = '';
                            if (s.heading) {
                                const hExtracted = extractedText[s.heading.label] || '';
                                const hSavedText = (s.heading.text || '').trim();
                                // Show the saved expected text and the actually-extracted text
                                // so admins (and the LLM via feedback) can see what was checked.
                                let hSnippet = '';
                                if (hExtracted) {
                                    const short = hExtracted.length > 140 ? hExtracted.slice(0, 140) + '…' : hExtracted;
                                    hSnippet = `<div style="font-size:.7rem; color:var(--text-muted); margin-top:3px;">Found: "${App.escapeHtml(short)}"</div>`;
                                } else if (hSavedText) {
                                    hSnippet = `<div style="font-size:.7rem; color:var(--text-muted); margin-top:3px;">Expected: "${App.escapeHtml(hSavedText)}"</div>`;
                                }
                                headRow = `
                                    <div style="padding:6px 10px; background:rgba(139,92,246,0.10); border-left:3px solid #8b5cf6; border-radius:4px;">
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <span style="font-weight:700;">${App.escapeHtml(labelOf(s.heading))} <span style="color:var(--text-muted); font-weight:400; font-size:.7rem;">(${s.heading.type})</span></span>
                                            ${hs}
                                        </div>
                                        ${hSnippet}
                                    </div>`;
                            }
                            const childRows = s.children.map(c => {
                                const extracted = extractedText[c.label];
                                const savedText = (c.text || '').trim();
                                let snippet = '';
                                if (extracted) {
                                    const short = extracted.length > 140 ? extracted.slice(0, 140) + '…' : extracted;
                                    snippet = `<div style="font-size:.7rem; color:var(--text-muted); margin-top:2px;">Found: "${App.escapeHtml(short)}"</div>`;
                                } else if (savedText) {
                                    snippet = `<div style="font-size:.7rem; color:var(--text-muted); margin-top:2px;">Expected: "${App.escapeHtml(savedText.slice(0,140))}${savedText.length>140?'…':''}"</div>`;
                                }
                                return `
                                <div style="padding:4px 10px 4px 24px; border-bottom:1px solid var(--border);">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span>${App.escapeHtml(c.label)} <span style="color:var(--text-muted); font-size:.7rem;">(${c.type})</span></span>
                                        ${statusPill(results[c.label] || 'fail')}
                                    </div>
                                    ${snippet}
                                </div>`;
                            }).join('');
                            return headRow + childRows;
                        }).join('')}
                    </div>
                `;
            }).join('');
        } else {
            // Fallback: flat list when the analysis blob doesn't include templateBoxes
            html = keys.map(k => `
                <div style="display:flex; justify-content:space-between; padding:8px 4px; border-bottom:1px solid var(--border);">
                    <span>${App.escapeHtml(k)}</span>
                    ${statusPill(results[k])}
                </div>
            `).join('');
        }

        return `
            <details style="margin-top:16px; padding:12px 16px; background:var(--bg-primary); border-radius:8px;" open>
                <summary style="cursor:pointer; font-weight:600;">Per-element detail (${keys.length})</summary>
                <div style="margin-top:8px;">${html}</div>
            </details>
        `;
    },

    showAnalysisResult(upload) {
        const container = document.getElementById('pdf-analysis-result');
        if (!container || !upload) return;

        container.style.display = 'block';

        let contentHtml = '';

        if (upload.analysis && upload.analysis.isTemplateBased) {
            // Mismatch banner: chosen report type doesn't match the PDF content.
            const mm = upload.analysis.mismatch;
            if (mm && mm.matched === false) {
                contentHtml += `
                    <div style="margin-bottom:14px; padding:14px 16px; background:rgba(239,68,68,0.10); border-left:4px solid var(--danger); border-radius:6px;">
                        <div style="font-weight:700; color:var(--danger); margin-bottom:4px;">
                            <i class="fas fa-exclamation-triangle"></i> Wrong file for this report type
                        </div>
                        <div style="font-size:.85rem; color:var(--text-secondary);">${App.escapeHtml(mm.reason || '')}</div>
                    </div>
                `;
            }

            // Extracted report name + date pulled directly from the PDF
            const ef = upload.analysis.extractedFields || {};
            if (ef.name || ef.date) {
                contentHtml += `
                    <div style="margin-bottom:14px; padding:12px 16px; background:rgba(59,130,246,0.08); border-left:4px solid var(--accent); border-radius:6px;">
                        <div style="display:flex; gap:24px; flex-wrap:wrap;">
                            <div><span style="color:var(--text-muted); font-size:.8rem;">Report</span><div style="font-weight:700; font-size:1.05rem;">${App.escapeHtml(ef.name || '—')}</div></div>
                            <div><span style="color:var(--text-muted); font-size:.8rem;">Date</span><div style="font-weight:700; font-size:1.05rem;">${App.escapeHtml(ef.date || '—')}</div></div>
                        </div>
                    </div>
                `;
            }

            contentHtml += this.renderSemanticVerdict(upload.analysis, upload.id, upload.reportType);
            contentHtml += this.renderCategoryBadges(upload.analysis);

            const score = upload.qualityScore;
            const scoreColor = score >= 90 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
            contentHtml += `
                <div style="margin-top: 16px; padding: 16px; background: var(--bg-primary); border-radius: 8px;">
                    <div style="font-size:1.2rem; font-weight:700;">Validation Score: <span style="color:${scoreColor}">${score}%</span></div>
                    <p style="color:var(--text-muted); margin-top:4px;">${App.escapeHtml(upload.summary || '')}</p>
                </div>
            `;

            contentHtml += this.renderElementDetail(upload.analysis.validationResults || {}, upload.analysis);
        } else {
            // Legacy UI Fallback
            contentHtml = `
                <div class="kpi-grid" style="margin-bottom: 16px;">
                    <div class="glass-card kpi-card blue">
                        <div class="kpi-top"><div><div class="kpi-value">${upload.qualityScore}%</div><div class="kpi-label">Quality Score</div></div><div class="kpi-icon"><i class="fas fa-star"></i></div></div>
                    </div>
                    <div class="glass-card kpi-card green">
                        <div class="kpi-top"><div><div class="kpi-value">${upload.tablesCount}</div><div class="kpi-label">Tables Found</div></div><div class="kpi-icon"><i class="fas fa-table"></i></div></div>
                    </div>
                    <div class="glass-card kpi-card amber">
                        <div class="kpi-top"><div><div class="kpi-value">${upload.chartsCount}</div><div class="kpi-label">Charts Found</div></div><div class="kpi-icon"><i class="fas fa-chart-bar"></i></div></div>
                    </div>
                </div>
                ${upload.summary ? `<div style="padding:16px; background:var(--bg-primary); border-radius:8px; margin-bottom:12px;"><strong>Summary:</strong><br>${App.escapeHtml(upload.summary)}</div>` : ''}
                <div style="padding:12px; background:rgba(245,158,11,0.1); color:var(--warning); border-radius:8px; margin-top:8px;">
                    <i class="fas fa-exclamation-triangle"></i> This report was analyzed using generic extraction. Ask an Admin to set up a Strict Format Template for this Report Type.
                </div>
            `;
        }

        container.innerHTML = `
            <div class="section-title"><i class="fas fa-shield-check"></i> Analysis Results — ${App.escapeHtml(upload.filename)}</div>
            ${contentHtml}
        `;

        container.querySelectorAll('.semantic-fb-btn').forEach(b => {
            b.addEventListener('click', (e) => this.submitSemanticFeedback(e.currentTarget));
        });
    },

    async loadHistory(container) {
        try {
            const data = await api.get('/mis/analysis/all');
            const analyses = data.analyses || [];

            if (analyses.length === 0) {
                container.innerHTML = '<div class="glass-card" style="padding:24px;"><div class="empty-state"><i class="fas fa-file-pdf"></i><p>No PDF analyses yet.</p></div></div>';
                return;
            }

            let html = `<div class="glass-card" style="padding: 24px;">
                <div class="card-header"><h3 class="card-title"><i class="fas fa-history" style="color:var(--info);margin-right:8px;"></i>Analysis History</h3></div>
                <table class="data-table">
                    <thead><tr><th>File</th><th>Report Type</th><th>Score</th><th>Type</th><th>Uploaded By</th><th>Date</th></tr></thead>
                    <tbody>`;

            analyses.forEach(a => {
                const scoreBg = a.qualityScore === 100 ? 'var(--success)' : a.qualityScore >= 50 ? 'var(--warning)' : 'var(--danger)';
                const isTemplate = a.analysis && a.analysis.isTemplateBased;
                html += `
                    <tr style="cursor:pointer;" onclick="App.modules.mis.showAnalysisDetail(${a.id})">
                        <td style="font-weight:500;">${App.escapeHtml(a.filename)}</td>
                        <td>${App.escapeHtml(a.reportType || '—')}</td>
                        <td><span style="color:${scoreBg}; font-weight:700;">${a.qualityScore}%</span></td>
                        <td><span class="tag" style="background:${isTemplate ? 'var(--success)' : 'var(--text-muted)'}">${isTemplate ? 'Template' : 'Generic'}</span></td>
                        <td style="font-size:.85rem;">${App.escapeHtml(a.uploadedBy)}</td>
                        <td style="font-size:.85rem;">${App.timeAgo(a.uploadDate)}</td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load history</p></div>';
        }
    },

    async showAnalysisDetail(id) {
        try {
            const data = await api.get(`/mis/analysis/${id}`);
            const a = data.analysis;
            
            let resHtml = '';
            if (a.analysis && a.analysis.isTemplateBased) {
                resHtml = this.renderCategoryBadges(a.analysis)
                    + this.renderElementDetail(a.analysis.validationResults || {}, a.analysis);
            } else {
                resHtml = `<p><strong>Tables:</strong> ${a.tablesCount} | <strong>Charts:</strong> ${a.chartsCount}</p>`;
            }

            const bodyHtml = `
                <div style="max-height:400px; overflow:auto;">
                    <p><strong>File:</strong> ${App.escapeHtml(a.filename)}</p>
                    <p><strong>Score:</strong> ${a.qualityScore}%</p>
                    ${a.summary ? `<p><strong>Summary:</strong> ${App.escapeHtml(a.summary)}</p>` : ''}
                    <hr style="border-color:var(--border); margin:12px 0;">
                    ${resHtml}
                </div>
            `;
            App.showModal(`Analysis — ${a.filename}`, bodyHtml);
        } catch (err) {
            App.showToast('Failed to load analysis detail', 'error');
        }
    },

    // --- FORMAT SETUP — multi-page + auto-detect + saved templates ---

    loadFormatSetup(container) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 24px;">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-ruler-combined" style="color:var(--accent);margin-right:8px;"></i>Format Setup</h3>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <select id="fmt-report-type" style="width:240px;">
                            <option value="">Loading reports...</option>
                        </select>
                        <button class="btn btn-outline btn-sm" id="fmt-auto-btn" disabled><i class="fas fa-magic"></i> Auto-Detect</button>
                        <button class="btn btn-primary btn-sm" id="fmt-save-btn" disabled><i class="fas fa-save"></i> Save Layout</button>
                    </div>
                </div>

                <div style="display:flex; gap:16px; align-items:flex-start; margin-top:8px;">
                    <!-- Left column: saved templates + element tools + boxes list -->
                    <div style="width: 280px; flex-shrink: 0; display:flex; flex-direction:column; gap:12px;">
                        <div style="background:var(--bg-primary); padding:14px; border-radius:8px; border:1px solid var(--border);">
                            <div style="font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                                <span><i class="fas fa-folder-open" style="color:var(--accent); margin-right:4px;"></i> Saved Templates</span>
                                <button class="btn btn-sm btn-outline" id="fmt-refresh-list" title="Refresh" style="padding:2px 6px;"><i class="fas fa-sync"></i></button>
                            </div>
                            <div id="fmt-templates-list" style="max-height:180px; overflow-y:auto;">
                                <div class="empty-state" style="padding:6px;"><p style="font-size:.75rem;">Loading...</p></div>
                            </div>
                        </div>

                        <div style="background:var(--bg-primary); padding:14px; border-radius:8px; border:1px solid var(--border);">
                            <div style="font-weight:600; margin-bottom:8px;">Master PDF</div>
                            <input type="file" id="fmt-pdf-upload" accept=".pdf" style="width:100%; font-size:.8rem;">
                            <p style="font-size:.7rem; color:var(--text-muted); margin-top:6px;">Upload, then click <strong>Auto-Detect</strong> or draw boxes manually.</p>
                        </div>

                        <div style="background:var(--bg-primary); padding:14px; border-radius:8px; border:1px solid var(--border);">
                            <div style="font-weight:600; margin-bottom:8px;">Manual: Add Element</div>
                            <input type="text" id="box-label" placeholder="Label (e.g. Summary Table)" style="width:100%; font-size:.85rem; margin-bottom:6px;">
                            <select id="box-type" style="width:100%; font-size:.85rem;">
                                <option value="name">Name (Page-1 Header)</option>
                                <option value="date">Date</option>
                                <option value="heading">Heading (Section Title)</option>
                                <option value="text">Text</option>
                                <option value="commentary">Commentary</option>
                                <option value="table">Table</option>
                                <option value="chart">Chart</option>
                                <option value="image">Image</option>
                            </select>
                            <p style="font-size:.7rem; color:var(--text-muted); margin-top:6px;">Fill above, then drag on any page below.</p>
                        </div>

                        <div style="background:var(--bg-primary); padding:14px; border-radius:8px; border:1px solid var(--border);">
                            <div style="font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                                <span>Defined Boxes <span id="fmt-box-count" style="color:var(--text-muted); font-weight:400;">(0)</span></span>
                                <button class="btn btn-sm btn-outline" id="fmt-clear-boxes" title="Clear all" style="padding:2px 6px;"><i class="fas fa-broom"></i></button>
                            </div>
                            <input type="text" id="fmt-box-search" placeholder="Search label or type..." style="width:100%; font-size:.78rem; margin-bottom:6px; padding:4px 6px;">
                            <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px; font-size:.7rem;">
                                <button class="fmt-type-filter" data-type="" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:var(--accent); color:#fff; cursor:pointer;">All</button>
                                <button class="fmt-type-filter" data-type="name" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Name</button>
                                <button class="fmt-type-filter" data-type="date" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Date</button>
                                <button class="fmt-type-filter" data-type="heading" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Heading</button>
                                <button class="fmt-type-filter" data-type="text" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Text</button>
                                <button class="fmt-type-filter" data-type="commentary" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Comm</button>
                                <button class="fmt-type-filter" data-type="table" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Table</button>
                                <button class="fmt-type-filter" data-type="chart" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Chart</button>
                                <button class="fmt-type-filter" data-type="image" style="padding:2px 6px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--text-muted); cursor:pointer;">Image</button>
                            </div>
                            <div id="fmt-boxes-list" style="max-height:340px; overflow-y:auto;">
                                <div class="empty-state" style="padding:8px;"><p style="font-size:.75rem;">No boxes yet</p></div>
                            </div>
                        </div>
                    </div>

                    <!-- Right column: all pages stacked -->
                    <div style="flex:1; border:1px solid var(--border); border-radius:8px; overflow:auto; min-height:600px; max-height:80vh; background:#2d3748; padding:12px;" id="fmt-pages-container">
                        <div id="fmt-empty-pages" style="text-align:center; padding:60px 0; color:var(--text-muted);">
                            <i class="fas fa-file-pdf" style="font-size:3rem; opacity:.5;"></i>
                            <p style="margin-top:12px;">Upload a Master PDF or load a saved template to begin</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('fmt-pdf-upload').addEventListener('change', (e) => this.handleMasterPdfUpload(e));
        document.getElementById('fmt-save-btn').addEventListener('click', () => this.saveFormat());
        document.getElementById('fmt-auto-btn').addEventListener('click', () => this.runAutoDetect());
        document.getElementById('fmt-refresh-list').addEventListener('click', () => this.loadSavedTemplates());
        document.getElementById('fmt-clear-boxes').addEventListener('click', () => {
            if (this.boxes.length === 0) return;
            if (!confirm(`Remove all ${this.boxes.length} boxes?`)) return;
            this.boxes = [];
            this.renderAllOverlays();
            this.renderBoxesList();
        });

        document.getElementById('fmt-box-search').addEventListener('input', () => this.renderBoxesList());
        document.querySelectorAll('.fmt-type-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fmt-type-filter').forEach(b => {
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-muted)';
                });
                btn.style.background = 'var(--accent)';
                btn.style.color = '#fff';
                this._typeFilter = btn.dataset.type;
                this.renderBoxesList();
            });
        });

        // Reset state and load template list
        this.pdfDoc = null;
        this.numPages = 0;
        this.boxes = [];
        this._lastPdfFile = null;
        this._typeFilter = '';
        this.loadSavedTemplates();
        this.populateReportTypeDropdown('fmt-report-type');
    },

    async loadSavedTemplates() {
        const list = document.getElementById('fmt-templates-list');
        try {
            const data = await api.get('/mis/templates');
            this.savedTemplates = data.templates || [];
            if (this.savedTemplates.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding:6px;"><p style="font-size:.75rem;">No saved templates</p></div>';
                return;
            }
            list.innerHTML = this.savedTemplates.map(t => {
                const count = (t.layoutConfig || []).length;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; margin-bottom:4px; background:rgba(255,255,255,0.05); border-radius:4px;">
                        <div style="flex:1; min-width:0; overflow:hidden; cursor:pointer;" onclick="App.modules.mis.loadTemplateByReportType('${App.escapeHtml(t.reportType).replace(/'/g, "\\'")}')">
                            <div style="font-weight:600; font-size:.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(t.reportType)}</div>
                            <div style="font-size:.7rem; color:var(--text-muted);">${count} elements</div>
                        </div>
                        <button class="btn btn-sm btn-danger" title="Delete" style="padding:2px 6px;" onclick="App.modules.mis.deleteTemplate(${t.id}, '${App.escapeHtml(t.reportType).replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                    </div>
                `;
            }).join('');
        } catch (err) {
            list.innerHTML = '<p style="font-size:.75rem; color:var(--danger);">Failed to load</p>';
        }
    },

    loadTemplateByReportType(rt) {
        const tpl = this.savedTemplates.find(t => t.reportType === rt);
        if (!tpl) {
            App.showToast('Template not found', 'error');
            return;
        }
        document.getElementById('fmt-report-type').value = tpl.reportType;
        this.boxes = (tpl.layoutConfig || []).map((b, i) => ({ ...b, id: Date.now() + i }));
        this.renderAllOverlays();
        this.renderBoxesList();
        document.getElementById('fmt-save-btn').disabled = false;
        App.showToast(`Loaded "${tpl.reportType}" (${this.boxes.length} boxes). Upload the master PDF to visualize.`, 'success');
    },

    async deleteTemplate(id, rt) {
        if (!confirm(`Delete template "${rt}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/mis/templates/${id}`);
            App.showToast(`Deleted "${rt}"`, 'success');
            this.loadSavedTemplates();
            this.populateReportTypeDropdown('fmt-report-type');
        } catch (err) {
            App.showToast(err.message || 'Failed to delete', 'error');
        }
    },

    async handleMasterPdfUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        this._lastPdfFile = file;

        const empty = document.getElementById('fmt-empty-pages');
        if (empty) empty.style.display = 'none';

        // Rough estimate: large multi-page PDFs take a few seconds to render.
        App.startProgress('Rendering PDF', {
            etaSeconds: Math.max(4, Math.min(20, Math.round(file.size / (250 * 1024)))),
            subtitle: `Loading ${file.name}...`,
        });

        try {
            const buf = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(new Uint8Array(buf));
            this.pdfDoc = await loadingTask.promise;
            this.numPages = this.pdfDoc.numPages;
            App.updateProgress(`Rendering ${this.numPages} pages...`);
            await this.renderAllPages();
            document.getElementById('fmt-save-btn').disabled = false;
            document.getElementById('fmt-auto-btn').disabled = false;
            App.endProgress();
            App.showToast(`Loaded ${this.numPages} pages`, 'success');
        } catch (err) {
            App.endProgress();
            App.showToast('Failed to load PDF: ' + err.message, 'error');
        }
    },

    async renderAllPages() {
        if (!this.pdfDoc) return;
        const container = document.getElementById('fmt-pages-container');
        container.innerHTML = '';

        this.scale = 1.5;
        for (let p = 1; p <= this.numPages; p++) {
            const page = await this.pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: this.scale });

            const wrap = document.createElement('div');
            wrap.className = 'fmt-page-wrap';
            wrap.dataset.page = p;
            wrap.style.cssText = `position:relative; margin-bottom:16px; width:${viewport.width}px;`;

            const label = document.createElement('div');
            label.style.cssText = 'color:#cbd5e1; font-size:.8rem; margin-bottom:4px; font-weight:600;';
            label.textContent = `Page ${p} / ${this.numPages}`;
            wrap.appendChild(label);

            const canvas = document.createElement('canvas');
            canvas.className = 'fmt-pdf-canvas';
            canvas.dataset.page = p;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.cssText = 'display:block; cursor:crosshair;';
            wrap.appendChild(canvas);

            const overlay = document.createElement('div');
            overlay.className = 'fmt-overlay';
            overlay.dataset.page = p;
            overlay.style.cssText = `position:absolute; top:${label.offsetHeight || 22}px; left:0; width:${viewport.width}px; height:${viewport.height}px; pointer-events:none;`;
            wrap.appendChild(overlay);

            container.appendChild(wrap);

            // Now that the wrap is in the DOM, recompute the overlay top to match the label height precisely.
            overlay.style.top = label.offsetHeight + 'px';

            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            canvas.addEventListener('mousedown', (e) => this.startDrawing(e, p));
            canvas.addEventListener('mousemove', (e) => this.drawBox(e));
            canvas.addEventListener('mouseup', (e) => this.endDrawing(e, p));
            canvas.addEventListener('mouseleave', (e) => this.endDrawing(e, p));
        }

        this.renderAllOverlays();
    },

    async runAutoDetect() {
        if (!this._lastPdfFile) {
            App.showToast('Upload a Master PDF first', 'warning');
            return;
        }
        const btn = document.getElementById('fmt-auto-btn');
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';

        // Estimate ~0.6s per page + 2s overhead, clamped 4-30s
        const eta = Math.max(4, Math.min(30, Math.round((this.numPages || 10) * 0.6 + 2)));
        App.startProgress('Auto-detecting elements', {
            etaSeconds: eta,
            subtitle: `Scanning ${this.numPages || '?'} pages for headings, tables, charts, images...`,
        });

        try {
            const formData = new FormData();
            formData.append('file', this._lastPdfFile);
            const data = await api.post('/mis/templates/auto-detect', formData);
            const elements = (data.elements || []).map((el, i) => ({ ...el, id: Date.now() + i }));

            App.endProgress();

            if (this.boxes.length > 0) {
                if (!confirm(`Auto-detect found ${elements.length} elements. Replace your current ${this.boxes.length} boxes?`)) {
                    return;
                }
            }
            this.boxes = elements;
            this.renderAllOverlays();
            this.renderBoxesList();
            App.showToast(`Auto-detected ${elements.length} elements across ${this.numPages} pages`, 'success');
        } catch (err) {
            App.endProgress();
            App.showToast(err.message || 'Auto-detect failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    },

    startDrawing(e, pageNum) {
        const label = document.getElementById('box-label').value.trim();
        if (!label) {
            App.showToast('Enter a Label first', 'warning');
            return;
        }

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;
        this.isDrawing = true;
        this.drawPage = pageNum;

        const overlay = canvas.parentElement.querySelector('.fmt-overlay');
        this.currentBox = document.createElement('div');
        this.currentBox.style.cssText = `position:absolute; border:2px solid var(--accent); background:rgba(59,130,246,0.2); pointer-events:none; left:${this.startX}px; top:${this.startY}px;`;
        overlay.appendChild(this.currentBox);
    },

    drawBox(e) {
        if (!this.isDrawing || !this.currentBox) return;
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        this.currentBox.style.left = Math.min(this.startX, currentX) + 'px';
        this.currentBox.style.top = Math.min(this.startY, currentY) + 'px';
        this.currentBox.style.width = Math.abs(currentX - this.startX) + 'px';
        this.currentBox.style.height = Math.abs(currentY - this.startY) + 'px';
    },

    endDrawing(e, pageNum) {
        if (!this.isDrawing || this.drawPage !== pageNum) {
            // Cancel cleanly if user dragged off the page
            if (this.currentBox) this.currentBox.remove();
            this.currentBox = null;
            this.isDrawing = false;
            return;
        }
        this.isDrawing = false;

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const x0 = Math.min(this.startX, endX) / this.scale;
        const y0 = Math.min(this.startY, endY) / this.scale;
        const x1 = Math.max(this.startX, endX) / this.scale;
        const y1 = Math.max(this.startY, endY) / this.scale;

        if (this.currentBox) this.currentBox.remove();
        this.currentBox = null;

        if (x1 - x0 < 10 || y1 - y0 < 10) return;

        const label = document.getElementById('box-label').value.trim();
        const type = document.getElementById('box-type').value;

        this.boxes.push({
            id: Date.now(),
            label, type, page: pageNum,
            x0: parseFloat(x0.toFixed(2)),
            y0: parseFloat(y0.toFixed(2)),
            x1: parseFloat(x1.toFixed(2)),
            y1: parseFloat(y1.toFixed(2)),
        });
        document.getElementById('box-label').value = '';
        this.renderAllOverlays();
        this.renderBoxesList();
    },

    renderAllOverlays() {
        document.querySelectorAll('#fmt-pages-container .fmt-overlay').forEach(o => o.innerHTML = '');
        const colorByType = {
            name: '#3b82f6', date: '#3b82f6', text: '#3b82f6',
            commentary: '#a855f7',
            table: '#10b981',
            chart: '#f59e0b', image: '#ef4444',
        };
        this.boxes.forEach(b => {
            const overlay = document.querySelector(`#fmt-pages-container .fmt-overlay[data-page="${b.page}"]`);
            if (!overlay) return;
            const color = colorByType[b.type] || '#3b82f6';
            const div = document.createElement('div');
            div.dataset.boxId = b.id;
            div.style.cssText = `position:absolute; border:2px solid ${color}; background:${color}22; pointer-events:auto; cursor:pointer; left:${b.x0 * this.scale}px; top:${b.y0 * this.scale}px; width:${(b.x1 - b.x0) * this.scale}px; height:${(b.y1 - b.y0) * this.scale}px;`;
            const tagText = (b.text && b.text.trim()) ? b.text.trim() : b.label;
            const tagShort = tagText.length > 50 ? tagText.slice(0, 50) + '…' : tagText;
            div.title = `${tagText} (${b.type}) — click to edit`;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditBoxModal(b.id);
            });

            const tag = document.createElement('span');
            tag.textContent = tagShort;
            tag.style.cssText = `position:absolute; top:-18px; left:-2px; background:${color}; color:#fff; font-size:10px; padding:1px 4px; white-space:nowrap; border-radius:2px; pointer-events:none; max-width:380px; overflow:hidden; text-overflow:ellipsis;`;
            div.appendChild(tag);

            overlay.appendChild(div);
        });
    },

    openEditBoxModal(id) {
        const box = this.boxes.find(b => b.id === id);
        if (!box) return;

        const typeOptions = ['name', 'date', 'heading', 'text', 'commentary', 'table', 'chart', 'image'];
        const labelVal = App.escapeHtml(box.label || '');
        const textVal = App.escapeHtml(box.text || '');

        const body = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div>
                    <label style="font-size:.8rem; color:var(--text-muted);">Label</label>
                    <input type="text" id="edit-box-label" value="${labelVal}" style="width:100%;"/>
                </div>
                <div>
                    <label style="font-size:.8rem; color:var(--text-muted);">Type</label>
                    <select id="edit-box-type" style="width:100%;">
                        ${typeOptions.map(t => `<option value="${t}"${t === box.type ? ' selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:.8rem; color:var(--text-muted);">Expected text content (used to relocate across pages)</label>
                    <textarea id="edit-box-text" rows="3" style="width:100%; resize:vertical;">${textVal}</textarea>
                    <p style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">
                        If the section drifts to a different page in a future report, the validator will search the PDF for this text to relocate the element.
                    </p>
                </div>
                <div style="display:flex; gap:8px; font-size:.75rem; color:var(--text-muted);">
                    <span>Page ${box.page}</span>
                    <span>·</span>
                    <span>bbox (${box.x0.toFixed(0)}, ${box.y0.toFixed(0)}) → (${box.x1.toFixed(0)}, ${box.y1.toFixed(0)})</span>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
                    <button class="btn btn-outline btn-sm" id="edit-box-delete"><i class="fas fa-trash"></i> Delete box</button>
                    <button class="btn btn-primary btn-sm" id="edit-box-save"><i class="fas fa-save"></i> Save</button>
                </div>
            </div>
        `;
        App.showModal(`Edit element`, body);

        document.getElementById('edit-box-save').addEventListener('click', () => {
            const nLabel = document.getElementById('edit-box-label').value.trim();
            const nType = document.getElementById('edit-box-type').value;
            const nText = document.getElementById('edit-box-text').value.trim();
            if (!nLabel) { App.showToast('Label is required', 'warning'); return; }
            box.label = nLabel;
            box.type = nType;
            box.text = nText;
            this.renderAllOverlays();
            this.renderBoxesList();
            App.closeModal && App.closeModal();
            App.showToast('Element updated', 'success');
        });
        document.getElementById('edit-box-delete').addEventListener('click', () => {
            if (!confirm(`Delete "${box.label}"?`)) return;
            this.deleteBox(id);
            App.closeModal && App.closeModal();
        });
    },

    renderBoxesList() {
        const list = document.getElementById('fmt-boxes-list');
        const count = document.getElementById('fmt-box-count');
        if (count) count.textContent = `(${this.boxes.length})`;

        if (this.boxes.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:8px;"><p style="font-size:.75rem;">No boxes yet</p></div>';
            return;
        }

        const search = (document.getElementById('fmt-box-search')?.value || '').trim().toLowerCase();
        const typeFilter = this._typeFilter || '';

        const filtered = this.boxes.filter(b => {
            if (typeFilter && b.type !== typeFilter) return false;
            if (search && !b.label.toLowerCase().includes(search) && !b.type.toLowerCase().includes(search)) return false;
            return true;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:8px;"><p style="font-size:.75rem;">No boxes match the filter</p></div>';
            return;
        }

        const colorByType = {
            name: '#3b82f6', date: '#06b6d4', heading: '#8b5cf6', text: '#3b82f6',
            commentary: '#a855f7', table: '#10b981',
            chart: '#f59e0b', image: '#ef4444',
        };
        const typeOptions = ['name', 'date', 'heading', 'text', 'commentary', 'table', 'chart', 'image'];

        // Group filtered boxes into sections per page: a 'heading' (or name/date)
        // starts a new section; subsequent children attach to it. Boxes before any
        // heading on a page sit in an "Unassigned" group.
        const byPage = {};
        filtered.forEach(b => { (byPage[b.page] = byPage[b.page] || []).push(b); });
        const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b);

        const sectionTypes = new Set(['heading', 'name', 'date']);
        const renderRow = (b, isHeading) => {
            const c = colorByType[b.type] || '#3b82f6';
            const indent = isHeading ? 0 : 14;
            // Prefer the real extracted text (truncated) as the display label so admins
            // see actual content like "Imported Market Prices(Chana)" instead of
            // "Heading P5-2". Falls back to the auto-generated label if no text.
            const display = (b.text && b.text.trim()) ? b.text.trim() : b.label;
            const truncated = display.length > 70 ? display.slice(0, 70) + '…' : display;
            return `
                <div class="fmt-box-row" data-box-id="${b.id}" style="display:flex; align-items:center; gap:4px; background:rgba(255,255,255,${isHeading ? 0.08 : 0.04}); padding:4px 6px; margin-bottom:3px; margin-left:${indent}px; border-radius:4px; border-left:3px solid ${c};">
                    <button title="Show on PDF" class="btn-flash" data-box-id="${b.id}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:0 2px;"><i class="fas fa-crosshairs"></i></button>
                    <input type="text" class="box-label-input" data-box-id="${b.id}" value="${App.escapeHtml(truncated)}" title="${App.escapeHtml(display)}" style="flex:1; min-width:0; background:transparent; border:none; color:inherit; font-size:.78rem; font-weight:${isHeading ? 700 : 600}; padding:2px 4px; border-radius:3px;"/>
                    <select class="box-type-select" data-box-id="${b.id}" style="font-size:.7rem; background:var(--bg-primary); border:1px solid var(--border); color:inherit; padding:1px 2px; border-radius:3px;">
                        ${typeOptions.map(t => `<option value="${t}"${t === b.type ? ' selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <button class="btn-edit-box" data-box-id="${b.id}" style="background:transparent; border:none; color:var(--accent); cursor:pointer; padding:0 4px;" title="Edit details"><i class="fas fa-pen"></i></button>
                    <button class="btn-delete-box" data-box-id="${b.id}" style="background:transparent; border:none; color:var(--danger); cursor:pointer; padding:0 4px;" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            `;
        };

        list.innerHTML = pages.map(p => {
            const pageBoxes = byPage[p].slice().sort((a, b) => a.y0 - b.y0);
            // Build sections: array of { heading: box|null, children: [...] }
            const sections = [];
            let current = { heading: null, children: [] };
            pageBoxes.forEach(b => {
                if (sectionTypes.has(b.type)) {
                    // Finalize previous section if it has anything
                    if (current.heading || current.children.length) sections.push(current);
                    current = { heading: b, children: [] };
                } else {
                    current.children.push(b);
                }
            });
            if (current.heading || current.children.length) sections.push(current);

            const inner = sections.map(s => {
                let html = '';
                if (s.heading) html += renderRow(s.heading, true);
                if (!s.heading && s.children.length) {
                    html += `<div style="font-size:.65rem; color:var(--text-muted); padding:2px 6px; margin-left:0;">Unassigned</div>`;
                }
                html += s.children.map(c => renderRow(c, false)).join('');
                return html;
            }).join('');

            return `
                <div style="font-size:.7rem; color:var(--text-muted); padding:8px 0 2px; font-weight:600;">Page ${p} <span style="opacity:.6;">(${byPage[p].length})</span></div>
                ${inner}
            `;
        }).join('');

        // Wire up row controls
        list.querySelectorAll('.btn-flash').forEach(b => {
            b.addEventListener('click', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                this.flashBox(id);
            });
        });
        list.querySelectorAll('.btn-delete-box').forEach(b => {
            b.addEventListener('click', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                this.deleteBox(id);
            });
        });
        list.querySelectorAll('.btn-edit-box').forEach(b => {
            b.addEventListener('click', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                this.openEditBoxModal(id);
            });
        });
        list.querySelectorAll('.box-label-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                const newLabel = e.currentTarget.value.trim();
                if (!newLabel) {
                    App.showToast('Label cannot be empty', 'warning');
                    this.renderBoxesList();
                    return;
                }
                const box = this.boxes.find(x => x.id === id);
                if (box) {
                    // Editing the displayed text overrides the auto-generated label
                    // and also becomes the saved "text" (so cross-page validation can
                    // search for the corrected wording).
                    box.label = newLabel;
                    box.text = newLabel;
                    this.renderAllOverlays();
                }
            });
            input.addEventListener('focus', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                this.flashBox(id);
            });
        });
        list.querySelectorAll('.box-type-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const id = Number(e.currentTarget.dataset.boxId);
                const newType = e.currentTarget.value;
                const box = this.boxes.find(x => x.id === id);
                if (box) {
                    box.type = newType;
                    this.renderAllOverlays();
                    this.renderBoxesList();
                }
            });
        });
    },

    flashBox(id) {
        const box = this.boxes.find(b => b.id === id);
        if (!box) return;
        const wrap = document.querySelector(`#fmt-pages-container .fmt-page-wrap[data-page="${box.page}"]`);
        if (!wrap) {
            App.showToast(`Upload the master PDF to view Page ${box.page}`, 'info');
            return;
        }
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Flash the overlay box (matched by id, not label, so duplicate labels still work)
        const overlay = wrap.querySelector('.fmt-overlay');
        const target = overlay.querySelector(`[data-box-id="${id}"]`);
        if (target) {
            const origBg = target.style.background;
            const origBorder = target.style.border;
            target.style.background = 'rgba(245, 158, 11, 0.55)';
            target.style.border = '3px solid #f59e0b';
            target.style.boxShadow = '0 0 16px #f59e0b';
            setTimeout(() => {
                target.style.background = origBg;
                target.style.border = origBorder;
                target.style.boxShadow = '';
            }, 1400);
        }
    },

    deleteBox(id) {
        this.boxes = this.boxes.filter(b => b.id !== id);
        this.renderAllOverlays();
        this.renderBoxesList();
    },

    async saveFormat() {
        const rt = document.getElementById('fmt-report-type').value.trim();
        if (!rt) {
            App.showToast('Report Type is required to save', 'warning');
            return;
        }

        if (this.boxes.length === 0) {
            if (!confirm('You have no boxes defined. Save empty template?')) return;
        }

        const btn = document.getElementById('fmt-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        App.startProgress('Saving template', {
            etaSeconds: Math.max(2, Math.min(6, Math.round(this.boxes.length / 80))),
            subtitle: `Persisting ${this.boxes.length} elements for "${rt}"...`,
        });

        try {
            // Include the `text` field so cross-page validation can search by content.
            const payload = this.boxes.map(b => ({
                label: b.label, type: b.type, page: b.page,
                x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
                text: b.text || '',
            }));
            await api.post('/mis/templates', { reportType: rt, layoutConfig: payload });
            App.endProgress();
            App.showToast(`Saved "${rt}" (${payload.length} elements)`, 'success');
            this.loadSavedTemplates();
            this.populateReportTypeDropdown('fmt-report-type');
        } catch (err) {
            App.endProgress();
            App.showToast(err.message || 'Failed to save layout', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Layout';
        }
    }
};
