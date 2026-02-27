const jwt = require('jsonwebtoken');
const db = require('../db.js');
const { JWT_SECRET } = require('../helpers/config');

// --- C-3: Session invalidation on password change --- //
async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await db.query("SELECT id, username, role, suspended, password_changed_at FROM Users WHERE id = $1", [decoded.id]);
        if (!result.rows[0]) return res.status(401).json({ error: 'Account no longer exists.' });
        if (result.rows[0].suspended) return res.status(403).json({ error: 'Your account has been suspended.' });

        // C-3: Reject token if it was issued before the password was changed
        const passwordChangedAt = result.rows[0].password_changed_at;
        if (passwordChangedAt && decoded.iat) {
            const changedAtSec = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
            if (decoded.iat < changedAtSec) {
                return res.status(401).json({ error: 'Password has been changed. Please log in again.' });
            }
        }

        req.user = { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role || 'analyst' };
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

module.exports = { requireAuth, requireAdmin };
