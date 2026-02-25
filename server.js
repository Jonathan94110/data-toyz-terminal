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
        res.status(201).json({ id: result.rows[0].id, username, email, role: 'analyst' });
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

        res.json({ id: user.id, username: user.username, email: user.email, avatar: user.avatar, role: 'analyst' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reset Operative Passcode (2FA Verification)
app.post('/api/auth/reset', async (req, res) => {
    const { username, email, newPassword } = req.body;
    if (!username || !email || !newPassword) return res.status(400).json({ error: "Missing required identity fields." });

    try {
        const result = await db.query("SELECT * FROM Users WHERE username = $1 AND email = $2", [username, email]);
        const user = result.rows[0];

        if (!user) {
            const hash = await bcrypt.hash(newPassword, 10);
            await db.query("INSERT INTO Users (username, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
                [username, email, hash, new Date().toISOString()]);
            return res.json({ message: "Identity successfully provisioned and verified! You may now log in." });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE Users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
        res.json({ message: "Passcode successfully overwritten. You may now log in." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update operative profile credentials
app.put('/api/users/:id', upload.single('avatar'), async (req, res) => {
    const { username, email, password, oldUsername } = req.body;

    try {
        let updateQuery = "UPDATE Users SET username = $1, email = $2 ";
        let params = [username, email];
        let paramIndex = 3;

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            updateQuery += `, password_hash = $${paramIndex} `;
            params.push(hash);
            paramIndex++;
        }
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

        const updatedUserResult = await db.query("SELECT id, username, email, avatar FROM Users WHERE id = $1", [req.params.id]);
        res.json({ ...updatedUserResult.rows[0], role: 'analyst', message: "Profile successfully encrypted and updated." });
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
app.post('/api/posts/:postId/comments', async (req, res) => {
    const { author, content } = req.body;
    const { postId } = req.params;

    if (!author || !content) return res.status(400).json({ error: "Missing reply fields." });

    try {
        const result = await db.query("INSERT INTO Comments (postId, author, content, date) VALUES ($1, $2, $3, $4) RETURNING id",
            [postId, author, content, new Date().toISOString()]);
        res.status(201).json({ id: result.rows[0].id, message: "Reply transmitted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle a reaction on a broadcast
app.post('/api/posts/:postId/react', async (req, res) => {
    const { author, emoji } = req.body;
    const { postId } = req.params;

    if (!author || !emoji) return res.status(400).json({ error: "Missing fields" });

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
            res.status(201).json({ action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Broadcast intel to timeline
app.post('/api/posts', upload.single('image'), async (req, res) => {
    const { author, content, sentiment } = req.body;
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
app.post('/api/figures', async (req, res) => {
    const { name, brand, classTie, line } = req.body;
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: "Missing required figure fields." });
    }

    try {
        const result = await db.query("INSERT INTO Figures (name, brand, classTie, line) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, brand, classTie, line]);
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
app.post('/api/submissions', upload.single('image'), async (req, res) => {
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
                req.body.targetId, req.body.targetName, req.body.targetTier, req.body.author,
                parseFloat(req.body.mtsTotal), parseFloat(req.body.approvalScore), JSON.stringify(submissionData), req.body.date
            ]
        );
        res.status(201).json({ id: result.rows[0].id, message: "Intelligence report successfully committed." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Retract intelligence
app.delete('/api/submissions/:id', async (req, res) => {
    try {
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

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Data Toyz Terminal Server active on port ${PORT}`);
    });
}
module.exports = app;
