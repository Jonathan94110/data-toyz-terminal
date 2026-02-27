const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

// --- A-1: JWT Expiry reduced to 24h --- //
function generateToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role || 'analyst' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = { generateToken };
