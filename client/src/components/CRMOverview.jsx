import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import FilterTable from "./FilterTable.jsx";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";
import { moneyCr } from "../lib/format.js";

const PIE_COLORS = ["#e94f8a", "#22316b", "#f172a1", "#2f4086", "#f79cbe", "#0b1230"];

function KpiCard({ label, amount, donors, accent = "pink" }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${theme}`}>{moneyCr(amount)}</p>
      <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} unique donors</p>
    </div>
  );
}

function MiniStatCard({ name, amount, donors }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2 break-words" title={name}>
        {name}
      </p>
      <p className="font-display text-lg font-bold text-navy-900">{moneyCr(amount)}</p>
      <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} donors</p>
    </div>
  );
}

function CardGroup({ title, rows }) {
  return (
    <div>
      <p className="font-display font-semibold text-navy-900 mb-3 text-sm">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map((r) => (
          <MiniStatCard key={r.name} name={r.name} amount={r.amount} donors={r.donors} />
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-400 col-span-full">No data</p>}
      </div>
    </div>
  );
}

// Custom tooltip so the KAM bar chart can show donor count alongside
// amount, since donors isn't the bar's own dataKey.
function KamTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-navy-900">{row.name}</p>
      <p className="text-slate-600">{moneyCr(row.amount)}</p>
      <p className="text-emerald-600 font-semibold">{row.donors} donors</p>
    </div>
  );
}

function PlatformTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-navy-900">{row.name}</p>
      <p className="text-slate-600">{moneyCr(row.amount)}</p>
      <p className="text-emerald-600 font-semibold">{row.donors} donors</p>
    </div>
  );
}

const TABLE_COLUMNS = [
  { key: "dealName", label: "Deal" },
  { key: "account", label: "Account" },
  { key: "amount", label: "Amount", format: moneyCr },
  { key: "subPipeline", label: "Sub-Pipeline" },
  { key: "stage", label: "Stage" },
  { key: "type", label: "Type" },
  { key: "donorType", label: "Donor Type" },
  { key: "kam", label: "KAM" },
  { key: "platform", label: "Platform" },
  { key: "spoc", label: "SPOC" },
  { key: "fiscalYear", label: "FY" },
  { key: "approved", label: "Approval Status" },
];

function monthNameOf(closingDate) {
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

// Builds the donor list for a clicked month, plus each donor's giving
// history in other fiscal years — all from the raw table already loaded,
// no extra network call needed.
function buildMonthDonors(table, monthName, fy) {
  const rowsThisMonth = table.filter(
    (r) =>
      r.subPipeline !== "Standard Pipeline" &&
      r.fiscalYear === fy &&
      r.closingDate &&
      monthNameOf(r.closingDate) === monthName
  );

  return rowsThisMonth.map((r) => {
    const history = table
      .filter(
        (h) =>
          h.account === r.account &&
          h.fiscalYear !== fy &&
          h.subPipeline !== "Standard Pipeline" &&
          h.closingDate
      )
      .map((h) => ({ fiscalYear: h.fiscalYear, amount: h.amount, month: monthNameOf(h.closingDate) }))
      .sort((a, b) => (b.fiscalYear || "").localeCompare(a.fiscalYear || ""));
    return { ...r, history };
  });
}

export default function CRMOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fy, setFy] = useState("2025-2026");
  const [modalMonth, setModalMonth] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm-analysis/overview?fy=${encodeURIComponent(fy)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy]);

  const monthDonors = useMemo(() => {
    if (!data || !modalMonth) return [];
    return buildMonthDonors(data.table, modalMonth, data.fy);
  }, [data, modalMonth]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
        Loading CRM analysis…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load CRM analysis: {error}
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
          <option value="2024-2025">2024-2025</option>
          <option value="2025-2026">2025-2026</option>
          <option value="2026-2027">2026-2027</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Closed Deals (All Time)"
          amount={data.closed.allTime.amount}
          donors={data.closed.allTime.donors}
          accent="emerald"
        />
        <KpiCard
          label={`Closed Deals (FY ${data.fy})`}
          amount={data.closed.thisFY.amount}
          donors={data.closed.thisFY.donors}
          accent="pink"
        />
        <KpiCard
          label="Standard Pipeline"
          amount={data.standardPipeline.amount}
          donors={data.standardPipeline.donors}
          accent="navy"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-navy-900 text-white px-5 py-3">
          <p className="font-display font-semibold text-sm">
            Month-wise (FY {data.fy}) — April to March
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
                  <td className="px-4 py-2 text-right">{moneyCr(m.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => m.donors > 0 && setModalMonth(m.name)}
                      disabled={m.donors === 0}
                      className={`font-semibold ${
                        m.donors > 0
                          ? "text-emerald-600 underline hover:text-emerald-700"
                          : "text-slate-300"
                      }`}
                    >
                      {m.donors}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CardGroup title="By Type (Cash/Kind/SE)" rows={data.byType} />
      <CardGroup title="By Donor Type" rows={data.byDonorType} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="font-display font-semibold text-navy-900 mb-4 text-sm">
          By KAM — Achieved (Target overlay not connected yet)
        </p>
        <ResponsiveContainer width="100%" height={Math.max(220, data.byKAM.length * 36)}>
          <BarChart data={data.byKAM} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `${(v / 10000000).toFixed(0)}Cr`} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} interval={0} />
            <Tooltip content={<KamTooltip />} />
            <Bar dataKey="amount" fill="#22316b" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="font-display font-semibold text-navy-900 mb-4 text-sm">By Platform</p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data.byPlatform}
              dataKey="amount"
              nameKey="name"
              outerRadius={100}
              label={(d) => `${d.name}: ${d.donors} donors`}
            >
              {data.byPlatform.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<PlatformTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <FilterTable columns={TABLE_COLUMNS} rows={data.table} />

      <DonorDrilldownModal
        open={!!modalMonth}
        onClose={() => setModalMonth(null)}
        monthName={modalMonth}
        fy={data.fy}
        donors={monthDonors}
      />
    </div>
  );
}