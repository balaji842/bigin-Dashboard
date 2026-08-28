import { useMemo, useState } from "react";

export default function FilterTable({ columns, rows, pageSize = 25 }) {
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return rows.filter((row) =>
      columns.every((col) => {
        const f = filters[col.key];
        if (!f) return true;
        const val = String(row[col.key] ?? "").toLowerCase();
        return val.includes(f.toLowerCase());
      })
    );
  }, [rows, filters, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const updateFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 sm:px-5 py-3 flex items-center justify-between">
        <p className="font-display font-semibold text-sm">
          {filtered.length} of {rows.length} records
        </p>
        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters({})}
            className="text-xs text-white/70 hover:text-white underline"
          >
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-1.5">
                  <input
                    value={filters[col.key] || ""}
                    onChange={(e) => updateFilter(col.key, e.target.value)}
                    placeholder="Filter…"
                    className="w-full text-xs px-2 py-1 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 whitespace-nowrap text-slate-700">
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
        <span>Page {page + 1} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}