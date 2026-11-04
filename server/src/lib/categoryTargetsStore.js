import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The yearly target amount of an Other Dashboards category (Rhapsody / IGCC),
// shown on that dashboard's "Target Amount" card and editable there.
// Kept in a small JSON file next to the server: { rhapsody: { "2026-2027": 50000000 } }
// (amounts in rupees). It lives in server/data/category-targets.json and is
// created on first save.
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "category-targets.json");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}

// { "2026-2027": amount, ... } for one category
export function getCategoryTargets(category) {
  return { ...(load()[category] || {}) };
}

// Sets (or, with 0, clears) one fiscal year's target; returns the category's targets.
export function setCategoryTarget(category, fy, amount) {
  const all = load();
  all[category] = { ...(all[category] || {}) };
  if (amount > 0) all[category][fy] = amount;
  else delete all[category][fy];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(all, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
  return { ...all[category] };
}