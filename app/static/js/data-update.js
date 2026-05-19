/**
 * Data Update — Cascading commodity → type → factor selection with status submission.
 */
import { api } from './api.js';

export default {
    async render() {
        return `
            <div class="content-grid">
                <div class="glass-card" style="padding: 24px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-database" style="color:var(--accent);margin-right:8px;"></i>Submit Data Update</h3>
                    </div>

                    <div class="form-grid" style="margin-bottom: 20px;">
                        <div class="form-row">
                            <label>Commodity</label>
                            <select id="du-commodity" style="width:100%;">
                                <option value="">Loading commodities...</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label>Type</label>
                            <select id="du-type" style="width:100%;" disabled>
                                <option value="">Select commodity first</option>
                            </select>
                        </div>
                    </div>

                    <div id="du-factors-area">
                        <div class="empty-state" style="padding: 32px;"><i class="fas fa-layer-group"></i><p>Select a commodity and type to load factors</p></div>
                    </div>
                </div>

                <div>
                    <div class="glass-card" style="padding: 24px;">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-info-circle" style="color:var(--info);margin-right:8px;"></i>Instructions</h3>
                        </div>
                        <div style="font-size:.85rem; color:var(--text-secondary); line-height:1.7;">
                            <p>1. Select your <strong>Commodity</strong> from the dropdown</p>
                            <p>2. Choose the <strong>Type</strong> (Spot, Future, etc.)</p>
                            <p>3. Set <strong>Status</strong> for each factor</p>
                            <p>4. Click <strong>Submit All</strong> to save</p>
                            <div style="margin-top: 16px; padding: 12px; background: rgba(59,130,246,0.08); border-radius: 8px;">
                                <strong style="color:var(--accent);"><i class="fas fa-lightbulb"></i> Tip:</strong>
                                Submitting again for the same commodity/type/date will amend previous entries.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        // Load commodities
        try {
            const data = await api.get('/du/commodities');
            const select = document.getElementById('du-commodity');
            select.innerHTML = '<option value="">Select Commodity...</option>' +
                data.commodities.map(c => `<option value="${App.escapeHtml(c)}">${App.escapeHtml(c)}</option>`).join('');
        } catch (err) {
            App.showToast('Failed to load commodities', 'error');
        }

        // Cascade: commodity → types
        document.getElementById('du-commodity').addEventListener('change', async (e) => {
            const commodity = e.target.value;
            const typeSelect = document.getElementById('du-type');

            if (!commodity) {
                typeSelect.innerHTML = '<option value="">Select commodity first</option>';
                typeSelect.disabled = true;
                document.getElementById('du-factors-area').innerHTML = '<div class="empty-state" style="padding:32px;"><i class="fas fa-layer-group"></i><p>Select a commodity and type</p></div>';
                return;
            }

            typeSelect.innerHTML = '<option value="">Loading...</option>';
            typeSelect.disabled = true;

            try {
                const data = await api.get(`/du/types/${encodeURIComponent(commodity)}`);
                typeSelect.innerHTML = '<option value="">Select Type...</option>' +
                    data.types.map(t => `<option value="${App.escapeHtml(t)}">${App.escapeHtml(t)}</option>`).join('');
                typeSelect.disabled = false;
            } catch (err) {
                typeSelect.innerHTML = '<option value="">Error loading types</option>';
            }
        });

        // Cascade: type → factors
        document.getElementById('du-type').addEventListener('change', async (e) => {
            const commodity = document.getElementById('du-commodity').value;
            const typeName = e.target.value;
            const area = document.getElementById('du-factors-area');

            if (!typeName) {
                area.innerHTML = '<div class="empty-state" style="padding:32px;"><i class="fas fa-layer-group"></i><p>Select a type to load factors</p></div>';
                return;
            }

            area.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading factors...</p></div>';

            try {
                const data = await api.get(`/du/factors/${encodeURIComponent(commodity)}/${encodeURIComponent(typeName)}`);
                this.renderFactors(data.factors, commodity, typeName);
            } catch (err) {
                area.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load factors</p></div>';
            }
        });
    },

    renderFactors(factors, commodity, typeName) {
        const area = document.getElementById('du-factors-area');

        if (!factors || factors.length === 0) {
            area.innerHTML = '<div class="empty-state" style="padding:24px;"><i class="fas fa-inbox"></i><p>No factors configured for this combination</p></div>';
            return;
        }

        let html = `
            <div class="section-title"><i class="fas fa-list-ul"></i> Factors (${factors.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Factor</th>
                        <th>Mode</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th>Remarks</th>
                    </tr>
                </thead>
                <tbody>
        `;

        factors.forEach((f, i) => {
            html += `
                <tr data-idx="${i}">
                    <td style="font-weight:600;">${App.escapeHtml(f.factor)}</td>
                    <td style="font-size:.8rem;color:var(--text-muted);">${App.escapeHtml(f.mode || '—')}</td>
                    <td style="font-size:.8rem;color:var(--text-muted);">${App.escapeHtml(f.source || '—')}</td>
                    <td>
                        <select class="du-factor-status" data-idx="${i}" style="width:100px;">
                            <option value="Done" ${f.lastStatus === 'Done' ? 'selected' : ''}>Done</option>
                            <option value="Pending" ${f.lastStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Skip" ${f.lastStatus === 'Skip' ? 'selected' : ''}>Skip</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="du-factor-remarks" data-idx="${i}" placeholder="Optional..." value="${App.escapeHtml(f.lastRemarks || '')}" style="width:100%;">
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button class="btn btn-outline" id="du-mark-all-done">Mark All Done</button>
                <button class="btn btn-primary" id="du-submit-btn"><i class="fas fa-paper-plane"></i> Submit All</button>
            </div>
        `;

        area.innerHTML = html;

        // Mark all done
        document.getElementById('du-mark-all-done').addEventListener('click', () => {
            document.querySelectorAll('.du-factor-status').forEach(s => s.value = 'Done');
            App.showToast('All marked as Done', 'info');
        });

        // Submit
        document.getElementById('du-submit-btn').addEventListener('click', async () => {
            const btn = document.getElementById('du-submit-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            const factorEntries = [];
            document.querySelectorAll('.du-factor-status').forEach(s => {
                const idx = s.dataset.idx;
                const remarks = document.querySelector(`.du-factor-remarks[data-idx="${idx}"]`);
                factorEntries.push({
                    factor: factors[idx].factor,
                    status: s.value,
                    mode: factors[idx].mode || '',
                    remarks: remarks ? remarks.value : ''
                });
            });

            try {
                const result = await api.post('/du/submit', {
                    commodity,
                    type: typeName,
                    factors: factorEntries,
                    date: new Date().toISOString().split('T')[0]
                });
                App.showToast(result.message || 'Data submitted successfully', 'success');
            } catch (err) {
                App.showToast(err.message || 'Failed to submit', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit All';
            }
        });
    }
};
