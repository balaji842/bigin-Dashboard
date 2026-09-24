import { useEffect, useRef, useState } from "react";

// Dropdown multi-select with checkboxes — used for KAM, SPOC, Platform,
// and Donor Type filters that can have many more options than fit as
// pills. `selected: null` means "everything" selected (every box shown
// checked); an explicit array (including an empty one, reachable via
// "Clear all") narrows it. Closes when clicking outside of it.
export default function MultiSelectDropdown({ label, options, selected, onToggle, onSelectAll, onClearAll, onOnly }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!options || options.length === 0) return null;

  const allSelected = selected == null;
  const allCleared = selected != null && selected.length === 0;
  const count = allSelected ? options.length : selected.length;
  const summary = allSelected ? "All" : `${count} of ${options.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg border transition-colors ${
          open
            ? "border-transparent bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
            : allSelected
            ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            : "border-indigo-200 bg-indigo-50 text-indigo-900"
        }`}
      >
        <span className="font-semibold">{label}</span>
        <span className={`text-xs ${open ? "text-white/70" : "text-slate-400"}`}>{summary}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""} ${open ? "text-white/70" : "text-slate-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <div className="flex items-center gap-3">
              {!allSelected && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Select all
                </button>
              )}
              {!allCleared && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-xs font-semibold text-slate-400 hover:text-indigo-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = allSelected || selected.includes(opt);
              return (
                <div
                  key={opt}
                  className="group flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-navy-900 hover:bg-slate-50"
                >
                  <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt)}
                      className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                  {onOnly && (
                    <button
                      type="button"
                      onClick={() => onOnly(opt)}
                      className="shrink-0 text-[11px] font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 hover:underline"
                      title={`Show just ${opt}`}
                    >
                      Only
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}