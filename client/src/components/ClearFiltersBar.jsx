// Shared "Clear all filters" bar used at the top of every page that has
// its own filter state (Overview, Conversion, Pipeline, FY Comparison,
// Engagement Status). Purely presentational — each page computes its
// own `active` flag, a short `summary` string describing what's
// currently filtered, and an `onClear` handler that resets that page's
// own filter state back to defaults.
export default function ClearFiltersBar({ active, summary, onClear, emptyText = "No filters applied" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-slate-400">
        {active ? (
          <>
            <span className="font-semibold text-navy-700">Filters:</span> {summary}
          </>
        ) : (
          emptyText
        )}
      </p>
      <button
        type="button"
        onClick={onClear}
        disabled={!active}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
          active
            ? "border-pink-300 text-pink-600 hover:bg-pink-50"
            : "border-slate-200 text-slate-300 cursor-not-allowed"
        }`}
      >
        Clear all filters
      </button>
    </div>
  );
}