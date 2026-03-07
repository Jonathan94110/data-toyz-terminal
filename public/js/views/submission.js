// views/submission.js — Intel submission form with sliders

TerminalApp.prototype.createSlider = function(id, label, min, max, val, sublabel, step = 1, hasLabel = false) {
    if (hasLabel) {
        const oninput = `this.parentElement.nextElementSibling.querySelector('span span').innerText = parseFloat(this.value).toFixed(${step < 1 ? 1 : 0}); app.updateSliderLabel('${id}', this.value)`;
        return `
            <div class="form-group">
                <label class="form-label">${label} ${sublabel ? `<small style="color:var(--text-muted); font-weight:normal; font-size:0.8rem; display:block; margin-top:0.2rem;">${sublabel}</small>` : ''}</label>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <input type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1;" oninput="${oninput}">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
                    <span class="range-val" style="font-weight:700; color:var(--accent); font-family:var(--font-heading);"><span>${parseFloat(val).toFixed(step < 1 ? 1 : 0)}</span> / ${max}</span>
                    <span id="label_${id}" style="color:var(--text-secondary); font-style:italic; font-size:0.85rem;"></span>
                </div>
            </div>
        `;
    }
    return `
        <div class="form-group">
            <label class="form-label">${label} ${sublabel ? `<small style="color:var(--text-muted); font-weight:normal; font-size:0.8rem; display:block; margin-top:0.2rem;">${sublabel}</small>` : ''}</label>
            <div style="display:flex; align-items:center; gap:1rem;">
                <input type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1;" oninput="this.nextElementSibling.innerText = parseFloat(this.value).toFixed(${step < 1 ? 1 : 0}) + ' / ${max}'">
                <span class="range-val" style="width:60px; text-align:right; font-weight:700; color:var(--accent); font-family:var(--font-heading);">${parseFloat(val).toFixed(step < 1 ? 1 : 0)} / ${max}</span>
            </div>
        </div>
    `;
};

TerminalApp.prototype.riskDescriptions = {
    risk_character: {
        bullish: 'Demand for this character is rising \u2014 more collectors want it.',
        neutral: 'Character demand is steady \u2014 no major shifts expected.',
        bearish: 'Interest in this character is fading \u2014 fewer buyers ahead.'
    },
    risk_engineering: {
        bullish: 'This mold/engineering is aging well \u2014 holds up against newer releases.',
        neutral: 'Engineering is adequate \u2014 not being outclassed yet.',
        bearish: 'Better-engineered alternatives are emerging \u2014 this feels dated.'
    },
    risk_ecosystem: {
        bullish: 'Strong ecosystem support \u2014 complementary figures boost this one\u2019s value.',
        neutral: 'Ecosystem impact is minimal \u2014 stands on its own.',
        bearish: 'Ecosystem is weakening \u2014 line cancellations or gaps hurt appeal.'
    },
    risk_redeco: {
        bullish: 'Low redeco/reissue risk \u2014 this deco is likely to stay exclusive.',
        neutral: 'Moderate reissue chance \u2014 could go either way.',
        bearish: 'High redeco/reissue risk \u2014 a new version will likely tank value.'
    }
};

