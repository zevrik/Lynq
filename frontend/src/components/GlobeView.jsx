import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import styles from './GlobeView.module.css';
import { COUNTRY_CENTROIDS } from '../utils/geoCoordinates.js';
import { getCountryName } from '../utils/telemetry.js';
import CountryFlag, { getCountryFlagImgHtml } from './CountryFlag.jsx';

/**
 * 7 alternating slate-grey tones mapped via Natural Earth's MAPCOLOR7 (values 1..7).
 * Natural Earth precomputes MAPCOLOR7 so that adjacent countries NEVER share the same value.
 * This guarantees that borders and shapes between all non-visited countries are clearly discernible.
 */
const INACTIVE_GREY_PALETTE = [
  '#475569', // Slate-600
  '#64748b', // Slate-500 (lighter)
  '#334155', // Slate-700 (darker)
  '#526075', // Slate-550
  '#3f4b5d', // Slate-650
  '#5c6b82', // Slate-520 (soft blue-slate)
  '#384454', // Slate-680
];

const INACTIVE_LIGHT_PALETTE = [
  '#64748b', // Slate-500
  '#74869e', // Slate-450
  '#55657d', // Slate-580
  '#8494aa', // Slate-420
  '#5d6e87', // Slate-540
  '#7a8ba3', // Slate-440
  '#4d5c73', // Slate-630
];

const NO_SIDE_COLOR = () => null;

const ISO_A3_FALLBACK = {
  FRA: 'FR',
  NOR: 'NO',
};

function getFeatureIsoA2(props = {}) {
  const iso2 = String(props.ISO_A2 || '').toUpperCase();
  if (iso2 && iso2 !== '-99' && iso2.length === 2) return iso2;
  const iso3 = String(props.ADM0_A3 || '').toUpperCase();
  return ISO_A3_FALLBACK[iso3] || iso2;
}

/**
 * GlobeView Component - Hexed Polygons Globe Implementation
 * 
 * Powered by official globe.gl (via react-globe.gl)
 * - Natural Earth 110m countries GeoJSON
 * - Auto-orients to highest visit density country on initial load
 * - Default state is stationary (paused)
 * - Always in visit density mode with Lynq theme colors
 * - Supports dynamic Dark and Light themes seamlessly
 * - Uses full country boundary hit-layer so hovering anywhere inside a country displays info
 * - Unvisited countries rendered with distinct slate-grey borders
 * - Interaction hints placed in upper-right corner
 */
