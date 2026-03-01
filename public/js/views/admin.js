// views/admin.js — Admin Panel
TerminalApp.prototype.renderAdmin = async function(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        let analytics = {}, users = [], figures = [], flags = [], topRated = [], approvedBrands = [];

        try {
            const [aRes, uRes, fRes, flagRes, trRes, brRes] = await Promise.all([
                this.authFetch(`${API_URL}/admin/analytics`),
                this.authFetch(`${API_URL}/admin/users`),
                fetch(`${API_URL}/figures`),
                this.authFetch(`${API_URL}/admin/flags`),
                fetch(`${API_URL}/figures/top-rated`),
                this.authFetch(`${API_URL}/admin/brands`)
            ]);
            if (aRes.ok) analytics = await aRes.json();
            if (uRes.ok) users = await uRes.json();
            if (fRes.ok) figures = await fRes.json();
            if (flagRes.ok) flags = await flagRes.json();
            if (trRes.ok) topRated = await trRes.json();
            if (brRes.ok) approvedBrands = await brRes.json();
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
                            <td style="padding:0.6rem 1rem; text-align:right;">
                                ${u.username !== 'Prime Dynamixx' ? `
                                <div class="admin-action-btns">
                                    <button class="roleBtn" data-id="${u.id}" data-role="${u.role}" style="border-color:${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; color:${isAdmin ? 'var(--text-muted)' : '#fbbf24'};">${isAdmin ? 'Demote' : 'Promote'}</button>
                                    <button class="suspendBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:${isSuspended ? 'var(--success)' : 'var(--danger)'}; color:${isSuspended ? 'var(--success)' : 'var(--danger)'};">${isSuspended ? '\u{2705} Reinstate' : '\u{26A0}\u{FE0F} Suspend'}</button>
                                    <button class="resetPwBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:var(--accent); color:var(--accent);">\u{1F511} Reset PW</button>
                                    <button class="delUserBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="border-color:var(--danger); color:var(--danger);">\u{1F5D1}\u{FE0F} Delete</button>
                                </div>
                                ` : '<span style="font-size:0.8rem; color:var(--text-muted);">Protected</span>'}
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
            document.querySelectorAll('.roleBtn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const isPromoting = btn.dataset.role !== 'admin';
                    if (!confirm(`Are you sure you want to ${isPromoting ? 'PROMOTE' : 'DEMOTE'} this user?`)) return;
                    try {
                        const res = await self.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/role`, { method: 'PUT' });
                        if (res.ok) { self.renderAdmin(container); }
                        else { const err = await res.json(); alert(err.error); }
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
            </div>
        `;

        // Initial render of tables
        renderFigureTable();
        renderUserTable();
        renderBrandTable();

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
