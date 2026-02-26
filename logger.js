// Structured logger with levels and JSON output for production
// Levels: error(0) < warn(1) < info(2) < debug(3)

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatLog(level, message, meta = {}) {
    if (IS_PRODUCTION) {
        // JSON structured logs for production (parseable by log aggregators)
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...meta
        });
    }
    // Human-readable for development
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = { error: '✗', warn: '⚠', info: '●', debug: '◦' }[level] || '·';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${prefix} [${level.toUpperCase()}] ${message}${metaStr}`;
}

const logger = {
    error(message, meta = {}) {
        if (CURRENT_LEVEL >= LOG_LEVELS.error) console.error(formatLog('error', message, meta));
    },
    warn(message, meta = {}) {
        if (CURRENT_LEVEL >= LOG_LEVELS.warn) console.warn(formatLog('warn', message, meta));
    },
    info(message, meta = {}) {
        if (CURRENT_LEVEL >= LOG_LEVELS.info) console.log(formatLog('info', message, meta));
    },
    debug(message, meta = {}) {
        if (CURRENT_LEVEL >= LOG_LEVELS.debug) console.log(formatLog('debug', message, meta));
    }
};

module.exports = logger;
