// views/scorecard.js — Live Scorecard presentation tool for YouTube streaming
// No database writes — purely a visual/broadcast tool

if (typeof TerminalApp !== 'undefined') {
    TerminalApp.prototype.renderScorecard = function(container) {
        container.innerHTML = this._scorecardHTML();
        this._scorecardBind(container);
    };
}

// Shared rendering logic (used by both in-app view and standalone page)
function renderScorecardStandalone(container, figures) {
    container.innerHTML = buildScorecardHTML(figures);
    bindScorecardEvents(container, figures);
}

function buildScorecardHTML(figures) {
    const sliderLabels = {
        mts_community: [[0,"🧊 Dead"],[5,"📉 Low"],[8,"🤷 Moderate"],[12,"📈 Growing"],[16,"🔥 High"],[19,"🏆 Explosive"]],
        mts_buzz: [[0,"🔇 Silent"],[5,"🤫 Quiet"],[8,"💬 Building"],[12,"📣 Loud"],[16,"🔥 Viral"],[19,"🏆 Cultural moment"]],
        mts_liquidity: [[0,"🚫 Frozen"],[5,"🐌 Slow"],[8,"🔄 Moderate"],[12,"⚡ Active"],[16,"🔥 Hot"],[19,"🏆 Liquid gold"]],
        mts_risk: [[0,"✅ Minimal"],[5,"🟢 Low"],[8,"🤷 Moderate"],[12,"⚠️ Elevated"],[16,"🔴 High"],[19,"💀 Critical"]],
        mts_appeal: [[0,"🎯 Niche"],[5,"👤 Limited"],[8,"👥 Moderate"],[12,"🌐 Broad"],[16,"🔥 Mainstream"],[19,"🏆 Universal"]],
        pq_build: [[0,"🗑️ Broken"],[3,"⚠️ Fragile"],[5,"🤷 Average"],[7,"👍 Solid"],[8.5,"💪 Premium"],[9.5,"🏆 Exceptional"]],
        pq_paint: [[0,"🗑️ Botched"],[3,"⚠️ Rough"],[5,"🤷 Passable"],[7,"👍 Clean"],[8.5,"💪 Pristine"],[9.5,"🏆 Flawless"]],
        pq_articulation: [[0,"🗑️ Statue"],[3,"⚠️ Stiff"],[5,"🤷 Functional"],[7,"👍 Flexible"],[8.5,"💪 Dynamic"],[9.5,"🏆 Best-in-class"]],
        pq_accuracy: [[0,"🗑️ Unrecognizable"],[3,"⚠️ Off"],[5,"🤷 Approximate"],[7,"👍 Faithful"],[8.5,"💪 Nailed it"],[9.5,"🏆 Perfect likeness"]],
        pq_presence: [[0,"🗑️ Invisible"],[3,"⚠️ Forgettable"],[5,"🤷 Decent"],[7,"👍 Eye-catching"],[8.5,"💪 Commanding"],[9.5,"🏆 Showstopper"]],
        pq_value: [[0,"🗑️ Robbery"],[3,"⚠️ Steep"],[5,"🤷 Fair"],[7,"👍 Good deal"],[8.5,"💪 Great value"],[9.5,"🏆 Steal"]],
        pq_packaging: [[0,"🗑️ Damaged"],[3,"⚠️ Basic"],[5,"🤷 Standard"],[7,"👍 Solid"],[8.5,"💪 Premium"],[9.5,"🏆 Deluxe"]],
        trans_frustration: [[1,"🗑️ Nightmare"],[3,"⚠️ Frustrating"],[5,"🤷 Average"],[6,"😐 Manageable"],[7,"👍 Smooth"],[8,"💪 Clever"],[8.5,"🔥 Fan favorite"],[9,"🏆 Masterclass"]],
        trans_satisfaction: [[1,"🗑️ Not worth it"],[3,"⚠️ Disappointing"],[5,"🤷 Looks fine"],[6,"😐 Decent"],[7,"👍 Solid payoff"],[8,"💪 Great result"],[8.5,"🔥 Stunning"],[9,"🏆 Legendary"]]
    };

    function getLabel(id, val) {
        const labels = sliderLabels[id];
        if (!labels) return '';
        let label = labels[0][1];
        for (const [threshold, text] of labels) {
            if (val >= threshold) label = text;
        }
        return label;
    }

    function sliderRow(id, label, min, max, val, color, step = 1) {
        const pct = ((val - min) / (max - min) * 100).toFixed(0);
        const decimals = step < 1 ? 1 : 0;
        return `
            <div class="sc-slider-row" data-slider-id="${id}">
                <div class="sc-slider-label">${label}</div>
                <div class="sc-slider-track-wrap">
                    <input type="range" class="sc-range" id="sc_${id}" min="${min}" max="${max}" step="${step}" value="${val}"
                        style="--fill-pct:${pct}%; --fill-color:${color};">
                </div>
                <div class="sc-slider-val" id="sc_val_${id}">${parseFloat(val).toFixed(decimals)}/${max}</div>
                <div class="sc-slider-emoji" id="sc_lbl_${id}">${getLabel(id, val)}</div>
            </div>`;
    }

    return `
    <div class="sc-container">
        <!-- HEADER: Figure Selection + Image + Hero Stats -->
        <div class="sc-header">
            <div class="sc-figure-col">
                <div class="sc-image-wrapper" id="scImageWrapper">
                    <div class="sc-image-placeholder" id="scImagePlaceholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;opacity:0.3;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                        <span>Upload Image</span>
                    </div>
                    <img id="scImage" class="sc-image" style="display:none;" alt="Figure">
                    <input type="file" id="scImageInput" accept="image/*" style="display:none;">
                </div>
            </div>
            <div class="sc-info-col">
                <div class="sc-search-wrap">
                    <input type="text" id="scFigureName" class="sc-figure-input" placeholder="Type or search figure name..." autocomplete="off">
                    <div id="scSearchDropdown" class="sc-search-dropdown" style="display:none;"></div>
                </div>
                <div class="sc-figure-meta" id="scFigureMeta"></div>

                <div class="sc-hero-stats">
                    <div class="sc-hero-box sc-hero-dts">
                        <div class="sc-hero-value" id="scHeroDts">50.0</div>
                        <div class="sc-hero-label">DTS Total</div>
                        <div class="sc-hero-sub">/100</div>
                    </div>
                    <div class="sc-hero-box sc-hero-approval">
                        <div class="sc-hero-value" id="scHeroApproval">50.0</div>
                        <div class="sc-hero-label">Approval</div>
                        <div class="sc-hero-sub">/100</div>
                    </div>
                    <div class="sc-hero-box sc-hero-overall">
                        <div class="sc-hero-value" id="scHeroOverall">50.0</div>
                        <div class="sc-hero-label">Overall Grade</div>
                        <div class="sc-hero-sub">/100</div>
                    </div>
                </div>

                <!-- Star Rating -->
                <div class="sc-star-row">
                    <span class="sc-star-label">Trade Value:</span>
                    ${[1,2,3,4,5].map(n => `<button type="button" class="sc-star" data-val="${n}">★</button>`).join('')}
                    <span class="sc-star-text" id="scStarText">Select</span>
                </div>
            </div>
        </div>

        <!-- SLIDERS -->
        <div class="sc-sections">
            <!-- DTS Metrics -->
            <div class="sc-section">
                <div class="sc-section-title" style="color:#ff2a5f;">🔴 DTS METRICS <span class="sc-section-scale">(0-20 scale)</span></div>
                ${sliderRow('mts_community','Community Demand',0,20,10,'#ff2a5f')}
                ${sliderRow('mts_buzz','Buzz Momentum',0,20,10,'#ff2a5f')}
                ${sliderRow('mts_liquidity','Trade Liquidity',0,20,10,'#ff2a5f')}
                ${sliderRow('mts_risk','Replaceability Risk',0,20,10,'#ff2a5f')}
                ${sliderRow('mts_appeal','Cross-Faction Appeal',0,20,10,'#ff2a5f')}
            </div>

            <!-- Physical Quality -->
            <div class="sc-section">
                <div class="sc-section-title" style="color:#10b981;">🟢 PHYSICAL QUALITY <span class="sc-section-scale">(0-10 scale)</span></div>
                ${sliderRow('pq_build','Build Quality',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_paint','Paint Application',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_articulation','Articulation',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_accuracy','Design Accuracy',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_presence','Display Presence',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_value','Price / Value',0,10,5.0,'#10b981',0.1)}
                ${sliderRow('pq_packaging','Packaging',0,10,5.0,'#10b981',0.1)}
            </div>

            <!-- Transformation -->
            <div class="sc-section">
                <div class="sc-section-title" style="color:#f59e0b;">🟡 TRANSFORMATION <span class="sc-section-scale">(1-10 scale)</span></div>
                ${sliderRow('trans_frustration','Frustration Score',1,10,5.5,'#f59e0b',0.1)}
                ${sliderRow('trans_satisfaction','Satisfaction',1,10,5.5,'#f59e0b',0.1)}
            </div>
        </div>

        <!-- Reset Button -->
        <div class="sc-footer">
            <button class="sc-reset-btn" id="scResetBtn">🔄 Reset Scorecard</button>
        </div>
    </div>`;
}

