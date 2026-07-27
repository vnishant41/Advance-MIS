/**
 * Teammate Update component — split-pane daily, weekly, monthly details.
 */
import { api } from './api.js';

export default {
    charts: [],
    selectedTeammate: null,
    period: 'daily',
    refDate: '',
    searchQuery: '',
    detailSearchQuery: '',
    statusFilter: 'all',
    teamData: [],
    sumupData: {},
    startDate: '',
    endDate: '',
    teammateDetail: [],
    teammateBackupDetail: [],
    teammateTaskHistory: [],
    teammateFactorTasks: [],
    taskHistorySearchQuery: '',
    taskHistoryStatusFilter: 'all',
    factorTasksSearchQuery: '',
    factorTasksStatusFilter: 'all',
    selectedChartTopic: '__ALL__',


    async render() {
        return `
            <div class="team-update-layout">
                <!-- Sidebar with Teammates List -->
                <div class="team-update-sidebar">
                    <div class="glass-card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; height: 100%;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
                            <span>Teammates</span>
                            <span class="badge" id="team-count" style="margin: 0; background: var(--bg-hover); color: var(--text-secondary); font-size: 0.75rem;">0</span>
                        </div>
                        <!-- Teammate Search -->
                        <div class="search-box" style="width: 100%;">
                            <i class="fas fa-search"></i>
                            <input type="text" id="teammate-search" placeholder="Search teammates..." style="width: 100%; border-radius: 8px; padding-left: 36px; padding-top: 8px; padding-bottom: 8px;">
                        </div>
                        <!-- Teammates Container -->
                        <div class="teammate-list-container" id="teammates-list" style="max-height: 500px;">
                            <!-- Loaded dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Main Pane -->
                <div class="team-update-main">
                    <!-- Controls Row -->
                    <div class="glass-card" style="padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                        <!-- Timeframe Toggle -->
                        <div class="tabs" id="timeframe-tabs" style="margin-bottom: 0; padding: 3px;">
                            <button class="tab active" data-period="daily">Daily</button>
                            <button class="tab" data-period="weekly">Weekly</button>
                            <button class="tab" data-period="monthly">Monthly</button>
                        </div>

                        <!-- Date Selection Controls -->
                        <div id="date-nav-controls" style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-outline btn-sm" id="btn-prev-date" style="padding: 8px 12px;"><i class="fas fa-chevron-left"></i></button>
                            <div style="position: relative; display: flex; align-items: center;">
                                <input type="date" id="ref-date-picker" style="padding: 6px 12px; font-weight: 600; font-size: 0.85rem; width: 150px; cursor: pointer;">
                            </div>
                            <button class="btn btn-outline btn-sm" id="btn-next-date" style="padding: 8px 12px;"><i class="fas fa-chevron-right"></i></button>
                            <button class="btn btn-outline btn-sm" id="btn-today" style="padding: 8px 12px;">Today</button>
                        </div>
                    </div>

                    <!-- Active Content Box -->
                    <div id="main-content-area" style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
                        <!-- Rendered Dynamically based on selectedTeammate -->
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.charts.forEach(c => c.destroy());
        this.charts = [];
        this.selectedTeammate = null;
        
        // Initialize refDate to local date in YYYY-MM-DD
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        this.refDate = `${year}-${month}-${day}`;

        const picker = document.getElementById('ref-date-picker');
        if (picker) {
            picker.value = this.refDate;
            picker.addEventListener('change', (e) => {
                this.refDate = e.target.value;
                this.loadData();
            });
        }

        // Set up timeframe toggle
        const timeframeTabs = document.getElementById('timeframe-tabs');
        if (timeframeTabs) {
            timeframeTabs.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    timeframeTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.period = tab.dataset.period;
                    this.loadData();
                });
            });
        }

        // Prev/Next/Today buttons
        const btnPrev = document.getElementById('btn-prev-date');
        if (btnPrev) btnPrev.addEventListener('click', () => this.stepDate(-1));

        const btnNext = document.getElementById('btn-next-date');
        if (btnNext) btnNext.addEventListener('click', () => this.stepDate(1));

        const btnToday = document.getElementById('btn-today');
        if (btnToday) {
            btnToday.addEventListener('click', () => {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                this.refDate = `${y}-${m}-${d}`;
                if (picker) picker.value = this.refDate;
                this.loadData();
            });
        }

        // Teammate search box
        const searchBox = document.getElementById('teammate-search');
        if (searchBox) {
            searchBox.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.renderSidebar();
            });
        }

        // Load initial data
        await this.loadData();
    },

    stepDate(direction) {
        const d = new Date(this.refDate);
        if (isNaN(d.getTime())) return;
        
        if (this.period === 'daily') {
            d.setDate(d.getDate() + direction);
        } else if (this.period === 'weekly') {
            d.setDate(d.getDate() + (direction * 7));
        } else if (this.period === 'monthly') {
            d.setMonth(d.getMonth() + direction);
        }
        
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        this.refDate = `${y}-${m}-${day}`;
        
        const picker = document.getElementById('ref-date-picker');
        if (picker) picker.value = this.refDate;
        
        this.loadData();
    },

    async loadData() {
        this.showLoadingMain();
        try {
            const res = await api.get(`/analytics/team-updates?period=${this.period}&date=${this.refDate}`);
            if (res.success) {
                // If current selected timeframe has 0 completed logs, but historical submitted logs exist in database,
                // auto-jump to latest active log date on initial load so user sees historical data immediately.
                if (!this._hasAutoJumped && res.latestLogDate && (res.sumup && res.sumup.done === 0) && res.latestLogDate < (res.startDate || '')) {
                    this._hasAutoJumped = true;
                    this.refDate = res.latestLogDate;
                    const picker = document.getElementById('ref-date-picker');
                    if (picker) picker.value = this.refDate;
                    return await this.loadData();
                }

                this.teamData = res.team || [];
                this.sumupData = res.sumup || {};
                this.startDate = res.startDate;
                this.endDate = res.endDate;
                
                this.renderSidebar();
                await this.renderMainContent();
            } else {
                this.showErrorMain(res.message || 'Failed to load team updates.');
            }
        } catch (err) {
            console.error(err);
            this.showErrorMain('Network or server error loading updates.');
        }
    },

    renderSidebar() {
        const listContainer = document.getElementById('teammates-list');
        if (!listContainer) return;
        
        const query = this.searchQuery.toLowerCase().trim();
        const filteredTeam = this.teamData.filter(t => 
            (t.name || '').toLowerCase().includes(query) || 
            (t.email || '').toLowerCase().includes(query)
        );
        
        const countSpan = document.getElementById('team-count');
        if (countSpan) countSpan.textContent = filteredTeam.length;
        
        let html = '';
        
        // 1. Render Team Sumup item
        const isSumupActive = this.selectedTeammate === null;
        html += `
            <div class="teammate-list-item ${isSumupActive ? 'active' : ''}" data-email="sumup">
                <div class="avatar-circle" style="background: linear-gradient(135deg, var(--accent) 0%, #1d4ed8 100%);">
                    <i class="fas fa-users"></i>
                </div>
                <div class="teammate-meta">
                    <div class="teammate-name">Team Sumup</div>
                    <div class="teammate-email">Aggregate metrics & trends</div>
                </div>
            </div>
        `;
        
        // 2. Render each Teammate
        filteredTeam.forEach(t => {
            const isActive = this.selectedTeammate === t.email;
            const scoreClass = t.score >= 80 ? 'high' : t.score >= 50 ? 'medium' : 'low';
            html += `
                <div class="teammate-list-item ${isActive ? 'active' : ''}" data-email="${t.email}">
                    <div class="avatar-circle">
                        ${(t.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div class="teammate-meta">
                        <div class="teammate-name">${App.escapeHtml(t.name)}</div>
                        <div class="teammate-email">${App.escapeHtml(t.email)}</div>
                        <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                            <div class="progress-bar" style="width:100%; height:4px; background:rgba(255,255,255,0.06); margin:0;">
                                <div class="progress-fill" style="width:${t.score}%; background:var(--${scoreClass === 'high' ? 'success' : scoreClass === 'medium' ? 'warning' : 'danger'});"></div>
                            </div>
                        </div>
                    </div>
                    <span class="teammate-score-badge ${scoreClass}">${t.score}%</span>
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        
        // Click handlers
        listContainer.querySelectorAll('.teammate-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const email = item.dataset.email;
                if (email === 'sumup') {
                    this.selectedTeammate = null;
                } else {
                    this.selectedTeammate = email;
                }
                listContainer.querySelectorAll('.teammate-list-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this.renderMainContent();
            });
        });
    },

    async renderMainContent() {
        const container = document.getElementById('main-content-area');
        if (!container) return;
        
        if (this.selectedTeammate === null) {
            container.innerHTML = this.renderSumup();
            this.renderSumupCharts();
            
            // Set up Export CSV listener in Sumup view
            const csvBtn = document.getElementById('btn-export-csv');
            if (csvBtn) {
                csvBtn.addEventListener('click', () => {
                    window.open('/api/analytics/export/csv', '_blank');
                });
            }
        } else {
            await this.renderTeammate(this.selectedTeammate);
        }
    },

    renderSumup() {
        const s = this.sumupData || {};
        const dateRangeLabel = this.getDateRangeLabel();
        
        let typesHtml = '';
        if (s.byType && Object.keys(s.byType).length > 0) {
            Object.entries(s.byType).forEach(([type, countData]) => {
                const rate = countData.total ? Math.round(countData.done / countData.total * 100) : 0;
                const badgeMap = {
                    'Task': 'var(--accent)',
                    'MISReport': 'var(--info)',
                    'DataUpdate': '#a78bfa',
                    'ReportGroup': 'var(--success)'
                };
                const color = badgeMap[type] || 'var(--text-muted)';
                typesHtml += `
                    <tr>
                        <td style="font-weight:600; display:flex; align-items:center; gap:8px;">
                            <span class="tag" style="background:${color}22; color:${color}; font-size:.7rem; padding: 2px 6px;">${type}</span>
                        </td>
                        <td style="text-align:center;"><span style="background:rgba(16,185,129,0.1); color:#10b981; font-weight:700; padding:2px 8px; border-radius:4px;">${countData.done}</span></td>
                        <td style="text-align:center;"><span style="background:rgba(245,158,11,0.1); color:#f59e0b; font-weight:700; padding:2px 8px; border-radius:4px;">${countData.pending}</span></td>
                        <td style="text-align:center;"><span style="background:rgba(100,116,139,0.1); color:#64748b; font-weight:700; padding:2px 8px; border-radius:4px;">${countData.skip}</span></td>
                        <td style="text-align:center; font-weight:700; color:var(--text-secondary);">${countData.total}</td>
                        <td style="text-align:center; font-weight:700; color:var(--accent);">${rate}%</td>
                    </tr>
                `;
            });
        } else {
            typesHtml = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No reports scheduled in this timeframe</td></tr>';
        }

        return `
            <!-- Timeframe Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                <div>
                    <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin-bottom:4px; display:flex; align-items:center; gap:8px;"><i class="fas fa-users-cog" style="color:var(--accent);"></i>Team Sumup</h2>
                    <p style="font-size:0.8rem; color:var(--text-muted); font-weight:500;">
                        <i class="far fa-calendar-alt" style="margin-right:4px;"></i>${dateRangeLabel}
                    </p>
                </div>
                <button class="btn btn-outline btn-sm" id="btn-export-csv"><i class="fas fa-download"></i> Export CSV</button>
            </div>

            <!-- Charts Row -->
            <div class="grid-2" style="margin-bottom: 4px;">
                <div class="glass-card" style="padding: 20px; display:flex; flex-direction:column; height: 300px;">
                    <div class="card-header" style="margin-bottom:12px; padding:0;"><h3 class="card-title" style="font-size:0.9rem;"><i class="fas fa-chart-pie" style="color:var(--success);margin-right:8px;"></i>Status Distribution</h3></div>
                    <div style="flex:1; position:relative; min-height:0;"><canvas id="chart-sumup-status"></canvas></div>
                </div>
                <div class="glass-card" style="padding: 20px; display:flex; flex-direction:column; height: 300px;">
                    <div class="card-header" style="margin-bottom:12px; padding:0;"><h3 class="card-title" style="font-size:0.9rem;"><i class="fas fa-chart-line" style="color:var(--accent);margin-right:8px;"></i>Trend Analysis</h3></div>
                    <div style="flex:1; position:relative; min-height:0;"><canvas id="chart-sumup-trend"></canvas></div>
                </div>
            </div>

            <!-- Breakdown Section -->
            <div class="glass-card" style="padding: 20px;">
                <div class="card-header" style="margin-bottom: 12px; padding: 0;">
                    <h3 class="card-title" style="font-size:0.9rem;"><i class="fas fa-cubes" style="color:var(--info);margin-right:8px;"></i>Report Type Breakdown</h3>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Entry Type</th>
                                <th style="text-align:center;">Done</th>
                                <th style="text-align:center;">Pending</th>
                                <th style="text-align:center;">Skip</th>
                                <th style="text-align:center;">Total</th>
                                <th style="text-align:center;">Completion Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${typesHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderSumupCharts() {
        this.charts.forEach(c => c.destroy());
        this.charts = [];
        
        const s = this.sumupData || {};
        const statusCtx = document.getElementById('chart-sumup-status');
        const trendCtx = document.getElementById('chart-sumup-trend');
        
        if (typeof Chart === 'undefined') {
            [statusCtx, trendCtx].forEach(ctx => {
                if (ctx && ctx.parentElement) {
                    ctx.parentElement.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-chart-pie" style="opacity:.3;"></i><p style="font-size:.8rem;">Chart library unavailable.</p></div>';
                }
            });
            return;
        }
        
        // 1. Status Doughnut Chart
        if (statusCtx) {
            const chart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Done', 'Pending', 'Skip'],
                    datasets: [{
                        data: [s.done || 0, s.pending || 0, s.skip || 0],
                        backgroundColor: ['#10b981', '#f59e0b', '#64748b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8', usePointStyle: true, padding: 8, font: { family: 'Inter', size: 10 } }
                        }
                    }
                }
            });
            this.charts.push(chart);
        }
        
        // 2. Trend Line Chart
        if (trendCtx) {
            if (s.trend && s.trend.length > 0) {
                const labels = s.trend.map(t => {
                    const d = new Date(t.date);
                    return isNaN(d.getTime()) ? t.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                });
                
                const doneData = s.trend.map(t => t.done);
                const totalData = s.trend.map(t => t.total);
                const pendingData = s.trend.map(t => t.pending || Math.max(0, t.total - t.done));
                
                const chart = new Chart(trendCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Completed',
                                data: doneData,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                tension: 0.35,
                                fill: true,
                                pointRadius: 4,
                                pointBackgroundColor: '#10b981'
                            },
                            {
                                label: 'Pending',
                                data: pendingData,
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245, 158, 11, 0.06)',
                                tension: 0.35,
                                fill: true,
                                borderDash: [4, 4],
                                pointRadius: 4,
                                pointBackgroundColor: '#f59e0b'
                            },
                            {
                                label: 'Total Scheduled',
                                data: totalData,
                                borderColor: '#3b82f6',
                                backgroundColor: 'transparent',
                                tension: 0.35,
                                fill: false,
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
                                position: 'bottom',
                                labels: { color: '#94a3b8', usePointStyle: true, font: { family: 'Inter', size: 10 } }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(51,65,85,0.1)' },
                                ticks: { color: '#64748b', precision: 0, font: { family: 'Inter', size: 9 } }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#64748b', font: { family: 'Inter', size: 9 } }
                            }
                        }
                    }
                });
                this.charts.push(chart);
            } else {
                const host = trendCtx.parentElement;
                if (host) {
                    host.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-chart-line" style="opacity:.3; font-size:1.5rem;"></i><p style="font-size:.78rem; color:var(--text-muted); margin-top:4px;">No trend data available for single day timeframe.</p></div>';
                }
            }
        }
    },

    async renderTeammate(email) {
        const t = this.teamData.find(x => x.email === email);
        if (!t) {
            const container = document.getElementById('main-content-area');
            container.innerHTML = `<div class="glass-card" style="padding:40px; text-align:center; color:var(--text-muted);">Teammate not found.</div>`;
            return;
        }
        
        const dateRangeLabel = this.getDateRangeLabel();
        this.selectedChartTopic = '__ALL__';
        
        const container = document.getElementById('main-content-area');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                <div>
                    <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin-bottom:4px; display:flex; align-items:center; gap:10px;">
                        <span class="avatar-sm" style="width:32px; height:32px; font-size:.8rem; background: linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%); color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; border-radius:50%;">${(t.name||'?').charAt(0).toUpperCase()}</span>
                        <span>${App.escapeHtml(t.name)}</span>
                    </h2>
                    <p style="font-size:0.8rem; color:var(--text-muted); font-weight:500; padding-left: 42px;">
                        <i class="far fa-user" style="margin-right:4px;"></i>${App.escapeHtml(t.role)} &bull; ${App.escapeHtml(t.dept)}
                    </p>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-align:right;">
                    <div>Last Active: <strong>${t.lastActive ? t.lastActive : 'Never'}</strong></div>
                    <div style="margin-top:2px;">Timeframe: <strong>${dateRangeLabel}</strong></div>
                </div>
            </div>

            <!-- Line Chart Representation Card (Weekly / Monthly updates trend & topic drilldown) -->
            <div id="teammate-chart-card" class="glass-card" style="padding:20px; margin-bottom:4px; display:flex; flex-direction:column; min-height: 290px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                    <div>
                        <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-chart-line" style="color:var(--accent);"></i>
                            <span id="teammate-chart-title">Updates Trend (All Reports, Tasks & Factor Updates)</span>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;" id="teammate-chart-subtitle">
                            Line chart view of updates across ${dateRangeLabel}
                        </p>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;"><i class="fas fa-filter" style="margin-right:4px;"></i>Topic / Task:</span>
                            <select id="teammate-topic-select" style="padding: 5px 10px; border-radius: 6px; font-size: 0.78rem; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); max-width: 280px; cursor: pointer;">
                                <option value="__ALL__">All Reports & Topics</option>
                            </select>
                        </div>
                        <button id="btn-reset-chart-topic" class="btn btn-outline btn-sm" style="padding: 4px 10px; font-size: 0.75rem; display: none;">
                            <i class="fas fa-sync-alt" style="margin-right:4px;"></i>Show All Updates
                        </button>
                    </div>
                </div>
                
                <div style="flex:1; position:relative; min-height:210px;">
                    <canvas id="chart-teammate-trend"></canvas>
                </div>
            </div>

            <!-- Detailed task logs card -->
            <div class="glass-card" style="padding:20px; flex:1; display:flex; flex-direction:column; min-height: 300px;">
                <div class="detail-filters-row work-logs-filters">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);"><i class="fas fa-clipboard-list" style="color:var(--accent); margin-right:6px;"></i>Work Logs (MIS Reports & Tasks)</div>
                    <!-- Status Filter Pills -->
                    <div class="filter-pills" style="margin-left:auto;">
                        <button class="filter-pill active" data-status="all">All</button>
                        <button class="filter-pill" data-status="done">Done</button>
                        <button class="filter-pill" data-status="pending">Pending</button>
                        <button class="filter-pill" data-status="skip">Skip</button>
                        <button class="filter-pill" data-status="late">Late</button>
                    </div>
                    <!-- Inline search inside log detail -->
                    <div class="search-box" style="width: 220px; margin:0;">
                        <i class="fas fa-search"></i>
                        <input type="text" id="detail-search" placeholder="Filter reports..." style="padding: 6px 12px 6px 32px; border-radius:16px; font-size:0.78rem; width:100%;">
                    </div>
                </div>
                
                <div id="teammate-detail-table-container" style="flex:1; overflow-y:auto;">
                    <div class="loading-skeleton" style="padding:20px;"><div class="skeleton-card" style="height:150px;"></div></div>
                </div>
            </div>

            <!-- Dedicated Factor Tasks Card -->
            <div id="teammate-factor-tasks-card" class="glass-card" style="padding:20px; display:none; flex-direction:column; margin-top:16px; min-height: 250px;">
                <div class="detail-filters-row factor-tasks-filters" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                    <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-cubes" style="color:#a78bfa;"></i>
                        <span>Factor Tasks (Commodity Updates)</span>
                    </div>
                    <!-- Status Filter Pills for Factor Tasks -->
                    <div class="filter-pills" style="margin-left:auto;">
                        <button class="filter-pill active" data-status="all">All</button>
                        <button class="filter-pill" data-status="done">Done</button>
                        <button class="filter-pill" data-status="pending">Pending</button>
                        <button class="filter-pill" data-status="skip">Skip</button>
                        <button class="filter-pill" data-status="late">Late</button>
                    </div>
                    <!-- Inline search inside Factor Tasks -->
                    <div class="search-box" style="width: 220px; margin:0;">
                        <i class="fas fa-search"></i>
                        <input type="text" id="factor-tasks-search" placeholder="Filter factor tasks..." style="padding: 6px 12px 6px 32px; border-radius:16px; font-size:0.78rem; width:100%;">
                    </div>
                </div>
                <div id="teammate-factor-tasks-table-container" style="flex:1; overflow-y:auto;">
                    <!-- Factor tasks table loaded dynamically -->
                </div>
            </div>

            <!-- Backup reports logs card -->
            <div id="teammate-backup-card" class="glass-card" style="padding:20px; display:none; flex-direction:column; margin-top:16px; min-height: 200px;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary); margin-bottom: 12px; display:flex; align-items:center;">
                    <i class="fas fa-handshake-angle" style="color:#a78bfa; margin-right:6px;"></i>Backup Reports Submitted (Acting as Backup Role)
                </div>
                <div id="teammate-backup-table-container" style="flex:1; overflow-y:auto;">
                    <!-- Backup reports table loaded dynamically -->
                </div>
            </div>
        `;

        // Reset detail filters
        this.detailSearchQuery = '';
        this.statusFilter = 'all';
        this.factorTasksSearchQuery = '';
        this.factorTasksStatusFilter = 'all';

        // Set filter listeners for Work Logs
        const pills = container.querySelectorAll('.work-logs-filters .filter-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.statusFilter = pill.dataset.status;
                this.renderDetailTable();
            });
        });

        const searchInput = container.querySelector('#detail-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.detailSearchQuery = e.target.value;
                this.renderDetailTable();
            });
        }

        // Set filter listeners for Factor Tasks
        const factorPills = container.querySelectorAll('.factor-tasks-filters .filter-pill');
        factorPills.forEach(pill => {
            pill.addEventListener('click', () => {
                factorPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.factorTasksStatusFilter = pill.dataset.status;
                this.renderFactorTasksTable();
            });
        });

        const factorSearchInput = container.querySelector('#factor-tasks-search');
        if (factorSearchInput) {
            factorSearchInput.addEventListener('input', (e) => {
                this.factorTasksSearchQuery = e.target.value;
                this.renderFactorTasksTable();
            });
        }

        // Fetch details
        try {
            const details = await api.get(`/dash/team/${encodeURIComponent(email)}/detail?from=${this.startDate}&to=${this.endDate}`);
            const entries = details.entries || [];
            this.teammateDetail = entries.filter(e => ['MISReport', 'Task', 'Roster', 'ReportGroup'].includes(e.entryType));
            this.teammateFactorTasks = entries.filter(e => e.entryType === 'DataUpdate');
            this.teammateBackupDetail = (details.backupEntries || []);
            
            this.populateTopicDropdown();
            this.renderTeammateChart();
            
            const topicSelect = document.getElementById('teammate-topic-select');
            if (topicSelect) {
                topicSelect.addEventListener('change', (e) => {
                    this.selectChartTopic(e.target.value);
                });
            }
            
            const resetBtn = document.getElementById('btn-reset-chart-topic');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this.selectChartTopic('__ALL__');
                });
            }

            this.renderDetailTable();
            this.renderFactorTasksTable();
            this.renderBackupTable();
        } catch (err) {
            console.error(err);
            const containerTable = document.getElementById('teammate-detail-table-container');
            if (containerTable) {
                containerTable.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fas fa-exclamation-circle" style="color:var(--danger); font-size:1.8rem;"></i><p style="margin-top:8px;">Failed to load report details.</p></div>`;
            }
        }
    },

    getDateList() {
        if (!this.startDate || !this.endDate) return [this.refDate];
        const dates = [];
        try {
            let curr = new Date(this.startDate + 'T00:00:00');
            const end = new Date(this.endDate + 'T00:00:00');
            while (curr <= end) {
                const y = curr.getFullYear();
                const m = String(curr.getMonth() + 1).padStart(2, '0');
                const d = String(curr.getDate()).padStart(2, '0');
                dates.push(`${y}-${m}-${d}`);
                curr.setDate(curr.getDate() + 1);
            }
        } catch (e) {
            console.error(e);
        }
        return dates.length > 0 ? dates : [this.refDate];
    },

    populateTopicDropdown() {
        const select = document.getElementById('teammate-topic-select');
        if (!select) return;
        
        const workLogs = this.teammateDetail || [];
        const factorTasks = this.teammateFactorTasks || [];
        const totalEntries = workLogs.length + factorTasks.length;

        const workLogTopicsSet = new Set();
        workLogs.forEach(e => { if (e.topic) workLogTopicsSet.add(e.topic); });
        const workLogTopics = Array.from(workLogTopicsSet).sort();

        const factorTopicsSet = new Set();
        factorTasks.forEach(e => {
            if (e.subTopic) {
                factorTopicsSet.add(`${e.topic} (${e.subTopic})`);
            } else if (e.topic) {
                factorTopicsSet.add(e.topic);
            }
        });
        const factorTopics = Array.from(factorTopicsSet).sort();
        
        let html = `
            <option value="__ALL__" ${this.selectedChartTopic === '__ALL__' ? 'selected' : ''}>📊 All Updates (${totalEntries})</option>
        `;

        if (workLogTopics.length > 0) {
            html += `<optgroup label="MIS Reports & Tasks">`;
            html += `<option value="__ALL_WORK_LOGS__" ${this.selectedChartTopic === '__ALL_WORK_LOGS__' ? 'selected' : ''}>📋 Select All MIS Reports & Tasks (${workLogs.length})</option>`;
            workLogTopics.forEach(t => {
                const isSelected = this.selectedChartTopic === t;
                html += `<option value="${App.escapeHtml(t)}" ${isSelected ? 'selected' : ''}>${App.escapeHtml(t)}</option>`;
            });
            html += `</optgroup>`;
        }

        if (factorTopics.length > 0) {
            html += `<optgroup label="Factor Tasks (Commodity Factors)">`;
            html += `<option value="__ALL_FACTOR_TASKS__" ${this.selectedChartTopic === '__ALL_FACTOR_TASKS__' ? 'selected' : ''}>⚡ Select All Factor Tasks (${factorTasks.length})</option>`;
            factorTopics.forEach(t => {
                const isSelected = this.selectedChartTopic === t;
                html += `<option value="${App.escapeHtml(t)}" ${isSelected ? 'selected' : ''}>${App.escapeHtml(t)}</option>`;
            });
            html += `</optgroup>`;
        }
        
        select.innerHTML = html;
        select.value = this.selectedChartTopic || '__ALL__';
    },

    renderTeammateChart() {
        const ctx = document.getElementById('chart-teammate-trend');
        if (!ctx) return;

        // Clean up active teammate chart
        this.charts = this.charts.filter(c => {
            if (c && c.canvas && c.canvas.id === 'chart-teammate-trend') {
                c.destroy();
                return false;
            }
            return true;
        });

        if (typeof Chart === 'undefined') {
            if (ctx.parentElement) {
                ctx.parentElement.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-chart-line" style="opacity:.3;"></i><p style="font-size:.8rem;">Chart library unavailable.</p></div>';
            }
            return;
        }

        const dateList = this.getDateList();
        const dateLabels = dateList.map(dStr => {
            const d = new Date(dStr + 'T00:00:00');
            return isNaN(d.getTime()) ? dStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const allEntries = [
            ...(this.teammateDetail || []),
            ...(this.teammateFactorTasks || [])
        ];
        const titleSpan = document.getElementById('teammate-chart-title');
        const subtitleSpan = document.getElementById('teammate-chart-subtitle');
        const resetBtn = document.getElementById('btn-reset-chart-topic');

        let doneData = [];
        let pendingData = [];
        let totalData = [];

        if (this.selectedChartTopic === '__ALL__') {
            if (titleSpan) titleSpan.innerHTML = `<i class="fas fa-chart-line" style="color:var(--accent); margin-right:6px;"></i>Updates Trend (All Reports, Tasks & Factor Updates)`;
            if (subtitleSpan) subtitleSpan.textContent = `Line chart view of all updates over ${this.getDateRangeLabel()}`;
            if (resetBtn) resetBtn.style.display = 'none';

            dateList.forEach(dStr => {
                const dayEntries = allEntries.filter(e => e.entryDate === dStr);
                const done = dayEntries.filter(e => (e.status || '').toLowerCase() === 'done').length;
                const pending = dayEntries.filter(e => (e.status || '').toLowerCase() === 'pending' || e.isUnfilled).length;
                doneData.push(done);
                pendingData.push(pending);
                totalData.push(dayEntries.length);
            });
        } else if (this.selectedChartTopic === '__ALL_WORK_LOGS__') {
            if (titleSpan) titleSpan.innerHTML = `<i class="fas fa-clipboard-list" style="color:var(--accent); margin-right:6px;"></i>Updates Trend: <span style="color:var(--accent); font-weight:800;">All Work Logs (MIS Reports & Tasks)</span>`;
            if (subtitleSpan) subtitleSpan.textContent = `Work logs & tasks daily trajectory over ${this.getDateRangeLabel()}`;
            if (resetBtn) resetBtn.style.display = 'inline-flex';

            dateList.forEach(dStr => {
                const dayEntries = (this.teammateDetail || []).filter(e => e.entryDate === dStr);
                const done = dayEntries.filter(e => (e.status || '').toLowerCase() === 'done').length;
                const pending = dayEntries.filter(e => (e.status || '').toLowerCase() === 'pending' || e.isUnfilled).length;
                doneData.push(done);
                pendingData.push(pending);
                totalData.push(dayEntries.length);
            });
        } else if (this.selectedChartTopic === '__ALL_FACTOR_TASKS__') {
            if (titleSpan) titleSpan.innerHTML = `<i class="fas fa-cubes" style="color:#a78bfa; margin-right:6px;"></i>Updates Trend: <span style="color:#a78bfa; font-weight:800;">All Factor Tasks (Commodity Updates)</span>`;
            if (subtitleSpan) subtitleSpan.textContent = `Commodity factor updates daily trajectory over ${this.getDateRangeLabel()}`;
            if (resetBtn) resetBtn.style.display = 'inline-flex';

            dateList.forEach(dStr => {
                const dayEntries = (this.teammateFactorTasks || []).filter(e => e.entryDate === dStr);
                const done = dayEntries.filter(e => (e.status || '').toLowerCase() === 'done').length;
                const pending = dayEntries.filter(e => (e.status || '').toLowerCase() === 'pending' || e.isUnfilled).length;
                doneData.push(done);
                pendingData.push(pending);
                totalData.push(dayEntries.length);
            });
        } else {
            const topicKey = this.selectedChartTopic;
            if (titleSpan) titleSpan.innerHTML = `<i class="fas fa-filter" style="color:var(--accent); margin-right:6px;"></i>Updates Trend: <span style="color:var(--accent); font-weight:800;">${App.escapeHtml(topicKey)}</span>`;
            if (subtitleSpan) subtitleSpan.textContent = `Element history & status across ${this.getDateRangeLabel()}`;
            if (resetBtn) resetBtn.style.display = 'inline-flex';

            dateList.forEach(dStr => {
                const dayTopicEntries = allEntries.filter(e => {
                    if (e.entryDate !== dStr) return false;
                    const combined = e.subTopic ? `${e.topic} (${e.subTopic})` : e.topic;
                    return combined === topicKey || e.topic === topicKey || e.subTopic === topicKey;
                });
                const done = dayTopicEntries.filter(e => (e.status || '').toLowerCase() === 'done').length;
                const pending = dayTopicEntries.filter(e => (e.status || '').toLowerCase() === 'pending' || e.isUnfilled).length;
                doneData.push(done);
                pendingData.push(pending);
                totalData.push(dayTopicEntries.length);
            });
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'Completed',
                        data: doneData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                    },
                    {
                        label: 'Pending / Unfilled',
                        data: pendingData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,0.05)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                    },
                    {
                        label: 'Total Scheduled',
                        data: totalData,
                        borderColor: '#3b82f6',
                        borderDash: [4, 4],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            boxWidth: 12,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            footer: (tooltipItems) => {
                                const index = tooltipItems[0].dataIndex;
                                const dStr = dateList[index];
                                return `Date: ${dStr}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8', precision: 0, font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });

        this.charts.push(chart);
    },

    selectChartTopic(topicName) {
        this.selectedChartTopic = topicName;
        const select = document.getElementById('teammate-topic-select');
        if (select) select.value = topicName;
        
        this.renderTeammateChart();
        this.renderDetailTable();
        this.renderFactorTasksTable();
        
        const chartCard = document.getElementById('teammate-chart-card');
        if (chartCard) {
            chartCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    renderDetailTable() {
        const tableContainer = document.getElementById('teammate-detail-table-container');
        if (!tableContainer) return;
        
        const cardHeaderTitle = document.querySelector('.work-logs-filters div:first-child');

        const workLogs = this.teammateDetail || [];
        const factorTasks = this.teammateFactorTasks || [];
        const allEntries = [...workLogs, ...factorTasks];
        
        if (allEntries.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fas fa-clipboard-list" style="opacity:.3; font-size:2rem;"></i><p style="margin-top:8px; color:var(--text-muted);">No log entries found for this period.</p></div>`;
            return;
        }

        // 0. Filter by selected chart topic / category
        let baseLogs = [];
        if (this.selectedChartTopic === '__ALL__') {
            baseLogs = allEntries;
            if (cardHeaderTitle) cardHeaderTitle.innerHTML = `<i class="fas fa-layer-group" style="color:var(--accent); margin-right:6px;"></i>All Work Logs & Factor Updates (${allEntries.length})`;
        } else if (this.selectedChartTopic === '__ALL_WORK_LOGS__') {
            baseLogs = [...workLogs];
            if (cardHeaderTitle) cardHeaderTitle.innerHTML = `<i class="fas fa-clipboard-list" style="color:var(--accent); margin-right:6px;"></i>Work Logs (MIS Reports & Tasks) (${workLogs.length})`;
        } else if (this.selectedChartTopic === '__ALL_FACTOR_TASKS__') {
            baseLogs = [...factorTasks];
            if (cardHeaderTitle) cardHeaderTitle.innerHTML = `<i class="fas fa-cubes" style="color:#a78bfa; margin-right:6px;"></i>Factor Tasks (Commodity Updates) (${factorTasks.length})`;
        } else {
            const topicKey = this.selectedChartTopic;
            baseLogs = allEntries.filter(e => {
                const combined = e.subTopic ? `${e.topic} (${e.subTopic})` : e.topic;
                return combined === topicKey || e.topic === topicKey || e.subTopic === topicKey;
            });
            if (cardHeaderTitle) cardHeaderTitle.innerHTML = `<i class="fas fa-filter" style="color:var(--accent); margin-right:6px;"></i>Filtered Logs: <span style="color:var(--accent); font-weight:800;">${App.escapeHtml(topicKey)}</span> (${baseLogs.length})`;
        }
        
        // 1. Status Filter
        let filteredLogs = [...baseLogs];
        if (this.statusFilter !== 'all') {
            if (this.statusFilter === 'late') {
                filteredLogs = filteredLogs.filter(e => e.isLate);
            } else {
                filteredLogs = filteredLogs.filter(e => (e.status || '').toLowerCase() === this.statusFilter);
            }
        }
        
        // 2. Search query filter
        const query = this.detailSearchQuery.toLowerCase().trim();
        if (query) {
            filteredLogs = filteredLogs.filter(e => 
                (e.topic || '').toLowerCase().includes(query) ||
                (e.subTopic || '').toLowerCase().includes(query) ||
                (e.remarks || '').toLowerCase().includes(query) ||
                (e.entryType || '').toLowerCase().includes(query)
            );
        }
        
        if (filteredLogs.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fas fa-search-minus" style="opacity:.3; font-size:2rem;"></i><p style="margin-top:8px; color:var(--text-muted);">No matching reports found.</p></div>`;
            return;
        }
        
        const typeBadge = (et) => {
            const map = {
                'Task':            { label: 'Task',          color: 'var(--accent)' },
                'MISReport':       { label: 'MIS Report',    color: 'var(--info)' },
                'DataUpdate':      { label: 'Data Update',   color: '#a78bfa' },
                'ReportGroup':     { label: 'Merged Report', color: 'var(--success)' },
                'Roster':          { label: 'Roster',        color: '#14b8a6' },
            };
            const m = map[et] || { label: et, color: 'var(--text-muted)' };
            return `<span class="tag" style="background:${m.color}22; color:${m.color}; font-size:.68rem; font-weight:600; padding:2px 6px; border-radius:4px;">${m.label}</span>`;
        };
        
        const statusBadgeHtml = (status, isLate) => {
            let text = status;
            let cls = (status || '').toLowerCase();
            if (isLate) {
                return `<span class="status-badge late"><i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>${text} (Late)</span>`;
            }
            return `<span class="status-badge ${cls}">${text}</span>`;
        };
        
        const formatTime = (tsStr) => {
            if (!tsStr) return '—';
            try {
                const dt = new Date(tsStr);
                return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '<br>' +
                       `<span style="font-size:.72rem; color:var(--text-muted);">${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>`;
            } catch (e) {
                return tsStr;
            }
        };

        const fmtEntryDate = (ds) => {
            if (!ds) return '';
            try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
            catch { return ds; }
        };

        const html = `
            <div class="table-wrap" style="max-height: 480px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:10%;">Date</th>
                            <th style="width:32%;">Report / Topic</th>
                            <th style="width:13%;">Type</th>
                            <th style="width:12%;">Status</th>
                            <th style="width:19%;">Remarks</th>
                            <th style="width:14%;">Submitted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredLogs.map(e => {
                            const isUnfilled = e.isUnfilled;
                            const rowStyle = isUnfilled ? 'opacity: 0.85; background: rgba(255,255,255,0.01);' : '';
                            const unfilledLabel = isUnfilled ? '<span class="tag animate-pulse" style="background:rgba(245,158,11,0.15); color:#f59e0b; font-size:.62rem; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:700; border: 1px solid rgba(245,158,11,0.3);">UNFILLED</span>' : '';
                            return `
                                <tr style="${rowStyle}">
                                    <td style="font-size:.75rem; color:var(--text-muted); white-space:nowrap; padding:10px 12px;">${fmtEntryDate(e.entryDate || '')}</td>
                                    <td style="font-weight:600; color:var(--text-primary); padding:10px 14px;">
                                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                                            <span class="topic-link-clickable" data-topic="${App.escapeHtml(e.topic)}" style="cursor:pointer; color:var(--text-primary); font-weight:700; display:inline-flex; align-items:center; gap:4px;" title="Click to view line chart trend for '${App.escapeHtml(e.topic)}'">
                                                <span class="topic-title-text" style="border-bottom: 1px dashed rgba(59,130,246,0.4);">${App.escapeHtml(e.topic)}</span>
                                                <i class="fas fa-chart-line" style="font-size:0.65rem; color:var(--accent); opacity:0.8;"></i>
                                            </span>
                                            ${unfilledLabel}
                                        </div>
                                        ${e.subTopic ? `<div style="font-size:0.73rem; color:var(--text-secondary); margin-top:3px; font-weight:500; display:flex; align-items:center; gap:4px;"><i class="fas fa-level-down-alt" style="font-size:.6rem; opacity:.6;"></i>${App.escapeHtml(e.subTopic)}</div>` : ''}
                                    </td>
                                    <td style="padding:10px 14px;">${typeBadge(e.entryType)}</td>
                                    <td style="padding:10px 14px;">${statusBadgeHtml(e.status, e.isLate)}</td>
                                    <td style="font-size:.79rem; color:var(--text-secondary); white-space:normal; word-break:break-word; max-width:220px; padding:10px 14px;">
                                        ${App.escapeHtml(e.remarks || '—')}
                                    </td>
                                    <td style="font-size:.78rem; color:var(--text-muted); font-weight:500; padding:10px 14px; white-space:nowrap;">
                                        ${isUnfilled ? '<span style="font-style:italic; color:var(--text-muted); opacity:.7;">Pending Submission</span>' : formatTime(e.timestamp)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        tableContainer.innerHTML = html;
        tableContainer.querySelectorAll('.topic-link-clickable').forEach(link => {
            link.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const topic = link.dataset.topic;
                if (topic) this.selectChartTopic(topic);
            });
        });
    },

    renderFactorTasksTable() {
        const card = document.getElementById('teammate-factor-tasks-card');
        const tableContainer = document.getElementById('teammate-factor-tasks-table-container');
        if (!card || !tableContainer) return;

        if (!this.teammateFactorTasks || this.teammateFactorTasks.length === 0) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'flex';

        // Filter factor tasks
        let filteredFactorTasks = [...this.teammateFactorTasks];

        // 1. Status Filter
        if (this.factorTasksStatusFilter !== 'all') {
            if (this.factorTasksStatusFilter === 'late') {
                filteredFactorTasks = filteredFactorTasks.filter(e => e.isLate);
            } else {
                filteredFactorTasks = filteredFactorTasks.filter(e => (e.status || '').toLowerCase() === this.factorTasksStatusFilter);
            }
        }

        // 2. Search query filter
        const query = this.factorTasksSearchQuery.toLowerCase().trim();
        if (query) {
            filteredFactorTasks = filteredFactorTasks.filter(e => 
                (e.topic || '').toLowerCase().includes(query) ||
                (e.subTopic || '').toLowerCase().includes(query) ||
                (e.remarks || '').toLowerCase().includes(query)
            );
        }

        if (filteredFactorTasks.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state" style="padding:30px;"><i class="fas fa-search-minus" style="opacity:.3; font-size:1.8rem;"></i><p style="margin-top:8px; color:var(--text-muted);">No matching factor tasks found.</p></div>`;
            return;
        }

        const statusBadgeHtml = (status, isLate) => {
            let text = status;
            let cls = (status || '').toLowerCase();
            if (isLate) {
                return `<span class="status-badge late"><i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>${text} (Late)</span>`;
            }
            return `<span class="status-badge ${cls}">${text}</span>`;
        };

        const formatTime = (tsStr) => {
            if (!tsStr) return '—';
            try {
                const dt = new Date(tsStr);
                return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '<br>' +
                       `<span style="font-size:.72rem; color:var(--text-muted);">${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>`;
            } catch (e) {
                return tsStr;
            }
        };

        const fmtEntryDate = (ds) => {
            if (!ds) return '';
            try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
            catch { return ds; }
        };

        const html = `
            <div class="table-wrap" style="max-height: 420px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:11%;">Date</th>
                            <th style="width:24%;">Commodity / Frequency</th>
                            <th style="width:28%;">Factor Task (Subtopic)</th>
                            <th style="width:11%;">Status</th>
                            <th style="width:14%;">Remarks</th>
                            <th style="width:12%;">Submitted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredFactorTasks.map(e => {
                            const isUnfilled = e.isUnfilled;
                            const rowStyle = isUnfilled ? 'opacity: 0.85; background: rgba(255,255,255,0.01);' : '';
                            const unfilledLabel = isUnfilled ? '<span class="tag animate-pulse" style="background:rgba(245,158,11,0.15); color:#f59e0b; font-size:.62rem; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:700; border: 1px solid rgba(245,158,11,0.3);">UNFILLED</span>' : '';
                            const topicKey = e.subTopic ? `${e.topic} (${e.subTopic})` : e.topic;
                            return `
                                <tr style="${rowStyle}">
                                    <td style="font-size:.75rem; color:var(--text-muted); white-space:nowrap; padding:10px 12px;">${fmtEntryDate(e.entryDate || '')}</td>
                                    <td style="font-weight:600; color:var(--text-primary); padding:10px 14px;">
                                        <span>${App.escapeHtml(e.topic)}</span>
                                    </td>
                                    <td style="padding:10px 14px;">
                                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                                            <span class="topic-link-clickable" data-topic="${App.escapeHtml(topicKey)}" style="cursor:pointer; color:#a78bfa; font-weight:700; display:inline-flex; align-items:center; gap:4px;" title="Click to view line chart trend for '${App.escapeHtml(topicKey)}'">
                                                <span class="topic-title-text" style="border-bottom: 1px dashed rgba(167,139,250,0.5);">${App.escapeHtml(e.subTopic || e.topic)}</span>
                                                <i class="fas fa-chart-line" style="font-size:0.65rem; color:#a78bfa; opacity:0.8;"></i>
                                            </span>
                                            ${unfilledLabel}
                                        </div>
                                    </td>
                                    <td style="padding:10px 14px;">${statusBadgeHtml(e.status, e.isLate)}</td>
                                    <td style="font-size:.79rem; color:var(--text-secondary); white-space:normal; word-break:break-word; max-width:200px; padding:10px 14px;">
                                        ${App.escapeHtml(e.remarks || '—')}
                                    </td>
                                    <td style="font-size:.78rem; color:var(--text-muted); font-weight:500; padding:10px 14px; white-space:nowrap;">
                                        ${isUnfilled ? '<span style="font-style:italic; color:var(--text-muted); opacity:.7;">Pending Submission</span>' : formatTime(e.timestamp)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        tableContainer.innerHTML = html;
        tableContainer.querySelectorAll('.topic-link-clickable').forEach(link => {
            link.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const topic = link.dataset.topic;
                if (topic) this.selectChartTopic(topic);
            });
        });
    },

    renderBackupTable() {
        const backupCard = document.getElementById('teammate-backup-card');
        const tableContainer = document.getElementById('teammate-backup-table-container');
        if (!backupCard || !tableContainer) return;
        
        if (!this.teammateBackupDetail || this.teammateBackupDetail.length === 0) {
            backupCard.style.display = 'none';
            return;
        }
        
        backupCard.style.display = 'flex';
        
        const typeBadge = (et) => {
            const map = {
                'Task':            { label: 'Task',          color: 'var(--accent)' },
                'MISReport':       { label: 'MIS Report',    color: 'var(--info)' },
                'DataUpdate':      { label: 'Data Update',   color: '#a78bfa' },
                'ReportGroup':     { label: 'Merged Report', color: 'var(--success)' },
                'Roster':          { label: 'Roster',        color: '#14b8a6' },
            };
            const m = map[et] || { label: et, color: 'var(--text-muted)' };
            return `<span class="tag" style="background:${m.color}22; color:${m.color}; font-size:.68rem; font-weight:600; padding:2px 6px; border-radius:4px;">${m.label}</span>`;
        };
        
        const statusBadgeHtml = (status, isLate) => {
            let text = status;
            let cls = (status || '').toLowerCase();
            if (isLate) {
                return `<span class="status-badge late"><i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>${text} (Late)</span>`;
            }
            return `<span class="status-badge ${cls}">${text}</span>`;
        };
        
        const html = `
            <div class="table-wrap" style="max-height: 300px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 32%;">Report / Topic</th>
                            <th style="width: 20%;">Submitted For (Primary User)</th>
                            <th style="width: 15%;">Type</th>
                            <th style="width: 15%;">Status</th>
                            <th style="width: 18%;">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.teammateBackupDetail.map(e => `
                            <tr>
                                <td style="font-weight:600; color:var(--text-primary); padding: 10px 14px;">
                                    <div>${App.escapeHtml(e.topic)}</div>
                                    ${e.subTopic ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px; font-weight:normal;">Subtopic: ${App.escapeHtml(e.subTopic)}</div>` : ''}
                                </td>
                                <td style="padding: 10px 14px;">
                                    <div style="font-weight:600; color:var(--text-primary);">${App.escapeHtml(e.onBehalfOfName || e.onBehalfOfEmail)}</div>
                                    <div style="font-size:0.72rem; color:var(--text-muted);">${App.escapeHtml(e.onBehalfOfEmail)}</div>
                                </td>
                                <td style="padding: 10px 14px;">${typeBadge(e.entryType)}</td>
                                <td style="padding: 10px 14px;">${statusBadgeHtml(e.status, e.isLate)}</td>
                                <td style="font-size:.8rem; color:var(--text-secondary); white-space:normal; word-break:break-word; max-width:220px; padding: 10px 14px;">
                                    ${App.escapeHtml(e.remarks || '—')}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        tableContainer.innerHTML = html;
    },

    getDateRangeLabel() {
        if (!this.startDate || !this.endDate) return '';
        
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
        
        if (this.period === 'daily') {
            return start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else if (this.period === 'weekly') {
            return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' + 
                   end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (this.period === 'monthly') {
            return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        return '';
    },

    showLoadingMain() {
        const container = document.getElementById('main-content-area');
        if (container) {
            container.innerHTML = `
                <div class="loading-skeleton" style="padding:20px;">
                    <div class="skeleton-card" style="height:100px;"></div>
                    <div class="skeleton-card" style="height:250px;"></div>
                </div>
            `;
        }
    },

    showErrorMain(msg) {
        const container = document.getElementById('main-content-area');
        if (container) {
            container.innerHTML = `
                <div class="glass-card" style="padding:48px; text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:var(--danger); margin-bottom:16px;"></i>
                    <h3>Error Loading Team Updates</h3>
                    <p style="color:var(--text-muted); margin-top:8px;">${App.escapeHtml(msg)}</p>
                    <button class="btn btn-primary" id="btn-retry-load" style="margin-top:16px;">Retry</button>
                </div>
            `;
            const btn = container.querySelector('#btn-retry-load');
            if (btn) btn.addEventListener('click', () => this.loadData());
        }
    }
};