TerminalApp.prototype.createRiskSelector = function(id, label, defaultVal = 'neutral') {
    const desc = this.riskDescriptions[id];
    const infoId = 'riskInfo_' + id;
    return `
        <div class="form-group">
            <label class="form-label">${label}${desc ? ` <span class="risk-info-toggle" data-target="${infoId}">&#9432;</span>` : ''}</label>
            ${desc ? `<div id="${infoId}" class="risk-info-panel">
                <div><span class="ri-label ri-bull">\u25B2 Bullish</span> ${desc.bullish}</div>
                <div><span class="ri-label ri-neut">\u25CF Neutral</span> ${desc.neutral}</div>
                <div><span class="ri-label ri-bear">\u25BC Bearish</span> ${desc.bearish}</div>
            </div>` : ''}
            <div class="segmented-control">
                <label class="risk-bullish"><input type="radio" name="${id}" value="bullish" ${defaultVal === 'bullish' ? 'checked' : ''}><span>Bullish</span></label>
                <label class="risk-neutral"><input type="radio" name="${id}" value="neutral" ${defaultVal === 'neutral' ? 'checked' : ''}><span>Neutral</span></label>
                <label class="risk-bearish"><input type="radio" name="${id}" value="bearish" ${defaultVal === 'bearish' ? 'checked' : ''}><span>Bearish</span></label>
            </div>
        </div>
    `;
};

TerminalApp.prototype.sliderLabels = {
    // DTS sliders (0–20 scale)
    mts_community: [
        [0, "\u{1F9CA} Dead \u2014 Nobody's looking"],
        [5, "\u{1F4C9} Low \u2014 Minimal interest"],
        [8, "\u{1F937} Moderate \u2014 Some collectors aware"],
        [12, "\u{1F4C8} Growing \u2014 Buzz is building"],
        [16, "\u{1F525} High \u2014 Heavy demand"],
        [19, "\u{1F3C6} Explosive \u2014 Everyone wants it"]
    ],
    mts_buzz: [
        [0, "\u{1F507} Silent \u2014 Zero chatter"],
        [5, "\u{1F92B} Quiet \u2014 Occasional mentions"],
        [8, "\u{1F4AC} Building \u2014 Regular discussion"],
        [12, "\u{1F4E3} Loud \u2014 Trending topic"],
        [16, "\u{1F525} Viral \u2014 Dominating feeds"],
        [19, "\u{1F3C6} Cultural moment \u2014 Breaking through"]
    ],
    mts_liquidity: [
        [0, "\u{1F6AB} Frozen \u2014 Can't move it"],
        [5, "\u{1F40C} Slow \u2014 Long wait for buyers"],
        [8, "\u{1F504} Moderate \u2014 Trades with patience"],
        [12, "\u26A1 Active \u2014 Moves within days"],
        [16, "\u{1F525} Hot \u2014 Instant sell/trade"],
        [19, "\u{1F3C6} Liquid gold \u2014 Gone in minutes"]
    ],
    mts_risk: [
        [0, "\u2705 Minimal \u2014 Highly unlikely to be replaced"],
        [5, "\u{1F7E2} Low \u2014 Safe for now"],
        [8, "\u{1F937} Moderate \u2014 Could see a reissue"],
        [12, "\u26A0\uFE0F Elevated \u2014 Rumors circling"],
        [16, "\u{1F534} High \u2014 Replacement likely"],
        [19, "\u{1F480} Critical \u2014 Imminent reissue/restock"]
    ],
    mts_appeal: [
        [0, "\u{1F3AF} Niche \u2014 Deep-cut fans only"],
        [5, "\u{1F464} Limited \u2014 Single-fandom interest"],
        [8, "\u{1F465} Moderate \u2014 Cross-line appeal"],
        [12, "\u{1F310} Broad \u2014 Multi-fandom draw"],
        [16, "\u{1F525} Mainstream \u2014 Casual collectors want it"],
        [19, "\u{1F3C6} Universal \u2014 Everyone's grail"]
    ],
    // PQ sliders (0–10 scale, step 0.1)
    pq_build: [
        [0, "\u{1F5D1}\uFE0F Broken \u2014 Falls apart out of box"],
        [3, "\u26A0\uFE0F Fragile \u2014 Loose joints, cheap feel"],
        [5, "\u{1F937} Average \u2014 Gets the job done"],
        [7, "\u{1F44D} Solid \u2014 Tight joints, good heft"],
        [8.5, "\u{1F4AA} Premium \u2014 Built to last"],
        [9.5, "\u{1F3C6} Exceptional \u2014 Tank-like durability"]
    ],
    pq_paint: [
        [0, "\u{1F5D1}\uFE0F Botched \u2014 Sloppy, smeared, missing"],
        [3, "\u26A0\uFE0F Rough \u2014 Visible slop and bleeds"],
        [5, "\u{1F937} Passable \u2014 Minor blemishes"],
        [7, "\u{1F44D} Clean \u2014 Sharp lines, good coverage"],
        [8.5, "\u{1F4AA} Pristine \u2014 Museum-quality finish"],
        [9.5, "\u{1F3C6} Flawless \u2014 Perfection in every detail"]
    ],
    pq_articulation: [
        [0, "\u{1F5D1}\uFE0F Statue \u2014 Barely moves"],
        [3, "\u26A0\uFE0F Stiff \u2014 Limited, frustrating poses"],
        [5, "\u{1F937} Functional \u2014 Basic poses achievable"],
        [7, "\u{1F44D} Flexible \u2014 Good range of motion"],
        [8.5, "\u{1F4AA} Dynamic \u2014 Near-limitless posing"],
        [9.5, "\u{1F3C6} Best-in-class \u2014 Benchmark articulation"]
    ],
    pq_accuracy: [
        [0, "\u{1F5D1}\uFE0F Unrecognizable \u2014 Who is this?"],
        [3, "\u26A0\uFE0F Off \u2014 Proportions or details wrong"],
        [5, "\u{1F937} Approximate \u2014 Close enough"],
        [7, "\u{1F44D} Faithful \u2014 Recognizable and correct"],
        [8.5, "\u{1F4AA} Nailed it \u2014 Screen/page accurate"],
        [9.5, "\u{1F3C6} Perfect likeness \u2014 Definitive version"]
    ],
    pq_presence: [
        [0, "\u{1F5D1}\uFE0F Invisible \u2014 Disappears on shelf"],
        [3, "\u26A0\uFE0F Forgettable \u2014 Blends into background"],
        [5, "\u{1F937} Decent \u2014 Holds its spot"],
        [7, "\u{1F44D} Eye-catching \u2014 Draws attention"],
        [8.5, "\u{1F4AA} Commanding \u2014 Dominates the display"],
        [9.5, "\u{1F3C6} Showstopper \u2014 Centerpiece of any shelf"]
    ],
    pq_value: [
        [0, "\u{1F5D1}\uFE0F Robbery \u2014 Overpriced for what it is"],
        [3, "\u26A0\uFE0F Steep \u2014 Hard to justify the cost"],
        [5, "\u{1F937} Fair \u2014 You get what you pay for"],
        [7, "\u{1F44D} Good deal \u2014 Solid bang for buck"],
        [8.5, "\u{1F4AA} Great value \u2014 Exceeds expectations"],
        [9.5, "\u{1F3C6} Steal \u2014 Unbelievable for the price"]
    ],
    pq_packaging: [
        [0, "\u{1F5D1}\uFE0F Damaged \u2014 Barely protective"],
        [3, "\u26A0\uFE0F Basic \u2014 Plain box, no extras"],
        [5, "\u{1F937} Standard \u2014 Serviceable packaging"],
        [7, "\u{1F44D} Solid \u2014 Nice presentation, some extras"],
        [8.5, "\u{1F4AA} Premium \u2014 Collector-worthy unboxing"],
        [9.5, "\u{1F3C6} Deluxe \u2014 Art-piece packaging, loaded"]
    ]
};

TerminalApp.prototype.updateSliderLabel = function(id, val) {
    const labels = this.sliderLabels[id];
    if (!labels) return;
    const v = parseFloat(val);
    let label = labels[0][1];
    for (const [threshold, text] of labels) {
        if (v >= threshold) label = text;
    }
    const el = document.getElementById('label_' + id);
    if (el) el.innerText = label;
};

TerminalApp.prototype.updateFrustrationLabel = function(val) {
    const v = parseFloat(val);
    let l = "\u{1F937} 'Meh.' \u2014 Average, forgettable.";
    if (v < 3.0) l = "\u{1F5D1}\uFE0F 'Nightmare fuel.' \u2014 Painful, complex, break risk.";
    else if (v < 5.0) l = "\u26A0\uFE0F 'Frustrating.' \u2014 Fiddly, unclear steps.";
    else if (v < 6.0) l = "\u{1F937} 'Meh.' \u2014 Average, forgettable.";
    else if (v < 7.0) l = "\u{1F610} 'Manageable.' \u2014 Doable with patience.";
    else if (v < 8.0) l = "\u{1F44D} 'Smooth enough.' \u2014 Mostly enjoyable.";
    else if (v < 8.5) l = "\u{1F4AA} 'Clever.' \u2014 Rewarding, fun, smart.";
    else if (v < 9.0) l = "\u{1F525} 'Fan favorite.' \u2014 Collectors want to transform it.";
    else l = "\u{1F3C6} \u{1F410} 'Masterclass.' \u2014 Perfect balance of challenge & fun.";
    document.getElementById('label_trans_frustration').innerText = l;
};

TerminalApp.prototype.updateSatisfactionLabel = function(val) {
    const v = parseFloat(val);
    let l = "\u{1F937} 'Looks fine.' \u2014 Average display payoff.";
    if (v < 3.0) l = "\u{1F5D1}\uFE0F 'Still not worth it.' \u2014 Doesn't redeem frustration.";
    else if (v < 5.0) l = "\u26A0\uFE0F 'Disappointing finish.' \u2014 Underwhelming.";
    else if (v < 6.0) l = "\u{1F937} 'Looks fine.' \u2014 Average display payoff.";
    else if (v < 7.0) l = "\u{1F610} 'Decent reward.' \u2014 Redeems some hassle.";
    else if (v < 8.0) l = "\u{1F44D} 'Solid payoff.' \u2014 Struggle feels worth it.";
    else if (v < 8.5) l = "\u{1F4AA} 'Great result.' \u2014 Makes you forget frustration.";
    else if (v < 9.0) l = "\u{1F525} 'Stunning.' \u2014 Collectors rave about look.";
    else l = "\u{1F3C6} \u{1F410} 'Worth every step.' \u2014 Legendary final mode.";
    document.getElementById('label_trans_satisfaction').innerText = l;
};

TerminalApp.prototype.togglePriceInput = function(type) {
    const wrapper = document.getElementById('priceInput_' + type);
    const cbMap = { overseas_msrp: 'pt_overseas', stateside_msrp: 'pt_stateside', secondary_market: 'pt_secondary' };
    const cb = document.getElementById(cbMap[type]);
    if (wrapper) {
        wrapper.style.display = cb && cb.checked ? 'flex' : 'none';
        if (!cb.checked) {
            const inp = wrapper.querySelector('input[type="number"]');
            if (inp) inp.value = '';
        }
    }
};

TerminalApp.prototype.renderSubmission = function(container) {
    const isEdit = !!this.editingSubmission;
    const ed = isEdit ? (this.editingSubmission.data || {}) : {};

    // Backward compat: old submissions with market_price but no pricing_types
    if (isEdit && ed.market_price && !ed.pricing_types) {
        ed.price_secondary_market = ed.market_price;
        ed.pricing_types = ['secondary_market'];
    }

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                <button class="btn-outline" onclick="app.editingSubmission=null; app.currentView='${isEdit ? 'dashboard' : 'pulse'}'; app.renderApp();">&larr; Back</button>
                <div>
                    <h2 style="margin:0; font-size:2rem;">${isEdit ? 'Edit Intelligence Report' : 'Intelligence Submission'} <a onclick="app.currentView='docs'; app.renderApp(); setTimeout(()=>{const el=document.getElementById('doc-trade-scan');if(el)el.scrollIntoView({behavior:'smooth'});},200);" style="cursor:pointer; font-size:1rem; color:var(--text-muted); vertical-align:middle; margin-left:0.25rem;" title="View documentation">\u{1F4D6}</a></h2>
                    <div style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; margin-top:0.25rem;">Target: ${escapeHTML(this.currentTarget.name)}</div>
                </div>
            </div>

            ${isEdit && ed.imagePath ? `
            <div class="card" style="margin-bottom:1.5rem; padding:1rem;">
                <label class="form-label" style="margin-bottom:0.5rem;">Current Evidence Image</label>
                <img src="${ed.imagePath}" alt="Current evidence" style="max-width:100%; max-height:300px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; margin-top:0.5rem;">Upload a new image below to replace, or leave empty to keep this one.</p>
            </div>
            ` : ''}

            <form id="submissionForm">
                <!-- OWNERSHIP STATUS (Mandatory) -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>Ownership Status</h3>
                        <p>Confirm your relationship with this figure.</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">
                            Only <strong style="color:var(--success);">"In Hand"</strong> submissions contribute to the Community Pop Count.
                        </p>
                    </div>
                    <div style="display:flex; gap:0.75rem; flex-wrap:wrap; max-width:500px;">
                        <label style="flex:1; min-width:180px; display:flex; align-items:center; gap:0.5rem; padding:0.85rem 1rem; border:1px solid ${!isEdit || ed.ownership_status === 'in_hand' || !ed.ownership_status ? 'var(--success)' : 'var(--border-light)'}; border-radius:var(--radius-sm); cursor:pointer; background:${!isEdit || ed.ownership_status === 'in_hand' || !ed.ownership_status ? 'rgba(16,185,129,0.1)' : 'transparent'}; transition:all 0.2s;">
                            <input type="radio" name="ownership_status" value="in_hand" required ${!isEdit || ed.ownership_status === 'in_hand' || !ed.ownership_status ? 'checked' : ''}>
                            <span style="font-weight:600; font-size:0.9rem;">In Hand (Physically Owned)</span>
                        </label>
                        <label style="flex:1; min-width:180px; display:flex; align-items:center; gap:0.5rem; padding:0.85rem 1rem; border:1px solid ${isEdit && ed.ownership_status === 'digital_only' ? 'var(--neutral)' : 'var(--border-light)'}; border-radius:var(--radius-sm); cursor:pointer; background:${isEdit && ed.ownership_status === 'digital_only' ? 'rgba(99,102,241,0.1)' : 'transparent'}; transition:all 0.2s;">
                            <input type="radio" name="ownership_status" value="digital_only" required ${isEdit && ed.ownership_status === 'digital_only' ? 'checked' : ''}>
                            <span style="font-weight:600; font-size:0.9rem;">Observed / Digital Review Only</span>
                        </label>
                    </div>
                </div>

                <!-- SECTION 1: DATA TOYZ TRADING SCORE -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>1. Data Toyz Trading Score (DTS)</h3>
                        <p>Rate the following 5 Pillars (0-20 points each).</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">Combined DTS Total (0&ndash;100) reflects overall market sentiment. Higher scores indicate stronger market positioning.</p>
                    </div>
                    <div class="grid-2">
                        ${this.createSlider('mts_community', 'Community Demand', 0, 20, isEdit && ed.mts_community != null ? ed.mts_community : 10, 'Hype & Desirability', 1, true)}
                        ${this.createSlider('mts_buzz', 'Buzz Momentum', 0, 20, isEdit && ed.mts_buzz != null ? ed.mts_buzz : 10, 'Current Social Momentum', 1, true)}
                        ${this.createSlider('mts_liquidity', 'Trade Liquidity', 0, 20, isEdit && ed.mts_liquidity != null ? ed.mts_liquidity : 10, 'Ease of moving the item', 1, true)}
                        ${this.createSlider('mts_risk', 'Replaceability Risk', 0, 20, isEdit && ed.mts_risk != null ? ed.mts_risk : 10, 'Likelihood of alternative release', 1, true)}
                        ${this.createSlider('mts_appeal', 'Cross-Faction Appeal', 0, 20, isEdit && ed.mts_appeal != null ? ed.mts_appeal : 10, 'Broader collector interest', 1, true)}
                    </div>
                </div>

                <!-- SECTION 2: 4-AXIS FORECASTING -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>2. Shelf Presence &amp; Longevity</h3>
                        <p>How long will this figure hold its value and relevance?</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">
                            <strong>Bullish</strong> = price likely to rise &nbsp;|&nbsp; <strong>Neutral</strong> = stable/minimal movement &nbsp;|&nbsp; <strong>Bearish</strong> = price likely to decline
                        </p>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <label class="form-label">Forecast Horizon</label>
                        <div class="segmented-control">
                            <label><input type="radio" name="timeframe" value="short" ${!isEdit || ed.timeframe === 'short' ? 'checked' : ''}><span>Short (0-6m)</span></label>
                            <label><input type="radio" name="timeframe" value="mid" ${isEdit && ed.timeframe === 'mid' ? 'checked' : ''}><span>Mid (6-18m)</span></label>
                            <label><input type="radio" name="timeframe" value="long" ${isEdit && ed.timeframe === 'long' ? 'checked' : ''}><span>Long (18-36m)</span></label>
                        </div>
                    </div>

                    <div class="grid-2">
                        ${this.createRiskSelector('risk_character', 'Character Demand', isEdit && ed.risk_character ? ed.risk_character : 'neutral')}
                        ${this.createRiskSelector('risk_engineering', 'Engineering Relevance', isEdit && ed.risk_engineering ? ed.risk_engineering : 'neutral')}
                        ${this.createRiskSelector('risk_ecosystem', 'Ecosystem Dependency', isEdit && ed.risk_ecosystem ? ed.risk_ecosystem : 'neutral')}
                        ${this.createRiskSelector('risk_redeco', 'Redeco Risk', isEdit && ed.risk_redeco ? ed.risk_redeco : 'neutral')}
                    </div>
                </div>

                <!-- SECTION 3: PHYSICAL QUALITY SCALES -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>3. Physical Quality Metrics</h3>
                        <p>Rate the in-hand objective quality (0.0 to 10.0).</p>
                    </div>
                    <div class="grid-2">
                        ${this.createSlider('pq_build', 'Build Quality', 0, 10, isEdit && ed.pq_build != null ? ed.pq_build : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_paint', 'Paint Application', 0, 10, isEdit && ed.pq_paint != null ? ed.pq_paint : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_articulation', 'Articulation/Function', 0, 10, isEdit && ed.pq_articulation != null ? ed.pq_articulation : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_accuracy', 'Design Accuracy', 0, 10, isEdit && ed.pq_accuracy != null ? ed.pq_accuracy : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_presence', 'Display Presence', 0, 10, isEdit && ed.pq_presence != null ? ed.pq_presence : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_value', 'Price/Value Ratio', 0, 10, isEdit && ed.pq_value != null ? ed.pq_value : 5.0, '', 0.1, true)}
                        ${this.createSlider('pq_packaging', 'Packaging/Extras', 0, 10, isEdit && ed.pq_packaging != null ? ed.pq_packaging : 5.0, '', 0.1, true)}
                    </div>

                    <div style="margin-top:2rem; padding-top:2rem; border-top:1px solid var(--border-light);">
                        <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
                            <input type="checkbox" id="has_transformation" name="has_transformation"
                                ${isEdit ? (ed.has_transformation === false ? '' : 'checked') : ((this.currentTarget.category || 'transformer') === 'transformer' ? 'checked' : '')}
                                onchange="document.getElementById('transformationSliders').style.display = this.checked ? 'block' : 'none';">
                            <label for="has_transformation" style="font-weight:700; color:var(--accent); font-size:1.1rem; cursor:pointer;">Has Transformation?</label>
                            <span style="font-size:0.78rem; color:var(--text-muted);">(M.A.S.K., Voltron, Go-Bots, etc.)</span>
                        </div>
                        <div id="transformationSliders" style="display:${isEdit ? (ed.has_transformation === false ? 'none' : 'block') : ((this.currentTarget.category || 'transformer') === 'transformer' ? 'block' : 'none')};">
                        <h4 style="margin-bottom:1.5rem; color:var(--accent); font-size:1.2rem;">Transformation Analysis</h4>

                        <div class="form-group" style="margin-bottom:2rem;">
                            <label class="form-label" style="font-size:1rem;">Transformation Frustration Scale (1.0 - 10.0)</label>
                            <input type="range" id="trans_frustration" name="trans_frustration" min="1.0" max="10.0" step="0.1" value="${isEdit && ed.trans_frustration != null ? ed.trans_frustration : '5.5'}" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateFrustrationLabel(this.value)">
                            <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                <span style="font-weight:700; color:var(--accent);"><span>${isEdit && ed.trans_frustration != null ? parseFloat(ed.trans_frustration).toFixed(1) : '5.5'}</span> / 10</span>
                                <span id="label_trans_frustration" style="color:var(--text-secondary); font-style:italic;"></span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label" style="font-size:1rem;">After-Transformation Satisfaction Scale (1.0 - 10.0)</label>
                            <input type="range" id="trans_satisfaction" name="trans_satisfaction" min="1.0" max="10.0" step="0.1" value="${isEdit && ed.trans_satisfaction != null ? ed.trans_satisfaction : '5.5'}" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateSatisfactionLabel(this.value)">
                            <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                <span style="font-weight:700; color:var(--accent);"><span>${isEdit && ed.trans_satisfaction != null ? parseFloat(ed.trans_satisfaction).toFixed(1) : '5.5'}</span> / 10</span>
                                <span id="label_trans_satisfaction" style="color:var(--text-secondary); font-style:italic;"></span>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 4: EVIDENCE -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>4. Analyst Notes & Evidence</h3>
                    </div>
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label">Upload Evidence (Image)</label>
                        <input type="file" id="image_upload" name="image_upload" accept="image/*" style="width:100%; padding: 0.5rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary);">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Analyst Field Notes</label>
                        <textarea id="analyst_notes" name="analyst_notes" rows="4" placeholder="Detail engineering quirks, market context, or specific observations...">${isEdit && ed.analyst_notes ? escapeHTML(ed.analyst_notes) : ''}</textarea>
                    </div>
                </div>

                <!-- SECTION 5: PRICING CONTEXT -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>5. What Did You Pay?</h3>
                        <p>Where did you buy this figure? Select the source and enter what you paid.</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">Select at least one. If you bought from multiple sources, select all that apply.</p>
                    </div>

                    ${this.currentTarget.msrp ? `
                    <div class="form-group" style="margin-bottom:1.5rem;">
                        <label class="form-label" style="font-size:0.8rem; color:var(--text-muted);">Reference MSRP</label>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:1.25rem; color:var(--text-muted);">$</span>
                            <span style="font-size:1.25rem; font-weight:800; color:var(--success);">${parseFloat(this.currentTarget.msrp).toFixed(2)}</span>
                        </div>
                    </div>
                    ` : ''}

                    <div style="${this.currentTarget.msrp ? 'border-top:1px solid var(--border-light); padding-top:1.5rem;' : ''}">
                        <!-- Overseas Retail -->
                        <div class="pricing-type-row" style="margin-bottom:1.25rem;">
                            <label style="display:flex; align-items:center; gap:0.75rem; cursor:pointer;">
                                <input type="checkbox" id="pt_overseas" onchange="app.togglePriceInput('overseas_msrp')"
                                    ${isEdit && ed.pricing_types && ed.pricing_types.includes('overseas_msrp') ? 'checked' : ''}>
                                <span style="font-weight:600; color:#10b981;">🌏 Overseas Retail</span>
                                <span style="font-size:0.8rem; color:var(--text-muted);">I bought from a retailer outside the US</span>
                            </label>
                            <div id="priceInput_overseas_msrp" style="display:${isEdit && ed.price_overseas_msrp ? 'flex' : 'none'}; align-items:center; gap:0.5rem; margin-top:0.75rem; margin-left:2rem;">
                                <span style="font-size:1.25rem; color:var(--text-secondary);">$</span>
                                <input type="number" name="price_overseas_msrp" id="price_overseas_msrp_input" step="0.01" min="0" placeholder="85.00"
                                    ${isEdit && ed.price_overseas_msrp ? `value="${ed.price_overseas_msrp}"` : ''}
                                    style="width:100%; max-width:200px; padding:0.65rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.1rem;">
                            </div>
                        </div>

                        <!-- US Retail -->
                        <div class="pricing-type-row" style="margin-bottom:1.25rem;">
                            <label style="display:flex; align-items:center; gap:0.75rem; cursor:pointer;">
                                <input type="checkbox" id="pt_stateside" onchange="app.togglePriceInput('stateside_msrp')"
                                    ${isEdit && ed.pricing_types && ed.pricing_types.includes('stateside_msrp') ? 'checked' : ''}>
                                <span style="font-weight:600; color:#f59e0b;">🇺🇸 US Retail</span>
                                <span style="font-size:0.8rem; color:var(--text-muted);">I bought from a US retailer</span>
                            </label>
                            <div id="priceInput_stateside_msrp" style="display:${isEdit && ed.price_stateside_msrp ? 'flex' : 'none'}; align-items:center; gap:0.5rem; margin-top:0.75rem; margin-left:2rem;">
                                <span style="font-size:1.25rem; color:var(--text-secondary);">$</span>
                                <input type="number" name="price_stateside_msrp" id="price_stateside_msrp_input" step="0.01" min="0" placeholder="99.99"
                                    ${isEdit && ed.price_stateside_msrp ? `value="${ed.price_stateside_msrp}"` : ''}
                                    style="width:100%; max-width:200px; padding:0.65rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.1rem;">
                            </div>
                        </div>

                        <!-- Secondary Market -->
                        <div class="pricing-type-row" style="margin-bottom:1rem;">
                            <label style="display:flex; align-items:center; gap:0.75rem; cursor:pointer;">
                                <input type="checkbox" id="pt_secondary" onchange="app.togglePriceInput('secondary_market')"
                                    ${isEdit && ed.pricing_types && ed.pricing_types.includes('secondary_market') ? 'checked' : ''}>
                                <span style="font-weight:600; color:#ef4444;">🔄 Aftermarket / Resale</span>
                                <span style="font-size:0.8rem; color:var(--text-muted);">I bought secondhand (eBay, Mercari, trade, etc.)</span>
                            </label>
                            <div id="priceInput_secondary_market" style="display:${isEdit && ed.price_secondary_market ? 'flex' : 'none'}; align-items:center; gap:0.5rem; margin-top:0.75rem; margin-left:2rem;">
                                <span style="font-size:1.25rem; color:var(--text-secondary);">$</span>
                                <input type="number" name="price_secondary_market" id="price_secondary_market_input" step="0.01" min="0" placeholder="150.00"
                                    ${isEdit && ed.price_secondary_market ? `value="${ed.price_secondary_market}"` : ''}
                                    style="width:100%; max-width:200px; padding:0.65rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.1rem;">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 6: RECOMMENDATION -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>6. Community Recommendation</h3>
                        <p>Do you officially recommend acquiring this target?</p>
                    </div>
                    <div class="segmented-control" style="max-width:400px; margin:0 auto;">
                        <label class="risk-bullish">
                            <input type="radio" name="recommendation" value="yes" required ${isEdit && ed.recommendation === 'yes' ? 'checked' : ''}>
                            <span>YES</span>
                        </label>
                        <label class="risk-bearish">
                            <input type="radio" name="recommendation" value="no" required ${isEdit && ed.recommendation === 'no' ? 'checked' : ''}>
                            <span>NO</span>
                        </label>
                    </div>
                </div>

                <!-- SECTION 7: TRADE VALUE STAR RATING -->
                <div class="card form-section">
                    <div class="section-header">
                        <h3>7. Trade Value Rating</h3>
                        <p>How would you rate this figure's overall trade value? (1-5 Stars)</p>
                    </div>
                    <input type="hidden" id="tradeRating" name="tradeRating" value="${isEdit && ed.tradeRating ? ed.tradeRating : '0'}">
                    <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:1rem;">
                        ${[1, 2, 3, 4, 5].map(n => `
                            <button type="button" class="starBtn" data-val="${n}" style="background:none; border:none; cursor:pointer; font-size:2.5rem; color:var(--border-light); transition:all 0.2s; padding:0.25rem;" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
                                \u2605
                            </button>
                        `).join('')}
                    </div>
                    <div id="tradeRatingLabel" style="text-align:center; margin-top:0.75rem; font-size:0.95rem; color:var(--text-muted); font-style:italic;">Select a rating</div>
                </div>

                <button type="submit" class="btn" style="width:100%; padding:1.25rem; font-size:1.2rem; margin-top:1rem;">${isEdit ? 'Update Intelligence Report' : 'Commit Intelligence Report'}</button>
            </form>
        </div>
    `;

    // Handle Form Submission
    document.getElementById('submissionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const rating = parseInt(document.getElementById('tradeRating').value);
        if (!rating || rating < 1) {
            alert('Please select a Trade Value Rating (1-5 Stars) before submitting.');
            return;
        }
        this.submitIntel(e.target);
    });

    // Star Rating Handlers
    const starLabels = ['', '\u2605 Poor \u2014 Not worth trading for', '\u2605\u2605 Below Average \u2014 Limited appeal', '\u2605\u2605\u2605 Fair \u2014 Decent trade value', '\u2605\u2605\u2605\u2605 Great \u2014 High demand piece', '\u2605\u2605\u2605\u2605\u2605 Elite \u2014 Grail-tier trade asset'];
    document.querySelectorAll('.starBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val);
            document.getElementById('tradeRating').value = val;
            document.getElementById('tradeRatingLabel').innerText = starLabels[val];
            document.getElementById('tradeRatingLabel').style.color = '#fbbf24';
            document.querySelectorAll('.starBtn').forEach(b => {
                b.style.color = parseInt(b.dataset.val) <= val ? '#fbbf24' : 'var(--border-light)';
            });
        });
    });

    // Pre-fill star rating and labels for edit mode
    if (isEdit && ed.tradeRating) {
        const preVal = parseInt(ed.tradeRating);
        if (preVal >= 1 && preVal <= 5) {
            document.getElementById('tradeRatingLabel').innerText = starLabels[preVal];
            document.getElementById('tradeRatingLabel').style.color = '#fbbf24';
            document.querySelectorAll('.starBtn').forEach(b => {
                b.style.color = parseInt(b.dataset.val) <= preVal ? '#fbbf24' : 'var(--border-light)';
            });
        }
    }

    // Risk info ⓘ — hover (desktop) + tap toggle (mobile)
    document.querySelectorAll('.risk-info-toggle').forEach(icon => {
        const panelId = icon.dataset.target;
        const panel = document.getElementById(panelId);
        if (!panel) return;
        // Hover: show/hide
        icon.addEventListener('mouseenter', () => panel.classList.add('visible'));
        icon.addEventListener('mouseleave', () => {
            setTimeout(() => { if (!panel.matches(':hover')) panel.classList.remove('visible'); }, 80);
        });
        panel.addEventListener('mouseleave', () => panel.classList.remove('visible'));
        // Tap: pin toggle (mobile fallback)
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            const wasOpen = panel.classList.contains('pinned');
            // Close all others first
            document.querySelectorAll('.risk-info-panel.pinned').forEach(p => p.classList.remove('pinned'));
            if (!wasOpen) panel.classList.add('pinned');
        });
    });
    // Tap outside closes pinned panels
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.risk-info-toggle') && !e.target.closest('.risk-info-panel')) {
            document.querySelectorAll('.risk-info-panel.pinned').forEach(p => p.classList.remove('pinned'));
        }
    });

    // Initialize transformation labels with current slider values
    this.updateFrustrationLabel(document.getElementById('trans_frustration').value);
    this.updateSatisfactionLabel(document.getElementById('trans_satisfaction').value);

    // Initialize all DTS + PQ slider labels
    ['mts_community','mts_buzz','mts_liquidity','mts_risk','mts_appeal',
     'pq_build','pq_paint','pq_articulation','pq_accuracy','pq_presence','pq_value','pq_packaging'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) this.updateSliderLabel(id, el.value);
    });

};

