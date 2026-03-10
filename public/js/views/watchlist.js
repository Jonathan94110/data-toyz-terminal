// views/watchlist.js — Price Alerts / Watchlist view
TerminalApp.prototype.renderWatchlist = async function(container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('cards', 3)}</div>`;

    let alerts = [];
    try {
        const res = await this.authFetch(`${API_URL}/price-alerts/my`);
        if (res.ok) alerts = await res.json();
    } catch (e) { /* empty */ }

    const activeAlerts = alerts.filter(a => !a.triggered);
    const triggeredAlerts = alerts.filter(a => a.triggered);

    container.innerHTML = `
        <div class="search-container animate-mount" style="max-width:900px; margin:0 auto;">
            <div style="margin-bottom:2rem;">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">🔔 Price Alerts</h2>
                <p style="color:var(--text-secondary); font-size:1.1rem;">Monitor figures and get notified when prices hit your targets.</p>
            </div>

            ${alerts.length === 0 ? `
                <div class="card" style="text-align:center; padding:3rem;">
                    <p style="color:var(--text-muted); font-size:1.1rem; margin-bottom:1rem;">No price alerts set yet.</p>
                    <p style="color:var(--text-muted); font-size:0.9rem;">Visit any figure's Pulse page to set a price alert.</p>
                    <button class="btn" style="margin-top:1.5rem;" onclick="app.currentView='search'; app.renderApp();">Browse Figures</button>
                </div>
            ` : `
                ${activeAlerts.length > 0 ? `
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">Active Alerts (${activeAlerts.length})</h3>
                <div style="display:grid; gap:0.75rem; margin-bottom:2rem;">
                    ${activeAlerts.map(a => `
                        <div class="card" style="padding:1.25rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                            <div style="flex:1; min-width:200px; cursor:pointer;" onclick="app.selectTarget(${a.figureId})">
                                <div style="font-weight:700; font-size:1rem; margin-bottom:0.25rem;">${escapeHTML(a.figureName)}</div>
                                <div style="color:var(--text-muted); font-size:0.8rem;">${escapeHTML(a.brand || '')} ${a.classTie ? '· ' + escapeHTML(a.classTie) : ''}</div>
                            </div>
                            <div style="text-align:center; min-width:120px;">
                                <span class="signal-badge ${a.alertType === 'below' ? 'signal-buy' : 'signal-sell'}" style="font-size:0.7rem;">
                                    ${a.alertType === 'below' ? '↓ BELOW' : '↑ ABOVE'}
                                </span>
                                <div style="font-size:1.1rem; font-weight:800; margin-top:0.25rem; color:var(--text-primary);">$${parseFloat(a.targetPrice).toFixed(2)}</div>
                            </div>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                <button class="btn-outline alert-toggle-btn" data-alert-id="${a.id}" style="font-size:0.75rem; padding:0.35rem 0.75rem;">${a.enabled ? 'Pause' : 'Resume'}</button>
                                <button class="btn-outline alert-delete-btn" data-alert-id="${a.id}" style="font-size:0.75rem; padding:0.35rem 0.75rem; border-color:var(--danger); color:var(--danger);">✕</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                ${triggeredAlerts.length > 0 ? `
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">Triggered (${triggeredAlerts.length})</h3>
                <div style="display:grid; gap:0.75rem;">
                    ${triggeredAlerts.map(a => `
                        <div class="card" style="padding:1.25rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; opacity:0.7;">
                            <div style="flex:1; min-width:200px; cursor:pointer;" onclick="app.selectTarget(${a.figureId})">
                                <div style="font-weight:700; font-size:1rem; margin-bottom:0.25rem;">${escapeHTML(a.figureName)}</div>
                                <div style="color:var(--text-muted); font-size:0.8rem;">${escapeHTML(a.brand || '')} ${a.classTie ? '· ' + escapeHTML(a.classTie) : ''}</div>
                            </div>
                            <div style="text-align:center; min-width:120px;">
                                <span style="font-size:0.7rem; color:var(--success); font-weight:700; letter-spacing:0.05em;">✓ TRIGGERED</span>
                                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.15rem;">$${parseFloat(a.targetPrice).toFixed(2)}</div>
                                ${a.triggeredAt ? `<div style="font-size:0.7rem; color:var(--text-muted);">${new Date(a.triggeredAt).toLocaleDateString()}</div>` : ''}
                            </div>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                <button class="btn-outline alert-reset-btn" data-alert-id="${a.id}" style="font-size:0.75rem; padding:0.35rem 0.75rem;">Re-arm</button>
                                <button class="btn-outline alert-delete-btn" data-alert-id="${a.id}" style="font-size:0.75rem; padding:0.35rem 0.75rem; border-color:var(--danger); color:var(--danger);">✕</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            `}
        </div>
    `;

    const self = this;

    // Toggle enable/disable
    container.querySelectorAll('.alert-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await self.authFetch(`${API_URL}/price-alerts/${btn.dataset.alertId}/toggle`, { method: 'PUT' });
                self.renderWatchlist(container);
            } catch (e) { /* silent */ }
        });
    });

    // Reset triggered alert
    container.querySelectorAll('.alert-reset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await self.authFetch(`${API_URL}/price-alerts/${btn.dataset.alertId}/reset`, { method: 'PUT' });
                self.renderWatchlist(container);
            } catch (e) { /* silent */ }
        });
    });

    // Delete alert
    container.querySelectorAll('.alert-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this price alert?')) return;
            try {
                await self.authFetch(`${API_URL}/price-alerts/${btn.dataset.alertId}`, { method: 'DELETE' });
                self.renderWatchlist(container);
            } catch (e) { /* silent */ }
        });
    });
};
