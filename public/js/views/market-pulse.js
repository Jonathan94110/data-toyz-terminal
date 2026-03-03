// views/market-pulse.js — Market Pulse with tabs: Overview | Rankings | Compare

TerminalApp.prototype.renderMarketPulse = function (container) {
    const tab = sessionStorage.getItem('marketPulseTab') || 'overview';
    container.innerHTML = `
        <div style="max-width:1100px; margin:0 auto; padding:0 1rem;">
            <h1 style="font-size:2.5rem; font-weight:900; text-transform:uppercase; letter-spacing:-0.02em; margin-bottom:0.5rem;">Market Pulse</h1>
            <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom:1.5rem;">Global intelligence overview and market activity.</p>

            <div class="market-tabs" style="display:flex; gap:0; margin-bottom:2rem; border-bottom:2px solid var(--border-light);">
                <button class="market-tab ${tab === 'overview' ? 'active' : ''}" onclick="app.switchMarketTab('overview')">Overview</button>
                <button class="market-tab ${tab === 'rankings' ? 'active' : ''}" onclick="app.switchMarketTab('rankings')">Rankings</button>
                <button class="market-tab ${tab === 'compare' ? 'active' : ''}" onclick="app.switchMarketTab('compare')">Compare</button>
                <button class="market-tab ${tab === 'trade_advisor' ? 'active' : ''}" onclick="app.switchMarketTab('trade_advisor')">Trade Advisor</button>
                <button class="market-tab ${tab === 'explorer_3d' ? 'active' : ''}" onclick="app.switchMarketTab('explorer_3d')">3D Explorer</button>
            </div>

            <div id="marketTabContent"></div>
        </div>
    `;

    if (tab === 'overview') this.renderMarketOverview(document.getElementById('marketTabContent'));
    else if (tab === 'rankings') this.renderMarketRankings(document.getElementById('marketTabContent'));
    else if (tab === 'compare') this.renderMarketCompare(document.getElementById('marketTabContent'));
    else if (tab === 'trade_advisor') this.renderTradeAdvisor(document.getElementById('marketTabContent'));
    else if (tab === 'explorer_3d') this.renderMarketExplorer3D(document.getElementById('marketTabContent'));
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

// ==================== 3D EXPLORER TAB ====================
TerminalApp.prototype.renderMarketExplorer3D = async function (container) {
    container.innerHTML = `
        <div style="margin-bottom:1.5rem;">
            <h2 style="font-size:1.5rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; color:var(--text-primary);">3D Market Scatter</h2>
            <p style="color:var(--text-secondary); font-size:0.95rem;">Interactive visualization of the secondary market landscape. Mapping Avg Price (X) against Approval Grade (Y) with Submission Volume (Z).</p>
        </div>
        <div class="card" style="padding:0; height:600px; position:relative; overflow:hidden;" id="plotlyWrapper">
            <div id="plotlyContainer" style="width:100%; height:100%;">
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:var(--text-muted); font-size:0.9rem; letter-spacing:0.05em; text-transform:uppercase;">
                    <span class="pulse-anim" style="display:inline-block; width:8px; height:8px; background:var(--accent); border-radius:50%; margin-right:8px;"></span> Initializing Spatial Scan...
                </div>
            </div>
        </div>
    `;

    try {
        const res = await fetch(`${API_URL}/figures`);
        const figures = await res.json();

        // Filter out figures without enough data points to plot meaningfully
        const validFigures = figures.filter(f => f.avgGrade && f.avgSecondaryPrice && f.submissions > 0);

        if (validFigures.length === 0) {
            document.getElementById('plotlyContainer').innerHTML = '<div style="padding:3rem; text-align:center; color:var(--text-muted);">Insufficient market data points for 3D generation.</div>';
            return;
        }

        const x = validFigures.map(f => parseFloat(f.avgSecondaryPrice));
        const y = validFigures.map(f => parseFloat(f.avgGrade));
        const z = validFigures.map(f => f.submissions);
        const text = validFigures.map(f => `<b>${escapeHTML(f.name)}</b><br>${escapeHTML(f.brand)}<br>Grade: ${f.avgGrade}<br>Price: $${f.avgSecondaryPrice}<br>Reports: ${f.submissions}`);

        // Colorscaping based on grade/sentiment
        const colors = y.map(grade => grade >= 80 ? '#10b981' : grade >= 50 ? '#f59e0b' : '#ef4444');

        const trace = {
            x: x,
            y: y,
            z: z,
            mode: 'markers',
            marker: {
                size: 8,
                color: colors,
                opacity: 0.8,
                line: {
                    color: 'rgba(255, 255, 255, 0.2)',
                    width: 1
                }
            },
            text: text,
            hoverinfo: 'text',
            type: 'scatter3d'
        };

        const isDark = document.body.getAttribute('data-theme') !== 'light';
        const bgColor = isDark ? 'rgba(7, 9, 20, 0)' : 'rgba(255,255,255,0)';
        const fgColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

        const layout = {
            margin: { l: 0, r: 0, b: 0, t: 0 },
            paper_bgcolor: bgColor,
            plot_bgcolor: bgColor,
            font: { color: fgColor, family: 'Inter, sans-serif' },
            hovermode: 'closest',
            scene: {
                xaxis: { title: 'Avg Price ($)', backgroundcolor: bgColor, gridcolor: gridColor, showbackground: false, zerolinecolor: gridColor },
                yaxis: { title: 'Approval Grade', backgroundcolor: bgColor, gridcolor: gridColor, showbackground: false, zerolinecolor: gridColor },
                zaxis: { title: 'Reports', backgroundcolor: bgColor, gridcolor: gridColor, showbackground: false, zerolinecolor: gridColor },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 0.5 }
                }
            }
        };

        if (typeof Plotly !== 'undefined') {
            document.getElementById('plotlyContainer').innerHTML = ''; // clear loading state
            Plotly.newPlot('plotlyContainer', [trace], layout, { responsive: true, displayModeBar: false });

            // Interaction support: Click on a node to go to the figure
            document.getElementById('plotlyContainer').on('plotly_click', function (data) {
                if (data.points && data.points.length > 0) {
                    const pt = data.points[0];
                    // Very brittle text matching. Alternative is to stash IDs in customdata
                    const figNameMatch = pt.text.match(/<b>(.*?)<\/b>/);
                    if (figNameMatch && figNameMatch[1]) {
                        const figName = figNameMatch[1];
                        const figObj = validFigures.find(f => escapeHTML(f.name) === figName || f.name === figName);
                        if (figObj) {
                            app.selectTarget(figObj.id);
                        }
                    }
                }
            });
        } else {
            document.getElementById('plotlyContainer').innerHTML = '<div style="padding:3rem; text-align:center; color:var(--warning);">Plotly.js failed to load. Please check connection.</div>';
        }
    } catch (e) {
        console.error('Failed to render 3D explorer:', e);
        document.getElementById('plotlyContainer').innerHTML = '<div style="padding:3rem; text-align:center; color:var(--danger);">Visualization module offline.</div>';
    }
};
