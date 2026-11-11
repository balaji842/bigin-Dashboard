// Dates and "days ago" for the stage popups (Created / In stage since).
//
// Days are CALENDAR days between local dates — a deal created on 12 Oct 2026
// shows "30 days ago" on 11 Nov 2026 — not hours divided by 24, so the number
// never jumps in the middle of the day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 Oct 2026" (or "—" when there is no date). */
export function fmtDate(value) {
  const d = toDate(value);
  return d ? `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "—";
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole calendar days from `from` to `to` (default: today); null if either date is missing. */
export function daysBetween(from, to = new Date()) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / 86400000));
}

/** 0 → "today", 1 → "1 day ago", 12 → "12 days ago". */
export function agoLabel(days) {
  if (days == null) return "";
  if (days === 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** 3 → "3 days", 1 → "1 day", 0 → "same day". */
export function spanLabel(days) {
  if (days == null) return "";
  if (days === 0) return "same day";
  return days === 1 ? "1 day" : `${days} days`;
}

// Stage names compared ignoring case, extra spaces and which dash is used.
export const normStage = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * When this deal moved INTO the stage it is in now.
 *   history = { entries: [{ stage, at }] (oldest first), error }
 * Returns { at, fromCreated } or null when it can't be known. A deal whose
 * history has no stage changes at all has never moved, so it has been in its
 * stage since it was created (fromCreated = true).
 */
export function stageSinceOf(deal, history) {
  if (!history || history.error || !Array.isArray(history.entries)) return null;
  const want = normStage(deal.stage);
  for (let i = history.entries.length - 1; i >= 0; i -= 1) {
    if (normStage(history.entries[i].stage) === want) return { at: history.entries[i].at, fromCreated: false };
  }
  if (history.entries.length === 0 && deal.createdTime) return { at: deal.createdTime, fromCreated: true };
  return null;
}