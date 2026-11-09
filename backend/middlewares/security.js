import env from "../config/env.js";

/**
 * Middleware to enforce HTTPS in production.
 * Redirects HTTP requests to HTTPS.
 */
export const enforceHttps = (req, res, next) => {
  if (env.nodeEnv === "production" && !env.testingMode) {
    // Check standard express secure flag or reverse proxy header
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

    if (!isSecure) {
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      return res.redirect(301, httpsUrl);
    }
  }

  next();
};
