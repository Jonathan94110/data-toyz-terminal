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

        // Migration Failsafe
        try {
            await pool.query(`ALTER TABLE Users ADD COLUMN avatar TEXT`);
        } catch (e) {
            // ignore if column already exists
        }

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

        // Seed Figures if empty
        const res = await pool.query("SELECT COUNT(*) as count FROM Figures");
        if (parseInt(res.rows[0].count, 10) === 0) {
            console.log("Seeding Mock Figures...");
            const insertQuery = "INSERT INTO Figures (id, name, brand, classTie, line) VALUES ($1, $2, $3, $4, $5)";
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
    } catch (err) {
        console.error('Failed to initialize postgres database tables:', err);
    }
}

module.exports = pool;
