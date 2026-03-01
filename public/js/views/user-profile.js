// views/user-profile.js — View another user's profile

TerminalApp.prototype.renderUserProfile = async function(container) {
    const username = sessionStorage.getItem('profileUser');
    if (!username) { this.currentView = 'feed'; this.renderApp(); return; }

    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('profile')}</div>`;

    try {
        const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/profile`);
        if (!res.ok) throw new Error('Profile not found');
        const profile = await res.json();

        const titleColors = {
            'Prime Intel Officer': '#a78bfa',
            'Senior Field Evaluator': 'var(--text-secondary)',
            'Field Evaluator': 'var(--success)',
            'Junior Analyst': 'var(--accent)',
            'Rookie Analyst': 'var(--text-muted)'
        };

        container.innerHTML = `
            <div style="max-width:800px; margin:0 auto;">
                <button onclick="app.currentView='${this.previousView || 'feed'}'; app.renderApp();" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.9rem; margin-bottom:2rem; padding:0;">&larr; Back</button>

                <div class="card" style="display:flex; align-items:center; gap:2rem; margin-bottom:2rem;">
                    ${profile.avatar ? `<img src="${profile.avatar}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid var(--border-light);">` : `<div style="width:120px; height:120px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; color:#fff;">${escapeHTML(profile.username).charAt(0).toUpperCase()}</div>`}
                    <div style="flex:1;">
                        <h2 style="font-size:1.75rem; margin-bottom:0.25rem;">${escapeHTML(profile.username)}</h2>
                        <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
                            <span style="color:${titleColors[profile.title] || 'var(--text-muted)'}; font-weight:700; font-size:0.9rem; border:1px solid; padding:0.2rem 0.6rem; border-radius:4px;">${escapeHTML(profile.title)}</span>
                            ${profile.role === 'admin' ? '<span style="color:#fbbf24; font-weight:700; font-size:0.8rem;">\u2605 ADMIN</span>' : ''}
                            <span style="color:var(--text-muted); font-size:0.85rem;">Joined ${new Date(profile.joinDate).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:2rem; font-weight:900; background:var(--gradient-primary); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${profile.submissionCount}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Reports</div>
                    </div>
                    <div style="text-align:center; cursor:pointer;" onclick="document.getElementById('followerListPanel').style.display = document.getElementById('followerListPanel').style.display === 'none' ? 'block' : 'none'; if(document.getElementById('followerListPanel').style.display==='block') app.loadFollowList(${profile.userId}, 'followers');">
                        <div id="followerCount" style="font-size:2rem; font-weight:900; color:var(--text-primary);">-</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Followers</div>
                    </div>
                    <div style="text-align:center; cursor:pointer;" onclick="document.getElementById('followingListPanel').style.display = document.getElementById('followingListPanel').style.display === 'none' ? 'block' : 'none'; if(document.getElementById('followingListPanel').style.display==='block') app.loadFollowList(${profile.userId}, 'following');">
                        <div id="followingCount" style="font-size:2rem; font-weight:900; color:var(--text-primary);">-</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Following</div>
                    </div>
                </div>
                <div id="followerListPanel" style="display:none; margin-bottom:1rem;">
                    <div class="card" style="padding:1rem;">
                        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.75rem;">Followers</h4>
                        <div id="followerListContent" style="color:var(--text-muted); font-size:0.85rem;">Loading...</div>
                    </div>
                </div>
                <div id="followingListPanel" style="display:none; margin-bottom:1rem;">
                    <div class="card" style="padding:1rem;">
                        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.75rem;">Following</h4>
                        <div id="followingListContent" style="color:var(--text-muted); font-size:0.85rem;">Loading...</div>
                    </div>
                </div>

                ${profile.username !== this.user.username ? `
                <div style="display:flex; gap:1rem; margin-bottom:2rem;">
                    <button class="btn" id="followBtn" data-userid="${profile.userId}" style="flex:1; padding:0.85rem; font-size:0.95rem;">Loading...</button>
                    <button class="btn" onclick="app.startDM('${escapeHTML(profile.username).replace(/'/g, "\\'")}')" style="flex:1; padding:0.85rem; font-size:0.95rem;">
                        \u{1F512} Open Secure Channel
                    </button>
                </div>
                ` : ''}

                ${profile.recentSubmissions.length > 0 ? `
                <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem;">Recent Intel Reports</h3>
                <div class="card" style="padding:0; overflow:hidden;">
                    <table class="data-table">
                        <thead>
                            <tr><th>Date</th><th>Target</th><th>Grade</th></tr>
                        </thead>
                        <tbody>
                            ${profile.recentSubmissions.map(s => {
                                const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
                                return `
                                <tr style="cursor:pointer;" onclick="app.selectTarget(${s.targetId})">
                                    <td style="color:var(--text-muted);">${new Date(s.date).toLocaleDateString()}${s.editedAt ? ' <span style="font-size:0.7rem; font-style:italic;">(edited)</span>' : ''}</td>
                                    <td>
                                        <span class="tier-badge ${escapeHTML(s.targetTier || '').toLowerCase()}" style="font-size:0.65rem; margin-right:0.5rem;">${escapeHTML(s.targetTier)}</span>
                                        ${escapeHTML(s.targetName)}
                                    </td>
                                    <td style="font-weight:700; color:${parseFloat(grade) >= 70 ? 'var(--success)' : parseFloat(grade) >= 50 ? '#fbbf24' : 'var(--danger)'};">${grade}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                ` : '<p style="color:var(--text-muted); text-align:center; padding:2rem;">No intel reports yet.</p>'}
            </div>
        `;

        // Fetch follow stats
        try {
            const statsRes = await fetch(`${API_URL}/users/${profile.userId}/follow-stats`);
            if (statsRes.ok) {
                const stats = await statsRes.json();
                const followerEl = document.getElementById('followerCount');
                const followingEl = document.getElementById('followingCount');
                if (followerEl) followerEl.textContent = stats.followers;
                if (followingEl) followingEl.textContent = stats.following;
            }
        } catch (e) { /* silent */ }

        // Set up follow button
        if (profile.username !== this.user.username) {
            const followBtn = document.getElementById('followBtn');
            if (followBtn) {
                try {
                    const isFollowingRes = await this.authFetch(`${API_URL}/users/${profile.userId}/is-following`);
                    const { isFollowing } = await isFollowingRes.json();
                    followBtn.textContent = isFollowing ? '\u2713 Following' : '+ Follow';
                    if (isFollowing) {
                        followBtn.style.background = 'var(--bg-surface)';
                        followBtn.style.borderColor = 'var(--border-light)';
                        followBtn.style.color = 'var(--text-secondary)';
                    }
                } catch (e) { followBtn.textContent = '+ Follow'; }

                followBtn.addEventListener('click', async () => {
                    try {
                        followBtn.disabled = true;
                        const res = await this.authFetch(`${API_URL}/users/${profile.userId}/follow`, { method: 'POST' });
                        if (!res.ok) throw new Error('Follow failed');
                        const data = await res.json();
                        if (data.action === 'followed') {
                            followBtn.textContent = '\u2713 Following';
                            followBtn.style.background = 'var(--bg-surface)';
                            followBtn.style.borderColor = 'var(--border-light)';
                            followBtn.style.color = 'var(--text-secondary)';
                            const el = document.getElementById('followerCount');
                            if (el) el.textContent = parseInt(el.textContent || '0') + 1;
                        } else {
                            followBtn.textContent = '+ Follow';
                            followBtn.style.background = '';
                            followBtn.style.borderColor = '';
                            followBtn.style.color = '';
                            const el = document.getElementById('followerCount');
                            if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
                        }
                        followBtn.disabled = false;
                    } catch (err) { alert('Follow action failed.'); followBtn.disabled = false; }
                });
            }
        }

    } catch (e) {
        container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load profile.</div>`;
        console.error(e);
    }
};

