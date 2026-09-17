import { Router } from "express";
import { getPipelines, invalidatePipelinesCache, pipelinesCacheInfo } from "../lib/pipelinesCache.js";
import {
  pick,
  pickNumber,
  isStandardPipeline,
  isClosed,
  uniqueDonorKey,
  groupSummary,
  monthWiseSummary,
  monthWiseFromPicklist,
  monthNameOf,
  mergeBreakdowns,
  totalsFor,
  fiscalMonthIndex,
  ytdTotals,
  buildMonthDonorBreakdown,
  buildEngagementComparison,
  buildTypePlatformBreakdown,
  STANDARD_TYPES,
  isApprovedOpenPipeline,
} from "../lib/dealHelpers.js";
import { getTargetsFor, getSummedTargetsFor, setTarget } from "../lib/targetsStore.js";


// Parses a comma-separated query param into a trimmed array, or null if
// the param wasn't supplied at all (meaning "no filter, include everything").
function parseListParam(raw) {
  return raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : null;
}

// Applies the Type/KAM/SPOC/Platform multi-select filters (any of which
// may be null = not filtering on that field) to a list of donors.
function applyFilters(donors, { types, kams, spocs, platforms }) {
  let out = donors;
  if (types && types.length > 0) out = out.filter((d) => types.includes(pick(d, "Type")));
  if (kams && kams.length > 0) out = out.filter((d) => kams.includes(pick(d, "Pipeline_KAM")));
  if (spocs && spocs.length > 0) out = out.filter((d) => spocs.includes(pick(d, "Spoc")));
  if (platforms && platforms.length > 0) out = out.filter((d) => platforms.includes(pick(d, "Platform")));
  return out;
}

const router = Router();

