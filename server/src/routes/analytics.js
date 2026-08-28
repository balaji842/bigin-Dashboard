import { Router } from "express";
import { fetchAllRecords } from "../zohoClient.js";

const router = Router();

function groupCount(records, field, fallback = "Unspecified") {
  const out = {};
  for (const r of records) {
    const raw = r[field];
    const key =
      raw && typeof raw === "object" ? raw.name || fallback : raw || fallback;
    out[key] = (out[key] || 0) + 1;
  }
  return Object.entries(out)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function sumByGroup(records, groupField, valueField, fallback = "Unspecified") {
  const out = {};
  for (const r of records) {
    const raw = r[groupField];
    const key =
      raw && typeof raw === "object" ? raw.name || fallback : raw || fallback;
    const val = Number(r[valueField]) || 0;
    out[key] = (out[key] || 0) + val;
  }
  return Object.entries(out)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// GET /api/analytics/summary -> one call that powers the Overview tab
router.get("/analytics/summary", async (_req, res) => {
  try {
    const [deals, accounts, contacts, tasks, calls, meetings] =
      await Promise.all([
        fetchAllRecords("Pipelines"),
        fetchAllRecords("Accounts"),
        fetchAllRecords("Contacts"),
        fetchAllRecords("Tasks"),
        fetchAllRecords("Calls"),
        fetchAllRecords("Events"),
      ]);

    const openDeals = deals.filter(
      (d) => !["Won", "Lost", "Closed Won", "Closed Lost"].includes(d.Stage)
    );
    const wonDeals = deals.filter((d) => /won/i.test(d.Stage || ""));
    const lostDeals = deals.filter((d) => /lost/i.test(d.Stage || ""));

    const totalPipelineValue = openDeals.reduce(
      (sum, d) => sum + (Number(d.Amount) || 0),
      0
    );
    const totalWonValue = wonDeals.reduce(
      (sum, d) => sum + (Number(d.Amount) || 0),
      0
    );

    res.json({
      counts: {
        deals: deals.length,
        accounts: accounts.length,
        contacts: contacts.length,
        tasks: tasks.length,
        calls: calls.length,
        meetings: meetings.length,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
      },
      value: {
        totalPipelineValue,
        totalWonValue,
      },
      charts: {
        dealsByStage: groupCount(deals, "Stage"),
        dealsByPipeline: groupCount(deals, "Sub_Pipeline"),
        dealValueByStage: sumByGroup(deals, "Stage", "Amount"),
        accountsByIndustry: groupCount(accounts, "Industry"),
        tasksByStatus: groupCount(tasks, "Status"),
        activitiesByType: [
          { name: "Tasks", value: tasks.length },
          { name: "Calls", value: calls.length },
          { name: "Meetings", value: meetings.length },
        ],
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;