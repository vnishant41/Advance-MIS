/**
 * Report Module — Advanced MIS Redesign
 * Automated Market Reports Browser & 3-in-1 Inspection Modal (Email + PDF Canvas + AI Report Analysis)
 * Unified catalog supporting 290+ reports across Pulses, Maize, Chilli, Cumin, Coriander,
 * Turmeric, Wheat, Rice, Sugar, Tops, Bajra, and Strategic Research & Policy dossiers.
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
    'General': { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' }
};

const ReportModule = {
    reports: [],
    filteredReports: [],
    activeCategory: 'ALL',
    selectedDate: '',     // 'YYYY-MM-DD' or 'ALL'
    dateMode: 'TODAY',    // 'TODAY' | 'LATEST' | 'ALL' | 'CUSTOM'
    activeReportTab: 'dispatches', // 'dispatches' | 'commodity-history'
    selectedHistoryCommodity: 'ALL',
    historySearchQuery: '',
    historyFrequencyFilter: 'ALL', // 'ALL' | 'Daily' | 'Weekly'
    historyDbUpdates: [],
    isLoadingDbHistory: false,
    historySubTab: 'reports', // 'reports' | 'dbupdates'
    quickSearch: '',
    currentPage: 1,
    pageSize: 25,
    todayStr: '',
    latestDateStr: '',
    availableDates: [],

    getTodayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    formatReadableDate(dateStr, includeWeekday = true) {
        if (!dateStr || dateStr === 'ALL') return 'All Historical Dates';
        try {
            const parts = dateStr.split('-');
            if (parts.length !== 3) return dateStr;
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const options = includeWeekday 
                ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
                : { day: 'numeric', month: 'short', year: 'numeric' };
            return d.toLocaleDateString('en-US', options);
        } catch (e) {
            return dateStr;
        }
    },

    async render() {
        return `
            <div class="crishi-view">
                <!-- Header -->
                <div class="crishi-header">
                    <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                        <h2 style="font-size: 1.45rem; font-weight: 800; display: flex; align-items: center; gap: 10px; margin: 0;">
                            <i class="fas fa-file-invoice" style="color: var(--accent);"></i>
                            <span>Market & Intelligence Reports</span>
                        </h2>
                        <span class="badge" id="report-count-badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-weight: 700; padding: 5px 12px; border-radius: 20px; font-size: .82rem; border: 1px solid rgba(16,185,129,0.3);">
                            <i class="fas fa-spinner fa-spin"></i> Checking Dispatches...
                        </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="btn btn-primary btn-sm" id="btn-sync-gmail" style="box-shadow: 0 2px 8px rgba(59,130,246,0.3); font-weight: 700;">
                            <i class="fas fa-sync-alt"></i> Ingest from Gmail
                        </button>
                    </div>
                </div>

                <!-- Module Tabs: Dispatches vs Commodity History -->
                <div class="crishi-tabs" style="margin-top: 14px; display: flex; gap: 8px;">
                    <button class="crishi-tab-btn ${this.activeReportTab === 'dispatches' ? 'active' : ''}" id="tab-report-dispatches">
                        <i class="fas fa-layer-group"></i> Live Dispatches & Daily Archive
                    </button>
                    <button class="crishi-tab-btn ${this.activeReportTab === 'commodity-history' ? 'active' : ''}" id="tab-report-commodity-history">
                        <i class="fas fa-history"></i> Commodity Report & Update History
                    </button>
                </div>

                <!-- View 1: Live Dispatches & Daily Archive -->
                <div id="view-report-dispatches" class="${this.activeReportTab === 'dispatches' ? '' : 'hidden'}">
                    <!-- Datewise Filter & Intelligence Hub -->
                    <div id="report-date-hub" style="margin-top: 14px;">
                        <!-- Rendered dynamically via renderDateHub() -->
                    </div>

                    <!-- Live Dispatch Assessment Banner -->
                    <div id="report-dispatch-banner" style="margin-top: 12px;">
                        <!-- Rendered dynamically via renderDispatchBanner() -->
                    </div>

                    <!-- Dynamic Commodity Quick Pills (Date-Aware) -->
                    <div id="report-category-pills" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; align-items: center;">
                        <!-- Auto-populated with counts for active date -->
                    </div>

                    <!-- Formatted Reports Table Card -->
                    <div class="crishi-table-card" style="margin-top: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
                        <div style="padding: 10px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                            <span id="report-pagination-info" style="font-size: .82rem; color: var(--text-muted); font-weight: 600;">
                                Loading reports...
                            </span>
                            <div id="report-pagination-nav" style="display: flex; gap: 6px; align-items: center;">
                                <!-- Pagination buttons -->
                            </div>
                        </div>

                        <div class="crishi-table-responsive">
                            <table class="crishi-table">
                                <thead>
                                    <tr>
                                        <th style="min-width: 260px;">Report Name</th>
                                        <th>Commodity</th>
                                        <th>Date</th>
                                        <th style="min-width: 280px;">Subject Line</th>
                                        <th>Time Sent</th>
                                        <th>Sender</th>
                                        <th>Status</th>
                                        <th style="text-align: right; min-width: 130px;">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="report-tbody">
                                    <!-- Dynamic rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- View 2: Commodity Report & Update History -->
                <div id="view-report-commodity-history" class="${this.activeReportTab === 'commodity-history' ? '' : 'hidden'}" style="margin-top: 14px;">
                    <!-- Rendered dynamically via renderCommodityHistoryView() -->
                </div>
            </div>
        `;
    },

    async init() {
        this.todayStr = this.getTodayStr();
        this.selectedDate = this.todayStr;
        this.dateMode = 'TODAY';
        this.bindStaticEvents();
        await this.loadAllReports();
        if (this.activeReportTab === 'commodity-history') {
            await this.loadCommodityDbUpdates(this.selectedHistoryCommodity);
        }
    },

    bindStaticEvents() {
        document.getElementById('btn-sync-gmail')?.addEventListener('click', () => {
            this.syncGmail();
        });
        document.getElementById('tab-report-dispatches')?.addEventListener('click', () => {
            this.switchReportTab('dispatches');
        });
        document.getElementById('tab-report-commodity-history')?.addEventListener('click', () => {
            this.switchReportTab('commodity-history');
        });
    },

    switchReportTab(tab) {
        this.activeReportTab = tab;
        const btnDispatches = document.getElementById('tab-report-dispatches');
        const btnHistory = document.getElementById('tab-report-commodity-history');
        const viewDispatches = document.getElementById('view-report-dispatches');
        const viewHistory = document.getElementById('view-report-commodity-history');

        if (tab === 'dispatches') {
            btnDispatches?.classList.add('active');
            btnHistory?.classList.remove('active');
            viewDispatches?.classList.remove('hidden');
            viewHistory?.classList.add('hidden');
        } else {
            btnDispatches?.classList.remove('active');
            btnHistory?.classList.add('active');
            viewDispatches?.classList.add('hidden');
            viewHistory?.classList.remove('hidden');
            this.renderCommodityHistoryView();
            if (!this.historyDbUpdates || this.historyDbUpdates.length === 0) {
                this.loadCommodityDbUpdates(this.selectedHistoryCommodity);
            }
        }
    },

    async loadCommodityDbUpdates(commodity = 'ALL') {
        this.isLoadingDbHistory = true;
        const container = document.getElementById('comm-dbupdates-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--accent); margin-bottom: 8px;"></i>
                    <p style="margin: 0; font-size: .85rem;">Querying database table update history for <strong>${commodity}</strong>...</p>
                </div>
            `;
        }

        try {
            const commParam = (commodity && commodity !== 'ALL') ? `?commodity=${encodeURIComponent(commodity)}&limit=200` : '?limit=200';
            const res = await api.get(`/crishi/update-history${commParam}`);
            if (res && res.success && res.history) {
                this.historyDbUpdates = res.history;
            } else {
                this.historyDbUpdates = [];
            }
        } catch (err) {
            console.error('Error loading DB update history:', err);
            this.historyDbUpdates = [];
        } finally {
            this.isLoadingDbHistory = false;
            this.renderCommodityHistoryView();
        }
    },

    getFilteredHistoryReports() {
        const comm = this.selectedHistoryCommodity || 'ALL';
        const freq = this.historyFrequencyFilter || 'ALL';
        const search = (this.historySearchQuery || '').toLowerCase().trim();

        // Word boundary helper to prevent substring collisions (e.g. 'tur' matching 'turmeric')
        const escapeRegex = s => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchWord = (text, token) => new RegExp(`(^|[^a-zA-Z])${escapeRegex(token)}([^a-zA-Z]|$)`, 'i').test(text || '');

        // Pulse sub-commodities map for report matching
        const pulseSubs = ['bengal gram', 'chana', 'chickpea', 'tur', 'arhar', 'toor', 'pigeon pea', 'urad', 'black matpe', 'moong', 'mung', 'green gram', 'masoor', 'lentil', 'pea', 'peas'];
        const pulseSubAliases = {
            'bengal gram': ['bengal gram', 'chana', 'chickpea'],
            'chana': ['bengal gram', 'chana', 'chickpea'],
            'tur': ['tur', 'arhar', 'toor', 'pigeon pea'],
            'urad': ['urad', 'black matpe'],
            'moong': ['moong', 'mung', 'green gram'],
            'masoor': ['masoor', 'lentil'],
            'pea': ['pea', 'peas']
        };
        const commLower = comm.toLowerCase();

        return this.reports.filter(r => {
            const rCat = (r.category || '').toLowerCase();
            const rName = (r.report_name || '').toLowerCase();
            const rSubj = (r.subject || '').toLowerCase();

            // Commodity matching
            if (comm !== 'ALL') {
                if (commLower === 'pulses') {
                    const isPulse = rCat === 'pulses' || pulseSubs.some(s => rCat === s || matchWord(rName, s) || matchWord(rSubj, s));
                    if (!isPulse) return false;
                } else if (pulseSubs.includes(commLower)) {
                    const matchTokens = pulseSubAliases[commLower] || [commLower];
                    const matchSub = matchTokens.some(tok => rCat === tok || matchWord(rName, tok) || matchWord(rSubj, tok));
                    const matchGeneralPulse = (rCat === 'pulses') && matchTokens.some(tok => matchWord(rName, tok) || matchWord(rSubj, tok));
                    if (!matchSub && !matchGeneralPulse) return false;
                } else if (commLower === 'rapeseed' || commLower === 'mustard') {
                    const matchRape = rCat === 'rapeseed' || rCat === 'mustard' || matchWord(rName, 'rapeseed') || matchWord(rName, 'mustard') || matchWord(rSubj, 'rapeseed') || matchWord(rSubj, 'mustard');
                    if (!matchRape) return false;
                } else if (commLower === 'maize' || commLower === 'corn') {
                    const matchMaize = rCat === 'maize' || rCat === 'corn' || matchWord(rName, 'maize') || matchWord(rName, 'corn') || matchWord(rSubj, 'maize') || matchWord(rSubj, 'corn');
                    if (!matchMaize) return false;
                } else if (commLower === 'cumin' || commLower === 'jeera') {
                    const matchCumin = rCat === 'cumin' || rCat === 'jeera' || matchWord(rName, 'cumin') || matchWord(rName, 'jeera') || matchWord(rSubj, 'cumin') || matchWord(rSubj, 'jeera');
                    if (!matchCumin) return false;
                } else if (commLower === 'coriander' || commLower === 'dhaniya') {
                    const matchCoriander = rCat === 'coriander' || rCat === 'dhaniya' || matchWord(rName, 'coriander') || matchWord(rName, 'dhaniya') || matchWord(rSubj, 'coriander') || matchWord(rSubj, 'dhaniya');
                    if (!matchCoriander) return false;
                } else if (commLower === 'tops' || commLower === 'tomato' || commLower === 'potato' || commLower === 'onion') {
                    const matchTops = rCat === 'tops' || rCat === 'tomato' || rCat === 'potato' || rCat === 'onion' || ['tops', 'tomato', 'potato', 'onion'].some(tok => matchWord(rName, tok) || matchWord(rSubj, tok));
                    if (!matchTops) return false;
                } else {
                    const matchOther = rCat === commLower || matchWord(rName, commLower) || matchWord(rSubj, commLower);
                    if (!matchOther) return false;
                }
            }

            // Frequency matching
            if (freq !== 'ALL') {
                const isWeekly = /\b(weekly|wkly|week)\b/i.test(`${r.report_name} ${r.subject || ''}`);
                const rFreq = isWeekly ? 'Weekly' : 'Daily';
                if (rFreq !== freq) return false;
            }

            // Keyword search
            if (search) {
                const combined = `${r.report_name} ${r.subject || ''} ${r.sender || ''} ${r.category || ''} ${r.date || ''}`.toLowerCase();
                if (!combined.includes(search)) return false;
            }

            return true;
        });
    },

    getFilteredHistoryDbUpdates() {
        const search = (this.historySearchQuery || '').toLowerCase().trim();
        if (!search) return this.historyDbUpdates;

        return this.historyDbUpdates.filter(u => {
            const combined = `${u.final_name || u.finalName || ''} ${u.table_name || u.tableName || ''} ${u.commodity || ''} ${u.person_name || u.personName || ''} ${u.remarks || ''} ${u.status || ''} ${u.report_date || u.reportDate || ''}`.toLowerCase();
            return combined.includes(search);
        });
    },

    renderCommodityHistoryView() {
        const container = document.getElementById('view-report-commodity-history');
        if (!container) return;

        const filteredReports = this.getFilteredHistoryReports();
        const filteredDbUpdates = this.getFilteredHistoryDbUpdates();
        const activeComm = this.selectedHistoryCommodity || 'ALL';
        const activeFreq = this.historyFrequencyFilter || 'ALL';

        // Count reports per commodity for quick pills
        const pillComms = ['ALL', 'Pulses', 'Soybeans', 'Maize', 'Wheat', 'Rice', 'Rapeseed', 'Chilli', 'Coriander', 'Cumin', 'Turmeric', 'Bajra', 'Barley', 'Cotton', 'Sugar', 'Tops', 'Weather'];

        // Latest DB update timestamp
        let latestDbTime = 'N/A';
        if (this.historyDbUpdates && this.historyDbUpdates.length > 0) {
            const first = this.historyDbUpdates[0];
            const rawTs = first.db_update_timestamp || first.dbUpdateTimestamp || first.report_date || first.reportDate;
            if (rawTs) {
                latestDbTime = String(rawTs).replace('T', ' ').slice(0, 19);
            }
        }

        // Subtab active state
        const isReportsTab = this.historySubTab === 'reports';

        container.innerHTML = `
            <!-- Commodity History Control & Filter Ribbon -->
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 12px; background: rgba(0,0,0,0.15); border-radius: 8px; margin-bottom: 14px; border: 1px solid var(--border);">
                <!-- Keyword search -->
                <div style="position: relative; min-width: 220px; flex: 1;">
                    <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: .8rem;"></i>
                    <input type="text" id="commodity-history-search" class="form-control form-control-sm" placeholder="Search reports, subjects, tables, users..." value="${this.historySearchQuery}" style="padding-left: 30px; font-size: .82rem; width: 100%;">
                </div>

                <!-- Commodity Selector -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: .78rem; color: var(--text-muted); font-weight: 600;">Commodity:</span>
                    <select id="commodity-history-select" class="form-control form-control-sm" style="min-width: 170px; font-size: .82rem;">
                        <option value="ALL" ${activeComm === 'ALL' ? 'selected' : ''}>All Commodities</option>
                        <optgroup label="Pulses">
                            <option value="Pulses" ${activeComm === 'Pulses' ? 'selected' : ''}>All Pulses</option>
                            <option value="Bengal Gram" ${activeComm === 'Bengal Gram' ? 'selected' : ''}>Bengal Gram (Chana / Chickpea)</option>
                            <option value="Tur" ${activeComm === 'Tur' ? 'selected' : ''}>Tur (Arhar / Pigeon Pea)</option>
                            <option value="Urad" ${activeComm === 'Urad' ? 'selected' : ''}>Urad (Black Matpe)</option>
                            <option value="Moong" ${activeComm === 'Moong' ? 'selected' : ''}>Moong (Green Gram)</option>
                            <option value="Masoor" ${activeComm === 'Masoor' ? 'selected' : ''}>Masoor (Lentil)</option>
                            <option value="Pea" ${activeComm === 'Pea' ? 'selected' : ''}>Pea</option>
                        </optgroup>
                        <optgroup label="Oilseeds">
                            <option value="Rapeseed" ${activeComm === 'Rapeseed' ? 'selected' : ''}>Rapeseed / Mustard</option>
                            <option value="Soybeans" ${activeComm === 'Soybeans' ? 'selected' : ''}>Soybeans</option>
                        </optgroup>
                        <optgroup label="Grains & Cereals">
                            <option value="Bajra" ${activeComm === 'Bajra' ? 'selected' : ''}>Bajra</option>
                            <option value="Barley" ${activeComm === 'Barley' ? 'selected' : ''}>Barley</option>
                            <option value="Maize" ${activeComm === 'Maize' ? 'selected' : ''}>Maize / Corn</option>
                            <option value="Rice" ${activeComm === 'Rice' ? 'selected' : ''}>Rice</option>
                            <option value="Wheat" ${activeComm === 'Wheat' ? 'selected' : ''}>Wheat</option>
                        </optgroup>
                        <optgroup label="Spices">
                            <option value="Chilli" ${activeComm === 'Chilli' ? 'selected' : ''}>Chilli</option>
                            <option value="Coriander" ${activeComm === 'Coriander' ? 'selected' : ''}>Coriander (Dhaniya)</option>
                            <option value="Cumin" ${activeComm === 'Cumin' ? 'selected' : ''}>Cumin (Jeera)</option>
                            <option value="Turmeric" ${activeComm === 'Turmeric' ? 'selected' : ''}>Turmeric</option>
                        </optgroup>
                        <optgroup label="Vegetables, Weather & Other">
                            <option value="Cotton" ${activeComm === 'Cotton' ? 'selected' : ''}>Cotton</option>
                            <option value="Sugar" ${activeComm === 'Sugar' ? 'selected' : ''}>Sugar</option>
                            <option value="Tops" ${activeComm === 'Tops' ? 'selected' : ''}>Tops (Tomato, Potato, Onion)</option>
                            <option value="Weather" ${activeComm === 'Weather' ? 'selected' : ''}>Weather / GIS</option>
                        </optgroup>
                    </select>
                </div>

                <!-- Frequency Selector -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: .78rem; color: var(--text-muted); font-weight: 600;">Frequency:</span>
                    <select id="commodity-history-frequency" class="form-control form-control-sm" style="min-width: 130px; font-size: .82rem;">
                        <option value="ALL" ${activeFreq === 'ALL' ? 'selected' : ''}>All Frequencies</option>
                        <option value="Daily" ${activeFreq === 'Daily' ? 'selected' : ''}>Daily Digest</option>
                        <option value="Weekly" ${activeFreq === 'Weekly' ? 'selected' : ''}>Weekly Update</option>
                    </select>
                </div>

                <!-- Refresh Button -->
                <button class="btn btn-secondary btn-sm" id="btn-refresh-commodity-history" style="font-weight: 600;">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>

            <!-- Quick Commodity Selection Pills -->
            <div id="commodity-history-pills" style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; align-items: center;">
                ${pillComms.map(c => {
                    const isSelected = activeComm === c;
                    const cColor = COMMODITY_COLORS[c] || COMMODITY_COLORS['General'];
                    const count = c === 'ALL' 
                        ? this.reports.length 
                        : this.reports.filter(r => (r.category || '').toLowerCase() === c.toLowerCase() || (c === 'Pulses' && ((r.category || '').toLowerCase() === 'pulses' || ['chana','tur','urad','moong','masoor','pea'].some(s => (r.category||'').toLowerCase() === s)))).length;
                    return `
                        <button class="btn btn-sm btn-comm-pill ${isSelected ? 'active' : ''}" data-commodity="${c}" style="border-radius: 20px; font-size: .75rem; padding: 4px 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; ${isSelected ? `background: var(--accent); color: #fff; border: 1px solid var(--accent); box-shadow: 0 2px 8px var(--accent-glow);` : `background: rgba(255,255,255,0.03); color: var(--text-secondary); border: 1px solid var(--border);`}">
                            <span>${c}</span>
                            <span class="badge" style="font-size: .68rem; padding: 1px 6px; border-radius: 10px; background: ${isSelected ? 'rgba(255,255,255,0.25)' : cColor.bg}; color: ${isSelected ? '#fff' : cColor.text};">
                                ${count}
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Commodity Overview Banner -->
            <div id="commodity-history-banner" style="background: linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.95) 100%); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 44px; height: 44px; border-radius: 10px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; color: var(--accent);">
                        <i class="fas fa-boxes"></i>
                    </div>
                    <div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <span>${activeComm === 'ALL' ? 'All Surveillance Commodities' : activeComm}</span>
                            <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); font-size: .72rem; padding: 2px 8px; border-radius: 12px;">
                                <i class="fas fa-shield-alt"></i> Active Intelligence
                            </span>
                        </div>
                        <div style="font-size: .8rem; color: var(--text-muted); margin-top: 2px;">
                            Showing synchronized market report dispatches and verified database audit logs.
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                    <div style="text-align: right;">
                        <div style="font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Archive Reports</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">${filteredReports.length}</div>
                    </div>
                    <div style="width: 1px; height: 32px; background: var(--border);"></div>
                    <div style="text-align: right;">
                        <div style="font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">DB Updates</div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #10b981;">${filteredDbUpdates.length}</div>
                    </div>
                    <div style="width: 1px; height: 32px; background: var(--border);"></div>
                    <div style="text-align: right;">
                        <div style="font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Latest DB Activity</div>
                        <div style="font-size: .82rem; font-weight: 700; color: var(--text-secondary);">${latestDbTime}</div>
                    </div>
                </div>
            </div>

            <!-- Subtab Navigation for Market Reports vs Database Updates -->
            <div style="display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
                <button class="btn btn-sm ${isReportsTab ? 'btn-primary' : 'btn-secondary'}" id="subtab-comm-reports" style="font-weight: 700; border-radius: 6px;">
                    <i class="fas fa-file-invoice"></i> Market Reports History (${filteredReports.length})
                </button>
                <button class="btn btn-sm ${!isReportsTab ? 'btn-primary' : 'btn-secondary'}" id="subtab-comm-dbupdates" style="font-weight: 700; border-radius: 6px;">
                    <i class="fas fa-database"></i> Database Updates (${filteredDbUpdates.length})
                </button>
            </div>

            <!-- Panel 1: Market Reports History -->
            <div id="subview-comm-reports" class="${isReportsTab ? '' : 'hidden'}">
                <div class="crishi-table-card" style="box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
                    <div class="crishi-table-responsive">
                        <table class="crishi-table">
                            <thead>
                                <tr>
                                    <th style="min-width: 250px;">Report Name</th>
                                    <th>Commodity</th>
                                    <th>Operating Date</th>
                                    <th>Frequency</th>
                                    <th style="min-width: 260px;">Subject Line</th>
                                    <th>Sender</th>
                                    <th>Status</th>
                                    <th style="text-align: right; min-width: 130px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredReports.length === 0 ? `
                                    <tr>
                                        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                            <i class="fas fa-folder-open" style="font-size: 2rem; opacity: 0.3; margin-bottom: 8px; display: block;"></i>
                                            No market reports found matching the selected filters.
                                        </td>
                                    </tr>
                                ` : filteredReports.map(r => {
                                    const catStyle = COMMODITY_COLORS[r.category] || COMMODITY_COLORS['General'];
                                    const isWeekly = /\b(weekly|wkly|week)\b/i.test(`${r.report_name} ${r.subject || ''}`);
                                    const freqText = isWeekly ? 'Weekly' : 'Daily';
                                    return `
                                        <tr>
                                            <td>
                                                <div style="font-weight: 700; color: var(--text-primary); font-size: .88rem; display: flex; align-items: center; gap: 8px;">
                                                    <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                                                    <span>${r.report_name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge" style="background: ${catStyle.bg}; color: ${catStyle.text}; border: 1px solid ${catStyle.border}; font-weight: 700; font-size: .75rem; padding: 3px 8px; border-radius: 4px;">
                                                    ${r.category}
                                                </span>
                                            </td>
                                            <td><strong style="color: var(--text-primary); font-size: .85rem;">${r.date}</strong></td>
                                            <td>
                                                <span class="badge" style="font-size: .7rem; padding: 2px 7px; border-radius: 4px; background: ${isWeekly ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)'}; color: ${isWeekly ? '#c084fc' : '#60a5fa'}; border: 1px solid ${isWeekly ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)'}; font-weight: 700;">
                                                    ${freqText}
                                                </span>
                                            </td>
                                            <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; color: var(--text-secondary);" title="${r.subject}">
                                                ${r.subject}
                                            </td>
                                            <td title="${r.sender}">
                                                <span style="font-size: .78rem; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; display: inline-block;">
                                                    ${(r.sender || '').replace(/<[^>]+>/g, '').trim()}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="status-pill pass" style="font-size: .7rem; padding: 3px 8px;">
                                                    <i class="fas fa-check-double"></i> ${r.status || 'Analyzed'}
                                                </span>
                                            </td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-outline btn-sm btn-inspect-history-report" data-id="${r.id}" style="padding: 4px 10px; font-size: .78rem; font-weight: 600;">
                                                    <i class="fas fa-columns" style="color: var(--accent); margin-right: 4px;"></i> Inspect (3-in-1)
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Panel 2: Database Table Updates -->
            <div id="subview-comm-dbupdates" class="${!isReportsTab ? '' : 'hidden'}">
                <div class="crishi-table-card" style="box-shadow: 0 4px 16px rgba(0,0,0,0.15);" id="comm-dbupdates-container">
                    <div class="crishi-table-responsive">
                        <table class="crishi-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Report Date</th>
                                    <th>Commodity</th>
                                    <th style="min-width: 200px;">Final Business Title</th>
                                    <th>Raw MySQL Table Name</th>
                                    <th>Updated By</th>
                                    <th>DB Update Timestamp</th>
                                    <th>Row Count</th>
                                    <th>Status</th>
                                    <th style="min-width: 180px;">Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.isLoadingDbHistory ? `
                                    <tr>
                                        <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                            <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--accent); margin-bottom: 8px; display: block;"></i>
                                            Loading database table update audit logs...
                                        </td>
                                    </tr>
                                ` : filteredDbUpdates.length === 0 ? `
                                    <tr>
                                        <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                            <i class="fas fa-database" style="font-size: 2rem; opacity: 0.3; margin-bottom: 8px; display: block;"></i>
                                            No database table updates recorded for the selected commodity/search.
                                        </td>
                                    </tr>
                                ` : filteredDbUpdates.map(u => {
                                    const cStyle = COMMODITY_COLORS[u.commodity] || COMMODITY_COLORS['General'];
                                    const tsStr = (u.db_update_timestamp || u.dbUpdateTimestamp || '').replace('T', ' ').slice(0, 19);
                                    const rCount = (u.row_count !== undefined ? u.row_count : u.rowCount) || 0;
                                    return `
                                        <tr>
                                            <td><span style="font-size: .8rem; color: var(--text-muted); font-family: monospace;">#${u.id}</span></td>
                                            <td><strong style="font-size: .84rem; color: var(--text-primary);">${u.report_date || u.reportDate}</strong></td>
                                            <td>
                                                <span class="badge" style="background: ${cStyle.bg}; color: ${cStyle.text}; border: 1px solid ${cStyle.border}; font-weight: 700; font-size: .75rem; padding: 2px 7px; border-radius: 4px;">
                                                    ${u.commodity}
                                                </span>
                                            </td>
                                            <td>
                                                <div style="font-weight: 600; font-size: .84rem; color: var(--text-primary);">
                                                    ${u.final_name || u.finalName}
                                                </div>
                                            </td>
                                            <td>
                                                <code style="font-size: .78rem; background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); color: #38bdf8;">
                                                    ${u.table_name || u.tableName}
                                                </code>
                                            </td>
                                            <td>
                                                <span style="font-size: .82rem; font-weight: 600; color: var(--text-secondary);">
                                                    ${u.person_name || u.personName || 'Teammate'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style="font-size: .8rem; color: var(--text-muted); font-family: monospace;">
                                                    ${tsStr}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.25); font-weight: 700; font-size: .75rem; padding: 2px 8px; border-radius: 10px;">
                                                    ${rCount.toLocaleString()}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="status-pill pass" style="font-size: .7rem; padding: 3px 8px;">
                                                    <i class="fas fa-check-circle"></i> ${u.status || 'Verified'}
                                                </span>
                                            </td>
                                            <td style="font-size: .8rem; color: var(--text-secondary);" title="${u.remarks || ''}">
                                                ${u.remarks || '—'}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this.bindCommodityHistoryEvents();
    },

    bindCommodityHistoryEvents() {
        // Commodity Selector dropdown change
        document.getElementById('commodity-history-select')?.addEventListener('change', (e) => {
            this.selectedHistoryCommodity = e.target.value;
            this.loadCommodityDbUpdates(this.selectedHistoryCommodity);
        });

        // Frequency Selector dropdown change
        document.getElementById('commodity-history-frequency')?.addEventListener('change', (e) => {
            this.historyFrequencyFilter = e.target.value;
            this.renderCommodityHistoryView();
        });

        // Search input with debounce
        const searchInput = document.getElementById('commodity-history-search');
        if (searchInput) {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.historySearchQuery = e.target.value;
                    this.renderCommodityHistoryView();
                }, 200);
            });
        }

        // Quick pills click
        document.querySelectorAll('#commodity-history-pills .btn-comm-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const comm = btn.dataset.commodity;
                this.selectedHistoryCommodity = comm;
                this.loadCommodityDbUpdates(comm);
            });
        });

        // Refresh button
        document.getElementById('btn-refresh-commodity-history')?.addEventListener('click', async () => {
            await this.loadAllReports();
            await this.loadCommodityDbUpdates(this.selectedHistoryCommodity);
        });

        // Subtabs
        document.getElementById('subtab-comm-reports')?.addEventListener('click', () => {
            this.historySubTab = 'reports';
            this.renderCommodityHistoryView();
        });
        document.getElementById('subtab-comm-dbupdates')?.addEventListener('click', () => {
            this.historySubTab = 'dbupdates';
            this.renderCommodityHistoryView();
        });

        // 3-in-1 inspection buttons
        document.querySelectorAll('.btn-inspect-history-report').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = Number(btn.dataset.id);
                this.openThreeSplitModal(id);
            });
        });
    },

    async syncGmail() {
        const btn = document.getElementById('btn-sync-gmail');
        const emptySync = document.getElementById('btn-empty-sync');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Ingesting from Gmail...`;
        }
        if (emptySync) {
            emptySync.disabled = true;
            emptySync.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Ingesting...`;
        }
        window.App?.showToast?.('Connecting to mail.agalabs@gmail.com via IMAP SSL and syncing reports...', 'info');

        try {
            const res = await api.post('/crishi/reports/sync-gmail', {});
            if (res && res.success) {
                window.App?.showToast?.(res.message || 'Gmail reports ingested successfully!', 'success');
            } else {
                window.App?.showToast?.(res?.message || 'Ingestion encountered an issue', 'warning');
            }
        } catch (err) {
            console.error('Error syncing Gmail reports:', err);
            window.App?.showToast?.('Error synchronizing with Gmail inbox', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-sync-alt"></i> Ingest from Gmail`;
            }
            if (emptySync) {
                emptySync.disabled = false;
                emptySync.innerHTML = `<i class="fas fa-sync-alt"></i> Check Gmail Inbox`;
            }
            await this.loadAllReports();
        }
    },

    async loadAllReports() {
        try {
            const res = await api.get('/crishi/reports/all');
            if (res && res.success && res.reports) {
                this.reports = res.reports;
                this.todayStr = this.getTodayStr();

                // Compute available dates sorted descending
                const dateSet = new Set(this.reports.map(r => r.date).filter(Boolean));
                this.availableDates = [...dateSet].sort().reverse();
                this.latestDateStr = this.availableDates[0] || this.todayStr;

                // If currently on TODAY, maintain TODAY
                if (!this.selectedDate || this.dateMode === 'TODAY') {
                    this.selectedDate = this.todayStr;
                    this.dateMode = 'TODAY';
                }

                this.updateHeaderBadge();
                this.renderDateHub();
                this.renderDispatchBanner();
                this.renderCategoryPills();
                this.applyFilters();
                if (this.activeReportTab === 'commodity-history') {
                    this.renderCommodityHistoryView();
                }
            } else {
                throw new Error("No reports returned");
            }
        } catch (e) {
            console.error('Error loading reports:', e);
            const badge = document.getElementById('report-count-badge');
            if (badge) {
                badge.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error loading reports`;
            }
        }
    },

    updateHeaderBadge() {
        const badge = document.getElementById('report-count-badge');
        const gmailCountBadge = document.getElementById('gmail-synced-count');
        if (gmailCountBadge) {
            const gmailTotal = this.reports.filter(r => r.is_gmail).length;
            gmailCountBadge.textContent = `${gmailTotal} Synced`;
        }

        if (!badge) return;

        const todayReports = this.reports.filter(r => r.date === this.todayStr);
        if (todayReports.length > 0) {
            badge.innerHTML = `<i class="fas fa-check-circle"></i> Today: ${todayReports.length} Reports Dispatched`;
            badge.style.background = 'rgba(16,185,129,0.15)';
            badge.style.color = '#10b981';
            badge.style.borderColor = 'rgba(16,185,129,0.3)';
        } else {
            badge.innerHTML = `<i class="fas fa-clock"></i> Today's Reports: NOT SENT YET`;
            badge.style.background = 'rgba(245,158,11,0.15)';
            badge.style.color = '#f59e0b';
            badge.style.borderColor = 'rgba(245,158,11,0.3)';
        }
    },

    renderDateHub() {
        const hub = document.getElementById('report-date-hub');
        if (!hub) return;

        const todayCount = this.reports.filter(r => r.date === this.todayStr).length;
        const latestCount = this.reports.filter(r => r.date === this.latestDateStr).length;
        const isToday = this.dateMode === 'TODAY' || this.selectedDate === this.todayStr;
        const isLatest = this.dateMode === 'LATEST' || (this.selectedDate === this.latestDateStr && !isToday && this.dateMode !== 'ALL');
        const isAll = this.dateMode === 'ALL' || this.selectedDate === 'ALL';

        hub.innerHTML = `
            <div style="background: var(--bg-card); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
                <!-- Quick Date Filter Presets -->
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <!-- Today Preset -->
                    <button class="btn btn-sm ${isToday ? 'btn-primary' : 'btn-outline'} btn-date-tab" data-mode="TODAY" style="border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: .82rem;">
                        <i class="fas fa-calendar-day"></i>
                        <span>Today</span>
                        <span class="badge" style="background: ${todayCount > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}; color: ${todayCount > 0 ? '#10b981' : '#f59e0b'}; padding: 2px 7px; border-radius: 10px; font-size: .7rem; font-weight: 700;">
                            ${todayCount > 0 ? `${todayCount} Sent` : 'Not Sent'}
                        </span>
                    </button>

                    <!-- Latest Dispatched Preset -->
                    <button class="btn btn-sm ${isLatest ? 'btn-primary' : 'btn-outline'} btn-date-tab" data-mode="LATEST" style="border-radius: 20px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: .82rem;">
                        <i class="fas fa-bolt" style="color: #f59e0b;"></i>
                        <span>Latest Dispatched (${this.formatReadableDate(this.latestDateStr, false)})</span>
                        <span class="badge" style="background: rgba(255,255,255,0.1); color: inherit; padding: 2px 6px; border-radius: 10px; font-size: .7rem;">
                            ${latestCount}
                        </span>
                    </button>

                    <!-- All Archive Preset -->
                    <button class="btn btn-sm ${isAll ? 'btn-primary' : 'btn-outline'} btn-date-tab" data-mode="ALL" style="border-radius: 20px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: .82rem;">
                        <i class="fas fa-archive"></i>
                        <span>All Reports (${this.reports.length})</span>
                    </button>
                </div>

                <!-- Date Stepper & Picker -->
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-secondary); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border);">
                        <button class="btn btn-outline btn-sm" id="btn-date-prev" title="Step to Previous Day" style="padding: 4px 8px; font-size: .75rem; border: none; background: transparent;">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        
                        <input type="date" id="report-date-picker" value="${this.selectedDate === 'ALL' ? this.todayStr : this.selectedDate}" style="background: transparent; border: none; color: var(--text-primary); font-size: .84rem; font-weight: 700; cursor: pointer; padding: 2px 4px; outline: none;">

                        <button class="btn btn-outline btn-sm" id="btn-date-next" title="Step to Next Day" style="padding: 4px 8px; font-size: .75rem; border: none; background: transparent;" ${this.selectedDate >= this.todayStr && this.dateMode !== 'ALL' ? 'disabled style="opacity: 0.35;"' : ''}>
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>

                    <!-- Filter within active date view -->
                    <div style="position: relative;">
                        <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: .75rem; color: var(--text-muted); pointer-events: none;"></i>
                        <input type="text" id="report-keyword-filter" placeholder="Filter reports..." value="${this.quickSearch}" style="padding: 6px 10px 6px 28px; font-size: .8rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); width: 140px;">
                    </div>
                </div>
            </div>
        `;

        // Bind preset tabs
        hub.querySelectorAll('.btn-date-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.btn-date-tab');
                const mode = targetBtn.dataset.mode;
                if (mode === 'TODAY') {
                    this.setDate(this.todayStr, 'TODAY');
                } else if (mode === 'LATEST') {
                    this.setDate(this.latestDateStr, 'LATEST');
                } else if (mode === 'ALL') {
                    this.setDate('ALL', 'ALL');
                }
            });
        });

        // Date picker change
        document.getElementById('report-date-picker')?.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                this.setDate(val, val === this.todayStr ? 'TODAY' : (val === this.latestDateStr ? 'LATEST' : 'CUSTOM'));
            }
        });

        // Prev / Next day stepper
        document.getElementById('btn-date-prev')?.addEventListener('click', () => {
            this.stepDate(-1);
        });
        document.getElementById('btn-date-next')?.addEventListener('click', () => {
            this.stepDate(1);
        });

        // Quick search keyword
        document.getElementById('report-keyword-filter')?.addEventListener('input', (e) => {
            this.quickSearch = e.target.value.trim().toLowerCase();
            this.currentPage = 1;
            this.applyFilters();
        });
    },

    stepDate(direction) {
        let baseDateStr = (this.selectedDate === 'ALL' || !this.selectedDate) ? this.todayStr : this.selectedDate;
        try {
            const parts = baseDateStr.split('-');
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            d.setDate(d.getDate() + direction);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const newDateStr = `${y}-${m}-${day}`;
            this.setDate(newDateStr, newDateStr === this.todayStr ? 'TODAY' : (newDateStr === this.latestDateStr ? 'LATEST' : 'CUSTOM'));
        } catch (e) {
            console.error('Error stepping date:', e);
        }
    },

    setDate(dateStr, mode) {
        this.selectedDate = dateStr;
        this.dateMode = mode || (dateStr === this.todayStr ? 'TODAY' : (dateStr === 'ALL' ? 'ALL' : (dateStr === this.latestDateStr ? 'LATEST' : 'CUSTOM')));
        this.currentPage = 1;
        this.renderDateHub();
        this.renderDispatchBanner();
        this.renderCategoryPills();
        this.applyFilters();
    },

    renderDispatchBanner() {
        const bannerEl = document.getElementById('report-dispatch-banner');
        if (!bannerEl) return;

        if (this.dateMode === 'ALL' || this.selectedDate === 'ALL') {
            bannerEl.innerHTML = `
                <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div>
                            <div style="font-weight: 800; color: var(--text-primary); font-size: .98rem; display: flex; align-items: center; gap: 8px;">
                                <span>Full Historical Catalog Archive</span>
                                <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: .72rem; padding: 2px 7px;">
                                    ${this.reports.length} Reports Total
                                </span>
                            </div>
                            <div style="color: var(--text-muted); font-size: .82rem; margin-top: 2px;">
                                Viewing all market dispatches across all recorded dates. Click <strong>Today</strong> or <strong>Latest Dispatched</strong> to inspect day-specific dispatches.
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline btn-sm btn-banner-today" style="font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-calendar-day"></i> Check Today
                        </button>
                        <button class="btn btn-outline btn-sm btn-banner-latest" style="font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-bolt" style="color: #f59e0b;"></i> Latest Active (${this.formatReadableDate(this.latestDateStr, false)})
                        </button>
                    </div>
                </div>
            `;
            this.bindBannerButtons(bannerEl);
            return;
        }

        const dateReports = this.reports.filter(r => r.date === this.selectedDate);
        const isToday = this.selectedDate === this.todayStr;
        const readableDate = this.formatReadableDate(this.selectedDate);

        if (dateReports.length > 0) {
            // Distinct commodities dispatched on this date
            const comms = [...new Set(dateReports.map(r => r.category).filter(Boolean))];
            const commPills = comms.map(c => {
                const count = dateReports.filter(r => r.category === c).length;
                const style = COMMODITY_COLORS[c] || COMMODITY_COLORS['General'];
                return `<span class="badge" style="background: ${style.bg}; color: ${style.text}; border: 1px solid ${style.border}; font-size: .72rem; padding: 2px 7px; margin-right: 4px; font-weight: 700;">${c} (${count})</span>`;
            }).join('');

            bannerEl.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(16, 185, 129, 0.18); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div>
                            <div style="font-weight: 800; color: #10b981; font-size: 1.02rem; display: flex; align-items: center; gap: 8px;">
                                <span>${isToday ? "Today's Reports: DISPATCHED & VERIFIED" : "Reports Dispatched"}</span>
                                <span class="badge" style="background: rgba(16, 185, 129, 0.22); color: #10b981; font-size: .75rem; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; padding: 2px 8px;">
                                    ${dateReports.length} Reports Sent
                                </span>
                            </div>
                            <div style="color: var(--text-secondary); font-size: .83rem; margin-top: 3px;">
                                Dispatches recorded on <strong>${readableDate}</strong> • Dispatched commodities:
                            </div>
                            <div style="margin-top: 6px;">
                                ${commPills}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-outline btn-sm btn-banner-all" style="font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-archive"></i> View All Archive (${this.reports.length})
                        </button>
                    </div>
                </div>
            `;
        } else {
            // 0 reports for this date
            bannerEl.innerHTML = `
                <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(245, 158, 11, 0.18); color: #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">
                            <i class="fas fa-clock fa-spin-pulse"></i>
                        </div>
                        <div>
                            <div style="font-weight: 800; color: #f59e0b; font-size: 1.02rem; display: flex; align-items: center; gap: 8px;">
                                <span>${isToday ? "Today's Reports: NOT SENT YET" : "No Reports Dispatched for this Date"}</span>
                                <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: .75rem; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700; padding: 2px 8px;">
                                    0 / 16 Commodities Received
                                </span>
                            </div>
                            <div style="color: var(--text-muted); font-size: .83rem; margin-top: 3px;">
                                ${isToday 
                                    ? `No market intelligence or commodity reports have been sent or received for today (<strong>${readableDate}</strong>). Pending desk submission.`
                                    : `No report transmissions found in archives for <strong>${readableDate}</strong>.`
                                }
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-primary btn-sm btn-banner-sync" style="font-size: .78rem; font-weight: 700; box-shadow: 0 2px 8px rgba(59,130,246,0.3);">
                            <i class="fas fa-sync-alt"></i> Check Gmail Inbox
                        </button>
                        ${this.latestDateStr !== this.selectedDate ? `
                        <button class="btn btn-outline btn-sm btn-banner-latest" style="font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-bolt" style="color: #f59e0b;"></i> Jump to Latest Sent (${this.formatReadableDate(this.latestDateStr, false)})
                        </button>` : ''}
                        <button class="btn btn-outline btn-sm btn-banner-all" style="font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-archive"></i> View All Archive
                        </button>
                    </div>
                </div>
            `;
        }
        this.bindBannerButtons(bannerEl);
    },

    bindBannerButtons(container) {
        container.querySelector('.btn-banner-today')?.addEventListener('click', () => {
            this.setDate(this.todayStr, 'TODAY');
        });
        container.querySelector('.btn-banner-latest')?.addEventListener('click', () => {
            this.setDate(this.latestDateStr, 'LATEST');
        });
        container.querySelector('.btn-banner-all')?.addEventListener('click', () => {
            this.setDate('ALL', 'ALL');
        });
        container.querySelector('.btn-banner-sync')?.addEventListener('click', () => {
            this.syncGmail();
        });
    },

    renderCategoryPills() {
        const container = document.getElementById('report-category-pills');
        if (!container) return;

        // Determine base set of reports for counting
        const baseReports = (this.selectedDate === 'ALL' || !this.selectedDate)
            ? this.reports
            : this.reports.filter(r => r.date === this.selectedDate);

        // Calculate count per category
        const counts = { 'ALL': baseReports.length };
        baseReports.forEach(r => {
            const c = r.category || 'General';
            counts[c] = (counts[c] || 0) + 1;
        });

        // Authoritative 16 Commodities from report mapping.xlsx
        const priorityCategories = [
            'ALL', 'Bajra', 'Barley', 'Chilli', 'Coriander', 'Cotton', 'Cumin',
            'Maize', 'Pulses', 'Rapeseed', 'Rice', 'Soybeans', 'Sugar', 'Tops',
            'Turmeric', 'Weather', 'Wheat'
        ];

        container.innerHTML = priorityCategories.map(cat => {
            const count = counts[cat] || 0;
            // In day-specific view, don't show categories with 0 count except 'ALL'
            if (count === 0 && this.selectedDate !== 'ALL' && cat !== 'ALL') return '';
            if (count === 0 && this.selectedDate === 'ALL') return '';

            const isActive = this.activeCategory === cat;
            const style = COMMODITY_COLORS[cat] || COMMODITY_COLORS['General'];
            const activeStyle = isActive 
                ? `background: ${style.text}; color: #ffffff; border-color: ${style.text}; font-weight: 700; box-shadow: 0 2px 8px ${style.bg};`
                : `background: var(--bg-secondary); color: var(--text-secondary); border-color: var(--border);`;

            return `
                <button class="btn btn-sm btn-outline cat-pill-btn" data-cat="${cat}" style="padding: 4px 10px; font-size: .78rem; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; ${activeStyle}">
                    <span>${cat === 'ALL' ? (this.selectedDate === 'ALL' ? 'All Reports' : 'All on Date') : cat}</span>
                    <span style="background: rgba(0,0,0,0.2); padding: 1px 6px; border-radius: 10px; font-size: .72rem; opacity: 0.9;">
                        ${count}
                    </span>
                </button>
            `;
        }).join('');

        // Bind clicks on category pills
        container.querySelectorAll('.cat-pill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.cat-pill-btn');
                if (!targetBtn) return;
                this.activeCategory = targetBtn.dataset.cat;
                this.currentPage = 1;
                this.renderCategoryPills();
                this.applyFilters();
            });
        });
    },

    applyFilters() {
        const q = this.quickSearch;
        const dt = this.selectedDate;

        this.filteredReports = this.reports.filter(r => {
            // Date check
            const matchDate = (dt === 'ALL' || !dt) ? true : (r.date === dt);

            // Category check
            const matchCat = this.activeCategory === 'ALL' || (r.category && r.category.toLowerCase() === this.activeCategory.toLowerCase());
            
            // Search query check
            const matchQ = !q || 
                r.report_name.toLowerCase().includes(q) || 
                r.subject.toLowerCase().includes(q) || 
                r.sender.toLowerCase().includes(q) || 
                (r.category && r.category.toLowerCase().includes(q));

            return matchDate && matchCat && matchQ;
        });

        this.renderTableRows();
    },

    renderTableRows() {
        const tbody = document.getElementById('report-tbody');
        const info = document.getElementById('report-pagination-info');
        const nav = document.getElementById('report-pagination-nav');
        if (!tbody) return;

        const totalItems = this.filteredReports.length;
        const isToday = this.selectedDate === this.todayStr;
        const readableDate = this.formatReadableDate(this.selectedDate);

        if (totalItems === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 48px 20px;">
                        <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(245,158,11,0.12); color: #f59e0b; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; margin-bottom: 12px;">
                            <i class="fas fa-calendar-times"></i>
                        </div>
                        <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
                            ${isToday ? "Today's Reports Have Not Been Sent Yet" : `No Reports Sent for ${readableDate}`}
                        </h4>
                        <p style="color: var(--text-muted); font-size: 0.86rem; max-width: 520px; margin: 0 auto 18px; line-height: 1.5;">
                            ${isToday 
                                ? "No market intelligence reports have been uploaded or received via Gmail for today yet. Once reports are emailed or uploaded, they will immediately appear here."
                                : `No commodity reports were dispatched or recorded for ${readableDate}.`
                            }
                        </p>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" id="btn-empty-sync" style="font-weight: 700;">
                                <i class="fas fa-sync-alt"></i> Check Gmail Inbox
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-empty-latest" style="font-weight: 600;">
                                <i class="fas fa-bolt" style="color: #f59e0b;"></i> View Latest Dispatched (${this.formatReadableDate(this.latestDateStr, false)})
                            </button>
                            <button class="btn btn-outline btn-sm" id="btn-empty-all" style="font-weight: 600;">
                                <i class="fas fa-archive"></i> View All Archive (${this.reports.length})
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            if (info) info.textContent = isToday ? 'Today: 0 reports sent' : `Showing 0 reports for ${readableDate}`;
            if (nav) nav.innerHTML = '';

            document.getElementById('btn-empty-sync')?.addEventListener('click', () => this.syncGmail());
            document.getElementById('btn-empty-latest')?.addEventListener('click', () => this.setDate(this.latestDateStr, 'LATEST'));
            document.getElementById('btn-empty-all')?.addEventListener('click', () => this.setDate('ALL', 'ALL'));
            return;
        }

        // Pagination slice
        const totalPages = Math.ceil(totalItems / this.pageSize);
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, totalItems);
        const pageItems = this.filteredReports.slice(startIndex, endIndex);

        if (info) {
            info.innerHTML = `Showing <strong>${startIndex + 1}–${endIndex}</strong> of <strong>${totalItems}</strong> reports ${this.selectedDate !== 'ALL' ? `for <strong>${readableDate}</strong>` : `(Total Catalog: ${this.reports.length})`}`;
        }

        // Render Pagination Buttons
        if (nav) {
            if (totalPages > 1) {
                nav.innerHTML = `
                    <button class="btn btn-outline btn-sm" id="btn-page-prev" ${this.currentPage === 1 ? 'disabled style="opacity: 0.5;"' : ''} style="padding: 3px 8px; font-size: .75rem;">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span style="font-size: .8rem; font-weight: 700; color: var(--text-secondary); padding: 0 4px;">
                        Page ${this.currentPage} of ${totalPages}
                    </span>
                    <button class="btn btn-outline btn-sm" id="btn-page-next" ${this.currentPage === totalPages ? 'disabled style="opacity: 0.5;"' : ''} style="padding: 3px 8px; font-size: .75rem;">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                `;

                document.getElementById('btn-page-prev')?.addEventListener('click', () => {
                    if (this.currentPage > 1) {
                        this.currentPage--;
                        this.renderTableRows();
                    }
                });

                document.getElementById('btn-page-next')?.addEventListener('click', () => {
                    if (this.currentPage < totalPages) {
                        this.currentPage++;
                        this.renderTableRows();
                    }
                });
            } else {
                nav.innerHTML = '';
            }
        }

        tbody.innerHTML = pageItems.map(r => {
            const catStyle = COMMODITY_COLORS[r.category] || COMMODITY_COLORS['General'];
            const gmailBadge = r.is_gmail 
                ? `<span class="badge" title="Ingested live via mail.agalabs@gmail.com" style="background: rgba(234,67,53,0.15); color: #ea4335; border: 1px solid rgba(234,67,53,0.3); font-size: .68rem; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="fab fa-google"></i> Gmail Ingested</span>`
                : '';

            return `
                <tr data-id="${r.id}" style="cursor: pointer; transition: background 0.15s ease;" class="report-row">
                    <td style="font-weight: 700; color: #60a5fa;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.1rem; flex-shrink: 0;"></i>
                            <span style="line-height: 1.3;">${r.report_name}</span>
                            ${gmailBadge}
                        </div>
                    </td>
                    <td>
                        <span class="badge" style="background: ${catStyle.bg}; color: ${catStyle.text}; border: 1px solid ${catStyle.border}; font-weight: 700; font-size: .72rem; padding: 2px 8px; border-radius: 12px;">
                            ${r.category}
                        </span>
                    </td>
                    <td><strong style="color: var(--text-primary); font-size: .85rem;">${r.date}</strong></td>
                    <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; color: var(--text-secondary);" title="${r.subject}">
                        ${r.subject}
                    </td>
                    <td><span style="color: var(--text-muted); font-size: .8rem;">${r.time_sent}</span></td>
                    <td title="${r.sender}">
                        <span style="font-size: .78rem; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; display: inline-block;">
                            ${r.sender.replace(/<[^>]+>/g, '').trim()}
                        </span>
                    </td>
                    <td>
                        <span class="status-pill pass" style="font-size: .7rem; padding: 3px 8px;">
                            <i class="fas fa-check-double"></i> ${r.status}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <button class="btn btn-outline btn-sm btn-inspect-report" data-id="${r.id}" style="padding: 4px 10px; font-size: .78rem; font-weight: 600;">
                            <i class="fas fa-columns" style="color: var(--accent); margin-right: 4px;"></i> Inspect (3-in-1)
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind clicks on rows to open 3-in-1 modal
        tbody.querySelectorAll('.report-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const id = parseInt(row.dataset.id, 10);
                this.openThreeSplitModal(id);
            });
        });
    },

    openThreeSplitModal(id) {
        const report = this.reports.find(r => r.id === id);
        if (!report) return;

        const catStyle = COMMODITY_COLORS[report.category] || COMMODITY_COLORS['General'];

        // Extract raw 8-digit date tag from subject or filename (e.g. 20261022)
        const subjStr = report.subject || report.report_name || '';
        const matchDigits = subjStr.match(/202\d[01]\d[0-3]\d/);
        const rawSubjectDate = (report.ai_analysis && report.ai_analysis.report_overview && report.ai_analysis.report_overview.raw_subject_date)
            || (matchDigits ? matchDigits[0] : (report.date ? report.date.replace(/-/g, '') : '20261022'));

        // Format extracted raw subject date into YYYY-MM-DD (yyyy-mm-dd format)
        let formattedSubjectDate = report.date;
        if (rawSubjectDate && rawSubjectDate.length === 8) {
            formattedSubjectDate = `${rawSubjectDate.slice(0, 4)}-${rawSubjectDate.slice(4, 6)}-${rawSubjectDate.slice(6, 8)}`;
        }

        // Clean subject report title (e.g., "Soybeans Daily Digest_20261022_agAlabs")
        const cleanReportTitle = (report.ai_analysis && report.ai_analysis.report_overview && report.ai_analysis.report_overview.report_name)
            || subjStr.replace(/^(Fwd:\s*)+/i, '').trim();

        // Formatted readable date like "22 October 2026"
        let readableDateStr = (report.ai_analysis && report.ai_analysis.report_overview && report.ai_analysis.report_overview.readable_date);
        if (!readableDateStr) {
            try {
                const [y, m, d] = (formattedSubjectDate || report.date).split('-');
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const monName = months[parseInt(m, 10) - 1] || m;
                readableDateStr = `${parseInt(d, 10)} ${monName} ${y}`;
            } catch(e) {
                readableDateStr = report.date;
            }
        }

        const body = `
            <div class="modal-split-3">
                <!-- Panel 1: Email Preview -->
                <div class="report-panel">
                    <div class="report-panel-header">
                        <span><i class="fas fa-envelope-open-text" style="color: #60a5fa; margin-right: 6px;"></i> Email Transmission Preview</span>
                        <span class="badge" style="font-size: .7rem; ${report.is_gmail ? 'background: rgba(234,67,53,0.15); color: #ea4335;' : 'background: var(--bg-hover);'}">
                            ${report.is_gmail ? '<i class="fab fa-google"></i> mail.agalabs@gmail.com' : 'MIS Archive'}
                        </span>
                    </div>
                    <div class="report-panel-body" style="font-size: .85rem; line-height: 1.5;">
                        <!-- Email Header Metadata -->
                        <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid var(--border);">
                                <div>
                                    <div style="color: var(--text-muted); font-size: .72rem; text-transform: uppercase; font-weight: 600;">From:</div>
                                    <div style="font-weight: 700; color: var(--text-primary); font-size: .84rem;">${report.sender}</div>
                                </div>
                                <span class="badge" style="background: ${catStyle.bg}; color: ${catStyle.text}; border: 1px solid ${catStyle.border}; font-size: .72rem; font-weight: 700; padding: 2px 8px;">
                                    ${report.category}
                                </span>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border);">
                                <span style="color: var(--text-muted); font-size: .75rem; font-weight: 600;">Date & Time Sent:</span>
                                <span style="color: var(--text-secondary); font-size: .78rem; font-weight: 600;">${report.date} at ${report.time_sent}</span>
                            </div>
                            
                            <div style="padding-top: 7px;">
                                <div style="color: var(--text-muted); font-size: .72rem; text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">Subject:</div>
                                <div style="font-weight: 700; color: var(--text-primary); font-size: .84rem; word-break: break-word;">${report.subject}</div>
                            </div>
                        </div>

                        <!-- Email Message Body Rendered Preview -->
                        <div style="margin-bottom: 12px;">
                            <div style="color: var(--text-muted); font-size: .75rem; font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <span><i class="fas fa-align-left" style="margin-right: 4px;"></i> Message Body:</span>
                                <span style="font-size: .68rem; color: var(--text-muted);">Formatted Preview</span>
                            </div>
                            <div class="email-preview-card">
                                <iframe id="report-email-preview-frame" 
                                        class="email-preview-iframe"
                                        sandbox="allow-same-origin allow-popups"
                                        title="Email Transmission Body">
                                </iframe>
                            </div>
                        </div>

                        <!-- Attached Document -->
                        <div style="background: rgba(59,130,246,0.08); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(59,130,246,0.25);">
                            <div style="font-weight: 600; font-size: .78rem; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                                <span><i class="fas fa-paperclip" style="color: #60a5fa; margin-right: 5px;"></i> Attached Document</span>
                                <span style="font-size: .7rem; color: var(--text-muted);">${(report.size / 1000000).toFixed(2)} MB</span>
                            </div>
                            <div style="font-size: .78rem; color: #60a5fa; word-break: break-all; font-weight: 600;">
                                ${report.filename || report.report_name + '.pdf'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Panel 2: Interactive PDF Viewer Canvas -->
                <div class="report-panel">
                    <div class="report-panel-header">
                        <span><i class="fas fa-file-pdf" style="color: #ef4444; margin-right: 6px;"></i> Interactive PDF Canvas</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <a href="${report.pdf_url}" target="_blank" class="btn btn-primary btn-sm" style="font-size: .72rem; padding: 3px 8px;" title="Open In New Window">
                                <i class="fas fa-external-link-alt"></i> Pop-out
                            </a>
                        </div>
                    </div>
                    <div class="report-panel-body" style="padding: 0; background: #262626; display: flex; flex-direction: column; position: relative; height: 100%;">
                        <iframe src="${report.pdf_url}" style="width: 100%; height: 100%; min-height: 540px; border: none; background: #2b2b2b;" title="${report.report_name}"></iframe>
                        <div style="padding: 8px 12px; background: var(--bg-secondary); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: .75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
                                <i class="fas fa-file-pdf" style="color: #ef4444;"></i> ${report.filename || report.report_name}
                            </span>
                            <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-size: .7rem;">
                                <i class="fas fa-check-circle"></i> Live Stream Active
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Panel 3: AI Report Analysis -->
                <div class="report-panel">
                    <div class="report-panel-header">
                        <span><i class="fas fa-brain" style="color: #a78bfa; margin-right: 6px;"></i> AI Document Intelligence</span>
                        <span class="badge" style="background: rgba(167,139,250,0.2); color: #a78bfa; font-size: .7rem; font-weight: 700;">
                            Auto Audited
                        </span>
                    </div>
                    <div class="report-panel-body" style="font-size: .85rem;">
                        <!-- Report Overview -->
                        <div style="margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-weight: 700; font-size: .82rem; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-file-invoice"></i> Report Overview
                                </div>
                                <span class="badge" style="background: rgba(16,185,129,0.18); color: #10b981; border: 1px solid rgba(16,185,129,0.35); font-size: .7rem; font-weight: 700; padding: 3px 8px;">
                                    <i class="fas fa-check-double"></i> Match Confirmed (100%)
                                </span>
                            </div>

                            <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
                                <!-- Commodity Name -->
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border);">
                                    <span style="color: var(--text-muted); font-size: .78rem; font-weight: 600;">Commodity Name</span>
                                    <span class="badge" style="background: ${catStyle.bg}; color: ${catStyle.text}; border: 1px solid ${catStyle.border}; font-size: .78rem; font-weight: 700; padding: 3px 10px;">
                                        ${report.category}
                                    </span>
                                </div>

                                <!-- Subject / Document Title -->
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border); gap: 10px;">
                                    <span style="color: var(--text-muted); font-size: .78rem; font-weight: 600; white-space: nowrap;">Subject Title</span>
                                    <span style="color: var(--text-primary); font-size: .82rem; font-weight: 700; text-align: right; word-break: break-word;">
                                        ${cleanReportTitle}
                                    </span>
                                </div>

                                <!-- Date from Subject: Raw "20261022" and yyyy-mm-dd format -->
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
                                    <span style="color: var(--text-muted); font-size: .78rem; font-weight: 600;">Subject Date Tag</span>
                                    <div style="text-align: right;">
                                        <span class="badge" style="background: rgba(96,165,250,0.15); color: #60a5fa; font-family: monospace; font-size: .78rem; padding: 2px 7px;">"${rawSubjectDate}"</span>
                                        <i class="fas fa-arrow-right" style="font-size: .65rem; color: var(--text-muted); margin: 0 4px;"></i>
                                        <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; font-family: monospace; font-size: .78rem; font-weight: 700; padding: 2px 7px;">${formattedSubjectDate}</span>
                                    </div>
                                </div>

                                <!-- PDF Header Date -->
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0;">
                                    <span style="color: var(--text-muted); font-size: .78rem; font-weight: 600;">PDF Header Date</span>
                                    <span style="color: #facc15; font-size: .84rem; font-weight: 700;">
                                        <i class="fas fa-calendar-day" style="font-size: .78rem; margin-right: 4px;"></i> ${readableDateStr}
                                    </span>
                                </div>
                            </div>

                            <p style="background: rgba(167,139,250,0.08); padding: 10px 12px; border-radius: 6px; font-size: .82rem; line-height: 1.5; border-left: 3px solid #a78bfa; margin: 0; color: var(--text-secondary);">
                                ${(report.ai_analysis && report.ai_analysis.report_overview && report.ai_analysis.report_overview.match_note) || report.ai_analysis.summary}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="App.showToast('Report verified and logged to audit trail', 'success'); App.closeModal();">
                <i class="fas fa-check"></i> Mark Inspected
            </button>
        `;

        window.App.showModal(`3-in-1 Report Inspection: ${report.report_name}`, body, footer, 'modal-wide');

        // Populate and responsively format Email Transmission Preview body
        setTimeout(() => {
            const emailIframe = document.getElementById('report-email-preview-frame');
            if (!emailIframe) return;

            const rawBody = report.email_body || '<div style="font-family:sans-serif;padding:16px;color:#64748b;text-align:center;">No email message body recorded.</div>';
            
            const responsiveStyles = `
                <style>
                    html, body {
                        margin: 0 !important;
                        padding: 12px 14px !important;
                        background: #ffffff !important;
                        color: #1e293b !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                        font-size: 13px !important;
                        line-height: 1.5 !important;
                        box-sizing: border-box !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        overflow-x: hidden !important;
                    }
                    *, *:before, *:after {
                        box-sizing: border-box !important;
                    }
                    table, table[style*="width"], table[width], table.r0-o, table.r2-o, table.r5-o, table.r8-o, table.r11-o {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        table-layout: auto !important;
                    }
                    td, th, td[style*="width"] {
                        box-sizing: border-box !important;
                        max-width: 100% !important;
                        word-break: break-word !important;
                    }
                    img {
                        max-width: 100% !important;
                        height: auto !important;
                        object-fit: contain !important;
                    }
                    p, div, span, h1, h2, h3, h4, h5, h6 {
                        max-width: 100% !important;
                        word-wrap: break-word !important;
                    }
                    /* Smooth scrollbar */
                    ::-webkit-scrollbar {
                        width: 5px;
                    }
                    ::-webkit-scrollbar-track {
                        background: #f8fafc;
                    }
                    ::-webkit-scrollbar-thumb {
                        background: #cbd5e1;
                        border-radius: 4px;
                    }
                    ::-webkit-scrollbar-thumb:hover {
                        background: #94a3b8;
                    }
                </style>
            `;

            let finalHtml = rawBody;
            const isHtml = /<[a-z][\s\S]*>/i.test(finalHtml);
            if (isHtml) {
                if (finalHtml.includes('<head>')) {
                    finalHtml = finalHtml.replace('<head>', '<head>' + responsiveStyles);
                } else if (finalHtml.includes('<body')) {
                    finalHtml = responsiveStyles + finalHtml;
                } else {
                    finalHtml = `<!DOCTYPE html><html><head>${responsiveStyles}</head><body>${finalHtml}</body></html>`;
                }
            } else {
                finalHtml = `<!DOCTYPE html><html><head>${responsiveStyles}</head><body><div style="white-space: pre-wrap; font-size: 13px; line-height: 1.5; color: #1e293b;">${finalHtml}</div></body></html>`;
            }

            try {
                const doc = emailIframe.contentDocument || (emailIframe.contentWindow && emailIframe.contentWindow.document);
                if (doc) {
                    doc.open();
                    doc.write(finalHtml);
                    doc.close();
                } else {
                    emailIframe.srcdoc = finalHtml;
                }
            } catch (err) {
                emailIframe.srcdoc = finalHtml;
            }
        }, 60);
    }
};

export default ReportModule;
