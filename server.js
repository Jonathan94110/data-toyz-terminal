require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const db = require('./db.js');

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// --- JWT HELPERS --- //
function generateToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role || 'analyst' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await db.query("SELECT id, username, role, suspended FROM Users WHERE id = $1", [decoded.id]);
        if (!result.rows[0]) return res.status(401).json({ error: 'Account no longer exists.' });
        if (result.rows[0].suspended) return res.status(403).json({ error: 'Your account has been suspended.' });
        req.user = { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role || 'analyst' };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
}

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Postgres lowercases all column names. This remaps them back to camelCase for the frontend.
const COL_MAP = {
    classtie: 'classTie', imagepath: 'imagePath', postid: 'postId',
    targetid: 'targetId', targetname: 'targetName', targettier: 'targetTier',
    mtstotal: 'mtsTotal', approvalscore: 'approvalScore', jsondata: 'jsonData',
    password_hash: 'password_hash', created_at: 'created_at'
};
function normalizeRow(row) {
    if (!row) return row;
    const out = {};
    for (const key of Object.keys(row)) {
        out[COL_MAP[key] || key] = row[key];
    }
    return out;
}
function normalizeRows(rows) { return rows.map(normalizeRow); }

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

function buildNotificationEmail(recipientName, message, type) {
    const icons = { comment: '\uD83D\uDCAC', reaction: '\u2764\uFE0F', co_reviewer: '\uD83D\uDCCB', new_figure: '\uD83C\uDFAF', hq_updates: '\uD83D\uDCE1' };
    const icon = icons[type] || '\uD83D\uDD14';
    return `
        <div style="font-family: monospace; background: #0f1729; color: #e2e8f0; padding: 2rem; border-radius: 8px;">
            <h2 style="color: #f97316;">DATA TOYZ TERMINAL</h2>
            <p>Agent <strong>${recipientName}</strong>,</p>
            <p style="font-size: 1.1rem;">${icon} ${message}</p>
            <a href="${APP_URL}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ec4899); color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 1rem 0;">OPEN TERMINAL</a>
            <p style="color: #94a3b8; font-size: 0.85rem;">You can manage your notification preferences in Profile Settings.</p>
        </div>
    `;
}

