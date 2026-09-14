import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { moneyCr, fullMoney } from "../lib/format.js";

// Cash / Kind / School Engagement pill filter — same pattern as the Type
// filter on the FY Comparison page. `selected: null` means "everything".
function FilterGroup({ label, options, selected, onToggle }) {
  if (!options || options.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected == null || selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, amount, donors, accent = "emerald" }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${theme}`}>{moneyCr(amount)}</p>
      <p className="text-xs text-slate-400 mt-1">{donors} unique donors</p>
    </div>
  );
}

// Full-table breakdown card (title + navy-headed table) — used for By
// Donor Type / By KAM / By Platform, which get the dashboard's full
// table treatment instead of a compact list.
// table-fixed + explicit column widths keep the header and every data
// row's three columns lined up even when a name wraps to two lines.
function BreakdownTable({ title, nameLabel, rows }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="font-display font-bold text-navy-900 text-base mb-3">{title}</p>
      <div className="overflow-hidden rounded-xl border border-slate-100">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[36%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="bg-navy-900 text-white text-left">
              <th className="px-4 py-2.5 align-top font-semibold">{nameLabel}</th>
              <th className="px-4 py-2.5 align-top font-semibold text-center">Total Amount</th>
              <th className="px-4 py-2.5 align-top font-semibold text-center">Donors</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, i) => (
              <tr key={r.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2.5 align-top text-navy-900">{r.name}</td>
                <td className="px-4 py-2.5 align-top text-center font-bold text-navy-900 whitespace-nowrap">
                  {moneyCr(r.amount)}
                </td>
                <td className="px-4 py-2.5 align-top text-center text-slate-400">{r.donors}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-center text-slate-400 text-xs">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function monthNameOf(closingDate) {
  if (!closingDate) return null;
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

const TYPE_THEME = {
  Cash: "bg-emerald-50 text-emerald-700",
  Kind: "bg-amber-50 text-amber-700",
  "School Engagement": "bg-indigo-50 text-indigo-700",
};

const DONOR_TYPE_THEME = {
  NPO: "bg-purple-50 text-purple-700",
  Corporate: "bg-sky-50 text-sky-700",
  Individual: "bg-emerald-50 text-emerald-700",
  Business: "bg-amber-50 text-amber-700",
  College: "bg-pink-50 text-pink-700",
};

function Pill({ value, theme }) {
  if (!value || value === "Unspecified") return <span className="text-slate-300">—</span>;
  const cls = theme[value] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      {value}
    </span>
  );
}

function toCsvValue(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows) {
  const header = ["S.No", "Name", "Amount", "Month", "Type", "Donor Type", "KAM", "SPOC"];
  const lines = [header.join(",")];
  rows.forEach((r, i) => {
    lines.push(
      [i + 1, r.account, r.amount, monthNameOf(r.closingDate) || "", r.type, r.donorType, r.kam, r.spoc]
        .map(toCsvValue)
        .join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "donor-history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 10;

// The main "Donor History" table at the bottom of the page: search by
// name/KAM/SPOC, an optional per-column filter row, CSV export, and
// numbered pagination — styled after the reference donor-history table.
function DonorHistoryTable({ rows }) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState({ month: "", type: "", donorType: "", kam: "", spoc: "" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.account} ${r.kam} ${r.spoc}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const month = monthNameOf(r.closingDate) || "";
      if (colFilters.month && !month.toLowerCase().includes(colFilters.month.toLowerCase())) return false;
      if (colFilters.type && !(r.type || "").toLowerCase().includes(colFilters.type.toLowerCase())) return false;
      if (colFilters.donorType && !(r.donorType || "").toLowerCase().includes(colFilters.donorType.toLowerCase())) return false;
      if (colFilters.kam && !(r.kam || "").toLowerCase().includes(colFilters.kam.toLowerCase())) return false;
      if (colFilters.spoc && !(r.spoc || "").toLowerCase().includes(colFilters.spoc.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const updateSearch = (v) => {
    setSearch(v);
    setPage(0);
  };
  const updateColFilter = (key, v) => {
    setColFilters((f) => ({ ...f, [key]: v }));
    setPage(0);
  };

  // Windowed page numbers around the current page (max 5 buttons).
  const pageNumbers = [];
  const windowStart = Math.max(0, Math.min(safePage - 2, totalPages - 5));
  for (let i = windowStart; i < Math.min(totalPages, windowStart + 5); i++) pageNumbers.push(i);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-display font-bold text-navy-900 text-xl">Donor History</p>
          <p className="text-sm text-slate-400">A detailed list of donors, their contributions and key details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search by name, KAM or SPOC…"
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-400 w-56"
          />
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
              showFilters ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            Filter
          </button>
          <button
            onClick={() => downloadCsv(filtered)}
            className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 text-navy-700 hover:border-slate-300"
          >
            Export
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-semibold">S.No</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Month</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Donor Type</th>
                <th className="px-4 py-3 font-semibold">KAM</th>
                <th className="px-4 py-3 font-semibold">SPOC</th>
              </tr>
              {showFilters && (
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2" />
                  <th className="px-4 py-2" />
                  <th className="px-4 py-2" />
                  <th className="px-4 py-2">
                    <input
                      value={colFilters.month}
                      onChange={(e) => updateColFilter("month", e.target.value)}
                      placeholder="Filter…"
                      className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      value={colFilters.type}
                      onChange={(e) => updateColFilter("type", e.target.value)}
                      placeholder="Filter…"
                      className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      value={colFilters.donorType}
                      onChange={(e) => updateColFilter("donorType", e.target.value)}
                      placeholder="Filter…"
                      className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      value={colFilters.kam}
                      onChange={(e) => updateColFilter("kam", e.target.value)}
                      placeholder="Filter…"
                      className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      value={colFilters.spoc}
                      onChange={(e) => updateColFilter("spoc", e.target.value)}
                      placeholder="Filter…"
                      className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                    />
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={`${r.dealName}-${start + i}`} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-3 text-slate-500">{String(start + i + 1).padStart(2, "0")}</td>
                  <td className="px-4 py-3 text-navy-900 font-medium">{r.account}</td>
                  <td className="px-4 py-3 text-right font-bold text-navy-900 whitespace-nowrap" title={fullMoney(r.amount)}>
                    {moneyCr(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{monthNameOf(r.closingDate) || "—"}</td>
                  <td className="px-4 py-3">
                    <Pill value={r.type} theme={TYPE_THEME} />
                  </td>
                  <td className="px-4 py-3">
                    <Pill value={r.donorType} theme={DONOR_TYPE_THEME} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.kam}</td>
                  <td className="px-4 py-3 text-slate-600">{r.spoc}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-xs">
                    No records match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 text-sm text-slate-400">
        <span>
          {filtered.length === 0
            ? "Showing 0 records"
            : `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} records`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-navy-700"
          >
            ‹
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-semibold ${
                p === safePage ? "bg-navy-900 text-white" : "border border-slate-200 text-navy-700 hover:border-slate-300"
              }`}
            >
              {p + 1}
            </button>
          ))}
          <button
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
            className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-navy-700"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

