import { useEffect, useState } from "react";
import { api } from "../api.js";
import DataTable from "./DataTable.jsx";
import StatCard from "./StatCard.jsx";

export default function ModuleView({ module, title, columns, refreshKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .moduleRecords(module)
      .then((res) => {
        if (!cancelled) setRecords(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-navy-900">
          {title}
        </h2>
        <StatCard label="Total records" value={loading ? "…" : records.length} accent="pink" />
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load {title}: {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
          Pulling live data from Bigin…
        </div>
      ) : (
        <DataTable records={records} columns={columns} />
      )}
    </div>
  );
}
