// views/admin.js — Admin Panel
TerminalApp.prototype.renderAdmin = async function(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        const userRole = this.user.role || 'analyst';
        const isFullAdmin = ['owner', 'admin'].includes(userRole);
        const isMod = userRole === 'moderator';
        const isPlatinum = !!this.user.platinum;

        let analytics = {}, pageviewSummary = {}, users = [], figures = [], flags = [], topRated = [], approvedBrands = [], pendingBrands = [], lbSettings = [], tickerSettings = { ticker_mode: 'all', ticker_length: 25 }, pendingTrades = [];

        try {
            // All roles: analytics + flags + leaderboard settings + pageviews
            const promises = [
                this.authFetch(`${API_URL}/admin/analytics`),
                this.authFetch(`${API_URL}/admin/flags`),
                this.authFetch(`${API_URL}/admin/figures/leaderboard-settings`),
                this.authFetch(`${API_URL}/admin/pageviews/summary`)
            ];
            // Admin-only: users, figures, top-rated, brands, pending brands
            if (isFullAdmin) {
                promises.push(
                    this.authFetch(`${API_URL}/admin/users`),
                    fetch(`${API_URL}/figures`),
                    fetch(`${API_URL}/figures/top-rated`),
                    this.authFetch(`${API_URL}/admin/brands`),
                    this.authFetch(`${API_URL}/admin/pending-brands`),
                    this.authFetch(`${API_URL}/admin/ticker-settings`)
                );
            }
            const results = await Promise.all(promises);
            if (results[0].ok) analytics = await results[0].json();
            if (results[1].ok) flags = await results[1].json();
            if (results[2].ok) lbSettings = await results[2].json();
            if (results[3].ok) pageviewSummary = await results[3].json();
            if (isFullAdmin) {
                if (results[4].ok) users = await results[4].json();
                if (results[5].ok) figures = await results[5].json();
                if (results[6].ok) topRated = await results[6].json();
                if (results[7].ok) approvedBrands = await results[7].json();
                if (results[8].ok) pendingBrands = await results[8].json();
                if (results[9] && results[9].ok) tickerSettings = await results[9].json();
            }
            // Fetch pending trades for admin and platinum users
            if (isFullAdmin || isPlatinum) {
                try {
                    const ptRes = await this.authFetch(`${API_URL}/collection/pending-trades`);
                    if (ptRes.ok) pendingTrades = await ptRes.json();
                } catch (e) { /* silent */ }
            }
        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load admin data.</div>`;
            return;
        }

        // Pagination + search state
        const PAGE_SIZE = 20;
        let figSearch = '', figPage = 1;
        let userSearch = '', userPage = 1;
        let brandSearch = '', brandPage = 1;

        const self = this;

        function filterFigures() {
            if (!figSearch) return figures;
            const q = figSearch.toLowerCase();
            return figures.filter(f => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q)) || (f.line && f.line.toLowerCase().includes(q)));
        }

        function filterUsers() {
            if (!userSearch) return users;
            const q = userSearch.toLowerCase();
            return users.filter(u => u.username.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)));
        }

        function filterBrands() {
            if (!brandSearch) return approvedBrands;
            const q = brandSearch.toLowerCase();
            return approvedBrands.filter(b => b.name.toLowerCase().includes(q) || (b.approved_by && b.approved_by.toLowerCase().includes(q)));
        }

        function paginate(arr, page) {
            const start = (page - 1) * PAGE_SIZE;
            return arr.slice(start, start + PAGE_SIZE);
        }

        function paginationHTML(total, currentPage, prefix) {
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (totalPages <= 1) return '';
            let html = '<div style="display:flex; justify-content:center; align-items:center; gap:0.5rem; padding:0.75rem; border-top:1px solid var(--border-light);">';
            html += `<button class="${prefix}-page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''} style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">&laquo; Prev</button>`;
            html += `<span style="font-size:0.8rem; color:var(--text-muted);">Page ${currentPage} of ${totalPages}</span>`;
            html += `<button class="${prefix}-page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''} style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">Next &raquo;</button>`;
            html += '</div>';
            return html;
        }

        function renderFigureTable() {
            const filtered = filterFigures();
            const paged = paginate(filtered, figPage);
            const tbody = document.getElementById('adminFigTbody');
            const paginationEl = document.getElementById('adminFigPagination');
            const countEl = document.getElementById('adminFigCount');
            if (!tbody) return;

            if (countEl) countEl.textContent = filtered.length;
            tbody.innerHTML = paged.length === 0
                ? '<tr><td colspan="7" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No figures match your search.</td></tr>'
                : paged.map(f => `
                    <tr style="border-top:1px solid var(--border-light);" id="figRow-${f.id}">
                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${f.id}</td>
                        <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(f.name)}</td>
                        <td style="padding:0.6rem 1rem;">${escapeHTML(f.brand)}</td>
                        <td style="padding:0.6rem 1rem;"><span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}" style="font-size:0.7rem;">${escapeHTML(f.classTie)}</span></td>
                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${escapeHTML(f.line)}</td>
                        <td style="padding:0.6rem 1rem; color:#10b981; font-weight:600;">${f.msrp ? '$' + parseFloat(f.msrp).toFixed(2) : '<span style="color:var(--text-muted); font-weight:400;">\u{2014}</span>'}</td>
                        <td style="padding:0.6rem 1rem; text-align:right;">
                            <div class="admin-action-btns">
                                <button class="editFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" data-brand="${escapeHTML(f.brand)}" data-class="${escapeHTML(f.classTie)}" data-line="${escapeHTML(f.line)}" data-msrp="${f.msrp || ''}">\u{270F}\u{FE0F} Edit</button>
                                <button class="mergeFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" style="border-color:#fbbf24; color:#fbbf24;">\u{1F500} Merge</button>
                                <button class="delFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" style="border-color:var(--danger); color:var(--danger);">\u{1F5D1}\u{FE0F} Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');

            if (paginationEl) paginationEl.innerHTML = paginationHTML(filtered.length, figPage, 'fig');
            wireUpFigureActions();
        }

        function renderUserTable() {
            const filtered = filterUsers();
            const paged = paginate(filtered, userPage);
            const tbody = document.getElementById('adminUserTbody');
            const paginationEl = document.getElementById('adminUserPagination');
            const countEl = document.getElementById('adminUserCount');
            if (!tbody) return;

            if (countEl) countEl.textContent = filtered.length;
            tbody.innerHTML = paged.length === 0
                ? '<tr><td colspan="7" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No users match your search.</td></tr>'
                : paged.map(u => {
                    const roleColors = { owner: '#a855f7', admin: '#fbbf24', moderator: '#3b82f6', analyst: 'var(--accent)' };
                    const roleBadges = { owner: '\u{2B50} OWNER', admin: '\u{2605} ADMIN', moderator: '\u{1F6E1}\u{FE0F} MOD', analyst: 'ANALYST' };
                    const uRole = u.role || 'analyst';
                    const isSuspended = u.suspended;
                    const isProtected = uRole === 'owner';
                    const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';
                    const assignableRoles = userRole === 'owner' ? ['analyst', 'moderator', 'admin'] : ['analyst', 'moderator'];
                    return `
                        <tr style="border-top:1px solid var(--border-light); ${isSuspended ? 'opacity:0.5;' : ''}">
                            <td style="padding:0.6rem 1rem; color:var(--text-muted);">${u.id}</td>
                            <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(u.username)} ${uRole !== 'analyst' ? `<span style="color:${roleColors[uRole]}; font-size:0.75rem;">${roleBadges[uRole]}</span>` : ''}${u.platinum ? ' <span style="color:#a855f7; font-size:0.7rem; font-weight:700; background:rgba(168,85,247,0.15); padding:0.1rem 0.35rem; border-radius:3px;">&#x1F48E; PLATINUM</span>' : ''}</td>
                            <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${escapeHTML(u.email)}</td>
                            <td style="padding:0.6rem 1rem;"><span style="color:${roleColors[uRole]}; font-size:0.8rem; font-weight:600; text-transform:uppercase;">${escapeHTML(uRole)}</span></td>
                            <td style="padding:0.6rem 1rem;"><span style="color:${isSuspended ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem; font-weight:600;">${isSuspended ? '\u{26D4} SUSPENDED' : '\u{2705} ACTIVE'}</span></td>
                            <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${joined}</td>
                            <td style="padding:0.6rem 1rem; text-align:right;">
                                ${!isProtected ? `
                                <div class="admin-action-btns">
                                    <select class="roleSelect" data-id="${u.id}" style="background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); padding:0.3rem 0.4rem; border-radius:4px; font-size:0.8rem; cursor:pointer;">
                                        ${assignableRoles.map(r => `<option value="${r}" ${r === uRole ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
                                    </select>
                                    <button class="suspendBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:${isSuspended ? 'var(--success)' : 'var(--danger)'}; color:${isSuspended ? 'var(--success)' : 'var(--danger)'};">${isSuspended ? '\u{2705} Reinstate' : '\u{26A0}\u{FE0F} Suspend'}</button>
                                    <button class="platinumBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:${u.platinum ? '#a855f7' : 'var(--text-muted)'}; color:${u.platinum ? '#a855f7' : 'var(--text-muted)'};">${u.platinum ? '\u{1F48E} Revoke Platinum' : '\u{1F48E} Grant Platinum'}</button>
                                    <button class="resetPwBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:var(--accent); color:var(--accent);">\u{1F511} Reset PW</button>
                                    <button class="delUserBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:var(--danger); color:var(--danger);">\u{1F5D1}\u{FE0F} Delete</button>
                                </div>
                                ` : '<span style="font-size:0.8rem; color:#a855f7; font-weight:600;">Owner \u{1F451}</span>'}
                            </td>
                        </tr>`;
                }).join('');

            if (paginationEl) paginationEl.innerHTML = paginationHTML(filtered.length, userPage, 'user');
            wireUpUserActions();
        }

        function wireUpFigureActions() {
            document.querySelectorAll('.delFigBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = document.getElementById(`figRow-${btn.dataset.id}`);
                    if (!row) return;
                    // Don't open duplicate confirmation
                    if (row.nextElementSibling && row.nextElementSibling.classList.contains('delete-confirm-row')) return;
                    // Close any other open inline panels
                    document.querySelectorAll('.delete-confirm-row, .edit-form-row, .merge-form-row').forEach(r => r.remove());

                    const confirmRow = document.createElement('tr');
                    confirmRow.classList.add('delete-confirm-row');
                    confirmRow.innerHTML = `
                        <td colspan="7" style="padding:1rem; background:rgba(239,68,68,0.08); border:1px solid var(--danger); border-radius:6px;">
                            <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
                                <span style="color:var(--danger); font-weight:600;">Delete "${escapeHTML(btn.dataset.name)}" and ALL associated intel? This cannot be undone.</span>
                                <div style="display:flex; gap:0.5rem; margin-left:auto;">
                                    <button id="confirmDel-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:var(--danger); border-color:var(--danger);">Yes, Delete</button>
                                    <button id="cancelDel-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                                </div>
                            </div>
                        </td>`;
                    row.after(confirmRow);

                    document.getElementById(`cancelDel-${btn.dataset.id}`).addEventListener('click', () => confirmRow.remove());
                    document.getElementById(`confirmDel-${btn.dataset.id}`).addEventListener('click', async () => {
                        try {
                            const res = await self.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, { method: 'DELETE' });
                            if (res.ok) {
                                MOCK_FIGURES = MOCK_FIGURES.filter(f => f.id != btn.dataset.id);
                                figures = figures.filter(f => f.id != btn.dataset.id);
                                renderFigureTable();
                            } else {
                                const err = await res.json();
                                alert(err.error);
                            }
                        } catch (e) { console.error(e); }
                    });
                });
            });

            document.querySelectorAll('.editFigBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = document.getElementById(`figRow-${btn.dataset.id}`);
                    if (!row) return;
                    // Check if edit form already open
                    if (row.nextElementSibling && row.nextElementSibling.classList.contains('edit-form-row')) return;
                    // Close any other open inline panels
                    document.querySelectorAll('.delete-confirm-row, .edit-form-row, .merge-form-row').forEach(r => r.remove());

                    const editRow = document.createElement('tr');
                    editRow.classList.add('edit-form-row');
                    editRow.innerHTML = `
                        <td colspan="7" style="padding:1rem; background:var(--bg-surface); border:1px solid var(--border-light);">
                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem; margin-bottom:0.75rem;">
                                <div>
                                    <label style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.2rem;">Name</label>
                                    <input id="editName-${btn.dataset.id}" value="${escapeHTML(btn.dataset.name)}" style="width:100%; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.2rem;">Brand</label>
                                    <input id="editBrand-${btn.dataset.id}" value="${escapeHTML(btn.dataset.brand)}" style="width:100%; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.2rem;">Class Tier</label>
                                    <input id="editClass-${btn.dataset.id}" value="${escapeHTML(btn.dataset.class)}" style="width:100%; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.75rem;">
                                <div>
                                    <label style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.2rem;">Product Line</label>
                                    <input id="editLine-${btn.dataset.id}" value="${escapeHTML(btn.dataset.line)}" style="width:100%; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.2rem;">MSRP</label>
                                    <input id="editMsrp-${btn.dataset.id}" value="${btn.dataset.msrp || ''}" type="number" step="0.01" style="width:100%; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                </div>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button id="saveEdit-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem;">Save</button>
                                <button id="cancelEdit-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                            </div>
                        </td>`;
                    row.after(editRow);

                    document.getElementById(`cancelEdit-${btn.dataset.id}`).addEventListener('click', () => editRow.remove());
                    document.getElementById(`saveEdit-${btn.dataset.id}`).addEventListener('click', async () => {
                        const newName = document.getElementById(`editName-${btn.dataset.id}`).value.trim();
                        const newBrand = document.getElementById(`editBrand-${btn.dataset.id}`).value.trim();
                        const newClass = document.getElementById(`editClass-${btn.dataset.id}`).value.trim();
                        const newLine = document.getElementById(`editLine-${btn.dataset.id}`).value.trim();
                        const msrpVal = document.getElementById(`editMsrp-${btn.dataset.id}`).value.trim();
                        const newMsrp = msrpVal !== '' ? parseFloat(msrpVal) : null;

                        if (!newName || !newBrand) { alert('Name and Brand are required.'); return; }

                        try {
                            const res = await self.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ name: newName, brand: newBrand, classTie: newClass, line: newLine, msrp: newMsrp })
                            });
                            if (res.ok) {
                                const fig = MOCK_FIGURES.find(f => f.id == btn.dataset.id);
                                if (fig) { fig.name = newName; fig.brand = newBrand; fig.classTie = newClass; fig.line = newLine; fig.msrp = newMsrp; }
                                const localFig = figures.find(f => f.id == btn.dataset.id);
                                if (localFig) { localFig.name = newName; localFig.brand = newBrand; localFig.classTie = newClass; localFig.line = newLine; localFig.msrp = newMsrp; }
                                renderFigureTable();
                            } else {
                                const err = await res.json().catch(() => ({}));
                                alert(err.error || 'Save failed.');
                            }
                        } catch (e) { console.error(e); alert('Connection error.'); }
                    });
                });
            });

            document.querySelectorAll('.mergeFigBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceId = btn.dataset.id;
                    const sourceName = btn.dataset.name;
                    const row = document.getElementById(`figRow-${sourceId}`);
                    if (!row) return;
                    // Don't open duplicate
                    if (row.nextElementSibling && row.nextElementSibling.classList.contains('merge-form-row')) return;
                    // Close any other open inline panels
                    document.querySelectorAll('.delete-confirm-row, .edit-form-row, .merge-form-row').forEach(r => r.remove());

                    const otherFigs = figures.filter(f => f.id != sourceId);
                    if (otherFigs.length === 0) { alert('No other figures to merge with.'); return; }

                    const mergeRow = document.createElement('tr');
                    mergeRow.classList.add('merge-form-row');
                    mergeRow.innerHTML = `
                        <td colspan="7" style="padding:1rem; background:rgba(251,191,36,0.08); border:1px solid #fbbf24; border-radius:6px;">
                            <div style="margin-bottom:0.5rem; color:#fbbf24; font-weight:600;">Merge "${escapeHTML(sourceName)}" into another figure</div>
                            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">All submissions, market data, and comments will be moved to the target. "${escapeHTML(sourceName)}" will be deleted.</div>
                            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                                <label style="font-size:0.8rem; color:var(--text-muted);">Target:</label>
                                <select id="mergeTarget-${sourceId}" style="flex:1; min-width:200px; max-width:400px; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px; font-size:0.85rem;">
                                    <option value="">-- Select target figure --</option>
                                    ${otherFigs.map(f => `<option value="${f.id}">${f.id}: ${escapeHTML(f.name)} (${escapeHTML(f.brand)})</option>`).join('')}
                                </select>
                                <button id="confirmMerge-${sourceId}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:#fbbf24; border-color:#fbbf24; color:#000;">Merge</button>
                                <button id="cancelMerge-${sourceId}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                            </div>
                        </td>`;
                    row.after(mergeRow);

                    document.getElementById(`cancelMerge-${sourceId}`).addEventListener('click', () => mergeRow.remove());
                    document.getElementById(`confirmMerge-${sourceId}`).addEventListener('click', async () => {
                        const targetId = parseInt(document.getElementById(`mergeTarget-${sourceId}`).value);
                        if (!targetId) { alert('Please select a target figure.'); return; }
                        const targetFig = figures.find(f => f.id === targetId);
                        if (!targetFig) { alert(`Figure ID ${targetId} not found.`); return; }

                        try {
                            const res = await self.authFetch(`${API_URL}/admin/figures/merge`, {
                                method: 'POST',
                                body: JSON.stringify({ sourceId: parseInt(sourceId), targetId })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                MOCK_FIGURES = MOCK_FIGURES.filter(f => f.id != sourceId);
                                figures = figures.filter(f => f.id != sourceId);
                                renderFigureTable();
                            } else {
                                const err = await res.json();
                                alert(err.error || 'Merge failed.');
                            }
                        } catch (e) { console.error(e); alert('Connection error.'); }
                    });
                });
            });
        }

        function wireUpUserActions() {
            document.querySelectorAll('.roleSelect').forEach(sel => {
                sel.addEventListener('change', async () => {
                    const newRole = sel.value;
                    if (!confirm(`Change this user's role to ${newRole.toUpperCase()}?`)) {
                        // Revert selection
                        self.renderAdmin(container);
                        return;
                    }
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${sel.dataset.id}/role`, {
                            method: 'PUT',
                            body: JSON.stringify({ role: newRole })
                        });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); self.renderAdmin(container); }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.suspendBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/suspend`, { method: 'PUT' });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.platinumBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/platinum`, { method: 'PUT' });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.resetPwBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const newPw = prompt(`Enter new password for "${btn.dataset.name}":`);
                    if (!newPw || newPw.length < 8) { if (newPw !== null) alert('Password must be at least 8 characters, with uppercase, lowercase, and a number.'); return; }
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/reset-password`, {
                            method: 'POST',
                            body: JSON.stringify({ newPassword: newPw })
                        });
                        if (res.ok) { alert(`Password reset for "${btn.dataset.name}".`); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.delUserBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Permanently delete user "${btn.dataset.name}"? This cannot be undone.`)) return;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            users = users.filter(u => u.id != btn.dataset.id);
                            renderUserTable();
                        }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });
        }

        function renderBrandTable() {
            const filtered = filterBrands();
            const paged = paginate(filtered, brandPage);
            const tbody = document.getElementById('adminBrandTbody');
            const paginationEl = document.getElementById('adminBrandPagination');
            const countEl = document.getElementById('adminBrandCount');
            if (!tbody) return;

            if (countEl) countEl.textContent = filtered.length;
            tbody.innerHTML = paged.length === 0
                ? '<tr><td colspan="5" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No brands match your search.</td></tr>'
                : paged.map(b => `
                    <tr style="border-top:1px solid var(--border-light);" id="brandRow-${b.id}">
                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${b.id}</td>
                        <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(b.name)}</td>
                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${b.approved_by && b.approved_by.startsWith('auto:') ? '<span style="color:#34d399; font-weight:600;" title="Auto-approved (Action Figures category)">auto</span> <span style="opacity:0.7;">' + escapeHTML(b.approved_by.slice(5)) + '</span>' : escapeHTML(b.approved_by || '\u2014')}</td>
                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${b.created_at ? new Date(b.created_at).toLocaleDateString() : '\u2014'}</td>
                        <td style="padding:0.6rem 1rem; text-align:right;">
                            <div class="admin-action-btns">
                                <button class="editBrandBtn" data-id="${b.id}" data-name="${escapeHTML(b.name)}">\u{270F}\u{FE0F} Edit</button>
                                <button class="delBrandBtn" data-id="${b.id}" data-name="${escapeHTML(b.name)}" style="border-color:var(--danger); color:var(--danger);">\u{1F5D1}\u{FE0F} Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');

            if (paginationEl) paginationEl.innerHTML = paginationHTML(filtered.length, brandPage, 'brand');
            wireUpBrandActions();
        }

        function wireUpBrandActions() {
            document.querySelectorAll('.editBrandBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = document.getElementById(`brandRow-${btn.dataset.id}`);
                    if (!row) return;
                    if (row.nextElementSibling && row.nextElementSibling.classList.contains('brand-edit-row')) return;
                    document.querySelectorAll('.brand-edit-row, .brand-delete-row').forEach(r => r.remove());

                    const editRow = document.createElement('tr');
                    editRow.classList.add('brand-edit-row');
                    editRow.innerHTML = `
                        <td colspan="5" style="padding:1rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:6px;">
                            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                                <label style="font-size:0.8rem; color:var(--text-muted);">Brand Name:</label>
                                <input id="editBrandName-${btn.dataset.id}" value="${escapeHTML(btn.dataset.name)}" style="flex:1; min-width:200px; max-width:400px; padding:0.4rem 0.6rem; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px;">
                                <button id="saveBrandEdit-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem;">Save</button>
                                <button id="cancelBrandEdit-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                            </div>
                        </td>`;
                    row.after(editRow);

                    document.getElementById(`cancelBrandEdit-${btn.dataset.id}`).addEventListener('click', () => editRow.remove());
                    document.getElementById(`saveBrandEdit-${btn.dataset.id}`).addEventListener('click', async () => {
                        const newName = document.getElementById(`editBrandName-${btn.dataset.id}`).value.trim();
                        if (!newName || newName === btn.dataset.name) { editRow.remove(); return; }
                        try {
                            const res = await self.authFetch(`${API_URL}/admin/brands/${btn.dataset.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ name: newName })
                            });
                            if (res.ok) {
                                const brand = approvedBrands.find(b => b.id == btn.dataset.id);
                                if (brand) brand.name = newName;
                                figures.forEach(f => { if (f.brand === btn.dataset.name) f.brand = newName; });
                                MOCK_FIGURES.forEach(f => { if (f.brand === btn.dataset.name) f.brand = newName; });
                                renderBrandTable();
                                renderFigureTable();
                            } else {
                                const err = await res.json();
                                alert(err.error);
                            }
                        } catch (e) { console.error(e); }
                    });
                });
            });

            document.querySelectorAll('.delBrandBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = document.getElementById(`brandRow-${btn.dataset.id}`);
                    if (!row) return;
                    if (row.nextElementSibling && row.nextElementSibling.classList.contains('brand-delete-row')) return;
                    document.querySelectorAll('.brand-edit-row, .brand-delete-row').forEach(r => r.remove());

                    const confirmRow = document.createElement('tr');
                    confirmRow.classList.add('brand-delete-row');
                    confirmRow.innerHTML = `
                        <td colspan="5" style="padding:1rem; background:rgba(239,68,68,0.08); border:1px solid var(--danger); border-radius:6px;">
                            <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
                                <span style="color:var(--danger); font-weight:600;">Remove "${escapeHTML(btn.dataset.name)}" from approved brands? Existing figures won't be affected.</span>
                                <div style="display:flex; gap:0.5rem; margin-left:auto;">
                                    <button id="confirmBrandDel-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:var(--danger); border-color:var(--danger);">Yes, Remove</button>
                                    <button id="cancelBrandDel-${btn.dataset.id}" class="btn" style="padding:0.4rem 1rem; font-size:0.8rem; background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                                </div>
                            </div>
                        </td>`;
                    row.after(confirmRow);

                    document.getElementById(`cancelBrandDel-${btn.dataset.id}`).addEventListener('click', () => confirmRow.remove());
                    document.getElementById(`confirmBrandDel-${btn.dataset.id}`).addEventListener('click', async () => {
                        try {
                            const res = await self.authFetch(`${API_URL}/admin/brands/${btn.dataset.id}`, { method: 'DELETE' });
                            if (res.ok) {
                                approvedBrands = approvedBrands.filter(b => b.id != btn.dataset.id);
                                renderBrandTable();
                            } else {
                                const err = await res.json();
                                alert(err.error);
                            }
                        } catch (e) { console.error(e); }
                    });
                });
            });
        }

        function renderPendingBrands() {
            const el = document.getElementById('pendingBrandsSection');
            if (!el) return;

            if (pendingBrands.length === 0) {
                el.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">No pending brand requests.</div>';
            } else {
                el.innerHTML = `
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Brand Name</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Requested By</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">For Figure</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Date</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingBrands.map(pb => `
                                <tr style="border-top:1px solid var(--border-light);">
                                    <td style="padding:0.6rem 1rem; font-weight:600; color:#fbbf24;">${escapeHTML(pb.name)}</td>
                                    <td style="padding:0.6rem 1rem;">${escapeHTML(pb.requested_by)}</td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${escapeHTML(pb.figure_name || '\u2014')}</td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${pb.created_at ? new Date(pb.created_at).toLocaleDateString() : '\u2014'}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right;">
                                        <div class="admin-action-btns">
                                            <button class="approvePendingBtn" data-id="${pb.id}" data-name="${escapeHTML(pb.name)}" style="border-color:var(--success); color:var(--success);">\u2705 Approve</button>
                                            <button class="rejectPendingBtn" data-id="${pb.id}" data-name="${escapeHTML(pb.name)}" style="border-color:var(--danger); color:var(--danger);">\u274C Reject</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
            wireUpPendingBrandActions();

            // Update the count badge
            const countEl = document.getElementById('pendingBrandCount');
            if (countEl) countEl.textContent = pendingBrands.length;
        }

        function wireUpPendingBrandActions() {
            document.querySelectorAll('.approvePendingBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/pending-brands/${btn.dataset.id}/approve`, { method: 'POST' });
                        if (res.ok) {
                            const data = await res.json();
                            alert(data.message);
                            // Move from pending to approved locally
                            pendingBrands = pendingBrands.filter(pb => pb.id != btn.dataset.id);
                            // Re-fetch approved brands to get the new entry
                            const brRes = await self.authFetch(`${API_URL}/admin/brands`);
                            if (brRes.ok) approvedBrands = await brRes.json();
                            renderPendingBrands();
                            renderBrandTable();
                        } else {
                            const err = await res.json();
                            alert(err.error);
                        }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.rejectPendingBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Reject brand "${btn.dataset.name}"? The user will need to select an approved brand instead.`)) return;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/pending-brands/${btn.dataset.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            pendingBrands = pendingBrands.filter(pb => pb.id != btn.dataset.id);
                            renderPendingBrands();
                        } else {
                            const err = await res.json();
                            alert(err.error);
                        }
                    } catch (e) { console.error(e); }
                });
            });
        }

        function wireUpTradeActions() {
            document.querySelectorAll('.approveTradeBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const res = await self.authFetch(`${API_URL}/collection/validate/${btn.dataset.id}`, { method: 'PUT' });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.rejectTradeBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Reject this trade listing?')) return;
                    try {
                        const res = await self.authFetch(`${API_URL}/collection/validate/${btn.dataset.id}`, { method: 'DELETE' });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });
        }

        container.innerHTML = `
            <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">\u{2699}\u{FE0F} ${isMod ? 'Mod' : 'Admin'} Panel</h2>
                <p style="color:var(--text-secondary); font-size:1rem; margin-bottom:2rem;">System management and analytics for <span style="color:${{owner:'#a855f7',admin:'#fbbf24',moderator:'#3b82f6'}[userRole]}; font-weight:700;">${{owner:'\u{2B50} Owner',admin:'\u{2605} Admin',moderator:'\u{1F6E1}\u{FE0F} Moderator'}[userRole]}</span></p>

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
                        <div class="stat-label">Community Posts</div>
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

                <!-- PAGE VIEW ANALYTICS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">&#128065; Page Views</h3>
                <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:1rem; margin-bottom:1.5rem;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${pageviewSummary.totalViews || 0}</div>
                        <div class="stat-label">Total Views</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${pageviewSummary.uniqueVisitors || 0}</div>
                        <div class="stat-label">Unique Visitors</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:#10b981;">${pageviewSummary.today || 0}</div>
                        <div class="stat-label">Today</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:#3b82f6;">${pageviewSummary.thisWeek || 0}</div>
                        <div class="stat-label">This Week</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:#a855f7;">${pageviewSummary.thisMonth || 0}</div>
                        <div class="stat-label">This Month</div>
                    </div>
                </div>
                <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                    <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem;">
                        <div style="display:flex; gap:0.5rem;">
                            <button class="pv-period-btn btn-sm active" data-period="daily" style="padding:0.4rem 1rem; font-size:0.8rem;">Daily</button>
                            <button class="pv-period-btn btn-sm" data-period="monthly" style="padding:0.4rem 1rem; font-size:0.8rem;">Monthly</button>
                            <button class="pv-period-btn btn-sm" data-period="yearly" style="padding:0.4rem 1rem; font-size:0.8rem;">Yearly</button>
                        </div>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <label style="font-size:0.75rem; color:var(--text-muted);">From</label>
                            <input type="date" id="pvFrom" style="padding:0.3rem 0.5rem; background:var(--bg-input, var(--bg-panel)); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px; font-size:0.8rem;">
                            <label style="font-size:0.75rem; color:var(--text-muted);">To</label>
                            <input type="date" id="pvTo" style="padding:0.3rem 0.5rem; background:var(--bg-input, var(--bg-panel)); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px; font-size:0.8rem;">
                        </div>
                        <button id="pvLoadBtn" class="btn" style="padding:0.4rem 1rem; font-size:0.85rem;">Load</button>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                            <thead>
                                <tr style="background:var(--bg-panel); text-align:left;">
                                    <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Period</th>
                                    <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Views</th>
                                    <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Unique Visitors</th>
                                </tr>
                            </thead>
                            <tbody id="pvDetailTbody">
                                <tr><td colspan="3" style="padding:1rem; text-align:center; color:var(--text-muted);">Click "Load" to fetch data</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                ${isFullAdmin ? `
                <!-- HQ UPDATE BROADCAST -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">&#x1F4E1; HQ Update Broadcast</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Send a notification to all active users. Respects each user's HQ Updates notification preferences.</p>
                <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                    <textarea id="hqUpdateMsg" maxlength="500" rows="3" placeholder="Enter your HQ update message..." style="width:100%; padding:0.6rem 0.8rem; background:var(--bg-input, var(--bg-panel)); color:var(--text-primary); border:1px solid var(--border-light); border-radius:var(--radius-sm); font-size:0.85rem; resize:vertical; font-family:inherit;"></textarea>
                    <div style="display:flex; align-items:center; gap:1rem; margin-top:0.75rem;">
                        <button id="sendHqUpdate" class="btn" style="padding:0.5rem 1.25rem; font-size:0.85rem;">Send to All Users</button>
                        <span id="hqUpdateStatus" style="color:var(--text-muted); font-size:0.8rem;"></span>
                    </div>
                </div>
                ` : ''}

                ${isFullAdmin ? `
                <!-- TICKER SETTINGS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">&#x1F4F0; Ticker Settings</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Control what data the global ticker displays and how many items it shows.</p>
                <div class="card" style="padding:1.5rem; margin-bottom:2.5rem;">
                    <div style="display:flex; gap:2rem; align-items:flex-start; flex-wrap:wrap;">
                        <div>
                            <label style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.5rem;">Display Mode</label>
                            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                                <button class="ticker-mode-btn btn-sm${tickerSettings.ticker_mode === 'grade' ? ' active' : ''}" data-mode="grade" style="padding:0.4rem 1rem; font-size:0.8rem;">Grade</button>
                                <button class="ticker-mode-btn btn-sm${tickerSettings.ticker_mode === 'approval' ? ' active' : ''}" data-mode="approval" style="padding:0.4rem 1rem; font-size:0.8rem;">Approval</button>
                                <button class="ticker-mode-btn btn-sm${tickerSettings.ticker_mode === 'pricing' ? ' active' : ''}" data-mode="pricing" style="padding:0.4rem 1rem; font-size:0.8rem;">Pricing</button>
                                <button class="ticker-mode-btn btn-sm${tickerSettings.ticker_mode === 'all' ? ' active' : ''}" data-mode="all" style="padding:0.4rem 1rem; font-size:0.8rem;">All</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.5rem;">Items Shown</label>
                            <input type="number" id="tickerLengthInput" value="${tickerSettings.ticker_length}" min="5" max="100" style="width:80px; padding:0.4rem 0.6rem; background:var(--bg-input, var(--bg-panel)); color:var(--text-primary); border:1px solid var(--border-light); border-radius:4px; font-size:0.85rem;">
                        </div>
                        <div style="align-self:flex-end;">
                            <button id="saveTickerSettings" class="btn" style="padding:0.5rem 1.25rem; font-size:0.85rem;">Save</button>
                        </div>
                    </div>
                    <div id="tickerSettingsMsg" style="margin-top:0.75rem; font-size:0.8rem;"></div>
                </div>
                ` : ''}

                ${isFullAdmin ? `
                <!-- DATABASE BACKUP -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">\u{1F4BE} Database Backup</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:0.75rem;">Download a full JSON export of all database tables. Sensitive fields (password hashes, reset tokens) are excluded.</p>
                <button id="adminBackupBtn" style="background:linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color:white; border:none; padding:0.6rem 1.2rem; border-radius:var(--radius-sm); cursor:pointer; font-size:0.85rem; font-weight:600; letter-spacing:0.03em;">Download Backup</button>
                <span id="adminBackupStatus" style="color:var(--text-muted); font-size:0.8rem; margin-left:0.75rem;"></span>

                <!-- SYSTEM LOGS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">\u{1F4DC} System Logs</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Authentication events, admin actions, and security audit trail.</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <div class="admin-log-filters" style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-light); display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <select id="adminLogAction" style="padding:0.4rem 0.6rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.8rem;">
                            <option value="">All Actions</option>
                            <optgroup label="Auth Events">
                                <option value="LOGIN_SUCCESS">Login Success</option>
                                <option value="LOGIN_FAILURE">Login Failure</option>
                                <option value="USER_REGISTER">Registration</option>
                                <option value="PASSWORD_CHANGE">Password Change</option>
                                <option value="PASSWORD_RESET">Password Reset</option>
                            </optgroup>
                            <optgroup label="Admin Actions">
                                <option value="ADMIN_PASSWORD_RESET">Admin Password Reset</option>
                                <option value="ADMIN_CREATE_USER">Admin Create User</option>
                                <option value="ADMIN_ROLE_CHANGE">Role Change</option>
                                <option value="ADMIN_SUSPEND">Suspend/Reinstate</option>
                                <option value="ADMIN_DELETE_USER">Delete User</option>
                                <option value="ADMIN_WIPE_SUBMISSIONS">Wipe Submissions</option>
                                <option value="ADMIN_LB_UPDATE">Leaderboard Update</option>
                                <option value="MOD_LB_VISIBILITY">Mod Visibility</option>
                            </optgroup>
                        </select>
                        <input type="text" id="adminLogActor" placeholder="Filter by user..." style="padding:0.4rem 0.6rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.8rem; width:140px;">
                        <input type="text" id="adminLogSearch" placeholder="Search details..." style="padding:0.4rem 0.6rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.8rem; flex:1; min-width:120px;">
                        <button id="adminLogRefresh" style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.4rem 0.6rem; border-radius:var(--radius-sm); font-size:0.8rem;" title="Refresh">\u{1F504}</button>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                            <thead>
                                <tr style="background:var(--bg-panel); text-align:left;">
                                    <th style="padding:0.6rem 0.75rem; font-weight:600; white-space:nowrap;">Action</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">Actor</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">Target</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">Details</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">IP</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600; white-space:nowrap;">Time</th>
                                </tr>
                            </thead>
                            <tbody id="adminLogTbody">
                                <tr><td colspan="6" style="padding:1.5rem; text-align:center; color:var(--text-muted);">Loading logs...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="adminLogPagination" style="display:flex; justify-content:center; align-items:center; gap:0.5rem; padding:0.75rem; border-top:1px solid var(--border-light);"></div>
                </div>
                ` : ''}

                <!-- LEADERBOARD CONTROLS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">\u{1F3C6} Leaderboard Controls (<span id="adminLbCount">${lbSettings.length}</span>)</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Pin, hide, or override rank positions for figures on the leaderboard.${isMod ? ' As a moderator, you can toggle visibility.' : ''}</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <div style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-light); display:flex; gap:0.5rem; align-items:center;">
                        <input type="text" id="adminLbSearch" placeholder="Search figures..." style="flex:1; padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.85rem;">
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                            <thead>
                                <tr style="background:var(--bg-panel); text-align:left; position:sticky; top:0;">
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">Figure</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600;">Brand</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600; text-align:center;">Grade</th>
                                    <th style="padding:0.6rem 0.75rem; font-weight:600; text-align:center;">Visible</th>
                                    ${isFullAdmin ? '<th style="padding:0.6rem 0.75rem; font-weight:600; text-align:center;">Pinned</th>' : ''}
                                    ${isFullAdmin ? '<th style="padding:0.6rem 0.75rem; font-weight:600; text-align:center;">Rank Override</th>' : ''}
                                    ${isFullAdmin ? '<th style="padding:0.6rem 0.75rem; font-weight:600;">Category</th>' : ''}
                                </tr>
                            </thead>
                            <tbody id="adminLbTbody"></tbody>
                        </table>
                    </div>
                </div>

                ${isFullAdmin ? `
                <!-- TOP RATED TOYS (login page showcase) -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">\u{1F3C6} Top Rated Toys \u{2014} Login Showcase (${topRated.length})</h3>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">These appear on the login page. Figures need \u{2265} 2 reviews to qualify. Delete a figure to remove it entirely.</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    ${topRated.length === 0 ? '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No figures with 2+ reviews yet.</div>' : `
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; font-weight:600; width:50px;">#</th>
                                <th style="padding:0.75rem 1rem; font-weight:600;">Figure</th>
                                <th style="padding:0.75rem 1rem; font-weight:600;">Brand</th>
                                <th style="padding:0.75rem 1rem; font-weight:600;">Grade</th>
                                <th style="padding:0.75rem 1rem; font-weight:600;">Reviews</th>
                                <th style="padding:0.75rem 1rem; font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topRated.map((fig, i) => {
                                const grade = parseFloat(fig.avgGrade);
                                const gradeColor = grade >= 85 ? 'var(--success)' : grade >= 70 ? 'var(--neutral)' : grade >= 50 ? '#eab308' : 'var(--danger)';
                                return `
                                <tr style="border-top:1px solid var(--border-light);">
                                    <td style="padding:0.6rem 1rem; font-weight:800; color:${i < 3 ? '#fbbf24' : 'var(--text-muted)'};">${i + 1}</td>
                                    <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(fig.name)}</td>
                                    <td style="padding:0.6rem 1rem;">${escapeHTML(fig.brand || '')}</td>
                                    <td style="padding:0.6rem 1rem;"><span style="color:${gradeColor}; font-weight:700;">${fig.avgGrade}</span></td>
                                    <td style="padding:0.6rem 1rem;">${fig.submissions}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right;">
                                        <button class="delTopRatedBtn" data-id="${fig.id}" data-name="${escapeHTML(fig.name)}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">\u{1F5D1}\u{FE0F} Delete Figure</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                    `}
                </div>
                ` : ''}

                <!-- PENDING BRAND REQUESTS -->
                ${isFullAdmin && pendingBrands.length > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top:2.5rem; flex-wrap:wrap; gap:0.75rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:#fbbf24; margin:0;">\u{23F3} Pending Brand Requests (<span id="pendingBrandCount">${pendingBrands.length}</span>)</h3>
                </div>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Users have submitted these brands for approval (Transformers category only). Action Figure brands are auto-approved on submission.</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem; border:1px solid rgba(251,191,36,0.3);">
                    <div id="pendingBrandsSection"></div>
                </div>
                ` : ''}

                ${isFullAdmin ? `
                <!-- APPROVED BRANDS -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top:2.5rem; flex-wrap:wrap; gap:0.75rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin:0;">\u{1F3F7}\u{FE0F} Approved Brands (<span id="adminBrandCount">${approvedBrands.length}</span>)</h3>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="adminBrandSearch" placeholder="Search brands..." style="padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.85rem; width:200px;">
                        <input type="text" id="newBrandInput" placeholder="New brand name..." style="padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.85rem; width:200px;">
                        <button id="addBrandBtn" style="background:none; border:1px solid var(--success); color:var(--success); cursor:pointer; padding:0.4rem 0.8rem; border-radius:4px; font-size:0.8rem; font-weight:700; white-space:nowrap;">+ Add Brand</button>
                    </div>
                </div>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Only approved brands appear in the figure creation dropdown. Transformer brands require admin approval; Action Figure brands are auto-approved (shown as <span style="color:#34d399;">auto:</span> in Approved By).</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">ID</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Brand Name</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Approved By</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Date Added</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="adminBrandTbody"></tbody>
                    </table>
                    <div id="adminBrandPagination"></div>
                </div>
                ` : ''}

                ${(isFullAdmin || isPlatinum) && pendingTrades.length > 0 ? `
                <!-- PENDING TRADE LISTINGS -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top:2.5rem; flex-wrap:wrap; gap:0.75rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:#a855f7; margin:0;">&#x1F48E; Pending Trade Listings (<span id="pendingTradeCount">${pendingTrades.length}</span>)</h3>
                </div>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Users have marked these figures "For Trade" and are awaiting validation by an admin or platinum holder.</p>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem; border:1px solid rgba(168,85,247,0.3);">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">User</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Figure</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Brand</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Date</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingTrades.map(pt => `
                                <tr style="border-top:1px solid var(--border-light);">
                                    <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(pt.username)}</td>
                                    <td style="padding:0.6rem 1rem;">${escapeHTML(pt.figureName || pt.figure_name || '')}</td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${escapeHTML(pt.brand || '')}</td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${pt.created_at ? new Date(pt.created_at).toLocaleDateString() : '\u2014'}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right;">
                                        <div class="admin-action-btns">
                                            <button class="approveTradeBtn" data-id="${pt.id}" style="border-color:var(--success); color:var(--success);">\u2705 Approve</button>
                                            <button class="rejectTradeBtn" data-id="${pt.id}" style="border-color:var(--danger); color:var(--danger);">\u274C Reject</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                ${flags.length > 0 ? `
                <!-- FLAGGED BROADCASTS -->
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
                                    <div class="admin-action-btns">
                                        <button class="adminDeleteFlaggedPost btn" data-postid="${f.postId}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger, #ef4444); border-color:var(--danger, #ef4444);">Delete Post</button>
                                        <button class="adminDismissFlag btn" data-flagid="${f.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--bg-surface); border-color:var(--border-light); color:var(--text-secondary);">Dismiss</button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                ${isFullAdmin ? `
                <!-- FIGURE MANAGEMENT -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top:2.5rem; flex-wrap:wrap; gap:0.75rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin:0;">\u{1F3AF} Figure Management (<span id="adminFigCount">${figures.length}</span>)</h3>
                    <input type="text" id="adminFigSearch" placeholder="Search figures by name, brand, line..." style="padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.85rem; width:280px; max-width:100%;">
                </div>
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
                        <tbody id="adminFigTbody"></tbody>
                    </table>
                    <div id="adminFigPagination"></div>
                </div>

                <!-- USER MANAGEMENT -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.75rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin:0;">\u{1F465} User Management (<span id="adminUserCount">${users.length}</span>)</h3>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="adminUserSearch" placeholder="Search users by name, email..." style="padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.85rem; width:240px; max-width:100%;">
                        <button id="addAdminUserBtn" style="background:none; border:1px solid #fbbf24; color:#fbbf24; cursor:pointer; padding:0.4rem 0.8rem; border-radius:4px; font-size:0.8rem; font-weight:700; white-space:nowrap;">+ ADD USER</button>
                    </div>
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
                        <tbody id="adminUserTbody"></tbody>
                    </table>
                    <div id="adminUserPagination"></div>
                </div>
                ` : ''}
            </div>
        `;

        // ── HQ Update Broadcast ──────────────────────────────
        if (isFullAdmin) {
            document.getElementById('sendHqUpdate')?.addEventListener('click', async () => {
                const msgInput = document.getElementById('hqUpdateMsg');
                const statusEl = document.getElementById('hqUpdateStatus');
                const message = (msgInput?.value || '').trim();
                if (!message) { statusEl.innerHTML = '<span style="color:var(--danger);">Please enter a message.</span>'; return; }
                if (!confirm(`Send this HQ update to all active users?\n\n"${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`)) return;
                try {
                    const res = await self.authFetch(`${API_URL}/admin/hq-update`, {
                        method: 'POST',
                        body: JSON.stringify({ message })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        statusEl.innerHTML = `<span style="color:var(--success);">Sent to ${data.sent} users.</span>`;
                        msgInput.value = '';
                    } else {
                        statusEl.innerHTML = `<span style="color:var(--danger);">${escapeHTML(data.error)}</span>`;
                    }
                } catch (e) {
                    statusEl.innerHTML = '<span style="color:var(--danger);">Failed to send. Try again.</span>';
                }
            });
        }

        // ── Ticker Settings ──────────────────────────────────
        if (isFullAdmin) {
            let selectedMode = tickerSettings.ticker_mode || 'all';
            document.querySelectorAll('.ticker-mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.ticker-mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedMode = btn.dataset.mode;
                });
            });
            document.getElementById('saveTickerSettings')?.addEventListener('click', async () => {
                const length = parseInt(document.getElementById('tickerLengthInput').value);
                const msgEl = document.getElementById('tickerSettingsMsg');
                try {
                    const res = await self.authFetch(`${API_URL}/admin/ticker-settings`, {
                        method: 'PUT',
                        body: JSON.stringify({ ticker_mode: selectedMode, ticker_length: length })
                    });
                    if (res.ok) {
                        msgEl.innerHTML = '<span style="color:var(--success);">Settings saved. Ticker will update on next page load.</span>';
                    } else {
                        const err = await res.json();
                        msgEl.innerHTML = `<span style="color:var(--danger);">${escapeHTML(err.error)}</span>`;
                    }
                } catch (e) {
                    msgEl.innerHTML = '<span style="color:var(--danger);">Connection error.</span>';
                }
            });
        }

        // ── Page View Analytics ─────────────────────────────
        {
            let pvPeriod = 'daily';
            document.querySelectorAll('.pv-period-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.pv-period-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    pvPeriod = btn.dataset.period;
                });
            });

            const pvLoadBtn = document.getElementById('pvLoadBtn');
            if (pvLoadBtn) {
                pvLoadBtn.addEventListener('click', async () => {
                    const tbody = document.getElementById('pvDetailTbody');
                    tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem; text-align:center; color:var(--text-muted);">Loading...</td></tr>';
                    try {
                        let url = `${API_URL}/admin/pageviews?period=${pvPeriod}`;
                        const from = document.getElementById('pvFrom').value;
                        const to = document.getElementById('pvTo').value;
                        if (from) url += `&from=${from}`;
                        if (to) url += `&to=${to}`;
                        const res = await self.authFetch(url);
                        if (!res.ok) throw new Error('Failed to load');
                        const json = await res.json();
                        if (!json.data || json.data.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem; text-align:center; color:var(--text-muted);">No data for this period</td></tr>';
                            return;
                        }
                        tbody.innerHTML = json.data.map(row => {
                            const d = new Date(row.period);
                            let label;
                            if (pvPeriod === 'yearly') label = d.getFullYear();
                            else if (pvPeriod === 'monthly') label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                            else label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                            return `<tr style="border-top:1px solid var(--border-light);">
                                <td style="padding:0.6rem 1rem;">${label}</td>
                                <td style="padding:0.6rem 1rem; text-align:right; font-weight:600;">${row.views.toLocaleString()}</td>
                                <td style="padding:0.6rem 1rem; text-align:right;">${row.uniqueVisitors.toLocaleString()}</td>
                            </tr>`;
                        }).join('');
                    } catch (e) {
                        tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem; text-align:center; color:var(--danger);">Error loading data</td></tr>';
                    }
                });
            }
        }

        // ── System Logs ──────────────────────────────────────
        if (isFullAdmin) {
            let logPage = 1;
            const LOG_PAGE_SIZE = 50;

            const logActionBadge = (action) => {
                const map = {
                    LOGIN_SUCCESS: { label: 'LOGIN OK', color: '#10b981' },
                    LOGIN_FAILURE: { label: 'LOGIN FAIL', color: '#ef4444' },
                    USER_REGISTER: { label: 'REGISTER', color: '#3b82f6' },
                    PASSWORD_CHANGE: { label: 'PW CHANGE', color: '#f59e0b' },
                    PASSWORD_RESET: { label: 'PW RESET', color: '#f59e0b' },
                    ADMIN_PASSWORD_RESET: { label: 'ADMIN PW', color: '#a855f7' },
                    ADMIN_CREATE_USER: { label: 'CREATE USER', color: '#a855f7' },
                    ADMIN_ROLE_CHANGE: { label: 'ROLE CHANGE', color: '#a855f7' },
                    ADMIN_SUSPEND: { label: 'SUSPEND', color: '#a855f7' },
                    ADMIN_DELETE_USER: { label: 'DELETE USER', color: '#ef4444' },
                    ADMIN_WIPE_SUBMISSIONS: { label: 'WIPE SUBS', color: '#ef4444' },
                    ADMIN_CLEANUP: { label: 'CLEANUP', color: '#6b7280' },
                    ADMIN_LB_UPDATE: { label: 'LB UPDATE', color: '#6b7280' },
                    MOD_LB_VISIBILITY: { label: 'MOD VIS', color: '#6b7280' },
                    ADMIN_TICKER_SETTINGS: { label: 'TICKER CFG', color: '#6b7280' }
                };
                const m = map[action] || { label: action, color: 'var(--text-muted)' };
                return `<span class="admin-log-badge" style="background:${m.color}20; color:${m.color}; border:1px solid ${m.color}40; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.7rem; font-weight:700; white-space:nowrap;">${escapeHTML(m.label)}</span>`;
            };

            async function loadLogs() {
                const tbody = document.getElementById('adminLogTbody');
                const pagination = document.getElementById('adminLogPagination');
                if (!tbody) return;

                tbody.innerHTML = '<tr><td colspan="6" style="padding:1.5rem; text-align:center; color:var(--text-muted);">Loading...</td></tr>';

                const actionFilter = document.getElementById('adminLogAction')?.value || '';
                const actorFilter = document.getElementById('adminLogActor')?.value.trim() || '';
                const searchFilter = document.getElementById('adminLogSearch')?.value.trim() || '';

                const params = new URLSearchParams({ page: logPage, limit: LOG_PAGE_SIZE });
                if (actionFilter) params.set('action', actionFilter);
                if (actorFilter) params.set('actor', actorFilter);
                if (searchFilter) params.set('search', searchFilter);

                try {
                    const res = await self.authFetch(`${API_URL}/admin/audit-logs?${params}`);
                    if (!res.ok) throw new Error('Failed to load');
                    const data = await res.json();

                    if (data.logs.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No logs found.</td></tr>';
                    } else {
                        tbody.innerHTML = data.logs.map(l => `
                            <tr style="border-top:1px solid var(--border-light);">
                                <td style="padding:0.5rem 0.75rem;">${logActionBadge(l.action)}</td>
                                <td style="padding:0.5rem 0.75rem; font-weight:600; font-size:0.85rem;">${escapeHTML(l.actor || '\u2014')}</td>
                                <td style="padding:0.5rem 0.75rem; font-size:0.85rem; color:var(--text-secondary);">${escapeHTML(l.target || '\u2014')}</td>
                                <td style="padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--text-muted); max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(l.details || '')}">${escapeHTML(l.details || '\u2014')}</td>
                                <td style="padding:0.5rem 0.75rem; font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${escapeHTML(l.ip_address || '\u2014')}</td>
                                <td style="padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--text-muted); white-space:nowrap;" title="${l.created_at ? new Date(l.created_at).toLocaleString() : ''}">${l.created_at ? self.timeAgo(l.created_at) : '\u2014'}</td>
                            </tr>
                        `).join('');
                    }

                    // Pagination
                    if (pagination) {
                        if (data.totalPages <= 1) {
                            pagination.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">${data.total} log${data.total !== 1 ? 's' : ''}</span>`;
                        } else {
                            pagination.innerHTML = `
                                <button class="admin-log-page-btn" data-page="${logPage - 1}" ${logPage <= 1 ? 'disabled' : ''} style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">&laquo; Prev</button>
                                <span style="font-size:0.8rem; color:var(--text-muted);">Page ${data.page} of ${data.totalPages} (${data.total} total)</span>
                                <button class="admin-log-page-btn" data-page="${logPage + 1}" ${logPage >= data.totalPages ? 'disabled' : ''} style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">Next &raquo;</button>
                            `;
                            pagination.querySelectorAll('.admin-log-page-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    logPage = parseInt(btn.dataset.page);
                                    loadLogs();
                                });
                            });
                        }
                    }
                } catch (e) {
                    tbody.innerHTML = '<tr><td colspan="6" style="padding:1.5rem; text-align:center; color:var(--danger);">Failed to load logs.</td></tr>';
                    console.error('Audit log load error:', e);
                }
            }

            // Wire up filter controls
            let logDebounce = null;
            const logFilterHandler = () => { logPage = 1; clearTimeout(logDebounce); logDebounce = setTimeout(loadLogs, 300); };

            const logActionEl = document.getElementById('adminLogAction');
            const logActorEl = document.getElementById('adminLogActor');
            const logSearchEl = document.getElementById('adminLogSearch');
            const logRefreshEl = document.getElementById('adminLogRefresh');

            if (logActionEl) logActionEl.addEventListener('change', () => { logPage = 1; loadLogs(); });
            if (logActorEl) logActorEl.addEventListener('input', logFilterHandler);
            if (logSearchEl) logSearchEl.addEventListener('input', logFilterHandler);
            if (logRefreshEl) logRefreshEl.addEventListener('click', loadLogs);

            // Initial load
            loadLogs();
        }

        // Backup button handler
        const backupBtn = document.getElementById('adminBackupBtn');
        const backupStatus = document.getElementById('adminBackupStatus');
        if (backupBtn) {
            backupBtn.addEventListener('click', async () => {
                backupBtn.disabled = true;
                backupBtn.textContent = 'Generating...';
                if (backupStatus) backupStatus.textContent = '';
                try {
                    const res = await self.authFetch(`${API_URL}/admin/backup`, { method: 'POST' });
                    if (!res.ok) throw new Error('Backup failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `datatoyz-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    if (backupStatus) backupStatus.textContent = 'Download started.';
                } catch (e) {
                    if (backupStatus) backupStatus.textContent = 'Backup failed. Try again.';
                }
                backupBtn.disabled = false;
                backupBtn.textContent = 'Download Backup';
            });
        }

        // Leaderboard controls table render
        let lbSearch = '';
        function renderLbTable() {
            const tbody = document.getElementById('adminLbTbody');
            if (!tbody) return;
            const q = lbSearch.toLowerCase();
            const filtered = q ? lbSettings.filter(f => f.name.toLowerCase().includes(q) || (f.brand || '').toLowerCase().includes(q)) : lbSettings;
            const countEl = document.getElementById('adminLbCount');
            if (countEl) countEl.textContent = filtered.length;
            tbody.innerHTML = filtered.length === 0
                ? `<tr><td colspan="${isFullAdmin ? 7 : 4}" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No figures match your search.</td></tr>`
                : filtered.map(f => {
                    const gradeColor = f.avgGrade >= 80 ? '#22c55e' : f.avgGrade >= 60 ? '#f59e0b' : '#ef4444';
                    return `
                    <tr style="border-top:1px solid var(--border-light); ${f.lbHidden ? 'opacity:0.5;' : ''}">
                        <td style="padding:0.5rem 0.75rem; font-weight:600; font-size:0.85rem;">${escapeHTML(f.name)}</td>
                        <td style="padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--text-muted);">${escapeHTML(f.brand || '')}</td>
                        <td style="padding:0.5rem 0.75rem; text-align:center; font-weight:700; color:${gradeColor};">${f.avgGrade !== null ? Math.round(f.avgGrade) : '\u{2014}'}</td>
                        <td style="padding:0.5rem 0.75rem; text-align:center;">
                            <button class="lbVisBtn" data-id="${f.id}" data-hidden="${f.lbHidden}" style="background:none; border:1px solid ${f.lbHidden ? 'var(--danger)' : 'var(--success)'}; color:${f.lbHidden ? 'var(--danger)' : 'var(--success)'}; cursor:pointer; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem;">${f.lbHidden ? '\u{1F6AB} Hidden' : '\u{1F441}\u{FE0F} Visible'}</button>
                        </td>
                        ${isFullAdmin ? `
                        <td style="padding:0.5rem 0.75rem; text-align:center;">
                            <button class="lbPinBtn" data-id="${f.id}" data-pinned="${f.lbPinned}" style="background:none; border:1px solid ${f.lbPinned ? '#fbbf24' : 'var(--border)'}; color:${f.lbPinned ? '#fbbf24' : 'var(--text-muted)'}; cursor:pointer; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem;">${f.lbPinned ? '\u{1F4CC} Pinned' : 'Pin'}</button>
                        </td>
                        <td style="padding:0.5rem 0.75rem; text-align:center;">
                            <input class="lbRankInput" data-id="${f.id}" type="number" min="1" placeholder="\u{2014}" value="${f.lbRankOverride || ''}" style="width:50px; padding:0.2rem 0.3rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:4px; font-size:0.8rem; text-align:center;">
                        </td>
                        <td style="padding:0.5rem 0.75rem;">
                            <select class="lbCatSelect" data-id="${f.id}" style="padding:0.2rem 0.3rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:4px; font-size:0.8rem;">
                                <option value="">None</option>
                                <option value="rising" ${f.lbCategory === 'rising' ? 'selected' : ''}>Rising</option>
                                <option value="sleeper" ${f.lbCategory === 'sleeper' ? 'selected' : ''}>Sleeper</option>
                            </select>
                        </td>
                        ` : ''}
                    </tr>`;
                }).join('');
            wireLbActions();
        }

        function wireLbActions() {
            // Visibility toggle (moderators + admins)
            document.querySelectorAll('.lbVisBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const newHidden = btn.dataset.hidden !== 'true';
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}/visibility`, {
                            method: 'PUT',
                            body: JSON.stringify({ hidden: newHidden })
                        });
                        if (res.ok) {
                            const fig = lbSettings.find(f => f.id == btn.dataset.id);
                            if (fig) fig.lbHidden = newHidden;
                            renderLbTable();
                        } else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            if (!isFullAdmin) return;

            // Pin toggle (admin only)
            document.querySelectorAll('.lbPinBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fig = lbSettings.find(f => f.id == btn.dataset.id);
                    if (!fig) return;
                    const newPinned = !fig.lbPinned;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}/leaderboard`, {
                            method: 'PUT',
                            body: JSON.stringify({ lb_pinned: newPinned, lb_hidden: fig.lbHidden, lb_rank_override: fig.lbRankOverride, lb_category: fig.lbCategory })
                        });
                        if (res.ok) { fig.lbPinned = newPinned; renderLbTable(); }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            // Rank override (admin only) — debounced on blur
            document.querySelectorAll('.lbRankInput').forEach(input => {
                input.addEventListener('change', async () => {
                    const fig = lbSettings.find(f => f.id == input.dataset.id);
                    if (!fig) return;
                    const val = input.value.trim() ? parseInt(input.value) : null;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/figures/${input.dataset.id}/leaderboard`, {
                            method: 'PUT',
                            body: JSON.stringify({ lb_pinned: fig.lbPinned, lb_hidden: fig.lbHidden, lb_rank_override: val, lb_category: fig.lbCategory })
                        });
                        if (res.ok) { fig.lbRankOverride = val; }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });

            // Category select (admin only)
            document.querySelectorAll('.lbCatSelect').forEach(sel => {
                sel.addEventListener('change', async () => {
                    const fig = lbSettings.find(f => f.id == sel.dataset.id);
                    if (!fig) return;
                    const cat = sel.value || null;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/figures/${sel.dataset.id}/leaderboard`, {
                            method: 'PUT',
                            body: JSON.stringify({ lb_pinned: fig.lbPinned, lb_hidden: fig.lbHidden, lb_rank_override: fig.lbRankOverride, lb_category: cat })
                        });
                        if (res.ok) { fig.lbCategory = cat; }
                        else { const err = await res.json(); alert(err.error); }
                    } catch (e) { console.error(e); }
                });
            });
        }

        renderLbTable();

        // Leaderboard search
        const lbSearchInput = document.getElementById('adminLbSearch');
        if (lbSearchInput) {
            lbSearchInput.addEventListener('input', () => {
                lbSearch = lbSearchInput.value.trim();
                renderLbTable();
            });
        }

        // Initial render of tables (admin-only)
        if (isFullAdmin) {
            renderFigureTable();
            renderUserTable();
            renderBrandTable();
            renderPendingBrands();
        }
        if (isFullAdmin || isPlatinum) {
            wireUpTradeActions();
        }

        // Wire up search inputs
        const figSearchInput = document.getElementById('adminFigSearch');
        if (figSearchInput) {
            figSearchInput.addEventListener('input', () => {
                figSearch = figSearchInput.value.trim();
                figPage = 1;
                renderFigureTable();
            });
        }

        const userSearchInput = document.getElementById('adminUserSearch');
        if (userSearchInput) {
            userSearchInput.addEventListener('input', () => {
                userSearch = userSearchInput.value.trim();
                userPage = 1;
                renderUserTable();
            });
        }

        const brandSearchInput = document.getElementById('adminBrandSearch');
        if (brandSearchInput) {
            brandSearchInput.addEventListener('input', () => {
                brandSearch = brandSearchInput.value.trim();
                brandPage = 1;
                renderBrandTable();
            });
        }

        // Pagination click delegation
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.fig-page-btn');
            if (btn && !btn.disabled) {
                figPage = parseInt(btn.dataset.page);
                renderFigureTable();
                const figTbody = document.getElementById('adminFigTbody');
                if (figTbody) figTbody.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            const ubtn = e.target.closest('.user-page-btn');
            if (ubtn && !ubtn.disabled) {
                userPage = parseInt(ubtn.dataset.page);
                renderUserTable();
                const userTbody = document.getElementById('adminUserTbody');
                if (userTbody) userTbody.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            const bbtn = e.target.closest('.brand-page-btn');
            if (bbtn && !bbtn.disabled) {
                brandPage = parseInt(bbtn.dataset.page);
                renderBrandTable();
                const brandTbody = document.getElementById('adminBrandTbody');
                if (brandTbody) brandTbody.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        });

        // Delete Top Rated figure
        document.querySelectorAll('.delTopRatedBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete "${btn.dataset.name}" and ALL associated intel? This removes it from Top Rated and the entire system.`)) return;
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

        // Add Brand
        document.getElementById('addBrandBtn').addEventListener('click', async () => {
            const input = document.getElementById('newBrandInput');
            const name = input.value.trim();
            if (!name) { alert('Enter a brand name.'); return; }
            try {
                const res = await this.authFetch(`${API_URL}/admin/brands`, {
                    method: 'POST',
                    body: JSON.stringify({ name })
                });
                if (res.ok) {
                    input.value = '';
                    // Re-fetch brands to get the new ID
                    const brRes = await this.authFetch(`${API_URL}/admin/brands`);
                    if (brRes.ok) approvedBrands = await brRes.json();
                    renderBrandTable();
                }
                else { const err = await res.json(); alert(err.error); }
            } catch (e) { console.error(e); }
        });

        // Add User (admin-only)
        const addUserBtn = document.getElementById('addAdminUserBtn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', async () => {
                const username = prompt("Enter new username:");
                if (!username) return;
                const password = prompt("Enter new password:");
                if (!password) return;
                const email = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@datatoyz.net';
                const roleChoice = prompt("Enter role (analyst / moderator / admin):", "analyst");
                if (!roleChoice) return;
                const role = ['analyst', 'moderator', 'admin'].includes(roleChoice.toLowerCase().trim()) ? roleChoice.toLowerCase().trim() : 'analyst';

                try {
                    const res = await this.authFetch(`${API_URL}/admin/users`, {
                        method: 'POST',
                        body: JSON.stringify({ username, email, password, role })
                    });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        }
};

TerminalApp.prototype.editSubmission = async function(submissionId, targetId) {
        // Fetch the single submission by ID, then resolve target from figures list or submission metadata
        try {
            const subRes = await this.authFetch(`${API_URL}/submissions/${submissionId}`);
            if (!subRes.ok) { alert('Failed to load submission data.'); return; }
            const sub = await subRes.json();
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
