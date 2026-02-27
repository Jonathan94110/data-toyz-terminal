// views/leaderboards.js — Global Leaderboard

TerminalApp.prototype.renderLeaderboards = async function(container) {
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

    let tableHtml = '<div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">';

    if (sortedAuthors.length === 0) {
        tableHtml += '<div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 1.1rem;">No global users found.</div>';
    } else {
        tableHtml += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 80px; text-align: center;">Rank</th>
                        <th>Username</th>
                        <th>Intelligence Scans</th>
                        <th>Global Title</th>
                    </tr>
                </thead>
                <tbody>
        `;
        tableHtml += sortedAuthors.map((authorData, index) => {
            const [authorName, count] = authorData;
            let title = "Rookie Analyst";
            let titleColor = "var(--text-muted)";

            if (count >= 15) { title = "Prime Intel Officer"; titleColor = "#a855f7"; }
            else if (count >= 10) { title = "Senior Field Evaluator"; titleColor = "var(--neutral)"; }
            else if (count >= 5) { title = "Field Evaluator"; titleColor = "var(--success)"; }
            else if (count >= 2) { title = "Junior Analyst"; titleColor = "var(--accent)"; }

            let rankBadge = `<span style="font-weight: 800; color: var(--text-secondary);">${index + 1}</span>`;
            if (index === 0) rankBadge = `<span style="color: #fbbf24; font-size: 1.5rem; line-height: 1;">\u{1F451}</span>`;
            else if (index === 1) rankBadge = `<span style="color: #94a3b8; font-weight: 800; font-size: 1.1rem;">2</span>`;
            else if (index === 2) rankBadge = `<span style="color: #b45309; font-weight: 800; font-size: 1.1rem;">3</span>`;

            return `
                <tr>
                    <td style="text-align: center; vertical-align: middle;">${rankBadge}</td>
                    <td style="font-weight: 800; font-size: 1.1rem; color: ${this.user.username === authorName ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="app.viewUserProfile('${escapeHTML(authorName).replace(/'/g, "\\'")}')">${escapeHTML(authorName)} ${this.user.username === authorName ? '<span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);">(You)</span>' : ''}</td>
                    <td><span style="font-weight: 800;">${count}</span> <span style="font-size: 0.8rem; color: var(--text-secondary);">logs</span></td>
                    <td><span class="badge" style="background:transparent; border-color:${titleColor}; color:${titleColor};">${title}</span></td>
                </tr>
            `;
        }).join('');
        tableHtml += '</tbody></table>';
    }
    tableHtml += '</div>';

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="margin-bottom:2rem; text-align:center;">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Top Analysts</h2>
                <p style="color:var(--text-secondary); font-size:1.1rem;">Global user ranking by total intelligence contributions.</p>
            </div>
            ${tableHtml}
        </div>
    `;
};
