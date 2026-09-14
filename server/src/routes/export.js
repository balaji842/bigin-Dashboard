import express from "express";
import ExcelJS from "exceljs";
import { getRawDeals } from "../lib/crmContext.js";
import {
  pick,
  pickNumber,
  isClosed,
  isStandardPipeline,
  buildEngagementComparison,
  donorsByYearFilter,
} from "../lib/dealHelpers.js";

const router = express.Router();

const DEAL_COLUMNS = [
  { header: "Deal Name", key: "dealName", width: 30 },
  { header: "Account Name", key: "account", width: 30 },
  { header: "Amount", key: "amount", width: 15 },
  { header: "Status", key: "status", width: 10 },
  { header: "Stage", key: "stage", width: 18 },
  { header: "Fiscal Year", key: "fy", width: 14 },
  { header: "Closing Date", key: "closingDate", width: 14 },
  { header: "Type", key: "type", width: 18 },
  { header: "Donor Type", key: "donorType", width: 14 },
  { header: "Platform", key: "platform", width: 10 },
  { header: "KAM", key: "kam", width: 20 },
  { header: "SPOC", key: "spoc", width: 18 },
  { header: "District", key: "district", width: 16 },
];

function dealToRow(d) {
  return {
    dealName: pick(d, "Deal_Name", ""),
    account: pick(d, "Account_Name", ""),
    amount: pickNumber(d, "Amount"),
    status: isStandardPipeline(d) ? "Open" : "Closed",
    stage: pick(d, "Stage", ""),
    fy: pick(d, "Fiscal_year", ""),
    closingDate: d.Closing_Date ? new Date(d.Closing_Date).toLocaleDateString("en-IN") : "",
    type: pick(d, "Type", ""),
    donorType: pick(d, "Type_of_donor", ""),
    platform: pick(d, "Platform", ""),
    kam: pick(d, "Pipeline_KAM", ""),
    spoc: pick(d, "Spoc", ""),
    district: pick(d, "District", ""),
  };
}

function filterByScope(deals, scope) {
  if (scope === "closed") return deals.filter(isClosed);
  if (scope === "pipeline") return deals.filter(isStandardPipeline);
  return deals;
}

function toCsvValue(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res, filenameBase, columns, rows) {
  const header = columns.map((c) => c.header).join(",");
  const lines = rows.map((r) => columns.map((c) => toCsvValue(r[c.key])).join(","));
  const csv = [header, ...lines].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
  res.send(csv);
}

async function sendXlsx(res, filenameBase, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + columns.length)}1` };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

// General deal export — all/closed/pipeline deals as a flat list.
router.get("/export/deals", async (req, res) => {
  try {
    const format = (req.query.format || "xlsx").toLowerCase();
    const scope = (req.query.scope || "all").toLowerCase();

    const rawDeals = await getRawDeals();
    const deals = filterByScope(rawDeals, scope);
    const rows = deals.map(dealToRow);
    const filenameBase = `nsnop-deals-${scope}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") return sendCsv(res, filenameBase, DEAL_COLUMNS, rows);
    await sendXlsx(res, filenameBase, "Deals", DEAL_COLUMNS, rows);
  } catch (error) {
    console.error("[export] deals failed:", error);
    res.status(500).json({ success: false, error: "Export failed" });
  }
});

const LAPSED_COLUMNS = [
  { header: "Donor Name", key: "account", width: 32 },
  { header: "Prior FY Amount", key: "fy1Amount", width: 18 },
  { header: "Prior FY Type", key: "fy1Type", width: 16 },
  { header: "Prior FY Month", key: "fy1Month", width: 14 },
  { header: "Donor Type", key: "donorType", width: 14 },
  { header: "Platform", key: "platform", width: 10 },
  { header: "KAM", key: "kam", width: 20 },
  { header: "SPOC", key: "spoc", width: 18 },
];

// Fixed two-year "gave in fy1, didn't give in fy2" — same definition as
// the Engagement Status page. Kept as a quick default for the common case.
router.get("/export/lapsed-donors", async (req, res) => {
  try {
    const format = (req.query.format || "xlsx").toLowerCase();
    const fy1 = req.query.fy1 || "2025-2026";
    const fy2 = req.query.fy2 || "2026-2027";

    const rawDeals = await getRawDeals();
    const closedDeals = rawDeals.filter(isClosed);
    const standardDeals = rawDeals.filter(isStandardPipeline);

    const rows = buildEngagementComparison(closedDeals, standardDeals, fy1, fy2)
      .filter((r) => !r.engaged && r.fy1Amount != null)
      .sort((a, b) => (b.fy1Amount || 0) - (a.fy1Amount || 0));

    const filenameBase = `nsnop-lapsed-donors-${fy1}-to-${fy2}-${new Date()
      .toISOString()
      .slice(0, 10)}`;

    if (format === "csv") return sendCsv(res, filenameBase, LAPSED_COLUMNS, rows);
    await sendXlsx(res, filenameBase, "Lapsed Donors", LAPSED_COLUMNS, rows);
  } catch (error) {
    console.error("[export] lapsed-donors failed:", error);
    res.status(500).json({ success: false, error: "Export failed" });
  }
});

// Arbitrary "gave in these FYs AND not in these FYs" — the general case,
// e.g. include=2022-2023,2023-2024,2024-2025,2026-2027&exclude=2025-2026
router.get("/export/donor-filter", async (req, res) => {
  try {
    const format = (req.query.format || "xlsx").toLowerCase();
    const include = (req.query.include || "").split(",").map((s) => s.trim()).filter(Boolean);
    const exclude = (req.query.exclude || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (include.length === 0) {
      return res.status(400).json({ success: false, error: "At least one fiscal year to include is required" });
    }

    const rawDeals = await getRawDeals();
    const closedDeals = rawDeals.filter(isClosed);
    const rows = donorsByYearFilter(closedDeals, { includeFYs: include, excludeFYs: exclude });

    const columns = [
      { header: "Donor Name", key: "account", width: 32 },
      ...include.map((fy) => ({ header: `FY ${fy} Amount`, key: `amount_${fy}`, width: 18 })),
      { header: "Total Amount", key: "totalAmount", width: 18 },
    ];

    const filenameBase = `nsnop-donor-filter-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") return sendCsv(res, filenameBase, columns, rows);
    await sendXlsx(res, filenameBase, "Donor Filter", columns, rows);
  } catch (error) {
    console.error("[export] donor-filter failed:", error);
    res.status(500).json({ success: false, error: "Export failed" });
  }
});

export default router;