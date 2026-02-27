// views/dashboard.js — My Intel History

TerminalApp.prototype.renderDashboard = async function(container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

    let userSubs = [];
    try {
        const res = await fetch(`${API_URL}/submissions/user/${this.user.username}`);
        if (res.ok) userSubs = await res.json();
    } catch (e) {
        console.error("Failed historical log", e);
    }

    let tableHtml = '<div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">';

    if (userSubs.length === 0) {
        tableHtml += '<div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 1.1rem;">No intelligence logs securely committed yet.</div>';
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
            return `
                <tr>
                    <td style="color:var(--text-secondary); font-size:0.9rem;">${d}${s.editedAt ? ' <span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">(edited)</span>' : ''}</td>
                    <td style="font-weight:600;">
                        <span class="tier-badge ${escapeHTML(tier).toLowerCase()}" style="margin-right:0.5rem; font-size:0.6rem;">${escapeHTML(tier)}</span>
                        <span style="cursor:pointer; text-decoration:underline; text-decoration-color:var(--border-light); text-underline-offset:4px; transition:color 0.2s;" onclick="app.selectTarget(${s.targetId})" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color=''">
                            ${escapeHTML(s.targetName)}
                        </span>
                    </td>
                    <td><span style="color:var(--accent); font-weight:700;">${((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1)}</span></td>
                    <td style="text-align: right; white-space:nowrap;">
                        <button class="badge" style="border-color:var(--accent); color:var(--accent); background:transparent; margin-right:0.5rem;" onclick="app.editSubmission(${s.id}, ${s.targetId})">✏️ Edit</button>
                        <button class="badge" style="border-color:var(--danger); color:var(--danger); background:transparent;" onclick="app.deleteSubmission(${s.id})">Retract</button>
                    </td>
                </tr>
            `;
        }).join('');
        tableHtml += '</tbody></table>';
    }
    tableHtml += '</div>';

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="margin-bottom:2rem;">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Intelligence Log</h2>
                <p style="color:var(--text-secondary); font-size:1.1rem;">Manage your active user data submissions.</p>
            </div>
            ${tableHtml}
        </div>
    `;
};
