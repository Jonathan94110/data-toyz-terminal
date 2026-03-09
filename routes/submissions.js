const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const log = require('../logger.js');
const { JWT_SECRET } = require('../helpers/config');
const { normalizeRows } = require('../helpers/normalize');
const { auditLog } = require('../helpers/audit');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');
const { getRegionFromIp } = require('../helpers/geolocation');
const { upload } = require('../middleware/upload');
const { blockBadBots, dataEndpointLimiter, trackDataRequest } = require('../middleware/botProtection');
const { invalidateCache } = require('../middleware/cache');

// Get submissions for a specific figure (public, with optional auth for cost_basis privacy)
router.get('/target/:targetId', blockBadBots, dataEndpointLimiter, trackDataRequest, async (req, res) => {
    let currentUser = null;
    try {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            currentUser = decoded.username;
        }
    } catch (e) { /* unauthenticated is fine */ }

    try {
        const result = await db.query("SELECT * FROM Submissions WHERE targetId = $1", [req.params.targetId]);
        const rows = normalizeRows(result.rows);
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
            if (r.author !== currentUser) r.costBasis = null;
        });
        res.json(rows);
    } catch (err) {
        log.error('Get submissions by target error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get submissions by user (with search, pagination, and linked post lookup)
router.get('/user/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const q = req.query.q || '';
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
        const offset = (page - 1) * limit;

        // Build dynamic WHERE clause
        const conditions = ['s.author = $1'];
        const params = [username];
        let paramIdx = 2;

        if (q.trim()) {
            conditions.push(`LOWER(s.targetName) LIKE '%' || LOWER($${paramIdx}) || '%'`);
            params.push(q.trim());
            paramIdx++;
        }

        // Category filter (joins through Figures)
        const category = req.query.category;
        let catJoin = '';
        if (category) {
            catJoin = ' JOIN Figures f ON f.id = s.targetId';
            conditions.push(`f.category = $${paramIdx}`);
            params.push(category);
            paramIdx++;
        }

        const where = conditions.join(' AND ');

        // Total count for pagination
        const countRes = await db.query(`SELECT COUNT(*) as total FROM Submissions s${catJoin} WHERE ${where}`, params);
        const total = parseInt(countRes.rows[0].total);

        // Paginated results
        const result = await db.query(
            `SELECT s.* FROM Submissions s${catJoin} WHERE ${where} ORDER BY s.id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset]
        );
        const rows = normalizeRows(result.rows);

        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });

        res.json({ rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        log.error('Get submissions by user error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get a single submission by ID (deep-link)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Submissions WHERE id = $1", [req.params.id]);
        if (!result.rows[0]) return res.status(404).json({ error: 'Submission not found.' });
        const row = normalizeRows([result.rows[0]])[0];
        try { row.data = JSON.parse(row.jsonData); } catch (e) { row.data = {}; }
        res.json(row);
    } catch (err) {
        log.error('Get submission by id error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get all submissions globally (for leaderboards)
router.get('/', async (req, res) => {
    try {
        const result = await db.query("SELECT author FROM Submissions");
        res.json(result.rows);
    } catch (err) {
        log.error('Get all submissions error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Submit intelligence
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
    let submissionData = {};
    if (typeof req.body.data === 'string') {
        try { submissionData = JSON.parse(req.body.data); } catch (e) { }
    } else if (req.body.data) {
        submissionData = req.body.data;
    }

    if (req.file) {
        submissionData.imagePath = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    }

    // Extract and validate ownership status for Pop Count
    const ownershipStatus = ['in_hand', 'digital_only'].includes(submissionData.ownership_status)
        ? submissionData.ownership_status : 'in_hand';

    try {
        const result = await db.query(`INSERT INTO Submissions
            (targetId, targetName, targetTier, author, mtsTotal, approvalScore, jsonData, date, ownership_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
                req.body.targetId, req.body.targetName, req.body.targetTier, req.user.username,
                parseFloat(req.body.mtsTotal), parseFloat(req.body.approvalScore), JSON.stringify(submissionData), req.body.date,
                ownershipStatus
            ]
        );
        const submissionId = result.rows[0].id;

        // Multi-type pricing: insert a MarketTransaction row for each selected pricing category
        const VALID_PRICE_TYPES = ['overseas_msrp', 'stateside_msrp', 'secondary_market'];
        let pricingTypes = submissionData.pricing_types || [];

        // Backward compat: old-format submission with single market_price
        if ((!pricingTypes || pricingTypes.length === 0) && submissionData.market_price && parseFloat(submissionData.market_price) > 0) {
            pricingTypes = ['secondary_market'];
            submissionData.price_secondary_market = submissionData.market_price;
        }

        const region = await getRegionFromIp(req.ip);
        for (const pType of pricingTypes) {
            if (!VALID_PRICE_TYPES.includes(pType)) continue;
            const priceVal = parseFloat(submissionData[`price_${pType}`]);
            if (!priceVal || priceVal <= 0) continue;
            try {
                await db.query(
                    `INSERT INTO MarketTransactions (figure_id, price_avg, price_type, source, submitted_by, submission_id, created_at, region)
                     VALUES ($1, $2, $3, 'user_entry', $4, $5, $6, $7)`,
                    [req.body.targetId, priceVal, pType, req.user.username, submissionId, req.body.date, region]
                );
            } catch (e) { log.error('Auto-insert market transaction failed', { error: e.message }); }
        }

        const coReviewers = await db.query(
            "SELECT DISTINCT author FROM Submissions WHERE targetId = $1 AND author != $2",
            [req.body.targetId, req.user.username]
        );
        for (const row of coReviewers.rows) {
            await createNotification(row.author, 'co_reviewer', `${req.user.username} also reviewed ${req.body.targetName}`, 'figure', parseInt(req.body.targetId), req.user.username);
        }

        invalidateCache('/api/stats');
        invalidateCache('/api/figures');
        invalidateCache('/api/submissions');
        res.status(201).json({ id: submissionId, message: "Intelligence report successfully committed." });
    } catch (err) {
        log.error('Submit intelligence error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Retract intelligence
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const sub = await db.query("SELECT author FROM Submissions WHERE id = $1", [req.params.id]);
        if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found.' });
        if (sub.rows[0].author !== req.user.username && !['owner', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'You can only retract your own intelligence.' });
        }
        await db.query("DELETE FROM Submissions WHERE id = $1", [req.params.id]);
        invalidateCache('/api/stats');
        invalidateCache('/api/figures');
        invalidateCache('/api/submissions');
        res.json({ message: "Intelligence retracted" });
    } catch (err) {
        log.error('Delete submission error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Edit intelligence report
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
    let submissionData = {};
    if (typeof req.body.data === 'string') {
        try { submissionData = JSON.parse(req.body.data); } catch (e) { }
    } else if (req.body.data) {
        submissionData = req.body.data;
    }

    try {
        const sub = await db.query("SELECT * FROM Submissions WHERE id = $1", [req.params.id]);
        if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found.' });
        if (sub.rows[0].author !== req.user.username) {
            return res.status(403).json({ error: 'You can only edit your own intelligence reports.' });
        }

        if (req.file) {
            submissionData.imagePath = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
        } else {
            try {
                const existingData = JSON.parse(sub.rows[0].jsondata || '{}');
                if (existingData.imagePath && !submissionData.imagePath) {
                    submissionData.imagePath = existingData.imagePath;
                }
            } catch (e) { }
        }

        const now = new Date().toISOString();
        const mtsTotal = parseFloat(req.body.mtsTotal);
        const approvalScore = parseFloat(req.body.approvalScore);
        const editOwnership = ['in_hand', 'digital_only'].includes(submissionData.ownership_status)
            ? submissionData.ownership_status : null;

        await db.query(
            `UPDATE Submissions SET mtsTotal = $1, approvalScore = $2, jsonData = $3, edited_at = $4, ownership_status = COALESCE($6, ownership_status) WHERE id = $5`,
            [mtsTotal, approvalScore, JSON.stringify(submissionData), now, req.params.id, editOwnership]
        );

        // Multi-type pricing: sync MarketTransactions per price_type
        const VALID_PRICE_TYPES = ['overseas_msrp', 'stateside_msrp', 'secondary_market'];
        let pricingTypes = submissionData.pricing_types || [];

        // Backward compat: old submission with single market_price
        if ((!pricingTypes || pricingTypes.length === 0) && submissionData.market_price && parseFloat(submissionData.market_price) > 0) {
            pricingTypes = ['secondary_market'];
            submissionData.price_secondary_market = submissionData.market_price;
        }

        const existingTxs = await db.query("SELECT id, price_type FROM MarketTransactions WHERE submission_id = $1", [req.params.id]);
        const existingByType = {};
        for (const tx of existingTxs.rows) {
            existingByType[tx.price_type || 'secondary_market'] = tx.id;
        }

        const region = await getRegionFromIp(req.ip);
        for (const pType of VALID_PRICE_TYPES) {
            const priceVal = pricingTypes.includes(pType) ? parseFloat(submissionData[`price_${pType}`]) : 0;
            const existingId = existingByType[pType];

            if (existingId) {
                if (priceVal > 0) {
                    await db.query("UPDATE MarketTransactions SET price_avg = $1 WHERE id = $2", [priceVal, existingId]);
                } else {
                    await db.query("DELETE FROM MarketTransactions WHERE id = $1", [existingId]);
                }
            } else if (priceVal > 0) {
                await db.query(
                    `INSERT INTO MarketTransactions (figure_id, price_avg, price_type, source, submitted_by, submission_id, created_at, region)
                     VALUES ($1, $2, $3, 'user_entry', $4, $5, $6, $7)`,
                    [sub.rows[0].targetid, priceVal, pType, req.user.username, req.params.id, now, region]
                );
            }
        }

        await auditLog('SUBMISSION_EDIT', req.user.username, `submission_id:${req.params.id}`, 'User edited their intelligence report', req.ip);

        invalidateCache('/api/stats');
        invalidateCache('/api/figures');
        invalidateCache('/api/submissions');
        res.json({ message: "Intelligence report updated.", editedAt: now });
    } catch (err) {
        log.error('Edit submission error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
