const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'marauders.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite Database.');
        initDB();
    }
});

function initDB() {
    db.serialize(() => {
        // Create Figures Table
        db.run(`CREATE TABLE IF NOT EXISTS Figures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            brand TEXT NOT NULL,
            classTie TEXT NOT NULL,
            line TEXT NOT NULL
        )`);

        // Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`);

        // Create Posts Table (Comms Feed)
        db.run(`CREATE TABLE IF NOT EXISTS Posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            imagePath TEXT,
            sentiment TEXT NOT NULL,
            date TEXT NOT NULL
        )`);

        // Create Comments Table (Comms Feed Replies)
        db.run(`CREATE TABLE IF NOT EXISTS Comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY(postId) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Reactions Table (Comms Feed Emoji Toggles)
        db.run(`CREATE TABLE IF NOT EXISTS Reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            author TEXT NOT NULL,
            emoji TEXT NOT NULL,
            UNIQUE(postId, author),
            FOREIGN KEY(postId) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Submissions Table
        db.run(`CREATE TABLE IF NOT EXISTS Submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        db.get("SELECT COUNT(*) as count FROM Figures", (err, row) => {
            if (row && row.count === 0) {
                console.log("Seeding Mock Figures...");
                const stmt = db.prepare("INSERT INTO Figures (id, name, brand, classTie, line) VALUES (?, ?, ?, ?, ?)");
                const figures = [
                    { id: 1, name: "FT-55 Recorder", brand: "Fans Toys", classTie: "Masterpiece", line: "3rd Party" },
                    { id: 2, name: "Optimus Prime (Missing Link)", brand: "Takara Tomy", classTie: "Deluxe", line: "Missing Link" },
                    { id: 3, name: "Legacy Tarn", brand: "Hasbro", classTie: "Voyager", line: "Legacy Evolution" },
                    { id: 4, name: "Studio Series 86 Grimlock", brand: "Hasbro", classTie: "Leader", line: "Studio Series" },
                    { id: 5, name: "Commander armada Optimus Prime", brand: "Hasbro", classTie: "Commander", line: "Legacy Evolution" },
                    { id: 6, name: "X-Transbots MX-12A Gravestone", brand: "X-Transbots", classTie: "Masterpiece", line: "3rd Party" }
                ];

                figures.forEach(f => {
                    stmt.run(f.id, f.name, f.brand, f.classTie, f.line);
                });
                stmt.finalize();
            }
        });
    });
}

module.exports = db;
