// views/trade-advisor.js — Trade Advisor analysis tool (Market Pulse tab)

TerminalApp.prototype._tradeState = { yourSide: [], theirSide: [] };

TerminalApp.prototype.renderTradeAdvisor = function(container) {
    const state = this._tradeState;

    const renderCards = (side) => {
        const figures = state[side];
        if (figures.length === 0) {
            return '<div class="ta-empty-hint">No figures added yet</div>';
        }
        return figures.map(f => `
            <div class="ta-figure-card" data-side="${side}" data-id="${f.id}">
                <div class="ta-card-info">
                    <div class="ta-card-name">${escapeHTML(f.name)}</div>
                    <div class="ta-card-meta">${escapeHTML(f.brand || '')} · ${escapeHTML(f.classTie || '')}${f.msrp ? ' · MSRP $' + parseFloat(f.msrp).toFixed(0) : ''}</div>
                </div>
                <button class="ta-card-remove" title="Remove">&times;</button>
            </div>
        `).join('');
    };

    container.innerHTML = `
        <div class="ta-container">
            <div class="ta-intro">
                <h3 class="ta-title">⚖️ Trade Advisor</h3>
                <p class="ta-subtitle">Add figures to each side of the trade, then analyze to get a data-driven verdict.</p>
            </div>

            <div class="ta-sides">
                <!-- YOUR SIDE -->
                <div class="ta-side">
                    <div class="ta-side-label">YOUR SIDE <span class="ta-side-hint">(figures you give away)</span></div>
                    <div class="ta-search-wrap" style="position:relative;">
                        <input type="text" id="taInputYour" class="ta-search-input" placeholder="Search figure to add..." autocomplete="off">
                        <div id="taDropYour" class="ta-search-dropdown" style="display:none;"></div>
                    </div>
                    <div class="ta-card-list" id="taCardsYour">${renderCards('yourSide')}</div>
                    <div class="ta-side-summary" id="taSummaryYour">
                        ${state.yourSide.length > 0 ? '' : '<span class="ta-side-count">0 figures</span>'}
                    </div>
                </div>

                <!-- THEIR SIDE -->
                <div class="ta-side">
                    <div class="ta-side-label">THEIR SIDE <span class="ta-side-hint">(figures you receive)</span></div>
                    <div class="ta-search-wrap" style="position:relative;">
                        <input type="text" id="taInputTheir" class="ta-search-input" placeholder="Search figure to add..." autocomplete="off">
                        <div id="taDropTheir" class="ta-search-dropdown" style="display:none;"></div>
                    </div>
                    <div class="ta-card-list" id="taCardsTheir">${renderCards('theirSide')}</div>
                    <div class="ta-side-summary" id="taSummaryTheir">
                        ${state.theirSide.length > 0 ? '' : '<span class="ta-side-count">0 figures</span>'}
                    </div>
                </div>
            </div>

            <div class="ta-actions">
                <button class="btn-primary ta-analyze-btn" id="taAnalyzeBtn" ${(state.yourSide.length === 0 || state.theirSide.length === 0) ? 'disabled' : ''}>⚖️ Analyze Trade</button>
                <button class="btn-sm ta-swap-btn" id="taSwapBtn" title="Swap sides">↔ Swap</button>
                <button class="btn-sm ta-clear-btn" id="taClearBtn">Clear</button>
            </div>

            <div id="taResults"></div>
        </div>
    `;

    // Setup autocomplete for both sides
    this._setupTradeAutocomplete('taInputYour', 'taDropYour', 'yourSide');
    this._setupTradeAutocomplete('taInputTheir', 'taDropTheir', 'theirSide');

    // Bind remove buttons
    this._bindTradeCardEvents(container);

    // Action buttons
    document.getElementById('taAnalyzeBtn').addEventListener('click', () => this.analyzeTrade());
    document.getElementById('taSwapBtn').addEventListener('click', () => this.swapTradeSides());
    document.getElementById('taClearBtn').addEventListener('click', () => this.clearTrade());

    // Update summaries
    this._updateTradeSummaries();
};

// ── Autocomplete (adapted from compare pattern) ──────────

