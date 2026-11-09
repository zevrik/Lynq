import bcrypt from "bcrypt";
import crypto from "crypto";
import pool from "../config/db.js";
import env from "../config/env.js";
import eventBus from "../config/eventBus.js";
import { generateShortCode } from "../utils/codeGenerator.js";
import { isValidUrl, normaliseUrl } from "../utils/validator.js";
import { computeVisitorHash, parseClickTelemetry } from "../utils/telemetry.js";
import redisClient from "../config/redis.js";
import { RATE_LIMITS } from "../middlewares/rateLimiter.js";
import {
  urlL1Cache,
  infoL1Cache,
  statsL1Cache,
  singleflight,
  isNegativeCacheHit,
  markUrlMissing,
  isUrlMarkedMissingInRedis,
  cacheUrlHashInRedis,
  normalizeUrlRecord,
  clearNegativeUrl,
  invalidateUrlCache,
  invalidateUrlInfoCacheBatch,
  getOrLoadJson,
} from "../utils/dbCache.js";

const hasAnyRoutingRule = (routingRules) => {
  if (!routingRules || typeof routingRules !== "object") return false;
  if (routingRules.fallbackUrl || routingRules.fallback_url) return true;
  if (
    routingRules.device &&
    (routingRules.device.ios ||
      routingRules.device.android ||
      routingRules.device.desktop)
  ) {
    return true;
  }
  const splitArr = routingRules.splitTest || routingRules.split_test;
  return Array.isArray(splitArr) && splitArr.length > 0;
};

