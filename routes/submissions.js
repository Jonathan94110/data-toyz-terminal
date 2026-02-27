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
const { upload } = require('../middleware/upload');

// Get submissions for a specific figure (public, with optional auth for cost_basis privacy)
router.get('/target/:targetId', async (req, res) => {
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
        log.error('Get submissions by target error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get submissions by user
router.get('/user/:username', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Submissions WHERE author = $1 ORDER BY id DESC", [req.params.username]);
        const rows = normalizeRows(result.rows);
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });
        res.json(rows);
    } catch (err) {
        log.error('Get submissions by user error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get all submissions globally (for leaderboards)
router.get('/', async (req, res) => {
    try {
        const result = await db.query("SELECT author FROM Submissions");
        res.json(result.rows);
    } catch (err) {
        log.error('Get all submissions error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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

    try {
        const result = await db.query(`INSERT INTO Submissions
            (targetId, targetName, targetTier, author, mtsTotal, approvalScore, jsonData, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
                req.body.targetId, req.body.targetName, req.body.targetTier, req.user.username,
                parseFloat(req.body.mtsTotal), parseFloat(req.body.approvalScore), JSON.stringify(submissionData), req.body.date
            ]
        );
        const submissionId = result.rows[0].id;

        if (submissionData.market_price && parseFloat(submissionData.market_price) > 0) {
            try {
                await db.query(
                    `INSERT INTO MarketTransactions (figure_id, price_avg, source, submitted_by, submission_id, created_at)
                     VALUES ($1, $2, 'user_entry', $3, $4, $5)`,
                    [req.body.targetId, parseFloat(submissionData.market_price), req.user.username, submissionId, req.body.date]
                );
            } catch (e) { log.error('Auto-insert market transaction failed', { error: e.message }); }
        }

        if (submissionData.cost_basis && parseFloat(submissionData.cost_basis) > 0) {
            try {
                await db.query("UPDATE Submissions SET cost_basis = $1 WHERE id = $2",
                    [parseFloat(submissionData.cost_basis), submissionId]);
            } catch (e) { log.error('Save cost_basis failed', { error: e.message }); }
        }

        const coReviewers = await db.query(
            "SELECT DISTINCT author FROM Submissions WHERE targetId = $1 AND author != $2",
            [req.body.targetId, req.user.username]
        );
        for (const row of coReviewers.rows) {
            await createNotification(row.author, 'co_reviewer', `${req.user.username} also reviewed ${req.body.targetName}`, 'figure', parseInt(req.body.targetId), req.user.username);
        }

        res.status(201).json({ id: submissionId, message: "Intelligence report successfully committed." });
    } catch (err) {
        log.error('Submit intelligence error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Retract intelligence
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const sub = await db.query("SELECT author FROM Submissions WHERE id = $1", [req.params.id]);
        if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found.' });
        if (sub.rows[0].author !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only retract your own intelligence.' });
        }
        await db.query("DELETE FROM Submissions WHERE id = $1", [req.params.id]);
        res.json({ message: "Intelligence retracted" });
    } catch (err) {
        log.error('Delete submission error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        const costBasis = submissionData.cost_basis && parseFloat(submissionData.cost_basis) > 0
            ? parseFloat(submissionData.cost_basis) : null;

        await db.query(
            `UPDATE Submissions SET mtsTotal = $1, approvalScore = $2, jsonData = $3, edited_at = $4, cost_basis = $5 WHERE id = $6`,
            [mtsTotal, approvalScore, JSON.stringify(submissionData), now, costBasis, req.params.id]
        );

        const newPrice = submissionData.market_price ? parseFloat(submissionData.market_price) : 0;
        const existingTx = await db.query("SELECT id FROM MarketTransactions WHERE submission_id = $1", [req.params.id]);

        if (existingTx.rows[0]) {
            if (newPrice > 0) {
                await db.query("UPDATE MarketTransactions SET price_avg = $1 WHERE id = $2", [newPrice, existingTx.rows[0].id]);
            } else {
                await db.query("DELETE FROM MarketTransactions WHERE id = $1", [existingTx.rows[0].id]);
            }
        } else if (newPrice > 0) {
            await db.query(
                `INSERT INTO MarketTransactions (figure_id, price_avg, source, submitted_by, submission_id, created_at)
                 VALUES ($1, $2, 'user_entry', $3, $4, $5)`,
                [sub.rows[0].targetid, newPrice, req.user.username, req.params.id, now]
            );
        }

        await auditLog('SUBMISSION_EDIT', req.user.username, `submission_id:${req.params.id}`, 'User edited their intelligence report', req.ip);

        res.json({ message: "Intelligence report updated.", editedAt: now });
    } catch (err) {
        log.error('Edit submission error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
