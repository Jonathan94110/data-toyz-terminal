/**
 * Data Toyz Terminal — Server Entry Point
 * Thin orchestrator: middleware stack → mount routers → serve static → start.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const db = require('./db.js');
const log = require('./logger.js');
const crypto = require('crypto');
const { apiLimiter } = require('./middleware/rateLimiters');

const app = express();
app.set('trust proxy', 1);          // Render sits behind a reverse proxy
const PORT = process.env.PORT || 3000;

// --- HTTPS Enforcement in production --- //
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }
    next();
});

// --- Block mobile browsers — desktop only for now --- //
app.use((req, res, next) => {
    // Let API routes through (mobile apps may call them later)
    if (req.path.startsWith('/api/')) return next();
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const isMobile = /android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini|iemobile/i.test(ua);
    if (isMobile) {
        return res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Data Toyz | Desktop Required</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#070914;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;padding:2rem;text-align:center}
.wrap{max-width:360px}
h1{font-family:'Outfit',sans-serif;font-size:1.8rem;font-weight:800;background:linear-gradient(135deg,#ff2a5f,#ff8e3c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:1rem}
p{font-size:1rem;line-height:1.6;color:#94a3b8;margin-bottom:1.5rem}
.icon{font-size:3rem;margin-bottom:1rem}
a{color:#ff2a5f;text-decoration:none;font-weight:600}
</style></head><body>
<div class="wrap">
<div class="icon">&#128187;</div>
<h1>DATA TOYZ</h1>
<p>The Trade Value Terminal is currently available on <strong style="color:#e2e8f0;">desktop browsers only</strong>.</p>
<p style="font-size:0.9rem;">A mobile app is coming soon. For now, please visit <a href="https://datatoyz.com">datatoyz.com</a> on a computer.</p>
</div></body></html>`);
    }
    next();
});

// --- Page View Tracking (non-blocking, fire-and-forget) --- //
const jwt = require('jsonwebtoken');
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    // Skip static assets (files with extensions)
    if (/\.\w{2,5}$/.test(req.path)) return next();

    const ip = req.ip;
    const userAgent = (req.headers['user-agent'] || '').substring(0, 500);
    const pagePath = req.path || '/';

    // Best-effort user_id extraction from JWT (decode only, no verify)
    let userId = null;
    try {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const decoded = jwt.decode(authHeader.split(' ')[1]);
            if (decoded && decoded.id) userId = decoded.id;
        }
    } catch (_) { /* ignore */ }

    db.query(
        'INSERT INTO PageViews (path, ip_address, user_agent, user_id, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [pagePath, ip, userAgent, userId]
    ).catch(err => {
        log.error('Page view tracking error', { error: err.message });
    });

    next();
});

// --- CORS --- //
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// --- Security headers --- //
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"]
        }
    }
}));

// --- Request ID for error correlation (customers can quote this for support) --- //
app.use((req, res, next) => {
    req.requestId = crypto.randomBytes(4).toString('hex');
    next();
});

// --- Compression & body parsing --- //
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// --- Health check BEFORE rate limiter (blue-green deploys) --- //
app.get('/api/health', async (req, res) => {
    try {
        // Verify DB connection AND that critical tables exist
        const tableCheck = await db.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('users', 'figures', 'submissions', 'posts')
        `);
        const tables = tableCheck.rows.map(r => r.table_name);
        const missing = ['users', 'figures', 'submissions', 'posts'].filter(t => !tables.includes(t));
        if (missing.length > 0) {
            return res.status(503).json({
                status: 'degraded',
                error: `Missing tables: ${missing.join(', ')}`,
                uptime: process.uptime()
            });
        }
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount }
        });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', error: 'database unreachable' });
    }
});

// --- Global API rate limiter --- //
app.use('/api/', apiLimiter);

// --- HTML: no-cache (always fresh ?v=N refs); assets: 7-day cache --- //
app.use((req, res, next) => {
    if (req.path === '/' || req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    etag: true,
    lastModified: true
}));

// --- Mount route modules --- //
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/figures', require('./routes/figures'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/trade-advisor', require('./routes/trade-advisor'));
app.use('/api/collection', require('./routes/collection'));

// Public ticker settings (no auth required)
app.get('/api/settings/ticker', async (req, res) => {
    try {
        const result = await db.query(
            "SELECT key, value FROM SiteSettings WHERE key IN ('ticker_mode', 'ticker_length')"
        );
        const settings = {};
        result.rows.forEach(r => { settings[r.key] = r.value; });
        res.json({
            ticker_mode: settings.ticker_mode || 'all',
            ticker_length: parseInt(settings.ticker_length) || 25
        });
    } catch (err) {
        res.json({ ticker_mode: 'all', ticker_length: 25 });
    }
});

// --- 404 for unknown API routes (Express 5 wildcard syntax) --- //
app.all('/api/{*path}', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
});

// --- SPA fallback: serve index.html for any non-API, non-file route --- //
app.get('{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Global error handler (catches unhandled throws / async rejections) --- //
app.use((err, req, res, _next) => {
    const refId = req.requestId || 'unknown';
    log.error('Unhandled route error', {
        refId,
        method: req.method,
        path: req.originalUrl,
        userId: req.user?.id || null,
        error: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
    if (!res.headersSent) {
        res.status(500).json({
            error: 'An internal error occurred.',
            refId
        });
    }
});

// --- Start & Graceful Shutdown --- //
let server;

if (require.main === module) {
    server = app.listen(PORT, () => {
        log.info(`Data Toyz Terminal Server active on port ${PORT}`);
    });

    const gracefulShutdown = (signal) => {
        log.info(`${signal} received. Shutting down gracefully...`);
        if (server) {
            server.close(() => {
                log.info('HTTP server closed.');
                db.end(() => {
                    log.info('Database pool closed.');
                    process.exit(0);
                });
            });
        } else {
            db.end(() => process.exit(0));
        }
        setTimeout(() => {
            log.error('Forced shutdown after timeout.');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