TerminalApp.prototype.loadFollowList = async function(userId, type) {
    const contentEl = document.getElementById(type === 'followers' ? 'followerListContent' : 'followingListContent');
    if (!contentEl) return;
    contentEl.innerHTML = '<span style="color:var(--text-muted);">Loading...</span>';

    try {
        const res = await fetch(`${API_URL}/users/${userId}/${type}`);
        if (!res.ok) throw new Error('Failed to load');
        const users = await res.json();

        if (users.length === 0) {
            contentEl.innerHTML = `<span style="color:var(--text-muted);">No ${type} yet.</span>`;
            return;
        }

        contentEl.innerHTML = users.map(u => `
            <div onclick="app.viewUserProfile('${escapeHTML(u.username).replace(/'/g, "\\'")}')" style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; cursor:pointer; border-bottom:1px solid var(--border-light);">
                ${u.avatar ? `<img src="${u.avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--bg-surface); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; border:1px solid var(--border);">${escapeHTML(u.username).charAt(0).toUpperCase()}</div>`}
                <span style="font-weight:600; color:var(--text-primary);">${escapeHTML(u.username)}</span>
            </div>
        `).join('');
    } catch (e) {
        contentEl.innerHTML = '<span style="color:var(--danger);">Failed to load list.</span>';
        console.error(e);
    }
};
