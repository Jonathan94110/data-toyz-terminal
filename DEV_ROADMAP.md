# Data Toyz Terminal — Developer Roadmap

**Issued:** 2026-02-27
**Updated:** 2026-03-09
**Priority:** High — User concurrency is scaling and the platform needs both feature parity and infrastructure hardening before the next growth wave.

---

## Changelog

### 2026-03-09 — Collection Tracker + Platinum Badge + Collection Value Dashboard
- **Collection Tracker**: Users can mark figures as Owned, Wishlist, For Trade, or Sold via the Dashboard "My Collection" tab with filter buttons, sortable table, and per-figure market price column
- **Collection Value Stats**: Stat cards row (Market Value, Total MSRP, Gain/Loss, Items Owned) above the collection table, calculated from latest secondary market prices
- **Collection Value Line Graph**: Chart.js line chart showing daily aggregate value of owned figures over time, with empty state for insufficient data
- **Platinum Badge System**: New `platinum` boolean on Users table; displayed as a diamond badge across profiles, leaderboards, feed, and admin panel
- **Trade Validation Workflow**: Figures marked "For Trade" require admin/platinum approval before appearing publicly; pending trades queue in admin panel with approve/reject actions, notifications, and audit logging
- **New API routes**: `GET /collection/my` (with LEFT JOIN LATERAL for latest market price), `GET /collection/my/value-history`, `POST /collection/:figureId`, `DELETE /collection/:figureId`, `GET /collection/user/:username`, `GET /collection/figure/:figureId`, `GET /collection/pending-trades`, `PUT /collection/validate/:id`, `DELETE /collection/validate/:id`
- **Normalize helper**: Added `figure_name`, `class_tie`, `validated_by`, `user_id`, `market_price` mappings to COL_MAP
- **Bug fixes**: Fixed missing figure/class names in collection table (normalize mapping), fixed "Invalid Date" on chart labels (PostgreSQL `DATE()` → `TO_CHAR()`), fixed pending trades date display in admin panel (`pt.createdAt` → `pt.created_at`), added NaN guard to USD formatter

### 2026-03-01 — Leaderboard System + Permission Roles + Pop Count
- **Figure Leaderboard page**: New dedicated leaderboard for figures with 4 modes (Top Rated, Rising, Most Reviewed, Sleepers), brand filtering, podium display, pagination, and price/grade/pop data columns
- **Permission Roles (4-tier hierarchy)**: `Owner > Admin > Moderator > Analyst` with `requireRole()` middleware, numeric level comparison via `getRoleLevel()`, and role-aware UI across all views
- **Admin Leaderboard Controls**: Pin/unpin figures to top, hide/show from leaderboard, manual rank override, category assignment — all accessible from the admin panel with role-appropriate permissions
- **Community Pop Count**: New `ownership_status` field on submissions ("In Hand" / "Digital Only"), unique owner tracking per figure, Pop Count cards on figure detail pages, owner counts on leaderboard
- **Moderator role access**: Limited admin panel with analytics dashboard, flag management, and leaderboard visibility toggles
- **Admin panel overhaul**: Role dropdown for user management (replaces toggle), dynamic role badges, protected Owner account, conditional section rendering based on role
- **In-app documentation**: Updated docs for Figure Leaderboard, Pop Count, and Permission Roles system
- **Code cleanup**: Extracted shared helpers in `routes/figures.js` (DRY price map builders, date ranges, query functions)
- **Backend**: 3 new admin endpoints for leaderboard control; updated all role checks from `=== 'admin'` to hierarchy-based; batch notification inserts for figure creation
- **Database**: `ownership_status` column + index on Submissions, `owner` role migration for admin user

### 2026-02-28 — UI Refresh & Market Pulse
- **Sidebar redesign**: All nav items now use SVG icons + labels; sidebar is collapsible (persisted in localStorage)
- **Topbar**: Global search bar, SVG notification bell and logout icons replace emoji/text
- **Login page**: Split layout — Top Rated Toys showcase (left) + auth panel (right); fetches `/api/figures/top-rated`
- **Intel History (dashboard.js)**: Stats summary row (Total Reports, Avg Grade, Top Target, Your Title), color-coded grades, SVG empty states, renamed CSS classes `dash-*` → `intel-*`
- **Community Feed (feed.js)**: Tightened spacing, smaller fonts/padding, compact post form
- **Leaderboard (leaderboards.js)**: Podium-style top 3 (medals, avatars, glow), card-style remaining users, "Your Stats" sidebar with rank/title/progress bar
- **Rate limiting**: New `authAttemptLimiter` for login/reset brute-force protection (120/15min prod, 400/15min dev)
- **Housekeeping**: Removed Vercel adapter (`api/index.js`, `vercel.json`), removed service worker (`public/sw.js`), renamed package from `the-survey-assement-` to `data-toyz-terminal`
- **Market Pulse (Card Ladder features)**: 3-tab layout (Overview, Rankings, Compare), Chart.js volume chart, brand index grid, sortable figure rankings, side-by-side compare tool with overlaid price charts
- **Backend (stats.js)**: New endpoints — `GET /stats/market-volume`, `GET /stats/brand-index`; extended `GET /stats/overview` with market tx count, avg secondary price, most active brand, 30d price trend
- **Backend (figures.js)**: New endpoints — `GET /figures/market-ranked`, `GET /figures/compare`
- **Database**: 3 new indexes — `idx_submissions_date`, `idx_mt_created_at`, `idx_mt_pricetype_created`

