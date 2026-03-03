const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db.js');
const log = require('../logger.js');
const { resend, RESEND_FROM_EMAIL, APP_URL } = require('../helpers/config');
const { validatePassword, escapeHTML } = require('../helpers/validation');
const { auditLog } = require('../helpers/audit');
const { generateToken } = require('../helpers/token');
const { requireAuth, requireAuthRenew, invalidateUserCache } = require('../middleware/auth');
const { authAttemptLimiter } = require('../middleware/rateLimiters');
// Register a new operative
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    if (username.length > 50) return res.status(400).json({ error: "Username must be 50 characters or fewer." });
    if (email.length > 254) return res.status(400).json({ error: "Email must be 254 characters or fewer." });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const hash = await bcrypt.hash(password, 10);
        const q = "INSERT INTO Users (username, email, password_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING id";
        const result = await db.query(q, [username, email, hash, new Date().toISOString()]);
        const newUser = { id: result.rows[0].id, username, email, role: 'analyst' };
        const token = generateToken(newUser);

        await auditLog('USER_REGISTER', username, username, 'New user registration', req.ip);

        res.status(201).json({ ...newUser, token });
    } catch (e) {
        if (e.message && e.message.includes("unique constraint")) {
            if (e.message.includes("username")) return res.status(409).json({ error: "Username already active." });
            if (e.message.includes("email")) return res.status(409).json({ error: "Email already active." });
        }
        log.error('Register error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Authenticate operative
router.post('/login', authAttemptLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials." });

    try {
        const result = await db.query("SELECT * FROM Users WHERE username = $1", [username]);
        const user = result.rows[0];
        if (!user) {
            await auditLog('LOGIN_FAILURE', username, username, 'Invalid username', req.ip);
            return res.status(401).json({ error: "Invalid credentials." });
        }
        if (user.suspended) return res.status(403).json({ error: 'Your account has been suspended.' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            await auditLog('LOGIN_FAILURE', username, username, 'Invalid password', req.ip);
            return res.status(401).json({ error: "Invalid credentials." });
        }
        const userData = { id: user.id, username: user.username, email: user.email, avatar: user.avatar, role: user.role || 'analyst' };
        const token = generateToken(userData);

        await auditLog('LOGIN_SUCCESS', username, username, 'Successful login', req.ip);

        res.json({ ...userData, token });
    } catch (e) {
        log.error('Login error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Get current user (+ silent token renewal — extends session on every app load)
// Uses requireAuthRenew: accepts expired tokens so users are never kicked to login
router.get('/me', requireAuthRenew, async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, username, email, avatar, role FROM Users WHERE id = $1",
            [req.user.id]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });

        const user = result.rows[0];
        // Token rotation: issue a fresh 24h token on every successful /me call
        // so the session extends as long as the user opens the app within 24h
        const freshToken = generateToken(user);
        res.json({ ...user, token: freshToken });
    } catch (e) {
        log.error('Get current user error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: "Old and new passwords are required." });

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const result = await db.query("SELECT password_hash FROM Users WHERE id = $1", [req.user.id]);
        const match = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!match) return res.status(401).json({ error: "Current password is incorrect." });

        const hash = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();
        await db.query("UPDATE Users SET password_hash = $1, password_changed_at = $2 WHERE id = $3",
            [hash, now, req.user.id]);
        invalidateUserCache(req.user.id);

        await auditLog('PASSWORD_CHANGE', req.user.username, req.user.username, 'User changed their password', req.ip);

        res.json({ message: "Passcode successfully updated." });
    } catch (e) {
        log.error('Change password error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Forgot password — send reset email
router.post('/forgot-password', authAttemptLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const result = await db.query("SELECT id, username, email FROM Users WHERE email = $1", [email]);
        if (!result.rows[0]) return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });

        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expires = new Date(Date.now() + 3600000).toISOString();

        await db.query("UPDATE Users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
            [hashedToken, expires, user.id]);

        const resetUrl = `${APP_URL}?reset=${resetToken}`;

        if (!resend) {
            log.debug('Password reset link generated', { username: user.username, resetUrl });
            return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
        }

        await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: [user.email],
            subject: '🔐 Passcode Reset — Data Toyz Terminal',
            html: `
                <div style="font-family: monospace; background: #0f1729; color: #e2e8f0; padding: 2rem; border-radius: 8px;">
                    <h2 style="color: #f97316;">DATA TOYZ TERMINAL</h2>
                    <p>Agent <strong>${escapeHTML(user.username)}</strong>,</p>
                    <p>A passcode reset was requested for your operative account. Click below to set a new passcode:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ec4899); color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 1rem 0;">RESET PASSCODE</a>
                    <p style="color: #94a3b8; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request this, ignore this message.</p>
                </div>
            `
        });

        res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    } catch (e) {
        log.error('Forgot password error', { error: e.message || e });
        res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }
});

// Reset password with token
router.post('/reset-password', authAttemptLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const result = await db.query("SELECT id, reset_token_expires FROM Users WHERE reset_token = $1", [hashedToken]);
        if (!result.rows[0]) return res.status(400).json({ error: 'Invalid or expired reset link.' });

        const expires = new Date(result.rows[0].reset_token_expires);
        if (expires < new Date()) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

        const hash = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();
        await db.query("UPDATE Users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, password_changed_at = $2 WHERE id = $3",
            [hash, now, result.rows[0].id]);
        invalidateUserCache(result.rows[0].id);

        await auditLog('PASSWORD_RESET', null, `user_id:${result.rows[0].id}`, 'Password reset via email token', req.ip);

        res.json({ message: 'Passcode successfully reset. You may now log in.' });
    } catch (e) {
        log.error('Reset password error', { error: e.message || e });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
