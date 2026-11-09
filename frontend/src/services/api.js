import axios from "axios";

const getDeviceId = () => {
  let deviceId = localStorage.getItem("lynq_device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);
    localStorage.setItem("lynq_device_id", deviceId);
  }
  return deviceId;
};

let authTokenGetter = null;

/**
 * Configure dynamic JWT getter (provided by Clerk useAuth)
 * @param {Function} getter
 */
export const setAuthTokenGetter = (getter) => {
  authTokenGetter = getter;
};

/**
 * Axios instance — routes through Vite proxy (/api → localhost:5000)
 * in development, and directly to BASE_URL in production.
 */
const api = axios.create({
  // Use production URL if defined in Vercel env vars, otherwise default to Vite local proxy
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Continue without token
    }
  }
  return config;
});

/**
 * Shorten a URL.
 * @param {string} url
 * @param {string|null} customAlias
 * @returns {Promise<object>}
 */
export const shortenUrl = async (
  url,
  customAlias = null,
  password = null,
  expiresInDays = null,
  maxClicks = null,
  title = null,
  tags = null,
  routingRules = null,
) => {
  const deviceId = getDeviceId();
  const { data } = await api.post("/shorten", {
    url,
    customAlias,
    password,
    expiresInDays,
    maxClicks,
    title,
    tags,
    deviceId,
    routingRules,
  });
  return data;
};

/**
 * Check if a custom alias is available.
 * @param {string} alias
 * @returns {Promise<{ available: boolean }>}
 */
export const checkAlias = async (alias) => {
  const { data } = await api.get(`/check-alias/${encodeURIComponent(alias)}`);
  return data; // { success, available }
};

/**
 * Fetch analytics info for a short code.
 * @param {string} shortCode
 * @returns {Promise<object>}
 */
export const getUrlInfo = async (shortCode) => {
  const { data } = await api.get(`/info/${shortCode}`);
  return data;
};

/**
 * Verify password for a protected short URL.
 * @param {string} shortCode
 * @param {string} password
 * @returns {Promise<object>}
 */
export const verifyPassword = async (shortCode, password, referrer = "") => {
  const { data } = await api.post(`/verify/${shortCode}`, { password, referrer });
  return data;
};

/**
 * Edit destination URL of a shortened link.
 * @param {string} shortCode
 * @param {string} newUrl
 * @param {string} editToken
 * @param {object|null} routingRules
 * @returns {Promise<object>}
 */
export const editUrl = async (shortCode, newUrl, editToken, routingRules = null) => {
  const { data } = await api.put(`/shorten/${shortCode}`, {
    newUrl,
    editToken,
    routingRules,
  });
  return data;
};

/**
 * Delete a shortened link.
 * @param {string} shortCode
 * @param {string} editToken
 * @returns {Promise<object>}
 */
export const deleteUrl = async (shortCode, editToken) => {
  const { data } = await api.delete(`/shorten/${shortCode}`, {
    data: { editToken },
  });
  return data;
};

/**
 * Get AI suggestions for a URL.
 * @param {string} url
 * @returns {Promise<object>}
 */
export const suggestAi = async (url) => {
  const { data } = await api.post("/ai/suggest", { url });
  return data.data; // { title, tags, customAlias }
};

/**
 * Get AI 2-sentence TL;DR summary for a short URL preview.
 * @param {string} shortCode
 * @returns {Promise<object>}
 */
export const getAiSummary = async (shortCode) => {
  const { data } = await api.get(`/ai/summary/${encodeURIComponent(shortCode)}`);
  return data; // { success, summary, cached }
};

/**
 * Get smart AI-suggested alternative aliases when custom alias is taken.
 * @param {string} targetUrl
 * @param {string} desiredAlias
 * @returns {Promise<string[]>}
 */
export const suggestAliasAlternatives = async (targetUrl, desiredAlias) => {
  const { data } = await api.post("/ai/suggest-aliases", {
    targetUrl,
    desiredAlias,
  });
  return data.suggestions || [];
};

/**
 * Check live status of a short URL's destination.
 * @param {string} shortCode
 * @returns {Promise<object>}
 */
export const checkStatus = async (shortCode) => {
  const { data } = await api.get(`/status/${shortCode}`);
  return data;
};

/**
 * Bulk shorten a list of URL rows.
 * @param {Array<{url, title?, alias?}>} rows
 * @returns {Promise<object>}
 */
export const bulkShortenUrls = async (rows) => {
  const deviceId = getDeviceId();
  const { data } = await api.post("/bulk-shorten", { rows, deviceId });
  return data; // { success, results }
};

/**
 * Check backend health status (Redis & Postgres connection).
 * @returns {Promise<object>}
 */
export const checkHealth = async () => {
  const { data } = await api.get("/health");
  return data; // { status, db, redis, ts }
};

/**
 * Resolve a short URL, trigger analytics, and get the destination (client-side redirect fallback).
 * @param {string} shortCode 
 * @returns {Promise<object>}
 */
export const resolveAndTrack = async (shortCode) => {
  const { data } = await api.get(`/resolve/${shortCode}`);
  return data; // { success, result: { requiresPassword, originalUrl } }
};

/**
 * Get Server-Sent Events URL for live click activity.
 * @param {string} shortCode
 * @returns {string}
 */
export const getLiveStreamUrl = (shortCode) => {
  const base = import.meta.env.VITE_API_URL || "/api";
  return `${base}/live/${encodeURIComponent(shortCode)}`;
};

/**
 * Get direct download URL for link analytics CSV export.
 * @param {string} shortCode
 * @returns {string}
 */
export const getExportCsvUrl = (shortCode) => {
  const base = import.meta.env.VITE_API_URL || "/api";
  return `${base}/analytics/${encodeURIComponent(shortCode)}/export`;
};

/**
 * Triggers a download of historical click telemetry in CSV format.
 * @param {string} shortCode
 */
export const downloadAnalyticsCsv = (shortCode) => {
  const url = getExportCsvUrl(shortCode);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lynq-${shortCode}-analytics.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * Claim anonymous guest links to the signed-in user's account.
 * @param {Array<{shortCode: string, editToken: string}>} links
 * @returns {Promise<object>}
 */
export const claimUserLinks = async (links) => {
  const { data } = await api.post("/user/claim-links", { links });
  return data; // { success, claimedCount, claimedCodes }
};

/**
 * Get all links owned by the authenticated user.
 * @returns {Promise<object>}
 */
export const getUserLinks = async () => {
  const { data } = await api.get("/user/links");
  return data; // { success, count, links }
};

/**
 * Get user analytics summary across all owned links.
 * @returns {Promise<object>}
 */
export const getUserAnalyticsSummary = async () => {
  const { data } = await api.get("/user/analytics/summary");
  return data; // { success, summary: { totalClicks, totalLinks, activeLinks, topLinks } }
};

/**
 * Fetch live actual platform statistics for the public landing page.
 * @returns {Promise<{ success: boolean, stats: { totalLinks: number, totalRedirects: number, countriesCount: number, latencyMs: number, uptime: string } }>}
 */
export const getPlatformStats = async () => {
  const { data } = await api.get("/platform-stats");
  return data;
};

export default api;
