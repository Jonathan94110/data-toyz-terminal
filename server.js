const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const db = require('./db.js');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const bcrypt = require('bcrypt');

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTHENTICATION API --- //

// Register a new operative
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const stmt = db.prepare("INSERT INTO Users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
        stmt.run(username, email, hash, new Date().toISOString(), function (err) {
            if (err) {
                if (err.message.includes("UNIQUE constraint failed: Users.username")) return res.status(409).json({ error: "Username already active." });
                if (err.message.includes("UNIQUE constraint failed: Users.email")) return res.status(409).json({ error: "Email already active." });
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, username, email, role: 'analyst' });
        });
        stmt.finalize();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Authenticate operative
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials." });

    db.get("SELECT * FROM Users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid Operative ID or Passcode." });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: "Invalid Operative ID or Passcode." });

        res.json({ id: user.id, username: user.username, email: user.email, avatar: user.avatar, role: 'analyst' });
    });
});

// Reset Operative Passcode (2FA Verification)
app.post('/api/auth/reset', (req, res) => {
    const { username, email, newPassword } = req.body;
    if (!username || !email || !newPassword) return res.status(400).json({ error: "Missing required identity fields." });

    db.get("SELECT * FROM Users WHERE username = ? AND email = ?", [username, email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        // Operative doesn't exist? Automatically register them!
        if (!user) {
            try {
                const hash = await bcrypt.hash(newPassword, 10);
                const stmt = db.prepare("INSERT INTO Users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
                stmt.run(username, email, hash, new Date().toISOString(), function (errInsert) {
                    if (errInsert) return res.status(500).json({ error: errInsert.message });
                    res.json({ message: "Identity successfully provisioned and verified! You may now log in." });
                });
                stmt.finalize();
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
            return;
        }

        // Operative exists, overwrite their password
        try {
            const hash = await bcrypt.hash(newPassword, 10);
            db.run("UPDATE Users SET password_hash = ? WHERE id = ?", [hash, user.id], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ message: "Passcode successfully overwritten. You may now log in." });
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

// Update operative profile credentials
app.put('/api/users/:id', upload.single('avatar'), async (req, res) => {
    const { username, email, password, oldUsername } = req.body;
    let updateQuery = "UPDATE Users SET username = ?, email = ? ";
    let params = [username, email];

    try {
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            updateQuery += ", password_hash = ? ";
            params.push(hash);
        }
        if (req.file) {
            updateQuery += ", avatar = ? ";
            params.push('/uploads/' + req.file.filename);
        }
        updateQuery += "WHERE id = ?";
        params.push(req.params.id);

        db.serialize(() => {
            db.run(updateQuery, params, function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Cascade username changes
                if (oldUsername && oldUsername !== username) {
                    db.run("UPDATE Submissions SET author = ? WHERE author = ?", [username, oldUsername], (err2) => {
                        if (err2) console.error("Cascade failed", err2);
                    });
                }

                db.get("SELECT id, username, email, avatar FROM Users WHERE id = ?", [req.params.id], (err3, updatedUser) => {
                    if (err3) return res.status(500).json({ error: err3.message });
                    res.json({ ...updatedUser, role: 'analyst', message: "Profile successfully encrypted and updated." });
                });
            });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- COMMS FEED API --- //

// Fetch timeline broadcasts, replies, and reactions
app.get('/api/posts', (req, res) => {
    db.all("SELECT * FROM Posts ORDER BY id DESC", [], (err, posts) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all("SELECT * FROM Comments ORDER BY id ASC", [], (err, comments) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all("SELECT * FROM Reactions", [], (err, reactions) => {
                if (err) return res.status(500).json({ error: err.message });

                // Attach nested replies and reactions
                posts.forEach(p => {
                    p.comments = comments.filter(c => c.postId === p.id);
                    p.reactions = reactions.filter(r => r.postId === p.id);
                });
                res.json(posts);
            });
        });
    });
});

// Submit a new threaded reply to a broadcast
app.post('/api/posts/:postId/comments', (req, res) => {
    const { author, content } = req.body;
    const { postId } = req.params;

    if (!author || !content) return res.status(400).json({ error: "Missing reply fields." });

    const stmt = db.prepare("INSERT INTO Comments (postId, author, content, date) VALUES (?, ?, ?, ?)");
    stmt.run(postId, author, content, new Date().toISOString(), function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: "Reply transmitted." });
    });
    stmt.finalize();
});

// Toggle a reaction on a broadcast
app.post('/api/posts/:postId/react', (req, res) => {
    const { author, emoji } = req.body;
    const { postId } = req.params;

    if (!author || !emoji) return res.status(400).json({ error: "Missing fields" });

    db.get("SELECT * FROM Reactions WHERE postId = ? AND author = ?", [postId, author], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            if (row.emoji === emoji) {
                // Same emoji clicked, toggle off (delete)
                db.run("DELETE FROM Reactions WHERE id = ?", [row.id], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ action: 'removed' });
                });
            } else {
                // Different emoji clicked, toggle to new one (update)
                db.run("UPDATE Reactions SET emoji = ? WHERE id = ?", [emoji, row.id], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ action: 'updated' });
                });
            }
        } else {
            // No reaction yet, insert new
            const stmt = db.prepare("INSERT INTO Reactions (postId, author, emoji) VALUES (?, ?, ?)");
            stmt.run(postId, author, emoji, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ action: 'added' });
            });
            stmt.finalize();
        }
    });
});

