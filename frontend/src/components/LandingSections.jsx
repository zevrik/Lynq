import { useState, useEffect } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { getPlatformStats } from '../services/api.js';
import CountryFlag from './CountryFlag.jsx';
import styles from './LandingSections.module.css';

export default function LandingSections({ hasClerk, onScrollToInput }) {
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

          {/* Row 3 Left (2 cols): Bulk CSV & Cmd+K N-Gram Search */}
          <div className={`${styles.bentoCard} ${styles.bentoCardWide}`}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockPillStack}>
                <span className={`${styles.mockFeaturePill} ${styles.mockFeaturePillAccent}`}>⌘K Command Palette</span>
                <span className={styles.mockFeaturePill}>100-Row CSV Batch</span>
                <span className={styles.mockFeaturePill}>N-Gram Inverted Index</span>
                <span className={styles.mockFeaturePill}>Single-Query UNNEST</span>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>📁</div>
              <h3 className={styles.bentoTitle}>Bulk CSV Engine &amp; Instant ⌘K Search</h3>
              <p className={styles.bentoDesc}>
                Drag and drop CSV files up to 100 links processed in one PostgreSQL <code>UNNEST</code> batch, and filter every link by alias, title, tags, or URL via the global <code>Cmd+K</code> palette backed by an n-gram inverted index.
              </p>
            </div>
          </div>

          {/* Row 3 Right (1 col): Editable Destinations, Dedup & Multi-Tier Engine */}
          <div className={styles.bentoCard}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockPillStack}>
                <span className={`${styles.mockFeaturePill} ${styles.mockFeaturePillAccent}`}>Auto Guest Sync</span>
                <span className={styles.mockFeaturePill}>Edit Target URL</span>
                <span className={styles.mockFeaturePill}>Dark / Light UI</span>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>✏️</div>
              <h3 className={styles.bentoTitle}>Editable Targets &amp; Smart Sync</h3>
              <p className={styles.bentoDesc}>
                Update destinations anytime, deduplicate identical active links, toggle dark/light themes with live DB &amp; Redis status, and automatically shift guest links into your account on sign-in.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Live Showcase ("See Lynq in Action") ──────────── */}
      <section id="showcase" className={styles.section}>
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseLeft}>
            <span className={styles.eyebrow}>Real-Time Intelligence</span>
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
              <button type="button" className={styles.primaryBtn} onClick={onScrollToInput}>
                Try Live Shortener Now ↑
              </button>
            </div>
          </div>

          <div className={styles.showcaseRight}>
            <div className={styles.dashboardMock}>
              <div className={styles.dashMockHeader}>
                <div className={styles.dashMockTitle}>
                  <span className={styles.dashDot} />
                  <span>lynq.app/launch-2026</span>
                </div>
                <span className={styles.dashStatus}>Active (200 OK · 100%)</span>
              </div>

              <div className={styles.dashMetricsGrid}>
                <div className={styles.dashMetricCard}>
                  <div className={styles.dashMetricLabel}>Total Clicks</div>
                  <div className={styles.dashMetricVal}>48,291</div>
                  <div className={styles.dashMetricTrend}>+24.8% this week</div>
                </div>
                <div className={styles.dashMetricCard}>
                  <div className={styles.dashMetricLabel}>Unique Visitors</div>
                  <div className={styles.dashMetricVal}>39,104</div>
                  <div className={styles.dashMetricTrend}>81% new reach</div>
                </div>
                <div className={styles.dashMetricCard}>
                  <div className={styles.dashMetricLabel}>Top Country</div>
                  <div className={styles.dashMetricVal}>
                    <span className={styles.dashValWithIcon}>
                      <CountryFlag countryCode="US" size="md" />
                      <span>United States</span>
                    </span>
                  </div>
                  <div className={styles.dashMetricTrend}>18,420 clicks</div>
                </div>
                <div className={styles.dashMetricCard}>
                  <div className={styles.dashMetricLabel}>Top Channel</div>
                  <div className={styles.dashMetricVal}>
                    <span className={styles.dashValWithIcon}>
                      <span className={styles.channelIconBadge} aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      </span>
                      <span>Twitter / X</span>
                    </span>
                  </div>
                  <div className={styles.dashMetricTrend}>42% traffic share</div>
                </div>
              </div>

              <div className={styles.dashMockLiveRow}>
                <span className={styles.liveTag}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Live Pulse</span>
                </span>
                <span className={styles.liveRowText}>
                  New click from{' '}
                  <span className={styles.liveLocationBadge}>
                    <CountryFlag countryCode="GB" size="sm" />
                    <strong>London, United Kingdom</strong>
                  </span>{' '}
                  via Chrome on macOS
                </span>
                <span className={styles.liveRowTime}>just now</span>
              </div>
            </div>
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
                <button type="button" className={styles.ctaPrimaryBtn}>
                  Create Free Account →
                </button>
              </SignInButton>
            ) : (
              <button type="button" className={styles.ctaPrimaryBtn} onClick={onScrollToInput}>
                Start Shortening Free →
              </button>
            )}

            <button type="button" className={styles.ctaSecondaryBtn} onClick={onScrollToInput}>
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
