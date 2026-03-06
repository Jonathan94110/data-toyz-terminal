const log = require('../logger.js');

// --- In-memory response cache (Map with TTL) --- //
// Same pattern as userCache in auth.js — Map + periodic cleanup.
const responseCache = new Map();

/**
 * Middleware factory: caches GET responses for a given TTL.
 *
 * Usage:  router.get('/overview', cacheResponse(60000), handler)
 *
 * - Only caches GET requests with 2xx responses.
 * - Cache key = req.originalUrl (includes query string).
 * - Adds X-Cache: HIT | MISS header for debugging.
 */
function cacheResponse(ttlMs) {
    return function (req, res, next) {
        if (req.method !== 'GET') return next();

        const key = req.originalUrl;
        const cached = responseCache.get(key);

        if (cached && (Date.now() - cached.ts < cached.ttl)) {
            res.set('Content-Type', 'application/json');
            res.set('X-Cache', 'HIT');
            return res.status(200).send(cached.data);
        }

        // Intercept res.json() to capture the response before it leaves
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                responseCache.set(key, {
                    data: JSON.stringify(body),
                    ts: Date.now(),
                    ttl: ttlMs
                });
            }
            res.set('X-Cache', 'MISS');
            return originalJson(body);
        };

        next();
    };
}

/**
 * Invalidate all cache entries whose key starts with a given prefix.
 * Example: invalidateCache('/api/stats') clears all stats endpoints.
 */
function invalidateCache(prefix) {
    let cleared = 0;
    for (const key of responseCache.keys()) {
        if (key.startsWith(prefix)) {
            responseCache.delete(key);
            cleared++;
        }
    }
    if (cleared > 0) {
        log.debug('Cache invalidated', { prefix, cleared });
    }
}

/**
 * Clear the entire cache. Used for admin bulk operations.
 */
function invalidateAll() {
    const size = responseCache.size;
    responseCache.clear();
    if (size > 0) log.debug('Full cache cleared', { entries: size });
}

// Periodic cleanup: remove entries older than 2× their TTL (every 2 min)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of responseCache) {
        if (now - val.ts > val.ttl * 2) responseCache.delete(key);
    }
}, 2 * 60 * 1000);

module.exports = { cacheResponse, invalidateCache, invalidateAll };
