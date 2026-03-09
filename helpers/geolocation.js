// helpers/geolocation.js — IP-to-region mapping via ip-api.com
const http = require('http');
const log = require('../logger.js');

// US state abbreviation → region
const STATE_TO_REGION = {
    // Northeast
    CT: 'Northeast', DE: 'Northeast', MA: 'Northeast', MD: 'Northeast',
    ME: 'Northeast', NH: 'Northeast', NJ: 'Northeast', NY: 'Northeast',
    PA: 'Northeast', RI: 'Northeast', VT: 'Northeast', DC: 'Northeast',
    // Southeast
    AL: 'Southeast', AR: 'Southeast', FL: 'Southeast', GA: 'Southeast',
    KY: 'Southeast', LA: 'Southeast', MS: 'Southeast', NC: 'Southeast',
    SC: 'Southeast', TN: 'Southeast', VA: 'Southeast', WV: 'Southeast',
    // Midwest
    IA: 'Midwest', IL: 'Midwest', IN: 'Midwest', KS: 'Midwest',
    MI: 'Midwest', MN: 'Midwest', MO: 'Midwest', ND: 'Midwest',
    NE: 'Midwest', OH: 'Midwest', OK: 'Midwest', SD: 'Midwest', WI: 'Midwest',
    // West
    AK: 'West', AZ: 'West', CA: 'West', CO: 'West', HI: 'West',
    ID: 'West', MT: 'West', NM: 'West', NV: 'West', OR: 'West',
    UT: 'West', WA: 'West', WY: 'West', TX: 'West'
};

// In-memory cache: IP → { region, ts }
const ipCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Simple token-bucket rate limiter (ip-api.com free tier: 45 req/min)
let tokens = 45;
setInterval(() => { tokens = 45; }, 60 * 1000);

// Periodic cache cleanup (every 30 min)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipCache) {
        if (now - entry.ts > CACHE_TTL * 2) ipCache.delete(ip);
    }
}, 30 * 60 * 1000);

/**
 * Resolve an IP address to a US region.
 * Returns 'Northeast'|'Southeast'|'Midwest'|'West'|'International'|null
 * Never throws — returns null on any failure.
 */
async function getRegionFromIp(ip) {
    // Return cached result if available
    const cached = ipCache.get(ip);
    if (cached && (Date.now() - cached.ts < CACHE_TTL)) {
        return cached.region;
    }

    // Skip private/localhost IPs
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return null;
    }

    // Rate limit check
    if (tokens <= 0) {
        log.debug('IP geolocation rate limit reached, skipping', { ip });
        return null;
    }
    tokens--;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            log.debug('IP geolocation timeout', { ip });
            resolve(null);
        }, 3000);

        const req = http.get(`http://ip-api.com/json/${ip}?fields=status,countryCode,region`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(data);
                    let region = null;
                    if (json.status === 'success') {
                        if (json.countryCode === 'US' && json.region) {
                            region = STATE_TO_REGION[json.region] || null;
                        } else if (json.countryCode && json.countryCode !== 'US') {
                            region = 'International';
                        }
                    }
                    ipCache.set(ip, { region, ts: Date.now() });
                    resolve(region);
                } catch (e) {
                    log.debug('IP geolocation parse error', { ip, error: e.message });
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => {
            clearTimeout(timeout);
            log.debug('IP geolocation request error', { ip, error: e.message });
            resolve(null);
        });
        req.end();
    });
}

module.exports = { getRegionFromIp, STATE_TO_REGION };
