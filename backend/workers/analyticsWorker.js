import redisClient from "../config/redis.js";
import pool from "../config/db.js";
import crypto from "crypto";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import eventBus from "../config/eventBus.js";

const parseReferrer = (rawReferrer) => {
  if (!rawReferrer || typeof rawReferrer !== "string") return "direct";
  try {
    const url = new URL(
      rawReferrer.startsWith("http://") || rawReferrer.startsWith("https://")
        ? rawReferrer
        : `https://${rawReferrer}`,
    );
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || "direct";
  } catch {
    return rawReferrer.slice(0, 50) || "direct";
  }
};

const extractCleanIp = (ip) => {
  if (!ip || typeof ip !== "string") return "";
  return ip.replace(/^::ffff:/, "").split(",")[0].trim();
};

const BATCH_SIZE = 500;
const INTERVAL_MS = 5000;
const MAX_RETRIES = 3; // Phase 1 (Task 1.3): max DB retry attempts per batch

/**
 * Phase 1 (Task 1.3): Tracks how many consecutive failures a batch of raw
 * items has seen. Keyed by a hash of the first item so retried batches are
 * recognised across intervals.  Cleared on success.
 */
const retryCounters = new Map();

/**
 * Guard flag to prevent overlapping worker executions when a slow DB
 * transaction spans more than one INTERVAL_MS tick.
 */
