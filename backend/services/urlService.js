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

  // Restrict advanced features for non-login (guest) users
  if (!userId) {
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

  const maxExpiryDays = userId
    ? RATE_LIMITS.user.maxExpiryDays
    : RATE_LIMITS.guest.maxExpiryDays;
  const numericExpiry = Number(expiresInDays);

  if (!expiresInDays || isNaN(numericExpiry) || numericExpiry < 1) {
    const err = new Error(
      `Expiry in days is required and must be between 1 and ${maxExpiryDays}.`,
    );
    err.status = 400;
    throw err;
  }

  if (numericExpiry > maxExpiryDays) {
    const err = new Error(
      userId
        ? `Expiry in days must be between 1 and ${maxExpiryDays}.`
        : `Guest links can only last up to ${maxExpiryDays} days. Sign in to set expiries up to ${RATE_LIMITS.user.maxExpiryDays} days.`,
    );
    err.status = userId ? 400 : 403;
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

  // Enforce active stored links quota per device for non-login users
  if (!userId && effectiveDeviceId) {
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

  let shortCode = trimmedAlias || null;

  if (shortCode) {
    if (!/^[a-zA-Z0-9-]{3,30}$/.test(shortCode)) {
      const err = new Error(
        "Custom alias must be 3–30 alphanumeric characters or hyphens.",
      );
      err.status = 400;
      throw err;
    }
    const { rows } = await pool.query(
      "SELECT id FROM urls WHERE short_code = $1",
      [shortCode],
    );
    if (rows.length > 0) {
      const err = new Error("That custom alias is already taken. Try another.");
      err.status = 409;
      throw err;
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const candidate = generateShortCode(i);
      const { rows } = await pool.query(
        "SELECT id FROM urls WHERE short_code = $1",
        [candidate],
      );
      if (rows.length === 0) {
        shortCode = candidate;
        break;
      }
    }
    if (!shortCode) {
      const err = new Error(
        "Failed to generate a unique short code. Please try again.",
      );
      err.status = 500;
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

  const inserted = insertRows[0];

  // Instantly Cache into Redis Hash
  try {
    await redisClient.hSet(`url:${shortCode}`, {
      original_url: inserted.original_url,
      password_hash: inserted.password_hash || "",
      max_clicks: inserted.max_clicks ? inserted.max_clicks.toString() : "",
      expires_at: inserted.expires_at ? inserted.expires_at.toISOString() : "",
      routing_rules: JSON.stringify(inserted.routing_rules || cleanedRules),
      id: inserted.id.toString(),
    });
    await redisClient.expire(`url:${shortCode}`, 86400); // 24hr TTL
  } catch (err) {
    console.error("Redis cache set failed:", err.message);
  }

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

    if (shouldTrack) {
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
  let data = null;

  // 1. FAST PATH: Fetch entirely from Redis RAM
  try {
    const cached = await redisClient.hGetAll(`url:${shortCode}`);
    if (cached && cached.original_url) {
      data = cached;
      if (data.password_hash === "") data.password_hash = null;
      if (data.max_clicks === "") data.max_clicks = null;
      else data.max_clicks = parseInt(data.max_clicks, 10);
      if (data.expires_at === "") data.expires_at = null;
      else data.expires_at = new Date(data.expires_at);

      if (data.routing_rules) {
        try {
          data.routing_rules = typeof data.routing_rules === "string" ? JSON.parse(data.routing_rules) : data.routing_rules;
        } catch {
          data.routing_rules = {};
        }
      } else {
        data.routing_rules = {};
      }
    }
  } catch (err) {
    console.error("Redis cache get failed:", err.message);
  }

  // 2. SLOW PATH: Fallback to PostgreSQL
  if (!data) {
    const { rows } = await pool.query(
      "SELECT * FROM urls WHERE short_code = $1",
      [shortCode],
    );
    if (rows.length === 0) {
      const err = new Error("Short URL not found or has expired.");
      err.status = 404;
      throw err;
    }
    data = rows[0];

    // Parse routing_rules from Postgres row
    if (data.routing_rules) {
      try {
        data.routing_rules = typeof data.routing_rules === "string" ? JSON.parse(data.routing_rules) : data.routing_rules;
      } catch {
        data.routing_rules = {};
      }
    } else {
      data.routing_rules = {};
    }

    // Re-cache for the next person
    try {
      await redisClient.hSet(`url:${shortCode}`, {
        original_url: data.original_url,
        password_hash: data.password_hash || "",
        max_clicks: data.max_clicks ? data.max_clicks.toString() : "",
        expires_at: data.expires_at ? data.expires_at.toISOString() : "",
        routing_rules: JSON.stringify(data.routing_rules || {}),
        id: data.id.toString(),
      });
      await redisClient.expire(`url:${shortCode}`, 86400);
    } catch (err) {
      console.error("Redis cache fallback set failed:", err.message);
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
      await redisClient.del(`url:${shortCode}`);
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
    await redisClient.del(`url:${shortCode}`).catch(() => {});
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
        await redisClient.del(`url:${shortCode}`).catch(() => {});
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

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
  const { rows } = await pool.query(
    "SELECT * FROM urls WHERE short_code = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
    [shortCode],
  );

  if (rows.length === 0) {
    const err = new Error("Short URL not found or has expired.");
    err.status = 404;
    throw err;
  }

  const data = rows[0];

  const { rows: uniqueRows } = await pool.query(
    "SELECT COUNT(*) as count FROM unique_visitors WHERE short_code = $1",
    [shortCode],
  );
  const uniqueVisitors = parseInt(uniqueRows[0].count, 10) || 0;

  const durationHours =
    (new Date().getTime() - new Date(data.created_at).getTime()) /
    (1000 * 60 * 60);
  const bucketInterval = durationHours <= 48 ? "hour" : "day";

  const [
    historyRes,
    deviceRes,
    countryRes,
    cityRes,
    browserRes,
    osRes,
    referrerRes,
    regionRes,
    geoPointsRes,
  ] = await Promise.all([
    pool.query(
      `
      SELECT 
        DATE_TRUNC('${bucketInterval}', clicked_at) as bucket,
        COUNT(*)::int as total_clicks,
        COUNT(DISTINCT visitor_hash)::int as unique_clicks
      FROM click_history 
      WHERE short_code = $1 
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(device_type, 'desktop') as device, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1
      GROUP BY device_type
      ORDER BY count DESC
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(country, 'Unknown') as country, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1 AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY count DESC
      LIMIT 15
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(city, 'Unknown') as city, country, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1 AND city IS NOT NULL AND city != ''
      GROUP BY city, country
      ORDER BY count DESC
      LIMIT 15
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(browser, 'Unknown') as browser, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 10
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(os, 'Unknown') as os, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1
      GROUP BY os
      ORDER BY count DESC
      LIMIT 10
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(referrer, 'direct') as referrer, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 10
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT COALESCE(region, 'Unknown') as region, country, COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1 AND region IS NOT NULL AND region != ''
      GROUP BY region, country
      ORDER BY count DESC
      LIMIT 20
    `,
      [shortCode],
    ),
    pool.query(
      `
      SELECT 
        COALESCE(city, '') as city, 
        COALESCE(region, '') as region, 
        COALESCE(country, 'Unknown') as country, 
        latitude, 
        longitude, 
        COUNT(*)::int as count
      FROM click_history
      WHERE short_code = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL
      GROUP BY city, region, country, latitude, longitude
      ORDER BY count DESC
      LIMIT 100
    `,
      [shortCode],
    ),
  ]);

  return {
    shortCode,
    shortUrl: `${env.frontendUrl}/${shortCode}`,
    originalUrl: data.original_url,
    title: data.title,
    clicks: data.clicks,
    uniqueVisitors,
    history: historyRes.rows,
    devices: deviceRes.rows,
    countries: countryRes.rows,
    cities: cityRes.rows,
    regions: regionRes.rows,
    geoPoints: geoPointsRes.rows,
    browsers: browserRes.rows,
    os: osRes.rows,
    referrers: referrerRes.rows,
    bucketInterval,
    createdAt: data.created_at,
    lastVisited: data.last_visited,
    isProtected: !!data.password_hash,
    routingRules: data.routing_rules || {},
  };
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

  // Invalidate Redis Cache
  try {
    await redisClient.del(`url:${shortCode}`);
  } catch (err) {
    console.error("Redis cache invalidation failed:", err.message);
  }

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

  // Invalidate Redis Cache
  try {
    await redisClient.del(`url:${shortCode}`);
  } catch (err) {
    console.error("Redis cache invalidation failed:", err.message);
  }

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
  const { rows } = await pool.query(
    "SELECT id FROM urls WHERE short_code = $1",
    [alias],
  );
  return { available: rows.length === 0 };
};
