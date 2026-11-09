import { useState, useEffect } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { getPlatformStats } from '../services/api.js';
import CountryFlag from './CountryFlag.jsx';
import styles from './LandingSections.module.css';

export default function LandingSections({ hasClerk, onScrollToInput }) {
  const [platformStats, setPlatformStats] = useState({
    totalLinks: 26,
    totalRedirects: 146,
    countriesCount: 3,
    latencyMs: 12,
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
    if (val === null || val === undefined) return '0';
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
            <div className={styles.trustTitle}>&lt;15ms Latency</div>
            <div className={styles.trustSub}>Redis in-memory caching</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>🛡️</span>
          <div>
            <div className={styles.trustTitle}>AI Phishing Defense</div>
            <div className={styles.trustSub}>Powered by Google Gemini</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>📡</span>
          <div>
            <div className={styles.trustTitle}>Live Pulse Stream</div>
            <div className={styles.trustSub}>Server-Sent Events (SSE)</div>
          </div>
        </div>
        <div className={styles.trustItem}>
          <span className={styles.trustIcon}>🌍</span>
          <div>
            <div className={styles.trustTitle}>180+ Countries</div>
            <div className={styles.trustSub}>Offline GeoIP & device telemetry</div>
          </div>
        </div>
      </section>

      {/* ── 3. Bento Features Grid ("Everything you need") ──── */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Platform Superpowers</span>
          <h2 className={styles.sectionTitle}>Everything you need to manage & grow links</h2>
          <p className={styles.sectionSubtitle}>
            Engineered for creators, developers, and hyper-growth teams. Built on Postgres, Redis, and AI.
          </p>
        </div>

        <div className={styles.bentoGrid}>
          {/* Card 1: Real-time Analytics */}
          <div className={`${styles.bentoCard} ${styles.bentoCardWide}`}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockChart}>
                <div className={styles.mockChartHeader}>
                  <span>Click Activity (Last 24h)</span>
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
              <h3 className={styles.bentoTitle}>Deep Telemetry & Real-Time Pulse</h3>
              <p className={styles.bentoDesc}>
                Track visitor countries, cities, device types, browsers, operating systems, and referrers. Watch clicks stream live via Server-Sent Events.
              </p>
            </div>
          </div>

          {/* Card 2: AI Anti-Phishing Security */}
          <div className={styles.bentoCard}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockSecurityBadge}>
                <span className={styles.shieldIcon} aria-hidden="true">🛡️</span>
                <div>
                  <div className={styles.securityTitle}>Verified Safe</div>
                  <div className={styles.securitySub}>Gemini AI Phishing Guard</div>
                </div>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>🔒</div>
              <h3 className={styles.bentoTitle}>AI Security & Phishing Shield</h3>
              <p className={styles.bentoDesc}>
                Block malicious TLDs (.zip, .top), spoofed brand domains (paypa1, g00gle), and scan suspected credential harvesting lures automatically.
              </p>
            </div>
          </div>

          {/* Card 3: Custom QR Code Studio */}
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
              <h3 className={styles.bentoTitle}>High-Res QR Code Studio</h3>
              <p className={styles.bentoDesc}>
                Generate crisp, scannable QR codes for every link. Customize dark/light contrast, add center logos, and download print-ready images instantly.
              </p>
            </div>
          </div>

          {/* Card 4: AI Link Summaries */}
          <div className={`${styles.bentoCard} ${styles.bentoCardWide}`}>
            <div className={styles.bentoVisual}>
              <div className={styles.mockAiSummary}>
                <div className={styles.mockAiHeader}>
                  <span>✨ AI Destination Overview</span>
                  <span className={styles.mockAiBadge}>Cached &lt;2ms</span>
                </div>
                <p className={styles.mockAiText}>
                  &ldquo;This page leads to the official documentation for Node.js, providing comprehensive guides on server-side JavaScript APIs and architecture.&rdquo;
                </p>
              </div>
            </div>
            <div className={styles.bentoContent}>
              <div className={styles.bentoIcon}>🤖</div>
              <h3 className={styles.bentoTitle}>AI Link Previews & TL;DR</h3>
              <p className={styles.bentoDesc}>
                Visitors on <code>/preview/:code</code> receive a 2-sentence summary generated by Gemini and cached in Redis, guaranteeing safe, transparent clicks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Live Showcase ("See Lynq in Action") ──────────── */}
      <section id="showcase" className={styles.section}>
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseLeft}>
            <span className={styles.eyebrow}>Real-Time Intelligence</span>
            <h2 className={styles.sectionTitle}>See Lynq in action with live streaming analytics</h2>
            <p className={styles.sectionSubtitle} style={{ textAlign: 'left' }}>
              Unlike traditional shorteners that delay analytics by hours, Lynq updates your metrics in milliseconds with asynchronous Redis buffering.
            </p>

            <ul className={styles.checkList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Live SSE Click Pulse:</strong> Stream real-time click events straight to your browser without polling or reloading.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Offline GeoIP Accuracy:</strong> Pinpoint countries and cities with sub-millisecond local database lookups.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>1-Click CSV Telemetry:</strong> Export full historical click logs ready for spreadsheet and BI dashboard analysis.
                </div>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Frictionless Guest-to-Cloud Sync:</strong> Shorten anonymously now; claim all your links to your permanent account later with 1 click.
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
                  <span>lynq.app/phase7-demo</span>
                </div>
                <span className={styles.dashStatus}>Active (100% Health)</span>
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
          <div className={styles.statBannerVal}>{platformStats.uptime || '99.99%'}</div>
          <div className={styles.statBannerLabel}>Uptime SLA</div>
        </div>
        <div className={styles.statBannerItem}>
          <div className={styles.statBannerVal}>&lt;{Math.max(15, platformStats.latencyMs || 12)}ms</div>
          <div className={styles.statBannerLabel}>Global Latency</div>
        </div>
      </section>

      {/* ── 6. Final Call to Action ────────────────────────── */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaBannerInner}>
          <h2 className={styles.ctaTitle}>Ready to supercharge your links?</h2>
          <p className={styles.ctaDesc}>
            Join thousands of creators and growth teams using Lynq. Start shortening in 1 second.
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
            <span>✓ No credit card required</span>
            <span>✓ Instant setup</span>
            <span>✓ Redis & Postgres backed</span>
          </div>
        </div>
      </section>

    </div>
  );
}

export { default as LandingFooter } from './AppFooter.jsx';
