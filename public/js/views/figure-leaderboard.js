// views/figure-leaderboard.js — Figure Leaderboard (Top Rated, Rising, Most Reviewed, Sleepers)

TerminalApp.prototype.renderFigureLeaderboard = async function (container) {
    const self = this;
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 6)}</div>`;

    const mode = sessionStorage.getItem('flb_mode') || 'top_rated';
    const brand = sessionStorage.getItem('flb_brand') || '';
    const page = parseInt(sessionStorage.getItem('flb_page') || '1') || 1;

    let data = { figures: [], total: 0, page: 1, pageSize: 25, brands: [] };
    try {
        const params = new URLSearchParams({ mode, page, limit: 25, category: getActiveCategory() });
        if (brand) params.set('brand', brand);
        const res = await fetch(`${API_URL}/figures/leaderboard?${params}`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error('Failed fetching figure leaderboard', e);
    }

    const figures = data.figures || [];
    const totalPages = Math.ceil((data.total || 0) / (data.pageSize || 25));
    const allBrands = data.brands || [];

    const modes = [
        { key: 'top_rated', label: 'Top Rated', desc: 'Highest scoring figures by community grade' },
        { key: 'rising', label: 'Rising', desc: 'Biggest price gains in the last 30 days' },
        { key: 'most_reviewed', label: 'Most Reviewed', desc: 'Figures with the most intel submissions' },
        { key: 'sleepers', label: 'Sleeper Picks', desc: 'Under-reviewed gems with high grades' }
    ];

    const currentMode = modes.find(m => m.key === mode) || modes[0];

    // --- Helper functions ---
    function getTierBadge(grade) {
        if (grade >= 90) return { label: 'S-TIER', color: '#a855f7' };
        if (grade >= 80) return { label: 'A-TIER', color: '#22c55e' };
        if (grade >= 70) return { label: 'B-TIER', color: '#3b82f6' };
        if (grade >= 60) return { label: 'C-TIER', color: '#f59e0b' };
        if (grade >= 50) return { label: 'D-TIER', color: '#ef4444' };
        return { label: 'F-TIER', color: '#6b7280' };
    }

    function gradeColor(g) {
        if (g >= 90) return '#a855f7';
        if (g >= 80) return '#22c55e';
        if (g >= 70) return '#3b82f6';
        if (g >= 60) return '#f59e0b';
        return '#ef4444';
    }

    function trendArrow(dir) {
        if (dir === 'up') return '<span class="flb-trend-up">&#9650;</span>';
        if (dir === 'down') return '<span class="flb-trend-down">&#9660;</span>';
        return '<span class="flb-trend-flat">&#8212;</span>';
    }

    function msrpDiffBadge(diff) {
        if (diff === null || diff === undefined) return '<span style="color:var(--text-muted);">—</span>';
        const sign = diff >= 0 ? '+' : '';
        const cls = diff >= 0 ? 'flb-msrp-positive' : 'flb-msrp-negative';
        return `<span class="${cls}">${sign}${Math.round(diff)}%</span>`;
    }

    function formatPrice(p) {
        if (p === null || p === undefined) return '—';
        return '$' + Number(p).toFixed(0);
    }

    function renderModeTabs() {
        return `<div class="flb-mode-tabs">${modes.map(m =>
            `<button class="flb-mode-tab ${m.key === mode ? 'active' : ''}" data-mode="${m.key}">${m.label}</button>`
        ).join('')}</div>`;
    }

    function wireModeTabs(cont) {
        cont.querySelectorAll('.flb-mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                sessionStorage.setItem('flb_mode', tab.dataset.mode);
                sessionStorage.setItem('flb_page', '1');
                self.renderFigureLeaderboard(cont);
            });
        });
    }

    // --- Empty state ---
    if (figures.length === 0 && page === 1) {
        container.innerHTML = `
            <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:1.5rem; text-align:center;">
                    <h2 style="font-size:2rem; text-transform:uppercase; letter-spacing:0.03em;">Leaderboard</h2>
                    <p style="color:var(--text-secondary); font-size:0.95rem;">${escapeHTML(currentMode.desc)}</p>
                </div>
                ${renderModeTabs()}
                <div class="empty-state" style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); margin-top:1.5rem;">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                    <div class="empty-state-title">No ranked figures yet</div>
                    <div class="empty-state-desc">Figures need at least one intel submission to appear on the leaderboard.</div>
                </div>
            </div>
        `;
        wireModeTabs(container);
        return;
    }

    // --- Podium (top 3 — only on page 1) ---
    const top3 = page === 1 ? figures.slice(0, 3) : [];
    const rest = page === 1 ? figures.slice(3) : figures;

    const podiumMedals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const podiumColors = ['#fbbf24', '#94a3b8', '#cd7f32'];
    const podiumGlows = ['rgba(251,191,36,0.25)', 'rgba(148,163,184,0.2)', 'rgba(205,127,50,0.2)'];

    let podiumHtml = '';
    if (top3.length > 0) {
        podiumHtml = '<div class="lb-podium">';
        const podiumOrder = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0];
        podiumOrder.forEach(idx => {
            if (idx >= top3.length) return;
            const fig = top3[idx];
            const tier = getTierBadge(fig.avgGrade || 0);
            const isFirst = idx === 0;
            podiumHtml += `
                <div class="lb-podium-card ${isFirst ? 'first' : ''}" style="border-color:${podiumColors[idx]}; box-shadow: 0 0 20px ${podiumGlows[idx]}; cursor:pointer;" onclick="app.selectTarget(${fig.id})">
                    <div class="lb-podium-medal">${podiumMedals[idx]}</div>
                    <div class="lb-podium-avatar" style="border-color:${podiumColors[idx]}; font-size:0.9rem;">${escapeHTML(fig.name).charAt(0).toUpperCase()}</div>
                    <div class="lb-podium-name" style="font-size:0.85rem;">${escapeHTML(fig.name)}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.25rem;">${escapeHTML(fig.brand || '')}</div>
                    <div style="font-size:1.5rem; font-weight:800; color:${gradeColor(fig.avgGrade || 0)};">${fig.avgGrade !== null ? Math.round(fig.avgGrade) : '—'}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${fig.submissions || 0} reviews</div>
                    <div style="font-size:0.7rem; color:#10b981; font-weight:600;">${fig.uniqueOwnerCount || 0} owners</div>
                    <span class="badge" style="background:transparent; border-color:${tier.color}; color:${tier.color}; font-size:0.65rem; margin-top:0.25rem;">${tier.label}</span>
                    ${fig.pinned ? '<span class="flb-pinned-badge">\u{1F4CC}</span>' : ''}
                </div>
            `;
        });
        podiumHtml += '</div>';
    }

    // --- Table rows ---
    let tableHtml = '';
    if (rest.length > 0) {
        tableHtml = `
            <div class="flb-table">
                <div class="flb-table-header">
                    <span class="flb-col-rank">#</span>
                    <span class="flb-col-name">Figure</span>
                    <span class="flb-col-brand">Brand</span>
                    <span class="flb-col-grade">Grade</span>
                    <span class="flb-col-reviews">Reviews</span>
                    <span class="flb-col-pop">Pop</span>
                    <span class="flb-col-price">Last Price</span>
                    <span class="flb-col-msrp">vs MSRP</span>
                    <span class="flb-col-trend">30d</span>
                </div>
        `;
        rest.forEach(fig => {
            const tier = getTierBadge(fig.avgGrade || 0);
            tableHtml += `
                <div class="flb-row" onclick="app.selectTarget(${fig.id})">
                    <span class="flb-col-rank">${fig.pinned ? '<span class="flb-pinned-badge" title="Pinned">\u{1F4CC}</span>' : fig.rank}</span>
                    <span class="flb-col-name">
                        <span class="flb-fig-name">${escapeHTML(fig.name)}</span>
                        ${fig.classTie ? `<span class="flb-fig-class">${escapeHTML(fig.classTie)}</span>` : ''}
                    </span>
                    <span class="flb-col-brand"><span class="badge" style="font-size:0.65rem;">${escapeHTML(fig.brand || '—')}</span></span>
                    <span class="flb-col-grade" style="color:${gradeColor(fig.avgGrade || 0)}; font-weight:700;">${fig.avgGrade !== null ? Math.round(fig.avgGrade) : '—'}</span>
                    <span class="flb-col-reviews">${fig.submissions || 0}</span>
                    <span class="flb-col-pop">${fig.uniqueOwnerCount || 0}</span>
                    <span class="flb-col-price">${formatPrice(fig.latestPrice)}</span>
                    <span class="flb-col-msrp">${msrpDiffBadge(fig.msrpDiff)}</span>
                    <span class="flb-col-trend">${trendArrow(fig.trendDirection)}</span>
                </div>
            `;
        });
        tableHtml += '</div>';
    }

    // --- Pagination ---
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = '<div class="flb-pagination">';
        if (page > 1) paginationHtml += `<button class="flb-page-btn" data-page="${page - 1}">&laquo; Prev</button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (i === page) {
                paginationHtml += `<span class="flb-page-btn active">${i}</span>`;
            } else if (i <= 3 || i >= totalPages - 1 || Math.abs(i - page) <= 1) {
                paginationHtml += `<button class="flb-page-btn" data-page="${i}">${i}</button>`;
            } else if (i === 4 && page > 5) {
                paginationHtml += '<span class="flb-page-ellipsis">...</span>';
            } else if (i === totalPages - 2 && page < totalPages - 4) {
                paginationHtml += '<span class="flb-page-ellipsis">...</span>';
            }
        }
        if (page < totalPages) paginationHtml += `<button class="flb-page-btn" data-page="${page + 1}">Next &raquo;</button>`;
        paginationHtml += '</div>';
    }

    // --- Brand filter ---
    let brandFilterHtml = '';
    if (allBrands.length > 0) {
        brandFilterHtml = `
            <div class="flb-brand-filter">
                <select id="flbBrandSelect">
                    <option value="">All Brands</option>
                    ${allBrands.map(b => `<option value="${escapeHTML(b)}" ${b === brand ? 'selected' : ''}>${escapeHTML(b)}</option>`).join('')}
                </select>
            </div>
        `;
    }

    // --- Render ---
    container.innerHTML = `
        <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="margin-bottom:1.5rem; text-align:center;">
                <h2 style="font-size:2rem; text-transform:uppercase; letter-spacing:0.03em;">Leaderboard</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">${escapeHTML(currentMode.desc)}</p>
            </div>

            <div class="flb-controls">
                ${renderModeTabs()}
                ${brandFilterHtml}
            </div>

            ${podiumHtml}
            ${tableHtml}
            ${paginationHtml}
        </div>
    `;

    // --- Wire up events ---
    wireModeTabs(container);

    const brandSelect = document.getElementById('flbBrandSelect');
    if (brandSelect) {
        brandSelect.addEventListener('change', () => {
            sessionStorage.setItem('flb_brand', brandSelect.value);
            sessionStorage.setItem('flb_page', '1');
            self.renderFigureLeaderboard(container);
        });
    }

    container.querySelectorAll('.flb-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            sessionStorage.setItem('flb_page', btn.dataset.page);
            self.renderFigureLeaderboard(container);
        });
    });
};
