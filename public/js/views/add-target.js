// views/add-target.js — Add new target figure
TerminalApp.prototype.renderAddTarget = function(container) {
    container.innerHTML = `
<div style="max-width: 600px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                <button class="btn-outline" onclick="app.currentView='search'; app.renderApp();">&larr; Back to Search</button>
                <div>
                    <h2 style="margin:0; font-size:2rem;">Add Custom Target</h2>
                    <div style="color:var(--text-secondary); font-size:0.95rem; margin-top:0.25rem;">Expand the Market Pulse catalog</div>
                </div>
            </div>

            <div class="card" style="padding: 2rem;">
                <form id="addTargetForm">
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Figure Name</label>
                        <input type="text" name="name" id="addTargetName" required placeholder="e.g. Commander Optimus Prime" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        <div id="dupWarning" style="display:none; margin-top:0.5rem; padding:0.6rem 0.75rem; background:rgba(251,191,36,0.12); border:1px solid rgba(251,191,36,0.35); border-radius:var(--radius-sm); font-size:0.85rem; color:#fbbf24;"></div>
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Brand / Manufacturer</label>
                        <select name="brand" id="brandSelect" required style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                            <option value="" disabled selected>Select a brand...</option>
                        </select>
                        <input type="text" id="brandOtherInput" name="brandOther" placeholder="Enter new brand name" style="display:none; margin-top:0.5rem; width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Product Line</label>
                        <input type="text" name="line" required placeholder="e.g. Studio Series, Masterpiece, Legacy" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Size Class / Tier</label>
                        <select name="classTie" required style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                            <option value="Core">Core</option>
                            <option value="Deluxe">Deluxe</option>
                            <option value="Voyager">Voyager</option>
                            <option value="Leader">Leader</option>
                            <option value="Commander">Commander</option>
                            <option value="Titan">Titan</option>
                            <option value="Masterpiece">Masterpiece</option>
                            <option value="Legends">Legends</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:2rem;">
                        <label class="form-label">Retail Price (MSRP)</label>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:1.25rem; color:var(--text-muted);">$</span>
                            <input type="number" name="msrp" id="addTargetMsrp" step="0.01" min="0.01" required placeholder="e.g. 89.99" style="width:100%; max-width:200px; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.1rem;">
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.4rem; line-height:1.4;">What's the manufacturer's retail price? This sets the MSRP baseline for value analysis across all price tiers.</p>
                    </div>
                    <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem;">Register Target</button>
                </form>
            </div>
        </div>
`;

    document.getElementById('addTargetForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitNewTarget(e.target);
    });

    // Brand dropdown: populate from DB + "Other" option
    (async () => {
        try {
            const res = await fetch(`${API_URL}/figures/brands`);
            if (res.ok) {
                const brands = [...new Set(await res.json())];
                const sel = document.getElementById('brandSelect');
                if (sel) {
                    brands.forEach(b => {
                        const opt = document.createElement('option');
                        opt.value = b;
                        opt.textContent = b;
                        sel.appendChild(opt);
                    });
                    const otherOpt = document.createElement('option');
                    otherOpt.value = '__other__';
                    otherOpt.textContent = '+ Other (requires admin approval)';
                    sel.appendChild(otherOpt);

                    sel.addEventListener('change', () => {
                        const otherInput = document.getElementById('brandOtherInput');
                        if (sel.value === '__other__') {
                            otherInput.style.display = 'block';
                            otherInput.required = true;
                            otherInput.focus();
                        } else {
                            otherInput.style.display = 'none';
                            otherInput.required = false;
                            otherInput.value = '';
                        }
                    });
                }
            }
        } catch (e) { /* fallback: empty select */ }
    })();

    // Live duplicate check + autocomplete dropdown on name input
    let dupTimer = null;
    let dupDropdown = null;
    const nameInput = document.getElementById('addTargetName');
    const dupWarning = document.getElementById('dupWarning');
    if (nameInput && dupWarning) {
        function getDupDropdown() {
            if (!dupDropdown) {
                dupDropdown = document.createElement('div');
                dupDropdown.className = 'figure-autocomplete';
                dupDropdown.style.zIndex = '9999';
                document.body.appendChild(dupDropdown);
            }
            const rect = nameInput.getBoundingClientRect();
            dupDropdown.style.top = (rect.bottom + 4) + 'px';
            dupDropdown.style.left = rect.left + 'px';
            dupDropdown.style.width = rect.width + 'px';
            return dupDropdown;
        }
        function hideDupDropdown() {
            if (dupDropdown) dupDropdown.style.display = 'none';
            dupWarning.style.display = 'none';
        }

        nameInput.addEventListener('input', () => {
            clearTimeout(dupTimer);
            const q = nameInput.value.trim();
            if (q.length < 2) { hideDupDropdown(); return; }
            dupTimer = setTimeout(() => {
                const normalize = s => s.toLowerCase().replace(/[\s\-_.]/g, '');
                const normQ = normalize(q);
                const qLower = q.toLowerCase();
                const matches = (typeof MOCK_FIGURES !== 'undefined' ? MOCK_FIGURES : []).filter(f => {
                    const normName = normalize(f.name);
                    const nameLower = f.name.toLowerCase();
                    return normName.includes(normQ) || normQ.includes(normName) || nameLower.includes(qLower) || levenClose(normName, normQ);
                }).slice(0, 8);

                if (matches.length > 0) {
                    const dd = getDupDropdown();
                    dd.innerHTML = `<div style="padding:0.4rem 0.75rem; font-size:0.75rem; color:#fbbf24; font-weight:600; border-bottom:1px solid var(--border); background:rgba(251,191,36,0.08);">EXISTING FIGURES — click to view instead of creating a duplicate</div>` +
                        matches.map(m =>
                            `<div class="figure-ac-item" data-id="${m.id}" style="display:flex; justify-content:space-between; align-items:center;">
                                <span class="figure-ac-name">${escapeHTML(m.name)}</span>
                                <span class="figure-ac-brand">${escapeHTML(m.brand || '')}</span>
                            </div>`
                        ).join('');
                    dd.style.display = 'block';

                    dd.querySelectorAll('.figure-ac-item').forEach(item => {
                        item.addEventListener('mousedown', function(ev) {
                            ev.preventDefault();
                            hideDupDropdown();
                            app.selectTarget(parseInt(this.dataset.id));
                        });
                    });

                    // Also show inline warning
                    dupWarning.style.display = 'block';
                    dupWarning.innerHTML = `<strong>&#9888; ${matches.length} similar figure${matches.length > 1 ? 's' : ''} already exist${matches.length === 1 ? 's' : ''}.</strong> Please check the dropdown above before registering.`;
                } else {
                    hideDupDropdown();
                }
            }, 200);
        });

        nameInput.addEventListener('blur', () => {
            setTimeout(hideDupDropdown, 200);
        });
        nameInput.addEventListener('focus', () => {
            // Re-trigger check if there's already text
            if (nameInput.value.trim().length >= 2) {
                nameInput.dispatchEvent(new Event('input'));
            }
        });
    }
};

