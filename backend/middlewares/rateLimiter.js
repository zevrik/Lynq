import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import crypto from "crypto";
import { getAuth } from "@clerk/express";
import client from "../config/redis.js";
import env from "../config/env.js";

/**
 * Tiered quota & rate limit definitions for Guests (per device) vs Logged-in Users (per account).
 */
export const RATE_LIMITS = {
  guest: {
    apiPerMinute: 40,
    shortenPerMinute: 3,
    shortenPerHour: 5,
    shortenPerDay: 10,
    maxActiveLinks: 10,
    maxExpiryDays: 7,
    aiSummaryPerHour: 20,
  },
  user: {
    apiPerMinute: 120,
    shortenPerMinute: 20,
    shortenPerHour: 100,
    shortenPerDay: 500,
    maxActiveLinks: null, // unlimited
    maxExpiryDays: 365,
    bulkPerHour: 5,
    aiPerHour: 30,
    aiSummaryPerHour: 120,
  },
};

/**
 * Resolve rate-limit identity for the request:
 * - Authenticated user -> per-login account key (`user:<userId>`)
 * - Guest user         -> per-device hash (`device:<md5(ip + ua)>`)
 */
export const resolveRateLimitIdentity = (req) => {
  let userId = req.userId || null;

  if (!userId) {
    if (env.nodeEnv !== "production" && req.headers["x-test-user-id"]) {
      userId = req.headers["x-test-user-id"];
    } else if (env.clerk?.secretKey) {
      try {
        userId = getAuth(req)?.userId || null;
      } catch {
        userId = null;
      }
    }
  }

  if (userId) {
    return {
      isAuthenticated: true,
      scope: "user",
      userId,
      key: `user:${userId}`,
    };
  }

  const normalizedIp = ipKeyGenerator(req.ip || "127.0.0.1"); // IPv6-safe helper
  const userAgent = req.headers["user-agent"] || "";
  const deviceHash = crypto
    .createHash("md5")
    .update(`${normalizedIp}-${userAgent}`)
    .digest("hex");

  return {
    isAuthenticated: false,
    scope: "device",
    userId: null,
    key: `device:${deviceHash}`,
  };
};

const STORE_PREFIXES = {
  api: "rl_api:",
  shortenMin: "rl_shorten_min:",
  shortenHr: "rl_shorten_hr:",
  shortenDay: "rl_shorten_day:",
  bulk: "rl_bulk:",
  ai: "rl_ai:",
  aiSummary: "rl_ai_summary:",
};

/**
 * Read current hit counts from Redis for a requester without incrementing limits.
 */
export const getRateLimitUsage = async (req) => {
  const identity = resolveRateLimitIdentity(req);
  const keys = [
    `${STORE_PREFIXES.shortenMin}${identity.key}`,
    `${STORE_PREFIXES.shortenHr}${identity.key}`,
    `${STORE_PREFIXES.shortenDay}${identity.key}`,
  ];

  const parseCounter = (val) => {
    const parsed = parseInt(val || "0", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  let rawValues = [null, null, null];
  if (client?.isReady) {
    try {
      if (typeof client.mGet === "function") {
        rawValues = await client.mGet(keys);
      } else {
        rawValues = await Promise.all(keys.map((k) => client.get(k).catch(() => null)));
      }
    } catch {
      rawValues = [null, null, null];
    }
  }

  return {
    identity,
    usage: {
      perMinute: parseCounter(rawValues[0]),
      perHour: parseCounter(rawValues[1]),
      perDay: parseCounter(rawValues[2]),
    },
  };
};

/**
 * Build a RedisStore only when the Redis client is ready.
 * Calling this before connectRedis() causes a ClientClosedError,
 * so we use a factory exported and called AFTER Redis connects.
 */
const makeRedisStore = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => client.sendCommand(args),
    prefix: prefix,
  });

/**
 * Factory — called once from server.js AFTER connectRedis() resolves.
 * Returns middleware limiters ready to register in Express.
 */
