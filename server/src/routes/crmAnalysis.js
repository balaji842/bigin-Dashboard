import { Router } from "express";
import { fetchAllRecords } from "../zohoClient.js";
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
} from "../lib/dealHelpers.js";


// Parses a comma-separated query param into a trimmed array, or null if
// the param wasn't supplied at all (meaning "no filter, include everything").
function parseListParam(raw) {
  return raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : null;
}

// Applies the Type/KAM/SPOC/Platform multi-select filters (any of which
// may be null = not filtering on that field) to a list of deals.
function applyFilters(deals, { types, kams, spocs, platforms }) {
  let out = deals;
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
// Kept as its own lightweight call so the filter lists stay complete even
// while the person has other filters narrowed down elsewhere in the UI.
router.get("/crm-analysis/filter-options", async (_req, res) => {
  try {
    const deals = await fetchAllRecords("Pipelines");
    const distinct = (field) =>
      [...new Set(deals.map((d) => pick(d, field)))].sort((a, b) => a.localeCompare(b));

        res.json({
      types: distinct("Type").filter((v) => v !== "Unspecified"),
      kams: distinct("Pipeline_KAM"),
      spocs: distinct("Spoc"),
      platforms: distinct("Platform"),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/overview?fy=2025-2026
router.get("/crm-analysis/overview", async (req, res) => {
  const currentFY = req.query.fy || "2025-2026";

  try {
    const deals = await fetchAllRecords("Pipelines");

    const closedDeals = deals.filter(isClosed);
    const standardDeals = deals.filter(isStandardPipeline);
    const closedThisFY = closedDeals.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY
    );

    res.json({
      fy: currentFY,
      closed: {
        allTime: totalsFor(closedDeals),
        thisFY: totalsFor(closedThisFY),
      },
      standardPipeline: totalsFor(standardDeals),

      monthWise: monthWiseSummary(closedThisFY, "Closing_Date"),

      byType: groupSummary(closedThisFY, "Type"),
      byDonorType: groupSummary(closedThisFY, "Type_of_donor"),
      byKAM: groupSummary(closedThisFY, "Pipeline_KAM"),
      byPlatform: groupSummary(closedThisFY, "Platform"),

      // Raw rows for the filterable table at the bottom of the module.
      // Kept lean — just what the table needs to display + filter on.
      table: deals.map((d) => ({
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
        approved: pick(d, "Approved_by_Rajesh"),
      })),

      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/crm-analysis/closed-deals?fy=2025-2026
router.get("/crm-analysis/closed-deals", async (req, res) => {
  const currentFY = req.query.fy || "2025-2026";

  try {
    const deals = await fetchAllRecords("Pipelines");
    const closedDeals = deals.filter(isClosed);
    const closedThisFY = closedDeals.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY
    );

    // Every FY present in the closed data, for the dropdown — so the
    // list stays accurate as new fiscal years get added in Bigin.
    const availableFYs = [
      ...new Set(closedDeals.map((d) => pick(d, "Fiscal_year", "Unspecified"))),
    ].sort();

    res.json({
      fy: currentFY,
      availableFYs,
      totals: totalsFor(closedThisFY),
      allTimeTotals: totalsFor(closedDeals),

      monthWise: monthWiseSummary(closedThisFY, "Closing_Date"),

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

// GET /api/crm-analysis/standard-pipeline?fy=2025-2026
router.get("/crm-analysis/standard-pipeline", async (req, res) => {
  const currentFY = req.query.fy || "2025-2026";

  try {
    const deals = await fetchAllRecords("Pipelines");
    const standardDeals = deals.filter(isStandardPipeline);
    const standardThisFY = standardDeals.filter(
      (d) => pick(d, "Fiscal_year", "") === currentFY
    );

    const availableFYs = [
      ...new Set(standardDeals.map((d) => pick(d, "Fiscal_year", "Unspecified"))),
    ].sort();

    res.json({
      fy: currentFY,
      availableFYs,
      totals: totalsFor(standardThisFY),
      allTimeTotals: totalsFor(standardDeals),

      // Projected conversion month, not actual — these deals haven't
      // closed yet.
      monthWise: monthWiseFromPicklist(standardThisFY, "Expected_Conversion_Month"),

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
  // downstream is computed only from deals matching all supplied filters.
  const filters = {
    types: parseListParam(req.query.types),
    kams: parseListParam(req.query.kams),
    spocs: parseListParam(req.query.spocs),
    platforms: parseListParam(req.query.platforms),
  };

  try {
    const deals = await fetchAllRecords("Pipelines");
    const closedDeals = applyFilters(deals.filter(isClosed), filters);
    const standardDeals = applyFilters(deals.filter(isStandardPipeline), filters);

    const closedFY1 = closedDeals.filter((d) => pick(d, "Fiscal_year", "") === fy1);
    const closedFY2 = closedDeals.filter((d) => pick(d, "Fiscal_year", "") === fy2);
    const standardFY1 = standardDeals.filter((d) => pick(d, "Fiscal_year", "") === fy1);
    const standardFY2 = standardDeals.filter((d) => pick(d, "Fiscal_year", "") === fy2);

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
//   - matching: gave in this month in both fy1 and fy2
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
    const deals = await fetchAllRecords("Pipelines");
    const closedDeals = applyFilters(deals.filter(isClosed), filters);

    const breakdown = buildMonthDonorBreakdown(closedDeals, fy1, fy2, month);

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
//
// Raw deal-level rows (one row per closed deal, not aggregated per
// donor) for one fiscal year + month — powers the drilldown popup when
// a Donors count cell is clicked in the By Month table.
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
    const deals = await fetchAllRecords("Pipelines");
    const closedDeals = applyFilters(deals.filter(isClosed), filters);

    const dealsThisMonth = closedDeals.filter(
      (d) => pick(d, "Fiscal_year", "") === fy && monthNameOf(d.Closing_Date) === month
    );

    // Group by donor so a donor with multiple gifts this month appears
    // once (matching the unique-donor count shown in the By Month table)
    // instead of once per deal.
    const byDonor = {};
    for (const d of dealsThisMonth) {
      const key = uniqueDonorKey(d);
      if (!key) continue;
      if (!byDonor[key]) {
        byDonor[key] = {
          account: pick(d, "Account_Name"),
          amount: 0,
          platforms: new Set(),
          kams: new Set(),
          spocs: new Set(),
        };
      }
      byDonor[key].amount += pickNumber(d, "Amount");
      byDonor[key].platforms.add(pick(d, "Platform"));
      byDonor[key].kams.add(pick(d, "Pipeline_KAM"));
      byDonor[key].spocs.add(pick(d, "Spoc"));
    }

    const rows = Object.values(byDonor)
      .map((r) => ({
        account: r.account,
        amount: r.amount,
        platform: [...r.platforms].join(" / "),
        kam: [...r.kams].join(" / "),
        spoc: [...r.spocs].join(" / "),
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
    const deals = await fetchAllRecords("Pipelines");
    const closedDeals = deals.filter(isClosed);
    const rows = buildEngagementComparison(closedDeals, fy1, fy2);

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
export default router;