const PREV_FY = "2025-2026";

function rupeeTick(v) {
  return new Intl.NumberFormat("en-IN").format(v || 0);
}

// Always-visible value label above (green/current-FY) or below
// (red/prior-FY) each point. A small white chip behind the text keeps
// it legible even when the two lines' labels land close together —
// recharts renders this per-point via the Line's `label` render prop.
function makeValueLabel(color, dy) {
  return ({ x, y, value }) => {
    if (value == null) return null;
    const text = `₹ ${(value / 10000000).toFixed(2)} Cr`;
    const chipWidth = text.length * 6.5 + 12;
    const ly = y + dy;
    return (
      <g>
        <rect
          x={x - chipWidth / 2}
          y={ly - 12}
          width={chipWidth}
          height={17}
          rx={4}
          fill="#ffffff"
          fillOpacity={0.9}
        />
        <text x={x} y={ly} textAnchor="middle" fontSize={12} fontWeight="700" fill={color}>
          {text}
        </text>
      </g>
    );
  };
}

// Hover overlay: a vertical crosshair line plus a small box showing both
// fiscal years' values for the month under the cursor.
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-3 text-sm min-w-[160px]">
      <p className="font-display font-semibold text-navy-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-semibold" style={{ color: p.stroke }}>
          {p.name} : {p.value == null ? "—" : moneyCr(p.value)}
        </p>
      ))}
    </div>
  );
}

