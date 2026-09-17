import { fetchAllRecords } from "../zohoClient.js";

// Every /crm-analysis/* route needs the full Pipelines dataset, but the
// underlying CRM data doesn't change every time someone clicks a Type
// pill or switches pages — only when something is actually
// added/edited in Bigin. Without this cache, EVERY request (including
// just toggling a filter) re-paginates the entire module from Zoho's
// API from scratch, which is slow and is the main reason the dashboard
// feels sluggish. This caches the raw records for a few minutes and
// lets every route share one copy.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached = null;
let cachedAt = 0;
let inFlight = null; // dedupes concurrent cold-cache requests into one Zoho call

export async function getPipelines({ force = false } = {}) {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // If a fetch is already in progress (e.g. two dashboard tabs opened
  // at once, or several routes hit right after a cache expiry), wait
  // for that one instead of firing a second parallel pull from Zoho.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const records = await fetchAllRecords("Pipelines");
      cached = records;
      cachedAt = Date.now();
      return records;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// Called by the "Refresh live data" button so a manual refresh always
// bypasses the cache and pulls the latest from Zoho, instead of the
// person having to wait out the TTL.
export function invalidatePipelinesCache() {
  cached = null;
  cachedAt = 0;
}

export function pipelinesCacheInfo() {
  return { cachedAt: cached ? cachedAt : null, count: cached ? cached.length : 0 };
}