---

## Part 1: User-Facing Feature Updates

### 1.1 Username Self-Edit for Scorecard Authors

**Current State:** Already decentralized. Any authenticated user can edit their own username via `PUT /users/:id` in `routes/users.js` (lines 53-102). No admin restriction exists — the endpoint only requires `requireAuth`, not `requireAdmin`. Username changes cascade across 12+ tables (Submissions, Posts, Comments, Reactions, Messages, etc.).

**Action Required:** None — this is already live. Confirm with QA that the cascade works reliably under concurrency (see Section 2.3 on indexes). If additional guardrails are needed (e.g., rate-limiting name changes to once per 24 hours, or a username history log), spec those out separately.

---

### 1.2 Fix Intel History Logs — Universal Visibility ✅ DONE

**Status:** Pagination implemented. Dashboard handles both array and paginated object API responses. Client-side search fallback for backends that return flat arrays. Stats summary cards added (Total Reports, Avg Grade, Top Target, User Title).

**Remaining:**
- Ensure the user profile submissions endpoint (`routes/users.js`) paginates or matches the dashboard query.

---

### 1.3 Add Search to Intel History Logs ✅ DONE

**Status:** Search bar added to Intel History. Supports `?q=` and `?page=` params. Frontend renders search input with clear button, pagination controls, and total record count. Client-side filter fallback when backend returns flat array.

**Remaining (nice-to-have):**
- Date range picker filter
- Grade minimum filter
- Sort order toggle (date/grade/name)

---

### 1.4 Deep-Link Log Entries to Scorecards & Community Posts

**Current State:** Dashboard entries call `app.selectTarget(targetId)` which navigates to the figure detail page — NOT to the specific submission/scorecard. There is no URL structure for viewing a single submission in isolation. MarketTransactions have a `submission_id` foreign key but it's not exposed in the UI.

**Implementation Plan:**

**Step 1 — Submission detail route (backend):**
```
GET /submissions/:id
```
Returns the full submission JSON (scorecard data, grades, pricing, risk axes). Enforce ownership check: only the author or an admin can view. This endpoint likely already exists for edit mode — confirm and extend if needed.

**Step 2 — Frontend scorecard permalink:**
- Add a view mode to `submission.js` that renders a read-only scorecard when navigated to via deep link.
- URL hash pattern: `#scorecard/<submissionId>`
- The dashboard list items become clickable links: `<a href="#scorecard/${sub.id}">`.

**Step 3 — Community post linking:**
- If a submission has an associated community post (auto-generated on submit), store the `post_id` on the Submission row or query by `submission_id` on Posts.
- Dashboard entries that have a linked post show a secondary "View Post" link icon.
- Clicking navigates to `#community` with the post scrolled into view (or a `#post/<postId>` permalink).

**Step 4 — Backlink from Market Transactions:**
- MarketTransactions already store `submission_id` — surface this in the figure detail timeline so users can trace any data point back to the original scorecard.

---

## Part 2: Infrastructure & Scalability Assessment

### The Problem

At 20 concurrent users, the application is under stress. The root causes are a combination of **database query inefficiency** and **resource configuration limits**. Both need to be addressed — this is not an either/or.

---

### 2.1 CRITICAL — N+1 Query Patterns (Database)

**Bottleneck #1: Room List Endpoint (`routes/rooms.js`, lines 89-157)**

This is the single biggest performance killer. For each room a user belongs to, the handler fires 3-4 separate queries:
```
Room 1 → members query + last message query + membership query + unread count query
Room 2 → members query + last message query + membership query + unread count query
...
```
With 10 rooms per user, that's **40 database queries per request**. At 20 concurrent users loading their room list, that's **800 queries hitting the pool simultaneously**.

