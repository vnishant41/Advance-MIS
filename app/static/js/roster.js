/**
 * Roster Management — Daily rotation config and status updates.
 */
import { api } from './api.js';

export default {
    async render() {
        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);

        return `
            <div class="tabs" id="roster-tabs">
                <button class="tab active" data-tab="today"><i class="fas fa-calendar-day"></i> Today's Roster</button>
                ${isMgr ? '<button class="tab" data-tab="config"><i class="fas fa-cog"></i> Configuration</button>' : ''}
            </div>
            <div id="roster-content">
                <div class="loading-skeleton"><div class="skeleton-card"></div></div>
            </div>
        `;
    },

    async init() {
        this.currentTab = 'today';

        document.querySelectorAll('#roster-tabs .tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#roster-tabs .tab').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentTab = e.currentTarget.dataset.tab;
                this.loadTab();
            });
        });

        this.loadTab();
    },

    async loadTab() {
        if (this.currentTab === 'today') await this.loadToday();
        else await this.loadConfig();
    },

    async loadToday() {
        const container = document.getElementById('roster-content');
        container.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card"></div></div>';

        try {
            const data = await api.get('/roster/today');
            const tasks = data.tasks || [];

            if (tasks.length === 0) {
                container.innerHTML = '<div class="glass-card" style="padding:24px;"><div class="empty-state"><i class="fas fa-calendar-check"></i><p>No roster assignments for today</p></div></div>';
                return;
            }

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-user-clock" style="color:var(--accent);margin-right:8px;"></i>Today — ${data.today}</h3>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr><th>Role</th><th>Employee</th><th>Frequency</th><th>Remarks</th><th>Status</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            ${tasks.map(r => `
                                <tr>
                                    <td style="font-weight:600;">${App.escapeHtml(r.role)}</td>
                                    <td>${App.escapeHtml(r.employee)}</td>
                                    <td style="font-size:.85rem; color:var(--text-muted);">${r.frequency || 'Daily'}</td>
                                    <td style="font-size:.85rem; color:var(--text-muted);">${App.escapeHtml(r.remark || '—')}</td>
                                    <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
                                    <td>
                                        <select class="roster-status-select" data-role="${App.escapeHtml(r.role)}" style="font-size:.8rem; padding:4px 8px;">
                                            <option value="Done" ${r.status === 'Done' ? 'selected' : ''}>Done</option>
                                            <option value="Pending" ${r.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                            <option value="Skip" ${r.status === 'Skip' ? 'selected' : ''}>Skip</option>
                                        </select>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="display:flex; justify-content:flex-end; margin-top:16px;">
                        <button class="btn btn-primary" id="roster-save-btn"><i class="fas fa-save"></i> Save Status</button>
                    </div>
                </div>
            `;

            document.getElementById('roster-save-btn').addEventListener('click', async () => {
                const selects = document.querySelectorAll('.roster-status-select');
                const btn = document.getElementById('roster-save-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                let saved = 0;
                for (const s of selects) {
                    try {
                        await api.put('/roster/status', { role: s.dataset.role, status: s.value });
                        saved++;
                    } catch (e) { /* continue */ }
                }

                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Save Status';
                App.showToast(`Saved ${saved} roster entries`, 'success');
                this.loadTab();
            });
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load roster</p></div>';
        }
    },

    async loadConfig() {
        const container = document.getElementById('roster-content');
        container.innerHTML = '<div class="loading-skeleton"><div class="skeleton-card"></div></div>';

        try {
            const data = await api.get('/roster/config');
            const configs = data.data || [];

            container.innerHTML = `
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-cog" style="color:var(--warning);margin-right:8px;"></i>Roster Configuration</h3>
                        <button class="btn btn-primary btn-sm" id="btn-add-roster"><i class="fas fa-plus"></i> Add Role</button>
                    </div>
                    ${configs.length > 0 ? `
                        <table class="data-table">
                            <thead><tr><th>Role</th><th>Employee</th><th>Frequency</th><th>Remarks</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${configs.map(c => `
                                    <tr>
                                        <td style="font-weight:600;">${App.escapeHtml(c.role)}</td>
                                        <td>${App.escapeHtml(c.employee)}</td>
                                        <td>${c.frequency}</td>
                                        <td style="color:var(--text-muted);">${App.escapeHtml(c.remark || '—')}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="App.modules.roster.editConfig('${App.escapeHtml(c.role)}','${App.escapeHtml(c.employee)}','${c.frequency}','${App.escapeHtml(c.remark || '')}')">Edit</button>
                                            <button class="btn btn-sm btn-danger" onclick="App.modules.roster.deleteConfig(${c.id})">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<div class="empty-state"><i class="fas fa-user-cog"></i><p>No roster roles configured yet</p></div>'}
                </div>
            `;

            document.getElementById('btn-add-roster')?.addEventListener('click', () => this.showRosterModal());
        } catch (err) {
            container.innerHTML = '<div class="glass-card" style="padding:24px;"><p class="error-text">Failed to load configuration</p></div>';
        }
    },

    showRosterModal(oldRole = '', employee = '', frequency = 'Daily', remark = '') {
        const bodyHtml = `
            <div class="form-row"><label>Role *</label><input type="text" id="rc-role" value="${App.escapeHtml(oldRole)}" style="width:100%;" required></div>
            <div class="form-row"><label>Employee *</label><input type="text" id="rc-employee" value="${App.escapeHtml(employee)}" style="width:100%;" required></div>
            <div class="form-grid">
                <div class="form-row"><label>Frequency</label><select id="rc-freq" style="width:100%;"><option value="Daily" ${frequency === 'Daily' ? 'selected' : ''}>Daily</option><option value="Monthly" ${frequency === 'Monthly' ? 'selected' : ''}>Monthly</option></select></div>
                <div class="form-row"><label>Remark</label><input type="text" id="rc-remark" value="${App.escapeHtml(remark)}" style="width:100%;"></div>
            </div>
        `;
        App.showModal(oldRole ? 'Edit Roster Role' : 'Add Roster Role', bodyHtml,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" id="btn-save-roster-config">Save</button>');

        setTimeout(() => {
            document.getElementById('btn-save-roster-config')?.addEventListener('click', async () => {
                const role = document.getElementById('rc-role').value.trim();
                const emp = document.getElementById('rc-employee').value.trim();
                if (!role || !emp) { App.showToast('Role and employee required', 'warning'); return; }

                try {
                    await api.post('/roster/config', {
                        oldRole: oldRole || undefined,
                        role, employee: emp,
                        frequency: document.getElementById('rc-freq').value,
                        remark: document.getElementById('rc-remark').value
                    });
                    App.closeModal();
                    App.showToast('Saved', 'success');
                    this.loadTab();
                } catch (err) {
                    App.showToast(err.message || 'Failed', 'error');
                }
            });
        }, 50);
    },

    editConfig(role, employee, frequency, remark) {
        this.showRosterModal(role, employee, frequency, remark);
    },

    async deleteConfig(id) {
        if (!confirm('Delete this roster role?')) return;
        try {
            await api.delete(`/roster/config/${id}`);
            App.showToast('Deleted', 'success');
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to delete', 'error');
        }
    }
};
