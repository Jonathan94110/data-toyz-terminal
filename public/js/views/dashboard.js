// views/dashboard.js — My Intel History (with search, pagination, deep-links)

TerminalApp.prototype.dashboardPage = 1;
TerminalApp.prototype.dashboardQuery = '';

TerminalApp.prototype.renderDashboard = async function (container) {
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

    // Wire up Enter key on search
    const searchInput = document.getElementById('dashSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') app.dashboardSearch();
        });
    }
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
