const rateLimit = require('express-rate-limit');

// --- S-3: Rate Limiting --- //
// API rate limiter: 500 requests per 15 min per IP (API routes only)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 500 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' }
});

// Auth rate limiter: broad cap for auth APIs.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 50 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
});

// Login/reset limiter: tighter guard on brute-force targets without impacting normal browsing.
const authAttemptLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 120 : 400,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
});

// Message rate limiter: 30 per minute per IP
const messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Message rate limit exceeded. Please slow down.' }
});

module.exports = { apiLimiter, authLimiter, authAttemptLimiter, messageLimiter };
