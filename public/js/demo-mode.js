// demo-mode.js — Client-side demo sandbox (zero backend persistence)
// All demo data lives in sessionStorage and vanishes on tab close.

const DemoMode = {

    // ─── Lifecycle ───────────────────────────────────────────────────

    isActive() {
        return sessionStorage.getItem('DEMO_MODE') === 'true';
    },

    enter(app) {
        sessionStorage.setItem('DEMO_MODE', 'true');
        app.token = 'demo-token';
        app.user = {
            id: 0, username: 'DemoAnalyst', email: 'demo@datatoyz.app',
            role: 'analyst', avatar: null, created_at: new Date().toISOString()
        };
        MOCK_FIGURES = [...DemoMode.FIGURES];
        DemoMode.seedSubmissions();
        app.currentView = 'search';
        app.renderApp();
        history.replaceState({ view: 'search' }, '');
        app._historyReady = true;
    },

    restore(app) {
        app.token = 'demo-token';
        app.user = {
            id: 0, username: 'DemoAnalyst', email: 'demo@datatoyz.app',
            role: 'analyst', avatar: null, created_at: new Date().toISOString()
        };
        MOCK_FIGURES = [...DemoMode.FIGURES];
        // Merge any user-added figures from session
        const extra = JSON.parse(sessionStorage.getItem('demo_extra_figures') || '[]');
        extra.forEach(f => { if (!MOCK_FIGURES.find(m => m.id === f.id)) MOCK_FIGURES.push(f); });
        const savedView = sessionStorage.getItem('terminalView') || 'search';
        app.currentView = savedView;
        app.renderApp();
        history.replaceState({ view: savedView }, '');
        app._historyReady = true;
    },

    cleanup() {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k.startsWith('demo_') || k === 'DEMO_MODE') keys.push(k);
        }
        keys.forEach(k => sessionStorage.removeItem(k));
    },

    getBannerHTML() {
        return `<div style="background:linear-gradient(90deg, #6366f1, #a855f7); color:#fff; padding:0.5rem 1.5rem; text-align:center; font-weight:600; font-size:0.85rem; display:flex; justify-content:center; align-items:center; gap:1rem; flex-wrap:wrap;">
            <span>DEMO MODE &mdash; All data is temporary and will vanish when you close this tab</span>
            <button onclick="app.logout()" style="background:rgba(255,255,255,0.2); border:none; color:#fff; padding:0.3rem 0.75rem; border-radius:4px; cursor:pointer; font-weight:600; font-size:0.8rem;">Exit Demo</button>
        </div>`;
    },

    // ─── Storage Helpers ─────────────────────────────────────────────

    getSubmissions() {
        return JSON.parse(sessionStorage.getItem('demo_submissions') || '[]');
    },

    saveSubmissions(subs) {
        sessionStorage.setItem('demo_submissions', JSON.stringify(subs));
    },

    seedSubmissions() {
        if (sessionStorage.getItem('demo_submissions')) return; // already seeded
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const seed = [
            DemoMode._makeSub(90001, 9001, 'AlphaReviewer', new Date(now - 14 * day).toISOString(),
                { mts_community: 16, mts_buzz: 14, mts_liquidity: 15, mts_risk: 12, mts_appeal: 15 },
                { pq_build: 8.2, pq_paint: 7.5, pq_articulation: 6.8, pq_accuracy: 7.0, pq_presence: 8.5, pq_value: 5.0, pq_packaging: 7.0 },
                { trans_frustration: 6.0, trans_satisfaction: 7.5 },
                'in_hand', 'yes', 4, ['secondary_market'], { secondary_market: 289.99 },
                'Exceptional build quality. Paint is clean with minor stress marks on hip ratchets. Transformation is involved but satisfying.',
                { risk_character: 'bullish', risk_engineering: 'neutral', risk_ecosystem: 'bullish', risk_redeco: 'neutral', timeframe: 'mid' }),
            DemoMode._makeSub(90002, 9001, 'BetaCollector', new Date(now - 7 * day).toISOString(),
                { mts_community: 14, mts_buzz: 12, mts_liquidity: 13, mts_risk: 10, mts_appeal: 14 },
                { pq_build: 7.8, pq_paint: 8.0, pq_articulation: 7.2, pq_accuracy: 7.5, pq_presence: 9.0, pq_value: 6.0, pq_packaging: 7.5 },
                { trans_frustration: 5.5, trans_satisfaction: 8.0 },
                'in_hand', 'yes', 4, ['secondary_market', 'overseas_msrp'], { secondary_market: 275.00, overseas_msrp: 249.99 },
                'Solid figure. Display presence is outstanding — shelf presence rivals official MP line. Great value at import price.',
                { risk_character: 'bullish', risk_engineering: 'bullish', risk_ecosystem: 'neutral', risk_redeco: 'neutral', timeframe: 'short' }),
            DemoMode._makeSub(90003, 9002, 'GammaTrader', new Date(now - 10 * day).toISOString(),
                { mts_community: 18, mts_buzz: 16, mts_liquidity: 17, mts_risk: 8, mts_appeal: 17 },
                { pq_build: 9.0, pq_paint: 8.5, pq_articulation: 8.0, pq_accuracy: 9.0, pq_presence: 9.5, pq_value: 4.0, pq_packaging: 8.0 },
                { trans_frustration: 4.0, trans_satisfaction: 9.0 },
                'in_hand', 'yes', 5, ['secondary_market', 'stateside_msrp'], { secondary_market: 520.00, stateside_msrp: 399.99 },
                'The definitive Convoy. Premium in every way but the price is brutal. Still, aftermarket keeps climbing.',
                { risk_character: 'bullish', risk_engineering: 'bullish', risk_ecosystem: 'bullish', risk_redeco: 'bearish', timeframe: 'long' }),
            DemoMode._makeSub(90004, 9003, 'AlphaReviewer', new Date(now - 3 * day).toISOString(),
                { mts_community: 10, mts_buzz: 8, mts_liquidity: 11, mts_risk: 14, mts_appeal: 9 },
                { pq_build: 6.5, pq_paint: 7.0, pq_articulation: 7.5, pq_accuracy: 6.0, pq_presence: 6.5, pq_value: 8.0, pq_packaging: 5.5 },
                { trans_frustration: 7.0, trans_satisfaction: 5.0 },
                'digital_only', 'no', 2, ['secondary_market'], { secondary_market: 75.00 },
                'Decent budget option but paint apps are inconsistent. Transformation is fiddly with thin tabs.',
                { risk_character: 'neutral', risk_engineering: 'bearish', risk_ecosystem: 'neutral', risk_redeco: 'bearish', timeframe: 'short' })
        ];
        DemoMode.saveSubmissions(seed);
    },

    _makeSub(id, targetId, author, date, dts, pq, trans, ownership, rec, stars, pricingTypes, prices, notes, risks) {
        const fig = DemoMode.FIGURES.find(f => f.id === targetId);
        const mtsTotal = dts.mts_community + dts.mts_buzz + dts.mts_liquidity + dts.mts_risk + dts.mts_appeal;
        const pqSum = pq.pq_build + pq.pq_paint + pq.pq_articulation + pq.pq_accuracy + pq.pq_presence + pq.pq_value + pq.pq_packaging + trans.trans_frustration + trans.trans_satisfaction;
        const approvalScore = ((pqSum / 90) * 100).toFixed(1);
        const overallGrade = ((mtsTotal + parseFloat(approvalScore)) / 2).toFixed(1);
        const data = {
            ...dts, ...pq, ...trans, ...risks,
            ownership_status: ownership, recommendation: rec, tradeRating: stars,
            pricing_types: pricingTypes, analyst_notes: notes, overallGrade
        };
        pricingTypes.forEach(pt => { data['price_' + pt] = prices[pt]; });
        return {
            id, targetId, targetName: fig ? fig.name : 'Unknown',
            targetTier: fig ? fig.classTie : 'Unknown',
            author, date, editedAt: null,
            mtsTotal: mtsTotal.toString(), approvalScore,
            ownership_status: ownership,
            data, imagePath: null
        };
    },

    // ─── Figure Catalog ──────────────────────────────────────────────

    FIGURES: [
        { id: 9001, name: 'FT-55 Maverick', brand: 'Fans Toys', line: 'Masterpiece', classTie: 'Commander', msrp: 249.99, createdBy: 'admin' },
        { id: 9002, name: 'MP-44 Convoy', brand: 'Takara Tomy', line: 'Masterpiece', classTie: 'Leader', msrp: 399.99, createdBy: 'admin' },
        { id: 9003, name: 'XTB Savant', brand: 'X-Transbots', line: 'MasterMind', classTie: 'Voyager', msrp: 89.99, createdBy: 'admin' },
        { id: 9004, name: 'MMC Kultur', brand: 'Mastermind Creations', line: 'Reformatted', classTie: 'Voyager', msrp: 79.99, createdBy: 'admin' },
        { id: 9005, name: 'DX9 Gewalt', brand: 'DX9', line: 'War in Pocket', classTie: 'Deluxe', msrp: 34.99, createdBy: 'admin' },
        { id: 9006, name: 'NA Stratos', brand: 'Newage', line: 'H-Series', classTie: 'Legends', msrp: 29.99, createdBy: 'admin' },
        { id: 9007, name: 'ZT Arc', brand: 'Zeta Toys', line: 'Toys', classTie: 'Voyager', msrp: 64.99, createdBy: 'admin' },
        { id: 9008, name: 'MS Light of Victory', brand: 'Magic Square', line: 'Light of Peace', classTie: 'Legends', msrp: 39.99, createdBy: 'admin' }
    ],

    // ─── Mock Fetch Router ───────────────────────────────────────────

    async mockFetch(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const path = url.replace(API_URL, '');
        let body = null;
        let status = 200;

        // --- AUTH ---
        if (path === '/auth/me') {
            body = app.user;
        }
        else if (path === '/auth/login' || path === '/auth/register') {
            body = app.user;
        }

        // --- FIGURES ---
        else if (path === '/figures' || path === '/figures/ranked') {
            const subs = DemoMode.getSubmissions();
            body = MOCK_FIGURES.map(f => {
                const fSubs = subs.filter(s => s.targetId === f.id);
                const grades = fSubs.map(s => (parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
                return { ...f, submissions: fSubs.length, avgGrade: grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null };
            });
        }
        else if (path.match(/^\/figures\/top-rated/)) {
            body = DemoMode._topRated();
        }
        else if (path.match(/^\/figures\/market-ranked/)) {
            body = DemoMode._marketRanked();
        }
        else if (path.match(/^\/figures\/leaderboard/)) {
            body = DemoMode._leaderboard(url);
        }

        // --- FIGURE ANALYTICS ---
        else if (path.match(/^\/figures\/(\d+)\/community-metrics$/)) {
            const tid = parseInt(path.match(/(\d+)/)[0]);
            body = DemoMode.buildCommunityMetrics(tid);
        }
        else if (path.match(/^\/figures\/(\d+)\/market-intel/)) {
            const tid = parseInt(path.match(/(\d+)/)[0]);
            body = DemoMode.buildMarketIntel(tid, url);
        }

        // --- SUBMISSIONS ---
        else if (path.match(/^\/submissions\/target\/(\d+)/)) {
            const tid = parseInt(path.match(/(\d+)/)[0]);
            body = DemoMode.getSubmissions().filter(s => s.targetId === tid);
        }
        else if (path.match(/^\/submissions\/user\//)) {
            const parts = path.split('/');
            const username = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
            const allSubs = DemoMode.getSubmissions().filter(s => s.author === username);
            // Handle pagination params
            const urlObj = new URL(url, window.location.origin);
            const page = parseInt(urlObj.searchParams.get('page') || '1');
            const limit = parseInt(urlObj.searchParams.get('limit') || '20');
            const start = (page - 1) * limit;
            body = allSubs.slice(start, start + limit);
        }
        else if (path === '/submissions' && method === 'POST') {
            body = { id: Date.now(), message: 'Demo submission saved' };
        }
        else if (path.match(/^\/submissions\/(\d+)$/) && method === 'DELETE') {
            const sid = parseInt(path.match(/(\d+)$/)[0]);
            const subs = DemoMode.getSubmissions().filter(s => s.id !== sid);
            DemoMode.saveSubmissions(subs);
            body = { message: 'Deleted' };
        }

        // --- STATS ---
        else if (path === '/stats/overview') {
            body = DemoMode.buildOverviewStats();
        }
        else if (path === '/stats/headlines') {
            body = DemoMode.buildHeadlines();
        }
        else if (path === '/stats/brand-index') {
            body = DemoMode.buildBrandIndex();
        }
        else if (path.startsWith('/stats/market-volume')) {
            body = DemoMode.buildMarketVolume();
        }

        // --- NOTIFICATIONS (stub) ---
        else if (path.match(/\/notifications\/.*\/count/)) {
            body = { unread: 0 };
        }
        else if (path.match(/\/notifications/)) {
            body = [];
        }

        // --- ROOMS (stub) ---
        else if (path.match(/\/rooms\/.*\/unread-total/)) {
            body = { unread: 0 };
        }
        else if (path.match(/\/rooms/)) {
            body = [];
        }

        // --- POSTS / FEED (stub) ---
        else if (path.startsWith('/posts')) {
            body = { posts: [], total: 0 };
        }

        // --- USERS ---
        else if (path.match(/^\/users\/(.+)\/profile$/)) {
            const username = decodeURIComponent(path.match(/\/users\/(.+)\/profile$/)[1]);
            body = { username, role: 'analyst', created_at: new Date().toISOString(), avatar: null, bio: 'Demo user profile' };
        }
        else if (path.match(/^\/users\/(.+)\/stats$/)) {
            body = { totalSubmissions: 0, avgGrade: 0, uniqueFigures: 0, rank: null };
        }
        else if (path.match(/^\/leaderboard/)) {
            body = [];
        }

        // --- FALLBACK ---
        if (body === null) body = {};

        return new Response(JSON.stringify(body), {
            status, headers: { 'Content-Type': 'application/json' }
        });
    },

    // ─── Analytics Generators ────────────────────────────────────────

    buildCommunityMetrics(targetId) {
        const subs = DemoMode.getSubmissions().filter(s => s.targetId === targetId);
        if (subs.length === 0) return { count: 0 };

        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const pluck = (key) => subs.map(s => parseFloat(s.data[key] || 0));

        const dts = {
            community_demand: avg(pluck('mts_community')),
            buzz: avg(pluck('mts_buzz')),
            liquidity: avg(pluck('mts_liquidity')),
            risk: avg(pluck('mts_risk')),
            appeal: avg(pluck('mts_appeal'))
        };
        dts.total = dts.community_demand + dts.buzz + dts.liquidity + dts.risk + dts.appeal;

        const pqKeys = ['pq_build', 'pq_paint', 'pq_articulation', 'pq_accuracy', 'pq_presence', 'pq_value', 'pq_packaging'];
        const pq = {};
        pqKeys.forEach(k => { pq[k.replace('pq_', '')] = avg(pluck(k)); });

        const transformation = {
            frustration: avg(pluck('trans_frustration')),
            satisfaction: avg(pluck('trans_satisfaction'))
        };

        const approvalAvg = avg(subs.map(s => parseFloat(s.approvalScore)));
        const overallAvg = (dts.total + approvalAvg) / 2;
        const tradeRating = avg(subs.map(s => parseFloat(s.data.tradeRating || 0)));
        const yesCount = subs.filter(s => s.data.recommendation === 'yes').length;
        const noCount = subs.filter(s => s.data.recommendation === 'no').length;

        // Price by type
        const priceTypes = ['overseas_msrp', 'stateside_msrp', 'secondary_market'];
        const marketPriceByType = {};
        let allPrices = [];
        priceTypes.forEach(pt => {
            const prices = subs
                .filter(s => s.data.pricing_types && s.data.pricing_types.includes(pt) && s.data['price_' + pt])
                .map(s => parseFloat(s.data['price_' + pt]));
            if (prices.length > 0) {
                marketPriceByType[pt] = { avg: avg(prices), count: prices.length };
                allPrices = allPrices.concat(prices);
            }
        });

        // Pop count
        const inHandSubs = subs.filter(s => (s.data.ownership_status || s.ownership_status) === 'in_hand');
        const inHandAuthors = new Set(inHandSubs.map(s => s.author));

        return {
            count: subs.length,
            dts, pq, transformation,
            approvalAvg, overallAvg,
            tradeRating,
            recommendation: { yes: yesCount, no: noCount },
            marketPriceAvg: allPrices.length ? avg(allPrices) : null,
            marketPriceByType,
            popCount: {
                uniqueOwnerCount: inHandAuthors.size,
                inHandCount: inHandSubs.length,
                digitalOnlyCount: subs.length - inHandSubs.length,
                totalSubmissions: subs.length
            }
        };
    },

    buildMarketIntel(targetId, url) {
        const subs = DemoMode.getSubmissions().filter(s => s.targetId === targetId);
        const fig = MOCK_FIGURES.find(f => f.id === targetId);
        const msrp = fig ? fig.msrp : null;

        const entries = [];
        subs.forEach(s => {
            if (!s.data.pricing_types) return;
            s.data.pricing_types.forEach(pt => {
                const price = parseFloat(s.data['price_' + pt]);
                if (price > 0) entries.push({ price, date: s.date, type: pt, author: s.author });
            });
        });

        // Apply price_type filter from URL if present
        const urlObj = new URL(url, window.location.origin);
        const ptFilter = urlObj.searchParams.get('price_type');
        const filtered = ptFilter ? entries.filter(e => e.type === ptFilter) : entries;

        if (filtered.length === 0) {
            return { msrp, transactions: { total: 0, confidence: 'low', rolling30: {}, rolling90: {}, lifetime: {} }, timeline: [] };
        }

        const prices = filtered.map(e => e.price);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const lo = Math.min(...prices);
        const hi = Math.max(...prices);
        const pctOverMsrp = msrp ? parseFloat((((avg - msrp) / msrp) * 100).toFixed(1)) : null;

        return {
            msrp,
            transactions: {
                total: filtered.length,
                confidence: filtered.length >= 5 ? 'high' : filtered.length >= 2 ? 'medium' : 'low',
                rolling30: { avg, high: hi, low: lo, count: filtered.length },
                rolling90: { avg, high: hi, low: lo, count: filtered.length },
                lifetime: { avg, high: hi, low: lo, count: filtered.length },
                pctOverMsrp,
                volatility: parseFloat((hi - lo).toFixed(2))
            },
            timeline: filtered.map(e => ({ created_at: e.date, priceAvg: e.price, submitted_by: e.author, price_type: e.type })),
            marketSignal: pctOverMsrp > 20 ? 'hot' : pctOverMsrp > 0 ? 'warm' : 'cool'
        };
    },

    buildOverviewStats() {
        const subs = DemoMode.getSubmissions();
        const grades = subs.map(s => (parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
        const avgGrade = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : '0';
        const uniqueAnalysts = new Set(subs.map(s => s.author)).size;

        // Top figure
        const byFigure = {};
        subs.forEach(s => {
            if (!byFigure[s.targetId]) byFigure[s.targetId] = { name: s.targetName, id: s.targetId, grades: [], count: 0 };
            byFigure[s.targetId].grades.push((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
            byFigure[s.targetId].count++;
        });
        let topFigure = null;
        let topAvg = -1;
        Object.values(byFigure).forEach(f => {
            const a = f.grades.reduce((x, y) => x + y, 0) / f.grades.length;
            if (a > topAvg) { topAvg = a; topFigure = { id: f.id, name: f.name, grade: a.toFixed(1), subs: f.count }; }
        });

        // Price stats
        const secPrices = [];
        subs.forEach(s => {
            if (s.data.pricing_types && s.data.pricing_types.includes('secondary_market') && s.data.price_secondary_market) {
                secPrices.push(parseFloat(s.data.price_secondary_market));
            }
        });
        const avgSecondaryPrice = secPrices.length ? (secPrices.reduce((a, b) => a + b, 0) / secPrices.length).toFixed(2) : null;

        return {
            totalIntel: subs.length,
            uniqueAnalysts,
            avgGrade,
            totalTargets: MOCK_FIGURES.length,
            topFigure,
            totalMarketTx: secPrices.length,
            avgSecondaryPrice: avgSecondaryPrice ? parseFloat(avgSecondaryPrice) : null,
            mostActiveBrand: DemoMode._mostActiveBrand(subs),
            priceTrend: { current30Avg: avgSecondaryPrice ? parseFloat(avgSecondaryPrice) : 0, prior30Avg: 0, changePct: 0 }
        };
    },

    buildHeadlines() {
        const subs = DemoMode.getSubmissions().sort((a, b) => new Date(b.date) - new Date(a.date));
        const labels = ['', 'Poor', 'Below Average', 'Fair', 'Great', 'Elite'];
        return subs.slice(0, 10).map(s => {
            const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
            const fig = MOCK_FIGURES.find(f => f.id === s.targetId);
            const g = parseFloat(grade);
            const headline = g >= 80 ? `${s.author} gives ${s.targetName} elite status` :
                g >= 60 ? `${s.author} rates ${s.targetName} favorably` :
                    `${s.author} files mixed review on ${s.targetName}`;
            return {
                headline, author: s.author, target: s.targetName,
                brand: fig ? fig.brand : 'Unknown', classTie: fig ? fig.classTie : 'Unknown',
                grade: parseFloat(grade), date: s.date,
                tradeRating: parseInt(s.data.tradeRating || 0)
            };
        });
    },

    buildBrandIndex() {
        const subs = DemoMode.getSubmissions();
        const brands = {};
        subs.forEach(s => {
            const fig = MOCK_FIGURES.find(f => f.id === s.targetId);
            const brand = fig ? fig.brand : 'Unknown';
            if (!brands[brand]) brands[brand] = { grades: [], prices: [], count: 0 };
            brands[brand].grades.push((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
            brands[brand].count++;
            if (s.data.price_secondary_market) brands[brand].prices.push(parseFloat(s.data.price_secondary_market));
        });
        return Object.entries(brands).map(([brand, d]) => ({
            brand,
            avg_grade: (d.grades.reduce((a, b) => a + b, 0) / d.grades.length).toFixed(1),
            total_submissions: d.count,
            avg_secondary_price: d.prices.length ? (d.prices.reduce((a, b) => a + b, 0) / d.prices.length).toFixed(2) : null,
            figure_count: new Set(subs.filter(s => { const f = MOCK_FIGURES.find(ff => ff.id === s.targetId); return f && f.brand === brand; }).map(s => s.targetId)).size
        }));
    },

    buildMarketVolume() {
        const subs = DemoMode.getSubmissions();
        // Group by week
        const weeks = {};
        subs.forEach(s => {
            if (!s.data.pricing_types) return;
            const d = new Date(s.date);
            const weekKey = d.toISOString().split('T')[0];
            s.data.pricing_types.forEach(pt => {
                const price = parseFloat(s.data['price_' + pt]);
                if (price > 0) {
                    if (!weeks[weekKey]) weeks[weekKey] = { date: weekKey, count: 0, avgPrice: 0, total: 0 };
                    weeks[weekKey].count++;
                    weeks[weekKey].total += price;
                }
            });
        });
        return Object.values(weeks).map(w => ({ ...w, avgPrice: w.count ? (w.total / w.count).toFixed(2) : 0 }));
    },

    _topRated() {
        const subs = DemoMode.getSubmissions();
        const byFig = {};
        subs.forEach(s => {
            if (!byFig[s.targetId]) byFig[s.targetId] = { grades: [] };
            byFig[s.targetId].grades.push((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
        });
        return MOCK_FIGURES.map(f => {
            const d = byFig[f.id];
            const avgGrade = d ? (d.grades.reduce((a, b) => a + b, 0) / d.grades.length).toFixed(1) : null;
            return { ...f, avgGrade, submissions: d ? d.grades.length : 0 };
        }).filter(f => f.submissions > 0).sort((a, b) => parseFloat(b.avgGrade) - parseFloat(a.avgGrade));
    },

    _marketRanked() {
        const subs = DemoMode.getSubmissions();
        return MOCK_FIGURES.map(f => {
            const fSubs = subs.filter(s => s.targetId === f.id);
            let latestPrice = null;
            let change30d = null;
            fSubs.forEach(s => {
                if (s.data.price_secondary_market) latestPrice = parseFloat(s.data.price_secondary_market);
            });
            return { ...f, latest_price: latestPrice, change_30d: change30d, submissions: fSubs.length };
        });
    },

    _leaderboard(url) {
        const urlObj = new URL(url, window.location.origin);
        const mode = urlObj.searchParams.get('mode') || 'top_rated';
        const brand = urlObj.searchParams.get('brand');
        const subs = DemoMode.getSubmissions();
        let figures = MOCK_FIGURES.map(f => {
            const fSubs = subs.filter(s => s.targetId === f.id);
            const grades = fSubs.map(s => (parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2);
            const avgGrade = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null;
            const inHand = fSubs.filter(s => (s.data.ownership_status || s.ownership_status) === 'in_hand');
            const uniqueOwners = new Set(inHand.map(s => s.author)).size;
            return { ...f, avgGrade, submissions: fSubs.length, uniqueOwners, latestPrice: null, change30d: null };
        });
        if (brand) figures = figures.filter(f => f.brand === brand);
        if (mode === 'top_rated') figures = figures.filter(f => f.submissions > 0).sort((a, b) => parseFloat(b.avgGrade) - parseFloat(a.avgGrade));
        else if (mode === 'most_reviewed') figures = figures.sort((a, b) => b.submissions - a.submissions);
        else if (mode === 'rising') figures = figures.filter(f => f.submissions > 0).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return figures;
    },

    _mostActiveBrand(subs) {
        const counts = {};
        subs.forEach(s => {
            const fig = MOCK_FIGURES.find(f => f.id === s.targetId);
            const brand = fig ? fig.brand : 'Unknown';
            counts[brand] = (counts[brand] || 0) + 1;
        });
        let top = null, topCount = 0;
        Object.entries(counts).forEach(([b, c]) => { if (c > topCount) { top = b; topCount = c; } });
        return top;
    },

    // ─── Demo Submission Handler ─────────────────────────────────────

    async handleSubmission(app, form) {
        const isEdit = !!app.editingSubmission;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerText;

        // Run same validation as real submitIntel
        const ownershipCheck = form.querySelector('input[name="ownership_status"]:checked');
        if (!ownershipCheck) {
            app.showFormError('Please select your Ownership Status.');
            form.querySelector('input[name="ownership_status"]').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        const recommendation = form.querySelector('input[name="recommendation"]:checked');
        if (!recommendation) {
            app.showFormError('Please select a Community Recommendation (Yes or No).');
            form.querySelector('input[name="recommendation"]').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        const pricingTypes = [];
        const ptChecks = { overseas_msrp: 'pt_overseas', stateside_msrp: 'pt_stateside', secondary_market: 'pt_secondary' };
        for (const [type, cbId] of Object.entries(ptChecks)) {
            const cb = document.getElementById(cbId);
            const inp = document.getElementById('price_' + type + '_input');
            if (cb && cb.checked && inp && parseFloat(inp.value) > 0) pricingTypes.push(type);
        }
        if (pricingTypes.length === 0) {
            app.showFormError('Please select at least one pricing category and enter a valid amount.');
            return;
        }
        const rating = parseInt(document.getElementById('tradeRating').value);
        if (!rating || rating < 1) {
            alert('Please select a Trade Value Rating (1-5 Stars) before submitting.');
            return;
        }

        // Loading state
        submitBtn.disabled = true;
        submitBtn.innerText = isEdit ? 'Updating Report...' : 'Committing Report...';
        submitBtn.style.opacity = '0.7';

        // Collect form data + compute scores (identical to real submitIntel)
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.pricing_types = pricingTypes;
        delete data.market_price; delete data.cost_basis;
        delete data.pt_overseas; delete data.pt_stateside; delete data.pt_secondary;

        const mtsTotal = parseFloat(data.mts_community) + parseFloat(data.mts_buzz) + parseFloat(data.mts_liquidity) + parseFloat(data.mts_risk) + parseFloat(data.mts_appeal);
        const pqSum = parseFloat(data.pq_build) + parseFloat(data.pq_paint) + parseFloat(data.pq_articulation) + parseFloat(data.pq_accuracy) + parseFloat(data.pq_presence) + parseFloat(data.pq_value) + parseFloat(data.pq_packaging) + parseFloat(data.trans_frustration) + parseFloat(data.trans_satisfaction);
        const approvalScore = ((pqSum / 90) * 100).toFixed(1);
        const overallGrade = ((mtsTotal + parseFloat(approvalScore)) / 2).toFixed(1);
        data.overallGrade = overallGrade;

        // Handle image — convert to Base64 data URI
        let imagePath = null;
        const imageFile = document.getElementById('image_upload').files[0];
        if (imageFile) {
            const compressed = await app.compressImage(imageFile, 1200, 0.8);
            imagePath = await DemoMode.fileToDataURI(compressed);
        }

        // Check storage usage
        const usage = DemoMode._storageUsage();
        if (usage > 4 * 1024 * 1024 && imagePath) {
            app.showFormError('Demo storage limit reached. Image cannot be saved. Try removing earlier submissions.');
            imagePath = null;
        }

        const submission = {
            id: isEdit ? app.editingSubmission.id : Date.now(),
            targetId: app.currentTarget.id,
            targetName: app.currentTarget.name,
            targetTier: app.currentTarget.classTie,
            author: app.user.username,
            date: isEdit ? app.editingSubmission.date : new Date().toISOString(),
            editedAt: isEdit ? new Date().toISOString() : null,
            mtsTotal: mtsTotal.toString(),
            approvalScore,
            ownership_status: data.ownership_status,
            data: data,
            imagePath: imagePath || (isEdit && app.editingSubmission.data ? app.editingSubmission.data.imagePath : null)
        };

        const subs = DemoMode.getSubmissions();
        if (isEdit) {
            const idx = subs.findIndex(s => s.id === app.editingSubmission.id);
            if (idx >= 0) subs[idx] = submission;
        } else {
            subs.push(submission);
        }
        DemoMode.saveSubmissions(subs);

        app.editingSubmission = null;
        if (isEdit) {
            app.showFormSuccess('Intelligence report updated. Overall Grade: ' + overallGrade + '/100');
            app.currentView = 'dashboard';
        } else {
            app.showFormSuccess('Intelligence on ' + app.currentTarget.name + ' committed. Overall Grade: ' + overallGrade + '/100');
            app.currentView = 'pulse';
        }
        setTimeout(() => app.renderApp(), 1500);
    },

    fileToDataURI(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    },

    _storageUsage() {
        let total = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            total += (sessionStorage.getItem(k) || '').length * 2; // UTF-16
        }
        return total;
    }
};

// ─── Monkey-Patches ──────────────────────────────────────────────────

// Patch init() — intercept before token validation
(function() {
    const _originalInit = TerminalApp.prototype.init;
    TerminalApp.prototype.init = async function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('demo') === 'true') {
            DemoMode.enter(this);
            return;
        }
        if (DemoMode.isActive()) {
            DemoMode.restore(this);
            return;
        }
        return _originalInit.call(this);
    };
})();

// Patch window.fetch — intercept all /api/* calls in demo mode
(function() {
    const _originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        if (DemoMode.isActive() && typeof url === 'string' && url.startsWith(API_URL)) {
            return DemoMode.mockFetch(url, options);
        }
        return _originalFetch.call(this, url, options);
    };
})();

// Patch submitIntel — store locally instead of POSTing
(function() {
    const _originalSubmitIntel = TerminalApp.prototype.submitIntel;
    TerminalApp.prototype.submitIntel = async function(form) {
        if (DemoMode.isActive()) {
            return DemoMode.handleSubmission(this, form);
        }
        return _originalSubmitIntel.call(this, form);
    };
})();

// Add enterDemoMode to prototype
TerminalApp.prototype.enterDemoMode = function() {
    DemoMode.enter(this);
};
