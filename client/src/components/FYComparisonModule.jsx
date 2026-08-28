import { useEffect, useState } from "react";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function ComparisonKpi({ label, fy1, fy2, valueA, donorsA, valueB, donorsB, pctChange }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400 mb-1">FY {fy1}</p>
          <p className="font-display text-xl font-bold text-navy-700">{money(valueA)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{donorsA} donors</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">FY {fy2}</p>
          <p className="font-display text-xl font-bold text-pink-600">{money(valueB)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{donorsB} donors</p>
        </div>
      </div>
      {pctChange != null && (
        <p className={`text-xs font-semibold mt-3 ${pctChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs FY {fy1}
        </p>
      )}
    </div>
  );
}

function ComparisonTable({ title, rows, fy1, fy2 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 sm:px-5 py-3">
        <p className="font-display font-semibold text-sm">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold text-right">FY {fy1}</th>
              <th className="px-4 py-2 font-semibold text-right">FY {fy2}</th>
              <th className="px-4 py-2 font-semibold text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, i) => {
              const change =
                r.amountA > 0 ? ((r.amountB - r.amountA) / r.amountA) * 100 : r.amountB > 0 ? 100 : 0;
              return (
                <tr key={r.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-2 text-navy-900 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{money(r.amountA)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{money(r.amountB)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-slate-400 text-xs">No data</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FYComparisonModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fy1 = "2025-2026";
  const fy2 = "2026-2027";

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm-analysis/fy-comparison?fy1=${fy1}&fy2=${fy2}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
        Loading FY comparison…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load FY comparison: {error}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ComparisonKpi
          label="Closed Deals"
          fy1={data.fy1}
          fy2={data.fy2}
          valueA={data.closed[data.fy1].amount}
          donorsA={data.closed[data.fy1].donors}
          valueB={data.closed[data.fy2].amount}
          donorsB={data.closed[data.fy2].donors}
          pctChange={data.closed.pctChange}
        />
        <ComparisonKpi
          label="Standard Pipeline"
          fy1={data.fy1}
          fy2={data.fy2}
          valueA={data.standardPipeline[data.fy1].amount}
          donorsA={data.standardPipeline[data.fy1].donors}
          valueB={data.standardPipeline[data.fy2].amount}
          donorsB={data.standardPipeline[data.fy2].donors}
        />
      </div>

      <ComparisonTable title="By Stage" rows={data.byStage} fy1={data.fy1} fy2={data.fy2} />

      <div className="grid sm:grid-cols-2 gap-5">
        <ComparisonTable title="By Type (Cash/Kind/SE)" rows={data.byType} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By Donor Type" rows={data.byDonorType} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By KAM" rows={data.byKAM} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By Platform" rows={data.byPlatform} fy1={data.fy1} fy2={data.fy2} />
      </div>
    </div>
  );
}