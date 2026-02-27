// views/admin.js — Admin Panel
TerminalApp.prototype.renderAdmin = async function(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        let analytics = {}, users = [], figures = [], flags = [];

        try {
            const [aRes, uRes, fRes, flagRes] = await Promise.all([
                this.authFetch(`${API_URL}/admin/analytics`),
                this.authFetch(`${API_URL}/admin/users`),
                fetch(`${API_URL}/figures`),
                this.authFetch(`${API_URL}/admin/flags`)
            ]);
            if (aRes.ok) analytics = await aRes.json();
            if (uRes.ok) users = await uRes.json();
            if (fRes.ok) figures = await fRes.json();
            if (flagRes.ok) flags = await flagRes.json();
        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load admin data.</div>`;
            return;
        }

        container.innerHTML = `
            <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">\u{2699}\u{FE0F} Admin Panel</h2>
                <p style="color:var(--text-secondary); font-size:1rem; margin-bottom:2rem;">System management and analytics for <span style="color:#fbbf24; font-weight:700;">\u{2605} Admin</span></p>

                <!-- SITE ANALYTICS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem;">\u{1F4CA} Site Analytics</h3>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:1rem; margin-bottom:2rem;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalUsers || 0}</div>
                        <div class="stat-label">Registered Users</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalFigures || 0}</div>
                        <div class="stat-label">Cataloged Targets</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalSubmissions || 0}</div>
                        <div class="stat-label">Intel Reports</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalPosts || 0}</div>
                        <div class="stat-label">Comms Posts</div>
                    </div>
                </div>

                ${analytics.topAnalysts && analytics.topAnalysts.length > 0 ? `
                <div class="card" style="padding:1.5rem; margin-bottom:2rem;">
                    <h4 style="margin-bottom:1rem; color:var(--text-secondary);">\u{1F3C6} Top Analysts</h4>
                    <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                        ${analytics.topAnalysts.map((a, i) => `
                            <div style="background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.75rem 1.25rem; display:flex; align-items:center; gap:0.75rem;">
                                <span style="font-size:1.25rem; font-weight:800; color:${i === 0 ? '#fbbf24' : 'var(--text-muted)'};">#${i + 1}</span>
                                <div>
                                    <div style="font-weight:600;">${escapeHTML(a.author)}</div>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${a.subs} report${a.subs != 1 ? 's' : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- FLAGGED BROADCASTS -->
                ${flags.length > 0 ? `
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--danger, #ef4444); margin-bottom:1rem; margin-top:2.5rem;">\u{1F6A9} Flagged Broadcasts (${flags.length})</h3>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; font-weight:700;">Post Author</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Flagged By</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Reason</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Date</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${flags.map(f => `
                            <tr style="border-bottom:1px solid var(--border-light);">
                                <td style="padding:0.75rem 1rem; font-weight:700;">${escapeHTML(f.postAuthor)}</td>
                                <td style="padding:0.75rem 1rem;">${escapeHTML(f.flaggedBy)}</td>
                                <td style="padding:0.75rem 1rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(f.reason || 'No reason given')}</td>
                                <td style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.85rem;">${new Date(f.created_at).toLocaleDateString()}</td>
                                <td style="padding:0.75rem 1rem; white-space:nowrap;">
                                    <button class="adminDeleteFlaggedPost btn" data-postid="${f.postId}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger, #ef4444); border-color:var(--danger, #ef4444); margin-right:0.25rem;">Delete Post</button>
                                    <button class="adminDismissFlag btn" data-flagid="${f.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--bg-surface); border-color:var(--border-light); color:var(--text-secondary);">Dismiss</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <!-- FIGURE MANAGEMENT -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">\u{1F3AF} Figure Management (${figures.length})</h3>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">ID</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Name</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Brand</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Class</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Line</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">MSRP</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${figures.map(f => `
                                <tr style="border-top:1px solid var(--border-light);" id="figRow-${f.id}">
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${f.id}</td>
                                    <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(f.name)}</td>
                                    <td style="padding:0.6rem 1rem;">${escapeHTML(f.brand)}</td>
                                    <td style="padding:0.6rem 1rem;"><span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}" style="font-size:0.7rem;">${escapeHTML(f.classTie)}</span></td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${escapeHTML(f.line)}</td>
                                    <td style="padding:0.6rem 1rem; color:#10b981; font-weight:600;">${f.msrp ? '$' + parseFloat(f.msrp).toFixed(2) : '<span style="color:var(--text-muted); font-weight:400;">\u{2014}</span>'}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                        <button class="editFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" data-brand="${escapeHTML(f.brand)}" data-class="${escapeHTML(f.classTie)}" data-line="${escapeHTML(f.line)}" data-msrp="${f.msrp || ''}" style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">\u{270F}\u{FE0F} Edit</button>
                                        <button class="delFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">\u{1F5D1}\u{FE0F} Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- USER MANAGEMENT -->
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:1rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin:0;">\u{1F465} User Management (${users.length})</h3>
                    <button id="addAdminUserBtn" style="background:none; border:1px solid #fbbf24; color:#fbbf24; cursor:pointer; padding:0.4rem 0.8rem; border-radius:4px; font-size:0.8rem; font-weight:700;">+ ADD USER</button>
                </div>
                <div class="card" style="padding:0; overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">ID</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Username</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Email</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Role</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Status</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Joined</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => {
            const isAdmin = u.role === 'admin';
            const isSuspended = u.suspended;
            const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';
            return `
                                    <tr style="border-top:1px solid var(--border-light); ${isSuspended ? 'opacity:0.5;' : ''}">
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${u.id}</td>
                                        <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(u.username)} ${isAdmin ? '<span style="color:#fbbf24; font-size:0.75rem;">\u{2605} ADMIN</span>' : ''}</td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${escapeHTML(u.email)}</td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isAdmin ? '#fbbf24' : 'var(--accent)'}; font-size:0.8rem; font-weight:600; text-transform:uppercase;">${escapeHTML(u.role || 'analyst')}</span></td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isSuspended ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem; font-weight:600;">${isSuspended ? '\u{26D4} SUSPENDED' : '\u{2705} ACTIVE'}</span></td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${joined}</td>
                                        <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                            ${u.username !== 'Prime Dynamixx' ? `
                                                <button class="roleBtn" data-id="${u.id}" data-role="${u.role}" style="background:none; border:1px solid ${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; color:${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isAdmin ? 'Demote' : 'Promote'}</button>
                                                <button class="suspendBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid ${isSuspended ? 'var(--success)' : 'var(--danger)'}; color:${isSuspended ? 'var(--success)' : 'var(--danger)'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isSuspended ? '\u{2705} Reinstate' : '\u{26A0}\u{FE0F} Suspend'}</button>
                                                <button class="resetPwBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid var(--accent); color:var(--accent); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">\u{1F511} Reset PW</button>
                                                <button class="delUserBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">\u{1F5D1}\u{FE0F} Delete</button>
                                            ` : '<span style="font-size:0.8rem; color:var(--text-muted);">Protected</span>'}
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Wire up admin action handlers (all use JWT auth via authFetch)

        // Add User
        document.getElementById('addAdminUserBtn').addEventListener('click', async () => {
            const username = prompt("Enter new username:");
            if (!username) return;
            const password = prompt("Enter new password:");
            if (!password) return;
            const email = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@datatoyz.net';
            const role = confirm("Should this user be an Admin? (OK for Admin, Cancel for Analyst)") ? 'admin' : 'analyst';

            try {
                const res = await this.authFetch(`${API_URL}/admin/users`, {
                    method: 'POST',
                    body: JSON.stringify({ username, email, password, role })
                });
                if (res.ok) { this.renderAdmin(container); }
                else { const err = await res.json(); alert(err.error); }
            } catch (e) { console.error(e); }
        });

        // Toggle User Role
        document.querySelectorAll('.roleBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isPromoting = btn.dataset.role !== 'admin';
                if (!confirm(`Are you sure you want to ${isPromoting ? 'PROMOTE' : 'DEMOTE'} this user?`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/role`, { method: 'PUT' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Delete figure
        document.querySelectorAll('.delFigBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete "${btn.dataset.name}" and ALL associated intel? This cannot be undone.`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        MOCK_FIGURES = MOCK_FIGURES.filter(f => f.id != btn.dataset.id);
                        this.renderAdmin(container);
                    } else {
                        const err = await res.json();
                        alert(err.error);
                    }
                } catch (e) { console.error(e); }
            });
        });

        // Edit figure
        // Flagged post admin actions
        document.querySelectorAll('.adminDeleteFlaggedPost').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this flagged broadcast?')) return;
                try {
                    const res = await this.authFetch(`${API_URL}/posts/${btn.dataset.postid}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                } catch (e) { console.error(e); }
            });
        });
        document.querySelectorAll('.adminDismissFlag').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const res = await this.authFetch(`${API_URL}/admin/flags/${btn.dataset.flagid}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                } catch (e) { console.error(e); }
            });
        });

        document.querySelectorAll('.editFigBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newName = prompt('Figure Name:', btn.dataset.name);
                if (!newName) return;
                const newBrand = prompt('Brand:', btn.dataset.brand);
                if (!newBrand) return;
                const newClass = prompt('Class Tier:', btn.dataset.class);
                if (!newClass) return;
                const newLine = prompt('Product Line:', btn.dataset.line);
                if (!newLine) return;
                const msrpStr = prompt('MSRP (leave blank to clear):', btn.dataset.msrp || '');
                if (msrpStr === null) return;
                const newMsrp = msrpStr.trim() !== '' ? parseFloat(msrpStr) : null;

                try {
                    const res = await this.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name: newName, brand: newBrand, classTie: newClass, line: newLine, msrp: newMsrp })
                    });
                    if (res.ok) {
                        const fig = MOCK_FIGURES.find(f => f.id == btn.dataset.id);
                        if (fig) { fig.name = newName; fig.brand = newBrand; fig.classTie = newClass; fig.line = newLine; fig.msrp = newMsrp; }
                        this.renderAdmin(container);
                    }
                } catch (e) { console.error(e); }
            });
        });

        // Suspend user
        document.querySelectorAll('.suspendBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/suspend`, { method: 'PUT' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Delete user
        document.querySelectorAll('.delUserBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Permanently delete user "${btn.dataset.name}"? This cannot be undone.`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Admin Reset Password
        document.querySelectorAll('.resetPwBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newPw = prompt(`Enter new password for "${btn.dataset.name}":`);
                if (!newPw || newPw.length < 8) { if (newPw !== null) alert('Password must be at least 8 characters, with uppercase, lowercase, and a number.'); return; }
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/reset-password`, {
                        method: 'POST',
                        body: JSON.stringify({ newPassword: newPw })
                    });
                    if (res.ok) { alert(`Password reset for "${btn.dataset.name}".`); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });
};

TerminalApp.prototype.editSubmission = async function(submissionId, targetId) {
        // Fetch the full submission data, then resolve target from figures list or submission metadata
        try {
            const subRes = await fetch(`${API_URL}/submissions/user/${this.user.username}`);
            if (!subRes.ok) { alert('Failed to load submission data.'); return; }
            const allSubs = await subRes.json();
            const sub = allSubs.find(s => s.id === submissionId);
            if (!sub) { alert('Submission not found.'); return; }

            // Resolve target: try MOCK_FIGURES first, then fetch full figures list
            let figure = MOCK_FIGURES.find(f => f.id == targetId);
            if (!figure) {
                try {
                    const figRes = await fetch(`${API_URL}/figures`);
                    if (figRes.ok) {
                        const allFigures = await figRes.json();
                        figure = allFigures.find(f => f.id == targetId);
                    }
                } catch (e) { /* fallback below */ }
            }
            // Fallback: build target from submission metadata
            if (!figure) {
                figure = { id: sub.targetId, name: sub.targetName, classTie: sub.targetTier, brand: '', line: '' };
            }

            this.editingSubmission = sub;
            this.currentTarget = figure;
            this.currentView = 'submission';
            this.renderApp();
        } catch (e) {
            console.error('Edit submission load error', e);
            alert('Failed to load submission for editing.');
        }
};

TerminalApp.prototype.deleteSubmission = async function(id) {
        if (!confirm("Are you sure you want to retract this intel from the Market Pulse?")) return;
        try {
            const res = await this.authFetch(`${API_URL}/submissions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.showFormSuccess('Intelligence report retracted.');
                this.renderApp();
            } else {
                const errData = await res.json().catch(() => ({}));
                this.showFormError(errData.error || 'Failed to retract submission.');
            }
        } catch (e) {
            console.error(e);
            this.showFormError('Connection error. Please try again.');
        }
};
