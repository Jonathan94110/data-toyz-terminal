const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { requireAuth } = require('../middleware/auth');
const { getNotificationPrefs } = require('../helpers/notifications');

// Preferences must be defined before :username routes to avoid routing conflicts
router.get('/preferences', requireAuth, async (req, res) => {
    try {
        const prefs = await getNotificationPrefs(req.user.id);
        if (!prefs) return res.status(500).json({ error: 'Failed to load preferences.' });
        res.json(prefs);
    } catch (err) {
        log.error('Get notification prefs error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

router.put('/preferences', requireAuth, async (req, res) => {
    const fields = [
        'comment_inapp', 'comment_email',
        'reaction_inapp', 'reaction_email',
        'co_reviewer_inapp', 'co_reviewer_email',
        'new_figure_inapp', 'new_figure_email',
        'hq_updates_inapp', 'hq_updates_email',
        'message_inapp', 'message_email',
        'follow_inapp', 'follow_email',
        'mention_inapp', 'mention_email',
        'flag_inapp', 'flag_email'
    ];

    try {
        await db.query("INSERT INTO NotificationPrefs (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [req.user.id]);

        const setClauses = [];
        const params = [];
        let paramIdx = 1;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                setClauses.push(`${field} = $${paramIdx}`);
                params.push(req.body[field] === true || req.body[field] === 'true');
                paramIdx++;
            }
        }

        if (setClauses.length === 0) return res.status(400).json({ error: 'No preferences to update.' });

        params.push(req.user.id);
        await db.query(`UPDATE NotificationPrefs SET ${setClauses.join(', ')} WHERE user_id = $${paramIdx}`, params);

        const updated = await db.query("SELECT * FROM NotificationPrefs WHERE user_id = $1", [req.user.id]);
        res.json(updated.rows[0]);
    } catch (err) {
        log.error('Update notification prefs error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// read-all must be before /:id/read
router.put('/read-all', requireAuth, async (req, res) => {
    try {
        await db.query("UPDATE Notifications SET read = true WHERE recipient = $1", [req.user.username]);
        res.json({ message: "All notifications marked as read." });
    } catch (err) {
        log.error('Mark all notifications read error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

router.get('/:username', requireAuth, async (req, res) => {
    if (req.params.username !== req.user.username) return res.status(403).json({ error: 'Access denied.' });
    try {
        const result = await db.query(
            "SELECT * FROM Notifications WHERE recipient = $1 ORDER BY id DESC LIMIT 50",
            [req.params.username]
        );
        res.json(result.rows);
    } catch (err) {
        log.error('Get notifications error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

router.get('/:username/count', requireAuth, async (req, res) => {
    if (req.params.username !== req.user.username) return res.status(403).json({ error: 'Access denied.' });
    try {
        const result = await db.query(
            "SELECT COUNT(*) as count FROM Notifications WHERE recipient = $1 AND read = false",
            [req.params.username]
        );
        res.json({ unread: parseInt(result.rows[0].count) });
    } catch (err) {
        log.error('Notification count error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

router.put('/:id/read', requireAuth, async (req, res) => {
    try {
        await db.query("UPDATE Notifications SET read = true WHERE id = $1 AND recipient = $2", [req.params.id, req.user.username]);
        res.json({ message: "Notification marked as read." });
    } catch (err) {
        log.error('Mark notification read error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
