# Lynq — Production Load Testing & Benchmark Analysis

> **Target Stack:** **Vercel SPA (`https://lynq.nisargvekariya.me`)** + **Cloudflare → Render Express API (`https://api.lynq.nisargvekariya.me`)** + **L1 LRU RAM** + **Redis Cloud** + **Neon PostgreSQL**  
> **Load Engine:** **Grafana k6 (`v2.1.0`)** (`HTTP/2` protocol engine + native `k6/browser` Chromium Web Vitals)  
> **Back to Overview:** [README.md](README.md)

---

## Executive Conclusion & Verified Capacity Summary

- **Overall Verdict (`196,606` Live HTTP Requests Across `11 / 11` Suites):** Every executed production suite passed all configured k6 SLA thresholds (`exit code 0`) with **zero backend `5xx` errors** and **zero server crashes** up to the `300`-VU test ceiling.
- **Peak Requests Handled:**
  - **Full-Stack Peak Mix (`live:peak`, `120` VUs):** **`189.6` req/s (`~11,376` req/min)** — `44,748` requests in `3m 56s` with **`0.00%` backend API errors** (`29,368 / 29,368` API requests succeeded).
  - **Pure Redirects (`live:redirect`, `GET /:shortCode`, `50–100` VUs):** **`146.5` redirects/s** (`26,153` reqs, `338.8ms` avg, `99.91%` checks passed).
  - **Mixed Read/Write Stress (`live:stress`, `20–300` VUs, `70/30` split):** **`134.2` req/s** (`55,812` reqs in `6m 56s`, **`16,787` persisted PostgreSQL writes**, `99.96%` checks passed).
  - **Cached Analytics (`live:analytics`, `GET /api/info/:shortCode`, `25–50` VUs):** **`60.5` reads/s** (`9,861` reqs, `107.6ms` avg, `193.9ms` `p(95)`, **`0.00%` errors**).
  - **Sustained DB Writes (`live:shorten`, `POST /api/shorten`, `25` VUs):** **`48.7` writes/s** (`4,383` reqs, `177.0ms` avg, **`0.00%` errors**).
- **Concurrent Active Users Capacity (Tight-Loop k6 VUs):**
  - **Optimal Low-Latency Zone (`15–50` concurrent VUs / `~54–110` req/s):** Redirects average `110–168ms` (`p(95) < 460ms`), cached analytics average `107.6ms` (`p(95) 193.9ms`), and real Chromium **LCP** averages `1330.5ms` (`TTFB 146.0ms`).
  - **High-Load Zero-API-Error Zone (`50–120` concurrent VUs / `~110–190` req/s):** Zero backend API failures (`29,368` requests in `live:peak`), with avg latencies scaling cleanly to `482–616ms`.
  - **Extreme Burst & Stress Ceiling (`200–300` concurrent VUs / `~82–134` req/s):** Survived an instant `10 → 300`-VU spike (`0.00%` dropped requests, `11,142 / 11,142` valid `3xx` redirects) and a 7-minute stepped `300`-VU stress test (`99.96%` assertions passed), absorbing tail queueing cleanly (`~1.0–1.3s` avg, `~2.5–2.8s` `p(95)`) without crashing.
  - *(Note on VU-to-human equivalence: k6 Virtual Users run continuously with minimal `50–500ms` pauses, whereas human visitors pause multiple seconds between clicks—so `50–300` concurrent tight-loop VUs corresponds to substantially higher real-world user concurrency.)*

---

## Why Grafana k6 + Split-Origin Methodology

1. **Eliminates Vercel SPA False Positives**: Because Vercel rewrites `/(.*) -> /index.html` with `200 OK` HTML, naive single-URL flooders (`ab`, `wrk`, `hey`) only benchmark edge static HTML and falsely pass even if backend routes or redirects break.
2. **Coordinated Multi-Origin Traffic**: `load-tests/run-k6.mjs` drives traffic across **both** the Vercel frontend (`FRONTEND_URL`) and the Express API (`BASE_URL`), matching how the browser executes `/` and `/:shortCode` -> `/api/resolve/:shortCode` alongside direct API redirects (`GET BASE_URL/:shortCode`).
3. **Strict Protocol & Payload Verification**: `load-tests/utils/helpers.js` enforces real `3xx` status + `Location` headers on direct redirects (`checkRedirect`), JSON schema checks on `/api/resolve/:code`, `/api/info/:code`, `/api/shorten`, `/api/platform-stats`, and `/api/limits`, and genuine HTML shell checks on Vercel routes.
4. **Controlled & Clean Test Hygiene**: `run-k6.mjs` pre-warms `/api/health` before k6 timers start (preventing Render sleep/cold-start skew), generates safe Faker datasets filtering blocked TLDs/terms from `backend/services/securityService.js` so synthetic URLs never trigger phishing filters or Gemini scans, applies `TEST_EXPIRY_DAYS=1`, and auto-deletes owned seed links in `teardown()`. Live runs were executed inside an isolated `TESTING_MODE=true` window.

