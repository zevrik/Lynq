import env from "../config/env.js";

/**
 * URL validator utility.
 * Accepts only valid http:// or https:// URLs.
 */

/**
 * Returns true if the given string is a valid HTTP/HTTPS URL.
 * @param {string} url
 * @returns {boolean}
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and common internal IP ranges (SSRF protection) unless testingMode is enabled
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]";
    const isInternalIp =
      /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(hostname);

    if (isLocalhost || isInternalIp) {
      return env.testingMode;
    }

    // Ensure valid domain format (at least one dot, no spaces)
    // For IPs (e.g. 8.8.8.8) this also passes, which is fine since we blocked internal ones
    if (!hostname.includes(".") || hostname.includes(" ")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Normalise a URL by trimming whitespace.
 * @param {string} url
 * @returns {string}
 */
export const normaliseUrl = (url) => url.trim();
