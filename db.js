require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client', err.stack);
    } else {
        console.log('Connected to Vercel/Neon Postgres Database.');
        initDB();
        release();
    }
});

async function initDB() {
    try {
        // Create Figures Table
        await pool.query(`CREATE TABLE IF NOT EXISTS Figures (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            brand TEXT NOT NULL,
            classTie TEXT NOT NULL,
            line TEXT NOT NULL
        )`);

        // Create Users Table
        await pool.query(`CREATE TABLE IF NOT EXISTS Users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            avatar TEXT
        )`);

        // Migration Failsafe: only add avatar column if it doesn't exist
        const colCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'avatar'
        `);
        if (colCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN avatar TEXT`);
        }

        // Migration: add role column (admin/analyst)
        const roleCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'role'
        `);
        if (roleCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN role TEXT DEFAULT 'analyst'`);
        }

        // Migration: add suspended column
        const suspCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'suspended'
        `);
        if (suspCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN suspended BOOLEAN DEFAULT false`);
        }

        // Migration: add reset token columns for password reset
        const resetTokenCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'reset_token'
        `);
        if (resetTokenCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN reset_token TEXT`);
            await pool.query(`ALTER TABLE Users ADD COLUMN reset_token_expires TEXT`);
        }

        // Ensure Prime Dynamixx is admin
        await pool.query(`UPDATE Users SET role = 'admin' WHERE username = 'Prime Dynamixx'`);

        // Create Posts Table (Comms Feed)
        await pool.query(`CREATE TABLE IF NOT EXISTS Posts (
            id SERIAL PRIMARY KEY,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            imagePath TEXT,
            sentiment TEXT NOT NULL,
            date TEXT NOT NULL
        )`);

        // Create Comments Table (Comms Feed Replies)
        await pool.query(`CREATE TABLE IF NOT EXISTS Comments (
            id SERIAL PRIMARY KEY,
            postId INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY(postId) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Reactions Table (Comms Feed Emoji Toggles)
        await pool.query(`CREATE TABLE IF NOT EXISTS Reactions (
            id SERIAL PRIMARY KEY,
            postId INTEGER NOT NULL,
            author TEXT NOT NULL,
            emoji TEXT NOT NULL,
            UNIQUE(postId, author),
            FOREIGN KEY(postId) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Submissions Table
        await pool.query(`CREATE TABLE IF NOT EXISTS Submissions (
            id SERIAL PRIMARY KEY,
            targetId INTEGER NOT NULL,
            targetName TEXT NOT NULL,
            targetTier TEXT NOT NULL,
            author TEXT NOT NULL,
            mtsTotal REAL NOT NULL,
            approvalScore REAL NOT NULL,
            jsonData TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY(targetId) REFERENCES Figures(id)
        )`);

        // Create Notifications Table
        await pool.query(`CREATE TABLE IF NOT EXISTS Notifications (
            id SERIAL PRIMARY KEY,
            recipient TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            link_type TEXT,
            link_id INTEGER,
            sender TEXT,
            read BOOLEAN DEFAULT false,
            created_at TEXT NOT NULL
        )`);

        // Create Notification Preferences Table
        await pool.query(`CREATE TABLE IF NOT EXISTS NotificationPrefs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            comment_inapp BOOLEAN DEFAULT true,
            comment_email BOOLEAN DEFAULT false,
            reaction_inapp BOOLEAN DEFAULT true,
            reaction_email BOOLEAN DEFAULT false,
            co_reviewer_inapp BOOLEAN DEFAULT true,
            co_reviewer_email BOOLEAN DEFAULT false,
            new_figure_inapp BOOLEAN DEFAULT true,
            new_figure_email BOOLEAN DEFAULT false,
            hq_updates_inapp BOOLEAN DEFAULT true,
            hq_updates_email BOOLEAN DEFAULT false,
            FOREIGN KEY(user_id) REFERENCES Users(id) ON DELETE CASCADE
        )`);

        // --- BREAKOUT ROOMS TABLES --- //

        // Create Rooms Table (Breakout Rooms - DMs & Group Chats)
        await pool.query(`CREATE TABLE IF NOT EXISTS Rooms (
            id SERIAL PRIMARY KEY,
            name TEXT,
            type TEXT NOT NULL DEFAULT 'group',
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`);

        // Create RoomMembers Table (Room Participants)
        await pool.query(`CREATE TABLE IF NOT EXISTS RoomMembers (
            id SERIAL PRIMARY KEY,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT NOT NULL,
            last_read_at TEXT,
            UNIQUE(room_id, username),
            FOREIGN KEY(room_id) REFERENCES Rooms(id) ON DELETE CASCADE
        )`);

        // Create Messages Table (Breakout Room Messages)
        await pool.query(`CREATE TABLE IF NOT EXISTS Messages (
            id SERIAL PRIMARY KEY,
            room_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT,
            image TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(room_id) REFERENCES Rooms(id) ON DELETE CASCADE
        )`);

        // Create MessageReactions Table (Reactions on Messages)
        await pool.query(`CREATE TABLE IF NOT EXISTS MessageReactions (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            emoji TEXT NOT NULL,
            UNIQUE(message_id, author),
            FOREIGN KEY(message_id) REFERENCES Messages(id) ON DELETE CASCADE
        )`);

        // Create TypingIndicators Table (Polling-based typing status)
        await pool.query(`CREATE TABLE IF NOT EXISTS TypingIndicators (
            id SERIAL PRIMARY KEY,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(room_id, username),
            FOREIGN KEY(room_id) REFERENCES Rooms(id) ON DELETE CASCADE
        )`);

        // Migration: add message notification preferences to NotificationPrefs
        const msgInappCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'message_inapp'
        `);
        if (msgInappCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN message_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN message_email BOOLEAN DEFAULT false`);
        }

        // Seed Figures if empty
        const res = await pool.query("SELECT COUNT(*) as count FROM Figures");
        if (parseInt(res.rows[0].count, 10) === 0) {
            console.log("Seeding Mock Figures...");
            const insertQuery = "INSERT INTO Figures (id, name, brand, classTie, line) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING";
            const figures = [
                { id: 1, name: "FT-55 Recorder", brand: "Fans Toys", classTie: "Masterpiece", line: "3rd Party" },
                { id: 2, name: "Optimus Prime (Missing Link)", brand: "Takara Tomy", classTie: "Deluxe", line: "Missing Link" },
                { id: 3, name: "Legacy Tarn", brand: "Hasbro", classTie: "Voyager", line: "Legacy Evolution" },
                { id: 4, name: "Studio Series 86 Grimlock", brand: "Hasbro", classTie: "Leader", line: "Studio Series" },
                { id: 5, name: "Commander armada Optimus Prime", brand: "Hasbro", classTie: "Commander", line: "Legacy Evolution" },
                { id: 6, name: "X-Transbots MX-12A Gravestone", brand: "X-Transbots", classTie: "Masterpiece", line: "3rd Party" }
            ];

            for (let f of figures) {
                await pool.query(insertQuery, [f.id, f.name, f.brand, f.classTie, f.line]);
            }
        }

        // Always sync the auto-increment sequence to prevent duplicate key errors
        await pool.query("SELECT setval(pg_get_serial_sequence('figures', 'id'), (SELECT COALESCE(MAX(id), 1) FROM Figures))");
    } catch (err) {
        console.error('Failed to initialize postgres database tables:', err);
    }
}

module.exports = pool;
