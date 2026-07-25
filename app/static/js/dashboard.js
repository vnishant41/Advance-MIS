/**
 * Dashboard — Premium KPI overview with charts, activity feed, and quick actions.
 */
import { api } from './api.js';

export default {
    charts: [],

    async render() {
        const dow = new Date().getDay();  // 0=Sun, 6=Sat
        const isWeekend = dow === 0 || dow === 6;
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
        const weekendBanner = isWeekend ? `
            <div class="glass-card" id="weekend-banner" style="padding:14px 18px; margin-bottom:16px; border-left:3px solid var(--warning); background:rgba(245,158,11,.08);">
                <i class="fas fa-umbrella-beach" style="color:var(--warning); margin-right:8px;"></i>
                <strong>Holiday — ${dayName}.</strong>
                <span style="color:var(--text-secondary); margin-left:6px;">Weekends (Saturday / Sunday) are off-days. Daily, MIS and data-update tasks are skipped today.</span>
            </div>` : '';
        return `
            <div class="dashboard-fit">
                ${weekendBanner}
                <!-- KPI Cards -->
                <div class="kpi-grid dash-kpi-compact" id="kpi-grid">
                    <div class="glass-card kpi-card blue">
                        <div class="kpi-top">
                            <div>
                                <div class="kpi-value" id="kpi-total">—</div>
                                <div class="kpi-label">Scheduled Today</div>
                            </div>
                            <div class="kpi-icon"><i class="fas fa-calendar-day"></i></div>
                        </div>
                    </div>
                    <div class="glass-card kpi-card green">
                        <div class="kpi-top">
                            <div>
                                <div class="kpi-value" id="kpi-done">—</div>
                                <div class="kpi-label">Done</div>
                            </div>
                            <div class="kpi-icon"><i class="fas fa-check-circle"></i></div>
                        </div>
                    </div>
                    <div class="glass-card kpi-card amber">
                        <div class="kpi-top">
                            <div>
                                <div class="kpi-value" id="kpi-pending">—</div>
                                <div class="kpi-label">Pending</div>
                            </div>
                            <div class="kpi-icon"><i class="fas fa-clock"></i></div>
                        </div>
                    </div>
                    <div class="glass-card kpi-card red">
                        <div class="kpi-top">
                            <div>
                                <div class="kpi-value" id="kpi-late">—</div>
                                <div class="kpi-label">Late</div>
                            </div>
                            <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        </div>
                    </div>
                </div>

                <!-- Main Grid: 2x2 cards filling remaining viewport -->
                <div class="dash-grid-2x2">
                    <div class="glass-card dash-cell">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-chart-area" style="color:var(--accent);margin-right:8px;"></i>7-Day Activity</h3>
                        </div>
                        <div class="dash-cell-body" style="overflow:hidden;">
                            <div style="position:relative; width:100%; height:100%;">
                                <canvas id="dash-trend-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card dash-cell">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-file-pdf" style="color:var(--accent);margin-right:8px;"></i>Report Progress</h3>
                        </div>
                        <div class="dash-cell-body" id="report-progress-list">
                            <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
                        </div>
                    </div>

                    <div class="glass-card dash-cell">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-stream" style="color:var(--info);margin-right:8px;"></i>Recent Activity</h3>
                        </div>
                        <div class="dash-cell-body" id="activity-feed">
                            <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
                        </div>
                    </div>

                    <div class="glass-card dash-cell" id="kanban-summary-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-tasks" style="color:var(--success);margin-right:8px;"></i>Kanban Summary</h3>
                        </div>
                        <div class="dash-cell-body" id="kanban-summary">
                            <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
                        </div>
                    </div>
                </div>

                <!-- Team KPI (Manager+) -->
                <div class="glass-card" id="team-kpi-section" style="display:none; margin-top:16px; padding:20px;">
                    <div class="card-header" style="margin-bottom:14px;">
                        <h3 class="card-title"><i class="fas fa-users" style="color:var(--accent);margin-right:8px;"></i>Team KPI Overview</h3>
                    </div>
                    <div id="team-kpi-body">
                        <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        // Destroy any old charts
        this.charts.forEach(c => c.destroy());
        this.charts = [];

        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);

        // Load all data concurrently
        const promises = [
            api.get('/dash/stats'),
            api.get('/dash/week-trend'),
            api.get('/dash/report-progress'),
            api.get('/dash/pending'),
        ];
        if (isMgr) promises.push(api.get('/dash/team'));

        const results = await Promise.allSettled(promises);
        const [statsRes, trendRes, progressRes, pendingRes] = results;
        const teamRes = results[4];

        // KPI stats — all four anchored to "scheduled today" for a coherent breakdown.
        if (statsRes.status === 'fulfilled' && statsRes.value.success) {
            const s = statsRes.value.stats;
            this.animateCounter('kpi-total', s.total);
            this.animateCounter('kpi-done', s.done);
            this.animateCounter('kpi-pending', s.pending);
            this.animateCounter('kpi-late', s.late);
        }

        // Kanban summary + activity feed (no longer drives a KPI card)
        if (pendingRes.status === 'fulfilled' && pendingRes.value.success) {
            const p = pendingRes.value;
            this.renderKanbanSummary(p.kanban);
            this.renderActivityFeed(p.recentEntries);
        }

        // Trend chart
        if (trendRes.status === 'fulfilled' && trendRes.value.success) {
            this.renderTrendChart(trendRes.value.trend);
        }

        // Report progress
        if (progressRes.status === 'fulfilled' && progressRes.value.success) {
            this.renderReportProgress(progressRes.value.progress);
        }

        // Team KPI (Manager+ only)
        if (isMgr && teamRes && teamRes.status === 'fulfilled' && teamRes.value.success) {
            const sec = document.getElementById('team-kpi-section');
            if (sec) sec.style.display = 'block';
            this.renderTeamKPI(teamRes.value.team);
        }
    },

    animateCounter(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        target = parseInt(target) || 0;
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 20));
        const interval = setInterval(() => {
            current = Math.min(current + step, target);
            el.textContent = current;
            if (current >= target) clearInterval(interval);
        }, 30);
    },

    renderTrendChart(trend) {
        const ctx = document.getElementById('dash-trend-chart');
        if (!ctx || !trend) return;

        // Chart.js may not be loaded (offline / CDN blocked). Show a gentle
        // placeholder instead of throwing — keeps the rest of the page working.
        if (typeof Chart === 'undefined') {
            const host = ctx.parentElement;
            if (host) {
                host.innerHTML = `<div class="empty-state" style="padding:20px;">
                    <i class="fas fa-chart-line" style="opacity:.3;"></i>
                    <p style="font-size:.85rem;">Chart library unavailable. Reload the page when online.</p>
                </div>`;
            }
            return;
        }

        const dates = Object.keys(trend).sort();
        const labels = dates.map(d => {
            const dt = new Date(d);
            return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        });
        const doneData = dates.map(d => trend[d].done);
        const pendingData = dates.map(d => trend[d].pending);
        const totalData = dates.map(d => trend[d].total);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Completed',
                        data: doneData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#10b981'
                    },
                    {
                        label: 'Pending',
                        data: pendingData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#f59e0b'
                    },
                    {
                        label: 'Total',
                        data: totalData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        tension: 0.4,
                        fill: false,
                        borderDash: [5, 5],
                        pointRadius: 3,
                        pointBackgroundColor: '#3b82f6'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', usePointStyle: true, padding: 16, font: { family: 'Inter' } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(51,65,85,0.3)' },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }
                    }
                }
            }
        });
        this.charts.push(chart);
    },

    renderReportProgress(progress) {
        const container = document.getElementById('report-progress-list');
        if (!progress || progress.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-check-double"></i><p style="font-size:.8rem;">No reports due today</p></div>';
            return;
        }
        // Header summary: x of y done across today's scheduled reports.
        const totalReports = progress.length;
        const doneReports = progress.filter(r => r.done === 1).length;
        const overallPct = totalReports ? Math.round((doneReports / totalReports) * 100) : 0;

        container.innerHTML = `
            <div style="padding:4px 0 10px; border-bottom:1px solid var(--border); margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; font-size:.8rem; margin-bottom:4px;">
                    <span style="font-weight:600;">Today's reports</span>
                    <span style="color:var(--text-muted);">${doneReports} / ${totalReports} done</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${overallPct}%; background:var(--success);"></div></div>
            </div>
            ${progress.map(r => {
                const isDone = r.done === 1;
                const isSkip = r.skip === 1;
                const statusIcon = isDone
                    ? '<i class="fas fa-check-circle" style="color:var(--success);"></i>'
                    : isSkip
                        ? '<i class="fas fa-forward" style="color:var(--text-muted);"></i>'
                        : '<i class="far fa-circle" style="color:var(--warning);"></i>';
                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid rgba(51,65,85,.3); font-size:.82rem;">
                        ${statusIcon}
                        <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(r.name)}</span>
                        ${r.frequency ? `<span style="font-size:.65rem; color:var(--text-muted); text-transform:uppercase;">${App.escapeHtml(r.frequency)}</span>` : ''}
                    </div>
                `;
            }).join('')}
        `;
    },

    renderActivityFeed(entries) {
        const container = document.getElementById('activity-feed');
        if (!entries || entries.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p style="font-size:.8rem;">No activity today</p></div>';
            return;
        }

        container.innerHTML = entries.map(e => `
            <div style="padding:6px 0; border-bottom:1px solid rgba(51,65,85,.3); display:flex; gap:8px; align-items:center; font-size:.78rem;">
                <div class="avatar-sm" style="width:24px; height:24px; font-size:.7rem;">${(e.onBehalfOfName || e.onBehalfOf || '?').charAt(0).toUpperCase()}</div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <strong style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(e.onBehalfOfName || e.onBehalfOf)}</strong>
                        <span class="status-badge ${(e.status || '').toLowerCase()}" style="font-size:.65rem; padding:1px 6px;">${e.status}</span>
                    </div>
                    <div style="color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${App.escapeHtml(e.topic || '')}${e.subTopic ? ' → ' + App.escapeHtml(e.subTopic) : ''}
                    </div>
                </div>
                <div style="font-size:.65rem; color:var(--text-muted); flex-shrink:0;">${App.timeAgo(e.timestampSubmitted)}</div>
            </div>
        `).join('');
    },

    renderKanbanSummary(kanban) {
        const container = document.getElementById('kanban-summary');
        if (!kanban) {
            container.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);">No data</p>';
            return;
        }

        const overdueCount = kanban.overdue?.length || 0;
        const dueTodayCount = kanban.dueToday?.length || 0;

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
                <div style="text-align:center; padding:8px; background:var(--bg-primary); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:800; color:var(--accent);">${kanban.total}</div>
                    <div style="font-size:.65rem; color:var(--text-muted); text-transform:uppercase;">Total</div>
                </div>
                <div style="text-align:center; padding:8px; background:var(--bg-primary); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:800; color:var(--warning);">${kanban.open}</div>
                    <div style="font-size:.65rem; color:var(--text-muted); text-transform:uppercase;">Open</div>
                </div>
                <div style="text-align:center; padding:8px; background:var(--bg-primary); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:800; color:var(--success);">${kanban.done}</div>
                    <div style="font-size:.65rem; color:var(--text-muted); text-transform:uppercase;">Done</div>
                </div>
            </div>
            ${overdueCount > 0 ? `<div style="padding:6px 10px; background:rgba(239,68,68,.1); border-radius:6px; margin-bottom:6px; font-size:.78rem;"><i class="fas fa-exclamation-circle" style="color:var(--danger);margin-right:6px;"></i><strong>${overdueCount}</strong> overdue</div>` : ''}
            ${dueTodayCount > 0 ? `<div style="padding:6px 10px; background:rgba(245,158,11,.1); border-radius:6px; font-size:.78rem;"><i class="fas fa-calendar-day" style="color:var(--warning);margin-right:6px;"></i><strong>${dueTodayCount}</strong> due today</div>` : ''}
            ${overdueCount === 0 && dueTodayCount === 0 ? '<div style="font-size:.78rem;color:var(--text-muted);"><i class="fas fa-check" style="color:var(--success);margin-right:4px;"></i>All on track</div>' : ''}
        `;
    },

    renderTeamKPI(team) {
        const container = document.getElementById('team-kpi-body');
        if (!team || team.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p style="font-size:.8rem;">No team members found</p></div>';
            return;
        }

        // Sort controls
        this._teamData = team;
        this._teamSort = { col: 'name', dir: 'asc' };
        this._renderTeamTable();
    },

    _renderTeamTable() {
        const container = document.getElementById('team-kpi-body');
        let team = [...this._teamData];
        const { col, dir } = this._teamSort;

        // Sort
        team.sort((a, b) => {
            let va = a[col], vb = b[col];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ? 1 : -1;
            return 0;
        });

        const sortIcon = (field) => {
            if (this._teamSort.col !== field) return '<i class="fas fa-sort" style="opacity:.3;"></i>';
            return this._teamSort.dir === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        };

        const scoreColor = (s) => s >= 80 ? 'var(--success)' : s >= 50 ? 'var(--warning)' : 'var(--danger)';

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="data-table" id="team-kpi-table">
                    <thead>
                        <tr>
                            <th class="sortable-header" data-sort="name">Teammate ${sortIcon('name')}</th>
                            <th class="sortable-header" data-sort="done" style="text-align:center;">Done ${sortIcon('done')}</th>
                            <th class="sortable-header" data-sort="pending" style="text-align:center;">Pending ${sortIcon('pending')}</th>
                            <th class="sortable-header" data-sort="skip" style="text-align:center;">Skip ${sortIcon('skip')}</th>
                            <th class="sortable-header" data-sort="total" style="text-align:center;">Total ${sortIcon('total')}</th>
                            <th class="sortable-header" data-sort="score" style="text-align:center;">Completion Score ${sortIcon('score')}</th>
                            <th style="text-align:center;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${team.map(m => `
                            <tr class="hover-row-kpi">
                                <td>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <span class="avatar-sm" style="width:32px; height:32px; font-size:.8rem; background: linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%); color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; border-radius:50%;">${(m.name||'?').charAt(0).toUpperCase()}</span>
                                        <div>
                                            <div style="font-weight:600; font-size:.88rem; color:var(--text-primary);">${App.escapeHtml(m.name)}</div>
                                            <div style="font-size:.72rem; color:var(--text-muted);">${App.escapeHtml(m.email)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style="text-align:center;">
                                    <span style="background:rgba(16,185,129,0.1); color:#10b981; font-weight:700; padding:4px 10px; border-radius:6px; font-size:.8rem;">${m.done}</span>
                                </td>
                                <td style="text-align:center;">
                                    <span style="background:rgba(245,158,11,0.1); color:#f59e0b; font-weight:700; padding:4px 10px; border-radius:6px; font-size:.8rem;">${m.pending}</span>
                                </td>
                                <td style="text-align:center;">
                                    <span style="background:rgba(100,116,139,0.1); color:#64748b; font-weight:700; padding:4px 10px; border-radius:6px; font-size:.8rem;">${m.skip}</span>
                                </td>
                                <td style="text-align:center; font-weight:700; color:var(--text-secondary); font-size:.85rem;">${m.total}</td>
                                <td style="text-align:center;">
                                    <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                                        <div class="progress-bar" style="width:70px; height:8px; background:rgba(255,255,255,0.06); box-shadow:inset 0 1px 2px rgba(0,0,0,0.2);"><div class="progress-fill" style="width:${m.score}%; background:${scoreColor(m.score)}; box-shadow: 0 0 4px ${scoreColor(m.score)};"></div></div>
                                        <span style="font-size:.82rem; font-weight:700; color:${scoreColor(m.score)};">${m.score}%</span>
                                    </div>
                                </td>
                                <td style="text-align:center;">
                                    <button class="btn btn-sm btn-outline team-detail-btn" data-email="${App.escapeHtml(m.email)}" data-name="${App.escapeHtml(m.name)}" style="border-color:var(--accent); color:var(--accent);">
                                        <i class="fas fa-clipboard-list" style="margin-right:4px;"></i> Details
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Sort headers
        container.querySelectorAll('.sortable-header').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (this._teamSort.col === field) {
                    this._teamSort.dir = this._teamSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    this._teamSort = { col: field, dir: 'asc' };
                }
                this._renderTeamTable();
            });
        });

        // Detail buttons
        container.querySelectorAll('.team-detail-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showTeamDetail(btn.dataset.email, btn.dataset.name));
        });
    },

    async showTeamDetail(email, name) {
        App.showModal(
            `Task Sheet — ${name}`,
            '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>',
            ''
        );

        try {
            const data = await api.get(`/dash/team/${encodeURIComponent(email)}/detail`);
            const entries = data.entries || [];
            const scoreColor = data.score >= 80 ? 'var(--success)' : data.score >= 50 ? 'var(--warning)' : 'var(--danger)';

            const typeBadge = (et) => {
                const map = {
                    'Task':            { label: 'Task',          color: 'var(--accent)' },
                    'MISReport':       { label: 'MIS Report',    color: 'var(--info)' },
                    'DataUpdate':      { label: 'Data Update',   color: '#a78bfa' },
                    'ReportGroup':     { label: 'Merged Report', color: 'var(--success)' },
                };
                const m = map[et] || { label: et, color: 'var(--text-muted)' };
                return `<span class="tag" style="background:${m.color}22; color:${m.color}; font-size:.65rem;">${m.label}</span>`;
            };

            const bodyHtml = `
                <div style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:120px; text-align:center; padding:12px; background:var(--bg-primary); border-radius:8px;">
                        <div style="font-size:1.4rem; font-weight:800; color:var(--success);">${data.doneCount}</div>
                        <div style="font-size:.72rem; color:var(--text-muted); text-transform:uppercase;">Done</div>
                    </div>
                    <div style="flex:1; min-width:120px; text-align:center; padding:12px; background:var(--bg-primary); border-radius:8px;">
                        <div style="font-size:1.4rem; font-weight:800; color:var(--warning);">${data.totalCount - data.doneCount}</div>
                        <div style="font-size:.72rem; color:var(--text-muted); text-transform:uppercase;">Pending/Skip</div>
                    </div>
                    <div style="flex:1; min-width:120px; text-align:center; padding:12px; background:var(--bg-primary); border-radius:8px;">
                        <div style="font-size:1.4rem; font-weight:800; color:${scoreColor};">${data.score}%</div>
                        <div style="font-size:.72rem; color:var(--text-muted); text-transform:uppercase;">Score</div>
                    </div>
                </div>
                <div style="max-height:400px; overflow:auto;">
                    <table class="data-table">
                        <thead>
                            <tr><th>Task</th><th>Type</th><th>Status</th><th>Remark</th><th>Time</th></tr>
                        </thead>
                        <tbody>
                            ${entries.length > 0 ? entries.map(e => `
                                <tr>
                                    <td style="font-weight:500;">${App.escapeHtml(e.topic)}${e.subTopic ? ' <span style="color:var(--text-muted);">→ ' + App.escapeHtml(e.subTopic) + '</span>' : ''}</td>
                                    <td>${typeBadge(e.entryType)}</td>
                                    <td><span class="status-badge ${(e.status||'').toLowerCase()}">${e.status}</span></td>
                                    <td style="font-size:.8rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(e.remarks || '—')}</td>
                                    <td style="font-size:.75rem; color:var(--text-muted);">${e.timestamp ? App.timeAgo(e.timestamp) : '—'}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No entries found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;

            App.showModal(
                `Task Sheet — ${name}`,
                bodyHtml,
                '<button class="btn btn-primary" onclick="App.closeModal()">Close</button>'
            );
        } catch (err) {
            App.showModal(
                `Task Sheet — ${name}`,
                '<p class="error-text">Failed to load details</p>',
                '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>'
            );
        }
    }
};