**Fix:** Rewrite as a single SQL query using JOINs and window functions:
```sql
SELECT r.*,
  (SELECT json_agg(username) FROM RoomMembers WHERE room_id = r.id) AS members,
  (SELECT content FROM Messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message,
  (SELECT COUNT(*) FROM Messages WHERE room_id = r.id AND created_at > rm.last_read_at) AS unread
FROM Rooms r
JOIN RoomMembers rm ON r.id = rm.room_id AND rm.username = $1
ORDER BY r.updated_at DESC;
```
**Expected improvement:** 40 queries → 1 query. ~97% reduction.

**Bottleneck #2: Mention Processing (`routes/posts.js`, lines 82-92)**

Every `@mention` in a post triggers a separate `SELECT` to validate the username. 5 mentions = 5 queries.

**Fix:** Batch validate with `ANY()`:
```sql
SELECT id, username FROM Users WHERE username = ANY($1::text[])
```

**Bottleneck #3: Notification Fan-Out (`routes/figures.js`, lines 36-41)**

Creating a new figure loops through all opted-in users and runs one `INSERT` per user.

**Fix:** Use a single batch INSERT:
```sql
INSERT INTO Notifications (recipient, type, message, sender, link_type, link_id)
SELECT username, 'new_figure', $1, $2, 'figure', $3
FROM Users u JOIN NotificationPrefs np ON u.id = np.user_id
WHERE np.new_figure_alerts = true AND u.username != $2
```

---

### 2.2 CRITICAL — Missing Database Indexes

The application has only **1 custom index** across the entire database (`idx_mt_figure_pricetype`). Every other query runs against unindexed columns, causing full table scans that degrade linearly with data volume.

**Required indexes (add immediately):**

```sql
-- Posts timeline (most frequent query)
CREATE INDEX idx_posts_author ON Posts(author);
CREATE INDEX idx_posts_created ON Posts(id DESC);

-- Comments & Reactions (loaded with every post)
CREATE INDEX idx_comments_postid ON Comments(postId);
CREATE INDEX idx_reactions_postid ON Reactions(postId);

-- Submissions (dashboard + figure detail)
CREATE INDEX idx_submissions_author ON Submissions(author);
CREATE INDEX idx_submissions_targetid ON Submissions(targetId);

-- Messages (room chat)
CREATE INDEX idx_messages_room_created ON Messages(room_id, created_at DESC);

-- Room members (every room operation)
CREATE INDEX idx_roommembers_room ON RoomMembers(room_id);
CREATE INDEX idx_roommembers_username ON RoomMembers(username);

-- Notifications (loaded on every page)
CREATE INDEX idx_notifications_recipient ON Notifications(recipient, created_at DESC);

-- Users (login + profile lookups)
CREATE INDEX idx_users_username ON Users(LOWER(username));

-- Follows
CREATE INDEX idx_follows_follower ON Follows(follower_id);
CREATE INDEX idx_follows_following ON Follows(following_id);
```

**Expected improvement:** 10-50x faster queries on tables with 1,000+ rows. This is the single highest-ROI change.

---

### 2.3 HIGH — Connection Pool at Capacity

**Current config (`db.js`):**
```javascript
max: 20  // Maximum connections
```

At 20 concurrent users, the pool is operating at its absolute ceiling. Any query that takes >100ms (common without indexes) holds a connection, and new requests queue up or timeout.

**Fix:**
```javascript
max: 40,                        // Double headroom
idleTimeoutMillis: 20000,       // Release idle connections faster
connectionTimeoutMillis: 5000,  // Keep current timeout
statement_timeout: 10000        // Kill runaway queries after 10s
```

**Also add pool monitoring:**
```javascript
pool.on('error', (err) => console.error('Idle client error', err));
setInterval(() => {
    console.log(`DB Pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`);
}, 60000);
```

---

### 2.4 HIGH — Auth Validation Hits DB on Every Request

**Current behavior (`middleware/auth.js`):** Every authenticated API call runs:
```sql
SELECT id, username, role, suspended, password_changed_at FROM Users WHERE id = $1
```

At 20 users making 2 requests/sec each, that's **40 unnecessary DB queries per second** just for auth validation.

**Fix:** Add an in-memory LRU cache with short TTL:
```javascript
const userCache = new Map();
const USER_CACHE_TTL = 15000; // 15 seconds

async function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL) return cached.data;

    const result = await db.query("SELECT ... WHERE id = $1", [userId]);
    if (result.rows.length) {
        userCache.set(userId, { data: result.rows[0], ts: Date.now() });
    }
    return result.rows[0] || null;
}
```

This still respects `password_changed_at` invalidation (checked on each request from cached data against token `iat`), but eliminates ~95% of auth DB queries.

