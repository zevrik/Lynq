import client from "../config/redis.js";
import pool from "../config/db.js";
import { urlL1Cache, isNegativeCacheHit, markUrlMissing } from "../utils/dbCache.js";

const CACHE_TTL = 300; // 5 minutes
const CHECK_TIMEOUT_MS = 6000; // 6 second timeout for HEAD request

/**
 * Checks the liveness of a destination URL.
 * Results are cached in Redis for 5 minutes to handle load.
 *
 * @param {string} shortCode
 * @returns {object} { isAlive, statusCode, responseTime, checkedAt, destinationUrl }
 */
export const checkUrlStatus = async (shortCode) => {
  const cacheKey = `status:${shortCode}`;

  // 1. Check Redis cache first
  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      return { ...JSON.parse(cached), fromCache: true };
    }
  } catch (err) {
    // Redis miss or error — proceed to live check
  }

  // 2. Resolve destination URL from L1 RAM -> Redis URL Hash -> PostgreSQL
  let destinationUrl = null;
  const l1Hit = urlL1Cache.get(`url:${shortCode}`);
  if (isNegativeCacheHit(l1Hit)) {
    const err = new Error("Short URL not found or has expired.");
    err.status = 404;
    throw err;
  }
  if (l1Hit && l1Hit.original_url && (!l1Hit.expires_at || l1Hit.expires_at > new Date())) {
    destinationUrl = l1Hit.original_url;
  }

  if (!destinationUrl && client?.isReady) {
    try {
      const urlHash = await client.hGetAll(`url:${shortCode}`);
      if (urlHash && urlHash.original_url) {
        const exp = urlHash.expires_at ? new Date(urlHash.expires_at) : null;
        if (!exp || exp > new Date()) {
          destinationUrl = urlHash.original_url;
        }
      }
    } catch {
      // Fall through to Postgres
    }
  }

  if (!destinationUrl) {
    const { rows } = await pool.query(
      "SELECT original_url FROM urls WHERE short_code = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
      [shortCode],
    );

    if (rows.length === 0) {
      await markUrlMissing(shortCode, 15);
      const err = new Error("Short URL not found or has expired.");
      err.status = 404;
      throw err;
    }

    destinationUrl = rows[0].original_url;
  }

  // 3. Fire a HEAD request (no body download, very fast)
  const startTime = Date.now();
  let isAlive = false;
  let statusCode = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    const response = await fetch(destinationUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Lynq-StatusChecker/1.0",
      },
    });

    clearTimeout(timeoutId);
    statusCode = response.status;
    isAlive = response.ok; // true for 200-299
  } catch (err) {
    // Timeout, DNS failure, connection refused, etc.
    isAlive = false;
    statusCode = err.name === "AbortError" ? 408 : 0;
  }

  const responseTime = Date.now() - startTime;
  const checkedAt = new Date().toISOString();

  const result = {
    isAlive,
    statusCode,
    responseTime,
    checkedAt,
    destinationUrl,
  };

  // 4. Cache result in Redis for 5 minutes
  try {
    await client.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    // Redis write failure — non-critical, just continue
  }

  return { ...result, fromCache: false };
};
