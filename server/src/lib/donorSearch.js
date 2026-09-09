// Matches a donor/account name mentioned in a free-text chat message
// against the Account_Name values present in the raw deals data, then
// aggregates that donor's deals the way groqService.js expects:
// { accountName, totalAmount, dealCount, byFiscalYear, types }.

import { pick, pickNumber, uniqueDonorKey } from "./dealHelpers.js";

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words too common/short to count as a meaningful donor-name match on
// their own (avoids matching an account literally named "Trust" etc.
// against unrelated messages that happen to contain that word).
const STOPWORDS = new Set([
  "the", "and", "for", "ltd", "limited", "pvt", "private", "trust",
  "foundation", "inc", "co", "company", "of", "a", "an",
]);

function isMeaningfulMatch(normalizedName) {
  const words = normalizedName.split(" ").filter((w) => w && !STOPWORDS.has(w));
  return words.length > 0;
}

/**
 * @param {Array} deals - raw deal records (as returned by fetchAllRecords("Pipelines"))
 * @param {string} message - the user's chat message
 * @returns {null | { accountName, totalAmount, dealCount, byFiscalYear, types }}
 */
export function findDonor(deals, message) {
  if (!deals || deals.length === 0 || !message) return null;

  const normalizedMessage = normalize(message);
  if (!normalizedMessage) return null;

  // Build a map of normalized account name -> canonical display name,
  // deduping via uniqueDonorKey so casing/whitespace variants collapse
  // to a single candidate.
  const candidatesByKey = new Map(); // donorKey -> { display, normalized }
  for (const d of deals) {
    const key = uniqueDonorKey(d);
    if (!key || candidatesByKey.has(key)) continue;
    const display = pick(d, "Account_Name", null);
    if (!display) continue;
    const normalized = normalize(display);
    if (!normalized || !isMeaningfulMatch(normalized)) continue;
    candidatesByKey.set(key, { display, normalized });
  }

  // Find every candidate whose normalized name appears as a substring of
  // the message, then pick the longest match (most specific) — e.g.
  // prefer "st marys school" over a shorter unrelated partial hit.
  let best = null;
  for (const { display, normalized } of candidatesByKey.values()) {
    if (normalizedMessage.includes(normalized)) {
      if (!best || normalized.length > best.normalized.length) {
        best = { display, normalized };
      }
    }
  }

  if (!best) return null;

  // Aggregate every deal belonging to the matched donor (match by the
  // same normalized name, so all casing/whitespace variants roll up
  // together).
  const donorDeals = deals.filter((d) => {
    const name = pick(d, "Account_Name", null);
    return name && normalize(name) === best.normalized;
  });

  if (donorDeals.length === 0) return null;

  const totalAmount = donorDeals.reduce((sum, d) => sum + pickNumber(d, "Amount"), 0);

  const byFiscalYear = {};
  for (const d of donorDeals) {
    const fy = pick(d, "Fiscal_year", "Unspecified");
    byFiscalYear[fy] = (byFiscalYear[fy] || 0) + pickNumber(d, "Amount");
  }

  const types = [...new Set(donorDeals.map((d) => pick(d, "Type", "Unspecified")))];

  return {
    accountName: best.display,
    totalAmount,
    dealCount: donorDeals.length,
    byFiscalYear,
    types,
  };
}