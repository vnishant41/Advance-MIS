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
            </div>
        `;
    },

    async init() {
        // Destroy any old charts
        this.charts.forEach(c => c.destroy());
        this.charts = [];

        // Load all data concurrently
        const [statsRes, trendRes, progressRes, pendingRes] = await Promise.allSettled([
            api.get('/dash/stats'),
            api.get('/dash/week-trend'),
            api.get('/dash/report-progress'),
            api.get('/dash/pending')
        ]);

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
    }
};
