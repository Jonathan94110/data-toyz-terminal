// views/market-pulse.js — Market Pulse with tabs: Overview | Rankings | Compare

TerminalApp.prototype.renderMarketPulse = function (container) {
    let tab = sessionStorage.getItem('marketPulseTab') || 'overview';
    if (tab === 'explorer_3d') tab = 'weekly_movers'; // migrated
    container.innerHTML = `
        <div style="max-width:1100px; margin:0 auto; padding:0 1rem;">
            <h1 style="font-size:2.5rem; font-weight:900; text-transform:uppercase; letter-spacing:-0.02em; margin-bottom:0.5rem;">Market Pulse</h1>
            <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom:1.5rem;">Global intelligence overview and market activity.</p>

            <div class="market-tabs" style="display:flex; gap:0; margin-bottom:2rem; border-bottom:2px solid var(--border-light);">
                <button class="market-tab ${tab === 'overview' ? 'active' : ''}" onclick="app.switchMarketTab('overview')">Overview</button>
                <button class="market-tab ${tab === 'rankings' ? 'active' : ''}" onclick="app.switchMarketTab('rankings')">Rankings</button>
                <button class="market-tab ${tab === 'compare' ? 'active' : ''}" onclick="app.switchMarketTab('compare')">Compare</button>
                <button class="market-tab ${tab === 'trade_advisor' ? 'active' : ''}" onclick="app.switchMarketTab('trade_advisor')">Trade Advisor</button>
                <button class="market-tab ${tab === 'weekly_movers' ? 'active' : ''}" onclick="app.switchMarketTab('weekly_movers')">Weekly Movers</button>
                <button class="market-tab ${tab === 'brand_health' ? 'active' : ''}" onclick="app.switchMarketTab('brand_health')">Brand Health</button>
                <button class="market-tab ${tab === 'market_trends' ? 'active' : ''}" onclick="app.switchMarketTab('market_trends')">Market Trends</button>
            </div>

            <div id="marketTabContent"></div>
        </div>
    `;

    if (tab === 'overview') this.renderMarketOverview(document.getElementById('marketTabContent'));
    else if (tab === 'rankings') this.renderMarketRankings(document.getElementById('marketTabContent'));
    else if (tab === 'compare') this.renderMarketCompare(document.getElementById('marketTabContent'));
    else if (tab === 'trade_advisor') this.renderTradeAdvisor(document.getElementById('marketTabContent'));
    else if (tab === 'weekly_movers') this.renderWeeklyMovers(document.getElementById('marketTabContent'));
    else if (tab === 'brand_health') this.renderBrandHealth(document.getElementById('marketTabContent'));
    else if (tab === 'market_trends') this.renderMarketTrends(document.getElementById('marketTabContent'));
};

TerminalApp.prototype.switchMarketTab = function (tab) {
    sessionStorage.setItem('marketPulseTab', tab);
    const contentArea = document.getElementById('mainContent');
    this.renderMarketPulse(contentArea);
};

