import { useState } from "react";

// The Remarks and Calls cells shared by the Conversion, Pipeline,
// Engagement Status and Overall Comparison tables (the Overview table has
// the same cells built in). Remarks are the donor's Bigin Notes, newest
// first, each { title, content, createdTime, author }.

// One note as plain text: "Title — content" (either part may be empty).
const noteText = (n) =>
  [n.title, n.content]
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ");

function formatNoteDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// For search: every note's text joined together.
export const remarksSearchText = (notes) => (notes || []).map(noteText).join(" ");

// For Excel: every note, newest first — "[12 Oct 2026] Title — content | [..] .."
export const remarksForExport = (notes) =>
  (notes || [])
    .map((n) => {
      const date = formatNoteDate(n.createdTime);
      return `${date ? `[${date}] ` : ""}${noteText(n)}`;
    })
    .join(" | ");

const POPUP_NOTES = 5; // how many notes the hover popup lists
const POPUP_NOTE_CHARS = 220; // long notes are cut off in the popup

// Remarks cell: the latest note on one line (cut off with "…" when it
// doesn't fit), plus a small "+N" when there are older notes. Hovering
// opens a popup with the notes, newest first. The popup is `fixed`, so
// the table's horizontal scroll can't clip it.
export function RemarksCell({ notes }) {
  const [tip, setTip] = useState(null);
  if (!notes || notes.length === 0) return <span className="text-slate-300">—</span>;

  const latest = noteText(notes[0]) || "(empty note)";
  const shown = notes.slice(0, POPUP_NOTES);
  const hidden = notes.length - shown.length;

  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const estHeight = 56 + shown.length * 78;
    const fitsBelow = rect.bottom + estHeight + 12 < window.innerHeight;
    setTip({
      left: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170),
      top: fitsBelow ? rect.bottom + 6 : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + 6,
    });
  };

  return (
    <span className="flex items-center gap-2 max-w-[260px]" onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      <span className="truncate cursor-help text-slate-700 text-left">{latest}</span>
      {notes.length > 1 && (
        <span className="shrink-0 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
          +{notes.length - 1}
        </span>
      )}
      {tip && (
        <span
          className="fixed z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-left normal-case pointer-events-none block"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom, transform: "translateX(-50%)" }}
        >
          <span className="block text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
            Remarks · {notes.length} {notes.length === 1 ? "note" : "notes"}
          </span>
          {shown.map((n, i) => {
            const body = (n.content || "").replace(/\s+/g, " ").trim();
            return (
              <span key={i} className={`block text-xs ${i > 0 ? "border-t border-slate-100 mt-2 pt-2" : ""}`}>
                <span className="block text-[10px] text-slate-400 mb-0.5">
                  {[formatNoteDate(n.createdTime), n.author].filter(Boolean).join(" · ")}
                </span>
                {n.title && <span className="block font-semibold text-navy-900">{n.title}</span>}
                {body && (
                  <span className="block text-slate-600 break-words">
                    {body.length > POPUP_NOTE_CHARS ? `${body.slice(0, POPUP_NOTE_CHARS)}…` : body}
                  </span>
                )}
              </span>
            );
          })}
          {hidden > 0 && (
            <span className="block text-[11px] text-slate-400 border-t border-slate-100 mt-2 pt-2">
              and {hidden} earlier {hidden === 1 ? "note" : "notes"}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// Calls cell: the donor's call count; clicking it (when there are calls)
// calls `onOpen`, which opens the popup listing them.
export function CallsCell({ calls, onOpen }) {
  const n = (calls || []).length;
  return n > 0 ? (
    <button
      type="button"
      onClick={onOpen}
      className="font-semibold text-emerald-600 underline hover:text-emerald-700"
      title="See the calls logged for this donor"
    >
      {n}
    </button>
  ) : (
    <span className="text-slate-300">0</span>
  );
}

// Mobile Number cell: the donor's numbers from Bigin (the company record and
// its contacts), the first two shown, one per line, with a "+N" when there
// are more (hover for the full list).
export function PhonesCell({ numbers }) {
  if (!numbers || numbers.length === 0) return <span className="text-slate-300">—</span>;
  const shown = numbers.slice(0, 2);
  const more = numbers.length - shown.length;
  return (
    <span className="inline-flex flex-col items-center leading-snug" title={numbers.join(", ")}>
      {shown.map((n) => (
        <span key={n} className="whitespace-nowrap text-slate-700">
          {n}
        </span>
      ))}
      {more > 0 && <span className="text-[10px] font-semibold text-slate-400">+{more} more</span>}
    </span>
  );
}

// For Excel: every number, comma-separated.
export const phonesForExport = (numbers) => (numbers || []).join(", ");

// A short amber message when Remarks / Calls / Mobile Numbers couldn't be
// loaded from Bigin (nothing is rendered when everything loaded fine).
export function ExtrasNote({ remarksNote, callsNote, phonesNote, className = "" }) {
  if (!remarksNote && !callsNote && !phonesNote) return null;
  return (
    <div className={className}>
      {remarksNote && <p className="text-xs text-amber-600">{remarksNote}</p>}
      {callsNote && <p className="text-xs text-amber-600 mt-1">{callsNote}</p>}
      {phonesNote && <p className="text-xs text-amber-600 mt-1">{phonesNote}</p>}
    </div>
  );
}