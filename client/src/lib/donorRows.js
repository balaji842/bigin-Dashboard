// Shared helpers for turning a `table` array (the same per-deal row
// shape every /crm-analysis/* route returns: account, amount, platform,
// kam, spoc, plus whichever of stage/type/donorType/fiscalYear/
// closingDate/expectedMonth/subPipeline/approved that route includes)
// into the donor list a DonorDrilldownModal needs, entirely client-side
// — every donor-count click across the dashboard reuses this instead of
// a fresh network call, since the table backing it is already loaded.

// Mirrors the server's isApprovedOpenPipeline rule (see dealHelpers.js)
// so a Pipeline KPI card's donor count can be reconstructed from an
// already-loaded table without a second round trip.
export function isApprovedOpenPipelineRow(r) {
  const raw = r.approved;
  let approved = false;
  if (raw === true) approved = true;
  else if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    approved = v === "yes" || v === "true" || v === "approved";
  } else if (raw && typeof raw === "object") {
    const v = String(raw.name || raw.value || "").trim().toLowerCase();
    approved = v === "yes" || v === "true" || v === "approved";
  }
  if (!approved) return false;
  const stage = String(r.stage || "").toLowerCase();
  return !stage.includes("lost") && !stage.includes("on hold");
}

// Everything DonorDrilldownModal needs is already present on each row
// (account/amount/platform/kam/spoc) — this just runs a predicate over
// the table and hands back the matches, so every call site is a
// one-liner: `openDrilldown("Platform: P3", filterRows(table, r => r.platform === "P3"))`.
export function filterRows(table, predicate) {
  return (table || []).filter(predicate);
}