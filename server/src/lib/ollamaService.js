import ollama from "ollama";

function formatINR(n) {
  return "₹" + (n || 0).toLocaleString("en-IN");
}

// Changed from a semicolon-joined single line to a real bulleted list.
// Small models frequently "collapse" multi-item info packed into one
// paragraph line and only answer with one item — a line-per-item list
// is far more reliable for them to enumerate completely.
function fmtGroup(rows) {
  if (!rows || rows.length === 0) return "  (none)";
  return rows.map((r) => `  - ${r.name}: ${formatINR(r.amount)} (${r.donors} donors)`).join("\n");
}

function fmtCountObj(obj) {
  const entries = Object.entries(obj || {});
  if (entries.length === 0) return "  (none)";
  return entries.map(([k, v]) => `  - ${k}: ${v}`).join("\n");
}

export async function askOllama(message, crmContext) {
  const contextBlock = crmContext
    ? `
Live CRM data snapshot from Zoho Bigin (as of ${crmContext.generatedAt}). These figures match the CRM Analysis dashboard exactly — use ONLY these numbers, never invent or estimate.

COUNTS:
- Total deal records: ${crmContext.counts.totalDeals}
- Closed deals: ${crmContext.counts.closedDealsCount}
- Standard Pipeline (open) deals: ${crmContext.counts.standardPipelineCount}
- Total accounts: ${crmContext.counts.totalAccounts}
- Total contacts: ${crmContext.counts.totalContacts}
- Total tasks: ${crmContext.counts.totalTasks} (open: ${crmContext.counts.openTasks})
- Total calls logged: ${crmContext.counts.totalCalls}
- Total events/meetings: ${crmContext.counts.totalEvents}

CONVERSION (closed/won deals):
- All-time total conversion: ${formatINR(crmContext.conversion.allTime.amount)}, ${crmContext.conversion.allTime.donors} donors, ${crmContext.conversion.allTime.count} deals
- Current FY (${crmContext.conversion.currentFYLabel}) conversion: ${formatINR(crmContext.conversion.currentFY.amount)}, ${crmContext.conversion.currentFY.donors} donors

PIPELINE (open/Standard Pipeline deals):
- All open pipeline: ${formatINR(crmContext.pipeline.allOpen.amount)}, ${crmContext.pipeline.allOpen.donors} donors
- FY 2026-2027 approved pipeline: ${formatINR(crmContext.pipeline.fy2027Approved.amount)}, ${crmContext.pipeline.fy2027Approved.donors} donors

BREAKDOWN — By fiscal year (${crmContext.byFiscalYear?.length || 0} items — list ALL of them, never just one):
${fmtGroup(crmContext.byFiscalYear)}

BREAKDOWN — By type (${crmContext.byType?.length || 0} items — list ALL of them, never just one):
${fmtGroup(crmContext.byType)}

BREAKDOWN — By donor type (${crmContext.byDonorType?.length || 0} items — list ALL of them, never just one):
${fmtGroup(crmContext.byDonorType)}

BREAKDOWN — By KAM (${crmContext.byKAM?.length || 0} items — list ALL of them, never just one):
${fmtGroup(crmContext.byKAM)}

BREAKDOWN — By platform (${crmContext.byPlatform?.length || 0} items — list ALL of them, never just one):
${fmtGroup(crmContext.byPlatform)}

OTHER:
Deals by stage:
${fmtCountObj(crmContext.byStage)}

Tasks by status:
${fmtCountObj(crmContext.tasksByStatus)}

Accounts by industry (top 10):
${fmtCountObj(crmContext.accountsByIndustry)}
`
    : "No CRM data snapshot is currently available. Tell the user you couldn't retrieve live data right now instead of guessing.";

  const response = await ollama.chat({
    model: "llama3.2",
    // keep_alive stops Ollama from unloading the model between messages —
    // without this, every message pays a full model-load cost, which is
    // most of your "very slow" complaint.
    keep_alive: "30m",
    options: {
      // temperature 0 makes the model deterministic and less likely to
      // improvise/drop items instead of following the data literally.
      temperature: 0,
    },
    messages: [
      {
        role: "system",
        content: `You are Bigin AI Assistant, helping users understand their Zoho Bigin CRM data.
Answer using ONLY the data snapshot below — it is pulled fresh from the same source as the CRM Analysis dashboard, so the numbers should match exactly what the user sees there.
Never invent numbers or names not present in it. "Conversion" means closed/won deals; "Pipeline" means open/Standard Pipeline deals — these are NOT based on the raw "Stage" field.
CRITICAL RULE: whenever the user asks for a breakdown "by type", "by KAM", "by platform", "by donor type", or "by fiscal year", you MUST list every single item shown in that breakdown section below — never stop after just one item, even if there are only 2-3 items total. Count them before answering.
If asked about something not in this snapshot (a specific donor, a specific deal), say so honestly rather than guessing.
Always state currency values in ₹ using Indian numbering (e.g. ₹12,48,05,78,743) or in Cr/L shorthand when the number given to you is already in that form.
Be clear and concise.
${contextBlock}`,
      },
      { role: "user", content: message },
    ],
  });

  return response.message.content;
}