TerminalApp.prototype._setupTradeAutocomplete = function(inputId, dropId, side) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropId);
    if (!input || !dropdown) return;

    const state = this._tradeState;
    let selectedIdx = -1;

    const showMatches = () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { dropdown.style.display = 'none'; return; }

        // Filter out figures already in either side
        const usedIds = new Set([...state.yourSide, ...state.theirSide].map(f => f.id));
        const matches = MOCK_FIGURES
            .filter(f => f.name.toLowerCase().includes(q) && !usedIds.has(f.id))
            .slice(0, 8);

        if (matches.length === 0) { dropdown.style.display = 'none'; return; }

        selectedIdx = -1;
        dropdown.innerHTML = matches.map(f =>
            `<div class="ta-ac-item" data-id="${f.id}">
                <span class="ta-ac-name">${escapeHTML(f.name)}</span>
                <span class="ta-ac-brand">${escapeHTML(f.brand || '')} ${escapeHTML(f.classTie || '')}</span>
            </div>`
        ).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.ta-ac-item').forEach(item => {
            item.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                const fig = MOCK_FIGURES.find(f => f.id == item.dataset.id);
                if (fig) this.addTradeItem(side, fig);
                input.value = '';
                dropdown.style.display = 'none';
            });
        });
    };

    input.addEventListener('input', showMatches);
    input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') return;
        const items = dropdown.querySelectorAll('.ta-ac-item');
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
            const fig = MOCK_FIGURES.find(f => f.id == items[selectedIdx].dataset.id);
            if (fig) this.addTradeItem(side, fig);
            input.value = '';
            dropdown.style.display = 'none';
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
    input.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); });
};

// ── State management ─────────────────────────────────────

TerminalApp.prototype.addTradeItem = function(side, figure) {
    const state = this._tradeState;
    if (state[side].length >= 5) return; // max 5 per side
    if (state[side].find(f => f.id === figure.id)) return; // no dupes

    state[side].push(figure);
    this._rerenderTradeCards(side);
    this._updateTradeSummaries();
    this._updateAnalyzeButton();

    // Clear results when trade changes
    const results = document.getElementById('taResults');
    if (results) results.innerHTML = '';
};

TerminalApp.prototype.removeTradeItem = function(side, figureId) {
    const state = this._tradeState;
    state[side] = state[side].filter(f => f.id !== figureId);
    this._rerenderTradeCards(side);
    this._updateTradeSummaries();
    this._updateAnalyzeButton();

    const results = document.getElementById('taResults');
    if (results) results.innerHTML = '';
};

TerminalApp.prototype.swapTradeSides = function() {
    const state = this._tradeState;
    const temp = state.yourSide;
    state.yourSide = state.theirSide;
    state.theirSide = temp;

    this._rerenderTradeCards('yourSide');
    this._rerenderTradeCards('theirSide');
    this._updateTradeSummaries();

    const results = document.getElementById('taResults');
    if (results) results.innerHTML = '';
};

TerminalApp.prototype.clearTrade = function() {
    this._tradeState = { yourSide: [], theirSide: [] };
    this._rerenderTradeCards('yourSide');
    this._rerenderTradeCards('theirSide');
    this._updateTradeSummaries();
    this._updateAnalyzeButton();

    const results = document.getElementById('taResults');
    if (results) results.innerHTML = '';
};

TerminalApp.prototype._rerenderTradeCards = function(side) {
    const containerId = side === 'yourSide' ? 'taCardsYour' : 'taCardsTheir';
    const el = document.getElementById(containerId);
    if (!el) return;

    const figures = this._tradeState[side];
    if (figures.length === 0) {
        el.innerHTML = '<div class="ta-empty-hint">No figures added yet</div>';
    } else {
        el.innerHTML = figures.map(f => `
            <div class="ta-figure-card" data-side="${side}" data-id="${f.id}">
                <div class="ta-card-info">
                    <div class="ta-card-name">${escapeHTML(f.name)}</div>
                    <div class="ta-card-meta">${escapeHTML(f.brand || '')} · ${escapeHTML(f.classTie || '')}${f.msrp ? ' · MSRP $' + parseFloat(f.msrp).toFixed(0) : ''}</div>
                </div>
                <button class="ta-card-remove" title="Remove">&times;</button>
            </div>
        `).join('');
    }
    this._bindTradeCardEvents(el);
};

TerminalApp.prototype._bindTradeCardEvents = function(container) {
    container.querySelectorAll('.ta-card-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.ta-figure-card');
            if (card) {
                this.removeTradeItem(card.dataset.side, parseInt(card.dataset.id));
            }
        });
    });
};

TerminalApp.prototype._updateTradeSummaries = function() {
    const state = this._tradeState;

    ['yourSide', 'theirSide'].forEach(side => {
        const summaryId = side === 'yourSide' ? 'taSummaryYour' : 'taSummaryTheir';
        const el = document.getElementById(summaryId);
        if (!el) return;

        const figs = state[side];
        if (figs.length === 0) {
            el.innerHTML = '<span class="ta-side-count">0 figures</span>';
        } else {
            const msrpTotal = figs.reduce((s, f) => s + (f.msrp ? parseFloat(f.msrp) : 0), 0);
            el.innerHTML = `<span class="ta-side-count">${figs.length} figure${figs.length > 1 ? 's' : ''}</span>` +
                (msrpTotal > 0 ? ` · <span class="ta-side-msrp">MSRP Total: $${msrpTotal.toFixed(0)}</span>` : '');
        }
    });
};

