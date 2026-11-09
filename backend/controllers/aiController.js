import {
  generateSuggestions,
  generateSummary,
  suggestAvailableAliases,
} from "../services/aiService.js";
import { isValidUrl } from "../utils/validator.js";
import pool from "../config/db.js";
import redisClient from "../config/redis.js";
import { urlL1Cache, isNegativeCacheHit } from "../utils/dbCache.js";

/**
 * POST /api/ai/suggest
 * Body: { url: string }
 */
export const handleSuggest = async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "URL is required." });
    }

    if (!isValidUrl(url)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid URL provided." });
    }

    const suggestions = await generateSuggestions(url);

    return res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/ai/summary/:shortCode
 * Returns a 2-sentence AI summary of the destination URL with Redis caching.
 */
export const handleGetSummary = async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    if (!shortCode) {
      return res
        .status(400)
        .json({ success: false, error: "Short code is required." });
    }

    // Lookup destination URL in L1 RAM -> Redis Hash (`original_url`) -> PostgreSQL
    let originalUrl = null;
    const l1Hit = urlL1Cache.get(`url:${shortCode}`);
    if (l1Hit && !isNegativeCacheHit(l1Hit) && l1Hit.original_url) {
      originalUrl = l1Hit.original_url;
    }

    if (!originalUrl && redisClient?.isReady) {
      try {
        const cached = await redisClient.hGetAll(`url:${shortCode}`);
        if (cached && (cached.original_url || cached.originalUrl)) {
          originalUrl = cached.original_url || cached.originalUrl;
        }
      } catch {}
    }

    if (!originalUrl) {
      const { rows } = await pool.query(
        "SELECT original_url FROM urls WHERE short_code = $1",
        [shortCode],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Link not found." });
      }
      originalUrl = rows[0].original_url;
    }

    const { summary, cached } = await generateSummary(originalUrl, shortCode);

    return res.status(200).json({
      success: true,
      shortCode,
      originalUrl,
      summary,
      cached,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/ai/suggest-aliases
 * Body: { targetUrl: string, desiredAlias: string }
 * Returns available AI alternative aliases when an alias is already taken.
 */
export const handleSuggestAliases = async (req, res, next) => {
  try {
    const { targetUrl, desiredAlias } = req.body;

    if (!desiredAlias) {
      return res
        .status(400)
        .json({ success: false, error: "desiredAlias is required." });
    }

    const suggestions = await suggestAvailableAliases(
      targetUrl || "",
      desiredAlias,
    );

    return res.status(200).json({
      success: true,
      desiredAlias,
      suggestions,
    });
  } catch (err) {
    next(err);
  }
};
