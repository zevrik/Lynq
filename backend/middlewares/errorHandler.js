import env from "../config/env.js";

/**
 * Centralised error handling middleware.
 * Must be registered LAST in the Express app.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message =
    status === 500 && env.nodeEnv === "production" && !env.testingMode
      ? "Something went wrong. Please try again."
      : err.message || "Internal Server Error";

  if (status === 500) {
    console.error("💥 Unhandled Error:", err);
  }

  return res.status(status).json({
    success: false,
    error: message,
  });
};

export default errorHandler;