// ==================== OVERVIEW TAB ====================
TerminalApp.prototype.renderMarketOverview = async function (container) {
    container.innerHTML = this.skeletonHTML('stats', 8);

    try {
        const [overviewRes, headlinesRes, topRatedRes, brandIndexRes, volumeRes] = await Promise.all([
            fetch(`${API_URL}/stats/overview`),
            fetch(`${API_URL}/stats/headlines`),
            fetch(`${API_URL}/figures/top-rated`),
            fetch(`${API_URL}/stats/brand-index`),
            fetch(`${API_URL}/stats/market-volume?period=daily`)
        ]);
        const overview = await overviewRes.json();
        const headlines = await headlinesRes.json();
        const topRated = await topRatedRes.json();
        const brandIndex = await brandIndexRes.json();
        const volumeData = await volumeRes.json();

        const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';
        const fmtPct = (v) => {
            if (v === null || v === undefined) return '<span style="color:var(--text-muted);">\u2014</span>';
            const cls = v > 0 ? 'change-up' : v < 0 ? 'change-down' : 'change-flat';
            const arrow = v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u25CF';
            return `<span class="${cls}">${arrow} ${Math.abs(v).toFixed(1)}%</span>`;
        };

        container.innerHTML = `
            <!-- Stats Row 1 -->
            <div class="grid-4" style="margin-bottom:1.25rem;">
                <div class="stat-box">
                    <div class="stat-value">${overview.totalIntel}</div>
                    <div class="stat-label">Intel Reports</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${overview.uniqueAnalysts}</div>
                    <div class="stat-label">Active Analysts</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${overview.avgGrade}</div>
                    <div class="stat-label">Avg Grade</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${overview.totalTargets}</div>
                    <div class="stat-label">Cataloged Targets</div>
                </div>
            </div>

            <!-- Stats Row 2 -->
            <div class="grid-4" style="margin-bottom:2.5rem;">
                <div class="stat-box">
                    <div class="stat-value">${overview.totalMarketTx}</div>
                    <div class="stat-label">Market Transactions</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${fmtPrice(overview.avgSecondaryPrice)}</div>
                    <div class="stat-label">Avg Secondary Price</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" style="font-size:1.3rem;">${escapeHTML(overview.mostActiveBrand || '\u2014')}</div>
                    <div class="stat-label">Most Active Brand</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${fmtPct(overview.priceTrend ? overview.priceTrend.changePct : null)}</div>
                    <div class="stat-label">30-Day Price Trend</div>
                </div>
            </div>

            <!-- Market Volume Chart -->
            <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">Market Volume</h3>
                    <div style="display:flex; gap:0.5rem;">
                        <button id="volumeDaily" class="btn-sm ${volumeData.period === 'daily' ? 'active' : ''}" onclick="app.loadVolumeChart('daily')">Daily</button>
                        <button id="volumeWeekly" class="btn-sm" onclick="app.loadVolumeChart('weekly')">Weekly</button>
                    </div>
                </div>
                <div style="position:relative; height:280px;">
                    <canvas id="volumeChart"></canvas>
                </div>
            </div>

            <div class="grid-2" style="margin-bottom:2.5rem;">
                <!-- Top Rated Figures -->
                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F3C6} Top Rated Targets</h3>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${topRated.length > 0 ? topRated.map((f, i) => `
                            <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                <div style="display:flex; align-items:center; gap:0.75rem;">
                                    <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                                    <div>
                                        <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} \u00B7 ${f.submissions} report${f.submissions !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                                <div style="font-weight:800; color:var(--accent); font-size:1.1rem;">${escapeHTML(f.avgGrade)}</div>
                            </div>
                        `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No rated targets yet.</div>'}
                    </div>
                </div>

                <!-- Intel Headlines -->
                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F4E1} Intel Headlines</h3>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${headlines.length > 0 ? headlines.map(h => `
                            <div class="pulse-headline-item">
                                <div style="font-size:0.9rem; margin-bottom:0.25rem;">${escapeHTML(h.headline)}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.date).toLocaleDateString()} \u00B7 ${escapeHTML(h.brand)}</div>
                            </div>
                        `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No intel yet.</div>'}
                    </div>
                </div>
            </div>

            <!-- Brand Index Grid -->
            <div style="margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">\u{1F4CA} Brand Index</h3>
                <div class="grid-3">
                    ${brandIndex.map(b => `
                        <div class="card brand-index-card" style="padding:1.25rem;">
                            <div style="font-weight:800; font-size:1.1rem; margin-bottom:0.75rem;">${escapeHTML(b.brand)}</div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.85rem;">
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Figures</div>
                                    <div style="font-weight:600;">${b.figureCount}</div>
                                </div>
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Reports</div>
                                    <div style="font-weight:600;">${b.submissionCount}</div>
                                </div>
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Avg Grade</div>
                                    <div style="font-weight:600; color:${b.avgGrade ? (parseFloat(b.avgGrade) >= 70 ? 'var(--success)' : parseFloat(b.avgGrade) >= 50 ? '#fbbf24' : 'var(--danger)') : 'var(--text-muted)'};">${b.avgGrade || '\u2014'}</div>
                                </div>
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Avg Price</div>
                                    <div style="font-weight:600;">${fmtPrice(b.avgSecondaryPrice)}</div>
                                </div>
                            </div>
                            <div style="margin-top:0.75rem; text-align:right; font-size:0.9rem; font-weight:700;">
                                ${fmtPct(b.priceChange30d)}
                                <span style="font-size:0.7rem; color:var(--text-muted); margin-left:0.25rem;">30d</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Render Chart.js volume chart
        this._renderVolumeChart(volumeData);
    } catch (e) {
        container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load market data.</div>`;
        console.error(e);
    }
};

TerminalApp.prototype.loadVolumeChart = async function (period) {
    try {
        const res = await fetch(`${API_URL}/stats/market-volume?period=${period}`);
        const data = await res.json();

        // Update button states
        const daily = document.getElementById('volumeDaily');
        const weekly = document.getElementById('volumeWeekly');
        if (daily) daily.classList.toggle('active', period === 'daily');
        if (weekly) weekly.classList.toggle('active', period === 'weekly');

        this._renderVolumeChart(data);
    } catch (e) {
        console.error('Failed to load volume chart:', e);
    }
};

TerminalApp.prototype._renderVolumeChart = function (data) {
    const canvas = document.getElementById('volumeChart');
    if (!canvas) return;

    // Destroy existing chart if any
    if (this._volumeChart) {
        this._volumeChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const shortLabels = data.labels.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this._volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: [
                {
                    label: 'Reviews',
                    data: data.submissions,
                    borderColor: '#ff2a5f',
                    backgroundColor: 'rgba(255,42,95,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                },
                {
                    label: 'Market Transactions',
                    data: data.transactions,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', padding: 16 }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, maxRotation: 45, maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    beginAtZero: true
                }
            }
        }
    });
};

// ==================== RANKINGS TAB ====================
TerminalApp.prototype.renderMarketRankings = async function (container) {
    container.innerHTML = this.skeletonHTML('rows', 10);

    try {
        const sort = sessionStorage.getItem('rankSort') || 'price';
        const order = sessionStorage.getItem('rankOrder') || 'desc';
        const brandFilter = sessionStorage.getItem('rankBrand') || '';

        const url = `${API_URL}/figures/market-ranked?sort=${sort}&order=${order}${brandFilter ? '&brand=' + encodeURIComponent(brandFilter) : ''}`;
        const res = await fetch(url);
        const figures = await res.json();

        // Get distinct brands for filter
        const brands = [...new Set(figures.map(f => f.brand).filter(Boolean))].sort();

        const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';
        const fmtPct = (v) => {
            if (v === null || v === undefined) return '<span style="color:var(--text-muted);">\u2014</span>';
            const cls = v > 0 ? 'change-up' : v < 0 ? 'change-down' : 'change-flat';
            const arrow = v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u25CF';
            return `<span class="${cls}">${arrow} ${Math.abs(v).toFixed(1)}%</span>`;
        };

        const sortArrow = (col) => {
            if (col !== sort) return '';
            return order === 'desc' ? ' \u25BC' : ' \u25B2';
        };

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">Figure Market Rankings</h3>
                <select id="rankBrandFilter" style="padding:0.5rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border-light); background:var(--bg-surface); color:var(--text-primary); font-size:0.85rem;">
                    <option value="">All Brands</option>
                    ${brands.map(b => `<option value="${escapeHTML(b)}" ${brandFilter === b ? 'selected' : ''}>${escapeHTML(b)}</option>`).join('')}
                </select>
            </div>

            <div class="card" style="padding:0; overflow:hidden;">
                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width:40px;">#</th>
                                <th>Figure</th>
                                <th>Brand</th>
                                <th>Class</th>
                                <th class="sort-header" onclick="app.sortRankings('price')" style="cursor:pointer;">Avg Price${sortArrow('price')}</th>
                                <th class="sort-header" onclick="app.sortRankings('change')" style="cursor:pointer;">30d Change${sortArrow('change')}</th>
                                <th class="sort-header" onclick="app.sortRankings('submissions')" style="cursor:pointer;">Reviews${sortArrow('submissions')}</th>
                                <th class="sort-header" onclick="app.sortRankings('grade')" style="cursor:pointer;">Avg Grade${sortArrow('grade')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${figures.length > 0 ? figures.map((f, i) => `
                                <tr style="cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                    <td style="color:var(--text-muted); font-weight:700;">${i + 1}</td>
                                    <td style="font-weight:600;">${escapeHTML(f.name)}</td>
                                    <td style="color:var(--text-secondary);">${escapeHTML(f.brand)}</td>
                                    <td><span class="badge">${escapeHTML(f.classTie)}</span></td>
                                    <td style="font-weight:700;">${fmtPrice(f.latestPrice)}</td>
                                    <td>${fmtPct(f.priceChange30d)}</td>
                                    <td>${f.submissions}</td>
                                    <td style="font-weight:700; color:${f.avgGrade ? (f.avgGrade >= 70 ? 'var(--success)' : f.avgGrade >= 50 ? '#fbbf24' : 'var(--danger)') : 'var(--text-muted)'};">${f.avgGrade !== null ? f.avgGrade : '\u2014'}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="8" style="text-align:center; padding:3rem; color:var(--text-muted);">No figures found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Brand filter listener
        document.getElementById('rankBrandFilter').addEventListener('change', (e) => {
            sessionStorage.setItem('rankBrand', e.target.value);
            this.renderMarketRankings(container);
        });
    } catch (e) {
        container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load rankings.</div>`;
        console.error(e);
    }
};

TerminalApp.prototype.sortRankings = function (col) {
    const current = sessionStorage.getItem('rankSort') || 'price';
    const currentOrder = sessionStorage.getItem('rankOrder') || 'desc';
    if (col === current) {
        sessionStorage.setItem('rankOrder', currentOrder === 'desc' ? 'asc' : 'desc');
    } else {
        sessionStorage.setItem('rankSort', col);
        sessionStorage.setItem('rankOrder', 'desc');
    }
    const contentArea = document.getElementById('marketTabContent');
    if (contentArea) this.renderMarketRankings(contentArea);
};

// ==================== COMPARE TAB ====================
TerminalApp.prototype.renderMarketCompare = function (container) {
    container.innerHTML = `
        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1.5rem;">Compare Figures</h3>
        <div class="grid-2" style="margin-bottom:2rem;">
            <div style="position:relative;">
                <label style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); display:block; margin-bottom:0.5rem;">Figure A</label>
                <input type="text" id="compareInput1" class="form-input" placeholder="Search figure name..." autocomplete="off" />
                <input type="hidden" id="compareId1" value="" />
                <div id="compareDrop1" class="figure-autocomplete" style="display:none;"></div>
            </div>
            <div style="position:relative;">
                <label style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); display:block; margin-bottom:0.5rem;">Figure B</label>
                <input type="text" id="compareInput2" class="form-input" placeholder="Search figure name..." autocomplete="off" />
                <input type="hidden" id="compareId2" value="" />
                <div id="compareDrop2" class="figure-autocomplete" style="display:none;"></div>
            </div>
        </div>
        <div style="display:flex; justify-content:center; gap:1rem; margin-bottom:2rem;">
            <button class="btn-primary" onclick="app.runCompare()">Compare</button>
            <button class="btn-sm" onclick="app.clearCompare()">Clear</button>
        </div>
        <div id="compareResults"></div>
    `;

    // Setup autocomplete for both inputs
    this._setupCompareAutocomplete('compareInput1', 'compareDrop1', 'compareId1');
    this._setupCompareAutocomplete('compareInput2', 'compareDrop2', 'compareId2');
};

TerminalApp.prototype._setupCompareAutocomplete = function (inputId, dropId, hiddenId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropId);
    const hidden = document.getElementById(hiddenId);
    if (!input || !dropdown || !hidden) return;

    let selectedIdx = -1;

    const showMatches = () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { dropdown.style.display = 'none'; return; }
        const matches = (typeof figures !== 'undefined' ? figures : []).filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
        if (matches.length === 0) { dropdown.style.display = 'none'; return; }

        selectedIdx = -1;
        dropdown.innerHTML = matches.map(f =>
            `<div class="figure-ac-item" data-id="${f.id}" data-name="${escapeHTML(f.name)}">
                <span class="figure-ac-name">${escapeHTML(f.name)}</span>
                <span class="figure-ac-brand">${escapeHTML(f.brand || '')}</span>
            </div>`
        ).join('');
        dropdown.style.display = 'block';
        dropdown.style.position = 'absolute';
        dropdown.style.top = '100%';
        dropdown.style.left = '0';
        dropdown.style.width = '100%';
        dropdown.style.zIndex = '100';

        dropdown.querySelectorAll('.figure-ac-item').forEach(item => {
            item.addEventListener('mousedown', function (ev) {
                ev.preventDefault();
                input.value = this.dataset.name;
                hidden.value = this.dataset.id;
                dropdown.style.display = 'none';
            });
        });
    };

    input.addEventListener('input', () => {
        // Clear the hidden ID whenever user manually types — forces re-selection from autocomplete
        hidden.value = '';
        showMatches();
    });
    input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') return;
        const items = dropdown.querySelectorAll('.figure-ac-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIdx >= 0) {
            e.preventDefault();
            input.value = items[selectedIdx].dataset.name;
            hidden.value = items[selectedIdx].dataset.id;
            dropdown.style.display = 'none';
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
    input.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); });
};

TerminalApp.prototype.runCompare = async function () {
    const id1 = document.getElementById('compareId1')?.value;
    const id2 = document.getElementById('compareId2')?.value;
    const results = document.getElementById('compareResults');
    if (!results) return;

    if (!id1 || !id2) {
        results.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">Select two figures to compare.</div>';
        return;
    }
    if (id1 === id2) {
        results.innerHTML = '<div style="text-align:center; color:var(--danger); padding:2rem;">Please select two different figures.</div>';
        return;
    }

    results.innerHTML = this.skeletonHTML('stats', 4);

    try {
        const res = await fetch(`${API_URL}/figures/compare?ids=${id1},${id2}`);
        if (!res.ok) throw new Error('Compare failed');
        const body = await res.json();

        if (!body.figures || body.figures.length !== 2) {
            results.innerHTML = '<div style="text-align:center; color:var(--danger); padding:2rem;">One or both figures not found.</div>';
            return;
        }

        const [a, b] = body.figures;
        const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';

        // Calculate recommendation percentages
        const recPct = (fig) => {
            const total = (fig.metrics.recommendation?.yes || 0) + (fig.metrics.recommendation?.no || 0);
            return total > 0 ? parseFloat(((fig.metrics.recommendation.yes / total) * 100).toFixed(1)) : null;
        };

        const metricRow = (label, valA, valB, higherWins = true) => {
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            const aStr = (valA !== null && valA !== undefined && !isNaN(numA)) ? valA : '\u2014';
            const bStr = (valB !== null && valB !== undefined && !isNaN(numB)) ? valB : '\u2014';

            let aWin = false, bWin = false;
            if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                if (higherWins) { aWin = numA > numB; bWin = numB > numA; }
                else { aWin = numA < numB; bWin = numB < numA; }
            }

            return `
                <tr>
                    <td style="text-align:right; font-weight:700; ${aWin ? 'color:var(--success);' : ''}">${aStr}</td>
                    <td style="text-align:center; color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em;">${label}</td>
                    <td style="text-align:left; font-weight:700; ${bWin ? 'color:var(--success);' : ''}">${bStr}</td>
                </tr>
            `;
        };

        const aRecPct = recPct(a);
        const bRecPct = recPct(b);

        results.innerHTML = `
            <div class="card" style="padding:1.5rem; margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-around; align-items:center; margin-bottom:1.5rem;">
                    <div style="text-align:center;">
                        <div style="font-weight:800; font-size:1.3rem;">${escapeHTML(a.name)}</div>
                        <div style="color:var(--text-muted); font-size:0.85rem;">${escapeHTML(a.brand)} \u00B7 ${escapeHTML(a.classTie || '')}</div>
                    </div>
                    <div style="font-size:1.5rem; font-weight:900; color:var(--text-muted);">VS</div>
                    <div style="text-align:center;">
                        <div style="font-weight:800; font-size:1.3rem;">${escapeHTML(b.name)}</div>
                        <div style="color:var(--text-muted); font-size:0.85rem;">${escapeHTML(b.brand)} \u00B7 ${escapeHTML(b.classTie || '')}</div>
                    </div>
                </div>

                <table class="data-table compare-table" style="margin-bottom:0;">
                    <tbody>
                        ${metricRow('Reviews', a.metrics.count, b.metrics.count)}
                        ${metricRow('Overall Grade', a.metrics.overallAvg, b.metrics.overallAvg)}
                        ${metricRow('MTS Score', a.metrics.mtsAvg, b.metrics.mtsAvg)}
                        ${metricRow('Approval Score', a.metrics.approvalAvg, b.metrics.approvalAvg)}
                        ${metricRow('Avg Price', fmtPrice(a.metrics.avgSecondaryPrice), fmtPrice(b.metrics.avgSecondaryPrice))}
                        ${metricRow('Recommend %', aRecPct !== null ? aRecPct + '%' : null, bRecPct !== null ? bRecPct + '%' : null)}
                    </tbody>
                </table>
            </div>

            <!-- Price Trend Chart -->
            ${(a.timeline.length > 0 || b.timeline.length > 0) ? `
            <div class="card" style="padding:1.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Price Trend Overlay</h3>
                <div style="position:relative; height:280px;">
                    <canvas id="compareChart"></canvas>
                </div>
            </div>
            ` : ''}
        `;

        // Render overlaid price trend chart
        if (a.timeline.length > 0 || b.timeline.length > 0) {
            this._renderCompareChart(a, b);
        }
    } catch (e) {
        results.innerHTML = `<div style="text-align:center; color:var(--danger); padding:2rem;">Failed to load comparison data.</div>`;
        console.error(e);
    }
};

TerminalApp.prototype.clearCompare = function () {
    sessionStorage.removeItem('compareIds');
    const input1 = document.getElementById('compareInput1');
    const input2 = document.getElementById('compareInput2');
    const hidden1 = document.getElementById('compareId1');
    const hidden2 = document.getElementById('compareId2');
    const results = document.getElementById('compareResults');
    if (input1) input1.value = '';
    if (input2) input2.value = '';
    if (hidden1) hidden1.value = '';
    if (hidden2) hidden2.value = '';
    if (results) results.innerHTML = '';
    if (this._compareChart) { this._compareChart.destroy(); this._compareChart = null; }
};

TerminalApp.prototype._renderCompareChart = function (a, b) {
    const canvas = document.getElementById('compareChart');
    if (!canvas) return;

    if (this._compareChart) this._compareChart.destroy();

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // Merge all dates from both timelines into unified labels
    const allDatesSet = new Set();
    a.timeline.forEach(t => allDatesSet.add(t.date.split('T')[0]));
    b.timeline.forEach(t => allDatesSet.add(t.date.split('T')[0]));
    const allDates = Array.from(allDatesSet).sort();

    const mapTimeline = (timeline) => {
        const map = {};
        for (const t of timeline) {
            map[t.date.split('T')[0]] = parseFloat(t.price);
        }
        return allDates.map(d => map[d] !== undefined ? map[d] : null);
    };

    const shortLabels = allDates.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this._compareChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: [
                {
                    label: a.name,
                    data: mapTimeline(a.timeline),
                    borderColor: '#ff2a5f',
                    backgroundColor: 'rgba(255,42,95,0.08)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    borderWidth: 2,
                    spanGaps: true
                },
                {
                    label: b.name,
                    data: mapTimeline(b.timeline),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    borderWidth: 2,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': $' + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) : 'N/A');
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45, maxTicksLimit: 12 } },
                y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => '$' + v }, beginAtZero: false }
            }
        }
    });
};

// ==================== WEEKLY MOVERS TAB ====================
TerminalApp.prototype._renderMoversTable = function (title, figures, fmtPrice, fmtPct, icon, accentColor) {
    return `
        <div class="card" style="padding:0; overflow:hidden;">
            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0; color:${accentColor};">
                    ${icon} ${title}
                </h3>
            </div>
            <div style="max-height:400px; overflow-y:auto;">
                ${figures.length > 0 ? figures.map((f, i) => `
                    <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} \u00B7 ${fmtPrice(f.latestPrice)}</div>
                            </div>
                        </div>
                        <div>
                            <div style="text-align:right;">${fmtPct(f.priceChange7d)}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-align:right;">30d: ${fmtPct(f.priceChange30d)}</div>
                        </div>
                    </div>
                `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No movers this week.</div>'}
            </div>
        </div>
    `;
};

TerminalApp.prototype.renderWeeklyMovers = async function (container) {
    container.innerHTML = this.skeletonHTML('stats', 6);

    const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';
    const fmtPct = (v) => {
        if (v === null || v === undefined) return '<span style="color:var(--text-muted);">\u2014</span>';
        const arrow = v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u25CF';
        const color = v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-muted)';
        return `<span style="color:${color}; font-weight:700;">${arrow} ${Math.abs(v).toFixed(1)}%</span>`;
    };

    try {
        const res = await fetch(`${API_URL}/stats/weekly-movers`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        container.innerHTML = `
            <div style="margin-bottom:1.5rem;">
                <h2 style="font-size:1.5rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Weekly Movers Report</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">7-day market movement snapshot \u2014 price changes, activity surges, and brand trends.</p>
            </div>

            <!-- Summary Banner -->
            <div class="grid-4" style="margin-bottom:2rem;">
                <div class="stat-box" style="padding:1.25rem;">
                    <div class="stat-value" style="font-size:2rem; color:var(--accent);">${data.summary.totalSubmissions7d}</div>
                    <div class="stat-label">Reports This Week</div>
                </div>
                <div class="stat-box" style="padding:1.25rem;">
                    <div class="stat-value" style="font-size:2rem; color:var(--accent);">${data.summary.avgGrade7d !== null ? data.summary.avgGrade7d : '\u2014'}</div>
                    <div class="stat-label">Avg Grade (7d)</div>
                </div>
                <div class="stat-box" style="padding:1.25rem;">
                    <div class="stat-value" style="font-size:2rem; color:var(--success);">${data.summary.gainersCount}</div>
                    <div class="stat-label">Gainers</div>
                </div>
                <div class="stat-box" style="padding:1.25rem;">
                    <div class="stat-value" style="font-size:2rem; color:var(--danger);">${data.summary.losersCount}</div>
                    <div class="stat-label">Losers</div>
                </div>
            </div>

            <!-- Top Gainers & Top Losers -->
            <div class="grid-2" style="margin-bottom:2rem;">
                ${this._renderMoversTable('\u25B2 Top Gainers', data.topGainers, fmtPrice, fmtPct, '', 'var(--success)')}
                ${this._renderMoversTable('\u25BC Top Losers', data.topLosers, fmtPrice, fmtPct, '', 'var(--danger)')}
            </div>

            <!-- Most Active & New Entries -->
            <div class="grid-2" style="margin-bottom:2rem;">
                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F525} Most Active (7d)</h3>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${data.mostActive.length > 0 ? data.mostActive.map((f, i) => `
                            <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                <div style="display:flex; align-items:center; gap:0.75rem;">
                                    <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                                    <div>
                                        <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)}</div>
                                    </div>
                                </div>
                                <div style="font-weight:800; color:var(--accent); font-size:1.1rem;">${f.submissions7d} report${f.submissions7d !== 1 ? 's' : ''}</div>
                            </div>
                        `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No activity this week.</div>'}
                    </div>
                </div>

                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F195} New Entries</h3>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${data.newEntries.length > 0 ? data.newEntries.map(f => `
                            <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                <div>
                                    <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} \u00B7 ${escapeHTML(f.classTie || '')}</div>
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(f.firstSubmission).toLocaleDateString()}</div>
                            </div>
                        `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No new entries this week.</div>'}
                    </div>
                </div>
            </div>

            <!-- Brand Movers -->
            <div style="margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">\u{1F4CA} Brand Movers (7d)</h3>
                <div class="grid-3">
                    ${data.brandMovers.length > 0 ? data.brandMovers.map(b => `
                        <div class="card" style="padding:1.25rem;">
                            <div style="font-weight:800; font-size:1.1rem; margin-bottom:0.75rem;">${escapeHTML(b.brand)}</div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.85rem;">
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Figures</div>
                                    <div style="font-weight:600;">${b.figureCount}</div>
                                </div>
                                <div>
                                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Reports (7d)</div>
                                    <div style="font-weight:600;">${b.submissions7d}</div>
                                </div>
                            </div>
                            <div style="margin-top:0.75rem; text-align:right; font-size:0.9rem; font-weight:700;">
                                ${fmtPct(b.priceChange7d)}
                                <span style="font-size:0.7rem; color:var(--text-muted); margin-left:0.25rem;">7d</span>
                            </div>
                        </div>
                    `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No brand movement data available.</div>'}
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Weekly movers error:', e);
        container.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load weekly movers report.</div>';
    }
};

// ==================== BRAND HEALTH DASHBOARD TAB ====================
TerminalApp.prototype.renderBrandHealth = async function (container) {
    container.innerHTML = this.skeletonHTML('stats', 8);

    const BRAND_COLORS = [
        '#ff2a5f', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';
    const fmtPct = (v) => {
        if (v === null || v === undefined) return '<span style="color:var(--text-muted);">\u2014</span>';
        const cls = v > 0 ? 'change-up' : v < 0 ? 'change-down' : 'change-flat';
        const arrow = v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u25CF';
        return `<span class="${cls}">${arrow} ${Math.abs(v).toFixed(1)}%</span>`;
    };

    try {
        const res = await fetch(`${API_URL}/stats/brand-health`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        if (!data.brands || data.brands.length === 0) {
            container.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--text-muted);">No brand data available yet.</div>';
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom:1.5rem;">
                <h2 style="font-size:1.5rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Brand Health Dashboard</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">Compare brands side-by-side with health metrics, price trends, and grade trajectories.</p>
            </div>

            <!-- Brand Comparison Grid -->
            <div class="grid-3" style="margin-bottom:2.5rem;">
                ${data.brands.map((b, i) => `
                    <div class="card" style="padding:1.25rem; border-top:3px solid ${BRAND_COLORS[i % BRAND_COLORS.length]};">
                        <div style="font-weight:800; font-size:1.1rem; margin-bottom:0.75rem;">${escapeHTML(b.brand)}</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.85rem;">
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Figures</div>
                                <div style="font-weight:600;">${b.figureCount}</div>
                            </div>
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Avg Grade</div>
                                <div style="font-weight:600; color:${b.avgGrade ? (b.avgGrade >= 70 ? 'var(--success)' : b.avgGrade >= 50 ? '#fbbf24' : 'var(--danger)') : 'var(--text-muted)'};">${b.avgGrade || '\u2014'}</div>
                            </div>
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Avg Price</div>
                                <div style="font-weight:600;">${fmtPrice(b.avgSecondaryPrice)}</div>
                            </div>
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">30d Trend</div>
                                <div style="font-weight:600;">${fmtPct(b.priceChange30d)}</div>
                            </div>
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Submissions (30d)</div>
                                <div style="font-weight:600;">${b.submissions30d}</div>
                            </div>
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Analysts</div>
                                <div style="font-weight:600;">${b.uniqueAnalysts}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Brand Price Trend Chart -->
            <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Brand Price Trends (90d)</h3>
                ${data.priceTrends.labels.length > 0
                    ? '<div style="position:relative; height:320px;"><canvas id="brandPriceChart"></canvas></div>'
                    : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No price data available yet.</div>'}
            </div>

            <!-- Brand Grade Trend Chart -->
            <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Brand Grade Trends (90d)</h3>
                ${data.gradeTrends.labels.length > 0
                    ? '<div style="position:relative; height:320px;"><canvas id="brandGradeChart"></canvas></div>'
                    : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No grade data available yet.</div>'}
            </div>
        `;

        // Render charts
        if (data.priceTrends.labels.length > 0) this._renderBrandChart('brandPriceChart', '_brandPriceChart', data.priceTrends, BRAND_COLORS, '$');
        if (data.gradeTrends.labels.length > 0) this._renderBrandChart('brandGradeChart', '_brandGradeChart', data.gradeTrends, BRAND_COLORS, '');

    } catch (e) {
        console.error('Brand health error:', e);
        container.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load brand health data.</div>';
    }
};

TerminalApp.prototype._renderBrandChart = function (canvasId, instanceKey, trends, colors, prefix) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (this[instanceKey]) this[instanceKey].destroy();

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const shortLabels = trends.labels.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this[instanceKey] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: trends.datasets.map((ds, i) => ({
                label: ds.brand,
                data: ds.data,
                borderColor: colors[i % colors.length],
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5,
                borderWidth: 2,
                spanGaps: true
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1, padding: 12, cornerRadius: 8,
                    callbacks: { label: ctx => ctx.dataset.label + ': ' + prefix + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(prefix ? 2 : 1) : 'N/A') }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45, maxTicksLimit: 12 } },
                y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => prefix + v }, beginAtZero: !prefix, suggestedMin: prefix ? undefined : 0, suggestedMax: prefix ? undefined : 100 }
            }
        }
    });
};

// ==================== MARKET TRENDS TIMELINE TAB ====================
TerminalApp.prototype.renderMarketTrends = async function (container) {
    container.innerHTML = this.skeletonHTML('stats', 8);

    const period = sessionStorage.getItem('marketTrendsPeriod') || '90d';

    const fmtPrice = (v) => v !== null && v !== undefined ? '$' + parseFloat(v).toFixed(2) : '\u2014';
    const fmtPct = (v) => {
        if (v === null || v === undefined) return '<span style="color:var(--text-muted);">\u2014</span>';
        const cls = v > 0 ? 'change-up' : v < 0 ? 'change-down' : 'change-flat';
        const arrow = v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u25CF';
        return `<span class="${cls}">${arrow} ${Math.abs(v).toFixed(1)}%</span>`;
    };

    const TREND_COLORS = ['#ff2a5f', '#3b82f6', '#10b981', '#f59e0b'];

    try {
        const res = await fetch(`${API_URL}/stats/market-trends?period=${period}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        container.innerHTML = `
            <div style="margin-bottom:1.5rem;">
                <h2 style="font-size:1.5rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Market Trends Timeline</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">Overall market movement, price trends, and activity over time.</p>
            </div>

            <!-- Period Selector -->
            <div style="display:flex; gap:0.5rem; margin-bottom:2rem;">
                <button class="btn-sm ${period === '30d' ? 'active' : ''}" onclick="app.switchTrendsPeriod('30d')">30 Days</button>
                <button class="btn-sm ${period === '90d' ? 'active' : ''}" onclick="app.switchTrendsPeriod('90d')">90 Days</button>
                <button class="btn-sm ${period === '1y' ? 'active' : ''}" onclick="app.switchTrendsPeriod('1y')">1 Year</button>
            </div>

            <!-- Summary Stats -->
            <div class="grid-4" style="margin-bottom:2.5rem;">
                <div class="stat-box">
                    <div class="stat-value">${fmtPrice(data.summary.avgPriceNow)}</div>
                    <div class="stat-label">Avg Price (Current)</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${fmtPct(data.summary.priceChangePct)}</div>
                    <div class="stat-label">Price Change (${period})</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${data.summary.totalSubmissions}</div>
                    <div class="stat-label">Submissions (${period})</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${data.summary.activeFigures}</div>
                    <div class="stat-label">Active Figures</div>
                </div>
            </div>

            <!-- Price Trends Chart -->
            <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Price Trends</h3>
                ${data.priceSeries.labels.length > 0
                    ? '<div style="position:relative; height:320px;"><canvas id="marketTrendsPriceChart"></canvas></div>'
                    : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No price data available for this period.</div>'}
            </div>

            <!-- Activity Chart -->
            <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Market Activity</h3>
                ${data.activitySeries.labels.length > 0
                    ? '<div style="position:relative; height:280px;"><canvas id="marketTrendsActivityChart"></canvas></div>'
                    : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No activity data available for this period.</div>'}
            </div>

            <!-- Top Movers Tables -->
            <div class="grid-2" style="margin-bottom:2.5rem;">
                ${this._renderTrendsMoversTable('\u25B2 Top Gainers', data.topMovers.gainers, fmtPrice, fmtPct, 'var(--success)')}
                ${this._renderTrendsMoversTable('\u25BC Top Losers', data.topMovers.losers, fmtPrice, fmtPct, 'var(--danger)')}
            </div>
        `;

        if (data.priceSeries.labels.length > 0) this._renderTrendsPriceChart(data.priceSeries, TREND_COLORS);
        if (data.activitySeries.labels.length > 0) this._renderTrendsActivityChart(data.activitySeries);

    } catch (e) {
        console.error('Market trends error:', e);
        container.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load market trends data.</div>';
    }
};

TerminalApp.prototype.switchTrendsPeriod = function (period) {
    sessionStorage.setItem('marketTrendsPeriod', period);
    const contentArea = document.getElementById('marketTabContent');
    if (contentArea) this.renderMarketTrends(contentArea);
};

TerminalApp.prototype._renderTrendsMoversTable = function (title, figures, fmtPrice, fmtPct, accentColor) {
    return `
        <div class="card" style="padding:0; overflow:hidden;">
            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0; color:${accentColor};">${title}</h3>
            </div>
            <div style="max-height:400px; overflow-y:auto;">
                ${figures.length > 0 ? figures.map((f, i) => `
                    <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} \u00B7 ${fmtPrice(f.currentPrice)}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">${fmtPct(f.changePct)}</div>
                    </div>
                `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No movers in this period.</div>'}
            </div>
        </div>
    `;
};

TerminalApp.prototype._renderTrendsPriceChart = function (series, colors) {
    const canvas = document.getElementById('marketTrendsPriceChart');
    if (!canvas) return;
    if (this._trendsPriceChart) this._trendsPriceChart.destroy();

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const shortLabels = series.labels.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this._trendsPriceChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: series.datasets.map((ds, i) => ({
                label: ds.label,
                data: ds.data,
                borderColor: colors[i % colors.length],
                backgroundColor: i === 0 ? colors[0] + '15' : 'transparent',
                fill: i === 0,
                tension: 0.3,
                pointRadius: i === 0 ? 0 : 2,
                pointHoverRadius: 5,
                borderWidth: i === 0 ? 3 : 2,
                borderDash: i === 0 ? [] : [5, 5],
                spanGaps: true
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1, padding: 12, cornerRadius: 8,
                    callbacks: { label: ctx => ctx.dataset.label + ': $' + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) : 'N/A') }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45, maxTicksLimit: 12 } },
                y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => '$' + v }, beginAtZero: false }
            }
        }
    });
};

TerminalApp.prototype._renderTrendsActivityChart = function (series) {
    const canvas = document.getElementById('marketTrendsActivityChart');
    if (!canvas) return;
    if (this._trendsActivityChart) this._trendsActivityChart.destroy();

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const shortLabels = series.labels.map(l => {
        const d = new Date(l + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this._trendsActivityChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: shortLabels,
            datasets: [
                {
                    label: 'Submissions',
                    data: series.submissions,
                    borderColor: '#ff2a5f',
                    backgroundColor: 'rgba(255,42,95,0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                },
                {
                    label: 'Market Transactions',
                    data: series.transactions,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1, padding: 12, cornerRadius: 8
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45, maxTicksLimit: 12 } },
                y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true }
            }
        }
    });
};
