const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

// --- A-1: JWT Expiry — 30-day window, renewed on every app load --- //
// Security is maintained by:
//   • password_changed_at check in requireAuth (revokes token after password change)
//   • suspended check in requireAuth (blocks suspended accounts)
//   • Token renewal on /api/auth/me (fresh 30d token on every visit)
function generateToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role || 'analyst' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

module.exports = { generateToken };