export default function GlobeView({ 
  geoPoints = [], 
  countries = [], 
  regions = [], 
  shortCode = '',
  theme,
}) {
  const containerRef = useRef(null);
  const globeEl = useRef(null);
  const hasOrientedRef = useRef(false);
  const hoverStateRef = useRef({ polygon: null, hexPolygon: null });

  const isLight = theme
    ? theme === 'light'
    : (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  const lightGlobeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#dce8f5',
        emissive: '#ffffff',
        emissiveIntensity: 0.14,
        specular: '#ffffff',
        shininess: 8,
      }),
    []
  );

  // Invisible solid country hit-layer so hovering gaps between hex-dots still detects the country
  const invisiblePolygonMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => {
    return () => {
      lightGlobeMaterial.dispose();
      invisiblePolygonMaterial.dispose();
    };
  }, [lightGlobeMaterial, invisiblePolygonMaterial]);

  const [countriesData, setCountriesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? Math.min(window.innerWidth - 350, 840) : 800,
    height: 540,
  });
  // Always paused by default
  const [autoRotate, setAutoRotate] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState(null);

  // 1. Load Natural Earth 110m countries GeoJSON
  useEffect(() => {
    let isMounted = true;
    const localGeoJson = '/datasets/ne_110m_admin_0_countries.geojson';
    const cdnGeoJson = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';

    fetch(localGeoJson)
      .then((res) => {
        if (!res.ok) throw new Error('Local dataset unavailable, using CDN fallback');
        return res.json();
      })
      .catch(() => fetch(cdnGeoJson).then((res) => res.json()))
      .then((data) => {
        if (isMounted && data?.features) {
          setCountriesData(data.features);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load country GeoJSON dataset:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Responsive container size measurement
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({
            width: clientWidth,
            height: clientHeight,
          });
        }
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // 3. OrbitControls settings (always paused by default)
  useEffect(() => {
    if (globeEl.current) {
      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.6;
        controls.enableZoom = true;
      }
    }
  }, [autoRotate]);

  // 4. Automatically orient camera to highest visit density country upon opening
  useEffect(() => {
    if (!globeEl.current || loading || countriesData.length === 0) return;

    if (!hasOrientedRef.current) {
      // countries is sorted by visits count descending: countries[0] is top density
      const topCountry = countries?.[0]?.country;
      const coord = topCountry ? COUNTRY_CENTROIDS[String(topCountry).toUpperCase()] : null;

      if (coord) {
        hasOrientedRef.current = true;
        // Fly smoothly to high-density country
        globeEl.current.pointOfView({ lat: coord.lat, lng: coord.lng, altitude: 2.15 }, 1200);
      } else if (countries && countries.length === 0) {
        hasOrientedRef.current = true;
        globeEl.current.pointOfView({ lat: 15, lng: 10, altitude: 2.15 }, 1000);
      }
    }
  }, [loading, countries, countriesData]);

  // Telemetry visits map for data-driven color mode
  const visitsMeta = useMemo(() => {
    const map = {};
    let max = 1;
    (countries || []).forEach((c) => {
      const code = String(c.country || '').toUpperCase();
      map[code] = c.count;
      if (c.count > max) max = c.count;
    });
    return { map, max };
  }, [countries]);

  // 5. Hex Polygon Color function: Always Visible Density Mode
  const getHexPolygonColor = useCallback(
    (feat) => {
      const p = feat.properties || {};
      const hoveredProps = hoveredCountry?.properties;
      const isHovered = Boolean(
        hoveredCountry &&
        (hoveredCountry === feat || (hoveredProps?.ADMIN && hoveredProps.ADMIN === p.ADMIN))
      );

      const isoCode = getFeatureIsoA2(p);
      const count = visitsMeta.map[isoCode] || 0;

      // Non-visited / other countries:
      if (count === 0) {
        if (isHovered) return isLight ? '#334155' : '#cbd5e1'; // High-contrast slate highlight on hover
        const palette = isLight ? INACTIVE_LIGHT_PALETTE : INACTIVE_GREY_PALETTE;
        // Pick distinct alternating grey shade based on MAPCOLOR7 so borders are clear
        const mapIdx = typeof p.MAPCOLOR7 === 'number' && p.MAPCOLOR7 >= 1 && p.MAPCOLOR7 <= 7
          ? p.MAPCOLOR7 - 1
          : (Math.abs((p.ADMIN || '').charCodeAt(0) || 0) % palette.length);
        return palette[mapIdx];
      }

      // Countries with visits - Lynq Theme Gradient Palette:
      if (isHovered) return isLight ? '#f59e0b' : '#ffffff';

      const ratio = count / visitsMeta.max;
      if (ratio > 0.75) return '#ec4899'; // Peak: Lynq Vivid Fuchsia / Magenta
      if (ratio > 0.45) return '#8b5cf6'; // High: Lynq Electric Violet / Purple
      if (ratio > 0.20) return '#6366f1'; // Medium: Lynq Primary Indigo
      return '#06b6d4';                  // Low / Standard: Lynq Cyber Cyan
    },
    [visitsMeta, hoveredCountry, isLight]
  );

  // 6. Country Hover Label (shared by full boundary polygons & hex-dots)
  const getCountryLabel = useCallback(
    (feat) => {
      const d = feat?.properties || {};
      const isoCode = getFeatureIsoA2(d);
      const codeSuffix = isoCode && isoCode !== '-99' ? ` (${isoCode})` : '';
      const visitCount = visitsMeta.map[isoCode] || 0;
      const flagHtml = getCountryFlagImgHtml(isoCode);

      const bg = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.95)';
      const border = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.16)';
      const shadow = isLight
        ? '0 10px 28px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(99, 102, 241, 0.08)'
        : '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 14px rgba(99, 102, 241, 0.25)';
      const textPrimary = isLight ? '#0f172a' : '#f8fafc';
      const titleColor = isLight ? '#4f46e5' : '#818cf8';
      const dividerColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.1)';
      const mutedColor = isLight ? '#64748b' : '#94a3b8';
      const clickColor = isLight ? '#db2777' : '#ec4899';

      return `
        <div style="
          background: ${bg};
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid ${border};
          box-shadow: ${shadow};
          color: ${textPrimary};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          line-height: 1.45;
          min-width: 165px;
          pointer-events: none;
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            ${flagHtml}
            <b style="font-size: 14px; color: ${titleColor};">${d.ADMIN || 'Unknown'}${codeSuffix}</b>
          </div>
          ${visitCount > 0 ? `
            <div style="padding-top: 6px; border-top: 1px solid ${dividerColor}; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px;">
              <span style="color: ${mutedColor};">Link Visits:</span>
              <span style="color: ${clickColor}; font-weight: 800;">${visitCount} clicks</span>
            </div>
          ` : `
            <div style="padding-top: 6px; border-top: 1px solid ${dividerColor}; font-size: 11px; color: #64748b;">
              No visits recorded yet
            </div>
          `}
        </div>
      `;
    },
    [visitsMeta, isLight]
  );

  const handlePolygonHover = useCallback((polygon) => {
    hoverStateRef.current.polygon = polygon || null;
    setHoveredCountry(hoverStateRef.current.polygon || hoverStateRef.current.hexPolygon);
  }, []);

  const handleHexPolygonHover = useCallback((polygon) => {
    hoverStateRef.current.hexPolygon = polygon || null;
    setHoveredCountry(hoverStateRef.current.polygon || hoverStateRef.current.hexPolygon);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    hoverStateRef.current.polygon = null;
    hoverStateRef.current.hexPolygon = null;
    setHoveredCountry(null);
  }, []);

  // Focus globe camera to country centroid
  const focusCountry = useCallback((isoCode) => {
    const coord = COUNTRY_CENTROIDS[isoCode.toUpperCase()];
    if (coord && globeEl.current) {
      globeEl.current.pointOfView({ lat: coord.lat, lng: coord.lng, altitude: 1.8 }, 1200);
    }
  }, []);

  // Top visited countries for quick-focus chips
  const topActiveCountries = useMemo(() => {
    return (countries || []).slice(0, 5);
  }, [countries]);

  return (
    <div className={styles.globeContainer} ref={containerRef}>
      {/* ── Top Bar Controls: Upper Right Corner (Hint Only) ── */}
      <div className={styles.topOverlay}>
        <div className={styles.toolbar}>
          {/* Interaction hint pill moved to upper-right corner */}
          <div className={styles.hintPillCorner}>
            <span>🖱️ Drag to rotate · Scroll to zoom · Hover country</span>
          </div>
        </div>
      </div>

      {/* ── Globe.gl Canvas Wrapper ────────────────────────────────────────── */}
      <div className={styles.canvasWrapper} onMouseLeave={handleCanvasMouseLeave}>
        {dimensions.width > 0 && (
          <Globe
            ref={globeEl}
            width={dimensions.width}
            height={dimensions.height}
            // Theme-aware globe surface & sky background
            globeMaterial={isLight ? lightGlobeMaterial : null}
            globeImageUrl={isLight ? null : '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg'}
            backgroundColor={isLight ? 'rgba(0,0,0,0)' : '#000011'}
            backgroundImageUrl={isLight ? null : '//cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'}
            atmosphereColor={isLight ? '#818cf8' : 'lightskyblue'}
            atmosphereAltitude={isLight ? 0.14 : 0.15}
            // Invisible full-country boundary hit-layer so hovering gaps between dots still shows info
            polygonsData={countriesData}
            polygonCapMaterial={invisiblePolygonMaterial}
            polygonSideColor={NO_SIDE_COLOR}
            polygonAltitude={0.002}
            polygonCapCurvatureResolution={4}
            polygonsTransitionDuration={0}
            polygonLabel={getCountryLabel}
            onPolygonHover={handlePolygonHover}
            // Hexed polygons visual dots settings
            hexPolygonsData={countriesData}
            hexPolygonResolution={3}
            hexPolygonMargin={0.3}
            hexPolygonUseDots={true}
            hexPolygonColor={getHexPolygonColor}
            // Fallback tooltip & hover handler for coastal edge hex-dots
            hexPolygonLabel={getCountryLabel}
            onHexPolygonHover={handleHexPolygonHover}
            animateIn={true}
          />
        )}
      </div>

      {/* ── Bottom Overlay: Legend & Quick Focus Chips ─────────────────────── */}
      <div className={styles.bottomOverlay}>
        {/* Dynamic Legend */}
        <div className={styles.legendBar}>
          <span className={styles.legendLabel}>Density Tier:</span>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#ec4899', color: '#ec4899' }} />
            <span>Peak</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#8b5cf6', color: '#8b5cf6' }} />
            <span>High</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#6366f1', color: '#6366f1' }} />
            <span>Medium</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#06b6d4', color: '#06b6d4' }} />
            <span>Low</span>
          </div>
          <div className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{
                background: isLight ? '#64748b' : '#526075',
                color: isLight ? '#64748b' : '#526075',
              }}
            />
            <span>Other Countries</span>
          </div>
        </div>

        {/* Quick Country Focus Chips */}
        {topActiveCountries.length > 0 && (
          <div className={styles.focusList}>
            {topActiveCountries.map((c) => {
              const name = getCountryName(c.country);
              return (
                <button
                  key={c.country}
                  type="button"
                  className={styles.focusChip}
                  onClick={() => focusCountry(c.country)}
                  title={`Focus on ${name}`}
                >
                  <CountryFlag countryCode={c.country} size="sm" />
                  <span>{name}</span>
                  <span className={styles.focusCount}>{c.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
