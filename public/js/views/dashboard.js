// views/dashboard.js — My Intel History + Collection (with search, pagination, deep-links)

TerminalApp.prototype.dashboardPage = 1;
TerminalApp.prototype.dashboardQuery = '';
TerminalApp.prototype.dashboardTab = 'intel'; // 'intel' | 'collection'
TerminalApp.prototype.dashboardColFilter = 'all'; // 'all' | 'owned' | 'wishlist' | 'for_trade' | 'sold'

TerminalApp.prototype.renderDashboard = async function (container) {
    const activeTab = this.dashboardTab || 'intel';

    if (activeTab === 'collection') {
        return this.renderDashboardCollection(container);
    }

    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

    const page = this.dashboardPage || 1;
    const q = this.dashboardQuery || '';
    const qParam = q ? `&q=${encodeURIComponent(q)}` : '';

    let data = { rows: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    try {
        const res = await fetch(`${API_URL}/submissions/user/${this.user.username}?page=${page}&limit=20${qParam}&category=${getActiveCategory()}`);
        if (res.ok) {
            const json = await res.json();
            // Handle both array and paginated object responses
            if (Array.isArray(json)) {
                let filtered = json;
                if (q) {
                    const qLower = q.toLowerCase();
                    filtered = json.filter(s => s.targetName && s.targetName.toLowerCase().includes(qLower));
                }
                data = { rows: filtered, total: filtered.length, page: 1, limit: filtered.length, totalPages: 1 };
            } else {
                data = json;
                if (!data.rows) data.rows = [];
            }
        }
    } catch (e) {
        console.error("Failed historical log", e);
    }

    const userSubs = data.rows;

    // Calculate stats
    let avgGrade = 0;
    let topTarget = '—';
    let topGrade = 0;
    if (userSubs.length > 0 || data.total > 0) {
        let gradeSum = 0;
        let gradeCount = 0;
        userSubs.forEach(s => {
            const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
            gradeSum += grade;
            gradeCount++;
            if (grade > topGrade) {
                topGrade = grade;
                topTarget = s.targetName;
            }
        });
        if (gradeCount > 0) avgGrade = (gradeSum / gradeCount).toFixed(1);
    }

    // Determine user title
    let userTitle = 'Rookie Analyst';
    let titleColor = 'var(--text-muted)';
    if (data.total >= 15) { userTitle = 'Prime Intel Officer'; titleColor = '#a855f7'; }
    else if (data.total >= 10) { userTitle = 'Senior Field Evaluator'; titleColor = 'var(--neutral)'; }
    else if (data.total >= 5) { userTitle = 'Field Evaluator'; titleColor = 'var(--success)'; }
    else if (data.total >= 2) { userTitle = 'Junior Analyst'; titleColor = 'var(--accent)'; }

    // --- Stats summary cards ---
    const statsHtml = `
        <div class="intel-stats-row">
            <div class="intel-stat-card">
                <div class="intel-stat-value">${data.total}</div>
                <div class="intel-stat-label">Total Reports</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value" style="color:var(--success);">${avgGrade || '—'}</div>
                <div class="intel-stat-label">Avg Grade</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value" style="font-size:1.1rem;">${escapeHTML(topTarget)}</div>
                <div class="intel-stat-label">Top Target</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value" style="color:${titleColor}; font-size:1rem;">${userTitle}</div>
                <div class="intel-stat-label">Your Title</div>
            </div>
        </div>
    `;

    // --- Search bar ---
    let searchHtml = `
        <div class="intel-search-bar">
            <svg class="intel-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="dashSearchInput" placeholder="Search by target name..." value="${escapeHTML(q)}"
                class="intel-search-input" />
            ${q ? '<button class="intel-search-clear" onclick="app.dashboardClearSearch()">✕</button>' : ''}
        </div>
    `;

    // --- Table or empty state ---
    let contentHtml = '';

    if (userSubs.length === 0) {
        const emptyIcon = q
            ? '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
            : '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        const emptyTitle = q ? `No results matching "${escapeHTML(q)}"` : 'No intelligence logs yet';
        const emptyDesc = q
            ? 'Try a different search term.'
            : 'Submit your first intelligence report by visiting Action Figure Registration and assessing a target.';

        contentHtml = `
            <div class="empty-state" style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md);">
                ${emptyIcon}
                <div class="empty-state-title">${emptyTitle}</div>
                <div class="empty-state-desc">${emptyDesc}</div>
            </div>
        `;
    } else {
        contentHtml = '<div class="intel-table-wrap">';
        contentHtml += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Target Name</th>
                        <th>Overall Grade</th>
                        <th style="text-align: right;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        contentHtml += userSubs.map(s => {
            const d = new Date(s.date).toLocaleDateString();
            const tier = s.targetTier ? s.targetTier : "Unknown";
            const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
            const gradeNum = parseFloat(grade);
            const gradeColor = gradeNum >= 85 ? 'var(--success)' : gradeNum >= 70 ? 'var(--neutral)' : gradeNum >= 50 ? '#eab308' : 'var(--danger)';
            return `
                <tr>
                    <td style="color:var(--text-secondary); font-size:0.9rem;">${d}${s.editedAt ? ' <span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">(edited)</span>' : ''}</td>
                    <td style="font-weight:600;">
                        <span class="tier-badge ${escapeHTML(tier).toLowerCase()}" style="margin-right:0.5rem; font-size:0.6rem;">${escapeHTML(tier)}</span>
                        <a href="#scorecard/${s.id}" class="dash-target-link" onclick="event.preventDefault(); app.viewScorecard(${s.id}, ${s.targetId})">
                            ${escapeHTML(s.targetName)}
                        </a>
                    </td>
                    <td><span style="color:${gradeColor}; font-weight:700;">${grade}</span></td>
                    <td style="text-align: right; white-space:nowrap;">
                        <button class="intel-action-btn" onclick="app.viewScorecard(${s.id}, ${s.targetId})" title="View figure">📄</button>
                        <button class="intel-action-btn" onclick="app.editSubmission(${s.id}, ${s.targetId})" title="Edit">✏️</button>
                        <button class="intel-action-btn danger" onclick="app.deleteSubmission(${s.id})" title="Retract">Retract</button>
                    </td>
                </tr>
            `;
        }).join('');
        contentHtml += '</tbody></table>';
        contentHtml += '</div>';
    }

    // --- Pagination ---
    let paginationHtml = '';
    if (data.totalPages > 1) {
        paginationHtml = '<div class="intel-pagination">';
        if (page > 1) {
            paginationHtml += `<button class="intel-page-btn" onclick="app.dashboardGoPage(${page - 1})">← Prev</button>`;
        }
        paginationHtml += `<span class="intel-page-info">Page ${page} of ${data.totalPages} &middot; ${data.total} total</span>`;
        if (page < data.totalPages) {
            paginationHtml += `<button class="intel-page-btn" onclick="app.dashboardGoPage(${page + 1})">Next →</button>`;
        }
        paginationHtml += '</div>';
    } else if (data.total > 0) {
        paginationHtml = `<div class="intel-pagination"><span class="intel-page-info">${data.total} record${data.total === 1 ? '' : 's'}</span></div>`;
    }

    container.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto; padding-bottom: 3rem;">
            <div class="dash-tabs">
                <button class="dash-tab active" data-tab="intel">📄 Intel History</button>
                <button class="dash-tab" data-tab="collection">📦 My Collection</button>
            </div>
            <div style="margin-bottom:1.5rem;">
                <h2 style="font-size:2rem; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.03em;">My Intel History</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">Your submitted intelligence reports and assessments.</p>
            </div>
            ${statsHtml}
            ${searchHtml}
            ${contentHtml}
            ${paginationHtml}
        </div>
    `;

    // Wire up tab switching
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            app.dashboardTab = tab.dataset.tab;
            app.renderApp();
        });
    });

    // Wire up Enter key on search
    const searchInput = document.getElementById('dashSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') app.dashboardSearch();
        });
    }
};

// --- Collection Tab ---
TerminalApp.prototype.renderDashboardCollection = async function (container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

    let collection = [];
    try {
        const res = await this.authFetch(`${API_URL}/collection/my`);
        if (res.ok) collection = await res.json();
    } catch (e) {
        console.error("Failed loading collection", e);
    }

    const filter = this.dashboardColFilter || 'all';
    const filtered = filter === 'all' ? collection : collection.filter(c => c.status === filter);

    // Counts
    const counts = { all: collection.length, owned: 0, wishlist: 0, for_trade: 0, sold: 0 };
    collection.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });

    // --- Value stats (owned items) ---
    const ownedItems = collection.filter(c => c.status === 'owned');
    let totalValue = 0;
    let totalMsrp = 0;
    let pricedCount = 0;
    ownedItems.forEach(c => {
        if (c.marketPrice) { totalValue += parseFloat(c.marketPrice); pricedCount++; }
        if (c.msrp) totalMsrp += parseFloat(c.msrp);
    });
    const gainLoss = totalValue - totalMsrp;
    const gainColor = gainLoss >= 0 ? 'var(--success)' : 'var(--danger)';
    const gainPrefix = gainLoss >= 0 ? '+' : '';
    const fmtUsd = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statsHtml = `
        <div class="intel-stats-row">
            <div class="intel-stat-card">
                <div class="intel-stat-value" style="color:var(--success);">${fmtUsd(totalValue)}</div>
                <div class="intel-stat-label">Market Value</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value">${fmtUsd(totalMsrp)}</div>
                <div class="intel-stat-label">Total MSRP</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value" style="color:${gainColor};">${gainPrefix}${fmtUsd(Math.abs(gainLoss))}</div>
                <div class="intel-stat-label">Gain / Loss</div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-value">${ownedItems.length}</div>
                <div class="intel-stat-label">Items Owned</div>
            </div>
        </div>
    `;

    // --- Chart placeholder ---
    const chartHtml = `
        <div id="collectionChartWrap" style="background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-md); padding:1.25rem; margin-bottom:1.5rem;">
            <h3 style="font-size:1rem; margin:0 0 0.75rem 0; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">📈 Collection Value Over Time</h3>
            <div style="position:relative; height:220px;">
                <canvas id="collectionValueChart"></canvas>
            </div>
            <div id="collectionChartEmpty" style="display:none; text-align:center; padding:2rem 0; color:var(--text-muted); font-size:0.9rem;">
                Not enough price data yet. Value history will appear as market data is submitted for your figures.
            </div>
        </div>
    `;

    // Filter buttons
    const filterBtns = [
        { key: 'all', label: 'All', color: 'var(--text-primary)' },
        { key: 'owned', label: 'Owned', color: 'var(--success)' },
        { key: 'wishlist', label: 'Wishlist', color: 'var(--neutral)' },
        { key: 'for_trade', label: 'For Trade', color: '#a855f7' },
        { key: 'sold', label: 'Sold', color: 'var(--text-muted)' }
    ].map(f => `<button class="col-filter-btn ${filter === f.key ? 'active' : ''}" data-filter="${f.key}" style="${filter === f.key ? `border-color:${f.color}; color:${f.color};` : ''}">${f.label} (${counts[f.key]})</button>`).join('');

    let tableHtml = '';
    if (filtered.length === 0) {
        tableHtml = `
            <div class="empty-state" style="background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-md);">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                <div class="empty-state-title">${filter === 'all' ? 'No items in your collection' : `No ${filter.replace('_', ' ')} items`}</div>
                <div class="empty-state-desc">Visit a figure's detail page and use the collection buttons to start tracking.</div>
            </div>
        `;
    } else {
        tableHtml = `<div class="intel-table-wrap"><table class="data-table">
            <thead><tr><th>Figure</th><th>Brand</th><th>Class</th><th>Value</th><th>Status</th><th style="text-align:right;">Action</th></tr></thead>
            <tbody>
            ${filtered.map(c => {
                const statusColors = { owned: 'var(--success)', wishlist: 'var(--neutral)', for_trade: '#a855f7', sold: 'var(--text-muted)' };
                const statusLabel = c.status.replace('_', ' ');
                const pendingBadge = (c.status === 'for_trade' && !c.validated) ? ' <span style="font-size:0.65rem; color:#f59e0b; font-weight:600;">(PENDING)</span>' : '';
                const priceDisplay = c.marketPrice ? fmtUsd(parseFloat(c.marketPrice)) : '<span style="color:var(--text-muted);">—</span>';
                return `<tr>
                    <td style="font-weight:600;"><a href="#" class="dash-target-link" onclick="event.preventDefault(); app.selectTarget(${c.figureId})">${escapeHTML(c.figureName)}</a></td>
                    <td style="color:var(--text-secondary); font-size:0.9rem;">${escapeHTML(c.brand || '')}</td>
                    <td><span class="tier-badge ${escapeHTML(c.classTie || '').toLowerCase()}" style="font-size:0.6rem;">${escapeHTML(c.classTie || '')}</span></td>
                    <td style="font-weight:600; font-size:0.9rem;">${priceDisplay}</td>
                    <td style="color:${statusColors[c.status] || 'var(--text-secondary)'}; font-weight:700; font-size:0.85rem; text-transform:uppercase;">${statusLabel}${pendingBadge}</td>
                    <td style="text-align:right;"><button class="intel-action-btn danger" onclick="app.removeCollectionItem(${c.figureId}, '${escapeHTML(c.figureName).replace(/'/g, "\\'")}')" title="Remove">✕</button></td>
                </tr>`;
            }).join('')}
            </tbody></table></div>`;
    }

    container.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto; padding-bottom: 3rem;">
            <div class="dash-tabs">
                <button class="dash-tab" data-tab="intel">📄 Intel History</button>
                <button class="dash-tab active" data-tab="collection">📦 My Collection</button>
            </div>
            <div style="margin-bottom:1.5rem;">
                <h2 style="font-size:2rem; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.03em;">My Collection</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">Track your figures — Owned, Wishlist, For Trade, and Sold.</p>
            </div>
            ${statsHtml}
            ${chartHtml}
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.5rem;">
                ${filterBtns}
            </div>
            ${tableHtml}
        </div>
    `;

    // Wire up tab switching
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            app.dashboardTab = tab.dataset.tab;
            app.renderApp();
        });
    });

    // Wire up filter buttons
    document.querySelectorAll('.col-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            app.dashboardColFilter = btn.dataset.filter;
            app.renderApp();
        });
    });

    // --- Render collection value line chart ---
    this._renderCollectionValueChart();
};

