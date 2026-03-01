// views/search.js — Action Figure Registration
TerminalApp.prototype.renderSearch = async function(container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('cards', 4)}</div>`;

    // Fetch ranked figures with submission counts + grades
    let rankedFigures = MOCK_FIGURES;
    try {
        const res = await fetch(`${API_URL}/figures/ranked`);
        if (res.ok) rankedFigures = await res.json();
    } catch (e) { /* fallback to MOCK_FIGURES */ }

    let currentSort = sessionStorage.getItem('searchSort') || 'name';
    let currentTier = '';
    let currentGradeMin = 0;
    let currentBrand = '';
    const uniqueBrands = [...new Set(rankedFigures.map(f => (f.brand || '').trim()))].filter(Boolean).sort();
    const uniqueTiers = [...new Set(rankedFigures.map(f => f.classTie).filter(Boolean))].sort();

    container.innerHTML = `
        <div class="search-container animate-mount">
            <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Action Figure Registration <a onclick="app.currentView='docs'; app.renderApp(); setTimeout(()=>{const el=document.getElementById('doc-target-search');if(el)el.scrollIntoView({behavior:'smooth'});},200);" style="cursor:pointer; font-size:1rem; color:var(--text-muted); vertical-align:middle; margin-left:0.25rem;" title="View documentation">\u{1F4D6}</a></h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Search central database to initiate Trade Value Assessment.</p>
                </div>
                ${this.token ? `<button class="btn" style="padding: 0.75rem 1.5rem;" onclick="app.currentView='add_target'; app.renderApp();">+ Add New Target</button>` : ''}
            </div>

            <div class="search-bar">
                <input type="text" id="searchInput" placeholder="Search by name, brand, or line (e.g. FT-55, Optimus, XTB)...">
                <button class="btn" style="width: auto; padding: 0 2rem;" id="searchBtn">SEARCH</button>
            </div>

            <div class="search-filters" style="margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Brands:</span>
                <span class="badge brandFilter" data-brand="" style="border-color:var(--accent); color:var(--accent); font-weight:700; cursor:pointer;">ALL</span>
                ${uniqueBrands.map(b => `<span class="badge brandFilter" data-brand="${escapeHTML(b)}" style="cursor:pointer;">${escapeHTML(b)}</span>`).join('')}
            </div>

            <div style="margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Class:</span>
                <span class="badge tierFilter" data-tier="" style="border-color:var(--accent); color:var(--accent); font-weight:700; cursor:pointer;">ALL</span>
                ${uniqueTiers.map(t => `<span class="badge tierFilter" data-tier="${escapeHTML(t)}" style="cursor:pointer;">${escapeHTML(t)}</span>`).join('')}
            </div>

            <div style="margin-bottom:1.5rem; display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center;">
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Grade:</span>
                    <select id="gradeFilter" style="background:var(--bg-panel); color:var(--text-primary); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.4rem 0.75rem; font-size:0.85rem; cursor:pointer;">
                        <option value="0">Any Grade</option>
                        <option value="50">50+</option>
                        <option value="60">60+</option>
                        <option value="70">70+</option>
                        <option value="80">80+</option>
                        <option value="90">90+</option>
                    </select>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Sort:</span>
                    <span class="badge sortBtn ${currentSort === 'name' ? 'active' : ''}" data-sort="name" style="${currentSort === 'name' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Name</span>
                    <span class="badge sortBtn ${currentSort === 'grade' ? 'active' : ''}" data-sort="grade" style="${currentSort === 'grade' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Grade</span>
                    <span class="badge sortBtn ${currentSort === 'submissions' ? 'active' : ''}" data-sort="submissions" style="${currentSort === 'submissions' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Most Reviewed</span>
                </div>
            </div>

            <div id="searchResultCount" style="margin-bottom:1rem; font-size:0.9rem; color:var(--text-muted);"></div>
            <div id="searchResults" class="grid-2"></div>
        </div>
    `;

    const brandAliases = {
        'xtb': 'x-transbots', 'mmc': 'mastermind creations', 'dx9': 'dx9',
        'ft': 'fans toys', 'ms': 'magic square', 'zt': 'zeta toys',
        'sc': 'studio cell', 'tt': 'takara tomy'
    };

    const doSearch = () => {
        let query = document.getElementById('searchInput').value.toLowerCase().trim();
        const expanded = brandAliases[query];

        let results = rankedFigures;

        // Text search
        if (query) {
            results = results.filter(f =>
                f.name.toLowerCase().includes(query) ||
                f.brand.toLowerCase().includes(query) ||
                f.line.toLowerCase().includes(query) ||
                (expanded && f.brand.toLowerCase().includes(expanded))
            );
        }

        // Brand filter
        if (currentBrand) {
            results = results.filter(f => (f.brand || '').trim() === currentBrand);
        }

        // Tier filter
        if (currentTier) {
            results = results.filter(f => f.classTie === currentTier);
        }

        // Grade filter
        if (currentGradeMin > 0) {
            results = results.filter(f => parseFloat(f.avgGrade) >= currentGradeMin);
        }

        // Apply sort
        if (currentSort === 'grade') {
            results.sort((a, b) => (parseFloat(b.avgGrade) || 0) - (parseFloat(a.avgGrade) || 0));
        } else if (currentSort === 'submissions') {
            results.sort((a, b) => (b.submissions || 0) - (a.submissions || 0));
        } else {
            results.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Result count
        document.getElementById('searchResultCount').textContent = `${results.length} target${results.length !== 1 ? 's' : ''} found`;

        const resultsHTML = results.map((f, index) => `
            <div class="card target-card animate-stagger" style="animation-delay: ${index * 0.05}s; cursor:pointer;" data-figure-id="${f.id}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
                    <div style="color:var(--text-muted); font-size: 0.8rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${escapeHTML(f.brand)} &bull; ${escapeHTML(f.line)}</div>
                    <span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}">${escapeHTML(f.classTie)}</span>
                </div>
                <h3 style="margin-bottom: 1rem; font-size: 1.25rem;">${escapeHTML(f.name)}</h3>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-light); padding-top:1rem;">
                    <div style="display:flex; gap:1rem; font-size:0.85rem; color:var(--text-muted);">
                        ${f.submissions > 0 ? `<span>${f.submissions} report${f.submissions !== 1 ? 's' : ''}</span>` : '<span>No reports</span>'}
                        ${f.avgGrade ? `<span style="color:var(--accent); font-weight:700;">${f.avgGrade}</span>` : ''}
                    </div>
                    <span style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Assess Target &rarr;</span>
                </div>
            </div>
        `).join('');

        document.getElementById('searchResults').innerHTML = results.length ? resultsHTML : '<div class="card" style="grid-column: 1 / -1; text-align:center; padding:3rem;"><p style="color:var(--text-muted); font-size:1.1rem;">No targets matching criteria.</p></div>';
    };

    document.getElementById('searchBtn').addEventListener('click', doSearch);
    document.getElementById('searchInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    document.querySelectorAll('.brandFilter').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.brandFilter').forEach(t => {
                t.style.borderColor = 'var(--border)';
                t.style.color = 'var(--text-secondary)';
                t.style.fontWeight = '400';
            });
            tab.style.borderColor = 'var(--accent)';
            tab.style.color = 'var(--accent)';
            tab.style.fontWeight = '700';
            currentBrand = tab.dataset.brand;
            doSearch();
        });
    });

    document.querySelectorAll('.tierFilter').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tierFilter').forEach(t => {
                t.style.borderColor = 'var(--border)';
                t.style.color = 'var(--text-secondary)';
                t.style.fontWeight = '400';
            });
            tab.style.borderColor = 'var(--accent)';
            tab.style.color = 'var(--accent)';
            tab.style.fontWeight = '700';
            currentTier = tab.dataset.tier;
            doSearch();
        });
    });

    document.getElementById('gradeFilter').addEventListener('change', (e) => {
        currentGradeMin = parseInt(e.target.value) || 0;
        doSearch();
    });

    document.querySelectorAll('.sortBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sortBtn').forEach(b => {
                b.style.borderColor = 'var(--border)';
                b.style.color = 'var(--text-secondary)';
                b.style.fontWeight = '400';
            });
            btn.style.borderColor = 'var(--accent)';
            btn.style.color = 'var(--accent)';
            btn.style.fontWeight = '700';
            currentSort = btn.dataset.sort;
            sessionStorage.setItem('searchSort', currentSort);
            doSearch();
        });
    });

    // Event delegation for target card clicks
    document.getElementById('searchResults').addEventListener('click', (e) => {
        const card = e.target.closest('.target-card[data-figure-id]');
        if (card) {
            const figId = parseInt(card.dataset.figureId);
            if (figId) app.selectTarget(figId);
        }
    });

    setTimeout(doSearch, 50);
};
