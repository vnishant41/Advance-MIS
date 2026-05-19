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
        `;

        const escAttr = (s) => App.escapeHtml(s || '').replace(/'/g, '&#39;');

        // (i) info button — only when admin has set instructions. Always rendered far-right.
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

        // Clickable status pill. Click → toggles Done ↔ Pending and calls /tasks/remark.
        // Skip rows are read-only (no toggle).
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

        // Standard row layout: [main content | action button | (i) | status]
        // The `today-row` class lets _reflowAfterStatus find the row to move
        // when a user toggles status — must be on the outermost wrapper.
        const row = ({ title, subtitle, status, entryType, topic, subTopic, instructions, actionBtn = '' }) => `
            <div class="today-row" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; background:var(--bg-primary);">
                <div style="min-width:0; flex:1;">
                    <div style="font-weight:600; font-size:.9rem;">${title}</div>
                    ${subtitle ? `<div style="font-size:.78rem; color:var(--text-muted);">${subtitle}</div>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${actionBtn}
                    ${infoBtn(topic, instructions)}
                    ${statusBtn(status, entryType, topic, subTopic)}
                </div>
            </div>`;

        // Daily task templates
        if (data.dailyTasks && data.dailyTasks.length > 0) {
            html += '<div class="section-title"><i class="fas fa-list-check"></i> Scheduled Tasks</div>';
            html += data.dailyTasks.map(t => row({
                title: App.escapeHtml(t.name),
                subtitle: `${t.assignee || 'Unassigned'}
                    ${t.recurrence ? ` · <span class="tag" style="font-size:.65rem;">${App.escapeHtml(t.recurrence)}</span>` : ''}
                    ${t.scheduleDay ? ` · <span class="tag" style="font-size:.65rem;">${App.escapeHtml(t.scheduleDay)}</span>` : ''}`,
                status: t.status,
                entryType: 'Task',
                topic: t.name,
                instructions: t.instructions,
            })).join('');
        }

        // Roster duties
        if (data.rosterTasks && data.rosterTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-user-clock"></i> Roster Duties</div>';
            html += data.rosterTasks.map(r => row({
                title: App.escapeHtml(r.role),
                subtitle: App.escapeHtml(r.employee),
                status: r.status,
                entryType: 'Roster',
                topic: r.role,
                instructions: r.instructions,
            })).join('');
        }

        // Factor Tasks (Data Updates) — heading per (commodity, type) with factor sub-rows.
        if (data.duTasks && data.duTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-database"></i> Factor Tasks (Data Updates)</div>';
            html += data.duTasks.map(g => {
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
        if (data.misTasks && data.misTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-file-pdf"></i> MIS Reports</div>';
            html += data.misTasks.map(t => row({
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
        if (data.groupTasks && data.groupTasks.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-object-group"></i> Merged Reports</div>';
            html += data.groupTasks.map(g => row({
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

        // Submitted entries
        if (data.submitted && data.submitted.length > 0) {
            html += '<div class="section-title" style="margin-top:20px;"><i class="fas fa-check-double"></i> Submitted Today</div>';
            html += '<table class="data-table"><thead><tr><th>Task</th><th>Status</th><th>Time</th><th>Action</th></tr></thead><tbody>';
            html += data.submitted.map(s => `
                <tr>
                    <td style="font-weight:500;">${App.escapeHtml(s.topic)}</td>
                    <td><span class="status-badge ${s.status.toLowerCase()}">${s.status}</span></td>
                    <td style="font-size:.8rem;color:var(--text-muted);">${App.timeAgo(s.timestampSubmitted)}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="App.modules.tasks.editEntry('${s.logId}')">Edit</button></td>
                </tr>
            `).join('');
            html += '</tbody></table>';
        } else {
            html += '<div class="empty-state" style="padding:20px;"><i class="fas fa-inbox"></i><p>No tasks submitted yet today</p></div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Add task button
        document.getElementById('btn-add-task-daily')?.addEventListener('click', () => this.showAddTaskModal('daily'));

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

        // Status pill click → toggle Done ↔ Pending, persist, and live-reorder:
        // Done → drops to the bottom of its sibling row group; Pending → moves to the top.
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
                    btn.dataset.status = next;
                    btn.className = `status-toggle status-badge ${next.toLowerCase()}`;
                    btn.textContent = next;
                    App.showToast(`Marked ${next}`, 'success');
                    this._reflowAfterStatus(btn, next);
                } catch (err) {
                    btn.innerHTML = prevHtml;
                    App.showToast(err.message || 'Failed to update status', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        });
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
                <div class="glass-card" style="padding:0; margin-bottom:16px;">
                    ${todayCount > 0 ? `<div style="padding:10px 16px; background:rgba(16,185,129,.08); border-bottom:1px solid var(--border); font-size:.82rem;">
                        <i class="fas fa-bolt" style="color:var(--success); margin-right:6px;"></i>
                        <strong>${todayCount}</strong> scheduled today — these are at the top.
                    </div>` : ''}
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Type</th>
                                <th>Frequency</th>
                                <th>Assignee</th>
                                <th style="min-width:200px;">Scheduled Today</th>
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
                                <tr style="${isToday ? 'background:rgba(16,185,129,.04);' : ''}">
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
    }
};
