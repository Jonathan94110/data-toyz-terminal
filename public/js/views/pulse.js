// views/pulse.js — Figure Pulse detail view
TerminalApp.prototype.renderPulse = async function(container) {
    if (!this.currentTarget) {
        container.innerHTML = `<div style="padding:3rem; text-align:center;"><p style="color:var(--text-secondary);">No target selected.</p><button class="btn" onclick="app.currentView='search'; app.renderApp();">Back to Search</button></div>`;
        return;
    }
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('stats', 4)}</div>`;

    let figureSubs = [];
    let marketIntel = null;
    let communityMetrics = null;
    let overviewStats = {};
    let headlines = [];
    try {
        const [subRes, miRes, cmRes] = await Promise.all([
            fetch(`${API_URL}/submissions/target/${this.currentTarget.id}`),
            fetch(`${API_URL}/figures/${this.currentTarget.id}/market-intel`),
            fetch(`${API_URL}/figures/${this.currentTarget.id}/community-metrics`)
        ]);
        if (subRes.ok) figureSubs = await subRes.json();
        if (miRes.ok) marketIntel = await miRes.json();
        if (cmRes.ok) communityMetrics = await cmRes.json();
    } catch (e) {
        console.error("Failed retrieving pulse data", e);
    }
    try {
        const [ovRes, hdRes] = await Promise.all([
            fetch(`${API_URL}/stats/overview?category=${getActiveCategory()}`),
            fetch(`${API_URL}/stats/headlines?category=${getActiveCategory()}`)
        ]);
        if (ovRes.ok) overviewStats = await ovRes.json();
        if (hdRes.ok) headlines = await hdRes.json();
    } catch (e) {
        console.error("Failed retrieving market stats", e);
    }

    let mtsAvg = 0, approvalAvg = 0, overallAvg = 0, confidenceStars = 1;
    let isGuestimate = true;
    let yesVotes = 0;
    let noVotes = 0;
    let totalTradeRating = 0;

    if (figureSubs.length > 0) {
        isGuestimate = false;
        let totalMTS = 0;
        let totalApprl = 0;
        figureSubs.forEach(s => {
            totalMTS += parseFloat(s.mtsTotal);
            totalApprl += parseFloat(s.approvalScore);
            if (s.data && s.data.recommendation === 'yes') yesVotes++;
            if (s.data && s.data.recommendation === 'no') noVotes++;
            if (s.data && s.data.tradeRating) totalTradeRating += parseFloat(s.data.tradeRating);
        });
        mtsAvg = (totalMTS / figureSubs.length).toFixed(1);
        approvalAvg = (totalApprl / figureSubs.length).toFixed(1);
        overallAvg = ((parseFloat(mtsAvg) + parseFloat(approvalAvg)) / 2).toFixed(1);

        // Confidence system mock (more samples = more stars)
        if (figureSubs.length >= 10) confidenceStars = 5;
        else if (figureSubs.length >= 5) confidenceStars = 4;
        else if (figureSubs.length >= 2) confidenceStars = 3;
        else if (figureSubs.length > 0) confidenceStars = 2;
    } else {
        // Guestimate TVI Anchoring
        let baseTVI = 50;
        if (this.currentTarget.classTie === "Commander" || this.currentTarget.classTie === "Masterpiece") baseTVI = 85;
        else if (this.currentTarget.classTie === "Leader") baseTVI = 75;
        else if (this.currentTarget.classTie === "Voyager") baseTVI = 65;

        overallAvg = `${baseTVI}.0 <span style="font-size:1rem; font-weight:400; color:var(--text-secondary);">(Guestimate)</span>`;
    }

    // --- Smart MSRP: admin-set → community overseas avg → null ---
    const smartMsrp = this.currentTarget.msrp
        ? parseFloat(this.currentTarget.msrp)
        : (communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.overseas_msrp
            ? communityMetrics.marketPriceByType.overseas_msrp.avg : null);
    const msrpSource = this.currentTarget.msrp ? 'catalog' : (smartMsrp ? 'community' : null);

    // Per-tier community averages
    const overseasAvg  = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.overseas_msrp  ? communityMetrics.marketPriceByType.overseas_msrp.avg  : null;
    const statesideAvg = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.stateside_msrp ? communityMetrics.marketPriceByType.stateside_msrp.avg : null;
    const secondaryAvg = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.secondary_market ? communityMetrics.marketPriceByType.secondary_market.avg : null;
    const overseasCt   = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.overseas_msrp  ? communityMetrics.marketPriceByType.overseas_msrp.count  : 0;
    const statesideCt  = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.stateside_msrp ? communityMetrics.marketPriceByType.stateside_msrp.count : 0;
    const secondaryCt  = communityMetrics && communityMetrics.marketPriceByType && communityMetrics.marketPriceByType.secondary_market ? communityMetrics.marketPriceByType.secondary_market.count : 0;

    // Tier diffs
    const stateVsOverseasPct = (overseasAvg && statesideAvg) ? (((statesideAvg - overseasAvg) / overseasAvg) * 100).toFixed(1) : null;
    const secVsOverseasPct   = (overseasAvg && secondaryAvg)  ? (((secondaryAvg - overseasAvg) / overseasAvg) * 100).toFixed(1) : null;
    const secVsStatesidePct  = (statesideAvg && secondaryAvg) ? (((secondaryAvg - statesideAvg) / statesideAvg) * 100).toFixed(1) : null;

    // --- Value Signal: grade vs price-over-MSRP (with smart fallbacks) ---
    const valueSignal = (() => {
        if (isGuestimate) return { label: 'PROVISIONAL', color: '#64748b', bg: 'rgba(100,116,139,0.12)', tip: 'Fewer than 3 submissions — signal provisional' };
        const grade = parseFloat(overallAvg);
        // Price-based signal when we have an MSRP baseline + secondary market data
        if (smartMsrp && secondaryAvg) {
            const pct = ((secondaryAvg - smartMsrp) / smartMsrp) * 100;
            if (grade >= 70 && pct <= 10)  return { label: 'UNDERVALUED', color: '#10b981', bg: 'rgba(16,185,129,0.15)', tip: 'High grade, price near MSRP — potential value buy' };
            if (grade >= 60 && pct <= 30)  return { label: 'FAIR VALUE',   color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  tip: 'Solid grade with moderate secondary market premium' };
            if (grade >= 50 && pct <= 60)  return { label: 'HOLD',         color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', tip: 'Decent grade but elevated aftermarket price' };
            if (grade < 50 && pct > 50)    return { label: 'OVERVALUED',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  tip: 'Below-average grade with high aftermarket premium' };
            if (grade >= 70 && pct > 30)   return { label: 'HOT',          color: '#f97316', bg: 'rgba(249,115,22,0.15)', tip: 'High demand — strong grade but commanding a premium' };
            return { label: 'NEUTRAL', color: '#64748b', bg: 'rgba(100,116,139,0.12)', tip: 'No clear signal at current grade and pricing' };
        }
        // Grade-only fallback when no pricing baseline available
        if (grade >= 80) return { label: 'STRONG BUY', color: '#10b981', bg: 'rgba(16,185,129,0.15)', tip: 'Top-tier community grade — no pricing data to compare' };
        if (grade >= 65) return { label: 'SOLID',      color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  tip: 'Above-average community sentiment — no pricing data to compare' };
        if (grade >= 50) return { label: 'MIXED',       color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', tip: 'Average community reception — no pricing data to compare' };
        return { label: 'WEAK', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', tip: 'Below-average community grade — no pricing data to compare' };
    })();

    // Build data reliability stars (auto-calculated)
    let reliabilityHtml = '';
    for (let i = 0; i < 5; i++) {
        const color = i < confidenceStars ? "var(--text-secondary)" : "var(--border-light)";
        reliabilityHtml += `<span style="color: ${color}; font-size: 1rem;">★</span>`;
    }

    // Build community trade rating stars (user-voted average)
    const avgTradeRating = figureSubs.length > 0 ? (totalTradeRating / figureSubs.length) : 0;
    let tradeStarsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(avgTradeRating)) {
            tradeStarsHtml += `<span style="color: #fbbf24; font-size: 2rem;">★</span>`;
        } else if (i - avgTradeRating < 1 && i > Math.floor(avgTradeRating)) {
            tradeStarsHtml += `<span style="color: #fbbf24; font-size: 2rem; opacity: 0.5;">★</span>`;
        } else {
            tradeStarsHtml += `<span style="color: var(--border-light); font-size: 2rem;">★</span>`;
        }
    }

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
            <div style="margin-bottom: 2rem;">
                <button class="btn-outline" onclick="app.currentView='${this.previousView || 'search'}'; app.renderApp();" style="margin-bottom:1.5rem;">&larr; Back</button>
                <div class="card" style="display:flex; align-items:center; gap:1.5rem;">
                    <div style="flex:1;">
                        <h2 style="margin:0 0 0.5rem; font-size:1.75rem;" id="figureNameDisplay">
                            <span id="figureNameText">${escapeHTML(this.currentTarget.name)}</span>
                            ${(this.currentTarget.createdBy === this.user.username || ['owner', 'admin', 'moderator'].includes(this.user.role) || figureSubs.some(s => s.author === this.user.username)) ? `<button id="editFigureNameBtn" style="background:none; border:1px solid var(--border-light); color:var(--text-muted); cursor:pointer; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem; margin-left:0.75rem; vertical-align:middle;" title="Edit figure name">\u270f\ufe0f</button>` : ''}
                        </h2>
                        <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                            <span style="color:var(--text-secondary); font-size:0.9rem; font-weight:600;">${escapeHTML(this.currentTarget.brand)}</span>
                            <span style="color:var(--text-muted);">&bull;</span>
                            <span style="color:var(--text-muted); font-size:0.85rem;">${escapeHTML(this.currentTarget.line || '')}</span>
                            <span class="tier-badge ${escapeHTML(this.currentTarget.classTie || '').toLowerCase()}">${escapeHTML(this.currentTarget.classTie)}</span>
                        </div>
                    </div>
                    <div style="text-align:center; padding-left:1.5rem; border-left:1px solid var(--border-light);">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.25rem;">Reports</div>
                        <div style="font-size:1.5rem; font-weight:900; color:var(--accent);">${figureSubs.length}</div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                <button class="btn-outline" id="copyLinkBtn" style="font-size:0.85rem; padding:0.5rem 1rem;">📋 Copy Link</button>
                ${this.token ? `<button class="btn-outline" id="requestAssessBtn" style="font-size:0.85rem; padding:0.5rem 1rem;">📊 Request Assessment</button>` : ''}
            </div>

            ${this.token ? `
            <div style="margin-bottom:2rem;">
                <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:700; margin-bottom:0.5rem;">My Collection</div>
                <div id="collectionBar" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                    <button class="col-btn" data-status="owned">📦 Owned</button>
                    <button class="col-btn" data-status="wishlist">⭐ Wishlist</button>
                    <button class="col-btn" data-status="for_trade">🔄 For Trade</button>
                    <button class="col-btn" data-status="sold">💰 Sold</button>
                    <button class="col-btn col-btn-remove" id="colRemoveBtn" style="display:none;">✕ Remove</button>
                </div>
                <div id="colTradeNote" style="display:none; font-size:0.75rem; color:#a855f7; margin-top:0.35rem;">Requires admin/platinum validation before listing goes public.</div>
            </div>
            ` : ''}

            ${isGuestimate ? `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); padding: 1rem 1.5rem; border-radius: var(--radius-sm); margin-bottom: 2rem; color: var(--text-primary);">
                    <strong style="color: var(--danger);">⚠️ Anti-Hype Notice:</strong> Insufficient community data. Displaying TVI Anchored Guestimate based on class tier (${escapeHTML(this.currentTarget.classTie)}).
                </div>
            ` : ''}

            <div class="grid-2" style="margin-bottom: 2.5rem;">
                <div class="stat-box" style="padding: 2.5rem;">
                    <div class="stat-value" style="font-size:3.5rem;">${overallAvg}</div>
                    <div class="stat-label">Overall Target Grade (0-100)${!isGuestimate && figureSubs.length > 0 && figureSubs.length < 3 ? ' <span class="provisional-badge">PROVISIONAL (' + figureSubs.length + '/3)</span>' : ''}</div>
                </div>
                <div class="stat-box" style="display:flex; flex-direction:column; justify-content:center;">
                    ${!isGuestimate && avgTradeRating > 0 ? `
                        <div style="margin-bottom: 0.5rem; line-height: 1;">${tradeStarsHtml}</div>
                        <div class="stat-label" style="margin-bottom:0.25rem;">Community Trade Rating: <span style="color:#fbbf24; font-weight:800;">${avgTradeRating.toFixed(1)} / 5</span></div>
                    ` : `
                        <div style="margin-bottom: 0.5rem; line-height: 1; color: var(--border-light); font-size: 2rem;">★★★★★</div>
                        <div class="stat-label">Community Trade Rating: <span style="color:var(--text-muted);">No Votes Yet</span></div>
                    `}
                    <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted);">${reliabilityHtml} Data Reliability (${figureSubs.length} sample${figureSubs.length !== 1 ? 's' : ''})</div>
                    ${!isGuestimate ? `
                        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
                            <div style="font-size: 1.5rem; font-weight: 800; color: ${yesVotes >= noVotes ? 'var(--success)' : 'var(--danger)'};">` + `
                                RECOMMENDATION: ${yesVotes >= noVotes ? 'YES' : 'NO'}
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">
                                (${yesVotes} Yes, ${noVotes} No)
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- PRICE TIERS -->
            <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
                <h3 style="margin:0 0 1rem; text-transform:uppercase; letter-spacing:0.08em; font-size:0.9rem; color:var(--text-secondary);">\u{1F4B2} Price Tiers</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; text-align:center;">
                    <div style="padding:0.75rem 0.5rem; background:rgba(16,185,129,0.05); border-radius:var(--radius-sm);">
                        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.35rem; letter-spacing:0.05em;">OVERSEAS (MSRP)</div>
                        <div style="font-size:1.4rem; font-weight:800; color:var(--success);">${overseasAvg ? '$' + overseasAvg.toFixed(2) : (smartMsrp && msrpSource === 'catalog' ? '$' + smartMsrp.toFixed(2) : '---')}</div>
                        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:0.35rem;">○ baseline ${msrpSource === 'catalog' ? '(catalog)' : overseasCt ? '(community avg)' : ''}</div>
                        <div style="font-size:0.6rem; color:var(--text-muted); margin-top:0.15rem;">${overseasCt ? overseasCt + ' report' + (overseasCt !== 1 ? 's' : '') : (msrpSource === 'catalog' ? 'admin set' : 'no data')}</div>
                    </div>
                    <div style="padding:0.75rem 0.5rem; background:rgba(245,158,11,0.05); border-radius:var(--radius-sm);">
                        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.35rem; letter-spacing:0.05em;">STATESIDE (US RETAIL)</div>
                        <div style="font-size:1.4rem; font-weight:800; color:#f59e0b;">${statesideAvg ? '$' + statesideAvg.toFixed(2) : '---'}</div>
                        ${stateVsOverseasPct !== null ? '<div style="font-size:0.7rem; font-weight:700; color:' + (parseFloat(stateVsOverseasPct) >= 0 ? 'var(--danger)' : 'var(--success)') + '; margin-top:0.35rem;">' + (parseFloat(stateVsOverseasPct) >= 0 ? '+' : '') + stateVsOverseasPct + '% vs overseas</div>' : '<div style="font-size:0.65rem; color:var(--text-muted); margin-top:0.35rem;">—</div>'}
                        <div style="font-size:0.6rem; color:var(--text-muted); margin-top:0.15rem;">${statesideCt ? statesideCt + ' report' + (statesideCt !== 1 ? 's' : '') : 'no data'}</div>
                    </div>
                    <div style="padding:0.75rem 0.5rem; background:rgba(255,42,95,0.05); border-radius:var(--radius-sm);">
                        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.35rem; letter-spacing:0.05em;">SECONDARY MARKET</div>
                        <div style="font-size:1.4rem; font-weight:800; color:var(--accent);">${secondaryAvg ? '$' + secondaryAvg.toFixed(2) : '---'}</div>
                        ${secVsOverseasPct !== null ? '<div style="font-size:0.7rem; font-weight:700; color:' + (parseFloat(secVsOverseasPct) >= 0 ? 'var(--danger)' : 'var(--success)') + '; margin-top:0.35rem;">' + (parseFloat(secVsOverseasPct) >= 0 ? '+' : '') + secVsOverseasPct + '% vs overseas</div>' : ''}
                        ${secVsStatesidePct !== null ? '<div style="font-size:0.65rem; font-weight:600; color:' + (parseFloat(secVsStatesidePct) >= 0 ? 'var(--danger)' : 'var(--success)') + '; margin-top:0.1rem;">' + (parseFloat(secVsStatesidePct) >= 0 ? '+' : '') + secVsStatesidePct + '% vs US retail</div>' : (!secVsOverseasPct ? '<div style="font-size:0.65rem; color:var(--text-muted); margin-top:0.35rem;">—</div>' : '')}
                        <div style="font-size:0.6rem; color:var(--text-muted); margin-top:0.15rem;">${secondaryCt ? secondaryCt + ' report' + (secondaryCt !== 1 ? 's' : '') : 'no data'}</div>
                    </div>
                </div>
            </div>

            <!-- COMMUNITY POP COUNT -->
            ${communityMetrics && communityMetrics.popCount ? (() => {
                const pc = communityMetrics.popCount;
                return `
            <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
                <h3 style="margin:0 0 1rem; text-transform:uppercase; letter-spacing:0.08em; font-size:0.9rem; color:var(--text-secondary);">
                    \u{1F465} Community Pop Count
                </h3>
                <div class="pop-count-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:1rem; text-align:center;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:#10b981;">${pc.uniqueOwnerCount}</div>
                        <div class="stat-label">Unique Owners</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem;">${pc.inHandCount}</div>
                        <div class="stat-label">In-Hand Reports</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--text-secondary);">${pc.digitalOnlyCount}</div>
                        <div class="stat-label">Digital Reviews</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${pc.totalSubmissions}</div>
                        <div class="stat-label">Total Submissions</div>
                    </div>
                </div>
            </div>`;
            })() : ''}

            <!-- COMMUNITY SCORE BREAKDOWN -->
            ${communityMetrics && communityMetrics.count > 0 ? (() => {
                const hasEnough = figureSubs.length >= 3;
                const tierStyle = hasEnough ? '' : 'opacity:0.35; pointer-events:none; filter:blur(1px); user-select:none;';
                const mb = (label, value, max, color) => {
                    const pct = value != null ? ((value / max) * 100).toFixed(0) : 0;
                    const display = value != null ? value.toFixed(1) : '---';
                    return '<div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.6rem;">' +
                        '<span style="width:140px; font-size:0.8rem; color:var(--text-secondary); text-align:right; flex-shrink:0;">' + label + '</span>' +
                        '<div style="flex:1; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">' +
                        '<div style="width:' + pct + '%; height:100%; background:' + color + '; border-radius:4px; transition:width 0.5s ease;"></div></div>' +
                        '<span style="width:55px; font-size:0.85rem; font-weight:700; color:var(--text-primary); text-align:right;">' + display + '/' + max + '</span></div>';
                };
                const cm = communityMetrics;
                return `
            <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                <h3 style="margin:0 0 1.25rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📊 Community Score Breakdown</h3>

                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:2rem;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem;">${cm.dts.total.toFixed(1)}</div>
                        <div class="stat-label">DTS Total (0-100)</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem;">${cm.approvalAvg.toFixed(1)}</div>
                        <div class="stat-label">Approval Score</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem;">${cm.overallAvg.toFixed(1)}</div>
                        <div class="stat-label">Overall Grade</div>
                    </div>
                </div>

                ${!hasEnough ? '<div style="text-align:center; padding:0.75rem; margin-bottom:1rem; border:1px dashed var(--border-light); border-radius:var(--radius-sm); background:rgba(15,17,30,0.3);"><span style="color:var(--text-muted); font-size:0.85rem;">&#128274; ' + (3 - figureSubs.length) + ' more report' + (3 - figureSubs.length !== 1 ? 's' : '') + ' needed to unlock detailed metrics</span></div>' : ''}

                <div style="${tierStyle}">
                    <h4 style="margin:1.5rem 0 1rem; font-size:0.9rem; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em;">DTS Metrics (0-20 scale)</h4>
                    ${mb('Community Demand', cm.dts.community_demand, 20, '#ff2a5f')}
                    ${mb('Buzz Momentum', cm.dts.buzz, 20, '#ff2a5f')}
                    ${mb('Trade Liquidity', cm.dts.liquidity, 20, '#ff2a5f')}
                    ${mb('Scarcity', cm.dts.risk != null ? 20 - cm.dts.risk : null, 20, '#ff2a5f')}
                    ${mb('Cross-Faction Appeal', cm.dts.appeal, 20, '#ff2a5f')}

                    <h4 style="margin:1.5rem 0 1rem; font-size:0.9rem; color:#10b981; text-transform:uppercase; letter-spacing:0.05em;">Physical Quality (0-10 scale)</h4>
                    ${mb('Build Quality', cm.pq.build, 10, '#10b981')}
                    ${mb('Paint Application', cm.pq.paint, 10, '#10b981')}
                    ${mb('Articulation', cm.pq.articulation, 10, '#10b981')}
                    ${mb('Design Accuracy', cm.pq.accuracy, 10, '#10b981')}
                    ${mb('Display Presence', cm.pq.presence, 10, '#10b981')}
                    ${mb('Price / Value', cm.pq.value, 10, '#10b981')}
                    ${mb('Packaging', cm.pq.packaging, 10, '#10b981')}

                    <h4 style="margin:1.5rem 0 1rem; font-size:0.9rem; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em;">Transformation (1-10 scale)</h4>
                    ${mb('Frustration Score', cm.transformation.frustration, 10, '#f59e0b')}
                    ${mb('Satisfaction Score', cm.transformation.satisfaction, 10, '#f59e0b')}
                </div>
            </div>`;
            })() : ''}

            ${marketIntel && marketIntel.transactions.total > 0 ? `
            <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💰 Market Intelligence</h3>
                    <span style="font-size:0.75rem; padding:0.25rem 0.75rem; border-radius:12px; font-weight:700; ${marketIntel.transactions.confidence === 'high' ? 'background:rgba(16,185,129,0.15); color:#10b981;' : marketIntel.transactions.confidence === 'medium' ? 'background:rgba(251,191,36,0.15); color:#fbbf24;' : 'background:rgba(239,68,68,0.15); color:#ef4444;'}">${marketIntel.transactions.confidence.toUpperCase()} CONFIDENCE</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.rolling30.avg != null ? '$' + marketIntel.transactions.rolling30.avg.toFixed(2) : '—'}</div>
                        <div class="stat-label">30-Day Avg</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.rolling90.avg != null ? '$' + marketIntel.transactions.rolling90.avg.toFixed(2) : '—'}</div>
                        <div class="stat-label">90-Day Avg</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.lifetime.avg != null ? '$' + marketIntel.transactions.lifetime.avg.toFixed(2) : '—'}</div>
                        <div class="stat-label">Lifetime Avg</div>
                    </div>
                    ${(() => {
                        const msPct = smartMsrp && marketIntel.transactions.lifetime.avg != null
                            ? (((marketIntel.transactions.lifetime.avg - smartMsrp) / smartMsrp) * 100).toFixed(1) : null;
                        return `<div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; ${msPct != null ? (parseFloat(msPct) >= 0 ? 'color:var(--danger);' : 'color:var(--success);') : 'color:var(--text-muted);'}">${msPct != null ? (parseFloat(msPct) >= 0 ? '+' : '') + msPct + '%' : '—'}</div>
                        <div class="stat-label">vs MSRP ${smartMsrp ? '($' + smartMsrp.toFixed(2) + ')' : '(No baseline)'}</div>
                    </div>`;
                    })()}
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; color:#f59e0b;">${marketIntel.transactions.volatility != null ? '$' + marketIntel.transactions.volatility.toFixed(2) : '—'}</div>
                        <div class="stat-label">Volatility (H − L)</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:1.75rem; color:var(--accent);">${marketIntel.transactions.total}</div>
                        <div class="stat-label">Price Reports</div>
                    </div>
                </div>
            </div>
            ` : marketIntel ? `
            <div class="card" style="margin-bottom: 2.5rem; padding: 2rem; text-align:center;">
                <h3 style="margin:0 0 0.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💰 Market Intelligence</h3>
                <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">Insufficient pricing data. Submit intel reports with aftermarket valuations to populate market trends.</p>
            </div>
            ` : ''}

            ${!isGuestimate && figureSubs.length > 0 ? `
            <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom: 1rem;">
                    <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                        <h3 style="margin:0;">Community Projections Trend</h3>
                        ${marketIntel ? `<span style="font-size:0.7rem; padding:0.2rem 0.5rem; border-radius:8px; font-weight:700; ${marketIntel.transactions.confidence === 'high' ? 'background:rgba(16,185,129,0.15); color:#10b981;' : marketIntel.transactions.confidence === 'medium' ? 'background:rgba(251,191,36,0.15); color:#fbbf24;' : 'background:rgba(239,68,68,0.15); color:#ef4444;'}">${marketIntel.transactions.total} data pt${marketIntel.transactions.total !== 1 ? 's' : ''}</span>` : ''}
                        <span title="${valueSignal.tip}" style="font-size:0.7rem; padding:0.25rem 0.65rem; border-radius:8px; font-weight:800; letter-spacing:0.06em; background:${valueSignal.bg}; color:${valueSignal.color}; cursor:help; text-transform:uppercase;">${valueSignal.label}</span>
                    </div>
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                        <button type="button" class="chartToggle" data-idx="0" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:4px; border:1px solid #ff0f39; background:rgba(255,15,57,0.15); color:#ff0f39; cursor:pointer; font-weight:600;">Grade</button>
                        <button type="button" class="chartToggle" data-idx="1" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:4px; border:1px solid #10b981; background:rgba(16,185,129,0.15); color:#10b981; cursor:pointer; font-weight:600;">Overseas</button>
                        <button type="button" class="chartToggle" data-idx="2" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:4px; border:1px solid #f59e0b; background:rgba(245,158,11,0.15); color:#f59e0b; cursor:pointer; font-weight:600;">Stateside</button>
                        <button type="button" class="chartToggle" data-idx="3" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:4px; border:1px solid #ef4444; background:rgba(239,68,68,0.15); color:#ef4444; cursor:pointer; font-weight:600;">Secondary</button>
                        ${smartMsrp ? `<button type="button" class="chartToggle" data-idx="4" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:4px; border:1px solid #f59e0b; background:rgba(245,158,11,0.1); color:#f59e0b; cursor:pointer; font-weight:600; border-style:dashed;">MSRP</button>` : ''}
                    </div>
                </div>
                <p style="margin:0 0 1rem; font-size:0.78rem; color:var(--text-muted); line-height:1.4;">Grade <span style="color:#ff0f39;">(left axis)</span> reflects community-assessed quality — tends to stabilize. Prices <span style="color:var(--text-secondary);">(right axis)</span> are color-coded: <span style="color:#10b981;">overseas</span>, <span style="color:#f59e0b;">stateside</span> (tariff/shipping markup), <span style="color:#ef4444;">secondary market</span> (aftermarket). Vendor prices should cluster near baseline — wider gaps signal supply pressure. <strong style="color:${valueSignal.color};">${valueSignal.label}</strong> ${smartMsrp && secondaryAvg ? '— aftermarket vs ' + (msrpSource === 'community' ? 'overseas avg' : 'MSRP') : '— grade-only (no pricing baseline yet)'}.</p>
                <div style="height: 280px; width: 100%;">
                    <canvas id="projectionsChart"></canvas>
                </div>
                <h3 style="margin-top:2rem; font-family:var(--font-heading); font-size:1rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">📸 Field Evidence Gallery</h3>
                <div id="imageGallery" style="margin-top:0.75rem; display:flex; justify-content:center; flex-wrap:wrap; gap:1.5rem; padding-bottom:1rem;"></div>
            </div>
            ` : ''}

            ${figureSubs.length > 0 ? `
            <div style="margin-top:2.5rem; padding-top:2rem; border-top:1px solid var(--border-light);">
                <h3 style="margin-bottom:1rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📋 Recent Intel Reports</h3>
                <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${figureSubs.slice(0, 10).map(s => {
                        const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
                        const date = new Date(s.date).toLocaleDateString();
                        const ownerStatus = (s.data && s.data.ownership_status) || s.ownership_status || 'in_hand';
                        const ownerBadge = ownerStatus === 'digital_only'
                            ? '<span style="font-size:0.65rem; padding:0.15rem 0.4rem; background:rgba(99,102,241,0.15); color:#818cf8; border-radius:4px; margin-left:0.5rem; font-weight:600;">DIGITAL</span>'
                            : '<span style="font-size:0.65rem; padding:0.15rem 0.4rem; background:rgba(16,185,129,0.15); color:#10b981; border-radius:4px; margin-left:0.5rem; font-weight:600;">IN HAND</span>';
                        return `
                            <div class="card" style="padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
                                    <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(s.author).replace(/'/g, "\\'")}')" style="font-weight:700;">${escapeHTML(s.author)}</span>${ownerBadge}
                                    <span style="color:var(--text-muted); font-size:0.8rem;">${date}</span>
                                    ${s.editedAt ? '<span style="color:var(--text-muted); font-size:0.7rem; font-style:italic;">(edited)</span>' : ''}
                                </div>
                                <div style="font-weight:800; font-size:1.1rem; color:${parseFloat(grade) >= 70 ? 'var(--success)' : parseFloat(grade) >= 50 ? '#fbbf24' : 'var(--danger)'};">${grade}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div style="text-align: center; border-top: 1px solid var(--border-light); padding-top: 3rem; margin-top:2rem;">
                <h3 style="margin-bottom: 1rem;">Contribute Intelligence</h3>
                <p style="color:var(--text-secondary); margin-bottom: 2rem;">Help stabilize the market pulse by adding your in-hand assessment.</p>
                <button class="btn" style="max-width: 300px;" onclick="app.currentView='submission'; app.renderApp();">Rate Figure</button>
            </div>

            <!-- MARKET ACTIVITY RECAP -->
            <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📊 Market Activity Recap</h3>
                <div class="grid-2" style="gap: 1rem;">
                    <div class="stat-box" style="padding:1.5rem;">
                        <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.totalIntel || 0}</div>
                        <div class="stat-label">Total Intel Reports</div>
                    </div>
                    <div class="stat-box" style="padding:1.5rem;">
                        <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.uniqueAnalysts || 0}</div>
                        <div class="stat-label">Active Analysts</div>
                    </div>
                    <div class="stat-box" style="padding:1.5rem;">
                        <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.avgGrade || '0.0'}</div>
                        <div class="stat-label">Avg Overall Grade</div>
                    </div>
                    <div class="stat-box" style="padding:1.5rem;">
                        <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.totalTargets || 0}</div>
                        <div class="stat-label">Cataloged Targets</div>
                    </div>
                </div>
                ${overviewStats.topFigure ? `
                    <div class="card" style="margin-top:1rem; padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${overviewStats.topFigure.id})">
                        <div>
                            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">🏆 Highest Rated Target</div>
                            <div style="font-size:1.1rem; font-weight:700; margin-top:0.25rem;">${escapeHTML(overviewStats.topFigure.name)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.5rem; font-weight:800; color:var(--accent);">${overviewStats.topFigure.grade}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${overviewStats.topFigure.subs} report${overviewStats.topFigure.subs !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- INTEL HEADLINES -->
            ${headlines.length > 0 ? `
            <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📰 Intel Headlines</h3>
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    ${headlines.map(h => {
        const gradeColor = h.grade >= 70 ? 'var(--success)' : h.grade >= 45 ? '#fbbf24' : 'var(--danger)';
        const timeAgo = h.date ? new Date(h.date).toLocaleDateString() : '';
        return `
                            <div class="card" style="padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                                <div style="flex:1;">
                                    <div style="font-size:0.95rem; font-weight:500; line-height:1.4;">${escapeHTML(h.headline)}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">${escapeHTML(h.brand)} • ${escapeHTML(h.classTie)} • ${timeAgo}</div>
                                </div>
                                <div style="font-size:1.25rem; font-weight:800; color:${gradeColor}; white-space:nowrap;">${h.grade.toFixed(1)}</div>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
            ` : ''}

            <!-- SIMILAR FIGURES -->
            <div id="similarFigures" style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);"></div>

            <!-- COLLECTORS -->
            <div id="collectorsSection" style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light); display:none;"></div>

            <!-- DISCUSSION -->
            <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💬 Discussion</h3>
                <form id="figureCommentForm" style="margin-bottom:1.5rem; display:flex; gap:0.75rem;">
                    <input type="text" id="figureCommentInput" placeholder="Share your thoughts on this target..." style="flex:1; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-family:var(--font-body); font-size:0.9rem;">
                    <button type="submit" class="btn" style="width:auto; padding:0.75rem 1.5rem; font-size:0.85rem;">Post</button>
                </form>
                <div id="figureComments" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
            </div>
        </div>
    `;

    // --- Collection buttons wiring ---
    if (this.token) {
        const figId = this.currentTarget.id;
        const colBar = document.getElementById('collectionBar');
        const colRemoveBtn = document.getElementById('colRemoveBtn');
        const colTradeNote = document.getElementById('colTradeNote');

        // Fetch current collection status
        const setActiveStatus = (status) => {
            if (!colBar) return;
            colBar.querySelectorAll('.col-btn[data-status]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.status === status);
            });
            if (colRemoveBtn) colRemoveBtn.style.display = status ? 'inline-flex' : 'none';
            if (colTradeNote) colTradeNote.style.display = status === 'for_trade' ? 'block' : 'none';
        };

        (async () => {
            try {
                const myColRes = await this.authFetch(`${API_URL}/collection/my`);
                if (myColRes.ok) {
                    const myCol = await myColRes.json();
                    const entry = myCol.find(c => c.figureId === figId);
                    if (entry) setActiveStatus(entry.status);
                }
            } catch (e) { /* silent */ }
        })();

        if (colBar) {
            colBar.querySelectorAll('.col-btn[data-status]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const status = btn.dataset.status;
                    btn.disabled = true;
                    try {
                        const res = await this.authFetch(`${API_URL}/collection/${figId}`, {
                            method: 'POST',
                            body: JSON.stringify({ status })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            setActiveStatus(status);
                            this.showToast(data.message, 'success');
                        } else {
                            const err = await res.json();
                            this.showToast(err.error || 'Failed to update collection.', 'error');
                        }
                    } catch (e) { this.showToast('Network error.', 'error'); }
                    btn.disabled = false;
                });
            });
        }

        if (colRemoveBtn) {
            colRemoveBtn.addEventListener('click', async () => {
                colRemoveBtn.disabled = true;
                try {
                    const res = await this.authFetch(`${API_URL}/collection/${figId}`, { method: 'DELETE' });
                    if (res.ok) {
                        setActiveStatus(null);
                        this.showToast('Removed from collection.', 'success');
                    }
                } catch (e) { this.showToast('Network error.', 'error'); }
                colRemoveBtn.disabled = false;
            });
        }
    }

    // --- Collectors section ---
    (async () => {
        try {
            const colRes = await fetch(`${API_URL}/collection/figure/${this.currentTarget.id}`);
            if (!colRes.ok) return;
            const collectors = await colRes.json();
            if (collectors.length === 0) return;
            const section = document.getElementById('collectorsSection');
            if (!section) return;
            section.style.display = 'block';

            const owners = collectors.filter(c => c.status === 'owned');
            const traders = collectors.filter(c => c.status === 'for_trade');

            section.innerHTML = `
                <h3 style="margin-bottom:1rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">👥 Collectors</h3>
                <div style="display:flex; gap:2rem; flex-wrap:wrap;">
                    ${owners.length > 0 ? `
                    <div>
                        <div style="font-size:0.75rem; color:var(--success); text-transform:uppercase; font-weight:700; margin-bottom:0.5rem;">Owned By (${owners.length})</div>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                            ${owners.map(c => `<span class="collector-chip" onclick="app.viewUserProfile('${escapeHTML(c.username).replace(/'/g, "\\'")}')">${c.avatar ? `<img src="${c.avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:0.25rem;">` : ''}${escapeHTML(c.username)}</span>`).join('')}
                        </div>
                    </div>` : ''}
                    ${traders.length > 0 ? `
                    <div>
                        <div style="font-size:0.75rem; color:#a855f7; text-transform:uppercase; font-weight:700; margin-bottom:0.5rem;">For Trade (${traders.length})</div>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                            ${traders.map(c => `<span class="collector-chip" onclick="app.viewUserProfile('${escapeHTML(c.username).replace(/'/g, "\\'")}')">${c.avatar ? `<img src="${c.avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:0.25rem;">` : ''}${escapeHTML(c.username)}</span>`).join('')}
                        </div>
                    </div>` : ''}
                </div>
            `;
        } catch (e) { /* silent */ }
    })();

    setTimeout(() => {
        if (!isGuestimate && figureSubs.length > 0) {
            // Build unified timeline from submissions (grades) + market intel (prices by type)
            const timePoints = {};
            const sortedSubs = [...figureSubs].sort((a, b) => new Date(a.date) - new Date(b.date));
            sortedSubs.forEach(s => {
                const d = new Date(s.date);
                const key = d.toISOString().split('T')[0];
                if (!timePoints[key]) timePoints[key] = { ts: d.getTime(), grade: null, overseas: null, stateside: null, secondary: null };
                const g = (parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2;
                timePoints[key].grade = parseFloat(g.toFixed(1));
            });
            if (marketIntel && marketIntel.timeline) {
                marketIntel.timeline.forEach(t => {
                    const d = new Date(t.created_at);
                    const key = d.toISOString().split('T')[0];
                    if (!timePoints[key]) timePoints[key] = { ts: d.getTime(), grade: null, overseas: null, stateside: null, secondary: null };
                    const pt = t.priceType || 'secondary_market';
                    if (pt === 'overseas_msrp') timePoints[key].overseas = t.priceAvg;
                    else if (pt === 'stateside_msrp') timePoints[key].stateside = t.priceAvg;
                    else timePoints[key].secondary = t.priceAvg;
                });
            }
            const sortedTimeline = Object.entries(timePoints).sort((a, b) => a[1].ts - b[1].ts);
            const labels = sortedTimeline.map(e => new Date(e[1].ts).toLocaleDateString());
            const gradePoints = sortedTimeline.map(e => e[1].grade);
            const overseasPts = sortedTimeline.map(e => e[1].overseas);
            const statesidePts = sortedTimeline.map(e => e[1].stateside);
            const secondaryPts = sortedTimeline.map(e => e[1].secondary);

            const chartDatasets = [
                {
                    label: 'Community Grade',
                    data: gradePoints,
                    borderColor: '#ff0f39',
                    backgroundColor: 'rgba(255, 15, 57, 0.1)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    label: 'Overseas (MSRP)',
                    data: overseasPts,
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointStyle: 'circle',
                    pointRadius: 4,
                    yAxisID: 'y1',
                    spanGaps: true
                },
                {
                    label: 'Stateside (US Retail)',
                    data: statesidePts,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointStyle: 'rect',
                    pointRadius: 4,
                    yAxisID: 'y1',
                    spanGaps: true
                },
                {
                    label: 'Secondary Market',
                    data: secondaryPts,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderDash: [2, 4],
                    tension: 0.3,
                    pointStyle: 'triangle',
                    pointRadius: 5,
                    yAxisID: 'y1',
                    spanGaps: true
                }
            ];
            if (smartMsrp) {
                chartDatasets.push({
                    label: 'MSRP Baseline' + (msrpSource === 'community' ? ' (overseas avg)' : ''),
                    data: labels.map(() => smartMsrp),
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderDash: [10, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0,
                    yAxisID: 'y1',
                    spanGaps: true
                });
            }

            const ctx = document.getElementById('projectionsChart');
            if (ctx) {
                // Destroy previous chart instance if it exists
                if (ctx._chartInstance) { try { ctx._chartInstance.destroy(); } catch(e) {} }
                const pulseChart = new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: { labels, datasets: chartDatasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                min: 0,
                                max: 100,
                                title: { display: true, text: 'Overall Grade (0-100)', color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } },
                                grid: { color: 'rgba(255, 255, 255, 0.05)' }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                title: { display: true, text: 'Street Value (USD)', color: '#10b981', font: { size: 10 } },
                                grid: { drawOnChartArea: false }
                            }
                        }
                    }
                });
                // Wire chart toggle buttons
                document.querySelectorAll('.chartToggle').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.idx);
                        if (idx < pulseChart.data.datasets.length) {
                            const ds = pulseChart.data.datasets[idx];
                            ds.hidden = !ds.hidden;
                            btn.style.opacity = ds.hidden ? '0.4' : '1';
                            pulseChart.update();
                        }
                    });
                });
                // Store reference for cleanup on view change
                ctx._chartInstance = pulseChart;
                if (!this._activeCharts) this._activeCharts = [];
                this._activeCharts.push(pulseChart);
            }

            let galleryHtml = '';
            sortedSubs.forEach(s => {
                if (s.data && s.data.imagePath) {
                    const grade = s.mtsTotal ? ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1) : '—';
                    galleryHtml += `
                        <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                            <img src="${s.data.imagePath}" style="width:auto; height:200px; object-fit:contain; background:var(--bg-panel); border-radius:8px; border:1px solid var(--border); box-shadow: 0 4px 6px var(--accent-glow); cursor:pointer;" title="${escapeHTML(s.author)}'s Evidence" onclick="this.style.maxHeight = this.style.maxHeight === 'none' ? '200px' : 'none'; this.style.height = this.style.height === 'auto' ? '200px' : 'auto';">
                            <span style="font-size:0.75rem; color:var(--text-muted);">
                                by <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(s.author).replace(/'/g, "\\'")}')">${escapeHTML(s.author)}</span> · Grade: <span style="color:var(--accent); font-weight:600;">${grade}</span>
                            </span>
                        </div>`;
                }
            });
            if (galleryHtml) {
                document.getElementById('imageGallery').innerHTML = galleryHtml;
            }
        }
    }, 100);

    // Copy link button
    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const url = `${window.location.origin}${window.location.pathname}?figure=${this.currentTarget.id}`;
            navigator.clipboard.writeText(url).then(() => {
                copyBtn.textContent = '✓ Link Copied!';
                setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
            }).catch(() => {
                copyBtn.textContent = '✗ Failed';
                setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
            });
        });
    }

    // Request Assessment button
    const assessBtn = document.getElementById('requestAssessBtn');
    if (assessBtn) {
        assessBtn.addEventListener('click', () => {
            this.showShareModal(this.currentTarget.id, this.currentTarget.name);
        });
    }

    // Figure name edit handler (creator or admin)
    const editNameBtn = document.getElementById('editFigureNameBtn');
    if (editNameBtn) {
        editNameBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('figureNameDisplay');
            const currentName = this.currentTarget.name;
            nameEl.innerHTML = `
                <input type="text" id="figureNameInput" value="${escapeHTML(currentName)}" style="font-size:1.5rem; font-weight:700; background:var(--bg-surface); border:1px solid var(--accent); color:var(--text-primary); border-radius:var(--radius-sm); padding:0.25rem 0.5rem; width:100%; font-family:var(--font-heading);">
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button id="saveNameBtn" class="btn" style="padding:0.4rem 1rem; font-size:0.85rem;">Save</button>
                    <button id="cancelNameBtn" style="padding:0.4rem 1rem; font-size:0.85rem; background:none; border:1px solid var(--border-light); color:var(--text-secondary); border-radius:var(--radius-sm); cursor:pointer;">Cancel</button>
                </div>
            `;
            document.getElementById('figureNameInput').focus();
            document.getElementById('figureNameInput').select();

            document.getElementById('saveNameBtn').addEventListener('click', async () => {
                const newName = document.getElementById('figureNameInput').value.trim();
                if (!newName) return;
                if (newName === currentName) { app.renderPulse(container); return; }
                try {
                    const res = await app.authFetch(`${API_URL}/figures/name/${app.currentTarget.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name: newName })
                    });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                    app.currentTarget.name = newName;
                    const cached = MOCK_FIGURES.find(f => f.id === app.currentTarget.id);
                    if (cached) cached.name = newName;
                    app.renderPulse(container);
                } catch (err) { alert(err.message); }
            });

            document.getElementById('cancelNameBtn').addEventListener('click', () => {
                app.renderPulse(container);
            });
        });
    }

    // Load similar figures
    try {
        const allRes = await fetch(`${API_URL}/figures/ranked?category=${getActiveCategory()}`);
        if (allRes.ok) {
            const allFigures = await allRes.json();
            const similar = allFigures.filter(f =>
                f.id !== this.currentTarget.id &&
                (f.brand === this.currentTarget.brand || f.line === this.currentTarget.line)
            ).slice(0, 4);
            const simEl = document.getElementById('similarFigures');
            if (simEl && similar.length > 0) {
                simEl.innerHTML = `
                    <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">🔗 Similar Targets</h3>
                    <div class="grid-2">
                        ${similar.map(f => {
                            const grade = f.avgGrade ? parseFloat(f.avgGrade) : null;
                            const gradeColor = grade >= 70 ? 'var(--success)' : grade >= 45 ? '#fbbf24' : grade ? 'var(--danger)' : 'var(--text-muted)';
                            return `
                                <div class="card" style="padding:1.25rem; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                                        <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">${escapeHTML(f.brand)}</div>
                                        <span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}">${escapeHTML(f.classTie)}</span>
                                    </div>
                                    <div style="font-weight:700; font-size:1rem; margin-bottom:0.5rem;">${escapeHTML(f.name)}</div>
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span style="font-size:0.8rem; color:var(--text-muted);">${f.submissions || 0} report${(f.submissions || 0) !== 1 ? 's' : ''}</span>
                                        <span style="font-weight:800; color:${gradeColor};">${grade ? f.avgGrade : '—'}</span>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>`;
            }
        }
    } catch (e) { /* ignore */ }

    // Load and render figure comments (discussion)
    const loadComments = async () => {
        try {
            const res = await fetch(`${API_URL}/figures/${this.currentTarget.id}/comments`);
            if (res.ok) {
                const comments = await res.json();
                const el = document.getElementById('figureComments');
                if (el) {
                    el.innerHTML = comments.length ? comments.map(c => `
                        <div class="card" style="padding:0.75rem 1rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                                <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(c.author).replace(/'/g, "\\'")}')" style="font-weight:700; font-size:0.9rem;">${escapeHTML(c.author)}</span>
                                <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                            <p style="color:var(--text-primary); font-size:0.9rem; line-height:1.5; margin:0;">${escapeHTML(c.content)}</p>
                        </div>
                    `).join('') : '<p style="color:var(--text-muted); font-size:0.9rem;">No discussion yet. Be the first to share your thoughts!</p>';
                }
            }
        } catch (e) { /* ignore */ }
    };
    loadComments();

    const commentForm = document.getElementById('figureCommentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('figureCommentInput');
            const content = input.value.trim();
            if (!content) return;
            const btn = commentForm.querySelector('button');
            btn.disabled = true;
            btn.textContent = '...';
            try {
                const res = await this.authFetch(`${API_URL}/figures/${this.currentTarget.id}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({ content })
                });
                if (res.ok) {
                    input.value = '';
                    loadComments();
                }
            } catch (err) { /* ignore */ }
            btn.disabled = false;
            btn.textContent = 'Post';
        });
    }
};
