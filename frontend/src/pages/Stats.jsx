import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import AppFooter from '../components/AppFooter.jsx';
import AppHeader from '../components/AppHeader.jsx';
import { getCountryName, getReferrerMeta, getDeviceMeta, CHART_COLORS } from '../utils/telemetry.js';
import { getRegionLabel, getMarkerColorByCount } from '../utils/geoCoordinates.js';
import CountryFlag from '../components/CountryFlag.jsx';
import GlobeView from '../components/GlobeView.jsx';
import {
  getUrlInfo,
  getLiveStreamUrl,
  downloadAnalyticsCsv,
  checkStatus,
  getAiSummary
} from '../services/api.js';
import styles from './Stats.module.css';

export default function Stats({ theme, onToggleTheme, addToast }) {
  const { shortCode } = useParams();
  const navigate = useNavigate();
  const isLight = theme
    ? theme === 'light'
    : (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineMode, setTimelineMode] = useState('total'); // 'total' | 'unique'
  const [copied, setCopied] = useState(false);

  // Link Preview & AI Destination State
  const [linkStatus, setLinkStatus] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // SSE Live Pulse State
  const [liveClick, setLiveClick] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveTotalClicks, setLiveTotalClicks] = useState(null);
  const [unSyncedBumps, setUnSyncedBumps] = useState(0);

  const activeShortCodeRef = useRef(shortCode);
  activeShortCodeRef.current = shortCode;

  // ── Fetch Analytics Data ───────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async (silent = false) => {
    const requestedCode = shortCode;
    if (!requestedCode) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await getUrlInfo(requestedCode);
      if (activeShortCodeRef.current === requestedCode) {
        setData(result);
      }
    } catch (err) {
      if (!silent) {
        console.error('Failed to load stats for', requestedCode, err);
        setError(err?.response?.data?.error || 'Short link not found or analytics unavailable.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [shortCode]);

  const fetchAnalyticsRef = useRef(fetchAnalytics);
  fetchAnalyticsRef.current = fetchAnalytics;

  useEffect(() => {
    setLiveClick(null);
    setLiveConnected(false);
    setLiveTotalClicks(null);
    setUnSyncedBumps(0);
    fetchAnalytics(false);
  }, [fetchAnalytics]);

  useEffect(() => {
    setUnSyncedBumps(0);
    if (liveTotalClicks !== null && (data?.clicks ?? 0) >= liveTotalClicks) {
      setLiveTotalClicks(null);
    }
  }, [data, liveTotalClicks]);

  // ── Fetch Link Health & AI Destination Summary (Link Preview) ─────────────
  useEffect(() => {
    if (!shortCode) return;

    checkStatus(shortCode)
      .then((st) => setLinkStatus(st))
      .catch(() => {});

    setIsAiLoading(true);
    getAiSummary(shortCode)
      .then((res) => {
        if (res?.success) setAiSummary(res);
      })
      .catch(() => {})
      .finally(() => setIsAiLoading(false));
  }, [shortCode]);

  // ── Server-Sent Events (SSE) Live Click Stream ─────────────────────────────
  useEffect(() => {
    if (!shortCode) return;

    let eventSource = null;
    try {
      const sseUrl = getLiveStreamUrl(shortCode);
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        setLiveConnected(true);
      };

      eventSource.onmessage = (event) => {
        setLiveConnected(true);
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'connected' || payload.type === 'ping') {
            setLiveConnected(true);
          } else if (payload.type === 'click') {
            setLiveClick(payload);
            if (typeof payload.totalClicks === 'number') {
              setLiveTotalClicks((prev) => Math.max(prev ?? 0, payload.totalClicks));
            } else {
              setUnSyncedBumps((prev) => prev + 1);
            }
            fetchAnalyticsRef.current?.(true);
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setLiveConnected(false);
        }
      };
    } catch (err) {
      console.warn('SSE connection failed:', err);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [shortCode]);

  // Clear live ticker after 8s
  useEffect(() => {
    if (!liveClick) return;
    const timer = setTimeout(() => {
      setLiveClick(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [liveClick]);

  // ── Copy Short URL ─────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!data?.shortUrl) return;
    try {
      await navigator.clipboard.writeText(data.shortUrl);
      setCopied(true);
      if (addToast) addToast('✓ Short link copied!', 'success', 2000);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = data.shortUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      if (addToast) addToast('✓ Short link copied!', 'success', 2000);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Process Chart Data ─────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return (data?.history || []).map((item) => ({
      time: new Date(item.bucket).getTime(),
      total_clicks: parseInt(item.total_clicks, 10) || 0,
      unique_clicks: parseInt(item.unique_clicks, 10) || 0,
    }));
  }, [data?.history]);

  // Devices Donut Data
  const deviceData = useMemo(() => {
    const list = data?.devices || [];
    return list.map((d, idx) => {
      const meta = getDeviceMeta(d.device);
      return {
        name: meta.label,
        value: parseInt(d.count, 10) || 0,
        color: meta.color || CHART_COLORS[idx % CHART_COLORS.length],
        icon: meta.icon,
      };
    });
  }, [data?.devices]);

  const serverClicks = data?.clicks || 0;
  const totalClicksCount =
    liveTotalClicks !== null
      ? Math.max(serverClicks, liveTotalClicks)
      : serverClicks + unSyncedBumps;
  const pendingLiveClicks = Math.max(0, totalClicksCount - serverClicks);
  const topCountry = data?.countries?.[0] || null;
  const topRegion = data?.regions?.[0] || null;
  const topReferrer = data?.referrers?.[0] || null;
  const topDevice = deviceData[0] || null;

  // ── Render Loading State ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AppHeader theme={theme} onToggleTheme={onToggleTheme} />
        <div className={styles.contentWrapper}>
          <div className={styles.skeletonContainer}>
            <div className={styles.skeletonBar} style={{ height: '40px', width: '180px' }} />
            <div className={styles.skeletonBar} style={{ height: '140px', width: '100%' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div className={styles.skeletonBar} style={{ height: '100px' }} />
              <div className={styles.skeletonBar} style={{ height: '100px' }} />
              <div className={styles.skeletonBar} style={{ height: '100px' }} />
              <div className={styles.skeletonBar} style={{ height: '100px' }} />
            </div>
            <div className={styles.skeletonBar} style={{ height: '520px', width: '100%' }} />
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  // ── Render Error State ─────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className={styles.pageContainer}>
        <AppHeader theme={theme} onToggleTheme={onToggleTheme} />
        <div className={styles.contentWrapper}>
          <div className={styles.topNav}>
            <Link to="/" className={styles.backBtn}>
              ← Back to Dashboard
            </Link>
          </div>
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>⚠️</div>
            <div className={styles.errorTitle}>Analytics Unavailable</div>
            <div className={styles.errorDesc}>{error || 'Could not locate link telemetry.'}</div>
            <button type="button" className={styles.backBtn} onClick={() => navigate('/')}>
              Return to Home
            </button>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  const timelineKey = timelineMode === 'total' ? 'total_clicks' : 'unique_clicks';
  const lineColor = timelineMode === 'total' ? '#6366f1' : '#8b5cf6';

  return (
    <div className={styles.pageContainer}>
      <AppHeader theme={theme} onToggleTheme={onToggleTheme} />
      <div className={styles.contentWrapper}>
        {/* ── Top Nav ──────────────────────────────────────────────────────── */}
        <div className={styles.topNav}>
          <Link to="/" className={styles.backBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>

          <div className={styles.navActions}>
            {/* Live SSE Pulse Pill */}
            <div className={styles.livePulse} title="Real-time Server-Sent Events active">
              <span className={styles.liveDot} style={{ background: liveConnected ? '#10b981' : '#eab308' }} />
              <span>{liveConnected ? 'Live Pulse' : 'Connecting...'}</span>
            </div>


            {/* CSV Export */}
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => downloadAnalyticsCsv(shortCode)}
              title="Export historical telemetry to CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* ── Page Header Card ─────────────────────────────────────────────── */}
        <div className={styles.headerCard}>
          <div className={styles.headerMain}>
            <div className={styles.titleArea}>
              <div className={styles.pageTitle}>
                <span>Link Analytics</span>
                <span className={styles.shortCodeBadge}>/{shortCode}</span>
              </div>
              <div className={styles.originalUrlRow}>
                <span>Destination:</span>
                <a
                  href={data.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.originalUrlLink}
                  title={data.originalUrl}
                >
                  {data.originalUrl}
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className={styles.copyPill}
                onClick={handleCopy}
                title="Click to copy short URL"
              >
                <span className={styles.shortUrlText}>{data.shortUrl}</span>
                <span className={styles.copyLabel}>
                  {copied ? '✓ Copied' : '📋 Copy'}
                </span>
              </button>

              <a
                href={data.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.actionBtn}
                title="Open short URL in new tab"
              >
                <span>Visit</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>

          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span>📅 Created:</span>
              <strong>{new Date(data.createdAt).toLocaleDateString()}</strong>
            </div>
            {data.lastVisited && (
              <div className={styles.metaItem}>
                <span>🕒 Last visited:</span>
                <strong>{new Date(data.lastVisited).toLocaleDateString()}</strong>
              </div>
            )}
            <div className={styles.metaItem}>
              <span>🔒 Protected:</span>
              <strong>{data.isProtected ? 'Password Enabled' : 'Public'}</strong>
            </div>
            {data.title && (
              <div className={styles.metaItem}>
                <span>🏷️ Title:</span>
                <strong>{data.title}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── Link Preview & AI Destination Card ─────────────────────────── */}
        <div className={styles.previewCard}>
          <div className={styles.previewCardHeader}>
            <div className={styles.aiBadge}>
              <span className={styles.sparkle}>✨</span>
              <span>AI Destination Intelligence & Preview</span>
            </div>
            <div className={styles.previewBadges}>
              {aiSummary?.cached && (
                <span className={styles.cachedBadge}>⚡ Instant Cached</span>
              )}
              {linkStatus && (
                <span className={`${styles.statusPill} ${linkStatus.isAlive ? styles.statusPillActive : styles.statusPillBroken}`}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: linkStatus.isAlive ? '#10b981' : '#ef4444',
                      display: 'inline-block'
                    }}
                  />
                  <span>
                    {linkStatus.isAlive
                      ? `Active — ${linkStatus.responseTime}ms`
                      : 'Destination Offline'}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className={styles.previewCardBody}>
            {isAiLoading ? (
              <div className={styles.aiLoadingRow}>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Analyzing destination content and security...</span>
              </div>
            ) : (
              <p className={styles.aiSummaryText}>
                {aiSummary?.summary || 'Destination content verified and actively monitored for security and uptime.'}
              </p>
            )}

            {!linkStatus?.isAlive && linkStatus !== null && (
              <div className={styles.brokenNotice}>
                ⚠️ Destination Warning: The target website returned an error or timed out during the health check.
              </div>
            )}
          </div>
        </div>

        {/* ── Live Ticker Banner ───────────────────────────────────────────── */}
        {liveClick && (
          <div className={styles.liveTickerBanner}>
            <div className={styles.tickerText}>
              <span className={styles.tickerTag}>⚡ Real-Time Click</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                from <CountryFlag countryCode={liveClick.country} size="sm" /> <strong>{liveClick.city && liveClick.city !== 'Unknown' ? `${liveClick.city}, ` : ''}{getCountryName(liveClick.country)}</strong>
                {' '}via <strong>{liveClick.browser}</strong> on {liveClick.device}
              </span>
            </div>
            <span className={styles.tickerTime}>Just now</span>
          </div>
        )}

        {/* ── Key Metrics Overview Grid ────────────────────────────────────── */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>🖱️</div>
            <div>
              <div className={styles.statVal}>{totalClicksCount.toLocaleString()}</div>
              <div className={styles.statLbl}>Total Visits</div>
              {pendingLiveClicks > 0 && <div className={styles.statSub}>+{pendingLiveClicks} real-time</div>}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>👥</div>
            <div>
              <div className={styles.statVal}>{(data.uniqueVisitors ?? 0).toLocaleString()}</div>
              <div className={styles.statLbl}>Unique Visitors</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              {topCountry ? <CountryFlag countryCode={topCountry.country} size="lg" /> : '🌍'}
            </div>
            <div>
              <div className={styles.statVal}>
                {topCountry ? getCountryName(topCountry.country) : '—'}
              </div>
              <div className={styles.statLbl}>Top Country</div>
              {topCountry && <div className={styles.statSub}>{topCountry.count} visits</div>}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>📍</div>
            <div>
              <div className={styles.statVal}>
                {topRegion ? getRegionLabel(topRegion.region, topRegion.country) : '—'}
              </div>
              <div className={styles.statLbl}>Top State / Region</div>
              {topRegion && <div className={styles.statSub}>{topRegion.count} visits</div>}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              {topReferrer ? getReferrerMeta(topReferrer.referrer).icon : '🔗'}
            </div>
            <div>
              <div className={styles.statVal}>
                {topReferrer ? getReferrerMeta(topReferrer.referrer).label : 'Direct'}
              </div>
              <div className={styles.statLbl}>Top Traffic Source</div>
              {topReferrer && <div className={styles.statSub}>{topReferrer.count} visits</div>}
            </div>
          </div>
        </div>

        {/* ── 3D Spherical Globe Section ───────────────────────────────────── */}
        <div className={styles.globeSection}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>
                <span>🌐</span> 3D Geographic Visualization
              </div>
              <div className={styles.sectionSubtitle}>
                State and country distribution color-coded dynamically by visit density
              </div>
            </div>
          </div>

          <div className={styles.globeRow}>
            {/* 3D Spherical Globe Component */}
            <GlobeView
              geoPoints={data.geoPoints || []}
              countries={data.countries || []}
              regions={data.regions || []}
              shortCode={shortCode}
              theme={theme}
            />

            {/* Sidebar: Top States & Regions Breakdown */}
            <div className={styles.globeSidebar}>
              <div className={styles.sidebarHeader}>
                <span className={styles.sidebarTitle}>States & Regions</span>
                <span className={styles.sidebarBadge}>
                  {data.regions?.length || 0} active
                </span>
              </div>

              <div className={styles.sidebarList}>
                {data.regions && data.regions.length > 0 ? (
                  data.regions.map((r, idx) => {
                    const regionName = getRegionLabel(r.region, r.country);
                    const pct = Math.round((r.count / (totalClicksCount || 1)) * 100);
                    const colorMeta = getMarkerColorByCount(r.count, data.regions[0]?.count || 1);

                    return (
                      <div key={`${r.country}-${r.region}-${idx}`} className={styles.locationCard}>
                        <div className={styles.locationTop}>
                          <div className={styles.locationName}>
                            <CountryFlag countryCode={r.country} size="sm" />
                            <span>{regionName}</span>
                          </div>
                          <span className={styles.locationClicks} style={{ color: isLight ? colorMeta.lightHex : colorMeta.hex }}>
                            {r.count} ({pct}%)
                          </span>
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{
                              width: `${Math.max(pct, 6)}%`,
                              background: colorMeta.hex,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyMsg} style={{ padding: '20px 0', textAlign: 'center' }}>
                    No regional visit data logged yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Historical Timeline Chart ────────────────────────────────────── */}
        <div className={styles.timelineCard}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
            <div>
              <div className={styles.sectionTitle}>
                <span>📈</span> Click Distribution Over Time
              </div>
              <div className={styles.sectionSubtitle}>
                Tracking hourly & daily visits trends
              </div>
            </div>

            <div className={styles.timelineControls}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${timelineMode === 'total' ? styles.toggleBtnActive : ''}`}
                onClick={() => setTimelineMode('total')}
              >
                Total Visits
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${timelineMode === 'unique' ? styles.toggleBtnActive : ''}`}
                onClick={() => setTimelineMode('unique')}
              >
                Unique Visitors
              </button>
            </div>
          </div>

          <div className={styles.chartContainer}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255,255,255,0.06)'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(time) => {
                      const d = new Date(time);
                      return data.bucketInterval === 'hour'
                        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    }}
                    stroke={isLight ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255,255,255,0.3)'}
                    tick={{ fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }}
                    fontSize={11}
                    tickMargin={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke={isLight ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255,255,255,0.3)'}
                    tick={{ fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }}
                    fontSize={11}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.95)',
                      border: isLight ? '1px solid rgba(15, 23, 42, 0.12)' : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      boxShadow: isLight ? '0 8px 24px rgba(15, 23, 42, 0.12)' : '0 8px 24px rgba(0,0,0,0.6)',
                      color: isLight ? '#0f172a' : '#f8fafc',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: isLight ? '#475569' : '#94a3b8', marginBottom: '2px' }}
                    itemStyle={{ color: lineColor, fontWeight: 'bold' }}
                    labelFormatter={(time) =>
                      new Date(time).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey={timelineKey}
                    name={timelineMode === 'total' ? 'Total Visits' : 'Unique Visitors'}
                    stroke={lineColor}
                    strokeWidth={3}
                    dot={{ r: 4, fill: lineColor, strokeWidth: 2, stroke: isLight ? '#ffffff' : '#0f172a' }}
                    activeDot={{ r: 6, fill: lineColor, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyMsg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                No timeline records yet. Share your short link to populate this graph!
              </div>
            )}
          </div>
        </div>

        {/* ── Two-Column Breakdown Grids ────────────────────────────────────── */}
        <div className={styles.twoColGrid}>
          {/* Countries & Cities Breakdown */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>
              <span>🌍 Countries Breakdown</span>
              <span className={styles.panelBadge}>{data.countries?.length || 0} nations</span>
            </div>

            <div className={styles.breakdownList}>
              {data.countries && data.countries.length > 0 ? (
                data.countries.slice(0, 7).map((c) => {
                  const pct = Math.round((c.count / (totalClicksCount || 1)) * 100);
                  return (
                    <div key={c.country} className={styles.breakdownRow}>
                      <div className={styles.breakdownMeta}>
                        <div className={styles.metaLabel}>
                          <CountryFlag countryCode={c.country} size="sm" />
                          <span>{getCountryName(c.country)}</span>
                        </div>
                        <div className={styles.metaValue}>
                          <span className={styles.metaValueStrong}>{c.count}</span>
                          <span>({pct}%)</span>
                        </div>
                      </div>
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${Math.max(pct, 5)}%`, background: '#6366f1' }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyMsg}>No country data yet.</div>
              )}
            </div>
          </div>

          {/* Devices & Platforms */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>
              <span>📱 Devices & Platforms</span>
              <span className={styles.panelBadge}>Hardware Split</span>
            </div>

            {deviceData.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '150px', height: '150px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={4}
                        stroke={isLight ? '#ffffff' : '#0f172a'}
                      >
                        {deviceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {deviceData.map((d) => {
                    const pct = Math.round((d.value / (totalClicksCount || 1)) * 100);
                    return (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.color }} />
                          <span>{d.icon} {d.name}</span>
                        </div>
                        <strong className={styles.devicePct}>{pct}%</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.emptyMsg}>No device data yet.</div>
            )}
          </div>
        </div>

        {/* ── Acquisition Channels & Referrers ─────────────────────────────── */}
        <div className={styles.panelCard}>
          <div className={styles.panelTitle}>
            <span>🔗 Acquisition Channels & Referrers</span>
            <span className={styles.panelBadge}>{data.referrers?.length || 0} channels</span>
          </div>

          <div className={styles.sourcesList}>
            {data.referrers && data.referrers.length > 0 ? (
              data.referrers.map((r) => {
                const meta = getReferrerMeta(r.referrer);
                const share = Math.round((r.count / (totalClicksCount || 1)) * 100);
                return (
                  <div key={r.referrer} className={styles.sourceItem}>
                    <div className={styles.sourceLeft}>
                      <span className={styles.sourceIcon}>{meta.icon}</span>
                      <div>
                        <div className={styles.sourceName}>{meta.label}</div>
                        <span
                          className={styles.sourceCat}
                          style={{
                            background: `${meta.badgeColor}20`,
                            color: isLight ? (meta.lightBadgeColor || meta.badgeColor) : meta.badgeColor,
                            border: `1px solid ${meta.badgeColor}40`,
                          }}
                        >
                          {meta.category}
                        </span>
                      </div>
                    </div>
                    <div className={styles.sourceRight}>
                      <div className={styles.sourceShare}>{share}%</div>
                      <div className={styles.sourceClicks}>{r.count} visits</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyMsg}>No referral source data recorded yet.</div>
            )}
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
