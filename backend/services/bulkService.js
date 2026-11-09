import pool from "../config/db.js";
import env from "../config/env.js";
import { generateShortCode } from "../utils/codeGenerator.js";
import { isValidUrl, normaliseUrl } from "../utils/validator.js";
import crypto from "crypto";
import redisClient from "../config/redis.js";
import {
  urlL1Cache,
  statsL1Cache,
  clearNegativeUrl,
  normalizeUrlRecord,
} from "../utils/dbCache.js";

/**
 * Bulk-shortens an array of URL rows from a CSV upload using set-based
 * batch lookups, a single UNNEST multi-row INSERT, and a single Redis pipeline
 * (O(1) DB round-trips instead of O(3N) sequential queries).
 *
 * Each row: { url, title?, customAlias? }
 * Returns an array of results preserving exact input order.
 */
export const bulkShortenUrls = async (rows, deviceId = null, userId = null) => {
  const results = new Array(rows.length);
  const effectiveDeviceId = userId ? null : deviceId || null;

  const customAliasCandidates = new Set();
  const autoOriginalUrls = new Set();
  const pendingRows = [];

  // 1. Validate & normalize every row in memory
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx] || {};
    const rawUrl = (row.url || row.URL || row.link || row.Link || "").trim();
    const title = (row.title || row.Title || "").trim() || null;
    const customAlias =
      (row.alias || row.custom_alias || row.customAlias || "").trim() || null;

    if (!rawUrl) {
      results[idx] = { originalUrl: "", shortUrl: "", error: "Empty URL, skipped." };
      continue;
    }

    if (!title) {
      results[idx] = { originalUrl: rawUrl, shortUrl: "", error: "Title is required." };
      continue;
    }

    const originalUrl = normaliseUrl(rawUrl);
    if (!isValidUrl(originalUrl)) {
      results[idx] = { originalUrl: rawUrl, shortUrl: "", error: "Invalid URL format." };
      continue;
    }

    if (customAlias) {
      if (!/^[a-zA-Z0-9-]{3,30}$/.test(customAlias)) {
        results[idx] = {
          originalUrl: rawUrl,
          shortUrl: "",
          error: "Invalid alias: use 3–30 alphanumeric chars or hyphens.",
        };
        continue;
      }
      customAliasCandidates.add(customAlias);
    } else {
      autoOriginalUrls.add(originalUrl);
    }

    pendingRows.push({ idx, rawUrl, originalUrl, title, customAlias });
  }

  if (pendingRows.length === 0) {
    return results;
  }

  // 2. Single parallel batch query for custom-alias conflicts + existing URL duplicates
  const aliasArr = Array.from(customAliasCandidates);
  const urlArr = Array.from(autoOriginalUrls);

  const takenCodesPromise = aliasArr.length > 0
    ? pool.query("SELECT short_code FROM urls WHERE short_code = ANY($1::varchar[])", [aliasArr])
    : Promise.resolve({ rows: [] });

  let dupPromise;
  if (urlArr.length === 0) {
    dupPromise = Promise.resolve({ rows: [] });
  } else if (userId) {
    dupPromise = pool.query(
      `SELECT short_code, edit_token, original_url
       FROM urls
       WHERE original_url = ANY($1::text[])
         AND user_id = $2::varchar
         AND password_hash IS NULL
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [urlArr, userId],
    );
  } else if (effectiveDeviceId) {
    dupPromise = pool.query(
      `SELECT short_code, edit_token, original_url
       FROM urls
       WHERE original_url = ANY($1::text[])
         AND device_id = $2::varchar
         AND user_id IS NULL
         AND password_hash IS NULL
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [urlArr, effectiveDeviceId],
    );
  } else {
    dupPromise = pool.query(
      `SELECT short_code, edit_token, original_url
       FROM urls
       WHERE original_url = ANY($1::text[])
         AND password_hash IS NULL
         AND device_id IS NULL
         AND user_id IS NULL
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [urlArr],
    );
  }

  const [takenRes, dupRes] = await Promise.all([takenCodesPromise, dupPromise]);

  const takenCodesSet = new Set(takenRes.rows.map((r) => r.short_code));
  const existingDupMap = new Map();
  for (const r of dupRes.rows) {
    if (!existingDupMap.has(r.original_url)) {
      existingDupMap.set(r.original_url, {
        shortCode: r.short_code,
        editToken: r.edit_token,
      });
    }
  }

  // 3. Resolve duplicates/conflicts and prepare rows to insert
  const toInsert = [];
  const generatedCodeCandidates = [];

  for (const item of pendingRows) {
    const { idx, originalUrl, title, customAlias } = item;

    if (customAlias) {
      if (takenCodesSet.has(customAlias)) {
        results[idx] = {
          originalUrl: item.rawUrl,
          shortUrl: "",
          error: `Alias "${customAlias}" is already taken.`,
        };
        continue;
      }
      takenCodesSet.add(customAlias);
      toInsert.push({
        idx,
        shortCode: customAlias,
        originalUrl,
        title,
        editToken: crypto.randomBytes(16).toString("hex"),
      });
    } else {
      const existing = existingDupMap.get(originalUrl);
      if (existing) {
        results[idx] = {
          originalUrl,
          title: title || originalUrl,
          shortUrl: `${env.frontendUrl}/${existing.shortCode}`,
          shortCode: existing.shortCode,
          editToken: existing.editToken,
          isExisting: true,
          error: null,
        };
        continue;
      }

      let candidate = generateShortCode(0);
      while (takenCodesSet.has(candidate)) {
        candidate = generateShortCode(1);
      }
      takenCodesSet.add(candidate);
      generatedCodeCandidates.push(candidate);

      const editToken = crypto.randomBytes(16).toString("hex");
      // Reuse within same CSV batch if same URL repeats
      existingDupMap.set(originalUrl, { shortCode: candidate, editToken });

      toInsert.push({
        idx,
        shortCode: candidate,
        originalUrl,
        title,
        editToken,
        isGenerated: true,
      });
    }
  }

  // 4. Verify generated short codes against DB in ONE batch query and swap rare collisions
  if (generatedCodeCandidates.length > 0) {
    const { rows: collidedRows } = await pool.query(
      "SELECT short_code FROM urls WHERE short_code = ANY($1::varchar[])",
      [generatedCodeCandidates],
    );
    if (collidedRows.length > 0) {
      const collidedSet = new Set(collidedRows.map((r) => r.short_code));
      for (const entry of toInsert) {
        if (entry.isGenerated && collidedSet.has(entry.shortCode)) {
          let fresh = null;
          for (let attempt = 1; attempt <= 5; attempt++) {
            const nextCode = generateShortCode(attempt);
            if (!takenCodesSet.has(nextCode)) {
              fresh = nextCode;
              takenCodesSet.add(nextCode);
              break;
            }
          }
          entry.shortCode = fresh || generateShortCode(4);
        }
      }
    }
  }

  if (toInsert.length === 0) {
    return results;
  }

  // 5. Single UNNEST multi-row INSERT inside ONE DB round-trip
  const expiresInDays = 30;
  const codes = toInsert.map((r) => r.shortCode);
  const origUrls = toInsert.map((r) => r.originalUrl);
  const tokens = toInsert.map((r) => r.editToken);
  const titles = toInsert.map((r) => r.title);
  const deviceIds = toInsert.map(() => effectiveDeviceId);
  const userIds = toInsert.map(() => userId || null);

  let insertedRows = [];
  try {
    const res = await pool.query(
      `
      INSERT INTO urls (short_code, original_url, password_hash, max_clicks, expires_at, edit_token, title, tags, device_id, user_id)
      SELECT
        u.short_code,
        u.original_url,
        NULL,
        NULL,
        CURRENT_TIMESTAMP + ($1 || ' days')::interval,
        u.edit_token,
        u.title,
        NULL,
        u.device_id,
        u.user_id
      FROM UNNEST(
        $2::varchar[],
        $3::text[],
        $4::varchar[],
        $5::varchar[],
        $6::varchar[],
        $7::varchar[]
      ) AS u(short_code, original_url, edit_token, title, device_id, user_id)
      RETURNING id, short_code, original_url, edit_token, title, expires_at
      `,
      [expiresInDays, codes, origUrls, tokens, titles, deviceIds, userIds],
    );
    insertedRows = res.rows;
  } catch (batchErr) {
    // Graceful per-row fallback only if an unexpected concurrent constraint race occurs
    for (const row of toInsert) {
      try {
        const single = await pool.query(
          `INSERT INTO urls (short_code, original_url, password_hash, max_clicks, expires_at, edit_token, title, tags, device_id, user_id)
           VALUES ($1, $2, NULL, NULL, CURRENT_TIMESTAMP + ($3 || ' days')::interval, $4, $5, NULL, $6, $7)
           RETURNING id, short_code, original_url, edit_token, title, expires_at`,
          [row.shortCode, row.originalUrl, expiresInDays, row.editToken, row.title, effectiveDeviceId, userId || null],
        );
        if (single.rows[0]) insertedRows.push(single.rows[0]);
      } catch (rowErr) {
        results[row.idx] = {
          originalUrl: row.originalUrl,
          shortUrl: "",
          error: rowErr.message || batchErr.message || "Unknown error.",
        };
      }
    }
  }

  const insertedByCode = new Map(insertedRows.map((r) => [r.short_code, r]));

  // 6. Single Redis pipeline to warm all newly created short codes + clear negative cache
  const cacheItems = [];
  for (const row of toInsert) {
    const dbRow = insertedByCode.get(row.shortCode);
    if (!dbRow) {
      if (!results[row.idx]) {
        results[row.idx] = {
          originalUrl: row.originalUrl,
          shortUrl: "",
          error: "Insert conflict, please retry.",
        };
      }
      continue;
    }

    clearNegativeUrl(row.shortCode);
    urlL1Cache.set(
      `url:${row.shortCode}`,
      normalizeUrlRecord({
        id: dbRow.id,
        original_url: row.originalUrl,
        password_hash: null,
        max_clicks: null,
        expires_at: dbRow.expires_at,
        routing_rules: {},
      }),
      15_000,
    );
    cacheItems.push({ row, dbRow });

    results[row.idx] = {
      originalUrl: row.originalUrl,
      title: row.title || row.originalUrl,
      shortUrl: `${env.frontendUrl}/${row.shortCode}`,
      shortCode: row.shortCode,
      editToken: row.editToken,
      isExisting: false,
      error: null,
    };
  }

  statsL1Cache.delete("platform_stats");

  if (redisClient?.isReady && cacheItems.length > 0) {
    try {
      if (typeof redisClient.multi === "function") {
        const multi = redisClient.multi();
        for (const { row, dbRow } of cacheItems) {
          multi.hSet(`url:${row.shortCode}`, {
            original_url: row.originalUrl,
            password_hash: "",
            max_clicks: "",
            expires_at: dbRow.expires_at ? new Date(dbRow.expires_at).toISOString() : "",
            routing_rules: "{}",
            id: dbRow.id.toString(),
          });
          multi.expire(`url:${row.shortCode}`, 86400);
          multi.del(`url_missing:${row.shortCode}`);
        }
        multi.del("platform_stats");
        await multi.exec();
      }
    } catch (redisErr) {
      console.error("Redis bulk pipeline failed:", redisErr.message);
    }
  }

  return results;
};
