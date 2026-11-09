import { GoogleGenerativeAI } from "@google/generative-ai";
import env from "../config/env.js";
import pool from "../config/db.js";
import redisClient from "../config/redis.js";

let genAI = null;
if (env.geminiApiKey) {
  genAI = new GoogleGenerativeAI(env.geminiApiKey);
}

const FETCH_TIMEOUT_MS = 3000;
const AI_TIMEOUT_MS = 4000;

const withTimeout = (promise, ms, label = "Operation") => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
};

/**
 * Basic HTML parser to extract page title & description to assist Gemini.
 */
export const extractContext = async (targetUrl) => {
  try {
    let title = "";
    let description = "";

    // Special bypass for YouTube to avoid Cloud/Datacenter IP blocks
    if (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be")) {
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`,
          { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title;
          description = `YouTube video by ${data.author_name || "creator"}`;
        }
      } catch {
        // Continue to fallback scraper
      }
    }

    // Fallback to standard scraping for other sites (or if oEmbed fails)
    if (!title) {
      const res = await fetch(targetUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        },
      });
      const html = await res.text();

      const ogMatch = html.match(
        /<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["']([^"']+)["']/i,
      );
      title = ogMatch ? ogMatch[1].trim() : "";

      if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : targetUrl;
      }

      const descMatch =
        html.match(
          /<meta\s+(?:name|property)=["'](?:description|og:description|twitter:description)["']\s+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description)["']/i,
        );
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    // Clean up title (remove " - YouTube" etc)
    title = title.replace(/ - YouTube$/i, "").trim();

    // Naive tag extraction based on words in title
    const tags = title
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 3)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());

    // Generate a simple alias
    const customAlias = title
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 15)
      .toLowerCase();

    return { title, description, tags, customAlias, rawHtml: true };
  } catch (error) {
    let hostname = "link";
    try {
      hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
    } catch {}
    return {
      title: `${hostname} Destination`,
      description: `Destination resource hosted on ${hostname}.`,
      tags: ["link", "web"],
      customAlias: "link-" + Math.floor(Math.random() * 1000),
    };
  }
};

/**
 * Generate title, tags, and alias suggestions for a target URL.
 */
export const generateSuggestions = async (targetUrl) => {
  const context = await extractContext(targetUrl);

  if (!genAI) {
    return context; // Fallback to raw scraper if no API key
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `Analyze this URL and its actual webpage title.
URL: ${targetUrl}
Actual Webpage/Video Title: "${context.title}"
Description: "${context.description || ""}"

Generate JSON with the following keys:
- title: A short, catchy title based on the video/webpage title (max 50 chars).
- customAlias: A short, URL-friendly slug based on the topic (lowercase, dashes only, max 15 chars).
- tags: An array of 3 relevant short keywords.
Only return valid JSON matching this schema, no markdown.`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT_MS,
      "Gemini AI suggest",
    );
    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error(
      "Gemini API Error, falling back to local extractor:",
      error.message,
    );
    return context;
  }
};

/**
 * Generate an AI TL;DR 2-sentence summary of the destination URL with Redis caching.
 * @param {string} targetUrl 
 * @param {string} shortCode 
 * @returns {Promise<{ summary: string, cached: boolean }>}
 */
export const generateSummary = async (targetUrl, shortCode) => {
  const cacheKey = `ai_summary:${shortCode}`;

  // 1. Check Redis cache
  try {
    const cachedSummary = await redisClient.get(cacheKey);
    if (cachedSummary) {
      return { summary: cachedSummary, cached: true };
    }
  } catch (err) {
    console.error("Redis get summary error:", err.message);
  }

  // 2. Extract page metadata
  const context = await extractContext(targetUrl);
  let summary = "";

  // 3. Generate summary via Gemini if available
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const prompt = `You are a web intelligence assistant providing safe link previews.
Destination URL: "${targetUrl}"
Page Title: "${context.title}"
Page Description: "${context.description || "N/A"}"

Write a concise, neutral 2-sentence TL;DR summary explaining exactly what the destination page contains so a visitor knows what to expect before clicking.
Respond strictly in JSON format:
{
  "summary": "First sentence. Second sentence."
}`;

      const result = await withTimeout(
        model.generateContent(prompt),
        AI_TIMEOUT_MS,
        "Gemini AI summary",
      );
      const data = JSON.parse(result.response.text());
      if (data.summary && data.summary.trim()) {
        summary = data.summary.trim();
      }
    } catch (err) {
      console.warn("Gemini summary generation failed, using local synthesis:", err.message);
    }
  }

  // 4. Fallback synthesis if Gemini is unavailable or failed
  if (!summary) {
    let hostname = "the target website";
    try {
      hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
    } catch {}

    const titlePart = context.title
      ? `This link leads to "${context.title}" hosted on ${hostname}.`
      : `This link directs to content hosted on ${hostname}.`;
    const descPart = context.description
      ? context.description.endsWith(".")
        ? context.description
        : `${context.description}.`
      : `It provides access to resources and services published at this destination.`;

    summary = `${titlePart} ${descPart}`;
  }

  // 5. Cache summary in Redis for 7 days (604,800 seconds)
  try {
    await redisClient.setEx(cacheKey, 604800, summary);
  } catch (err) {
    console.error("Redis set summary cache error:", err.message);
  }

  return { summary, cached: false };
};

/**
 * Suggest available alias alternatives when a desired custom alias is already taken.
 * @param {string} targetUrl 
 * @param {string} desiredAlias 
 * @returns {Promise<string[]>} List of available alternative aliases
 */
export const suggestAvailableAliases = async (targetUrl, desiredAlias) => {
  const cleanedAlias = (desiredAlias || "link")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 20);

  let candidateSet = new Set();

  // 1. Generate intelligent candidates via Gemini if available
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const prompt = `A user requested the short link alias "${cleanedAlias}" for URL "${targetUrl}", but that alias is already taken.
Suggest 5 clever, concise, URL-friendly alternative alias slugs (lowercase letters, numbers, hyphens only, 4 to 20 characters).
Respond strictly in JSON:
{
  "alternatives": ["alias-1", "alias-2", "alias-3", "alias-4", "alias-5"]
}`;

      const result = await withTimeout(
        model.generateContent(prompt),
        AI_TIMEOUT_MS,
        "Gemini AI aliases",
      );
      const data = JSON.parse(result.response.text());
      if (Array.isArray(data.alternatives)) {
        data.alternatives.forEach((alt) => {
          const clean = alt.toLowerCase().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 25);
          if (clean && clean.length >= 3) candidateSet.add(clean);
        });
      }
    } catch (err) {
      console.warn("Gemini alias generation failed, using heuristic pool:", err.message);
    }
  }

  // 2. Add high-quality heuristic candidates
  const heuristicSuffixes = [
    "-go",
    "-hub",
    "-hq",
    "-link",
    "-app",
    "-now",
    "-io",
    "-get",
    "-pro",
    "-one",
  ];
  heuristicSuffixes.forEach((suffix) => {
    candidateSet.add(`${cleanedAlias}${suffix}`);
  });

  const candidates = Array.from(candidateSet).slice(0, 15);

  // 3. Query PostgreSQL for availability of candidate aliases
  try {
    const { rows } = await pool.query(
      "SELECT short_code FROM urls WHERE short_code = ANY($1)",
      [candidates],
    );

    const takenSet = new Set(rows.map((r) => r.short_code));
    const available = candidates.filter((c) => !takenSet.has(c));

    // Return top 4 available alternatives
    if (available.length > 0) {
      return available.slice(0, 4);
    }
  } catch (err) {
    console.error("Database query for alias availability failed:", err.message);
  }

  // Fallback: append random numbers if all else fails
  return [
    `${cleanedAlias}-${Math.floor(10 + Math.random() * 90)}`,
    `${cleanedAlias}-v2`,
    `${cleanedAlias}-web`,
  ];
};
