import "dotenv/config";

const parseBool = (val) => String(val ?? "").trim().toLowerCase() === "true";

/**
 * Centralised environment config with sensible defaults.
 * Always import this instead of reading process.env directly.
 */
const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  baseUrl: process.env.BASE_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    username: process.env.REDIS_USERNAME || "default",
    password: process.env.REDIS_PASSWORD || "",
  },
  shortCodeLength: parseInt(process.env.SHORT_CODE_LENGTH, 10) || 6,
  nodeEnv: process.env.NODE_ENV || "development",
  testingMode: parseBool(process.env.TESTING_MODE) || parseBool(process.env.LOAD_TEST_MODE),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || "",
    secretKey: process.env.CLERK_SECRET_KEY || "",
  },
};

export default env;
