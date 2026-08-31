import { Router } from "express";
import { fetchAllRecords } from "../zohoClient.js";
import {
  pick,
  isStandardPipeline,
  isClosed,
  groupSummary,
  monthWiseSummary,
  monthWiseFromPicklist,
  mergeBreakdowns,
  totalsFor,
  fiscalMonthIndex,
  ytdTotals,
} from "../lib/dealHelpers.js";


const router = Router();

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

  // Optional Type filter — comma-separated list, e.g. "Cash,Kind".
  // When present, every card/table downstream is computed only from
  // deals matching one of these Types. No param = no filter (all types).
  const typesParam = req.query.types;
  const selectedTypes = typesParam
    ? typesParam.split(",").map((t) => t.trim()).filter(Boolean)
    : null;

  try {
    const deals = await fetchAllRecords("Pipelines");
    let closedDeals = deals.filter(isClosed);
    let standardDeals = deals.filter(isStandardPipeline);

    if (selectedTypes && selectedTypes.length > 0) {
      closedDeals = closedDeals.filter((d) => selectedTypes.includes(pick(d, "Type")));
      standardDeals = standardDeals.filter((d) => selectedTypes.includes(pick(d, "Type")));
    }

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
    // Rolls forward automatically — no code change needed month to month.
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

    // Month-by-month breakdown for the table that replaces "By Stage"
    // and the Standard Pipeline card. FY2's months after the current
    // month haven't happened yet, so their "difference" is meaningless —
    // those rows get diffPct/diffAmount = null and the UI shows "—".
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

export default router;