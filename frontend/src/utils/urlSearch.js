/**
 * Hybrid Indexed URL Search Engine
 * ──────────────────────────────────────────────────────────────────────────────
 * Builds a pre-normalized in-memory Inverted Index (1-char, 2-gram, and 3-gram
 * sorted posting lists + O(1) exact alias hash map) once per `items` change.
 *
 * Query complexity:
 * - Empty / repeated queries: O(1) via bounded query cache
 * - Non-matching tokens:      O(1) instant reject when any n-gram is absent
 * - Arbitrary substrings:     O(k + min_posting_len) sorted list intersection
 *                             (smallest posting list first; binary search when skewed)
 * - Relevance scoring & sort: O(C log C) over matched candidates only (C << N)
 */

const MAX_CACHE_ENTRIES = 64;

function pushPosting(indexMap, key, docId) {
  let list = indexMap.get(key);
  if (!list) {
    indexMap.set(key, [docId]);
    return;
  }
  // Strict ascending docId insertion guarantees sorted, deduplicated lists in O(1)
  if (list[list.length - 1] !== docId) {
    list.push(docId);
  }
}

function intersectTwoSorted(small, large) {
  if (small.length === 0 || large.length === 0) return [];
  if (small === large) return small;

  // Ensure `small` is always the shorter list
  if (small.length > large.length) {
    const tmp = small;
    small = large;
    large = tmp;
  }

  // Disjoint range fast-exit
  if (
    small[small.length - 1] < large[0] ||
    large[large.length - 1] < small[0]
  ) {
    return [];
  }

  const out = [];

  // When one posting list is much smaller, binary search in O(|small| log |large|)
  if (large.length > small.length * 8) {
    let lowStart = 0;
    for (let i = 0; i < small.length; i++) {
      const target = small[i];
      let lo = lowStart;
      let hi = large.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const val = large[mid];
        if (val === target) {
          out.push(target);
          lowStart = mid + 1;
          break;
        }
        if (val < target) lo = mid + 1;
        else hi = mid - 1;
      }
      if (lo > hi) {
        lowStart = lo;
      }
      if (lowStart >= large.length) break;
    }
    return out;
  }

  // Two-pointer linear merge when list sizes are comparable: O(|small| + |large|)
  let i = 0;
  let j = 0;
  while (i < small.length && j < large.length) {
    const a = small[i];
    const b = large[j];
    if (a === b) {
      out.push(a);
      i++;
      j++;
    } else if (a < b) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

export function createUrlSearchIndex(items = []) {
  const entries = new Array(items.length);
  const exactAliasMap = new Map();
  const charIndex = new Map();
  const bigramIndex = new Map();
  const trigramIndex = new Map();
  const queryCache = new Map();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx] || {};
    const codeLower = typeof item.shortCode === 'string' ? item.shortCode.toLowerCase() : '';
    const titleLower = typeof item.title === 'string' ? item.title.toLowerCase() : '';
    const rawTags = Array.isArray(item.tags) ? item.tags.join(',') : item.tags;
    const tagsLower = typeof rawTags === 'string' ? rawTags.toLowerCase() : '';
    const urlLower = typeof item.originalUrl === 'string' ? item.originalUrl.toLowerCase() : '';
    const shortUrlLower = typeof item.shortUrl === 'string' ? item.shortUrl.toLowerCase() : '';
    const tagList = tagsLower
      ? tagsLower.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const fullCorpus = `${codeLower} ${titleLower} ${tagsLower} ${urlLower} ${shortUrlLower}`;

    entries[idx] = {
      idx,
      item,
      codeLower,
      titleLower,
      tagsLower,
      tagList,
      urlLower,
      shortUrlLower,
      fullCorpus,
    };

    if (codeLower && !exactAliasMap.has(codeLower)) {
      exactAliasMap.set(codeLower, idx);
    }

    const len = fullCorpus.length;
    for (let p = 0; p < len; p++) {
      const ch = fullCorpus[p];
      if (ch !== ' ') {
        pushPosting(charIndex, ch, idx);
      }
      if (p + 2 <= len) {
        const bi = fullCorpus.slice(p, p + 2);
        if (!bi.includes(' ')) {
          pushPosting(bigramIndex, bi, idx);
        }
      }
      if (p + 3 <= len) {
        const tri = fullCorpus.slice(p, p + 3);
        if (!tri.includes(' ')) {
          pushPosting(trigramIndex, tri, idx);
        }
      }
    }
  }

  function search(rawQuery) {
    const normalized = typeof rawQuery === 'string' ? rawQuery.trim().toLowerCase() : '';
    if (!normalized) return items;

    const cached = queryCache.get(normalized);
    if (cached) {
      // Promote hit to most-recently-used in O(1)
      queryCache.delete(normalized);
      queryCache.set(normalized, cached);
      return cached;
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items;

    // 1. Collect inverted-index posting lists for all query tokens
    const postingLists = [];
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok.length === 1) {
        const list = charIndex.get(tok);
        if (!list) {
          cacheResult(queryCache, normalized, []);
          return [];
        }
        postingLists.push(list);
      } else if (tok.length === 2) {
        const list = bigramIndex.get(tok);
        if (!list) {
          cacheResult(queryCache, normalized, []);
          return [];
        }
        postingLists.push(list);
      } else {
        for (let p = 0; p <= tok.length - 3; p++) {
          const tri = tok.slice(p, p + 3);
          const list = trigramIndex.get(tri);
          if (!list) {
            cacheResult(queryCache, normalized, []);
            return [];
          }
          postingLists.push(list);
        }
      }
    }

    // 2. Intersect rarest posting lists first to minimize candidate scan count
    postingLists.sort((a, b) => a.length - b.length);
    let candidates = postingLists[0];
    for (let k = 1; k < postingLists.length && candidates.length > 8; k++) {
      // Skip duplicate reference if same array already intersected
      if (postingLists[k] === postingLists[k - 1]) continue;
      candidates = intersectTwoSorted(candidates, postingLists[k]);
      if (candidates.length === 0) {
        cacheResult(queryCache, normalized, []);
        return [];
      }
    }

    // 3. Exact substring verification & weighted relevance scoring over candidates only
    const scored = [];
    const exactCodeIdx = tokens.length === 1 ? exactAliasMap.get(tokens[0]) : undefined;

    for (let c = 0; c < candidates.length; c++) {
      const entry = entries[candidates[c]];
      let matchesAll = true;
      let score = entry.idx === exactCodeIdx ? 150 : 0;

      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        if (!entry.fullCorpus.includes(tok)) {
          matchesAll = false;
          break;
        }

        if (entry.codeLower === tok) {
          score += 120;
        } else if (entry.codeLower.startsWith(tok)) {
          score += 80;
        } else if (entry.codeLower.includes(tok)) {
          score += 50;
        }

        if (entry.tagList.length > 0) {
          if (entry.tagList.includes(tok)) score += 55;
          else if (entry.tagsLower.includes(tok)) score += 32;
        }

        if (entry.titleLower.includes(tok)) {
          score += entry.titleLower.startsWith(tok) ? 45 : 24;
        }

        if (entry.urlLower.includes(tok) || entry.shortUrlLower.includes(tok)) {
          score += 12;
        }
      }

      if (matchesAll) {
        scored.push({ idx: entry.idx, item: entry.item, score });
      }
    }

    // Deterministic rank: higher score first, then original newest-first order
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const result = scored.map((s) => s.item);
    cacheResult(queryCache, normalized, result);
    return result;
  }

  return {
    size: items.length,
    search,
  };
}

function cacheResult(cache, key, val) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, val);
}