TerminalApp.prototype.submitIntel = async function(form) {
    const isEdit = !!this.editingSubmission;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerText;

    // Inline validation before submit
    const ownershipCheck = form.querySelector('input[name="ownership_status"]:checked');
    if (!ownershipCheck) {
        this.showFormError('Please select your Ownership Status.');
        form.querySelector('input[name="ownership_status"]').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    const recommendation = form.querySelector('input[name="recommendation"]:checked');
    if (!recommendation) {
        this.showFormError('Please select a Community Recommendation (Yes or No).');
        form.querySelector('input[name="recommendation"]').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    // Validate at least one pricing type selected with a value
    const pricingTypes = [];
    const ptChecks = { overseas_msrp: 'pt_overseas', stateside_msrp: 'pt_stateside', secondary_market: 'pt_secondary' };
    for (const [type, cbId] of Object.entries(ptChecks)) {
        const cb = document.getElementById(cbId);
        const inp = document.getElementById('price_' + type + '_input');
        if (cb && cb.checked && inp && parseFloat(inp.value) > 0) {
            pricingTypes.push(type);
        }
    }
    if (pricingTypes.length === 0) {
        this.showFormError('Please select at least one pricing category and enter a valid amount.');
        const pricingSection = form.querySelector('.pricing-type-row');
        if (pricingSection) pricingSection.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerText = isEdit ? 'Updating Report...' : 'Committing Report...';
    submitBtn.style.opacity = '0.7';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Attach multi-type pricing array and clean up old fields
    data.pricing_types = pricingTypes;
    delete data.market_price;
    delete data.cost_basis;
    // Remove checkbox names from data (they're just toggles, not values)
    delete data.pt_overseas;
    delete data.pt_stateside;
    delete data.pt_secondary;

    // Track transformation opt-in
    const hasTrans = document.getElementById('has_transformation')?.checked ?? true;
    data.has_transformation = hasTrans;
    delete data.has_transformation_checkbox; // clean up FormData artifact
    if (!hasTrans) { data.trans_frustration = 0; data.trans_satisfaction = 0; }

    // Calculate scores
    // Replaceability Risk is inverted: low risk = high scarcity value (20 - risk)
    const mtsTotal = parseFloat(data.mts_community) + parseFloat(data.mts_buzz) + parseFloat(data.mts_liquidity) + (20 - parseFloat(data.mts_risk)) + parseFloat(data.mts_appeal);

    let pqSum = parseFloat(data.pq_build) + parseFloat(data.pq_paint) + parseFloat(data.pq_articulation) + parseFloat(data.pq_accuracy) + parseFloat(data.pq_presence) + parseFloat(data.pq_value) + parseFloat(data.pq_packaging);
    if (hasTrans) { pqSum += parseFloat(data.trans_frustration) + parseFloat(data.trans_satisfaction); }
    const maxPQ = hasTrans ? 90 : 70;
    const approvalScore = ((pqSum / maxPQ) * 100).toFixed(1);
    const overallGrade = ((parseFloat(mtsTotal) + parseFloat(approvalScore)) / 2).toFixed(1);

    const formPayload = new FormData();
    formPayload.append('targetId', this.currentTarget.id);
    formPayload.append('targetName', this.currentTarget.name);
    formPayload.append('targetTier', this.currentTarget.classTie);
    formPayload.append('date', isEdit ? this.editingSubmission.date : new Date().toISOString());
    formPayload.append('mtsTotal', mtsTotal.toString());
    formPayload.append('approvalScore', approvalScore.toString());

    data.overallGrade = overallGrade;
    formPayload.append('data', JSON.stringify(data));

    let imageFile = document.getElementById('image_upload').files[0];
    if (imageFile) {
        imageFile = await this.compressImage(imageFile, 1200, 0.8);
        formPayload.append('image', imageFile);
    }

    try {
        const url = isEdit ? `${API_URL}/submissions/${this.editingSubmission.id}` : `${API_URL}/submissions`;
        const method = isEdit ? 'PUT' : 'POST';
        const req = await this.authFetch(url, { method, body: formPayload });
        if (req.ok) {
            this.editingSubmission = null;
            if (isEdit) {
                this.showFormSuccess(`Intelligence report updated. Overall Grade: ${overallGrade}/100`);
                this.currentView = 'dashboard';
            } else {
                this.showFormSuccess(`Intelligence on ${this.currentTarget.name} committed. Overall Grade: ${overallGrade}/100`);
                this.currentView = 'pulse';
            }
            setTimeout(() => this.renderApp(), 1500);
        } else {
            const errData = await req.json().catch(() => ({}));
            this.showFormError(errData.error || `Submission failed (${req.status}). Please try again.`);
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            submitBtn.style.opacity = '1';
        }
    } catch (e) {
        this.showFormError('Connection error. Please check your network and try again.');
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
        submitBtn.style.opacity = '1';
    }
};

TerminalApp.prototype.showFormSuccess = function(msg) {
    this.dismissFormToast();
    const toast = document.createElement('div');
    toast.id = 'formToast';
    toast.style.cssText = 'position:fixed; top:1.5rem; left:50%; transform:translateX(-50%); background:var(--success); color:#fff; padding:1rem 2rem; border-radius:var(--radius-sm); font-weight:700; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); font-size:1rem; text-align:center; max-width:90vw; animation:fadeIn 0.3s ease;';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};

TerminalApp.prototype.showFormError = function(msg) {
    this.dismissFormToast();
    const toast = document.createElement('div');
    toast.id = 'formToast';
    toast.style.cssText = 'position:fixed; top:1.5rem; left:50%; transform:translateX(-50%); background:var(--danger); color:#fff; padding:1rem 2rem; border-radius:var(--radius-sm); font-weight:700; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); font-size:1rem; text-align:center; max-width:90vw; animation:fadeIn 0.3s ease;';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
};

TerminalApp.prototype.dismissFormToast = function() {
    const existing = document.getElementById('formToast');
    if (existing) existing.remove();
};
