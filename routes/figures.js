const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRows } = require('../helpers/normalize');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');
const { blockBadBots, dataEndpointLimiter, trackDataRequest } = require('../middleware/botProtection');
const { cacheResponse, invalidateCache } = require('../middleware/cache');

// Shared helpers for market data endpoints
function getDateRanges() {
    const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    return { d30, d60 };
}

function latestPriceQuery() {
    return db.query(`
        SELECT DISTINCT ON (figure_id) figure_id, price_avg as latest_price
        FROM MarketTransactions
        WHERE price_type = 'secondary_market'
        ORDER BY figure_id, created_at DESC
    `);
}

function priceChangeQuery(d30, d60) {
    return db.query(`
        SELECT figure_id,
               AVG(CASE WHEN created_at >= $1 THEN price_avg END) as avg_30d,
               AVG(CASE WHEN created_at >= $2 AND created_at < $1 THEN price_avg END) as avg_prior_30d
        FROM MarketTransactions
        WHERE price_type = 'secondary_market'
        GROUP BY figure_id
    `, [d30, d60]);
}

function buildPriceMaps(priceRows, changeRows) {
    const priceMap = {};
    for (const row of priceRows) priceMap[row.figure_id] = parseFloat(row.latest_price);
    const changeMap = {};
    for (const row of changeRows) {
        const avg30 = row.avg_30d ? parseFloat(row.avg_30d) : null;
        const avgPrior = row.avg_prior_30d ? parseFloat(row.avg_prior_30d) : null;
        changeMap[row.figure_id] = (avg30 !== null && avgPrior !== null && avgPrior !== 0)
            ? parseFloat((((avg30 - avgPrior) / avgPrior) * 100).toFixed(1))
            : null;
    }
    return { priceMap, changeMap };
}

