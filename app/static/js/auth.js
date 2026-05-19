/**
 * Advanced MIS — Auth Module
 * JWT login/logout, session management, profile display.
 */
import { api } from './api.js';

export const auth = {
    user: null,
    modules: {},

    init() {
        this.loginForm = document.getElementById('login-form');
        this.loginScreen = document.getElementById('login-screen');
        this.appShell = document.getElementById('app-shell');
        this.errorMsg = document.getElementById('login-error');
        this.logoutBtn = document.getElementById('btn-logout');

        this.loginForm.addEventListener('submit', this.handleLogin.bind(this));
        this.logoutBtn.addEventListener('click', this.logout.bind(this));

        window.addEventListener('auth:unauthorized', () => this.logout());

        this.checkAuth();
    },

    async checkAuth() {
        const token = api.getToken();
        if (!token) {
            this.showLogin();
            return;
        }

        try {
            const data = await api.get('/auth/me');
            if (data.success) {
                this.setupUser(data.user, data.modules);
                this.showApp();
            } else {
                this.logout();
            }
        } catch (err) {
            this.logout();
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('login-btn');

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Signing in...</span>';
            this.errorMsg.textContent = '';

            const data = await api.post('/auth/login', { email, password });

            if (data.success) {
                api.setToken(data.token);
                this.setupUser(data.user, data.modules);
                this.showApp();
                window.dispatchEvent(new CustomEvent('auth:success', { detail: data.user }));
            } else {
                this.errorMsg.textContent = data.message || 'Login failed';
            }
        } catch (err) {
            this.errorMsg.textContent = err.message || 'Login failed';
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>Sign In</span><i class="fas fa-arrow-right"></i>';
        }
    },

    logout() {
        api.clearToken();
        this.user = null;
        window.currentUser = null;
        this.showLogin();
        window.dispatchEvent(new Event('auth:logout'));
    },

    setupUser(user, modules = {}) {
        this.user = user;
        this.modules = modules;
        window.currentUser = user;
        window.enabledModules = modules;

        document.getElementById('user-name').textContent = user.name;
        document.getElementById('user-role').textContent = user.role;
        document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();

        // Hide admin nav if not admin/manager
        const navAdmin = document.getElementById('nav-admin');
        if (['SuperAdmin', 'Manager'].includes(user.role)) {
            navAdmin.style.display = 'flex';
        } else {
            navAdmin.style.display = 'none';
        }

        this.applyModuleVisibility(modules);
    },

    /**
     * Hide sidebar nav items whose module key is explicitly disabled.
     * SuperAdmin normally sees everything (so they can re-enable from Admin → Modules).
     * Exceptions:
     *   - mis: Teammates never see the direct nav entry (they reach MIS via Tasks);
     *          for Manager / Leader / SuperAdmin the toggle controls visibility.
     */
    applyModuleVisibility(modules) {
        const role = this.user?.role;
        const isSuperAdmin = role === 'SuperAdmin';
        const isTeammate = role === 'Teammate';
        document.querySelectorAll('.nav-item[data-page]').forEach(el => {
            const page = el.dataset.page;
            if (page === 'admin') return; // admin handled above by role
            const enabled = modules[page] !== false;

            if (page === 'mis') {
                // Teammates: always hide the direct sidebar entry.
                // Manager / Leader / SuperAdmin: respect the admin toggle (no superadmin escape).
                if (isTeammate || !enabled) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
                return;
            }

            if (!enabled && !isSuperAdmin) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });
    },

    showLogin() {
        this.appShell.classList.add('hidden');
        this.loginScreen.classList.remove('hidden');
    },

    showApp() {
        this.loginScreen.classList.add('hidden');
        this.appShell.classList.remove('hidden');

        // Trigger initial route
        if (!window.location.hash) {
            window.location.hash = '#dashboard';
        } else {
            window.dispatchEvent(new Event('hashchange'));
        }
    }
};
