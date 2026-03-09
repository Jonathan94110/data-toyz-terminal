// views/user-profile.js — View another user's profile

TerminalApp.prototype.renderUserProfile = async function (container) {
    const username = sessionStorage.getItem('profileUser');
    if (!username) { this.currentView = 'feed'; this.renderApp(); return; }

    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('profile')}</div>`;

    try {
        const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/profile`);
        if (!res.ok) throw new Error('Profile not found');
        const profile = await res.json();

        const calculateRank = (count) => {
            if (count >= 50) return { title: 'Legend', class: 'badge-legend', next: null, current: count, icon: '\u{1F48E}' }; // Diamond
            if (count >= 20) return { title: 'Master', class: 'badge-master', next: 50, current: count, icon: '\u{2B50}' }; // Star
            if (count >= 5) return { title: 'Operative', class: 'badge-operative', next: 20, current: count, icon: '\u{1F6E1}' }; // Shield
            return { title: 'Recruit', class: 'badge-recruit', next: 5, current: count, icon: '\u{1F530}' }; // Beginner
        };
        const rankInfo = calculateRank(profile.submissionCount);

        container.innerHTML = `
            <div style="max-width:800px; margin:0 auto;">
                <button onclick="app.currentView='${this.previousView || 'feed'}'; app.renderApp();" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.9rem; margin-bottom:2rem; padding:0;">&larr; Back</button>

                <div class="card" style="margin-bottom:2rem;">
                    <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
                        ${profile.avatar ? `<img src="${profile.avatar}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid var(--border-light);">` : `<div style="width:120px; height:120px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; color:#fff;">${escapeHTML(profile.username).charAt(0).toUpperCase()}</div>`}
                        <div style="flex:1; min-width:200px;">
                            <h2 style="font-size:1.75rem; margin-bottom:0.25rem;">${escapeHTML(profile.username)}</h2>
                            <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
                                <span class="${rankInfo.class}" style="font-weight:700; font-size:0.85rem; padding:0.25rem 0.75rem; border-radius:var(--radius-sm); display:flex; gap:0.35rem; align-items:center; text-transform:uppercase; letter-spacing:0.05em;">
                                    <span style="font-size:1rem;">${rankInfo.icon}</span> ${escapeHTML(rankInfo.title)}
                                </span>
                                ${{ 'owner': '<span style="color:#a855f7; font-weight:700; font-size:0.8rem;">\u{2B50} OWNER</span>', 'admin': '<span style="color:#fbbf24; font-weight:700; font-size:0.8rem;">\u2605 ADMIN</span>', 'moderator': '<span style="color:#3b82f6; font-weight:700; font-size:0.8rem;">\u{1F6E1}\u{FE0F} MOD</span>' }[profile.role] || ''}
                                ${profile.platinum ? '<span class="platinum-badge">\u{1F48E} PLATINUM</span>' : ''}
                                <span style="color:var(--text-muted); font-size:0.85rem;">Joined ${new Date(profile.joinDate).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:1.5rem; margin-top:1.5rem; padding-top:1.5rem; border-top:1px solid var(--border-light); justify-content:center; flex-wrap:wrap;">
                        <div style="text-align:center; min-width:70px;">
                            <div style="font-size:1.75rem; font-weight:900; background:var(--gradient-primary); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${profile.submissionCount}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Reports</div>
                        </div>
                        <div style="text-align:center; min-width:70px; cursor:pointer;" onclick="document.getElementById('followerListPanel').style.display = document.getElementById('followerListPanel').style.display === 'none' ? 'block' : 'none'; if(document.getElementById('followerListPanel').style.display==='block') app.loadFollowList(${profile.userId}, 'followers');">
                            <div id="followerCount" style="font-size:1.75rem; font-weight:900; color:var(--text-primary);">-</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Followers</div>
                        </div>
                        <div style="text-align:center; min-width:70px; cursor:pointer;" onclick="document.getElementById('followingListPanel').style.display = document.getElementById('followingListPanel').style.display === 'none' ? 'block' : 'none'; if(document.getElementById('followingListPanel').style.display==='block') app.loadFollowList(${profile.userId}, 'following');">
                            <div id="followingCount" style="font-size:1.75rem; font-weight:900; color:var(--text-primary);">-</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Following</div>
                        </div>
                    </div>
                    ${rankInfo.next ? `
                    <div style="margin-top:2rem; padding: 0 1.5rem;">
                        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">
                            <span>Current: ${rankInfo.title}</span>
                            <span>Next Rank: ${rankInfo.next} Reports</span>
                        </div>
                        <div class="level-progress-bg">
                            <div class="level-progress-bar ${rankInfo.class}" style="width: ${(rankInfo.current / rankInfo.next) * 100}%;"></div>
                        </div>
                    </div>
                    ` : `
                    <div style="margin-top:2rem; padding: 0 1.5rem; text-align:center; color:var(--accent); font-size:0.9rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; text-shadow: 0 0 10px var(--accent-glow);">
                        \u2728 Maximum Rank Achieved \u2728
                    </div>
                    `}
                    ${profile.username !== this.user.username ? `
                    <div style="display:flex; gap:1rem; margin-top:1.5rem; padding-top:1.5rem; border-top:1px solid var(--border-light);">
                        <button class="btn" id="followBtn" data-userid="${profile.userId}" style="flex:1; padding:0.85rem; font-size:0.95rem;">Loading...</button>
                        <button class="btn" onclick="app.startDM('${escapeHTML(profile.username).replace(/'/g, "\\'")}')" style="flex:1; padding:0.85rem; font-size:0.95rem;">
                            \u{1F4AC} Send Message
                        </button>
                    </div>
                    ` : `
                    <div style="margin-top:1.5rem; padding-top:1.5rem; border-top:1px solid var(--border-light);">
                        <button class="btn" id="newMsgBtn" style="width:100%; padding:0.85rem; font-size:0.95rem;">\u{1F4AC} New Message</button>
                        <div id="dmSearchPanel" style="display:none; margin-top:1rem;">
                            <input id="dmSearchInput" type="text" placeholder="Search operative..." style="width:100%; padding:0.75rem 1rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:8px; color:var(--text-primary); font-size:0.9rem; outline:none;">
                            <div id="dmSearchResults" style="display:none; margin-top:0.5rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:8px; max-height:200px; overflow-y:auto;"></div>
                        </div>
                    </div>
                    `}
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

                <div id="collectionSummary"></div>

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

        // Set up New Message search (own profile)
        if (profile.username === this.user.username) {
            const newMsgBtn = document.getElementById('newMsgBtn');
            const dmPanel = document.getElementById('dmSearchPanel');
            const dmInput = document.getElementById('dmSearchInput');
            const dmResults = document.getElementById('dmSearchResults');
            if (newMsgBtn && dmPanel && dmInput) {
                newMsgBtn.addEventListener('click', () => {
                    dmPanel.style.display = dmPanel.style.display === 'none' ? 'block' : 'none';
                    if (dmPanel.style.display === 'block') dmInput.focus();
                });
                let dmTimeout = null;
                dmInput.addEventListener('input', () => {
                    clearTimeout(dmTimeout);
                    const q = dmInput.value.trim();
                    if (q.length < 1) { dmResults.style.display = 'none'; return; }
                    dmTimeout = setTimeout(async () => {
                        try {
                            const res = await this.authFetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`);
                            const users = await res.json();
                            const filtered = users.filter(u => u.username !== this.user.username);
                            if (filtered.length === 0) {
                                dmResults.style.display = 'block';
                                dmResults.innerHTML = '<div style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.85rem;">No operatives found</div>';
                                return;
                            }
                            dmResults.style.display = 'block';
                            dmResults.innerHTML = filtered.map(u => `
                                <div class="dm-search-item" data-username="${escapeHTML(u.username)}" style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 1rem; cursor:pointer; border-bottom:1px solid var(--border-light); transition:background 0.15s;">
                                    ${u.avatar ? `<img src="${u.avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-size:0.85rem;">${escapeHTML(u.username).charAt(0).toUpperCase()}</div>`}
                                    <span style="font-weight:600; color:var(--text-primary);">${escapeHTML(u.username)}</span>
                                </div>
                            `).join('');
                            dmResults.querySelectorAll('.dm-search-item').forEach(item => {
                                item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-hover)'; });
                                item.addEventListener('mouseleave', () => { item.style.background = ''; });
                                item.addEventListener('click', () => {
                                    app.startDM(item.dataset.username);
                                });
                            });
                        } catch (e) { dmResults.style.display = 'none'; }
                    }, 300);
                });
            }
        }

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

        // Fetch collection summary
        try {
            const colRes = await fetch(`${API_URL}/collection/user/${encodeURIComponent(profile.username)}`);
            if (colRes.ok) {
                const colData = await colRes.json();
                const summaryEl = document.getElementById('collectionSummary');
                if (summaryEl && (colData.counts.owned > 0 || colData.counts.for_trade > 0 || colData.counts.wishlist > 0 || colData.counts.sold > 0)) {
                    const totalItems = colData.counts.owned + colData.counts.for_trade + colData.counts.wishlist + colData.counts.sold;
                    summaryEl.innerHTML = `
                        <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem;">Collection</h3>
                        <div class="card" style="margin-bottom:2rem;">
                            <div style="display:flex; gap:1.5rem; justify-content:center; flex-wrap:wrap; margin-bottom:1rem;">
                                <div style="text-align:center; min-width:60px;">
                                    <div style="font-size:1.5rem; font-weight:900; color:var(--success);">${colData.counts.owned}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Owned</div>
                                </div>
                                <div style="text-align:center; min-width:60px;">
                                    <div style="font-size:1.5rem; font-weight:900; color:#a855f7;">${colData.counts.for_trade}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">For Trade</div>
                                </div>
                                <div style="text-align:center; min-width:60px;">
                                    <div style="font-size:1.5rem; font-weight:900; color:var(--neutral);">${colData.counts.wishlist}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Wishlist</div>
                                </div>
                                <div style="text-align:center; min-width:60px;">
                                    <div style="font-size:1.5rem; font-weight:900; color:var(--text-muted);">${colData.counts.sold}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Sold</div>
                                </div>
                            </div>
                            ${totalItems > 0 ? `
                            <div style="border-top:1px solid var(--border-light); padding-top:1rem;">
                                ${['owned', 'for_trade', 'wishlist', 'sold'].filter(s => colData.collection[s].length > 0).map(status => {
                                    const label = status.replace('_', ' ');
                                    const color = { owned: 'var(--success)', for_trade: '#a855f7', wishlist: 'var(--neutral)', sold: 'var(--text-muted)' }[status];
                                    return `
                                    <details style="margin-bottom:0.5rem;">
                                        <summary style="cursor:pointer; font-size:0.85rem; font-weight:700; text-transform:uppercase; color:${color}; letter-spacing:0.03em; padding:0.5rem 0;">${label} (${colData.collection[status].length})</summary>
                                        <div style="padding:0.25rem 0 0.75rem 1rem;">
                                            ${colData.collection[status].map(f => `<div style="font-size:0.85rem; color:var(--text-secondary); padding:0.2rem 0; cursor:pointer;" onclick="app.selectTarget(${f.figureId})">${escapeHTML(f.figureName)} <span style="color:var(--text-muted); font-size:0.75rem;">${escapeHTML(f.brand || '')}</span></div>`).join('')}
                                        </div>
                                    </details>`;
                                }).join('')}
                            </div>` : ''}
                        </div>
                    `;
                }
            }
        } catch (e) { /* silent */ }

    } catch (e) {
        container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load profile.</div>`;
        console.error(e);
    }
};

TerminalApp.prototype.loadFollowList = async function (userId, type) {
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
