// helpers/price-alert-checker.js — Check and fire price alerts when market data changes
const db = require('../db.js');
const log = require('../logger.js');
const { createNotification } = require('./notifications');

async function checkAlertsForFigure(figureId, newPrice) {
    if (!newPrice || newPrice <= 0) return;
    try {
        // Find enabled, untriggered alerts for this figure
        const alerts = await db.query(
            `SELECT pa.id, pa.user_id, pa.alert_type, pa.target_price, u.username
             FROM PriceAlerts pa
             JOIN Users u ON u.id = pa.user_id
             WHERE pa.figure_id = $1 AND pa.enabled = true AND pa.triggered = false`,
            [figureId]
        );
        if (!alerts.rows.length) return;

        // Get figure name for notification message
        const figRes = await db.query("SELECT name FROM Figures WHERE id = $1", [figureId]);
        const figureName = figRes.rows[0]?.name || `Figure #${figureId}`;

        for (const alert of alerts.rows) {
            const price = parseFloat(alert.target_price);
            const shouldFire =
                (alert.alert_type === 'below' && newPrice <= price) ||
                (alert.alert_type === 'above' && newPrice >= price);

            if (shouldFire) {
                // Mark as triggered (fire-once)
                await db.query(
                    "UPDATE PriceAlerts SET triggered = true, triggered_at = $1 WHERE id = $2",
                    [new Date().toISOString(), alert.id]
                );

                const direction = alert.alert_type === 'below' ? 'dropped to' : 'reached';
                const message = `${figureName} has ${direction} $${newPrice.toFixed(2)} (your alert: $${price.toFixed(2)})`;

                await createNotification(
                    alert.username, 'price_alert', message, 'figure', figureId, 'system'
                );
                log.info('Price alert fired', { alertId: alert.id, figureId, userId: alert.user_id, newPrice });
            }
        }
    } catch (e) {
        log.error('Price alert check failed', { figureId, error: e.message });
    }
}

module.exports = { checkAlertsForFigure };
