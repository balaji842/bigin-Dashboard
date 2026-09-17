import { useEffect, useRef, useState } from "react";

function IconFilter(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}

// Inline column-header filter — a funnel icon right next to the column
// label, opening a checkbox multi-select dropdown. Shared by every
// Donor History table across the dashboard (Overview, Conversion,
// Pipeline) so they all behave identically.
//
// `selected` contract: null means "everything" (every box shown
// checked); an array is an explicit subset (including an empty array,
// which is a deliberate "show nothing for this column" state reachable
// via "Clear all" — distinct from unchecking boxes one by one, which
// snaps back to null once you hit zero).
export default function HeaderFilterMenu({ label, options, selected, onToggle, onSelectAll, onClearAll, variant = "dark" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = selected == null;
  const allCleared = selected != null && selected.length === 0;
  const iconIdleClass = variant === "light" ? "text-slate-400 hover:text-slate-600" : "text-white/60 hover:text-white";
  const iconActiveClass = variant === "light" ? "text-pink-600" : "text-pink-300";

  return (
    <span className="relative inline-flex items-center gap-1" ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-0.5 rounded ${!allSelected ? iconActiveClass : iconIdleClass}`}
        aria-label={`Filter ${label}`}
      >
        <IconFilter className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="absolute z-20 top-full mt-1 left-0 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden text-left normal-case"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Filter</p>
            <div className="flex items-center gap-2.5">
              {!allSelected && (
                <button type="button" onClick={onSelectAll} className="text-[11px] font-semibold text-pink-600 hover:underline">
                  Select all
                </button>
              )}
              {!allCleared && (
                <button type="button" onClick={onClearAll} className="text-[11px] font-semibold text-slate-400 hover:text-pink-600 hover:underline">
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = allSelected || selected.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-navy-900 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-pink-600 cursor-pointer"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })}
            {options.length === 0 && <p className="text-xs text-slate-300 px-3 py-1.5">No data</p>}
          </div>
        </div>
      )}
    </span>
  );
}

// Distinct values found in `rows` for `field`, splitting any
// comma-joined values (a row whose KAM/SPOC/Donor Type is itself a
// list) into separate options. Sorted alphabetically.
export function optionsFor(rows, field) {
  const set = new Set();
  rows.forEach((r) => {
    const v = r[field];
    if (v && v !== "—") String(v).split(",").forEach((x) => x.trim() && set.add(x.trim()));
  });
  return [...set].sort();
}

// A row's field can itself be a comma-joined list — matches if ANY of
// that row's values is in the selected set. `selected: null` always
// matches (that column isn't filtered).
export function matchesFilter(fieldValue, selected) {
  if (selected == null) return true;
  if (!fieldValue || fieldValue === "—") return false;
  const values = String(fieldValue).split(",").map((v) => v.trim());
  return values.some((v) => selected.includes(v));
}

// Builds the standard { toggle, selectAll, clearAll } handlers for a
// `filters` state object shaped like { field: null | string[] }, given
// the full (unfiltered) rows and the field->options map used to compute
// "select all" boundaries. Keeps the multi-select toggle logic (used by
// every Donor History table) in one place.
export function makeFilterHandlers(setFilters, setPage, optionsByField) {
  const toggleOption = (field) => (value) => {
    setFilters((prev) => {
      const allOptions = optionsByField[field];
      const current = prev[field];
      const base = current == null ? allOptions : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      let resolved;
      if (next.length === 0) resolved = current;
      else if (next.length === allOptions.length) resolved = null;
      else resolved = next;
      return { ...prev, [field]: resolved };
    });
    setPage(0);
  };

  const selectAll = (field) => () => {
    setFilters((prev) => ({ ...prev, [field]: null }));
    setPage(0);
  };

  const clearAll = (field) => () => {
    setFilters((prev) => ({ ...prev, [field]: [] }));
    setPage(0);
  };

  return { toggleOption, selectAll, clearAll };
}