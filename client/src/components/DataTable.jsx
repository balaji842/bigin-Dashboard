import { useMemo, useState } from "react";

function displayValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return v.name || v.email || JSON.stringify(v);
  return String(v);
}

export default function DataTable({ records, columns }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const filtered = useMemo(() => {
    if (!query.trim()) return records;
    const q = query.toLowerCase();
    return records.filter((r) =>
      columns.some((c) => displayValue(r[c.key]).toLowerCase().includes(q))
    );
  }, [records, query, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRecords = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search this module…"
          className="w-full max-w-xs text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <p className="text-xs text-slate-400 whitespace-nowrap">
          {filtered.length} of {records.length} records
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              {columns.map((c) => (
                <th key={c.key} className="px-5 py-3 font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((r) => (
              <tr
                key={r.id}
                className="border-t border-slate-50 hover:bg-pink-50/40"
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-5 py-3 text-navy-900">
                    {displayValue(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {pageRecords.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-8 text-center text-slate-400"
                >
                  No matching records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded-md border border-slate-200 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded-md border border-slate-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
