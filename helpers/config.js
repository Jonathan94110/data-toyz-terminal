const crypto = require('crypto');
const { Resend } = require('resend');

// --- S-1: JWT Secret — throw in production if missing, auto-generate in dev --- //
let JWT_SECRET;
if (process.env.JWT_SECRET) {
    JWT_SECRET = process.env.JWT_SECRET;
} else if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
} else {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    const log = require('../logger.js');
    log.warn('JWT_SECRET not set — auto-generated a random secret for development. Sessions will not persist across restarts.');
}

// --- PI-2: Configurable admin username --- //
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Prime Dynamixx';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Data Toyz Terminal <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Email throttle: 1-minute cooldown per recipient to prevent email storms
const emailThrottle = new Map();
const EMAIL_COOLDOWN_MS = 60 * 1000; // 1 minute

// Periodically clean up stale entries from the email throttle map (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of emailThrottle) {
        if (now - timestamp > EMAIL_COOLDOWN_MS) emailThrottle.delete(key);
    }
}, 10 * 60 * 1000);

module.exports = { JWT_SECRET, ADMIN_USERNAME, RESEND_API_KEY, resend, RESEND_FROM_EMAIL, APP_URL, emailThrottle, EMAIL_COOLDOWN_MS };