// GET /api/crm-analysis/filter-options
// Distinct Type/KAM/SPOC/Platform values across every deal (closed and
// standard pipeline both), for populating the FY Comparison filter pills.
// POST /api/crm-analysis/refresh
// Forces the next data request on ANY /crm-analysis/* route to pull
// fresh from Zoho instead of reusing the cached snapshot — this is what
// the "Refresh live data" button in the sidebar should call. Pre-warms
// the cache immediately (rather than just invalidating and letting the
// next page request pay the cost) so the button's own loading spinner
// reflects the actual Zoho round-trip.
router.post("/crm-analysis/refresh", async (_req, res) => {
  try {
    invalidatePipelinesCache();
    const donors = await getPipelines({ force: true });
    res.json({ ok: true, count: donors.length, ...pipelinesCacheInfo() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Kept as its own lightweight call so the filter lists stay complete even
// while the person has other filters narrowed down elsewhere in the UI.
router.get("/crm-analysis/filter-options", async (_req, res) => {
  try {
    const donors = await getPipelines();
    const distinct = (field) =>
      [...new Set(donors.map((d) => pick(d, field)))].sort((a, b) => a.localeCompare(b));

    res.json({
      types: distinct("Type").filter((v) => v !== "Unspecified"),
      kams: distinct("Pipeline_KAM"),
      spocs: distinct("Spoc"),
      platforms: distinct("Platform"),
      donorTypes: distinct("Type_of_donor"),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
// GET /api/crm-analysis/overview?fy=2025-2026,2026-2027&types=Cash,Kind&donorTypes=NPO,Corporate
// fy is "ALL" (or omitted) meaning "every fiscal year combined", or a
// comma-separated list of one or more specific fiscal years to combine —
// used by the clickable "Total Conversion FY 2022-2027" card (resets to
// "ALL") and the multi-select FY cards below it.
// donorTypes is a comma-separated list from the "By Donor Type" cards
// (e.g. "NPO,Corporate") — selecting one or more of those cards scopes
// every other card/table on the page to just those donor types, the
// same way the Type pills already do for "Type".
router.get("/crm-analysis/overview", async (req, res) => {
  const rawFy = req.query.fy;
  // null = "ALL" (every fiscal year combined); otherwise an array of the
  // specific fiscal years currently selected.
  const selectedFYs = !rawFy || rawFy === "ALL" ? null : parseListParam(rawFy);
  const selectedTypes = parseListParam(req.query.types);
  const selectedDonorTypes = parseListParam(req.query.donorTypes);

  try {
    const donors = await getPipelines();

    let filtereddonors = donors;
    if (selectedTypes && selectedTypes.length > 0) {
      filtereddonors = filtereddonors.filter((d) => selectedTypes.includes(pick(d, "Type")));
    }

    const closeddonorsAll = filtereddonors.filter(isClosed);
    const standarddonors = filtereddonors.filter(isStandardPipeline);

    // Two single-dimension views, each respecting only the OTHER
    // dimension's selection — this is what keeps every FY card and every
    // Donor Type card visible and clickable no matter what's currently
    // selected, instead of the active selection collapsing its own
    // card list down to just itself.
    //
    // closedByDonorTypeOnly: respects the donor-type selection, ignores
    // the FY selection — always spans every fiscal year, which is
    // exactly what powers the FY cards (each one's total is scoped by
    // donor type but never by which FY(s) are currently selected).
    const closedByDonorTypeOnly =
      selectedDonorTypes && selectedDonorTypes.length > 0
        ? closeddonorsAll.filter((d) => selectedDonorTypes.includes(pick(d, "Type_of_donor")))
        : closeddonorsAll;

    // closedByFYOnly: respects the FY selection, ignores the donor-type
    // selection — powers the Donor Type cards (each one's total is
    // scoped to the selected FY(s), or every year when "ALL", but never
    // narrowed by which donor type(s) are currently selected).
    const closedByFYOnly =
      selectedFYs && selectedFYs.length > 0
        ? closeddonorsAll.filter((d) => selectedFYs.includes(pick(d, "Fiscal_year", "")))
        : closeddonorsAll;

    // Both dimensions combined — this is the actual current scope: what
    // the KPI totals, Month-wise table, and Donor History table show.
    const closedThisFY =
      selectedFYs && selectedFYs.length > 0
        ? closedByDonorTypeOnly.filter((d) => selectedFYs.includes(pick(d, "Fiscal_year", "")))
        : closedByDonorTypeOnly;

    const filtereddonorsForData =
      selectedDonorTypes && selectedDonorTypes.length > 0
        ? filtereddonors.filter((d) => selectedDonorTypes.includes(pick(d, "Type_of_donor")))
        : filtereddonors;

    const pipeline2027Approved = standarddonors.filter(
      (d) => pick(d, "Fiscal_year", "") === "2026-2027" && isApprovedOpenPipeline(d)
    );

    res.json({
      fy: selectedFYs && selectedFYs.length > 0 ? selectedFYs : "ALL",
      donorTypes: selectedDonorTypes && selectedDonorTypes.length > 0 ? selectedDonorTypes : null,
      closed: {
        // "allTime" ignores the FY selection by design — it's the basis
        // for the "Total Conversion FY 2022-2027" card, which always
        // means every year, only ever scoped by donor type.
        allTime: totalsFor(closedByDonorTypeOnly),
        thisFY: totalsFor(closedThisFY),
      },
      pipeline2027Approved: totalsFor(pipeline2027Approved),

      // Totals per fiscal year found in the closed donors — powers the
      // clickable FY cards on the Overview page. "Unspecified" (donors
      // with no Fiscal_year set) is dropped since it isn't a real year
      // to click into; sorted chronologically (the "YYYY-YYYY" format
      // sorts correctly as plain strings). Computed from
      // closedByDonorTypeOnly so every FY card stays visible/clickable
      // regardless of which FY(s) are currently selected.
      byFiscalYear: groupSummary(closedByDonorTypeOnly, "Fiscal_year")
        .filter((r) => r.name !== "Unspecified")
        .sort((a, b) => a.name.localeCompare(b.name)),

      // Both of these follow the fully-combined scope (FY selection AND
      // donor-type selection).
      monthWise: monthWiseSummary(closedThisFY, "Closing_Date"),

      // Computed from closedByFYOnly so every Donor Type card stays
      // visible/clickable regardless of which donor type(s) are
      // currently selected.
      byDonorType: groupSummary(closedByFYOnly, "Type_of_donor"),

      // Raw rows for the filterable table at the bottom of the module.
      // Kept lean — just what the table needs to display + filter on.
      table: filtereddonorsForData.map((d) => ({
        dealName: pick(d, "Deal_Name"),
        account: pick(d, "Account_Name"),
        amount: Number(d.Amount) || 0,
        subPipeline: pick(d, "Sub_Pipeline"),
        stage: pick(d, "Stage"),
        type: pick(d, "Type"),
        donorType: pick(d, "Type_of_donor"),
        kam: pick(d, "Pipeline_KAM"),
        platform: pick(d, "Platform"),
        spoc: pick(d, "Spoc"),
        fiscalYear: pick(d, "Fiscal_year"),
        closingDate: d.Closing_Date || null,
        expectedMonth: pick(d, "Expected_Conversion_Month", null),
        approved: pick(d, "Approved_by_Rajesh"),
      })),

      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/closed-donors?fy=2026-2027&types=Cash,Kind
// fy defaults to the current "FY 2026-27 Conversion" page's only year.
// types is an optional comma-separated Cash/Kind/School Engagement filter.
router.get("/crm-analysis/closed-donors", async (req, res) => {
  const currentFY = req.query.fy || "2026-2027";
  const selectedTypes = parseListParam(req.query.types);

  try {
    const donors = await getPipelines();
    let closeddonors = donors.filter(isClosed);
    let standarddonors = donors.filter(isStandardPipeline);
    if (selectedTypes && selectedTypes.length > 0) {
      closeddonors = closeddonors.filter((d) => selectedTypes.includes(pick(d, "Type")));
      standarddonors = standarddonors.filter((d) => selectedTypes.includes(pick(d, "Type")));
    }

    const closedThisFY = closeddonors.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY
    );
    // Same "approved by Rajesh, not Lost/On Hold" rule as the Overview
    // page's Pipeline card (see isApprovedOpenPipeline) — this is what
    // the "Total Pipeline" KPI card on the Conversion page shows, so it
    // needs to agree with Overview's number rather than counting every
    // open deal regardless of approval/stage.
    const standardThisFY = standarddonors.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY && isApprovedOpenPipeline(d)
    );

    // Every FY present in the closed data, kept for reference even though
    // the FY selector itself was removed from this page.
    const availableFYs = [
      ...new Set(closeddonors.map((d) => pick(d, "Fiscal_year", "Unspecified"))),
    ].sort();

    const monthWise = monthWiseSummary(closedThisFY, "Closing_Date");

    // "Current month" card: always the real calendar month we're in right
    // now, mapped onto its April->March fiscal position — so this rolls
    // from September to October automatically with no code change.
    const now = new Date();
    const cutoffIndex = fiscalMonthIndex(now);
    const currentMonth = monthWise[cutoffIndex];

    res.json({
      fy: currentFY,
      availableFYs,
      totals: totalsFor(closedThisFY),
      pipelineTotals: totalsFor(standardThisFY),
      currentMonth: {
        name: currentMonth.name,
        amount: currentMonth.amount,
        donors: currentMonth.donors,
      },
      allTimeTotals: totalsFor(closeddonors),

      monthWise,

      byType: groupSummary(closedThisFY, "Type"),
      byDonorType: groupSummary(closedThisFY, "Type_of_donor"),
      byKAM: groupSummary(closedThisFY, "Pipeline_KAM"),
      byPlatform: groupSummary(closedThisFY, "Platform"),
      byStage: groupSummary(closedThisFY, "Stage"),

      table: closedThisFY.map((d) => ({
        dealName: pick(d, "Deal_Name"),
        account: pick(d, "Account_Name"),
        amount: Number(d.Amount) || 0,
        stage: pick(d, "Stage"),
        type: pick(d, "Type"),
        donorType: pick(d, "Type_of_donor"),
        kam: pick(d, "Pipeline_KAM"),
        platform: pick(d, "Platform"),
        spoc: pick(d, "Spoc"),
        closingDate: d.Closing_Date || null,
        approved: pick(d, "Approved_by_Rajesh"),
      })),

      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/standard-pipeline?fy=2026-2027&types=Cash,Kind
router.get("/crm-analysis/standard-pipeline", async (req, res) => {
  const currentFY = req.query.fy || "2026-2027";
  const selectedTypes = parseListParam(req.query.types);

  try {
    const donors = await getPipelines();
    let standarddonors = donors.filter(isStandardPipeline);
    if (selectedTypes && selectedTypes.length > 0) {
      standarddonors = standarddonors.filter((d) => selectedTypes.includes(pick(d, "Type")));
    }
    // Same "approved by Rajesh, not Lost/On Hold" rule as the Overview
    // page's Pipeline card (see isApprovedOpenPipeline) — applied here so
    // every card, breakdown table, and the Donor History table on this
    // page all agree with Overview's "Pipeline 2026-2027" number instead
    // of each computing its own definition of "pipeline".
    standarddonors = standarddonors.filter(isApprovedOpenPipeline);
    const standardThisFY = standarddonors.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY
    );

    const availableFYs = [
      ...new Set(standarddonors.map((d) => pick(d, "Fiscal_year", "Unspecified"))),
    ].sort();

    // Projected conversion month, not actual — these donors haven't
    // closed yet.
    const monthWise = monthWiseFromPicklist(standardThisFY, "Expected_Conversion_Month");

    // Same rolling "current month" card as the Conversion page: maps
    // today's real calendar month onto its April->March fiscal
    // position, so it advances on its own every month.
    const now = new Date();
    const cutoffIndex = fiscalMonthIndex(now);
    const currentMonth = monthWise[cutoffIndex];

    res.json({
      fy: currentFY,
      availableFYs,
      totals: totalsFor(standardThisFY),
      allTimeTotals: totalsFor(standarddonors),
      currentMonth: {
        name: currentMonth.name,
        amount: currentMonth.amount,
        donors: currentMonth.donors,
      },

      monthWise,

      byStage: groupSummary(standardThisFY, "Stage"),
      byType: groupSummary(standardThisFY, "Type"),
      byDonorType: groupSummary(standardThisFY, "Type_of_donor"),
      byKAM: groupSummary(standardThisFY, "Pipeline_KAM"),
      byPlatform: groupSummary(standardThisFY, "Platform"),

      table: standardThisFY.map((d) => ({
        dealName: pick(d, "Deal_Name"),
        account: pick(d, "Account_Name"),
        amount: Number(d.Amount) || 0,
        stage: pick(d, "Stage"),
        type: pick(d, "Type"),
        donorType: pick(d, "Type_of_donor"),
        kam: pick(d, "Pipeline_KAM"),
        platform: pick(d, "Platform"),
        spoc: pick(d, "Spoc"),
        expectedMonth: pick(d, "Expected_Conversion_Month"),
        approved: pick(d, "Approved_by_Rajesh"),
      })),

      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
// GET /api/crm-analysis/fy-comparison?fy1=2025-2026&fy2=2026-2027
router.get("/crm-analysis/fy-comparison", async (req, res) => {
  const fy1 = req.query.fy1 || "2025-2026";
  const fy2 = req.query.fy2 || "2026-2027";

  // Optional multi-select filters — comma-separated lists, e.g.
  // "Cash,Kind" or "Prakash,Rajesh". Any filter left out (no query
  // param) means "no restriction" on that field. Every card/table
  // downstream is computed only from donors matching all supplied filters.
  const filters = {
    types: parseListParam(req.query.types),
    kams: parseListParam(req.query.kams),
    spocs: parseListParam(req.query.spocs),
    platforms: parseListParam(req.query.platforms),
  };

  try {
    const donors = await getPipelines();
    const closeddonors = applyFilters(donors.filter(isClosed), filters);
    const standarddonors = applyFilters(donors.filter(isStandardPipeline), filters);

    const closedFY1 = closeddonors.filter((d) => pick(d, "Fiscal_year", "") === fy1);
    const closedFY2 = closeddonors.filter((d) => pick(d, "Fiscal_year", "") === fy2);
    const standardFY1 = standarddonors.filter((d) => pick(d, "Fiscal_year", "") === fy1);
    const standardFY2 = standarddonors.filter((d) => pick(d, "Fiscal_year", "") === fy2);

    const closedTotalsA = totalsFor(closedFY1);
    const closedTotalsB = totalsFor(closedFY2);
    const pctChange =
      closedTotalsA.amount > 0
        ? ((closedTotalsB.amount - closedTotalsA.amount) / closedTotalsA.amount) * 100
        : null;

    // "Same period so far" comparison: whatever month it is right now,
    // both fiscal years are only totalled from April up to that month.
    // This rolls forward automatically — no code change needed when the
    // calendar moves from August to September.
    const now = new Date();
    const cutoffIndex = fiscalMonthIndex(now);
    const currentMonthLabel = now.toLocaleString("en-US", { month: "short" });

    const closedFY1YTD = ytdTotals(closedFY1, "Closing_Date", cutoffIndex);
    const closedFY2YTD = ytdTotals(closedFY2, "Closing_Date", cutoffIndex);
    const ytdDiffAmount = closedFY2YTD.amount - closedFY1YTD.amount;
    const ytdPctChange =
      closedFY1YTD.amount > 0
        ? (ytdDiffAmount / closedFY1YTD.amount) * 100
        : closedFY2YTD.amount > 0
        ? 100
        : null;

    // Month-by-month breakdown for the "By Month" table. FY2's months
    // after the current month haven't happened yet, so their difference
    // is meaningless — those rows get diffPct/diffAmount = null and the
    // UI shows "—" (and isn't clickable) instead of a misleading -100%.
    const monthWiseFY1 = monthWiseSummary(closedFY1, "Closing_Date");
    const monthWiseFY2 = monthWiseSummary(closedFY2, "Closing_Date");
    const byMonth = monthWiseFY1.map((m1, i) => {
      const m2 = monthWiseFY2[i];
      const isFuture = i > cutoffIndex;
      let diffPct = null;
      let diffAmount = null;
      if (!isFuture) {
        diffAmount = m2.amount - m1.amount;
        diffPct =
          m1.amount > 0 ? (diffAmount / m1.amount) * 100 : m2.amount > 0 ? 100 : null;
      }
      return {
        name: m1.name,
        amountA: m1.amount,
        donorsA: m1.donors,
        amountB: m2.amount,
        donorsB: m2.donors,
        diffPct,
        diffAmount,
      };
    });

    // Single-month comparison for the 4th card: just this month's number
    // for both years, not cumulative. Reuses byMonth's row at the current
    // fiscal index, so it moves to September automatically next month.
    const currentMonthFY1 = monthWiseFY1[cutoffIndex];
    const currentMonthFY2 = monthWiseFY2[cutoffIndex];
    const monthDiffAmount = currentMonthFY2.amount - currentMonthFY1.amount;
    const monthDiffPct =
      currentMonthFY1.amount > 0
        ? (monthDiffAmount / currentMonthFY1.amount) * 100
        : currentMonthFY2.amount > 0
        ? 100
        : null;

    res.json({
      fy1,
      fy2,
      closed: {
        [fy1]: closedTotalsA,
        [fy2]: closedTotalsB,
        pctChange,
      },
      conversion: {
        fy1Full: closedTotalsA,
        fy1YTD: closedFY1YTD,
        fy2YTD: closedFY2YTD,
        currentMonthLabel,
        ytdRangeLabel: `Apr\u2013${currentMonthLabel}`,
        ytdDiffAmount,
        ytdPctChange,
        currentMonth: {
          name: currentMonthFY1.name,
          fy1Amount: currentMonthFY1.amount,
          fy1Donors: currentMonthFY1.donors,
          fy2Amount: currentMonthFY2.amount,
          fy2Donors: currentMonthFY2.donors,
          diffAmount: monthDiffAmount,
          diffPct: monthDiffPct,
        },
      },
      standardPipeline: {
        [fy1]: totalsFor(standardFY1),
        [fy2]: totalsFor(standardFY2),
      },

      byMonth,

      byType: mergeBreakdowns(
        groupSummary(closedFY1, "Type"),
        groupSummary(closedFY2, "Type")
      ),
      byDonorType: mergeBreakdowns(
        groupSummary(closedFY1, "Type_of_donor"),
        groupSummary(closedFY2, "Type_of_donor")
      ),
      byKAM: mergeBreakdowns(
        groupSummary(closedFY1, "Pipeline_KAM"),
        groupSummary(closedFY2, "Pipeline_KAM")
      ),
      byPlatform: mergeBreakdowns(
        groupSummary(closedFY1, "Platform"),
        groupSummary(closedFY2, "Platform")
      ),
      byStage: mergeBreakdowns(
        groupSummary(closedFY1, "Stage"),
        groupSummary(closedFY2, "Stage")
      ),

      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/fy-comparison/month-donors?fy1=2025-2026&fy2=2026-2027&month=August&types=Cash,Kind
//
// Donor-level drilldown for one month's Difference cell in the By Month
// table. Buckets every donor active around that month into 4 groups:
//   - matching: gave in this month in both fy1 and fy2 (or gave again
//               anywhere else in fy2 — see buildMonthDonorBreakdown)
//   - missing:  gave in this month in fy1, gave nothing anywhere in fy2 (to date)
//   - new:      gave in this month in fy2, and either gave in fy1 in a
//               different month (timing shift) or has no prior history at all
//   - past:     gave in this month in fy2, nothing in fy1 at all, but did
//               give in some earlier fiscal year (a lapsed donor returning)
router.get("/crm-analysis/fy-comparison/month-donors", async (req, res) => {
  const fy1 = req.query.fy1 || "2025-2026";
  const fy2 = req.query.fy2 || "2026-2027";
  const month = req.query.month;

  if (!month) {
    return res.status(400).json({ error: "month query param is required" });
  }

  const filters = {
    types: parseListParam(req.query.types),
    kams: parseListParam(req.query.kams),
    spocs: parseListParam(req.query.spocs),
    platforms: parseListParam(req.query.platforms),
  };

  try {
    const donors = await getPipelines();
    const closeddonors = applyFilters(donors.filter(isClosed), filters);

    const breakdown = buildMonthDonorBreakdown(closeddonors, fy1, fy2, month);

    res.json({
      fy1,
      fy2,
      month,
      ...breakdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/fy-comparison/month-donor-list?fy=2025-2026&month=August&types=&kams=&spocs=&platforms=
// month can also be "ALL" (every donor in that FY — powers the "Full
// Year" ConversionCard) or "YTD" (April through the current real
// calendar month, same cutoff the YTD cards themselves use).
//
// One row per unique donor (not per deal) for the given scope — powers
// the drilldown popup when any Donors count is clicked (By Month table,
// or the Full Year / YTD cards above it). A donor with multiple gifts
// in scope is merged into a single row (amounts summed, Platform/KAM/
// SPOC joined) so the popup's row count always matches the unique-donor
// count shown wherever it was clicked from.
router.get("/crm-analysis/fy-comparison/month-donor-list", async (req, res) => {
  const fy = req.query.fy;
  const month = req.query.month;

  if (!fy || !month) {
    return res.status(400).json({ error: "fy and month query params are required" });
  }

  const filters = {
    types: parseListParam(req.query.types),
    kams: parseListParam(req.query.kams),
    spocs: parseListParam(req.query.spocs),
    platforms: parseListParam(req.query.platforms),
  };

  try {
    const donors = await getPipelines();
    const closeddonors = applyFilters(donors.filter(isClosed), filters);
    const fyDonors = closeddonors.filter((d) => pick(d, "Fiscal_year", "") === fy);

    let donorsInScope;
    if (month === "ALL") {
      donorsInScope = fyDonors;
    } else if (month === "YTD") {
      const cutoffIndex = fiscalMonthIndex(new Date());
      donorsInScope = fyDonors.filter((d) => {
        if (!d.Closing_Date) return false;
        const date = new Date(d.Closing_Date);
        if (isNaN(date)) return false;
        return fiscalMonthIndex(date) <= cutoffIndex;
      });
    } else {
      donorsInScope = fyDonors.filter((d) => monthNameOf(d.Closing_Date) === month);
    }

    // Group by donor so a donor with multiple gifts in scope appears
    // once (matching the unique-donor count shown wherever this was
    // clicked from) instead of once per deal.
    const byDonor = {};
    for (const d of donorsInScope) {
      const key = uniqueDonorKey(d);
      if (!key) continue;
      if (!byDonor[key]) {
        byDonor[key] = {
          account: pick(d, "Account_Name"),
          amount: 0,
          platforms: new Set(),
          kams: new Set(),
          spocs: new Set(),
          types: new Set(),
          donorTypes: new Set(),
        };
      }
      byDonor[key].amount += pickNumber(d, "Amount");
      byDonor[key].platforms.add(pick(d, "Platform"));
      byDonor[key].kams.add(pick(d, "Pipeline_KAM"));
      byDonor[key].spocs.add(pick(d, "Spoc"));
      byDonor[key].types.add(pick(d, "Type"));
      byDonor[key].donorTypes.add(pick(d, "Type_of_donor"));
    }

    const rows = Object.values(byDonor)
      .map((r) => ({
        account: r.account,
        amount: r.amount,
        platform: [...r.platforms].join(" / "),
        kam: [...r.kams].join(" / "),
        spoc: [...r.spocs].join(" / "),
        type: [...r.types].join(" / "),
        donorType: [...r.donorTypes].join(" / "),
      }))
      .sort((a, b) => b.amount - a.amount);

    res.json({
      fy,
      month,
      donors: rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/engagement-status?fy1=2025-2026&fy2=2026-2027
//
// Donor-wise retention view: every donor who gave in fy1, one row per
// (donor, Type) combo, showing whether/what they gave in fy2. See
// buildEngagementComparison in dealHelpers.js for the exact row logic.
router.get("/crm-analysis/engagement-status", async (req, res) => {
  const fy1 = req.query.fy1 || "2025-2026";
  const fy2 = req.query.fy2 || "2026-2027";

  try {
    const donors = await getPipelines();
    const closeddonors = donors.filter(isClosed);
    const standarddonors = donors.filter(isStandardPipeline);
    const rows = buildEngagementComparison(closeddonors, standarddonors, fy1, fy2);

    res.json({
      fy1,
      fy2,
      rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/kam-comparison?kam=NGOs%20%2F%20NPOs&fy1=2025-2026&fy2=2026-2027
// kam can also be "ALL" — aggregates every KAM together instead of
// filtering to one, for the "All KAM" option on Engagement Status.
//
// Type x Platform breakdown for one KAM, for both fiscal years — powers
// the "Comparison of [KAM] for the year [FY]" tables on Engagement
// Status. Returns 3 totals per year:
//   - conversion: full-year closed donors (used as "Total conversion")
//   - ytd:        closed donors from April up to the current fiscal
//                  month (used as fy1's "Apr-<month>" comparison row)
//   - pipeline:   open/Standard Pipeline donors (used as fy2's "Pipeline"
//                  row; Balance-to-achieve is computed client-side from
//                  Target - conversion - pipeline, since Target is a
//                  separately-editable value, not CRM data)
router.get("/crm-analysis/kam-comparison", async (req, res) => {
  const kam = req.query.kam;
  const fy1 = req.query.fy1 || "2025-2026";
  const fy2 = req.query.fy2 || "2026-2027";
  const spoc = req.query.spoc || null;
  const donorType = req.query.donorType || null;

  if (!kam) {
    return res.status(400).json({ error: "kam query param is required" });
  }

  try {
    const donors = await getPipelines();
    const matchesFilters = (d) =>
      (kam === "ALL" || pick(d, "Pipeline_KAM") === kam) &&
      (!spoc || pick(d, "Spoc") === spoc) &&
      (!donorType || pick(d, "Type_of_donor") === donorType);

    const closeddonors = donors.filter(isClosed).filter(matchesFilters);
    const standarddonors = donors.filter(isStandardPipeline).filter(matchesFilters);

    const now = new Date();
    const cutoffIndex = fiscalMonthIndex(now);
    const currentMonthLabel = now.toLocaleString("en-US", { month: "short" });

    function buildYear(fy) {
      const closedFY = closeddonors.filter((d) => pick(d, "Fiscal_year", "") === fy);
      const standardFY = standarddonors.filter((d) => pick(d, "Fiscal_year", "") === fy);
      const ytddonors = closedFY.filter((d) => {
        const raw = d.Closing_Date;
        if (!raw) return false;
        const date = new Date(raw);
        if (isNaN(date)) return false;
        return fiscalMonthIndex(date) <= cutoffIndex;
      });

      return {
        fy,
        conversion: buildTypePlatformBreakdown(closedFY),
        ytd: buildTypePlatformBreakdown(ytddonors),
        pipeline: buildTypePlatformBreakdown(standardFY),
      };
    }

    res.json({
      kam,
      currentMonthLabel,
      fy1: buildYear(fy1),
      fy2: buildYear(fy2),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/targets?kam=...&fy1=...&fy2=...
// kam="ALL" returns the sum of every real KAM's target per type,
// read-only on the client (there's no single target to edit when
// looking at every KAM combined).
router.get("/crm-analysis/targets", (req, res) => {
  const kam = req.query.kam;
  const fy1 = req.query.fy1 || "2025-2026";
  const fy2 = req.query.fy2 || "2026-2027";

  if (!kam) {
    return res.status(400).json({ error: "kam query param is required" });
  }

  try {
    if (kam === "ALL") {
      res.json({
        kam,
        fy1: { fy: fy1, targets: getSummedTargetsFor(fy1, STANDARD_TYPES) },
        fy2: { fy: fy2, targets: getSummedTargetsFor(fy2, STANDARD_TYPES) },
      });
      return;
    }
    res.json({
      kam,
      fy1: { fy: fy1, targets: getTargetsFor(fy1, kam, STANDARD_TYPES) },
      fy2: { fy: fy2, targets: getTargetsFor(fy2, kam, STANDARD_TYPES) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm-analysis/targets  { kam, fy, type, value }
router.put("/crm-analysis/targets", (req, res) => {
  const { kam, fy, type, value } = req.body || {};
  if (!kam || !fy || !type || typeof value !== "number" || Number.isNaN(value)) {
    return res.status(400).json({ error: "kam, fy, type (string) and value (number) are required" });
  }
  if (kam === "ALL") {
    return res.status(400).json({ error: "Can't set a target for the combined \"All KAM\" view — pick a specific KAM." });
  }
  try {
    const saved = setTarget(fy, kam, type, value);
    res.json({ kam, fy, type, value: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;