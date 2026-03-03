// views/admin.js — Admin Panel
TerminalApp.prototype.renderAdmin = async function(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        const userRole = this.user.role || 'analyst';
        const isFullAdmin = ['owner', 'admin'].includes(userRole);
        const isMod = userRole === 'moderator';

        let analytics = {}, users = [], figures = [], flags = [], topRated = [], approvedBrands = [], pendingBrands = [], lbSettings = [];

        try {
            // All roles: analytics + flags + leaderboard settings
            const promises = [
                this.authFetch(`${API_URL}/admin/analytics`),
                this.authFetch(`${API_URL}/admin/flags`),
                this.authFetch(`${API_URL}/admin/figures/leaderboard-settings`)
            ];
            // Admin-only: users, figures, top-rated, brands, pending brands
            if (isFullAdmin) {
                promises.push(
                    this.authFetch(`${API_URL}/admin/users`),
                    fetch(`${API_URL}/figures`),
                    fetch(`${API_URL}/figures/top-rated`),
                    this.authFetch(`${API_URL}/admin/brands`),
                    this.authFetch(`${API_URL}/admin/pending-brands`)
                );
            }
            const results = await Promise.all(promises);
            if (results[0].ok) analytics = await results[0].json();
            if (results[1].ok) flags = await results[1].json();
            if (results[2].ok) lbSettings = await results[2].json();
            if (isFullAdmin) {
                if (results[3].ok) users = await results[3].json();
                if (results[4].ok) figures = await results[4].json();
                if (results[5].ok) topRated = await results[5].json();
                if (results[6].ok) approvedBrands = await results[6].json();
                if (results[7].ok) pendingBrands = await results[7].json();
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
                            <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(u.username)} ${uRole !== 'analyst' ? `<span style="color:${roleColors[uRole]}; font-size:0.75rem;">${roleBadges[uRole]}</span>` : ''}</td>
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
                btn.addEventListener('click', async () => {
                    if (!confirm(`Delete "${btn.dataset.name}" and ALL associated intel? This cannot be undone.`)) return;
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
                        }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.mergeFigBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const sourceId = btn.dataset.id;
                    const sourceName = btn.dataset.name;
                    // Build list of other figures for merge target selection
                    const otherFigs = figures.filter(f => f.id != sourceId);
                    if (otherFigs.length === 0) { alert('No other figures to merge with.'); return; }

                    const targetIdStr = prompt(
                        `Merge "${sourceName}" (ID: ${sourceId}) INTO which figure?\n\n` +
                        `All submissions, market data, and comments will be moved to the target figure, then "${sourceName}" will be deleted.\n\n` +
                        `Enter the target figure ID:\n` +
                        otherFigs.slice(0, 15).map(f => `  ${f.id}: ${f.name}`).join('\n')
                    );
                    if (!targetIdStr) return;
                    const targetId = parseInt(targetIdStr);
                    const targetFig = figures.find(f => f.id === targetId);
                    if (!targetFig) { alert(`Figure ID ${targetId} not found.`); return; }

                    if (!confirm(`Merge "${sourceName}" → "${targetFig.name}"?\n\nAll intel will be moved to "${targetFig.name}" and "${sourceName}" will be permanently deleted.`)) return;

                    try {
                        const res = await self.authFetch(`${API_URL}/admin/figures/merge`, {
                            method: 'POST',
                            body: JSON.stringify({ sourceId: parseInt(sourceId), targetId })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            alert(data.message);
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
                    <tr style="border-top:1px solid var(--border-light);">
                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${b.id}</td>
                        <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(b.name)}</td>
                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${escapeHTML(b.approved_by || '\u2014')}</td>
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
                btn.addEventListener('click', async () => {
                    const newName = prompt('Edit Brand Name:', btn.dataset.name);
                    if (!newName || newName.trim() === btn.dataset.name) return;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/brands/${btn.dataset.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ name: newName.trim() })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            alert(data.message);
                            // Update local data
                            const brand = approvedBrands.find(b => b.id == btn.dataset.id);
                            if (brand) brand.name = newName.trim();
                            // Also update figures list if any were affected
                            figures.forEach(f => { if (f.brand === btn.dataset.name) f.brand = newName.trim(); });
                            MOCK_FIGURES.forEach(f => { if (f.brand === btn.dataset.name) f.brand = newName.trim(); });
                            renderBrandTable();
                            renderFigureTable();
                        } else {
                            const err = await res.json();
                            alert(err.error);
                        }
                    } catch (e) { console.error(e); }
                });
            });

            document.querySelectorAll('.delBrandBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Remove brand "${btn.dataset.name}" from approved list?\n\nExisting figures with this brand won't be affected, but users won't be able to create new figures with this brand.`)) return;
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

                ${isFullAdmin ? `
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
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Users have submitted these brands for approval. Approve to add them to the catalog or reject to deny.</p>
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
                <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Only approved brands appear in the figure creation dropdown. Non-admin users cannot use unapproved brands.</p>
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
                    MOD_LB_VISIBILITY: { label: 'MOD VIS', color: '#6b7280' }
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
                return;
            }
            const ubtn = e.target.closest('.user-page-btn');
            if (ubtn && !ubtn.disabled) {
                userPage = parseInt(ubtn.dataset.page);
                renderUserTable();
                return;
            }
            const bbtn = e.target.closest('.brand-page-btn');
            if (bbtn && !bbtn.disabled) {
                brandPage = parseInt(bbtn.dataset.page);
                renderBrandTable();
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
