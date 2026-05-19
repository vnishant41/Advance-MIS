/**
 * Analytics — KPIs, SLA breaches, commodity comparison, CSV export.
 */
import { api } from './api.js';

export default {
    charts: [],

    async render() {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-weight:700;"><i class="fas fa-chart-bar" style="color:var(--accent);margin-right:8px;"></i>Analytics & Reports</h3>
                <button class="btn btn-outline btn-sm" id="btn-export-csv"><i class="fas fa-download"></i> Export CSV</button>
            </div>

            <!-- KPI Summary -->
            <div class="kpi-grid" id="analytics-kpi">
                <div class="glass-card kpi-card blue">
                    <div class="kpi-top"><div><div class="kpi-value" id="an-total">—</div><div class="kpi-label">Total Entries</div></div><div class="kpi-icon"><i class="fas fa-list"></i></div></div>
                </div>
                <div class="glass-card kpi-card green">
                    <div class="kpi-top"><div><div class="kpi-value" id="an-done-rate">—</div><div class="kpi-label">Completion Rate</div></div><div class="kpi-icon"><i class="fas fa-percentage"></i></div></div>
                </div>
                <div class="glass-card kpi-card amber">
                    <div class="kpi-top"><div><div class="kpi-value" id="an-pending-rate">—</div><div class="kpi-label">Pending Rate</div></div><div class="kpi-icon"><i class="fas fa-hourglass-half"></i></div></div>
                </div>
                <div class="glass-card kpi-card red">
                    <div class="kpi-top"><div><div class="kpi-value" id="an-late-rate">—</div><div class="kpi-label">Late Rate</div></div><div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div></div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid-2" style="margin-bottom:16px;">
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-pie" style="color:var(--success);margin-right:8px;"></i>Status Distribution</h3></div>
                    <div class="chart-container"><canvas id="chart-status-dist"></canvas></div>
                </div>
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-bar" style="color:var(--danger);margin-right:8px;"></i>Completion vs Late</h3></div>
                    <div class="chart-container"><canvas id="chart-completion"></canvas></div>
                </div>
            </div>

            <!-- SLA Breaches -->
            <div class="glass-card" style="padding: 24px;">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-shield-alt" style="color:var(--danger);margin-right:8px;"></i>SLA Breaches</h3>
                </div>
                <div id="sla-table-container">
                    <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>
        `;
    },

    async init() {
        this.charts.forEach(c => c.destroy());
        this.charts = [];

        document.getElementById('btn-export-csv').addEventListener('click', () => {
            window.open('/api/analytics/export/csv', '_blank');
        });

        const [kpiRes, slaRes] = await Promise.allSettled([
            api.get('/analytics/kpi'),
            api.get('/analytics/sla-breaches')
        ]);

        // KPIs
        if (kpiRes.status === 'fulfilled' && kpiRes.value.success) {
            const k = kpiRes.value;
            document.getElementById('an-total').textContent = k.counts.total;
            document.getElementById('an-done-rate').textContent = k.doneRate + '%';
            document.getElementById('an-pending-rate').textContent = k.pendingRate + '%';
            document.getElementById('an-late-rate').textContent = k.lateRate + '%';
            this.renderStatusChart(k.counts);
            this.renderCompletionChart(k);
        }

        // SLA Breaches
        if (slaRes.status === 'fulfilled' && slaRes.value.success) {
            this.renderSlaTable(slaRes.value.data);
        }
    },

    renderStatusChart(counts) {
        const ctx = document.getElementById('chart-status-dist');
        if (!ctx) return;
        if (typeof Chart === 'undefined') {
            const host = ctx.parentElement;
            if (host) host.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-chart-pie" style="opacity:.3;"></i><p style="font-size:.85rem;">Chart library unavailable.</p></div>';
            return;
        }
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Done', 'Pending', 'Skip'],
                datasets: [{
                    data: [counts.done, counts.pending, counts.skip],
                    backgroundColor: ['#10b981', '#f59e0b', '#64748b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', usePointStyle: true, padding: 16, font: { family: 'Inter' } }
                    }
                }
            }
        });
        this.charts.push(chart);
    },

    renderCompletionChart(data) {
        const ctx = document.getElementById('chart-completion');
        if (!ctx) return;
        if (typeof Chart === 'undefined') {
            const host = ctx.parentElement;
            if (host) host.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-chart-bar" style="opacity:.3;"></i><p style="font-size:.85rem;">Chart library unavailable.</p></div>';
            return;
        }
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Done', 'Pending', 'Skip', 'Late'],
                datasets: [{
                    label: 'Entries',
                    data: [data.counts.done, data.counts.pending, data.counts.skip, data.counts.late],
                    backgroundColor: ['#10b981', '#f59e0b', '#64748b', '#ef4444'],
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(51,65,85,0.3)' },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    }
                }
            }
        });
        this.charts.push(chart);
    },

    renderSlaTable(data) {
        const container = document.getElementById('sla-table-container');
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt" style="color:var(--success);"></i><p>No SLA breaches found. Great job!</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th>Topic</th><th>Sub-Topic</th><th>Breaches</th><th>Last Breach</th><th>Employees</th></tr>
                </thead>
                <tbody>
                    ${data.map(d => `
                        <tr>
                            <td style="font-weight:600;">${App.escapeHtml(d.topic)}</td>
                            <td style="color:var(--text-muted);">${App.escapeHtml(d.subTopic || '—')}</td>
                            <td><span style="color:var(--danger); font-weight:700;">${d.breaches}</span></td>
                            <td style="font-size:.85rem;">${d.lastBreach}</td>
                            <td style="font-size:.85rem;">${App.escapeHtml(d.employees || '')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
};
