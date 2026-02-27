// views/market-pulse.js — Market Pulse overview

TerminalApp.prototype.renderMarketPulse = async function(container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('stats', 4)}</div>`;

    try {
        const [overviewRes, indexesRes, headlinesRes, topRatedRes] = await Promise.all([
            fetch(`${API_URL}/stats/overview`),
            fetch(`${API_URL}/stats/indexes`),
            fetch(`${API_URL}/stats/headlines`),
            fetch(`${API_URL}/figures/top-rated`)
        ]);
        const overview = await overviewRes.json();
        const indexes = await indexesRes.json();
        const headlines = await headlinesRes.json();
        const topRated = await topRatedRes.json();

        container.innerHTML = `
            <div style="max-width:1000px; margin:0 auto;">
                <h1 style="font-size:2.5rem; font-weight:900; text-transform:uppercase; letter-spacing:-0.02em; margin-bottom:0.5rem;">Market Pulse</h1>
                <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom:2.5rem;">Global intelligence overview and market activity.</p>

                <!-- Overview Stats -->
                <div class="grid-4" style="margin-bottom:2.5rem;">
                    <div class="stat-box">
                        <div class="stat-value">${overview.totalIntel}</div>
                        <div class="stat-label">Intel Reports</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${overview.uniqueAnalysts}</div>
                        <div class="stat-label">Active Analysts</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${overview.avgGrade}</div>
                        <div class="stat-label">Avg Grade</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${overview.totalTargets}</div>
                        <div class="stat-label">Cataloged Targets</div>
                    </div>
                </div>

                <div class="grid-2" style="margin-bottom:2.5rem;">
                    <!-- Top Rated Figures -->
                    <div class="card" style="padding:0; overflow:hidden;">
                        <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                            <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F3C6} Top Rated Targets</h3>
                        </div>
                        <div style="max-height:400px; overflow-y:auto;">
                            ${topRated.length > 0 ? topRated.map((f, i) => `
                                <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                    <div style="display:flex; align-items:center; gap:0.75rem;">
                                        <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                                        <div>
                                            <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} \u00B7 ${f.submissions} report${f.submissions !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                    <div style="font-weight:800; color:var(--accent); font-size:1.1rem;">${escapeHTML(f.avgGrade)}</div>
                                </div>
                            `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No rated targets yet.</div>'}
                        </div>
                    </div>

                    <!-- Intel Headlines -->
                    <div class="card" style="padding:0; overflow:hidden;">
                        <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                            <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F4E1} Intel Headlines</h3>
                        </div>
                        <div style="max-height:400px; overflow-y:auto;">
                            ${headlines.length > 0 ? headlines.map(h => `
                                <div class="pulse-headline-item">
                                    <div style="font-size:0.9rem; margin-bottom:0.25rem;">${escapeHTML(h.headline)}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.date).toLocaleDateString()} \u00B7 ${escapeHTML(h.brand)}</div>
                                </div>
                            `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No intel yet.</div>'}
                        </div>
                    </div>
                </div>

                <!-- Brand/Line Indexes -->
                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                        <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">\u{1F4CA} Brand / Line Performance Index</h3>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Brand</th>
                                    <th>Line</th>
                                    <th>Targets</th>
                                    <th>Reports</th>
                                    <th>Avg Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${indexes.map(idx => `
                                    <tr>
                                        <td style="font-weight:600;">${escapeHTML(idx.brand)}</td>
                                        <td style="color:var(--text-secondary);">${escapeHTML(idx.line)}</td>
                                        <td>${idx.targets}</td>
                                        <td>${idx.submissions}</td>
                                        <td style="font-weight:700; color:${idx.avgGrade ? (parseFloat(idx.avgGrade) >= 70 ? 'var(--success)' : parseFloat(idx.avgGrade) >= 50 ? '#fbbf24' : 'var(--danger)') : 'var(--text-muted)'};">${escapeHTML(idx.avgGrade) || '\u2014'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load market data.</div>`;
        console.error(e);
    }
};
