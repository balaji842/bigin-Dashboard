import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The month-wise targets shown on the Comparison page's "Monthwise Cash / Kind
// Target" card, set by double-clicking a month there — one set for Cash and one for
// Kind. Kept in a small JSON file next to the server:
//   { "2026-2027": { "Cash": { "November": 80000000 }, "Kind": { "November": 20000000 } } }
// (amounts in rupees). It lives in server/data/month-cash-targets.json and is created
// on first save.
//
// Older versions of this file held Cash only, with the months directly under the
// fiscal year ({ "2026-2027": { "November": 80000000 } }). Those targets are picked up
// as Cash targets automatically and are saved in the new layout on the next change.
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "month-cash-targets.json");

const MONTHS = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
export const TARGET_TYPES = ["Cash", "Kind"];

let cache = null;

function load() {
  if (cache) return cache;
  let all;
  try {
    all = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    all = {};
  }
  // old layout (months straight under the fiscal year) -> Cash
  for (const fy of Object.keys(all)) {
    const entry = all[fy];
    if (entry && MONTHS.some((m) => m in entry)) all[fy] = { Cash: entry };
  }
  cache = all;
  return cache;
}

// { "April": amount, ... } for one fiscal year and type (only the months that have a target)
export function getMonthTargets(fy, type) {
  return { ...(load()[fy]?.[type] || {}) };
}

// Sets (or, with 0, clears) one month's target; returns that fiscal year's targets for the type.
export function setMonthTarget(fy, type, month, amount) {
  const all = load();
  all[fy] = { ...(all[fy] || {}) };
  all[fy][type] = { ...(all[fy][type] || {}) };
  if (amount > 0) all[fy][type][month] = amount;
  else delete all[fy][type][month];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(all, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
  return { ...all[fy][type] };
}