// Simple Levenshtein-like closeness check (within 2 edits for short strings)
function levenClose(a, b) {
    if (Math.abs(a.length - b.length) > 3) return false;
    let dist = 0;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    for (let i = 0; i < longer.length; i++) {
        if (shorter[i] !== longer[i]) dist++;
        if (dist > 2) return false;
    }
    return dist <= 2;
}

TerminalApp.prototype.submitNewTarget = async function(form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Resolve brand: if "Other" selected, use the custom input
    if (data.brand === '__other__') {
        if (!data.brandOther || !data.brandOther.trim()) {
            alert('Please enter a brand name.');
            return;
        }
        data.brand = data.brandOther.trim();
    }
    delete data.brandOther;

    // MSRP: convert to number or null
    data.msrp = data.msrp && data.msrp.trim() !== '' ? parseFloat(data.msrp) : null;

    try {
        const req = await this.authFetch(`${API_URL}/figures`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (req.ok) {
            const result = await req.json();
            await this.loadFigures(); // refresh the global array
            // Navigate directly to the new figure's profile
            const newFigure = MOCK_FIGURES.find(f => f.id === result.id);
            if (newFigure) {
                this.currentTarget = newFigure;
                this.currentView = 'pulse';
            } else {
                this.currentView = 'search';
            }
            this.renderApp();
        } else {
            const err = await req.json().catch(() => ({}));
            alert(err.error || "Failed to create target.");
        }
    } catch (e) {
        console.error(e);
        alert("Connection error adding target.");
    }
};