export const shortenUrl = async (
  rawUrl,
  customAlias = null,
  password = null,
  expiresInDays = null,
  maxClicks = null,
  title = null,
  tags = null,
  deviceId = null,
  userId = null,
  routingRules = null,
) => {
  const originalUrl = normaliseUrl(rawUrl);

  if (!isValidUrl(originalUrl)) {
    const err = new Error("Invalid URL. Only HTTP/HTTPS URLs are accepted.");
    err.status = 400;
    throw err;
  }

  const trimmedAlias = customAlias ? String(customAlias).trim() : null;
  const trimmedPassword = password ? String(password).trim() : null;
  const trimmedTags = tags ? String(tags).trim() : null;
  const parsedMaxClicks =
    maxClicks !== null && maxClicks !== undefined && maxClicks !== ""
      ? parseInt(maxClicks, 10)
      : null;
  const hasRouting = hasAnyRoutingRule(routingRules);

  // Restrict advanced features for non-login (guest) users (bypassed in testing mode)
  if (!userId && !env.testingMode) {
    if (
      trimmedAlias ||
      trimmedPassword ||
      (parsedMaxClicks && parsedMaxClicks > 0) ||
      trimmedTags ||
      hasRouting
    ) {
      const err = new Error(
        "Sign in to unlock Custom Aliases, Password Protection, Max Clicks, Tags, and Smart Routing.",
      );
      err.status = 403;
      throw err;
    }
  }

  const maxExpiryDays = env.testingMode
    ? 36500
    : userId
      ? RATE_LIMITS.user.maxExpiryDays
      : RATE_LIMITS.guest.maxExpiryDays;
  const rawExpiry =
    env.testingMode && (expiresInDays === null || expiresInDays === undefined || expiresInDays === "")
      ? 30
      : expiresInDays;
  const numericExpiry = Number(rawExpiry);

  if (
    rawExpiry === null ||
    rawExpiry === undefined ||
    rawExpiry === "" ||
    isNaN(numericExpiry) ||
    numericExpiry < 1
  ) {
    const err = new Error(
      `Expiry in days is required and must be between 1 and ${maxExpiryDays}.`,
    );
    err.status = 400;
    throw err;
  }

  if (numericExpiry > maxExpiryDays) {
    const err = new Error(
      userId || env.testingMode
        ? `Expiry in days must be between 1 and ${maxExpiryDays}.`
        : `Guest links can only last up to ${maxExpiryDays} days. Sign in to set expiries up to ${RATE_LIMITS.user.maxExpiryDays} days.`,
    );
    err.status = userId || env.testingMode ? 400 : 403;
    throw err;
  }

  // Logged-in user links belong exclusively to userId, never a local guest deviceId
  const effectiveDeviceId = userId ? null : deviceId || null;

  // Duplicate check
  if (!trimmedAlias && !trimmedPassword && !parsedMaxClicks && !hasRouting) {
    let query;
    let params;
    if (userId) {
      query =
        "SELECT * FROM urls WHERE original_url = $1 AND user_id = $2 AND password_hash IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1";
      params = [originalUrl, userId];
    } else if (effectiveDeviceId) {
      query =
        "SELECT * FROM urls WHERE original_url = $1 AND device_id = $2 AND user_id IS NULL AND password_hash IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1";
      params = [originalUrl, effectiveDeviceId];
    } else {
      query =
        "SELECT * FROM urls WHERE original_url = $1 AND password_hash IS NULL AND device_id IS NULL AND user_id IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1";
      params = [originalUrl];
    }

    const { rows: existingRows } = await pool.query(query, params);

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      // Update expiry
      await pool.query(
        "UPDATE urls SET expires_at = CURRENT_TIMESTAMP + ($1 || ' days')::interval WHERE id = $2",
        [numericExpiry, existing.id],
      );

      const isOwner =
        Boolean(userId && existing.user_id === userId) ||
        Boolean(
          !userId &&
            effectiveDeviceId &&
            existing.device_id === effectiveDeviceId &&
            !existing.user_id,
        );

      return {
        shortUrl: `${env.frontendUrl}/${existing.short_code}`,
        shortCode: existing.short_code,
        isExisting: true,
        editToken: isOwner ? existing.edit_token : undefined,
        data: {
          title: existing.title,
          tags: existing.tags,
          originalUrl: existing.original_url,
          createdAt: existing.created_at,
          clicks: existing.clicks,
        },
      };
    }
  }

  // Enforce active stored links quota per device for non-login users (bypassed in testing mode)
  if (!userId && effectiveDeviceId && !env.testingMode) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS active_count
       FROM urls
       WHERE device_id = $1
         AND user_id IS NULL
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [effectiveDeviceId],
    );
    const activeCount = countRows[0]?.active_count || 0;
    if (activeCount >= RATE_LIMITS.guest.maxActiveLinks) {
      const err = new Error(
        `Guest storage limit reached (max ${RATE_LIMITS.guest.maxActiveLinks} active links per device). Delete an old link or sign in for unlimited links.`,
      );
      err.status = 403;
      throw err;
    }
  }

  let passwordHash = null;
  if (trimmedPassword && trimmedPassword.length > 0) {
    passwordHash = await bcrypt.hash(trimmedPassword, 10);
  }

  const editToken = crypto.randomBytes(16).toString("hex");

  // Clean and sanitize routing rules
  const cleanedRules = {};
  if (routingRules && typeof routingRules === "object") {
    // 1. Device Targeting
    if (routingRules.device && typeof routingRules.device === "object") {
      cleanedRules.device = {};
      if (routingRules.device.ios && isValidUrl(normaliseUrl(routingRules.device.ios))) {
        cleanedRules.device.ios = normaliseUrl(routingRules.device.ios);
      }
      if (routingRules.device.android && isValidUrl(normaliseUrl(routingRules.device.android))) {
        cleanedRules.device.android = normaliseUrl(routingRules.device.android);
      }
      if (routingRules.device.desktop && isValidUrl(normaliseUrl(routingRules.device.desktop))) {
        cleanedRules.device.desktop = normaliseUrl(routingRules.device.desktop);
      }
    }

    // 2. Expiration Fallback URL
    const fallback = routingRules.fallbackUrl || routingRules.fallback_url;
    if (fallback && isValidUrl(normaliseUrl(fallback))) {
      cleanedRules.fallbackUrl = normaliseUrl(fallback);
    }

    // 3. A/B Split Testing
    const splitArr = routingRules.splitTest || routingRules.split_test;
    if (Array.isArray(splitArr) && splitArr.length > 0) {
      const validVariants = splitArr
        .filter((v) => v && typeof v.url === "string" && isValidUrl(normaliseUrl(v.url)))
        .map((v) => ({
          url: normaliseUrl(v.url),
          weight: Math.max(1, parseInt(v.weight, 10) || 50),
        }));
      if (validVariants.length > 0) {
        cleanedRules.splitTest = validVariants;
      }
    }
  }

  let shortCode = trimmedAlias || null;
  let inserted = null;

  if (shortCode) {
    if (!/^[a-zA-Z0-9-]{3,30}$/.test(shortCode)) {
      const err = new Error(
        "Custom alias must be 3–30 alphanumeric characters or hyphens.",
      );
      err.status = 400;
      throw err;
    }

    // Fast path: check L1 / Redis before querying Postgres
    const cachedAlias = urlL1Cache.get(`url:${shortCode}`);
    if (cachedAlias && !isNegativeCacheHit(cachedAlias) && (!cachedAlias.expires_at || cachedAlias.expires_at > new Date())) {
      const err = new Error("That custom alias is already taken. Try another.");
      err.status = 409;
      throw err;
    }

    try {
      const { rows: insertRows } = await pool.query(
        `
        INSERT INTO urls (short_code, original_url, password_hash, max_clicks, expires_at, edit_token, title, tags, device_id, user_id, routing_rules)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 || ' days')::interval, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
        [
          shortCode,
          originalUrl,
          passwordHash,
          parsedMaxClicks || null,
          numericExpiry,
          editToken,
          title,
          trimmedTags,
          effectiveDeviceId,
          userId || null,
          JSON.stringify(cleanedRules),
        ],
      );
      inserted = insertRows[0];
    } catch (err) {
      if (err.code === "23505") {
        const conflictErr = new Error("That custom alias is already taken. Try another.");
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw err;
    }
  } else {
    // Optimistic INSERT with 23505 collision retry eliminates the extra pre-check DB round-trip
    for (let i = 0; i < 5; i++) {
      const candidate = generateShortCode(i);
      try {
        const { rows: insertRows } = await pool.query(
          `
          INSERT INTO urls (short_code, original_url, password_hash, max_clicks, expires_at, edit_token, title, tags, device_id, user_id, routing_rules)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 || ' days')::interval, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
          [
            candidate,
            originalUrl,
            passwordHash,
            parsedMaxClicks || null,
            numericExpiry,
            editToken,
            title,
            trimmedTags,
            effectiveDeviceId,
            userId || null,
            JSON.stringify(cleanedRules),
          ],
        );
        shortCode = candidate;
        inserted = insertRows[0];
        break;
      } catch (err) {
        if (err.code === "23505" && i < 4) {
          continue;
        }
        throw err;
      }
    }
    if (!inserted || !shortCode) {
      const err = new Error(
        "Failed to generate a unique short code. Please try again.",
      );
      err.status = 500;
      throw err;
    }
  }

  // Clear negative cache sentinel + warm L1 & pipelined Redis cache (single RTT)
  clearNegativeUrl(shortCode);
  statsL1Cache.delete("platform_stats");

  const hashPayload = {
    original_url: inserted.original_url,
    password_hash: inserted.password_hash || "",
    max_clicks: inserted.max_clicks ? inserted.max_clicks.toString() : "",
    expires_at: inserted.expires_at ? inserted.expires_at.toISOString() : "",
    routing_rules: JSON.stringify(inserted.routing_rules || cleanedRules),
    id: inserted.id.toString(),
  };

  if (!inserted.max_clicks) {
    urlL1Cache.set(`url:${shortCode}`, normalizeUrlRecord(inserted), 15_000);
  }
  await cacheUrlHashInRedis(shortCode, hashPayload, 86400);

  return {
    shortUrl: `${env.frontendUrl}/${shortCode}`,
    shortCode,
    isExisting: false,
    editToken,
    routingRules: inserted.routing_rules || cleanedRules,
    data: {
      title: inserted.title,
      tags: inserted.tags,
      originalUrl: inserted.original_url,
      createdAt: inserted.created_at,
      clicks: inserted.clicks,
    },
  };
};

