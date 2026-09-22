function IconSort(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}

function IconArrowUp(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function IconArrowDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

// Shared sort-only column header control (no dropdown — clicking the
// icon just cycles none -> ascending -> descending -> none). Used by
// every Donor History table's Donor Name / Amount columns.
export default function ColumnSortMenu({ label, sortDir, onSort, variant = "dark" }) {
  const nextDir = sortDir === null ? "asc" : sortDir === "asc" ? "desc" : null;
  const idleClass = variant === "light" ? "text-slate-400 hover:text-slate-600" : "text-white/60 hover:text-white";
  const activeClass = variant === "light" ? "text-pink-600" : "text-pink-300";

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onSort(nextDir)}
        className={`p-0.5 rounded ${sortDir != null ? activeClass : idleClass}`}
        aria-label={`Sort ${label} ${sortDir === "asc" ? "descending" : sortDir === "desc" ? "off" : "ascending"}`}
        title={sortDir === "asc" ? "Ascending — click for descending" : sortDir === "desc" ? "Descending — click to clear" : "Click to sort ascending"}
      >
        {sortDir === "asc" ? (
          <IconArrowUp className="w-3.5 h-3.5" />
        ) : sortDir === "desc" ? (
          <IconArrowDown className="w-3.5 h-3.5" />
        ) : (
          <IconSort className="w-3.5 h-3.5" />
        )}
      </button>
    </span>
  );
}