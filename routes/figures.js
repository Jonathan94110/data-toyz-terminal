const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRows } = require('../helpers/normalize');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');

// Get all figures
router.get('/', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Figures ORDER BY name ASC");
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Get figures error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Create new figure
router.post('/', requireAuth, async (req, res) => {
    const { name, brand, classTie, line } = req.body;
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: "Missing required figure fields." });
    }

    try {
        const existing = await db.query("SELECT id, name FROM Figures WHERE LOWER(name) = LOWER($1)", [name]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: `"${existing.rows[0].name}" already exists in the catalog. Search for it and submit your intel there!` });
        }

        const result = await db.query("INSERT INTO Figures (name, brand, classTie, line) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, brand, classTie, line]);

        try {
            const allUsers = await db.query("SELECT u.username FROM Users u JOIN NotificationPrefs np ON u.id = np.user_id WHERE (np.new_figure_inapp = true OR np.new_figure_email = true) AND u.username != $1", [req.user.username]);
            for (const row of allUsers.rows) {
                await createNotification(row.username, 'new_figure', `${req.user.username} added "${name}" to the catalog`, 'figure', result.rows[0].id, req.user.username);
            }
        } catch (notifErr) { log.error('New figure notification error', { error: notifErr.message || notifErr }); }

        res.status(201).json({ id: result.rows[0].id, message: "Target added successfully." });
    } catch (err) {
        log.error('Create figure error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Top rated figures — MUST be before /:id
router.get('/top-rated', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT s.targetId, s.targetName, f.brand, f.classTie, f.line,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade,
                   COUNT(*) as submissions
            FROM Submissions s
            LEFT JOIN Figures f ON f.id = s.targetId
            GROUP BY s.targetId, s.targetName, f.brand, f.classTie, f.line
            ORDER BY avgGrade DESC
            LIMIT 10
        `);
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
        log.error('Top rated figures error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Ranked figures — MUST be before /:id
router.get('/ranked', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.id, f.name, f.brand, f.classTie, f.line,
                   COUNT(s.id) as submissions,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade
            FROM Figures f
            LEFT JOIN Submissions s ON f.id = s.targetId
            GROUP BY f.id, f.name, f.brand, f.classTie, f.line
            ORDER BY f.name ASC
        `);
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            submissions: parseInt(r.submissions) || 0,
            avgGrade: r.avggrade ? parseFloat(r.avggrade).toFixed(1) : null
        })));
    } catch (err) {
        log.error('Ranked figures error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Failed to fetch figure comments', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch comments' });
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
        res.status(201).json(result.rows[0]);
    } catch (err) {
        log.error('Failed to post figure comment', { error: err.message });
        res.status(500).json({ error: 'Failed to post comment' });
    }
});

// Market intelligence
router.get('/:id/market-intel', async (req, res) => {
    try {
        const figureId = req.params.id;

        const figRes = await db.query("SELECT msrp, market_signal FROM Figures WHERE id = $1", [figureId]);
        if (figRes.rows.length === 0) return res.status(404).json({ error: 'Figure not found' });
        const msrp = figRes.rows[0].msrp;
        const marketSignal = figRes.rows[0].market_signal;

        const timelineRes = await db.query(
            `SELECT id, price_high, price_avg, price_low, source, submitted_by, created_at
             FROM MarketTransactions WHERE figure_id = $1 ORDER BY created_at ASC`, [figureId]
        );
        const timeline = normalizeRows(timelineRes.rows);

        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const r30 = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2`, [figureId, d30]
        );

        const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const r90 = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2`, [figureId, d90]
        );

        const rAll = await db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1`, [figureId]
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
        log.error('Market intel error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Submit market transaction
router.post('/:id/market-transactions', requireAuth, async (req, res) => {
    try {
        const figureId = req.params.id;
        const { priceAvg, priceHigh, priceLow, source, date } = req.body;

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

        const result = await db.query(
            `INSERT INTO MarketTransactions (figure_id, price_high, price_avg, price_low, source, submitted_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [figureId, high, avg, low, txSource, req.user.username, txDate]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Market transaction recorded.' });
    } catch (err) {
        log.error('Market transaction error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('User cost basis error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Community metrics
router.get('/:id/community-metrics', async (req, res) => {
    try {
        const figureId = req.params.id;
        const result = await db.query(
            "SELECT jsondata, mtstotal, approvalscore FROM Submissions WHERE targetId = $1",
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

        for (const row of rows) {
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
            } catch (e) { /* skip bad json */ }
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
            tradeRating: tradeRatingCount > 0 ? parseFloat((tradeRatingSum / tradeRatingCount).toFixed(1)) : null,
            recommendation: { yes: yesVotes, no: noVotes }
        });
    } catch (err) {
        log.error('Community metrics error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
