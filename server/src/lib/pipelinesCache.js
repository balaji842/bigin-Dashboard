import { fetchAllRecords } from "../zohoClient.js";
import { applyDonationScope, matchesDonationCategory } from "./dealHelpers.js";

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
// Only NSNOP deals are kept: deals whose "Category of Donation" is Rhapsody
// or IGCC are dropped right here, as the deals come in from Zoho (see
// applyDonationScope in dealHelpers.js), so every page works from the same
// NSNOP-only data.
//
// The first pull also starts as soon as the server boots (see the end of
// this file) instead of waiting for the first visitor, so after a
// restart / Render wake-up it overlaps with the server starting up.

const FRESH_MS = 5 * 60 * 1000; // serve from memory without refreshing
const STALE_OK_MS = 30 * 60 * 1000; // still serve instantly, refresh behind the scenes

let cached = null; // the NSNOP deals (what every normal page uses)
let cachedAllDeals = null; // every deal, before the Category of Donation filter
let categoryLists = new Map(); // "rhapsody" / "igcc" -> that category's deals (rebuilt after every pull)
let cachedAt = 0;
let inFlight = null; // one shared Zoho pull, however many requests ask at once
let scopeInfo = null; // what the Category of Donation filter kept / left out on the last pull

function startFetch() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const all = await fetchAllRecords("Pipelines");
      const { kept, info } = applyDonationScope(all);
      scopeInfo = info;
      console.log(
        `[pipelinesCache] Category of Donation: kept ${info.keptDeals} of ${info.totalDeals} deals, left out ${info.excludedDeals} ` +
          `(${Object.entries(info.byCategory).map(([c, e]) => `${c}: ${e.deals}${e.excluded ? " — excluded" : ""}`).join("; ")})`
      );
      cached = kept;
      cachedAllDeals = all;
      categoryLists = new Map();
      cachedAt = Date.now();
      return kept;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// The NSNOP deals — or, with `category`, a different slice of the same pull:
//   category: "rhapsody" | "igcc"  -> just that category's deals (the "Other
//                                     Dashboards" page)
//   category: "all"                -> every deal, Rhapsody and IGCC included
//                                     (used to find the companies whose notes,
//                                     calls and phone numbers to load)
// The slices are built once per pull and reused, so the per-snapshot caches
// in the routes keep working for them too.
export async function getPipelines({ force = false, category = null } = {}) {
  const nsnop = await loadNsnopDeals({ force });
  if (!category) return nsnop;
  if (category === "all") return cachedAllDeals;
  let list = categoryLists.get(category);
  if (!list) {
    list = cachedAllDeals.filter((d) => matchesDonationCategory(d, category));
    categoryLists.set(category, list);
  }
  return list;
}

async function loadNsnopDeals({ force = false } = {}) {
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
  cachedAllDeals = null;
  categoryLists = new Map();
  cachedAt = 0;
}

export function pipelinesCacheInfo() {
  return { cachedAt: cached ? cachedAt : null, count: cached ? cached.length : 0, scope: scopeInfo };
}

// Warm the cache at startup.
startFetch().catch((err) => console.error("[pipelinesCache] startup warm-up failed:", err.message));