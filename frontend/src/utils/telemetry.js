/**
 * Telemetry formatting & categorization utilities for Lynq Analytics.
 */

export function getCountryFlag(countryCode) {
  if (!countryCode || countryCode === "Unknown" || countryCode === "Local") {
    return "🌐";
  }
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return "🌐";
  try {
    const first = code.charCodeAt(0) - 65 + 0x1f1e6;
    const second = code.charCodeAt(1) - 65 + 0x1f1e6;
    return String.fromCodePoint(first, second);
  } catch {
    return "🌐";
  }
}

export function getCountryName(countryCode) {
  if (!countryCode || countryCode === "Unknown" || countryCode === "Local") {
    return "Unknown / Local";
  }
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(countryCode.toUpperCase()) || countryCode;
  } catch {
    return countryCode;
  }
}

export function getReferrerMeta(rawReferrer) {
  const ref = (rawReferrer || "direct").toLowerCase();

  if (ref === "direct" || ref === "") {
    return {
      label: "Direct Traffic",
      category: "Direct",
      icon: "🎯",
      badgeColor: "#6366f1",
      lightBadgeColor: "#4f46e5",
    };
  }

  if (
    ref.includes("google") ||
    ref.includes("bing") ||
    ref.includes("yahoo") ||
    ref.includes("duckduckgo") ||
    ref.includes("ecosia")
  ) {
    return {
      label: ref,
      category: "Search",
      icon: "🔍",
      badgeColor: "#10b981",
      lightBadgeColor: "#047857",
    };
  }

  if (
    ref.includes("t.co") ||
    ref.includes("twitter") ||
    ref.includes("x.com") ||
    ref.includes("linkedin") ||
    ref.includes("facebook") ||
    ref.includes("instagram") ||
    ref.includes("reddit") ||
    ref.includes("youtube") ||
    ref.includes("tiktok") ||
    ref.includes("threads")
  ) {
    return {
      label: ref,
      category: "Social",
      icon: "💬",
      badgeColor: "#ec4899",
      lightBadgeColor: "#db2777",
    };
  }

  if (
    ref.includes("github") ||
    ref.includes("gitlab") ||
    ref.includes("stackoverflow") ||
    ref.includes("dev.to")
  ) {
    return {
      label: ref,
      category: "Developer",
      icon: "⚡",
      badgeColor: "#8b5cf6",
      lightBadgeColor: "#6d28d9",
    };
  }

  return {
    label: ref,
    category: "Referral",
    icon: "🌐",
    badgeColor: "#06b6d4",
    lightBadgeColor: "#0e7490",
  };
}

export function getDeviceMeta(deviceType) {
  const dev = (deviceType || "desktop").toLowerCase();
  switch (dev) {
    case "mobile":
      return { label: "Mobile", icon: "📱", color: "#06b6d4" };
    case "tablet":
      return { label: "Tablet", icon: "📟", color: "#8b5cf6" };
    case "desktop":
    default:
      return { label: "Desktop", icon: "💻", color: "#6366f1" };
  }
}

export const CHART_COLORS = [
  "#6366f1", // Indigo
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#14b8a6", // Teal
];
