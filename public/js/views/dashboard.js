// views/dashboard.js — My Intel History (with search, pagination, deep-links)

TerminalApp.prototype.dashboardPage = 1;
TerminalApp.prototype.dashboardQuery = '';

TerminalApp.prototype.renderDashboard = async function(container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

    const page = this.dashboardPage || 1;
    const q = this.dashboardQuery || '';
    const qParam = q ? `&q=${encodeURIComponent(q)}` : '';

    let data = { rows: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    try {
        const res = await fetch(`${API_URL}/submissions/user/${this.user.username}?page=${page}&limit=20${qParam}`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error("Failed historical log", e);
    }

    const userSubs = data.rows;

    // --- Search bar ---
    let searchHtml = `
        <div class="dash-search-bar">
            <input type="text" id="dashSearchInput" placeholder="Search by target name..." value="${escapeHTML(q)}"
                class="dash-search-input" />
            <button class="dash-search-btn" onclick="app.dashboardSearch()">Search</button>
            ${q ? '<button class="dash-search-clear" onclick="app.dashboardClearSearch()">Clear</button>' : ''}
        </div>
    `;

    // --- Table ---
    let tableHtml = '<div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">';

    if (userSubs.length === 0) {
        const msg = q ? `No results matching "${escapeHTML(q)}".` : 'No intelligence logs securely committed yet.';
        tableHtml += `<div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 1.1rem;">${msg}</div>`;
    } else {
        tableHtml += `
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
        tableHtml += userSubs.map(s => {
            const d = new Date(s.date).toLocaleDateString();
            const tier = s.targetTier ? s.targetTier : "Unknown";
            const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
            return `
                <tr>
                    <td style="color:var(--text-secondary); font-size:0.9rem;">${d}${s.editedAt ? ' <span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">(edited)</span>' : ''}</td>
                    <td style="font-weight:600;">
                        <span class="tier-badge ${escapeHTML(tier).toLowerCase()}" style="margin-right:0.5rem; font-size:0.6rem;">${escapeHTML(tier)}</span>
                        <a href="#scorecard/${s.id}" class="dash-target-link" onclick="event.preventDefault(); app.viewScorecard(${s.id}, ${s.targetId})">
                            ${escapeHTML(s.targetName)}
                        </a>
                    </td>
                    <td><span style="color:var(--accent); font-weight:700;">${grade}</span></td>
                    <td style="text-align: right; white-space:nowrap;">
                        <button class="badge dash-action-btn accent" onclick="app.viewScorecard(${s.id}, ${s.targetId})" title="View scorecard">📄</button>
                        <button class="badge dash-action-btn accent" onclick="app.editSubmission(${s.id}, ${s.targetId})" title="Edit">✏️</button>
                        <button class="badge dash-action-btn danger" onclick="app.deleteSubmission(${s.id})" title="Retract">Retract</button>
                    </td>
                </tr>
            `;
        }).join('');
        tableHtml += '</tbody></table>';
    }
    tableHtml += '</div>';

    // --- Pagination ---
    let paginationHtml = '';
    if (data.totalPages > 1) {
        paginationHtml = '<div class="dash-pagination">';
        if (page > 1) {
            paginationHtml += `<button class="dash-page-btn" onclick="app.dashboardGoPage(${page - 1})">← Prev</button>`;
        }
        paginationHtml += `<span class="dash-page-info">Page ${page} of ${data.totalPages} &middot; ${data.total} total</span>`;
        if (page < data.totalPages) {
            paginationHtml += `<button class="dash-page-btn" onclick="app.dashboardGoPage(${page + 1})">Next →</button>`;
        }
        paginationHtml += '</div>';
    } else if (data.total > 0) {
        paginationHtml = `<div class="dash-pagination"><span class="dash-page-info">${data.total} record${data.total === 1 ? '' : 's'}</span></div>`;
    }

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="margin-bottom:2rem;">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Intelligence Log</h2>
                <p style="color:var(--text-secondary); font-size:1.1rem;">Manage your active user data submissions.</p>
            </div>
            ${searchHtml}
            ${tableHtml}
            ${paginationHtml}
        </div>
    `;

    // Wire up Enter key on search
    const searchInput = document.getElementById('dashSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') app.dashboardSearch();
        });
    }
};

// --- Dashboard search helpers ---
TerminalApp.prototype.dashboardSearch = function() {
    const input = document.getElementById('dashSearchInput');
    this.dashboardQuery = input ? input.value.trim() : '';
    this.dashboardPage = 1;
    this.render();
};

TerminalApp.prototype.dashboardClearSearch = function() {
    this.dashboardQuery = '';
    this.dashboardPage = 1;
    this.render();
};

TerminalApp.prototype.dashboardGoPage = function(p) {
    this.dashboardPage = p;
    this.render();
};

// --- Scorecard deep-link viewer ---
TerminalApp.prototype.viewScorecard = async function(submissionId, targetId) {
    // Navigate to the figure's pulse view and highlight the specific scorecard
    this.pendingScorecard = submissionId;
    this.selectTarget(targetId);
};