---

## Live Production Benchmark Scorecard (`196,606` Requests, `11 / 11` Suites Passed)

All `11` executed suites passed every configured k6 SLA threshold (`exit code 0`) against the live stack (`load-tests/reports/*-summary.json`):

| Suite | Profile / Concurrency | Duration | Requests & Throughput | HTTP Error Rate | Functional Checks | Latency / Web Vitals |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`live:smoke`** | `1` VU × `1` iter (full E2E + cleanup) | `2.3s` | `10` reqs | **`0.00%`** | `23 / 23` (`100%`) | Avg `153.1ms` · `p(95)` `292.8ms` |
| **`live:browser`** | `2` Chromium VUs × `4` iters | `25.1s` | `156` browser + `4` API `DELETE` | **`0.00%`** | `8 / 8` (`100%`) | **LCP** `1330.5ms` (`p(95)` `2606.4ms`) · **TTFB** `146.0ms` |
| **`live:quick`** | `15` VUs multi-origin mix | `~45s` | `2,693` (`54.2` RPS) | **`0.00%`** | `7,493 / 7,493` (`100%`) | Frontend `38.0ms` · Resolve `109.5ms` · `302` `109.7ms` · Shorten `176.0ms` |
| **`live:fullstack`** | `15 → 30 → 50` VUs (Vercel + API) | `3m 50s` | `25,452` (`110.4` RPS) | **`0.20%`** (`0.00%` API) | `99.78%` (`71,327 / 71,484`) | Resolve `168.4ms` (`p(95)` `454.8ms`) · `302` `167.7ms` · Shorten `287.7ms` |
| **`live:peak`** | `30 → 75 → 120` VUs (Vercel + API) | `3m 56s` | `44,748` (**`189.6` RPS**) | **`0.06%`** (`0.00%` API) | `99.93%` (`125,966 / 126,053`) | Resolve `482.4ms` (`p(95)` `1144.6ms`) · `302` `489.3ms` · Shorten `599.6ms` |
| **`live:redirect`** | `50 → 100` VUs (`GET /:shortCode`) | `2m 58s` | `26,153` (`146.5` RPS) | **`0.14%`** (`37 / 26,153`) | `99.91%` (`78,253 / 78,327`) | Redirect avg `338.8ms` · med `274.1ms` · `p(95)` `765.8ms` · `p(99)` `997.1ms` |
| **`live:analytics`** | `25 → 50` VUs (`GET /api/info/:code`) | `2m 43s` | `9,861` (`60.5` RPS) | **`0.00%`** | `29,472 / 29,472` (`100%`) | Analytics avg `107.6ms` · med `93.0ms` · `p(95)` `193.9ms` · `p(99)` `354.4ms` |
| **`live:shorten`** | `25` VUs sustained writes (`POST /api/shorten`) | `1m 30s` | `4,383` (`48.7` writes/s) | **`0.00%`** | `17,532 / 17,532` (`100%`) | Shorten avg `177.0ms` · med `159.1ms` · `p(95)` `387.8ms` · `p(99)` `745.6ms` |
| **`live:mixed`** | `15 → 40` VUs (`80%` `302` / `15%` shorten / `5%` info) | `3m 07s` | `16,160` (`86.2` RPS) | **`0.16%`** (`26 / 16,160`) | `99.89%` (`50,758 / 50,816`) | `302` `124.3ms` (`p(95)` `305.8ms`) · Shorten `183.0ms` · Analytics `220.3ms` |
| **`live:spike`** | `10 → 300 → 10` VUs instant burst (`5s` jump) | `2m 16s` | `11,174` (`82.4` RPS) | **`0.00%`** | `99.10%` (`100%` `3xx` · `300 > 5s`) | Avg `1291.1ms` · med `1349.4ms` · `p(95)` `2503.5ms` · `p(99)` `7097.2ms` |
| **`live:stress`** | `20 → 50 → 100 → 200 → 300` VUs (`70/30` mix) | `6m 56s` | `55,812` (`134.2` RPS) | **`0.05%`** (`30 / 55,812`) | `99.96%` (`184,069 / 184,138`) | Overall avg `972.9ms` · med `572.9ms` · `p(95)` `2754.8ms` · `p(99)` `3144.3ms` |

### Real Chromium Web Vitals (`live:browser`)

Measured via `k6/browser` launching headless Chromium against `https://lynq.nisargvekariya.me/` (`2` VUs × `4` iterations), filling and submitting the URL shortener form, verifying `#copy-btn` + `/stats/:shortCode` rendering, and cleaning up via `DELETE /api/shorten/:code`:

