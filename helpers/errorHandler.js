const log = require('../logger.js');

/**
 * Standardized API error response with reference ID for support correlation.
 * Logs the full error context (method, path, userId, error) and sends a
 * consistent JSON error to the client including the refId they can quote.
 *
 * Usage in routes:
 *   const { apiError } = require('../helpers/errorHandler');
 *   ...
 *   } catch (err) {
 *       apiError(res, req, 'Login error', err);
 *   }
 */
function apiError(res, req, context, err, statusCode = 500) {
    const refId = req.requestId || 'unknown';
    log.error(context, {
        refId,
        method: req.method,
        path: req.originalUrl,
        userId: req.user?.id || null,
        error: err.message || err
    });
    if (!res.headersSent) {
        res.status(statusCode).json({
            error: 'An internal error occurred.',
            refId
        });
    }
}

module.exports = { apiError };