// Broadcast intel to timeline
app.post('/api/posts', upload.single('image'), (req, res) => {
    const { author, content, sentiment } = req.body;
    let imagePath = null;

    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }

    if (!author || !content || !sentiment) {
        return res.status(400).json({ error: "Missing transmission fields." });
    }

    const stmt = db.prepare("INSERT INTO Posts (author, content, imagePath, sentiment, date) VALUES (?, ?, ?, ?, ?)");
    stmt.run(author, content, imagePath, sentiment, new Date().toISOString(), function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: "Broadcast transmitted securely." });
    });
    stmt.finalize();
});

// --- CORE API --- //

// 1. Get all figures
app.get('/api/figures', (req, res) => {
    db.all("SELECT * FROM Figures", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 1.5 Create new figure
app.post('/api/figures', (req, res) => {
    const { name, brand, classTie, line } = req.body;
    if (!name || !brand || !classTie || !line) {
        return res.status(400).json({ error: "Missing required figure fields." });
    }

    const stmt = db.prepare("INSERT INTO Figures (name, brand, classTie, line) VALUES (?, ?, ?, ?)");
    stmt.run(name, brand, classTie, line, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: "Target added successfully." });
    });
    stmt.finalize();
});

// 2. Get submissions across all users for a specific physical figure to formulate the pulse
app.get('/api/submissions/target/:targetId', (req, res) => {
    db.all("SELECT * FROM Submissions WHERE targetId = ?", [req.params.targetId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse JSON string back to object for the frontend
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });
        res.json(rows);
    });
});

// 3. Get history log for specific operative
app.get('/api/submissions/user/:username', (req, res) => {
    db.all("SELECT * FROM Submissions WHERE author = ? ORDER BY id DESC", [req.params.username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            try { r.data = JSON.parse(r.jsonData); } catch (e) { r.data = {}; }
        });
        res.json(rows);
    });
});

// 3.5. Get all submissions globally (for leaderboards)
app.get('/api/submissions', (req, res) => {
    db.all("SELECT author FROM Submissions", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 4. Submit intelligence
app.post('/api/submissions', upload.single('image'), (req, res) => {
    let submissionData = {};
    if (typeof req.body.data === 'string') {
        try { submissionData = JSON.parse(req.body.data); } catch (e) { }
    } else if (req.body.data) {
        submissionData = req.body.data;
    }

    if (req.file) {
        submissionData.imagePath = '/uploads/' + req.file.filename;
    }

    const stmt = db.prepare(`INSERT INTO Submissions 
        (targetId, targetName, targetTier, author, mtsTotal, approvalScore, jsonData, date) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    stmt.run(
        req.body.targetId, req.body.targetName, req.body.targetTier, req.body.author,
        parseFloat(req.body.mtsTotal), parseFloat(req.body.approvalScore), JSON.stringify(submissionData), req.body.date,
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, message: "Intelligence report successfully committed." });
        }
    );
    stmt.finalize();
});

// 5. Retract intelligence
app.delete('/api/submissions/:id', (req, res) => {
    db.run("DELETE FROM Submissions WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Intelligence retracted", changes: this.changes });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Data Toyz Terminal Server active on port ${PORT}`);
});
