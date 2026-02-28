const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db.js');
const log = require('../logger.js');
const { ADMIN_USERNAME } = require('../helpers/config');
const { validatePassword } = require('../helpers/validation');
const { normalizeRows } = require('../helpers/normalize');
const { auditLog } = require('../helpers/audit');
const { requireAuth, requireAdmin, invalidateUserCache } = require('../middleware/auth');

// Reset user password
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const user = await db.query("SELECT username FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: 'User not found.' });
        if (user.rows[0].username === ADMIN_USERNAME && req.user.username !== ADMIN_USERNAME) {
            return res.status(403).json({ error: 'Cannot reset primary admin password.' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();
        await db.query("UPDATE Users SET password_hash = $1, password_changed_at = $2 WHERE id = $3", [hash, now, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_PASSWORD_RESET', req.user.username, user.rows[0].username, 'Admin reset user password', req.ip);

        res.json({ message: 'Password reset successfully.' });
    } catch (e) {
        log.error('Admin reset password error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get all users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT id, username, email, created_at, avatar, role, suspended FROM Users ORDER BY id ASC");
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Admin get users error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Create user
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Missing required fields." });

    if (username.length > 50) return res.status(400).json({ error: "Username must be 50 characters or fewer." });
    if (email.length > 254) return res.status(400).json({ error: "Email must be 254 characters or fewer." });

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const hash = await bcrypt.hash(password, 10);
        const q = "INSERT INTO Users (username, email, password_hash, created_at, role) VALUES ($1, $2, $3, $4, $5) RETURNING id";
        await db.query(q, [username, email, hash, new Date().toISOString(), role || 'analyst']);

        await auditLog('ADMIN_CREATE_USER', req.user.username, username, `Admin created user with role: ${role || 'analyst'}`, req.ip);

        res.status(201).json({ message: "User account created successfully." });
    } catch (e) {
        if (e.message && e.message.includes("unique constraint")) {
            if (e.message.includes("username")) return res.status(409).json({ error: "Username already active." });
            if (e.message.includes("email")) return res.status(409).json({ error: "Email already active." });
        }
        log.error('Admin create user error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Toggle user role
router.put('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot modify the primary admin." });

        const newRole = user.rows[0].role === 'admin' ? 'analyst' : 'admin';
        await db.query("UPDATE Users SET role = $1 WHERE id = $2", [newRole, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_ROLE_CHANGE', req.user.username, user.rows[0].username, `Role changed to ${newRole}`, req.ip);

        res.json({ message: `Role updated to ${newRole}.`, role: newRole });
    } catch (err) {
        log.error('Admin role change error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Suspend/unsuspend user
router.put('/users/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, suspended FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot suspend the primary admin." });

        const newStatus = !user.rows[0].suspended;
        await db.query("UPDATE Users SET suspended = $1 WHERE id = $2", [newStatus, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_SUSPEND', req.user.username, user.rows[0].username, `User ${newStatus ? 'suspended' : 'reinstated'}`, req.ip);

        res.json({ message: `User ${newStatus ? 'suspended' : 'reinstated'} successfully.`, suspended: newStatus });
    } catch (err) {
        log.error('Admin suspend error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Delete user (with transaction)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot delete the primary admin." });

        const username = user.rows[0].username;

        await db.query("BEGIN");
        try {
            await db.query("DELETE FROM MessageReactions WHERE author = $1", [username]);
            await db.query("DELETE FROM Messages WHERE author = $1", [username]);
            await db.query("DELETE FROM RoomMembers WHERE username = $1", [username]);
            await db.query("DELETE FROM Notifications WHERE recipient = $1 OR sender = $1", [username]);
            await db.query("DELETE FROM Reactions WHERE author = $1", [username]);
            await db.query("DELETE FROM Comments WHERE author = $1", [username]);
            await db.query("DELETE FROM Posts WHERE author = $1", [username]);
            await db.query("DELETE FROM Submissions WHERE author = $1", [username]);
            await db.query("DELETE FROM Flags WHERE flagged_by = $1", [username]);
            await db.query("DELETE FROM FigureComments WHERE author = $1", [username]);
            await db.query("DELETE FROM MarketTransactions WHERE submitted_by = $1", [username]);
            await db.query("DELETE FROM TypingIndicators WHERE username = $1", [username]);
            await db.query("DELETE FROM Follows WHERE follower_id = $1 OR following_id = $1", [req.params.id]);
            await db.query("DELETE FROM NotificationPrefs WHERE user_id = $1", [req.params.id]);
            await db.query("DELETE FROM Users WHERE id = $1", [req.params.id]);
            await db.query("COMMIT");
        } catch (txErr) {
            await db.query("ROLLBACK");
            throw txErr;
        }

        await auditLog('ADMIN_DELETE_USER', req.user.username, username, 'User and all associated data purged', req.ip);

        res.json({ message: "User purged from the system." });
    } catch (err) {
        log.error('Admin delete user error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Delete figure
router.delete('/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM Submissions WHERE targetId = $1", [req.params.id]);
        await db.query("DELETE FROM Figures WHERE id = $1", [req.params.id]);
        res.json({ message: "Target and all associated intel purged." });
    } catch (err) {
        log.error('Admin delete figure error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Edit figure
router.put('/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, brand, classTie, line, msrp } = req.body;
    try {
        await db.query("UPDATE Figures SET name = $1, brand = $2, classTie = $3, line = $4, msrp = $5 WHERE id = $6",
            [name, brand, classTie, line, msrp !== undefined && msrp !== '' ? parseFloat(msrp) : null, req.params.id]);
        res.json({ message: "Target updated successfully." });
    } catch (err) {
        log.error('Admin edit figure error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Site analytics
router.get('/analytics', requireAuth, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await db.query("SELECT COUNT(*) as count FROM Users");
        const totalFigures = await db.query("SELECT COUNT(*) as count FROM Figures");
        const totalSubmissions = await db.query("SELECT COUNT(*) as count FROM Submissions");
        const totalPosts = await db.query("SELECT COUNT(*) as count FROM Posts");
        const recentUsers = await db.query("SELECT username, created_at FROM Users ORDER BY id DESC LIMIT 5");
        const activeAnalysts = await db.query("SELECT author, COUNT(*) as subs FROM Submissions GROUP BY author ORDER BY subs DESC LIMIT 5");

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalFigures: parseInt(totalFigures.rows[0].count),
            totalSubmissions: parseInt(totalSubmissions.rows[0].count),
            totalPosts: parseInt(totalPosts.rows[0].count),
            recentUsers: recentUsers.rows,
            topAnalysts: activeAnalysts.rows
        });
    } catch (err) {
        log.error('Admin analytics error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Flagged posts
router.get('/flags', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.id, f.post_id, f.flagged_by, f.reason, f.created_at,
                   p.author as post_author, p.content as post_content, p.date as post_date
            FROM Flags f
            LEFT JOIN Posts p ON f.post_id = p.id
            ORDER BY f.id DESC
        `);
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Admin flags error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Dismiss flag
router.delete('/flags/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM Flags WHERE id = $1", [req.params.id]);
        res.json({ message: "Flag dismissed." });
    } catch (err) {
        log.error('Admin dismiss flag error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Data retention cleanup
router.delete('/cleanup', requireAuth, requireAdmin, async (req, res) => {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

        const notifResult = await db.query("DELETE FROM Notifications WHERE created_at < $1", [ninetyDaysAgo]);
        const typingResult = await db.query("DELETE FROM TypingIndicators WHERE updated_at < $1", [oneMinuteAgo]);

        await auditLog('ADMIN_CLEANUP', req.user.username, null, `Cleaned ${notifResult.rowCount} old notifications, ${typingResult.rowCount} stale typing indicators`, req.ip);

        res.json({
            message: 'Cleanup completed.',
            deletedNotifications: notifResult.rowCount,
            deletedTypingIndicators: typingResult.rowCount
        });
    } catch (err) {
        log.error('Admin cleanup error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
