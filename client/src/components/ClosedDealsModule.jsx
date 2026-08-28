import { useEffect, useState } from "react";
import FilterTable from "./FilterTable.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function KpiCard({ label, amount, donors, accent = "emerald" }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${theme}`}>{money(amount)}</p>
      <p className="text-xs text-slate-400 mt-1">{donors} unique donors</p>
    </div>
  );
}

function BreakdownCard({ title, rows }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="font-display font-semibold text-navy-900 mb-3 text-sm">{title}</p>
      <div className="space-y-2">
        {rows.slice(0, 8).map((r) => (
          <div key={r.name} className="flex items-center justify-between text-sm gap-2">
            <span className="text-slate-600 truncate">{r.name}</span>
            <span className="text-right shrink-0 whitespace-nowrap">
              <span className="font-semibold text-navy-900">{money(r.amount)}</span>
              <span className="text-slate-400 text-xs ml-2">{r.donors} donors</span>
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-400">No data</p>}
      </div>
    </div>
  );
}

const TABLE_COLUMNS = [
  { key: "dealName", label: "Deal" },
  { key: "account", label: "Account" },
  { key: "amount", label: "Amount", format: money },
  { key: "stage", label: "Stage" },
  { key: "type", label: "Type" },
  { key: "donorType", label: "Donor Type" },
  { key: "kam", label: "KAM" },
  { key: "platform", label: "Platform" },
  { key: "spoc", label: "SPOC" },
  { key: "approved", label: "Approval Status" },
];

export default function ClosedDealsModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fy, setFy] = useState("2025-2026");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm-analysis/closed-deals?fy=${encodeURIComponent(fy)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
        Loading closed deals…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load closed deals: {error}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-500">Financial Year:</label>
        <select
          value={fy}
          onChange={(e) => setFy(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5"
        >
          {(data?.availableFYs || [fy]).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label={`Closed Deals — FY ${data.fy}`}
          amount={data.totals.amount}
          donors={data.totals.donors}
          accent="emerald"
        />
        <KpiCard
          label="Closed Deals — All Time"
          amount={data.allTimeTotals.amount}
          donors={data.allTimeTotals.donors}
          accent="navy"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-navy-900 text-white px-5 py-3">
          <p className="font-display font-semibold text-sm">
            Month-wise conversion (FY {data.fy}) — April to March
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Month</th>
                <th className="px-4 py-2 font-semibold text-right">Amount</th>
                <th className="px-4 py-2 font-semibold text-right">Donors</th>
              </tr>
            </thead>
            <tbody>
              {data.monthWise.map((m, i) => (
                <tr key={m.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-2 text-navy-900 font-medium">{m.name}</td>
                  <td className="px-4 py-2 text-right">{money(m.amount)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{m.donors}</td>
                </tr>
              ))}
              {data.monthWise.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-slate-400 text-xs">
                    No closed deals this FY
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BreakdownCard title="By Type (Cash/Kind/SE)" rows={data.byType} />
        <BreakdownCard title="By Donor Type" rows={data.byDonorType} />
        <BreakdownCard title="By KAM" rows={data.byKAM} />
        <BreakdownCard title="By Platform" rows={data.byPlatform} />
      </div>

      <BreakdownCard title="By Stage" rows={data.byStage} />

      <FilterTable columns={TABLE_COLUMNS} rows={data.table} />
    </div>
  );
}