// Get all figures
router.get('/', blockBadBots, dataEndpointLimiter, trackDataRequest, cacheResponse(30000), async (req, res) => {
    try {
        const category = req.query.category;
        let query = "SELECT * FROM Figures";
        const params = [];
        if (category) { query += " WHERE category = $1"; params.push(category); }
        query += " ORDER BY name ASC";
        const result = await db.query(query, params);
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Get figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Create new figure
router.post('/', requireAuth, async (req, res) => {
    const { name, classTie, line } = req.body;
    const brand = (req.body.brand || '').trim();
    const category = req.body.category || 'transformer';
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: "Missing required figure fields." });
    }
    if (!['transformer', 'action_figure'].includes(category)) {
        return res.status(400).json({ error: "Invalid category." });
    }

    try {
        // Exact duplicate check
        const existing = await db.query("SELECT id, name FROM Figures WHERE LOWER(name) = LOWER($1)", [name]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: `"${existing.rows[0].name}" already exists in the catalog. Search for it and submit your intel there!` });
        }

        // Fuzzy duplicate check: strip spaces, dashes, dots, underscores, version suffixes
        const normalize = s => s.toLowerCase().replace(/[\s\-_.]/g, '').replace(/v?\d+(\.\d+)?$/g, '').replace(/(version|ver|v\d)$/gi, '');
        const normInput = normalize(name);
        if (normInput.length >= 4) {
            const allFigs = await db.query("SELECT id, name FROM Figures");
            const fuzzyMatch = allFigs.rows.find(f => {
                const normExisting = normalize(f.name);
                return normExisting.includes(normInput) || normInput.includes(normExisting);
            });
            if (fuzzyMatch) {
                return res.status(409).json({
                    error: `A similar figure "${fuzzyMatch.name}" already exists (ID: ${fuzzyMatch.id}). If this is the same figure, please submit your intel there instead. If it's truly different, contact an admin.`,
                    similarId: fuzzyMatch.id,
                    similarName: fuzzyMatch.name
                });
            }
        }

        // Brand approval check: non-admin users must use an approved brand
        const isAdmin = ['owner', 'admin'].includes(req.user.role);
        try {
            const brandCheck = await db.query("SELECT id FROM ApprovedBrands WHERE LOWER(name) = LOWER($1)", [brand]);
            if (brandCheck.rows.length === 0) {
                if (!isAdmin) {
                    // Save as pending brand request for admin approval
                    try {
                        await db.query(
                            "INSERT INTO PendingBrands (name, requested_by, figure_name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING",
                            [brand, req.user.username, name, new Date().toISOString()]
                        );
                        // Notify admins/owners about the pending brand (fire-and-forget)
                        db.query("SELECT username FROM Users WHERE role IN ('owner', 'admin') AND suspended = false")
                            .then(result => {
                                result.rows.forEach(admin => {
                                    createNotification(admin.username, 'pending_brand',
                                        `New brand request: "${brand}" submitted by ${req.user.username}`,
                                        'admin', null, req.user.username
                                    ).catch(() => {});
                                });
                            }).catch(() => {});
                    } catch (pendingErr) {
                        log.error('Pending brand save error (non-fatal)', { error: pendingErr.message || pendingErr });
                    }
                    return res.status(400).json({
                        error: `Brand "${brand}" has been submitted for admin approval. You'll be able to use it once an admin approves it.`,
                        unapprovedBrand: true,
                        pendingApproval: true
                    });
                }
                // Admin creating with new brand — auto-approve it
                await db.query(
                    "INSERT INTO ApprovedBrands (name, approved_by, created_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
                    [brand, req.user.username, new Date().toISOString()]
                );
            }
        } catch (brandErr) {
            // If ApprovedBrands table doesn't exist yet, skip check
            log.error('Brand check error (non-fatal)', { error: brandErr.message || brandErr });
        }

        const msrp = req.body.msrp != null && req.body.msrp !== '' ? parseFloat(req.body.msrp) : null;
        const result = await db.query("INSERT INTO Figures (name, brand, classTie, line, created_by, msrp, category) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            [name, brand, classTie, line, req.user.username, msrp, category]);

        // Fire-and-forget: notify all users about new figure (respects in-app + email preferences)
        const figMsg = `${req.user.username} added "${name}" to the catalog`;
        const figId = result.rows[0].id;
        db.query("SELECT username FROM Users WHERE username != $1 AND suspended = false", [req.user.username])
            .then(usersResult => {
                usersResult.rows.forEach(u => {
                    createNotification(u.username, 'new_figure', figMsg, 'figure', figId, req.user.username).catch(() => {});
                });
            }).catch(() => {});

        invalidateCache('/api/figures');
        invalidateCache('/api/stats');
        res.status(201).json({ id: result.rows[0].id, message: "Target added successfully." });
    } catch (err) {
        log.error('Create figure error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get approved brands for dropdown
router.get('/brands', async (req, res) => {
    try {
        const result = await db.query("SELECT DISTINCT name FROM ApprovedBrands ORDER BY name ASC");
        res.json(result.rows.map(r => r.name));
    } catch (err) {
        // Fallback: if ApprovedBrands table doesn't exist yet, use distinct from Figures
        try {
            const fallback = await db.query("SELECT DISTINCT brand FROM Figures ORDER BY brand ASC");
            res.json(fallback.rows.map(r => r.brand));
        } catch (e) {
            log.error('Get brands error', { refId: req.requestId, error: err.message || err });
            res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
        }
    }
});

// User edit figure name (creator, review author, or admin) — MUST be before /:id
router.put('/name/:id', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Figure name is required.' });
    }
    if (name.trim().length > 200) {
        return res.status(400).json({ error: 'Name must be 200 characters or fewer.' });
    }
    try {
        const figure = await db.query("SELECT id, name, created_by FROM Figures WHERE id = $1", [req.params.id]);
        if (figure.rows.length === 0) {
            return res.status(404).json({ error: 'Figure not found.' });
        }
        const fig = figure.rows[0];
        const isCreator = fig.created_by && fig.created_by === req.user.username;
        const isAdmin = ['owner', 'admin', 'moderator'].includes(req.user.role);
        // Allow any user who has submitted a review for this figure
        let isReviewAuthor = false;
        if (!isCreator && !isAdmin) {
            const subCheck = await db.query(
                "SELECT id FROM Submissions WHERE targetId = $1 AND author = $2 LIMIT 1",
                [req.params.id, req.user.username]
            );
            isReviewAuthor = subCheck.rows.length > 0;
        }
        if (!isCreator && !isAdmin && !isReviewAuthor) {
            return res.status(403).json({ error: 'Only the creator, a review author, or an admin can edit this figure name.' });
        }
        const existing = await db.query("SELECT id FROM Figures WHERE LOWER(name) = LOWER($1) AND id != $2", [name.trim(), req.params.id]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: `A figure named "${name.trim()}" already exists.` });
        }
        await db.query("UPDATE Figures SET name = $1 WHERE id = $2", [name.trim(), req.params.id]);
        // Cascade: keep Submissions.targetName in sync so intel logs reflect the fix
        await db.query("UPDATE Submissions SET targetName = $1 WHERE targetId = $2", [name.trim(), req.params.id]);
        invalidateCache('/api/figures');
        invalidateCache('/api/stats');
        res.json({ message: 'Figure name updated.', name: name.trim() });
    } catch (err) {
        log.error('Edit figure name error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Top rated figures — MUST be before /:id
router.get('/top-rated', async (req, res) => {
    try {
        const category = req.query.category;
        const catFilter = category ? "WHERE f.category = $1" : "";
        const catParams = category ? [category] : [];
        const result = await db.query(`
            SELECT s.targetId, s.targetName, f.brand, f.classTie, f.line,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade,
                   COUNT(*) as submissions
            FROM Submissions s
            LEFT JOIN Figures f ON f.id = s.targetId
            ${catFilter}
            GROUP BY s.targetId, s.targetName, f.brand, f.classTie, f.line
            HAVING COUNT(*) >= 1
            ORDER BY avgGrade DESC
            LIMIT 10
        `, catParams);
        res.json(result.rows.map(r => ({
            id: r.targetid,
            name: r.targetname,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            avgGrade: parseFloat(r.avggrade).toFixed(1),
            submissions: parseInt(r.submissions)
        })));
    } catch (err) {
        log.error('Top rated figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Ranked figures — MUST be before /:id
router.get('/ranked', async (req, res) => {
    try {
        const category = req.query.category;
        const catFilter = category ? "WHERE f.category = $1" : "";
        const catParams = category ? [category] : [];
        const result = await db.query(`
            SELECT f.id, f.name, f.brand, f.classTie, f.line, f.created_by, f.category,
                   COUNT(s.id) as submissions,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade
            FROM Figures f
            LEFT JOIN Submissions s ON f.id = s.targetId
            ${catFilter}
            GROUP BY f.id, f.name, f.brand, f.classTie, f.line, f.created_by, f.category
            ORDER BY f.name ASC
        `, catParams);
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            category: r.category || 'transformer',
            createdBy: r.created_by || null,
            submissions: parseInt(r.submissions) || 0,
            avgGrade: r.avggrade ? parseFloat(r.avggrade).toFixed(1) : null
        })));
    } catch (err) {
        log.error('Ranked figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Market-ranked figures — MUST be before /:id
router.get('/market-ranked', blockBadBots, dataEndpointLimiter, trackDataRequest, cacheResponse(30000), async (req, res) => {
    try {
        const sort = ['price', 'grade', 'approval', 'change', 'submissions'].includes(req.query.sort) ? req.query.sort : 'price';
        const order = req.query.order === 'asc' ? 'asc' : 'desc';
        const brand = req.query.brand || null;
        const mrCategory = req.query.category || null;

        const { d30, d60 } = getDateRanges();

        const mrParams = [];
        const mrWhere = mrCategory ? (mrParams.push(mrCategory), `WHERE f.category = $${mrParams.length}`) : "";

        const [r1, r2, r3] = await Promise.all([
            db.query(`
                SELECT f.id, f.name, f.brand, f.classTie, f.line,
                       COUNT(s.id) as submission_count,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade,
                       AVG(s.approvalScore) as avg_approval
                FROM Figures f LEFT JOIN Submissions s ON f.id = s.targetId
                ${mrWhere}
                GROUP BY f.id, f.name, f.brand, f.classTie, f.line
            `, mrParams),
            latestPriceQuery(),
            priceChangeQuery(d30, d60)
        ]);

        const { priceMap, changeMap } = buildPriceMaps(r2.rows, r3.rows);

        // Merge all by figure id
        let merged = r1.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            submissions: parseInt(r.submission_count) || 0,
            avgGrade: r.avg_grade ? parseFloat(parseFloat(r.avg_grade).toFixed(1)) : null,
            avgApproval: r.avg_approval ? parseFloat(parseFloat(r.avg_approval).toFixed(1)) : null,
            latestPrice: priceMap[r.id] !== undefined ? priceMap[r.id] : null,
            priceChange30d: changeMap[r.id] !== undefined ? changeMap[r.id] : null
        }));

        // Apply brand filter if provided
        if (brand) {
            merged = merged.filter(f => f.brand && f.brand.toLowerCase() === brand.toLowerCase());
        }

        // Sort by requested field
        const sortKey = { price: 'latestPrice', grade: 'avgGrade', approval: 'avgApproval', change: 'priceChange30d', submissions: 'submissions' }[sort];
        merged.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            return order === 'asc' ? aVal - bVal : bVal - aVal;
        });

        res.json(merged);
    } catch (err) {
        log.error('Market-ranked figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Public figure leaderboard with filtering, sorting, and admin overrides
router.get('/leaderboard', blockBadBots, dataEndpointLimiter, trackDataRequest, cacheResponse(30000), async (req, res) => {
    try {
        const mode = ['top_rated', 'rising', 'most_reviewed', 'sleepers'].includes(req.query.mode) ? req.query.mode : 'top_rated';
        const brand = req.query.brand || null;
        const figCategory = req.query.category || null;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));

        const { d30, d60 } = getDateRanges();

        const lbParams = [];
        let lbWhere = "WHERE COALESCE(f.lb_hidden, false) = false";
        if (figCategory) { lbParams.push(figCategory); lbWhere += ` AND f.category = $${lbParams.length}`; }

        const [r1, r2, r3] = await Promise.all([
            db.query(`
                SELECT f.id, f.name, f.brand, f.classTie, f.line, f.msrp,
                       f.lb_pinned, f.lb_rank_override, f.lb_category,
                       COUNT(s.id) as submission_count,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade,
                       COUNT(CASE WHEN COALESCE(s.ownership_status, 'in_hand') = 'in_hand' THEN 1 END) as in_hand_count,
                       COUNT(DISTINCT CASE WHEN COALESCE(s.ownership_status, 'in_hand') = 'in_hand' THEN s.author END) as unique_owner_count
                FROM Figures f LEFT JOIN Submissions s ON f.id = s.targetId
                ${lbWhere}
                GROUP BY f.id
            `, lbParams),
            latestPriceQuery(),
            priceChangeQuery(d30, d60)
        ]);

        const { priceMap, changeMap } = buildPriceMaps(r2.rows, r3.rows);

        // Merge all data
        let merged = r1.rows.map(r => {
            const latestPrice = priceMap[r.id] !== undefined ? priceMap[r.id] : null;
            const msrp = r.msrp ? parseFloat(r.msrp) : null;
            const msrpDiff = (latestPrice !== null && msrp !== null && msrp !== 0)
                ? parseFloat((((latestPrice - msrp) / msrp) * 100).toFixed(1))
                : null;
            const priceChange30d = changeMap[r.id] !== undefined ? changeMap[r.id] : null;
            return {
                id: r.id,
                name: r.name,
                brand: (r.brand || '').trim(),
                classTie: r.classtie,
                line: r.line,
                submissions: parseInt(r.submission_count) || 0,
                avgGrade: r.avg_grade ? parseFloat(parseFloat(r.avg_grade).toFixed(1)) : null,
                latestPrice,
                msrp,
                msrpDiff,
                priceChange30d,
                trendDirection: priceChange30d > 0 ? 'up' : priceChange30d < 0 ? 'down' : 'flat',
                pinned: r.lb_pinned || false,
                rankOverride: r.lb_rank_override,
                category: r.lb_category,
                inHandCount: parseInt(r.in_hand_count) || 0,
                uniqueOwnerCount: parseInt(r.unique_owner_count) || 0
            };
        });

        // Only include figures with at least 1 submission
        merged = merged.filter(f => f.submissions >= 1);

        // Collect ALL brands before filtering (so dropdown always has full list)
        const allBrands = [...new Set(merged.map(f => f.brand).filter(Boolean))].sort();

        // Apply brand filter
        if (brand) {
            merged = merged.filter(f => f.brand && f.brand.toLowerCase() === brand.toLowerCase());
        }

        // Mode-specific filtering and sorting
        switch (mode) {
            case 'rising':
                merged = merged.filter(f => (f.priceChange30d !== null && f.priceChange30d > 0) || f.category === 'rising');
                merged.sort((a, b) => (b.priceChange30d || 0) - (a.priceChange30d || 0));
                break;
            case 'most_reviewed':
                merged.sort((a, b) => b.submissions - a.submissions);
                break;
            case 'sleepers':
                merged = merged.filter(f => (f.submissions >= 1 && f.submissions <= 5 && f.avgGrade !== null && f.avgGrade >= 70) || f.category === 'sleeper');
                merged.sort((a, b) => (b.avgGrade || 0) - (a.avgGrade || 0));
                break;
            default: // top_rated
                merged.sort((a, b) => (b.avgGrade || 0) - (a.avgGrade || 0));
        }

        // Apply admin overrides: pinned items first, then manual rank overrides
        const pinned = merged.filter(f => f.pinned);
        const unpinned = merged.filter(f => !f.pinned);
        merged = [...pinned, ...unpinned];

        // Apply manual rank overrides
        const overrides = merged.filter(f => f.rankOverride !== null && f.rankOverride !== undefined);
        const noOverrides = merged.filter(f => f.rankOverride === null || f.rankOverride === undefined);
        overrides.forEach(f => {
            const pos = Math.max(0, Math.min(noOverrides.length, f.rankOverride - 1));
            noOverrides.splice(pos, 0, f);
        });
        merged = noOverrides;

        const total = merged.length;

        // Paginate
        const startIdx = (page - 1) * limit;
        const paged = merged.slice(startIdx, startIdx + limit);

        // Assign ranks
        const figures = paged.map((f, i) => ({
            rank: startIdx + i + 1,
            ...f
        }));

        res.json({ figures, total, page, pageSize: limit, brands: allBrands });
    } catch (err) {
        log.error('Figure leaderboard error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Compare two figures — MUST be before /:id
router.get('/compare', async (req, res) => {
    try {
        const idsParam = req.query.ids;
        if (!idsParam) {
            return res.status(400).json({ error: 'ids query parameter is required (comma-separated, exactly 2).' });
        }
        const ids = idsParam.split(',').map(s => s.trim());
        if (ids.length !== 2 || ids.some(id => !id || isNaN(parseInt(id)))) {
            return res.status(400).json({ error: 'Exactly 2 valid integer IDs are required.' });
        }
        const [id1, id2] = ids.map(id => parseInt(id));

        const fetchFigureData = async (figureId) => {
            // Run all queries in parallel for this figure
            const [figRes, metricsRes, jsonRes, timelineRes, avgPriceRes] = await Promise.all([
                // 1. Figure info
                db.query("SELECT * FROM Figures WHERE id = $1", [figureId]),
                // 2. Community metrics aggregated
                db.query(`
                    SELECT COUNT(*) as count,
                           AVG(mtsTotal) as mts_avg,
                           AVG(approvalScore) as approval_avg,
                           AVG((mtsTotal + approvalScore) / 2) as overall_avg
                    FROM Submissions WHERE targetId = $1
                `, [figureId]),
                // 3. jsonData for detailed scores
                db.query("SELECT jsonData FROM Submissions WHERE targetId = $1", [figureId]),
                // 4. Market intel timeline
                db.query(`
                    SELECT price_avg, created_at
                    FROM MarketTransactions
                    WHERE figure_id = $1 AND price_type = 'secondary_market'
                    ORDER BY created_at ASC
                `, [figureId]),
                // 5. Avg secondary price
                db.query(`
                    SELECT AVG(price_avg) as avg
                    FROM MarketTransactions
                    WHERE figure_id = $1 AND price_type = 'secondary_market'
                `, [figureId])
            ]);

            if (figRes.rows.length === 0) {
                return null;
            }

            const fig = figRes.rows[0];
            const m = metricsRes.rows[0];
            const count = parseInt(m.count) || 0;

            // Parse jsonData for detailed scores
            const detailedKeys = {
                mts: ['mts_community', 'mts_buzz', 'mts_liquidity', 'mts_risk', 'mts_appeal'],
                pq: ['pq_build', 'pq_paint', 'pq_articulation', 'pq_accuracy', 'pq_presence', 'pq_value', 'pq_packaging']
            };
            const sums = {};
            [...detailedKeys.mts, ...detailedKeys.pq].forEach(k => sums[k] = 0);
            let yesVotes = 0, noVotes = 0, recCount = 0;

            for (const row of jsonRes.rows) {
                try {
                    const data = JSON.parse(row.jsondata || '{}');
                    for (const key of [...detailedKeys.mts, ...detailedKeys.pq]) {
                        if (data[key] != null && !isNaN(parseFloat(data[key]))) {
                            sums[key] += parseFloat(data[key]);
                        }
                    }
                    if (data.recommendation === 'yes') { yesVotes++; recCount++; }
                    if (data.recommendation === 'no') { noVotes++; recCount++; }
                } catch (e) { log.warn('Skipped malformed jsonData in submission', { submissionId: row.id }); }
            }

            const n = jsonRes.rows.length || 1;
            const avg = (v) => parseFloat((v / n).toFixed(1));

            return {
                id: fig.id,
                name: fig.name,
                brand: fig.brand,
                classTie: fig.classtie,
                line: fig.line,
                metrics: {
                    count,
                    overallAvg: m.overall_avg ? parseFloat(parseFloat(m.overall_avg).toFixed(1)) : null,
                    mtsAvg: m.mts_avg ? parseFloat(parseFloat(m.mts_avg).toFixed(1)) : null,
                    approvalAvg: m.approval_avg ? parseFloat(parseFloat(m.approval_avg).toFixed(1)) : null,
                    dts: {
                        community: avg(sums.mts_community),
                        buzz: avg(sums.mts_buzz),
                        liquidity: avg(sums.mts_liquidity),
                        risk: avg(sums.mts_risk),
                        appeal: avg(sums.mts_appeal)
                    },
                    pq: {
                        build: avg(sums.pq_build),
                        paint: avg(sums.pq_paint),
                        articulation: avg(sums.pq_articulation),
                        accuracy: avg(sums.pq_accuracy),
                        presence: avg(sums.pq_presence),
                        value: avg(sums.pq_value),
                        packaging: avg(sums.pq_packaging)
                    },
                    recommendation: { yes: yesVotes, no: noVotes },
                    avgSecondaryPrice: avgPriceRes.rows[0].avg
                        ? parseFloat(parseFloat(avgPriceRes.rows[0].avg).toFixed(2))
                        : null
                },
                timeline: timelineRes.rows.map(r => ({
                    price: parseFloat(r.price_avg),
                    date: r.created_at
                }))
            };
        };

        const [fig1, fig2] = await Promise.all([fetchFigureData(id1), fetchFigureData(id2)]);

        if (!fig1 || !fig2) {
            const missing = [];
            if (!fig1) missing.push(id1);
            if (!fig2) missing.push(id2);
            return res.status(404).json({ error: `Figure(s) not found: ${missing.join(', ')}` });
        }

        res.json({ figures: [fig1, fig2] });
    } catch (err) {
        log.error('Compare figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Request assessment — send notification to selected users
router.post('/:id/request-assessment', requireAuth, async (req, res) => {
    try {
        const figureId = req.params.id;
        const { recipients } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'At least one recipient is required.' });
        }
        const normalizedRecipients = recipients
            .filter(r => typeof r === 'string')
            .map(r => r.trim())
            .filter(Boolean);
        const uniqueRecipients = Array.from(new Set(normalizedRecipients));

        if (uniqueRecipients.length === 0) {
            return res.status(400).json({ error: 'At least one valid recipient is required.' });
        }
        if (uniqueRecipients.length > 20) {
            return res.status(400).json({ error: 'Maximum 20 recipients per request.' });
        }

        const figResult = await db.query("SELECT id, name FROM Figures WHERE id = $1", [figureId]);
        if (figResult.rows.length === 0) {
            return res.status(404).json({ error: 'Figure not found.' });
        }
        const figureName = figResult.rows[0].name;

        const message = `${req.user.username} requested your assessment on ${figureName}`;
        let sent = 0;
        for (const recipient of uniqueRecipients) {
            const delivered = await createNotification(
                recipient,
                'assessment_request',
                message,
                'figure',
                parseInt(figureId),
                req.user.username
            );
            if (delivered) sent++;
        }

        res.json({ message: `Assessment request sent to ${sent} user${sent !== 1 ? 's' : ''}.`, sent });
    } catch (err) {
        log.error('Request assessment error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Figure comments
router.get('/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT * FROM FigureComments WHERE figure_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        log.error('Failed to fetch figure comments', { refId: req.requestId, error: err.message });
        res.status(500).json({ error: 'Failed to fetch comments', refId: req.requestId });
    }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Comment content required' });
        }
        if (content.length > 1000) {
            return res.status(400).json({ error: 'Comment too long (max 1000 characters)' });
        }
        const result = await db.query(
            `INSERT INTO FigureComments (figure_id, author, content, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, req.user.username, content.trim(), new Date().toISOString()]
        );
        invalidateCache('/api/figures/' + req.params.id);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        log.error('Failed to post figure comment', { refId: req.requestId, error: err.message });
        res.status(500).json({ error: 'Failed to post comment', refId: req.requestId });
    }
});

// Market intelligence
router.get('/:id/market-intel', blockBadBots, dataEndpointLimiter, trackDataRequest, cacheResponse(15000), async (req, res) => {
    try {
        const figureId = req.params.id;

        const figRes = await db.query("SELECT msrp, market_signal FROM Figures WHERE id = $1", [figureId]);
        if (figRes.rows.length === 0) return res.status(404).json({ error: 'Figure not found' });
        const msrp = figRes.rows[0].msrp;
        const marketSignal = figRes.rows[0].market_signal;

        // Optional price_type filter (overseas_msrp | stateside_msrp | secondary_market)
        const priceType = req.query.price_type;
        const VALID_PT = ['overseas_msrp', 'stateside_msrp', 'secondary_market'];
        const filterByType = priceType && VALID_PT.includes(priceType);
        const baseParams = filterByType ? [figureId, priceType] : [figureId];

        const timelineRes = await db.query(
            `SELECT id, price_high, price_avg, price_low, price_type, source, submitted_by, created_at
             FROM MarketTransactions WHERE figure_id = $1${filterByType ? ` AND price_type = $2` : ''} ORDER BY created_at ASC`, baseParams
        );
        const timeline = normalizeRows(timelineRes.rows);

        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const r30 = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2${filterByType ? ' AND price_type = $3' : ''}`,
            filterByType ? [figureId, d30, priceType] : [figureId, d30]
        );

        const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const r90 = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2${filterByType ? ' AND price_type = $3' : ''}`,
            filterByType ? [figureId, d90, priceType] : [figureId, d90]
        );

        const rAll = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1${filterByType ? ' AND price_type = $2' : ''}`, baseParams
        );

        const fmt = (row) => ({
            avg: row.avg ? parseFloat(parseFloat(row.avg).toFixed(2)) : null,
            high: row.high ? parseFloat(parseFloat(row.high).toFixed(2)) : null,
            low: row.low ? parseFloat(parseFloat(row.low).toFixed(2)) : null,
            count: parseInt(row.count) || 0
        });

        const lifetime = fmt(rAll.rows[0]);
        const totalCount = lifetime.count;
        const pctOverMsrp = (msrp && lifetime.avg) ? parseFloat((((lifetime.avg - msrp) / msrp) * 100).toFixed(1)) : null;
        const volatility = (lifetime.high != null && lifetime.low != null) ? parseFloat((lifetime.high - lifetime.low).toFixed(2)) : null;
        const confidence = totalCount >= 10 ? 'high' : totalCount >= 3 ? 'medium' : 'low';

        res.json({
            figureId: parseInt(figureId),
            msrp,
            transactions: {
                total: totalCount,
                rolling30: fmt(r30.rows[0]),
                rolling90: fmt(r90.rows[0]),
                lifetime,
                pctOverMsrp,
                volatility,
                confidence
            },
            timeline,
            marketSignal
        });
    } catch (err) {
        log.error('Market intel error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Submit market transaction
router.post('/:id/market-transactions', requireAuth, async (req, res) => {
    try {
        const figureId = req.params.id;
        const { priceAvg, priceHigh, priceLow, source, date, priceType } = req.body;

        if (!priceAvg || parseFloat(priceAvg) <= 0) {
            return res.status(400).json({ error: 'priceAvg is required and must be > 0' });
        }
        const avg = parseFloat(priceAvg);
        const high = priceHigh ? parseFloat(priceHigh) : null;
        const low = priceLow ? parseFloat(priceLow) : null;
        if (high !== null && high < avg) return res.status(400).json({ error: 'priceHigh must be >= priceAvg' });
        if (low !== null && low > avg) return res.status(400).json({ error: 'priceLow must be <= priceAvg' });

        const validSources = ['user_entry', 'ebay', 'manual_import'];
        const txSource = validSources.includes(source) ? source : 'user_entry';
        const txDate = date || new Date().toISOString();
        const VALID_PT = ['overseas_msrp', 'stateside_msrp', 'secondary_market'];
        const txPriceType = VALID_PT.includes(priceType) ? priceType : 'secondary_market';

        const result = await db.query(
            `INSERT INTO MarketTransactions (figure_id, price_high, price_avg, price_low, price_type, source, submitted_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [figureId, high, avg, low, txPriceType, txSource, req.user.username, txDate]
        );
        invalidateCache('/api/figures');
        invalidateCache('/api/stats');
        res.status(201).json({ id: result.rows[0].id, message: 'Market transaction recorded.' });
    } catch (err) {
        log.error('Market transaction error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// User cost basis
router.get('/:id/market-intel/user-cost', requireAuth, async (req, res) => {
    try {
        const figureId = req.params.id;
        const username = req.user.username;

        const cbRes = await db.query(
            `SELECT cost_basis FROM Submissions WHERE targetId = $1 AND author = $2 AND cost_basis IS NOT NULL ORDER BY date DESC LIMIT 1`,
            [figureId, username]
        );
        const costBasis = cbRes.rows.length ? parseFloat(cbRes.rows[0].cost_basis) : null;

        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const avgRes = await db.query(
            `SELECT AVG(price_avg) as avg FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2`, [figureId, d30]
        );
        const currentMarketAvg = avgRes.rows[0].avg ? parseFloat(parseFloat(avgRes.rows[0].avg).toFixed(2)) : null;

        let gainLoss = null, gainLossPct = null;
        if (costBasis && currentMarketAvg) {
            gainLoss = parseFloat((currentMarketAvg - costBasis).toFixed(2));
            gainLossPct = parseFloat(((gainLoss / costBasis) * 100).toFixed(1));
        }

        res.json({ costBasis, currentMarketAvg, gainLoss, gainLossPct });
    } catch (err) {
        log.error('User cost basis error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Community metrics
router.get('/:id/community-metrics', blockBadBots, dataEndpointLimiter, trackDataRequest, cacheResponse(15000), async (req, res) => {
    try {
        const figureId = req.params.id;
        const result = await db.query(
            "SELECT jsondata, mtstotal, approvalscore, ownership_status, author FROM Submissions WHERE targetId = $1",
            [figureId]
        );
        const rows = result.rows;
        if (rows.length === 0) return res.json({ count: 0 });

        const metricKeys = [
            'mts_community', 'mts_buzz', 'mts_liquidity', 'mts_risk', 'mts_appeal',
            'pq_build', 'pq_paint', 'pq_articulation', 'pq_accuracy', 'pq_presence', 'pq_value', 'pq_packaging',
            'trans_frustration', 'trans_satisfaction'
        ];
        const sums = {};
        metricKeys.forEach(k => sums[k] = 0);
        let marketPriceSum = 0, marketPriceCount = 0;
        let tradeRatingSum = 0, tradeRatingCount = 0;
        let yesVotes = 0, noVotes = 0;
        let mtsSum = 0, approvalSum = 0;
        let inHandCount = 0, digitalOnlyCount = 0;
        const inHandAuthors = new Set();

        for (const row of rows) {
            const status = row.ownership_status || 'in_hand';
            if (status === 'in_hand') {
                inHandCount++;
                inHandAuthors.add(row.author);
            } else {
                digitalOnlyCount++;
            }
            mtsSum += parseFloat(row.mtstotal || 0);
            approvalSum += parseFloat(row.approvalscore || 0);
            try {
                const data = JSON.parse(row.jsondata || '{}');
                for (const key of metricKeys) {
                    if (data[key] != null && !isNaN(parseFloat(data[key]))) {
                        sums[key] += parseFloat(data[key]);
                    }
                }
                if (data.market_price && parseFloat(data.market_price) > 0) {
                    marketPriceSum += parseFloat(data.market_price);
                    marketPriceCount++;
                }
                if (data.tradeRating && parseFloat(data.tradeRating) > 0) {
                    tradeRatingSum += parseFloat(data.tradeRating);
                    tradeRatingCount++;
                }
                if (data.recommendation === 'yes') yesVotes++;
                if (data.recommendation === 'no') noVotes++;
            } catch (e) { log.warn('Skipped malformed jsonData in submission', { submissionId: row.id }); }
        }

        const n = rows.length;
        const avg = (v) => parseFloat((v / n).toFixed(1));

        res.json({
            count: n,
            dts: {
                community_demand: avg(sums.mts_community),
                buzz: avg(sums.mts_buzz),
                liquidity: avg(sums.mts_liquidity),
                risk: avg(sums.mts_risk),
                appeal: avg(sums.mts_appeal),
                total: avg(mtsSum)
            },
            pq: {
                build: avg(sums.pq_build),
                paint: avg(sums.pq_paint),
                articulation: avg(sums.pq_articulation),
                accuracy: avg(sums.pq_accuracy),
                presence: avg(sums.pq_presence),
                value: avg(sums.pq_value),
                packaging: avg(sums.pq_packaging)
            },
            transformation: {
                frustration: avg(sums.trans_frustration),
                satisfaction: avg(sums.trans_satisfaction)
            },
            approvalAvg: avg(approvalSum),
            overallAvg: parseFloat(((mtsSum / n + approvalSum / n) / 2).toFixed(1)),
            marketPriceAvg: marketPriceCount > 0 ? parseFloat((marketPriceSum / marketPriceCount).toFixed(2)) : null,
            marketPriceByType: await (async () => {
                try {
                    const ptRes = await db.query(
                        `SELECT price_type, AVG(price_avg) as avg, COUNT(*) as count
                         FROM MarketTransactions WHERE figure_id = $1 GROUP BY price_type`, [figureId]
                    );
                    const out = {};
                    for (const row of ptRes.rows) {
                        out[row.price_type || 'secondary_market'] = {
                            avg: parseFloat(parseFloat(row.avg).toFixed(2)),
                            count: parseInt(row.count)
                        };
                    }
                    return Object.keys(out).length > 0 ? out : null;
                } catch (e) { return null; }
            })(),
            tradeRating: tradeRatingCount > 0 ? parseFloat((tradeRatingSum / tradeRatingCount).toFixed(1)) : null,
            recommendation: { yes: yesVotes, no: noVotes },
            popCount: {
                totalSubmissions: n,
                inHandCount,
                digitalOnlyCount,
                uniqueOwnerCount: inHandAuthors.size
            }
        });
    } catch (err) {
        log.error('Community metrics error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
