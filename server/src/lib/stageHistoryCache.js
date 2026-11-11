import { fetchStageHistory } from "../zohoClient.js";
import { normalizeStageHistory } from "./dealHelpers.js";

// Stage history of individual deals, kept in memory.
//
// Unlike the pipeline data, history is one Bigin call PER DEAL, so it is only
// fetched for the deals a popup actually lists, a few at a time, and then
// remembered:
//   - a good answer is reused for 30 minutes;
//   - a failed one is remembered for 5 minutes so a broken route is not
//     hammered (every call costs Bigin API credits);
//   - the same deal asked for twice at once shares one call.

const TTL_MS = 30 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = 4;

const store = new Map(); // dealId -> { at, entries, error }
const inFlight = new Map(); // dealId -> Promise

async function load(id) {
  try {
    const { source, rows } = await fetchStageHistory(id);
    store.set(id, { at: Date.now(), entries: normalizeStageHistory(rows, source), error: null });
  } catch (err) {
    store.set(id, { at: Date.now(), entries: null, error: err.message || "Stage history unavailable" });
  } finally {
    inFlight.delete(id);
  }
}

const fresh = (hit) => hit && Date.now() - hit.at < (hit.error ? ERROR_TTL_MS : TTL_MS);

/** ids → { [id]: { entries: [{ stage, at }] | null, error: string | null } } */
export async function getStageHistories(ids) {
  const wanted = [...new Set(ids.map(String))];
  const missing = wanted.filter((id) => !fresh(store.get(id)));

  const queue = missing.filter((id) => !inFlight.has(id));
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const p = load(id);
      inFlight.set(id, p);
      await p;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  await Promise.all(missing.map((id) => inFlight.get(id)).filter(Boolean)); // deals another request is already loading

  const out = {};
  for (const id of wanted) {
    const hit = store.get(id);
    out[id] = hit ? { entries: hit.entries, error: hit.error } : { entries: null, error: "Stage history unavailable" };
  }
  return out;
}

export function invalidateStageHistoryCache() {
  store.clear();
}