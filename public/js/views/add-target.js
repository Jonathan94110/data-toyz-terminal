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
                        <input type="text" name="name" required placeholder="e.g. Commander Optimus Prime" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Brand / Manufacturer</label>
                        <input type="text" list="brandList" name="brand" required placeholder="e.g. Hasbro, Takara, Fans Toys" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        <datalist id="brandList"></datalist>
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Product Line</label>
                        <input type="text" name="line" required placeholder="e.g. Studio Series, Masterpiece, Legacy" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                    </div>
                    <div class="form-group" style="margin-bottom:2rem;">
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
                    <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem;">Register Target</button>
                </form>
            </div>
        </div>
`;

    document.getElementById('addTargetForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitNewTarget(e.target);
    });

    // Dynamically load brands from DB
    (async () => {
        try {
            const res = await fetch(`${API_URL}/figures/brands`);
            if (res.ok) {
                const brands = await res.json();
                const dl = document.getElementById('brandList');
                if (dl) dl.innerHTML = brands.map(b => `<option value="${escapeHTML(b)}">`).join('');
            }
        } catch (e) { /* fallback: empty datalist, user types freely */ }
    })();
};

TerminalApp.prototype.submitNewTarget = async function(form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
        const req = await this.authFetch(`${API_URL}/figures`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (req.ok) {
            alert(`${data.name} has been successfully added to the catalog.`);
            await this.loadFigures(); // refresh the global array
            this.currentView = 'search';
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
