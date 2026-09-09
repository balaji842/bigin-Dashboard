import { fetchAllRecords } from "../zohoClient.js";
import {
  pick,
  isClosed,
  isStandardPipeline,
  isApprovedByRajesh,
  totalsFor,
  groupSummary,
} from "./dealHelpers.js";

// Re-fetching thousands of records from Zoho on every chat message would be
// slow, so cache the full snapshot for a couple of minutes.
let cachedContext = null;
let cachedAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const CURRENT_FY = "2025-2026"; // matches the default used across crmAnalysis.js

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
  const closedThisFY = closedDeals.filter((d) => pick(d, "Fiscal_year", "") === CURRENT_FY);
  const pipeline2027Approved = standardDeals.filter(
    (d) => pick(d, "Fiscal_year", "") === "2026-2027" && isApprovedByRajesh(d)
  );

  const openTasks = tasks.filter((t) => t.Status && !/complete|closed/i.test(t.Status));

  cachedContext = {
    generatedAt: new Date().toISOString(),

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
      currentFY: totalsFor(closedThisFY),
      currentFYLabel: CURRENT_FY,
    },
    pipeline: {
      allOpen: totalsFor(standardDeals),
      fy2027Approved: totalsFor(pipeline2027Approved), // e.g. ₹87.25 Cr, 66 donors
    },

    byFiscalYear: groupSummary(closedDeals, "Fiscal_year").filter((r) => r.name !== "Unspecified"),
    byType: topN(groupSummary(closedDeals, "Type")),
    byDonorType: topN(groupSummary(closedDeals, "Type_of_donor")),
    byKAM: topN(groupSummary(closedDeals, "Pipeline_KAM")),
    byPlatform: topN(groupSummary(closedDeals, "Platform")),
    byStage: groupCount(deals, "Stage"),

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