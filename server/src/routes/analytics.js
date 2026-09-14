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
    const [donors, accounts, contacts, tasks, calls, meetings] =
      await Promise.all([
        fetchAllRecords("Pipelines"),
        fetchAllRecords("Accounts"),
        fetchAllRecords("Contacts"),
        fetchAllRecords("Tasks"),
        fetchAllRecords("Calls"),
        fetchAllRecords("Events"),
      ]);

    const opendonors = donors.filter(
      (d) => !["Won", "Lost", "Closed Won", "Closed Lost"].includes(d.Stage)
    );
    const wondonors = donors.filter((d) => /won/i.test(d.Stage || ""));
    const lostdonors = donors.filter((d) => /lost/i.test(d.Stage || ""));

    const totalPipelineValue = opendonors.reduce(
      (sum, d) => sum + (Number(d.Amount) || 0),
      0
    );
    const totalWonValue = wondonors.reduce(
      (sum, d) => sum + (Number(d.Amount) || 0),
      0
    );

    res.json({
      counts: {
        donors: donors.length,
        accounts: accounts.length,
        contacts: contacts.length,
        tasks: tasks.length,
        calls: calls.length,
        meetings: meetings.length,
        opendonors: opendonors.length,
        wondonors: wondonors.length,
        lostdonors: lostdonors.length,
      },
      value: {
        totalPipelineValue,
        totalWonValue,
      },
      charts: {
        donorsByStage: groupCount(donors, "Stage"),
        donorsByPipeline: groupCount(donors, "Sub_Pipeline"),
        dealValueByStage: sumByGroup(donors, "Stage", "Amount"),
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