function bindScorecardEvents(container, figures) {
    const sliderLabels = {
        mts_community: [[0,"🧊 Dead"],[5,"📉 Low"],[8,"🤷 Moderate"],[12,"📈 Growing"],[16,"🔥 High"],[19,"🏆 Explosive"]],
        mts_buzz: [[0,"🔇 Silent"],[5,"🤫 Quiet"],[8,"💬 Building"],[12,"📣 Loud"],[16,"🔥 Viral"],[19,"🏆 Cultural moment"]],
        mts_liquidity: [[0,"🚫 Frozen"],[5,"🐌 Slow"],[8,"🔄 Moderate"],[12,"⚡ Active"],[16,"🔥 Hot"],[19,"🏆 Liquid gold"]],
        mts_risk: [[0,"✅ Minimal"],[5,"🟢 Low"],[8,"🤷 Moderate"],[12,"⚠️ Elevated"],[16,"🔴 High"],[19,"💀 Critical"]],
        mts_appeal: [[0,"🎯 Niche"],[5,"👤 Limited"],[8,"👥 Moderate"],[12,"🌐 Broad"],[16,"🔥 Mainstream"],[19,"🏆 Universal"]],
        pq_build: [[0,"🗑️ Broken"],[3,"⚠️ Fragile"],[5,"🤷 Average"],[7,"👍 Solid"],[8.5,"💪 Premium"],[9.5,"🏆 Exceptional"]],
        pq_paint: [[0,"🗑️ Botched"],[3,"⚠️ Rough"],[5,"🤷 Passable"],[7,"👍 Clean"],[8.5,"💪 Pristine"],[9.5,"🏆 Flawless"]],
        pq_articulation: [[0,"🗑️ Statue"],[3,"⚠️ Stiff"],[5,"🤷 Functional"],[7,"👍 Flexible"],[8.5,"💪 Dynamic"],[9.5,"🏆 Best-in-class"]],
        pq_accuracy: [[0,"🗑️ Unrecognizable"],[3,"⚠️ Off"],[5,"🤷 Approximate"],[7,"👍 Faithful"],[8.5,"💪 Nailed it"],[9.5,"🏆 Perfect likeness"]],
        pq_presence: [[0,"🗑️ Invisible"],[3,"⚠️ Forgettable"],[5,"🤷 Decent"],[7,"👍 Eye-catching"],[8.5,"💪 Commanding"],[9.5,"🏆 Showstopper"]],
        pq_value: [[0,"🗑️ Robbery"],[3,"⚠️ Steep"],[5,"🤷 Fair"],[7,"👍 Good deal"],[8.5,"💪 Great value"],[9.5,"🏆 Steal"]],
        pq_packaging: [[0,"🗑️ Damaged"],[3,"⚠️ Basic"],[5,"🤷 Standard"],[7,"👍 Solid"],[8.5,"💪 Premium"],[9.5,"🏆 Deluxe"]],
        trans_frustration: [[1,"🗑️ Nightmare"],[3,"⚠️ Frustrating"],[5,"🤷 Average"],[6,"😐 Manageable"],[7,"👍 Smooth"],[8,"💪 Clever"],[8.5,"🔥 Fan favorite"],[9,"🏆 Masterclass"]],
        trans_satisfaction: [[1,"🗑️ Not worth it"],[3,"⚠️ Disappointing"],[5,"🤷 Looks fine"],[6,"😐 Decent"],[7,"👍 Solid payoff"],[8,"💪 Great result"],[8.5,"🔥 Stunning"],[9,"🏆 Legendary"]]
    };

    const starLabels = ['','★ Poor','★★ Below Average','★★★ Fair','★★★★ Great','★★★★★ Elite'];

    function getLabel(id, val) {
        const labels = sliderLabels[id];
        if (!labels) return '';
        let label = labels[0][1];
        for (const [threshold, text] of labels) {
            if (val >= threshold) label = text;
        }
        return label;
    }

    function gradeColor(val) {
        if (val >= 80) return '#10b981';
        if (val >= 60) return '#f59e0b';
        return '#ef4444';
    }

    function recalc() {
        const v = id => parseFloat(document.getElementById('sc_' + id).value);
        const dts = v('mts_community') + v('mts_buzz') + v('mts_liquidity') + v('mts_risk') + v('mts_appeal');
        const pqSum = v('pq_build') + v('pq_paint') + v('pq_articulation') + v('pq_accuracy') + v('pq_presence') + v('pq_value') + v('pq_packaging') + v('trans_frustration') + v('trans_satisfaction');
        const approval = ((pqSum / 90) * 100);
        const overall = (dts + approval) / 2;

        const dtsEl = document.getElementById('scHeroDts');
        const appEl = document.getElementById('scHeroApproval');
        const ovrEl = document.getElementById('scHeroOverall');

        dtsEl.textContent = dts.toFixed(1);
        appEl.textContent = approval.toFixed(1);
        ovrEl.textContent = overall.toFixed(1);

        // Color code
        dtsEl.style.color = gradeColor(dts);
        appEl.style.color = gradeColor(approval);
        ovrEl.style.color = gradeColor(overall);
    }

    // Bind all sliders
    container.querySelectorAll('.sc-range').forEach(slider => {
        const id = slider.id.replace('sc_', '');
        const step = parseFloat(slider.step);
        const decimals = step < 1 ? 1 : 0;
        const max = parseFloat(slider.max);
        const min = parseFloat(slider.min);

        slider.addEventListener('input', function() {
            const val = parseFloat(this.value);
            const pct = ((val - min) / (max - min) * 100).toFixed(0);
            this.style.setProperty('--fill-pct', pct + '%');
            document.getElementById('sc_val_' + id).textContent = val.toFixed(decimals) + '/' + max;
            document.getElementById('sc_lbl_' + id).textContent = getLabel(id, val);
            recalc();
        });
    });

    // Initial calc
    recalc();

    // Image upload
    const imageInput = document.getElementById('scImageInput');
    const imageWrapper = document.getElementById('scImageWrapper');
    const imagePlaceholder = document.getElementById('scImagePlaceholder');
    const imageEl = document.getElementById('scImage');
    let imageURL = null;

    imageWrapper.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            if (imageURL) URL.revokeObjectURL(imageURL);
            imageURL = URL.createObjectURL(this.files[0]);
            imageEl.src = imageURL;
            imageEl.style.display = 'block';
            imagePlaceholder.style.display = 'none';
        }
    });

    // Auto-load figure image from latest submission
    function loadFigureImage(figureId) {
        const apiBase = typeof API_URL !== 'undefined' ? API_URL : '/api';
        fetch(apiBase + '/submissions/target/' + figureId)
            .then(res => res.ok ? res.json() : [])
            .then(subs => {
                // Find latest submission with an image
                const withImage = subs
                    .filter(s => s.data && s.data.imagePath)
                    .sort((a, b) => new Date(b.date) - new Date(a.date));
                if (withImage.length > 0) {
                    const imgSrc = withImage[0].data.imagePath;
                    imageEl.src = imgSrc;
                    imageEl.style.display = 'block';
                    imagePlaceholder.style.display = 'none';
                    // Clear any local blob URL since we're using a DB image
                    if (imageURL) { URL.revokeObjectURL(imageURL); imageURL = null; }
                }
            })
            .catch(() => { /* silent — user can still upload manually */ });
    }

    // Figure search autocomplete
    const nameInput = document.getElementById('scFigureName');
    const dropdown = document.getElementById('scSearchDropdown');
    const metaEl = document.getElementById('scFigureMeta');
    let searchTimeout = null;

    nameInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const q = this.value.trim().toLowerCase();
        if (q.length < 2) { dropdown.style.display = 'none'; return; }
        searchTimeout = setTimeout(() => {
            const matches = (figures || []).filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
            if (matches.length === 0) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = matches.map(f => `
                <div class="sc-search-item" data-id="${f.id}">
                    <span class="sc-search-name">${escapeHTML(f.name)}</span>
                    <span class="sc-search-brand">${escapeHTML(f.brand || '')} ${escapeHTML(f.line || '')}</span>
                </div>
            `).join('');
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.sc-search-item').forEach(item => {
                item.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    const fig = figures.find(f => f.id == this.dataset.id);
                    if (fig) {
                        nameInput.value = fig.name;
                        const parts = [];
                        if (fig.brand) parts.push(fig.brand);
                        if (fig.line) parts.push(fig.line);
                        if (fig.classTie) parts.push(fig.classTie);
                        metaEl.textContent = parts.join(' · ');
                        metaEl.style.display = parts.length ? 'block' : 'none';
                        // Auto-load the figure's latest submission image
                        loadFigureImage(fig.id);
                    }
                    dropdown.style.display = 'none';
                });
            });
        }, 150);
    });

    nameInput.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });

    // Star rating
    let starVal = 0;
    container.querySelectorAll('.sc-star').forEach(btn => {
        btn.addEventListener('click', function() {
            starVal = parseInt(this.dataset.val);
            document.getElementById('scStarText').textContent = starLabels[starVal];
            container.querySelectorAll('.sc-star').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.val) <= starVal);
            });
        });
    });

    // Reset
    document.getElementById('scResetBtn').addEventListener('click', () => {
        // Reset sliders
        container.querySelectorAll('.sc-range').forEach(slider => {
            const id = slider.id.replace('sc_', '');
            const step = parseFloat(slider.step);
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const isDts = id.startsWith('mts_');
            const isTrans = id.startsWith('trans_');
            const defaultVal = isDts ? 10 : (isTrans ? 5.5 : 5.0);
            slider.value = defaultVal;
            const pct = ((defaultVal - min) / (max - min) * 100).toFixed(0);
            slider.style.setProperty('--fill-pct', pct + '%');
            const decimals = step < 1 ? 1 : 0;
            document.getElementById('sc_val_' + id).textContent = parseFloat(defaultVal).toFixed(decimals) + '/' + max;
            document.getElementById('sc_lbl_' + id).textContent = getLabel(id, defaultVal);
        });
        // Reset stars
        starVal = 0;
        document.getElementById('scStarText').textContent = 'Select';
        container.querySelectorAll('.sc-star').forEach(b => b.classList.remove('active'));
        // Reset image
        if (imageURL) { URL.revokeObjectURL(imageURL); imageURL = null; }
        imageEl.style.display = 'none';
        imagePlaceholder.style.display = 'flex';
        imageInput.value = '';
        // Reset figure
        nameInput.value = '';
        metaEl.textContent = '';
        metaEl.style.display = 'none';
        // Recalc
        recalc();
    });
}

// In-app version — adapter
if (typeof TerminalApp !== 'undefined') {
    TerminalApp.prototype._scorecardHTML = function() {
        return buildScorecardHTML(typeof MOCK_FIGURES !== 'undefined' ? MOCK_FIGURES : []);
    };
    TerminalApp.prototype._scorecardBind = function(container) {
        bindScorecardEvents(container, typeof MOCK_FIGURES !== 'undefined' ? MOCK_FIGURES : []);
    };
}
