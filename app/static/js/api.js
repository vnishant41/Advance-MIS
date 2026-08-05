/**
 * Advanced MIS — API Layer
 * Handles all HTTP requests with JWT auth.
 */
export const api = {
    getToken() {
        return localStorage.getItem('erp_token');
    },

    setToken(token) {
        localStorage.setItem('erp_token', token);
    },

    clearToken() {
        localStorage.removeItem('erp_token');
    },

    async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };

        // Only set Content-Type for non-FormData
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const config = { ...options, headers };

        try {
            const response = await fetch(`/api${endpoint}`, config);

            // Handle non-JSON responses (e.g. 413 HTML page, CSV download)
            const ct = response.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                if (!response.ok) {
                    if (response.status === 413) {
                        throw new Error('File size exceeds server upload limit (413 Payload Too Large)');
                    }
                    throw new Error(`Request failed (${response.status} ${response.statusText || ''})`.trim());
                }
                return response;
            }

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    window.dispatchEvent(new Event('auth:unauthorized'));
                }
                if (response.status === 413) {
                    throw new Error('File size exceeds server upload limit (413 Payload Too Large)');
                }
                throw new Error(data.message || data.error || data.msg || `Request failed (${response.status})`);
            }

            return data;
        } catch (error) {
            console.error(`API ${endpoint}:`, error);
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, data) {
        const isFormData = data instanceof FormData;
        return this.request(endpoint, {
            method: 'POST',
            body: isFormData ? data : JSON.stringify(data)
        });
    },

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};
