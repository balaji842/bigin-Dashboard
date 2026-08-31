// Shared helpers for turning raw Bigin Pipelines records into the
// aggregates the CRM Analysis dashboard needs. Field names below are
// verified against /settings/fields via the GAS sync script — see
// PIPELINE_FIELDS in that script for the source of truth.

// Bigin returns lookups/picklists inconsistently — sometimes a plain
// string, sometimes { name, id }. Normalize to a plain string.
export function pick(record, field, fallback = "Unspecified") {
  const raw = record[field];
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw.name || raw.value || fallback;
  return String(raw);
}

export function pickNumber(record, field) {
  return Number(record[field]) || 0;
}

// Sub_Pipeline is a plain picklist. Only "Standard Pipeline" means open;
// anything else (Closed Won, Closed Lost, or whatever your closed values
// are) counts as closed — matches the split already used in your GAS sync.
export function isStandardPipeline(deal) {
  return pick(deal, "Sub_Pipeline", "") === "Standard Pipeline";
}

export function isClosed(deal) {
  return !isStandardPipeline(deal);
}

// Distinct donor count by Account_Name. Uses the lookup's id when present
// (more reliable than name, which can have casing/whitespace variants),
// falling back to the stringified name.
export function uniqueDonorKey(deal) {
  const raw = deal.Account_Name;
  if (raw && typeof raw === "object") return raw.id || raw.name || null;
  return raw || null;
}

export function uniqueDonorCount(deals) {
  const keys = new Set();
  for (const d of deals) {
    const key = uniqueDonorKey(d);
    if (key) keys.add(key);
  }
  return keys.size;
}

// Groups deals by a field, returning amount total + unique donor count
// per group value. Used for Type, Donor Type, KAM, Platform breakdowns.
export function groupSummary(deals, field) {
  const groups = {}; // name -> { amount, donorKeys: Set }
  for (const d of deals) {
    const key = pick(d, field);
    if (!groups[key]) groups[key] = { amount: 0, donorKeys: new Set() };
    groups[key].amount += pickNumber(d, "Amount");
    const donorKey = uniqueDonorKey(d);
    if (donorKey) groups[key].donorKeys.add(donorKey);
  }
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      amount: g.amount,
      donors: g.donorKeys.size,
    }))
    .sort((a, b) => b.amount - a.amount);
}

const FY_MONTH_ORDER = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];

// Month-wise summary for a set of deals, using Closing_Date for closed
// deals (the month the money actually landed) or a supplied date field.
// Always returns all 12 months April->March, zero-filled — so the table
// shows the full FY shape rather than only months with activity.
export function monthWiseSummary(deals, dateField = "Closing_Date") {
  const byMonth = {};
  for (const d of deals) {
    const raw = d[dateField];
    if (!raw) continue;
    const date = new Date(raw);
    if (isNaN(date)) continue;
    const monthName = date.toLocaleString("en-US", { month: "long" });
    if (!byMonth[monthName]) byMonth[monthName] = { amount: 0, donorKeys: new Set() };
    byMonth[monthName].amount += pickNumber(d, "Amount");
    const donorKey = uniqueDonorKey(d);
    if (donorKey) byMonth[monthName].donorKeys.add(donorKey);
  }
  return FY_MONTH_ORDER.map((m) => ({
    name: m,
    amount: byMonth[m] ? byMonth[m].amount : 0,
    donors: byMonth[m] ? byMonth[m].donorKeys.size : 0,
  }));
}

// Standard pipeline deals aren't closed yet, so there's no Closing_Date
// to bucket by. Expected_Conversion_Month is a picklist (plain string
// like "April"), not a date — group directly on that value instead of
// trying to parse it as a Date. Also always returns all 12 months.
export function monthWiseFromPicklist(deals, field = "Expected_Conversion_Month") {
  const byMonth = {};
  for (const d of deals) {
    const monthName = pick(d, field, null);
    if (!monthName) continue;
    if (!byMonth[monthName]) byMonth[monthName] = { amount: 0, donorKeys: new Set() };
    byMonth[monthName].amount += pickNumber(d, "Amount");
    const donorKey = uniqueDonorKey(d);
    if (donorKey) byMonth[monthName].donorKeys.add(donorKey);
  }
  return FY_MONTH_ORDER.map((m) => ({
    name: m,
    amount: byMonth[m] ? byMonth[m].amount : 0,
    donors: byMonth[m] ? byMonth[m].donorKeys.size : 0,
  }));
}
// Maps a JS Date's calendar month to its position in the April->March
// fiscal year (April = 0 ... March = 11). Used to build "year-to-date"
// comparisons that always mean "same stretch of months" regardless of
// which two fiscal years are being compared.
export function fiscalMonthIndex(date) {
  return (date.getMonth() + 9) % 12; // getMonth(): Jan=0..Dec=11
}

// Totals for only the deals whose Closing_Date falls on or before the
// given fiscal-month cutoff (inclusive). E.g. cutoffFiscalIndex for
// August (fiscal index 4) includes April-August, excludes September+.
export function ytdTotals(deals, dateField, cutoffFiscalIndex) {
  const subset = deals.filter((d) => {
    const raw = d[dateField];
    if (!raw) return false;
    const date = new Date(raw);
    if (isNaN(date)) return false;
    return fiscalMonthIndex(date) <= cutoffFiscalIndex;
  });
  return totalsFor(subset);
}
export function totalsFor(deals) {
  return {
    amount: deals.reduce((sum, d) => sum + pickNumber(d, "Amount"), 0),
    donors: uniqueDonorCount(deals),
    count: deals.length,
  };
}

// Merges two groupSummary() results (e.g. "By KAM" for two different
// fiscal years) into side-by-side comparison rows, keyed by name. Names
// that only exist in one FY still show up, with 0 for the missing side.
export function mergeBreakdowns(rowsA, rowsB) {
  const map = {};
  for (const r of rowsA) {
    map[r.name] = { name: r.name, amountA: r.amount, donorsA: r.donors, amountB: 0, donorsB: 0 };
  }
  for (const r of rowsB) {
    if (!map[r.name]) {
      map[r.name] = { name: r.name, amountA: 0, donorsA: 0, amountB: r.amount, donorsB: r.donors };
    } else {
      map[r.name].amountB = r.amount;
      map[r.name].donorsB = r.donors;
    }
  }
  return Object.values(map).sort(
    (a, b) => (b.amountA + b.amountB) - (a.amountA + a.amountB)
  );
}