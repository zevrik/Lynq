/**
 * Centroid coordinate lookup for countries, states, and regions.
 * Used for placing accurate pins on the 3D Spherical Globe when exact IP lat/lng is unavailable.
 */

export const COUNTRY_CENTROIDS = {
  US: { name: "United States", lat: 37.0902, lng: -95.7129 },
  IN: { name: "India", lat: 20.5937, lng: 78.9629 },
  GB: { name: "United Kingdom", lat: 55.3781, lng: -3.436 },
  DE: { name: "Germany", lat: 51.1657, lng: 10.4515 },
  CA: { name: "Canada", lat: 56.1304, lng: -106.3468 },
  FR: { name: "France", lat: 46.2276, lng: 2.2137 },
  JP: { name: "Japan", lat: 36.2048, lng: 138.2529 },
  AU: { name: "Australia", lat: -25.2744, lng: 133.7751 },
  BR: { name: "Brazil", lat: -14.235, lng: -51.9253 },
  SG: { name: "Singapore", lat: 1.3521, lng: 103.8198 },
  NL: { name: "Netherlands", lat: 52.1326, lng: 5.2913 },
  ES: { name: "Spain", lat: 40.4637, lng: -3.7492 },
  IT: { name: "Italy", lat: 41.8719, lng: 12.5674 },
  CN: { name: "China", lat: 35.8617, lng: 104.1954 },
  RU: { name: "Russia", lat: 61.524, lng: 105.3188 },
  AE: { name: "United Arab Emirates", lat: 23.4241, lng: 53.8478 },
  SE: { name: "Sweden", lat: 60.1282, lng: 18.6435 },
  CH: { name: "Switzerland", lat: 46.8182, lng: 8.2275 },
  PL: { name: "Poland", lat: 51.9194, lng: 19.1451 },
  KR: { name: "South Korea", lat: 35.9078, lng: 127.7669 },
  MX: { name: "Mexico", lat: 23.6345, lng: -102.5528 },
  ID: { name: "Indonesia", lat: -0.7893, lng: 113.9213 },
  ZA: { name: "South Africa", lat: -30.5595, lng: 22.9375 },
  IE: { name: "Ireland", lat: 53.1424, lng: -7.6921 },
  IL: { name: "Israel", lat: 31.0461, lng: 34.8516 },
  TR: { name: "Turkey", lat: 38.9637, lng: 35.2433 },
};

