/**
 * Kanban Board — Jira-style with drag & drop, sprints, task CRUD.
 */
import { api } from './api.js';

export default {
    tasks: [],
    sprints: [],
    allUsers: [],
    statuses: [],

    async render() {
        return `
            <div class="kanban-header">
                <div style="display:flex; gap:8px; align-items:center; min-width:0; flex-wrap:wrap;">
                    <h3 style="font-weight:700;"><i class="fas fa-columns" style="color:var(--accent);margin-right:8px;"></i>Sprint Board</h3>
                    <select id="kanban-sprint-filter" style="font-size:.85rem; padding:6px 12px;">
                        <option value="">All Sprints</option>
                    </select>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button class="btn btn-outline btn-sm" id="btn-new-sprint"><i class="fas fa-flag"></i> New Sprint</button>
                    <button class="btn btn-primary btn-sm" id="btn-new-task"><i class="fas fa-plus"></i> New Task</button>
                </div>
            </div>
            <div class="kanban-board" id="kanban-board">
                <div class="loading-skeleton" style="display:flex; gap:16px; width:100%;">
                    <div class="skeleton-card" style="flex:1; min-height:400px;"></div>
                    <div class="skeleton-card" style="flex:1; min-height:400px;"></div>
                    <div class="skeleton-card" style="flex:1; min-height:400px;"></div>
                </div>
            </div>
        `;
    },

    async init() {
        try {
            const data = await api.get('/kanban/board');
            this.tasks = data.tasks || [];
            this.sprints = data.sprints || [];
            this.statuses = data.statuses || ['Assigned', 'In Progress', 'Under Review', 'Done', 'Blocked'];

            // Load shell data for users
            try {
                const shell = await api.get('/kanban/shell');
                this.allUsers = shell.allUsers || [];
            } catch (e) {
                this.allUsers = [];
            }

            this.populateSprintFilter();
            this.renderBoard();
        } catch (err) {
            document.getElementById('kanban-board').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load board</p></div>';
        }

        // Enable task and sprint creation for everyone
        const newTaskBtn = document.getElementById('btn-new-task');
        const newSprintBtn = document.getElementById('btn-new-sprint');
        if (newTaskBtn) newTaskBtn.addEventListener('click', () => this.showCreateTaskModal());
        if (newSprintBtn) newSprintBtn.addEventListener('click', () => this.showCreateSprintModal());

        document.getElementById('kanban-sprint-filter').addEventListener('change', () => this.renderBoard());
    },

    populateSprintFilter() {
        const select = document.getElementById('kanban-sprint-filter');
        select.innerHTML = '<option value="">All Sprints</option>' +
            this.sprints.map(s => `<option value="${s.id}">${App.escapeHtml(s.name)}</option>`).join('');
    },

    renderBoard() {
        const board = document.getElementById('kanban-board');
        const sprintFilter = document.getElementById('kanban-sprint-filter').value;

        let filtered = this.tasks;
        if (sprintFilter) {
            filtered = filtered.filter(t => t.sprintId === sprintFilter);
        }

        const statusColors = {
            'Assigned': 'var(--accent)', 'In Progress': '#818cf8', 'Under Review': 'var(--info)',
            'Done': 'var(--success)', 'Blocked': 'var(--danger)'
        };

        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);

        board.innerHTML = this.statuses.map(status => {
            const columnTasks = filtered
                .filter(t => t.status === status)
                .slice()
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

            // "Clear Completed" button for Done column (Manager+ only)
            const clearBtn = (status === 'Done' && isMgr && columnTasks.length > 0)
                ? `<button class="kanban-clear-btn" id="kanban-clear-done" title="Delete all completed tasks">
                       <i class="fas fa-trash-alt"></i> Clear
                   </button>`
                : '';

            return `
                <div class="kanban-column" data-status="${status}">
                    <div class="kanban-column-header">
                        <span style="display:flex; align-items:center; gap:6px;">
                            <span style="width:8px; height:8px; border-radius:50%; background:${statusColors[status] || 'var(--text-muted)'};"></span>
                            ${status}
                        </span>
                        <span style="display:flex; align-items:center; gap:6px;">
                            ${clearBtn}
                            <span class="kanban-column-count">${columnTasks.length}</span>
                        </span>
                    </div>
                    <div class="kanban-cards" data-status="${status}">
                        ${columnTasks.map(t => this.renderCard(t)).join('')}
                        ${columnTasks.length === 0 ? '<div class="kanban-empty-hint" style="text-align:center; padding:20px; color:var(--text-muted); font-size:.8rem; pointer-events:none;"><i class="fas fa-inbox"></i><br>Drop tasks here</div>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.attachDnD();

        // Wire Clear Completed button
        document.getElementById('kanban-clear-done')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const doneTasks = this.tasks.filter(t => t.status === 'Done');
            if (!doneTasks.length) return;
            if (!confirm(`Delete ${doneTasks.length} completed task(s)? This cannot be undone.`)) return;
            try {
                await Promise.all(doneTasks.map(t => api.delete(`/kanban/task/${t.id}`)));
                this.tasks = this.tasks.filter(t => t.status !== 'Done');
                this.renderBoard();
                App.showToast(`${doneTasks.length} completed task(s) deleted`, 'success');
            } catch (err) {
                App.showToast(err.message || 'Failed to delete', 'error');
            }
        });
    },

    /**
     * Bind drag-and-drop handlers at the column level. Supports:
     *   - Cross-column move → backend updates status + lands at top
     *   - Intra-column reorder by hovering above/below sibling cards →
     *     /kanban/reorder persists the new order
     */
    attachDnD() {
        const board = document.getElementById('kanban-board');
        if (!board) return;

        const clearIndicators = () => {
            board.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before'));
            board.querySelectorAll('.drop-after').forEach(el => el.classList.remove('drop-after'));
        };

        board.querySelectorAll('.kanban-column').forEach(col => {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                col.classList.add('drag-over');

                // Figure out which sibling card we're hovering near, to show
                // an insertion indicator (line above / below).
                clearIndicators();
                const cardsHost = col.querySelector('.kanban-cards');
                if (!cardsHost) return;
                const draggingId = (window._draggingTaskId || '').toString();
                const cards = Array.from(cardsHost.querySelectorAll('.kanban-card'))
                    .filter(c => c.dataset.taskId !== draggingId);
                let target = null, after = false;
                for (const c of cards) {
                    const r = c.getBoundingClientRect();
                    if (e.clientY < r.top + r.height / 2) { target = c; after = false; break; }
                    target = c; after = true;
                }
                if (target) target.classList.add(after ? 'drop-after' : 'drop-before');
            });
            col.addEventListener('dragenter', (e) => {
                e.preventDefault();
                col.classList.add('drag-over');
            });
            col.addEventListener('dragleave', (e) => {
                if (!col.contains(e.relatedTarget)) {
                    col.classList.remove('drag-over');
                    clearIndicators();
                }
            });
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drag-over');
                clearIndicators();
                this.handleDrop(e, col.dataset.status);
            });
        });

        board.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', card.dataset.taskId);
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
                window._draggingTaskId = card.dataset.taskId;
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                clearIndicators();
                window._draggingTaskId = null;
            });
        });
    },

    renderCard(task) {
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Done';
        // Compose a "help" string from description and/or blocked reason so users
        // know what to do. Click (i) → modal with details.
        const helpParts = [];
        if (task.desc) helpParts.push(task.desc);
        if (task.blockedReason) helpParts.push('⚠ Blocked: ' + task.blockedReason);
        const helpText = helpParts.join('\n\n');
        const helpAttr = App.escapeHtml(helpText).replace(/'/g, '&#39;');
        const titleAttr = App.escapeHtml(task.title).replace(/'/g, '&#39;');
        const infoBtn = helpText ? `
            <button type="button" class="btn-icon kanban-help-btn"
                    data-title="${titleAttr}"
                    data-help="${helpAttr}"
                    title="What to do"
                    style="color:var(--info); padding:2px 4px; font-size:.95rem;"
                    onclick="event.stopPropagation(); App.modules.kanban.showHelp(this);">
                <i class="fas fa-info-circle"></i>
            </button>` : '';

        return `
            <div class="kanban-card ${task.status === 'Blocked' ? 'blocked' : ''}"
                 draggable="true"
                 data-task-id="${task.id}"
                 onclick="App.modules.kanban.showTaskDetail('${task.id}')">
                <div style="display:flex; align-items:flex-start; gap:6px;">
                    <div class="kanban-card-title" style="flex:1; min-width:0;">${App.escapeHtml(task.title)}</div>
                    ${infoBtn}
                </div>
                <div class="kanban-card-meta">
                    ${task.storyPoints ? `<span style="color:var(--accent);">${task.storyPoints} SP</span>` : ''}
                    ${isOverdue ? '<span style="color:var(--danger);"><i class="fas fa-exclamation-circle"></i></span>' : ''}
                </div>
                <div class="kanban-card-meta" style="margin-top:6px;">
                    <span>${(task.assignedToNameList || []).map(n => `<span class="avatar-sm" title="${App.escapeHtml(n)}">${n.charAt(0)}</span>`).join(' ') || '<span style="color:var(--text-muted)">Unassigned</span>'}</span>
                    ${task.dueDate ? `<span style="font-size:.7rem;">${task.dueDate}</span>` : ''}
                </div>
                ${task.tags ? `<div style="margin-top:6px;">${task.tags.split(',').filter(t=>t.trim()).map(t => `<span class="tag" style="margin-right:4px;">${App.escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
            </div>
        `;
    },

    showHelp(btn) {
        const title = btn.dataset.title || 'Task';
        const text = btn.dataset.help || '';
        App.showModal(
            `What to do — ${title}`,
            `<div style="white-space:pre-wrap; line-height:1.55; color:var(--text-primary); font-size:.92rem;">
                ${App.escapeHtml(text)}
            </div>`,
            '<button class="btn btn-primary" onclick="App.closeModal()">Got it</button>'
        );
    },

    async handleDrop(event, newStatus) {
        const taskId = event.dataTransfer.getData('text/plain');
        if (!taskId) return;
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        // Compute the drop index inside the destination column based on the
        // sibling card the cursor was over (using the drop-before/drop-after
        // marker placed in dragover).
        const col = event.currentTarget.closest('.kanban-column');
        const cardsHost = col ? col.querySelector('.kanban-cards') : null;
        const sortedSiblings = cardsHost
            ? Array.from(cardsHost.querySelectorAll('.kanban-card'))
                .filter(c => c.dataset.taskId !== taskId)
            : [];

        let insertIndex = 0;
        const before = col ? col.querySelector('.drop-before') : null;
        const after = col ? col.querySelector('.drop-after') : null;
        if (before) {
            insertIndex = sortedSiblings.indexOf(before);
        } else if (after) {
            insertIndex = sortedSiblings.indexOf(after) + 1;
        } else if (sortedSiblings.length === 0) {
            insertIndex = 0;
        } else {
            // dropped in empty space below all cards
            insertIndex = sortedSiblings.length;
        }

        // CROSS-COLUMN MOVE
        if (task.status !== newStatus) {
            const oldStatus = task.status;

            // ── Feature 5: Blocked requires a reason ──
            if (newStatus === 'Blocked') {
                this._promptBlockedReason(task, taskId, oldStatus);
                return;
            }

            // Optimistic: change status, put at top of destination
            const others = this.tasks.filter(t => t.status === newStatus && t.id !== taskId);
            const minPos = others.length ? Math.min(...others.map(t => t.position ?? 0)) : 0;
            task.status = newStatus;
            task.position = minPos - 1;
            this.renderBoard();

            try {
                await api.put(`/kanban/task/${taskId}`, { status: newStatus });
                App.showToast(`Moved to ${newStatus}`, 'success');
            } catch (err) {
                task.status = oldStatus;
                this.renderBoard();
                App.showToast(err.message || 'Failed to move task', 'error');
            }
            return;
        }

        // INTRA-COLUMN REORDER
        const columnTasks = this.tasks
            .filter(t => t.status === newStatus)
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        // Remove dragged task from its current position, insert at target index.
        const withoutDragged = columnTasks.filter(t => t.id !== taskId);
        withoutDragged.splice(insertIndex, 0, task);
        const newOrderIds = withoutDragged.map(t => t.id);

        // No-op if the order didn't actually change
        const oldOrderIds = columnTasks.map(t => t.id);
        if (oldOrderIds.length === newOrderIds.length && oldOrderIds.every((id, i) => id === newOrderIds[i])) return;

        // Optimistic renumber
        const oldPositions = {};
        withoutDragged.forEach((t, i) => { oldPositions[t.id] = t.position ?? 0; t.position = i; });
        this.renderBoard();

        try {
            await api.post('/kanban/reorder', { status: newStatus, orderedIds: newOrderIds });
        } catch (err) {
            // revert
            withoutDragged.forEach(t => { t.position = oldPositions[t.id]; });
            this.renderBoard();
            App.showToast(err.message || 'Failed to reorder', 'error');
        }
    },

    showTaskDetail(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const comments = task.comments || [];
        const bodyHtml = `
            <div style="max-height:50vh; overflow:auto;">
                <div class="form-row"><label>Title</label><p style="font-weight:600;">${App.escapeHtml(task.title)}</p></div>
                ${task.desc ? `<div class="form-row"><label>Description</label><p style="color:var(--text-secondary);">${App.escapeHtml(task.desc)}</p></div>` : ''}
                <div class="form-grid">
                    <div><label>Status</label><span class="status-badge ${task.status.toLowerCase().replace(' ', '-')}">${task.status}</span></div>
                </div>
                <div class="form-grid" style="margin-top:12px;">
                    <div><label>Assigned To</label><p>${task.assignedToName || '—'}</p></div>
                    <div><label>Due Date</label><p>${task.dueDate || 'Not set'}</p></div>
                </div>
                ${task.tags ? `<div class="form-row" style="margin-top:8px;"><label>Tags</label><div>${task.tags.split(',').map(t => `<span class="tag" style="margin:2px;">${App.escapeHtml(t.trim())}</span>`).join('')}</div></div>` : ''}
                ${task.blockedReason ? `<div class="form-row" style="margin-top:8px; padding:8px; background:rgba(239,68,68,0.1); border-radius:6px;"><label style="color:var(--danger);">Blocked Reason</label><p>${App.escapeHtml(task.blockedReason)}</p></div>` : ''}
                <hr style="border-color:var(--border); margin:16px 0;">
                <div class="section-title"><i class="fas fa-comments"></i> Comments (${comments.length})</div>
                <div id="kanban-comments" style="max-height:200px; overflow:auto;">
                    ${comments.map(c => `
                        <div style="padding:8px 0; border-bottom:1px solid rgba(51,65,85,0.3);">
                            <span style="font-weight:600; font-size:.85rem;">${App.escapeHtml(c.by)}</span>
                            <span style="font-size:.7rem; color:var(--text-muted); margin-left:8px;">${App.timeAgo(c.at)}</span>
                            <p style="font-size:.9rem; margin-top:4px;">${App.escapeHtml(c.text)}</p>
                        </div>
                    `).join('') || '<p style="color:var(--text-muted); font-size:.85rem;">No comments yet</p>'}
                </div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <input type="text" id="new-comment-text" placeholder="Add a comment..." style="flex:1;">
                    <button class="btn btn-primary btn-sm" id="btn-add-comment">Send</button>
                </div>
            </div>
        `;

        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);
        const deleteBtn = isMgr
            ? `<button class="btn btn-danger btn-sm" id="btn-delete-kt" style="margin-right:auto;"><i class="fas fa-trash"></i> Delete Task</button>`
            : '';

        App.showModal(task.title, bodyHtml,
            `${deleteBtn}<button class="btn btn-outline" onclick="App.closeModal()">Close</button>`);

        setTimeout(() => {
            document.getElementById('btn-add-comment')?.addEventListener('click', async () => {
                const text = document.getElementById('new-comment-text').value.trim();
                if (!text) return;
                try {
                    const result = await api.post(`/kanban/task/${taskId}/comment`, { comment: text });
                    task.comments = result.comments;
                    App.showToast('Comment added', 'success');
                    this.showTaskDetail(taskId);
                } catch (err) {
                    App.showToast('Failed to add comment', 'error');
                }
            });

            // Delete task button (Manager+)
            document.getElementById('btn-delete-kt')?.addEventListener('click', async () => {
                if (!confirm('Delete this task permanently?')) return;
                try {
                    await api.delete(`/kanban/task/${taskId}`);
                    this.tasks = this.tasks.filter(t => t.id !== taskId);
                    this.renderBoard();
                    App.closeModal();
                    App.showToast('Task deleted', 'success');
                } catch (err) {
                    App.showToast(err.message || 'Failed to delete', 'error');
                }
            });
        }, 50);
    },

    showCreateTaskModal() {
        const usersOptions = this.allUsers.map(u => `<option value="${u.email}">${App.escapeHtml(u.name)} (${u.email})</option>`).join('');
        const sprintOptions = this.sprints.map(s => `<option value="${s.id}">${App.escapeHtml(s.name)}</option>`).join('');

        const bodyHtml = `
            <div class="form-row"><label>Title *</label><input type="text" id="kt-title" style="width:100%;" required></div>
            <div class="form-row"><label>Description</label><textarea id="kt-desc" style="width:100%; min-height:60px;"></textarea></div>
            <div class="form-grid">
                <div class="form-row"><label>Due Date</label><input type="date" id="kt-due" style="width:100%;"></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Assign To</label><select id="kt-assign" style="width:100%;" multiple><option value="">Unassigned</option>${usersOptions}</select></div>
                <div class="form-row"><label>Sprint</label><select id="kt-sprint" style="width:100%;"><option value="">No Sprint</option>${sprintOptions}</select></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Tags (comma-separated)</label><input type="text" id="kt-tags" style="width:100%;" placeholder="e.g. data, urgent"></div>
                <div class="form-row"><label>Story Points</label><input type="number" id="kt-points" style="width:100%;" min="0" value="0"></div>
            </div>
        `;

        App.showModal('Create Kanban Task', bodyHtml, '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-kt">Create</button>');

        setTimeout(() => {
            document.getElementById('btn-save-kt')?.addEventListener('click', async () => {
                const title = document.getElementById('kt-title').value.trim();
                if (!title) { App.showToast('Title is required', 'warning'); return; }

                const assignSelect = document.getElementById('kt-assign');
                const assignedTo = Array.from(assignSelect.selectedOptions).map(o => o.value).filter(v => v);

                try {
                    const result = await api.post('/kanban/task', {
                        title,
                        desc: document.getElementById('kt-desc').value,
                        dueDate: document.getElementById('kt-due').value,
                        assignedTo: assignedTo.join(', '),
                        sprintId: document.getElementById('kt-sprint').value,
                        tags: document.getElementById('kt-tags').value,
                        storyPoints: document.getElementById('kt-points').value
                    });

                    this.tasks.push(result.task);
                    this.renderBoard();
                    App.closeModal();
                    App.showToast('Task created', 'success');
                } catch (err) {
                    App.showToast(err.message || 'Failed to create task', 'error');
                }
            });
        }, 50);
    },

    showCreateSprintModal() {
        const bodyHtml = `
            <div class="form-row"><label>Sprint Name *</label><input type="text" id="sp-name" style="width:100%;" required></div>
            <div class="form-grid">
                <div class="form-row"><label>Start Date</label><input type="date" id="sp-start" style="width:100%;"></div>
                <div class="form-row"><label>End Date</label><input type="date" id="sp-end" style="width:100%;"></div>
            </div>
            <div class="form-row"><label>Goal</label><textarea id="sp-goal" style="width:100%; min-height:60px;"></textarea></div>
        `;

        App.showModal('Create Sprint', bodyHtml, '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-sp">Create</button>');

        setTimeout(() => {
            document.getElementById('btn-save-sp')?.addEventListener('click', async () => {
                const name = document.getElementById('sp-name').value.trim();
                if (!name) { App.showToast('Name required', 'warning'); return; }
                try {
                    const result = await api.post('/kanban/sprint', {
                        name,
                        startDate: document.getElementById('sp-start').value,
                        endDate: document.getElementById('sp-end').value,
                        goal: document.getElementById('sp-goal').value
                    });
                    this.sprints.push(result.sprint);
                    this.populateSprintFilter();
                    App.closeModal();
                    App.showToast('Sprint created', 'success');
                } catch (err) {
                    App.showToast(err.message || 'Failed', 'error');
                }
            });
        }, 50);
    },

    /** Feature 5: Prompt for blocked reason before moving to Blocked status */
    _promptBlockedReason(task, taskId, oldStatus) {
        App.showModal(
            'Blocked Reason Required',
            `<div style="margin-bottom:12px; color:var(--text-secondary); font-size:.85rem;">
                Please provide a reason for blocking <strong>${App.escapeHtml(task.title)}</strong>
            </div>
            <label>Blocked Reason *</label>
            <textarea id="blocked-reason-input" rows="3" style="width:100%; resize:vertical;" placeholder="E.g., Waiting for data from vendor"></textarea>`,
            `<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-danger" id="blocked-reason-save"><i class="fas fa-ban"></i> Block Task</button>`
        );

        setTimeout(() => {
            document.getElementById('blocked-reason-save')?.addEventListener('click', async () => {
                const reason = document.getElementById('blocked-reason-input')?.value?.trim();
                if (!reason) {
                    App.showToast('Blocked reason is required', 'warning');
                    return;
                }
                try {
                    await api.put(`/kanban/task/${taskId}`, {
                        status: 'Blocked',
                        blockedReason: reason,
                    });
                    task.status = 'Blocked';
                    task.blockedReason = reason;
                    const others = this.tasks.filter(t => t.status === 'Blocked' && t.id !== taskId);
                    const minPos = others.length ? Math.min(...others.map(t => t.position ?? 0)) : 0;
                    task.position = minPos - 1;
                    this.renderBoard();
                    App.closeModal();
                    App.showToast('Task blocked', 'success');
                } catch (err) {
                    App.showToast(err.message || 'Failed to block task', 'error');
                }
            });
        }, 50);
    }
};