export const createLimiters = () => {
  const isLoadTest = process.env.LOAD_TEST_MODE === "true";

  const keyGen = (req) => resolveRateLimitIdentity(req).key;

  /**
   * General API rate limiter:
   * - Guest (per device): 40 req/min
   * - Logged-in (per user): 120 req/min
   */
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: (req) => {
      if (isLoadTest) return 100_000;
      return resolveRateLimitIdentity(req).isAuthenticated
        ? RATE_LIMITS.user.apiPerMinute
        : RATE_LIMITS.guest.apiPerMinute;
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    skip: (req) =>
      process.env.LOAD_TEST_MODE === "true" ||
      req.path === "/health" ||
      req.path.startsWith("/live/"),
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.api),
    message: (req) => ({
      success: false,
      error: resolveRateLimitIdentity(req).isAuthenticated
        ? "Too many requests. Please slow down and try again in a minute."
        : "Guest API rate limit reached (40 req/min per device). Sign in for higher limits or try again in a minute.",
    }),
  });

  /**
   * Shorten burst limiter (per minute):
   * - Guest (per device): 3 links/min
   * - Logged-in (per user): 20 links/min
   */
  const shortenMinuteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: (req) => {
      if (isLoadTest) return 100_000;
      return resolveRateLimitIdentity(req).isAuthenticated
        ? RATE_LIMITS.user.shortenPerMinute
        : RATE_LIMITS.guest.shortenPerMinute;
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.shortenMin),
    message: (req) => ({
      success: false,
      error: resolveRateLimitIdentity(req).isAuthenticated
        ? `Too many shorten requests (${RATE_LIMITS.user.shortenPerMinute}/min). Please wait a minute before trying again.`
        : `Guest burst limit reached (${RATE_LIMITS.guest.shortenPerMinute} links/min per device). Sign in to create up to ${RATE_LIMITS.user.shortenPerMinute} links/min!`,
    }),
  });

  /**
   * Shorten hourly limiter:
   * - Guest (per device): 5 links/hour
   * - Logged-in (per user): 100 links/hour
   */
  const shortenHourLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: (req) => {
      if (isLoadTest) return 100_000;
      return resolveRateLimitIdentity(req).isAuthenticated
        ? RATE_LIMITS.user.shortenPerHour
        : RATE_LIMITS.guest.shortenPerHour;
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.shortenHr),
    message: (req) => ({
      success: false,
      error: resolveRateLimitIdentity(req).isAuthenticated
        ? `Hourly shorten limit reached (${RATE_LIMITS.user.shortenPerHour} links/hour per account). Please try again later.`
        : `Guest hourly limit reached (${RATE_LIMITS.guest.shortenPerHour} short URLs/hour per device). Sign in for up to ${RATE_LIMITS.user.shortenPerHour} links/hour!`,
    }),
  });

  /**
   * Shorten daily limiter:
   * - Guest (per device): 10 links/day
   * - Logged-in (per user): 500 links/day
   */
  const shortenDayLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: (req) => {
      if (isLoadTest) return 100_000;
      return resolveRateLimitIdentity(req).isAuthenticated
        ? RATE_LIMITS.user.shortenPerDay
        : RATE_LIMITS.guest.shortenPerDay;
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.shortenDay),
    message: (req) => ({
      success: false,
      error: resolveRateLimitIdentity(req).isAuthenticated
        ? `Daily shorten limit reached (${RATE_LIMITS.user.shortenPerDay} links/day per account). Please try again tomorrow.`
        : `Guest daily limit reached (${RATE_LIMITS.guest.shortenPerDay} short URLs/day per device). Sign in for up to ${RATE_LIMITS.user.shortenPerDay} links/day!`,
    }),
  });

  /**
   * Bulk CSV upload limiter (authenticated users only):
   * - 5 batches per hour per login account
   */
  const bulkLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: isLoadTest ? 100_000 : RATE_LIMITS.user.bulkPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.bulk),
    message: {
      success: false,
      error: `Bulk upload limit reached (${RATE_LIMITS.user.bulkPerHour} batches per hour per account).`,
    },
  });

  /**
   * AI tools limiter (Auto-fill / Alias suggestions — authenticated users only):
   * - 30 requests per hour per login account
   */
  const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: isLoadTest ? 100_000 : RATE_LIMITS.user.aiPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.ai),
    message: {
      success: false,
      error: `AI suggestions limit reached (${RATE_LIMITS.user.aiPerHour} requests/hour per account).`,
    },
  });

  /**
   * AI Summary limiter (public /preview & /stats summary):
   * - Guest (per device): 20/hour
   * - Logged-in (per user): 120/hour
   */
  const aiSummaryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: (req) => {
      if (isLoadTest) return 100_000;
      return resolveRateLimitIdentity(req).isAuthenticated
        ? RATE_LIMITS.user.aiSummaryPerHour
        : RATE_LIMITS.guest.aiSummaryPerHour;
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: keyGen,
    store: makeRedisStore(STORE_PREFIXES.aiSummary),
    message: {
      success: false,
      error: "AI summary request limit reached. Please try again shortly.",
    },
  });

  return {
    apiLimiter,
    shortenMinuteLimiter,
    shortenHourLimiter,
    shortenDayLimiter,
    shortenLimiter: shortenMinuteLimiter, // backward compat alias
    bulkLimiter,
    aiLimiter,
    aiSummaryLimiter,
  };
};
