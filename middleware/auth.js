const jwt = require('jsonwebtoken');
const db = require('../db.js');
const { JWT_SECRET } = require('../helpers/config');

// --- LRU user cache (15-second TTL) to avoid DB hit on every request --- //
const userCache = new Map();
const USER_CACHE_TTL = 15000;

async function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL) return cached.data;

    const result = await db.query(
        "SELECT id, username, role, suspended, password_changed_at FROM Users WHERE id = $1", [userId]
    );
    const user = result.rows[0] || null;
    if (user) userCache.set(userId, { data: user, ts: Date.now() });
    return user;
}

// Invalidate cache for a specific user (call after password change, role change, etc.)
function invalidateUserCache(userId) { userCache.delete(userId); }

// Periodic cleanup of stale entries (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of userCache) {
        if (now - val.ts > USER_CACHE_TTL * 4) userCache.delete(key);
    }
}, 5 * 60 * 1000);

// --- C-3: Session invalidation on password change --- //
async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await getCachedUser(decoded.id);
        if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
        if (user.suspended) return res.status(403).json({ error: 'Your account has been suspended.' });

        // C-3: Reject token if it was issued before the password was changed
        const passwordChangedAt = user.password_changed_at;
        if (passwordChangedAt && decoded.iat) {
            const changedAtSec = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
            if (decoded.iat < changedAtSec) {
                return res.status(401).json({ error: 'Password has been changed. Please log in again.' });
            }
        }

        req.user = { id: user.id, username: user.username, role: user.role || 'analyst' };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Insufficient clearance level.' });
    next();
}

module.exports = { requireAuth, requireAdmin, invalidateUserCache };
