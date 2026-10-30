/**
 * Crishi Database Module — Advanced MIS Redesign
 * Live MySQL Table Surveillance against `agalabsdev_stage`,
 * Automated Date & Report Verification, Manager Progress Tracking,
 * Multi-Stream Daily Workloads, 15th-20th Monthly Cycle Windows, and User Remarks.
 */
import { api } from './api.js';

const COMMODITY_COLORS = {
    // 16 Authoritative Commodities from report mapping.xlsx:
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
    'General / Other': { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' }
};

const TEAMMATE_DESCRIPTIONS = {
    'ALL': 'Showing all 114 monitored database tables across the 16 core agricultural commodities in agalabsdev_stage',
    'Nishant': 'Nishant (36 Tasks): Pulses (Bengal Gram, Tur, Urad, Moong, Masoor, Pea) & Tops (Tomato, Potato, Onion)',
    'Bhawna': 'Bhawna (17 Tasks): Cotton, Rapeseed, Soybeans, and Weather Daily (Alternate Week with Pankaj)',
    'Pankaj': 'Pankaj (13 Tasks): Chilli, Coriander, Cumin, Turmeric, and Weather Daily (Alternate Week with Bhawna)',
    'Nitesh': 'Nitesh (21 Tasks): Bajra, Barley, Maize, and Sugar',
    'Gopi': 'Gopi (27 Tasks): Rice and Wheat'
};

function getTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getTodayIsoDate() {
    return getTodayStr();
}

function formatToDDMMMYYYY(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (str.toLowerCase() === 'exempt' || str.toLowerCase() === 'none') {
        return str;
    }
    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(str)) {
        return str;
    }
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const y = isoMatch[1];
        const m = parseInt(isoMatch[2], 10) - 1;
        const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
        return `${d}-${months[m] || isoMatch[2]}-${y}`;
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
        const day = String(parsed.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[parsed.getMonth()]}-${parsed.getFullYear()}`;
    }
    return str;
}

const CrishiModule = {
    activeTab: 'surveillance', // 'surveillance' | 'roster'
    surveillanceViewMode: 'table', // 'table' | 'commodity' | 'date'
    selectedSurveillanceDate: getTodayIsoDate(),
    expandedCommodities: new Set(),
    tasks: [],
    filteredTasks: [],
    commodityRollups: [],
    dateSummary: {},
    summary: {},
    activeUserFilter: 'ALL',
    activeStatusFilter: 'ALL',
    activeSearchQuery: '',
    activeCommodityFilter: '',
    activeFrequencyFilter: '',
    activePipelineFilter: '',
    currentSortCol: 'title',
    currentSortDir: 'asc',
    activeAssigneeFilter: '',
    activeTodayStatusFilter: '',
    historyRecords: [],
    historySortCol: 'id',
    historySortDir: 'desc',
    scrapperMatrix: [],
    rakeMovement: [],
    rosterLogs: [],
    _activeUsers: null,

    getTodayStr() {
        return getTodayStr();
    },

    async getActiveUsers() {
        if (this._activeUsers && this._activeUsers.length) {
            return this._activeUsers;
        }
        const fallback = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
        try {
            if (window.App && window.App.state && window.App.state.users && window.App.state.users.length) {
                const active = window.App.state.users.filter(u => u.active !== false).map(u => u.name || u.email);
                if (active.length) {
                    this._activeUsers = active;
                    return active;
                }
            }
            const res = await api.get('/admin/users');
            if (res && res.data && res.data.length) {
                const active = res.data.filter(u => u.active !== false).map(u => u.name || u.email);
                if (active.length) {
                    this._activeUsers = active;
                    return active;
                }
            }
        } catch (e) {
            console.warn('Could not fetch active users for CrishiModule, using fallback', e);
        }
        return fallback;
    },

    getActiveUsersSync() {
        if (this._activeUsers && this._activeUsers.length) {
            return this._activeUsers;
        }
        if (window.App && window.App.state && window.App.state.users && window.App.state.users.length) {
            const active = window.App.state.users.filter(u => u.active !== false).map(u => u.name || u.email);
            if (active.length) {
                this._activeUsers = active;
                return active;
            }
        }
        const tm = this.summary && this.summary.teammates ? Object.keys(this.summary.teammates) : [];
        if (tm.length) {
            return Array.from(new Set([...tm, 'Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']));
        }
        return ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
    },

    async render() {
        const isAdmin = ['SuperAdmin', 'Manager', 'Leader', 'Admin'].includes(window.currentUser?.role);
        return `
            <div class="crishi-view">
                <!-- Top Header & Live DB Sync -->
                <div class="crishi-header">
                    <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                        <h2 style="font-size: 1.45rem; font-weight: 800; display: flex; align-items: center; gap: 10px; margin: 0;">
                            <i class="fas fa-database" style="color: var(--accent);"></i>
                            <span>Crishi Database Surveillance</span>
                        </h2>
                        <span class="badge" id="crishi-db-badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-weight: 700; padding: 5px 12px; border-radius: 20px; font-size: .82rem; border: 1px solid rgba(59,130,246,0.3);">
                            <i class="fas fa-server"></i> agalabsdev_stage (114 Monitored Tables)
                        </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <div class="crishi-tabs">
                            <button class="crishi-tab-btn ${this.activeTab === 'surveillance' ? 'active' : ''}" id="tab-surveillance">
                                <i class="fas fa-shield-alt"></i> Live DB Surveillance
                            </button>
                            <button class="crishi-tab-btn ${this.activeTab === 'roster' ? 'active' : ''}" id="tab-roster">
                                <i class="fas fa-calendar-alt"></i> Weekly Roster & Rake Movement
                            </button>
                            <button class="crishi-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" id="tab-history">
                                <i class="fas fa-history"></i> Update History
                            </button>
                        </div>

                        <!-- User & Manager DB Actions -->
                        <button class="btn btn-primary btn-sm" id="btn-sync-report-db" title="Verify your MySQL date & report to update the MIS automatically from the DB">
                            <i class="fas fa-database"></i> Update MIS from DB
                        </button>
                        <button class="btn btn-outline btn-sm" id="btn-manager-audit-log" title="View log of what has been updated till now in MySQL">
                            <i class="fas fa-clipboard-list"></i> Updates Done Till Now
                        </button>
                        <button class="btn btn-outline btn-sm" id="btn-force-refresh" title="Re-query MySQL database agalabsdev_stage for MAX(date)">
                            <i class="fas fa-sync-alt"></i> Refresh from MySQL
                        </button>
                    </div>
                </div>

                <!-- Tab 1: Live DB Surveillance -->
                <div id="view-surveillance" class="${this.activeTab === 'surveillance' ? '' : 'hidden'}">
                    
                    <!-- Manager Progress KPI Dashboard -->
                    <div class="crishi-kpi-grid" id="manager-kpi-grid">
                        <div class="crishi-kpi-card" id="card-total-coverage" style="cursor: pointer;" title="Click to view all monitored tables (Reset Filter)">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Monitored Coverage</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: var(--text-primary); margin-top: 1px;" id="kpi-total-tasks">--</div>
                                <div style="font-size: .67rem; color: #60a5fa; margin-top: 1px;">Active in agalabsdev_stage</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(59,130,246,0.15); color: #60a5fa;">
                                <i class="fas fa-table"></i>
                            </div>
                        </div>

                        <div class="crishi-kpi-card" style="border-left: 3px solid #10b981; cursor: pointer;" id="card-updated-today" title="Click to view all updated tables">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Updated Till Now</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: #10b981; margin-top: 1px;" id="kpi-updated-today">--</div>
                                <div style="font-size: .67rem; color: var(--text-secondary); margin-top: 1px;" id="kpi-completion-rate">Verified via DB MAX(date)</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(16,185,129,0.15); color: #10b981;">
                                <i class="fas fa-check-double"></i>
                            </div>
                        </div>

                        <div class="crishi-kpi-card" style="border-left: 3px solid #ef4444; cursor: pointer;" id="card-pending-action" title="Click to view pending tables">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Pending / Overdue</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: #ef4444; margin-top: 1px;" id="kpi-pending-action">--</div>
                                <div style="font-size: .67rem; color: #f87171; margin-top: 1px;">Cutoff elapsed without update</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(239,68,68,0.15); color: #ef4444;">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                        </div>

                        <div class="crishi-kpi-card" style="border-left: 3px solid #0ea5e9; cursor: pointer;" id="card-cycle-windows" title="Click to view 15th-20th cycle tasks">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Cycle Windows (15–20th)</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: #0ea5e9; margin-top: 1px;" id="kpi-cycle-windows">--</div>
                                <div style="font-size: .67rem; color: #38bdf8; margin-top: 1px;">Monthly Trade Flow active</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(14,165,233,0.15); color: #0ea5e9;">
                                <i class="fas fa-calendar-check"></i>
                            </div>
                        </div>

                        <div class="crishi-kpi-card" style="border-left: 3px solid #f59e0b; cursor: pointer;" id="card-need-correction" title="Click to view tasks needing correction">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Need Correction</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: #f59e0b; margin-top: 1px;" id="kpi-need-correction">0</div>
                                <div style="font-size: .67rem; color: #fbbf24; margin-top: 1px;" id="kpi-need-correction-sub">Manager review action items</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(245,158,11,0.15); color: #f59e0b;">
                                <i class="fas fa-tools"></i>
                            </div>
                        </div>

                        <div class="crishi-kpi-card" style="border-left: 3px solid #8b5cf6; cursor: pointer;" id="card-remarks-count" title="Click to view tasks with remarks">
                            <div>
                                <div style="color: var(--text-muted); font-size: .68rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px;">Teammate Remarks</div>
                                <div style="font-size: 1.22rem; font-weight: 800; color: #8b5cf6; margin-top: 1px;" id="kpi-remarks-count">--</div>
                                <div style="font-size: .67rem; color: #c4b5fd; margin-top: 1px;">Delay & context notes</div>
                            </div>
                            <div class="kpi-icon-wrap" style="background: rgba(139,92,246,0.15); color: #8b5cf6;">
                                <i class="fas fa-comment-dots"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Cadence Aggregate View: Daily, Weekly, Monthly (Compact High-Density Fit) -->
                    <div class="cadence-aggregate-grid" id="cadence-agg-grid">
                        <div class="cadence-agg-card" id="card-cadence-daily" data-cadence="Daily" title="Click to filter by Daily Cadence (Mandi Spot & Rates)">
                            <div class="cadence-agg-header">
                                <span class="cadence-agg-title"><i class="fas fa-sun" style="color: #f59e0b;"></i> Daily Cadence (Aggregate)</span>
                                <span class="badge" id="cad-daily-pct" style="background: rgba(16,185,129,0.15); color: #10b981; font-weight: 700; font-size: .68rem; padding: 1px 6px;">100%</span>
                            </div>
                            <div class="cadence-agg-val"><span id="cad-daily-count">57</span> <span style="font-size: .78rem; font-weight: 500; color: var(--text-muted);">/ <span id="cad-daily-total">57</span> Updated</span></div>
                            <div class="cadence-progress-bar"><div class="cadence-progress-fill" id="cad-daily-bar" style="width: 100%; background: #10b981;"></div></div>
                            <div style="font-size: .67rem; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                                <span><strong id="cad-daily-pending" style="color: #10b981;">0</strong> Pending</span>
                                <span>Daily Mandi Spot & Rates</span>
                            </div>
                        </div>

                        <div class="cadence-agg-card" id="card-cadence-weekly" data-cadence="Weekly" title="Click to filter by Weekly Cadence (Port Lineups & Logistics)">
                            <div class="cadence-agg-header">
                                <span class="cadence-agg-title"><i class="fas fa-calendar-week" style="color: #60a5fa;"></i> Weekly Cadence (Aggregate)</span>
                                <span class="badge" id="cad-weekly-pct" style="background: rgba(16,185,129,0.15); color: #10b981; font-weight: 700; font-size: .68rem; padding: 1px 6px;">100%</span>
                            </div>
                            <div class="cadence-agg-val"><span id="cad-weekly-count">28</span> <span style="font-size: .78rem; font-weight: 500; color: var(--text-muted);">/ <span id="cad-weekly-total">28</span> Updated</span></div>
                            <div class="cadence-progress-bar"><div class="cadence-progress-fill" id="cad-weekly-bar" style="width: 100%; background: #60a5fa;"></div></div>
                            <div style="font-size: .67rem; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                                <span><strong id="cad-weekly-pending" style="color: #10b981;">0</strong> Pending</span>
                                <span>Port Audits & Logistics</span>
                            </div>
                        </div>

                        <div class="cadence-agg-card" id="card-cadence-monthly" data-cadence="Monthly" title="Click to filter by Monthly Cadence (Trade Flow Cycle)">
                            <div class="cadence-agg-header">
                                <span class="cadence-agg-title"><i class="fas fa-calendar-alt" style="color: #a78bfa;"></i> Monthly Cadence (Aggregate)</span>
                                <span class="badge" id="cad-monthly-pct" style="background: rgba(16,185,129,0.15); color: #10b981; font-weight: 700; font-size: .68rem; padding: 1px 6px;">100%</span>
                            </div>
                            <div class="cadence-agg-val"><span id="cad-monthly-count">43</span> <span style="font-size: .78rem; font-weight: 500; color: var(--text-muted);">/ <span id="cad-monthly-total">43</span> Updated</span></div>
                            <div class="cadence-progress-bar"><div class="cadence-progress-fill" id="cad-monthly-bar" style="width: 100%; background: #a78bfa;"></div></div>
                            <div style="font-size: .67rem; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                                <span><strong id="cad-monthly-pending" style="color: #10b981;">0</strong> Pending</span>
                                <span>Cycle 15th–20th Active</span>
                            </div>
                        </div>
                    </div>

                    <!-- Crishi 3-Way Mode Switcher: Table Basis, Commodity Basis, Date-Wise View -->
                    <div class="crishi-view-mode-bar">
                        <div class="crishi-subtabs">
                            <button class="crishi-subtab-btn ${this.surveillanceViewMode === 'table' ? 'active' : ''}" id="btn-mode-table">
                                <i class="fas fa-table"></i> Table Basis Update
                            </button>
                            <button class="crishi-subtab-btn ${this.surveillanceViewMode === 'commodity' ? 'active' : ''}" id="btn-mode-commodity">
                                <i class="fas fa-cubes"></i> Commodity Basis Update
                            </button>
                            <button class="crishi-subtab-btn ${this.surveillanceViewMode === 'date' ? 'active' : ''}" id="btn-mode-date">
                                <i class="fas fa-calendar-day"></i> Date-Wise View
                            </button>
                        </div>
                        <div style="font-size: .78rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                            <span id="surveillance-view-label"><i class="fas fa-info-circle"></i> Granular table-by-table surveillance with Today Status verification</span>
                        </div>
                    </div>

                    <!-- Panel 1: Table Basis Update View -->
                    <div id="surveillance-table-panel" class="${this.surveillanceViewMode === 'table' ? '' : 'hidden'}">
                        <!-- Teammate Workload Quick Filter Bar -->
                        <div style="background: var(--bg-card); padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="font-size: .74rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                                    <i class="fas fa-users" style="margin-right: 4px;"></i> Teammate Portfolios (Click to Filter Workload)
                                </span>
                                <span style="font-size: .72rem; color: #60a5fa; font-weight: 600;" id="user-workload-hint">
                                    Showing tasks for all teammates
                                </span>
                            </div>
                            <div class="teammate-workload-row" id="teammate-chips-container">
                                <!-- Populated dynamically with authentic users -->
                            </div>
                        </div>

                        <!-- Filters & Search Row -->
                        <div class="crishi-filter-row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 200px;">
                                <div class="input-group" style="margin-bottom: 0;">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="crishi-search" placeholder="Search table name, commodity, business title, or remark...">
                                </div>
                            </div>

                            <!-- Assignee Filter Dropdown -->
                            <div style="width: 150px;">
                                <select id="filter-assignee" style="width: 100%;">
                                    <option value="">All Assignees</option>
                                    <option value="Nishant">Nishant</option>
                                    <option value="Bhawna">Bhawna</option>
                                    <option value="Gopi">Gopi</option>
                                    <option value="Pankaj">Pankaj</option>
                                    <option value="Nitesh">Nitesh</option>
                                </select>
                            </div>

                            <!-- Pipeline Source Filter Dropdown (Hidden per user request) -->
                            <div style="display: none; width: 175px;" id="pipeline-filter-container">
                                <select id="filter-pipeline" style="width: 100%;">
                                    <option value="">All Pipelines</option>
                                    <option value="SOPA">SOPA (Soybeans)</option>
                                    <option value="IPGA">IPGA (Pulses)</option>
                                    <option value="PyExcel">Crishi (PyExcel)</option>
                                    <option value="PyStage">Crishi (Stage Direct)</option>
                                    <option value="Other">Other Pipelines</option>
                                </select>
                            </div>

                            <!-- Harmonized Commodity Dropdown -->
                            <div style="width: 175px;">
                                <select id="filter-commodity" style="width: 100%;">
                                    <option value="">All Commodities</option>
                                    <optgroup label="Pulses (Individual)">
                                        <option value="Bengal Gram">Bengal Gram</option>
                                        <option value="Tur">Tur</option>
                                        <option value="Urad">Urad</option>
                                        <option value="Moong">Moong</option>
                                        <option value="Masoor">Masoor</option>
                                        <option value="Pea">Pea</option>
                                        <option value="Pulses">All Pulses</option>
                                    </optgroup>
                                    <optgroup label="Other Commodities">
                                        <option value="Bajra">Bajra</option>
                                        <option value="Barley">Barley</option>
                                        <option value="Chilli">Chilli</option>
                                        <option value="Coriander">Coriander</option>
                                        <option value="Cotton">Cotton</option>
                                        <option value="Cumin">Cumin</option>
                                        <option value="Macro / All">Macro / All</option>
                                        <option value="Maize">Maize</option>
                                        <option value="Rapeseed">Rapeseed</option>
                                        <option value="Rice">Rice</option>
                                        <option value="Soybeans">Soybeans</option>
                                        <option value="Sugar">Sugar</option>
                                        <option value="Tops">Tops</option>
                                        <option value="Turmeric">Turmeric</option>
                                        <option value="Weather">Weather</option>
                                        <option value="Wheat">Wheat</option>
                                    </optgroup>
                                </select>
                            </div>

                            <!-- Cadence Frequency Dropdown -->
                            <div style="width: 130px;">
                                <select id="filter-frequency" style="width: 100%;">
                                    <option value="">All Cadences</option>
                                    <option value="Daily">Daily</option>
                                    <option value="Weekly">Weekly</option>
                                    <option value="Monthly">Monthly</option>
                                    <option value="Yearly">Yearly</option>
                                </select>
                            </div>

                            <!-- Today Status Filter Dropdown -->
                            <div style="width: 145px;">
                                <select id="filter-today-status" style="width: 100%;">
                                    <option value="">Today Status: All</option>
                                    <option value="DONE">Updated / Done</option>
                                    <option value="REVISION">Revision / Need Corr</option>
                                    <option value="LATE">Overdue Today</option>
                                    <option value="PENDING">Due Today</option>
                                    <option value="WINDOW">15th–20th Cycle</option>
                                </select>
                            </div>

                            <!-- Sort Filter Dropdown -->
                            <div style="width: 165px;">
                                <select id="filter-sort" style="width: 100%;">
                                    <option value="title_asc">Sort: Title (A-Z)</option>
                                    <option value="title_desc">Sort: Title (Z-A)</option>
                                    <option value="assignee_asc">Sort: Assignee (A-Z)</option>
                                    <option value="assignee_desc">Sort: Assignee (Z-A)</option>
                                    <option value="commodity_asc">Sort: Commodity (A-Z)</option>
                                    <option value="commodity_desc">Sort: Commodity (Z-A)</option>
                                    <option value="raw_asc">Sort: Raw Table (A-Z)</option>
                                    <option value="raw_desc">Sort: Raw Table (Z-A)</option>
                                    <option value="cadence_asc">Sort: Cadence (Daily first)</option>
                                    <option value="cadence_desc">Sort: Cadence (Monthly first)</option>
                                    <option value="last_date_desc">Sort: Date (Newest)</option>
                                    <option value="last_date_asc">Sort: Date (Oldest)</option>
                                    <option value="today_status_asc">Sort: Today Status</option>
                                    <option value="status_asc">Sort: Overall Status</option>
                                </select>
                            </div>

                            <!-- Status Quick Pills -->
                            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                                <button class="btn btn-sm btn-outline active-filter-status" id="btn-status-all" data-status="ALL">All (114)</button>
                                <button class="btn btn-sm btn-outline" data-status="PASS" style="color: #10b981;" title="What has been updated till now in the DB">
                                    <i class="fas fa-check-circle"></i> Updated
                                </button>
                                <button class="btn btn-sm btn-outline" data-status="NEED_CORRECTION" style="color: #f59e0b;" title="Marked as needing correction by manager">
                                    <i class="fas fa-tools"></i> Need Correction
                                </button>
                                <button class="btn btn-sm btn-outline" data-status="NOT_CORRECT" style="color: #ef4444;" title="Marked as not correct / discrepancy">
                                    <i class="fas fa-times-circle"></i> Not Correct
                                </button>
                                <button class="btn btn-sm btn-outline" data-status="FAIL" style="color: #f87171;" title="Late tasks missing update in DB">
                                    <i class="fas fa-exclamation-circle"></i> Late
                                </button>
                                <button class="btn btn-sm btn-outline" data-status="WINDOW" style="color: #0ea5e9;" title="Monthly Trade Flow 15th-20th cycle">
                                    <i class="fas fa-calendar-alt"></i> 15th–20th Cycle
                                </button>
                                <button class="btn btn-sm btn-outline" data-status="REMARK" style="color: #8b5cf6;" title="Tasks with remarks">
                                    <i class="fas fa-comment-dots"></i> Remarks
                                </button>
                            </div>
                        </div>

                        <!-- Surveillance Grid Table Card -->
                        <div class="crishi-table-card" style="margin-top: 14px;">
                            <div style="padding: 10px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                                <span id="crishi-table-count" style="font-size: .82rem; color: var(--text-muted); font-weight: 600;">
                                    Loading monitored tables...
                                </span>
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <span style="font-size: .75rem; color: #10b981;"><i class="fas fa-circle" style="font-size: .5rem;"></i> Live Auto-Surveillance Active</span>
                                </div>
                            </div>

                            <div class="crishi-table-responsive">
                                <table class="crishi-table" id="crishi-master-table">
                                    <thead>
                                        <tr>
                                            <th class="col-assignee crishi-sortable-th" data-col="assignee" title="Click to sort by Assignee">
                                                <span>Assignee</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-commodity crishi-sortable-th" data-col="commodity" title="Click to sort by Commodity">
                                                <span>Commodity</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-raw-table crishi-sortable-th" data-col="raw" title="Click to sort by Raw Table Name">
                                                <span>Raw Table Name</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-title crishi-sortable-th" data-col="title" title="Click to sort by Business Title">
                                                <span>Final Business Title</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-cadence crishi-sortable-th" data-col="cadence" title="Click to sort by Cadence">
                                                <span>Cadence</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-last-date crishi-sortable-th" data-col="last_date" title="Click to sort by Last Date in DB">
                                                <span>Last Date in DB</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-today-status crishi-sortable-th" data-col="today_status" title="Click to sort by Today Status">
                                                <span>Today Status</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-status crishi-sortable-th" data-col="status" title="Click to sort by Overall Status">
                                                <span>Status</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                            </th>
                                            <th class="col-remarks">Remarks & Manager Review</th>
                                            <th class="col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="crishi-tbody">
                                        <!-- Rendered dynamically -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Panel 2: Commodity Basis Update (14 Commodities Rollup & Roster) -->
                    <div id="surveillance-commodity-panel" class="${this.surveillanceViewMode === 'commodity' ? '' : 'hidden'}">
                        <div id="commodity-grid-container" class="commodity-grid">
                            <!-- Rendered dynamically -->
                        </div>
                    </div>

                    <!-- Panel 3: Date-Wise View -->
                    <div id="surveillance-date-panel" class="${this.surveillanceViewMode === 'date' ? '' : 'hidden'}">
                        <div id="date-view-container" class="date-view-container">
                            <!-- Rendered dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Tab 2: Weekly Roster & Rake Movement Rotation -->
                <div id="view-roster" class="${this.activeTab === 'roster' ? '' : 'hidden'}">
                    <div class="card glass-card" style="padding: 24px;">
                        <!-- Top Header & Actions -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
                            <div>
                                <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 10px; margin: 0; flex-wrap: wrap;">
                                    <i class="fas fa-calendar-alt" style="color: #60a5fa;"></i>
                                    <span>Operational Duty Roster Plan</span>
                                    <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .75rem; border: 1px solid rgba(16, 185, 129, 0.3);">
                                        <i class="fas fa-check-double" style="margin-right: 4px;"></i> Latin Square Constraint Engine
                                    </span>
                                    <span class="badge" id="badge-scrapper-active-week" style="background: rgba(96, 165, 250, 0.2); color: #60a5fa; font-size: .75rem; font-weight: 700;">
                                        <i class="fas fa-calendar-check" style="margin-right: 4px;"></i> Active: Week 1 · October 2026
                                    </span>
                                </h3>
                                <p style="color: var(--text-secondary); font-size: .84rem; margin: 5px 0 0;">
                                    Every active duty assigned 1 person per week. Max 1 duty per person per week. Zero repeated duties across the entire roster.
                                </p>
                            </div>

                            <!-- Action Toolbar -->
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                                ${isAdmin ? `
                                <button class="btn btn-primary btn-sm" id="btn-random-assign-duties" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); border: none; font-weight: 700; box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35); padding: 5px 12px;" title="Solve & generate complete conflict-free schedule using backtracking constraint algorithm">
                                    <i class="fas fa-dice"></i> Randomly Assign Duties
                                </button>
                                <button class="btn btn-outline btn-sm" id="btn-add-roster-duty" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4);" title="Add a new duty row">
                                    <i class="fas fa-plus-circle"></i> Add Duty
                                </button>
                                <button class="btn btn-outline btn-sm" id="btn-manage-roster-people" style="color: #a855f7; border-color: rgba(168, 85, 247, 0.4);" title="Add, edit, or remove teammates">
                                    <i class="fas fa-users-cog"></i> Manage People
                                </button>
                                <div style="display: inline-flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--border);">
                                    <button class="btn btn-ghost btn-sm" id="btn-add-roster-week" style="font-size: .74rem; padding: 4px 8px;" title="Add a week dynamically">
                                        <i class="fas fa-plus"></i> Wk
                                    </button>
                                    <button class="btn btn-ghost btn-sm" id="btn-remove-roster-week" style="font-size: .74rem; padding: 4px 8px;" title="Remove a week dynamically">
                                        <i class="fas fa-minus"></i> Wk
                                    </button>
                                </div>
                                ` : ''}
                                <div style="display: flex; background: rgba(255,255,255,0.05); padding: 3px; border-radius: 8px; border: 1px solid var(--border);" id="scrapper-week-pills">
                                    <!-- Rendered dynamically -->
                                </div>
                                <button class="btn btn-outline btn-sm" id="btn-monthly-roster-view" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);" title="View rolling monthly view continuing seamlessly into next month 1st week">
                                    <i class="fas fa-calendar-alt"></i> Monthly View
                                </button>
                                ${isAdmin ? `
                                <button class="btn btn-outline btn-sm" id="btn-save-roster-direct" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4);" title="Save current matrix & structure">
                                    <i class="fas fa-save"></i> Save
                                </button>
                                <button class="btn btn-primary btn-sm" id="btn-apply-scrapper-week" title="Sync live duties in RosterConfig to the selected week">
                                    <i class="fas fa-sync-alt"></i> Apply Week
                                </button>
                                ` : ''}
                            </div>
                        </div>

                        <!-- 1. Operational Roster Table Card -->
                        <div class="card glass-card" style="margin-bottom: 22px; padding: 18px 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(96, 165, 250, 0.15); color: #60a5fa; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                                        <i class="fas fa-table"></i>
                                    </div>
                                    <div>
                                        <h4 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                            <span id="roster-table-heading">Weekly Operational Duty Matrix</span>
                                            <span class="badge" id="roster-duties-count-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .72rem;">5 Duties × 5 Weeks</span>
                                        </h4>
                                        <p style="margin: 2px 0 0; font-size: .78rem; color: var(--text-secondary);">
                                            Duties as rows, Weeks as columns. Click any cell to manually edit assignments with live constraint validation.
                                        </p>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <span style="font-size: .75rem; color: var(--text-muted);">
                                        <i class="fas fa-mouse-pointer" style="margin-right: 4px;"></i> Click any cell to reassign
                                    </span>
                                </div>
                            </div>

                            <!-- Validation / Success Banner -->
                            <div id="roster-alert-container" style="display: none; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: .83rem;"></div>

                            <div style="overflow-x: auto;">
                                <table class="crishi-table" id="scrapper-matrix-table" style="text-align: center;">
                                    <thead id="scrapper-matrix-thead">
                                        <!-- Rendered dynamically -->
                                    </thead>
                                    <tbody id="scrapper-matrix-tbody">
                                        <!-- Rendered dynamically -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- 2. Tuesday Rake Movement & Monthly Rotation Dual Card Layout -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 20px; margin-bottom: 22px;">
                            <!-- Tuesday RakeMovement Zones (Clean Arranged Compact Table) -->
                            <div class="card glass-card" style="padding: 18px 20px; background: rgba(59, 130, 246, 0.03); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 10px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(59, 130, 246, 0.18); color: #60a5fa; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                                            <i class="fas fa-train"></i>
                                        </div>
                                        <div>
                                            <h4 style="margin: 0; font-size: .98rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                                <span>Every Tuesday Update — RakeMovement</span>
                                                <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: .72rem; padding: 2px 8px;">
                                                    Railway Zones
                                                </span>
                                            </h4>
                                            <p style="margin: 2px 0 0; font-size: .77rem; color: var(--text-secondary);">
                                                Designated Indian Railway zone assignments per teammate for freight & rake movement.
                                            </p>
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 6px;">
                                        <button class="btn btn-outline btn-sm" id="btn-set-all-rake-date" style="font-size: .74rem; padding: 3px 9px; color: #60a5fa; border-color: rgba(96,165,250,0.35);" title="Set Tuesday due date in UI">
                                            <i class="fas fa-calendar-day"></i> Set Due Date
                                        </button>
                                        <button class="btn btn-outline btn-sm" id="btn-add-rake-zone" style="font-size: .74rem; padding: 3px 9px; color: #60a5fa; border-color: rgba(96,165,250,0.35);">
                                            <i class="fas fa-plus"></i> Add Person
                                        </button>
                                    </div>
                                </div>

                                <div style="overflow-x: auto;">
                                    <table class="roster-compact-table" id="rake-movement-table">
                                        <thead>
                                            <tr>
                                                <th style="width: 110px;">Person</th>
                                                <th>Assigned Railway Zones</th>
                                                <th style="width: 140px; text-align: center;">Day & Due Date</th>
                                                <th style="width: 130px; text-align: center;">Last Updated in DB</th>
                                                <th style="width: 70px; text-align: right;">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody id="rake-movement-tbody">
                                            <!-- Rendered dynamically -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Monthly Rotation Rules (With Assigned Person & Concrete Due Dates) -->
                            <div class="card glass-card" style="padding: 18px 20px; background: rgba(168, 85, 247, 0.03); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 10px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(168, 85, 247, 0.18); color: #c084fc; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                                            <i class="fas fa-calendar-check"></i>
                                        </div>
                                        <div>
                                            <h4 style="margin: 0; font-size: .98rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                                <span>Every Month Macro Duties:</span>
                                                <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; font-size: .72rem; padding: 2px 8px;">
                                                    Macro & AW
                                                </span>
                                            </h4>
                                            <p style="margin: 2px 0 0; font-size: .77rem; color: var(--text-secondary);">
                                                Monthly rotation duties, designated assignees, and target due dates.
                                            </p>
                                        </div>
                                    </div>
                                    <button class="btn btn-outline btn-sm" id="btn-edit-monthly-duties" style="font-size: .74rem; padding: 3px 9px; color: #c084fc; border-color: rgba(168,85,247,0.35);">
                                        <i class="fas fa-edit"></i> Edit Duties
                                    </button>
                                </div>

                                <div id="monthly-duties-container" style="display: flex; flex-direction: column; gap: 10px; margin-top: 14px;">
                                    <!-- Rendered dynamically -->
                                </div>
                            </div>
                        </div>

                        <!-- 3. Interactive Weather Weekly Teammate Selector Card (Shared Pankaj & Bhawna) -->
                        <div class="card glass-card" style="padding: 18px 20px; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(34, 197, 94, 0.18); color: #22c55e; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                                        <i class="fas fa-cloud-sun-rain"></i>
                                    </div>
                                    <div>
                                        <h4 style="margin: 0; font-size: 1.02rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                                            <span>Weather Daily Duty — Weekly Teammate Assignment</span>
                                            <span class="badge" id="badge-weather-current" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; font-size: .75rem; font-weight: 700; padding: 3px 10px; border-radius: 20px;">
                                                Active This Week: Pankaj
                                            </span>
                                        </h4>
                                        <p style="margin: 2px 0 0; font-size: .79rem; color: var(--text-secondary);">
                                            Shared surveillance between Pankaj & Bhawna. Selections update the live surveillance and duty assignment.
                                        </p>
                                    </div>
                                </div>

                                <!-- Quick Presets -->
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    <button class="btn btn-outline btn-sm btn-weather-preset" data-preset="alt_pankaj" title="Odd weeks: Pankaj, Even weeks: Bhawna" style="font-size: .74rem; padding: 4px 10px;">
                                        <i class="fas fa-sync-alt" style="color: #22c55e;"></i> Alt: Pankaj / Bhawna
                                    </button>
                                    <button class="btn btn-outline btn-sm btn-weather-preset" data-preset="alt_bhawna" title="Odd weeks: Bhawna, Even weeks: Pankaj" style="font-size: .74rem; padding: 4px 10px;">
                                        <i class="fas fa-sync-alt" style="color: #38bdf8;"></i> Alt: Bhawna / Pankaj
                                    </button>
                                    <button class="btn btn-outline btn-sm btn-weather-preset" data-preset="all_pankaj" style="font-size: .74rem; padding: 4px 10px;">
                                        <i class="fas fa-user"></i> All Pankaj
                                    </button>
                                    <button class="btn btn-outline btn-sm btn-weather-preset" data-preset="all_bhawna" style="font-size: .74rem; padding: 4px 10px;">
                                        <i class="fas fa-user"></i> All Bhawna
                                    </button>
                                </div>
                            </div>

                            <!-- 8 Weeks Interactive Selector Grid -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(115px, 1fr)); gap: 8px;" id="weather-weeks-grid">
                                ${[1, 2, 3, 4, 5, 6, 7, 8].map(w => `
                                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; text-align: center;">
                                        <div style="font-size: .7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 5px;">
                                            Week ${w} ${w === 1 ? '<span style="color:#10b981;">(Cur)</span>' : ''}
                                        </div>
                                        <select class="weather-week-select" data-week="${w}" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 4px 6px; border-radius: 6px; color: var(--text-primary); font-size: .78rem; font-weight: 700;">
                                            <option value="Pankaj" ${w % 2 !== 0 ? 'selected' : ''}>Pankaj</option>
                                            <option value="Bhawna" ${w % 2 === 0 ? 'selected' : ''}>Bhawna</option>
                                            <option value="Pankaj & Bhawna">Both</option>
                                        </select>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 4. Roster Activity & Audit Trail Logs (Saved to DB) -->
                        <div class="card glass-card" style="margin-top: 22px; padding: 18px 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                                        <i class="fas fa-history"></i>
                                    </div>
                                    <div>
                                        <h4 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                            <span>Roster Audit Trail & Activity Logs</span>
                                            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .72rem;">Saved to DB</span>
                                        </h4>
                                        <p style="margin: 2px 0 0; font-size: .78rem; color: var(--text-secondary);">
                                            Persistent record of roster plan synchronization, weekly assignments, and status updates.
                                        </p>
                                    </div>
                                </div>
                                <button class="btn btn-outline btn-sm" id="btn-refresh-roster-logs" style="font-size: .74rem;">
                                    <i class="fas fa-sync-alt"></i> Refresh Logs
                                </button>
                            </div>

                            <div style="overflow-x: auto;">
                                <table class="roster-compact-table" style="font-size: .78rem;">
                                    <thead>
                                        <tr>
                                            <th style="width: 140px;">Timestamp</th>
                                            <th style="width: 180px;">Event / Role</th>
                                            <th style="width: 130px;">Assignee / Actor</th>
                                            <th style="width: 100px;">Type</th>
                                            <th style="width: 120px;">Status</th>
                                            <th>Details / Audit Info</th>
                                        </tr>
                                    </thead>
                                    <tbody id="roster-logs-tbody">
                                        <tr>
                                            <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
                                                <i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Loading roster audit trail...
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab 3: Dedicated Update History Timeline -->
                <div id="view-history" class="${this.activeTab === 'history' ? '' : 'hidden'}">
                    <div class="card glass-card" style="margin-bottom: 20px; padding: 18px 20px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255,255,255,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
                            <div>
                                <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-history" style="color: var(--accent);"></i>
                                    <span>Database Update History</span>
                                </h3>
                                <p style="color: var(--text-muted); font-size: .8rem; margin: 3px 0 0 0;">
                                    Authoritative append-only audit log of table synchronizations and verified MySQL update timestamps.
                                </p>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button class="btn btn-outline btn-sm" id="btn-refresh-history" title="Refresh Update History">
                                    <i class="fas fa-sync-alt"></i> Refresh
                                </button>
                            </div>
                        </div>

                        <!-- Teammate Portfolio Chips Container -->
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: .75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; letter-spacing: 0.5px;">
                                Teammate Portfolios
                            </div>
                            <div class="user-chips-row" id="history-teammate-chips-container" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
                        </div>

                        <!-- Filter Controls Bar -->
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 12px; background: rgba(0,0,0,0.15); border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">
                            <div style="position: relative; min-width: 200px; flex: 1;">
                                <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: .8rem;"></i>
                                <input type="text" id="history-search" class="form-control form-control-sm" placeholder="Search table, final name, remarks..." style="padding-left: 30px; font-size: .82rem; width: 100%;">
                            </div>
                            <select id="history-filter-commodity" class="form-control form-control-sm" style="width: auto; min-width: 150px; font-size: .82rem;">
                                <option value="">All Commodities</option>
                                <optgroup label="Pulses">
                                    <option value="Pulses">All Pulses</option>
                                    <option value="Bengal Gram">Bengal Gram (Chana / Chickpea)</option>
                                    <option value="Tur">Tur (Arhar / Pigeon Pea)</option>
                                    <option value="Urad">Urad (Black Matpe)</option>
                                    <option value="Moong">Moong (Green Gram)</option>
                                    <option value="Masoor">Masoor (Lentil)</option>
                                    <option value="Pea">Pea</option>
                                </optgroup>
                                <optgroup label="Oilseeds">
                                    <option value="Rapeseed">Rapeseed / Mustard</option>
                                    <option value="Soybeans">Soybeans</option>
                                </optgroup>
                                <optgroup label="Grains & Cereals">
                                    <option value="Bajra">Bajra</option>
                                    <option value="Barley">Barley</option>
                                    <option value="Maize">Maize / Corn</option>
                                    <option value="Rice">Rice</option>
                                    <option value="Wheat">Wheat</option>
                                </optgroup>
                                <optgroup label="Spices">
                                    <option value="Chilli">Chilli</option>
                                    <option value="Coriander">Coriander (Dhaniya)</option>
                                    <option value="Cumin">Cumin (Jeera)</option>
                                    <option value="Turmeric">Turmeric</option>
                                </optgroup>
                                <optgroup label="Vegetables, Weather & Other">
                                    <option value="Cotton">Cotton</option>
                                    <option value="Sugar">Sugar</option>
                                    <option value="Tops">Tops (Tomato, Potato, Onion)</option>
                                    <option value="Macro / All">Macro / All</option>
                                    <option value="Weather">Weather / GIS</option>
                                </optgroup>
                            </select>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: .78rem; color: var(--text-muted);">From:</span>
                                <input type="date" id="history-filter-date-from" class="form-control form-control-sm" style="width: auto; font-size: .82rem;">
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: .78rem; color: var(--text-muted);">To:</span>
                                <input type="date" id="history-filter-date-to" class="form-control form-control-sm" style="width: auto; font-size: .82rem;">
                            </div>
                            <select id="history-filter-status" class="form-control form-control-sm" style="width: auto; min-width: 120px; font-size: .82rem;">
                                <option value="">All Statuses</option>
                                <option value="Verified">Verified</option>
                                <option value="Pending">Pending</option>
                            </select>
                            <button class="btn btn-ghost btn-sm" id="btn-clear-history-filters" title="Reset Filters" style="font-size: .8rem;">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span id="history-records-count" style="font-size: .82rem; color: var(--text-muted);">Loading history records...</span>
                        </div>

                        <!-- History Master Table with Interactive Column Sort Buttons -->
                        <div class="table-responsive" style="max-height: 600px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                            <table class="crishi-table" id="history-master-table" style="width: 100%; border-collapse: collapse; font-size: .82rem;">
                                <thead>
                                    <tr style="background: rgba(255,255,255,0.04); position: sticky; top: 0; z-index: 2;">
                                        <th class="history-sort-th" data-sort="id" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="id" title="Click to sort by ID" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>ID</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="report_date" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="report_date" title="Click to sort by Report Date" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Report Date</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="commodity" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="commodity" title="Click to sort by Commodity" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Commodity</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="table_name" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="table_name" title="Click to sort by Table Name" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Table Name</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="final_name" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="final_name" title="Click to sort by Final Name" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Final Name</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="person_name" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="person_name" title="Click to sort by Updated By" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Updated By</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="db_update_timestamp" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="db_update_timestamp" title="Click to sort by DB Update Timestamp" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>DB Update Timestamp</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="row_count" style="padding: 8px 10px; text-align: right; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="row_count" title="Click to sort by Row Count" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Row Count</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="status" style="padding: 8px 10px; text-align: center; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="status" title="Click to sort by Status" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Status</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                        <th class="history-sort-th" data-sort="remarks" style="padding: 8px 10px; text-align: left; cursor: pointer; user-select: none;">
                                            <button type="button" class="btn btn-sm history-th-btn" data-sort="remarks" title="Click to sort by Remarks" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 8px; color: var(--text-main, #f1f5f9); font-size: .78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all .15s ease;">
                                                <span>Remarks</span> <i class="fas fa-sort" style="font-size: .72rem; opacity: 0.6;"></i>
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="history-tbody">
                                    <tr>
                                        <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                            <i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Loading history records...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.bindEvents();
        this.getActiveUsers().catch(() => {});
        await this.loadGrid();
        this.loadWeatherRotation();
        this.loadScrapperMatrix();
    },

    async loadGrid(force = false) {
        try {
            const dateParam = this.selectedSurveillanceDate ? `&date=${this.selectedSurveillanceDate}` : '';
            const res = await api.get(`/crishi/grid?refresh=${force}${dateParam}`);
            if (res && res.success && res.tasks) {
                this.tasks = res.tasks;
                this.summary = res.summary || {};
                this.commodityRollups = res.commodity_rollups || [];
                this.dateSummary = res.date_summary || {};
                this.filteredTasks = [...this.tasks];
                this.updateKpiCards();
                this.renderTeammateChips();
                this.applyFilters();
                this.renderCommodityView();
                this.renderDateWiseView();
            }
        } catch (e) {
            console.error('Error fetching surveillance grid:', e);
            window.App.showToast('Failed to load surveillance grid from MySQL', 'error');
        }
    },

    async loadUpdateHistory() {
        const tbody = document.getElementById('history-tbody');
        const countSpan = document.getElementById('history-records-count');
        if (!tbody) return;

        try {
            const role = window.currentUser?.role;
            const isAdmin = ['SuperAdmin', 'Manager', 'Leader', 'Admin'].includes(role);

            const params = new URLSearchParams();
            if (isAdmin) {
                if (this.activeUserFilter && this.activeUserFilter !== 'ALL') {
                    params.append('teammate', this.activeUserFilter);
                }
            } else {
                params.append('teammate', window.currentUser?.name || '');
            }

            const searchVal = document.getElementById('history-search')?.value?.trim();
            if (searchVal) params.append('search', searchVal);

            const commVal = document.getElementById('history-filter-commodity')?.value?.trim();
            if (commVal) params.append('commodity', commVal);

            const dfVal = document.getElementById('history-filter-date-from')?.value?.trim();
            if (dfVal) params.append('date_from', dfVal);

            const dtVal = document.getElementById('history-filter-date-to')?.value?.trim();
            if (dtVal) params.append('date_to', dtVal);

            const statusVal = document.getElementById('history-filter-status')?.value?.trim();
            if (statusVal) params.append('status', statusVal);

            params.append('limit', '100');

            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        <i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Loading history records...
                    </td>
                </tr>
            `;

            const res = await api.get(`/crishi/update-history?${params.toString()}`);
            if (res && res.success) {
                const records = res.history || res.records || [];
                const total = res.total ?? records.length;
                if (countSpan) {
                    countSpan.innerHTML = `Showing <strong>${records.length}</strong> of <strong>${total}</strong> history records`;
                }

                this.historyRecords = records;
                this.sortHistoryRecords(this.historySortCol, false);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 24px; color: #ef4444;">
                            Failed to load update history
                        </td>
                    </tr>
                `;
            }
        } catch (e) {
            console.error('Error fetching update history:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 24px; color: #ef4444;">
                        Error connecting to update history endpoint
                    </td>
                </tr>
            `;
        }
    },

    renderHistoryRows() {
        const tbody = document.getElementById('history-tbody');
        if (!tbody) return;
        const records = this.historyRecords || [];
        if (records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 36px; color: var(--text-muted);">
                        <i class="fas fa-inbox" style="font-size: 1.8rem; margin-bottom: 8px; display: block; opacity: 0.3;"></i>
                        No update history records found matching criteria
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = records.map(r => {
            const statusCls = (r.status === 'Verified' || r.status === 'Pass') ? 'background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);' : 'background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);';
            const ts = r.db_update_timestamp || r.dbUpdateTimestamp || '';
            const dispTs = ts ? ts.replace('T', ' ').substring(0, 19) : '--';
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 9px 12px; font-weight: 700; color: var(--text-muted);">#${r.id}</td>
                    <td style="padding: 9px 12px; font-weight: 600;">${r.report_date || r.reportDate || '--'}</td>
                    <td style="padding: 9px 12px;"><span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: .74rem;">${r.commodity || 'General'}</span></td>
                    <td style="padding: 9px 12px; font-family: monospace; font-size: .78rem; color: #94a3b8;">${r.table_name || r.tableName || '--'}</td>
                    <td style="padding: 9px 12px; font-weight: 600;">${r.final_name || r.finalName || '--'}</td>
                    <td style="padding: 9px 12px; font-weight: 700; color: #38bdf8;">${r.person_name || r.personName || '--'}</td>
                    <td style="padding: 9px 12px; font-family: monospace; font-size: .78rem;">${dispTs}</td>
                    <td style="padding: 9px 12px; text-align: right; font-weight: 700;">${Number(r.row_count || r.rowCount || 0).toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">
                        <span class="badge" style="${statusCls} font-size: .72rem; padding: 2px 8px; border-radius: 12px;">${r.status || 'Verified'}</span>
                    </td>
                    <td style="padding: 9px 12px; color: var(--text-muted); font-size: .78rem;">${r.remarks || ''}</td>
                </tr>
            `;
        }).join('');
    },

    sortHistoryRecords(col, toggleDir = true) {
        if (!this.historyRecords || !this.historyRecords.length) {
            this.renderHistoryRows();
            return;
        }

        if (toggleDir) {
            if (this.historySortCol === col) {
                this.historySortDir = (this.historySortDir === 'asc') ? 'desc' : 'asc';
            } else {
                this.historySortCol = col;
                this.historySortDir = (col === 'id' || col === 'report_date' || col === 'db_update_timestamp' || col === 'row_count') ? 'desc' : 'asc';
            }
        }

        const dir = (this.historySortDir === 'asc') ? 1 : -1;
        this.historyRecords.sort((a, b) => {
            let valA, valB;
            switch (col) {
                case 'id':
                    return (Number(a.id || 0) - Number(b.id || 0)) * dir;
                case 'report_date':
                    valA = String(a.report_date || a.reportDate || '');
                    valB = String(b.report_date || b.reportDate || '');
                    return valA.localeCompare(valB) * dir;
                case 'commodity':
                    valA = String(a.commodity || '');
                    valB = String(b.commodity || '');
                    return valA.localeCompare(valB) * dir;
                case 'table_name':
                    valA = String(a.table_name || a.tableName || '');
                    valB = String(b.table_name || b.tableName || '');
                    return valA.localeCompare(valB) * dir;
                case 'final_name':
                    valA = String(a.final_name || a.finalName || '');
                    valB = String(b.final_name || b.finalName || '');
                    return valA.localeCompare(valB) * dir;
                case 'person_name':
                    valA = String(a.person_name || a.personName || '');
                    valB = String(b.person_name || b.personName || '');
                    return valA.localeCompare(valB) * dir;
                case 'db_update_timestamp':
                    valA = String(a.db_update_timestamp || a.dbUpdateTimestamp || '');
                    valB = String(b.db_update_timestamp || b.dbUpdateTimestamp || '');
                    return valA.localeCompare(valB) * dir;
                case 'row_count':
                    return (Number(a.row_count || a.rowCount || 0) - Number(b.row_count || b.rowCount || 0)) * dir;
                case 'status':
                    valA = String(a.status || '');
                    valB = String(b.status || '');
                    return valA.localeCompare(valB) * dir;
                case 'remarks':
                    valA = String(a.remarks || '');
                    valB = String(b.remarks || '');
                    return valA.localeCompare(valB) * dir;
                default:
                    return 0;
            }
        });

        this.renderHistoryRows();
        this.updateHistoryHeaderSortIcons();
    },

    updateHistoryHeaderSortIcons() {
        const curCol = this.historySortCol;
        const curDir = this.historySortDir;

        // Update table header buttons
        document.querySelectorAll('#history-master-table .history-th-btn').forEach(btn => {
            const col = btn.getAttribute('data-sort');
            const icon = btn.querySelector('i');
            if (col === curCol) {
                btn.style.background = 'rgba(56, 189, 248, 0.2)';
                btn.style.borderColor = '#38bdf8';
                btn.style.color = '#38bdf8';
                btn.style.boxShadow = '0 0 8px rgba(56, 189, 248, 0.25)';
                if (icon) {
                    icon.className = (curDir === 'asc') ? 'fas fa-sort-up' : 'fas fa-sort-down';
                    icon.style.opacity = '1';
                    icon.style.color = '#38bdf8';
                }
            } else {
                btn.style.background = 'rgba(255,255,255,0.06)';
                btn.style.borderColor = 'rgba(255,255,255,0.12)';
                btn.style.color = 'var(--text-main, #f1f5f9)';
                btn.style.boxShadow = 'none';
                if (icon) {
                    icon.className = 'fas fa-sort';
                    icon.style.opacity = '0.5';
                    icon.style.color = 'inherit';
                }
            }
        });
    },

    updateKpiCards() {
        const s = this.summary;
        if (!s) return;

        const totalCount = s.total_tasks || this.tasks.length;
        const elTotal = document.getElementById('kpi-total-tasks');
        const elUpdated = document.getElementById('kpi-updated-today');
        const elRate = document.getElementById('kpi-completion-rate');
        const elPending = document.getElementById('kpi-pending-action');
        const elWindows = document.getElementById('kpi-cycle-windows');
        const elNeedCorr = document.getElementById('kpi-need-correction');
        const elNeedCorrSub = document.getElementById('kpi-need-correction-sub');
        const elRemarks = document.getElementById('kpi-remarks-count');
        const badge = document.getElementById('crishi-db-badge');
        const btnAll = document.getElementById('btn-status-all');

        if (elTotal) elTotal.textContent = totalCount;
        if (elUpdated) elUpdated.textContent = s.updated_today || 0;
        if (elRate) elRate.textContent = `${s.completion_pct || 0}% Completed Till Now`;
        if (elPending) elPending.textContent = s.pending_action || 0;
        if (elWindows) elWindows.textContent = s.cycle_windows || 0;
        if (elNeedCorr) elNeedCorr.textContent = s.need_correction_count || 0;
        if (elNeedCorrSub) {
            elNeedCorrSub.textContent = s.not_correct_count ? `${s.not_correct_count} rejected / discrepancy` : 'Manager review action items';
        }
        if (elRemarks) elRemarks.textContent = s.remarks_count || 0;
        if (badge) badge.innerHTML = `<i class="fas fa-server"></i> agalabsdev_stage (${totalCount} Monitored Tables)`;
        if (btnAll) btnAll.textContent = `All (${totalCount})`;

        // Update Cadence Aggregate Breakdown (Daily, Weekly, Monthly)
        const cad = s.cadence_summary || {};
        if (cad.daily) {
            const elDailyCnt = document.getElementById('cad-daily-count');
            const elDailyTot = document.getElementById('cad-daily-total');
            const elDailyPct = document.getElementById('cad-daily-pct');
            const elDailyBar = document.getElementById('cad-daily-bar');
            const elDailyPend = document.getElementById('cad-daily-pending');
            if (elDailyCnt) elDailyCnt.textContent = cad.daily.updated || 0;
            if (elDailyTot) elDailyTot.textContent = cad.daily.total || 0;
            if (elDailyPct) elDailyPct.textContent = `${cad.daily.pct || 0}%`;
            if (elDailyBar) elDailyBar.style.width = `${cad.daily.pct || 0}%`;
            if (elDailyPend) {
                elDailyPend.textContent = cad.daily.pending || 0;
                elDailyPend.style.color = (cad.daily.pending > 0) ? '#ef4444' : '#10b981';
            }
        }
        if (cad.weekly) {
            const elWkCnt = document.getElementById('cad-weekly-count');
            const elWkTot = document.getElementById('cad-weekly-total');
            const elWkPct = document.getElementById('cad-weekly-pct');
            const elWkBar = document.getElementById('cad-weekly-bar');
            const elWkPend = document.getElementById('cad-weekly-pending');
            if (elWkCnt) elWkCnt.textContent = cad.weekly.updated || 0;
            if (elWkTot) elWkTot.textContent = cad.weekly.total || 0;
            if (elWkPct) elWkPct.textContent = `${cad.weekly.pct || 0}%`;
            if (elWkBar) elWkBar.style.width = `${cad.weekly.pct || 0}%`;
            if (elWkPend) {
                elWkPend.textContent = cad.weekly.pending || 0;
                elWkPend.style.color = (cad.weekly.pending > 0) ? '#ef4444' : '#10b981';
            }
        }
        if (cad.monthly) {
            const elMoCnt = document.getElementById('cad-monthly-count');
            const elMoTot = document.getElementById('cad-monthly-total');
            const elMoPct = document.getElementById('cad-monthly-pct');
            const elMoBar = document.getElementById('cad-monthly-bar');
            const elMoPend = document.getElementById('cad-monthly-pending');
            if (elMoCnt) elMoCnt.textContent = cad.monthly.updated || 0;
            if (elMoTot) elMoTot.textContent = cad.monthly.total || 0;
            if (elMoPct) elMoPct.textContent = `${cad.monthly.pct || 0}%`;
            if (elMoBar) elMoBar.style.width = `${cad.monthly.pct || 0}%`;
            if (elMoPend) {
                elMoPend.textContent = cad.monthly.pending || 0;
                elMoPend.style.color = (cad.monthly.pending > 0) ? '#ef4444' : '#10b981';
            }
        }
    },

    renderTeammateChips() {
        const containers = [
            document.getElementById('teammate-chips-container'),
            document.getElementById('date-teammate-chips-container'),
            document.getElementById('history-teammate-chips-container')
        ].filter(Boolean);
        if (containers.length === 0) return;

        const role = window.currentUser?.role;
        const isAdmin = ['SuperAdmin', 'Manager', 'Leader', 'Admin'].includes(role);
        const tm = this.summary.teammates || {};
        const priorityUsers = this.getActiveUsersSync();

        let html = '';
        if (isAdmin) {
            html += `
                <button class="user-chip-btn ${this.activeUserFilter === 'ALL' ? 'active' : ''}" data-user="ALL">
                    <span>All Teammates</span>
                    <span class="badge" style="background: rgba(255,255,255,0.15); font-size: .72rem;">${this.tasks.length}</span>
                </button>
            `;

            priorityUsers.forEach(u => {
                const st = tm[u];
                if (!st) return;
                const isActive = this.activeUserFilter === u;
                html += `
                    <button class="user-chip-btn ${isActive ? 'active' : ''}" data-user="${u}">
                        <span>${u}</span>
                        <span class="badge" style="background: ${isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}; font-size: .72rem;">
                            ${st.updated}/${st.total} (${st.pct}%)
                        </span>
                        ${st.windows > 0 ? `<span style="color: #0ea5e9; font-size: .7rem;" title="Has active 15th-20th cycle window"><i class="fas fa-calendar-alt"></i></span>` : ''}
                    </button>
                `;
            });
        } else {
            // Teammate user: strictly render ONLY their own chip!
            const myName = window.currentUser?.name || Object.keys(tm)[0] || 'Teammate';
            const st = tm[myName] || (Object.keys(tm).length > 0 ? tm[Object.keys(tm)[0]] : null);
            const displayName = st ? (tm[myName] ? myName : Object.keys(tm)[0]) : myName;
            this.activeUserFilter = displayName;
            html += `
                <button class="user-chip-btn active" data-user="${displayName}">
                    <span>${displayName}</span>
                    ${st ? `<span class="badge" style="background: rgba(255,255,255,0.25); font-size: .72rem;">${st.updated}/${st.total} (${st.pct}%)</span>` : ''}
                    ${st && st.windows > 0 ? `<span style="color: #0ea5e9; font-size: .7rem;" title="Has active 15th-20th cycle window"><i class="fas fa-calendar-alt"></i></span>` : ''}
                </button>
            `;
        }

        containers.forEach(container => {
            container.innerHTML = html;
            container.querySelectorAll('.user-chip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.target.closest('.user-chip-btn');
                    if (!targetBtn) return;
                    const user = targetBtn.dataset?.user || targetBtn.getAttribute('data-user') || '';
                    this.activeUserFilter = user;
                    this.renderTeammateChips();
                    this.applyFilters();
                    if (this.activeTab === 'history') {
                        this.loadUpdateHistory();
                    }
                });
            });
        });
    },

    bindEvents() {
        // Tab switching
        document.getElementById('tab-surveillance')?.addEventListener('click', () => {
            this.activeTab = 'surveillance';
            document.getElementById('view-surveillance')?.classList.remove('hidden');
            document.getElementById('view-roster')?.classList.add('hidden');
            document.getElementById('view-history')?.classList.add('hidden');
            document.getElementById('tab-surveillance')?.classList.add('active');
            document.getElementById('tab-roster')?.classList.remove('active');
            document.getElementById('tab-history')?.classList.remove('active');
        });

        document.getElementById('tab-roster')?.addEventListener('click', () => {
            this.activeTab = 'roster';
            document.getElementById('view-surveillance')?.classList.add('hidden');
            document.getElementById('view-roster')?.classList.remove('hidden');
            document.getElementById('view-history')?.classList.add('hidden');
            document.getElementById('tab-surveillance')?.classList.remove('active');
            document.getElementById('tab-roster')?.classList.add('active');
            document.getElementById('tab-history')?.classList.remove('active');
            this.loadWeatherRotation();
        });

        document.getElementById('tab-history')?.addEventListener('click', () => {
            this.activeTab = 'history';
            document.getElementById('view-surveillance')?.classList.add('hidden');
            document.getElementById('view-roster')?.classList.add('hidden');
            document.getElementById('view-history')?.classList.remove('hidden');
            document.getElementById('tab-surveillance')?.classList.remove('active');
            document.getElementById('tab-roster')?.classList.remove('active');
            document.getElementById('tab-history')?.classList.add('active');
            this.renderTeammateChips();
            this.loadUpdateHistory();
        });

        document.getElementById('btn-refresh-history')?.addEventListener('click', () => {
            this.loadUpdateHistory();
        });

        let historyDebounceTimer;
        document.getElementById('history-search')?.addEventListener('input', () => {
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = setTimeout(() => this.loadUpdateHistory(), 300);
        });

        document.getElementById('history-filter-commodity')?.addEventListener('change', () => this.loadUpdateHistory());
        document.getElementById('history-filter-date-from')?.addEventListener('change', () => this.loadUpdateHistory());
        document.getElementById('history-filter-date-to')?.addEventListener('change', () => this.loadUpdateHistory());
        document.getElementById('history-filter-status')?.addEventListener('change', () => this.loadUpdateHistory());
        document.getElementById('btn-clear-history-filters')?.addEventListener('click', () => {
            const s = document.getElementById('history-search'); if (s) s.value = '';
            const c = document.getElementById('history-filter-commodity'); if (c) c.value = '';
            const df = document.getElementById('history-filter-date-from'); if (df) df.value = '';
            const dt = document.getElementById('history-filter-date-to'); if (dt) dt.value = '';
            const st = document.getElementById('history-filter-status'); if (st) st.value = '';
            this.loadUpdateHistory();
        });

        // Click-to-Sort Buttons for Update History Table Column Headings
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#history-master-table .history-th-btn, #history-master-table .history-sort-th');
            if (btn) {
                const col = btn.getAttribute('data-sort');
                if (col) {
                    this.sortHistoryRecords(col, true);
                }
            }
        });

        // 3-Way Surveillance View Mode Switcher
        document.getElementById('btn-mode-table')?.addEventListener('click', () => {
            this.setSurveillanceViewMode('table');
        });
        document.getElementById('btn-mode-commodity')?.addEventListener('click', () => {
            this.setSurveillanceViewMode('commodity');
        });
        document.getElementById('btn-mode-date')?.addEventListener('click', () => {
            this.setSurveillanceViewMode('date');
        });

        // Top Action: Update MIS from DB (Date + Report sync)
        document.getElementById('btn-sync-report-db')?.addEventListener('click', () => {
            this.openSyncReportModal();
        });

        // Top Action: Manager Live Updates Audit Log
        document.getElementById('btn-manager-audit-log')?.addEventListener('click', () => {
            this.openManagerAuditLogModal();
        });

        // Top Action: Force Refresh from MySQL
        document.getElementById('btn-force-refresh')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-force-refresh');
            const icon = btn?.querySelector('i');
            if (icon) icon.classList.add('fa-spin');
            if (btn) btn.disabled = true;
            const t0 = performance.now();
            window.App.showToast('Re-querying 138 MySQL tables from agalabsdev_stage...', 'info');
            try {
                await this.loadGrid(true);
                const duration = Math.round(performance.now() - t0);
                window.App.showToast(`Live MySQL check completed in ${duration}ms! Surveillance cache refreshed.`, 'success');
            } catch (err) {
                console.error('Error refreshing from MySQL:', err);
                window.App.showToast('Failed to refresh from MySQL.', 'error');
            } finally {
                if (icon) icon.classList.remove('fa-spin');
                if (btn) btn.disabled = false;
            }
        });

        // Monitored Coverage KPI Card (Reset filter to ALL)
        document.getElementById('card-total-coverage')?.addEventListener('click', () => {
            this.activeFrequencyFilter = '';
            const f1 = document.getElementById('filter-frequency');
            if (f1) f1.value = '';
            const f2 = document.getElementById('date-filter-frequency');
            if (f2) f2.value = '';
            this.setFilterStatus('ALL');
        });

        // Top KPI Card Clicks (Interactive Quick Filters)
        document.getElementById('card-updated-today')?.addEventListener('click', () => {
            this.setFilterStatus('PASS');
        });
        document.getElementById('card-pending-action')?.addEventListener('click', () => {
            this.setFilterStatus('FAIL');
        });
        document.getElementById('card-cycle-windows')?.addEventListener('click', () => {
            this.setFilterStatus('WINDOW');
        });
        document.getElementById('card-need-correction')?.addEventListener('click', () => {
            this.setFilterStatus('NEED_CORRECTION');
        });
        document.getElementById('card-remarks-count')?.addEventListener('click', () => {
            this.setFilterStatus('REMARK');
        });

        // Cadence Aggregate Card Clicks
        const toggleCadence = (cadence) => {
            if (this.activeFrequencyFilter === cadence) {
                this.activeFrequencyFilter = '';
            } else {
                this.activeFrequencyFilter = cadence;
            }
            const f1 = document.getElementById('filter-frequency');
            if (f1) f1.value = this.activeFrequencyFilter;
            const f2 = document.getElementById('date-filter-frequency');
            if (f2) f2.value = this.activeFrequencyFilter;
            this.highlightActiveKpiCards();
            this.applyFilters();
        };

        document.getElementById('card-cadence-daily')?.addEventListener('click', () => toggleCadence('Daily'));
        document.getElementById('card-cadence-weekly')?.addEventListener('click', () => toggleCadence('Weekly'));
        document.getElementById('card-cadence-monthly')?.addEventListener('click', () => toggleCadence('Monthly'));

        // Search Input
        document.getElementById('crishi-search')?.addEventListener('input', (e) => {
            this.activeSearchQuery = e.target.value;
            const dInput = document.getElementById('date-crishi-search');
            if (dInput && dInput.value !== this.activeSearchQuery) dInput.value = this.activeSearchQuery;
            this.applyFilters();
        });

        // Pipeline, Commodity & Frequency Dropdowns
        document.getElementById('filter-pipeline')?.addEventListener('change', (e) => {
            this.activePipelineFilter = e.target.value;
            this.applyFilters();
        });
        document.getElementById('filter-assignee')?.addEventListener('change', (e) => {
            this.activeAssigneeFilter = e.target.value;
            const dSelect = document.getElementById('date-filter-assignee');
            if (dSelect && dSelect.value !== this.activeAssigneeFilter) dSelect.value = this.activeAssigneeFilter;
            this.applyFilters();
        });
        document.getElementById('filter-commodity')?.addEventListener('change', (e) => {
            this.activeCommodityFilter = e.target.value;
            const dSelect = document.getElementById('date-filter-commodity');
            if (dSelect && dSelect.value !== this.activeCommodityFilter) dSelect.value = this.activeCommodityFilter;
            this.applyFilters();
        });
        document.getElementById('filter-frequency')?.addEventListener('change', (e) => {
            this.activeFrequencyFilter = e.target.value;
            const dSelect = document.getElementById('date-filter-frequency');
            if (dSelect && dSelect.value !== this.activeFrequencyFilter) dSelect.value = this.activeFrequencyFilter;
            this.highlightActiveKpiCards();
            this.applyFilters();
        });
        document.getElementById('filter-today-status')?.addEventListener('change', (e) => {
            this.activeTodayStatusFilter = e.target.value;
            const dSelect = document.getElementById('date-filter-today-status');
            if (dSelect && dSelect.value !== this.activeTodayStatusFilter) dSelect.value = this.activeTodayStatusFilter;
            this.applyFilters();
        });
        document.getElementById('filter-sort')?.addEventListener('change', (e) => {
            const parts = (e.target.value || '').split('_');
            this.currentSortCol = parts[0] || 'title';
            this.currentSortDir = parts[1] || 'asc';
            const dSelect = document.getElementById('date-filter-sort');
            if (dSelect && dSelect.value !== e.target.value) dSelect.value = e.target.value;
            this.applyFilters();
        });

        // Clickable Sortable Headers on Master Surveillance Grid
        document.querySelectorAll('#crishi-master-table th.crishi-sortable-th').forEach(th => {
            th.addEventListener('click', () => {
                const clickedCol = th.dataset.col;
                if (this.currentSortCol === clickedCol) {
                    this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.currentSortCol = clickedCol;
                    this.currentSortDir = 'asc';
                }
                this.applyFilters();
            });
        });

        // Status Quick Filter Buttons (Table View)
        document.querySelectorAll('#surveillance-table-panel .crishi-filter-row button[data-status]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilterStatus(btn.dataset.status);
            });
        });

        // Sub-Admin Access Modal
        document.getElementById('btn-subadmin-modal')?.addEventListener('click', () => this.openSubAdminModal());

        // Edit Roster Modals & Refresh
        document.getElementById('btn-edit-scrapper-matrix')?.addEventListener('click', () => this.openEditScrapperMatrixModal());
        document.getElementById('btn-add-rake-zone')?.addEventListener('click', () => this.openEditRakeZoneModal());
        document.getElementById('btn-edit-monthly-duties')?.addEventListener('click', () => this.openEditMonthlyDutiesModal());
        document.getElementById('btn-refresh-roster-logs')?.addEventListener('click', () => this.loadRosterLogs());

        // Generate Roster
        document.getElementById('btn-generate-roster')?.addEventListener('click', async () => {
            try {
                const res = await api.post('/crishi/roster/generate', { weeks: 8 });
                if (res && res.success) {
                    window.App.showToast('Fair 2-month roster generated and saved successfully across real team members!', 'success');
                }
            } catch (e) {
                window.App.showToast('Error generating roster.', 'error');
            }
        });

        // Weather week dropdowns change handler (sync card & table)
        const onWeatherWeekChange = (e) => {
            const changedWeek = parseInt(e.target.getAttribute('data-week'), 10);
            const val = e.target.value;
            document.querySelectorAll(`.weather-week-select[data-week="${changedWeek}"], .tbl-weather-select[data-week="${changedWeek}"]`).forEach(el => {
                el.value = val;
            });

            const weeks = [];
            for (let w = 1; w <= 8; w++) {
                const sel = document.querySelector(`.weather-week-select[data-week="${w}"]`);
                weeks.push({
                    week: w,
                    assignee: sel ? sel.value : (w % 2 !== 0 ? 'Pankaj' : 'Bhawna'),
                    label: `Week ${w}`
                });
            }
            this.saveWeatherRotation(weeks);
        };

        document.querySelectorAll('.weather-week-select, .tbl-weather-select').forEach(sel => {
            sel.addEventListener('change', onWeatherWeekChange);
        });

        // Weather preset buttons
        document.querySelectorAll('.btn-weather-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                if (preset) this.applyWeatherPreset(preset);
            });
        });

        // Scrapper Week Selector and Apply
        document.querySelectorAll('.scrapper-week-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const w = parseInt(btn.dataset.week, 10);
                this.setSelectedScrapperWeek(w);
            });
        });

        document.getElementById('btn-apply-scrapper-week')?.addEventListener('click', async () => {
            await this.applyScrapperWeek(this.selectedScrapperWeek || 1);
        });

        // Roster Dynamic Controls
        document.getElementById('btn-random-assign-duties')?.addEventListener('click', () => this.randomlyAssignDuties());
        document.getElementById('btn-add-roster-duty')?.addEventListener('click', () => this.openAddDutyModal());
        document.getElementById('btn-manage-roster-people')?.addEventListener('click', () => this.openManagePeopleModal());
        document.getElementById('btn-add-roster-week')?.addEventListener('click', () => this.addRosterWeek());
        document.getElementById('btn-remove-roster-week')?.addEventListener('click', () => this.removeRosterWeek());
        document.getElementById('btn-monthly-roster-view')?.addEventListener('click', () => this.openMonthlyScheduleModal());
        document.getElementById('btn-save-roster-direct')?.addEventListener('click', () => this.saveRosterStructure());
        document.getElementById('btn-set-all-rake-date')?.addEventListener('click', () => this.openSetRakeDateModal());
    },

    async loadScrapperMatrix() {
        try {
            const res = await api.get('/roster/scrapper-matrix');
            if (res && res.success) {
                this.scrapperMatrix = res.matrix || [];
                this.cellStatus = res.cellStatus || {};
                this.rosterDuties = res.duties || this.scrapperMatrix.map(r => r.role);
                this.rosterPeople = res.people || res.teammates || ['Bhawna', 'Nitesh', 'Gopi', 'Pankaj', 'Nishant'];
                this.rosterWeeksCount = parseInt(res.weeksCount || 5, 10);
                this.dutyTitles = res.dutyTitles || {};
                this.dutyTimings = res.dutyTimings || {};
                this.rakeMovement = res.rakeMovement || [];
                this.monthlyRotation = res.monthlyRotation || [];
                this.dateMeta = res.dateMeta || null;

                // Update active week badge with month
                const activeWeekBadge = document.getElementById('badge-scrapper-active-week');
                if (activeWeekBadge) {
                    const monthText = this.dateMeta ? ` · ${this.dateMeta.currentMonth}` : '';
                    activeWeekBadge.innerHTML = `<i class="fas fa-calendar-check" style="margin-right: 4px;"></i> Active: Week ${res.activeWeek || 1}${monthText}`;
                }

                // Update RakeMovement title/badge with next Tuesday date
                const rakeCard = document.getElementById('rake-movement-table')?.closest('.card');
                const rakeBadge = rakeCard?.querySelector('.badge');
                if (rakeBadge && this.dateMeta) {
                    rakeBadge.innerHTML = `<i class="fas fa-calendar-day" style="margin-right: 4px;"></i> Next Due: ${this.dateMeta.rakeMovementFormatted}`;
                }

                this.renderScrapperMatrix();
                this.renderRakeMovement();
                this.renderMonthlyDuties();
                const activeWeek = res.activeWeek || 1;
                this.setSelectedScrapperWeek(activeWeek);
                this.loadRosterLogs();
            }
        } catch (e) {
            console.error('Error loading scrapper matrix:', e);
        }
    },

    renderScrapperMatrix() {
        const thead = document.getElementById('scrapper-matrix-thead');
        const tbody = document.getElementById('scrapper-matrix-tbody');
        if (!tbody || !this.scrapperMatrix || !this.scrapperMatrix.length) return;

        const weeksCount = parseInt(this.rosterWeeksCount || 5, 10);
        const iconMap = {
            'AW': { icon: 'fa-cloud-sun', color: '#38bdf8' },
            'Retail Wholesale': { icon: 'fa-store', color: '#f59e0b' },
            'Retail / Wholesale': { icon: 'fa-store', color: '#f59e0b' },
            'NCDEX': { icon: 'fa-chart-line', color: '#a855f7' },
            'Currency': { icon: 'fa-dollar-sign', color: '#10b981' },
            'CME': { icon: 'fa-globe', color: '#ec4899' }
        };

        // Render thead with clickable week headers
        if (thead) {
            let thWeeks = '';
            for (let w = 1; w <= weeksCount; w++) {
                const wInfo = this.dateMeta?.weeksInfo?.find(x => x.week === w);
                const rangeStr = wInfo ? `<div style="font-size: .67rem; font-weight: 600; color: #93c5fd; margin-top: 2px; letter-spacing: 0.2px;">${wInfo.date_range}</div>` : '';
                const isCurrent = w === (this.selectedScrapperWeek || 1);
                thWeeks += `
                    <th class="scrapper-week-col ${isCurrent ? 'active-col' : ''}" data-week="${w}" style="min-width: 124px; text-align: center; cursor: pointer;" title="Click Week ${w} to view Date-Wise Audit & Assign Holiday Backup">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <span style="font-weight: 800; font-size: .84rem;">Week ${w}</span>
                            <i class="fas fa-calendar-alt" style="font-size: .7rem; opacity: 0.8; color: #60a5fa;"></i>
                        </div>
                        ${rangeStr}
                        <div style="font-size: .62rem; color: #38bdf8; font-weight: 700; margin-top: 2px; display: flex; align-items: center; justify-content: center; gap: 3px;">
                            <i class="fas fa-search-plus" style="font-size: .55rem;"></i> Date Audit
                        </div>
                    </th>
                `;
            }
            thead.innerHTML = `
                <tr>
                    <th style="text-align: left; min-width: 180px;">Role / Duty</th>
                    ${thWeeks}
                    <th style="text-align: left; min-width: 140px;">Timing Note</th>
                    <th style="text-align: center; width: 90px;">Actions</th>
                </tr>
            `;

            // Wire week header clicks to Date-Wise Audit view
            thead.querySelectorAll('.scrapper-week-col').forEach(th => {
                th.addEventListener('click', () => {
                    const w = parseInt(th.dataset.week, 10);
                    this.openWeekDateAuditModal(w);
                });
            });
        }

        // Render week pills in toolbar
        const pillsContainer = document.getElementById('scrapper-week-pills');
        if (pillsContainer) {
            let pillsHtml = '';
            for (let w = 1; w <= weeksCount; w++) {
                const isActive = w === (this.selectedScrapperWeek || 1);
                pillsHtml += `
                    <button class="btn btn-sm btn-ghost scrapper-week-btn ${isActive ? 'active' : ''}" data-week="${w}" style="font-size: .74rem; padding: 4px 9px; border-radius: 6px; ${isActive ? 'background: #3b82f6; color: #fff; font-weight: 700;' : ''}">
                        W${w}
                    </button>
                `;
            }
            pillsContainer.innerHTML = pillsHtml;
            pillsContainer.querySelectorAll('.scrapper-week-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const w = parseInt(btn.dataset.week, 10);
                    this.setSelectedScrapperWeek(w);
                });
            });
        }

        // Update count badge
        const countBadge = document.getElementById('roster-duties-count-badge');
        if (countBadge) {
            countBadge.textContent = `${this.scrapperMatrix.length} Duties × ${weeksCount} Weeks (${this.rosterPeople.length} Teammates)`;
        }

        // Render tbody with color conditions (Green / Red / Amber / Sub)
        tbody.innerHTML = this.scrapperMatrix.map((row, rIdx) => {
            const meta = iconMap[row.role] || { icon: 'fa-tasks', color: '#60a5fa' };
            const timingColor = meta.color;
            let cellsHtml = '';

            for (let w = 1; w <= weeksCount; w++) {
                const assignee = (row.weeks && (row.weeks[w] || row.weeks[String(w)])) || 'Unassigned';
                const initial = assignee.charAt(0);
                const cellMeta = (this.cellStatus && this.cellStatus[row.role] && (this.cellStatus[row.role][w] || this.cellStatus[row.role][String(w)])) || {};
                const cStatus = cellMeta.status || 'UPCOMING';
                const bUser = cellMeta.backupUser || '';
                const onLeave = cellMeta.isOnLeave || false;

                let cellStyle = 'padding: 8px 6px; border-radius: 6px; transition: all 0.2s;';
                let statusChipHtml = '';

                if (cStatus === 'COMPLETED') {
                    cellStyle += ' background: rgba(16, 185, 129, 0.09); border: 1px solid rgba(16, 185, 129, 0.4);';
                    statusChipHtml = `
                        <div style="display: flex; align-items: center; justify-content: center; margin-top: 3px;">
                            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; font-size: .64rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">
                                <i class="fas fa-check-circle" style="margin-right: 2px;"></i> Done
                            </span>
                        </div>
                    `;
                } else if (cStatus === 'MISSED') {
                    cellStyle += ' background: rgba(239, 68, 68, 0.09); border: 1px solid rgba(239, 68, 68, 0.45);';
                    statusChipHtml = `
                        <div style="display: flex; align-items: center; justify-content: center; margin-top: 3px;">
                            <span class="badge" style="background: rgba(239, 68, 68, 0.22); color: #ef4444; font-size: .64rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">
                                <i class="fas fa-exclamation-circle" style="margin-right: 2px;"></i> Missed
                            </span>
                        </div>
                    `;
                } else if (cStatus === 'PENDING') {
                    cellStyle += ' background: rgba(245, 158, 11, 0.09); border: 1px solid rgba(245, 158, 11, 0.4);';
                    statusChipHtml = `
                        <div style="display: flex; align-items: center; justify-content: center; margin-top: 3px;">
                            <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: .64rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">
                                <i class="fas fa-clock" style="margin-right: 2px;"></i> Due Today
                            </span>
                        </div>
                    `;
                } else {
                    statusChipHtml = `
                        <div style="display: flex; align-items: center; justify-content: center; margin-top: 3px;">
                            <span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); font-size: .62rem; padding: 1px 5px; border-radius: 10px;">
                                Upcoming
                            </span>
                        </div>
                    `;
                }

                const subChipHtml = (onLeave && bUser) ? `
                    <div style="font-size: .63rem; color: #f59e0b; font-weight: 700; margin-top: 2px; text-align: center;" title="${assignee} is on leave; ${bUser} is active backup substitute">
                        <i class="fas fa-user-shield"></i> Sub: ${App.escapeHtml(bUser)}
                    </div>
                ` : '';

                cellsHtml += `
                    <td class="scrapper-cell-interactive scrapper-cell" data-role="${App.escapeHtml(row.role)}" data-week="${w}" data-assignee="${App.escapeHtml(assignee)}" style="${cellStyle}" title="Click to edit assignment or view date audit (${cStatus})">
                        <div class="user-avatar-chip" style="margin-bottom: 0;">
                            <span class="avatar-circle" style="background: ${meta.color};">${initial}</span>
                            <strong>${App.escapeHtml(assignee)}</strong>
                            <i class="fas fa-caret-down" style="font-size: .65rem; opacity: 0.5; margin-left: 3px;"></i>
                        </div>
                        ${subChipHtml}
                        ${statusChipHtml}
                    </td>
                `;
            }

            return `
                <tr data-role-idx="${rIdx}">
                    <td style="text-align: left; font-weight: 700; color: ${meta.color};">
                        <i class="fas ${meta.icon}" style="margin-right: 6px;"></i> ${App.escapeHtml(row.role)}
                        <div style="font-size: .7rem; font-weight: 400; color: var(--text-muted);">${App.escapeHtml(row.title || this.dutyTitles?.[row.role] || '')}</div>
                    </td>
                    ${cellsHtml}
                    <td style="text-align: left;">
                        <code style="font-size: .73rem; color: ${timingColor};">${App.escapeHtml(row.defaultTiming || this.dutyTimings?.[row.role] || 'Scheduled')}</code>
                    </td>
                    <td style="text-align: center;">
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn-icon btn-edit-duty-row" data-role="${App.escapeHtml(row.role)}" title="Edit duty info & timing" style="font-size: .78rem; padding: 4px 8px; border-radius: 6px; background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3);">
                                <i class="fas fa-edit" style="color: #60a5fa;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Wire cell click for quick reassignment
        tbody.querySelectorAll('.scrapper-cell-interactive').forEach(cell => {
            cell.addEventListener('click', () => {
                const role = cell.dataset.role;
                const week = parseInt(cell.dataset.week, 10);
                const currentPerson = cell.dataset.assignee;
                this.openCellAssignModal(role, week, currentPerson);
            });
        });

        // Wire edit duty buttons
        tbody.querySelectorAll('.btn-edit-duty-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditDutyModal(btn.dataset.role);
            });
        });

        this.setSelectedScrapperWeek(this.selectedScrapperWeek || 1);
    },


    renderRakeMovement() {
        const tbody = document.getElementById('rake-movement-tbody');
        if (!tbody) return;
        const list = this.rakeMovement && this.rakeMovement.length ? this.rakeMovement : [
            { person: 'Nishant', zones: 'ER, KR, NC, NE', zoneNames: 'Eastern, Konkan, North Central, North Eastern', status: 'Active' },
            { person: 'Gopi', zones: 'SEC, SE, SW, SCOR, NF, SR, WC, WR', zoneNames: 'South East Central, SE, SW, South Coast, NF, Southern, West Central, Western', status: 'Active' },
            { person: 'Pankaj', zones: 'CR, DFCR, EC, ECO', zoneNames: 'Central Railway, Dedicated Freight Corridor, East Central, East Coast', status: 'Active' },
            { person: 'Bhawna', zones: 'SC, NPLR, NW, NR', zoneNames: 'South Central, Northern Port Lines (Pipavav/Mundra), North Western, Northern', status: 'Active' },
            { person: 'Nitesh', zones: 'None', zoneNames: 'Dedicated portfolio: Bajra, Barley, Maize, Sugar', status: 'Exempt' }
        ];

        const colors = {
            'Nishant': { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' },
            'Gopi': { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
            'Pankaj': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
            'Bhawna': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
            'Nitesh': { bg: 'rgba(255, 255, 255, 0.05)', text: 'var(--text-muted)', border: 'rgba(255, 255, 255, 0.1)' }
        };

        tbody.innerHTML = list.map(r => {
            const c = colors[r.person] || { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
            const initial = (r.person || 'U').charAt(0);
            const isExempt = (r.status === 'Exempt') || (r.zones === 'None') || !r.zones;
            const zoneBadges = isExempt
                ? `<span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); font-size: .73rem;">None / Exempt</span>`
                : (r.zoneList || (r.zones ? r.zones.split(',') : [])).map(z => {
                    const zt = z.trim();
                    return `<span class="badge" style="background: ${c.bg}; color: ${c.text}; font-weight: 700; font-size: .73rem; border: 1px solid ${c.border}; margin: 2px 2px;">${zt}</span>`;
                }).join('');

            const rakeDateStr = formatToDDMMMYYYY(r.date || (this.dateMeta ? this.dateMeta.rakeMovementDate : '27-Oct-2026'));
            const rakeDayDate = isExempt
                ? `<span class="badge" style="background: rgba(255, 255, 255, 0.06); color: var(--text-muted); font-size: .72rem;">Exempt</span>`
                : `<button class="btn btn-ghost btn-sm btn-edit-rake-date" data-person="${r.person}" data-date="${rakeDateStr}" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: .74rem; font-weight: 700; border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 10px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;" title="Click to change due date for ${r.person}">
                     <i class="fas fa-calendar-day"></i> Tuesday, ${rakeDateStr} <i class="fas fa-pen" style="font-size: .62rem; opacity: 0.7;"></i>
                   </button>`;

            return `
                <tr>
                    <td>
                        <div class="user-avatar-chip">
                            <span class="avatar-circle">${initial}</span>
                            <strong>${r.person}</strong>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                            ${zoneBadges}
                        </div>
                        <div style="font-size: .71rem; color: var(--text-muted); margin-top: 4px; line-height: 1.35;">
                            ${r.zoneNames || ''}
                        </div>
                    </td>
                    <td style="text-align: center;">
                        ${rakeDayDate}
                    </td>
                    <td style="text-align: center;">
                        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; font-size: .73rem;" title="Latest record date in pyexcel_rakemovement">
                            <i class="fas fa-database" style="margin-right: 4px;"></i>${formatToDDMMMYYYY(r.lastUpdatedDate || '12-Oct-2026')}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <button class="btn btn-outline btn-sm btn-edit-rake-single" data-person="${r.person}" style="padding: 2px 7px; font-size: .71rem; color: #60a5fa; border-color: rgba(96,165,250,0.3);" title="Edit zones for ${r.person}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-edit-rake-single').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.person;
                this.openEditRakeZoneModal(p);
            });
        });

        tbody.querySelectorAll('.btn-edit-rake-date').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.person;
                const d = btn.dataset.date;
                this.openSetRakeDateModal(p, d);
            });
        });
    },

    renderMonthlyDuties() {
        const container = document.getElementById('monthly-duties-container');
        if (!container) return;
        const list = this.monthlyRotation && this.monthlyRotation.length ? this.monthlyRotation : [
            { duty: 'WPI', fullName: 'Wholesale Price Index Macro Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', cadence: 'Every Month (15th)', nextDueDate: '15-Nov-2026', rule: 'One person on each month, then rotates to another person sequentially.', lastUpdatedDate: '13-Oct-2026' },
            { duty: 'CPI', fullName: 'Consumer Price Index Inflation Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', cadence: 'Every Month (15th)', nextDueDate: '15-Nov-2026', rule: 'Same assignee who handles WPI for that active month.', lastUpdatedDate: '13-Oct-2026' },
            { duty: 'AW Report Download', fullName: 'AW Report Download', assignedPerson: 'Gopi', dueDay: '5th', cadence: 'Every Month (5th)', nextDueDate: '05-Nov-2026', rule: 'One person on each month other than the person handling WPI/CPI.', lastUpdatedDate: '04-Oct-2026' }
        ];

        const icons = {
            'WPI': { icon: 'fa-chart-pie', color: '#60a5fa' },
            'CPI': { icon: 'fa-shopping-basket', color: '#10b981' },
            'AW Report Download': { icon: 'fa-cloud-sun-rain', color: '#c084fc' },
            'AW Report': { icon: 'fa-cloud-sun-rain', color: '#c084fc' }
        };

        container.innerHTML = list.map(d => {
            const ic = icons[d.duty] || icons['AW Report Download'] || { icon: 'fa-calendar', color: '#60a5fa' };
            const person = d.assignedPerson || 'Bhawna';
            const initial = person.charAt(0);
            return `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="color: ${ic.color}; font-size: .88rem;">
                                <i class="fas ${ic.icon}" style="margin-right: 5px;"></i> ${d.duty} (${d.fullName || d.duty})
                            </strong>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <div class="user-avatar-chip" style="margin: 0;">
                                <span class="avatar-circle" style="background: ${ic.color}; color:#fff;">${initial}</span>
                                <strong style="color: var(--text-primary); font-size: .78rem;">${person}</strong>
                            </div>
                            <span class="badge" style="background: rgba(96, 165, 250, 0.15); color: #60a5fa; font-size: .7rem;">
                                ${d.cadence || `Monthly (${d.dueDay || '15th'})`}
                            </span>
                            ${d.lastUpdatedDate ? `
                                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .7rem; border: 1px solid rgba(16, 185, 129, 0.3);" title="Latest date verified in DB">
                                    <i class="fas fa-database" style="margin-right: 3px;"></i>DB: ${formatToDDMMMYYYY(d.lastUpdatedDate)}
                                </span>
                            ` : ''}
                            ${d.nextDueDate ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .7rem;" title="Next target due date">Next: ${formatToDDMMMYYYY(d.nextDueDate)}</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size: .78rem; color: var(--text-secondary); line-height: 1.4;">
                        <i class="fas fa-arrow-right" style="font-size: .68rem; color: ${ic.color}; margin-right: 4px;"></i>
                        <strong>Rule:</strong> ${d.rule || ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    async loadRosterLogs() {
        const tbody = document.getElementById('roster-logs-tbody');
        if (!tbody) return;
        try {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Refreshing logs from database...</td></tr>`;
            const res = await api.get('/roster/logs');
            if (res && res.success && res.logs) {
                this.rosterLogs = res.logs;
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
                            <td><strong style="color: var(--text-primary);">${log.role || log.event || ''}</strong></td>
                            <td>
                                <div class="user-avatar-chip">
                                    <span class="avatar-circle">${(log.employee || 'U').charAt(0).toUpperCase()}</span>
                                    <span>${log.employee || 'System'}</span>
                                </div>
                            </td>
                            <td><span class="tag" style="font-size: .7rem;">${log.type}</span></td>
                            <td>${statusBadge}</td>
                            <td style="color: var(--text-secondary); font-size: .75rem;">${log.details || `Updated duty status on ${log.date}`}</td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (e) {
            console.error('Error loading roster logs:', e);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load roster activity logs.</td></tr>`;
        }
    },

    validateRosterClient(duties, people, weeksCount, matrix) {
        const M = duties.length;
        const N = people.length;
        const K = parseInt(weeksCount, 10);
        const peopleLookup = new Set(people.map(p => p.trim().toLowerCase()));

        // 1. Every active duty must be assigned exactly one valid person per week
        for (let w = 1; w <= K; w++) {
            const weekAssignees = [];
            for (let d = 0; d < M; d++) {
                const row = matrix.find(r => (r.role || '').trim().toLowerCase() === duties[d].trim().toLowerCase());
                const person = row?.weeks?.[w] || row?.weeks?.[String(w)];
                if (!person || person === 'Unassigned') {
                    return { valid: false, message: `Week ${w} has unassigned duty: "${duties[d]}".` };
                }
                const pClean = person.trim().toLowerCase();
                if (!peopleLookup.has(pClean)) {
                    return { valid: false, message: `Assignment "${person}" in Week ${w} is not in the active people list.` };
                }
                // 2. Max 1 duty per person per week (Rule 2)
                if (weekAssignees.includes(pClean)) {
                    return { valid: false, message: `Double-booking detected: "${person}" is assigned to multiple duties in Week ${w} (violates Rule 2).` };
                }
                weekAssignees.push(pClean);
            }
        }

        // 3. No person performs the same duty twice across entire roster (Rule 3)
        for (let d = 0; d < M; d++) {
            const row = matrix.find(r => (r.role || '').trim().toLowerCase() === duties[d].trim().toLowerCase());
            const dutyAssignees = [];
            for (let w = 1; w <= K; w++) {
                const person = row?.weeks?.[w] || row?.weeks?.[String(w)];
                const pClean = (person || '').trim().toLowerCase();
                if (dutyAssignees.includes(pClean)) {
                    return { valid: false, message: `Repetition detected: "${person}" is assigned to duty "${duties[d]}" more than once across the roster (violates Rule 3).` };
                }
                dutyAssignees.push(pClean);
            }
        }

        return { valid: true, message: 'Schedule passed all validation checks.' };
    },

    solveRosterClient(duties, people, weeksCount) {
        const dutiesClean = duties.map(d => String(d).trim()).filter(Boolean);
        const peopleClean = people.map(p => String(p).trim()).filter(Boolean);

        // Case-insensitive duplicate check (Rule 9)
        const dLower = dutiesClean.map(d => d.toLowerCase());
        if (new Set(dLower).size !== dLower.length) {
            return { success: false, message: 'Duplicate duty names detected. Please ensure all duty names are distinct.' };
        }
        const pLower = peopleClean.map(p => p.toLowerCase());
        if (new Set(pLower).size !== pLower.length) {
            return { success: false, message: 'Duplicate teammate names detected. Please ensure all teammate names are distinct.' };
        }

        const M = dutiesClean.length;
        const N = peopleClean.length;
        const K = parseInt(weeksCount, 10);

        if (M === 0) return { success: false, message: 'No active duties defined. Please add at least one duty.' };
        if (N === 0) return { success: false, message: 'No teammates available. Please add at least one person.' };
        if (K <= 0) return { success: false, message: 'Number of weeks must be at least 1.' };

        // Rule 2 Check: Max 1 duty per person per week
        if (M > N) {
            return {
                success: false,
                message: `Cannot assign duties: Number of duties (${M}) exceeds available people (${N}). Rule 2 requires that each person can perform at most ONE duty per week. You need at least ${M} people.`
            };
        }

        // Rule 3 Check: Never assign same duty more than once across roster
        if (K > N) {
            return {
                success: false,
                message: `Cannot assign duties: Number of weeks (${K}) exceeds available people (${N}). Rule 3 prohibits any person from repeating the same duty across the roster. You need at least ${K} people for a ${K}-week non-repeating roster (or reduce weeks to ${N}).`
            };
        }

        const grid = Array.from({ length: M }, () => Array(K).fill(null));
        const personWeek = Array.from({ length: K }, () => new Set());
        const dutyPerson = Array.from({ length: M }, () => new Set());
        const cells = [];
        for (let d = 0; d < M; d++) {
            for (let w = 0; w < K; w++) {
                cells.push({ d, w });
            }
        }

        function shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        function getCandidates(d, w) {
            const forbidden = new Set([...personWeek[w], ...dutyPerson[d]]);
            const cands = [];
            for (let p = 0; p < N; p++) {
                if (!forbidden.has(p)) cands.push(p);
            }
            return shuffle(cands);
        }

        function backtrack(cellIdx) {
            if (cellIdx === cells.length) return true;

            let bestIdx = -1;
            let bestCand = null;
            let minLen = 999999;

            for (let i = cellIdx; i < cells.length; i++) {
                const { d, w } = cells[i];
                const cands = getCandidates(d, w);
                if (cands.length === 0) return false;
                if (cands.length < minLen) {
                    minLen = cands.length;
                    bestIdx = i;
                    bestCand = cands;
                    if (minLen === 1) break;
                }
            }

            [cells[cellIdx], cells[bestIdx]] = [cells[bestIdx], cells[cellIdx]];
            const { d, w } = cells[cellIdx];

            for (const p of bestCand) {
                grid[d][w] = p;
                personWeek[w].add(p);
                dutyPerson[d].add(p);

                if (backtrack(cellIdx + 1)) return true;

                grid[d][w] = null;
                personWeek[w].delete(p);
                dutyPerson[d].delete(p);
            }

            [cells[cellIdx], cells[bestIdx]] = [cells[bestIdx], cells[cellIdx]];
            return false;
        }

        const solved = backtrack(0);
        if (!solved) {
            return {
                success: false,
                message: 'Constraint backtracking solver could not find a complete conflict-free schedule for this configuration.'
            };
        }

        const result = [];
        for (let d = 0; d < M; d++) {
            const rowWeeks = {};
            for (let w = 0; w < K; w++) {
                rowWeeks[w + 1] = peopleClean[grid[d][w]];
            }
            result.push({
                role: dutiesClean[d],
                title: this.dutyTitles?.[dutiesClean[d]] || `${dutiesClean[d]} Scrapper`,
                defaultTiming: this.dutyTimings?.[dutiesClean[d]] || 'Scheduled Timing',
                weeks: rowWeeks
            });
        }

        const val = this.validateRosterClient(dutiesClean, peopleClean, K, result);
        if (!val.valid) {
            return { success: false, message: val.message };
        }

        return {
            success: true,
            message: 'Complete conflict-free schedule generated and validated successfully.',
            matrix: result
        };
    },

    async randomlyAssignDuties() {
        const alertBox = document.getElementById('roster-alert-container');
        try {
            // First run client validation to give immediate, crystal-clear feedback
            const clientCheck = this.solveRosterClient(this.rosterDuties, this.rosterPeople, this.rosterWeeksCount);
            if (!clientCheck.success) {
                if (alertBox) {
                    alertBox.style.display = 'block';
                    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
                    alertBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
                    alertBox.style.color = '#ef4444';
                    alertBox.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                            <div>
                                <strong><i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i>Random Assignment Impossible:</strong>
                                <div style="margin-top: 4px; line-height: 1.4;">${clientCheck.message}</div>
                                <div style="margin-top: 6px; font-size: .75rem; opacity: 0.85;">Previous valid roster preserved without modification.</div>
                            </div>
                            <button class="btn-icon" onclick="this.closest('#roster-alert-container').style.display='none'"><i class="fas fa-times"></i></button>
                        </div>
                    `;
                }
                window.App.showToast(clientCheck.message, 'error');
                return;
            }

            // Call backend API to record audit and persist
            const res = await api.post('/roster/generate-random', {
                duties: this.rosterDuties,
                people: this.rosterPeople,
                weeks: this.rosterWeeksCount
            });

            if (res && res.success) {
                this.scrapperMatrix = res.matrix;
                this.rosterDuties = res.duties;
                this.rosterPeople = res.people;
                this.rosterWeeksCount = res.weeksCount;
                this.renderScrapperMatrix();

                if (alertBox) {
                    alertBox.style.display = 'block';
                    alertBox.style.background = 'rgba(16, 185, 129, 0.15)';
                    alertBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                    alertBox.style.color = '#10b981';
                    alertBox.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                            <div>
                                <strong><i class="fas fa-check-circle" style="margin-right: 6px;"></i>Complete Conflict-Free Roster Generated!</strong>
                                <div style="margin-top: 4px; line-height: 1.4;">
                                    All 10 assignment and validation rules verified: Every duty has exactly 1 person per week, no person has >1 duty in any week, and zero persons perform the same duty more than once across all ${this.rosterWeeksCount} weeks.
                                </div>
                            </div>
                            <button class="btn-icon" onclick="this.closest('#roster-alert-container').style.display='none'"><i class="fas fa-times"></i></button>
                        </div>
                    `;
                }
                window.App.showToast('Complete conflict-free roster generated and saved successfully!', 'success');
                this.loadRosterLogs();
            } else {
                throw new Error(res?.message || 'Failed to generate random roster.');
            }
        } catch (e) {
            console.error('Error generating random roster:', e);
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
                alertBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
                alertBox.style.color = '#ef4444';
                alertBox.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div>
                            <strong><i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i>Generation Error:</strong>
                            <div style="margin-top: 4px;">${e.message || 'Backtracking solver could not complete schedule.'}</div>
                        </div>
                        <button class="btn-icon" onclick="this.closest('#roster-alert-container').style.display='none'"><i class="fas fa-times"></i></button>
                    </div>
                `;
            }
            window.App.showToast(e.message || 'Error generating roster.', 'error');
        }
    },

    openCellAssignModal(role, week, currentPerson) {
        const row = this.scrapperMatrix.find(r => r.role === role);
        if (!row) return;

        // Calculate who is busy in this week across other duties
        const busyInWeek = {};
        this.scrapperMatrix.forEach(r => {
            if (r.role !== role) {
                const p = r.weeks?.[week] || r.weeks?.[String(week)];
                if (p) busyInWeek[p.toLowerCase()] = r.role;
            }
        });

        // Calculate who has done this duty in other weeks
        const doneInOtherWeeks = {};
        for (let w = 1; w <= this.rosterWeeksCount; w++) {
            if (w !== week) {
                const p = row.weeks?.[w] || row.weeks?.[String(w)];
                if (p) doneInOtherWeeks[p.toLowerCase()] = w;
            }
        }
        const otherTeammates = this.rosterPeople.filter(p => p.toLowerCase() !== (currentPerson || '').toLowerCase());
        const defaultBackup = otherTeammates[0] || 'Pankaj';

        // Calculate 5 working days for this week (Mon-Fri)
        const weekDates = [];
        const weekInfo = this.dateMeta?.weeksInfo?.find(x => x.week === week);
        if (weekInfo && weekInfo.start_date) {
            const sDate = new Date(weekInfo.start_date + 'T00:00:00');
            for (let i = 0; i < 5; i++) {
                const d = new Date(sDate.getTime() + i * 86400000);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const iso = `${yyyy}-${mm}-${dd}`;
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const formatted = formatToDDMMMYYYY(iso);
                weekDates.push({ date: iso, dayName, formatted: `${dayName}, ${formatted}`, dayIndex: i });
            }
        } else {
            const today = new Date();
            const firstMonday = new Date(today.getFullYear(), today.getMonth(), 1);
            const dayOfWeek = (firstMonday.getDay() + 6) % 7;
            firstMonday.setDate(firstMonday.getDate() - dayOfWeek + (week - 1) * 7);
            for (let i = 0; i < 5; i++) {
                const d = new Date(firstMonday.getTime() + i * 86400000);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const iso = `${yyyy}-${mm}-${dd}`;
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const formatted = formatToDDMMMYYYY(iso);
                weekDates.push({ date: iso, dayName, formatted: `${dayName}, ${formatted}`, dayIndex: i });
            }
        }

        const body = `
            <div style="font-size: .85rem;">
                <!-- Header Banner -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(59, 130, 246, 0.08); padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.25); margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-size: .95rem; font-weight: 800; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-tasks"></i> ${App.escapeHtml(role)} — Week ${week}
                        </div>
                        <div style="font-size: .74rem; color: var(--text-secondary); margin-top: 2px;">
                            ${weekInfo?.date_range ? `<i class="fas fa-calendar-alt"></i> ${weekInfo.date_range} · ` : ''}Scheduled Timing: <code>${App.escapeHtml(row.defaultTiming || 'Scheduled')}</code>
                        </div>
                    </div>
                    <div>
                        <span style="font-size: .74rem; color: var(--text-muted); margin-right: 4px;">Primary Assignee:</span>
                        <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 800; font-size: .8rem; padding: 4px 10px; border-radius: 6px;">
                            <i class="fas fa-user"></i> ${App.escapeHtml(currentPerson || 'Unassigned')}
                        </span>
                    </div>
                </div>

                <!-- Mode Switcher Tabs -->
                <div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                    <button type="button" class="btn btn-sm btn-sub-tab active" id="tab-btn-day-cover" style="font-size: .79rem; padding: 6px 14px; border-radius: 6px; background: #3b82f6; color: #fff; font-weight: 700; border: none; cursor: pointer;">
                        <i class="fas fa-user-shield" style="margin-right: 4px;"></i> 1-2 Days Leave Substitution (Day Basis)
                    </button>
                    <button type="button" class="btn btn-sm btn-sub-tab" id="tab-btn-full-week" style="font-size: .79rem; padding: 6px 14px; border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--text-secondary); font-weight: 600; border: 1px solid var(--border); cursor: pointer;">
                        <i class="fas fa-calendar-week" style="margin-right: 4px;"></i> Change Full Week Assignee (5 Days)
                    </button>
                </div>

                <!-- Mode 1: 1-2 Days Leave Substitution (Day Basis) -->
                <div id="section-day-cover-mode">
                    <p style="font-size: .8rem; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.4;">
                        People generally take leave for <strong>1–2 days only</strong>. Select the specific working day(s) when <strong>${App.escapeHtml(currentPerson)}</strong> is on leave, and designate who will cover data uploading without modifying the master weekly plan:
                    </p>

                    <!-- Quick Day Presets -->
                    <div style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-outline btn-sm btn-quick-day-select" data-mode="two_days" style="font-size: .71rem; padding: 2px 8px; border-radius: 4px;">
                            <i class="fas fa-check-double"></i> 1st 2 Days (Mon–Tue)
                        </button>
                        <button type="button" class="btn btn-outline btn-sm btn-quick-day-select" data-mode="today" style="font-size: .71rem; padding: 2px 8px; border-radius: 4px;">
                            <i class="fas fa-calendar-day"></i> Today Only
                        </button>
                        <button type="button" class="btn btn-outline btn-sm btn-quick-day-select" data-mode="all" style="font-size: .71rem; padding: 2px 8px; border-radius: 4px;">
                            <i class="fas fa-check-square"></i> All 5 Days
                        </button>
                        <button type="button" class="btn btn-outline btn-sm btn-quick-day-select" data-mode="clear" style="font-size: .71rem; padding: 2px 8px; border-radius: 4px; color: var(--text-muted);">
                            <i class="fas fa-times"></i> Clear
                        </button>
                    </div>

                    <!-- 5-Day Interactive Selector Grid (Mon-Fri) -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px;" id="grid-day-cover-selection">
                        ${weekDates.map((wd, idx) => `
                            <label class="modal-day-select-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 6px; border: 1.5px solid ${idx < 2 ? '#3b82f6' : 'var(--border)'}; background: ${idx < 2 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.02)'}; border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.2s;" data-date="${wd.date}">
                                <input type="checkbox" class="modal-day-checkbox" value="${wd.date}" ${idx < 2 ? 'checked' : ''} style="margin-bottom: 6px; transform: scale(1.2); cursor: pointer;">
                                <strong style="font-size: .82rem; color: var(--text-primary); text-transform: uppercase;">${wd.dayName}</strong>
                                <span style="font-size: .72rem; color: #38bdf8; font-weight: 600; margin-top: 2px;">${wd.formatted.split(', ')[1]}</span>
                            </label>
                        `).join('')}
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">
                                Select Backup / Covering Teammate *
                            </label>
                            <select id="modal-sub-person-select" style="width: 100%; font-size: .85rem; padding: 8px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                                ${otherTeammates.map(t => `<option value="${t}" ${t === defaultBackup ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">
                                Holiday / Leave Reason
                            </label>
                            <input type="text" id="modal-sub-reason-input" value="1-2 Days Leave / Holiday" placeholder="e.g. 1-2 Days Leave, Out of station" style="width: 100%; font-size: .85rem; padding: 8px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        </div>
                    </div>

                    <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 8px 12px; font-size: .75rem; color: #22c55e; margin-bottom: 10px;">
                        <i class="fas fa-check-circle" style="margin-right: 4px;"></i> The surveillance engine will verify uploads under the backup assignee for the selected dates and display their name in the daily audit view.
                    </div>
                </div>

                <!-- Mode 2: Change Entire Week Rotation (7 Days) -->
                <div id="section-full-week-mode" style="display: none;">
                    <p style="font-size: .8rem; color: var(--text-secondary); margin-bottom: 10px;">
                        Permanently change the primary assignee for all 7 days of <strong>Week ${week}</strong>:
                    </p>

                    <div style="margin-bottom: 14px;">
                        <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
                            Select New Primary Teammate
                        </label>
                        <select id="modal-cell-person-select" style="width: 100%; font-size: .88rem; padding: 8px 12px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                            ${this.rosterPeople.map(p => {
            const isBusy = busyInWeek[p.toLowerCase()];
            const isRepeat = doneInOtherWeeks[p.toLowerCase()];
            let note = '';
            if (isBusy && isRepeat) note = ` [⚠ Busy on ${isBusy} & does ${role} in W${isRepeat}]`;
            else if (isBusy) note = ` [⚠ Busy on ${isBusy} in W${week}]`;
            else if (isRepeat) note = ` [⚠ Does ${role} in W${isRepeat}]`;
            else note = ' [✓ Available & non-repeating]';
            return `<option value="${App.escapeHtml(p)}" ${p.toLowerCase() === (currentPerson || '').toLowerCase() ? 'selected' : ''}>${App.escapeHtml(p)}${note}</option>`;
        }).join('')}
                        </select>
                    </div>

                    <div id="modal-cell-conflict-alert" style="display: none; padding: 8px 12px; border-radius: 6px; font-size: .78rem; margin-bottom: 12px;"></div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-cell-action">
                <i class="fas fa-user-shield"></i> Save 1-2 Days Leave Cover
            </button>
        `;

        window.App.showModal(`Assign & Leave Cover: ${role} (Week ${week})`, body, footer, 'modal-lg');

        // Tab switching logic
        let currentMode = 'DAY_COVER';
        const tabBtnDay = document.getElementById('tab-btn-day-cover');
        const tabBtnWeek = document.getElementById('tab-btn-full-week');
        const secDay = document.getElementById('section-day-cover-mode');
        const secWeek = document.getElementById('section-full-week-mode');
        const submitBtn = document.getElementById('btn-submit-cell-action');

        tabBtnDay?.addEventListener('click', () => {
            currentMode = 'DAY_COVER';
            tabBtnDay.style.background = '#3b82f6';
            tabBtnDay.style.color = '#fff';
            tabBtnDay.style.fontWeight = '700';
            tabBtnWeek.style.background = 'rgba(255,255,255,0.05)';
            tabBtnWeek.style.color = 'var(--text-secondary)';
            tabBtnWeek.style.fontWeight = '600';
            secDay.style.display = 'block';
            secWeek.style.display = 'none';
            if (submitBtn) {
                submitBtn.innerHTML = `<i class="fas fa-user-shield"></i> Save 1-2 Days Leave Cover`;
            }
        });

        tabBtnWeek?.addEventListener('click', () => {
            currentMode = 'FULL_WEEK';
            tabBtnWeek.style.background = '#3b82f6';
            tabBtnWeek.style.color = '#fff';
            tabBtnWeek.style.fontWeight = '700';
            tabBtnDay.style.background = 'rgba(255,255,255,0.05)';
            tabBtnDay.style.color = 'var(--text-secondary)';
            tabBtnDay.style.fontWeight = '600';
            secDay.style.display = 'none';
            secWeek.style.display = 'block';
            if (submitBtn) {
                submitBtn.innerHTML = `<i class="fas fa-check"></i> Assign Entire Week`;
            }
        });

        // Day card toggle styling
        const updateDayCards = () => {
            document.querySelectorAll('#grid-day-cover-selection .modal-day-select-card').forEach(card => {
                const cb = card.querySelector('input.modal-day-checkbox');
                if (cb && cb.checked) {
                    card.style.borderColor = '#3b82f6';
                    card.style.background = 'rgba(59, 130, 246, 0.14)';
                } else {
                    card.style.borderColor = 'var(--border)';
                    card.style.background = 'rgba(255,255,255,0.02)';
                }
            });
        };

        document.querySelectorAll('#grid-day-cover-selection .modal-day-checkbox').forEach(cb => {
            cb.addEventListener('change', updateDayCards);
        });

        // Quick Day Preset buttons
        document.querySelectorAll('.btn-quick-day-select').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = btn.dataset.mode;
                const cbs = Array.from(document.querySelectorAll('#grid-day-cover-selection .modal-day-checkbox'));
                if (m === 'two_days') {
                    cbs.forEach((cb, i) => cb.checked = (i < 2));
                } else if (m === 'today') {
                    const todayIso = getTodayStr();
                    let matched = false;
                    cbs.forEach(cb => {
                        if (cb.value === todayIso) { cb.checked = true; matched = true; }
                        else cb.checked = false;
                    });
                    if (!matched && cbs.length) cbs[0].checked = true;
                } else if (m === 'all') {
                    cbs.forEach(cb => cb.checked = true);
                } else if (m === 'clear') {
                    cbs.forEach(cb => cb.checked = false);
                }
                updateDayCards();
            });
        });

        // Conflict check for full week mode
        const selWeekPerson = document.getElementById('modal-cell-person-select');
        const alertDiv = document.getElementById('modal-cell-conflict-alert');
        const checkConflict = () => {
            if (!selWeekPerson || !alertDiv) return;
            const p = (selWeekPerson.value || '').trim();
            const pLower = p.toLowerCase();
            const isBusy = busyInWeek[pLower];
            const isRepeat = doneInOtherWeeks[pLower];

            if (isBusy || isRepeat) {
                alertDiv.style.display = 'block';
                alertDiv.style.background = 'rgba(245, 158, 11, 0.15)';
                alertDiv.style.border = '1px solid rgba(245, 158, 11, 0.4)';
                alertDiv.style.color = '#f59e0b';
                let msg = '';
                if (isBusy) msg += `<div><strong>Rule 2 Warning:</strong> ${p} is already assigned to <em>${isBusy}</em> in Week ${week}.</div>`;
                if (isRepeat) msg += `<div><strong>Rule 3 Warning:</strong> ${p} already performs <em>${role}</em> in Week ${isRepeat}.</div>`;
                alertDiv.innerHTML = msg;
            } else {
                alertDiv.style.display = 'block';
                alertDiv.style.background = 'rgba(16, 185, 129, 0.15)';
                alertDiv.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                alertDiv.style.color = '#10b981';
                alertDiv.innerHTML = `<strong>Rule 2 & 3 Verified:</strong> ${p} is completely conflict-free for this assignment.`;
            }
        };
        selWeekPerson?.addEventListener('change', checkConflict);
        checkConflict();

        // Main Submit Action
        submitBtn?.addEventListener('click', async () => {
            if (currentMode === 'DAY_COVER') {
                const selectedDates = Array.from(document.querySelectorAll('#grid-day-cover-selection .modal-day-checkbox:checked')).map(cb => cb.value);
                if (!selectedDates.length) {
                    window.App.showToast('Please select at least 1 day for leave cover.', 'warning');
                    return;
                }
                const backupUser = document.getElementById('modal-sub-person-select')?.value;
                const reason = document.getElementById('modal-sub-reason-input')?.value.trim() || '1-2 Days Leave / Holiday';

                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving Cover...`;

                try {
                    const res = await api.post('/roster/assign-backup', {
                        dutyRole: role,
                        primaryUser: currentPerson,
                        backupUser: backupUser,
                        weekNumber: week,
                        dates: selectedDates,
                        reason: reason,
                        isOnLeave: true
                    });
                    if (res && res.success) {
                        window.App.showToast(`Backup cover assigned to ${backupUser} for ${selectedDates.length} day(s)!`, 'success');
                        window.App.closeModal();
                        await this.loadScrapperMatrix();
                    } else {
                        window.App.showToast(res?.message || 'Failed to save leave cover', 'error');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<i class="fas fa-user-shield"></i> Save 1-2 Days Leave Cover`;
                    }
                } catch (err) {
                    console.error('Error saving day leave cover:', err);
                    window.App.showToast('Error saving leave cover.', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fas fa-user-shield"></i> Save 1-2 Days Leave Cover`;
                }
            } else {
                // Full week permanent reassignment
                const newPerson = selWeekPerson?.value;
                if (!row.weeks) row.weeks = {};
                row.weeks[week] = newPerson;
                row.weeks[String(week)] = newPerson;
                window.App.closeModal();
                this.renderScrapperMatrix();
                window.App.showToast(`Updated ${role} (Week ${week}) to ${newPerson}. Click 'Save' to persist.`, 'info');
            }
        });
    },

    openAddDutyModal() {
        const body = `
            <div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Duty Code / Short Name *</label>
                    <input type="text" id="modal-new-duty-role" placeholder="e.g. Weather, Mandi Spot, Spices..." style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Full Title / Description</label>
                    <input type="text" id="modal-new-duty-title" placeholder="e.g. Daily Weather & Precipitation Scrapper" style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Target Timing Note</label>
                    <input type="text" id="modal-new-duty-timing" placeholder="e.g. Daily 18:30 IST or Do after 6:30 PM" value="Scheduled Timing" style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
            </div>
        `;
        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-modal-submit-add-duty"><i class="fas fa-plus"></i> Add Duty</button>
        `;
        window.App.showModal('Add Operational Duty', body, footer);

        document.getElementById('btn-modal-submit-add-duty')?.addEventListener('click', () => {
            const roleInput = document.getElementById('modal-new-duty-role');
            const titleInput = document.getElementById('modal-new-duty-title');
            const timingInput = document.getElementById('modal-new-duty-timing');

            const role = (roleInput?.value || '').trim();
            const title = (titleInput?.value || '').trim() || `${role} Duty`;
            const timing = (timingInput?.value || '').trim() || 'Scheduled Timing';

            if (!role) {
                window.App.showToast('Please enter a duty name.', 'warning');
                return;
            }

            const exists = this.rosterDuties.some(d => d.trim().toLowerCase() === role.toLowerCase());
            if (exists) {
                window.App.showToast(`Duty "${role}" already exists (case-insensitive).`, 'warning');
                return;
            }

            this.rosterDuties.push(role);
            if (!this.dutyTitles) this.dutyTitles = {};
            if (!this.dutyTimings) this.dutyTimings = {};
            this.dutyTitles[role] = title;
            this.dutyTimings[role] = timing;

            const initialWeeks = {};
            for (let w = 1; w <= this.rosterWeeksCount; w++) {
                const pIdx = (this.rosterDuties.length + w - 1) % Math.max(1, this.rosterPeople.length);
                initialWeeks[w] = this.rosterPeople[pIdx] || 'Unassigned';
            }

            this.scrapperMatrix.push({
                role: role,
                title: title,
                defaultTiming: timing,
                weeks: initialWeeks
            });

            window.App.closeModal();
            this.renderScrapperMatrix();
            window.App.showToast(`Duty "${role}" added successfully! Click "Save Roster" or "Randomly Assign Duties" to optimize.`, 'success');
        });
    },

    openEditDutyModal(role) {
        const row = this.scrapperMatrix.find(r => r.role === role);
        if (!row) return;

        const body = `
            <div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Duty Code / Short Name</label>
                    <input type="text" id="modal-edit-duty-role" value="${App.escapeHtml(row.role)}" disabled style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: rgba(255,255,255,0.03); color: var(--text-muted); border: 1px solid var(--border);">
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Full Title / Description</label>
                    <input type="text" id="modal-edit-duty-title" value="${App.escapeHtml(row.title || this.dutyTitles?.[role] || '')}" style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Target Timing Note</label>
                    <input type="text" id="modal-edit-duty-timing" value="${App.escapeHtml(row.defaultTiming || this.dutyTimings?.[role] || '')}" style="width: 100%; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
            </div>
        `;
        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-modal-submit-edit-duty"><i class="fas fa-save"></i> Save Changes</button>
        `;
        window.App.showModal(`Edit Duty: ${role}`, body, footer);

        document.getElementById('btn-modal-submit-edit-duty')?.addEventListener('click', () => {
            const title = (document.getElementById('modal-edit-duty-title')?.value || '').trim();
            const timing = (document.getElementById('modal-edit-duty-timing')?.value || '').trim();

            row.title = title;
            row.defaultTiming = timing;
            if (this.dutyTitles) this.dutyTitles[role] = title;
            if (this.dutyTimings) this.dutyTimings[role] = timing;

            window.App.closeModal();
            this.renderScrapperMatrix();
            window.App.showToast(`Duty "${role}" updated.`, 'success');
        });
    },

    deleteDuty(role) {
        if (!confirm(`Are you sure you want to remove duty "${role}" from the active roster?`)) return;
        this.scrapperMatrix = this.scrapperMatrix.filter(r => r.role !== role);
        this.rosterDuties = this.rosterDuties.filter(d => d !== role);
        this.renderScrapperMatrix();
        window.App.showToast(`Duty "${role}" removed.`, 'info');
    },

    openManagePeopleModal() {
        const renderList = () => {
            const M = this.rosterDuties.length;
            const N = this.rosterPeople.length;
            const K = this.rosterWeeksCount;

            const isLatinPossible = N >= Math.max(M, K);
            let statusHtml = '';
            if (isLatinPossible) {
                statusHtml = `<div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; padding: 8px 12px; border-radius: 6px; font-size: .8rem; margin-bottom: 14px;">
                    ✓ Team size (${N} people) is sufficient for a 100% non-repeating Latin Square roster (${M} duties × ${K} weeks).
                </div>`;
            } else {
                let reason = '';
                if (N < M) reason += `Need at least ${M} people for Rule 2 (max 1 duty per person/wk). Short by ${M - N}. `;
                if (N < K) reason += `Need at least ${K} people for Rule 3 (no repeating duty). Short by ${K - N}.`;
                statusHtml = `<div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; padding: 8px 12px; border-radius: 6px; font-size: .8rem; margin-bottom: 14px;">
                    ⚠ ${reason}
                </div>`;
            }

            const itemsHtml = this.rosterPeople.map((p, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="avatar-circle" style="width: 22px; height: 22px; font-size: .7rem;">${p.charAt(0)}</span>
                        <strong>${App.escapeHtml(p)}</strong>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-icon btn-edit-person" data-idx="${idx}" title="Rename teammate" style="font-size: .75rem; padding: 2px 6px;">
                            <i class="fas fa-edit" style="color: #60a5fa;"></i>
                        </button>
                        ${this.rosterPeople.length > 1 ? `
                            <button class="btn-icon btn-del-person" data-idx="${idx}" title="Remove teammate" style="font-size: .75rem; padding: 2px 6px;">
                                <i class="fas fa-trash-alt" style="color: #ef4444;"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');

            return `
                <div>
                    ${statusHtml}
                    <div style="margin-bottom: 14px;">
                        <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Active Teammates Pool (${this.rosterPeople.length})</label>
                        <div id="modal-people-list-container" style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                            ${itemsHtml}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                        <input type="text" id="modal-new-person-name" placeholder="Enter new teammate name..." style="flex: 1; font-size: .85rem; padding: 7px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        <button class="btn btn-primary btn-sm" id="btn-modal-add-person"><i class="fas fa-user-plus"></i> Add Person</button>
                    </div>
                </div>
            `;
        };

        const footer = `
            <button class="btn btn-primary" onclick="window.App.closeModal()"><i class="fas fa-check"></i> Done</button>
        `;

        window.App.showModal('Manage Roster Teammates Pool', renderList(), footer);

        const attachHandlers = () => {
            document.getElementById('btn-modal-add-person')?.addEventListener('click', () => {
                const inp = document.getElementById('modal-new-person-name');
                const name = (inp?.value || '').trim();
                if (!name) return;
                const exists = this.rosterPeople.some(p => p.toLowerCase() === name.toLowerCase());
                if (exists) {
                    window.App.showToast(`Person "${name}" is already in the roster (case-insensitive).`, 'warning');
                    return;
                }
                this.rosterPeople.push(name);
                inp.value = '';
                document.getElementById('modal-body').innerHTML = renderList();
                attachHandlers();
                this.renderScrapperMatrix();
            });

            document.querySelectorAll('.btn-del-person').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx, 10);
                    const removed = this.rosterPeople[idx];
                    this.rosterPeople.splice(idx, 1);
                    document.getElementById('modal-body').innerHTML = renderList();
                    attachHandlers();
                    this.renderScrapperMatrix();
                    window.App.showToast(`Removed "${removed}" from roster pool.`, 'info');
                });
            });

            document.querySelectorAll('.btn-edit-person').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx, 10);
                    const oldName = this.rosterPeople[idx];
                    const newName = prompt('Edit teammate name:', oldName);
                    if (newName && newName.trim() && newName.trim().toLowerCase() !== oldName.toLowerCase()) {
                        const clean = newName.trim();
                        this.rosterPeople[idx] = clean;
                        // Replace across matrix
                        this.scrapperMatrix.forEach(r => {
                            for (let w in r.weeks) {
                                if (r.weeks[w]?.toLowerCase() === oldName.toLowerCase()) {
                                    r.weeks[w] = clean;
                                }
                            }
                        });
                        document.getElementById('modal-body').innerHTML = renderList();
                        attachHandlers();
                        this.renderScrapperMatrix();
                    }
                });
            });
        };

        attachHandlers();
    },

    addRosterWeek() {
        this.rosterWeeksCount = parseInt(this.rosterWeeksCount || 5, 10) + 1;
        const newW = this.rosterWeeksCount;

        // Assign a candidate for the new week in each row
        this.scrapperMatrix.forEach((r, dIdx) => {
            if (!r.weeks) r.weeks = {};
            const pIdx = (dIdx + newW - 1) % Math.max(1, this.rosterPeople.length);
            r.weeks[newW] = this.rosterPeople[pIdx] || 'Unassigned';
            r.weeks[String(newW)] = r.weeks[newW];
        });

        if (this.rosterWeeksCount > this.rosterPeople.length) {
            window.App.showToast(`Added Week ${newW}. Note: Number of weeks (${newW}) now exceeds people (${this.rosterPeople.length}). Rule 3 requires people ≥ weeks for non-repeating assignments.`, 'warning');
        } else {
            window.App.showToast(`Added Week ${newW} successfully.`, 'success');
        }

        this.renderScrapperMatrix();
    },

    removeRosterWeek() {
        if (this.rosterWeeksCount <= 1) {
            window.App.showToast('Minimum 1 week required.', 'warning');
            return;
        }

        const removedW = this.rosterWeeksCount;
        this.scrapperMatrix.forEach(r => {
            if (r.weeks) {
                delete r.weeks[removedW];
                delete r.weeks[String(removedW)];
            }
        });

        this.rosterWeeksCount -= 1;
        if (this.selectedScrapperWeek > this.rosterWeeksCount) {
            this.selectedScrapperWeek = this.rosterWeeksCount;
        }

        this.renderScrapperMatrix();
        window.App.showToast(`Removed Week ${removedW}. Roster now configured for ${this.rosterWeeksCount} weeks.`, 'info');
    },

    async saveRosterStructure() {
        try {
            const payload = {
                matrix: this.scrapperMatrix,
                duties: this.rosterDuties,
                people: this.rosterPeople,
                weeksCount: this.rosterWeeksCount,
                dutyTitles: this.dutyTitles,
                dutyTimings: this.dutyTimings
            };

            const res = await api.post('/roster/structure', payload);
            if (res && res.success) {
                window.App.showToast('Roster structure and matrix saved successfully to database!', 'success');
                this.loadRosterLogs();
            } else {
                window.App.showToast(res.message || 'Failed to save roster.', 'error');
            }
        } catch (e) {
            console.error('Error saving roster structure:', e);
            window.App.showToast('Error saving roster structure.', 'error');
        }
    },

    exportRosterCSV() {
        const weeksCount = parseInt(this.rosterWeeksCount || 5, 10);
        const headers = ['Duty / Role', 'Title', 'Timing Note'];
        for (let w = 1; w <= weeksCount; w++) {
            headers.push(`Week ${w}`);
        }

        const lines = [headers.join(',')];

        this.scrapperMatrix.forEach(row => {
            const role = `"${(row.role || '').replace(/"/g, '""')}"`;
            const title = `"${(row.title || this.dutyTitles?.[row.role] || '').replace(/"/g, '""')}"`;
            const timing = `"${(row.defaultTiming || this.dutyTimings?.[row.role] || '').replace(/"/g, '""')}"`;

            const cols = [role, title, timing];
            for (let w = 1; w <= weeksCount; w++) {
                const ass = (row.weeks && (row.weeks[w] || row.weeks[String(w)])) || 'Unassigned';
                cols.push(`"${ass.replace(/"/g, '""')}"`);
            }
            lines.push(cols.join(','));
        });

        const csvContent = lines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Operational_Duty_Roster_${getTodayStr()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        window.App.showToast('Operational Duty Roster CSV exported successfully!', 'success');
    },

    printRoster() {
        window.print();
    },

    async openMonthlyScheduleModal() {
        try {
            const res = await api.get('/roster/monthly-schedule');
            if (!res || !res.success) {
                window.App.showToast('Could not load monthly schedule.', 'error');
                return;
            }

            const currentMonth = res.currentMonth;
            const nextMonth = res.nextMonth;
            const weeks = res.weeks || [];
            const duties = res.duties || this.rosterDuties;

            const iconMap = {
                'AW': '#38bdf8',
                'Retail Wholesale': '#f59e0b',
                'Retail / Wholesale': '#f59e0b',
                'NCDEX': '#a855f7',
                'Currency': '#10b981',
                'CME': '#ec4899'
            };

            const weeksTableHtml = `
                <div style="overflow-x: auto; margin-bottom: 20px;">
                    <table class="crishi-table" style="text-align: center; font-size: .82rem; width: 100%;">
                        <thead>
                            <tr>
                                <th style="text-align: left; width: 140px;">Calendar Week</th>
                                <th style="text-align: left; width: 150px;">Date Range</th>
                                <th style="width: 100px;">Cycle Week</th>
                                ${duties.map(d => `<th style="color: ${iconMap[d] || '#60a5fa'};">${App.escapeHtml(d)}</th>`).join('')}
                                <th style="width: 120px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${weeks.map(w => {
                const isNextMonthFirst = w.isNextMonthFirstWeek;
                const isCurrent = w.isCurrent;
                const trStyle = isNextMonthFirst
                    ? 'background: rgba(168, 85, 247, 0.08); border-top: 2px dashed rgba(168, 85, 247, 0.5);'
                    : (isCurrent ? 'background: rgba(59, 130, 246, 0.1);' : '');

                const statusBadge = isNextMonthFirst
                    ? `<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; font-weight: 700; border: 1px solid rgba(168, 85, 247, 0.4);"><i class="fas fa-forward" style="margin-right: 4px;"></i>Next Mo W1</span>`
                    : (isCurrent
                        ? `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 700; border: 1px solid rgba(59, 130, 246, 0.4);"><i class="fas fa-check" style="margin-right: 4px;"></i>Active Week</span>`
                        : `<span style="font-size: .75rem; color: var(--text-muted);">${w.month}</span>`
                    );

                return `
                                    <tr style="${trStyle}">
                                        <td style="text-align: left; font-weight: 700;">
                                            Week ${w.weekNumber}
                                            ${isNextMonthFirst ? `<div style="font-size: .68rem; color: #c084fc; font-weight: 600;">1st Wk of ${nextMonth}</div>` : ''}
                                        </td>
                                        <td style="text-align: left;">
                                            <div style="font-weight: 600;">${w.dateRange}</div>
                                            <div style="font-size: .68rem; color: var(--text-muted);">${w.startDate} to ${w.endDate}</div>
                                        </td>
                                        <td>
                                            <span class="badge" style="background: rgba(255,255,255,0.06); font-weight: 700;">${w.cycleLabel}</span>
                                        </td>
                                        ${duties.map(d => {
                    const ass = w.assignments?.[d] || 'Unassigned';
                    return `
                                                <td>
                                                    <div class="user-avatar-chip" style="font-size: .75rem;">
                                                        <span class="avatar-circle" style="width: 17px; height: 17px; font-size: .6rem; background: ${iconMap[d] || '#60a5fa'};">${ass.charAt(0)}</span>
                                                        <strong>${App.escapeHtml(ass)}</strong>
                                                    </div>
                                                </td>
                                            `;
                }).join('')}
                                        <td>${statusBadge}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            const body = `
                <div>
                    <!-- Header Info -->
                    <div style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <h4 style="margin: 0; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-calendar-check" style="color: #60a5fa;"></i>
                                <span>Rolling Monthly View: ${currentMonth} → ${nextMonth} (1st Week)</span>
                            </h4>
                            <p style="margin: 4px 0 0; font-size: .8rem; color: var(--text-secondary);">
                                Rotation continues seamlessly into ${nextMonth} 1st week with zero rotation gaps or reset.
                            </p>
                        </div>
                        <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-weight: 700; border: 1px solid rgba(168, 85, 247, 0.3); padding: 5px 10px;">
                            <i class="fas fa-link" style="margin-right: 4px;"></i> Continuous Rotation Cycle
                        </span>
                    </div>

                    ${weeksTableHtml}

                    <!-- Monthly Macro Surveillance Rotation -->
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px;">
                        <h5 style="margin: 0 0 10px; font-size: .88rem; font-weight: 700; color: #10b981; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-sync-alt"></i> Sequential Monthly Macro Duties (Sequential Rotation Across Teammates)
                        </h5>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px;">
                            ${(this.monthlyRotation || []).map(m => `
                                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <strong style="color: #60a5fa; font-size: .83rem;">${App.escapeHtml(m.duty)} — ${App.escapeHtml(m.fullName || '')}</strong>
                                        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .7rem;">Due: ${App.escapeHtml(m.dueDay || '15th')}</span>
                                    </div>
                                    <div style="margin-top: 6px; font-size: .78rem; display: flex; justify-content: space-between; align-items: center;">
                                        <span style="color: var(--text-muted);">${currentMonth} Assignee:</span>
                                        <div class="user-avatar-chip">
                                            <span class="avatar-circle" style="width: 17px; height: 17px; font-size: .6rem; background: #10b981;">${(m.assignedPerson || 'U').charAt(0)}</span>
                                            <strong>${App.escapeHtml(m.assignedPerson || 'Unassigned')}</strong>
                                        </div>
                                    </div>
                                    ${m.nextMonthAssignee ? `
                                        <div style="margin-top: 4px; font-size: .76rem; display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: var(--text-muted);">${nextMonth} Assignee:</span>
                                            <div class="user-avatar-chip" style="opacity: 0.9;">
                                                <span class="avatar-circle" style="width: 17px; height: 17px; font-size: .6rem; background: #a855f7;">${(m.nextMonthAssignee || 'U').charAt(0)}</span>
                                                <strong>${App.escapeHtml(m.nextMonthAssignee)}</strong>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            const footer = `
                <button class="btn btn-outline" onclick="window.App.closeModal()">Close</button>
            `;

            window.App.showModal(`Monthly View: ${currentMonth} to ${nextMonth} 1st Week`, body, footer, 'modal-xl');
        } catch (e) {
            console.error('Error opening monthly schedule modal:', e);
            window.App.showToast('Error loading monthly schedule view.', 'error');
        }
    },

    openEditScrapperMatrixModal() {
        const teammates = this.rosterPeople && this.rosterPeople.length ? this.rosterPeople : ['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj'];
        const current = this.scrapperMatrix && this.scrapperMatrix.length ? this.scrapperMatrix : [];
        const weeksCount = parseInt(this.rosterWeeksCount || 5, 10);
        const weeksArr = Array.from({ length: weeksCount }, (_, i) => i + 1);

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .83rem; margin-bottom: 14px;">
                    Customize the ${weeksCount}-Week Operational Duty Rotation Matrix. Assignments are saved to database and used when applying weekly schedules.
                </p>
                <div style="overflow-x: auto; max-height: 480px;">
                    <table class="roster-compact-table" style="font-size: .8rem;">
                        <thead>
                            <tr>
                                <th style="width: 140px;">Role / Duty</th>
                                ${weeksArr.map(w => `<th>Week ${w}</th>`).join('')}
                                <th style="width: 130px;">Timing Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${current.map((item, idx) => `
                                <tr data-role-idx="${idx}">
                                    <td>
                                        <strong>${App.escapeHtml(item.role)}</strong>
                                        <div style="font-size: .7rem; color: var(--text-muted);">${App.escapeHtml(item.title || '')}</div>
                                    </td>
                                    ${weeksArr.map(w => {
            const selUser = (item.weeks && (item.weeks[w] || item.weeks[String(w)])) || 'Unassigned';
            return `
                                            <td>
                                                <select class="sc-matrix-select" data-role-idx="${idx}" data-week="${w}" style="font-size: .75rem; padding: 3px 5px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                                                    ${teammates.map(t => `<option value="${App.escapeHtml(t)}" ${t === selUser ? 'selected' : ''}>${App.escapeHtml(t)}</option>`).join('')}
                                                </select>
                                            </td>
                                        `;
        }).join('')}
                                    <td>
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
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-scrapper-matrix-modal">
                <i class="fas fa-save"></i> Save Rotation Plan
            </button>
        `;

        window.App.showModal(`Edit Operational Duty Rotation Matrix (${weeksCount} Weeks)`, body, footer, 'modal-lg');

        document.getElementById('btn-save-scrapper-matrix-modal')?.addEventListener('click', async () => {
            const updated = JSON.parse(JSON.stringify(current));
            document.querySelectorAll('.sc-matrix-select').forEach(sel => {
                const rIdx = parseInt(sel.dataset.roleIdx, 10);
                const w = parseInt(sel.dataset.week, 10);
                if (!updated[rIdx].weeks) updated[rIdx].weeks = {};
                updated[rIdx].weeks[w] = sel.value;
                updated[rIdx].weeks[String(w)] = sel.value;
            });
            document.querySelectorAll('.sc-matrix-timing').forEach(inp => {
                const rIdx = parseInt(inp.dataset.roleIdx, 10);
                updated[rIdx].defaultTiming = inp.value;
            });

            try {
                const res = await api.post('/roster/structure', {
                    matrix: updated,
                    duties: this.rosterDuties,
                    people: this.rosterPeople,
                    weeksCount: this.rosterWeeksCount,
                    dutyTitles: this.dutyTitles,
                    dutyTimings: this.dutyTimings
                });
                if (res && res.success) {
                    window.App.showToast('Operational Duty Matrix updated and saved successfully!', 'success');
                    window.App.closeModal();
                    this.scrapperMatrix = updated;
                    this.renderScrapperMatrix();
                    this.loadRosterLogs();
                } else {
                    window.App.showToast(res.message || 'Failed to save matrix', 'error');
                }
            } catch (e) {
                console.error('Error saving scrapper matrix:', e);
                window.App.showToast('Error saving scrapper matrix.', 'error');
            }
        });
    },

    openEditRakeZoneModal(person = null) {
        const list = this.rakeMovement && this.rakeMovement.length ? this.rakeMovement : [
            { person: 'Nishant', zones: 'ER, KR, NC, NE', zoneNames: 'Eastern Railway, Konkan Railway, North Central Railway, North Eastern Railway', status: 'Active' },
            { person: 'Gopi', zones: 'SEC, SE, SW, SCOR, NF, SR, WC, WR', zoneNames: 'South East Central, SE, SW, South Coast, NF, Southern, West Central, Western', status: 'Active' },
            { person: 'Pankaj', zones: 'CR, DFCR, EC, ECO', zoneNames: 'Central Railway, Dedicated Freight Corridor, East Central, East Coast', status: 'Active' },
            { person: 'Bhawna', zones: 'SC, NPLR, NW, NR', zoneNames: 'South Central, Northern Port Lines (Pipavav/Mundra), North Western, Northern', status: 'Active' },
            { person: 'Nitesh', zones: 'None', zoneNames: 'Dedicated portfolio: Bajra, Barley, Maize, Sugar', status: 'Exempt' }
        ];

        const currentItem = person ? list.find(x => x.person.toLowerCase() === person.toLowerCase()) : list[0];
        const allZones = ['CR', 'ER', 'EC', 'ECO', 'KR', 'NC', 'NE', 'NF', 'NR', 'NW', 'SC', 'SE', 'SEC', 'SR', 'SW', 'SCOR', 'WC', 'WR', 'DFCR', 'NPLR'];

        const body = `
            <div>
                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Select Teammate</label>
                    <select id="modal-rake-person" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        ${list.map(r => `<option value="${r.person}" ${(currentItem && currentItem.person === r.person) ? 'selected' : ''}>${r.person} (${r.status === 'Exempt' ? 'Exempt' : r.zones})</option>`).join('')}
                        <option value="New Person">+ Add Other Teammate</option>
                    </select>
                </div>

                <div id="modal-rake-custom-person-row" style="display: none; margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Person Name</label>
                    <input type="text" id="modal-rake-custom-person" placeholder="e.g. Rahul" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Status</label>
                    <select id="modal-rake-status" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                        <option value="Active" ${currentItem?.status !== 'Exempt' ? 'selected' : ''}>Active (Assigned Railway Zones)</option>
                        <option value="Exempt" ${currentItem?.status === 'Exempt' ? 'selected' : ''}>Exempt (None / Dedicated Commodity)</option>
                    </select>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Assigned Zones (Comma Separated)</label>
                    <input type="text" id="modal-rake-zones" value="${currentItem?.zones || ''}" placeholder="e.g. ER, KR, NC, NE" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                    <div style="font-size: .72rem; color: var(--text-muted); margin-top: 4px;">Click any zone badge below to toggle it on/off:</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;" id="modal-rake-quick-badges">
                        ${allZones.map(z => `
                            <button type="button" class="btn btn-sm btn-ghost btn-toggle-zone" data-zone="${z}" style="font-size: .7rem; padding: 2px 7px; border: 1px solid var(--border); border-radius: 4px;">
                                ${z}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Full Zone Names & Notes</label>
                    <input type="text" id="modal-rake-names" value="${currentItem?.zoneNames || ''}" placeholder="e.g. Eastern Railway, Konkan Railway" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Tuesday Due Date</label>
                    <input type="text" id="modal-rake-date" value="${currentItem?.date || (this.dateMeta ? this.dateMeta.rakeMovementDate : '27-Oct-2026')}" placeholder="e.g. 27-Oct-2026" style="width: 100%; font-size: .85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-rake-modal">
                <i class="fas fa-save"></i> Save Railway Zones
            </button>
        `;

        window.App.showModal('Edit Tuesday RakeMovement Zones', body, footer);

        const personSel = document.getElementById('modal-rake-person');
        const customRow = document.getElementById('modal-rake-custom-person-row');
        const zonesInp = document.getElementById('modal-rake-zones');
        const namesInp = document.getElementById('modal-rake-names');
        const statusSel = document.getElementById('modal-rake-status');
        const dateInp = document.getElementById('modal-rake-date');

        personSel?.addEventListener('change', () => {
            if (personSel.value === 'New Person') {
                customRow.style.display = 'block';
                zonesInp.value = '';
                namesInp.value = '';
                statusSel.value = 'Active';
                if (dateInp) dateInp.value = this.dateMeta ? this.dateMeta.rakeMovementDate : '27-Oct-2026';
            } else {
                customRow.style.display = 'none';
                const found = list.find(x => x.person.toLowerCase() === personSel.value.toLowerCase());
                if (found) {
                    zonesInp.value = found.zones || '';
                    namesInp.value = found.zoneNames || '';
                    statusSel.value = found.status || 'Active';
                    if (dateInp) dateInp.value = found.date || (this.dateMeta ? this.dateMeta.rakeMovementDate : '27-Oct-2026');
                }
            }
        });

        document.querySelectorAll('.btn-toggle-zone').forEach(btn => {
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

        document.getElementById('btn-save-rake-modal')?.addEventListener('click', async () => {
            const finalPerson = personSel.value === 'New Person' ? document.getElementById('modal-rake-custom-person')?.value.trim() : personSel.value;
            if (!finalPerson) {
                window.App.showToast('Please specify a person name.', 'error');
                return;
            }

            try {
                const res = await api.put('/roster/rake-zones', {
                    person: finalPerson,
                    zones: zonesInp.value.trim() || 'None',
                    zoneNames: namesInp.value.trim(),
                    status: statusSel.value,
                    date: dateInp ? dateInp.value.trim() : ''
                });
                if (res && res.success) {
                    window.App.showToast(res.message || 'Railway zones updated successfully!', 'success');
                    window.App.closeModal();
                    if (res.rakeMovement) this.rakeMovement = res.rakeMovement;
                    this.renderRakeMovement();
                    this.loadRosterLogs();
                } else {
                    window.App.showToast(res.message || 'Failed to update zones', 'error');
                }
            } catch (e) {
                console.error('Error saving rake zones:', e);
                window.App.showToast('Error saving rake zones.', 'error');
            }
        });
    },

    openSetRakeDateModal(person = null, currentDate = '') {
        const title = person ? `Set Due Date — ${person}` : 'Set Tuesday Rake Movement Due Date';
        const defaultDate = currentDate || (this.dateMeta ? this.dateMeta.rakeMovementDate : '27-Oct-2026');
        const upcomingTuesdays = ['20-Oct-2026', '27-Oct-2026', '03-Nov-2026', '10-Nov-2026', '17-Nov-2026'];

        const body = `
            <div>
                <p style="font-size: .83rem; color: var(--text-secondary); margin-bottom: 14px;">
                    ${person ? `Specify the scheduled Tuesday freight due date for <strong>${App.escapeHtml(person)}</strong>.` : 'Specify the scheduled Tuesday freight due date for all active railway zone teammates.'}
                </p>
                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">Due Date (DD-MMM-YYYY)</label>
                    <input type="text" id="modal-set-rake-date-val" value="${defaultDate}" placeholder="e.g. 27-Oct-2026" style="width: 100%; font-size: .9rem; padding: 8px 12px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
                </div>
                <div style="margin-bottom: 14px;">
                    <label style="font-size: .75rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Quick Presets (Upcoming Tuesdays):</label>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${upcomingTuesdays.map(t => `
                            <button type="button" class="btn btn-outline btn-sm btn-quick-rake-tuesday" data-date="${t}" style="font-size: .74rem; padding: 3px 8px; border-radius: 4px;">
                                ${t}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-rake-due-date">
                <i class="fas fa-save"></i> Save Due Date
            </button>
        `;
        window.App.showModal(title, body, footer);

        document.querySelectorAll('.btn-quick-rake-tuesday').forEach(b => {
            b.addEventListener('click', () => {
                const inp = document.getElementById('modal-set-rake-date-val');
                if (inp) inp.value = b.dataset.date;
            });
        });

        document.getElementById('btn-save-rake-due-date')?.addEventListener('click', async () => {
            const dateVal = document.getElementById('modal-set-rake-date-val')?.value.trim();
            if (!dateVal) {
                window.App.showToast('Please enter a valid date.', 'error');
                return;
            }
            try {
                const res = await api.post('/roster/rake-date', { date: dateVal, person: person });
                if (res && res.success) {
                    window.App.showToast(res.message || `Rake Movement date set to ${dateVal}`, 'success');
                    window.App.closeModal();
                    await this.loadScrapperMatrix();
                } else {
                    window.App.showToast(res?.message || 'Failed to set date', 'error');
                }
            } catch (err) {
                console.error('Error setting rake date:', err);
                window.App.showToast('Error saving rake movement date.', 'error');
            }
        });
    },

    openEditMonthlyDutiesModal() {
        const teammates = ['Bhawna', 'Gopi', 'Nishant', 'Nitesh', 'Pankaj'];
        const current = this.monthlyRotation && this.monthlyRotation.length ? this.monthlyRotation : [
            { duty: 'WPI', fullName: 'Wholesale Price Index Macro Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'One person on each month, then rotates sequentially.' },
            { duty: 'CPI', fullName: 'Consumer Price Index Inflation Surveillance', assignedPerson: 'Bhawna', dueDay: '15th', nextDueDate: '15-Nov-2026', rule: 'Same assignee who handles WPI for that active month.' },
            { duty: 'AW Report Download', fullName: 'AW Report Download', assignedPerson: 'Gopi', dueDay: '5th', nextDueDate: '05-Nov-2026', rule: 'One person on each month other than the person handling WPI/CPI.' }
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
                                ${d.duty} — ${d.fullName || d.duty}
                            </strong>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Assigned Person</label>
                                    <select class="monthly-person-select" data-idx="${idx}" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                        ${teammates.map(t => `<option value="${t}" ${t === d.assignedPerson ? 'selected' : ''}>${t}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Due Day</label>
                                    <input type="text" class="monthly-day-input" data-idx="${idx}" value="${d.dueDay || '15th'}" placeholder="e.g. 15th" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                </div>
                                <div>
                                    <label style="font-size: .75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Next Due Date</label>
                                    <input type="text" class="monthly-date-input" data-idx="${idx}" value="${d.nextDueDate || '15-Nov-2026'}" placeholder="e.g. 15-Nov-2026" style="width: 100%; font-size: .8rem; padding: 5px 8px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-monthly-duties-modal">
                <i class="fas fa-save"></i> Save Monthly Duties
            </button>
        `;

        window.App.showModal('Edit Every Month Macro Duties', body, footer);

        document.getElementById('btn-save-monthly-duties-modal')?.addEventListener('click', async () => {
            const updated = JSON.parse(JSON.stringify(current));
            document.querySelectorAll('.monthly-person-select').forEach(sel => {
                const idx = parseInt(sel.dataset.idx, 10);
                updated[idx].assignedPerson = sel.value;
            });
            document.querySelectorAll('.monthly-day-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx, 10);
                updated[idx].dueDay = inp.value.trim();
                updated[idx].cadence = `Every Month (${inp.value.trim()})`;
            });
            document.querySelectorAll('.monthly-date-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx, 10);
                updated[idx].nextDueDate = inp.value.trim();
            });

            try {
                const res = await api.put('/roster/monthly-duties', { duties: updated });
                if (res && res.success) {
                    window.App.showToast('Monthly Macro Duties updated and saved successfully!', 'success');
                    window.App.closeModal();
                    if (res.monthlyRotation) this.monthlyRotation = res.monthlyRotation;
                    this.renderMonthlyDuties();
                    this.loadRosterLogs();
                } else {
                    window.App.showToast(res.message || 'Failed to update monthly duties', 'error');
                }
            } catch (e) {
                console.error('Error saving monthly duties:', e);
                window.App.showToast('Error saving monthly duties.', 'error');
            }
        });
    },

    async openWeekDateAuditModal(weekNum) {
        const w = parseInt(weekNum || 1, 10);
        window.App.showModal(`Week ${w} Daily Operational Audit`, `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin fa-2x" style="margin-bottom: 12px; color: #60a5fa;"></i>
                <div>Loading day-by-day task audit and verification data from MySQL...</div>
            </div>
        `, `<button class="btn btn-outline" onclick="window.App.closeModal()">Close</button>`, 'modal-wide');

        try {
            const res = await api.get(`/roster/week-detail?week=${w}`);
            if (!res || !res.success) {
                window.App.showToast(res?.message || 'Failed to load week detail', 'error');
                return;
            }

            const days = res.days || [];
            const duties = res.duties || [];
            const rake = res.rakeMovement || [];

            let thDaysHtml = days.map(d => `
                <th style="text-align: center; width: calc((100% - 200px) / 5); background: ${d.isToday ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255,255,255,0.02)'}; border: ${d.isToday ? '1px solid #3b82f6' : '1px solid var(--border)'}; padding: 10px 4px;">
                    <div style="font-weight: 800; font-size: .84rem; color: ${d.isToday ? '#60a5fa' : 'var(--text-primary)'};">${d.dayName}</div>
                    <div style="font-size: .72rem; color: ${d.isToday ? '#93c5fd' : 'var(--text-muted)'}; margin-top: 1px;">${d.formatted}</div>
                    ${d.isToday ? '<span class="badge" style="background:#3b82f6; color:#fff; font-size:.62rem; padding:1px 6px; border-radius:4px; margin-top:3px; display:inline-block;">TODAY</span>' : ''}
                </th>
            `).join('');

            let dutiesRowsHtml = duties.map(duty => {
                let daysCellsHtml = duty.days.map(d => {
                    let statusBadge = '';
                    if (d.status === 'DONE') {
                        statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; font-weight: 700; font-size: .67rem; padding: 2px 6px; border-radius: 8px;"><i class="fas fa-check-circle"></i> Done</span>`;
                    } else if (d.status === 'MISSED') {
                        statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; font-weight: 700; font-size: .67rem; padding: 2px 6px; border-radius: 8px;"><i class="fas fa-exclamation-circle"></i> Missed</span>`;
                    } else if (d.status === 'PENDING') {
                        statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-weight: 700; font-size: .67rem; padding: 2px 6px; border-radius: 8px;"><i class="fas fa-clock"></i> Due Today</span>`;
                    } else {
                        statusBadge = `<span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); font-size: .65rem; padding: 2px 5px; border-radius: 8px;">Upcoming</span>`;
                    }

                    const isLeave = Boolean(d.isOnLeave && d.backupUser);
                    const userDisplay = isLeave ? `
                        <div style="margin-bottom: 3px;">
                            <span style="font-size: .68rem; color: #f59e0b; text-decoration: line-through; opacity: 0.8;" title="On Holiday / Leave">${App.escapeHtml(d.primaryUser)}</span>
                            <div style="font-size: .73rem; font-weight: 800; color: #60a5fa;">
                                <i class="fas fa-user-shield" style="font-size: .65rem; margin-right: 2px;"></i>${App.escapeHtml(d.backupUser)}
                            </div>
                        </div>
                    ` : `
                        <div style="font-weight: 700; font-size: .75rem; color: var(--text-primary); margin-bottom: 3px;">
                            ${App.escapeHtml(d.primaryUser)}
                        </div>
                    `;

                    return `
                        <td style="text-align: center; padding: 8px 6px; vertical-align: top; border: 1px solid var(--border); background: ${d.status === 'DONE' ? 'rgba(16, 185, 129, 0.04)' : (d.status === 'MISSED' ? 'rgba(239, 68, 68, 0.04)' : 'transparent')};">
                            ${userDisplay}
                            <div>${statusBadge}</div>
                            <button class="btn btn-ghost btn-sm btn-sub-duty-day" data-role="${App.escapeHtml(duty.role)}" data-date="${d.date}" data-user="${App.escapeHtml(d.primaryUser)}" data-backup="${App.escapeHtml(d.backupUser || '')}" style="font-size: .62rem; padding: 1px 5px; margin-top: 4px; color: #60a5fa;" title="Assign backup substitute or mark holiday">
                                <i class="fas fa-user-plus"></i> ${isLeave ? 'Change Sub' : 'Backup'}
                            </button>
                        </td>
                    `;
                }).join('');

                return `
                    <tr>
                        <td style="text-align: left; vertical-align: top; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border);">
                            <div style="font-weight: 800; color: #60a5fa; font-size: .84rem;">${App.escapeHtml(duty.role)}</div>
                            <div style="font-size: .72rem; color: var(--text-secondary); margin-top: 2px;">${App.escapeHtml(duty.title)}</div>
                            <div style="font-size: .68rem; color: var(--text-muted); margin-top: 3px;"><i class="fas fa-clock"></i> ${App.escapeHtml(duty.defaultTiming)}</div>
                            <div style="font-size: .67rem; color: #38bdf8; font-family: monospace; margin-top: 2px;"><code>${App.escapeHtml(duty.table)}</code></div>
                        </td>
                        ${daysCellsHtml}
                    </tr>
                `;
            }).join('');

            // Tuesday Rake Movement Section
            let rakeRowsHtml = '';
            if (rake && rake.length) {
                rakeRowsHtml = rake.map(r => {
                    const isLeave = Boolean(r.isOnLeave && r.backupUser);
                    return `
                        <tr>
                            <td style="font-weight: 700; text-align: left;">
                                ${isLeave ? `
                                    <span style="font-size: .72rem; color: #f59e0b; text-decoration: line-through;">${App.escapeHtml(r.person)}</span>
                                    <strong style="color: #60a5fa; display: block; font-size: .78rem;"><i class="fas fa-user-shield"></i> ${App.escapeHtml(r.backupUser)}</strong>
                                ` : `<strong style="color: var(--text-primary); font-size: .78rem;">${App.escapeHtml(r.person)}</strong>`}
                            </td>
                            <td style="text-align: left; font-size: .74rem;">${App.escapeHtml(r.zones || 'None')}</td>
                            <td style="text-align: center;">
                                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: .7rem; border: 1px solid rgba(16,185,129,0.3);">
                                    <i class="fas fa-database"></i> ${r.latestDbDate || '12-Oct-2026'}
                                </span>
                            </td>
                            <td style="text-align: center;">
                                <span class="badge" style="background: ${r.color === '#10b981' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${r.color}; font-weight: 700; font-size: .7rem;">
                                    ${r.statusLabel}
                                </span>
                            </td>
                            <td style="text-align: right;">
                                <button class="btn btn-outline btn-sm btn-sub-duty-day" data-role="Rake Movement" data-date="${r.date}" data-user="${App.escapeHtml(r.person)}" data-backup="${App.escapeHtml(r.backupUser || '')}" style="font-size: .68rem; padding: 2px 7px;">
                                    <i class="fas fa-user-shield"></i> Substitute
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            const bodyHtml = `
                <div style="font-size: .83rem;">
                    <!-- Week Summary Banner -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <span style="font-weight: 800; color: #60a5fa; font-size: .95rem;">
                                <i class="fas fa-calendar-alt" style="margin-right: 6px;"></i> ${res.weekLabel} (${res.dateRange})
                            </span>
                            <div style="font-size: .75rem; color: var(--text-secondary); margin-top: 2px;">
                                Comprehensive working days task audit (Monday – Friday). Click <strong>Backup</strong> on any day to assign a holiday substitute.
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-outline btn-sm" id="btn-reverify-week-mysql" style="font-size: .75rem; color: #10b981; border-color: rgba(16,185,129,0.35);">
                                <i class="fas fa-sync-alt"></i> Re-Verify MySQL Ingestion
                            </button>
                        </div>
                    </div>

                    <!-- 7-Day Audit Matrix Table -->
                    <div style="overflow-x: auto; margin-bottom: 18px; border-radius: 8px; border: 1px solid var(--border);">
                        <table class="crishi-table" style="width: 100%; border-collapse: collapse; font-size: .78rem; table-layout: fixed;">
                            <thead>
                                <tr>
                                    <th style="width: 200px; text-align: left; background: rgba(255,255,255,0.03);">Role / Duty & Table</th>
                                    ${thDaysHtml}
                                </tr>
                            </thead>
                            <tbody>
                                ${dutiesRowsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Tuesday Rake Movement Section -->
                    <div class="card glass-card" style="padding: 14px 16px; background: rgba(59,130,246,0.03); border: 1px solid rgba(59,130,246,0.25); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <strong style="color: #60a5fa; font-size: .88rem; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-train"></i> Every Tuesday Update — Rake Movement Coordination
                            </strong>
                            <span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: .7rem;">
                                ${days[1]?.formatted || 'Tuesday'}
                            </span>
                        </div>
                        <div style="overflow-x: auto;">
                            <table class="roster-compact-table" style="width: 100%; font-size: .75rem;">
                                <thead>
                                    <tr>
                                        <th style="width: 120px;">Primary / Backup</th>
                                        <th>Railway Zones</th>
                                        <th style="width: 130px; text-align: center;">Last Ingested</th>
                                        <th style="width: 110px; text-align: center;">Status</th>
                                        <th style="width: 80px; text-align: right;">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rakeRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            const footerHtml = `
                <button class="btn btn-outline" onclick="window.App.closeModal()">Close</button>
            `;

            window.App.showModal(`Week ${w} Daily Operational Audit`, bodyHtml, footerHtml, 'modal-wide');

            // Wire re-verify button
            document.getElementById('btn-reverify-week-mysql')?.addEventListener('click', async () => {
                const btn = document.getElementById('btn-reverify-week-mysql');
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying...`;
                }
                await this.loadScrapperMatrix();
                await this.openWeekDateAuditModal(w);
                window.App.showToast('MySQL verification complete.', 'success');
            });

            // Wire substitute button on any day
            document.querySelectorAll('.btn-sub-duty-day').forEach(b => {
                b.addEventListener('click', () => {
                    const role = b.dataset.role;
                    const dateStr = b.dataset.date;
                    const user = b.dataset.user;
                    const currentBackup = b.dataset.backup;
                    this.openAssignBackupModal(role, w, dateStr, user, currentBackup);
                });
            });

        } catch (e) {
            console.error('Error loading week detail:', e);
            window.App.showToast('Error loading date-wise audit view.', 'error');
        }
    },

    openAssignBackupModal(role, weekNum, targetDate, primaryUser, currentBackup = '') {
        const teammates = this.rosterPeople || ['Bhawna', 'Nitesh', 'Gopi', 'Pankaj', 'Nishant'];
        const otherTeammates = teammates.filter(t => t.toLowerCase() !== (primaryUser || '').toLowerCase());
        const defaultBackup = currentBackup || (otherTeammates[0] || 'Pankaj');

        const body = `
            <div style="font-size: .85rem;">
                <p style="color: var(--text-secondary); margin-bottom: 14px;">
                    Designate a <strong>Backup Assignee</strong> to upload data and perform the task if <strong>${App.escapeHtml(primaryUser)}</strong> is on holiday or leave.
                </p>

                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--text-muted); font-size: .78rem;">Role / Duty:</span>
                        <strong style="color: #60a5fa;">${App.escapeHtml(role)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--text-muted); font-size: .78rem;">Target Date:</span>
                        <strong style="color: var(--text-primary); font-family: monospace;">${targetDate || `All of Week ${weekNum}`}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-muted); font-size: .78rem;">Designated Primary:</span>
                        <strong style="color: #f59e0b;">${App.escapeHtml(primaryUser)}</strong>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">
                        Select Backup / Substitute Assignee
                    </label>
                    <select id="modal-sub-person" style="width: 100%; font-size: .85rem; padding: 8px 12px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                        ${otherTeammates.map(t => `<option value="${t}" ${t === defaultBackup ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">
                        Apply Scope
                    </label>
                    <select id="modal-sub-scope" style="width: 100%; font-size: .85rem; padding: 8px 12px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                        <option value="SINGLE">This Specific Day Only (${targetDate})</option>
                        <option value="WEEK">Entire Week ${weekNum} (All 7 Days)</option>
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">
                        Holiday / Leave Reason
                    </label>
                    <input type="text" id="modal-sub-reason" value="On Holiday / Planned Leave" placeholder="e.g. On Holiday / Sick Leave" style="width: 100%; font-size: .85rem; padding: 8px 12px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border);">
                </div>

                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 8px 12px; font-size: .75rem; color: #fbbf24;">
                    <i class="fas fa-info-circle"></i> When assigned, the surveillance engine will verify task completion by the backup assignee and reflect their name on the daily audit table.
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="window.App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-sub-assignment">
                <i class="fas fa-save"></i> Save Backup Assignee
            </button>
        `;

        window.App.showModal(`Assign Holiday Backup — ${role}`, body, footer, 'modal-lg');

        document.getElementById('btn-save-sub-assignment')?.addEventListener('click', async () => {
            const backupPerson = document.getElementById('modal-sub-person').value;
            const scope = document.getElementById('modal-sub-scope').value;
            const reason = document.getElementById('modal-sub-reason').value.trim() || 'On Holiday / Planned Leave';
            const saveBtn = document.getElementById('btn-save-sub-assignment');

            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

            try {
                const payload = {
                    dutyRole: role,
                    primaryUser: primaryUser,
                    backupUser: backupPerson,
                    weekNumber: weekNum,
                    targetDate: (scope === 'SINGLE') ? targetDate : 'ALL',
                    isOnLeave: true,
                    reason: reason
                };

                const res = await api.post('/roster/assign-backup', payload);
                if (res && res.success) {
                    window.App.showToast(res.message || 'Backup substitute assigned successfully!', 'success');
                    window.App.closeModal();
                    await this.loadScrapperMatrix();
                    this.openWeekDateAuditModal(weekNum);
                } else {
                    window.App.showToast(res?.message || 'Failed to assign backup', 'error');
                }
            } catch (err) {
                console.error('Error assigning backup:', err);
                window.App.showToast('Error saving backup assignment.', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save"></i> Save Backup Assignee`;
            }
        });
    },

    setSelectedScrapperWeek(w) {
        this.selectedScrapperWeek = w;
        const badge = document.getElementById('badge-scrapper-active-week');
        const monthSuffix = this.dateMeta && this.dateMeta.currentMonth ? ` · ${this.dateMeta.currentMonth}` : '';
        if (badge) badge.innerHTML = `<i class="fas fa-calendar-check" style="margin-right: 4px;"></i> Active: Week ${w}${monthSuffix}`;

        document.querySelectorAll('.scrapper-week-btn').forEach(btn => {
            const bw = parseInt(btn.dataset.week, 10);
            const isActive = bw === w;
            btn.classList.toggle('active', isActive);
            if (isActive) {
                btn.style.background = '#3b82f6';
                btn.style.color = '#ffffff';
                btn.style.fontWeight = '700';
            } else {
                btn.style.background = '';
                btn.style.color = '';
                btn.style.fontWeight = '';
            }
        });

        // Highlight active week column in scrapper-matrix-table
        document.querySelectorAll('#scrapper-matrix-table .scrapper-week-col, #scrapper-matrix-table .scrapper-cell').forEach(cell => {
            const cw = parseInt(cell.dataset.week, 10);
            if (cw === w) {
                cell.style.background = 'rgba(96, 165, 250, 0.14)';
                cell.style.borderLeft = '2px solid #3b82f6';
                cell.style.borderRight = '2px solid #3b82f6';
            } else {
                cell.style.background = '';
                cell.style.borderLeft = '';
                cell.style.borderRight = '';
            }
        });
    },

    async applyScrapperWeek(w) {
        try {
            const res = await api.post('/roster/apply-week', { week: w });
            if (res && res.success) {
                window.App.showToast(res.message || `Roster plan synced to Week ${w} from Scrapper For REf.xlsx`, 'success');
                this.setSelectedScrapperWeek(w);
                this.loadRosterLogs();
            } else {
                window.App.showToast(res.message || 'Failed to apply week', 'error');
            }
        } catch (e) {
            console.error('Error applying scrapper week:', e);
            window.App.showToast('Error applying week to roster.', 'error');
        }
    },

    async loadWeatherRotation() {
        try {
            const res = await api.get('/crishi/roster/weather-rotation');
            if (res && res.success && res.weeks) {
                this.updateWeatherUI(res.weeks, res.current_assignee);
            }
        } catch (e) {
            console.error('Error loading weather rotation:', e);
        }
    },

    updateWeatherUI(weeks, currentAssignee) {
        if (!weeks || !Array.isArray(weeks)) return;
        const currentWeekObj = weeks.find(w => w.is_current) || weeks[0];
        const dateRangeStr = currentWeekObj?.date_range || '';

        const badge = document.getElementById('badge-weather-current');
        if (badge) {
            badge.innerHTML = `<i class="fas fa-calendar-check" style="margin-right: 4px;"></i> Active This Week (${dateRangeStr}): <strong style="margin-left: 4px; color: #22c55e;">${currentAssignee || currentWeekObj?.assignee || 'Pankaj'}</strong>`;
        }

        const grid = document.getElementById('weather-weeks-grid');
        if (grid) {
            grid.innerHTML = weeks.map((w, idx) => {
                const weekNum = w.week || (idx + 1);
                const assignee = w.assignee || 'Pankaj';
                const isCur = !!w.is_current;
                const dRange = w.date_range || '';
                return `
                    <div style="background: ${isCur ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255,255,255,0.03)'}; border: ${isCur ? '1.5px solid #22c55e' : '1px solid var(--border)'}; border-radius: 8px; padding: 10px 8px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; box-shadow: ${isCur ? '0 0 10px rgba(34,197,94,0.2)' : 'none'};">
                        <div>
                            <div style="font-size: .78rem; font-weight: 800; color: ${isCur ? '#22c55e' : 'var(--text-primary)'}; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span>Week ${weekNum}</span>
                                ${isCur ? '<span style="background: #22c55e; color: #000; font-size: .6rem; font-weight: 900; padding: 1px 4px; border-radius: 4px;">ACTIVE</span>' : ''}
                            </div>
                            <div style="font-size: .68rem; font-weight: 600; color: #38bdf8; margin-top: 4px;">
                                <i class="fas fa-calendar-alt" style="font-size: .62rem; margin-right: 2px;"></i> ${dRange}
                            </div>
                        </div>
                        <select class="weather-week-select" data-week="${weekNum}" style="width: 100%; background: var(--bg-secondary); border: 1px solid ${isCur ? '#22c55e' : 'var(--border)'}; padding: 4px 6px; border-radius: 6px; color: var(--text-primary); font-size: .78rem; font-weight: 700; margin-top: 4px;">
                            <option value="Pankaj" ${assignee === 'Pankaj' ? 'selected' : ''}>Pankaj</option>
                            <option value="Bhawna" ${assignee === 'Bhawna' ? 'selected' : ''}>Bhawna</option>
                            <option value="Pankaj & Bhawna" ${assignee === 'Pankaj & Bhawna' ? 'selected' : ''}>Both</option>
                        </select>
                    </div>
                `;
            }).join('');

            grid.querySelectorAll('.weather-week-select').forEach(sel => {
                sel.addEventListener('change', () => {
                    const updatedWeeks = [];
                    grid.querySelectorAll('.weather-week-select').forEach(s => {
                        const wNum = parseInt(s.dataset.week, 10);
                        updatedWeeks.push({ week: wNum, assignee: s.value });
                    });
                    this.saveWeatherRotation(updatedWeeks);
                });
            });
        }
    },

    async saveWeatherRotation(weeks) {
        try {
            const res = await api.post('/crishi/roster/weather-rotation', { weeks });
            if (res && res.success) {
                window.App.showToast(res.message || 'Weather duty rotation updated successfully!', 'success');
                await this.loadWeatherRotation();
            } else {
                window.App.showToast(res.message || 'Failed to update weather rotation', 'error');
            }
        } catch (e) {
            console.error('Error saving weather rotation:', e);
            window.App.showToast('Error saving weather rotation.', 'error');
        }
    },

    applyWeatherPreset(preset) {
        const weeks = [];
        for (let w = 1; w <= 8; w++) {
            let assignee = 'Pankaj';
            if (preset === 'alt_pankaj') {
                assignee = (w % 2 !== 0) ? 'Pankaj' : 'Bhawna';
            } else if (preset === 'alt_bhawna') {
                assignee = (w % 2 !== 0) ? 'Bhawna' : 'Pankaj';
            } else if (preset === 'all_pankaj') {
                assignee = 'Pankaj';
            } else if (preset === 'all_bhawna') {
                assignee = 'Bhawna';
            }
            weeks.push({ week: w, assignee: assignee, label: `Week ${w}` });
        }
        this.saveWeatherRotation(weeks);
    },

    highlightActiveKpiCards() {
        const kpiMap = {
            'ALL': 'card-total-coverage',
            'PASS': 'card-updated-today',
            'FAIL': 'card-pending-action',
            'WINDOW': 'card-cycle-windows',
            'NEED_CORRECTION': 'card-need-correction',
            'REMARK': 'card-remarks-count'
        };

        // Top KPI cards
        document.querySelectorAll('.crishi-kpi-card').forEach(c => c.classList.remove('active-kpi-card'));
        const activeCardId = kpiMap[this.activeStatusFilter];
        if (activeCardId) {
            document.getElementById(activeCardId)?.classList.add('active-kpi-card');
        }

        // Cadence aggregate cards
        document.querySelectorAll('.cadence-agg-card').forEach(c => c.classList.remove('active-cadence-card'));
        if (this.activeFrequencyFilter === 'Daily') {
            document.getElementById('card-cadence-daily')?.classList.add('active-cadence-card');
        } else if (this.activeFrequencyFilter === 'Weekly') {
            document.getElementById('card-cadence-weekly')?.classList.add('active-cadence-card');
        } else if (this.activeFrequencyFilter === 'Monthly') {
            document.getElementById('card-cadence-monthly')?.classList.add('active-cadence-card');
        }

        // Date-wise KPI boxes inside Date-Wise View
        document.querySelectorAll('.date-kpi-box').forEach(b => b.classList.remove('active-date-kpi'));
        if (this.activeStatusFilter === 'ALL') {
            document.getElementById('date-kpi-total')?.classList.add('active-date-kpi');
        } else if (this.activeStatusFilter === 'PASS') {
            document.getElementById('date-kpi-updated')?.classList.add('active-date-kpi');
        } else if (this.activeStatusFilter === 'FAIL') {
            document.getElementById('date-kpi-pending')?.classList.add('active-date-kpi');
        }
    },

    setFilterStatus(status) {
        // Toggle behavior: if clicking already active status, reset to 'ALL' (unless already 'ALL')
        if (this.activeStatusFilter === status && status !== 'ALL') {
            this.activeStatusFilter = 'ALL';
        } else {
            this.activeStatusFilter = status;
        }

        // Sync status buttons across all panels
        document.querySelectorAll('button[data-status]').forEach(b => {
            if (b.dataset.status === this.activeStatusFilter) {
                b.classList.add('active-filter-status');
            } else {
                b.classList.remove('active-filter-status');
            }
        });

        this.highlightActiveKpiCards();
        this.applyFilters();
    },

    setSurveillanceViewMode(mode) {
        this.surveillanceViewMode = mode;
        document.querySelectorAll('.crishi-subtab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-mode-${mode}`)?.classList.add('active');

        const pTable = document.getElementById('surveillance-table-panel');
        const pComm = document.getElementById('surveillance-commodity-panel');
        const pDate = document.getElementById('surveillance-date-panel');

        if (pTable) pTable.classList.toggle('hidden', mode !== 'table');
        if (pComm) pComm.classList.toggle('hidden', mode !== 'commodity');
        if (pDate) pDate.classList.toggle('hidden', mode !== 'date');

        const lbl = document.getElementById('surveillance-view-label');
        if (lbl) {
            if (mode === 'table') lbl.innerHTML = '<i class="fas fa-info-circle"></i> Granular table-by-table surveillance with Today Status verification';
            else if (mode === 'commodity') lbl.innerHTML = `<i class="fas fa-cubes"></i> Sector rollup across individual commodities (${this.commodityRollups.length || 21} commodities) with progress bars and table rosters`;
            else if (mode === 'date') lbl.innerHTML = `<i class="fas fa-calendar-day"></i> Operational audit for <strong>${this.selectedSurveillanceDate || getTodayIsoDate()}</strong>`;
        }

        if (mode === 'commodity') this.renderCommodityView();
        if (mode === 'date') {
            this.renderDateWiseView();
        } else if (mode === 'table') {
            this.applyFilters();
        }
    },

    applyFilters() {
        const q = (this.activeSearchQuery || document.getElementById('crishi-search')?.value || document.getElementById('date-crishi-search')?.value || '').toLowerCase().trim();
        const pipeFilter = this.activePipelineFilter || document.getElementById('filter-pipeline')?.value || '';
        const commFilter = this.activeCommodityFilter || document.getElementById('filter-commodity')?.value || document.getElementById('date-filter-commodity')?.value || '';
        const freqFilter = this.activeFrequencyFilter || document.getElementById('filter-frequency')?.value || document.getElementById('date-filter-frequency')?.value || '';
        const assigneeFilter = (this.activeAssigneeFilter || document.getElementById('filter-assignee')?.value || document.getElementById('date-filter-assignee')?.value || '').toLowerCase().trim();
        const todayFilter = this.activeTodayStatusFilter || document.getElementById('filter-today-status')?.value || document.getElementById('date-filter-today-status')?.value || '';

        // Sync inputs in both panels
        ['crishi-search', 'date-crishi-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== this.activeSearchQuery) el.value = this.activeSearchQuery;
        });
        ['filter-assignee', 'date-filter-assignee'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== this.activeAssigneeFilter) el.value = this.activeAssigneeFilter;
        });
        ['filter-commodity', 'date-filter-commodity'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== this.activeCommodityFilter) el.value = this.activeCommodityFilter;
        });
        ['filter-frequency', 'date-filter-frequency'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== this.activeFrequencyFilter) el.value = this.activeFrequencyFilter;
        });
        ['filter-today-status', 'date-filter-today-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== this.activeTodayStatusFilter) el.value = this.activeTodayStatusFilter;
        });

        this.filteredTasks = this.tasks.filter(t => {
            // User workload chip filter
            const matchUser = (!this.activeUserFilter || this.activeUserFilter === 'ALL') || (t.user && t.user.toLowerCase().includes(this.activeUserFilter.toLowerCase()));

            // Assignee dropdown filter
            const matchAssignee = !assigneeFilter || (t.user && t.user.toLowerCase().includes(assigneeFilter));

            // Today Status dropdown filter
            let matchTodayStatus = true;
            if (todayFilter === 'DONE') {
                matchTodayStatus = Boolean(t.is_updated_today);
            } else if (todayFilter === 'REVISION') {
                matchTodayStatus = (t.today_status === 'NEED_CORRECTION');
            } else if (todayFilter === 'LATE') {
                matchTodayStatus = (t.today_status === 'LATE_TODAY');
            } else if (todayFilter === 'PENDING') {
                matchTodayStatus = (t.today_status === 'PENDING_TODAY');
            } else if (todayFilter === 'WINDOW') {
                matchTodayStatus = (t.today_status === 'WINDOW_ACTIVE' || t.today_status === 'AWAITING_WINDOW');
            }

            // Status quick pills / KPI filter
            let matchStatus = true;
            if (this.activeStatusFilter === 'PASS') {
                matchStatus = (t.status === 'PASS' || t.status === 'SKIP' || Boolean(t.is_updated_today));
            } else if (this.activeStatusFilter === 'FAIL') {
                matchStatus = (t.status === 'FAIL' || (!t.is_updated_today && t.status !== 'PASS'));
            } else if (this.activeStatusFilter === 'NEED_CORRECTION') {
                matchStatus = (t.status === 'NEED_CORRECTION' || t.today_status === 'NEED_CORRECTION');
            } else if (this.activeStatusFilter === 'NOT_CORRECT') {
                matchStatus = (t.status === 'NOT_CORRECT');
            } else if (this.activeStatusFilter === 'WINDOW') {
                matchStatus = (t.status === 'WINDOW_ACTIVE' || t.status === 'AWAITING_WINDOW' || (t.raw_table && t.raw_table.includes('trade_flow')));
            } else if (this.activeStatusFilter === 'REMARK') {
                matchStatus = Boolean((t.user_remark && t.user_remark.trim()) || (t.manager_message && t.manager_message.trim()));
            } else if (this.activeStatusFilter === 'AWAITING_PULL') {
                matchStatus = (t.status === 'AWAITING_PULL');
            }

            // Pipeline filter (SOPA, IPGA, PyExcel, PyStage, Other)
            let matchPipeline = true;
            if (pipeFilter) {
                matchPipeline = (t.source_pipeline && t.source_pipeline.toLowerCase() === pipeFilter.toLowerCase());
            }

            // Commodity filter (split by comma to avoid partial substring collisions like Tur matching Turmeric)
            const pulseSub = ['bengal gram', 'tur', 'urad', 'moong', 'masoor', 'pea', 'chana'];
            const tComms = (t.commodity || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            const cLow = commFilter ? commFilter.toLowerCase().trim() : '';
            const matchComm = !cLow || (
                tComms.includes(cLow) ||
                (cLow === 'pulses' && (tComms.includes('pulses') || tComms.some(p => pulseSub.includes(p)))) ||
                (t.commodity && t.commodity.toLowerCase() === cLow)
            );

            // Frequency filter
            const matchFreq = !freqFilter || (t.frequency && t.frequency.toLowerCase() === freqFilter.toLowerCase());

            // Search query
            const matchQ = !q ||
                (t.raw_table && t.raw_table.toLowerCase().includes(q)) ||
                (t.final_name && t.final_name.toLowerCase().includes(q)) ||
                (t.commodity && t.commodity.toLowerCase().includes(q)) ||
                (t.user && t.user.toLowerCase().includes(q)) ||
                (t.source_pipeline && t.source_pipeline.toLowerCase().includes(q)) ||
                (t.manager_message && t.manager_message.toLowerCase().includes(q)) ||
                (t.user_remark && t.user_remark.toLowerCase().includes(q));

            return matchUser && matchAssignee && matchTodayStatus && matchStatus && matchPipeline && matchComm && matchFreq && matchQ;
        });

        // Apply Sorting
        const mul = this.currentSortDir === 'desc' ? -1 : 1;
        const col = this.currentSortCol;
        const cadenceOrder = { 'daily': 1, 'weekly': 2, 'fortnightly': 3, 'monthly': 4, 'quarterly': 5, 'half-yearly': 6, 'yearly': 7, 'occasionally': 8 };

        this.filteredTasks.sort((a, b) => {
            if (col === 'assignee') {
                const va = (a.user || '').toLowerCase();
                const vb = (b.user || '').toLowerCase();
                return va.localeCompare(vb) * mul;
            } else if (col === 'commodity') {
                const va = (a.commodity || '').toLowerCase();
                const vb = (b.commodity || '').toLowerCase();
                return va.localeCompare(vb) * mul;
            } else if (col === 'raw') {
                const va = (a.raw_table || '').toLowerCase();
                const vb = (b.raw_table || '').toLowerCase();
                return va.localeCompare(vb) * mul;
            } else if (col === 'title') {
                const va = (a.final_name || '').toLowerCase();
                const vb = (b.final_name || '').toLowerCase();
                return va.localeCompare(vb) * mul;
            } else if (col === 'cadence') {
                const ca = cadenceOrder[(a.frequency || '').toLowerCase()] || 99;
                const cb = cadenceOrder[(b.frequency || '').toLowerCase()] || 99;
                if (ca !== cb) return (ca - cb) * mul;
                return (a.frequency || '').localeCompare(b.frequency || '') * mul;
            } else if (col === 'last_date') {
                const da = a.last_updated || '';
                const db = b.last_updated || '';
                return da.localeCompare(db) * mul;
            } else if (col === 'today_status') {
                const tsa = (a.today_badge_text || a.today_status || '').toLowerCase();
                const tsb = (b.today_badge_text || b.today_status || '').toLowerCase();
                return tsa.localeCompare(tsb) * mul;
            } else if (col === 'status') {
                const sa = (a.status || '').toLowerCase();
                const sb = (b.status || '').toLowerCase();
                return sa.localeCompare(sb) * mul;
            }
            return 0;
        });

        // Update sort icons and active styling on headers in both tables
        document.querySelectorAll('#crishi-master-table th.crishi-sortable-th, #date-master-table th.crishi-sortable-th').forEach(th => {
            const thCol = th.dataset.col;
            const icon = th.querySelector('.crishi-sort-icon');
            if (!icon) return;
            if (thCol === this.currentSortCol) {
                th.style.color = '#60a5fa';
                icon.className = this.currentSortDir === 'desc' ? 'fas fa-sort-down crishi-sort-icon' : 'fas fa-sort-up crishi-sort-icon';
                icon.style.opacity = '1';
                icon.style.color = '#60a5fa';
            } else {
                th.style.color = '';
                icon.className = 'fas fa-sort crishi-sort-icon';
                icon.style.opacity = '0.35';
                icon.style.color = '';
            }
        });

        // Sync Sort Dropdowns in both panels
        ['filter-sort', 'date-filter-sort'].forEach(id => {
            const sortSel = document.getElementById(id);
            if (sortSel) {
                sortSel.value = `${this.currentSortCol}_${this.currentSortDir}`;
            }
        });

        // Update workload hint text in both panels
        const hintText = TEAMMATE_DESCRIPTIONS[this.activeUserFilter] || `Showing ${this.filteredTasks.length} tasks assigned to ${this.activeUserFilter}`;
        ['user-workload-hint', 'date-user-workload-hint'].forEach(id => {
            const hint = document.getElementById(id);
            if (hint) hint.textContent = hintText;
        });

        this.renderTableRows();
        this.renderDateWiseTableRows();
        this.bindTableActionButtons();
    },

    getCommodityBadgeHtml(commodityStr) {
        if (!commodityStr || commodityStr === 'General / Other') {
            const cStyle = COMMODITY_COLORS['General / Other'] || { bg: 'rgba(148,163,184,0.15)', text: '#cbd5e1', border: 'rgba(148,163,184,0.3)' };
            return `<span class="badge comm-badge" style="background: ${cStyle.bg}; color: ${cStyle.text}; border: 1px solid ${cStyle.border}; font-weight: 700; font-size: .70rem; padding: 2px 7px; border-radius: 12px; white-space: nowrap;">General</span>`;
        }

        const commList = commodityStr.split(',').map(s => s.trim()).filter(Boolean);
        if (commList.length === 1) {
            const c = commList[0];
            const cStyle = COMMODITY_COLORS[c] || COMMODITY_COLORS['General / Other'] || { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' };
            return `<span class="badge comm-badge" style="background: ${cStyle.bg}; color: ${cStyle.text}; border: 1px solid ${cStyle.border}; font-weight: 700; font-size: .70rem; padding: 2px 7px; border-radius: 12px; white-space: nowrap;" title="${c}">${c}</span>`;
        }

        // 10+ items = Macro agricultural bundle
        if (commList.length >= 10) {
            return `
                <span class="badge comm-badge" style="background: rgba(96,165,250,0.15); color: #60a5fa; border: 1px solid rgba(96,165,250,0.35); font-weight: 700; font-size: .70rem; padding: 2px 7px; border-radius: 12px; white-space: nowrap;" title="${commodityStr}">
                    <i class="fas fa-layer-group" style="margin-right: 3px;"></i> All Agri (${commList.length})
                </span>
            `;
        }

        // Pulses group (Bengal Gram, Tur, Urad, Moong, Masoor, Pea)
        const isPulses = commList.some(c => ['Tur', 'Urad', 'Moong', 'Masoor', 'Bengal Gram', 'Pea', 'Chana'].includes(c));
        if (isPulses && commList.length >= 3) {
            const cStyle = COMMODITY_COLORS['Bengal Gram'] || { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' };
            return `
                <div style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="${commodityStr}">
                    <span class="badge comm-badge" style="background: ${cStyle.bg}; color: ${cStyle.text}; border: 1px solid ${cStyle.border}; font-weight: 700; font-size: .70rem; padding: 2px 7px; border-radius: 12px;">
                        <i class="fas fa-seedling" style="margin-right: 3px;"></i> Pulses
                    </span>
                    <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border); font-size: .65rem; padding: 1px 5px; border-radius: 10px;">
                        +${commList.length}
                    </span>
                </div>
            `;
        }

        // 2 commodities: show first pill + count
        const first = commList[0];
        const fStyle = COMMODITY_COLORS[first] || { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' };
        return `
            <div style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="${commodityStr}">
                <span class="badge comm-badge" style="background: ${fStyle.bg}; color: ${fStyle.text}; border: 1px solid ${fStyle.border}; font-weight: 700; font-size: .70rem; padding: 2px 7px; border-radius: 12px;">
                    ${first}
                </span>
                <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border); font-size: .65rem; padding: 1px 5px; border-radius: 10px;">
                    +${commList.length - 1}
                </span>
            </div>
        `;
    },

    getRemarksReviewHtml(t) {
        let remarksReviewHtml = '';
        const hasManagerMsg = Boolean(t.manager_message && t.manager_message.trim());
        const hasUserRemark = Boolean(t.user_remark && t.user_remark.trim());
        const isEdited = Boolean(t.is_edited);
        const esc = (s) => (window.App?.escapeHtml ? window.App.escapeHtml(s || '') : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

        if (hasManagerMsg && hasUserRemark) {
            remarksReviewHtml = `
                <div style="display: flex; align-items: center; gap: 4px; max-width: 100%; white-space: nowrap;">
                    <div class="manager-msg-chip" title="Manager Instruction: ${esc(t.manager_message)}" style="max-width: 75px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span class="manager-msg-text">${esc(t.manager_message)}</span>
                    </div>
                    <div class="remark-bubble remark-compact-pill" data-id="${t.id}" title="${esc(t.user_remark)}" style="max-width: 85px;">
                        <i class="fas fa-comment-dots" style="color: #60a5fa; font-size: .68rem; flex-shrink: 0;"></i>
                        <span class="remark-text-concise">${esc(t.user_remark.substring(0, 12))}…</span>
                    </div>
                </div>
            `;
            return remarksReviewHtml;
        }

        if (hasManagerMsg) {
            remarksReviewHtml = `
                <div class="manager-msg-chip" title="Manager Instruction: ${esc(t.manager_message)}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span class="manager-msg-text"><strong>Manager:</strong> ${esc(t.manager_message)}</span>
                </div>
            `;
            return remarksReviewHtml;
        }

        if (hasUserRemark) {
            let tag = '';
            let bodyText = (t.user_remark || '').trim();
            const tagMatch = bodyText.match(/^\[(.*?)\]\s*(.*)$/s);
            if (tagMatch) {
                tag = tagMatch[1].trim();
                bodyText = tagMatch[2].trim();
            }

            // Word limiter: keep it concise so row height never stretches
            const words = bodyText.split(/\s+/).filter(Boolean);
            const maxWords = 3;
            const limitedBody = words.length > maxWords
                ? words.slice(0, maxWords).join(' ') + '…'
                : (bodyText || 'View note');

            let shortTag = tag;
            if (shortTag) {
                if (/dgcis/i.test(shortTag) && /delay/i.test(shortTag)) {
                    shortTag = 'DGCIS Delay';
                } else if (/delay/i.test(shortTag)) {
                    shortTag = 'Delayed';
                } else if (shortTag.length > 12) {
                    shortTag = shortTag.replace(/\(.*?\)/g, '').trim();
                    if (shortTag.length > 12) shortTag = shortTag.substring(0, 10) + '…';
                }
            }

            const author = t.user_remark_by || t.user || 'Teammate';
            const timeStr = t.user_remark_at || '';
            const fullTitle = `${tag ? `[${tag}] ` : ''}${bodyText}\n~ ${author}${timeStr ? ` (${timeStr})` : ''}\n• Click to view full note & audit history`;

            const editedBadge = isEdited ? `
                <span class="wa-edited-badge" data-id="${t.id}" title="Edited · Click to view edit audit log">
                    (ed)
                </span>
            ` : '';

            remarksReviewHtml = `
                <div class="remark-bubble remark-compact-pill" data-id="${t.id}" title="${esc(fullTitle)}">
                    ${shortTag ? `
                        <span class="remark-tag-pill" title="${esc(tag)}">
                            <i class="fas fa-comment-dots"></i>
                            <span>${esc(shortTag)}</span>
                        </span>
                    ` : `
                        <i class="fas fa-comment-dots" style="color: #60a5fa; font-size: .68rem; flex-shrink: 0;"></i>
                    `}
                    <span class="remark-text-concise">
                        ${esc(limitedBody)}
                    </span>
                    <div class="remark-actions-inline">
                        ${editedBadge}
                        <button class="btn-user-edit-remark" data-id="${t.id}" title="Edit operational remark">
                            <i class="fas fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
            return remarksReviewHtml;
        }

        // Empty state: single clean button
        return `
            <button class="remark-add-btn btn-user-add-remark" data-id="${t.id}" title="Add delay reason or note">
                <i class="fas fa-plus"></i> Remark
            </button>
        `;
    },

    getTodayBadgeHtml(t) {
        const cls = t.today_badge_class || 'badge-warning';
        const fullTooltip = t.today_badge_text || (t.is_updated_today ? 'Updated Today' : 'Pending');
        let icon = '<i class="fas fa-clock" style="color: #f59e0b;"></i>';
        let label = 'Pending';

        if (t.is_updated_today) {
            icon = '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
            label = t.today_status === 'CYCLE_UPDATED' ? 'Cycle Done' : 'Updated';
        } else if (t.today_status === 'LATE_TODAY') {
            icon = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>';
            label = 'Overdue';
        } else if (t.today_status === 'PENDING_TODAY') {
            icon = '<i class="fas fa-clock" style="color: #f59e0b;"></i>';
            const match = (t.today_badge_text || '').match(/Due\s*([0-9:]+)/i);
            label = match ? `Due ${match[1]}` : 'Pending';
        } else if (t.today_status === 'WINDOW_ACTIVE') {
            icon = '<i class="fas fa-calendar-alt" style="color: #0ea5e9;"></i>';
            label = '15th–20th';
        } else if (t.today_status === 'NEED_CORRECTION') {
            icon = '<i class="fas fa-tools" style="color: #fbbf24;"></i>';
            label = 'Revision';
        } else if (t.today_status === 'NOT_CORRECT') {
            icon = '<i class="fas fa-times-circle" style="color: #ef4444;"></i>';
            label = 'Incorrect';
        } else if (t.today_status === 'SKIPPED') {
            icon = '<i class="fas fa-forward" style="color: #94a3b8;"></i>';
            label = 'Skipped';
        } else {
            label = t.today_badge_text || 'Pending';
            if (label.length > 14) label = 'Pending';
        }

        return `<span class="today-badge ${cls}" title="${fullTooltip}">${icon} ${label}</span>`;
    },

    getActionButtonsHtml(t, isCompact = false) {
        const isMonthlyYearly = (t.frequency === 'Monthly' || t.frequency === 'Yearly' || t.frequency === 'Occasionally');
        const pad = isCompact ? 'padding: 2px 7px; font-size: .72rem;' : 'padding: 3px 8px; font-size: .75rem;';
        const isAdmin = ['SuperAdmin', 'Manager', 'Leader', 'Admin'].includes(window.currentUser?.role);

        if (!isAdmin) {
            return `
                <div class="crishi-actions-wrap">
                    <!-- Quick Verify DB Button -->
                    <button class="btn btn-outline btn-sm btn-quick-sync-db" data-id="${t.id}" title="Verify this table update in MySQL" style="${pad} color: #10b981; border-color: rgba(16,185,129,0.35);">
                        <i class="fas fa-sync-alt"></i> Verify
                    </button>
                </div>
            `;
        }

        return `
            <div class="crishi-actions-wrap">
                <!-- Manager Review Action Button -->
                <button class="btn btn-outline btn-sm btn-manager-review" data-id="${t.id}" title="Manager Action: Not Correct, Pending, Need Correction, Pass" style="${pad} color: #f59e0b; border-color: rgba(245,158,11,0.35);">
                    <i class="fas fa-clipboard-check"></i> Action
                </button>

                <!-- Quick Verify DB Button -->
                <button class="btn btn-outline btn-sm btn-quick-sync-db" data-id="${t.id}" title="Verify this table update in MySQL" style="${pad} color: #10b981; border-color: rgba(16,185,129,0.35);">
                    <i class="fas fa-sync-alt"></i> Verify
                </button>

                ${isMonthlyYearly && t.status === 'AWAITING_PULL' ? `
                    <button class="btn btn-primary btn-sm btn-action-pull" data-id="${t.id}" title="Manager Pull Signal" style="${pad}">
                        <i class="fas fa-play"></i> Pull
                    </button>
                ` : ''}

                <button class="btn btn-outline btn-sm btn-action-skip" data-id="${t.id}" title="Admin Skip" style="${pad}">
                    <i class="fas fa-forward"></i>
                </button>
            </div>
        `;
    },

    renderTableRows() {
        const tbody = document.getElementById('crishi-tbody');
        const countSpan = document.getElementById('crishi-table-count');
        if (!tbody) return;

        if (countSpan) {
            countSpan.innerHTML = `Showing <strong>${this.filteredTasks.length}</strong> of <strong>${this.tasks.length}</strong> monitored tables in agalabsdev_stage`;
        }

        if (this.filteredTasks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 48px; color: var(--text-muted);">
                        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.3;"></i>
                        No surveillance records found matching your filters.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.filteredTasks.map(t => {
            const commStyle = COMMODITY_COLORS[t.commodity] || COMMODITY_COLORS['General / Other'];

            // Status Pill HTML
            let statusHtml = '';
            if (t.status === 'PASS') {
                statusHtml = `<span class="status-pill pass" title="Updated on time in DB"><i class="fas fa-check-circle"></i> PASS</span>`;
            } else if (t.status === 'NEED_CORRECTION') {
                statusHtml = `<span class="status-pill need-correction" title="Manager marked Needs Correction"><i class="fas fa-tools"></i> REVISION</span>`;
            } else if (t.status === 'NOT_CORRECT') {
                statusHtml = `<span class="status-pill not-correct" title="Manager marked Rejected / Discrepancy"><i class="fas fa-times-circle"></i> REJECTED</span>`;
            } else if (t.status === 'PENDING') {
                statusHtml = `<span class="status-pill pending" title="Manager marked Pending"><i class="fas fa-hourglass-start"></i> PENDING</span>`;
            } else if (t.status === 'FAIL') {
                statusHtml = `<span class="status-pill fail" title="Late: missing DB update"><i class="fas fa-exclamation-circle"></i> LATE</span>`;
            } else if (t.status === 'WINDOW_ACTIVE') {
                statusHtml = `<span class="status-pill window-active" title="Monthly submission window open"><i class="fas fa-clock"></i> CYCLE DUE</span>`;
            } else if (t.status === 'AWAITING_WINDOW') {
                statusHtml = `<span class="status-pill awaiting-window" title="Monthly cycle due 15-20th"><i class="fas fa-calendar-alt"></i> 15–20TH</span>`;
            } else if (t.status === 'SKIP') {
                statusHtml = `<span class="status-pill skip" title="Admin Skipped"><i class="fas fa-forward"></i> SKIPPED</span>`;
            } else if (t.status === 'PULL') {
                statusHtml = `<span class="status-pill pull" title="Manager SLA Active"><i class="fas fa-hourglass-half"></i> PULL SLA</span>`;
            } else {
                statusHtml = `<span class="status-pill awaiting-pull" title="Awaiting Manager Pull"><i class="fas fa-lock"></i> AWAITING</span>`;
            }

            // Pipeline badge style
            const pipeClass = (t.source_pipeline || 'other').toLowerCase();

            // Last Date Display (highlights verified)
            let dateHtml = '';
            if (t.is_verified) {
                dateHtml = `
                    <span title="Verified by ${t.verified_by || 'Manager'} (${t.verified_rows} rows)">
                        <strong style="color: #10b981; font-size: .80rem;">
                            <i class="fas fa-check-circle" style="color: #10b981; font-size: .72rem; margin-right: 3px;"></i>${t.last_updated}
                        </strong>
                    </span>
                `;
            } else {
                dateHtml = `
                    <strong style="color: var(--text-primary); font-size: .80rem;">
                        <i class="fas fa-database" style="color: #60a5fa; font-size: .72rem; margin-right: 3px;"></i>${t.last_updated}
                    </strong>
                `;
            }

            const isMonthlyYearly = (t.frequency === 'Monthly' || t.frequency === 'Yearly' || t.frequency === 'Occasionally');

            const userList = (t.user || 'Unassigned').split(',').map(s => s.trim()).filter(Boolean);
            const userAvatarsHtml = userList.map(u => `
                <span class="user-avatar-chip" title="Assigned to ${u}">
                    <span class="avatar-circle">${u.charAt(0)}</span>
                    <span>${u}</span>
                </span>
            `).join(' ');

            return `
                <tr data-id="${t.id}">
                    <!-- Assignee -->
                    <td class="col-assignee">
                        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden;">
                            ${userAvatarsHtml}
                        </div>
                    </td>

                    <!-- Commodity -->
                    <td class="col-commodity">
                        ${this.getCommodityBadgeHtml(t.commodity)}
                    </td>

                    <!-- Raw Table Name Only -->
                    <td class="col-raw-table">
                        <span class="table-code-tag" title="${t.raw_table}">${t.raw_table}</span>
                    </td>

                    <!-- Final Business Name -->
                    <td class="col-title" title="${t.final_name}">
                        ${t.final_name}
                    </td>

                    <!-- Frequency -->
                    <td class="col-cadence">
                        <span>${t.frequency}</span>
                    </td>

                    <!-- Last Date in DB -->
                    <td class="col-last-date">${dateHtml}</td>

                    <!-- Today Status -->
                    <td class="col-today-status">
                        ${this.getTodayBadgeHtml(t)}
                    </td>

                    <!-- Status -->
                    <td class="col-status">${statusHtml}</td>

                    <!-- Remarks & Manager Review -->
                    <td class="col-remarks">${this.getRemarksReviewHtml(t)}</td>

                    <!-- Actions -->
                    <td class="col-actions">
                        ${this.getActionButtonsHtml(t)}
                    </td>
                </tr>
            `;
        }).join('');

        this.bindTableActionButtons();
    },

    renderCommodityView() {
        const container = document.getElementById('commodity-grid-container');
        if (!container) return;

        let rollups = this.commodityRollups;
        if (!rollups || rollups.length === 0) {
            const map = {};
            this.tasks.forEach(t => {
                const comm = t.commodity || 'General / Other';
                const commParts = comm.split(',').map(c => c.trim()).filter(Boolean);
                if (commParts.length === 0) commParts.push('General / Other');
                commParts.forEach(cp => {
                    if (!map[cp]) {
                        map[cp] = { commodity: cp, total_tables: 0, updated_today: 0, pending_today: 0, completion_pct: 0, assignees: new Set(), tables: [] };
                    }
                    map[cp].total_tables += 1;
                    if (t.is_updated_today) map[cp].updated_today += 1;
                    else map[cp].pending_today += 1;
                    (t.user || '').split(',').forEach(u => { if (u.trim()) map[cp].assignees.add(u.trim()); });
                    map[cp].tables.push(t);
                });
            });
            rollups = Object.values(map).map(c => {
                c.completion_pct = c.total_tables > 0 ? Math.round((c.updated_today / c.total_tables) * 100) : 0;
                c.assignees = Array.from(c.assignees).sort();
                return c;
            }).sort((a, b) => a.commodity.localeCompare(b.commodity));
        }

        container.innerHTML = rollups.map(c => {
            const commStyle = COMMODITY_COLORS[c.commodity] || COMMODITY_COLORS['General / Other'];
            const isOpen = this.expandedCommodities.has(c.commodity);
            const barColor = c.completion_pct === 100 ? '#10b981' : (c.completion_pct > 50 ? '#3b82f6' : '#f59e0b');

            const assigneesChips = (c.assignees || []).map(u => `
                <span class="user-avatar-chip" style="font-size: .72rem; padding: 1px 6px;">
                    <span class="avatar-circle" style="width: 15px; height: 15px; font-size: .55rem;">${u.charAt(0)}</span>
                    <span>${u}</span>
                </span>
            `).join('');

            const miniTablesHtml = (c.tables || []).map(t => {
                const isUp = t.is_updated_today;
                return `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; transition: all 0.15s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                            <div style="min-width: 0; flex: 1;">
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span class="table-code-tag" style="font-size: .78rem; font-weight: 600;">${t.raw_table}</span>
                                    <strong style="color: #60a5fa; font-size: .84rem;">${t.final_name}</strong>
                                </div>
                                <div style="font-size: .72rem; color: var(--text-muted); margin-top: 3px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                    <span><i class="fas fa-user" style="font-size: .65rem;"></i> ${t.user}</span>
                                    <span><i class="fas fa-sync" style="font-size: .65rem;"></i> ${t.frequency}</span>
                                    <span><i class="fas fa-database" style="font-size: .65rem;"></i> DB: <strong style="color: var(--text-primary);">${t.last_updated}</strong></span>
                                </div>
                            </div>
                            <span class="today-badge ${t.today_badge_class || 'badge-warning'}" style="font-size: .7rem; padding: 2px 7px;">
                                ${isUp ? '<i class="fas fa-check-circle" style="color: #10b981;"></i>' : '<i class="fas fa-clock" style="color: #0ea5e9;"></i>'}
                                ${t.today_badge_text || (isUp ? 'Updated' : 'Pending')}
                            </span>
                        </div>

                        <!-- Remarks & Manager Review (wrapped cleanly) -->
                        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.07);">
                            <div style="font-size: .68rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px;">
                                Remarks & Manager Review
                            </div>
                            <div>${this.getRemarksReviewHtml(t)}</div>
                        </div>

                        <!-- Actions -->
                        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.07); display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Actions</span>
                            ${this.getActionButtonsHtml(t, true)}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="commodity-card" style="border-left: 3px solid ${commStyle.text};">
                    <div>
                        <div class="commodity-card-header">
                            <div>
                                <div class="commodity-card-title">
                                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${commStyle.text};"></span>
                                    <span>${c.commodity}</span>
                                </div>
                                <div class="commodity-owners-badge">
                                    <span style="font-size: .7rem; color: var(--text-muted);">Assigned to:</span>
                                    ${assigneesChips || '<span style="color: var(--text-muted);">Unassigned</span>'}
                                </div>
                            </div>
                            <span class="badge" style="background: ${c.completion_pct === 100 ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)'}; color: ${c.completion_pct === 100 ? '#10b981' : '#60a5fa'}; font-weight: 700; font-size: .75rem;">
                                ${c.completion_pct}% Completed
                            </span>
                        </div>

                        <!-- Progress & Stats -->
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: .78rem; margin-top: 6px;">
                            <span style="color: var(--text-secondary);">
                                <strong style="color: #10b981;">${c.updated_today}</strong> / ${c.total_tables} Tables Updated Today
                            </span>
                            <span style="color: ${c.pending_today > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">
                                ${c.pending_today} Pending
                            </span>
                        </div>

                        <div class="commodity-progress-track">
                            <div class="commodity-progress-bar" style="width: ${c.completion_pct}%; background: ${barColor};"></div>
                        </div>
                    </div>

                    <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <button class="btn btn-outline btn-xs btn-toggle-comm-accordion" data-comm="${c.commodity}" style="font-size: .74rem; padding: 4px 10px;">
                            <i class="fas fa-${isOpen ? 'chevron-up' : 'chevron-down'}"></i>
                            <span>${isOpen ? 'Hide Tables' : `View ${c.total_tables} Tables`}</span>
                        </button>
                        <button class="btn btn-link btn-xs btn-filter-comm-table" data-comm="${c.commodity}" style="font-size: .72rem; color: #60a5fa; text-decoration: none;">
                            Filter Table View <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>

                    <div class="commodity-accordion-content ${isOpen ? 'open' : ''}" id="comm-accordion-${encodeURIComponent(c.commodity)}">
                        ${miniTablesHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Bind Accordion Toggles
        container.querySelectorAll('.btn-toggle-comm-accordion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const comm = btn.dataset.comm;
                if (this.expandedCommodities.has(comm)) {
                    this.expandedCommodities.delete(comm);
                } else {
                    this.expandedCommodities.add(comm);
                }
                this.renderCommodityView();
            });
        });

        // Bind Filter Table View Click
        container.querySelectorAll('.btn-filter-comm-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const comm = btn.dataset.comm || btn.getAttribute('data-comm');
                if (!comm) return;

                // 1. Set the active commodity filter
                this.activeCommodityFilter = comm;

                // 2. Synchronize dropdown selects in both surveillance panels
                ['filter-commodity', 'date-filter-commodity'].forEach(id => {
                    const sel = document.getElementById(id);
                    if (!sel) return;
                    let matched = false;
                    for (let opt of sel.options) {
                        if (opt.value.toLowerCase() === comm.toLowerCase()) {
                            sel.value = opt.value;
                            this.activeCommodityFilter = opt.value;
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        const newOpt = new Option(comm, comm, true, true);
                        sel.add(newOpt);
                        sel.value = comm;
                    }
                });

                // 3. Clear conflicting quick filters so the user sees all matching tables
                this.activeSearchQuery = '';
                const searchInput = document.getElementById('crishi-search');
                if (searchInput) searchInput.value = '';
                const dateSearchInput = document.getElementById('date-crishi-search');
                if (dateSearchInput) dateSearchInput.value = '';

                this.activeStatusFilter = 'ALL';
                document.querySelectorAll('#surveillance-table-panel button[data-status], .date-filter-row button[data-status]').forEach(b => {
                    if (b.dataset.status === 'ALL') b.classList.add('active');
                    else b.classList.remove('active');
                });

                this.activeFrequencyFilter = '';
                const freqSel = document.getElementById('filter-frequency');
                if (freqSel) freqSel.value = '';
                const dateFreqSel = document.getElementById('date-filter-frequency');
                if (dateFreqSel) dateFreqSel.value = '';

                this.activeTodayStatusFilter = '';
                const todaySel = document.getElementById('filter-today-status');
                if (todaySel) todaySel.value = '';
                const dateTodaySel = document.getElementById('date-filter-today-status');
                if (dateTodaySel) dateTodaySel.value = '';

                this.activePipelineFilter = '';
                const pipeSel = document.getElementById('filter-pipeline');
                if (pipeSel) pipeSel.value = '';

                // Reset teammate filter for Admins/Managers so tables aren't hidden by teammate restriction
                const isManagerOrAdmin = window.currentUser && (
                    window.currentUser.role === 'SUPERADMIN' ||
                    window.currentUser.role === 'ADMIN' ||
                    window.currentUser.role === 'MANAGER'
                );
                if (isManagerOrAdmin) {
                    this.activeUserFilter = 'ALL';
                    this.renderTeammateChips();
                }

                // 4. Switch to Table Basis Update view mode (triggers applyFilters)
                this.setSurveillanceViewMode('table');
            });
        });

        // Bind action buttons inside commodity tables
        this.bindTableActionButtons();
    },

    renderDateWiseView() {
        const container = document.getElementById('date-view-container');
        if (!container) return;

        const ds = this.dateSummary || {};
        const todayStr = getTodayIsoDate();
        const selectedDate = ds.selected_date || this.selectedSurveillanceDate || todayStr;
        const availableDates = ds.available_dates && ds.available_dates.length > 0 ? ds.available_dates : Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        });

        // Build 7-day selector pills
        const datePillsHtml = availableDates.map((d, idx) => {
            const isSel = (d === selectedDate);
            const label = idx === 0 ? `${d} (Today)` : (idx === 1 ? `${d} (Yesterday)` : d);
            return `
                <button class="date-pill-btn ${isSel ? 'active' : ''}" data-date="${d}">
                    <i class="fas fa-calendar-alt" style="font-size: .7rem; margin-right: 4px;"></i> ${label}
                </button>
            `;
        }).join('');

        const updatedOnDateTasks = this.tasks.filter(t => t.is_updated_today);
        const pendingOnDateTasks = this.tasks.filter(t => !t.is_updated_today);

        container.innerHTML = `
            <!-- Date Selector Strip -->
            <div class="date-selector-strip">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-calendar-day" style="color: var(--accent);"></i> Audit Date:
                    </span>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${datePillsHtml}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: .78rem; color: var(--text-muted);">Custom Date:</span>
                    <input type="date" id="date-picker-surveillance" value="${selectedDate}" style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); font-size: .8rem;">
                    <button class="btn btn-primary btn-sm" id="btn-load-custom-date" style="padding: 4px 10px;">
                        <i class="fas fa-search"></i> Inspect
                    </button>
                </div>
            </div>

            <!-- Date KPI Summary Grid (Interactive Filter Triggers) -->
            <div class="date-kpi-summary-grid">
                <div class="date-kpi-box ${this.activeStatusFilter === 'ALL' ? 'active-date-kpi' : ''}" id="date-kpi-total" style="border-left: 3px solid #60a5fa;" title="Click to view all monitored tables (Reset Filter)">
                    <div>
                        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Monitored Tables</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">${ds.total_tracked || this.tasks.length}</div>
                        <div style="font-size: .67rem; color: #60a5fa;">Active in agalabsdev_stage</div>
                    </div>
                    <div class="kpi-icon-wrap" style="background: rgba(59,130,246,0.15); color: #60a5fa;">
                        <i class="fas fa-database"></i>
                    </div>
                </div>

                <div class="date-kpi-box ${this.activeStatusFilter === 'PASS' ? 'active-date-kpi' : ''}" id="date-kpi-updated" style="border-left: 3px solid #10b981;" title="Click to filter updated tables for this date">
                    <div>
                        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Updated on ${selectedDate}</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #10b981; margin-top: 2px;">${ds.updated_on_date ?? updatedOnDateTasks.length}</div>
                        <div style="font-size: .67rem; color: #10b981;">Verified in MySQL</div>
                    </div>
                    <div class="kpi-icon-wrap" style="background: rgba(16,185,129,0.15); color: #10b981;">
                        <i class="fas fa-check-double"></i>
                    </div>
                </div>

                <div class="date-kpi-box ${this.activeStatusFilter === 'FAIL' ? 'active-date-kpi' : ''}" id="date-kpi-pending" style="border-left: 3px solid #ef4444;" title="Click to filter missing / pending tables for this date">
                    <div>
                        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Missing / Pending on Date</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #ef4444; margin-top: 2px;">${ds.pending_on_date ?? pendingOnDateTasks.length}</div>
                        <div style="font-size: .67rem; color: #f87171;">Awaiting data ingestion</div>
                    </div>
                    <div class="kpi-icon-wrap" style="background: rgba(239,68,68,0.15); color: #ef4444;">
                        <i class="fas fa-clock"></i>
                    </div>
                </div>

                <div class="date-kpi-box" id="date-kpi-completion" style="border-left: 3px solid #a855f7;">
                    <div>
                        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Date Completion Rate</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #a855f7; margin-top: 2px;">${ds.completion_pct ?? 0}%</div>
                        <div style="font-size: .67rem; color: #c084fc;">Overall Day Ingestion</div>
                    </div>
                    <div class="kpi-icon-wrap" style="background: rgba(168,85,247,0.15); color: #a855f7;">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                </div>
            </div>

            <!-- Teammate Workload Quick Filter Bar (Date-Wise View) -->
            <div style="background: var(--bg-card); padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: .74rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-users" style="margin-right: 4px;"></i> Teammate Portfolios (Click to Filter Workload)
                    </span>
                    <span style="font-size: .72rem; color: #60a5fa; font-weight: 600;" id="date-user-workload-hint">
                        Showing tasks for all teammates
                    </span>
                </div>
                <div class="teammate-workload-row" id="date-teammate-chips-container">
                    <!-- Populated dynamically with authentic users -->
                </div>
            </div>

            <!-- Filters & Search Row (Same as Table Basis Update) -->
            <div class="crishi-filter-row date-filter-row" style="margin-top: 10px; gap: 8px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                    <div class="input-group" style="margin-bottom: 0;">
                        <i class="fas fa-search"></i>
                        <input type="text" id="date-crishi-search" value="${this.activeSearchQuery || ''}" placeholder="Search table name, commodity, business title, or remark...">
                    </div>
                </div>

                <!-- Assignee Filter Dropdown -->
                <div style="width: 150px;">
                    <select id="date-filter-assignee" style="width: 100%;">
                        <option value="">All Assignees</option>
                        <option value="Nishant" ${this.activeAssigneeFilter === 'Nishant' ? 'selected' : ''}>Nishant</option>
                        <option value="Bhawna" ${this.activeAssigneeFilter === 'Bhawna' ? 'selected' : ''}>Bhawna</option>
                        <option value="Gopi" ${this.activeAssigneeFilter === 'Gopi' ? 'selected' : ''}>Gopi</option>
                        <option value="Pankaj" ${this.activeAssigneeFilter === 'Pankaj' ? 'selected' : ''}>Pankaj</option>
                        <option value="Nitesh" ${this.activeAssigneeFilter === 'Nitesh' ? 'selected' : ''}>Nitesh</option>
                    </select>
                </div>

                <!-- Harmonized Commodity Dropdown -->
                <div style="width: 175px;">
                    <select id="date-filter-commodity" style="width: 100%;">
                        <option value="">All Commodities</option>
                        <optgroup label="Pulses (Individual)">
                            <option value="Bengal Gram" ${this.activeCommodityFilter === 'Bengal Gram' ? 'selected' : ''}>Bengal Gram</option>
                            <option value="Tur" ${this.activeCommodityFilter === 'Tur' ? 'selected' : ''}>Tur</option>
                            <option value="Urad" ${this.activeCommodityFilter === 'Urad' ? 'selected' : ''}>Urad</option>
                            <option value="Moong" ${this.activeCommodityFilter === 'Moong' ? 'selected' : ''}>Moong</option>
                            <option value="Masoor" ${this.activeCommodityFilter === 'Masoor' ? 'selected' : ''}>Masoor</option>
                            <option value="Pea" ${this.activeCommodityFilter === 'Pea' ? 'selected' : ''}>Pea</option>
                            <option value="Pulses" ${this.activeCommodityFilter === 'Pulses' ? 'selected' : ''}>All Pulses</option>
                        </optgroup>
                        <optgroup label="Other Commodities">
                            <option value="Bajra" ${this.activeCommodityFilter === 'Bajra' ? 'selected' : ''}>Bajra</option>
                            <option value="Barley" ${this.activeCommodityFilter === 'Barley' ? 'selected' : ''}>Barley</option>
                            <option value="Chilli" ${this.activeCommodityFilter === 'Chilli' ? 'selected' : ''}>Chilli</option>
                            <option value="Coriander" ${this.activeCommodityFilter === 'Coriander' ? 'selected' : ''}>Coriander</option>
                            <option value="Cotton" ${this.activeCommodityFilter === 'Cotton' ? 'selected' : ''}>Cotton</option>
                            <option value="Cumin" ${this.activeCommodityFilter === 'Cumin' ? 'selected' : ''}>Cumin</option>
                            <option value="Macro / All" ${this.activeCommodityFilter === 'Macro / All' ? 'selected' : ''}>Macro / All</option>
                            <option value="Maize" ${this.activeCommodityFilter === 'Maize' ? 'selected' : ''}>Maize</option>
                            <option value="Rapeseed" ${this.activeCommodityFilter === 'Rapeseed' ? 'selected' : ''}>Rapeseed</option>
                            <option value="Rice" ${this.activeCommodityFilter === 'Rice' ? 'selected' : ''}>Rice</option>
                            <option value="Soybeans" ${this.activeCommodityFilter === 'Soybeans' ? 'selected' : ''}>Soybeans</option>
                            <option value="Sugar" ${this.activeCommodityFilter === 'Sugar' ? 'selected' : ''}>Sugar</option>
                            <option value="Tops" ${this.activeCommodityFilter === 'Tops' ? 'selected' : ''}>Tops</option>
                            <option value="Turmeric" ${this.activeCommodityFilter === 'Turmeric' ? 'selected' : ''}>Turmeric</option>
                            <option value="Weather" ${this.activeCommodityFilter === 'Weather' ? 'selected' : ''}>Weather</option>
                            <option value="Wheat" ${this.activeCommodityFilter === 'Wheat' ? 'selected' : ''}>Wheat</option>
                        </optgroup>
                    </select>
                </div>

                <!-- Cadence Frequency Dropdown -->
                <div style="width: 130px;">
                    <select id="date-filter-frequency" style="width: 100%;">
                        <option value="">All Cadences</option>
                        <option value="Daily" ${this.activeFrequencyFilter === 'Daily' ? 'selected' : ''}>Daily</option>
                        <option value="Weekly" ${this.activeFrequencyFilter === 'Weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="Monthly" ${this.activeFrequencyFilter === 'Monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="Yearly" ${this.activeFrequencyFilter === 'Yearly' ? 'selected' : ''}>Yearly</option>
                    </select>
                </div>

                <!-- Today Status Filter Dropdown -->
                <div style="width: 145px;">
                    <select id="date-filter-today-status" style="width: 100%;">
                        <option value="">Today Status: All</option>
                        <option value="DONE" ${this.activeTodayStatusFilter === 'DONE' ? 'selected' : ''}>Updated / Done</option>
                        <option value="REVISION" ${this.activeTodayStatusFilter === 'REVISION' ? 'selected' : ''}>Revision / Need Corr</option>
                        <option value="LATE" ${this.activeTodayStatusFilter === 'LATE' ? 'selected' : ''}>Overdue Today</option>
                        <option value="PENDING" ${this.activeTodayStatusFilter === 'PENDING' ? 'selected' : ''}>Due Today</option>
                        <option value="WINDOW" ${this.activeTodayStatusFilter === 'WINDOW' ? 'selected' : ''}>15th–20th Cycle</option>
                    </select>
                </div>

                <!-- Sort Filter Dropdown -->
                <div style="width: 165px;">
                    <select id="date-filter-sort" style="width: 100%;">
                        <option value="title_asc">Sort: Title (A-Z)</option>
                        <option value="title_desc">Sort: Title (Z-A)</option>
                        <option value="assignee_asc">Sort: Assignee (A-Z)</option>
                        <option value="assignee_desc">Sort: Assignee (Z-A)</option>
                        <option value="commodity_asc">Sort: Commodity (A-Z)</option>
                        <option value="commodity_desc">Sort: Commodity (Z-A)</option>
                        <option value="raw_asc">Sort: Raw Table (A-Z)</option>
                        <option value="raw_desc">Sort: Raw Table (Z-A)</option>
                        <option value="cadence_asc">Sort: Cadence (Daily first)</option>
                        <option value="cadence_desc">Sort: Cadence (Monthly first)</option>
                        <option value="last_date_desc">Sort: Date (Newest)</option>
                        <option value="last_date_asc">Sort: Date (Oldest)</option>
                        <option value="today_status_asc">Sort: Today Status</option>
                        <option value="status_asc">Sort: Overall Status</option>
                    </select>
                </div>

                <!-- Status Quick Pills -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'ALL' ? 'active-filter-status' : ''}" data-status="ALL">All (${this.tasks.length})</button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'PASS' ? 'active-filter-status' : ''}" data-status="PASS" style="color: #10b981;" title="What has been updated till now in the DB">
                        <i class="fas fa-check-circle"></i> Updated
                    </button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'NEED_CORRECTION' ? 'active-filter-status' : ''}" data-status="NEED_CORRECTION" style="color: #f59e0b;" title="Marked as needing correction by manager">
                        <i class="fas fa-tools"></i> Need Correction
                    </button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'NOT_CORRECT' ? 'active-filter-status' : ''}" data-status="NOT_CORRECT" style="color: #ef4444;" title="Marked as not correct / discrepancy">
                        <i class="fas fa-times-circle"></i> Not Correct
                    </button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'FAIL' ? 'active-filter-status' : ''}" data-status="FAIL" style="color: #f87171;" title="Late tasks missing update in DB">
                        <i class="fas fa-exclamation-circle"></i> Late
                    </button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'WINDOW' ? 'active-filter-status' : ''}" data-status="WINDOW" style="color: #0ea5e9;" title="Monthly Trade Flow 15th-20th cycle">
                        <i class="fas fa-calendar-alt"></i> 15th–20th Cycle
                    </button>
                    <button class="btn btn-sm btn-outline ${this.activeStatusFilter === 'REMARK' ? 'active-filter-status' : ''}" data-status="REMARK" style="color: #8b5cf6;" title="Tasks with remarks">
                        <i class="fas fa-comment-dots"></i> Remarks
                    </button>
                </div>
            </div>

            <!-- Date Table Breakdown Card -->
            <div class="crishi-table-card" style="margin-top: 14px;">
                <div style="padding: 10px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <span id="date-table-count" style="font-size: .82rem; color: var(--text-muted); font-weight: 600;">
                        Detailed Status for Operating Date: <strong>${selectedDate}</strong> (${this.tasks.length} Tables Monitored)
                    </span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .75rem; font-weight: 700;">
                            ${ds.completion_pct ?? 0}% Day Ingestion Complete
                        </span>
                        <span style="font-size: .75rem; color: #10b981;"><i class="fas fa-circle" style="font-size: .5rem;"></i> Live Auto-Surveillance Active</span>
                    </div>
                </div>

                <div class="crishi-table-responsive">
                    <table class="crishi-table" id="date-master-table">
                        <thead>
                            <tr>
                                <th class="col-assignee crishi-sortable-th" data-col="assignee" title="Click to sort by Assignee">
                                    <span>Assignee</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-commodity crishi-sortable-th" data-col="commodity" title="Click to sort by Commodity">
                                    <span>Commodity</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-raw-table crishi-sortable-th" data-col="raw" title="Click to sort by Raw Table Name">
                                    <span>Raw Table Name</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-title crishi-sortable-th" data-col="title" title="Click to sort by Business Title">
                                    <span>Final Business Title</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-cadence crishi-sortable-th" data-col="cadence" title="Click to sort by Cadence">
                                    <span>Cadence</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-last-date crishi-sortable-th" data-col="last_date" title="Click to sort by Last Date in DB">
                                    <span>Max Date in DB</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-today-status crishi-sortable-th" data-col="today_status" title="Click to sort by Status on Date">
                                    <span>Status on Date</span> <i class="fas fa-sort crishi-sort-icon"></i>
                                </th>
                                <th class="col-status">Audit Verification</th>
                                <th class="col-remarks">Remarks & Manager Review</th>
                                <th class="col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="date-crishi-tbody">
                            <!-- Populated dynamically via renderDateWiseTableRows -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Bind date pill clicks
        container.querySelectorAll('.date-pill-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const dateStr = btn.dataset.date;
                if (dateStr) {
                    this.selectedSurveillanceDate = dateStr;
                    window.App.showToast(`Inspecting surveillance data for ${dateStr}...`, 'info');
                    await this.loadGrid(false);
                }
            });
        });

        // Bind custom date inspect button
        container.querySelector('#btn-load-custom-date')?.addEventListener('click', async () => {
            const picker = document.getElementById('date-picker-surveillance');
            if (picker && picker.value) {
                this.selectedSurveillanceDate = picker.value;
                window.App.showToast(`Inspecting surveillance data for ${picker.value}...`, 'info');
                await this.loadGrid(false);
            }
        });

        // Bind Date-Wise KPI box clicks (Interactive Quick Filters)
        container.querySelector('#date-kpi-total')?.addEventListener('click', () => {
            this.setFilterStatus('ALL');
        });
        container.querySelector('#date-kpi-updated')?.addEventListener('click', () => {
            this.setFilterStatus('PASS');
        });
        container.querySelector('#date-kpi-pending')?.addEventListener('click', () => {
            this.setFilterStatus('FAIL');
        });

        // Search Input in Date-Wise View
        container.querySelector('#date-crishi-search')?.addEventListener('input', (e) => {
            this.activeSearchQuery = e.target.value;
            const tInput = document.getElementById('crishi-search');
            if (tInput && tInput.value !== this.activeSearchQuery) tInput.value = this.activeSearchQuery;
            this.applyFilters();
        });

        // Dropdowns in Date-Wise View
        container.querySelector('#date-filter-assignee')?.addEventListener('change', (e) => {
            this.activeAssigneeFilter = e.target.value;
            const tSelect = document.getElementById('filter-assignee');
            if (tSelect && tSelect.value !== this.activeAssigneeFilter) tSelect.value = this.activeAssigneeFilter;
            this.applyFilters();
        });
        container.querySelector('#date-filter-commodity')?.addEventListener('change', (e) => {
            this.activeCommodityFilter = e.target.value;
            const tSelect = document.getElementById('filter-commodity');
            if (tSelect && tSelect.value !== this.activeCommodityFilter) tSelect.value = this.activeCommodityFilter;
            this.applyFilters();
        });
        container.querySelector('#date-filter-frequency')?.addEventListener('change', (e) => {
            this.activeFrequencyFilter = e.target.value;
            const tSelect = document.getElementById('filter-frequency');
            if (tSelect && tSelect.value !== this.activeFrequencyFilter) tSelect.value = this.activeFrequencyFilter;
            this.highlightActiveKpiCards();
            this.applyFilters();
        });
        container.querySelector('#date-filter-today-status')?.addEventListener('change', (e) => {
            this.activeTodayStatusFilter = e.target.value;
            const tSelect = document.getElementById('filter-today-status');
            if (tSelect && tSelect.value !== this.activeTodayStatusFilter) tSelect.value = this.activeTodayStatusFilter;
            this.applyFilters();
        });
        container.querySelector('#date-filter-sort')?.addEventListener('change', (e) => {
            const parts = (e.target.value || '').split('_');
            this.currentSortCol = parts[0] || 'title';
            this.currentSortDir = parts[1] || 'asc';
            const tSelect = document.getElementById('filter-sort');
            if (tSelect && tSelect.value !== e.target.value) tSelect.value = e.target.value;
            this.applyFilters();
        });

        // Clickable Sortable Headers on Date-Wise Master Table
        container.querySelectorAll('#date-master-table th.crishi-sortable-th').forEach(th => {
            th.addEventListener('click', () => {
                const clickedCol = th.dataset.col;
                if (this.currentSortCol === clickedCol) {
                    this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.currentSortCol = clickedCol;
                    this.currentSortDir = 'asc';
                }
                this.applyFilters();
            });
        });

        // Status Quick Filter Buttons (Date View)
        container.querySelectorAll('.date-filter-row button[data-status]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilterStatus(btn.dataset.status);
            });
        });

        // Populate Teammate Chips & Apply Filtered Table Rows
        this.renderTeammateChips();
        this.applyFilters();
    },

    renderDateWiseTableRows() {
        const tbody = document.getElementById('date-crishi-tbody');
        const countSpan = document.getElementById('date-table-count');
        if (!tbody) return;

        const ds = this.dateSummary || {};
        const selectedDate = ds.selected_date || this.selectedSurveillanceDate || getTodayIsoDate();

        if (countSpan) {
            countSpan.innerHTML = `Showing <strong>${this.filteredTasks.length}</strong> of <strong>${this.tasks.length}</strong> monitored tables for <strong>${selectedDate}</strong>`;
        }

        if (this.filteredTasks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 48px; color: var(--text-muted);">
                        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.3;"></i>
                        No surveillance records found matching your filters for ${selectedDate}.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.filteredTasks.map(t => {
            const isUp = t.is_updated_today;
            const userList = (t.user || 'Unassigned').split(',').map(s => s.trim()).filter(Boolean);
            const userAvatarsHtml = userList.map(u => `
                <span class="user-avatar-chip" title="Assigned to ${u}">
                    <span class="avatar-circle">${u.charAt(0)}</span>
                    <span>${u}</span>
                </span>
            `).join(' ');

            return `
                <tr data-id="${t.id}">
                    <!-- Assignee -->
                    <td class="col-assignee">
                        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden;">
                            ${userAvatarsHtml}
                        </div>
                    </td>

                    <!-- Commodity -->
                    <td class="col-commodity">
                        ${this.getCommodityBadgeHtml(t.commodity)}
                    </td>

                    <!-- Raw Table Name -->
                    <td class="col-raw-table">
                        <span class="table-code-tag" title="${t.raw_table}">${t.raw_table}</span>
                    </td>

                    <!-- Final Business Title -->
                    <td class="col-title" title="${t.final_name}">
                        ${t.final_name}
                    </td>

                    <!-- Cadence -->
                    <td class="col-cadence">
                        <span>${t.frequency}</span>
                    </td>

                    <!-- Max Date in DB -->
                    <td class="col-last-date">
                        <strong style="color: ${isUp ? '#10b981' : 'var(--text-primary)'}; font-size: .80rem;">
                            <i class="fas fa-database" style="color: ${isUp ? '#10b981' : '#60a5fa'}; font-size: .72rem; margin-right: 3px;"></i>${t.last_updated}
                        </strong>
                    </td>

                    <!-- Status on Date -->
                    <td class="col-today-status">
                        ${this.getTodayBadgeHtml(t)}
                    </td>

                    <!-- Audit Verification -->
                    <td class="col-status">
                        ${t.is_verified ? `
                            <span class="badge" style="background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.25); font-weight: 600; font-size: .70rem; padding: 2px 6px; border-radius: 10px;" title="Verified by ${t.verified_by} (${t.verified_rows} rows)">
                                <i class="fas fa-check-double"></i> Verified
                            </span>
                        ` : `
                            <span class="badge" style="background: rgba(255,255,255,0.03); color: var(--text-muted); border: 1px solid var(--border); font-weight: 500; font-size: .70rem; padding: 2px 6px; border-radius: 10px;" title="Automated Live DB Check">
                                <i class="fas fa-shield-alt"></i> Auto
                            </span>
                        `}
                    </td>

                    <!-- Remarks & Manager Review -->
                    <td class="col-remarks">${this.getRemarksReviewHtml(t)}</td>

                    <!-- Actions -->
                    <td class="col-actions">
                        ${this.getActionButtonsHtml(t, true)}
                    </td>
                </tr>
            `;
        }).join('');
    },

    bindTableActionButtons() {
        // Manager Review & Status Action Button
        document.querySelectorAll('.btn-manager-review').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openManagerReviewModal(id);
            });
        });

        // Quick Sync DB Button on table row
        document.querySelectorAll('.btn-quick-sync-db').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openSyncReportModal(id);
            });
        });

        // WhatsApp (edited) Badge Click
        document.querySelectorAll('.wa-edited-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(badge.dataset.id);
                this.openWhatsAppEditedPopup(id);
            });
        });

        // User Edit / Add Remark (Only assigned teammate can change)
        document.querySelectorAll('.btn-user-edit-remark, .btn-user-add-remark').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.handleUserRemarkClick(id);
            });
        });

        // Click on remark bubble opens note dialog
        document.querySelectorAll('.remark-bubble').forEach(b => {
            b.addEventListener('click', (e) => {
                if (e.target.closest('.btn-user-edit-remark') || e.target.closest('.wa-edited-badge')) return;
                const id = parseInt(b.dataset.id);
                if (id) this.handleUserRemarkClick(id);
            });
        });

        // Admin Skip Button
        document.querySelectorAll('.btn-action-skip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openSkipModal(id);
            });
        });

        // Manager Pull Button
        document.querySelectorAll('.btn-action-pull').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openPullModal(id);
            });
        });
    },

    openManagerReviewModal(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const commStyle = COMMODITY_COLORS[task.commodity] || COMMODITY_COLORS['General / Other'];
        const currentStatus = task.status || 'PASS';
        const currentMsg = task.manager_message || '';
        const todayStr = getTodayStr();

        const body = `
            <div style="font-size: .85rem;">
                <!-- Target Table Context Box -->
                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                        <div>
                            <strong style="color: #60a5fa; font-size: .95rem;">${task.final_name}</strong>
                            <div style="font-size: .75rem; color: var(--text-muted); font-family: monospace; margin-top: 2px;">
                                ${task.raw_table} (${task.source_pipeline || 'Stage Direct'})
                            </div>
                        </div>
                        <span class="badge" style="background: ${commStyle.bg}; color: ${commStyle.text}; font-size: .72rem;">
                            ${task.commodity}
                        </span>
                    </div>
                    <div style="display: flex; gap: 14px; font-size: .75rem; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
                        <span><i class="fas fa-user" style="color: var(--accent);"></i> Assignee: <strong>${task.user}</strong></span>
                        <span><i class="fas fa-clock" style="color: #f59e0b;"></i> Cadence: <strong>${task.frequency}</strong></span>
                        <span><i class="fas fa-database" style="color: #10b981;"></i> Last Date in DB: <strong>${task.last_updated}</strong></span>
                    </div>
                </div>

                <p style="color: var(--text-secondary); margin-bottom: 12px;">
                    Choose an operational review action for this table update. Your review status and custom instructions will be immediately dispatched to <strong>${task.user}</strong> and highlighted on the surveillance dashboard.
                </p>

                <!-- Action Selector Grid -->
                <div style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; display: block;">
                        Select Review Action / Status:
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(245,158,11,0.08); border: 1px solid ${currentStatus === 'NEED_CORRECTION' ? '#f59e0b' : 'rgba(245,158,11,0.25)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="manager_action_choice" value="NEED_CORRECTION" ${currentStatus === 'NEED_CORRECTION' ? 'checked' : ''} style="margin-top: 3px;">
                            <div>
                                <strong style="color: #f59e0b; display: block; font-size: .82rem;"><i class="fas fa-tools"></i> Need Correction</strong>
                                <span style="font-size: .72rem; color: var(--text-muted);">Data discrepancy / requires re-check by assignee</span>
                            </div>
                        </label>

                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(239,68,68,0.08); border: 1px solid ${currentStatus === 'NOT_CORRECT' ? '#ef4444' : 'rgba(239,68,68,0.25)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="manager_action_choice" value="NOT_CORRECT" ${currentStatus === 'NOT_CORRECT' ? 'checked' : ''} style="margin-top: 3px;">
                            <div>
                                <strong style="color: #ef4444; display: block; font-size: .82rem;"><i class="fas fa-times-circle"></i> Not Correct</strong>
                                <span style="font-size: .72rem; color: var(--text-muted);">Rejected / invalid values entered in database</span>
                            </div>
                        </label>

                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(148,163,184,0.08); border: 1px solid ${currentStatus === 'PENDING' ? '#94a3b8' : 'rgba(148,163,184,0.25)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="manager_action_choice" value="PENDING" ${currentStatus === 'PENDING' ? 'checked' : ''} style="margin-top: 3px;">
                            <div>
                                <strong style="color: #94a3b8; display: block; font-size: .82rem;"><i class="fas fa-hourglass-half"></i> Pending</strong>
                                <span style="font-size: .72rem; color: var(--text-muted);">Under managerial review / awaiting source data</span>
                            </div>
                        </label>

                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(16,185,129,0.08); border: 1px solid ${currentStatus === 'PASS' || currentStatus === 'VERIFIED' ? '#10b981' : 'rgba(16,185,129,0.25)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="manager_action_choice" value="VERIFIED" ${currentStatus === 'PASS' || currentStatus === 'VERIFIED' ? 'checked' : ''} style="margin-top: 3px;">
                            <div>
                                <strong style="color: #10b981; display: block; font-size: .82rem;"><i class="fas fa-check-double"></i> Verify DB (Pass)</strong>
                                <span style="font-size: .72rem; color: var(--text-muted);">Manager verified & approved in database</span>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Custom Message / Remark for the User by Manager -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">
                        Custom Message / Remark for ${task.user} by Manager:
                    </label>
                    <textarea id="modal-manager-custom-msg" rows="3" placeholder="e.g. ${task.user}, please re-verify column averages and check if all mandis for ${task.last_updated} are inserted." style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 10px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">${currentMsg}</textarea>
                </div>

                <div style="background: rgba(59,130,246,0.06); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(59,130,246,0.2); font-size: .75rem; color: #60a5fa; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-bell"></i>
                    <span>Assignee <strong>${task.user}</strong> will receive an operational alert notification.</span>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-manager-action">
                <i class="fas fa-save"></i> Save Action & Notify User
            </button>
        `;

        window.App.showModal(`Manager Review & Action: ${task.final_name}`, body, footer);

        document.getElementById('btn-save-manager-action')?.addEventListener('click', async () => {
            const selectedChoice = document.querySelector('input[name="manager_action_choice"]:checked')?.value || 'NEED_CORRECTION';
            const customMsg = document.getElementById('modal-manager-custom-msg')?.value.trim() || '';
            const saveBtn = document.getElementById('btn-save-manager-action');

            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

            try {
                const res = await api.post('/crishi/manager-review', {
                    catalogId: task.id,
                    action: selectedChoice,
                    customMessage: customMsg,
                    reviewerName: window.currentUser?.name || 'Manager',
                    targetUser: task.user,
                    reportDate: task.last_updated || todayStr
                });

                if (res && res.success) {
                    window.App.showToast(res.message || 'Review action saved successfully.', 'success');
                    window.App.closeModal();
                    if (res.tasks) {
                        this.tasks = res.tasks;
                        this.summary = res.summary || this.summary;
                        this.updateKpiCards();
                        this.renderTeammateChips();
                        this.applyFilters();
                    } else {
                        await this.loadGrid(true);
                    }
                } else {
                    window.App.showToast(res.error || 'Failed to save review action', 'error');
                }
            } catch (e) {
                console.error('Error in manager review action:', e);
                window.App.showToast('Failed to connect to manager review endpoint.', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save"></i> Save Action & Notify User`;
            }
        });
    },

    async openSyncReportModal(defaultCatalogId = null) {
        const selectedTask = defaultCatalogId ? this.tasks.find(t => t.id === defaultCatalogId) : null;
        const initialUser = selectedTask ? selectedTask.user : (this.activeUserFilter !== 'ALL' ? this.activeUserFilter : 'Nishant');
        const priorityUsers = await this.getActiveUsers();
        const todayStr = getTodayStr();

        const body = `
            <div style="font-size: .85rem;">
                <p style="color: var(--text-secondary); margin-bottom: 14px;">
                    Select your report and date to verify records directly from MySQL <code>agalabsdev_stage</code> and automatically update the MIS status.
                </p>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Teammate / Assignee</label>
                        <select id="modal-sync-user" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">
                            ${priorityUsers.map(u => `<option value="${u}" ${u === initialUser ? 'selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Data / Report Date</label>
                        <input type="date" id="modal-sync-date" value="${todayStr}" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 14px;">
                    <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Report / Monitored Table</label>
                    <select id="modal-sync-report" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">
                        <!-- Populated dynamically based on selected user -->
                    </select>
                </div>

                <div id="modal-sync-result-box" style="display: none;"></div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" id="btn-execute-db-sync">
                <i class="fas fa-check-double"></i> Verify in MySQL & Update MIS
            </button>
        `;

        window.App.showModal('Update MIS Automatically from Database', body, footer);

        const userSelect = document.getElementById('modal-sync-user');
        const reportSelect = document.getElementById('modal-sync-report');

        const updateReportDropdown = (user) => {
            const uLow = (user || '').toLowerCase().trim();
            const userTasks = this.tasks.filter(t => {
                if (!uLow || uLow === 'all') return true;
                const uParts = (t.user || '').toLowerCase().split(',').map(s => s.trim());
                return uParts.includes(uLow) || (t.user || '').toLowerCase().includes(uLow);
            });
            let opts = `<option value="ALL">All My Tasks (${userTasks.length} Assigned Tables)</option>`;
            userTasks.forEach(t => {
                const isSel = (selectedTask && selectedTask.id === t.id);
                opts += `<option value="${t.id}" ${isSel ? 'selected' : ''}>[${t.frequency}] ${t.final_name} (${t.raw_table})</option>`;
            });
            reportSelect.innerHTML = opts;
        };

        updateReportDropdown(initialUser);

        userSelect?.addEventListener('change', (e) => {
            updateReportDropdown(e.target.value);
        });

        document.getElementById('btn-execute-db-sync')?.addEventListener('click', async () => {
            const u = userSelect.value;
            const d = document.getElementById('modal-sync-date')?.value || todayStr;
            const selVal = reportSelect.value;
            const resultBox = document.getElementById('modal-sync-result-box');
            const syncBtn = document.getElementById('btn-execute-db-sync');

            syncBtn.disabled = true;
            syncBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Querying MySQL...`;

            try {
                const payload = {
                    userName: u,
                    reportDate: d,
                    checkAllUserTasks: (selVal === 'ALL'),
                    catalogId: (selVal === 'ALL') ? null : parseInt(selVal)
                };

                const res = await api.post('/crishi/sync-report-db', payload);
                if (res && res.success) {
                    this.tasks = res.tasks || this.tasks;
                    this.summary = res.summary || this.summary;
                    this.updateKpiCards();
                    this.renderTeammateChips();
                    this.applyFilters();

                    resultBox.style.display = 'block';
                    if (res.verified || (res.verified_count && res.verified_count > 0)) {
                        resultBox.className = 'sync-feedback-box success';
                        resultBox.innerHTML = `
                            <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-check-circle"></i> Verification Succeeded & MIS Auto-Updated!
                            </div>
                            <div>${res.message}</div>
                        `;
                        window.App.showToast('MIS updated automatically from MySQL database.', 'success');
                    } else {
                        resultBox.className = 'sync-feedback-box warning';
                        resultBox.innerHTML = `
                            <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-exclamation-triangle"></i> No Matching Rows in MySQL for Date ${d}
                            </div>
                            <div style="margin-bottom: 8px;">${res.message}</div>
                            <button class="btn btn-sm btn-outline" style="border-color: #f59e0b; color: #f59e0b;" onclick="CrishiModule.openRemarkModal(${selVal !== 'ALL' ? selVal : 'null'})">
                                <i class="fas fa-comment-dots"></i> Add Operational Remark for this Delay
                            </button>
                        `;
                    }
                }
            } catch (err) {
                resultBox.style.display = 'block';
                resultBox.className = 'sync-feedback-box error';
                resultBox.textContent = (err && (err.message || err.error)) || 'Failed to connect or query MySQL agalabsdev_stage.';
            } finally {
                syncBtn.disabled = false;
                syncBtn.innerHTML = `<i class="fas fa-check-double"></i> Verify in MySQL & Update MIS`;
            }
        });
    },

    openManagerAuditLogModal() {
        const s = this.summary;
        const updates = (s && s.recent_updates) || [];

        const body = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                    <div>
                        <span style="font-size: .8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Live Progress Summary</span>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #10b981; margin-top: 2px;">
                            ${s.updated_today || 0} of ${s.total_tasks || 53} Tables Updated Till Now (${s.completion_pct || 0}%)
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .78rem; padding: 4px 10px;">
                            <i class="fas fa-check-circle"></i> ${s.updated_today || 0} Updated
                        </span>
                        <span class="badge" style="background: rgba(239,68,68,0.15); color: #ef4444; font-size: .78rem; padding: 4px 10px;">
                            <i class="fas fa-exclamation-circle"></i> ${s.pending_action || 0} Pending
                        </span>
                    </div>
                </div>

                <div style="max-height: 55vh; overflow-y: auto;">
                    <table class="audit-log-table">
                        <thead>
                            <tr>
                                <th>Teammate</th>
                                <th>Business Title & Commodity</th>
                                <th>Raw Table in MySQL</th>
                                <th>Date in DB</th>
                                <th>Verification Status</th>
                                <th>Operational Remark</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${updates.length > 0 ? updates.map(u => `
                                <tr>
                                    <td>
                                        <strong style="color: var(--text-primary); font-size: .85rem;">${u.user}</strong>
                                    </td>
                                    <td>
                                        <div style="font-weight: 600; color: #60a5fa;">${u.name}</div>
                                        <div style="font-size: .72rem; color: var(--text-muted);">${u.commodity}</div>
                                    </td>
                                    <td><span class="table-code-tag">${u.table}</span></td>
                                    <td><strong style="color: #10b981;">${u.date}</strong></td>
                                    <td>
                                        ${u.is_verified ? `
                                            <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .72rem;">
                                                <i class="fas fa-check"></i> Verified (${u.verified_rows} rows)
                                            </span>
                                        ` : `
                                            <span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: .72rem;">
                                                <i class="fas fa-database"></i> DB MAX Date
                                            </span>
                                        `}
                                    </td>
                                    <td>
                                        ${u.remark ? `<span style="font-size: .75rem; color: #f59e0b;"><i class="fas fa-comment-dots"></i> ${u.remark}</span>` : '<span style="color: var(--text-muted); font-size: .75rem;">None</span>'}
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                                        No database updates recorded till now today.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="CrishiModule.openSyncReportModal();">
                <i class="fas fa-plus"></i> Verify Another Report
            </button>
        `;

        window.App.showModal('Manager Live Updates Log: Done Till Now', body, footer);
    },

    handleUserRemarkClick(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const loggedInUser = (window.currentUser?.name || '').trim().toLowerCase();
        const loggedInRole = (window.currentUser?.role || '').trim();
        const assignedUsers = (task.user || '').toLowerCase().split(',').map(s => s.trim());
        const isAssigned = assignedUsers.some(u => loggedInUser.includes(u) || u.includes(loggedInUser));
        const isAdmin = ['SuperAdmin', 'Manager', 'Admin'].includes(loggedInRole);

        // If an Admin who is NOT the assigned teammate clicks it:
        if (isAdmin && !isAssigned) {
            this.openRemarkViewOnlyModal(task);
            return;
        }

        // Assigned user can edit their remark
        this.openRemarkModal(id);
    },

    openRemarkViewOnlyModal(task) {
        const isEdited = Boolean(task.is_edited);
        const body = `
            <div style="font-size: .85rem;">
                <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 12px; margin-bottom: 14px; color: #fca5a5;">
                    <i class="fas fa-lock" style="margin-right: 6px;"></i>
                    <strong>Administrator Notice:</strong> Admins do not have access to edit or delete user operational remarks. Only the assigned teammate (<strong>${task.user}</strong>) can update their remark.
                </div>

                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700; color: #60a5fa;">${task.final_name}</span>
                        <span style="font-size: .75rem; color: var(--text-muted); font-family: monospace;">${task.raw_table}</span>
                    </div>
                    <div style="background: var(--bg-primary); padding: 12px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 10px;">
                        <p style="margin: 0; color: var(--text-primary); font-size: .9rem; line-height: 1.45;">
                            ${task.user_remark || '<em style="color: var(--text-muted);">No user remark posted yet.</em>'}
                        </p>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: .75rem; color: var(--text-secondary);">
                        <span>Author: <strong>${task.user_remark_by || task.user}</strong></span>
                        <span>${isEdited ? `<strong style="color: #10b981;">(edited at ${task.edited_at || ''})</strong>` : (task.user_remark_at || '')}</span>
                    </div>
                </div>

                <div style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; padding: 10px 12px; font-size: .75rem; color: #60a5fa;">
                    <i class="fas fa-info-circle"></i> To request data corrections or provide instructions as manager, use the <strong>Action</strong> button on the row.
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            ${task.user_remark && isEdited ? `
                <button class="btn btn-primary" onclick="App.closeModal(); CrishiModule.openWhatsAppEditedPopup(${task.id});">
                    <i class="fab fa-whatsapp"></i> View (edited) Details
                </button>
            ` : ''}
        `;

        window.App.showModal(`User Remark (Read-Only): ${task.final_name}`, body, footer);
    },

    openWhatsAppEditedPopup(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const timeStr = task.edited_at || task.user_remark_at || 'Recently';
        const author = task.last_edited_by || task.user_remark_by || task.user;

        const body = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: .85rem;">
                <!-- WhatsApp Info Banner -->
                <div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.1rem; flex-shrink: 0;">
                        <i class="fab fa-whatsapp"></i>
                    </div>
                    <div>
                        <div style="font-weight: 700; color: var(--text-primary); font-size: .92rem;">Edited Remark Details</div>
                        <div style="font-size: .75rem; color: var(--text-secondary);">This message was edited by the author after submission</div>
                    </div>
                </div>

                <!-- WhatsApp Message Bubble Preview -->
                <div style="background: #005c4b; color: #e9edef; padding: 12px 14px; border-radius: 10px 10px 2px 10px; margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
                    <div style="font-size: .9rem; line-height: 1.45; margin-bottom: 8px; color: #f0fdf4;">
                        ${task.user_remark}
                    </div>
                    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 6px; font-size: .72rem; color: rgba(233,237,239,0.75);">
                        <span style="font-style: italic; color: #aebac1; font-weight: 600;">(edited)</span>
                        <span>${timeStr}</span>
                        <i class="fas fa-check-double" style="color: #53bdeb; font-size: .7rem;" title="Delivered & Verified"></i>
                    </div>
                </div>

                <!-- Metadata Box -->
                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 14px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: .8rem;">
                        <div>
                            <span style="color: var(--text-muted); font-size: .72rem; text-transform: uppercase; font-weight: 600;">Edited By</span>
                            <div style="font-weight: 600; color: var(--text-primary); margin-top: 2px;">
                                <i class="fas fa-user-edit" style="color: #60a5fa; margin-right: 4px;"></i>
                                ${author}
                            </div>
                        </div>
                        <div>
                            <span style="color: var(--text-muted); font-size: .72rem; text-transform: uppercase; font-weight: 600;">Last Edited At</span>
                            <div style="font-weight: 600; color: #10b981; margin-top: 2px;">
                                <i class="fas fa-clock" style="margin-right: 4px;"></i>
                                ${timeStr}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Database Audit Notice -->
                <div style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; padding: 10px 12px; font-size: .76rem; color: #60a5fa; line-height: 1.45; margin-bottom: 14px;">
                    <i class="fas fa-database"></i> <strong>Audit Log Stored in DB:</strong> Previous versions of this remark are logged in table <code>task_remark_history</code> without cluttering the frontend table.
                </div>

                <div id="wa-history-section">
                    <button class="btn btn-outline btn-sm" id="btn-fetch-wa-history" style="width: 100%; font-size: .78rem;">
                        <i class="fas fa-history"></i> Load Full Database Audit Trail
                    </button>
                    <div id="wa-history-list" style="margin-top: 10px; display: none;"></div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
        `;

        window.App.showModal(`Message Info: (edited) Remark`, body, footer);

        document.getElementById('btn-fetch-wa-history')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-fetch-wa-history');
            const listDiv = document.getElementById('wa-history-list');
            if (!btn || !listDiv) return;

            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching audit logs...`;

            try {
                const res = await api.get(`/crishi/remark/history/${task.id}`);
                if (res && res.history && res.history.length > 0) {
                    listDiv.style.display = 'block';
                    listDiv.innerHTML = `
                        <div style="font-weight: 700; color: var(--text-secondary); font-size: .75rem; text-transform: uppercase; margin-bottom: 6px;">
                            Archived Revisions in DB (${res.history.length})
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${res.history.map((h, idx) => `
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font-size: .78rem;">
                                    <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: .7rem; margin-bottom: 4px;">
                                        <span>Version #${res.history.length - idx} (by ${h.editedBy})</span>
                                        <span>${h.editedAt || ''}</span>
                                    </div>
                                    <div style="color: #ef4444; text-decoration: line-through; opacity: 0.85; margin-bottom: 4px;">
                                        ${h.oldRemark}
                                    </div>
                                    <div style="color: #10b981; font-weight: 500;">
                                        &rarr; ${h.newRemark}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    btn.style.display = 'none';
                } else {
                    listDiv.style.display = 'block';
                    listDiv.innerHTML = `<div style="color: var(--text-muted); font-size: .78rem; text-align: center; padding: 10px;">No prior revisions found in audit log.</div>`;
                    btn.style.display = 'none';
                }
            } catch (e) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error loading history`;
            }
        });
    },

    openRemarkModal(id) {
        let task = null;
        if (id) {
            task = this.tasks.find(t => t.id === id);
        }
        if (!task && this.tasks.length > 0) {
            task = this.tasks[0];
        }
        if (!task) return;

        const loggedInUser = (window.currentUser?.name || '').trim().toLowerCase();
        const loggedInRole = (window.currentUser?.role || '').trim();
        const assignedUsers = (task.user || '').toLowerCase().split(',').map(s => s.trim());
        const isAssigned = assignedUsers.some(u => loggedInUser.includes(u) || u.includes(loggedInUser));
        const isAdmin = ['SuperAdmin', 'Manager', 'Admin'].includes(loggedInRole);

        if (isAdmin && !isAssigned) {
            this.openRemarkViewOnlyModal(task);
            return;
        }

        const isEditMode = Boolean(task.user_remark);
        const cleanRemark = (task.user_remark || '').replace(/^\[[^\]]+\]\s*/, '').trim();

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 14px;">
                    ${isEditMode ? 'Update your operational remark for' : 'Attach an operational remark to'} <strong>${task.final_name}</strong>.
                    ${isEditMode ? 'Any revision will be securely logged in the audit database and displayed with an (edited) tag.' : 'This will be displayed on the surveillance dashboard.'}
                </p>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Operational Remark / Reason</label>
                    <textarea id="modal-remark-text" rows="3" placeholder="e.g. Customs portal is undergoing scheduled server maintenance; trade flow file will be uploaded tomorrow morning." style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 10px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">${cleanRemark}</textarea>
                </div>

                ${isEditMode ? `
                    <div style="background: rgba(245,158,11,0.08); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(245,158,11,0.25); font-size: .75rem; color: #f59e0b; line-height: 1.45;">
                        <i class="fas fa-history"></i> <strong>Audit Compliance:</strong> Previous text is archived in database table <code>task_remark_history</code> without cluttering the main table, and marked with <code>(edited)</code>.
                    </div>
                ` : `
                    <div style="background: rgba(16,185,129,0.08); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.25); font-size: .75rem; color: #10b981;">
                        <i class="fas fa-info-circle"></i> Remarks are permanently linked to table <code>${task.raw_table}</code> and visible on the surveillance dashboard.
                    </div>
                `}
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-remark">
                <i class="fas fa-save"></i> ${isEditMode ? 'Update Remark' : 'Save Remark'}
            </button>
        `;

        window.App.showModal(isEditMode ? `Update My Remark: ${task.final_name}` : `Add Remark: ${task.final_name}`, body, footer);

        document.getElementById('btn-save-remark')?.addEventListener('click', async () => {
            const author = window.currentUser?.name || task.user;
            const text = document.getElementById('modal-remark-text')?.value.trim();

            if (!text) {
                window.App.showToast('Please enter a remark note.', 'error');
                return;
            }

            try {
                const res = await api.post('/crishi/remark', {
                    catalogId: task.id,
                    userName: author,
                    userRole: window.currentUser?.role || '',
                    category: '',
                    remarkText: text
                });

                if (res && res.success) {
                    window.App.showToast('Remark saved successfully in database.', 'success');
                    window.App.closeModal();
                    this.tasks = res.tasks || this.tasks;
                    this.summary = res.summary || this.summary;
                    this.updateKpiCards();
                    this.applyFilters();
                } else {
                    window.App.showToast(res.message || 'Error saving remark.', 'error');
                }
            } catch (e) {
                window.App.showToast(e.response?.data?.message || 'Error saving remark.', 'error');
            }
        });
    },

    openSkipModal(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 14px;">
                    Manager authorization to suppress late update alert for <strong>${task.final_name}</strong> today.
                </p>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Mandatory Reason</label>
                    <textarea id="modal-skip-reason" rows="3" placeholder="e.g. Mandi closed due to regional public holiday / Port server down." style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 10px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;"></textarea>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-skip" style="background: #f59e0b; border-color: #f59e0b;">
                <i class="fas fa-forward"></i> Confirm Skip
            </button>
        `;

        window.App.showModal(`Admin Skip: ${task.final_name}`, body, footer);

        document.getElementById('btn-confirm-skip')?.addEventListener('click', async () => {
            const reason = document.getElementById('modal-skip-reason')?.value.trim();
            if (!reason) {
                window.App.showToast('Mandatory reason required to skip.', 'error');
                return;
            }

            try {
                const res = await api.post('/crishi/skip', {
                    catalogId: task.id,
                    reason: reason
                });
                if (res && res.success) {
                    window.App.showToast(res.message, 'success');
                    window.App.closeModal();
                    await this.loadGrid(true);
                }
            } catch (e) {
                window.App.showToast('Error recording skip.', 'error');
            }
        });
    },

    openPullModal(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 14px;">
                    Confirm that external publication is now live for <strong>${task.final_name}</strong>.
                    This starts a 24-hour SLA countdown for <strong>${task.user}</strong> to insert the data into <code>${task.raw_table}</code> in <code>agalabsdev_stage</code>.
                </p>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: .8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">SLA Countdown Window</label>
                    <select id="modal-pull-sla" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-primary); font-size: .85rem;">
                        <option value="24" selected>24 Hours SLA (Standard)</option>
                        <option value="48">48 Hours SLA (Extended Weekend)</option>
                        <option value="12">12 Hours SLA (Urgent Fast-Track)</option>
                    </select>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-pull">
                <i class="fas fa-play"></i> Start SLA Countdown
            </button>
        `;

        window.App.showModal(`Manager Pull: ${task.final_name}`, body, footer);

        document.getElementById('btn-confirm-pull')?.addEventListener('click', async () => {
            const sla = parseInt(document.getElementById('modal-pull-sla')?.value || '24');
            try {
                const res = await api.post('/crishi/pull', {
                    catalogId: task.id,
                    slaHours: sla
                });
                if (res && res.success) {
                    window.App.showToast('Manager Pull activated! SLA countdown started.', 'success');
                    window.App.closeModal();
                    await this.loadGrid(true);
                }
            } catch (e) {
                window.App.showToast('Error activating pull.', 'error');
            }
        });
    },

    // openSqlInspectModal removed per user request

    async openSubAdminModal() {
        const priorityUsers = await this.getActiveUsers();

        const body = `
            <div>
                <p style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 16px;">
                    Managers can delegate <strong>Sub-Admin Access</strong> to teammates. Sub-Admins have permission to manage and rotate the weekly roster schedule and approve skips for holidays.
                </p>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${priorityUsers.map(u => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: .8rem;">
                                    ${u.charAt(0)}
                                </div>
                                <div>
                                    <strong style="font-size: .88rem; color: var(--text-primary);">${u}</strong>
                                    <div style="font-size: .72rem; color: var(--text-muted);">${u.toLowerCase()}@agalabs.com</div>
                                </div>
                            </div>
                            <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                                <input type="checkbox" ${u === 'Nishant' ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: ${u === 'Nishant' ? '#10b981' : '#4b5563'}; border-radius: 24px; transition: .3s;"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="App.showToast('Sub-Admin access permissions updated.', 'success'); App.closeModal();">
                <i class="fas fa-check"></i> Save Permissions
            </button>
        `;

        window.App.showModal(`Sub-Admin Access Delegation`, body, footer);
    }
};

export default CrishiModule;