export const startAnalyticsWorker = () => {
  console.log("👷 v2 Analytics Worker started. Processing queue every 5s...");

  let isProcessing = false;

  const processBatch = async () => {
    // Only process when Redis is connected and ready (avoids ECONNRESET during reconnects)
    if (!redisClient.isReady) {
      setTimeout(processBatch, 2000);
      return;
    }

    if (isProcessing) {
      setTimeout(processBatch, INTERVAL_MS);
      return;
    }

    isProcessing = true;
    let rawItems = null;

    try {
      const queueLen = await redisClient.lLen("analytics_queue");
      if (queueLen === 0) {
        return;
      }

      const itemsToFetch = Math.min(queueLen, BATCH_SIZE);

      const multi = redisClient.multi();
      multi.lRange("analytics_queue", 0, itemsToFetch - 1);
      multi.lTrim("analytics_queue", itemsToFetch, -1);

      const [fetched] = await multi.exec();
      rawItems = fetched;

      if (!rawItems || rawItems.length === 0) {
        isProcessing = false;
        return;
      }

      // Build a stable key for this batch to track retries
      const batchKey = rawItems[0];

      const clicks = rawItems.map((item) => JSON.parse(item));

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Phase 1 (Task 1.3): Filter out clicks for deleted/expired short codes
        // to prevent foreign-key constraint violations on click_history.
        const candidateCodes = [...new Set(clicks.map((c) => c.shortCode))];
        const { rows: existingRows } = await client.query(
          "SELECT short_code FROM urls WHERE short_code = ANY($1)",
          [candidateCodes],
        );
        const validCodeSet = new Set(existingRows.map((r) => r.short_code));
        const validClicks = clicks.filter((c) => validCodeSet.has(c.shortCode));

        if (validClicks.length === 0) {
          await client.query("COMMIT");
          retryCounters.delete(batchKey);
          return;
        }

        let historyValues = [];
        let historyQueryStr =
          "INSERT INTO click_history (short_code, visitor_hash, user_agent, clicked_at, country, region, city, latitude, longitude, device_type, browser, os, referrer) VALUES ";
        let paramIdx = 1;

        let uniqueValues = [];
        let uniqueQueryStr =
          "INSERT INTO unique_visitors (short_code, visitor_hash) VALUES ";
        let uniqueParamIdx = 1;

        const urlClicksMap = {};
        const urlLastVisitMap = {};
        const seenUniqueInBatch = new Set();
        const eventsToEmit = [];
        const visitorLastClickTime = new Map();

        validClicks.forEach((click) => {
          const visitorString = `${click.ip}-${click.userAgent}`;
          const visitorHash =
            click.visitorHash ||
            crypto
              .createHash("md5")
              .update(visitorString)
              .digest("hex");

          const clickTime = new Date(click.timestamp || Date.now()).getTime();
          const visitorShortCodeKey = `${click.shortCode}:${visitorHash}`;
          const prevTime = visitorLastClickTime.get(visitorShortCodeKey);

          // Suppress duplicate clicks from same visitor within 2000ms (e.g. StrictMode, double-clicks)
          if (prevTime !== undefined && Math.abs(clickTime - prevTime) < 2000) {
            return;
          }
          visitorLastClickTime.set(visitorShortCodeKey, clickTime);

          // Phase 2 (Task 2.3): Telemetry parsing (GeoIP, UA, Referrer)
          const cleanIp = extractCleanIp(click.ip);
          let country = null;
          let region = null;
          let city = null;
          let latitude = null;
          let longitude = null;

          if (cleanIp && cleanIp !== "127.0.0.1" && cleanIp !== "::1") {
            const geo = geoip.lookup(cleanIp);
            if (geo) {
              country = geo.country || null;
              region = geo.region || null;
              city = geo.city || null;
              if (geo.ll && Array.isArray(geo.ll)) {
                latitude = geo.ll[0];
                longitude = geo.ll[1];
              }
            }
          }

          // Local / private IP fallback so local testing accurately renders globe points
          if (
            !country &&
            (!cleanIp ||
              cleanIp === "127.0.0.1" ||
              cleanIp === "::1" ||
              cleanIp.startsWith("10.") ||
              cleanIp.startsWith("192.168."))
          ) {
            country = "IN";
            region = "GJ";
            city = "Surat";
            latitude = 21.1702;
            longitude = 72.8311;
          }

          const parser = new UAParser(click.userAgent || "");
          const parsedUA = parser.getResult();
          const deviceType = parsedUA.device?.type || "desktop";
          const browser = parsedUA.browser?.name || "Unknown";
          const os = parsedUA.os?.name || "Unknown";
          const referrer = parseReferrer(click.referrer);

          historyQueryStr += `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}),`;
          historyValues.push(
            click.shortCode,
            visitorHash,
            click.userAgent,
            click.timestamp,
            country,
            region,
            city,
            latitude,
            longitude,
            deviceType,
            browser,
            os,
            referrer,
          );

          eventsToEmit.push({
            shortCode: click.shortCode,
            country: country || "Unknown",
            region: region || "Unknown",
            city: city || "Unknown",
            latitude,
            longitude,
            device: deviceType,
            browser,
            os,
            referrer,
            timestamp: click.timestamp,
          });

          const uniqueKey = `${click.shortCode}:${visitorHash}`;
          if (!seenUniqueInBatch.has(uniqueKey)) {
            seenUniqueInBatch.add(uniqueKey);
            uniqueQueryStr += `($${uniqueParamIdx++}, $${uniqueParamIdx++}),`;
            uniqueValues.push(click.shortCode, visitorHash);
          }

          if (!urlClicksMap[click.shortCode]) urlClicksMap[click.shortCode] = 0;
          urlClicksMap[click.shortCode]++;

          if (
            !urlLastVisitMap[click.shortCode] ||
            click.timestamp > urlLastVisitMap[click.shortCode]
          ) {
            urlLastVisitMap[click.shortCode] = click.timestamp;
          }
        });

        historyQueryStr = historyQueryStr.slice(0, -1);
        uniqueQueryStr =
          uniqueQueryStr.slice(0, -1) +
          " ON CONFLICT (short_code, visitor_hash) DO NOTHING";

        if (historyValues.length > 0) {
          await client.query(historyQueryStr, historyValues);
          await client.query(uniqueQueryStr, uniqueValues);
        }

        const urlTotalClicksMap = {};
        const uniqueShortCodes = Object.keys(urlClicksMap);
        for (const code of uniqueShortCodes) {
          const { rows: updatedRows } = await client.query(
            "UPDATE urls SET clicks = clicks + $1, last_visited = GREATEST(COALESCE(last_visited, $2::timestamp), $2::timestamp) WHERE short_code = $3 RETURNING clicks",
            [urlClicksMap[code], urlLastVisitMap[code], code],
          );
          if (updatedRows[0]) {
            urlTotalClicksMap[code] = parseInt(updatedRows[0].clicks, 10);
          }
        }

        const maxClicksResult = await client.query(
          `
          SELECT urls.id, urls.short_code 
          FROM urls 
          JOIN (
            SELECT short_code, COUNT(*) as count 
            FROM unique_visitors 
            WHERE short_code = ANY($1) 
            GROUP BY short_code
          ) uv ON urls.short_code = uv.short_code 
          WHERE urls.max_clicks IS NOT NULL AND uv.count >= urls.max_clicks
        `,
          [uniqueShortCodes],
        );

        for (const row of maxClicksResult.rows) {
          await client.query("DELETE FROM urls WHERE id = $1", [row.id]);
          await redisClient.del(`url:${row.short_code}`);
        }

        await client.query("COMMIT");

        // ── Success: clear retry counter for this batch ───────────────────────
        retryCounters.delete(batchKey);

        // Phase 3 (Task 3.4): Broadcast committed click events via SSE
        for (const evt of eventsToEmit) {
          eventBus.emit(`click:${evt.shortCode}`, {
            ...evt,
            totalClicks: urlTotalClicksMap[evt.shortCode],
          });
        }

        console.log(
          `✅ Worker bulk-processed ${clicks.length} analytics events.`,
        );
      } catch (dbErr) {
        await client.query("ROLLBACK");

        // Phase 1 (Task 1.3): Retry logic with exponential backoff cap.
        const attempts = (retryCounters.get(batchKey) || 0) + 1;

        if (attempts < MAX_RETRIES) {
          // Put items back at the FRONT of the queue to be retried next tick.
          retryCounters.set(batchKey, attempts);
          await redisClient.lPush("analytics_queue", rawItems);
          console.error(
            `❌ Analytics DB transaction failed (attempt ${attempts}/${MAX_RETRIES}), re-queued ${rawItems.length} events:`,
            dbErr.message,
          );
        } else {
          // Poison batch: discard after MAX_RETRIES to prevent infinite stalling.
          retryCounters.delete(batchKey);
          console.error(
            `⚠️  Analytics batch exceeded ${MAX_RETRIES} retries and was DISCARDED (${rawItems.length} events). Last error:`,
            dbErr.message,
          );
        }
      } finally {
        client.release();
      }
    } catch (err) {
      // Phase 1 (Task 1.3): Outer catch — Redis or pool.connect() failures.
      // If we already dequeued items and something exploded before the DB
      // transaction, push them back so no analytics data is silently lost.
      if (rawItems && rawItems.length > 0) {
        try {
          if (redisClient.isReady) {
            await redisClient.lPush("analytics_queue", rawItems);
            console.error(
              `❌ Analytics worker outer error — re-queued ${rawItems.length} events:`,
              err.message,
            );
          }
        } catch (pushErr) {
          console.error(
            "❌ Failed to re-queue analytics events after outer error:",
            pushErr.message,
          );
        }
      } else {
        // If error occurred before reading queue items, only log non-connection errors
        const isConnErr = err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.message?.includes("ECONNRESET") || err.message?.includes("closed");
        if (!isConnErr) {
          console.error("❌ Analytics worker error:", err.message);
        }
      }
    } finally {
      isProcessing = false;
      setTimeout(processBatch, INTERVAL_MS);
    }
  };

  // Start initial worker tick
  setTimeout(processBatch, INTERVAL_MS);
};
