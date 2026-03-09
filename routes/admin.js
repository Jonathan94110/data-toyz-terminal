const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db.js');
const log = require('../logger.js');
const { ADMIN_USERNAME } = require('../helpers/config');
const { validatePassword } = require('../helpers/validation');
const { normalizeRows } = require('../helpers/normalize');
const { auditLog } = require('../helpers/audit');
const { requireAuth, requireAdmin, requireRole, invalidateUserCache, getRoleLevel } = require('../middleware/auth');
const { invalidateCache, invalidateAll } = require('../middleware/cache');
const { createNotification } = require('../helpers/notifications');

// Reset user password
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: 'User not found.' });
        if (user.rows[0].role === 'owner' || getRoleLevel(user.rows[0].role) >= getRoleLevel(req.user.role)) {
            return res.status(403).json({ error: 'Cannot reset password for a user of equal or higher rank.' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();
        await db.query("UPDATE Users SET password_hash = $1, password_changed_at = $2 WHERE id = $3", [hash, now, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_PASSWORD_RESET', req.user.username, user.rows[0].username, 'Admin reset user password', req.ip);

        res.json({ message: 'Password reset successfully.' });
    } catch (e) {
        log.error('Admin reset password error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get all users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT id, username, email, created_at, avatar, role, suspended, platinum FROM Users ORDER BY id ASC");
        res.json(normalizeRows(result.rows));
    } catch (err) {
        log.error('Admin get users error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
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
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Set user role (admin can assign analyst/moderator/admin; owner cannot be modified)
router.put('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
    const { role } = req.body;
    const ASSIGNABLE_ROLES = ['analyst', 'moderator', 'admin'];
    if (!role || !ASSIGNABLE_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Valid role required: analyst, moderator, or admin.' });
    }
    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].role === 'owner') return res.status(403).json({ error: "Cannot modify the owner role." });
        if (user.rows[0].username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot modify the primary admin." });

        // Non-owner admins cannot promote to admin (only owner can)
        if (role === 'admin' && req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Only the owner can promote users to admin.' });
        }

        await db.query("UPDATE Users SET role = $1 WHERE id = $2", [role, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_ROLE_CHANGE', req.user.username, user.rows[0].username, `Role changed from ${user.rows[0].role} to ${role}`, req.ip);

        res.json({ message: `Role updated to ${role}.`, role });
    } catch (err) {
        log.error('Admin role change error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Suspend/unsuspend user
router.put('/users/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, role, suspended FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].role === 'owner') return res.status(403).json({ error: "Cannot suspend the owner." });
        if (getRoleLevel(user.rows[0].role) >= getRoleLevel(req.user.role)) return res.status(403).json({ error: "Cannot suspend a user of equal or higher rank." });

        const newStatus = !user.rows[0].suspended;
        await db.query("UPDATE Users SET suspended = $1 WHERE id = $2", [newStatus, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_SUSPEND', req.user.username, user.rows[0].username, `User ${newStatus ? 'suspended' : 'reinstated'}`, req.ip);

        res.json({ message: `User ${newStatus ? 'suspended' : 'reinstated'} successfully.`, suspended: newStatus });
    } catch (err) {
        log.error('Admin suspend error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Toggle platinum badge
router.put('/users/:id/platinum', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, role, platinum FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });

        const newStatus = !user.rows[0].platinum;
        await db.query("UPDATE Users SET platinum = $1 WHERE id = $2", [newStatus, req.params.id]);
        invalidateUserCache(parseInt(req.params.id));

        await auditLog('ADMIN_PLATINUM_TOGGLE', req.user.username, user.rows[0].username,
            `Platinum badge ${newStatus ? 'granted' : 'revoked'}`, req.ip);

        res.json({ message: `Platinum badge ${newStatus ? 'granted to' : 'revoked from'} ${user.rows[0].username}.`, platinum: newStatus });
    } catch (err) {
        log.error('Admin platinum toggle error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Delete user (with transaction — uses dedicated client for safety)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    let client;
    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].role === 'owner') return res.status(403).json({ error: "Cannot delete the owner." });
        if (getRoleLevel(user.rows[0].role) >= getRoleLevel(req.user.role)) return res.status(403).json({ error: "Cannot delete a user of equal or higher rank." });

        const username = user.rows[0].username;

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
            await client.query("DELETE FROM Follows WHERE follower_id = $1 OR following_id = $1", [req.params.id]);
            await client.query("DELETE FROM UserCollection WHERE user_id = $1", [req.params.id]).catch(() => {});
            await client.query("DELETE FROM NotificationPrefs WHERE user_id = $1", [req.params.id]);
            await client.query("DELETE FROM Users WHERE id = $1", [req.params.id]);
            await client.query("COMMIT");
        } catch (txErr) {
            await client.query("ROLLBACK");
            throw txErr;
        }

        invalidateAll();

        await auditLog('ADMIN_DELETE_USER', req.user.username, username, 'User and all associated data purged', req.ip);

        res.json({ message: "User purged from the system." });
    } catch (err) {
        log.error('Admin delete user error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

// Merge two figures: moves all data from sourceId to targetId, then deletes sourceId
router.post('/figures/merge', requireAuth, requireAdmin, async (req, res) => {
    const { sourceId, targetId } = req.body;
    if (!sourceId || !targetId || sourceId === targetId) {
        return res.status(400).json({ error: "Must provide different sourceId and targetId." });
    }

    let client;
    try {
        client = await db.connect();
        await client.query("BEGIN");

        // Verify both exist
        const source = await client.query("SELECT id, name FROM Figures WHERE id = $1", [sourceId]);
        const target = await client.query("SELECT id, name FROM Figures WHERE id = $1", [targetId]);
        if (!source.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Source figure ID ${sourceId} not found.` });
        }
        if (!target.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Target figure ID ${targetId} not found.` });
        }

        // Move submissions
        const subResult = await client.query("UPDATE Submissions SET targetId = $1 WHERE targetId = $2", [targetId, sourceId]);
        // Move market transactions
        const mtResult = await client.query("UPDATE MarketTransactions SET figure_id = $1 WHERE figure_id = $2", [targetId, sourceId]);
        // Move figure comments
        const fcResult = await client.query("UPDATE FigureComments SET figure_id = $1 WHERE figure_id = $2", [targetId, sourceId]);
        // Update notifications
        await client.query("UPDATE Notifications SET link_id = $1 WHERE link_type = 'figure' AND link_id = $2", [targetId, sourceId]);

        // Delete the source figure (now has no references)
        await client.query("DELETE FROM Figures WHERE id = $1", [sourceId]);

        await client.query("COMMIT");

        invalidateAll();

        log.info('Figures merged', { sourceId, targetId, sourceName: source.rows[0].name, targetName: target.rows[0].name });
        res.json({
            message: `Merged "${source.rows[0].name}" into "${target.rows[0].name}". ${subResult.rowCount} submissions, ${mtResult.rowCount} market transactions, ${fcResult.rowCount} comments moved.`
        });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
        }
        log.error('Admin merge figures error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

// Delete figure (with transaction — uses dedicated client for safety)
router.delete('/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    let client;
    try {
        client = await db.connect();
        await client.query("BEGIN");
        await client.query("DELETE FROM MarketTransactions WHERE figure_id = $1", [req.params.id]);
        await client.query("DELETE FROM FigureComments WHERE figure_id = $1", [req.params.id]);
        await client.query("DELETE FROM Submissions WHERE targetId = $1", [req.params.id]);
        await client.query("DELETE FROM Figures WHERE id = $1", [req.params.id]);
        await client.query("COMMIT");
        invalidateAll();
        res.json({ message: "Target and all associated intel purged." });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
        }
        log.error('Admin delete figure error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

// Edit figure
router.put('/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, brand, classTie, line, msrp } = req.body;
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: 'Name, brand, class, and line are required.' });
    }
    try {
        const fig = await db.query("SELECT id FROM Figures WHERE id = $1", [req.params.id]);
        if (!fig.rows[0]) return res.status(404).json({ error: 'Figure not found.' });

        await db.query("UPDATE Figures SET name = $1, brand = $2, classTie = $3, line = $4, msrp = $5 WHERE id = $6",
            [name, brand, classTie, line, msrp !== undefined && msrp !== '' ? parseFloat(msrp) : null, req.params.id]);
        invalidateCache('/api/figures');
        invalidateCache('/api/stats');
        res.json({ message: "Target updated successfully." });
    } catch (err) {
        log.error('Admin edit figure error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get pending brand requests
router.get('/pending-brands', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM PendingBrands ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        log.error('Admin get pending brands error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Approve a pending brand (move to ApprovedBrands, delete from PendingBrands — transactional)
router.post('/pending-brands/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    let client;
    try {
        const pending = await db.query("SELECT * FROM PendingBrands WHERE id = $1", [req.params.id]);
        if (!pending.rows[0]) return res.status(404).json({ error: "Pending brand not found." });

        const brandName = pending.rows[0].name;

        client = await db.connect();
        await client.query("BEGIN");
        await client.query(
            "INSERT INTO ApprovedBrands (name, approved_by, created_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
            [brandName, req.user.username, new Date().toISOString()]
        );
        await client.query("DELETE FROM PendingBrands WHERE id = $1", [req.params.id]);
        await client.query("COMMIT");

        log.info('Pending brand approved', { brand: brandName, approvedBy: req.user.username });
        res.json({ message: `Brand "${brandName}" approved and added to the catalog.` });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
        }
        log.error('Admin approve pending brand error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

// Reject a pending brand
router.delete('/pending-brands/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const pending = await db.query("SELECT name FROM PendingBrands WHERE id = $1", [req.params.id]);
        if (!pending.rows[0]) return res.status(404).json({ error: "Pending brand not found." });

        await db.query("DELETE FROM PendingBrands WHERE id = $1", [req.params.id]);
        log.info('Pending brand rejected', { brand: pending.rows[0].name, rejectedBy: req.user.username });
        res.json({ message: `Brand "${pending.rows[0].name}" rejected.` });
    } catch (err) {
        log.error('Admin reject pending brand error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get approved brands list
router.get('/brands', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT DISTINCT ON (LOWER(name)) * FROM ApprovedBrands ORDER BY LOWER(name) ASC, id ASC");
        res.json(result.rows);
    } catch (err) {
        log.error('Admin get brands error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Add approved brand
router.post('/brands', requireAuth, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Brand name required." });
    try {
        await db.query(
            "INSERT INTO ApprovedBrands (name, approved_by, created_at) VALUES ($1, $2, $3)",
            [name.trim(), req.user.username, new Date().toISOString()]
        );
        res.status(201).json({ message: `Brand "${name.trim()}" approved.` });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: "Brand already exists." });
        log.error('Admin add brand error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Edit approved brand (rename + cascade to Figures — transactional)
router.put('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Brand name required." });
    let client;
    try {
        const old = await db.query("SELECT name FROM ApprovedBrands WHERE id = $1", [req.params.id]);
        if (!old.rows[0]) return res.status(404).json({ error: "Brand not found." });
        const oldName = old.rows[0].name;
        const newName = name.trim();

        client = await db.connect();
        await client.query("BEGIN");
        await client.query("UPDATE ApprovedBrands SET name = $1 WHERE id = $2", [newName, req.params.id]);
        const figResult = await client.query("UPDATE Figures SET brand = $1 WHERE brand = $2", [newName, oldName]);
        await client.query("COMMIT");

        invalidateCache('/api/figures');
        invalidateCache('/api/stats');

        log.info('Brand renamed', { oldName, newName, figuresUpdated: figResult.rowCount });
        res.json({ message: `Brand renamed from "${oldName}" to "${newName}". ${figResult.rowCount} figure(s) updated.` });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
        }
        if (err.code === '23505') return res.status(409).json({ error: "A brand with that name already exists." });
        log.error('Admin edit brand error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    } finally {
        if (client) client.release();
    }
});

// Delete approved brand
router.delete('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM ApprovedBrands WHERE id = $1", [req.params.id]);
        res.json({ message: "Brand removed from approved list." });
    } catch (err) {
        log.error('Admin delete brand error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Site analytics (moderators can view)
router.get('/analytics', requireAuth, requireRole('moderator'), async (req, res) => {
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
        log.error('Admin analytics error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Page view analytics — summary (moderators+)
router.get('/pageviews/summary', requireAuth, requireRole('moderator'), async (req, res) => {
    try {
        const [totalViews, uniqueVisitors, today, thisWeek, thisMonth] = await Promise.all([
            db.query("SELECT COUNT(*) as count FROM PageViews"),
            db.query("SELECT COUNT(DISTINCT ip_address) as count FROM PageViews"),
            db.query("SELECT COUNT(*) as count FROM PageViews WHERE created_at >= CURRENT_DATE"),
            db.query("SELECT COUNT(*) as count FROM PageViews WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)"),
            db.query("SELECT COUNT(*) as count FROM PageViews WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)")
        ]);
        res.json({
            totalViews: parseInt(totalViews.rows[0].count),
            uniqueVisitors: parseInt(uniqueVisitors.rows[0].count),
            today: parseInt(today.rows[0].count),
            thisWeek: parseInt(thisWeek.rows[0].count),
            thisMonth: parseInt(thisMonth.rows[0].count)
        });
    } catch (err) {
        log.error('Admin pageviews summary error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Page view analytics — aggregated by period (moderators+)
router.get('/pageviews', requireAuth, requireRole('moderator'), async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const from = req.query.from || null;
        const to = req.query.to || null;

        let dateTrunc;
        if (period === 'monthly') dateTrunc = 'month';
        else if (period === 'yearly') dateTrunc = 'year';
        else dateTrunc = 'day';

        const conditions = [];
        const params = [];
        let idx = 1;
        if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
        if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const result = await db.query(`
            SELECT DATE_TRUNC('${dateTrunc}', created_at) as period,
                   COUNT(*) as views,
                   COUNT(DISTINCT ip_address) as unique_visitors
            FROM PageViews ${where}
            GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
            ORDER BY period DESC
            LIMIT 365
        `, params);

        res.json({
            period,
            data: result.rows.map(r => ({
                period: r.period,
                views: parseInt(r.views),
                uniqueVisitors: parseInt(r.unique_visitors)
            }))
        });
    } catch (err) {
        log.error('Admin pageviews error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Flagged posts (moderators can view + dismiss)
router.get('/flags', requireAuth, requireRole('moderator'), async (req, res) => {
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
        log.error('Admin flags error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Dismiss flag (moderators can dismiss)
router.delete('/flags/:id', requireAuth, requireRole('moderator'), async (req, res) => {
    try {
        await db.query("DELETE FROM Flags WHERE id = $1", [req.params.id]);
        res.json({ message: "Flag dismissed." });
    } catch (err) {
        log.error('Admin dismiss flag error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Wipe all submissions for a user (removes from leaderboard without deleting account)
router.delete('/users/:username/submissions', requireAuth, requireAdmin, async (req, res) => {
    try {
        const username = req.params.username;
        if (username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot wipe admin submissions." });

        const result = await db.query("DELETE FROM Submissions WHERE author = $1", [username]);
        invalidateAll();
        await auditLog('ADMIN_WIPE_SUBMISSIONS', req.user.username, username, `Wiped ${result.rowCount} submissions`, req.ip);

        res.json({ message: `Removed ${result.rowCount} submissions for ${username}.`, count: result.rowCount });
    } catch (err) {
        log.error('Admin wipe submissions error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Data retention cleanup
router.delete('/cleanup', requireAuth, requireAdmin, async (req, res) => {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

        const notifResult = await db.query("DELETE FROM Notifications WHERE created_at < $1", [ninetyDaysAgo]);
        const typingResult = await db.query("DELETE FROM TypingIndicators WHERE updated_at < $1", [oneMinuteAgo]);
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
        const pvResult = await db.query("DELETE FROM PageViews WHERE created_at < $1", [sixMonthsAgo]);

        await auditLog('ADMIN_CLEANUP', req.user.username, null, `Cleaned ${notifResult.rowCount} old notifications, ${typingResult.rowCount} stale typing indicators, ${pvResult.rowCount} old page views`, req.ip);

        res.json({
            message: 'Cleanup completed.',
            deletedNotifications: notifResult.rowCount,
            deletedTypingIndicators: typingResult.rowCount,
            deletedPageViews: pvResult.rowCount
        });
    } catch (err) {
        log.error('Admin cleanup error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// --- Leaderboard Controls --- //

// Update leaderboard settings for a figure (admin: full control)
router.put('/figures/:id/leaderboard', requireAuth, requireAdmin, async (req, res) => {
    const { lb_pinned, lb_hidden, lb_rank_override, lb_category } = req.body;
    try {
        const fig = await db.query("SELECT id, name FROM Figures WHERE id = $1", [req.params.id]);
        if (!fig.rows[0]) return res.status(404).json({ error: 'Figure not found.' });

        const rankVal = (lb_rank_override !== null && lb_rank_override !== undefined && lb_rank_override !== '')
            ? parseInt(lb_rank_override) : null;
        const catVal = lb_category && lb_category.trim() ? lb_category.trim() : null;

        await db.query(
            "UPDATE Figures SET lb_pinned = $1, lb_hidden = $2, lb_rank_override = $3, lb_category = $4 WHERE id = $5",
            [!!lb_pinned, !!lb_hidden, rankVal, catVal, req.params.id]
        );

        invalidateCache('/api/figures');

        await auditLog('ADMIN_LB_UPDATE', req.user.username, fig.rows[0].name,
            `Leaderboard: pinned=${!!lb_pinned}, hidden=${!!lb_hidden}, rank=${rankVal}, category=${catVal}`, req.ip);

        res.json({ message: `Leaderboard settings updated for "${fig.rows[0].name}".` });
    } catch (err) {
        log.error('Admin leaderboard update error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Toggle figure visibility on leaderboard (moderators can hide/unhide)
router.put('/figures/:id/visibility', requireAuth, requireRole('moderator'), async (req, res) => {
    const { hidden } = req.body;
    try {
        const fig = await db.query("SELECT id, name FROM Figures WHERE id = $1", [req.params.id]);
        if (!fig.rows[0]) return res.status(404).json({ error: 'Figure not found.' });

        await db.query("UPDATE Figures SET lb_hidden = $1 WHERE id = $2", [!!hidden, req.params.id]);
        invalidateCache('/api/figures');

        await auditLog('MOD_LB_VISIBILITY', req.user.username, fig.rows[0].name,
            `Leaderboard visibility: ${hidden ? 'hidden' : 'visible'}`, req.ip);

        res.json({ message: `"${fig.rows[0].name}" ${hidden ? 'hidden from' : 'restored to'} leaderboard.` });
    } catch (err) {
        log.error('Moderator visibility toggle error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get leaderboard-manageable figures (for admin panel)
router.get('/figures/leaderboard-settings', requireAuth, requireRole('moderator'), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.id, f.name, f.brand, f.lb_pinned, f.lb_hidden, f.lb_rank_override, f.lb_category,
                   COUNT(s.id) as submission_count,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade
            FROM Figures f LEFT JOIN Submissions s ON f.id = s.targetId
            GROUP BY f.id
            HAVING COUNT(s.id) >= 1
            ORDER BY f.name ASC
        `);
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            lbPinned: r.lb_pinned || false,
            lbHidden: r.lb_hidden || false,
            lbRankOverride: r.lb_rank_override,
            lbCategory: r.lb_category,
            submissions: parseInt(r.submission_count) || 0,
            avgGrade: r.avg_grade ? parseFloat(parseFloat(r.avg_grade).toFixed(1)) : null
        })));
    } catch (err) {
        log.error('Admin leaderboard settings error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// ── Audit Logs ──────────────────────────────────────────
// GET /admin/audit-logs — paginated, filterable log viewer

router.get('/audit-logs', requireAuth, requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        // Build WHERE clauses
        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (req.query.action) {
            conditions.push(`action = $${paramIdx++}`);
            params.push(req.query.action);
        }

        if (req.query.actor) {
            conditions.push(`LOWER(actor) = LOWER($${paramIdx++})`);
            params.push(req.query.actor);
        }

        if (req.query.search) {
            conditions.push(`(LOWER(actor) LIKE $${paramIdx} OR LOWER(target) LIKE $${paramIdx} OR LOWER(details) LIKE $${paramIdx})`);
            params.push(`%${req.query.search.toLowerCase()}%`);
            paramIdx++;
        }

        if (req.query.from) {
            conditions.push(`created_at >= $${paramIdx++}`);
            params.push(req.query.from);
        }

        if (req.query.to) {
            conditions.push(`created_at <= $${paramIdx++}`);
            params.push(req.query.to);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Count total matching rows
        const countRes = await db.query(`SELECT COUNT(*) as total FROM AuditLog ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].total) || 0;

        // Fetch page of logs
        const logsRes = await db.query(
            `SELECT id, action, actor, target, details, ip_address, created_at
             FROM AuditLog ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset]
        );

        res.json({
            logs: logsRes.rows,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1
        });
    } catch (err) {
        log.error('Admin audit-logs error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'Failed to load audit logs.', refId: req.requestId });
    }
});

// Get ticker settings
router.get('/ticker-settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            "SELECT key, value FROM SiteSettings WHERE key IN ('ticker_mode', 'ticker_length')"
        );
        const settings = {};
        result.rows.forEach(r => { settings[r.key] = r.value; });
        res.json({
            ticker_mode: settings.ticker_mode || 'all',
            ticker_length: parseInt(settings.ticker_length) || 25
        });
    } catch (err) {
        log.error('Admin get ticker settings error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Update ticker settings
router.put('/ticker-settings', requireAuth, requireAdmin, async (req, res) => {
    const { ticker_mode, ticker_length } = req.body;

    const validModes = ['grade', 'approval', 'pricing', 'all'];
    if (ticker_mode && !validModes.includes(ticker_mode)) {
        return res.status(400).json({ error: 'Invalid ticker mode. Must be: grade, approval, pricing, or all.' });
    }

    const length = parseInt(ticker_length);
    if (ticker_length !== undefined && (isNaN(length) || length < 5 || length > 100)) {
        return res.status(400).json({ error: 'Ticker length must be between 5 and 100.' });
    }

    try {
        const now = new Date().toISOString();
        if (ticker_mode) {
            await db.query(
                `INSERT INTO SiteSettings (key, value, updated_by, updated_at)
                 VALUES ('ticker_mode', $1, $2, $3)
                 ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = $3`,
                [ticker_mode, req.user.username, now]
            );
        }
        if (ticker_length !== undefined) {
            await db.query(
                `INSERT INTO SiteSettings (key, value, updated_by, updated_at)
                 VALUES ('ticker_length', $1, $2, $3)
                 ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = $3`,
                [String(length), req.user.username, now]
            );
        }

        await auditLog('ADMIN_TICKER_SETTINGS', req.user.username, null,
            `Ticker updated: mode=${ticker_mode || '(unchanged)'}, length=${ticker_length || '(unchanged)'}`, req.ip);

        res.json({ message: 'Ticker settings updated.', ticker_mode: ticker_mode || undefined, ticker_length: length || undefined });
    } catch (err) {
        log.error('Admin update ticker settings error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Full database backup (JSON download)
router.post('/backup', requireAuth, requireAdmin, async (req, res) => {
    try {
        const tables = [
            { name: 'users', query: 'SELECT id, username, email, avatar, role, suspended, created_at FROM Users ORDER BY id' },
            { name: 'figures', query: 'SELECT * FROM Figures ORDER BY id' },
            { name: 'submissions', query: 'SELECT * FROM Submissions ORDER BY id' },
            { name: 'market_transactions', query: 'SELECT * FROM MarketTransactions ORDER BY id' },
            { name: 'posts', query: 'SELECT * FROM Posts ORDER BY id' },
            { name: 'comments', query: 'SELECT * FROM Comments ORDER BY id' },
            { name: 'reactions', query: 'SELECT * FROM Reactions ORDER BY id' },
            { name: 'rooms', query: 'SELECT * FROM Rooms ORDER BY id' },
            { name: 'room_members', query: 'SELECT * FROM RoomMembers ORDER BY id' },
            { name: 'messages', query: 'SELECT * FROM Messages ORDER BY id' },
            { name: 'message_reactions', query: 'SELECT * FROM MessageReactions ORDER BY id' },
            { name: 'notifications', query: 'SELECT * FROM Notifications ORDER BY id' },
            { name: 'notification_prefs', query: 'SELECT * FROM NotificationPrefs ORDER BY id' },
            { name: 'figure_comments', query: 'SELECT * FROM FigureComments ORDER BY id' },
            { name: 'follows', query: 'SELECT * FROM Follows ORDER BY id' },
            { name: 'flags', query: 'SELECT * FROM Flags ORDER BY id' },
            { name: 'audit_log', query: 'SELECT * FROM AuditLog ORDER BY id' },
            { name: 'approved_brands', query: 'SELECT * FROM ApprovedBrands ORDER BY id' },
            { name: 'pending_brands', query: 'SELECT * FROM PendingBrands ORDER BY id' },
            { name: 'site_settings', query: 'SELECT * FROM SiteSettings ORDER BY key' },
            { name: 'typing_indicators', query: 'SELECT * FROM TypingIndicators ORDER BY id' },
            { name: 'page_views', query: 'SELECT * FROM PageViews ORDER BY id DESC LIMIT 10000' }
        ];

        const backup = {
            version: '1.0',
            created_at: new Date().toISOString(),
            created_by: req.user.username,
            tables: {}
        };

        for (const t of tables) {
            try {
                const result = await db.query(t.query);
                backup.tables[t.name] = { count: result.rows.length, rows: result.rows };
            } catch (e) {
                backup.tables[t.name] = { count: 0, rows: [], error: e.message };
            }
        }

        await auditLog('ADMIN_BACKUP', req.user.username, null,
            `Full backup downloaded (${Object.keys(backup.tables).length} tables)`, req.ip);

        const filename = `datatoyz-backup-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(backup);
    } catch (err) {
        log.error('Admin backup error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'Backup failed.', refId: req.requestId });
    }
});

// Send HQ update notification to all active users
router.post('/hq-update', requireAuth, requireAdmin, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    if (message.length > 500) return res.status(400).json({ error: 'Message must be 500 characters or fewer.' });

    try {
        const usersResult = await db.query(
            "SELECT username FROM Users WHERE suspended = false AND username != $1",
            [req.user.username]
        );
        let sent = 0;
        for (const u of usersResult.rows) {
            createNotification(u.username, 'hq_updates', message.trim(), 'admin', null, req.user.username).catch(() => {});
            sent++;
        }

        await auditLog('HQ_UPDATE', req.user.username, null,
            `HQ update sent to ${sent} users: ${message.trim().slice(0, 100)}`, req.ip);

        res.json({ message: `HQ update sent to ${sent} users.`, sent });
    } catch (err) {
        log.error('HQ update error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
