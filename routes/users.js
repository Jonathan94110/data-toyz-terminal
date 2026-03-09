const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRow, normalizeRows } = require('../helpers/normalize');
const { generateToken } = require('../helpers/token');
const { createNotification } = require('../helpers/notifications');
const { auditLog } = require('../helpers/audit');
const { requireAuth, invalidateBlacklistCache } = require('../middleware/auth');
const { invalidateAll } = require('../middleware/cache');
const { upload } = require('../middleware/upload');

// User search (for mentions and inviting to rooms) — MUST be before /:username routes
router.get('/search', requireAuth, async (req, res) => {
    const q = req.query.q;
    if (!q || q.trim().length === 0) return res.json([]);
    try {
        const result = await db.query(
            "SELECT id, username, avatar FROM Users WHERE LOWER(username) LIKE LOWER($1) AND suspended = false LIMIT 10",
            [`%${q.trim()}%`]
        );
        res.json(result.rows);
    } catch (err) {
        log.error('User search error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Data export — MUST be before /:id routes
router.get('/me/export', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username;

        const profile = await db.query("SELECT id, username, email, avatar, role, created_at FROM Users WHERE id = $1", [userId]);
        const submissions = await db.query("SELECT * FROM Submissions WHERE author = $1 ORDER BY id DESC", [username]);
        const posts = await db.query("SELECT * FROM Posts WHERE author = $1 ORDER BY id DESC", [username]);
        const comments = await db.query("SELECT * FROM Comments WHERE author = $1 ORDER BY id DESC", [username]);
        const notifications = await db.query("SELECT * FROM Notifications WHERE recipient = $1 ORDER BY id DESC", [username]);

        res.json({
            profile: profile.rows[0] || null,
            submissions: normalizeRows(submissions.rows),
            posts: normalizeRows(posts.rows),
            comments: normalizeRows(comments.rows),
            notifications: notifications.rows
        });
    } catch (e) {
        log.error('Data export error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Update operative profile credentials
router.put('/:id', requireAuth, upload.single('avatar'), async (req, res) => {
    if (parseInt(req.params.id) !== req.user.id) {
        return res.status(403).json({ error: 'You can only update your own profile.' });
    }
    const { username, email, oldUsername } = req.body;

    if (username && username.length > 50) return res.status(400).json({ error: "Username must be 50 characters or fewer." });
    if (email && email.length > 254) return res.status(400).json({ error: "Email must be 254 characters or fewer." });

    try {
        let updateQuery = "UPDATE Users SET username = $1, email = $2 ";
        let params = [username, email];
        let paramIndex = 3;

        if (req.file) {
            updateQuery += `, avatar = $${paramIndex} `;
            const base64Image = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
            params.push(base64Image);
            paramIndex++;
        }
        updateQuery += `WHERE id = $${paramIndex}`;
        params.push(req.params.id);

        if (oldUsername && oldUsername !== username) {
            // Username rename: wrap all cascading updates in a transaction with a dedicated client
            const client = await db.connect();
            try {
                await client.query("BEGIN");
                // Update the user record first
                await client.query(updateQuery, params);
                // Cascade username across all related tables
                await client.query("UPDATE Submissions SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE Posts SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE Comments SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE Reactions SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE Messages SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE MessageReactions SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE RoomMembers SET username = $1 WHERE username = $2", [username, oldUsername]);
                await client.query("UPDATE Notifications SET recipient = $1 WHERE recipient = $2", [username, oldUsername]);
                await client.query("UPDATE Notifications SET sender = $1 WHERE sender = $2", [username, oldUsername]);
                await client.query("UPDATE Flags SET flagged_by = $1 WHERE flagged_by = $2", [username, oldUsername]);
                await client.query("UPDATE FigureComments SET author = $1 WHERE author = $2", [username, oldUsername]);
                await client.query("UPDATE MarketTransactions SET submitted_by = $1 WHERE submitted_by = $2", [username, oldUsername]);
                await client.query("UPDATE TypingIndicators SET username = $1 WHERE username = $2", [username, oldUsername]);
                await client.query("COMMIT");
            } catch (txErr) {
                try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
                throw txErr;
            } finally {
                client.release();
            }
        } else {
            await db.query(updateQuery, params);
        }

        const updatedUserResult = await db.query("SELECT id, username, email, avatar, role, platinum FROM Users WHERE id = $1", [req.params.id]);
        const updatedUser = updatedUserResult.rows[0];
        if (!updatedUser) {
            return res.status(404).json({ error: 'User no longer exists.' });
        }
        const token = generateToken({ id: updatedUser.id, username: updatedUser.username, role: updatedUser.role || 'analyst' });
        res.json({ ...updatedUser, token, message: "Profile successfully encrypted and updated." });
    } catch (e) {
        log.error('Update user error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// User profile
router.get('/:username/profile', async (req, res) => {
    try {
        const userRes = await db.query(
            "SELECT id, username, avatar, role, platinum, created_at FROM Users WHERE username = $1",
            [req.params.username]
        );
        if (!userRes.rows[0]) return res.status(404).json({ error: "User not found." });
        const user = normalizeRow(userRes.rows[0]);

        const subsRes = await db.query(
            "SELECT * FROM Submissions WHERE author = $1 ORDER BY id DESC LIMIT 20",
            [req.params.username]
        );
        const submissions = normalizeRows(subsRes.rows);
        submissions.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });

        const countRes = await db.query(
            "SELECT COUNT(*) as count FROM Submissions WHERE author = $1",
            [req.params.username]
        );
        const totalSubs = parseInt(countRes.rows[0].count);

        let title = 'Rookie Analyst';
        if (totalSubs >= 15) title = 'Prime Intel Officer';
        else if (totalSubs >= 10) title = 'Senior Field Evaluator';
        else if (totalSubs >= 5) title = 'Field Evaluator';
        else if (totalSubs >= 2) title = 'Junior Analyst';

        res.json({
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            role: user.role || 'analyst',
            platinum: !!user.platinum,
            joinDate: user.created_at,
            submissionCount: totalSubs,
            title,
            recentSubmissions: submissions
        });
    } catch (err) {
        log.error('User profile error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Toggle follow/unfollow
router.post('/:id/follow', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id) return res.status(400).json({ error: "You cannot follow yourself." });

    try {
        const targetUser = await db.query("SELECT id, username FROM Users WHERE id = $1", [targetId]);
        if (!targetUser.rows[0]) return res.status(404).json({ error: "User not found." });

        const existing = await db.query(
            "SELECT id FROM Follows WHERE follower_id = $1 AND following_id = $2",
            [req.user.id, targetId]
        );

        if (existing.rows[0]) {
            await db.query("DELETE FROM Follows WHERE id = $1", [existing.rows[0].id]);
            res.json({ action: 'unfollowed' });
        } else {
            await db.query(
                "INSERT INTO Follows (follower_id, following_id, created_at) VALUES ($1, $2, $3)",
                [req.user.id, targetId, new Date().toISOString()]
            );

            await createNotification(targetUser.rows[0].username, 'follow',
                `${req.user.username} started following you`, null, null, req.user.username);

            res.status(201).json({ action: 'followed' });
        }
    } catch (err) {
        log.error('Follow toggle error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Follow stats
router.get('/:id/follow-stats', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const followers = await db.query("SELECT COUNT(*) as count FROM Follows WHERE following_id = $1", [userId]);
        const following = await db.query("SELECT COUNT(*) as count FROM Follows WHERE follower_id = $1", [userId]);
        res.json({
            followers: parseInt(followers.rows[0].count),
            following: parseInt(following.rows[0].count)
        });
    } catch (err) {
        log.error('Follow stats error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get followers list
router.get('/:id/followers', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const result = await db.query(
            `SELECT u.id, u.username, u.avatar
             FROM Follows f
             JOIN Users u ON f.follower_id = u.id
             WHERE f.following_id = $1
             ORDER BY f.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        log.error('Get followers error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get following list
router.get('/:id/following', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const result = await db.query(
            `SELECT u.id, u.username, u.avatar
             FROM Follows f
             JOIN Users u ON f.following_id = u.id
             WHERE f.follower_id = $1
             ORDER BY f.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        log.error('Get following error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Check if following
router.get('/:id/is-following', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id FROM Follows WHERE follower_id = $1 AND following_id = $2",
            [req.user.id, parseInt(req.params.id)]
        );
        res.json({ isFollowing: result.rows.length > 0 });
    } catch (err) {
        log.error('Is following check error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Self-service account deletion
router.delete('/me/account', requireAuth, async (req, res) => {
    let client;
    try {
        const userId = req.user.id;
        const { password } = req.body;

        if (!password) return res.status(400).json({ error: 'Password is required to confirm account deletion.' });

        // Fetch user details
        const userRes = await db.query("SELECT id, username, role, password FROM Users WHERE id = $1", [userId]);
        if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found.' });

        const user = userRes.rows[0];

        // Safety: owner cannot self-delete
        if (user.role === 'owner') return res.status(403).json({ error: 'The owner account cannot be deleted.' });

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Incorrect password.' });

        const username = user.username;

        // Cascading delete — same order as admin delete
        client = await db.connect();
        await client.query("BEGIN");
        try {
            await client.query("DELETE FROM MessageReactions WHERE author = $1", [username]);
            await client.query("DELETE FROM Messages WHERE author = $1", [username]);
            await client.query("DELETE FROM RoomMembers WHERE username = $1", [username]);
            await client.query("DELETE FROM Notifications WHERE recipient = $1 OR sender = $1", [username]);
            await client.query("DELETE FROM Reactions WHERE author = $1", [username]);
            await client.query("DELETE FROM Comments WHERE author = $1", [username]);
            await client.query("DELETE FROM Posts WHERE author = $1", [username]);
            await client.query("DELETE FROM Submissions WHERE author = $1", [username]);
            await client.query("DELETE FROM Flags WHERE flagged_by = $1", [username]);
            await client.query("DELETE FROM FigureComments WHERE author = $1", [username]);
            await client.query("DELETE FROM MarketTransactions WHERE submitted_by = $1", [username]);
            await client.query("DELETE FROM TypingIndicators WHERE username = $1", [username]);
            await client.query("DELETE FROM Follows WHERE follower_id = $1 OR following_id = $1", [userId]);
            await client.query("DELETE FROM NotificationPrefs WHERE user_id = $1", [userId]);
            // Nullify user_id in PageViews (preserve analytics data)
            await client.query("UPDATE PageViews SET user_id = NULL WHERE user_id = $1", [userId]);
            await client.query("DELETE FROM Users WHERE id = $1", [userId]);
            await client.query("COMMIT");
        } catch (txErr) {
            await client.query("ROLLBACK");
            throw txErr;
        }

        // Blacklist the current token
        try {
            const token = req.headers['authorization'].split(' ')[1];
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const decoded = jwt.decode(token);
            const expiresAt = decoded && decoded.exp
                ? new Date(decoded.exp * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await db.query(
                `INSERT INTO TokenBlacklist (token_hash, user_id, expires_at, created_at)
                 VALUES ($1, $2, $3, $4) ON CONFLICT (token_hash) DO NOTHING`,
                [tokenHash, userId, expiresAt, new Date().toISOString()]
            );
            invalidateBlacklistCache();
        } catch (_) { /* non-critical */ }

        invalidateAll();

        await auditLog('SELF_DELETE_ACCOUNT', username, username, 'User deleted their own account', req.ip);

        res.json({ message: 'Your account has been permanently deleted.' });
    } catch (err) {
        log.error('Self-delete account error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
