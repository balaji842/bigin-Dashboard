import { fetchAllCalls } from "../zohoClient.js";

// Bigin Calls, kept in memory — the same pattern as notesCache.js /
// pipelinesCache.js, so the Overview page never waits on Zoho for them:
//   - younger than FRESH_MS      -> straight from memory.
//   - FRESH_MS .. STALE_OK_MS    -> also instant; a fresh copy is pulled in
//                                   the background for the next request.
//   - older, or nothing cached   -> has to wait for Zoho.
//
// Calls are optional next to the pipeline data, so a failure here (for
// example the Zoho token lacking the calls permission) must never break
// anything else: after a failed pull the error is remembered for a minute
// and re-thrown straight away instead of hitting Zoho on every request.
//
// What's cached is { calls, fieldKeys } — see fetchAllCalls().

const FRESH_MS = 5 * 60 * 1000;
const STALE_OK_MS = 30 * 60 * 1000;
const RETRY_AFTER_ERROR_MS = 60 * 1000;

let cached = null;
let cachedAt = 0;
let inFlight = null;
let lastError = null;
let lastErrorAt = 0;

function startFetch() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const result = await fetchAllCalls();
      cached = result;
      cachedAt = Date.now();
      lastError = null;
      return result;
    } catch (err) {
      lastError = err;
      lastErrorAt = Date.now();
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function getCalls({ force = false } = {}) {
  if (!force && cached) {
    const age = Date.now() - cachedAt;
    if (age < FRESH_MS) return cached;
    if (age < STALE_OK_MS) {
      startFetch().catch((err) => console.error("[callsCache] background refresh failed:", err.message));
      return cached;
    }
  }
  if (!force && !cached && lastError && Date.now() - lastErrorAt < RETRY_AFTER_ERROR_MS) {
    throw lastError;
  }
  return startFetch();
}

export function invalidateCallsCache() {
  cached = null;
  cachedAt = 0;
}

// Warm at startup (a failure is just logged).
startFetch().catch((err) => console.error("[callsCache] startup warm-up failed:", err.message));