async function createNotification(recipient, type, message, linkType, linkId, sender) {
    if (recipient === sender) return;
    try {
        // Look up recipient's user id and email for preference check
        const userResult = await db.query("SELECT id, email FROM Users WHERE username = $1", [recipient]);
        if (!userResult.rows[0]) return;

        const recipientUser = userResult.rows[0];
        const prefs = await getNotificationPrefs(recipientUser.id);
        const inappKey = `${type}_inapp`;
        const emailKey = `${type}_email`;

        // Check in-app preference (default true if pref not found)
        const sendInapp = !prefs || prefs[inappKey] !== false;
        const sendEmail = prefs && prefs[emailKey] === true;

        if (sendInapp) {
            await db.query(
                `INSERT INTO Notifications (recipient, type, message, link_type, link_id, sender, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [recipient, type, message, linkType, linkId, sender, new Date().toISOString()]
            );
        }

        if (sendEmail && resend && recipientUser.email) {
            try {
                await resend.emails.send({
                    from: 'Data Toyz Terminal <onboarding@resend.dev>',
                    to: [recipientUser.email],
                    subject: `Notification — Data Toyz Terminal`,
                    html: buildNotificationEmail(recipient, message, type)
                });
            } catch (emailErr) {
                console.error("Failed to send notification email:", emailErr.message);
            }
        }
    } catch (e) {
        console.error("Failed to create notification:", e);
    }
}

// --- AUTHENTICATION API --- //

// Register a new operative
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const q = "INSERT INTO Users (username, email, password_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING id";
        const result = await db.query(q, [username, email, hash, new Date().toISOString()]);
        const newUser = { id: result.rows[0].id, username, email, role: 'analyst' };
        const token = generateToken(newUser);
        res.status(201).json({ ...newUser, token });
    } catch (e) {
        if (e.message && e.message.includes("unique constraint")) {
            if (e.message.includes("username")) return res.status(409).json({ error: "Username already active." });
            if (e.message.includes("email")) return res.status(409).json({ error: "Email already active." });
        }
        res.status(500).json({ error: e.message });
    }
});

// Authenticate operative
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials." });

    try {
        const result = await db.query("SELECT * FROM Users WHERE username = $1", [username]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: "Invalid Operative ID or Passcode." });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: "Invalid Operative ID or Passcode." });

        if (user.suspended) return res.status(403).json({ error: "Your account has been suspended. Contact an administrator." });

        const userData = { id: user.id, username: user.username, email: user.email, avatar: user.avatar, role: user.role || 'analyst' };
        const token = generateToken(userData);
        res.json({ ...userData, token });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get current user from token
app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, username, email, avatar, role FROM Users WHERE id = $1",
            [req.user.id]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Change password (logged-in users)
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Current password and new password are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

    try {
        const result = await db.query("SELECT password_hash FROM Users WHERE id = $1", [req.user.id]);
        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });

        const match = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!match) return res.status(401).json({ error: 'Current passcode is incorrect.' });

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE Users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);
        res.json({ message: 'Passcode successfully updated.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Forgot password — send reset email
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const result = await db.query("SELECT id, username, email FROM Users WHERE email = $1", [email]);
        // Always return success to prevent email enumeration
        if (!result.rows[0]) return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });

        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

        await db.query("UPDATE Users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
            [resetToken, expires, user.id]);

        const resetUrl = `${APP_URL}?reset=${resetToken}`;

        if (!resend) {
            console.log(`[DEV] Password reset link for ${user.username}: ${resetUrl}`);
            return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
        }

        await resend.emails.send({
            from: 'Data Toyz Terminal <onboarding@resend.dev>',
            to: [user.email],
            subject: '🔐 Passcode Reset — Data Toyz Terminal',
            html: `
                <div style="font-family: monospace; background: #0f1729; color: #e2e8f0; padding: 2rem; border-radius: 8px;">
                    <h2 style="color: #f97316;">DATA TOYZ TERMINAL</h2>
                    <p>Agent <strong>${user.username}</strong>,</p>
                    <p>A passcode reset was requested for your operative account. Click below to set a new passcode:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ec4899); color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 1rem 0;">RESET PASSCODE</a>
                    <p style="color: #94a3b8; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request this, ignore this message.</p>
                </div>
            `
        });

        res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    } catch (e) {
        console.error('Forgot password error:', e);
        res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }
});

// Reset password with token (from email link)
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    try {
        const result = await db.query("SELECT id, reset_token_expires FROM Users WHERE reset_token = $1", [token]);
        if (!result.rows[0]) return res.status(400).json({ error: 'Invalid or expired reset link.' });

        const expires = new Date(result.rows[0].reset_token_expires);
        if (expires < new Date()) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE Users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
            [hash, result.rows[0].id]);

        res.json({ message: 'Passcode successfully reset. You may now log in.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update operative profile credentials
app.put('/api/users/:id', requireAuth, upload.single('avatar'), async (req, res) => {
    if (parseInt(req.params.id) !== req.user.id) {
        return res.status(403).json({ error: 'You can only update your own profile.' });
    }
    const { username, email, oldUsername } = req.body;

    try {
        let updateQuery = "UPDATE Users SET username = $1, email = $2 ";
        let params = [username, email];
        let paramIndex = 3;

        if (req.file) {
            updateQuery += `, avatar = $${paramIndex} `;
            const base64Image = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
            params.push(base64Image);
            paramIndex++;
        }
        updateQuery += `WHERE id = $${paramIndex}`;
        params.push(req.params.id);

        await db.query(updateQuery, params);

        if (oldUsername && oldUsername !== username) {
            await db.query("UPDATE Submissions SET author = $1 WHERE author = $2", [username, oldUsername]);
        }

        const updatedUserResult = await db.query("SELECT id, username, email, avatar, role FROM Users WHERE id = $1", [req.params.id]);
        const updatedUser = updatedUserResult.rows[0];
        const token = generateToken({ id: updatedUser.id, username: updatedUser.username, role: updatedUser.role || 'analyst' });
        res.json({ ...updatedUser, token, message: "Profile successfully encrypted and updated." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- COMMS FEED API --- //

// Fetch timeline broadcasts, replies, and reactions
app.get('/api/posts', async (req, res) => {
    try {
        const postsRes = await db.query("SELECT * FROM Posts ORDER BY id DESC");
        const commentsRes = await db.query("SELECT * FROM Comments ORDER BY id ASC");
        const reactionsRes = await db.query("SELECT * FROM Reactions");

        const posts = normalizeRows(postsRes.rows);
        const comments = normalizeRows(commentsRes.rows);
        const reactions = normalizeRows(reactionsRes.rows);

        posts.forEach(p => {
            p.comments = comments.filter(c => c.postId === p.id);
            p.reactions = reactions.filter(r => r.postId === p.id);
        });

        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a new threaded reply to a broadcast
app.post('/api/posts/:postId/comments', requireAuth, async (req, res) => {
    const author = req.user.username;
    const { content } = req.body;
    const { postId } = req.params;

    if (!content) return res.status(400).json({ error: "Missing reply content." });

    try {
        const result = await db.query("INSERT INTO Comments (postId, author, content, date) VALUES ($1, $2, $3, $4) RETURNING id",
            [postId, author, content, new Date().toISOString()]);

        // Notify post author
        const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
        if (post.rows[0]) {
            await createNotification(post.rows[0].author, 'comment', `${author} replied to your broadcast`, 'post', parseInt(postId), author);
        }

        res.status(201).json({ id: result.rows[0].id, message: "Reply transmitted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle a reaction on a broadcast
app.post('/api/posts/:postId/react', requireAuth, async (req, res) => {
    const author = req.user.username;
    const { emoji } = req.body;
    const { postId } = req.params;

    if (!emoji) return res.status(400).json({ error: "Missing emoji field" });

    try {
        const result = await db.query("SELECT * FROM Reactions WHERE postId = $1 AND author = $2", [postId, author]);
        const row = result.rows[0];

        if (row) {
            if (row.emoji === emoji) {
                await db.query("DELETE FROM Reactions WHERE id = $1", [row.id]);
                res.json({ action: 'removed' });
            } else {
                await db.query("UPDATE Reactions SET emoji = $1 WHERE id = $2", [emoji, row.id]);
                res.json({ action: 'updated' });
            }
        } else {
            await db.query("INSERT INTO Reactions (postId, author, emoji) VALUES ($1, $2, $3)", [postId, author, emoji]);

            // Notify post author
            const post = await db.query("SELECT author FROM Posts WHERE id = $1", [postId]);
            if (post.rows[0]) {
                await createNotification(post.rows[0].author, 'reaction', `${author} reacted ${emoji} to your broadcast`, 'post', parseInt(postId), author);
            }

            res.status(201).json({ action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Broadcast intel to timeline
app.post('/api/posts', requireAuth, upload.single('image'), async (req, res) => {
    const author = req.user.username;
    const { content, sentiment } = req.body;
    let imagePath = null;

    if (req.file) {
        imagePath = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    }

    if (!author || !content || !sentiment) {
        return res.status(400).json({ error: "Missing transmission fields." });
    }

    try {
        const result = await db.query("INSERT INTO Posts (author, content, imagePath, sentiment, date) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [author, content, imagePath, sentiment, new Date().toISOString()]);
        res.status(201).json({ id: result.rows[0].id, message: "Broadcast transmitted securely." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CORE API --- //

// 1. Get all figures
app.get('/api/figures', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Figures ORDER BY name ASC");
        res.json(normalizeRows(result.rows));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.5 Create new figure
app.post('/api/figures', requireAuth, async (req, res) => {
    const { name, brand, classTie, line } = req.body;
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: "Missing required figure fields." });
    }

    try {
        // Check for duplicate (case-insensitive)
        const existing = await db.query("SELECT id, name FROM Figures WHERE LOWER(name) = LOWER($1)", [name]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: `"${existing.rows[0].name}" already exists in the catalog. Search for it and submit your intel there!` });
        }

        const result = await db.query("INSERT INTO Figures (name, brand, classTie, line) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, brand, classTie, line]);

        // Notify all users who opted in for new figure notifications
        try {
            const allUsers = await db.query("SELECT u.username FROM Users u JOIN NotificationPrefs np ON u.id = np.user_id WHERE (np.new_figure_inapp = true OR np.new_figure_email = true) AND u.username != $1", [req.user.username]);
            for (const row of allUsers.rows) {
                await createNotification(row.username, 'new_figure', `${req.user.username} added "${name}" to the catalog`, 'figure', result.rows[0].id, req.user.username);
            }
        } catch (notifErr) { console.error("New figure notification error:", notifErr); }

        res.status(201).json({ id: result.rows[0].id, message: "Target added successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Get submissions across all users for a specific physical figure to formulate the pulse
app.get('/api/submissions/target/:targetId', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Submissions WHERE targetId = $1", [req.params.targetId]);
        const rows = normalizeRows(result.rows);
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get history log for specific operative
app.get('/api/submissions/user/:username', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Submissions WHERE author = $1 ORDER BY id DESC", [req.params.username]);
        const rows = normalizeRows(result.rows);
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.5. Get all submissions globally (for leaderboards)
app.get('/api/submissions', async (req, res) => {
    try {
        const result = await db.query("SELECT author FROM Submissions");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Submit intelligence
app.post('/api/submissions', requireAuth, upload.single('image'), async (req, res) => {
    let submissionData = {};
    if (typeof req.body.data === 'string') {
        try { submissionData = JSON.parse(req.body.data); } catch (e) { }
    } else if (req.body.data) {
        submissionData = req.body.data;
    }

    if (req.file) {
        submissionData.imagePath = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    }

    try {
        const result = await db.query(`INSERT INTO Submissions 
            (targetId, targetName, targetTier, author, mtsTotal, approvalScore, jsonData, date) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
                req.body.targetId, req.body.targetName, req.body.targetTier, req.user.username,
                parseFloat(req.body.mtsTotal), parseFloat(req.body.approvalScore), JSON.stringify(submissionData), req.body.date
            ]
        );
        // Notify co-reviewers
        const coReviewers = await db.query(
            "SELECT DISTINCT author FROM Submissions WHERE targetId = $1 AND author != $2",
            [req.body.targetId, req.user.username]
        );
        for (const row of coReviewers.rows) {
            await createNotification(row.author, 'co_reviewer', `${req.user.username} also reviewed ${req.body.targetName}`, 'figure', parseInt(req.body.targetId), req.user.username);
        }

        res.status(201).json({ id: result.rows[0].id, message: "Intelligence report successfully committed." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Retract intelligence
app.delete('/api/submissions/:id', requireAuth, async (req, res) => {
    try {
        const sub = await db.query("SELECT author FROM Submissions WHERE id = $1", [req.params.id]);
        if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found.' });
        if (sub.rows[0].author !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only retract your own intelligence.' });
        }
        await db.query("DELETE FROM Submissions WHERE id = $1", [req.params.id]);
        res.json({ message: "Intelligence retracted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MARKET STATS API --- //

// 6. Global Market Overview stats
app.get('/api/stats/overview', async (req, res) => {
    try {
        const totalIntel = await db.query("SELECT COUNT(*) as count FROM Submissions");
        const uniqueAnalysts = await db.query("SELECT COUNT(DISTINCT author) as count FROM Submissions");
        const avgGrade = await db.query("SELECT AVG((mtsTotal + approvalScore) / 2) as avg FROM Submissions");
        const topFigure = await db.query(`
            SELECT s.targetName, s.targetId, AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade, COUNT(*) as subs
            FROM Submissions s GROUP BY s.targetName, s.targetId 
            ORDER BY avgGrade DESC LIMIT 1
        `);
        const totalTargets = await db.query("SELECT COUNT(*) as count FROM Figures");

        res.json({
            totalIntel: parseInt(totalIntel.rows[0].count),
            uniqueAnalysts: parseInt(uniqueAnalysts.rows[0].count),
            avgGrade: avgGrade.rows[0].avg ? parseFloat(avgGrade.rows[0].avg).toFixed(1) : '0.0',
            totalTargets: parseInt(totalTargets.rows[0].count),
            topFigure: topFigure.rows[0] ? {
                name: topFigure.rows[0].targetname,
                id: topFigure.rows[0].targetid,
                grade: parseFloat(topFigure.rows[0].avggrade).toFixed(1),
                subs: parseInt(topFigure.rows[0].subs)
            } : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Brand/Line Index aggregates
app.get('/api/stats/indexes', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.brand, f.line, 
                   COUNT(s.id) as submissions,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade,
                   COUNT(DISTINCT s.targetId) as targets
            FROM Figures f
            LEFT JOIN Submissions s ON f.id = s.targetId
            GROUP BY f.brand, f.line
            ORDER BY f.brand ASC, f.line ASC
        `);

        const indexes = result.rows.map(r => ({
            brand: r.brand,
            line: r.line,
            submissions: parseInt(r.submissions) || 0,
            avgGrade: r.avggrade ? parseFloat(r.avggrade).toFixed(1) : null,
            targets: parseInt(r.targets) || 0
        }));

        res.json(indexes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Intel Headlines (auto-generated from recent activity)
app.get('/api/stats/headlines', async (req, res) => {
    try {
        const recent = await db.query(`
            SELECT s.targetName, s.author, s.date, s.mtsTotal, s.approvalScore, s.jsonData,
                   f.brand, f.classTie
            FROM Submissions s
            LEFT JOIN Figures f ON f.id = s.targetId
            ORDER BY s.id DESC LIMIT 10
        `);

        const headlines = recent.rows.map(r => {
            const row = normalizeRow(r);
            const grade = ((parseFloat(row.mtsTotal) + parseFloat(row.approvalScore)) / 2).toFixed(1);
            let data = {};
            try { data = JSON.parse(row.jsonData); } catch (e) { }

            let headline = `${row.author} assessed ${row.targetName}`;
            if (parseFloat(grade) >= 80) headline = `🔥 ${row.targetName} scored an elite ${grade} grade from ${row.author}`;
            else if (parseFloat(grade) >= 60) headline = `📊 ${row.author} gave ${row.targetName} a solid ${grade} rating`;
            else if (parseFloat(grade) < 40) headline = `⚠️ ${row.author} flagged ${row.targetName} with a low ${grade} grade`;
            else headline = `📋 ${row.author} submitted intel on ${row.targetName} (Grade: ${grade})`;

            return {
                headline,
                author: row.author,
                target: row.targetName,
                brand: row.brand || 'Unknown',
                classTie: row.classTie || 'Unknown',
                grade: parseFloat(grade),
                date: row.date,
                tradeRating: data.tradeRating || null
            };
        });

        res.json(headlines);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TOP RATED FIGURES API --- //

app.get('/api/figures/top-rated', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT s.targetId, s.targetName, f.brand, f.classTie, f.line,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade,
                   COUNT(*) as submissions
            FROM Submissions s
            LEFT JOIN Figures f ON f.id = s.targetId
            GROUP BY s.targetId, s.targetName, f.brand, f.classTie, f.line
            ORDER BY avgGrade DESC
            LIMIT 10
        `);
        res.json(result.rows.map(r => ({
            id: r.targetid,
            name: r.targetname,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            avgGrade: parseFloat(r.avggrade).toFixed(1),
            submissions: parseInt(r.submissions)
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- RANKED FIGURES API --- //

app.get('/api/figures/ranked', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.id, f.name, f.brand, f.classTie, f.line,
                   COUNT(s.id) as submissions,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade
            FROM Figures f
            LEFT JOIN Submissions s ON f.id = s.targetId
            GROUP BY f.id, f.name, f.brand, f.classTie, f.line
            ORDER BY f.name ASC
        `);
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            submissions: parseInt(r.submissions) || 0,
            avgGrade: r.avggrade ? parseFloat(r.avggrade).toFixed(1) : null
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USER PROFILE API --- //

app.get('/api/users/:username/profile', async (req, res) => {
    try {
        const userRes = await db.query(
            "SELECT id, username, avatar, role, created_at FROM Users WHERE username = $1",
            [req.params.username]
        );
        if (!userRes.rows[0]) return res.status(404).json({ error: "User not found." });
        const user = normalizeRow(userRes.rows[0]);

        const subsRes = await db.query(
            "SELECT * FROM Submissions WHERE author = $1 ORDER BY id DESC LIMIT 20",
            [req.params.username]
        );
        const submissions = normalizeRows(subsRes.rows);
        submissions.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });

        const countRes = await db.query(
            "SELECT COUNT(*) as count FROM Submissions WHERE author = $1",
            [req.params.username]
        );
        const totalSubs = parseInt(countRes.rows[0].count);

        let title = 'Rookie Analyst';
        if (totalSubs >= 15) title = 'Prime Intel Officer';
        else if (totalSubs >= 10) title = 'Senior Field Evaluator';
        else if (totalSubs >= 5) title = 'Field Evaluator';
        else if (totalSubs >= 2) title = 'Junior Analyst';

        res.json({
            username: user.username,
            avatar: user.avatar,
            role: user.role || 'analyst',
            joinDate: user.created_at,
            submissionCount: totalSubs,
            title,
            recentSubmissions: submissions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- NOTIFICATIONS API --- //

// Preferences must be defined before :username routes to avoid routing conflicts
app.get('/api/notifications/preferences', requireAuth, async (req, res) => {
    try {
        const prefs = await getNotificationPrefs(req.user.id);
        if (!prefs) return res.status(500).json({ error: 'Failed to load preferences.' });
        res.json(prefs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/preferences', requireAuth, async (req, res) => {
    const fields = [
        'comment_inapp', 'comment_email',
        'reaction_inapp', 'reaction_email',
        'co_reviewer_inapp', 'co_reviewer_email',
        'new_figure_inapp', 'new_figure_email',
        'hq_updates_inapp', 'hq_updates_email'
    ];

    try {
        await db.query("INSERT INTO NotificationPrefs (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [req.user.id]);

        const setClauses = [];
        const params = [];
        let paramIdx = 1;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                setClauses.push(`${field} = $${paramIdx}`);
                params.push(req.body[field] === true || req.body[field] === 'true');
                paramIdx++;
            }
        }

        if (setClauses.length === 0) return res.status(400).json({ error: 'No preferences to update.' });

        params.push(req.user.id);
        await db.query(`UPDATE NotificationPrefs SET ${setClauses.join(', ')} WHERE user_id = $${paramIdx}`, params);

        const updated = await db.query("SELECT * FROM NotificationPrefs WHERE user_id = $1", [req.user.id]);
        res.json(updated.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notifications/:username', requireAuth, async (req, res) => {
    if (req.params.username !== req.user.username) return res.status(403).json({ error: 'Access denied.' });
    try {
        const result = await db.query(
            "SELECT * FROM Notifications WHERE recipient = $1 ORDER BY id DESC LIMIT 50",
            [req.params.username]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notifications/:username/count', requireAuth, async (req, res) => {
    if (req.params.username !== req.user.username) return res.status(403).json({ error: 'Access denied.' });
    try {
        const result = await db.query(
            "SELECT COUNT(*) as count FROM Notifications WHERE recipient = $1 AND read = false",
            [req.params.username]
        );
        res.json({ unread: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        await db.query("UPDATE Notifications SET read = true WHERE id = $1 AND recipient = $2", [req.params.id, req.user.username]);
        res.json({ message: "Notification marked as read." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
        await db.query("UPDATE Notifications SET read = true WHERE recipient = $1", [req.user.username]);
        res.json({ message: "All notifications marked as read." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN API --- //

// Admin middleware: verify user is admin (must chain after requireAuth)
function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Insufficient clearance level.' });
    next();
}

// Admin: Reset user password
app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    try {
        const user = await db.query("SELECT username FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: 'User not found.' });
        if (user.rows[0].username === 'Prime Dynamixx' && req.user.username !== 'Prime Dynamixx') {
            return res.status(403).json({ error: 'Cannot reset primary admin password.' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE Users SET password_hash = $1 WHERE id = $2", [hash, req.params.id]);
        res.json({ message: 'Password reset successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 9. Admin: Get all users
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT id, username, email, created_at, avatar, role, suspended FROM Users ORDER BY id ASC");
        res.json(normalizeRows(result.rows));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9.1 Admin: Create User
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Missing required fields." });

    try {
        const hash = await bcrypt.hash(password, 10);
        const q = "INSERT INTO Users (username, email, password_hash, created_at, role) VALUES ($1, $2, $3, $4, $5) RETURNING id";
        await db.query(q, [username, email, hash, new Date().toISOString(), role || 'analyst']);
        res.status(201).json({ message: "User account created successfully." });
    } catch (e) {
        if (e.message && e.message.includes("unique constraint")) {
            if (e.message.includes("username")) return res.status(409).json({ error: "Username already active." });
            if (e.message.includes("email")) return res.status(409).json({ error: "Email already active." });
        }
        res.status(500).json({ error: e.message });
    }
});

// 9.2 Admin: Toggle User Role
app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, role FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === 'Prime Dynamixx') return res.status(403).json({ error: "Cannot modify the primary admin's role." });

        const newRole = user.rows[0].role === 'admin' ? 'analyst' : 'admin';
        await db.query("UPDATE Users SET role = $1 WHERE id = $2", [newRole, req.params.id]);
        res.json({ message: `User role changed to ${newRole.toUpperCase()}.`, role: newRole });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Admin: Suspend/unsuspend user
app.put('/api/admin/users/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username, suspended FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === 'Prime Dynamixx') return res.status(403).json({ error: "Cannot suspend the primary admin." });

        const newStatus = !user.rows[0].suspended;
        await db.query("UPDATE Users SET suspended = $1 WHERE id = $2", [newStatus, req.params.id]);
        res.json({ message: `User ${newStatus ? 'suspended' : 'reinstated'} successfully.`, suspended: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Admin: Delete user
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.query("SELECT username FROM Users WHERE id = $1", [req.params.id]);
        if (!user.rows[0]) return res.status(404).json({ error: "User not found." });
        if (user.rows[0].username === 'Prime Dynamixx') return res.status(403).json({ error: "Cannot delete the primary admin." });

        await db.query("DELETE FROM Users WHERE id = $1", [req.params.id]);
        res.json({ message: "User purged from the system." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Admin: Delete figure
app.delete('/api/admin/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM Submissions WHERE targetId = $1", [req.params.id]);
        await db.query("DELETE FROM Figures WHERE id = $1", [req.params.id]);
        res.json({ message: "Target and all associated intel purged." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. Admin: Edit figure
app.put('/api/admin/figures/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, brand, classTie, line } = req.body;
    try {
        await db.query("UPDATE Figures SET name = $1, brand = $2, classTie = $3, line = $4 WHERE id = $5",
            [name, brand, classTie, line, req.params.id]);
        res.json({ message: "Target updated successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 14. Admin: Site analytics
app.get('/api/admin/analytics', requireAuth, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await db.query("SELECT COUNT(*) as count FROM Users");
        const totalFigures = await db.query("SELECT COUNT(*) as count FROM Figures");
        const totalSubmissions = await db.query("SELECT COUNT(*) as count FROM Submissions");
        const totalPosts = await db.query("SELECT COUNT(*) as count FROM Posts");
        const recentUsers = await db.query("SELECT username, created_at FROM Users ORDER BY id DESC LIMIT 5");
        const activeAnalysts = await db.query("SELECT author, COUNT(*) as subs FROM Submissions GROUP BY author ORDER BY subs DESC LIMIT 5");

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalFigures: parseInt(totalFigures.rows[0].count),
            totalSubmissions: parseInt(totalSubmissions.rows[0].count),
            totalPosts: parseInt(totalPosts.rows[0].count),
            recentUsers: recentUsers.rows,
            topAnalysts: activeAnalysts.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Data Toyz Terminal Server active on port ${PORT}`);
    });
}
module.exports = app;
