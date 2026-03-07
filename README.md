# Data Toyz Terminal

**Trade Value & Risk Terminal for Collectible Action Figures**

[datatoyz.com](https://datatoyz.com)

---

## Overview

Data Toyz Terminal is a collaborative market intelligence platform built for collectors, traders, and analysts of collectible action figures. It provides real-time trade value assessments, community-driven grading, market analytics, and social features — all wrapped in an immersive intelligence-themed interface.

The platform supports **two categories** — **Transformers** and **Action Figures** (GI Joe, Star Wars, He-Man, Voltron, etc.) — each with independent catalogs, leaderboards, and market analytics. A sidebar toggle switches between categories instantly.

---

## Features

### Categories & Scoring
- **Dual Categories** — Transformers and Action Figures with independent catalogs, filtered via sidebar toggle
- **Category-Specific Tiers** — Transformers: Core/Deluxe/Voyager/Leader/Commander/Titan/Masterpiece; Action Figures: 3.75"/6"/7"/12"
- **Transformation Opt-In** — "Has Transformation?" checkbox defaults by category; overridable for edge cases (M.A.S.K., Voltron, Go-Bots)
- **Dynamic Scoring** — Approval Score formula adjusts: /90 with transformation sliders, /70 without
- **Category-Filtered Brands** — Brand dropdown shows only brands relevant to the active category

### Market Intelligence

- **Figure Database** — Search, catalog, and manage action figures across brands and lines with mandatory MSRP on registration and duplicate detection
- **Intelligence Reports** — Submit detailed scorecards with DTS (demand, buzz, liquidity, scarcity, appeal), product quality grades, approval scores, and color-coded pricing by source
- **Color-Coded Price Tracking** — Three distinct price lines by purchase source: Overseas (green), Stateside (amber), and Secondary Market (red) with MSRP baseline reference
- **Price Tiers** — Side-by-side comparison of average prices across all three purchase channels with cross-tier percentage diffs
- **Value Signal** — Automated market position badge (UNDERVALUED / FAIR VALUE / HOLD / HOT / OVERVALUED) using Smart MSRP analysis
- **Smart MSRP** — Automatic price baseline derivation from admin-set MSRP or community overseas retail average
- **Figure Rankings** — Sort and filter by price, grade, approval, momentum, and submission count
- **Weekly Movers** — Top gainers, losers, most active, and new entries over 7-day and 30-day windows
- **Brand Health Dashboard** — Per-brand analytics with submission counts, average grades, pricing trends, and weekly charts
- **Market Trends Timeline** — Overall market overview with price series and activity analysis across customizable time periods
- **Figure Comparison** — Side-by-side comparison of community metrics, pricing, and scoring breakdowns
- **Trade Advisor** — AI-powered trading insights and recommendations

### Community

- **Feed** — Broadcast posts with sentiment tagging, image attachments, threaded replies, reactions, @mentions with live autocomplete, and @everyone broadcasts
- **Chat Rooms** — Direct messages and group channels with typing indicators, reactions, and unread tracking
- **User Profiles** — Follow/unfollow system, submission history, title progression, and avatar customization
- **Request Assessment** — Share figures with other users to request their scorecard submission via in-app notifications
- **Cost Basis Tracking** — Personal portfolio gain/loss calculations vs. current market prices

### Gamification

- **Analyst Titles** — Automatic rank progression from Rookie Analyst to Prime Intel Officer based on contribution volume
- **Leaderboards** — Analyst rankings with podium visualization, and figure leaderboards with four modes (Top Rated, Rising, Most Reviewed, Sleepers)
- **Ticker Tape** — Live scrolling marquee of market activity with admin-configurable display modes
- **Pop Count** — Track in-hand vs. digital-only ownership demographics per figure

### Admin & Moderation

- **User Management** — Create, edit, suspend, and delete users with a 4-tier role hierarchy (Owner > Admin > Moderator > Analyst)
- **Figure Management** — Edit, delete, merge duplicates, set MSRPs, and control leaderboard display
- **Brand Approval** — Review and approve community-submitted brand requests
- **Content Moderation** — Flagged post review with dismiss/action controls
- **Audit Logs** — Searchable activity log with filtering by action, actor, target, and date range
- **Ticker Settings** — Configure global ticker mode and item count
- **System Logs** — Real-time server activity monitoring
- **Database Backup** — One-click JSON export of all 21 tables with sensitive fields (passwords, reset tokens) excluded

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript SPA, Chart.js, CSS custom properties |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL (Neon serverless) |
| Auth | JWT (30-day tokens with silent renewal, server-side token blacklisting) |
| Email | Resend API |
| Security | Helmet, CORS, bcrypt, express-rate-limit, bot protection, token blacklisting |
| Caching | In-memory response cache with TTL and auto-invalidation |
| CI/CD | GitHub Actions (smoke tests on push, scheduled security scans) |
| Deployment | Render (auto-deploy from `main`) |

---

## Security

### Anti-Scraping (3-Layer Bot Protection)

All public data endpoints are protected by three layers:

1. **User-Agent Validation** — Blocks known scraper user-agents (curl, wget, Python, Scrapy, etc.) while allowing legitimate search engine crawlers (Googlebot, Bingbot, etc.)
2. **Endpoint Rate Limiting** — 60 requests per 15 minutes on data endpoints (production)
3. **Behavioral IP Tracking** — Tracks per-IP request patterns; temporarily blocks IPs that hit 40+ data endpoints within a 5-minute window (30-minute block)

### Server-Side Logout & Token Blacklisting

- `POST /api/auth/logout` hashes and stores the token in the `TokenBlacklist` table
- Both `requireAuth` and `requireAuthRenew` middleware check the blacklist before allowing access
- In-memory cache with 30-second TTL avoids per-request DB hits
- Expired tokens are cleaned up daily

### Automated Security Scanning

A 32-check security audit runs automatically via GitHub Actions:

| Schedule | Time |
|----------|------|
| Scan 1 | 12:00 AM Pacific (daily) |
| Scan 2 | 6:00 AM Pacific (daily) |
| On push | Every push to `main` |

Checks cover: SQL injection, auth on mutations, hardcoded secrets, error reference IDs, rate limiters, Helmet headers, HTTPS enforcement, bot protection, token blacklisting, DB retry logic, frontend token storage, XSS vectors, password hash exposure, IP address leaks, email protection, CORS config, and dependency vulnerabilities.

**Red-flag email alerts** are sent automatically when any check fails.

### Additional Security Measures

- Helmet security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- HTTPS enforcement in production
- bcrypt password hashing
- Parameterized SQL queries (no string concatenation)
- Error reference IDs on all 500 responses (no stack traces exposed)
- `.env` and `node_modules` gitignored
- Sensitive fields excluded from all public API responses

---

## Performance

### Response Caching

In-memory cache with automatic invalidation reduces database load by ~90-95%:

| Endpoint Group | Cache TTL | Impact |
|---------------|-----------|--------|
| Stats (overview, trends, brand health, etc.) | 60 seconds | 7 endpoints, 2-10 parallel queries each |
| Figure lists (catalog, rankings, leaderboard) | 30 seconds | 3 endpoints returning all figures |
| Figure details (market intel, community metrics) | 15 seconds | Per-figure data |

- Cache key = full URL including query string
- `X-Cache: HIT/MISS` header on every response for debugging
- Automatically invalidated on all POST/PUT/DELETE mutations
- Periodic cleanup every 2 minutes

### Smart Polling

Frontend polling adapts to browser tab visibility:

- **Tab visible** — Normal polling intervals (notifications: 30s, room badges: 15s, chat: 5s)
- **Tab hidden** — All polling pauses (zero background requests)
- **Tab returns** — Immediate catch-up poll fires, then normal intervals resume

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

```bash
git clone https://github.com/Jonathan94110/data-toyz-terminal.git
cd data-toyz-terminal
npm install
```

Create a `.env` file in the project root:

```env
POSTGRES_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your-secret-key
NODE_ENV=production
ADMIN_USERNAME=your-admin-username
APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
SECURITY_ALERT_EMAIL=your-email@example.com
```

### Run

```bash
npm start
```

The app will be available at `http://localhost:3000`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the production server |
| `npm test` | Run 18 smoke tests against a running server |
| `npm run security-check` | Run the 32-check security audit |
| `npm run security-alert` | Send alert email if security issues detected |

---

## Project Structure

```
├── server.js              # Express app entry point & middleware stack
├── db.js                  # PostgreSQL pool, schema, retry logic
├── logger.js              # Structured logging
├── middleware/
│   ├── auth.js            # JWT auth, role-based access, token blacklist
│   ├── botProtection.js   # 3-layer anti-scraping (UA, rate limit, IP tracking)
│   ├── cache.js           # In-memory response cache with TTL
│   ├── rateLimiters.js    # API, auth, and message rate limiters
│   └── upload.js          # Multer image upload (5MB max)
├── routes/
│   ├── auth.js            # Registration, login, logout, password reset
│   ├── figures.js         # Figure CRUD, rankings, market data
│   ├── submissions.js     # Intelligence report submissions
│   ├── stats.js           # Market analytics & trends (cached)
│   ├── posts.js           # Community feed
│   ├── rooms.js           # Chat rooms & messaging
│   ├── users.js           # Profiles, follows, data export
│   ├── notifications.js   # In-app notifications
│   ├── admin.js           # Admin panel, backup, moderation
│   └── trade-advisor.js   # Trading insights
├── helpers/               # Shared utilities (config, notifications, error handler)
├── scripts/
│   ├── security-audit.js  # 32-check automated security scanner
│   └── security-alert.js  # Red-flag email sender (via Resend)
├── public/
│   ├── index.html         # SPA shell
│   ├── styles.css         # Global styles
│   └── js/
│       ├── app-core.js    # Router, auth, navigation, smart polling
│       └── views/         # View modules (19 views)
├── test/
│   └── smoke.test.js      # 18 endpoint smoke tests
├── .github/workflows/
│   ├── ci.yml             # CI pipeline (smoke tests on push)
│   └── security-scan.yml  # Scheduled security scans + email alerts
├── render.yaml            # Render deployment config
└── DEV_ROADMAP.md         # Development roadmap & changelog
```

---

## CI/CD

### CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push to `main` and `staging`:
1. Installs dependencies
2. Boots the server with test database
3. Runs 18 smoke tests (health check, security headers, auth, compression, endpoints)

### Security Scan (`.github/workflows/security-scan.yml`)

Runs twice daily (12 AM and 6 AM Pacific) plus on every push to `main`:
1. Runs the 32-check security audit
2. Sends a red-flag email alert if any checks fail or warn
3. Can be triggered manually from the GitHub Actions UI

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `POSTGRES_URL` | Database connection string (for CI tests) |
| `JWT_SECRET` | JWT signing key (for CI tests) |
| `RESEND_API_KEY` | Email sending (for security alerts) |
| `SECURITY_ALERT_EMAIL` | Recipient for security alert emails |

---

## Deployment

The app deploys automatically to [Render](https://render.com) on every push to `main`. A health check endpoint at `/api/health` monitors database connectivity, pool status, and uptime.

---

## License

ISC