// Helper to queue click analytics with rapid duplicate-click suppression
const queueAnalyticsClick = async (shortCode, ip, userAgent, referrer, extraData = {}) => {
  try {
    const visitorHash = computeVisitorHash(ip, userAgent);
    const dedupKey = `click_dedup:${shortCode}:${visitorHash}`;

    let shouldTrack = true;
    if (redisClient.isReady) {
      // Set key with 2s expiry only if it doesn't already exist (NX)
      // Returns 'OK' on first click, null on rapid duplicates (within 2s)
      const isFirst = await redisClient.set(dedupKey, "1", { NX: true, EX: 2 });
      if (!isFirst) {
        shouldTrack = false;
      }
    }

    if (shouldTrack && redisClient.isReady && typeof redisClient.rPush === "function") {
      const clickData = JSON.stringify({
        shortCode,
        ip,
        userAgent,
        referrer,
        visitorHash,
        timestamp: new Date().toISOString(),
        ...extraData,
      });
      // Push to the right side of the list (non-blocking)
      redisClient.rPush("analytics_queue", clickData).catch((err) => {
        console.error("Redis rPush failed:", err.message);
      });
    }
  } catch (err) {
    console.error("Failed to queue analytics:", err.message);
  }
};

export const resolveUrl = async (
  shortCode,
  ip = "",
  userAgent = "",
  referrer = "",
) => {
  // 0. L1 In-Process LRU RAM Fast Path + Negative 404 Shield
  let data = urlL1Cache.get(`url:${shortCode}`);
  if (isNegativeCacheHit(data)) {
    const err = new Error("Short URL not found or has expired.");
    err.status = 404;
    throw err;
  }

  // 1 & 2. Coalesced Read-Through (L2 Redis Hash -> PostgreSQL) via Singleflight
  if (!data) {
    data = await singleflight(`resolve:${shortCode}`, async () => {
      const l1SecondCheck = urlL1Cache.get(`url:${shortCode}`);
      if (isNegativeCacheHit(l1SecondCheck)) return l1SecondCheck;
      if (l1SecondCheck) return l1SecondCheck;

      // 1a. Check Redis negative sentinel to block repeat 404 scans from hitting DB
      if (await isUrlMarkedMissingInRedis(shortCode)) {
        return { __negative: true };
      }

      // 1b. Fetch from Redis Hash
      if (redisClient?.isReady) {
        try {
          const cached = await redisClient.hGetAll(`url:${shortCode}`);
          if (cached && cached.original_url) {
            const normalized = normalizeUrlRecord(cached);
            if (!normalized.max_clicks) {
              urlL1Cache.set(`url:${shortCode}`, normalized, 15_000);
            }
            return normalized;
          }
        } catch (err) {
          console.error("Redis cache get failed:", err.message);
        }
      }

      // 2. Fallback to PostgreSQL
      const { rows } = await pool.query(
        "SELECT * FROM urls WHERE short_code = $1",
        [shortCode],
      );
      if (rows.length === 0) {
        await markUrlMissing(shortCode, 15);
        return { __negative: true };
      }

      const normalized = normalizeUrlRecord(rows[0]);
      if (!normalized.max_clicks) {
        urlL1Cache.set(`url:${shortCode}`, normalized, 15_000);
      }

      await cacheUrlHashInRedis(
        shortCode,
        {
          original_url: normalized.original_url,
          password_hash: normalized.password_hash || "",
          max_clicks: normalized.max_clicks ? normalized.max_clicks.toString() : "",
          expires_at: normalized.expires_at ? normalized.expires_at.toISOString() : "",
          routing_rules: JSON.stringify(normalized.routing_rules || {}),
          id: normalized.id || "",
        },
        86400,
      );

      return normalized;
    });

    if (isNegativeCacheHit(data)) {
      const err = new Error("Short URL not found or has expired.");
      err.status = 404;
      throw err;
    }
  }

  const rules = data.routing_rules || {};
  const fallbackUrl = rules.fallbackUrl || rules.fallback_url || null;

  // 3. Expiry & Max Clicks Check with Smart Fallback
  const isExpired = data.expires_at && data.expires_at <= new Date();
  const isMaxClicks = data.max_clicks && data.clicks && data.clicks >= data.max_clicks;

  if (isExpired || isMaxClicks) {
    if (fallbackUrl) {
      // Record analytics even for fallback routing (deduplicated)
      queueAnalyticsClick(shortCode, ip, userAgent, referrer, { isFallback: true });
      return { requiresPassword: false, originalUrl: fallbackUrl, isFallback: true };
    }

    if (isExpired) {
      await pool.query("DELETE FROM urls WHERE short_code = $1", [shortCode]);
      await invalidateUrlCache(shortCode);
      await markUrlMissing(shortCode, 15);
    }
    const err = new Error("Short URL not found or has expired.");
    err.status = 404;
    throw err;
  }

  if (data.password_hash) {
    return { requiresPassword: true, originalUrl: null };
  }

  // 4. Smart Dynamic Routing Evaluation
  let resolvedDestination = data.original_url;

  // 4a. Device-based routing
  const ua = (userAgent || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isDesktop = !isIOS && !isAndroid && !/mobile|tablet/.test(ua);

  if (isIOS && rules?.device?.ios) {
    resolvedDestination = rules.device.ios;
  } else if (isAndroid && rules?.device?.android) {
    resolvedDestination = rules.device.android;
  } else if (isDesktop && rules?.device?.desktop) {
    resolvedDestination = rules.device.desktop;
  } else if (Array.isArray(rules?.splitTest) && rules.splitTest.length > 0) {
    // 4b. A/B Split Testing: fast pseudorandom weighted selection
    const variants = rules.splitTest;
    const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 1), 0);
    const rand = Math.random() * totalWeight;
    let cumulative = 0;
    for (const v of variants) {
      cumulative += (Number(v.weight) || 1);
      if (rand <= cumulative) {
        resolvedDestination = v.url;
        break;
      }
    }
  }

  // 5. v2 Analytics Queue (Fire & Forget with 2s rapid deduplication)
  queueAnalyticsClick(shortCode, ip, userAgent, referrer, { resolvedDestination });

  return { requiresPassword: false, originalUrl: resolvedDestination };
};