// Fetch value history and render chart
TerminalApp.prototype._renderCollectionValueChart = async function () {
    const canvas = document.getElementById('collectionValueChart');
    const emptyEl = document.getElementById('collectionChartEmpty');
    if (!canvas) return;

    // Destroy previous instance
    if (this._collectionValueChart) { this._collectionValueChart.destroy(); this._collectionValueChart = null; }

    let history = { labels: [], values: [] };
    try {
        const res = await this.authFetch(`${API_URL}/collection/my/value-history`);
        if (res.ok) history = await res.json();
    } catch (e) {
        console.error("Failed loading value history", e);
    }

    if (!history.labels || history.labels.length < 2) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const shortLabels = history.labels.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const ctx = canvas.getContext('2d');
    this._collectionValueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: [{
                label: 'Collection Value',
                data: history.values,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: history.values.length > 30 ? 0 : 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return '$' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, maxTicksLimit: 8 }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: function (value) { return '$' + value.toLocaleString(); }
                    }
                }
            }
        }
    });
};

TerminalApp.prototype.removeCollectionItem = async function (figureId, figureName) {
    if (!confirm(`Remove "${figureName}" from your collection?`)) return;
    try {
        const res = await this.authFetch(`${API_URL}/collection/${figureId}`, { method: 'DELETE' });
        if (res.ok) {
            this.showToast('Removed from collection.', 'success');
            this.renderApp();
        }
    } catch (e) { this.showToast('Failed to remove.', 'error'); }
};

// --- Dashboard search helpers ---
TerminalApp.prototype.dashboardSearch = function () {
    const input = document.getElementById('dashSearchInput');
    this.dashboardQuery = input ? input.value.trim() : '';
    this.dashboardPage = 1;
    this.renderApp();
};

TerminalApp.prototype.dashboardClearSearch = function () {
    this.dashboardQuery = '';
    this.dashboardPage = 1;
    this.renderApp();
};

TerminalApp.prototype.dashboardGoPage = function (p) {
    this.dashboardPage = p;
    this.renderApp();
};

// --- Scorecard deep-link viewer ---
TerminalApp.prototype.viewScorecard = async function (submissionId, targetId) {
    // Navigate to the figure's pulse view and highlight the specific scorecard
    this.pendingScorecard = submissionId;
    this.selectTarget(targetId);
};