TerminalApp.prototype._updateAnalyzeButton = function() {
    const btn = document.getElementById('taAnalyzeBtn');
    if (!btn) return;
    const state = this._tradeState;
    btn.disabled = state.yourSide.length === 0 || state.theirSide.length === 0;
};

// ── Analysis ─────────────────────────────────────────────

TerminalApp.prototype.analyzeTrade = async function() {
    const state = this._tradeState;
    if (state.yourSide.length === 0 || state.theirSide.length === 0) return;

    const resultsEl = document.getElementById('taResults');
    if (!resultsEl) return;

    // Show loading
    resultsEl.innerHTML = `
        <div class="ta-loading">
            <div class="ta-loading-spinner"></div>
            <div>Analyzing trade data...</div>
        </div>
    `;

    try {
        const res = await fetch(`${API_URL}/trade-advisor/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                yourSide: state.yourSide.map(f => f.id),
                theirSide: state.theirSide.map(f => f.id)
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Analysis failed');
        }

        const data = await res.json();
        this._renderTradeResults(resultsEl, data);
    } catch (err) {
        resultsEl.innerHTML = `<div class="ta-error">⚠️ ${escapeHTML(err.message)}</div>`;
    }
};

TerminalApp.prototype._renderTradeResults = function(container, data) {
    const verdictColorMap = {
        accept: '#10b981',
        fair: '#3b82f6',
        unbalanced: '#f59e0b',
        sweetener: '#ff8e3c',
        pass: '#ef4444'
    };

    // Handle "Fair Trade, High Risk" etc
    const baseCode = data.verdictCode.replace(/, High Risk$/, '');
    const color = verdictColorMap[baseCode] || '#f59e0b';

    const verdictEmoji = {
        accept: '✅', fair: '🤝', unbalanced: '⚠️', sweetener: '🍬', pass: '🚫'
    };
    const emoji = verdictEmoji[baseCode] || '⚖️';

    const fmtPrice = (v) => v != null ? '$' + parseFloat(v).toFixed(2) : '—';
    const fmtStar = (v) => v != null ? '★ ' + parseFloat(v).toFixed(1) : '—';
    const fmtPct = (v) => v != null ? (v > 0 ? '+' : '') + parseFloat(v).toFixed(1) + '%' : '—';
    const fmtTrend = (t) => t === 'rising' ? '📈 Rising' : t === 'falling' ? '📉 Falling' : '➡️ Stable';

    const confidenceBadge = (c) => {
        const colors = { high: '#10b981', medium: '#f59e0b', low: '#ef4444' };
        return `<span class="ta-confidence-badge" style="color:${colors[c] || '#f59e0b'}">${(c || 'unknown').toUpperCase()}</span>`;
    };

    const renderFigureRow = (f) => `
        <div class="ta-result-figure">
            <div class="ta-rf-name">${escapeHTML(f.name)}</div>
            <div class="ta-rf-stats">
                <span>${fmtPrice(f.marketPrice)}</span>
                <span>${fmtStar(f.tradeRating || (f.overallAvg ? (f.overallAvg / 20) : null))}</span>
                <span>TVI: ${f.tvi}</span>
                <span>${fmtTrend(f.trend)}</span>
                <span>${f.reviews} review${f.reviews !== 1 ? 's' : ''}</span>
                <span class="ta-rf-confidence">${confidenceBadge(f.confidence)}</span>
            </div>
            ${f.priceSource === 'default' ? '<div class="ta-rf-warning">⚠️ No price data</div>' : ''}
            ${f.priceSource === 'msrp' ? '<div class="ta-rf-note">Using MSRP (no sales data)</div>' : ''}
        </div>
    `;

    // Verdict explanation
    let explanation = '';
    const bd = data.breakdown;
    if (bd.dollarDeltaPct > 10) {
        explanation = 'Their side holds more market value, making this favorable for you.';
    } else if (bd.dollarDeltaPct < -10) {
        explanation = 'Your side holds more market value — you may be giving up too much.';
    } else {
        explanation = 'Both sides are close in market value.';
    }
    if (data.qualityImbalance) {
        explanation += ' However, there\'s a significant quality gap between the sides.';
    }
    if (bd.tviDelta > 5) {
        explanation += ' Their figures have stronger overall trade metrics (quality + momentum + community).';
    } else if (bd.tviDelta < -5) {
        explanation += ' Your figures have stronger overall trade metrics.';
    }

    container.innerHTML = `
        <!-- Verdict Banner -->
        <div class="ta-verdict-banner" style="--verdict-color: ${color};">
            <div class="ta-verdict-emoji">${emoji}</div>
            <div class="ta-verdict-text">
                <div class="ta-verdict-label">${escapeHTML(data.verdict)}</div>
                <div class="ta-verdict-explain">${explanation}</div>
            </div>
            <div class="ta-verdict-confidence">Data Confidence: ${confidenceBadge(data.confidence)}</div>
        </div>

        ${data.warnings.length > 0 ? `
            <div class="ta-warnings">
                ${data.warnings.map(w => `<div class="ta-warning">⚠️ ${escapeHTML(w)}</div>`).join('')}
            </div>
        ` : ''}

        <!-- Side-by-Side Breakdown -->
        <div class="ta-breakdown">
            <div class="ta-breakdown-side">
                <div class="ta-breakdown-header">YOUR SIDE</div>
                <div class="ta-breakdown-stats">
                    <div class="ta-stat"><span class="ta-stat-label">Total Value</span><span class="ta-stat-value">${fmtPrice(data.yourSide.totalValue)}</span></div>
                    <div class="ta-stat"><span class="ta-stat-label">Avg Rating</span><span class="ta-stat-value">${fmtStar(data.yourSide.avgRating)}</span></div>
                    <div class="ta-stat"><span class="ta-stat-label">Avg TVI</span><span class="ta-stat-value">${data.yourSide.avgTvi}</span></div>
                </div>
                <div class="ta-breakdown-figures">
                    ${data.yourSide.figures.map(renderFigureRow).join('')}
                </div>
            </div>

            <div class="ta-breakdown-divider">
                <div class="ta-vs">VS</div>
            </div>

            <div class="ta-breakdown-side">
                <div class="ta-breakdown-header">THEIR SIDE</div>
                <div class="ta-breakdown-stats">
                    <div class="ta-stat"><span class="ta-stat-label">Total Value</span><span class="ta-stat-value">${fmtPrice(data.theirSide.totalValue)}</span></div>
                    <div class="ta-stat"><span class="ta-stat-label">Avg Rating</span><span class="ta-stat-value">${fmtStar(data.theirSide.avgRating)}</span></div>
                    <div class="ta-stat"><span class="ta-stat-label">Avg TVI</span><span class="ta-stat-value">${data.theirSide.avgTvi}</span></div>
                </div>
                <div class="ta-breakdown-figures">
                    ${data.theirSide.figures.map(renderFigureRow).join('')}
                </div>
            </div>
        </div>

        <!-- Delta Summary -->
        <div class="ta-delta-summary">
            <div class="ta-delta-row">
                <span class="ta-delta-label">Dollar Delta</span>
                <span class="ta-delta-value" style="color:${bd.dollarDelta >= 0 ? '#10b981' : '#ef4444'}">${bd.dollarDelta >= 0 ? '+' : ''}$${Math.abs(bd.dollarDelta).toFixed(2)} (${fmtPct(bd.dollarDeltaPct)})</span>
                <span class="ta-delta-note">${bd.dollarDelta >= 0 ? 'Their side higher' : 'Your side higher'}</span>
            </div>
            <div class="ta-delta-row">
                <span class="ta-delta-label">TVI Delta</span>
                <span class="ta-delta-value" style="color:${bd.tviDelta >= 0 ? '#10b981' : '#ef4444'}">${bd.tviDelta >= 0 ? '+' : ''}${bd.tviDelta}</span>
                <span class="ta-delta-note">${bd.tviDelta >= 0 ? 'Their metrics stronger' : 'Your metrics stronger'}</span>
            </div>
            <div class="ta-delta-row">
                <span class="ta-delta-label">Quality Delta</span>
                <span class="ta-delta-value">${bd.qualityDelta >= 0 ? '+' : ''}${bd.qualityDelta} ★</span>
                <span class="ta-delta-note">${data.qualityImbalance ? '⚠️ Imbalance detected' : 'Balanced'}</span>
            </div>
            <div class="ta-delta-row ta-delta-blended">
                <span class="ta-delta-label">Blended Score</span>
                <span class="ta-delta-value" style="color:${color}">${bd.blendedScore >= 0 ? '+' : ''}${bd.blendedScore}</span>
                <span class="ta-delta-note">60% dollar + 40% TVI weighted</span>
            </div>
        </div>
    `;
};