---

### 2.5 MEDIUM — Static File Caching Disabled

**Current config (`server.js`):**
```javascript
app.use(express.static('public', { maxAge: 0 }));
```

Every page load re-downloads all CSS, JS, and images. The logo alone is ~5MB.

**Fix:**
```javascript
app.use(express.static('public', {
    maxAge: '7d',           // Cache static assets for 7 days
    etag: true,
    lastModified: true,
    immutable: false         // Allow cache busting via ?v= params (already in use)
}));
```

Since the app already uses `?v=N` cache busting on CSS/JS files in `index.html`, this is safe to enable immediately. Browsers will re-fetch when the version param changes.

---

### 2.6 Summary: Fix Priority Matrix

| Priority | Issue | Type | Impact | Effort |
|----------|-------|------|--------|--------|
| P0 | Add database indexes | Database | 10-50x query speedup | 30 min |
| P0 | Rewrite rooms.js N+1 queries | Database | 97% query reduction on rooms | 2-3 hrs |
| P1 | Increase connection pool to 40 | Server | Prevents pool exhaustion | 10 min |
| P1 | Add auth user caching | Server | 95% fewer auth queries | 1 hr |
| P1 | Enable static file caching | Server | 30% bandwidth reduction | 10 min |
| P2 | Batch mention validation | Database | Eliminates N+1 on posts | 30 min |
| P2 | Batch notification inserts | Database | Eliminates N+1 on figures | 30 min |
| P2 | Add pool monitoring/logging | Server | Visibility into bottlenecks | 30 min |

---

### 2.7 The Answer: Scale Server, Optimize Database, or Both?

**Both — but the database is the primary bottleneck.**

The server itself (Express + Node.js) can handle 20 concurrent users without breaking a sweat. The crash is happening because:

1. **The database is being hammered by 10-50x more queries than necessary** (N+1 patterns).
2. **Those queries are slow because there are no indexes** (full table scans).
3. **The connection pool is maxed at exactly the user count** (no headroom).

Throwing more server resources at this won't help — a bigger server just waits faster for the same slow database queries. **Fix the database first**, then the server-side optimizations (caching, static files) provide additional headroom.

After implementing the P0 and P1 fixes above, the platform should comfortably handle **50-100 concurrent users** on the current infrastructure without any hardware scaling.

---

## Execution Order

```
Phase 1 (Immediate — Infrastructure)
  [P0] Add all database indexes                    ← 3 market indexes done, others pending
  [P0] Rewrite rooms.js query                      ← PENDING
  [P1] Increase pool to 40 + add monitoring        ← PENDING
  [P1] Enable static file caching                  ← PENDING
  [P1] Add auth user caching                       ← PENDING

Phase 2 (This Sprint — Features)
  [1.2] Audit + paginate intel history             ← DONE (2026-02-28)
  [1.3] Add search to intel logs                   ← DONE (2026-02-28)
  [1.4] Submission permalink / deep-link system    ← PENDING

Phase 3 (Next Sprint — Polish)
  [P2] Batch mention validation                    ← PENDING
  [P2] Batch notification inserts                  ← PENDING
  [1.4] Community post back-linking                ← PENDING
  [1.4] Market transaction → scorecard traceability ← PENDING

Completed (not in original roadmap):
  - Card Ladder Market Pulse (3 tabs, 5 endpoints) ← DONE (2026-02-28)
  - UI Refresh (icons, collapsible sidebar, login)  ← DONE (2026-02-28)
  - Auth brute-force rate limiter                   ← DONE (2026-02-28)
  - Vercel/SW cleanup                               ← DONE (2026-02-28)
  - Figure Leaderboard (modes, filtering, podium)   ← DONE (2026-03-01)
  - Permission Roles (owner>admin>mod>analyst)       ← DONE (2026-03-01)
  - Admin Leaderboard Controls (pin/hide/rank/cat)   ← DONE (2026-03-01)
  - Community Pop Count (ownership + unique owners)  ← DONE (2026-03-01)
  - Code cleanup (DRY figures.js, docs update)       ← DONE (2026-03-01)
  - Collection Tracker (owned/wishlist/trade/sold)   ← DONE (2026-03-09)
  - Platinum Badge System (admin-assigned status)    ← DONE (2026-03-09)
  - Trade Validation (admin/platinum approval flow)  ← DONE (2026-03-09)
  - Collection Value Dashboard (stats + line graph)  ← DONE (2026-03-09)
```

---

*Generated from codebase analysis on 2026-02-27. Updated 2026-03-01 with completion status. All file references and query patterns verified against the live repository.*
