import { fetchAllRecords } from "../zohoClient.js";

// Every /crm-analysis/* route needs the full Pipelines dataset. Pulling
// it from Zoho means paging through every record (slow), so the whole
// dataset is kept in memory and shared by every route.
//
// How a request is served:
//   - younger than FRESH_MS      -> straight from memory, instant.
//   - FRESH_MS .. STALE_OK_MS    -> ALSO instant: the slightly old copy is
//                                   returned right away and a fresh copy is
//                                   pulled from Zoho in the background, so
//                                   the person never waits for Zoho and the
//                                   next request already has newer data.
//   - older than STALE_OK_MS, or nothing cached yet -> has to wait for Zoho.
//
// The first pull also starts as soon as the server boots (see the end of
// this file) instead of waiting for the first visitor, so after a
// restart / Render wake-up it overlaps with the server starting up.

const FRESH_MS = 5 * 60 * 1000; // serve from memory without refreshing
const STALE_OK_MS = 30 * 60 * 1000; // still serve instantly, refresh behind the scenes

let cached = null;
let cachedAt = 0;
let inFlight = null; // one shared Zoho pull, however many requests ask at once

function startFetch() {
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

export async function getPipelines({ force = false } = {}) {
  if (!force && cached) {
    const age = Date.now() - cachedAt;
    if (age < FRESH_MS) return cached;
    if (age < STALE_OK_MS) {
      // Hand back what we have now; refresh for the next request. A
      // failed background refresh just keeps the old copy for now.
      startFetch().catch((err) => console.error("[pipelinesCache] background refresh failed:", err.message));
      return cached;
    }
  }
  return startFetch();
}

// Called by the "Refresh live data" button route so a manual refresh
// always bypasses the cache and pulls the latest from Zoho.
export function invalidatePipelinesCache() {
  cached = null;
  cachedAt = 0;
}

export function pipelinesCacheInfo() {
  return { cachedAt: cached ? cachedAt : null, count: cached ? cached.length : 0 };
}

// Warm the cache at startup.
startFetch().catch((err) => console.error("[pipelinesCache] startup warm-up failed:", err.message));