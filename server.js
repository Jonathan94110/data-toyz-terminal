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

// --- Compression & body parsing --- //
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// --- Health check BEFORE rate limiter (blue-green deploys) --- //
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', uptime: process.uptime() });
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

// --- 404 for unknown API routes (Express 5 wildcard syntax) --- //
app.all('/api/{*path}', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
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
