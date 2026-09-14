import { fetchAllRecords } from "../zohoClient.js";
import {
  pick,
  isClosed,
  isStandardPipeline,
  isApprovedByRajesh,
  totalsFor,
  groupSummary,
  crossTabByFiscalYear,
  monthWiseSummary,
} from "./dealHelpers.js";

// Re-fetching thousands of records from Zoho on every chat message would be
// slow, so cache the full snapshot for a couple of minutes.
let cachedContext = null;
let cachedAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Fiscal year runs April -> March. Computed from today's date so this
// never goes stale the way a hardcoded "2025-2026" string previously did.
function fiscalYearLabel(date) {
  const month = date.getMonth(); // Jan = 0
  const year = date.getFullYear();
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function priorFiscalYearLabel(label) {
  const [a, b] = label.split("-").map(Number);
  return `${a - 1}-${b - 1}`;
}

function fieldValue(record, field, fallback = "Unspecified") {
  const raw = record[field];
  if (raw && typeof raw === "object") return raw.name || fallback;
  return raw || fallback;
}

function groupCount(records, field) {
  const out = {};
  for (const r of records) {
    const key = fieldValue(r, field);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function topN(rows, n = 10) {
  // rows come from groupSummary(): [{ name, amount, donors }, ...], already sorted desc
  return rows.slice(0, n);
}

export async function getCRMContext({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext;
  }

  const today = new Date();
  const CURRENT_FY = fiscalYearLabel(today);
  const PRIOR_FY = priorFiscalYearLabel(CURRENT_FY);
  const currentMonthName = today.toLocaleString("en-US", { month: "long" });

  const [deals, accounts, contacts, tasks, calls, events] = await Promise.all([
    fetchAllRecords("Pipelines"),
    fetchAllRecords("Accounts"),
    fetchAllRecords("Contacts"),
    fetchAllRecords("Tasks"),
    fetchAllRecords("Calls"),
    fetchAllRecords("Events"),
  ]);

  // Same split your CRM Analysis dashboard uses: Sub_Pipeline determines
  // closed vs open, NOT the Stage field's text.
  const closedDeals = deals.filter(isClosed);
  const standardDeals = deals.filter(isStandardPipeline);
  const closedCurrentFY = closedDeals.filter((d) => pick(d, "Fiscal_year", "") === CURRENT_FY);
  const closedPriorFY = closedDeals.filter((d) => pick(d, "Fiscal_year", "") === PRIOR_FY);
  const pipelineCurrentFYApproved = standardDeals.filter(
    (d) => pick(d, "Fiscal_year", "") === CURRENT_FY && isApprovedByRajesh(d)
  );
  const pipelineCurrentFYApprovedThisMonth = pipelineCurrentFYApproved.filter(
    (d) => pick(d, "Expected_Conversion_Month", "") === currentMonthName
  );

  const openTasks = tasks.filter((t) => t.Status && !/complete|closed/i.test(t.Status));

  cachedContext = {
    generatedAt: today.toISOString(),
    currentFYLabel: CURRENT_FY,
    priorFYLabel: PRIOR_FY,
    currentMonthName,

    counts: {
      totalDeals: deals.length,
      closedDealsCount: closedDeals.length,
      standardPipelineCount: standardDeals.length,
      totalAccounts: accounts.length,
      totalContacts: contacts.length,
      totalTasks: tasks.length,
      openTasks: openTasks.length,
      totalCalls: calls.length,
      totalEvents: events.length,
    },

    // These match the actual numbers shown on the CRM Analysis > Overview page.
    conversion: {
      allTime: totalsFor(closedDeals),       // e.g. ₹1143.70 Cr, 2726 donors
      currentFY: totalsFor(closedCurrentFY),
      currentFYLabel: CURRENT_FY,
      priorFY: totalsFor(closedPriorFY),
      priorFYLabel: PRIOR_FY,
    },
    pipeline: {
      allOpen: totalsFor(standardDeals),
      currentFYApproved: totalsFor(pipelineCurrentFYApproved),
    },

    byFiscalYear: groupSummary(closedDeals, "Fiscal_year").filter((r) => r.name !== "Unspecified"),
    byType: topN(groupSummary(closedDeals, "Type")),
    byDonorType: topN(groupSummary(closedDeals, "Type_of_donor")),
    byKAM: topN(groupSummary(closedDeals, "Pipeline_KAM")),
    byPlatform: topN(groupSummary(closedDeals, "Platform")),
    byStage: groupCount(deals, "Stage"),

    // Same four breakdowns as above, but cross-tabbed by fiscal year —
    // lets the AI answer "X split by financial year" or "X for FY <current>
    // only" questions instead of only all-time totals.
    byTypeByFY: crossTabByFiscalYear(closedDeals, "Type"),
    byDonorTypeByFY: crossTabByFiscalYear(closedDeals, "Type_of_donor"),
    byKAMByFY: crossTabByFiscalYear(closedDeals, "Pipeline_KAM"),
    byPlatformByFY: crossTabByFiscalYear(closedDeals, "Platform"),

    // Month-wise conversion for the current and prior fiscal years —
    // matches the "Month-wise" table on the Overview/Conversion pages.
    // Always all 12 months April->March, zero-filled.
    monthWiseByFY: {
      [CURRENT_FY]: monthWiseSummary(closedCurrentFY, "Closing_Date"),
      [PRIOR_FY]: monthWiseSummary(closedPriorFY, "Closing_Date"),
    },

    // Pipeline breakdowns, scoped to the CURRENT fiscal year's approved
    // deals only.
    pipelineCurrentFYApproved: {
      fyLabel: CURRENT_FY,
      totals: totalsFor(pipelineCurrentFYApproved),
      byType: groupSummary(pipelineCurrentFYApproved, "Type"),
      byDonorType: groupSummary(pipelineCurrentFYApproved, "Type_of_donor"),
      byPlatform: groupSummary(pipelineCurrentFYApproved, "Platform"),
      byKAM: groupSummary(pipelineCurrentFYApproved, "Pipeline_KAM"),
      currentMonth: {
        monthLabel: currentMonthName,
        totals: totalsFor(pipelineCurrentFYApprovedThisMonth),
        byType: groupSummary(pipelineCurrentFYApprovedThisMonth, "Type"),
        byDonorType: groupSummary(pipelineCurrentFYApprovedThisMonth, "Type_of_donor"),
        byPlatform: groupSummary(pipelineCurrentFYApprovedThisMonth, "Platform"),
        byKAM: groupSummary(pipelineCurrentFYApprovedThisMonth, "Pipeline_KAM"),
      },
    },

    tasksByStatus: groupCount(tasks, "Status"),
    accountsByIndustry: topNObj(groupCount(accounts, "Industry")),
  };
  cachedAt = now;

  return cachedContext;
}

// Raw deal records (Pipelines module), used by the AI chat route to run
// donor-specific lookups (see donorSearch.js) alongside the aggregated
// snapshot above. Relies on zohoClient's own caching/pagination — no
// separate cache needed here.
export async function getRawDeals() {
  return fetchAllRecords("Pipelines");
}

function topNObj(obj, n = 10) {
  // obj comes from groupCount(): { name: count, ... } — sort and slice as an object
  return Object.fromEntries(
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
  );
}