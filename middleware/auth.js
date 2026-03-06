const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db.js');
const { JWT_SECRET } = require('../helpers/config');

// --- Role hierarchy: owner > admin > moderator > analyst --- //
const ROLE_HIERARCHY = { owner: 4, admin: 3, moderator: 2, analyst: 1 };
function getRoleLevel(role) { return ROLE_HIERARCHY[role] || 1; }
const AUTH_RENEW_GRACE_SECONDS = 12 * 60 * 60;

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

// --- Token blacklist cache (revoked tokens) --- //
const blacklistCache = new Set();
let blacklistCacheTs = 0;
const BLACKLIST_CACHE_TTL = 30000; // 30 seconds

async function isTokenBlacklisted(tokenHash) {
    if (Date.now() - blacklistCacheTs > BLACKLIST_CACHE_TTL) {
        try {
            const result = await db.query(
                "SELECT token_hash FROM TokenBlacklist WHERE expires_at > $1",
                [new Date().toISOString()]
            );
            blacklistCache.clear();
            for (const row of result.rows) blacklistCache.add(row.token_hash);
            blacklistCacheTs = Date.now();
        } catch (e) {
            return false; // Fail open on DB error — same as user cache pattern
        }
    }
    return blacklistCache.has(tokenHash);
}

function invalidateBlacklistCache() {
    blacklistCacheTs = 0; // Force refresh on next check
}

// --- C-3: Session invalidation on password change --- //
async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    // Step 1: Verify JWT signature & expiry (auth error → 401)
    let decoded, token;
    try {
        token = authHeader.split(' ')[1];
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }

    // Step 1b: Check token blacklist (revoked via logout)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (await isTokenBlacklisted(tokenHash)) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
    }

    // Step 2: Look up user in DB (DB error → 500 so client retries, not 401 which logs out)
    try {
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
    } catch (dbErr) {
        // Database/internal error — return 500 so the client retries instead of nuking the token
        return res.status(500).json({ error: 'Server temporarily unavailable. Please try again.' });
    }
}

// --- Token renewal backup: accept expired tokens for /api/auth/me --- //
// Identical to requireAuth but uses { ignoreExpiration: true } so users
// are never kicked to login as long as their account is active.
// The /me endpoint issues a fresh 30d token, effectively renewing the session.
async function requireAuthRenew(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    let decoded, token;
    try {
        token = authHeader.split(' ')[1];
        // Verify signature but allow expiry check in custom grace logic below.
        decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (jwtErr) {
        // Signature invalid or malformed token — reject
        return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }

    // Check token blacklist (revoked via logout)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (await isTokenBlacklisted(tokenHash)) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
    }

    // Prevent indefinite session resurrection: only allow recently-expired tokens to renew.
    if (decoded.exp) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (decoded.exp + AUTH_RENEW_GRACE_SECONDS < nowSec) {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
    }

    try {
        const user = await getCachedUser(decoded.id);
        if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
        if (user.suspended) return res.status(403).json({ error: 'Your account has been suspended.' });

        // C-3: Reject token if issued before password was changed
        const passwordChangedAt = user.password_changed_at;
        if (passwordChangedAt && decoded.iat) {
            const changedAtSec = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
            if (decoded.iat < changedAtSec) {
                return res.status(401).json({ error: 'Password has been changed. Please log in again.' });
            }
        }

        req.user = { id: user.id, username: user.username, role: user.role || 'analyst' };
        next();
    } catch (dbErr) {
        return res.status(500).json({ error: 'Server temporarily unavailable. Please try again.' });
    }
}

// Granular role gate: requireRole('moderator') allows moderator, admin, and owner
function requireRole(minRole) {
    return function(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
        if (getRoleLevel(req.user.role) < getRoleLevel(minRole)) {
            return res.status(403).json({ error: 'Insufficient clearance level.' });
        }
        next();
    };
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (getRoleLevel(req.user.role) < getRoleLevel('admin')) {
        return res.status(403).json({ error: 'Insufficient clearance level.' });
    }
    next();
}

module.exports = { requireAuth, requireAuthRenew, requireAdmin, requireRole, invalidateUserCache, invalidateBlacklistCache, getRoleLevel, ROLE_HIERARCHY };
