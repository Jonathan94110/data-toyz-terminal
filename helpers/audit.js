const db = require('../db.js');
const log = require('../logger.js');

// --- S-10: Audit Logging Helper --- //
async function auditLog(action, actor, target, details, ip) {
    try {
        await db.query(
            "INSERT INTO AuditLog (action, actor, target, details, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
            [action, actor || null, target || null, details || null, ip || null, new Date().toISOString()]
        );
    } catch (e) {
        log.error('Audit log write failed', { error: e.message });
    }
}

module.exports = { auditLog };
