import { useState, useEffect } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { getPlatformStats } from '../services/api.js';
import Analytics from './Analytics.jsx';
import styles from './LandingSections.module.css';

const NOW_MS = Date.now();
const DAY_MS = 86_400_000;

const SHOWCASE_DEMO_DATA = {
  shortCode: 'launch',
  shortUrl: 'https://lynq.app/launch',
  originalUrl: 'https://lynq.nisargvekariya.me/blog/platform-launch-2026',
  title: 'Lynq 2026 Platform Launch',
  clicks: 48291,
  uniqueVisitors: 39104,
  bucketInterval: 'day',
  countries: [{ country: 'US', count: 18420 }],
  referrers: [{ referrer: 'x.com', count: 20280 }],
  history: [
    { bucket: new Date(NOW_MS - 6 * DAY_MS).toISOString(), total_clicks: 4120, unique_clicks: 3390 },
    { bucket: new Date(NOW_MS - 5 * DAY_MS).toISOString(), total_clicks: 5280, unique_clicks: 4310 },
    { bucket: new Date(NOW_MS - 4 * DAY_MS).toISOString(), total_clicks: 6140, unique_clicks: 4980 },
    { bucket: new Date(NOW_MS - 3 * DAY_MS).toISOString(), total_clicks: 5890, unique_clicks: 4720 },
    { bucket: new Date(NOW_MS - 2 * DAY_MS).toISOString(), total_clicks: 7640, unique_clicks: 6180 },
    { bucket: new Date(NOW_MS - 1 * DAY_MS).toISOString(), total_clicks: 9120, unique_clicks: 7340 },
    { bucket: new Date(NOW_MS).toISOString(), total_clicks: 10101, unique_clicks: 8184 },
  ],
  liveSample: {
    country: 'GB',
    city: 'London',
    browser: 'Chrome',
    device: 'macOS',
  },
};

