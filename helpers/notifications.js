const db = require('../db.js');
const log = require('../logger.js');
const { resend, RESEND_FROM_EMAIL, APP_URL, emailThrottle, EMAIL_COOLDOWN_MS } = require('./config');
const { escapeHTML } = require('./validation');

// --- NOTIFICATION HELPER --- //
async function getNotificationPrefs(userId) {
    try {
        const result = await db.query("SELECT * FROM NotificationPrefs WHERE user_id = $1", [userId]);
        if (result.rows[0]) return result.rows[0];
        // Create defaults if none exist
        await db.query("INSERT INTO NotificationPrefs (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
        const fresh = await db.query("SELECT * FROM NotificationPrefs WHERE user_id = $1", [userId]);
        return fresh.rows[0];
    } catch (e) {
        return null; // Fall back to sending everything
    }
}

function buildNotificationEmail(recipientName, message, type, linkType, linkId) {
    const icons = { comment: '💬', reaction: '❤️', co_reviewer: '📋', new_figure: '🎯', hq_updates: '📡', message: '🔒', follow: '👥', mention: '📢', flag: '🚩', assessment_request: '📊', pending_brand: '🏷️' };
    const icon = icons[type] || '🔔';
    // Build direct link based on notification context
    let actionUrl = APP_URL;
    let actionLabel = 'OPEN TERMINAL';
    if (linkType === 'post' && linkId) { actionUrl = APP_URL; actionLabel = 'VIEW POST'; }
    else if (linkType === 'figure' && linkId) { actionUrl = `${APP_URL}?figure=${linkId}`; actionLabel = 'VIEW TARGET'; }
    else if (linkType === 'room' && linkId) { actionUrl = APP_URL; actionLabel = 'OPEN ROOM'; }
    else if (linkType === 'admin') { actionUrl = APP_URL; actionLabel = 'OPEN ADMIN PANEL'; }
    return `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1729; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #ff2a5f, #ff8e3c); padding: 1.5rem 2rem;">
                <h2 style="color: #fff; margin: 0; font-size: 1.25rem; letter-spacing: 0.05em;">DATA TOYZ TERMINAL</h2>
            </div>
            <div style="padding: 2rem;">
                <p style="margin: 0 0 0.75rem;">Agent <strong style="color: #ff2a5f;">${escapeHTML(recipientName)}</strong>,</p>
                <p style="font-size: 1.1rem; margin: 0 0 1.5rem; line-height: 1.5;">${icon} ${escapeHTML(message)}</p>
                <a href="${actionUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #ff2a5f, #ff8e3c); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 0.95rem; letter-spacing: 0.03em;">${actionLabel}</a>
                <p style="color: #475569; font-size: 0.8rem; margin: 1.5rem 0 0; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem;">You can manage your notification preferences in Profile Settings.</p>
            </div>
        </div>
    `;
}

async function createNotification(recipient, type, message, linkType, linkId, sender) {
    if (recipient === sender) return false;
    try {
        // Look up recipient's user id and email for preference check
        const userResult = await db.query("SELECT id, email FROM Users WHERE username = $1", [recipient]);
        if (!userResult.rows[0]) return false;

        const recipientUser = userResult.rows[0];
        const prefs = await getNotificationPrefs(recipientUser.id);
        const inappKey = `${type}_inapp`;
        const emailKey = `${type}_email`;
        let delivered = false;

        // Check in-app preference (default true if pref not found)
        const sendInapp = !prefs || prefs[inappKey] !== false;
        const sendEmail = prefs && prefs[emailKey] === true;

        if (sendInapp) {
            await db.query(
                `INSERT INTO Notifications (recipient, type, message, link_type, link_id, sender, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [recipient, type, message, linkType, linkId, sender, new Date().toISOString()]
            );
            delivered = true;
        }

        if (sendEmail && resend && recipientUser.email) {
            // Throttle: skip if email was sent to this recipient within cooldown period
            const lastSent = emailThrottle.get(recipient);
            const now = Date.now();
            if (lastSent && (now - lastSent) < EMAIL_COOLDOWN_MS) {
                log.debug('Email throttled for recipient', { recipient, cooldownRemaining: EMAIL_COOLDOWN_MS - (now - lastSent) });
            } else {
                try {
                    await resend.emails.send({
                        from: RESEND_FROM_EMAIL,
                        to: [recipientUser.email],
                        subject: `${message.slice(0, 80)} — Data Toyz Terminal`,
                        html: buildNotificationEmail(recipient, message, type, linkType, linkId)
                    });
                    emailThrottle.set(recipient, now);
                    delivered = true;
                } catch (emailErr) {
                    log.error('Failed to send notification email', { error: emailErr.message });
                }
            }
        }
        return delivered;
    } catch (e) {
        log.error('Failed to create notification', { error: e.message || e });
        return false;
    }
}

module.exports = { getNotificationPrefs, buildNotificationEmail, createNotification };
