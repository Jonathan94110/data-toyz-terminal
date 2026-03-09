const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRows, normalizeRow } = require('../helpers/normalize');
const { createNotification } = require('../helpers/notifications');
const { auditLog } = require('../helpers/audit');
const { requireAuth, requireAdminOrPlatinum } = require('../middleware/auth');

const VALID_STATUSES = ['owned', 'wishlist', 'for_trade', 'sold'];

// Get current user's collection
router.get('/my', requireAuth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT uc.id, uc.user_id, uc.figure_id, uc.status, uc.validated, uc.validated_by, uc.created_at, uc.updated_at,
                   f.name AS figure_name, f.brand, f.classTie AS class_tie, f.line, f.msrp, f.category
            FROM UserCollection uc
            JOIN Figures f ON uc.figure_id = f.id
            WHERE uc.user_id = $1
            ORDER BY uc.updated_at DESC NULLS LAST, uc.created_at DESC
        `, [req.user.id]);
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Get my collection error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Add/update figure in collection (UPSERT)
router.post('/:figureId', requireAuth, async (req, res) => {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: owned, wishlist, for_trade, or sold.' });
    }

    const figureId = parseInt(req.params.figureId);
    if (isNaN(figureId)) return res.status(400).json({ error: 'Invalid figure ID.' });

    try {
        const fig = await db.query("SELECT id, name FROM Figures WHERE id = $1", [figureId]);
        if (!fig.rows[0]) return res.status(404).json({ error: 'Figure not found.' });

        // Only for_trade requires validation; all other statuses are self-service
        const validated = status !== 'for_trade';
        const now = new Date().toISOString();

        await db.query(`
            INSERT INTO UserCollection (user_id, figure_id, status, validated, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $5)
            ON CONFLICT (user_id, figure_id)
            DO UPDATE SET status = $3, validated = $4, validated_by = NULL, updated_at = $5
        `, [req.user.id, figureId, status, validated, now]);

        // If marking for trade, notify admins/platinum holders about pending validation
        if (status === 'for_trade') {
            db.query("SELECT username FROM Users WHERE (role IN ('owner', 'admin') OR platinum = true) AND suspended = false AND username != $1", [req.user.username])
                .then(result => {
                    result.rows.forEach(admin => {
                        createNotification(admin.username, 'trade_validation',
                            `${req.user.username} listed "${fig.rows[0].name}" for trade — awaiting validation`,
                            'figure', figureId, req.user.username
                        ).catch(() => {});
                    });
                }).catch(() => {});
        }

        const statusLabel = status.replace('_', ' ');
        res.json({
            message: `${fig.rows[0].name} marked as ${statusLabel}.${status === 'for_trade' ? ' Pending validation.' : ''}`,
            status,
            validated
        });
    } catch (err) {
        log.error('Update collection error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Remove figure from collection
router.delete('/:figureId', requireAuth, async (req, res) => {
    const figureId = parseInt(req.params.figureId);
    if (isNaN(figureId)) return res.status(400).json({ error: 'Invalid figure ID.' });

    try {
        await db.query("DELETE FROM UserCollection WHERE user_id = $1 AND figure_id = $2",
            [req.user.id, figureId]);
        res.json({ message: 'Removed from collection.' });
    } catch (err) {
        log.error('Remove from collection error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get public collection for a user (hides unvalidated for_trade listings)
router.get('/user/:username', async (req, res) => {
    try {
        const userRes = await db.query("SELECT id FROM Users WHERE username = $1", [req.params.username]);
        if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found.' });

        const result = await db.query(`
            SELECT uc.status, uc.validated, f.id AS figure_id, f.name AS figure_name, f.brand, f.classTie AS class_tie, f.category
            FROM UserCollection uc
            JOIN Figures f ON uc.figure_id = f.id
            WHERE uc.user_id = $1
              AND (uc.status != 'for_trade' OR uc.validated = true)
            ORDER BY uc.status, f.name
        `, [userRes.rows[0].id]);

        const counts = { owned: 0, wishlist: 0, for_trade: 0, sold: 0 };
        const collection = { owned: [], wishlist: [], for_trade: [], sold: [] };
        result.rows.forEach(r => {
            const row = normalizeRow(r);
            collection[r.status].push(row);
            counts[r.status]++;
        });
        res.json({ counts, collection });
    } catch (err) {
        log.error('Get user collection error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get who owns/trades a specific figure
router.get('/figure/:figureId', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT uc.status, u.username, u.avatar
            FROM UserCollection uc
            JOIN Users u ON uc.user_id = u.id
            WHERE uc.figure_id = $1
              AND (uc.status != 'for_trade' OR uc.validated = true)
              AND uc.status IN ('owned', 'for_trade')
            ORDER BY uc.status, u.username
        `, [parseInt(req.params.figureId)]);
        res.json(result.rows);
    } catch (err) {
        log.error('Get figure collectors error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// --- Trade Validation (Admin/Platinum) --- //

// Get all pending trade listings
router.get('/pending-trades', requireAuth, requireAdminOrPlatinum, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT uc.id, uc.user_id, uc.figure_id, uc.created_at,
                   u.username, u.avatar,
                   f.name AS figure_name, f.brand, f.classTie AS class_tie
            FROM UserCollection uc
            JOIN Users u ON uc.user_id = u.id
            JOIN Figures f ON uc.figure_id = f.id
            WHERE uc.status = 'for_trade' AND uc.validated = false
            ORDER BY uc.created_at ASC
        `);
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Get pending trades error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Approve a trade listing
router.put('/validate/:id', requireAuth, requireAdminOrPlatinum, async (req, res) => {
    try {
        const entry = await db.query(
            `SELECT uc.*, u.username, f.name AS figure_name
             FROM UserCollection uc
             JOIN Users u ON uc.user_id = u.id
             JOIN Figures f ON uc.figure_id = f.id
             WHERE uc.id = $1`,
            [req.params.id]
        );
        if (!entry.rows[0]) return res.status(404).json({ error: 'Listing not found.' });
        if (entry.rows[0].status !== 'for_trade') return res.status(400).json({ error: 'Not a trade listing.' });

        await db.query("UPDATE UserCollection SET validated = true, validated_by = $1, updated_at = $2 WHERE id = $3",
            [req.user.username, new Date().toISOString(), req.params.id]);

        // Notify the user
        createNotification(entry.rows[0].username, 'trade_validation',
            `Your "${entry.rows[0].figure_name}" trade listing has been approved by ${req.user.username}.`,
            'figure', entry.rows[0].figure_id, req.user.username
        ).catch(() => {});

        await auditLog('TRADE_APPROVE', req.user.username, entry.rows[0].username,
            `Approved trade listing for "${entry.rows[0].figure_name}" (ID: ${entry.rows[0].figure_id})`, req.ip);

        res.json({ message: 'Trade listing approved.' });
    } catch (err) {
        log.error('Approve trade error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Reject a trade listing
router.delete('/validate/:id', requireAuth, requireAdminOrPlatinum, async (req, res) => {
    try {
        const entry = await db.query(
            `SELECT uc.*, u.username, f.name AS figure_name
             FROM UserCollection uc
             JOIN Users u ON uc.user_id = u.id
             JOIN Figures f ON uc.figure_id = f.id
             WHERE uc.id = $1`,
            [req.params.id]
        );
        if (!entry.rows[0]) return res.status(404).json({ error: 'Listing not found.' });

        await db.query("DELETE FROM UserCollection WHERE id = $1", [req.params.id]);

        // Notify the user
        createNotification(entry.rows[0].username, 'trade_validation',
            `Your "${entry.rows[0].figure_name}" trade listing was not approved.`,
            'figure', entry.rows[0].figure_id, req.user.username
        ).catch(() => {});

        await auditLog('TRADE_REJECT', req.user.username, entry.rows[0].username,
            `Rejected trade listing for "${entry.rows[0].figure_name}" (ID: ${entry.rows[0].figure_id})`, req.ip);

        res.json({ message: 'Trade listing rejected.' });
    } catch (err) {
        log.error('Reject trade error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
