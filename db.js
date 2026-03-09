require('dotenv').config();
const { Pool } = require('pg');
const log = require('./logger.js');

// --- A-4: Configure connection pool limits --- //
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: process.env.NODE_ENV === 'production' // S-7: Enable SSL verification in production
    },
    max: 40,             // Maximum pool size (scaled for 20+ concurrent users)
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000  // Kill runaway queries after 10s
});

pool.on('error', (err) => {
    log.error('Unexpected database pool error', { error: err.message });
});

// Pool utilization monitoring (every 60s)
setInterval(() => {
    log.info('DB Pool status', {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
    });
}, 60000);

// Clean up expired token blacklist entries (daily)
setInterval(async () => {
    try {
        const result = await pool.query(
            "DELETE FROM TokenBlacklist WHERE expires_at < $1",
            [new Date().toISOString()]
        );
        if (result.rowCount > 0) {
            log.info('Token blacklist cleanup', { removed: result.rowCount });
        }
    } catch (e) {
        log.error('Token blacklist cleanup error', { error: e.message });
    }
}, 24 * 60 * 60 * 1000);

// --- Startup connection with retry (handles cold-start Neon wake-ups) --- //
(async function connectWithRetry(attempt = 1) {
    const MAX_RETRIES = 5;
    try {
        const client = await pool.connect();
        log.info('Connected to Vercel/Neon Postgres Database');
        client.release();
        initDB();
    } catch (err) {
        if (attempt < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, 8s
            log.warn(`DB connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms`, { error: err.message });
            setTimeout(() => connectWithRetry(attempt + 1), delay);
        } else {
            log.error(`DB connection failed after ${MAX_RETRIES} attempts`, { error: err.message });
        }
    }
})();

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

        // Migration: add password_changed_at column for session invalidation (C-3)
        const pwChangedCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'password_changed_at'
        `);
        if (pwChangedCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN password_changed_at TEXT`);
        }

        // Migration: add platinum badge column to Users
        const platinumCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'platinum'
        `);
        if (platinumCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Users ADD COLUMN platinum BOOLEAN DEFAULT false`);
        }

        // PI-2: Configurable admin username from env — promote to owner (highest role)
        const adminUsername = process.env.ADMIN_USERNAME || 'Prime Dynamixx';
        await pool.query(`UPDATE Users SET role = 'owner' WHERE username = $1`, [adminUsername]);

        // Create Posts Table (Community Feed)
        await pool.query(`CREATE TABLE IF NOT EXISTS Posts (
            id SERIAL PRIMARY KEY,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            imagePath TEXT,
            sentiment TEXT NOT NULL,
            date TEXT NOT NULL
        )`);

        // Create Comments Table (Community Feed Replies)
        await pool.query(`CREATE TABLE IF NOT EXISTS Comments (
            id SERIAL PRIMARY KEY,
            postId INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY(postId) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Reactions Table (Community Feed Emoji Toggles)
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

        // Create FigureComments Table (Discussion on figure detail pages)
        await pool.query(`CREATE TABLE IF NOT EXISTS FigureComments (
            id SERIAL PRIMARY KEY,
            figure_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(figure_id) REFERENCES Figures(id) ON DELETE CASCADE
        )`);

        // Create MarketTransactions Table (Secondary market price history)
        await pool.query(`CREATE TABLE IF NOT EXISTS MarketTransactions (
            id SERIAL PRIMARY KEY,
            figure_id INTEGER NOT NULL,
            price_high REAL,
            price_avg REAL NOT NULL,
            price_low REAL,
            source TEXT NOT NULL DEFAULT 'user_entry',
            submitted_by TEXT,
            submission_id INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY(figure_id) REFERENCES Figures(id) ON DELETE CASCADE,
            FOREIGN KEY(submission_id) REFERENCES Submissions(id) ON DELETE SET NULL
        )`);

        // Create Flags Table (Post Flagging/Reporting)
        await pool.query(`CREATE TABLE IF NOT EXISTS Flags (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            flagged_by TEXT NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(post_id, flagged_by),
            FOREIGN KEY(post_id) REFERENCES Posts(id) ON DELETE CASCADE
        )`);

        // Create Follows Table (User Following)
        await pool.query(`CREATE TABLE IF NOT EXISTS Follows (
            id SERIAL PRIMARY KEY,
            follower_id INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(follower_id, following_id),
            FOREIGN KEY(follower_id) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY(following_id) REFERENCES Users(id) ON DELETE CASCADE
        )`);

        // Create AuditLog Table (S-10: Security audit trail)
        await pool.query(`CREATE TABLE IF NOT EXISTS AuditLog (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            actor TEXT,
            target TEXT,
            details TEXT,
            ip_address TEXT,
            created_at TEXT NOT NULL
        )`);

        // Create TokenBlacklist table (revoked JWT tokens)
        await pool.query(`CREATE TABLE IF NOT EXISTS TokenBlacklist (
            id SERIAL PRIMARY KEY,
            token_hash TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tokenblacklist_hash ON TokenBlacklist(token_hash)`);

        // Create SiteSettings table (admin-configurable site-wide settings)
        await pool.query(`CREATE TABLE IF NOT EXISTS SiteSettings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_by TEXT,
            updated_at TEXT
        )`);

        // Create UserCollection table (Collection Tracker)
        await pool.query(`CREATE TABLE IF NOT EXISTS UserCollection (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            figure_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'owned',
            validated BOOLEAN DEFAULT false,
            validated_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            UNIQUE(user_id, figure_id)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usercollection_user ON UserCollection(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usercollection_figure ON UserCollection(figure_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usercollection_status ON UserCollection(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usercollection_validated ON UserCollection(validated, status)`);

        // Migration: add message notification preferences to NotificationPrefs
        const msgInappCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'message_inapp'
        `);
        if (msgInappCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN message_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN message_email BOOLEAN DEFAULT false`);
        }

        // Migration: add trade_validation notification preferences
        const tradeValidCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'trade_validation_inapp'
        `);
        if (tradeValidCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN trade_validation_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN trade_validation_email BOOLEAN DEFAULT false`);
        }

        // Migration: add msrp column to Figures
        const msrpCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'figures' AND column_name = 'msrp'
        `);
        if (msrpCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Figures ADD COLUMN msrp REAL`);
        }

        // Migration: add market_signal columns to Figures (Phase 2 prep)
        const sigCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'figures' AND column_name = 'market_signal'
        `);
        if (sigCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Figures ADD COLUMN market_signal TEXT`);
            await pool.query(`ALTER TABLE Figures ADD COLUMN market_signal_updated_at TEXT`);
        }

        // Migration: add cost_basis column to Submissions
        const costCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'submissions' AND column_name = 'cost_basis'
        `);
        if (costCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Submissions ADD COLUMN cost_basis REAL`);
        }

        // Migration: add edited_at column to Posts for edit tracking
        const editedAtCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'posts' AND column_name = 'edited_at'
        `);
        if (editedAtCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Posts ADD COLUMN edited_at TEXT`);
        }

        // Migration: add edited_at column to Submissions for edit tracking
        const subEditedCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'submissions' AND column_name = 'edited_at'
        `);
        if (subEditedCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Submissions ADD COLUMN edited_at TEXT`);
        }

        // Migration: add edited_at column to Comments for edit tracking
        const commentEditedCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'comments' AND column_name = 'edited_at'
        `);
        if (commentEditedCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Comments ADD COLUMN edited_at TEXT`);
        }

        // Migration: add follow, mention, flag notification preferences
        const followInappCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'follow_inapp'
        `);
        if (followInappCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN follow_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN follow_email BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN mention_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN mention_email BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN flag_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN flag_email BOOLEAN DEFAULT false`);
        }

        // Migration: add assessment_request notification preferences
        const assessReqCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'assessment_request_inapp'
        `);
        if (assessReqCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN assessment_request_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN assessment_request_email BOOLEAN DEFAULT false`);
        }

        // Migration: add pending_brand notification preferences
        const pendingBrandCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notificationprefs' AND column_name = 'pending_brand_inapp'
        `);
        if (pendingBrandCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN pending_brand_inapp BOOLEAN DEFAULT true`);
            await pool.query(`ALTER TABLE NotificationPrefs ADD COLUMN pending_brand_email BOOLEAN DEFAULT false`);
        }

        // Migration: add category column to Figures for action figure support
        const categoryCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'figures' AND column_name = 'category'
        `);
        if (categoryCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Figures ADD COLUMN category TEXT NOT NULL DEFAULT 'transformer'`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_figures_category ON Figures(category)`);
        }

        // Migration: add created_by column to Figures for ownership tracking
        const createdByCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'figures' AND column_name = 'created_by'
        `);
        if (createdByCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Figures ADD COLUMN created_by TEXT`);
        }

        // Migration: add leaderboard control columns to Figures
        const lbHiddenCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'figures' AND column_name = 'lb_hidden'
        `);
        if (lbHiddenCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Figures ADD COLUMN lb_hidden BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE Figures ADD COLUMN lb_pinned BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE Figures ADD COLUMN lb_rank_override INTEGER`);
            await pool.query(`ALTER TABLE Figures ADD COLUMN lb_category TEXT`);
        }
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_figures_lb ON Figures(lb_hidden, lb_pinned)`);

        // Migration: add ownership_status column to Submissions for Pop Count tracking
        const ownershipStatusCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'submissions' AND column_name = 'ownership_status'
        `);
        if (ownershipStatusCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE Submissions ADD COLUMN ownership_status TEXT DEFAULT 'in_hand'`);
            await pool.query(`UPDATE Submissions SET ownership_status = 'in_hand' WHERE ownership_status IS NULL`);
        }
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_submissions_ownership ON Submissions(targetId, ownership_status)`);

        // Migration: add price_type column to MarketTransactions for multi-type pricing
        const priceTypeCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'markettransactions' AND column_name = 'price_type'
        `);
        if (priceTypeCheck.rows.length === 0) {
            await pool.query(`ALTER TABLE MarketTransactions ADD COLUMN price_type TEXT NOT NULL DEFAULT 'secondary_market'`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_mt_figure_pricetype ON MarketTransactions(figure_id, price_type)`);
        }

        // --- Performance indexes for concurrent user scaling ---
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_author ON Posts(author)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_id_desc ON Posts(id DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_postid ON Comments(postId)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_reactions_postid ON Reactions(postId)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_submissions_author ON Submissions(author)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_submissions_targetid ON Submissions(targetId)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_created ON Messages(room_id, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_roommembers_room ON RoomMembers(room_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_roommembers_username ON RoomMembers(username)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON Notifications(recipient, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON Users(username)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON Follows(follower_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_following ON Follows(following_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_flags_postid ON Flags(post_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_figurecomments_figureid ON FigureComments(figure_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_msgreactions_msgid ON MessageReactions(message_id)`);

        // Approved Brands table (admin-managed brand whitelist)
        await pool.query(`CREATE TABLE IF NOT EXISTS ApprovedBrands (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            approved_by TEXT,
            created_at TEXT NOT NULL
        )`);

        // Pending brand requests (user-submitted brands awaiting admin approval)
        await pool.query(`CREATE TABLE IF NOT EXISTS PendingBrands (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            figure_name TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )`);

        // Trim trailing/leading whitespace from brand names in Figures and ApprovedBrands
        await pool.query(`UPDATE Figures SET brand = TRIM(brand) WHERE brand != TRIM(brand)`);
        await pool.query(`UPDATE ApprovedBrands SET name = TRIM(name) WHERE name != TRIM(name)`);

        // Remove duplicate brand rows (keep lowest id per case-insensitive name)
        await pool.query(`
            DELETE FROM ApprovedBrands a USING ApprovedBrands b
            WHERE a.id > b.id AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
        `);

        // Ensure unique index exists (CREATE TABLE IF NOT EXISTS won't add constraints to existing tables)
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_approvedbrands_name_unique ON ApprovedBrands (name)`);

        // Seed approved brands from existing figures (one-time migration)
        const abCheck = await pool.query("SELECT COUNT(*) as c FROM ApprovedBrands");
        if (parseInt(abCheck.rows[0].c, 10) === 0) {
            await pool.query(`
                INSERT INTO ApprovedBrands (name, approved_by, created_at)
                SELECT DISTINCT TRIM(brand), 'system', '${new Date().toISOString()}'
                FROM Figures WHERE brand IS NOT NULL AND TRIM(brand) != ''
                ON CONFLICT (name) DO NOTHING
            `);
        }

        // Page view analytics (TIMESTAMPTZ for native date/time aggregation)
        await pool.query(`CREATE TABLE IF NOT EXISTS PageViews (
            id SERIAL PRIMARY KEY,
            path TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            user_id INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pageviews_created_at ON PageViews(created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pageviews_ip ON PageViews(ip_address)`);

        // --- Market analytics indexes ---
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_submissions_date ON Submissions(date)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_mt_created_at ON MarketTransactions(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_mt_pricetype_created ON MarketTransactions(price_type, created_at)`);

        // Seed Figures if empty
        const res = await pool.query("SELECT COUNT(*) as count FROM Figures");
        if (parseInt(res.rows[0].count, 10) === 0) {
            log.info('Seeding mock figures');
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

        // Always sync the auto-increment sequences to prevent duplicate key errors
        await pool.query("SELECT setval(pg_get_serial_sequence('figures', 'id'), (SELECT COALESCE(MAX(id), 1) FROM Figures))");
        await pool.query("SELECT setval(pg_get_serial_sequence('markettransactions', 'id'), (SELECT COALESCE(MAX(id), 1) FROM MarketTransactions))");
        await pool.query("SELECT setval(pg_get_serial_sequence('flags', 'id'), (SELECT COALESCE(MAX(id), 1) FROM Flags))");
        await pool.query("SELECT setval(pg_get_serial_sequence('follows', 'id'), (SELECT COALESCE(MAX(id), 1) FROM Follows))");

        // One-time data migration: extract market_price from jsonData into MarketTransactions
        await migrateMarketPrices();

    } catch (err) {
        log.error('Failed to initialize postgres database tables', { error: err.message || err });
    }
}

async function migrateMarketPrices() {
    try {
        const migCheck = await pool.query(
            "SELECT COUNT(*) as count FROM MarketTransactions WHERE source = 'migration'"
        );
        if (parseInt(migCheck.rows[0].count) > 0) return; // Already migrated

        const allSubs = await pool.query("SELECT id, targetid, author, jsondata, date FROM Submissions");
        let migrated = 0;
        for (const row of allSubs.rows) {
            try {
                const data = JSON.parse(row.jsondata || '{}');
                if (data.market_price && parseFloat(data.market_price) > 0) {
                    await pool.query(
                        `INSERT INTO MarketTransactions (figure_id, price_avg, source, submitted_by, submission_id, created_at)
                         VALUES ($1, $2, 'migration', $3, $4, $5)`,
                        [row.targetid, parseFloat(data.market_price), row.author, row.id, row.date]
                    );
                    migrated++;
                }
            } catch (e) { /* skip unparseable */ }
        }
        if (migrated > 0) log.info(`Migrated ${migrated} market prices from jsonData to MarketTransactions`);
    } catch (e) {
        log.error('Market price migration error', { error: e.message });
    }
}

module.exports = pool;
