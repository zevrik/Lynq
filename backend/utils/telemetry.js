import crypto from "crypto";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";

export const extractCleanIp = (ip) => {
  if (!ip || typeof ip !== "string") return "";
  return ip.replace(/^::ffff:/, "").split(",")[0].trim();
};

export const getClientIp = (req) => {
  const xff = req.headers?.["x-forwarded-for"];
  const firstXff =
    typeof xff === "string"
      ? xff.split(",")[0].trim()
      : Array.isArray(xff)
        ? String(xff[0] || "").trim()
        : "";

  return (
    req.headers?.["cf-connecting-ip"] ||
    req.headers?.["x-real-ip"] ||
    firstXff ||
    req.ip ||
    req.connection?.remoteAddress ||
    ""
  );
};

export const isPrivateOrLocalIp = (cleanIp) => {
  if (!cleanIp) return true;
  const lower = cleanIp.toLowerCase();
  return (
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "localhost" ||
    lower.startsWith("10.") ||
    lower.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower) ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  );
};

export const parseReferrer = (rawReferrer) => {
  if (!rawReferrer || typeof rawReferrer !== "string") return "direct";
  const trimmed = rawReferrer.trim();
  if (!trimmed) return "direct";
  try {
    const url = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || "direct";
  } catch {
    return trimmed.slice(0, 50) || "direct";
  }
};

export const computeVisitorHash = (ip, userAgent = "") => {
  const cleanIp = extractCleanIp(ip);
  return crypto
    .createHash("md5")
    .update(`${cleanIp}-${userAgent || ""}`)
    .digest("hex");
};

export const parseClickTelemetry = ({
  ip = "",
  userAgent = "",
  referrer = "",
  visitorHash = null,
}) => {
  const cleanIp = extractCleanIp(ip);
  const resolvedVisitorHash =
    visitorHash || computeVisitorHash(cleanIp, userAgent);

  let country = null;
  let region = null;
  let city = null;
  let latitude = null;
  let longitude = null;

  if (cleanIp && !isPrivateOrLocalIp(cleanIp)) {
    const geo = geoip.lookup(cleanIp);
    if (geo) {
      country = geo.country || null;
      region = geo.region || null;
      city = geo.city || null;
      if (geo.ll && Array.isArray(geo.ll)) {
        latitude = geo.ll[0];
        longitude = geo.ll[1];
      }
    }
  }

  // Local / private IP fallback so local testing accurately renders globe points
  if (!country && isPrivateOrLocalIp(cleanIp)) {
    country = "IN";
    region = "GJ";
    city = "Surat";
    latitude = 21.1702;
    longitude = 72.8311;
  }

  const parser = new UAParser(userAgent || "");
  const parsedUA = parser.getResult();
  const deviceType = parsedUA.device?.type || "desktop";
  const browser = parsedUA.browser?.name || "Unknown";
  const os = parsedUA.os?.name || "Unknown";
  const parsedReferrer = parseReferrer(referrer);

  return {
    cleanIp,
    visitorHash: resolvedVisitorHash,
    country,
    region,
    city,
    latitude,
    longitude,
    deviceType,
    browser,
    os,
    referrer: parsedReferrer,
  };
};

