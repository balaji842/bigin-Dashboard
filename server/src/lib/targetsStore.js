// Manually-entered conversion targets (Cash/Kind/School Engagement, per
// KAM, per fiscal year) — there's no Target field in Bigin, so these are
// typed in through the UI and persisted here as a flat JSON file. No
// database is set up for this project, so a small file store is the
// simplest thing that survives server restarts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "targets.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "{}", "utf8");
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function key(fy, kam, type) {
  return `${fy}|||${kam}|||${type}`;
}

// Returns { [type]: number } for one KAM + one fiscal year. Missing
// entries are omitted (frontend treats a missing target as blank/0).
export function getTargetsFor(fy, kam, types) {
  const all = readAll();
  const out = {};
  for (const type of types) {
    const v = all[key(fy, kam, type)];
    if (v != null) out[type] = v;
  }
  return out;
}

export function setTarget(fy, kam, type, value) {
  const all = readAll();
  all[key(fy, kam, type)] = value;
  writeAll(all);
  return value;
}

// Sums KAMs' targets for one fiscal year + type — powers both the "All
// KAM" aggregate view (kamFilter omitted — every real KAM) and a
// specific multi-select of several KAMs at once (kamFilter given —
// just those). Both are read-only client-side, since there's no single
// target to edit once more than one KAM is being looked at together.
// Scans all stored entries rather than requiring a full KAM list from
// the caller, so it stays correct even if a KAM has a target set but
// no longer shows up in the current CRM data.
export function getSummedTargetsFor(fy, types, kamFilter = null) {
  const all = readAll();
  const kamSet = kamFilter ? new Set(kamFilter) : null;
  const out = {};
  for (const type of types) {
    let sum = 0;
    let anySet = false;
    for (const [k, v] of Object.entries(all)) {
      if (v == null) continue;
      const [kFy, kKam, kType] = k.split("|||");
      if (kFy !== fy || kType !== type || kKam === "ALL") continue;
      if (kamSet && !kamSet.has(kKam)) continue;
      sum += v;
      anySet = true;
    }
    if (anySet) out[type] = sum;
  }
  return out;
}

// Every real KAM's target for one fiscal year + Type, as a { [kam]:
// value } map — powers the KAM-wise Target chart on Engagement Status,
// which needs one number per KAM (not summed together like the
// function above).
export function getAllTargetsForType(fy, type) {
  const all = readAll();
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (v == null) continue;
    const [kFy, kKam, kType] = k.split("|||");
    if (kFy === fy && kType === type && kKam !== "ALL") out[kKam] = v;
  }
  return out;
}