<div align="center">

  # <img src="frontend/public/logo.png" width="32" height="32" alt="Logo" /> Lynq — Scaled URL Shortener & 3D Link Intelligence

  **Live Demo: [lynq.nisargvekariya.me](https://lynq.nisargvekariya.me)**

  [![Vite 8](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![React 18](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)
  [![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
  [![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)](https://clerk.com/)
  [![Google Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
  [![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)

</div>

<br />

> **Full-stack URL shortener and real-time analytics platform built with React 18, Express, multi-tier L1 + Redis caching, Neon PostgreSQL, Clerk auth, Three.js WebGL globes, and Google Gemini AI.** Engineered for instant guest onboarding and full cloud portfolio management—free with zero paywalls.

---

## System Architecture

Lynq decouples hot-path link resolution from heavy analytics writes by layering an in-process LRU memory cache (`L1`) in front of Redis Cloud (`L2`), asynchronous Redis list queuing (`analytics_queue`), and batched PostgreSQL writes (`analyticsWorker.js`):

```mermaid
flowchart TB
    Client([Client / Browser])

    subgraph Web[React + Vite Frontend]
        UI[Home Dashboard / Custom QR Studio / Cmd+K Search]
        Globe[Stats 3D Globe / Preview / Unlock Pages]
    end

    subgraph Core[Express.js Backend]
        Auth[Clerk Auth / Rate Limiters / Security Shield]
        API[REST API & Redirect Engine]
        L1["L1 LRU Cache + Singleflight + 404 Shield (utils/dbCache.js)"]
        SSE[EventBus SSE Stream]
        Worker["Analytics Worker (5s tick, up to 500 events/batch)"]
    end

    subgraph Cache[Redis Cloud Layer]
        RL[Per-Device & Per-Account Rate Counters]
        Hash[URL Hash Cache & 5m Status / 7d AI Cache]
        Queue[analytics_queue + 2s click_dedup]
    end

    subgraph DB[PostgreSQL Neon Layer]
        UrlsTable[(urls + 6 indexes)]
        UniqueTable[(unique_visitors)]
        HistoryTable[(click_history + 2 indexes)]
    end

    Gemini([Google Gemini 2.5 Flash])

    Client --> UI
    UI -->|REST + JWT| Auth --> API
    Client -->|GET /:shortCode| API

    API --> L1
    L1 <-->|Miss| Hash
    L1 <-->|Miss / Singleflight| UrlsTable

    API -->|2s Dedup + RPUSH| Queue
    API -.->|302 Redirect or /unlock/:code| Client

    Worker -->|LRANGE + LTRIM| Queue
    Worker -->|Batch INSERT + UNNEST + UPDATE| UrlsTable
    Worker -->|Bulk INSERT| UniqueTable
    Worker -->|Multi-row INSERT| HistoryTable
    Worker -->|Emit click:code| SSE -.->|EventSource| Globe

    API <-->|Phishing Scan / Alias & Title Suggest / TL;DR| Gemini
```

### Database & Caching Engineering

Every layer on the read, write, search, and analytics paths is optimized to minimize database round-trips and tail latency:

- **L1 Bounded $O(1)$ LRU Cache (`backend/utils/dbCache.js`)**: Separate in-memory TTL caches (`urlL1Cache` 2,500 entries, `infoL1Cache` 600 entries, `statsL1Cache` 32 entries) serve repeated lookups in sub-millisecond RAM without TCP hops.
- **Singleflight Request Coalescing (`singleflight`)**: Collapses concurrent cache-miss requests for the same key into a single Redis/PostgreSQL flight to prevent cache stampedes.
- **Negative 404 Shield (`url_missing:<shortCode>`)**: Caches unknown short codes for 15 seconds in both L1 RAM and Redis so typo/scanner floods do not hit PostgreSQL.
- **Single-Pass `MATERIALIZED` CTE Analytics (`getUrlInfo`)**: Collapses 11 sequential fan-out analytics queries (summary, time-series buckets, devices, countries, states/regions, cities, browsers, OS, referrers, geo-points, and unique visitors) into **1 PostgreSQL query** per uncached `/api/info/:shortCode` request.
- **Set-Based PostgreSQL `UNNEST` Batching**:
  - `bulkShortenUrls`: Validates up to 100 CSV rows, performs parallel duplicate/collision checks, executes a single `UNNEST` multi-row `INSERT`, and warms Redis via `multi()` pipelines.
  - `handleClaimLinks`: Transfers guest links to an authenticated user account and clears `device_id` in one atomic `UNNEST` statement.
  - `analyticsWorker.js`: Drains up to 500 queued click events every 5 seconds with 2-second duplicate suppression (`click_dedup`), batch-inserts `click_history` and `unique_visitors`, atomically increments click counts, invalidates stale caches, and emits real-time SSE events.
- **Optimistic `INSERT` Collision Retry**: Standard link shortening inserts directly and retries only on PostgreSQL `23505` unique-constraint conflicts, eliminating pre-insert `SELECT` round-trips.
- **Targeted Composite & Partial Indexes (`backend/config/db.js`)**: 9 indexes covering active user links, duplicate detection, guest device quotas, country counts, expiry sweeps, and sorted click timelines, plus transparent transient-connection retry for serverless Neon compute wakes.

---

## Key Features

### Analytics, Telemetry & Visualization
- **Interactive 3D Spherical Globe (`/stats/:shortCode`)**: WebGL country hex-polygon globe built with `react-globe.gl` and `three`, paired with Top States/Regions sidebars and interactive city markers using `geoip-lite` offline GeoIP resolution.
- **Live Server-Sent Events (SSE) Click Pulse**: Streams incoming clicks live to open `/stats/:shortCode` dashboards via `EventSource` (`GET /api/live/:shortCode`).
- **Deep Telemetry Breakdowns**: Tracks total vs. unique clicks (`visitor_hash`), hourly/daily trends (Recharts), countries, regions/states, cities, device types (`desktop`, `mobile`, `tablet`), browsers, OS (`ua-parser-js`), and acquisition referrers—including preserved referrers through password-protected `/unlock/:shortCode` redirects.
- **1-Click CSV Export**: Downloads full historical `click_history` records via `GET /api/analytics/:shortCode/export`.

### Security, Phishing Shield & Controls
- **Multi-Layer URL & Phishing Shield (`securityService.js` & `validator.js`)**:
  - Blocks private/loopback SSRF targets (`localhost`, `127.0.0.1`, `::1`, `10.x`, `172.16–31.x`, `192.168.x`).
  - Blocks known malicious domains, shortener chains (`bit.ly`, `tinyurl.com`, `t.co`, etc.), high-risk TLDs (`.zip`, `.mov`, `.top`, `.tk`, `.click`, etc.), typosquatted brands (`paypa1`, `g00gle`, etc.), and spam keywords.
  - Triggers a **Google Gemini 2.5 Flash** credential-phishing scan (with a 2.5s fail-safe timeout guard) when URLs or titles contain credential-sensitive terms (`login`, `signin`, `verify-account`, `wallet-connect`, etc.).
- **Password Protection (`/unlock/:shortCode`)**: Optional Bcrypt-hashed (`cost 10`) passwords for signed-in links with clean unlock UI and suppressed search bar on unlock routes.
- **Auto-Destruct & Expirations**: Configure links to expire after a set number of days (`1–7` days for guests, `1–365` days for signed-in users) or after reaching a `maxClicks` unique-visitor threshold (signed-in).
- **Destination Health Monitor (`statusService.js`)**: Checks target URL liveness (`HEAD` request with 6s timeout, Redis-cached for 5 minutes) and surfaces live health badges on `/stats/:code`, `/preview/:code`, and dashboard link rows.
- **HTTP Hardening**: `helmet`, HTTPS enforcement (`enforceHttps`), CORS origin allowlisting, gzip compression, and proxy trust (`trust proxy`).

### AI Productivity & Custom QR Studio
- **AI Auto-Fill (`POST /api/ai/suggest`)**: Extracts page titles/descriptions (with YouTube oEmbed support + HTML metadata scraping fallback) and prompts Gemini 2.5 Flash to generate a clean title, SEO custom alias, and comma-separated tags.
- **AI Alias Alternatives (`POST /api/ai/suggest-aliases`)**: Suggests available aliases filtered against active PostgreSQL records when a requested custom alias is taken.
- **AI 2-Sentence Preview Summaries (`GET /api/ai/summary/:shortCode`)**: Summarizes destinations on `/preview/:shortCode` and `/stats/:shortCode`, cached in Redis for 7 days.
- **Custom QR Code Studio (`QRCodeCard.jsx` + `ColorPicker.jsx`)**: Customize foreground and background colors using an interactive HSV canvas + EyeDropper picker, toggle transparent background, switch between Square and Round module dots, upload a center logo overlay, and export crisp **1024×1024 PNG** QR codes.

### Accounts, Sync, Search & Bulk Operations
- **Seamless Guest Mode + Auto Cloud Sync**: Start shortening immediately without logging in. Signing in via **Clerk** automatically migrates guest links (`editToken` + `device_id`) to your user account via `POST /api/user/claim-links`, clears non-login local guest tracking (`lynq-recent`, `lynq_device_id`), and switches limits from per-device to per-account.
- **Hybrid N-Gram Indexed Search (`frontend/src/utils/urlSearch.js`)**: Builds an in-memory 1-char / 2-gram / 3-gram sorted inverted index with an $O(1)$ exact-alias lookup table, skewed binary-search / two-pointer intersections, relevance scoring, and a 64-entry LRU query cache. Powers both the dashboard search bar (`RecentUrls.jsx`) and the global `Cmd+K` / `Ctrl+K` **Command Palette**.
- **Bulk CSV Engine (`BulkUpload.jsx`)**: Drag and drop CSV files up to **100 links** (up to 5 batches/hour) processed in a single PostgreSQL `UNNEST` batch, complete with preview table and downloadable sample CSV.
- **Editable Targets & Active Deduplication**: Edit destination URLs anytime (validated via `user_id` or `editToken`), reuse active identical non-password URLs to avoid bloat, and toggle Dark / Light modes across the entire UI.
- **Smart Dynamic Routing (API)**: `POST /api/shorten` and `PUT /api/shorten/:shortCode` accept an optional `routingRules` JSON payload supporting device-specific targets (`device.ios`, `device.android`, `device.desktop`), expiration/max-click `fallbackUrl`, and weighted A/B `splitTest` variants.

---

## Tiered Quotas & Rate Limits

All limits are enforced via Redis-backed `express-rate-limit` counters keyed by **device hash** (`device:<md5(ip + ua)>`) for guests and **Clerk user ID** (`user:<userId>`) for signed-in accounts:

| Capability | Guest Mode (Per Device) | Signed-In Account (Per Login) |
| :--- | :--- | :--- |
| **Shorten Burst Limit** | `3` / minute | `20` / minute |
| **Shorten Hourly Limit** | `5` / hour | `100` / hour |
| **Shorten Daily Limit** | `10` / day | `500` / day |
| **General API Limit** | `40` requests / min | `120` requests / min |
| **Max Active Stored Links** | `10` per device | Unlimited |
| **Max Link Expiry** | `7` days | `365` days |
| **AI Summaries (`/preview` & `/stats`)** | `20` / hour | `120` / hour |
| **Custom Aliases, Passwords, Tags, Max Clicks** | Locked (Sign in required) | Included |
| **Bulk CSV Upload (100 rows)** | Locked | `5` batches / hour |
| **AI Auto-Fill & Alias Alternatives** | Locked | `30` requests / hour |
| **Global `Cmd+K` Command Palette** | Hidden | Included |

---

## REST API Reference

Base prefix: `/api` (plus root `/:shortCode` redirect). Routes marked **Auth** require a valid Clerk JWT via `requireAuth`; routes marked **Optional Auth** apply `user:<id>` when signed in or `device:<hash>` for guests.

### Health & Platform

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Basic API active status payload. |
| `GET` | `/api/health` | Public | Live PostgreSQL (`SELECT 1`) & Redis (`PING`) health status. |
| `GET` | `/api/platform-stats` | Public | Cached platform counters (`totalLinks`, `totalRedirects`, `countriesCount`) + live Redis ping latency. |
| `GET` | `/api/limits` | Optional Auth | Tier limits, current Redis usage, and remaining quota counts for caller (`device` or `user`). |

### Core Links, Redirects & Telemetry

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/shorten` | Optional Auth | Create a short URL (rate-limited `min`/`hr`/`day`; guests restricted to `1–7d` expiry & standard URLs). |
| `POST` | `/api/bulk-shorten` | Auth | Bulk-shorten up to 100 CSV link objects via single `UNNEST` batch (`5` batches/hr). |
| `PUT` | `/api/shorten/:shortCode` | Optional Auth | Edit destination URL and optional `routingRules` (owner via Clerk `userId` or `editToken`). |
| `DELETE` | `/api/shorten/:shortCode` | Optional Auth | Delete a short link and purge L1 + Redis caches (owner via Clerk `userId` or `editToken`). |
| `GET` | `/api/info/:shortCode` | Public | Single-pass CTE analytics & metadata (cached in L1 RAM + Redis). |
| `GET` | `/api/analytics/:shortCode/export` | Public | Download historical `click_history` rows as CSV. |
| `GET` | `/api/live/:shortCode` | Public | Server-Sent Events (`text/event-stream`) live click pulse stream. |
| `GET` | `/api/check-alias/:alias` | Public | Check custom alias availability via L1 + Redis + PostgreSQL. |
| `GET` | `/api/status/:shortCode` | Public | Live HTTP `HEAD` liveness & response-time check for the target URL (5-minute Redis cache). |
| `POST` | `/api/verify/:shortCode` | Public | Verify Bcrypt password for protected links, record click/GeoIP telemetry (with preserved referrer), and emit SSE. |
| `GET` | `/api/resolve/:shortCode` | Public | JSON resolve + async click queueing fallback for SPA routes. |
| `GET` | `/:shortCode` | Public | Core HTTP `302` redirect (or `302` to `${FRONTEND_URL}/unlock/:shortCode` if password-protected). |

### AI Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/suggest` | Auth | Generate SEO title, tags, and custom alias via Gemini 2.5 Flash + YouTube oEmbed/HTML scraper (`30`/hr). |
| `POST` | `/api/ai/suggest-aliases` | Auth | Generate available custom alias alternatives verified against PostgreSQL (`30`/hr). |
| `GET` | `/api/ai/summary/:shortCode` | Optional Auth | Generate/fetch 2-sentence destination TL;DR summary cached 7 days in Redis (`20`/hr guest, `120`/hr user). |

### User Portfolio & Sync

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/user/claim-links` | Auth | Atomically claim guest `editToken` links + `deviceId` links via `UNNEST` and clear guest `device_id`. |
| `GET` | `/api/user/links` | Auth | Fetch all short links belonging to the authenticated user. |
| `GET` | `/api/user/analytics/summary` | Auth | Aggregate account-wide clicks, active/total link counts, and top 3 links. |

---

## Frontend Routes

| Route | Component | Purpose |
| :--- | :--- | :--- |
| `/` | `Home.jsx` | Guest landing hero + shortener, or signed-in dashboard (`Your links`, `BulkUpload`, `User Setting` Clerk profile). |
| `/stats/:shortCode` | `Stats.jsx` | Full analytics suite with 3D WebGL globe, state/city breakdowns, live SSE feed, AI TL;DR, server status, and CSV export. |
| `/preview/:shortCode` | `Preview.jsx` | Safe link inspection before visiting, displaying destination health (`HEAD` latency) and Gemini 2-sentence summary. |
| `/unlock/:shortCode` | `Unlock.jsx` | Password prompt screen for protected links (tracks preserved referrer on unlock; hides search shortcut). |
| `/:shortCode` | `RedirectHandler.jsx` | Client-side redirect fallback resolving short codes via `/api/resolve/:shortCode`. |
| `/404` / `*` | `NotFound.jsx` | Custom expired / not-found error page. |

---

## Project Structure

```text
Lynq/
├── backend/                     # Node.js + Express ESM API
│   ├── config/                  # db.js (PostgreSQL + 9 indexes), redis.js, env.js, eventBus.js
│   ├── controllers/             # aiController, bulkController, statusController, urlController, userController
│   ├── middlewares/             # auth.js (Clerk), rateLimiter.js (Tiered Redis), security.js, errorHandler.js
│   ├── routes/                  # aiRoutes.js, urlRoutes.js, userRoutes.js
│   ├── services/                # urlService, bulkService, aiService, securityService, statusService
│   ├── utils/                   # dbCache.js (L1 LRU + Singleflight + Negative Shield), telemetry.js, validator.js, codeGenerator.js
│   ├── workers/                 # analyticsWorker.js (5s queue consumer + UNNEST batches + SSE emit)
│   ├── server.js                # Express app bootstrap & route registration
│   ├── .env.example             # Backend environment template
│   └── package.json
├── frontend/                    # React 18 + Vite 8 Web Application
│   ├── public/                  # logo.png, favicon.svg, GeoJSON globe dataset
│   ├── src/
│   │   ├── components/          # UrlInput, BulkUpload, RecentUrls, Analytics, QRCodeCard, ColorPicker,
│   │   │                        # GlobeView, CommandPalette, LandingSections, ConnectionStatus, AppHeader, AppFooter
│   │   ├── context/             # AuthContext.jsx (Clerk session sync & auto guest link claiming)
│   │   ├── hooks/               # useLocalStorage.js, useTheme.js, useToast.js
│   │   ├── pages/               # Home, Stats, Preview, Unlock, RedirectHandler, NotFound
│   │   ├── services/            # api.js (Axios + Clerk JWT + device ID header)
│   │   ├── utils/               # urlSearch.js (Inverted n-gram search), geoCoordinates.js, telemetry.js, csv.js
│   │   ├── App.jsx              # Router & global Cmd+K CommandPalette
│   │   └── main.jsx             # Root entry + ClerkProvider theme configuration
│   ├── vite.config.js           # Vite dev proxy (/api -> 127.0.0.1:5000)
│   ├── vercel.json              # Vercel SPA rewrite configuration
│   ├── .env.example             # Frontend environment template
│   └── package.json
├── .gitignore
└── README.md
```

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** `v18+` (recommended `v20+`)
- **PostgreSQL** connection URL (e.g., Neon serverless or local Postgres)
- **Redis** instance (e.g., Redis Cloud or local Redis server)
- **Clerk** account (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`) for authentication & user dashboard features *(optional: omit Clerk keys to run in guest/single-mode fallback)*
- **Google Gemini API Key** (`GEMINI_API_KEY`) for AI auto-fill, alias suggestions, summaries, and AI phishing checks *(optional: degrades gracefully without it)*

### 1. Clone & Install

```bash
git clone https://github.com/zevrik/Lynq.git
cd Lynq

# Install Backend dependencies
cd backend
npm install

# Install Frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Create `backend/.env` from the template:

```bash
cp backend/.env.example backend/.env
```

#### Backend Variables (`backend/.env`)

| Variable | Required | Default / Example | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `5000` | Express server port. |
| `NODE_ENV` | No | `development` | `development` or `production` (enables HTTPS redirect behind proxy). |
| `BASE_URL` | No | `http://localhost:5000` | Public backend origin for CORS allowlist. |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Frontend origin used in generated short URLs, unlock redirects & CORS. |
| `DATABASE_URL` | Yes | `postgresql://...` | PostgreSQL connection string (`ssl` enabled in `db.js`). |
| `REDIS_HOST` | Yes | `localhost` | Redis host address. |
| `REDIS_PORT` | Yes | `6379` | Redis port number. |
| `REDIS_USERNAME` | No | `default` | Redis ACL username. |
| `REDIS_PASSWORD` | No | `""` | Redis password (required for authenticated Redis Cloud). |
| `SHORT_CODE_LENGTH` | No | `6` | Default generated short code length (`nanoid`). |
| `CLERK_PUBLISHABLE_KEY` | Optional | `pk_test_...` | Clerk publishable key for JWT verification middleware. |
| `CLERK_SECRET_KEY` | Optional | `sk_test_...` | Clerk secret key enabling authenticated endpoints & quotas. |
| `GEMINI_API_KEY` | Optional | `AIza...` | Google Gemini API key (`gemini-2.5-flash`). |
| `TESTING_MODE` | Optional | `false` | Set `true` during testing to bypass rate limits, guest link/expiry caps, bulk row cap, `localhost` SSRF blocks, and enable `x-test-user-id` auth (legacy `LOAD_TEST_MODE=true` also accepted). |

#### Frontend Variables (`frontend/.env`, optional in local dev)

| Variable | Required | Default / Behavior | Description |
| :--- | :--- | :--- | :--- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Optional | Enables Clerk Sign-In & Profile UI | If omitted, frontend runs in instant guest shortener mode. |
| `VITE_API_URL` | No | `/api` | Proxied to `http://127.0.0.1:5000` in Vite dev; set to your deployed backend `/api` URL in split deployments (e.g., Vercel). |
| `VITE_TESTING_MODE` | Optional | `false` | Set `true` during testing to unlock unlimited UI expiry, advanced guest options, 5,000-row bulk CSV, and simulated `?testUser=<id>` auth without Clerk OTP/CAPTCHA. |

### 3. Start Backend & Frontend

**Terminal 1 — Backend:**

```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

Open **`http://localhost:5173`** in your browser!
