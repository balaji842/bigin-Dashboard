import { useState } from "react";
import { api } from "../api.js";

const EXAMPLES = [
  "select id, Deal_Name, Stage, Amount from Deals where Stage = 'Won' limit 20",
  "select id, Account_Name, Industry from Accounts limit 20",
  "select id, Full_Name, Email from Contacts limit 20",
];

export default function CoqlExplorer() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const columns = rows && rows.length ? Object.keys(rows[0]) : [];

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.coql(query);
      setRows(res.data || []);
    } catch (err) {
      setError(err.message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-navy-900">
        COQL explorer
      </h2>
      <p className="text-sm text-slate-500 -mt-2">
        Run read-only COQL queries directly against your Bigin org — same
        query language you use for COQL audits, now with instant table
        output.
      </p>

      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          className="w-full font-mono text-sm p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                {ex.slice(0, 28)}…
              </button>
            ))}
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-pink-500 hover:bg-pink-400 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Running…" : "Run query"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          {error}
        </div>
      )}

      {rows && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-50">
                  {columns.map((c) => (
                    <td key={c} className="px-4 py-3 text-navy-900">
                      {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-slate-400">
                    Query returned no rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
