const rateLimit = require('express-rate-limit');
const log = require('../logger.js');

// --- Layer 1: User-Agent validation --- //
const BLOCKED_UA_PATTERNS = [
    /curl\//i, /wget\//i, /python-requests/i, /python-urllib/i,
    /scrapy/i, /httpclient/i, /go-http-client/i, /java\//i,
    /libwww/i, /aiohttp/i, /httpie/i, /postmanruntime/i,
    /node-fetch/i, /axios\//i, /undici\//i
];
const ALLOWED_BOT_PATTERNS = [
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
    /facebot/i, /twitterbot/i, /applebot/i
];

function blockBadBots(req, res, next) {
    const ua = req.headers['user-agent'];

    // No user-agent = not a real browser
    if (!ua) return res.status(403).json({ error: 'Access denied.' });

    // Allow known search engine crawlers
    for (const pattern of ALLOWED_BOT_PATTERNS) {
        if (pattern.test(ua)) return next();
    }

    // Block known scraper/bot user-agents
    for (const pattern of BLOCKED_UA_PATTERNS) {
        if (pattern.test(ua)) {
            log.warn('Blocked bot request', { ua, ip: req.ip, path: req.originalUrl });
            return res.status(403).json({ error: 'Access denied.' });
        }
    }

    next();
}

// --- Layer 2: Stricter rate limiter for public data endpoints --- //
const dataEndpointLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 60 : 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many data requests. Please try again later.' }
});

// --- Layer 3: Behavioral IP tracking (catches systematic scraping) --- //
const ipTracker = new Map();
const WINDOW_MS = 5 * 60 * 1000;       // 5-minute window
const MAX_DATA_HITS = 40;               // max data-endpoint hits in window
const BLOCK_DURATION_MS = 30 * 60 * 1000; // 30-minute temp block

function trackDataRequest(req, res, next) {
    const ip = req.ip;
    const now = Date.now();

    let entry = ipTracker.get(ip);
    if (!entry) {
        entry = { hits: [], blockedUntil: 0 };
        ipTracker.set(ip, entry);
    }

    // If IP is temporarily blocked
    if (entry.blockedUntil > now) {
        return res.status(429).json({ error: 'Temporarily blocked due to excessive data requests.' });
    }

    // Clean old hits outside the window
    entry.hits = entry.hits.filter(t => now - t < WINDOW_MS);
    entry.hits.push(now);

    // Check if threshold exceeded
    if (entry.hits.length > MAX_DATA_HITS) {
        entry.blockedUntil = now + BLOCK_DURATION_MS;
        entry.hits = [];
        log.warn('IP temporarily blocked for excessive data scraping', { ip, path: req.originalUrl });
        return res.status(429).json({ error: 'Temporarily blocked due to excessive data requests.' });
    }

    next();
}

// Periodic cleanup of stale IP tracking entries (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipTracker) {
        if (entry.blockedUntil < now && entry.hits.every(t => now - t > WINDOW_MS)) {
            ipTracker.delete(ip);
        }
    }
}, 5 * 60 * 1000);

module.exports = { blockBadBots, dataEndpointLimiter, trackDataRequest };
