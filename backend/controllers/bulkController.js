import { bulkShortenUrls } from "../services/bulkService.js";

/**
 * POST /api/bulk-shorten
 * Body: { rows: Array<{ url, title?, alias? }> }
 * Max 100 rows per request.
 */
export const handleBulkShorten = async (req, res, next) => {
  try {
    const { rows, deviceId } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "rows array is required." });
    }

    if (rows.length > 100) {
      return res
        .status(400)
        .json({ success: false, error: "Maximum 100 URLs per batch." });
    }

    const results = await bulkShortenUrls(
      rows,
      req.userId ? null : deviceId || null,
      req.userId || null,
    );
    return res.status(200).json({ success: true, results });
  } catch (err) {
    next(err);
  }
};
