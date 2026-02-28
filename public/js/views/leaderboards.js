// views/leaderboards.js — Global Leaderboard (redesigned)

TerminalApp.prototype.renderLeaderboards = async function (container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

    let allSubs = [];
    try {
        const res = await fetch(`${API_URL}/submissions`);
        if (res.ok) allSubs = await res.json();
    } catch (e) {
        console.error("Failed fetching global logs", e);
    }

    const authorCounts = {};
    allSubs.forEach(s => {
        authorCounts[s.author] = (authorCounts[s.author] || 0) + 1;
    });

    const sortedAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]);
    const isAdmin = this.user.role === 'admin' || this.user.username === 'Prime Dynamixx';

    function getTitle(count) {
        if (count >= 15) return { title: 'Prime Intel Officer', color: '#a855f7' };
        if (count >= 10) return { title: 'Senior Field Evaluator', color: 'var(--neutral)' };
        if (count >= 5) return { title: 'Field Evaluator', color: 'var(--success)' };
        if (count >= 2) return { title: 'Junior Analyst', color: 'var(--accent)' };
        return { title: 'Rookie Analyst', color: 'var(--text-muted)' };
    }

    // Find current user's rank
    const myRankIdx = sortedAuthors.findIndex(a => a[0] === this.user.username);
    const myCount = myRankIdx >= 0 ? sortedAuthors[myRankIdx][1] : 0;
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : '—';
    const myTitleInfo = getTitle(myCount);

    // Next title progress
    let nextTitle = '';
    let nextThreshold = 0;
    let progressPct = 0;
    if (myCount < 2) { nextTitle = 'Junior Analyst'; nextThreshold = 2; progressPct = (myCount / 2) * 100; }
    else if (myCount < 5) { nextTitle = 'Field Evaluator'; nextThreshold = 5; progressPct = (myCount / 5) * 100; }
    else if (myCount < 10) { nextTitle = 'Senior Field Evaluator'; nextThreshold = 10; progressPct = (myCount / 10) * 100; }
    else if (myCount < 15) { nextTitle = 'Prime Intel Officer'; nextThreshold = 15; progressPct = (myCount / 15) * 100; }
    else { nextTitle = ''; progressPct = 100; }

    if (sortedAuthors.length === 0) {
        container.innerHTML = `
            <div style="max-width: 960px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:1.5rem; text-align:center;">
                    <h2 style="font-size:2rem; text-transform:uppercase; letter-spacing:0.03em;">Top Analysts</h2>
                    <p style="color:var(--text-secondary); font-size:0.95rem;">Global user ranking by total intelligence contributions.</p>
                </div>
                <div class="empty-state" style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md);">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                    <div class="empty-state-title">No analysts yet</div>
                    <div class="empty-state-desc">Be the first to submit an intelligence report and claim the top spot.</div>
                </div>
            </div>
        `;
        return;
    }

    // Build podium (top 3)
    const podiumMedals = ['🥇', '🥈', '🥉'];
    const podiumColors = ['#fbbf24', '#94a3b8', '#cd7f32'];
    const podiumGlows = ['rgba(251,191,36,0.25)', 'rgba(148,163,184,0.2)', 'rgba(205,127,50,0.2)'];
    const top3 = sortedAuthors.slice(0, 3);

    let podiumHtml = '<div class="lb-podium">';
    // Display in order: 2nd, 1st, 3rd (visual podium)
    const podiumOrder = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0];
    podiumOrder.forEach(idx => {
        if (idx >= top3.length) return;
        const [name, count] = top3[idx];
        const titleInfo = getTitle(count);
        const isMe = name === this.user.username;
        const isFirst = idx === 0;
        podiumHtml += `
            <div class="lb-podium-card ${isFirst ? 'first' : ''}" style="border-color:${podiumColors[idx]}; box-shadow: 0 0 20px ${podiumGlows[idx]};">
                <div class="lb-podium-medal">${podiumMedals[idx]}</div>
                <div class="lb-podium-avatar" style="border-color:${podiumColors[idx]};">${escapeHTML(name).charAt(0).toUpperCase()}</div>
                <div class="lb-podium-name">${escapeHTML(name)} ${isMe ? '<span style="font-size:0.7rem; color:var(--text-muted);">(You)</span>' : ''}</div>
                <div class="lb-podium-count">${count} <span style="font-size:0.75rem; color:var(--text-muted);">scans</span></div>
                <span class="badge" style="background:transparent; border-color:${titleInfo.color}; color:${titleInfo.color}; font-size:0.7rem;">${titleInfo.title}</span>
                ${isAdmin ? `<button class="lb-admin-btn" data-username="${escapeHTML(name)}" title="Remove from leaderboard" onclick="event.stopPropagation();">🗑️</button>` : ''}
            </div>
        `;
    });
    podiumHtml += '</div>';

    // Remaining users table
    const remaining = sortedAuthors.slice(3);
    let tableHtml = '';
    if (remaining.length > 0) {
        tableHtml = '<div class="lb-remaining">';
        tableHtml += remaining.map((authorData, i) => {
            const [name, count] = authorData;
            const rank = i + 4;
            const titleInfo = getTitle(count);
            const isMe = name === this.user.username;
            return `
                <div class="lb-row ${isMe ? 'is-me' : ''}" onclick="app.viewUserProfile('${escapeHTML(name).replace(/'/g, "\\'")}')">
                    <span class="lb-row-rank">${rank}</span>
                    <div class="lb-row-avatar">${escapeHTML(name).charAt(0).toUpperCase()}</div>
                    <div class="lb-row-info">
                        <span class="lb-row-name">${escapeHTML(name)} ${isMe ? '<span style="font-size:0.7rem; color:var(--text-muted);">(You)</span>' : ''}</span>
                    </div>
                    <div class="lb-row-count">${count} <span style="font-size:0.75rem; color:var(--text-muted);">scans</span></div>
                    <span class="badge" style="background:transparent; border-color:${titleInfo.color}; color:${titleInfo.color}; font-size:0.65rem;">${titleInfo.title}</span>
                    ${isAdmin ? `<button class="lb-admin-btn" data-username="${escapeHTML(name)}" title="Remove from leaderboard" onclick="event.stopPropagation();">🗑️</button>` : ''}
                </div>
            `;
        }).join('');
        tableHtml += '</div>';
    }

    // Your stats sidebar
    const yourStatsHtml = `
        <div class="lb-your-stats">
            <h3 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:1.25rem; font-weight:700;">Your Stats</h3>
            <div class="lb-stat-item">
                <div class="lb-stat-label">Your Rank</div>
                <div class="lb-stat-val" style="font-size:1.75rem;">#${myRank}</div>
            </div>
            <div class="lb-stat-item">
                <div class="lb-stat-label">Intel Scans</div>
                <div class="lb-stat-val">${myCount}</div>
            </div>
            <div class="lb-stat-item">
                <div class="lb-stat-label">Current Title</div>
                <div class="lb-stat-val" style="color:${myTitleInfo.color}; font-size:0.9rem;">${myTitleInfo.title}</div>
            </div>
            ${nextTitle ? `
            <div class="lb-stat-item">
                <div class="lb-stat-label">Next Title: ${nextTitle}</div>
                <div class="lb-progress-bar">
                    <div class="lb-progress-fill" style="width:${progressPct}%;"></div>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">${myCount} / ${nextThreshold} scans</div>
            </div>
            ` : '<div class="lb-stat-item"><div class="lb-stat-label" style="color:var(--success);">🏆 Max title reached!</div></div>'}
        </div>
    `;

    container.innerHTML = `
        <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="margin-bottom:1.5rem; text-align:center;">
                <h2 style="font-size:2rem; text-transform:uppercase; letter-spacing:0.03em;">Top Analysts</h2>
                <p style="color:var(--text-secondary); font-size:0.95rem;">Global user ranking by total intelligence contributions.</p>
            </div>
            <div class="lb-layout">
                <div class="lb-main">
                    ${podiumHtml}
                    ${tableHtml}
                </div>
                ${yourStatsHtml}
            </div>
        </div>
    `;

    // Admin: wire up leaderboard delete buttons
    if (isAdmin) {
        container.querySelectorAll('.lb-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                if (!confirm(`Remove ALL submissions for "${username}"? This will remove them from the leaderboard but keep their account.`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${encodeURIComponent(username)}/submissions`, { method: 'DELETE' });
                    if (res.ok) {
                        const data = await res.json();
                        alert(data.message);
                        this.renderApp();
                    } else {
                        const err = await res.json();
                        alert(err.error || 'Failed to remove submissions.');
                    }
                } catch (e) {
                    console.error(e);
                    alert('Connection error.');
                }
            });
        });
    }
};
