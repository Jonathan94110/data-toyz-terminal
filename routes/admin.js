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
        log.error('Admin role change error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin suspend error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Delete user (with transaction)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].role === 'owner') return res.status(403).json({ error: "Cannot delete the owner." });
        if (getRoleLevel(user.rows[0].role) >= getRoleLevel(req.user.role)) return res.status(403).json({ error: "Cannot delete a user of equal or higher rank." });

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

        log.info('Figures merged', { sourceId, targetId, sourceName: source.rows[0].name, targetName: target.rows[0].name });
        res.json({
            message: `Merged "${source.rows[0].name}" into "${target.rows[0].name}". ${subResult.rowCount} submissions, ${mtResult.rowCount} market transactions, ${fcResult.rowCount} comments moved.`
        });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
        }
        log.error('Admin merge figures error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    } finally {
        if (client) client.release();
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

// Get pending brand requests
router.get('/pending-brands', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM PendingBrands ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        log.error('Admin get pending brands error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Approve a pending brand (move to ApprovedBrands, delete from PendingBrands)
router.post('/pending-brands/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
        const pending = await db.query("SELECT * FROM PendingBrands WHERE id = $1", [req.params.id]);
        if (!pending.rows[0]) return res.status(404).json({ error: "Pending brand not found." });

        const brandName = pending.rows[0].name;

        // Add to approved brands
        await db.query(
            "INSERT INTO ApprovedBrands (name, approved_by, created_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
            [brandName, req.user.username, new Date().toISOString()]
        );

        // Remove from pending
        await db.query("DELETE FROM PendingBrands WHERE id = $1", [req.params.id]);

        log.info('Pending brand approved', { brand: brandName, approvedBy: req.user.username });
        res.json({ message: `Brand "${brandName}" approved and added to the catalog.` });
    } catch (err) {
        log.error('Admin approve pending brand error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin reject pending brand error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get approved brands list
router.get('/brands', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT DISTINCT ON (LOWER(name)) * FROM ApprovedBrands ORDER BY LOWER(name) ASC, id ASC");
        res.json(result.rows);
    } catch (err) {
        log.error('Admin get brands error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin add brand error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Edit approved brand (rename + cascade to Figures)
router.put('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Brand name required." });
    try {
        // Get the old brand name first
        const old = await db.query("SELECT name FROM ApprovedBrands WHERE id = $1", [req.params.id]);
        if (!old.rows[0]) return res.status(404).json({ error: "Brand not found." });
        const oldName = old.rows[0].name;
        const newName = name.trim();

        // Update the approved brand
        await db.query("UPDATE ApprovedBrands SET name = $1 WHERE id = $2", [newName, req.params.id]);

        // Cascade: update all figures that use the old brand name
        const figResult = await db.query("UPDATE Figures SET brand = $1 WHERE brand = $2", [newName, oldName]);

        log.info('Brand renamed', { oldName, newName, figuresUpdated: figResult.rowCount });
        res.json({ message: `Brand renamed from "${oldName}" to "${newName}". ${figResult.rowCount} figure(s) updated.` });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: "A brand with that name already exists." });
        log.error('Admin edit brand error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Delete approved brand
router.delete('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM ApprovedBrands WHERE id = $1", [req.params.id]);
        res.json({ message: "Brand removed from approved list." });
    } catch (err) {
        log.error('Admin delete brand error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin analytics error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin flags error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Dismiss flag (moderators can dismiss)
router.delete('/flags/:id', requireAuth, requireRole('moderator'), async (req, res) => {
    try {
        await db.query("DELETE FROM Flags WHERE id = $1", [req.params.id]);
        res.json({ message: "Flag dismissed." });
    } catch (err) {
        log.error('Admin dismiss flag error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Wipe all submissions for a user (removes from leaderboard without deleting account)
router.delete('/users/:username/submissions', requireAuth, requireAdmin, async (req, res) => {
    try {
        const username = req.params.username;
        if (username === ADMIN_USERNAME) return res.status(403).json({ error: "Cannot wipe admin submissions." });

        const result = await db.query("DELETE FROM Submissions WHERE author = $1", [username]);
        await auditLog('ADMIN_WIPE_SUBMISSIONS', req.user.username, username, `Wiped ${result.rowCount} submissions`, req.ip);

        res.json({ message: `Removed ${result.rowCount} submissions for ${username}.`, count: result.rowCount });
    } catch (err) {
        log.error('Admin wipe submissions error', { error: err.message || err });
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

        await auditLog('ADMIN_LB_UPDATE', req.user.username, fig.rows[0].name,
            `Leaderboard: pinned=${!!lb_pinned}, hidden=${!!lb_hidden}, rank=${rankVal}, category=${catVal}`, req.ip);

        res.json({ message: `Leaderboard settings updated for "${fig.rows[0].name}".` });
    } catch (err) {
        log.error('Admin leaderboard update error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Toggle figure visibility on leaderboard (moderators can hide/unhide)
router.put('/figures/:id/visibility', requireAuth, requireRole('moderator'), async (req, res) => {
    const { hidden } = req.body;
    try {
        const fig = await db.query("SELECT id, name FROM Figures WHERE id = $1", [req.params.id]);
        if (!fig.rows[0]) return res.status(404).json({ error: 'Figure not found.' });

        await db.query("UPDATE Figures SET lb_hidden = $1 WHERE id = $2", [!!hidden, req.params.id]);

        await auditLog('MOD_LB_VISIBILITY', req.user.username, fig.rows[0].name,
            `Leaderboard visibility: ${hidden ? 'hidden' : 'visible'}`, req.ip);

        res.json({ message: `"${fig.rows[0].name}" ${hidden ? 'hidden from' : 'restored to'} leaderboard.` });
    } catch (err) {
        log.error('Moderator visibility toggle error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin leaderboard settings error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
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
        log.error('Admin audit-logs error', { error: err.message || err });
        res.status(500).json({ error: 'Failed to load audit logs.' });
    }
});

module.exports = router;
