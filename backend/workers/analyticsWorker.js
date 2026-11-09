import redisClient from "../config/redis.js";
import pool from "../config/db.js";
import eventBus from "../config/eventBus.js";
import { parseClickTelemetry } from "../utils/telemetry.js";
import { invalidateUrlInfoCacheBatch, invalidateUrlCache } from "../utils/dbCache.js";

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
          const telemetry = parseClickTelemetry({
            ip: click.ip,
            userAgent: click.userAgent,
            referrer: click.referrer,
            visitorHash: click.visitorHash,
          });
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
            referrer,
          } = telemetry;

          const clickTime = new Date(click.timestamp || Date.now()).getTime();
          const visitorShortCodeKey = `${click.shortCode}:${visitorHash}`;
          const prevTime = visitorLastClickTime.get(visitorShortCodeKey);

          // Suppress duplicate clicks from same visitor within 2000ms (e.g. StrictMode, double-clicks)
          if (prevTime !== undefined && Math.abs(clickTime - prevTime) < 2000) {
            return;
          }
          visitorLastClickTime.set(visitorShortCodeKey, clickTime);

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

        // Single set-based UNNEST bulk update instead of N sequential UPDATE queries
        if (uniqueShortCodes.length > 0) {
          const clickCounts = uniqueShortCodes.map((c) => urlClicksMap[c]);
          const lastVisits = uniqueShortCodes.map((c) => urlLastVisitMap[c]);
          const { rows: updatedRows } = await client.query(
            `
            UPDATE urls u
            SET
              clicks = u.clicks + batch.cnt,
              last_visited = GREATEST(COALESCE(u.last_visited, batch.last_ts), batch.last_ts)
            FROM UNNEST($1::varchar[], $2::int[], $3::timestamptz[]) AS batch(code, cnt, last_ts)
            WHERE u.short_code = batch.code
            RETURNING u.short_code, u.clicks
            `,
            [uniqueShortCodes, clickCounts, lastVisits],
          );
          for (const row of updatedRows) {
            urlTotalClicksMap[row.short_code] = parseInt(row.clicks, 10);
          }
        }

        const maxClicksResult = uniqueShortCodes.length > 0
          ? await client.query(
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
            )
          : { rows: [] };

        if (maxClicksResult.rows.length > 0) {
          const expiredIds = maxClicksResult.rows.map((r) => r.id);
          await client.query("DELETE FROM urls WHERE id = ANY($1::int[])", [expiredIds]);
          await Promise.all(maxClicksResult.rows.map((r) => invalidateUrlCache(r.short_code)));
        }

        await client.query("COMMIT");

        // Invalidate cached analytics & platform stats so refreshes stay fresh
        await invalidateUrlInfoCacheBatch(uniqueShortCodes);

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
