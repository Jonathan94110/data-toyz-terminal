const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRow, normalizeRows } = require('../helpers/normalize');
const { generateToken } = require('../helpers/token');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');
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
        log.error('User search error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        res.status(500).json({ error: 'An internal error occurred.' });
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

        await db.query(updateQuery, params);

        if (oldUsername && oldUsername !== username) {
            await db.query("UPDATE Submissions SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE Posts SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE Comments SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE Reactions SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE Messages SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE MessageReactions SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE RoomMembers SET username = $1 WHERE username = $2", [username, oldUsername]);
            await db.query("UPDATE Notifications SET recipient = $1 WHERE recipient = $2", [username, oldUsername]);
            await db.query("UPDATE Notifications SET sender = $1 WHERE sender = $2", [username, oldUsername]);
            await db.query("UPDATE Flags SET flagged_by = $1 WHERE flagged_by = $2", [username, oldUsername]);
            await db.query("UPDATE FigureComments SET author = $1 WHERE author = $2", [username, oldUsername]);
            await db.query("UPDATE MarketTransactions SET submitted_by = $1 WHERE submitted_by = $2", [username, oldUsername]);
            await db.query("UPDATE TypingIndicators SET username = $1 WHERE username = $2", [username, oldUsername]);
        }

        const updatedUserResult = await db.query("SELECT id, username, email, avatar, role FROM Users WHERE id = $1", [req.params.id]);
        const updatedUser = updatedUserResult.rows[0];
        const token = generateToken({ id: updatedUser.id, username: updatedUser.username, role: updatedUser.role || 'analyst' });
        res.json({ ...updatedUser, token, message: "Profile successfully encrypted and updated." });
    } catch (e) {
        log.error('Update user error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// User profile
router.get('/:username/profile', async (req, res) => {
    try {
        const userRes = await db.query(
            "SELECT id, username, avatar, role, created_at FROM Users WHERE username = $1",
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
            joinDate: user.created_at,
            submissionCount: totalSubs,
            title,
            recentSubmissions: submissions
        });
    } catch (err) {
        log.error('User profile error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Follow toggle error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Follow stats error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Get followers error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Get following error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Is following check error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
