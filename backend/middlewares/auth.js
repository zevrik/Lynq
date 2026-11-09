import { getAuth } from "@clerk/express";
import env from "../config/env.js";

/**
 * Optional Auth middleware:
 * Attaches req.userId if user has a valid Clerk session; otherwise req.userId is null.
 * Never throws 401 — allows guests to proceed seamlessly.
 */
export const optionalAuth = (req, res, next) => {
  // Allow simulated user in non-production or testing mode test suites
  if ((env.nodeEnv !== "production" || env.testingMode) && req.headers["x-test-user-id"]) {
    req.userId = req.headers["x-test-user-id"];
    return next();
  }

  try {
    if (env.clerk.secretKey) {
      const auth = getAuth(req);
      req.userId = auth?.userId || null;
    } else {
      req.userId = null;
    }
  } catch {
    req.userId = null;
  }
  next();
};

/**
 * Require Auth middleware:
 * Rejects requests with 401 if user is not authenticated.
 */
export const requireAuth = (req, res, next) => {
  // Allow simulated user in non-production or testing mode test suites
  if ((env.nodeEnv !== "production" || env.testingMode) && req.headers["x-test-user-id"]) {
    req.userId = req.headers["x-test-user-id"];
    return next();
  }

  if (!env.clerk.secretKey) {
    return res.status(401).json({
      success: false,
      error: "Authentication is not configured on this server. Please set CLERK_SECRET_KEY.",
    });
  }

  try {
    const auth = getAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Please sign in to access this resource.",
      });
    }
    req.userId = auth.userId;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Authentication failed. Please sign in again.",
    });
  }
};
