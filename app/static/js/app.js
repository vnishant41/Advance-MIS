/**
 * Advanced MIS — App Core (SPA Router + Utilities)
 */
import { auth } from './auth.js';
import { api } from './api.js';

const App = {
    modules: {},
    socket: null,

    init() {
        this.initTheme();
        auth.init();

        // SPA routing
        window.addEventListener('hashchange', this.handleRoute.bind(this));
        document.getElementById('sidebar-toggle').addEventListener('click', this.toggleSidebar);

        // Auth events
        window.addEventListener('auth:success', this.onAuthSuccess.bind(this));
        window.addEventListener('auth:logout', this.cleanup.bind(this));

        // Modal setup
        document.getElementById('modal-close').addEventListener('click', this.closeModal);
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') this.closeModal();
        });

        // Notification panel toggle
        document.getElementById('notif-btn').addEventListener('click', () => {
            const panel = document.getElementById('notif-panel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) this.loadNotifications();
        });

        document.getElementById('notif-read-all').addEventListener('click', async () => {
            try {
                await api.put('/notifications/read-all', {});
                document.getElementById('notif-badge').style.display = 'none';
                document.getElementById('notif-badge').textContent = '0';
                document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
            } catch (e) { /* ignore */ }
        });

        // Profile button
        document.getElementById('btn-profile').addEventListener('click', () => {
            this.showPasswordModal();
        });
    },

    async handleRoute() {
        const hash = window.location.hash || '#dashboard';
        // Hash may include query params: "#mis?tab=pdf&report=Maize Daily".
        // Split off the page key and stash params on window for the module to read.
        const raw = hash.replace('#', '');
        const qIdx = raw.indexOf('?');
        let page = qIdx === -1 ? raw : raw.slice(0, qIdx);
        const qs = qIdx === -1 ? '' : raw.slice(qIdx + 1);
        window.routeParams = Object.fromEntries(new URLSearchParams(qs));

        // Hard block: the Data Update page is retired — never render it,
        // regardless of role or module toggle.
        if (page === 'data-update') {
            window.location.hash = '#dashboard';
            return;
        }

        // Module gate: if the requested page is explicitly disabled (and the user
        // isn't a SuperAdmin), redirect to the dashboard instead of rendering it.
        // Exception: Teammates may always reach the MIS page directly — only the
        // sidebar entry is hidden for them, not access.
        const modules = window.enabledModules || {};
        const role = window.currentUser?.role;
        const isSuperAdmin = role === 'SuperAdmin';
        const teammateMisAllowed = page === 'mis' && role === 'Teammate';
        if (page !== 'dashboard' && page !== 'admin' && modules[page] === false && !isSuperAdmin && !teammateMisAllowed) {
            this.showToast(`The "${page}" module is disabled by your administrator`, 'warning');
            window.location.hash = '#dashboard';
            return;
        }

        let moduleKey = page;
        if (page === 'dashboard' || page === 'analytics') {
            moduleKey = 'analytics';
        }

        // Update nav highlight
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const activeNavKey = (page === 'analytics') ? 'dashboard' : page;
        const activeNav = document.querySelector(`.nav-item[data-page="${activeNavKey}"]`) || document.querySelector(`.nav-item[data-page="${page}"]`);
        if (activeNav) activeNav.classList.add('active');

        // Update top bar
        const titleMap = {
            'dashboard': 'Dashboard',
            'analytics': 'Dashboard',
            'tasks': 'Tasks & Roster',
            'mis': 'MIS Reports',
            'kanban': 'Kanban Board',
            'chat': 'Team Chat',
            'roster': 'Roster Management',
            'admin': 'Admin Panel'
        };
        document.getElementById('page-title').textContent = titleMap[page] || 'Dashboard';
        document.getElementById('page-date').textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        this.showLoading();

        try {
            if (!this.modules[moduleKey]) {
                const mod = await import(`./${moduleKey}.js`);
                this.modules[moduleKey] = mod.default;
            }

            const container = document.getElementById('page-container');
            container.innerHTML = await this.modules[moduleKey].render();

            if (this.modules[moduleKey].init) {
                await this.modules[moduleKey].init();
            }

        } catch (error) {
            console.error(`Failed to load module ${page}:`, error);
            document.getElementById('page-container').innerHTML = `
                <div class="glass-card" style="padding: 48px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--warning); margin-bottom: 16px;"></i>
                    <h3 style="margin-bottom: 8px;">Module Load Error</h3>
                    <p style="color: var(--text-secondary);">Could not load the <strong>${page}</strong> module.</p>
                    <p style="color: var(--text-muted); font-size: .85rem; margin-top: 8px;">${error.message || ''}</p>
                </div>
            `;
        }
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    },

    showLoading() {
        document.getElementById('page-container').innerHTML = `
            <div class="loading-skeleton">
                <div class="skeleton-card"></div>
                <div class="skeleton-card" style="height: 80px;"></div>
                <div class="skeleton-card" style="height: 200px;"></div>
            </div>
        `;
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    showModal(title, bodyHtml, footerHtml = '', sizeClass = '') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-footer').innerHTML = footerHtml;
        
        const card = document.getElementById('modal-card');
        card.className = 'modal-card glass-card';
        if (sizeClass) {
            card.classList.add(sizeClass);
        }
        
        document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-card').className = 'modal-card glass-card';
    },

    // ---- Loading progress overlay -----------------------------------------
    // Usage:
    //   App.startProgress('Analyzing PDF', { etaSeconds: 30, subtitle: 'Running validation...' })
    //   ... await fetch ...
    //   App.endProgress()
    // The bar fills smoothly from 0 → 95% across etaSeconds, holds at 95% if
    // the operation runs longer than expected, then jumps to 100% on endProgress.
    _progressState: null,

    startProgress(title, opts) {
        opts = opts || {};
        const etaSeconds = Math.max(2, opts.etaSeconds || 10);
        const subtitle = opts.subtitle || '';

        // Build overlay on first use
        let overlay = document.getElementById('app-progress-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'app-progress-overlay';
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 9999;
                background: rgba(2, 6, 23, 0.78); backdrop-filter: blur(2px);
                display: flex; align-items: center; justify-content: center;
            `;
            overlay.innerHTML = `
                <div style="background: var(--bg-secondary, #0f172a); border: 1px solid var(--border, #334155); border-radius: 12px; padding: 28px 36px; min-width: 380px; max-width: 520px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                    <div id="app-progress-title" style="font-size: 1rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; text-align: center; color: var(--text-primary, #f1f5f9);">LOADING</div>
                    <div id="app-progress-subtitle" style="font-size: .82rem; color: var(--text-muted, #94a3b8); text-align: center; margin-top: 6px; min-height: 18px;"></div>
                    <div style="margin-top: 18px; background: rgba(255,255,255,0.06); border-radius: 999px; height: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.10);">
                        <div id="app-progress-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #60a5fa, #a78bfa); border-radius: 999px; transition: width 0.4s ease-out;"></div>
                    </div>
                    <div id="app-progress-pct" style="text-align: center; margin-top: 8px; font-size: .9rem; font-weight: 600; color: var(--text-secondary, #cbd5e1);">0%</div>
                    <div id="app-progress-eta" style="text-align: center; margin-top: 2px; font-size: .72rem; color: var(--text-muted, #94a3b8);"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        document.getElementById('app-progress-title').textContent = (title || 'LOADING').toUpperCase();
        document.getElementById('app-progress-subtitle').textContent = subtitle;
        const fill = document.getElementById('app-progress-fill');
        const pctEl = document.getElementById('app-progress-pct');
        const etaEl = document.getElementById('app-progress-eta');
        fill.style.transition = 'width 0.4s ease-out';
        fill.style.width = '0%';
        pctEl.textContent = '0%';
        etaEl.textContent = `Estimated ${etaSeconds}s`;
        overlay.style.display = 'flex';

        // Cancel any prior animation
        if (this._progressState && this._progressState.timer) {
            clearInterval(this._progressState.timer);
        }

        const start = Date.now();
        const state = {
            etaMs: etaSeconds * 1000,
            startedAt: start,
            timer: null,
            done: false,
        };

        // Animate towards 95% across etaSeconds, then hold (the rest jumps on endProgress)
        state.timer = setInterval(() => {
            if (state.done) return;
            const elapsed = Date.now() - start;
            // Easing: approach 95% as t/eta → 1
            const t = Math.min(1, elapsed / state.etaMs);
            const eased = 1 - Math.pow(1 - t, 2.2);
            const pct = Math.min(95, Math.round(eased * 95));
            fill.style.width = pct + '%';
            pctEl.textContent = pct + '%';
            const remaining = Math.max(0, Math.ceil((state.etaMs - elapsed) / 1000));
            etaEl.textContent = remaining > 0 ? `About ${remaining}s remaining` : 'Finishing up...';
        }, 250);

        this._progressState = state;
    },

    updateProgress(subtitle) {
        const el = document.getElementById('app-progress-subtitle');
        if (el && typeof subtitle === 'string') el.textContent = subtitle;
    },

    endProgress() {
        const overlay = document.getElementById('app-progress-overlay');
        const state = this._progressState;
        if (!state) {
            if (overlay) overlay.style.display = 'none';
            return;
        }
        state.done = true;
        if (state.timer) clearInterval(state.timer);
        const fill = document.getElementById('app-progress-fill');
        const pctEl = document.getElementById('app-progress-pct');
        const etaEl = document.getElementById('app-progress-eta');
        if (fill) {
            fill.style.transition = 'width 0.25s ease-out';
            fill.style.width = '100%';
        }
        if (pctEl) pctEl.textContent = '100%';
        if (etaEl) etaEl.textContent = 'Done';
        setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 320);
        this._progressState = null;
    },

    showPasswordModal() {
        const bodyHtml = `
            <form id="change-pwd-form">
                <div class="form-row">
                    <label>Current Password</label>
                    <input type="password" id="pwd-old" class="form-control" required style="width:100%;">
                </div>
                <div class="form-row">
                    <label>New Password</label>
                    <input type="password" id="pwd-new" class="form-control" required minlength="4" style="width:100%;">
                </div>
                <div class="form-row">
                    <label>Confirm New Password</label>
                    <input type="password" id="pwd-confirm" class="form-control" required minlength="4" style="width:100%;">
                </div>
            </form>
        `;
        const footerHtml = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-pwd">Save</button>
        `;
        this.showModal('Change Password', bodyHtml, footerHtml);

        setTimeout(() => {
            document.getElementById('btn-save-pwd').addEventListener('click', async () => {
                const oldPwd = document.getElementById('pwd-old').value;
                const newPwd = document.getElementById('pwd-new').value;
                const confirm = document.getElementById('pwd-confirm').value;

                if (newPwd !== confirm) {
                    this.showToast('Passwords do not match', 'error');
                    return;
                }
                try {
                    await api.post('/auth/change-password', { oldPassword: oldPwd, newPassword: newPwd });
                    this.showToast('Password changed successfully', 'success');
                    this.closeModal();
                } catch (err) {
                    this.showToast(err.message || 'Failed to change password', 'error');
                }
            });
        }, 50);
    },

    async loadNotifications() {
        try {
            const data = await api.get('/notifications');
            const list = document.getElementById('notif-list');
            const notifs = data.notifications || [];

            if (notifs.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding:24px;"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>';
                return;
            }

            list.innerHTML = notifs.map(n => `
                <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                    <div style="font-weight: 600; font-size: .9rem; margin-bottom: 4px;">${n.title || 'Notification'}</div>
                    <div style="font-size: .85rem; color: var(--text-secondary);">${n.message}</div>
                    <div style="font-size: .75rem; color: var(--text-muted); margin-top: 4px;">${new Date(n.createdAt).toLocaleString()}</div>
                </div>
            `).join('');
        } catch (e) {
            document.getElementById('notif-list').innerHTML = '<div class="empty-state" style="padding:24px;"><p>Could not load notifications</p></div>';
        }
    },

    onAuthSuccess() {
        this.initRealtime();
        this.loadNotificationBadge();
        // Polling fallback: the background scheduler writes Notification rows
        // and pushes via Socket.IO, but cross-thread socket delivery isn't
        // 100% reliable without eventlet monkey-patching. Poll every 60s so
        // due-time alerts always reach the user even if the socket missed.
        if (this._alertsPoll) clearInterval(this._alertsPoll);
        this._alertsPoll = setInterval(() => this.loadNotificationBadge(), 60000);
    },

    _lastSeenAlertId: 0,

    async loadNotificationBadge() {
        try {
            const data = await api.get('/dash/alerts');
            const alerts = data.alerts || [];
            const count = alerts.length;
            const badge = document.getElementById('notif-badge');
            if (count > 0) {
                badge.style.display = 'flex';
                badge.textContent = count > 9 ? '9+' : count;
            } else {
                badge.style.display = 'none';
            }
            // Toast any genuinely new alerts (id higher than the last we saw)
            // on subsequent polls only. The very first load just primes the
            // marker so a fresh login doesn't toast every backlog item.
            if (this._lastSeenAlertId > 0) {
                const fresh = alerts.filter(a => (a.id || 0) > this._lastSeenAlertId);
                fresh.reverse().forEach(a => {  // oldest first
                    this.showToast(a.title || a.message || 'New notification', a.type || 'info');
                });
            }
            this._lastSeenAlertId = alerts.reduce(
                (m, a) => Math.max(m, a.id || 0), this._lastSeenAlertId);
        } catch (e) { /* ignore */ }
    },

    initRealtime() {
        if (!window.io) return;

        try {
            this.socket = io({
                auth: { token: api.getToken() }
            });

            this.socket.on('connect', () => {
                console.log('⚡ Realtime connected');
            });

            this.socket.on('notification', (data) => {
                this.showToast(data.message, data.type || 'info');
                const badge = document.getElementById('notif-badge');
                badge.style.display = 'flex';
                badge.textContent = parseInt(badge.textContent || 0) + 1;
            });

            this.socket.on('chat_message', (msg) => {
                // If on chat page, let the chat module handle it
                if (window.location.hash === '#chat' && this.modules.chat?.onSocketMessage) {
                    this.modules.chat.onSocketMessage(msg);
                } else {
                    // Show toast for off-page messages
                    const badge = document.getElementById('chat-badge');
                    if (badge) {
                        badge.style.display = 'inline-flex';
                        badge.textContent = parseInt(badge.textContent || 0) + 1;
                    }
                }
            });

            this.socket.on('message_deleted', (data) => {
                if (window.location.hash === '#chat' && this.modules.chat?.onSocketMessageDeleted) {
                    this.modules.chat.onSocketMessageDeleted(data);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('⚡ Realtime disconnected');
            });
        } catch (e) {
            console.warn('WebSocket init failed:', e);
        }
    },

    cleanup() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        if (this._alertsPoll) {
            clearInterval(this._alertsPoll);
            this._alertsPoll = null;
        }
        this._lastSeenAlertId = 0;
        this.modules = {};
    },

    // Helper to format relative time
    timeAgo(dateStr) {
        if (!dateStr) return '';
        const now = new Date();
        const d = new Date(dateStr);
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return d.toLocaleDateString();
    },

    // Helper to escape HTML
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Theme Management (Light / Dark Mode)
    initTheme() {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        this.updateThemeIcons(currentTheme);

        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleTheme());
        });
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
        this.updateThemeIcons(nextTheme);
        this.showToast(`Switched to ${nextTheme === 'light' ? 'Light' : 'Dark'} Mode`, 'info');
        window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme: nextTheme } }));
    },

    updateThemeIcons(theme) {
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) {
                if (theme === 'light') {
                    icon.className = 'fas fa-moon';
                    btn.title = 'Switch to Dark Mode';
                } else {
                    icon.className = 'fas fa-sun';
                    btn.title = 'Switch to Light Mode';
                }
            }
        });
    }
};

// Make App globally accessible
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
