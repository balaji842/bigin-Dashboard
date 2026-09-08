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

// Handles Bigin's inconsistent representations for a Yes/No or checkbox
// field: a real boolean true, or a string/picklist like "Yes"/"Approved"
// (case-insensitive). Anything else (No, Pending, blank, false) counts
// as not approved.
export function isApprovedByRajesh(deal) {
  const raw = deal.Approved_by_Rajesh;
  if (raw === true) return true;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    return v === "yes" || v === "true" || v === "approved";
  }
  if (raw && typeof raw === "object") {
    const v = String(raw.name || raw.value || "").trim().toLowerCase();
    return v === "yes" || v === "true" || v === "approved";
  }
  return false;
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
// This is what makes a mid-year FY-to-FY comparison fair: both sides
// only count the same stretch of months.
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

export function monthNameOf(closingDate) {
  if (!closingDate) return null;
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

// Builds the 4-way donor breakdown (Matching / Missing / New / Past) for
// one calendar month, comparing fy1 vs fy2. See route comment for the
// exact definition of each bucket. `deals` should already be filtered to
// isClosed (and any Type filter) before calling this.
export function buildMonthDonorBreakdown(deals, fy1, fy2, month) {
  const byDonor = {}; // donorKey -> { account, byFY: { [fiscalYear]: [entry, ...] } }

  for (const d of deals) {
    const donorKey = uniqueDonorKey(d);
    if (!donorKey) continue;
    const fy = pick(d, "Fiscal_year", "Unspecified");
    if (!byDonor[donorKey]) byDonor[donorKey] = { account: pick(d, "Account_Name"), byFY: {} };
    if (!byDonor[donorKey].byFY[fy]) byDonor[donorKey].byFY[fy] = [];
    byDonor[donorKey].byFY[fy].push({
      amount: pickNumber(d, "Amount"),
      type: pick(d, "Type"),
      month: monthNameOf(d.Closing_Date),
      kam: pick(d, "Pipeline_KAM"),
      platform: pick(d, "Platform"),
      spoc: pick(d, "Spoc"),
    });
  }

  function aggregate(entries) {
    if (!entries || entries.length === 0) return null;
    const amount = entries.reduce((s, e) => s + e.amount, 0);
    const type = [...new Set(entries.map((e) => e.type))].join(" / ");
    const monthLabel = [...new Set(entries.map((e) => e.month).filter(Boolean))].join(", ");
    const last = entries[entries.length - 1];
    return { amount, type, month: monthLabel, kam: last.kam, platform: last.platform, spoc: last.spoc };
  }

  function priorYearsLabel(byFY) {
    return Object.entries(byFY)
      .filter(([fy]) => fy !== fy1 && fy !== fy2)
      .map(([fy, entries]) => {
        const amt = entries.reduce((s, e) => s + e.amount, 0);
        const type = [...new Set(entries.map((e) => e.type))].join("/");
        return `FY ${fy}: \u20b9${amt.toLocaleString("en-IN")} (${type})`;
      })
      .join("; ");
  }

  const matching = [];
  const missing = [];
  const newDonors = [];
  const past = [];

  for (const info of Object.values(byDonor)) {
    const fy1All = info.byFY[fy1] || [];
    const fy2All = info.byFY[fy2] || [];
    const fy1Month = fy1All.filter((e) => e.month === month);
    const fy2Month = fy2All.filter((e) => e.month === month);

    const otherYearEntries = Object.entries(info.byFY)
      .filter(([fy]) => fy !== fy1 && fy !== fy2)
      .flatMap(([, entries]) => entries);

    const inFY1Month = fy1Month.length > 0;
    const inFY2Month = fy2Month.length > 0;
    const inFY1Any = fy1All.length > 0;
    const inFY2Any = fy2All.length > 0;
    const inOther = otherYearEntries.length > 0;

    if (inFY1Month && inFY2Month) {
      const a1 = aggregate(fy1Month);
      const a2 = aggregate(fy2Month);
      const diffAmount = a2.amount - a1.amount;
      const diffPct = a1.amount > 0 ? (diffAmount / a1.amount) * 100 : a2.amount > 0 ? 100 : null;
      matching.push({
        account: info.account,
        fy1Amount: a1.amount,
        fy1Type: a1.type,
        fy2Amount: a2.amount,
        fy2Type: a2.type,
        diffAmount,
        diffPct,
        kam: a2.kam,
        spoc: a2.spoc,
      });
    } else if (inFY1Month && !inFY2Any) {
      const a1 = aggregate(fy1Month);
      missing.push({
        account: info.account,
        fy1Amount: a1.amount,
        fy1Type: a1.type,
        kam: a1.kam,
        spoc: a1.spoc,
      });
    } else if (inFY2Month) {
      const a2 = aggregate(fy2Month);
      if (inFY1Any) {
        const a1 = aggregate(fy1All);
        newDonors.push({
          account: info.account,
          fy1Amount: a1.amount,
          fy1Type: a1.type,
          fy1Month: a1.month,
          fy2Amount: a2.amount,
          fy2Type: a2.type,
          platform: a2.platform,
          kam: a2.kam,
          spoc: a2.spoc,
        });
      } else if (inOther) {
        past.push({
          account: info.account,
          priorSummary: priorYearsLabel(info.byFY),
          fy2Amount: a2.amount,
          fy2Type: a2.type,
          platform: a2.platform,
          kam: a2.kam,
          spoc: a2.spoc,
        });
      } else {
        newDonors.push({
          account: info.account,
          fy1Amount: null,
          fy1Type: null,
          fy1Month: null,
          fy2Amount: a2.amount,
          fy2Type: a2.type,
          platform: a2.platform,
          kam: a2.kam,
          spoc: a2.spoc,
        });
      }
    }
    // else: no activity in this month for either year — irrelevant to this view.
  }

  const sumBy = (arr, key) => arr.reduce((s, r) => s + (r[key] || 0), 0);

  return {
    matching: { rows: matching, donorCount: matching.length, totalAmount: sumBy(matching, "fy2Amount") },
    missing: { rows: missing, donorCount: missing.length, totalAmount: sumBy(missing, "fy1Amount") },
    newDonors: { rows: newDonors, donorCount: newDonors.length, totalAmount: sumBy(newDonors, "fy2Amount") },
    past: { rows: past, donorCount: past.length, totalAmount: sumBy(past, "fy2Amount") },
  };
}

// Full donor-wise retention view: every donor who gave anything in fy1,
// broken into one row per (donor, Type) combination, showing what that
// same donor+type did in fy2. "Engaged" means the donor has ANY closed
// deal in fy2 (any type) — a donor can be "Engaged" overall while still
// showing "-" on a specific type row they didn't repeat.
export function buildEngagementComparison(deals, standardDeals, fy1, fy2) {
  const byDonor = {}; // donorKey -> { account, byFY: { [fy]: { [type]: {amount, kam, platform, spoc, donorType} } } }

  for (const d of deals) {
    const key = uniqueDonorKey(d);
    if (!key) continue;
    const fy = pick(d, "Fiscal_year", "Unspecified");
    const type = pick(d, "Type");
    if (!byDonor[key]) byDonor[key] = { account: pick(d, "Account_Name"), byFY: {} };
    if (!byDonor[key].byFY[fy]) byDonor[key].byFY[fy] = {};
    if (!byDonor[key].byFY[fy][type]) {
      byDonor[key].byFY[fy][type] = { amount: 0 };
    }
    const bucket = byDonor[key].byFY[fy][type];
    bucket.amount += pickNumber(d, "Amount");
    // Last deal seen wins for these donor-attribute fields — a reasonable
    // "most recent" proxy since we don't have a definitive record here.
    bucket.kam = pick(d, "Pipeline_KAM");
    bucket.platform = pick(d, "Platform");
    bucket.spoc = pick(d, "Spoc");
    bucket.donorType = pick(d, "Type_of_donor");
    bucket.category = pick(d, "Category");
    // Last deal's closing month wins too, same "most recent" proxy as
    // kam/platform/spoc/donorType above.
    bucket.month = monthNameOf(d.Closing_Date);
  }

  // Open/Standard Pipeline deals for the current fiscal year (fy2),
  // keyed by donor + Type — lets each row also show what's still
  // forecasted for that same donor+type combo, alongside their closed
  // history. Expected_Conversion_Month is a picklist, not a date, so
  // it's collected as text (joined if a donor has more than one
  // expected month for the same type) rather than parsed as a Date.
  const pipelineByDonorType = {};
  for (const d of standardDeals) {
    if (pick(d, "Fiscal_year", "") !== fy2) continue;
    const key = uniqueDonorKey(d);
    if (!key) continue;
    const type = pick(d, "Type");
    if (!pipelineByDonorType[key]) pipelineByDonorType[key] = {};
    if (!pipelineByDonorType[key][type]) {
      pipelineByDonorType[key][type] = { amount: 0, months: new Set() };
    }
    pipelineByDonorType[key][type].amount += pickNumber(d, "Amount");
    const expectedMonth = pick(d, "Expected_Conversion_Month", null);
    if (expectedMonth) pipelineByDonorType[key][type].months.add(expectedMonth);
  }

  const rows = [];
  for (const [donorKey, info] of Object.entries(byDonor)) {
    const fy1Types = info.byFY[fy1] || {};
    const fy2Types = info.byFY[fy2] || {};
    if (Object.keys(fy1Types).length === 0) continue; // base = donors active in fy1

    const engaged = Object.keys(fy2Types).length > 0;
    const rep = Object.values(fy2Types)[0] || Object.values(fy1Types)[0];
    const pipelineForDonor = pipelineByDonorType[donorKey] || {};

    const allTypes = new Set([...Object.keys(fy1Types), ...Object.keys(fy2Types), ...Object.keys(pipelineForDonor)]);
    for (const type of allTypes) {
      const a1 = fy1Types[type];
      const a2 = fy2Types[type];
      const fy1Amount = a1 ? a1.amount : null;
      const fy2Amount = a2 ? a2.amount : null;
      let diffAmount = null;
      let diffPct = null;
      if (fy1Amount != null && fy2Amount != null) {
        diffAmount = fy2Amount - fy1Amount;
        diffPct = fy1Amount > 0 ? (diffAmount / fy1Amount) * 100 : fy2Amount > 0 ? 100 : 0;
      }
      const pipeline = pipelineForDonor[type];
      rows.push({
        account: info.account,
        fy1Amount,
        fy1Type: fy1Amount != null ? type : null,
        fy1Month: a1 ? a1.month : null,
        fy2Amount,
        fy2Type: fy2Amount != null ? type : null,
        fy2Month: a2 ? a2.month : null,
        diffAmount,
        absDiffAmount: diffAmount != null ? Math.abs(diffAmount) : null,
        diffPct,
        engaged,
        pipelineAmount: pipeline ? pipeline.amount : null,
        pipelineMonth: pipeline && pipeline.months.size > 0 ? [...pipeline.months].join(", ") : null,
        platform: rep.platform,
        spoc: rep.spoc,
        kam: rep.kam,
        donorType: rep.donorType,
        // Category is its own field on the deal (A/B/C), separate from KAM.
        category: rep.category,
      });
    }
  }

  // Group by donor before sorting so a donor's multiple Type rows always
  // land next to each other — required for the table to merge Donor
  // Name and Engagement Status into one visual row per donor. Donors are
  // ordered by their combined fy1+fy2 total; each donor's own rows are
  // ordered by fy1Amount (biggest first).
  const byAccount = {};
  for (const row of rows) {
    if (!byAccount[row.account]) byAccount[row.account] = [];
    byAccount[row.account].push(row);
  }
  const groups = Object.values(byAccount).map((groupRows) => {
    const total = groupRows.reduce((s, r) => s + (r.fy1Amount || 0) + (r.fy2Amount || 0), 0);
    groupRows.sort((a, b) => (b.fy1Amount || 0) - (a.fy1Amount || 0));
    return { total, groupRows };
  });
  groups.sort((a, b) => b.total - a.total);

  return groups.flatMap((g) => g.groupRows);
}

// The 3 standard engagement Types. Tables that group by Type always show
// all 3, zero-filled, even if a KAM/FY combo has no deals of that Type —
// keeps the table shape consistent for the KAM comparison view.
export const STANDARD_TYPES = ["Cash", "Kind", "School Engagement"];

// Groups a set of deals by Type, then by Platform within each Type,
// summing amount and unique donor count at both levels. Always returns
// all 3 STANDARD_TYPES (zero-filled); Platforms are whatever's actually
// present in the data for that Type, sorted alphabetically.
export function buildTypePlatformBreakdown(deals) {
  const byType = {};
  for (const type of STANDARD_TYPES) byType[type] = { byPlatform: {}, donorKeys: new Set(), amount: 0 };

  for (const d of deals) {
    const type = pick(d, "Type");
    if (!byType[type]) byType[type] = { byPlatform: {}, donorKeys: new Set(), amount: 0 };
    const platform = pick(d, "Platform");
    if (!byType[type].byPlatform[platform]) {
      byType[type].byPlatform[platform] = { amount: 0, donorKeys: new Set() };
    }
    const amt = pickNumber(d, "Amount");
    byType[type].byPlatform[platform].amount += amt;
    byType[type].amount += amt;
    const donorKey = uniqueDonorKey(d);
    if (donorKey) {
      byType[type].byPlatform[platform].donorKeys.add(donorKey);
      byType[type].donorKeys.add(donorKey);
    }
  }

  const allTypeNames = new Set([...STANDARD_TYPES, ...Object.keys(byType)]);
  const types = [...allTypeNames].map((type) => {
    const info = byType[type] || { byPlatform: {}, donorKeys: new Set(), amount: 0 };
    const platforms = Object.keys(info.byPlatform).sort();
    return {
      type,
      platforms,
      byPlatform: Object.fromEntries(
        platforms.map((p) => [p, { amount: info.byPlatform[p].amount, donors: info.byPlatform[p].donorKeys.size }])
      ),
      total: { amount: info.amount, donors: info.donorKeys.size },
    };
  });
  // Keep the 3 standard types first (in their fixed order), any
  // non-standard Type found in the data tacked on after.
  types.sort((a, b) => {
    const ai = STANDARD_TYPES.indexOf(a.type);
    const bi = STANDARD_TYPES.indexOf(b.type);
    if (ai === -1 && bi === -1) return a.type.localeCompare(b.type);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const grandTotalAmount = types.reduce((s, t) => s + t.total.amount, 0);
  return { types, grandTotalAmount };
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