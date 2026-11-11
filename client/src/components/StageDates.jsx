import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { agoLabel, daysBetween, fmtDate, normStage, spanLabel } from "../lib/stageDates.js";

// The Created column of the stage popups: the deal's created date with "N days
// ago" in red — hover it for the Creation Timeline: every stage the deal has been
// through, with how long it stayed in each.

const CARD_W = 340;

// Open/close of a hover card anchored to a cell: opens on hover, focus or tap,
// closes shortly after the pointer leaves (so it can be moved onto the card),
// on Escape, and when the page or popup scrolls or resizes.
function useHoverCard() {
  const [anchor, setAnchor] = useState(null); // the trigger's rectangle while the card is open
  const trigger = useRef(null);
  const timer = useRef(null);

  const open = () => {
    window.clearTimeout(timer.current);
    if (trigger.current) setAnchor(trigger.current.getBoundingClientRect());
  };
  const close = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchor(null), 120);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!anchor) return undefined;
    const dismiss = () => setAnchor(null);
    const onKey = (e) => e.key === "Escape" && dismiss();
    // Scrolling the page or the popup closes the card; scrolling INSIDE the card
    // (it scrolls on a short screen) must not.
    const onScroll = (e) => {
      if (e.target instanceof Element && e.target.closest('[role="tooltip"]')) return;
      dismiss();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [anchor]);

  return { anchor, trigger, open, close, toggle: () => (anchor ? setAnchor(null) : open()) };
}

// The Creation Timeline: Created, then every stage the deal has been in, oldest
// first. Rendered into <body> and positioned from the cell's rectangle, so the
// popup's scrolling and clipping can't cut it off.
//   status: "ready" | "loading" | "error" | "none"
function TimelineCard({ deal, status, entries, currentIndex, reason, anchor, onEnter, onLeave }) {
  const now = new Date();
  const card = useRef(null);
  // On a short screen the card scrolls — open it at the bottom, where the stage the deal is in now is.
  useLayoutEffect(() => {
    const el = card.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }, []);

  const left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - CARD_W - 8));
  const spaceBelow = window.innerHeight - anchor.bottom;
  const estimate = Math.min(540, 96 + (entries.length + 1) * 40);
  const below = spaceBelow >= estimate + 12 || spaceBelow >= anchor.top;
  const maxHeight = Math.max(160, Math.min(540, (below ? spaceBelow : anchor.top) - 16));
  const placement = below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 };

  return createPortal(
    <div
      ref={card}
      role="tooltip"
      style={{ position: "fixed", left, width: CARD_W, maxHeight, zIndex: 80, ...placement }}
      className="overflow-y-auto rounded-xl border border-slate-200 bg-white text-sm shadow-2xl"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="border-b border-slate-100 px-4 pb-2 pt-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Creation Timeline</p>
        <p className="font-semibold leading-snug text-navy-900">{deal.account}</p>
      </div>

      <ol className="px-4 py-2.5">
        <li className={`relative flex gap-3 ${entries.length ? "pb-2.5" : ""}`}>
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
          {entries.length > 0 && <span className="absolute left-[3px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />}
          <div className="flex-1">
            <p className="text-slate-500">Created</p>
            <p className="text-xs text-slate-400">{fmtDate(deal.createdTime)}</p>
          </div>
        </li>

        {status === "loading" && <li className="pt-1 text-xs text-slate-400">Loading stage history…</li>}
        {(status === "error" || status === "none") && (
          <li className="pt-1 text-xs text-slate-500">
            Stage history isn't available for this deal.
            {reason && <span className="mt-0.5 block text-slate-400">{reason}</span>}
          </li>
        )}
        {status === "ready" && entries.length === 0 && (
          <li className="pt-1 text-xs text-slate-500">No stage changes yet — it has been in {deal.stage} since it was created.</li>
        )}
        {entries.map((entry, i) => {
          const last = i === entries.length - 1;
          const isCurrent = i === currentIndex;
          const spent = daysBetween(entry.at, last ? now : entries[i + 1].at);
          return (
            <li key={`${entry.stage}-${entry.at}`} className={`relative flex gap-3 ${last ? "" : "pb-2.5"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isCurrent ? "bg-indigo-600 ring-4 ring-indigo-100" : "bg-slate-400"}`} />
              {!last && <span className="absolute left-[3px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />}
              <div className="flex-1">
                <p className={`text-[13px] leading-snug ${isCurrent ? "font-semibold text-indigo-700" : "text-navy-900"}`}>{entry.stage}</p>
                <p className="text-xs text-slate-400">{last ? (spent === 0 ? "moved here today" : `${spanLabel(spent)} so far`) : spanLabel(spent)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>,
    document.body
  );
}

/**
 * Created: the date the deal was created, with "N days ago" in red. For a deal
 * that can be looked up (it has a dealId), hover / focus / tap opens the
 * Creation Timeline.
 *   history = { entries: [{ stage, at }], error } for this deal, once loaded
 */
export function CreatedCell({ deal, history, loading }) {
  const card = useHoverCard();
  if (!deal.createdTime) return <span className="text-slate-300">—</span>;

  const label = (
    <>
      <span className="block">{fmtDate(deal.createdTime)}</span>
      <span className="block text-xs font-medium text-red-500">{agoLabel(daysBetween(deal.createdTime))}</span>
    </>
  );
  if (!deal.dealId) return <div className="leading-tight">{label}</div>;

  const ready = history && !history.error && Array.isArray(history.entries);
  const status = ready ? "ready" : history?.error ? "error" : loading ? "loading" : "none";
  const entries = ready ? history.entries : [];
  const currentIndex = ready ? entries.map((e) => normStage(e.stage)).lastIndexOf(normStage(deal.stage)) : -1;

  return (
    <>
      <button
        ref={card.trigger}
        type="button"
        onMouseEnter={card.open}
        onMouseLeave={card.close}
        onFocus={card.open}
        onBlur={card.close}
        onClick={card.toggle}
        aria-haspopup="true"
        aria-expanded={!!card.anchor}
        title="Hover to see the Creation Timeline"
        className="-mx-1 cursor-help rounded px-1 text-left leading-tight hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        {label}
      </button>
      {card.anchor && (
        <TimelineCard
          deal={deal}
          status={status}
          entries={entries}
          currentIndex={currentIndex}
          reason={history?.error}
          anchor={card.anchor}
          onEnter={card.open}
          onLeave={card.close}
        />
      )}
    </>
  );
}