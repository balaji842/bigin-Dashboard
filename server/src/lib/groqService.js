import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function formatINR(n) {
  return "₹" + (n || 0).toLocaleString("en-IN");
}

function fmtGroup(rows) {
  return rows.map((r) => `${r.name}: ${formatINR(r.amount)} (${r.donors} donors)`).join("; ");
}

export async function askGroq(message, crmContext, donorMatch) {
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

BREAKDOWNS (of closed/converted deals, top 10 by amount):
- By fiscal year: ${fmtGroup(crmContext.byFiscalYear)}
- By type: ${fmtGroup(crmContext.byType)}
- By donor type: ${fmtGroup(crmContext.byDonorType)}
- By KAM: ${fmtGroup(crmContext.byKAM)}
- By platform: ${fmtGroup(crmContext.byPlatform)}

OTHER:
- Deals by stage (raw counts): ${JSON.stringify(crmContext.byStage)}
- Tasks by status: ${JSON.stringify(crmContext.tasksByStatus)}
- Accounts by industry (top 10): ${JSON.stringify(crmContext.accountsByIndustry)}
`
    : "No CRM data snapshot is currently available. Tell the user you couldn't retrieve live data right now instead of guessing.";

  const donorBlock = donorMatch
    ? `
DONOR MATCH FOUND for this question — use these exact figures, do not use the aggregate totals above for this donor:
- Account: ${donorMatch.accountName}
- Total amount across all their deals: ${formatINR(donorMatch.totalAmount)}
- Number of deals: ${donorMatch.dealCount}
- By fiscal year: ${JSON.stringify(donorMatch.byFiscalYear)}
- Types: ${donorMatch.types.join(", ")}
`
    : `No specific donor/account name was matched for this question. If the user is asking about a named donor, tell them honestly that donor wasn't found in the current data rather than guessing a number.`;

const response = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b", // was: "llama-3.3-70b-versatile"
  temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are Bigin AI Assistant, helping users understand their Zoho Bigin CRM data.
Answer using ONLY the data snapshot below — it is pulled fresh from the same source as the CRM Analysis dashboard, so the numbers should match exactly what the user sees there.
Never invent numbers or names not present in it. "Conversion" means closed/won deals; "Pipeline" means open/Standard Pipeline deals — these are NOT based on the raw "Stage" field.
CRITICAL RULE: whenever the user asks for a breakdown "by type", "by KAM", "by platform", "by donor type", or "by fiscal year", you MUST list every single item shown in that breakdown section.
If asked about something not in this snapshot, say so honestly rather than guessing.
Always state currency values in ₹ using Indian numbering (e.g. ₹12,48,05,78,743) or in Cr/L shorthand when the number given to you is already in that form.
Be clear and concise.
${contextBlock}
${donorBlock}`,
      },
      { role: "user", content: message },
    ],
  });

  return response.choices[0].message.content;
}