export const verifyUrlPassword = async (
  shortCode,
  password,
  ip = "",
  userAgent = "",
  referrer = "",
) => {
  const { rows } = await pool.query(
    "SELECT * FROM urls WHERE short_code = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
    [shortCode],
  );

  if (rows.length === 0) {
    await pool.query("DELETE FROM urls WHERE short_code = $1", [shortCode]);
    await invalidateUrlCache(shortCode);
    await markUrlMissing(shortCode, 15);
    const err = new Error("Short URL not found or has expired.");
    err.status = 404;
    throw err;
  }

  const data = rows[0];

  if (!data.password_hash) {
    return data.original_url;
  }

  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) {
    const err = new Error("Incorrect password");
    err.status = 401;
    throw err;
  }

  const clickedAt = new Date();
  const telemetry = parseClickTelemetry({ ip, userAgent, referrer });
  const {
    visitorHash,
    country,
    region,
    city,
    latitude,
    longitude,
    deviceType,
    browser,
    os,
    referrer: parsedReferrer,
  } = telemetry;

  let totalClicks = (parseInt(data.clicks, 10) || 0) + 1;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: updatedRows } = await client.query(
      "UPDATE urls SET clicks = clicks + 1, last_visited = GREATEST(COALESCE(last_visited, $1::timestamptz), $1::timestamptz) WHERE id = $2 RETURNING clicks",
      [clickedAt, data.id],
    );
    if (updatedRows[0]) {
      totalClicks = parseInt(updatedRows[0].clicks, 10);
    }

    await client.query(
      `
      INSERT INTO click_history (
        short_code, visitor_hash, user_agent, clicked_at,
        country, region, city, latitude, longitude,
        device_type, browser, os, referrer
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
      [
        shortCode,
        visitorHash,
        userAgent,
        clickedAt,
        country,
        region,
        city,
        latitude,
        longitude,
        deviceType,
        browser,
        os,
        parsedReferrer,
      ],
    );

    const { rowCount } = await client.query(
      `
      INSERT INTO unique_visitors (short_code, visitor_hash) 
      VALUES ($1, $2) ON CONFLICT (short_code, visitor_hash) DO NOTHING
    `,
      [shortCode, visitorHash],
    );

    if (data.max_clicks && rowCount > 0) {
      const { rows: countRows } = await client.query(
        "SELECT COUNT(*) as count FROM unique_visitors WHERE short_code = $1",
        [shortCode],
      );
      const uniqueCount = parseInt(countRows[0].count, 10);

      if (uniqueCount >= data.max_clicks) {
        await client.query("DELETE FROM urls WHERE id = $1", [data.id]);
        await invalidateUrlCache(shortCode);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Invalidate cached analytics summary so immediate refresh shows committed click
  await invalidateUrlInfoCacheBatch([shortCode]);

  // Broadcast committed telemetry immediately via SSE
  eventBus.emit(`click:${shortCode}`, {
    shortCode,
    country: country || "Unknown",
    region: region || "Unknown",
    city: city || "Unknown",
    latitude,
    longitude,
    device: deviceType,
    browser,
    os,
    referrer: parsedReferrer,
    timestamp: clickedAt.toISOString(),
    totalClicks,
  });

  return data.original_url;
};

export const getUrlInfo = async (shortCode) => {
  return getOrLoadJson({
    l1Cache: infoL1Cache,
    cacheKey: `url_info:${shortCode}`,
    l1TtlMs: 10_000,
    redisTtlSec: 45,
    loader: async () => {
      // Single-pass CTE collapses 11 sequential/fan-out DB queries into ONE heap pass & ONE network round-trip
      const { rows } = await pool.query(
        `
        WITH target_url AS (
          SELECT
            id,
            short_code,
            original_url,
            title,
            clicks,
            created_at,
            last_visited,
            routing_rules,
            (password_hash IS NOT NULL) AS is_protected,
            CASE
              WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) <= 172800 THEN 'hour'
              ELSE 'day'
            END AS bucket_interval
          FROM urls
          WHERE short_code = $1
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
          LIMIT 1
        ),
        scoped_clicks AS MATERIALIZED (
          SELECT
            CASE
              WHEN t.bucket_interval = 'hour' THEN DATE_TRUNC('hour', ch.clicked_at)
              ELSE DATE_TRUNC('day', ch.clicked_at)
            END AS bucket,
            ch.visitor_hash,
            ch.device_type,
            ch.country,
            ch.region,
            ch.city,
            ch.latitude,
            ch.longitude,
            ch.browser,
            ch.os,
            ch.referrer
          FROM click_history ch
          JOIN target_url t ON ch.short_code = t.short_code
        )
        SELECT
          t.short_code,
          t.original_url,
          t.title,
          t.clicks,
          t.created_at,
          t.last_visited,
          t.routing_rules,
          t.is_protected,
          t.bucket_interval,
          COALESCE((SELECT COUNT(*)::int FROM unique_visitors uv WHERE uv.short_code = t.short_code), 0) AS unique_visitors,
          COALESCE((
            SELECT json_agg(row_to_json(h) ORDER BY h.bucket ASC)
            FROM (
              SELECT
                bucket,
                COUNT(*)::int AS total_clicks,
                COUNT(DISTINCT visitor_hash)::int AS unique_clicks
              FROM scoped_clicks
              GROUP BY bucket
            ) h
          ), '[]'::json) AS history,
          COALESCE((
            SELECT json_agg(row_to_json(d) ORDER BY d.count DESC)
            FROM (
              SELECT COALESCE(device_type, 'desktop') AS device, COUNT(*)::int AS count
              FROM scoped_clicks
              GROUP BY device_type
            ) d
          ), '[]'::json) AS devices,
          COALESCE((
            SELECT json_agg(row_to_json(c) ORDER BY c.count DESC)
            FROM (
              SELECT COALESCE(country, 'Unknown') AS country, COUNT(*)::int AS count
              FROM scoped_clicks
              WHERE country IS NOT NULL AND country != ''
              GROUP BY country
              ORDER BY count DESC
              LIMIT 15
            ) c
          ), '[]'::json) AS countries,
          COALESCE((
            SELECT json_agg(row_to_json(ci) ORDER BY ci.count DESC)
            FROM (
              SELECT COALESCE(city, 'Unknown') AS city, country, COUNT(*)::int AS count
              FROM scoped_clicks
              WHERE city IS NOT NULL AND city != ''
              GROUP BY city, country
              ORDER BY count DESC
              LIMIT 15
            ) ci
          ), '[]'::json) AS cities,
          COALESCE((
            SELECT json_agg(row_to_json(b) ORDER BY b.count DESC)
            FROM (
              SELECT COALESCE(browser, 'Unknown') AS browser, COUNT(*)::int AS count
              FROM scoped_clicks
              GROUP BY browser
              ORDER BY count DESC
              LIMIT 10
            ) b
          ), '[]'::json) AS browsers,
          COALESCE((
            SELECT json_agg(row_to_json(o) ORDER BY o.count DESC)
            FROM (
              SELECT COALESCE(os, 'Unknown') AS os, COUNT(*)::int AS count
              FROM scoped_clicks
              GROUP BY os
              ORDER BY count DESC
              LIMIT 10
            ) o
          ), '[]'::json) AS os,
          COALESCE((
            SELECT json_agg(row_to_json(r) ORDER BY r.count DESC)
            FROM (
              SELECT COALESCE(referrer, 'direct') AS referrer, COUNT(*)::int AS count
              FROM scoped_clicks
              GROUP BY referrer
              ORDER BY count DESC
              LIMIT 10
            ) r
          ), '[]'::json) AS referrers,
          COALESCE((
            SELECT json_agg(row_to_json(rg) ORDER BY rg.count DESC)
            FROM (
              SELECT COALESCE(region, 'Unknown') AS region, country, COUNT(*)::int AS count
              FROM scoped_clicks
              WHERE region IS NOT NULL AND region != ''
              GROUP BY region, country
              ORDER BY count DESC
              LIMIT 20
            ) rg
          ), '[]'::json) AS regions,
          COALESCE((
            SELECT json_agg(row_to_json(gp) ORDER BY gp.count DESC)
            FROM (
              SELECT
                COALESCE(city, '') AS city,
                COALESCE(region, '') AS region,
                COALESCE(country, 'Unknown') AS country,
                latitude,
                longitude,
                COUNT(*)::int AS count
              FROM scoped_clicks
              WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              GROUP BY city, region, country, latitude, longitude
              ORDER BY count DESC
              LIMIT 100
            ) gp
          ), '[]'::json) AS geo_points
        FROM target_url t
        `,
        [shortCode],
      );

      if (rows.length === 0) {
        const err = new Error("Short URL not found or has expired.");
        err.status = 404;
        throw err;
      }

      const data = rows[0];
      return {
        shortCode,
        shortUrl: `${env.frontendUrl}/${shortCode}`,
        originalUrl: data.original_url,
        title: data.title,
        clicks: parseInt(data.clicks, 10) || 0,
        uniqueVisitors: parseInt(data.unique_visitors, 10) || 0,
        history: data.history || [],
        devices: data.devices || [],
        countries: data.countries || [],
        cities: data.cities || [],
        regions: data.regions || [],
        geoPoints: data.geo_points || [],
        browsers: data.browsers || [],
        os: data.os || [],
        referrers: data.referrers || [],
        bucketInterval: data.bucket_interval || "hour",
        createdAt: data.created_at,
        lastVisited: data.last_visited,
        isProtected: Boolean(data.is_protected),
        routingRules: data.routing_rules || {},
      };
    },
  });
};

export const editUrlDestination = async (
  shortCode,
  newUrl,
  editToken,
  routingRules = null,
  userId = null,
) => {
  const originalUrl = normaliseUrl(newUrl);

  if (!isValidUrl(originalUrl)) {
    const err = new Error("Invalid new URL provided.");
    err.status = 400;
    throw err;
  }

  const { rows } = await pool.query(
    "SELECT * FROM urls WHERE short_code = $1",
    [shortCode],
  );

  if (rows.length === 0) {
    const err = new Error("Short URL not found.");
    err.status = 404;
    throw err;
  }

  const data = rows[0];

  const isOwnerByUser = Boolean(userId && data.user_id && data.user_id === userId);
  const isOwnerByToken = Boolean(editToken && data.edit_token === editToken);

  if (!isOwnerByUser && !isOwnerByToken) {
    const err = new Error("Unauthorized: Invalid edit credentials.");
    err.status = 401;
    throw err;
  }

  if (routingRules !== null && typeof routingRules === "object") {
    await pool.query(
      "UPDATE urls SET original_url = $1, routing_rules = $2 WHERE id = $3",
      [originalUrl, JSON.stringify(routingRules), data.id],
    );
  } else {
    await pool.query("UPDATE urls SET original_url = $1 WHERE id = $2", [
      originalUrl,
      data.id,
    ]);
  }

  // Invalidate L1 + L2 Redis Caches
  await invalidateUrlCache(shortCode);

  return { success: true, newUrl: originalUrl };
};

export const deleteUrl = async (shortCode, editToken, userId = null) => {
  const { rows } = await pool.query(
    "SELECT * FROM urls WHERE short_code = $1",
    [shortCode],
  );

  if (rows.length === 0) {
    const err = new Error("Short URL not found.");
    err.status = 404;
    throw err;
  }

  const data = rows[0];

  const isOwnerByUser = Boolean(userId && data.user_id && data.user_id === userId);
  const isOwnerByToken = Boolean(editToken && data.edit_token === editToken);

  if (!isOwnerByUser && !isOwnerByToken) {
    const err = new Error("Unauthorized: Invalid edit credentials.");
    err.status = 401;
    throw err;
  }

  await pool.query("DELETE FROM urls WHERE id = $1", [data.id]);

  // Invalidate L1 + L2 Redis Caches & Platform stats
  await invalidateUrlCache(shortCode);
  statsL1Cache.delete("platform_stats");

  return { success: true };
};

/**
 * Check whether a custom alias (short code) is available.
 * Returns { available: true } or { available: false }.
 */
export const checkAliasAvailability = async (alias) => {
  if (!/^[a-zA-Z0-9-]{3,30}$/.test(alias)) {
    const err = new Error(
      "Alias must be 3–30 alphanumeric characters or hyphens.",
    );
    err.status = 400;
    throw err;
  }

  const cached = urlL1Cache.get(`url:${alias}`);
  if (isNegativeCacheHit(cached)) {
    return { available: true };
  }
  if (cached && (!cached.expires_at || cached.expires_at > new Date())) {
    return { available: false };
  }

  if (redisClient?.isReady) {
    try {
      const redisCached = await redisClient.hGetAll(`url:${alias}`);
      if (redisCached && redisCached.original_url) {
        const exp = redisCached.expires_at ? new Date(redisCached.expires_at) : null;
        if (!exp || exp > new Date()) {
          return { available: false };
        }
      }
    } catch {
      // Fallback to DB
    }
  }

  const { rows } = await pool.query(
    "SELECT id FROM urls WHERE short_code = $1",
    [alias],
  );
  if (rows.length === 0) {
    await markUrlMissing(alias, 15);
    return { available: true };
  }
  return { available: false };
};
