function formatINR(n) {
  return "₹" + (n || 0).toLocaleString("en-IN");
}

function fmtGroup(rows) {
  return rows.map((r) => `${r.name}: ${formatINR(r.amount)} (${r.donors} donors)`).join("; ");
}

// Capped to the current + prior fiscal year (not every year since 2022)
// and to the top 12 rows per year — the full multi-year, uncapped
// version was the main reason prompts were blowing past Groq's 8,000
// token/minute limit. Current+prior covers what's actually asked for
// in practice; older years are still available via the flat
// "BREAKDOWNS" (all-time) section above.
function fmtByFY(byFY, allowedYears) {
  return Object.entries(byFY)
    .filter(([fy]) => !allowedYears || allowedYears.includes(fy))
    .map(([fy, rows]) => `FY ${fy} -> ${fmtGroup(rows.slice(0, 12))}`)
    .join(" | ");
}

function fmtMonthWise(rows) {
  return (
    rows
      .filter((r) => r.amount > 0)
      .map((r) => `${r.name}: ${formatINR(r.amount)} (${r.donors} donors)`)
      .join("; ") || "no closed deals recorded yet"
  );
}

export function buildSystemPrompt(crmContext, donorMatch) {
  const relevantFYs = crmContext ? [crmContext.currentFYLabel, crmContext.priorFYLabel] : [];

  const contextBlock = crmContext
    ? `
Live CRM data snapshot from Zoho Bigin (as of ${crmContext.generatedAt}). These figures match the CRM Analysis dashboard exactly — use ONLY these numbers, never invent or estimate.

TODAY: the current fiscal year is FY ${crmContext.currentFYLabel} (prior FY: ${crmContext.priorFYLabel}), and the current calendar month is ${crmContext.currentMonthName}. When the user says "current FY" or "this year", they mean FY ${crmContext.currentFYLabel}. When they say "current month" or "this month", they mean ${crmContext.currentMonthName} — look that month up in the relevant month-wise section below rather than saying the data isn't available.

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
- Prior FY (${crmContext.conversion.priorFYLabel}) conversion: ${formatINR(crmContext.conversion.priorFY.amount)}, ${crmContext.conversion.priorFY.donors} donors

PIPELINE (open/Standard Pipeline deals):
- All open pipeline: ${formatINR(crmContext.pipeline.allOpen.amount)}, ${crmContext.pipeline.allOpen.donors} donors
- Current FY (${crmContext.currentFYLabel}) approved pipeline: ${formatINR(crmContext.pipeline.currentFYApproved.amount)}, ${crmContext.pipeline.currentFYApproved.donors} donors

BREAKDOWNS (of closed/converted deals, all-time totals, top 10 by amount):
- By fiscal year: ${fmtGroup(crmContext.byFiscalYear)}
- By type: ${fmtGroup(crmContext.byType)}
- By donor type: ${fmtGroup(crmContext.byDonorType)}
- By KAM: ${fmtGroup(crmContext.byKAM)}
- By platform: ${fmtGroup(crmContext.byPlatform)}

BREAKDOWNS SPLIT BY FISCAL YEAR — covers the current FY (${crmContext.currentFYLabel}) and prior FY (${crmContext.priorFYLabel}) only, for Type/Donor Type/KAM/Platform. Use this whenever a single-FY or FY-vs-FY breakdown is asked for. If the user asks about an older fiscal year not shown here, say that year-specific breakdown isn't in this snapshot (the all-time totals above still include it):
- Type by FY: ${fmtByFY(crmContext.byTypeByFY, relevantFYs)}
- Donor type by FY: ${fmtByFY(crmContext.byDonorTypeByFY, relevantFYs)}
- KAM by FY: ${fmtByFY(crmContext.byKAMByFY, relevantFYs)}
- Platform by FY: ${fmtByFY(crmContext.byPlatformByFY, relevantFYs)}

MONTH-WISE CONVERSION (closed deals, April->March, only months with activity shown):
- FY ${crmContext.currentFYLabel} (current): ${fmtMonthWise(crmContext.monthWiseByFY[crmContext.currentFYLabel] || [])}
- FY ${crmContext.priorFYLabel} (prior): ${fmtMonthWise(crmContext.monthWiseByFY[crmContext.priorFYLabel] || [])}

PIPELINE FOR CURRENT FY (${crmContext.pipelineCurrentFYApproved.fyLabel}), APPROVED ONLY:
- Total: ${formatINR(crmContext.pipelineCurrentFYApproved.totals.amount)}, ${crmContext.pipelineCurrentFYApproved.totals.donors} donors
- By type: ${fmtGroup(crmContext.pipelineCurrentFYApproved.byType)}
- By donor type: ${fmtGroup(crmContext.pipelineCurrentFYApproved.byDonorType)}
- By platform: ${fmtGroup(crmContext.pipelineCurrentFYApproved.byPlatform)}
- By KAM: ${fmtGroup(crmContext.pipelineCurrentFYApproved.byKAM)}
- Current month (${crmContext.pipelineCurrentFYApproved.currentMonth.monthLabel}) total: ${formatINR(crmContext.pipelineCurrentFYApproved.currentMonth.totals.amount)}, ${crmContext.pipelineCurrentFYApproved.currentMonth.totals.donors} donors
- Current month by type: ${fmtGroup(crmContext.pipelineCurrentFYApproved.currentMonth.byType)}
- Current month by donor type: ${fmtGroup(crmContext.pipelineCurrentFYApproved.currentMonth.byDonorType)}
- Current month by platform: ${fmtGroup(crmContext.pipelineCurrentFYApproved.currentMonth.byPlatform)}
- Current month by KAM: ${fmtGroup(crmContext.pipelineCurrentFYApproved.currentMonth.byKAM)}

OTHER:
- Deals by stage (raw counts): ${JSON.stringify(crmContext.byStage)}
- Tasks by status: ${JSON.stringify(crmContext.tasksByStatus)}
- Accounts by industry (top 10): ${JSON.stringify(crmContext.accountsByIndustry)}

NOTE: This snapshot has aggregated totals and top-10 breakdowns only — it does NOT contain a full list of every individual donor's name. If the user asks for "all donor names", "a full list of donors", or similar, tell them the chat can't list every name from this summary data, but point out they can ask you to "export as excel/csv" to download the complete raw donor-level data as a spreadsheet — that file has every deal and donor name individually.
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

  return `You are Smart AI Assistant, helping users understand their Zoho Bigin CRM data.
This is an ONGOING CONVERSATION. You are given the full prior conversation history along with each new message — always read it and interpret the user's current message in light of what was already asked and answered. If the user says something like "not just X, I also want Y", "what about...", or otherwise references something earlier without restating it, connect it explicitly to that earlier topic instead of treating the message as a brand-new unrelated question.
Answer using ONLY the data snapshot below — it is pulled fresh from the same source as the CRM Analysis dashboard, so the numbers should match exactly what the user sees there.
Never invent numbers or names not present in it. "Conversion" means closed/won deals; "Pipeline" means open/Standard Pipeline deals — these are NOT based on the raw "Stage" field.
FORMATTING: reply in plain text only. Never use HTML tags of any kind (no <br>, <table>, <div>, etc.) — use real line breaks and markdown-style pipe tables ("| Col1 | Col2 |" with a "|---|---|" separator row) if a table is genuinely useful, otherwise a plain bullet or numbered list.
CRITICAL RULE: whenever the user asks for a breakdown "by type", "by KAM", "by platform", "by donor type", or "by fiscal year", you MUST list every single item shown in that breakdown section.
CRITICAL RULE: whenever the user asks for a breakdown "split by financial year", "by FY", or "year-wise", or asks for a SPECIFIC single fiscal year's breakdown (including "current FY" or a named year), use the BREAKDOWNS SPLIT BY FISCAL YEAR section and pull out every item for that year — check this section carefully before ever saying a fiscal year's data is unavailable.
CRITICAL RULE: whenever the user asks for a "month", "month-wise", or "current month" breakdown of conversion, use the MONTH-WISE CONVERSION section (for pipeline, use the "current month" figures inside the PIPELINE section instead).
CRITICAL RULE: whenever the user asks about pipeline for the current fiscal year or "approved pipeline", use the PIPELINE FOR CURRENT FY section, and list every item in every breakdown it contains.
If asked about something genuinely not in this snapshot, say so honestly rather than guessing — but check every section above carefully before concluding data is missing.
Always state currency values in ₹ using Indian numbering (e.g. ₹12,48,05,78,743) or in Cr/L shorthand when the number given to you is already in that form.
Be clear and concise.
${contextBlock}
${donorBlock}`;
}

// Keeps only the last N exchanges so a long-running popup session doesn't
// blow up the prompt size on every single message.
const MAX_CHARS_PER_HISTORY_MESSAGE = 400;

export function trimHistory(history = [], maxTurns = 5) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && h.content)
    .slice(-maxTurns * 2)
    .map((h) => ({
      role: h.role,
      content:
        h.content.length > MAX_CHARS_PER_HISTORY_MESSAGE
          ? h.content.slice(0, MAX_CHARS_PER_HISTORY_MESSAGE) + " …(truncated)"
          : h.content,
    }));
}