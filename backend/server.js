import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet"; // 
import compression from "compression";
import morgan from "morgan";

import redisClient, { connectRedis } from "./config/redis.js";
import pool, { initDb } from "./config/db.js";
import env from "./config/env.js";
import urlRoutes from "./routes/urlRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { clerkMiddleware } from "@clerk/express";
import { handleRedirect } from "./controllers/urlController.js";
import { optionalAuth } from "./middlewares/auth.js";
import { createLimiters } from "./middlewares/rateLimiter.js";
import { enforceHttps } from "./middlewares/security.js";
import errorHandler from "./middlewares/errorHandler.js";
import { startAnalyticsWorker } from "./workers/analyticsWorker.js";

const app = express();
app.set("trust proxy", 1); // Crucial for Render/Vercel Load Balancers (fixes IP rate limiting!)

// ── Security & Performance Middleware ────────────────────────────────────────
app.use(enforceHttps);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(compression());
app.use(
  cors({
    origin: env.testingMode
      ? true
      : [
          "http://localhost:5173",
          "http://localhost:3000",
          env.baseUrl,
          env.frontendUrl, // Crucial for Vercel deployment!
        ],
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-test-user-id", "x-device-id"],
  }),
);
app.use(express.json({ limit: env.testingMode ? "5mb" : "100kb" }));

// ── Clerk Auth Session Middleware ────────────────────────────────────────────
if (env.clerk.secretKey) {
  try {
    app.use(
      clerkMiddleware({
        secretKey: env.clerk.secretKey,
        publishableKey: env.clerk.publishableKey,
      }),
    );
  } catch (err) {
    console.warn("⚠️ Clerk middleware init warning:", err.message);
  }
}

app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  let dbStatus = "disconnected";
  let redisStatus = "disconnected";

  try {
    await pool.query("SELECT 1");
    dbStatus = "connected";
  } catch (e) {
    dbStatus = "error";
  }

  try {
    if (redisClient.isReady) {
      const ping = await redisClient.ping();
      if (ping === "PONG") redisStatus = "connected";
    } else {
      redisStatus = "reconnecting";
    }
  } catch (e) {
    redisStatus = "error";
  }

  res.json({
    status:
      dbStatus === "connected" && redisStatus === "connected"
        ? "ok"
        : "degraded",
    db: dbStatus,
    redis: redisStatus,
    testingMode: env.testingMode,
    ts: new Date().toISOString(),
  });
});

const start = async () => {
  try {
    // ── Start HTTP Server immediately (<30ms) so port 5000 is instantly open ──
    const server = app.listen(env.port, "0.0.0.0", () => {
      console.log(`🚀 Lynq backend running on http://localhost:${env.port}`);
      console.log(`   BASE_URL → ${env.baseUrl}`);
      if (env.testingMode) {
        console.log("   🧪 TESTING_MODE → enabled (rate limits & testing restrictions bypassed)");
      }
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${env.port} is already in use.`);
      } else {
        console.error("❌ Server error:", err);
      }
      process.exit(1);
    });

    const shutdown = async () => {
      server.close(() => {
        process.exit(0);
      });
    };

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    process.once("SIGUSR2", shutdown);

    // ── Connect Redis + PostgreSQL in parallel (now batched, <250ms) ──────────
    await Promise.all([connectRedis(), initDb()]);

    // ── Resolve optional auth before limiters so limits apply per-user when logged in and per-device otherwise ──
    app.use("/api", optionalAuth);

    // ── Register rate limiters & API routes (requires active Redis client) ───
    const {
      apiLimiter,
      shortenMinuteLimiter,
      shortenHourLimiter,
      shortenDayLimiter,
      bulkLimiter,
      aiLimiter,
      aiSummaryLimiter,
    } = createLimiters();
    app.use("/api", apiLimiter);
    app.post("/api/shorten", shortenMinuteLimiter, shortenHourLimiter, shortenDayLimiter);
    app.post("/api/bulk-shorten", bulkLimiter);
    app.post("/api/ai/suggest", aiLimiter);
    app.post("/api/ai/suggest-aliases", aiLimiter);
    app.get("/api/ai/summary/:shortCode", aiSummaryLimiter);

    app.use("/api", urlRoutes);
    app.use("/api/ai", aiRoutes);
    app.use("/api/user", userRoutes);

    // ── Root Endpoint ────────────────────────────────────────────────────────
    app.get("/", (_req, res) => {
      res.json({ success: true, message: "Lynq API is active", health: "/api/health" });
    });

    // ── Static assets & bot ignores ─────────────────────────────────────────
    app.get("/favicon.ico", (_req, res) => res.status(204).end());
    app.get("/robots.txt", (_req, res) => res.status(204).end());

    // ── Short Code Redirect ──────────────────────────────────────────────────
    // Must come AFTER /api/* routes to avoid conflicts
    app.get("/:shortCode", handleRedirect);

    // ── 404 Handler ─────────────────────────────────────────────────────────
    app.use((_req, res) => {
      res.status(404).json({ success: false, error: "Route not found." });
    });

    // ── Centralised Error Handler ────────────────────────────────────────────
    app.use(errorHandler);

    // ── Start Background Workers ─────────────────────────────────────────────
    startAnalyticsWorker();
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

start();
