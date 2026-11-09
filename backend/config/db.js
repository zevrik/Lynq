import pg from "pg";
import env from "./env.js";

const { Pool } = pg;

if (!env.databaseUrl) {
  console.warn(
    "⚠️ DATABASE_URL is not set. Application may not function correctly.",
  );
}

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20, // Tuned for Neon serverless free/standard tier
  idleTimeoutMillis: 10000, // 10s: release idle sockets before Neon serverless terminates them remotely
  connectionTimeoutMillis: 20000, // 20s to allow Neon serverless compute to wake up
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
});

/**
 * Critical for serverless PostgreSQL (Neon):
 * Prevent uncaught exceptions when Neon drops idle client sockets remotely.
 * pg-pool automatically discards the dead client and creates fresh ones on demand.
 */
pool.on("error", (err) => {
  console.warn("⚠️ PostgreSQL idle client disconnected by server:", err.message);
});

/**
 * Transparent query wrapper:
 * Automatically retries queries ONCE if a stale pooled connection was terminated
 * by Neon serverless compute between queries.
 */
const originalQuery = pool.query.bind(pool);

const isTransientConnError = (err) => {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  const code = err.code || "";
  return (
    msg.includes("connection terminated") ||
    msg.includes("connection closed") ||
    msg.includes("econnreset") ||
    msg.includes("epipe") ||
    code === "57P01" || // admin shutdown / backend terminated
    code === "08006" || // connection failure
    code === "08001" || // unable to establish connection
    code === "08004"
  );
};

pool.query = async function (queryTextOrConfig, values, callback) {
  if (typeof values === "function" || typeof callback === "function") {
    return originalQuery(queryTextOrConfig, values, callback);
  }

  try {
    return await originalQuery(queryTextOrConfig, values);
  } catch (err) {
    if (isTransientConnError(err)) {
      console.warn("🔄 PostgreSQL connection dropped, retrying query on fresh connection...");
      await new Promise((r) => setTimeout(r, 150));
      return await originalQuery(queryTextOrConfig, values);
    }
    throw err;
  }
};

/**
 * Automatically create tables if they do not exist
 */
export const initDb = async () => {
  try {
    console.log("⏳ Connecting to Neon PostgreSQL...");

    const schemaSql = `
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        short_code VARCHAR(30) UNIQUE NOT NULL,
        original_url TEXT NOT NULL,
        title VARCHAR(255),
        tags VARCHAR(255),
        password_hash VARCHAR(255),
        max_clicks INTEGER,
        clicks INTEGER DEFAULT 0,
        edit_token VARCHAR(255),
        device_id VARCHAR(255),
        user_id VARCHAR(255),
        routing_rules JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_visited TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS unique_visitors (
        id SERIAL PRIMARY KEY,
        short_code VARCHAR(30) REFERENCES urls(short_code) ON DELETE CASCADE,
        visitor_hash VARCHAR(32) NOT NULL,
        UNIQUE(short_code, visitor_hash)
      );

      CREATE TABLE IF NOT EXISTS click_history (
        id SERIAL PRIMARY KEY,
        short_code VARCHAR(30) REFERENCES urls(short_code) ON DELETE CASCADE,
        clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        visitor_hash VARCHAR(32),
        user_agent TEXT,
        country VARCHAR(10),
        city VARCHAR(100),
        device_type VARCHAR(20),
        browser VARCHAR(50),
        os VARCHAR(50),
        referrer VARCHAR(255)
      );

      ALTER TABLE urls ADD COLUMN IF NOT EXISTS edit_token VARCHAR(255);
      ALTER TABLE urls ADD COLUMN IF NOT EXISTS title VARCHAR(255);
      ALTER TABLE urls ADD COLUMN IF NOT EXISTS tags VARCHAR(255);
      ALTER TABLE urls ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
      ALTER TABLE urls ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
      ALTER TABLE urls ADD COLUMN IF NOT EXISTS routing_rules JSONB DEFAULT '{}'::jsonb;

      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS country VARCHAR(10);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS region VARCHAR(100);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS device_type VARCHAR(20);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS browser VARCHAR(50);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS os VARCHAR(50);
      ALTER TABLE click_history ADD COLUMN IF NOT EXISTS referrer VARCHAR(255);

      CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls (user_id);
      CREATE INDEX IF NOT EXISTS idx_urls_user_created ON urls (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_urls_user_original ON urls (user_id, original_url) WHERE user_id IS NOT NULL AND password_hash IS NULL;
      CREATE INDEX IF NOT EXISTS idx_urls_user_clicks ON urls (user_id, clicks DESC, created_at DESC) WHERE user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_urls_guest_device_active ON urls (device_id, expires_at) WHERE user_id IS NULL AND device_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_click_history_code_time ON click_history (short_code, clicked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_click_history_country_active ON click_history (country) WHERE country IS NOT NULL AND country != 'Unknown' AND country != '';
      CREATE INDEX IF NOT EXISTS idx_urls_original_device ON urls (original_url, device_id);
      CREATE INDEX IF NOT EXISTS idx_urls_expires_at ON urls (expires_at) WHERE expires_at IS NOT NULL;
    `;

    await pool.query(schemaSql);
    console.log("✅ Connected to Neon PostgreSQL & Schema Verified");
  } catch (err) {
    console.error("❌ Failed to initialize PostgreSQL:", err);
    process.exit(1);
  }
};

export default pool;
