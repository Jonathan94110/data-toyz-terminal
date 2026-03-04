# Data Toyz Terminal

**Trade Value & Risk Terminal for Collectible Action Figures**

[datatoyz.com](https://datatoyz.com)

---

## Overview

Data Toyz Terminal is a collaborative market intelligence platform built for collectors, traders, and analysts of collectible action figures. It provides real-time trade value assessments, community-driven grading, market analytics, and social features — all wrapped in an immersive intelligence-themed interface.

---

## Features

### Market Intelligence

- **Figure Database** — Search, catalog, and manage action figures across brands and lines with mandatory MSRP on registration
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

- **Feed** — Broadcast posts with sentiment tagging, image attachments, threaded replies, reactions, and @mentions
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

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript SPA, Chart.js, CSS custom properties |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Auth | JWT (30-day tokens with silent renewal) |
| Email | Resend API |
| Security | Helmet, CORS, bcrypt, express-rate-limit |
| Deployment | Render (auto-deploy from `main`) |

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
ADMIN_USERNAME=your-admin-username
APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Run

```bash
npm start
```

The app will be available at `http://localhost:3000`.

---

## Project Structure

```
├── server.js              # Express app entry point
├── db.js                  # PostgreSQL connection pool
├── middleware/
│   └── auth.js            # JWT auth & role-based access control
├── routes/
│   ├── auth.js            # Registration, login, password reset
│   ├── figures.js         # Figure CRUD, rankings, market data
│   ├── submissions.js     # Intelligence report submissions
│   ├── stats.js           # Market analytics & trends
│   ├── posts.js           # Community feed
│   ├── rooms.js           # Chat rooms & messaging
│   ├── users.js           # Profiles, follows, data export
│   ├── notifications.js   # In-app notifications
│   ├── admin.js           # Admin panel endpoints
│   └── trade-advisor.js   # Trading insights
├── helpers/               # Shared utilities
├── public/
│   ├── index.html         # SPA shell
│   ├── styles.css         # Global styles
│   └── js/
│       ├── app-core.js    # Router, auth, navigation
│       └── views/         # View modules (19 views)
├── test/                  # Smoke tests
├── render.yaml            # Render deployment config
└── DEV_ROADMAP.md         # Development roadmap & changelog
```

---

## Deployment

The app deploys automatically to [Render](https://render.com) on every push to `main`. A health check endpoint at `/api/health` monitors database connectivity.

---

## License

ISC
