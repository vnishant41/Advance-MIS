/**
 * Tasks — Daily/Weekly/Monthly task views with roster integration.
 */
import { api } from './api.js';

export default {
    currentTab: 'today',

    async render() {
        return `
            <div class="tabs" id="task-tabs">
                <button class="tab active" data-tab="today">
                    <i class="fas fa-sun"></i> Today
                </button>
                <button class="tab" data-tab="weekly">
                    <i class="fas fa-calendar-week"></i> Weekly
                </button>
                <button class="tab" data-tab="monthly">
                    <i class="fas fa-calendar-alt"></i> Monthly
                </button>
                <button class="tab" data-tab="history">
                    <i class="fas fa-history"></i> Entry History
                </button>
            </div>

            <div id="task-content">
                <div class="loading-skeleton">
                    <div class="skeleton-card"></div>
                    <div class="skeleton-card" style="height:80px;"></div>
                </div>
            </div>
        `;
    },

    async init() {
        this.currentTab = 'today';

        document.querySelectorAll('#task-tabs .tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#task-tabs .tab').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentTab = e.currentTarget.dataset.tab;
                this.loadTab();
            });
        });

        this.loadTab();
    },

    async loadTab() {
        const container = document.getElementById('task-content');
        container.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card"></div></div>';

        try {
            if (this.currentTab === 'today') await this.loadToday(container);
            else if (this.currentTab === 'weekly') await this.loadWeekly(container);
            else if (this.currentTab === 'monthly') await this.loadMonthly(container);
            else if (this.currentTab === 'history') await this.loadHistory(container);
        } catch (err) {
            container.innerHTML = `<div class="glass-card" style="padding:24px; text-align:center;"><p class="error-text"><i class="fas fa-exclamation-circle"></i> Failed to load tasks</p></div>`;
            App.showToast('Error loading tasks', 'error');
        }
    },

    async loadToday(container) {
        const data = await api.get('/tasks/today');
        const canManage = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role);

        let html = `
            <div class="glass-card" style="padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="font-size: 1rem; font-weight: 700;">
                        <i class="fas fa-sun" style="color:var(--warning);margin-right:8px;"></i>
                        ${data.dayName} — ${data.today}
                    </h3>
                    ${canManage ? '<button class="btn btn-primary btn-sm" id="btn-add-task-daily"><i class="fas fa-plus"></i> Add Task</button>' : ''}
                </div>

                <!-- Today Filter and Sort Bar -->
                <div class="filter-bar" id="today-filter-bar" style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                    <input type="text" id="today-search" placeholder="Search today's tasks..." style="flex: 1; min-width: 150px;" />
                    
                    <select id="today-status-filter" style="min-width: 120px;">
                        <option value="">All Status</option>
                        <option value="Done">Done</option>
                        <option value="Pending">Pending</option>
                        <option value="Skip">Skip</option>
                    </select>

                    <select id="today-sort" style="min-width: 150px;">
                        <option value="default">Default Order</option>
                        <option value="name-asc">Name: A-Z</option>
                        <option value="name-desc">Name: Z-A</option>
                        <option value="status-asc">Status: Done first</option>
                        <option value="status-desc">Status: Pending first</option>
                    </select>
                </div>

                <!-- Container for lists -->
                <div id="today-lists-container"></div>
            </div>
        `;
        
        container.innerHTML = html;

        // Bind filter/sort inputs
        const todaySearch = document.getElementById('today-search');
        const todayStatus = document.getElementById('today-status-filter');
        const todaySort = document.getElementById('today-sort');

        const triggerFilter = () => {
            this.renderTodayLists(data, todaySearch.value, todayStatus.value, todaySort.value);
        };

        todaySearch?.addEventListener('input', triggerFilter);
        todayStatus?.addEventListener('change', triggerFilter);
        todaySort?.addEventListener('change', triggerFilter);

        // Render lists initially
        this.renderTodayLists(data, '', '', 'default');

        // Add task button (header level)
        document.getElementById('btn-add-task-daily')?.addEventListener('click', () => this.showAddTaskModal('daily'));
    },

    renderTodayLists(data, searchVal, statusVal, sortVal) {
        const container = document.getElementById('today-lists-container');
        if (!container) return;

        const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;');

        // Helper to filter items
        const filterItem = (name, status) => {
            const matchesSearch = !searchVal || name.toLowerCase().includes(searchVal.toLowerCase());
            const matchesStatus = !statusVal || (status || 'Pending').toLowerCase() === statusVal.toLowerCase();
            return matchesSearch && matchesStatus;
        };

        // Helper to sort items
        const sortItems = (items, getName) => {
            if (sortVal === 'default') return items; // stable
            return [...items].sort((a, b) => {
                const nameA = getName(a).toLowerCase();
                const nameB = getName(b).toLowerCase();
                const statusA = (a.status || 'Pending').toLowerCase();
                const statusB = (b.status || 'Pending').toLowerCase();

                if (sortVal.startsWith('name')) {
                    const cmp = nameA.localeCompare(nameB);
                    return sortVal.endsWith('desc') ? -cmp : cmp;
                }
                if (sortVal.startsWith('status')) {
                    const score = (s) => s === 'done' ? 1 : s === 'skip' ? 3 : 2;
                    const cmp = score(statusA) - score(statusB);
                    return sortVal.endsWith('desc') ? -cmp : cmp;
                }
                return 0;
            });
        };

        // 1. Filter and sort daily tasks
        let dailyTasks = (data.dailyTasks || []).filter(t => filterItem(t.name, t.status));
        dailyTasks = sortItems(dailyTasks, t => t.name);

        // 2. Filter and sort roster tasks
        let rosterTasks = (data.rosterTasks || []).filter(r => filterItem(r.role, r.status));
        rosterTasks = sortItems(rosterTasks, r => r.role);

        // 3. Filter and sort MIS reports
        let misTasks = (data.misTasks || []).filter(t => filterItem(t.name, t.status));
        misTasks = sortItems(misTasks, t => t.name);

        // 4. Filter and sort report groups
        let groupTasks = (data.groupTasks || []).filter(g => filterItem(g.name, g.status));
        groupTasks = sortItems(groupTasks, g => g.name);

        // 5. Filter and sort carried forward
        let carriedForward = (data.carriedForward || []).filter(cf => filterItem(cf.topic, cf.status));
        carriedForward = sortItems(carriedForward, cf => cf.topic);

        // 6. Filter and sort DU tasks (Data Updates)
        let duTasks = [];
        (data.duTasks || []).forEach(g => {
            const matchedFactors = (g.factors || []).filter(f => filterItem(f.factor, f.status));
            if (matchedFactors.length > 0) {
                const sortedFactors = sortItems(matchedFactors, f => f.factor);
                duTasks.push({
                    ...g,
                    factors: sortedFactors
                });
            }
        });
        if (sortVal.startsWith('name')) {
            duTasks.sort((a, b) => {
                const cmp = a.name.localeCompare(b.name);
                return sortVal.endsWith('desc') ? -cmp : cmp;
            });
        }

        // Now build the HTML block
        let html = '';

        // Standard row layout: [main content | action button | (i) | remark | status]
        const infoBtn = (title, instructions) => {
            if (!instructions || !instructions.trim()) return '';
            return `<button class="btn-icon info-btn" type="button"
                    data-title="${escAttr(title)}"
                    data-instructions="${escAttr(instructions)}"
                    title="View instructions"
                    style="color:var(--info); padding:4px 6px; font-size:1rem;">
                <i class="fas fa-info-circle"></i>
            </button>`;
        };

        const statusBtn = (status, entryType, topic, subTopic) => {
            const s = (status || 'Pending').toLowerCase();
            const isSkip = s === 'skip';
            return `<button type="button"
                    class="status-toggle status-badge ${s}"
                    data-status="${status || 'Pending'}"
                    data-entry-type="${entryType}"
                    data-topic="${escAttr(topic)}"
                    data-sub-topic="${escAttr(subTopic || '')}"
                    ${isSkip ? 'disabled' : ''}
                    style="border:none; cursor:${isSkip ? 'default' : 'pointer'}; font-family:inherit;"
                    title="${isSkip ? 'Skipped' : 'Click to toggle Done / Pending'}">
                ${status || 'Pending'}
            </button>`;
        };

        const remarkBtn = (entryType, topic, subTopic, remarks) => `
            <button type="button" class="btn-icon remark-btn" title="${remarks ? App.escapeHtml(remarks) : 'Add remark'}"
                data-entry-type="${entryType}"
                data-topic="${escAttr(topic)}"
                data-sub-topic="${escAttr(subTopic || '')}"
                data-remarks="${escAttr(remarks || '')}"
                style="color:${remarks ? 'var(--warning)' : 'var(--text-muted)'}; padding:4px 6px; font-size:.9rem;">
                <i class="fas fa-comment-dots"></i>
            </button>`;

        const row = ({ title, subtitle, status, entryType, topic, subTopic, instructions, remarks = '', actionBtn = '', extraClass = '', extraBadge = '' }) => `
            <div class="today-row ${extraClass}" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; background:var(--bg-primary);">
                <div style="min-width:0; flex:1;">
                    <div style="font-weight:600; font-size:.9rem;">${extraBadge}${title}</div>
                    ${subtitle ? `<div style="font-size:.78rem; color:var(--text-muted);">${subtitle}</div>` : ''}
                    ${remarks ? `<div class="remark-text"><i class="fas fa-comment" style="margin-right:4px; font-size:.65rem;"></i>${App.escapeHtml(remarks)}</div>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${actionBtn}
                    ${remarkBtn(entryType, topic, subTopic, remarks)}
                    ${infoBtn(topic, instructions)}
                    ${statusBtn(status, entryType, topic, subTopic)}
                </div>
            </div>`;

        // Render sections
        // Daily tasks
        html += '<div class="section-title"><i class="fas fa-list-check"></i> Scheduled Tasks</div>';
        if (dailyTasks.length > 0) {
            html += dailyTasks.map(t => row({
                title: App.escapeHtml(t.name),
                subtitle: `${t.assignee || 'Unassigned'}
                    ${t.recurrence && t.recurrence !== 'adhoc' ? ` · <span class="tag" style="font-size:.65rem;">${App.escapeHtml(t.recurrence)}</span>` : ''}
                    ${t.scheduleDay ? ` · <span class="tag" style="font-size:.65rem;">${App.escapeHtml(t.scheduleDay)}</span>` : ''}`,
                status: t.status,
                entryType: 'Task',
                topic: t.name,
                instructions: t.instructions,
                remarks: t.remarks || '',
                extraClass: t.isAdhoc ? 'adhoc-row' : '',
                extraBadge: t.isAdhoc ? '<span class="status-badge pending" style="font-size:.65rem; margin-right:6px; background:rgba(167,139,250,0.15); color:#a78bfa; padding:2px 8px; border-radius:10px; font-weight:700;">EXTRA</span>' : '',
            })).join('');
        } else {
            html += '<div class="empty-state" style="padding:15px; margin-bottom: 8px;"><p>No scheduled tasks today</p></div>';
        }

        // Add Extra Task Button at the bottom of Scheduled Tasks section
        html += `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 20px; margin-top: 8px;">
                <button class="btn btn-outline btn-sm" id="btn-add-extra-task" style="border-color: #a78bfa; color: #a78bfa;">
                    <i class="fas fa-plus"></i> Add Extra Task
                </button>
            </div>
        `;

        // Roster duties
        if (rosterTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-user-clock"></i> Roster Duties</div>';
            html += rosterTasks.map(r => row({
                title: App.escapeHtml(r.role),
                subtitle: App.escapeHtml(r.employee),
                status: r.status,
                entryType: 'Roster',
                topic: r.role,
                instructions: r.instructions,
            })).join('');
        }

        // Factor Tasks (Data Updates) — heading per (commodity, type) with factor sub-rows.
        if (duTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-database"></i> Factor Tasks (Data Updates)</div>';
            html += duTasks.map(g => {
                const topic = `${g.commodity}::${g.type}`;
                const factorsHtml = (g.factors || []).map(f => `
                    <div class="today-row" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 12px; margin-top:6px; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; margin-left:18px;">
                        <div style="min-width:0; flex:1;">
                            <div style="font-size:.83rem; font-weight:500;">
                                <i class="fas fa-angle-right" style="color:var(--text-muted); margin-right:6px; font-size:.7rem;"></i>${App.escapeHtml(f.factor)}
                            </div>
                            ${f.source ? `<div style="font-size:.7rem; color:var(--text-muted); margin-left:14px;">${App.escapeHtml(f.source)}</div>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            ${infoBtn(`${g.commodity} — ${f.factor}`, f.instructions)}
                            ${statusBtn(f.status, 'DataUpdate', topic, f.factor)}
                        </div>
                    </div>
                `).join('');
                return `
                    <div style="padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:10px; background:var(--bg-primary);">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <div style="min-width:0; flex:1;">
                                <div style="font-weight:600; font-size:.9rem;">${App.escapeHtml(g.name)}</div>
                                <div style="font-size:.78rem; color:var(--text-muted);">
                                    <span class="tag" style="font-size:.65rem;">${App.escapeHtml(g.type)}</span>
                                    · ${(g.factors||[]).length} factor${(g.factors||[]).length === 1 ? '' : 's'}
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                ${infoBtn(g.commodity + ' — ' + g.type, g.instructions)}
                            </div>
                        </div>
                        ${factorsHtml}
                    </div>`;
            }).join('');
        }

        // MIS Reports
        if (misTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-file-pdf"></i> MIS Reports</div>';
            html += misTasks.map(t => row({
                title: App.escapeHtml(t.name),
                subtitle: `${t.frequency ? `<span class="tag" style="font-size:.65rem;">${App.escapeHtml(t.frequency)}</span> · ` : ''}${App.escapeHtml(t.status)}`,
                status: t.status,
                entryType: 'MISReport',
                topic: t.reportName,
                instructions: t.instructions,
                actionBtn: `<button class="btn btn-sm btn-outline" onclick="App.modules.tasks.gotoMisUpload('${escAttr(t.reportName)}')">
                    <i class="fas fa-upload"></i> Upload
                </button>`,
            })).join('');
        }

        // Report Groups (merged reports scheduled today)
        if (groupTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-object-group"></i> Merged Reports</div>';
            html += groupTasks.map(g => row({
                title: App.escapeHtml(g.name),
                subtitle: `${g.frequency ? `<span class="tag" style="font-size:.65rem;">${App.escapeHtml(g.frequency)}</span>` : ''}
                    ${(g.members||[]).slice(0,6).map(m => `<span class="tag" style="font-size:.6rem; margin-left:2px;">${App.escapeHtml(m)}</span>`).join(' ')}
                    ${(g.members||[]).length > 6 ? `<span style="font-size:.7rem;">+${g.members.length - 6} more</span>` : ''}`,
                status: g.status,
                entryType: 'ReportGroup',
                topic: g.groupName,
                instructions: g.instructions,
            })).join('');
        }

        // Carried-Forward (skipped) tasks
        if (carriedForward.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-redo" style="color:var(--warning);"></i> Carried Forward (Previously Skipped)</div>';
            html += carriedForward.map(cf => row({
                title: App.escapeHtml(cf.topic),
                subtitle: cf.subTopic ? App.escapeHtml(cf.subTopic) : '',
                status: cf.status,
                entryType: cf.entryType,
                topic: cf.topic,
                subTopic: cf.subTopic || '',
                instructions: '',
                remarks: cf.remarks || '',
                extraClass: 'carried-row',
                extraBadge: `<span class="carried-badge"><i class="fas fa-history"></i> Carried from ${cf.carriedFrom}</span> `,
            })).join('');
        }

        // Submitted entries
        if (data.submitted && data.submitted.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-check-double"></i> Submitted Today</div>';
            html += `<div class="filter-bar" id="submitted-filter-bar">
                <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                <input type="text" id="submitted-search" placeholder="Search task name..." />
                <select id="submitted-status-filter">
                    <option value="">All Status</option>
                    <option value="Done">Done</option>
                    <option value="Pending">Pending</option>
                    <option value="Skip">Skip</option>
                </select>
                <select id="submitted-sort">
                    <option value="time-desc">Newest first</option>
                    <option value="time-asc">Oldest first</option>
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="status">By Status</option>
                </select>
            </div>`;
            html += '<table class="data-table" id="submitted-table"><thead><tr><th class="sortable-header" data-sort="topic">Task</th><th class="sortable-header" data-sort="status">Status</th><th class="sortable-header" data-sort="time">Time</th><th>Action</th></tr></thead><tbody>';
            html += data.submitted.map(s => `
                <tr data-topic="${escAttr(s.topic)}" data-status="${s.status}" data-time="${s.timestampSubmitted || ''}">
                    <td style="font-weight:500;">${App.escapeHtml(s.topic)}${s.remarks ? `<div class="remark-text">${App.escapeHtml(s.remarks)}</div>` : ''}</td>
                    <td><span class="status-badge ${s.status.toLowerCase()}">${s.status}</span></td>
                    <td style="font-size:.8rem;color:var(--text-muted);">${App.timeAgo(s.timestampSubmitted)}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="App.modules.tasks.editEntry('${s.logId}')">Edit</button></td>
                </tr>
            `).join('');
            html += '</tbody></table>';
        } else {
            html += '<div class="empty-state" style="padding:20px; margin-top:20px;"><i class="fas fa-inbox"></i><p>No tasks submitted yet today</p></div>';
        }

        container.innerHTML = html;

        // Add extra task button
        document.getElementById('btn-add-extra-task')?.addEventListener('click', () => this.showAddExtraTaskModal());

        // (i) info button — opens a modal showing the admin-set instructions.
        container.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const title = btn.dataset.title || 'Instructions';
                const text = btn.dataset.instructions || '';
                App.showModal(
                    `Instructions — ${title}`,
                    `<div style="white-space:pre-wrap; line-height:1.55; color:var(--text-primary); font-size:.92rem;">
                        ${App.escapeHtml(text)}
                    </div>`,
                    '<button class="btn btn-primary" onclick="App.closeModal()">Got it</button>'
                );
            });
        });

        // Status pill click → toggle Done ↔ Pending
        container.querySelectorAll('.status-toggle').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const current = btn.dataset.status || 'Pending';
                const next = current === 'Done' ? 'Pending' : 'Done';
                const prevHtml = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    await api.post('/tasks/remark', {
                        entryType: btn.dataset.entryType,
                        topic: btn.dataset.topic,
                        subTopic: btn.dataset.subTopic || '',
                        status: next,
                        date: data.today,
                    });
                    
                    const et = btn.dataset.entryType;
                    const topic = btn.dataset.topic;
                    const subTopic = btn.dataset.subTopic;

                    // Update local state directly
                    if (et === 'Task') {
                        const it = (data.dailyTasks || []).find(x => x.name === topic);
                        if (it) it.status = next;
                    } else if (et === 'Roster') {
                        const it = (data.rosterTasks || []).find(x => x.role === topic);
                        if (it) it.status = next;
                    } else if (et === 'MISReport') {
                        const it = (data.misTasks || []).find(x => x.name === topic);
                        if (it) it.status = next;
                    } else if (et === 'ReportGroup') {
                        const it = (data.groupTasks || []).find(x => x.groupName === topic);
                        if (it) it.status = next;
                    } else if (et === 'DataUpdate') {
                        const grp = (data.duTasks || []).find(x => `${x.commodity}::${x.type}` === topic);
                        if (grp) {
                            const f = (grp.factors || []).find(x => x.factor === subTopic);
                            if (f) f.status = next;
                        }
                    }

                    // Re-render in place
                    this.renderTodayLists(data, searchVal, statusVal, sortVal);
                    App.showToast(`Marked ${next}`, 'success');
                } catch (err) {
                    btn.innerHTML = prevHtml;
                    App.showToast(err.message || 'Failed to update status', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Remark buttons
        this._wireRemarkButtons(container, data.today, data);
        this._wireSubmittedFilters();
    },

    /**
     * After a row's status changes, move it to the bottom of its sibling
     * group when Done, or to the top when re-marked Pending. The row is
     * identified by the .today-row class set in render templates.
     *
     * Within a sibling group we want to land:
     *   - Pending → above the first Done sibling (so all Pendings cluster on top)
     *   - Done    → at the very bottom
     */
    _reflowAfterStatus(btn, newStatus) {
        const row = btn.closest('.today-row');
        if (!row || !row.parentElement) return;
        const parent = row.parentElement;
        const isDone = newStatus === 'Done';

        row.style.transition = 'opacity .2s';
        row.style.opacity = '.55';
        setTimeout(() => {
            if (isDone) {
                // Bottom of its sibling rows.
                parent.appendChild(row);
            } else {
                // Top: insert before the first sibling row (skip non-row siblings
                // like section headings or factor-group headers).
                const firstRow = Array.from(parent.children).find(
                    c => c !== row && c.classList && c.classList.contains('today-row')
                );
                if (firstRow) parent.insertBefore(row, firstRow);
                else parent.insertBefore(row, parent.firstChild);
            }
            row.style.opacity = '1';
        }, 180);
    },

    /** Wire remark buttons — click opens a small input modal to add/edit a remark. */
    _wireRemarkButtons(container, today, data) {
        container.querySelectorAll('.remark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const current = btn.dataset.remarks || '';
                const entryType = btn.dataset.entryType;
                const topic = btn.dataset.topic;
                const subTopic = btn.dataset.subTopic || '';

                App.showModal(
                    'Add/Edit Remark',
                    `<div style="margin-bottom:12px; color:var(--text-secondary); font-size:.85rem;">
                        <strong>${App.escapeHtml(topic)}</strong>${subTopic ? ' → ' + App.escapeHtml(subTopic) : ''}
                    </div>
                    <label>Remark / Reason</label>
                    <textarea id="remark-input" rows="3" style="width:100%; resize:vertical;" placeholder="E.g., Spot price not updated because NCDEX is closed">${App.escapeHtml(current)}</textarea>`,
                    `<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
                     <button class="btn btn-primary" id="remark-save-btn">Save Remark</button>`
                );

                document.getElementById('remark-save-btn')?.addEventListener('click', async () => {
                    const remarkText = document.getElementById('remark-input')?.value || '';
                    try {
                        await api.post('/tasks/remark', {
                            entryType,
                            topic,
                            subTopic,
                            remarks: remarkText,
                            date: today,
                        });
                        btn.dataset.remarks = remarkText;
                        btn.style.color = remarkText ? 'var(--warning)' : 'var(--text-muted)';
                        btn.title = remarkText || 'Add remark';
                        
                        // Update in local data object so filter/sort redraw preserves it
                        if (data) {
                            const et = entryType;
                            if (et === 'Task') {
                                const it = (data.dailyTasks || []).find(x => x.name === topic);
                                if (it) it.remarks = remarkText;
                            } else if (et === 'Roster') {
                                const it = (data.rosterTasks || []).find(x => x.role === topic);
                                if (it) it.remarks = remarkText;
                            } else if (et === 'MISReport') {
                                const it = (data.misTasks || []).find(x => x.name === topic);
                                if (it) it.remarks = remarkText;
                            } else if (et === 'ReportGroup') {
                                const it = (data.groupTasks || []).find(x => x.groupName === topic);
                                if (it) it.remarks = remarkText;
                            } else if (et === 'DataUpdate') {
                                const grp = (data.duTasks || []).find(x => `${x.commodity}::${x.type}` === topic);
                                if (grp) {
                                    const f = (grp.factors || []).find(x => x.factor === subTopic);
                                    if (f) f.remarks = remarkText;
                                }
                            }
                        }

                        // Update inline remark text in the row
                        const row = btn.closest('.today-row');
                        if (row) {
                            let remarkEl = row.querySelector('.remark-text');
                            if (remarkText) {
                                if (!remarkEl) {
                                    remarkEl = document.createElement('div');
                                    remarkEl.className = 'remark-text';
                                    row.querySelector('div > div:first-child')?.appendChild(remarkEl);
                                }
                                remarkEl.innerHTML = `<i class="fas fa-comment" style="margin-right:4px; font-size:.65rem;"></i>${App.escapeHtml(remarkText)}`;
                            } else if (remarkEl) {
                                remarkEl.remove();
                            }
                        }
                        App.showToast('Remark saved', 'success');
                        App.closeModal();
                    } catch (err) {
                        App.showToast(err.message || 'Failed to save remark', 'error');
                    }
                });
            });
        });
    },

    /** Wire filter bar and sort controls for the Submitted Today table */
    _wireSubmittedFilters() {
        const table = document.getElementById('submitted-table');
        const search = document.getElementById('submitted-search');
        const statusFilter = document.getElementById('submitted-status-filter');
        const sortSelect = document.getElementById('submitted-sort');
        if (!table || !search) return;

        const applyFilters = () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const searchVal = search.value.toLowerCase();
            const statusVal = statusFilter?.value || '';
            const sortVal = sortSelect?.value || 'time-desc';

            // Filter
            rows.forEach(tr => {
                const topic = (tr.dataset.topic || '').toLowerCase();
                const status = tr.dataset.status || '';
                const matchSearch = !searchVal || topic.includes(searchVal);
                const matchStatus = !statusVal || status === statusVal;
                tr.style.display = (matchSearch && matchStatus) ? '' : 'none';
            });

            // Sort visible rows
            const visibleRows = rows.filter(tr => tr.style.display !== 'none');
            visibleRows.sort((a, b) => {
                switch (sortVal) {
                    case 'time-asc':  return (a.dataset.time || '').localeCompare(b.dataset.time || '');
                    case 'time-desc': return (b.dataset.time || '').localeCompare(a.dataset.time || '');
                    case 'name-asc':  return (a.dataset.topic || '').localeCompare(b.dataset.topic || '');
                    case 'name-desc': return (b.dataset.topic || '').localeCompare(a.dataset.topic || '');
                    case 'status':    return (a.dataset.status || '').localeCompare(b.dataset.status || '');
                    default: return 0;
                }
            });
            visibleRows.forEach(tr => tbody.appendChild(tr));
        };

        search.addEventListener('input', applyFilters);
        statusFilter?.addEventListener('change', applyFilters);
        sortSelect?.addEventListener('change', applyFilters);

        // Sortable column headers
        table.querySelectorAll('.sortable-header').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                const map = { topic: 'name', status: 'status', time: 'time' };
                const sortKey = map[field] || field;
                const current = sortSelect?.value || '';
                if (current.startsWith(sortKey + '-asc')) {
                    sortSelect.value = sortKey + '-desc';
                } else {
                    sortSelect.value = sortKey + '-asc';
                }
                applyFilters();
            });
        });
    },

    /** Wire filter bar and sort controls for the Monthly tasks table */
    _wireMonthlyFilters() {
        const table = document.getElementById('monthly-table');
        const search = document.getElementById('monthly-search');
        const typeFilter = document.getElementById('monthly-type-filter');
        const freqFilter = document.getElementById('monthly-freq-filter');
        const sortSelect = document.getElementById('monthly-sort');
        if (!table || !search) return;

        const applyFilters = () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const searchVal = search.value.toLowerCase();
            const typeVal = typeFilter?.value || '';
            const freqVal = freqFilter?.value || '';
            const sortVal = sortSelect?.value || 'default';

            // Filter
            rows.forEach(tr => {
                const name = (tr.dataset.name || '').toLowerCase();
                const type = tr.dataset.type || '';
                const freq = tr.dataset.freq || '';

                const matchSearch = !searchVal || name.includes(searchVal);
                const matchType = !typeVal || type === typeVal;
                const matchFreq = !freqVal || freq === freqVal;

                tr.style.display = (matchSearch && matchType && matchFreq) ? '' : 'none';
            });

            // Sort visible rows
            const visibleRows = rows.filter(tr => tr.style.display !== 'none');
            visibleRows.sort((a, b) => {
                if (sortVal === 'default') {
                    // Default logic: today first, then date asc
                    const aIsToday = a.dataset.istoday === '1' ? 0 : 1;
                    const bIsToday = b.dataset.istoday === '1' ? 0 : 1;
                    if (aIsToday !== bIsToday) return aIsToday - bIsToday;
                    return (a.dataset.date || '').localeCompare(b.dataset.date || '');
                }

                let va = '', vb = '';
                if (sortVal.startsWith('name')) {
                    va = a.dataset.name;
                    vb = b.dataset.name;
                } else if (sortVal.startsWith('type')) {
                    va = a.dataset.type;
                    vb = b.dataset.type;
                } else if (sortVal.startsWith('freq')) {
                    va = a.dataset.freq;
                    vb = b.dataset.freq;
                } else if (sortVal.startsWith('assignee')) {
                    va = a.dataset.assignee;
                    vb = b.dataset.assignee;
                } else if (sortVal.startsWith('date')) {
                    va = a.dataset.date;
                    vb = b.dataset.date;
                }

                const dir = sortVal.endsWith('desc') ? 'desc' : 'asc';
                if (va < vb) return dir === 'asc' ? -1 : 1;
                if (va > vb) return dir === 'asc' ? 1 : -1;
                return 0;
            });

            visibleRows.forEach(tr => tbody.appendChild(tr));
        };

        search.addEventListener('input', applyFilters);
        typeFilter?.addEventListener('change', applyFilters);
        freqFilter?.addEventListener('change', applyFilters);
        sortSelect?.addEventListener('change', applyFilters);

        // Sortable column headers
        table.querySelectorAll('.sortable-header').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                const map = { name: 'name', type: 'type', freq: 'freq', assignee: 'assignee', date: 'date' };
                const sortKey = map[field] || field;
                const current = sortSelect?.value || '';
                
                table.querySelectorAll('.sortable-header i').forEach(icon => {
                    icon.className = 'fas fa-sort';
                    icon.style.opacity = '0.3';
                });

                if (current.startsWith(sortKey + '-asc')) {
                    sortSelect.value = sortKey + '-desc';
                    const icon = th.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-sort-down';
                        icon.style.opacity = '1';
                    }
                } else {
                    sortSelect.value = sortKey + '-asc';
                    const icon = th.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-sort-up';
                        icon.style.opacity = '1';
                    }
                }
                applyFilters();
            });
        });

        applyFilters();
    },

    async loadWeekly(container) {
        const data = await api.get('/tasks/weekly');
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const canManage = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role);

        let html = `
            <div class="glass-card" style="padding: 20px; margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="font-size:1rem; font-weight:700;">
                        <i class="fas fa-calendar-week" style="color:var(--accent);margin-right:8px;"></i>
                        Week: ${data.weekStart} → ${data.weekEnd}
                    </h3>
                    ${canManage ? '<button class="btn btn-primary btn-sm" id="btn-add-task-weekly"><i class="fas fa-plus"></i> Add Task</button>' : ''}
                </div>
        `;

        // Weekly grid
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">';
        days.forEach(dayName => {
            const dayData = data.weekGrid?.[dayName];
            const isToday = dayData?.isToday;
            const entries = dayData?.entries || [];

            const isHoliday = dayData?.isHoliday;
            html += `
                <div style="background: var(--bg-primary); border-radius: 8px; padding: 12px; border: 1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}; ${isToday ? 'box-shadow: 0 0 12px var(--accent-glow);' : ''} ${isHoliday ? 'opacity:.65;' : ''}">
                    <div style="font-weight:700; font-size:.85rem; margin-bottom:8px; color: ${isToday ? 'var(--accent)' : isHoliday ? 'var(--warning)' : 'var(--text-primary)'};">
                        ${dayName}
                        ${isToday ? '<span style="font-size:.7rem; color:var(--accent);">(Today)</span>' : ''}
                        ${isHoliday ? '<i class="fas fa-umbrella-beach" title="Holiday" style="font-size:.7rem; margin-left:4px;"></i>' : ''}
                    </div>
                    <div style="font-size:.75rem; color:var(--text-muted); margin-bottom:8px;">${dayData?.date || ''}</div>
                    ${entries.length > 0 ? entries.map(e => `
                        <div style="padding:6px 8px; background:var(--bg-card); border-radius:4px; margin-bottom:4px; font-size:.8rem;">
                            <span class="status-badge ${e.status.toLowerCase()}" style="font-size:.65rem; margin-right:4px;">${e.status}</span>
                            ${App.escapeHtml(e.topic)}
                        </div>
                    `).join('') : `<div style="font-size:.8rem; color:var(--text-muted);">${isHoliday ? 'Holiday' : 'No entries'}</div>`}
                </div>
            `;
        });
        html += '</div></div>';

        container.innerHTML = html;
        document.getElementById('btn-add-task-weekly')?.addEventListener('click', () => this.showAddTaskModal('weekly'));
    },

    async loadMonthly(container) {
        const data = await api.get('/tasks/monthly');
        const canManage = !!data.canManage;
        const canAdd = ['SuperAdmin', 'Manager', 'Leader'].includes(window.currentUser?.role);
        this._monthlyData = data;

        const fmtDate = (iso) => {
            if (!iso) return '—';
            try {
                const d = new Date(iso + 'T00:00:00');
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            } catch (e) { return iso; }
        };

        const typeBadge = (et) => {
            const map = {
                'TaskTemplate':    { label: 'Task',          color: 'var(--accent)' },
                'Report':          { label: 'MIS Report',    color: 'var(--info)' },
                'CommodityConfig': { label: 'Factor Task',   color: '#a78bfa' },
                'ReportGroup':     { label: 'Merged Report', color: 'var(--success)' },
                'RosterConfig':    { label: 'Roster',        color: 'var(--warning)' },
            };
            const m = map[et] || { label: et, color: 'var(--text-muted)' };
            return `<span class="tag" style="background:${m.color}22; color:${m.color}; font-size:.65rem;">${m.label}</span>`;
        };

        const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

        let html = `
            <div class="glass-card" style="padding: 20px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h3 style="font-size:1rem; font-weight:700;">
                        <i class="fas fa-calendar-alt" style="color:var(--success);margin-right:8px;"></i>
                        ${data.monthStart} → ${data.monthEnd}
                    </h3>
                    ${canAdd ? '<button class="btn btn-primary btn-sm" id="btn-add-task-monthly"><i class="fas fa-plus"></i> Add Task</button>' : ''}
                </div>
                <p style="font-size:.78rem; color:var(--text-muted); margin:0;">
                    Scheduled monthly / quarterly / half-yearly / yearly tasks for this period.
                    ${canManage ? '<strong>Managers</strong> can pick a new date inline to reschedule a single occurrence — the default schedule stays unchanged.' : 'Dates here drive when the task appears on your Today view.'}
                </p>
            </div>
        `;

        const items = data.monthlyItems || [];
        if (items.length > 0) {
            const todayISO = new Date().toISOString().slice(0, 10);
            // Sort: items scheduled TODAY first, then upcoming this month, then past.
            items.sort((a, b) => {
                const ad = a.effectiveDate || a.defaultDate || '9999-12-31';
                const bd = b.effectiveDate || b.defaultDate || '9999-12-31';
                const aIsToday = ad === todayISO ? 0 : 1;
                const bIsToday = bd === todayISO ? 0 : 1;
                if (aIsToday !== bIsToday) return aIsToday - bIsToday;
                return ad.localeCompare(bd);
            });
            const todayCount = items.filter(it => (it.effectiveDate || it.defaultDate) === todayISO).length;

            html += `
                <div class="filter-bar" id="monthly-filter-bar" style="margin-bottom:12px;">
                    <label><i class="fas fa-search" style="margin-right:4px;"></i></label>
                    <input type="text" id="monthly-search" placeholder="Search by task name..." />
                    
                    <select id="monthly-type-filter">
                        <option value="">All Types</option>
                        <option value="TaskTemplate">Task</option>
                        <option value="Report">MIS Report</option>
                        <option value="CommodityConfig">Factor Task</option>
                        <option value="ReportGroup">Merged Report</option>
                        <option value="RosterConfig">Roster</option>
                    </select>

                    <select id="monthly-freq-filter">
                        <option value="">All Frequencies</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Fortnightly">Fortnightly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-Yearly">Half-Yearly</option>
                        <option value="Yearly">Yearly</option>
                    </select>

                    <select id="monthly-sort">
                        <option value="default">Default (Today first)</option>
                        <option value="name-asc">Name A-Z</option>
                        <option value="name-desc">Name Z-A</option>
                        <option value="date-asc">Date: Oldest first</option>
                        <option value="date-desc">Date: Newest first</option>
                        <option value="type-asc">Type A-Z</option>
                        <option value="type-desc">Type Z-A</option>
                        <option value="freq-asc">Freq A-Z</option>
                        <option value="freq-desc">Freq Z-A</option>
                        <option value="assignee-asc">Assignee A-Z</option>
                        <option value="assignee-desc">Assignee Z-A</option>
                    </select>
                </div>

                <div class="glass-card" style="padding:0; margin-bottom:16px;">
                    ${todayCount > 0 ? `<div style="padding:10px 16px; background:rgba(16,185,129,.08); border-bottom:1px solid var(--border); font-size:.82rem;">
                        <i class="fas fa-bolt" style="color:var(--success); margin-right:6px;"></i>
                        <strong>${todayCount}</strong> scheduled today — these are at the top.
                    </div>` : ''}
                    <table class="data-table" id="monthly-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="name">Task <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="type">Type <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="freq">Frequency <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="assignee">Assignee <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                                <th class="sortable-header" data-sort="date" style="min-width:200px;">Scheduled Today <i class="fas fa-sort" style="opacity:.3; font-size:.6rem; margin-left:4px;"></i></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((it, idx) => {
                                const overridden = it.overridden;
                                const eff = it.effectiveDate || it.defaultDate;
                                const isToday = eff === todayISO;
                                const isPast = eff && eff < todayISO;
                                const dateColor = isToday ? 'var(--success)' : isPast ? 'var(--text-muted)' : overridden ? 'var(--warning)' : 'var(--text-primary)';
                                const todayPill = isToday
                                    ? '<span style="background:var(--success); color:#fff; font-size:.65rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:6px;">TODAY</span>'
                                    : '';
                                return `
                                <tr style="${isToday ? 'background:rgba(16,185,129,.04);' : ''}"
                                    data-name="${escAttr(it.name)}"
                                    data-type="${it.entityType || ''}"
                                    data-freq="${escAttr(it.frequency || '')}"
                                    data-assignee="${escAttr(it.assignee || '')}"
                                    data-date="${eff || ''}"
                                    data-istoday="${isToday ? '1' : '0'}">
                                    <td><strong>${App.escapeHtml(it.name)}</strong></td>
                                    <td>${typeBadge(it.entityType)}</td>
                                    <td><span class="tag" style="font-size:.65rem;">${App.escapeHtml(it.frequency || '')}</span></td>
                                    <td style="color:var(--text-muted); font-size:.85rem;">${App.escapeHtml(it.assignee || '—')}</td>
                                    <td>
                                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:${canManage ? '6px' : '0'};">
                                            <span style="font-size:.88rem; font-weight:${isToday || overridden ? '600' : '500'}; color:${dateColor};">${fmtDate(eff)}</span>
                                            ${todayPill}
                                            ${overridden ? '<i class="fas fa-arrow-right-arrow-left" title="Rescheduled this period" style="color:var(--warning); font-size:.7rem;"></i>' : ''}
                                        </div>
                                        ${canManage ? `
                                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                                <input type="date" class="mly-quick-date"
                                                       data-idx="${idx}"
                                                       value="${eff || ''}"
                                                       title="Reschedule — saves on change"
                                                       style="padding:3px 6px; font-size:.72rem; max-width:140px;">
                                                ${overridden ? `<button class="btn btn-sm btn-danger" data-mly-action="clear" data-ov-id="${it.overrideId}" title="Reset to default date" style="padding:3px 6px;">
                                                    <i class="fas fa-undo" style="font-size:.65rem;"></i>
                                                </button>` : ''}
                                            </div>
                                        ` : ''}
                                        ${overridden && it.overrideReason ? `<div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">${App.escapeHtml(it.overrideReason)}</div>` : ''}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html += '<div class="glass-card" style="padding:20px;"><div class="empty-state"><i class="fas fa-calendar-check"></i><p>No monthly / quarterly / yearly tasks scheduled this period.</p></div></div>';
        }

        // Existing entries — keep visible but compact
        const dates = Object.keys(data.entriesByDate || {}).sort().reverse();
        if (dates.length > 0) {
            html += '<div class="glass-card" style="padding:18px;"><div class="section-title"><i class="fas fa-history"></i> Submissions This Month</div>';
            dates.forEach(d => {
                html += `<div style="font-size:.8rem; font-weight:600; color:var(--text-secondary); margin:12px 0 6px;">${d}</div>`;
                data.entriesByDate[d].forEach(e => {
                    html += `
                        <div style="padding:8px 12px; border-left:3px solid ${e.status === 'Done' ? 'var(--success)' : 'var(--warning)'}; margin-bottom:4px; background:var(--bg-primary); border-radius: 0 4px 4px 0;">
                            <span class="status-badge ${e.status.toLowerCase()}" style="margin-right:6px;">${e.status}</span>
                            ${App.escapeHtml(e.topic)}
                        </div>`;
                });
            });
            html += '</div>';
        }

        container.innerHTML = html;
        document.getElementById('btn-add-task-monthly')?.addEventListener('click', () => this.showAddTaskModal('monthly'));

        // Inline single-click reschedule — save the moment the date input changes.
        container.querySelectorAll('.mly-quick-date').forEach(inp => {
            inp.addEventListener('change', async () => {
                const it = (this._monthlyData.monthlyItems || [])[parseInt(inp.dataset.idx, 10)];
                const newDate = inp.value;
                if (!it || !newDate) return;
                if (!it.periodKey) {
                    App.showToast('This frequency does not support per-period rescheduling.', 'warning');
                    return;
                }
                try {
                    await api.post('/tasks/override', {
                        entityType: it.entityType,
                        entityKey: it.entityKey,
                        subKey: it.subKey || '',
                        periodKey: it.periodKey,
                        newDate,
                        reason: '',
                    });
                    App.showToast(`Rescheduled to ${newDate}`, 'success');
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed to reschedule', 'error');
                }
            });
        });

        // Reset per-period override (one-click)
        container.querySelectorAll('[data-mly-action="clear"]').forEach(btn => {
            btn.addEventListener('click', () => this.clearOverride(parseInt(btn.dataset.ovId, 10)));
        });

        this._wireMonthlyFilters();
    },

    showRescheduleModal(item) {
        const body = `
            <div style="font-size:.85rem; color:var(--text-muted); margin-bottom:14px;">
                Moving <strong style="color:var(--text-primary);">${App.escapeHtml(item.name)}</strong>
                for <strong style="color:var(--text-primary);">${App.escapeHtml(item.periodKey || '')}</strong> only.
                The default schedule (${App.escapeHtml(item.frequency)} · ${App.escapeHtml(item.scheduleDay || '—')})
                stays unchanged for future periods.
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Default date</label>
                    <input type="text" value="${item.defaultDate || '—'}" disabled style="width:100%; opacity:.7;">
                </div>
                <div class="form-row"><label>New date *</label>
                    <input type="date" id="ov-new-date" value="${item.effectiveDate || item.defaultDate || ''}" style="width:100%;">
                </div>
            </div>
            <div class="form-row"><label>Reason (optional)</label>
                <input type="text" id="ov-reason" value="${App.escapeHtml(item.overrideReason || '')}" placeholder="e.g. Source delayed publication to 20th this month" style="width:100%;">
            </div>
        `;
        App.showModal('Reschedule this occurrence', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>' +
            '<button class="btn btn-primary" id="btn-save-override">Save</button>');
        setTimeout(() => {
            document.getElementById('btn-save-override')?.addEventListener('click', async () => {
                const newDate = document.getElementById('ov-new-date').value;
                if (!newDate) { App.showToast('Pick a date', 'warning'); return; }
                try {
                    await api.post('/tasks/override', {
                        entityType: item.entityType,
                        entityKey: item.entityKey,
                        subKey: item.subKey || '',
                        periodKey: item.periodKey,
                        newDate,
                        reason: document.getElementById('ov-reason').value,
                    });
                    App.closeModal();
                    App.showToast('Rescheduled', 'success');
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed to reschedule', 'error');
                }
            });
        }, 50);
    },

    async clearOverride(id) {
        if (!confirm('Reset to the default scheduled date?')) return;
        try {
            await api.delete(`/tasks/override/${id}`);
            App.showToast('Reset to default', 'success');
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to reset', 'error');
        }
    },

    showAddTaskModal(freq) {
        const bodyHtml = `
            <div class="form-row">
                <label>Task Name</label>
                <input type="text" id="new-task-name" style="width:100%;" placeholder="Enter task name..." required>
            </div>
            <div class="form-grid">
                <div class="form-row">
                    <label>Assignee</label>
                    <input type="text" id="new-task-assignee" style="width:100%;" placeholder="Leave blank for self">
                </div>
            </div>
        `;
        const footerHtml = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-task">Add Task</button>
        `;
        App.showModal(`Add ${freq.charAt(0).toUpperCase() + freq.slice(1)} Task`, bodyHtml, footerHtml);

        setTimeout(() => {
            document.getElementById('btn-save-task')?.addEventListener('click', async () => {
                const name = document.getElementById('new-task-name').value.trim();
                if (!name) { App.showToast('Task name required', 'warning'); return; }

                try {
                    await api.post('/tasks/add', {
                        name,
                        freq,
                        assignee: document.getElementById('new-task-assignee').value.trim()
                    });
                    App.showToast('Task added successfully', 'success');
                    App.closeModal();
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed to add task', 'error');
                }
            });
        }, 50);
    },

    showAddExtraTaskModal() {
        const bodyHtml = `
            <div class="form-row">
                <label>Task Name</label>
                <input type="text" id="new-extra-task-name" style="width:100%;" placeholder="E.g., Complete and verify April sales spreadsheet" required>
            </div>
            <p style="font-size:.78rem; color:var(--text-muted); margin-top:8px;">
                <i class="fas fa-info-circle"></i> This extra task will be added for <strong>today only</strong>, and will be included in the daily dashboard counts and email digests.
            </p>
        `;
        const footerHtml = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-extra-task">Add Extra Task</button>
        `;
        App.showModal('Add Extra Task (Today Only)', bodyHtml, footerHtml);

        setTimeout(() => {
            const inputEl = document.getElementById('new-extra-task-name');
            inputEl?.focus();
            document.getElementById('btn-save-extra-task')?.addEventListener('click', async () => {
                const name = inputEl.value.trim();
                if (!name) { App.showToast('Task name required', 'warning'); return; }

                try {
                    await api.post('/tasks/add-adhoc', { name });
                    App.showToast('Extra task added successfully', 'success');
                    App.closeModal();
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed to add extra task', 'error');
                }
            });
        }, 50);
    },

    editEntry(logId) {
        const bodyHtml = `
            <div class="form-row">
                <label>Status</label>
                <select id="edit-status" style="width:100%;">
                    <option value="Done">Done</option>
                    <option value="Pending">Pending</option>
                    <option value="Skip">Skip</option>
                </select>
            </div>
            <div class="form-row">
                <label>Remarks</label>
                <textarea id="edit-remarks" style="width:100%; min-height:80px;" placeholder="Add remarks..."></textarea>
            </div>
        `;
        const footerHtml = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-edit">Update</button>
        `;
        App.showModal('Update Task Entry', bodyHtml, footerHtml);

        setTimeout(() => {
            document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
                try {
                    await api.put(`/tasks/update/${logId}`, {
                        status: document.getElementById('edit-status').value,
                        remarks: document.getElementById('edit-remarks').value
                    });
                    App.showToast('Task updated', 'success');
                    App.closeModal();
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed to update', 'error');
                }
            });
        }, 50);
    },

    async openDataUpdateModal(commodity, typeName) {
        App.showModal(`Data Update: ${commodity} - ${typeName}`, '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>', '');
        try {
            const data = await api.get(`/du/factors/${encodeURIComponent(commodity)}/${encodeURIComponent(typeName)}`);
            const factors = data.factors;
            if (!factors || factors.length === 0) {
                App.showModal(`Data Update: ${commodity} - ${typeName}`, '<p>No factors found.</p>', '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>');
                return;
            }

            let html = `
                <table class="data-table">
                    <thead><tr><th>Factor</th><th>Status</th><th>Remarks</th></tr></thead>
                    <tbody>
                        ${factors.map((f, i) => `
                            <tr>
                                <td style="font-weight:500;">${App.escapeHtml(f.factor)}</td>
                                <td>
                                    <select class="du-modal-status" data-idx="${i}" style="width:100px;">
                                        <option value="Done" ${f.lastStatus==='Done'?'selected':''}>Done</option>
                                        <option value="Pending" ${f.lastStatus==='Pending'?'selected':''}>Pending</option>
                                        <option value="Skip" ${f.lastStatus==='Skip'?'selected':''}>Skip</option>
                                    </select>
                                </td>
                                <td><input type="text" class="du-modal-remarks" data-idx="${i}" value="${App.escapeHtml(f.lastRemarks||'')}" style="width:100%;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            const footer = `
                <button class="btn btn-outline" onclick="document.querySelectorAll('.du-modal-status').forEach(s => s.value='Done')">Mark All Done</button>
                <button class="btn btn-primary" id="btn-submit-du-modal">Submit All</button>
            `;

            App.showModal(`Data Update: ${commodity} - ${typeName}`, html, footer);

            setTimeout(() => {
                document.getElementById('btn-submit-du-modal')?.addEventListener('click', async () => {
                    const factorEntries = [];
                    document.querySelectorAll('.du-modal-status').forEach(s => {
                        const idx = s.dataset.idx;
                        const remarks = document.querySelector(`.du-modal-remarks[data-idx="${idx}"]`);
                        factorEntries.push({
                            factor: factors[idx].factor,
                            status: s.value,
                            mode: factors[idx].mode || '',
                            remarks: remarks ? remarks.value : ''
                        });
                    });

                    try {
                        await api.post('/du/submit', {
                            commodity, type: typeName, factors: factorEntries, date: new Date().toISOString().split('T')[0]
                        });
                        App.showToast('Data submitted', 'success');
                        App.closeModal();
                        this.loadTab();
                    } catch(err) {
                        App.showToast('Failed to submit', 'error');
                    }
                });
            }, 50);

        } catch (err) {
            App.showModal('Error', '<p>Failed to load factors</p>', '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>');
        }
    },

    /**
     * Navigate to the MIS module's PDF Analysis tab with the report type
     * pre-selected. The MIS module reads the `report` query parameter from
     * the URL hash on init and picks it up.
     */
    gotoMisUpload(reportName) {
        const q = new URLSearchParams({ tab: 'pdf', report: reportName });
        window.location.hash = `#mis?${q.toString()}`;
    },

    async openMisReportModal(reportName) {
        const body = `
            <div class="form-row">
                <label>Upload PDF Report</label>
                <input type="file" id="mis-modal-file" accept="application/pdf" style="width:100%; padding:10px;">
            </div>
            <div class="form-row">
                <label>Additional Notes</label>
                <textarea id="mis-modal-notes" style="width:100%;" rows="3"></textarea>
            </div>
        `;
        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-mis-modal"><i class="fas fa-upload"></i> Upload</button>
        `;
        App.showModal(`MIS Report: ${reportName}`, body, footer);

        setTimeout(() => {
            document.getElementById('btn-submit-mis-modal')?.addEventListener('click', async () => {
                const fileInput = document.getElementById('mis-modal-file');
                if (!fileInput.files || fileInput.files.length === 0) {
                    App.showToast('Please select a PDF file', 'warning');
                    return;
                }

                const btn = document.getElementById('btn-submit-mis-modal');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                try {
                    const formData = new FormData();
                    formData.append('file', fileInput.files[0]);
                    formData.append('reportType', reportName);  // backend reads reportType
                    const notes = document.getElementById('mis-modal-notes')?.value || '';
                    if (notes) formData.append('notes', notes);

                    // Use the same path as the MIS module's Strict Template Validation
                    // — goes through api.post which handles the JWT header correctly.
                    const data = await api.post('/mis/upload-pdf', formData);

                    if (data.precheckFailed) {
                        const p = data.precheck || {};
                        App.showToast(
                            `Wrong file? ${p.reason || 'Precheck failed'}`,
                            'warning'
                        );
                    } else {
                        App.showToast('Report uploaded & analyzed!', 'success');
                    }
                    App.closeModal();
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Upload failed', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
                }
            });
        }, 50);
    },

    // ─────────────────────────────────────────────────────────────────────
    //  ENTRY HISTORY TAB
    // ─────────────────────────────────────────────────────────────────────

    _historyState: {
        fromDate: '', toDate: '', type: '', status: '', page: 1,
        entries: [], rosterEntries: [], total: 0, pages: 1,
    },

    async loadHistory(container) {
        // Default date range: last 30 days
        const today = new Date();
        const from30 = new Date(today);
        from30.setDate(from30.getDate() - 30);
        const fmt = (d) => d.toISOString().slice(0, 10);

        if (!this._historyState.fromDate) this._historyState.fromDate = fmt(from30);
        if (!this._historyState.toDate)   this._historyState.toDate   = fmt(today);
        this._historyState.page = 1;

        container.innerHTML = `
            <div class="glass-card" style="padding:20px; margin-bottom:16px;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <h3 style="font-size:1rem; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-history" style="color:var(--accent);"></i>
                        Entry History
                        <span id="hist-total-badge" class="badge" style="background:var(--accent); color:#fff; font-size:.72rem; padding:2px 8px;">—</span>
                    </h3>
                </div>

                <!-- Filters Row -->
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:.75rem; color:var(--text-muted); font-weight:600;">FROM</label>
                        <input type="date" id="hist-from" value="${this._historyState.fromDate}"
                            style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); font-size:.82rem;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:.75rem; color:var(--text-muted); font-weight:600;">TO</label>
                        <input type="date" id="hist-to" value="${this._historyState.toDate}"
                            style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); font-size:.82rem;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:.75rem; color:var(--text-muted); font-weight:600;">TYPE</label>
                        <select id="hist-type" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); font-size:.82rem;">
                            <option value="">All Types</option>
                            <option value="Task">Task</option>
                            <option value="MISReport">MIS Report</option>
                            <option value="Roster">Roster</option>
                            <option value="DataUpdate">Data Update</option>
                            <option value="ReportGroup">Merged Report</option>
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:.75rem; color:var(--text-muted); font-weight:600;">STATUS</label>
                        <select id="hist-status" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); font-size:.82rem;">
                            <option value="">All Status</option>
                            <option value="Done">Done</option>
                            <option value="Pending">Pending</option>
                            <option value="Skip">Skip</option>
                        </select>
                    </div>
                    <button id="hist-search-btn" class="btn btn-primary btn-sm" style="align-self:flex-end; padding:8px 16px;">
                        <i class="fas fa-search"></i> Search
                    </button>
                    <button id="hist-reset-btn" class="btn btn-outline btn-sm" style="align-self:flex-end; padding:8px 12px;">
                        <i class="fas fa-undo"></i>
                    </button>
                </div>

                <!-- Table -->
                <div id="hist-table-container">
                    <div class="loading-skeleton"><div class="skeleton-card" style="height:200px;"></div></div>
                </div>

                <!-- Pagination -->
                <div id="hist-pagination" style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:16px; flex-wrap:wrap;"></div>
            </div>
        `;

        // Wire filter events
        const searchBtn = document.getElementById('hist-search-btn');
        const resetBtn  = document.getElementById('hist-reset-btn');

        const applyFilters = () => {
            this._historyState.fromDate = document.getElementById('hist-from')?.value || this._historyState.fromDate;
            this._historyState.toDate   = document.getElementById('hist-to')?.value   || this._historyState.toDate;
            this._historyState.type     = document.getElementById('hist-type')?.value  || '';
            this._historyState.status   = document.getElementById('hist-status')?.value || '';
            this._historyState.page     = 1;
            this._fetchAndRenderHistory();
        };

        searchBtn?.addEventListener('click', applyFilters);
        resetBtn?.addEventListener('click', () => {
            this._historyState.fromDate = fmt(from30);
            this._historyState.toDate   = fmt(today);
            this._historyState.type     = '';
            this._historyState.status   = '';
            this._historyState.page     = 1;
            document.getElementById('hist-from').value   = this._historyState.fromDate;
            document.getElementById('hist-to').value     = this._historyState.toDate;
            document.getElementById('hist-type').value   = '';
            document.getElementById('hist-status').value = '';
            this._fetchAndRenderHistory();
        });

        await this._fetchAndRenderHistory();
    },

    async _fetchAndRenderHistory() {
        const { fromDate, toDate, type, status, page } = this._historyState;
        const tableContainer = document.getElementById('hist-table-container');
        const paginationEl   = document.getElementById('hist-pagination');
        const totalBadge     = document.getElementById('hist-total-badge');

        if (tableContainer) {
            tableContainer.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card" style="height:180px;"></div></div>';
        }

        try {
            const params = new URLSearchParams({ from: fromDate, to: toDate, page, per: 50 });
            if (type)   params.set('type', type);
            if (status) params.set('status', status);

            const data = await api.get(`/tasks/history?${params.toString()}`);
            this._historyState.entries       = data.entries       || [];
            this._historyState.rosterEntries = data.rosterEntries || [];
            this._historyState.total         = data.total         || 0;
            this._historyState.pages         = data.pages         || 1;

            if (totalBadge) totalBadge.textContent = this._historyState.total;

            this._renderHistoryTable(tableContainer);
            this._renderHistoryPagination(paginationEl);
        } catch (err) {
            console.error(err);
            if (tableContainer) {
                tableContainer.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fas fa-exclamation-circle" style="color:var(--danger); font-size:2rem;"></i><p style="margin-top:8px;">Failed to load history. ${App.escapeHtml(err.message || '')}</p></div>`;
            }
        }
    },

    _renderHistoryTable(tableContainer) {
        if (!tableContainer) return;

        // Merge MasterLog entries + roster entries, sort by date desc
        const all = [
            ...this._historyState.entries.map(e => ({
                date:      e.entryDate     || '',
                type:      e.entryType    || 'Task',
                topic:     e.topic        || '',
                subTopic:  e.subTopic     || '',
                status:    e.status       || 'Pending',
                remarks:   e.remarks      || '',
                person:    e.onBehalfOfName || e.onBehalfOfEmail || '',
                timestamp: e.timestampSubmitted || '',
                logId:     e.logId        || '',
                isLate:    e.isLate       || false,
            })),
            ...this._historyState.rosterEntries.map(e => ({
                date:      e.entryDate     || '',
                type:      'Roster',
                topic:     e.topic        || '',
                subTopic:  '',
                status:    e.status       || 'Pending',
                remarks:   e.remarks      || '',
                person:    e.onBehalfOfName || e.onBehalfOfEmail || '',
                timestamp: e.timestampSubmitted || '',
                logId:     e.logId        || '',
                isLate:    false,
            })),
        ].sort((a, b) => {
            if (b.date !== a.date) return b.date.localeCompare(a.date);
            return b.timestamp.localeCompare(a.timestamp);
        });

        if (all.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state" style="padding:40px;"><i class="fas fa-inbox" style="font-size:2rem; opacity:.3;"></i><p style="margin-top:8px; color:var(--text-muted);">No entries found for the selected period.</p></div>`;
            return;
        }

        const typeBadge = (et) => {
            const map = {
                'Task':        { label: 'Task',          color: 'var(--accent)' },
                'MISReport':   { label: 'MIS Report',    color: 'var(--info)' },
                'DataUpdate':  { label: 'Data Update',   color: '#a78bfa' },
                'ReportGroup': { label: 'Merged Report', color: 'var(--success)' },
                'Roster':      { label: 'Roster',        color: '#14b8a6' },
            };
            const m = map[et] || { label: et, color: 'var(--text-muted)' };
            return `<span style="background:${m.color}22; color:${m.color}; font-size:.68rem; font-weight:600; padding:2px 8px; border-radius:4px;">${m.label}</span>`;
        };

        const statusBadge = (s, isLate) => {
            const cls = (s || '').toLowerCase();
            if (isLate) return `<span class="status-badge late"><i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>${s} (Late)</span>`;
            return `<span class="status-badge ${cls}">${s}</span>`;
        };

        const fmtDate = (ds) => {
            if (!ds) return '—';
            try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
            catch { return ds; }
        };

        const fmtTime = (ts) => {
            if (!ts) return '—';
            try { return new Date(ts).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true }); }
            catch { return ts; }
        };

        tableContainer.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:10%;">Date</th>
                            <th style="width:12%;">Type</th>
                            <th style="width:28%;">Task / Topic</th>
                            <th style="width:12%;">Status</th>
                            <th style="width:18%;">Remarks</th>
                            <th style="width:10%;">Person</th>
                            <th style="width:10%;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${all.map(e => `
                            <tr>
                                <td style="font-size:.78rem; color:var(--text-muted); white-space:nowrap;">${fmtDate(e.date)}</td>
                                <td>${typeBadge(e.type)}</td>
                                <td style="font-weight:600; color:var(--text-primary);">
                                    ${App.escapeHtml(e.topic)}
                                    ${e.subTopic ? `<div style="font-size:.72rem; color:var(--text-secondary); font-weight:normal;">↳ ${App.escapeHtml(e.subTopic)}</div>` : ''}
                                </td>
                                <td>${statusBadge(e.status, e.isLate)}</td>
                                <td style="font-size:.78rem; color:var(--text-secondary); word-break:break-word;">${App.escapeHtml(e.remarks || '—')}</td>
                                <td style="font-size:.75rem; color:var(--text-muted);">${App.escapeHtml(e.person || '—')}</td>
                                <td style="font-size:.75rem; color:var(--text-muted); white-space:nowrap;">${fmtTime(e.timestamp)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    _renderHistoryPagination(paginationEl) {
        if (!paginationEl) return;
        const { page, pages } = this._historyState;
        if (pages <= 1) { paginationEl.innerHTML = ''; return; }

        const btnStyle = (active) =>
            `style="padding:6px 14px; border-radius:8px; border:1px solid var(--border); background:${active ? 'var(--accent)' : 'var(--bg-card)'}; color:${active ? '#fff' : 'var(--text-primary)'}; cursor:${active ? 'default' : 'pointer'}; font-weight:600; font-size:.82rem;"`;

        let html = '';
        if (page > 1) html += `<button ${btnStyle(false)} data-hist-page="${page - 1}"><i class="fas fa-chevron-left"></i></button>`;

        const start = Math.max(1, page - 2);
        const end   = Math.min(pages, page + 2);
        for (let p = start; p <= end; p++) {
            html += `<button ${btnStyle(p === page)} data-hist-page="${p}">${p}</button>`;
        }

        if (page < pages) html += `<button ${btnStyle(false)} data-hist-page="${page + 1}"><i class="fas fa-chevron-right"></i></button>`;

        paginationEl.innerHTML = html;
        paginationEl.querySelectorAll('[data-hist-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.histPage);
                if (p === this._historyState.page) return;
                this._historyState.page = p;
                this._fetchAndRenderHistory();
            });
        });
    }
};

