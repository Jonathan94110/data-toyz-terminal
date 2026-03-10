// routes/price-alerts.js — Price alert CRUD for authenticated users
const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { requireAuth } = require('../middleware/auth');
const { normalizeRows } = require('../helpers/normalize');

// GET /api/price-alerts/my — list current user's alerts (with figure names)
router.get('/my', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT pa.*, f.name as figure_name, f.brand, f.classTie as class_tie
             FROM PriceAlerts pa
             JOIN Figures f ON f.id = pa.figure_id
             WHERE pa.user_id = $1
             ORDER BY pa.created_at DESC`,
            [req.user.id]
        );
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Get price alerts error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// POST /api/price-alerts/:figureId — create or update an alert
router.post('/:figureId', requireAuth, async (req, res) => {
    try {
        const figureId = parseInt(req.params.figureId);
        const { alert_type, target_price } = req.body;

        if (!['below', 'above'].includes(alert_type)) {
            return res.status(400).json({ error: 'alert_type must be "below" or "above".' });
        }
        const price = parseFloat(target_price);
        if (!price || price <= 0) {
            return res.status(400).json({ error: 'target_price must be a positive number.' });
        }

        // Check figure exists
        const figCheck = await db.query("SELECT id FROM Figures WHERE id = $1", [figureId]);
        if (!figCheck.rows.length) return res.status(404).json({ error: 'Figure not found.' });

        // Upsert: unique on (user_id, figure_id, alert_type)
        const result = await db.query(
            `INSERT INTO PriceAlerts (user_id, figure_id, alert_type, target_price, enabled, triggered, created_at, updated_at)
             VALUES ($1, $2, $3, $4, true, false, $5, $5)
             ON CONFLICT (user_id, figure_id, alert_type)
             DO UPDATE SET target_price = $4, enabled = true, triggered = false, triggered_at = NULL, updated_at = $5
             RETURNING *`,
            [req.user.id, figureId, alert_type, price, new Date().toISOString()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        log.error('Create price alert error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// PUT /api/price-alerts/:alertId/toggle — enable/disable
router.put('/:alertId/toggle', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `UPDATE PriceAlerts SET enabled = NOT enabled, updated_at = $1
             WHERE id = $2 AND user_id = $3 RETURNING *`,
            [new Date().toISOString(), req.params.alertId, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Alert not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        log.error('Toggle price alert error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// PUT /api/price-alerts/:alertId/reset — re-arm a triggered alert
router.put('/:alertId/reset', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `UPDATE PriceAlerts SET triggered = false, triggered_at = NULL, enabled = true, updated_at = $1
             WHERE id = $2 AND user_id = $3 RETURNING *`,
            [new Date().toISOString(), req.params.alertId, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Alert not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        log.error('Reset price alert error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// DELETE /api/price-alerts/:alertId
router.delete('/:alertId', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            "DELETE FROM PriceAlerts WHERE id = $1 AND user_id = $2 RETURNING id",
            [req.params.alertId, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Alert not found.' });
        res.json({ message: 'Alert deleted.' });
    } catch (err) {
        log.error('Delete price alert error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
