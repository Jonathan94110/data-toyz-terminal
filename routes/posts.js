const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const log = require('../logger.js');
const { JWT_SECRET } = require('../helpers/config');
const { normalizeRow, normalizeRows } = require('../helpers/normalize');
const { auditLog } = require('../helpers/audit');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Fetch timeline broadcasts, replies, and reactions (with pagination)
// Optimized: excludes base64 imagePath from list payload, parallelizes queries, uses Map grouping
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        // Main query + total count in parallel
        // Exclude imagePath (can be MB of base64), add hasImage flag
        // Replace correlated subquery with LEFT JOIN aggregate
        // Cast COUNT to integer to avoid pg bigint-as-string issue
        const [postsRes, countRes] = await Promise.all([
            db.query(`
                SELECT p.id, p.author, p.content, p.sentiment, p.date, p.edited_at,
                       (p.imagepath IS NOT NULL) AS hasimage,
                       COALESCE(sc.cnt, 0)::int AS submissioncount
                FROM Posts p
                LEFT JOIN (SELECT author, COUNT(*)::int AS cnt FROM Submissions GROUP BY author) sc ON sc.author = p.author
                ORDER BY p.id DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]),
            db.query("SELECT COUNT(*)::int AS count FROM Posts")
        ]);

        const postIds = postsRes.rows.map(p => p.id);
        const total = countRes.rows[0].count;
        const posts = normalizeRows(postsRes.rows);

        if (postIds.length > 0) {
            // Parallelize comments, reactions, and admin flag queries
            const parallelQueries = [
                db.query(`SELECT * FROM Comments WHERE postid = ANY($1) ORDER BY id ASC`, [postIds]),
                db.query(`SELECT * FROM Reactions WHERE postid = ANY($1)`, [postIds])
            ];

            // Check admin status and queue flag query if needed
            let isAdmin = false;
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    const userResult = await db.query("SELECT role FROM Users WHERE id = $1", [decoded.id]);
                    if (userResult.rows[0] && ['owner', 'admin', 'moderator'].includes(userResult.rows[0].role)) {
                        isAdmin = true;
                        parallelQueries.push(
                            db.query("SELECT post_id, COUNT(*) as flag_count FROM Flags WHERE post_id = ANY($1) GROUP BY post_id", [postIds])
                        );
                    }
                } catch (e) { /* not admin or invalid token, ignore */ }
            }

            const results = await Promise.all(parallelQueries);
            const comments = normalizeRows(results[0].rows);
            const reactions = normalizeRows(results[1].rows);

            // Use Maps for O(1) grouping instead of O(n) filter per post
            const commentMap = new Map();
            const reactionMap = new Map();
            comments.forEach(c => {
                if (!commentMap.has(c.postId)) commentMap.set(c.postId, []);
                commentMap.get(c.postId).push(c);
            });
            reactions.forEach(r => {
                if (!reactionMap.has(r.postId)) reactionMap.set(r.postId, []);
                reactionMap.get(r.postId).push(r);
            });

            posts.forEach(p => {
                p.comments = commentMap.get(p.id) || [];
                p.reactions = reactionMap.get(p.id) || [];
            });

            // Attach flag counts for admin users
            if (isAdmin && results[2]) {
                const flagMap = {};
                results[2].rows.forEach(f => { flagMap[f.post_id] = parseInt(f.flag_count); });
                posts.forEach(p => { p.flagCount = flagMap[p.id] || 0; });
            }
        } else {
            posts.forEach(p => { p.comments = []; p.reactions = []; });
        }

        res.json({ posts, total, limit, offset });
    } catch (err) {
        log.error('Get posts error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Serve post image as raw binary (avoids sending MB of base64 in list JSON)
router.get('/:postId/image', async (req, res) => {
    try {
        const result = await db.query('SELECT imagepath FROM Posts WHERE id = $1', [req.params.postId]);
        if (!result.rows[0] || !result.rows[0].imagepath) {
            return res.status(404).json({ error: 'No image found.' });
        }
        const dataUri = result.rows[0].imagepath;
        const matches = dataUri.match(/^data:(.+?);base64,([\s\S]+)$/);
        if (!matches) return res.status(400).json({ error: 'Invalid image data.' });

        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        res.set({
            'Content-Type': contentType,
            'Content-Length': buffer.length,
            'Cache-Control': 'public, max-age=86400'  // cache images for 24h
        });
        res.send(buffer);
    } catch (err) {
        log.error('Get post image error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Submit a new threaded reply to a broadcast
router.post('/:postId/comments', requireAuth, async (req, res) => {
    const author = req.user.username;
    const { content } = req.body;
    const { postId } = req.params;

    if (!content) return res.status(400).json({ error: "Missing reply content." });
    if (content.length > 5000) return res.status(400).json({ error: "Content must be 5000 characters or fewer." });

    try {
        const result = await db.query("INSERT INTO Comments (postId, author, content, date) VALUES ($1, $2, $3, $4) RETURNING id",
            [postId, author, content, new Date().toISOString()]);

        const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
        if (post.rows[0]) {
            await createNotification(post.rows[0].author, 'comment', `${author} replied to your broadcast`, 'post', parseInt(postId), author);
        }

        const mentions = content.match(/@(\w+)/g);
        if (mentions) {
            const uniqueMentions = [...new Set(mentions.map(m => m.slice(1)))].filter(m => m !== author);
            if (uniqueMentions.length > 0) {
                const validUsers = await db.query("SELECT username FROM Users WHERE username = ANY($1::text[])", [uniqueMentions]);
                const validSet = new Set(validUsers.rows.map(r => r.username));
                for (const mentioned of uniqueMentions) {
                    if (validSet.has(mentioned)) {
                        await createNotification(mentioned, 'mention', `${author} mentioned you in a reply`, 'post', parseInt(postId), author);
                    }
                }
            }
        }

        res.status(201).json({ id: result.rows[0].id, message: "Reply transmitted." });
    } catch (err) {
        log.error('Post comment error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Toggle a reaction on a broadcast
router.post('/:postId/react', requireAuth, async (req, res) => {
    const author = req.user.username;
    const { emoji } = req.body;
    const { postId } = req.params;

    if (!emoji) return res.status(400).json({ error: "Missing emoji field" });

    try {
        const result = await db.query("SELECT * FROM Reactions WHERE postId = $1 AND author = $2", [postId, author]);
        const row = result.rows[0];

        if (row) {
            if (row.emoji === emoji) {
                await db.query("DELETE FROM Reactions WHERE id = $1", [row.id]);
                res.json({ action: 'removed' });
            } else {
                await db.query("UPDATE Reactions SET emoji = $1 WHERE id = $2", [emoji, row.id]);
                res.json({ action: 'updated' });
            }
        } else {
            await db.query("INSERT INTO Reactions (postId, author, emoji) VALUES ($1, $2, $3)", [postId, author, emoji]);

            const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
            if (post.rows[0]) {
                await createNotification(post.rows[0].author, 'reaction', `${author} reacted ${emoji} to your broadcast`, 'post', parseInt(postId), author);
            }

            res.status(201).json({ action: 'added' });
        }
    } catch (err) {
        log.error('Post react error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Broadcast intel to timeline
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
    const author = req.user.username;
    const { content, sentiment } = req.body;
    let imagePath = null;

    if (req.file) {
        imagePath = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    }

    if (!author || !content || !sentiment) {
        return res.status(400).json({ error: "Missing transmission fields." });
    }
    if (content.length > 5000) return res.status(400).json({ error: "Content must be 5000 characters or fewer." });

    try {
        const result = await db.query("INSERT INTO Posts (author, content, imagePath, sentiment, date) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [author, content, imagePath, sentiment, new Date().toISOString()]);

        const mentions = content.match(/@(\w+)/g);
        if (mentions) {
            const uniqueMentions = [...new Set(mentions.map(m => m.slice(1)))].filter(m => m !== author);
            if (uniqueMentions.length > 0) {
                const validUsers = await db.query("SELECT username FROM Users WHERE username = ANY($1::text[])", [uniqueMentions]);
                const validSet = new Set(validUsers.rows.map(r => r.username));
                for (const mentioned of uniqueMentions) {
                    if (validSet.has(mentioned)) {
                        await createNotification(mentioned, 'mention', `${author} mentioned you in a broadcast`, 'post', result.rows[0].id, author);
                    }
                }
            }
        }

        res.status(201).json({ id: result.rows[0].id, message: "Broadcast transmitted securely." });
    } catch (err) {
        log.error('Create post error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Edit a broadcast
router.put('/:postId', requireAuth, async (req, res) => {
    const { content, sentiment } = req.body;
    const { postId } = req.params;

    if (!content || !content.trim()) return res.status(400).json({ error: "Content cannot be empty." });
    if (content.length > 5000) return res.status(400).json({ error: "Content must be 5000 characters or fewer." });
    if (sentiment && !['fire', 'fence', 'ice'].includes(sentiment)) {
        return res.status(400).json({ error: "Invalid sentiment value." });
    }

    try {
        const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
        if (!post.rows[0]) return res.status(404).json({ error: "Broadcast not found." });
        if (post.rows[0].author !== req.user.username) {
            return res.status(403).json({ error: "You can only edit your own broadcasts." });
        }

        const now = new Date().toISOString();
        if (sentiment) {
            await db.query("UPDATE Posts SET content = $1, sentiment = $2, edited_at = $3 WHERE id = $4", [content.trim(), sentiment, now, postId]);
        } else {
            await db.query("UPDATE Posts SET content = $1, edited_at = $2 WHERE id = $3", [content.trim(), now, postId]);
        }

        await auditLog('POST_EDIT', req.user.username, `post_id:${postId}`, 'User edited their broadcast', req.ip);

        res.json({ message: "Broadcast updated.", editedAt: now });
    } catch (err) {
        log.error('Edit post error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Delete a broadcast
router.delete('/:postId', requireAuth, async (req, res) => {
    const { postId } = req.params;

    try {
        const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
        if (!post.rows[0]) return res.status(404).json({ error: "Broadcast not found." });

        const isAuthor = post.rows[0].author === req.user.username;
        const isAdmin = ['owner', 'admin', 'moderator'].includes(req.user.role);

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ error: "You can only delete your own broadcasts." });
        }

        await db.query("DELETE FROM Posts WHERE id = $1", [postId]);

        const action = isAdmin && !isAuthor ? 'ADMIN_POST_DELETE' : 'POST_DELETE';
        await auditLog(action, req.user.username, `post_id:${postId}`,
            `${isAdmin && !isAuthor ? 'Admin deleted' : 'User deleted'} broadcast by ${post.rows[0].author}`, req.ip);

        res.json({ message: "Broadcast purged." });
    } catch (err) {
        log.error('Delete post error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Flag a broadcast for admin review
router.post('/:postId/flag', requireAuth, async (req, res) => {
    const { postId } = req.params;
    const { reason } = req.body;
    const flaggedBy = req.user.username;

    if (reason && reason.length > 500) return res.status(400).json({ error: "Reason must be 500 characters or fewer." });

    try {
        const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
        if (!post.rows[0]) return res.status(404).json({ error: "Broadcast not found." });

        if (post.rows[0].author === flaggedBy) {
            return res.status(400).json({ error: "You cannot flag your own broadcast." });
        }

        await db.query(
            "INSERT INTO Flags (post_id, flagged_by, reason, created_at) VALUES ($1, $2, $3, $4)",
            [postId, flaggedBy, reason || null, new Date().toISOString()]
        );

        // Batch insert flag notifications for all admins
        const flagMsg = `${flaggedBy} flagged a broadcast by ${post.rows[0].author}`;
        await db.query(
            `INSERT INTO Notifications (recipient, type, message, link_type, link_id, sender, created_at)
             SELECT u.username, 'flag', $1, 'post', $2, $3, $4
             FROM Users u
             WHERE u.role = 'admin'`,
            [flagMsg, parseInt(postId), flaggedBy, new Date().toISOString()]
        );

        await auditLog('POST_FLAG', flaggedBy, `post_id:${postId}`,
            `User flagged broadcast by ${post.rows[0].author}${reason ? ': ' + reason.slice(0, 100) : ''}`, req.ip);

        res.status(201).json({ message: "Broadcast flagged for review. Thank you for helping keep the network secure." });
    } catch (err) {
        if (err.message && err.message.includes('unique')) {
            return res.status(409).json({ error: "You have already flagged this broadcast." });
        }
        log.error('Flag post error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get a single post by ID (also excludes imagePath, uses hasImage flag)
router.get('/:postId', async (req, res) => {
    try {
        const postRes = await db.query(`
            SELECT p.id, p.author, p.content, p.sentiment, p.date, p.edited_at,
                   (p.imagepath IS NOT NULL) AS hasimage,
                   COALESCE(sc.cnt, 0)::int AS submissioncount
            FROM Posts p
            LEFT JOIN (SELECT author, COUNT(*)::int AS cnt FROM Submissions GROUP BY author) sc ON sc.author = p.author
            WHERE p.id = $1
        `, [req.params.postId]);
        if (!postRes.rows[0]) return res.status(404).json({ error: "Broadcast not found." });

        const post = normalizeRow(postRes.rows[0]);
        const [commentsRes, reactionsRes] = await Promise.all([
            db.query('SELECT * FROM Comments WHERE postid = $1 ORDER BY id ASC', [req.params.postId]),
            db.query('SELECT * FROM Reactions WHERE postid = $1', [req.params.postId])
        ]);

        post.comments = normalizeRows(commentsRes.rows);
        post.reactions = normalizeRows(reactionsRes.rows);

        res.json(post);
    } catch (err) {
        log.error('Get single post error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
