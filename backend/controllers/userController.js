import pool from "../config/db.js";
import env from "../config/env.js";

/**
 * POST /api/user/claim-links
 * Claims anonymous/guest links created by this client and binds them to the authenticated user.
 * Clears guest `device_id` on claimed links so non-login tracking is removed.
 * Body: { links?: [{ shortCode, editToken }], deviceId?: string } or [{ shortCode, editToken }]
 */
export const handleClaimLinks = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rawLinks = req.body?.links || (Array.isArray(req.body) ? req.body : []);
    const rawDeviceId = req.body?.deviceId;
    const safeDeviceId =
      typeof rawDeviceId === "string" && rawDeviceId.trim().length >= 8
        ? rawDeviceId.trim()
        : null;

    // Filter valid objects with shortCode and editToken
    const validPairs = Array.isArray(rawLinks)
      ? rawLinks.filter(
          (item) =>
            item &&
            typeof item.shortCode === "string" &&
            typeof item.editToken === "string" &&
            item.editToken.trim().length > 0,
        )
      : [];

    if (validPairs.length === 0 && !safeDeviceId) {
      return res.status(200).json({
        success: true,
        claimedCount: 0,
        claimedCodes: [],
        message: "No links to claim.",
      });
    }

    const claimedSet = new Set();

    // 1. Claim links matching (short_code, edit_token) where not owned by another user
    for (const { shortCode, editToken } of validPairs) {
      const result = await pool.query(
        `UPDATE urls 
         SET user_id = $1, device_id = NULL 
         WHERE short_code = $2 AND edit_token = $3 AND user_id IS NULL
         RETURNING short_code`,
        [userId, shortCode, editToken],
      );
      if (result.rows.length > 0) {
        claimedSet.add(result.rows[0].short_code);
      }
    }

    // 2. Claim any remaining unclaimed links associated with this guest browser deviceId
    //    (covers duplicate-returned guest links or items created earlier on the same browser)
    if (safeDeviceId) {
      const deviceResult = await pool.query(
        `UPDATE urls
         SET user_id = $1, device_id = NULL
         WHERE device_id = $2 AND user_id IS NULL
         RETURNING short_code`,
        [userId, safeDeviceId],
      );
      for (const row of deviceResult.rows) {
        claimedSet.add(row.short_code);
      }
    }

    const claimedCodes = Array.from(claimedSet);

    return res.status(200).json({
      success: true,
      claimedCount: claimedCodes.length,
      claimedCodes,
      message: `Successfully claimed ${claimedCodes.length} link(s) to your account.`,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/user/links
 * Returns all links owned by the logged-in user.
 */
export const handleGetUserLinks = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { rows } = await pool.query(
      `SELECT short_code, original_url, title, tags, clicks, created_at, expires_at, max_clicks, last_visited, edit_token
       FROM urls
       WHERE user_id = $1::varchar
       ORDER BY created_at DESC`,
      [userId]
    );

    const links = rows.map((r) => ({
      shortCode: r.short_code,
      shortUrl: `${env.frontendUrl}/${r.short_code}`,
      originalUrl: r.original_url,
      title: r.title,
      tags: r.tags,
      clicks: parseInt(r.clicks, 10) || 0,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      maxClicks: r.max_clicks,
      lastVisited: r.last_visited,
      editToken: r.edit_token,
    }));

    return res.status(200).json({
      success: true,
      count: links.length,
      links,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/user/analytics/summary
 * Returns total clicks, top 3 performing links, and total active links across the user's account.
 */
export const handleGetUserAnalyticsSummary = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // 1. Overall aggregates
    const totalsPromise = pool.query(
      `SELECT 
         COALESCE(SUM(clicks), 0)::int AS total_clicks,
         COUNT(*)::int AS total_links,
         COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)::int AS active_links
       FROM urls
       WHERE user_id = $1::varchar`,
      [userId]
    );

    // 2. Top 3 performing links
    const topPromise = pool.query(
      `SELECT short_code, original_url, title, clicks, created_at
       FROM urls
       WHERE user_id = $1::varchar
       ORDER BY clicks DESC, created_at DESC
       LIMIT 3`,
      [userId]
    );

    const [totalsResult, topResult] = await Promise.all([totalsPromise, topPromise]);

    const stats = totalsResult.rows[0] || { total_clicks: 0, total_links: 0, active_links: 0 };
    const topLinks = topResult.rows.map((r) => ({
      shortCode: r.short_code,
      shortUrl: `${env.frontendUrl}/${r.short_code}`,
      originalUrl: r.original_url,
      title: r.title,
      clicks: parseInt(r.clicks, 10) || 0,
      createdAt: r.created_at,
    }));

    return res.status(200).json({
      success: true,
      summary: {
        totalClicks: parseInt(stats.total_clicks, 10) || 0,
        totalLinks: parseInt(stats.total_links, 10) || 0,
        activeLinks: parseInt(stats.active_links, 10) || 0,
        topLinks,
      },
    });
  } catch (err) {
    next(err);
  }
};