// Two-line trend chart (current FY vs the prior FY) sitting next to the
// month-wise table, restricted to the months that have actually
// happened so far this FY (April through the current month) — same
// straight-line, always-labeled style as the reference chart.
function ConversionTrendChart({ chartData, currentFY, prevFY }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="font-display font-bold text-navy-900 text-base mb-3">Conversion Trend</p>
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 34, right: 24, left: 12, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#64748b" }}
            label={{ value: "Actual Conversion Month", position: "insideBottom", offset: -18, fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={rupeeTick}
            tick={{ fontSize: 11, fill: "#64748b" }}
            width={90}
            label={{ value: "Sum of Amount", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
          <Line
            type="linear"
            dataKey="prev"
            name={prevFY}
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 6, fill: "#ef4444", strokeWidth: 0 }}
            label={makeValueLabel("#ef4444", 28)}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="cur"
            name={currentFY}
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
            label={makeValueLabel("#10b981", -20)}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 text-xs text-slate-500 mt-2">
        <span className="text-slate-400">Fiscal year:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          {prevFY}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          {currentFY}
        </span>
      </div>
    </div>
  );
}

const FY = "2026-2027";

export default function CloseddonorsModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prevYearData, setPrevYearData] = useState(null);

  // Cash / Kind / School Engagement filter. null = everything selected.
  const [filterOptions, setFilterOptions] = useState({ types: [] });
  const [selectedTypes, setSelectedTypes] = useState(null);

  const toggleType = (value) => {
    setSelectedTypes((current) => {
      const all = filterOptions.types;
      const base = current == null ? all : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return current; // never allow zero selected
      if (next.length === all.length) return null; // back to "everything"
      return next;
    });
  };

  useEffect(() => {
    fetch(`/api/crm-analysis/filter-options`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setFilterOptions({ types: json.types || [] }))
      .catch(() => {
        /* Filter pills just won't render if this fails — non-fatal. */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fy: FY });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    fetch(`/api/crm-analysis/closed-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTypes]);

  // Fetched separately, purely to draw the prior-year line on the trend
  // chart — this page otherwise stays scoped to FY 2026-27 only.
  useEffect(() => {
    const params = new URLSearchParams({ fy: PREV_FY });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    fetch(`/api/crm-analysis/closed-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setPrevYearData)
      .catch(() => {
        /* Chart just renders with the current-FY line only if this fails. */
      });
  }, [selectedTypes]);

  const chartData = useMemo(() => {
    if (!data) return [];
    // Only the months that have actually happened so far this FY (April
    // through the current month) — matching months still to come would
    // just be flat zero lines cluttering the chart.
    const curIdx = data.monthWise.findIndex((m) => m.name === data.currentMonth.name);
    const upto = curIdx === -1 ? data.monthWise.length : curIdx + 1;
    return data.monthWise.slice(0, upto).map((m, i) => ({
      month: m.name,
      cur: m.amount,
      prev: prevYearData?.monthWise?.[i]?.amount ?? null,
    }));
  }, [data, prevYearData]);

  const filterBar = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <FilterGroup
        label="Type"
        options={filterOptions.types}
        selected={selectedTypes}
        onToggle={toggleType}
      />
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {filterBar}
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
          Loading closed donors…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {filterBar}
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load closed donors: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {filterBar}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={`FY ${data.fy} Total`}
          amount={data.totals.amount}
          donors={data.totals.donors}
          accent="emerald"
        />
        <KpiCard
          label={`Total Pipeline ${data.fy}`}
          amount={data.pipelineTotals.amount}
          donors={data.pipelineTotals.donors}
          accent="pink"
        />
        <KpiCard
          label={`${data.currentMonth.name} Month Conversion`}
          amount={data.currentMonth.amount}
          donors={data.currentMonth.donors}
          accent="navy"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-4">
          <BreakdownTable title="By Platform" nameLabel="Platform" rows={data.byPlatform} />
          <BreakdownTable title="By Donor Type" nameLabel="Donor Type" rows={data.byDonorType} />
        </div>
        <BreakdownTable title="By KAM" nameLabel="KAM" rows={data.byKAM} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto,1fr] items-start">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden self-start">
          <div className="bg-navy-900 text-white px-5 py-2.5">
            <p className="font-display font-semibold text-xs whitespace-nowrap">
              Month-wise conversion (FY {data.fy})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="pl-5 pr-6 py-2 font-semibold whitespace-nowrap">Month</th>
                  <th className="pr-6 py-2 font-semibold text-right whitespace-nowrap">Amount</th>
                  <th className="pr-5 py-2 font-semibold text-right whitespace-nowrap">Donors</th>
                </tr>
              </thead>
              <tbody>
                {data.monthWise.map((m, i) => (
                  <tr key={m.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                    <td className="pl-5 pr-6 py-2 text-navy-900 font-medium whitespace-nowrap">{m.name}</td>
                    <td className="pr-6 py-2 text-right whitespace-nowrap">{moneyCr(m.amount)}</td>
                    <td className="pr-5 py-2 text-right text-slate-500 whitespace-nowrap">{m.donors}</td>
                  </tr>
                ))}
                {data.monthWise.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-slate-400 text-xs">
                      No closed donors this FY
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ConversionTrendChart chartData={chartData} currentFY={data.fy} prevFY={PREV_FY} />
      </div>

      <DonorHistoryTable rows={data.table} />
    </div>
  );
}