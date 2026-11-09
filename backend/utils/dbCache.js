import redisClient from "../config/redis.js";

/**
 * Bounded O(1) In-Memory LRU Cache with Per-Entry TTL + Singleflight Coalescing
 * ──────────────────────────────────────────────────────────────────────────────
 * Sits as an L1 RAM layer in front of Redis Cloud (L2) and Neon PostgreSQL (DB).
 * - Hot link redirects avoid remote TCP hops (~0.01 ms L1 vs ~15-40 ms remote DB/Redis).
 * - Singleflight collapses N concurrent cache misses for the same key into 1 query.
 * - Negative caching shields PostgreSQL from repeated 404/non-existent lookups.
 */

const NEGATIVE_SENTINEL = Object.freeze({ __negative: true });

export class LruTtlCache {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
    this.map = new Map();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Refresh LRU recency in O(1)
    this.map.delete(key);
    this.map.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = 15_000) {
    if (ttlMs <= 0) return;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

export const urlL1Cache = new LruTtlCache(2500);
export const infoL1Cache = new LruTtlCache(600);
export const statsL1Cache = new LruTtlCache(32);

const inFlightMap = new Map();

/**
 * Singleflight Request Coalescer:
 * Deduplicates concurrent cache-miss loaders sharing the same key so at most
 * one database/Redis round-trip executes even under sudden burst stampedes.
 */
export const singleflight = (key, loader) => {
  const existing = inFlightMap.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inFlightMap.get(key) === promise) {
        inFlightMap.delete(key);
      }
    });

  inFlightMap.set(key, promise);
  return promise;
};

export const isNegativeCacheHit = (val) => val === NEGATIVE_SENTINEL || Boolean(val?.__negative);

export const markUrlMissing = async (shortCode, ttlSec = 15) => {
  urlL1Cache.set(`url:${shortCode}`, NEGATIVE_SENTINEL, ttlSec * 1000);
  if (!redisClient?.isReady) return;
  try {
    if (typeof redisClient.set === "function") {
      await redisClient.set(`url_missing:${shortCode}`, "1", { EX: ttlSec });
    }
  } catch {
    // Non-fatal
  }
};

export const isUrlMarkedMissingInRedis = async (shortCode) => {
  if (!redisClient?.isReady) return false;
  try {
    const val = await redisClient.get(`url_missing:${shortCode}`);
    if (val) {
      urlL1Cache.set(`url:${shortCode}`, NEGATIVE_SENTINEL, 15_000);
      return true;
    }
  } catch {
    // Non-fatal
  }
  return false;
};

/**
 * Pipeline an hSet + expire cleanly (single Redis RTT when multi() is available).
 */
export const cacheUrlHashInRedis = async (shortCode, hashFields, ttlSec = 86400) => {
  if (!redisClient?.isReady) return;
  try {
    if (typeof redisClient.multi === "function") {
      const multi = redisClient.multi();
      multi.hSet(`url:${shortCode}`, hashFields);
      multi.expire(`url:${shortCode}`, ttlSec);
      if (typeof multi.del === "function") {
        multi.del(`url_missing:${shortCode}`);
      }
      await multi.exec();
    } else {
      await Promise.all([
        redisClient.hSet(`url:${shortCode}`, hashFields),
        redisClient.expire(`url:${shortCode}`, ttlSec),
      ]);
    }
  } catch (err) {
    console.error("Redis cache write failed:", err.message);
  }
};

/**
 * Build normalized L1 URL record from raw PG or Redis fields.
 */
export const normalizeUrlRecord = (raw) => {
  if (!raw) return null;
  let rules = raw.routing_rules;
  if (typeof rules === "string") {
    try {
      rules = JSON.parse(rules);
    } catch {
      rules = {};
    }
  } else if (!rules || typeof rules !== "object") {
    rules = {};
  }

  let expiresAt = null;
  if (raw.expires_at !== null && raw.expires_at !== undefined && raw.expires_at !== "") {
    expiresAt = raw.expires_at instanceof Date ? raw.expires_at : new Date(raw.expires_at);
  }

  const maxClicks =
    raw.max_clicks !== null && raw.max_clicks !== undefined && raw.max_clicks !== ""
      ? parseInt(raw.max_clicks, 10)
      : null;

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    original_url: raw.original_url,
    password_hash: raw.password_hash || null,
    max_clicks: Number.isFinite(maxClicks) ? maxClicks : null,
    clicks: raw.clicks !== undefined && raw.clicks !== "" ? parseInt(raw.clicks, 10) || 0 : undefined,
    expires_at: expiresAt,
    routing_rules: rules,
  };
};

export const clearNegativeUrl = (shortCode) => {
  const cached = urlL1Cache.get(`url:${shortCode}`);
  if (isNegativeCacheHit(cached)) {
    urlL1Cache.delete(`url:${shortCode}`);
  }
};

export const invalidateUrlCache = async (shortCode) => {
  if (!shortCode) return;
  urlL1Cache.delete(`url:${shortCode}`);
  infoL1Cache.delete(`url_info:${shortCode}`);

  if (!redisClient?.isReady) return;
  try {
    if (typeof redisClient.del === "function") {
      await Promise.all([
        redisClient.del(`url:${shortCode}`),
        redisClient.del(`url_info:${shortCode}`),
        redisClient.del(`url_missing:${shortCode}`),
      ]).catch(() => {});
    }
  } catch {
    // Non-fatal
  }
};

export const invalidateUrlInfoCacheBatch = async (shortCodes = []) => {
  if (!Array.isArray(shortCodes) || shortCodes.length === 0) return;

  const keys = [];
  for (const code of shortCodes) {
    if (!code) continue;
    infoL1Cache.delete(`url_info:${code}`);
    keys.push(`url_info:${code}`);
  }
  statsL1Cache.delete("platform_stats");

  if (!redisClient?.isReady || keys.length === 0) return;
  try {
    if (typeof redisClient.multi === "function") {
      const multi = redisClient.multi();
      for (const k of keys) {
        multi.del(k);
      }
      multi.del("platform_stats");
      await multi.exec();
    } else if (typeof redisClient.del === "function") {
      await Promise.all([...keys.map((k) => redisClient.del(k)), redisClient.del("platform_stats")]);
    }
  } catch {
    // Non-fatal
  }
};

/**
 * Read-through JSON cache helper backed by L1 LRU + L2 Redis + Singleflight.
 */
export const getOrLoadJson = async ({
  l1Cache,
  cacheKey,
  l1TtlMs = 15_000,
  redisTtlSec = 60,
  loader,
}) => {
  const l1Hit = l1Cache.get(cacheKey);
  if (l1Hit !== undefined) {
    return l1Hit;
  }

  return singleflight(`json:${cacheKey}`, async () => {
    const secondCheck = l1Cache.get(cacheKey);
    if (secondCheck !== undefined) return secondCheck;

    if (redisClient?.isReady) {
      try {
        const raw = await redisClient.get(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          l1Cache.set(cacheKey, parsed, l1TtlMs);
          return parsed;
        }
      } catch {
        // Fallback to loader
      }
    }

    const fresh = await loader();
    l1Cache.set(cacheKey, fresh, l1TtlMs);

    if (redisClient?.isReady) {
      try {
        if (typeof redisClient.setEx === "function") {
          await redisClient.setEx(cacheKey, redisTtlSec, JSON.stringify(fresh));
        } else if (typeof redisClient.set === "function") {
          await redisClient.set(cacheKey, JSON.stringify(fresh), { EX: redisTtlSec });
        }
      } catch {
        // Non-fatal
      }
    }

    return fresh;
  });
};