export const REGION_NAMES = {
  // US States
  "US-CA": { name: "California", lat: 36.7783, lng: -119.4179 },
  "US-NY": { name: "New York", lat: 40.7128, lng: -74.006 },
  "US-TX": { name: "Texas", lat: 31.9686, lng: -99.9018 },
  "US-FL": { name: "Florida", lat: 27.6648, lng: -81.5158 },
  "US-WA": { name: "Washington", lat: 47.7511, lng: -120.7401 },
  "US-IL": { name: "Illinois", lat: 40.6331, lng: -89.3985 },
  "US-MA": { name: "Massachusetts", lat: 42.4072, lng: -71.3824 },
  "US-VA": { name: "Virginia", lat: 37.4316, lng: -78.6569 },
  "US-GA": { name: "Georgia", lat: 32.1656, lng: -82.9001 },
  "US-NC": { name: "North Carolina", lat: 35.7596, lng: -79.0193 },
  "US-CO": { name: "Colorado", lat: 39.5501, lng: -105.7821 },
  "US-OH": { name: "Ohio", lat: 40.4173, lng: -82.9071 },

  // Indian States
  "IN-GJ": { name: "Gujarat", lat: 22.2587, lng: 71.1924 },
  "IN-MH": { name: "Maharashtra", lat: 19.7515, lng: 75.7139 },
  "IN-DL": { name: "Delhi", lat: 28.7041, lng: 77.1025 },
  "IN-KA": { name: "Karnataka", lat: 15.3173, lng: 75.7139 },
  "IN-TN": { name: "Tamil Nadu", lat: 11.1271, lng: 78.6569 },
  "IN-TS": { name: "Telangana", lat: 18.1124, lng: 79.0193 },
  "IN-UP": { name: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  "IN-WB": { name: "West Bengal", lat: 22.9868, lng: 87.855 },
  "IN-RJ": { name: "Rajasthan", lat: 27.0238, lng: 74.2179 },
  "IN-KL": { name: "Kerala", lat: 10.8505, lng: 76.2711 },
  "IN-MP": { name: "Madhya Pradesh", lat: 22.9734, lng: 78.6569 },
  "IN-HR": { name: "Haryana", lat: 29.0588, lng: 76.0856 },
  "IN-PB": { name: "Punjab", lat: 31.1471, lng: 75.3412 },

  // Canadian Provinces
  "CA-ON": { name: "Ontario", lat: 51.2538, lng: -85.3232 },
  "CA-QC": { name: "Quebec", lat: 52.9399, lng: -73.5491 },
  "CA-BC": { name: "British Columbia", lat: 53.7267, lng: -127.6476 },
  "CA-AB": { name: "Alberta", lat: 53.9333, lng: -116.5765 },

  // UK Regions
  "GB-ENG": { name: "England", lat: 52.3555, lng: -1.1743 },
  "GB-SCT": { name: "Scotland", lat: 56.4907, lng: -4.2026 },

  // Germany States
  "DE-BY": { name: "Bavaria", lat: 48.7904, lng: 11.4979 },
  "DE-BE": { name: "Berlin", lat: 52.52, lng: 13.405 },
};

/**
 * Returns a human-friendly label for a state/region code.
 */
export function getRegionLabel(regionCode, countryCode = "") {
  if (!regionCode || regionCode === "Unknown" || regionCode === "") {
    return countryCode ? `All Regions, ${countryCode}` : "Unknown Region";
  }

  const compositeKey = `${(countryCode || "").toUpperCase()}-${regionCode.toUpperCase()}`;
  if (REGION_NAMES[compositeKey]) {
    return REGION_NAMES[compositeKey].name;
  }

  return regionCode;
}

/**
 * Resolves [latitude, longitude] for a location record.
 */
export function resolveCoordinates(point) {
  if (
    point.latitude !== null &&
    point.latitude !== undefined &&
    point.longitude !== null &&
    point.longitude !== undefined &&
    !isNaN(point.latitude) &&
    !isNaN(point.longitude)
  ) {
    return [Number(point.latitude), Number(point.longitude)];
  }

  // Check state/region composite
  const compositeKey = `${(point.country || "").toUpperCase()}-${(point.region || "").toUpperCase()}`;
  if (REGION_NAMES[compositeKey]) {
    return [REGION_NAMES[compositeKey].lat, REGION_NAMES[compositeKey].lng];
  }

  // Check country centroid
  const countryKey = (point.country || "").toUpperCase();
  if (COUNTRY_CENTROIDS[countryKey]) {
    return [COUNTRY_CENTROIDS[countryKey].lat, COUNTRY_CENTROIDS[countryKey].lng];
  }

  return null;
}

/**
 * Color gradient palette based on visit counts.
 * Cyan (Low) -> Indigo/Violet (Medium) -> Hot Pink (High) -> Solar Amber/Red (Peak)
 */
export function getMarkerColorByCount(count, maxCount = 1) {
  const ratio = Math.min(1, Math.max(0, count / (maxCount || 1)));

  if (count <= 2) {
    return {
      hex: "#38bdf8", // Electric Sky Blue
      lightHex: "#0284c7",
      rgb: [56, 189, 248],
      tier: "Low",
      glow: "rgba(56, 189, 248, 0.4)",
    };
  }

  if (ratio < 0.35 || count < 6) {
    return {
      hex: "#818cf8", // Indigo
      lightHex: "#4f46e5",
      rgb: [129, 140, 248],
      tier: "Moderate",
      glow: "rgba(129, 140, 248, 0.45)",
    };
  }

  if (ratio < 0.7 || count < 15) {
    return {
      hex: "#ec4899", // Vivid Magenta
      lightHex: "#db2777",
      rgb: [236, 72, 153],
      tier: "High",
      glow: "rgba(236, 72, 153, 0.5)",
    };
  }

  return {
    hex: "#f59e0b", // Radiant Amber Flame
    lightHex: "#d97706",
    rgb: [245, 158, 11],
    tier: "Peak",
    glow: "rgba(245, 158, 11, 0.6)",
  };
}

/**
 * Realistic sample visitor data for previewing when a URL has no clicks yet.
 */
export const SAMPLE_GEO_POINTS = [
  { country: "US", region: "CA", city: "San Francisco", latitude: 37.7749, longitude: -122.4194, count: 18 },
  { country: "US", region: "NY", city: "New York", latitude: 40.7128, longitude: -74.006, count: 12 },
  { country: "IN", region: "GJ", city: "Surat", latitude: 21.1702, longitude: 72.8311, count: 24 },
  { country: "IN", region: "KA", city: "Bengaluru", latitude: 12.9716, longitude: 77.5946, count: 15 },
  { country: "GB", region: "ENG", city: "London", latitude: 51.5074, longitude: -0.1278, count: 10 },
  { country: "DE", region: "BE", city: "Berlin", latitude: 52.52, longitude: 13.405, count: 7 },
  { country: "JP", region: "Tokyo", city: "Tokyo", latitude: 35.6762, longitude: 139.6503, count: 6 },
  { country: "AU", region: "NSW", city: "Sydney", latitude: -33.8688, longitude: 151.2093, count: 4 },
  { country: "SG", region: "SG", city: "Singapore", latitude: 1.3521, longitude: 103.8198, count: 8 },
  { country: "CA", region: "ON", city: "Toronto", latitude: 43.6532, longitude: -79.3832, count: 5 },
  { country: "FR", region: "IDF", city: "Paris", latitude: 48.8566, longitude: 2.3522, count: 3 },
  { country: "BR", region: "SP", city: "São Paulo", latitude: -23.5505, longitude: -46.6333, count: 2 },
];
