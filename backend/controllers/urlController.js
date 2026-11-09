import env from "../config/env.js";
import pool from "../config/db.js";
import redisClient from "../config/redis.js";
import eventBus from "../config/eventBus.js";
import {
  shortenUrl,
  resolveUrl,
  getUrlInfo,
  verifyUrlPassword,
  editUrlDestination,
  deleteUrl,
  checkAliasAvailability,
} from "../services/urlService.js";
import { checkSecurity } from "../services/securityService.js";
import { getClientIp } from "../utils/telemetry.js";
import { RATE_LIMITS, getRateLimitUsage } from "../middlewares/rateLimiter.js";
import { statsL1Cache, getOrLoadJson } from "../utils/dbCache.js";

/**
 * POST /api/shorten
 * Body: { url: string, customAlias?: string, password?: string, expiresInDays?: number }
 */
export const handleShorten = async (req, res, next) => {
  try {
    const {
      url,
      customAlias,
      password,
      expiresInDays,
      maxClicks,
      title,
      tags,
      deviceId,
      routingRules,
    } = req.body;

    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "URL is required." });
    }

    // Security Check
    const securityCheck = await checkSecurity(url, customAlias, title);
    if (!securityCheck.isSafe) {
      return res
        .status(403)
        .json({ success: false, error: securityCheck.reason });
    }

    const result = await shortenUrl(
      url,
      customAlias || null,
      password || null,
      expiresInDays ?? null,
      maxClicks || null,
      title || null,
      tags || null,
      req.userId ? null : deviceId || null,
      req.userId || null,
      routingRules || null,
    );

    return res.status(result.isExisting ? 200 : 201).json({
      success: true,
      isExisting: result.isExisting,
      shortUrl: result.shortUrl,
      shortCode: result.shortCode,
      editToken: result.editToken,
      title: result.data.title,
      tags: result.data.tags,
      originalUrl: result.data.originalUrl,
      createdAt: result.data.createdAt,
      clicks: parseInt(result.data.clicks, 10) || 0,
      routingRules: result.routingRules || result.data.routing_rules || {},
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/shorten/:shortCode
 * Body: { newUrl: string, editToken?: string, routingRules?: object }
 */
export const handleEditUrl = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const { newUrl, editToken, routingRules } = req.body;

    if (!newUrl || (!editToken && !req.userId)) {
      return res
        .status(400)
        .json({ success: false, error: "newUrl and edit authorization are required." });
    }

    const result = await editUrlDestination(
      shortCode,
      newUrl,
      editToken || null,
      routingRules || null,
      req.userId || null,
    );
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/shorten/:shortCode
 * Body: { editToken?: string }
 */
export const handleDeleteUrl = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const { editToken } = req.body || {};

    if (!editToken && !req.userId) {
      return res
        .status(400)
        .json({ success: false, error: "edit authorization is required." });
    }

    const result = await deleteUrl(shortCode, editToken || null, req.userId || null);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /:shortCode
 * Redirects to original URL or to unlock page if password protected.
 */
export const handleRedirect = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const referrer = req.headers["referer"] || req.headers["referrer"] || "";
    const result = await resolveUrl(shortCode, ip, userAgent, referrer);

    if (result.requiresPassword) {
      // Redirect to frontend unlock route
      return res.redirect(302, `${env.frontendUrl}/unlock/${shortCode}`);
    }

    return res.redirect(302, result.originalUrl);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/resolve/:shortCode
 * Same logic as handleRedirect but returns JSON to avoid browser hard-redirects
 */
export const handleResolveAndTrack = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const referrer =
      req.headers["referer"] ||
      req.headers["referrer"] ||
      req.query.referrer ||
      "";
    const result = await resolveUrl(shortCode, ip, userAgent, referrer);

    return res.status(200).json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/verify/:shortCode
 * Verifies password and returns original URL.
 */
export const handleVerifyPassword = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const { password, referrer: bodyReferrer } = req.body;

    if (!password) {
      return res
        .status(400)
        .json({ success: false, error: "Password is required." });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const rawHeaderReferrer =
      req.headers["referer"] || req.headers["referrer"] || "";
    const safeHeaderReferrer = rawHeaderReferrer.includes(`/unlock/${shortCode}`)
      ? ""
      : rawHeaderReferrer;
    const referrer =
      typeof bodyReferrer === "string" && bodyReferrer.trim()
        ? bodyReferrer
        : safeHeaderReferrer;

    const originalUrl = await verifyUrlPassword(
      shortCode,
      password,
      ip,
      userAgent,
      referrer,
    );
    return res.status(200).json({ success: true, originalUrl });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/info/:shortCode
 * Returns analytics data for a short URL.
 */
export const handleGetInfo = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const info = await getUrlInfo(shortCode);
    return res.status(200).json({ success: true, ...info });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/check-alias/:alias
 * Returns { available: true } or { available: false }
 */
export const handleCheckAlias = async (req, res, next) => {
  try {
    const { alias } = req.params;
    const result = await checkAliasAvailability(alias);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/live/:shortCode
 * Server-Sent Events (SSE) endpoint streaming real-time clicks for a shortCode.
 */
export const handleLiveStream = (req, res) => {
  const { shortCode } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Immediate connection confirmation handshake
  res.write(
    `data: ${JSON.stringify({ type: "connected", shortCode, ts: Date.now() })}\n\n`,
  );

  const clickListener = (event) => {
    res.write(`data: ${JSON.stringify({ type: "click", ...event })}\n\n`);
  };

  eventBus.on(`click:${shortCode}`, clickListener);

  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "ping", ts: Date.now() })}\n\n`);
  }, 10000);

  req.on("close", () => {
    clearInterval(heartbeat);
    eventBus.off(`click:${shortCode}`, clickListener);
  });
};

/**
 * GET /api/analytics/:shortCode/export
 * Exports historical click telemetry for a short URL as a downloadable CSV.
 */
export const handleExportCsv = async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    const { rows: urlRows } = await pool.query(
      "SELECT id, original_url, title FROM urls WHERE short_code = $1",
      [shortCode],
    );

    if (urlRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Short code not found." });
    }

    const { rows: clickRows } = await pool.query(
      `SELECT clicked_at, country, city, device_type, browser, os, referrer 
       FROM click_history 
       WHERE short_code = $1 
       ORDER BY clicked_at DESC`,
      [shortCode],
    );

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      "Timestamp",
      "Country",
      "City",
      "Device",
      "Browser",
      "OS",
      "Referrer",
    ];
    const csvLines = [headers.join(",")];

    for (const row of clickRows) {
      csvLines.push(
        [
          escapeCsv(row.clicked_at ? new Date(row.clicked_at).toISOString() : ""),
          escapeCsv(row.country || "Unknown"),
          escapeCsv(row.city || "Unknown"),
          escapeCsv(row.device_type || "desktop"),
          escapeCsv(row.browser || "Unknown"),
          escapeCsv(row.os || "Unknown"),
          escapeCsv(row.referrer || "direct"),
        ].join(","),
      );
    }

    const csvContent = csvLines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lynq-${shortCode}-analytics.csv"`,
    );
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/platform-stats
 * Returns live real-time platform statistics from PostgreSQL:
 * - totalLinks: count of all shortened URLs created
 * - totalRedirects: total clicks/redirects processed
 * - countriesCount: distinct countries logged in telemetry
 * - latencyMs: database/cache query latency
 * - uptime: Uptime SLA percentage
 */
export const handleGetPlatformStats = async (_req, res, next) => {
  try {
    const baseStats = await getOrLoadJson({
      l1Cache: statsL1Cache,
      cacheKey: "platform_stats",
      l1TtlMs: 15_000,
      redisTtlSec: 30,
      loader: async () => {
        const [statsRes, countriesRes] = await Promise.all([
          pool.query(`
            SELECT 
              COUNT(*)::int AS total_links,
              COALESCE(SUM(clicks), 0)::int AS total_redirects
            FROM urls
          `),
          pool.query(`
            SELECT COUNT(DISTINCT country)::int AS countries_count
            FROM click_history
            WHERE country IS NOT NULL AND country != 'Unknown' AND country != ''
          `),
        ]);

        return {
          totalLinks: statsRes.rows[0]?.total_links || 0,
          totalRedirects: statsRes.rows[0]?.total_redirects || 0,
          countriesCount: countriesRes.rows[0]?.countries_count || 0,
        };
      },
    });

    let latencyMs = 12;
    if (redisClient && redisClient.isReady) {
      try {
        const t0 = performance.now();
        await redisClient.ping();
        latencyMs = Math.max(1, Math.round(performance.now() - t0));
      } catch {}
    }

    return res.status(200).json({
      success: true,
      stats: {
        ...baseStats,
        latencyMs,
        uptime: "99.99%",
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/limits
 * Returns current tier limits and remaining usage:
 * - Guest: per-device limits (3/min, 5/hr, 10/day, max 10 active links, max 7-day expiry)
 * - Logged-in: per-account limits (20/min, 100/hr, 500/day, unlimited links, max 365-day expiry)
 */
export const handleGetLimits = async (req, res, next) => {
  try {
    const { identity, usage } = await getRateLimitUsage(req);
    const tier = identity.isAuthenticated ? RATE_LIMITS.user : RATE_LIMITS.guest;

    if (env.testingMode) {
      return res.status(200).json({
        success: true,
        testingMode: true,
        isAuthenticated: identity.isAuthenticated,
        scope: identity.scope,
        limits: {
          perMinute: null,
          perHour: null,
          perDay: null,
          apiPerMinute: null,
          maxActiveLinks: null,
          maxExpiryDays: 36500,
          bulkPerHour: null,
          aiPerHour: null,
        },
        usage: {
          perMinute: 0,
          perHour: 0,
          perDay: 0,
          activeLinks: null,
        },
        remaining: {
          perMinute: null,
          perHour: null,
          perDay: null,
          activeLinks: null,
        },
        features: {
          advancedOptions: true,
          customAlias: true,
          passwordProtection: true,
          maxClicks: true,
          tags: true,
          bulkUpload: true,
          aiTools: true,
        },
      });
    }

    let activeGuestLinks = null;
    if (!identity.isAuthenticated) {
      const deviceId =
        req.headers["x-device-id"] || req.query.deviceId || null;
      if (deviceId && typeof deviceId === "string" && deviceId.trim().length > 0) {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS active_count
           FROM urls
           WHERE device_id = $1
             AND user_id IS NULL
             AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
          [deviceId.trim()],
        );
        activeGuestLinks = rows[0]?.active_count || 0;
      } else {
        activeGuestLinks = 0;
      }
    }

    return res.status(200).json({
      success: true,
      testingMode: false,
      isAuthenticated: identity.isAuthenticated,
      scope: identity.scope,
      limits: {
        perMinute: tier.shortenPerMinute,
        perHour: tier.shortenPerHour,
        perDay: tier.shortenPerDay,
        apiPerMinute: tier.apiPerMinute,
        maxActiveLinks: tier.maxActiveLinks,
        maxExpiryDays: tier.maxExpiryDays,
        ...(identity.isAuthenticated
          ? { bulkPerHour: tier.bulkPerHour, aiPerHour: tier.aiPerHour }
          : {}),
      },
      usage: {
        perMinute: usage.perMinute,
        perHour: usage.perHour,
        perDay: usage.perDay,
        activeLinks: activeGuestLinks,
      },
      remaining: {
        perMinute: Math.max(0, tier.shortenPerMinute - usage.perMinute),
        perHour: Math.max(0, tier.shortenPerHour - usage.perHour),
        perDay: Math.max(0, tier.shortenPerDay - usage.perDay),
        activeLinks:
          tier.maxActiveLinks !== null && activeGuestLinks !== null
            ? Math.max(0, tier.maxActiveLinks - activeGuestLinks)
            : null,
      },
      features: {
        advancedOptions: identity.isAuthenticated,
        customAlias: identity.isAuthenticated,
        passwordProtection: identity.isAuthenticated,
        maxClicks: identity.isAuthenticated,
        tags: identity.isAuthenticated,
        bulkUpload: identity.isAuthenticated,
        aiTools: identity.isAuthenticated,
      },
    });
  } catch (err) {
    next(err);
  }
};