export default function LandingSections({ hasClerk, theme, onScrollToInput }) {
  const [platformStats, setPlatformStats] = useState({
    totalLinks: null,
    totalRedirects: null,
    countriesCount: null,
    latencyMs: null,
    uptime: '99.99%',
  });

  useEffect(() => {
    let isMounted = true;
    getPlatformStats()
      .then((res) => {
        if (isMounted && res && res.stats) {
          setPlatformStats(res.stats);
        }
      })
      .catch((err) => {
        console.warn('Could not load live platform stats:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const formatStat = (val, hasPlus = true) => {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M+`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K+`;
    return hasPlus && num > 0 ? `${num}+` : `${num}`;
  };
  return (
    <div className={styles.wrapper}>
      {/* ── 1. Trust Badges Bar ─────────────────────────────── */}
      <section className={styles.trustBar}>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>⚡</span>
          <div>
            <div className={styles.trustTitle}>L1 + Redis Caching</div>
            <div className={styles.trustSub}>Sub-15ms redirects &amp; stampede shield</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>🛡️</span>
          <div>
            <div className={styles.trustTitle}>AI Phishing Defense</div>
            <div className={styles.trustSub}>Gemini 2.5 Flash + TLD &amp; SSRF guards</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>📡</span>
          <div>
            <div className={styles.trustTitle}>Live SSE Pulse</div>
            <div className={styles.trustSub}>Real-time click stream via EventSource</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>🌐</span>
          <div>
            <div className={styles.trustTitle}>3D GeoIP Globe</div>
            <div className={styles.trustSub}>Offline country, state, city &amp; OS metrics</div>
          </div>
        </div>
      </section>

      {/* ── 2. Bento Features Grid ("Everything you need") ──── */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Platform Superpowers</span>
          <h2 className={styles.sectionTitle}>Everything you need to manage &amp; grow links</h2>
          <p className={styles.sectionSubtitle}>
            Engineered for creators, developers, and teams. Built on PostgreSQL, Redis, Clerk, Three.js, and Gemini AI.
          </p>
        </div>

        <div className={styles.bentoGrid}>
          {/* Row 1 Left (2 cols): 3D Globe & Live Telemetry */}
          <div className={`${styles.bentoCard} ${styles.bentoCardWide}`}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockChart}>
                <div className={styles.mockChartHeader}>
                  <span>Click Activity &amp; 3D WebGL Globe Telemetry</span>
                  <span className={styles.liveTag}>● Live Pulse</span>
                </div>
                <div className={styles.mockBars}>
                  <div className={styles.mockBar} style={{ height: '35%' }} />
                  <div className={styles.mockBar} style={{ height: '48%' }} />
                  <div className={styles.mockBar} style={{ height: '62%' }} />
                  <div className={styles.mockBar} style={{ height: '45%' }} />
                  <div className={styles.mockBar} style={{ height: '85%' }} />
                  <div className={styles.mockBar} style={{ height: '95%' }} />
                  <div className={styles.mockBar} style={{ height: '70%' }} />
                  <div className={styles.mockBar} style={{ height: '100%' }} />
                </div>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>📊</div>
              <h3 className={styles.bentoTitle}>3D Spherical Globe &amp; Live SSE Telemetry</h3>
              <p className={styles.bentoDesc}>
                Visualize country &amp; state visit density on an interactive Three.js 3D hex-polygon globe on <code>/stats/:code</code>, alongside devices, browsers, OS, referrers, live SSE pulses, and 1-click CSV export.
              </p>
            </div>
          </div>

          {/* Row 1 Right (1 col): AI Anti-Phishing, Bcrypt Password & Auto-Destruct */}
          <div className={styles.bentoCard}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockSecurityBadge}>
                <span className={styles.shieldIcon} aria-hidden="true">🛡️</span>
                <div>
                  <div className={styles.securityTitle}>Verified Safe</div>
                  <div className={styles.securitySub}>Gemini Guard · Bcrypt · SSRF Block</div>
                </div>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>🔒</div>
              <h3 className={styles.bentoTitle}>Phishing Shield, Lock &amp; Self-Destruct</h3>
              <p className={styles.bentoDesc}>
                Blocks risky TLDs (<code>.zip</code>, <code>.top</code>), typosquatting (<code>paypa1</code>), shortener chains, and private-IP SSRF. Protects private links via Bcrypt (<code>/unlock/:code</code>) and expiry by days or max clicks.
              </p>
            </div>
          </div>

          {/* Row 2 Left (1 col): Custom QR Code Studio */}
          <div className={styles.bentoCard}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockQrMini}>
                <div className={styles.mockQrGrid}>
                  <div className={styles.qrCorner} />
                  <div className={styles.qrCorner} style={{ marginLeft: 'auto' }} />
                  <div className={styles.qrCenter}>L</div>
                  <div className={styles.qrCorner} style={{ marginTop: 'auto' }} />
                </div>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>📱</div>
              <h3 className={styles.bentoTitle}>Custom QR Code Studio</h3>
              <p className={styles.bentoDesc}>
                Customize foreground and background colors via an HSV picker with EyeDropper, toggle transparency, switch Square or Round dots, embed a center logo, and export 1024px PNGs.
              </p>
            </div>
          </div>

          {/* Row 2 Right (2 cols): AI Auto-Fill, Summaries & Health Monitor */}
          <div className={`${styles.bentoCard} ${styles.bentoCardWide}`}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockAiSummary}>
                <div className={styles.mockAiHeader}>
                  <span>✨ AI Destination Preview &amp; Health Monitor</span>
                  <span className={styles.mockAiBadge}>Redis Cached · HEAD Check</span>
                </div>
                <p className={styles.mockAiText}>
                  &ldquo;Auto-fills titles, tags, and available custom aliases with Gemini 2.5 Flash, while <code>/preview/:code</code> verifies live destination uptime.&rdquo;
                </p>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>🤖</div>
              <h3 className={styles.bentoTitle}>AI Auto-Fill, Link Previews &amp; Health Status</h3>
              <p className={styles.bentoDesc}>
                Generate SEO titles, tags, and available custom alias alternatives automatically, inspect 2-sentence AI TL;DR summaries on <code>/preview/:code</code> &amp; <code>/stats/:code</code>, and monitor live destination <code>HEAD</code> latency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Live Showcase ("See Lynq in Action") ──────────── */}
      <section id="showcase" className={styles.section}>
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseLeft}>
            <h2 className={styles.sectionTitle}>See Lynq in action with live streaming analytics</h2>
            <p className={styles.sectionSubtitle} style={{ textAlign: 'left' }}>
              Incoming clicks read from L1 RAM &amp; Redis Hashes and stream live while a 5-second worker commits batches via single-pass PostgreSQL queries.
            </p>

            <ul className={styles.checkList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Live SSE Click Pulse &amp; 3D Globe:</strong> Stream real-time clicks straight to your browser and explore traffic on an interactive 3D hex-polygon globe.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Offline GeoIP &amp; Private Link Tracking:</strong> Capture country, region, city, browser, OS, and preserved referrer even through password-protected <code>/unlock/:code</code> pages.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>1-Click CSV &amp; Destination Uptime:</strong> Export full historical telemetry to CSV and inspect live target server health checks anytime.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Automatic Guest-to-Cloud Sync:</strong> Shorten links right away as a guest; signing in automatically transfers your links to your cloud dashboard.
                </div>
              </li>
            </ul>

            <div className={styles.showcaseCta}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onScrollToInput}
                data-tooltip="Scroll up to shorten your own URL"
              >
                Try Live Shortener Now ↑
              </button>
            </div>
          </div>

          <div className={styles.showcaseRight}>
            <Analytics
              data={SHOWCASE_DEMO_DATA}
              theme={theme}
              isDemo
            />
          </div>
        </div>
      </section>

      {/* ── 4. Guest vs Cloud Account Access Tiers ─────────── */}
      <section id="tiers" className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>100% Free Plans</span>
          <h2 className={styles.sectionTitle}>Start instantly as a guest or unlock everything free</h2>
          <p className={styles.sectionSubtitle}>
            No paywalls or subscriptions. Sign in with Clerk anytime to lift per-device caps and automatically import your guest links.
          </p>
        </div>

        <div className={styles.tiersGrid}>
          <div className={styles.tierCard}>
            <div className={styles.tierTopRow}>
              <h3 className={styles.tierName}>Guest Mode</h3>
              <span className={styles.tierBadge}>Per Device · No Login</span>
            </div>
            <div className={styles.tierPriceRow}>
              <span className={styles.tierPrice}>$0</span>
              <span className={styles.tierPriceSub}>Instant access</span>
            </div>
            <p className={styles.tierDesc}>
              Shorten links immediately from your browser without creating an account.
            </p>
            <ul className={styles.tierList}>
              <li><span className={styles.tierListIcon}>✓</span><strong>3/min · 5/hr · 10/day</strong> per-device rate limits</li>
              <li><span className={styles.tierListIcon}>✓</span>Up to <strong>10 active saved links</strong> &amp; <strong>7-day max expiry</strong></li>
              <li><span className={styles.tierListIcon}>✓</span>Custom QR Studio (HSV colors, shapes, logo, PNG)</li>
              <li><span className={styles.tierListIcon}>✓</span>Live SSE &amp; 3D Globe telemetry + CSV export</li>
              <li><span className={styles.tierListIcon}>✓</span>Auto-migrates all links when you sign in later</li>
            </ul>
          </div>

          <div className={`${styles.tierCard} ${styles.tierCardFeatured}`}>
            <div className={styles.tierTopRow}>
              <h3 className={styles.tierName}>Cloud Account</h3>
              <span className={`${styles.tierBadge} ${styles.tierBadgeFeatured}`}>Per Login · Full Suite</span>
            </div>
            <div className={styles.tierPriceRow}>
              <span className={styles.tierPrice}>$0</span>
              <span className={styles.tierPriceSub}>Free forever via Clerk</span>
            </div>
            <p className={styles.tierDesc}>
              Permanent cross-device cloud portfolio with full security, AI, and bulk tools.
            </p>
            <ul className={styles.tierList}>
              <li><span className={styles.tierListIcon}>✓</span><strong>20/min · 100/hr · 500/day</strong> per-account rate limits</li>
              <li><span className={styles.tierListIcon}>✓</span><strong>Unlimited active links</strong> &amp; up to <strong>365-day expiry</strong></li>
              <li><span className={styles.tierListIcon}>✓</span>Custom aliases, Bcrypt passwords, tags &amp; max-click limits</li>
              <li><span className={styles.tierListIcon}>✓</span>Bulk CSV upload (up to 100 links/batch) &amp; Gemini AI tools</li>
              <li><span className={styles.tierListIcon}>✓</span>Global <code>Cmd+K</code> Command Palette &amp; indexed link search</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 5. Trusted at Scale (Actual Live Platform Metrics) ────────────── */}
      <section className={styles.statsBanner}>
        <div className={styles.statBannerItem}>
          <div className={styles.statBannerVal}>{formatStat(platformStats.totalLinks)}</div>
          <div className={styles.statBannerLabel}>Links Shortened</div>
        </div>
        <div className={styles.statBannerItem}>
          <div className={styles.statBannerVal}>{formatStat(platformStats.totalRedirects)}</div>
          <div className={styles.statBannerLabel}>Total Redirects</div>
        </div>
        <div className={styles.statBannerItem}>
          <div className={styles.statBannerVal}>{formatStat(platformStats.countriesCount)}</div>
          <div className={styles.statBannerLabel}>Countries Reached</div>
        </div>
        <div className={styles.statBannerItem}>
          <div className={styles.statBannerVal}>
            {platformStats.latencyMs !== null ? `${platformStats.latencyMs}ms` : '—'}
          </div>
          <div className={styles.statBannerLabel}>Redis Cache Latency</div>
        </div>
      </section>

      {/* ── 6. Final Call to Action ────────────────────────── */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaBannerInner}>
          <h2 className={styles.ctaTitle}>Ready to supercharge your links?</h2>
          <p className={styles.ctaDesc}>
            Create smart, trackable short URLs with real-time 3D telemetry and AI protection in seconds.
          </p>

          <div className={styles.ctaButtons}>
            {hasClerk ? (
              <SignInButton mode="modal" oauthFlow="popup">
                <button
                  type="button"
                  className={styles.ctaPrimaryBtn}
                  data-tooltip="Create a free cloud account to sync and manage links"
                >
                  Create Free Account →
                </button>
              </SignInButton>
            ) : (
              <button
                type="button"
                className={styles.ctaPrimaryBtn}
                onClick={onScrollToInput}
                data-tooltip="Scroll up to the live URL shortener"
              >
                Start Shortening Free →
              </button>
            )}

            <button
              type="button"
              className={styles.ctaSecondaryBtn}
              onClick={onScrollToInput}
              data-tooltip="Scroll up to shorten a link immediately without signing in"
            >
              Try Guest Shortener
            </button>
          </div>

          <div className={styles.ctaTrustPills}>
            <span>✓ 100% Free Forever</span>
            <span>✓ Auto-syncs guest links</span>
            <span>✓ L1 + Redis + PostgreSQL</span>
          </div>
        </div>
      </section>

    </div>
  );
}

export { default as LandingFooter } from './AppFooter.jsx';