- **TTFB:** `146.0ms` avg (`81.9ms` median, `390.0ms` `p(95)`)
- **FCP:** `1285.0ms` avg (`1052.0ms` median, `2606.4ms` `p(95)`)
- **LCP:** `1330.5ms` avg (`1152.0ms` median, `2606.4ms` `p(95)`)
- **CLS:** `0.066` avg (`0.068` median)
- **Browser Sub-Requests:** `156 / 156` succeeded (`0` errors) + `4 / 4` cleanup `DELETE` calls succeeded.

*(The 64-minute `live:soak` endurance suite is configured and validated with `k6 inspect`, but was intentionally omitted from this live sweep.)*

---

## Engineering & Bottleneck Analysis

1. **Zero Backend API Dropouts Under `120`-VU Full-Stack Load (`live:fullstack` & `live:peak`)**:
   - In `live:fullstack` (`25,452` reqs) and `live:peak` (`44,748` reqs, peaking at `189.61` RPS), **100% of HTTP failures (`52 / 52` in `load`, `29 / 29` in `peak`) were single-client TCP read timeouts (`wsarecv`) fetching Vercel SPA HTML pages**. Across all **`16,788`** (`load`) and **`29,368`** (`peak`) backend API requests (`/api/resolve`, `/:code`, `/api/shorten`, `/api/info`, `/api/status`, `/api/platform-stats`, `/api/limits`), the Express API returned **`0.00%` failed requests** and **zero `5xx` errors**.
2. **`L1` LRU + Redis Cache Impact on Heavy Reads & Writes**:
   - **`GET /api/info/:shortCode` (`live:analytics`, `50` VUs)**: Sustained **`60.5` RPS** at **`107.6ms` avg / `193.9ms` `p(95)`** with **`0.00%` errors**, confirming that `L1` `infoL1Cache` + Redis Hashes shield Neon PostgreSQL from repeated `MATERIALIZED` CTE analytics scans.
   - **`POST /api/shorten` (`live:shorten`, `25` VUs)**: Sustained **`48.7` DB writes/s** at **`177.0ms` avg / `387.8ms` `p(95)`** with **`0.00%` errors**, benefiting from optimistic `INSERT` collision handling and decoupling click writes to Redis `analytics_queue`.
3. **High-Concurrency Tail Latency & Edge Keep-Alive Resets (`15 → 300` VUs)**:
   - **Instant Viral Spike (`live:spike`, `10 → 300` VUs in `5s`)**: **`0` dropped requests (`0.00%` HTTP error rate)** across `11,174` requests; every redirect (`11,142 / 11,142`) returned a valid `3xx + Location`. Queuing during the instant `300`-VU ramp pushed `300` responses (`2.69%`) past the `5,000ms` latency check (`max 11.67s`) before recovering back to baseline on ramp-down.
   - **Stepped Capacity (`live:stress`, `20 → 300` VUs, `70%` redirect / `30%` DB write)**: Handled **`55,812` requests (`16,787` persisted link creations)** at `972.9ms` avg (`2.75s` `p(95)`). All `30` HTTP errors (`0.05%`) were transient `wsarecv: An existing connection was forcibly closed by the remote host` socket resets during two 1-second bursts early in the ramp (`~28` & `~49` VUs); **from `50 → 300` VUs sustained, HTTP failures remained `0.00%`**.
4. **Deduplication & Ownership Isolation Under Automated Teardown**:
   - When seeded random test URLs matched active anonymous links created by earlier runs (`urls.json` pool reuse), `backend/services/urlService.js` reused the active short code (`isExisting: true`) while intentionally withholding `editToken` (`undefined`), leaving pre-existing links untouched during `cleanupSeedPool()` teardown (`7/25` or `6/25` self-created links deleted).

---

## Running the Suite

*(Scripts live inside the local `load-tests/` directory; install Grafana k6 first via `winget install k6 --source winget` on Windows.)*

```bash
cd load-tests
npm install

# Live production smoke check + self-cleanup
npm run live:smoke

# Split full-stack benchmarks (Vercel SPA + Render API) & real Chromium Core Web Vitals
npm run live:quick
npm run live:fullstack
npm run live:peak
npm run live:browser

# Individual endpoint & capacity suites (respecting PROD_MAX_STRESS_VUS=300 / PROD_MAX_SPIKE_VUS=300)
npm run live:redirect
npm run live:analytics
npm run live:shorten
npm run live:mixed
npm run live:stress
npm run live:spike
```

> [!IMPORTANT]
> Set **`TESTING_MODE=false`** on the production backend as soon as load testing completes so guest quotas (`3/min`, `5/hr`, `10/day`, max `10` active links) and strict security defaults remain enforced.

