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
import { moneyCr, fullMoney, moneyForDonorType } from "../lib/format.js";
import ExportButton from "./ExportButton.jsx";
import ClearFiltersBar from "./ClearFiltersBar.jsx";
import HeaderFilterMenu, { optionsFor, matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import ColumnSortMenu from "./ColumnSortMenu.jsx";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";
import { filterRows } from "../lib/donorRows.js";

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

// `onDonorsClick` (optional) makes just the donor-count line open a
// drilldown, independent of the card's own onClick (scope toggle) — div
// instead of a button as the outer element so the two click targets
// don't nest one button inside another.
function KpiDonorsLine({ donors, onDonorsClick }) {
  if (!onDonorsClick) {
    return <p className="text-xs text-slate-400 mt-1">{donors} unique donors</p>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (donors > 0) onDonorsClick();
      }}
      disabled={donors === 0}
      className={`text-xs mt-1 font-semibold ${
        donors > 0 ? "text-emerald-600 underline hover:text-emerald-700" : "text-slate-300"
      }`}
    >
      {donors} unique donors
    </button>
  );
}

// Clickable when given an onClick — acts as one of 3 mutually-exclusive
// scope selectors (FY total / open pipeline / current month), matching
// the KpiCard/FYCard pattern already used on the Overview page.
function KpiCard({ label, amount, donors, accent = "emerald", active, onClick, onDonorsClick }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={`text-left rounded-2xl border shadow-sm p-5 transition-colors w-full ${
        active
          ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200"
          : "border-slate-100 bg-white " + (clickable ? "hover:border-slate-200 cursor-pointer" : "")
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${active ? "text-pink-600" : theme}`}>{moneyCr(amount)}</p>
      <KpiDonorsLine donors={donors} onDonorsClick={onDonorsClick} />
    </div>
  );
}

// Client-side equivalent of the server's groupSummary() — amount sum +
// distinct donor (Account_Name) count per group value. Used to recompute
// the breakdown tables client-side when the "Month Conversion" scope is
// selected, without a second network round trip (that scope is just a
// filter over data we already have).
function groupByField(rows, field) {
  const groups = {};
  for (const r of rows) {
    const key = r[field] || "Unspecified";
    if (!groups[key]) groups[key] = { amount: 0, accounts: new Set() };
    groups[key].amount += r.amount || 0;
    if (r.account) groups[key].accounts.add(r.account);
  }
  return Object.entries(groups)
    .map(([name, g]) => ({ name, amount: g.amount, donors: g.accounts.size }))
    .sort((a, b) => b.amount - a.amount);
}

// Full-table breakdown card (title + navy-headed table) — used for By
// Donor Type / By KAM / By Platform, which get the dashboard's full
// table treatment instead of a compact list.
// table-fixed + explicit column widths keep the header and every data
// row's three columns lined up even when a name wraps to two lines.
function BreakdownTable({ title, nameLabel, rows, onDonorsClick }) {
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
                <td className="px-4 py-2.5 align-top text-center whitespace-nowrap">
                  {onDonorsClick ? (
                    <button
                      type="button"
                      onClick={() => r.donors > 0 && onDonorsClick(r.name)}
                      disabled={r.donors === 0}
                      className={`font-semibold ${
                        r.donors > 0 ? "text-emerald-600 underline hover:text-emerald-700" : "text-slate-300"
                      }`}
                    >
                      {r.donors}
                    </button>
                  ) : (
                    <span className="text-slate-400">{r.donors}</span>
                  )}
                </td>
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

function downloadDonorHistoryCsv(rows) {
  const header = ["S.No", "Name", "Amount", "Month", "Type", "Donor Type", "Platform", "KAM", "SPOC"];
  const lines = [header.join(",")];
  rows.forEach((r, i) => {
    lines.push(
      [i + 1, r.account, r.amount, r.monthLabel || "", r.type, r.donorType, r.platform, r.kam, r.spoc]
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
// name/KAM/SPOC, per-column multi-select filters (Month, Type, Donor
// Type, KAM, SPOC), CSV export, and numbered pagination.
function DonorHistoryTable({ rows, subtitle }) {
  const [search, setSearch] = useState("");
  // Multi-select per column — null means "everything" for that column.
  const [filters, setFilters] = useState({ month: null, type: null, donorType: null, kam: null, spoc: null, platform: null });
  const [sortColumn, setSortColumn] = useState(null); // "account" | "amount" | null
  const [sortDir, setSortDir] = useState(null); // "asc" | "desc" | null
  const [page, setPage] = useState(0);

  // Options are always computed from the full `rows` prop (not the
  // filtered set), so a column's checkbox list never shrinks as other
  // filters get applied. Month lives on `monthLabel`, everything else
  // matches its own field name.
  const monthOptions = useMemo(() => optionsFor(rows, "monthLabel"), [rows]);
  const typeOptions = useMemo(() => optionsFor(rows, "type"), [rows]);
  const donorTypeOptions = useMemo(() => optionsFor(rows, "donorType"), [rows]);
  const kamOptions = useMemo(() => optionsFor(rows, "kam"), [rows]);
  const spocOptions = useMemo(() => optionsFor(rows, "spoc"), [rows]);
  const platformOptions = useMemo(() => optionsFor(rows, "platform"), [rows]);
  const optionsByField = {
    month: monthOptions,
    type: typeOptions,
    donorType: donorTypeOptions,
    kam: kamOptions,
    spoc: spocOptions,
    platform: platformOptions,
  };
  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setFilters, setPage, optionsByField);

  const setSortFor = (column) => (dir) => {
    setSortColumn(dir == null ? null : column);
    setSortDir(dir);
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q) {
        const hay = `${r.account} ${r.kam} ${r.spoc}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return (
        matchesFilter(r.monthLabel, filters.month) &&
        matchesFilter(r.type, filters.type) &&
        matchesFilter(r.donorType, filters.donorType) &&
        matchesFilter(r.kam, filters.kam) &&
        matchesFilter(r.spoc, filters.spoc) &&
        matchesFilter(r.platform, filters.platform)
      );
    });
    if (sortColumn && sortDir) {
      out = [...out].sort((a, b) => {
        if (sortColumn === "amount") {
          return sortDir === "asc" ? (a.amount || 0) - (b.amount || 0) : (b.amount || 0) - (a.amount || 0);
        }
        return sortDir === "asc" ? a.account.localeCompare(b.account) : b.account.localeCompare(a.account);
      });
    }
    return out;
  }, [rows, search, filters, sortColumn, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const updateSearch = (v) => {
    setSearch(v);
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
          <p className="text-sm text-slate-400">{subtitle || "A detailed list of donors, their contributions and key details."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search by name, KAM or SPOC…"
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-400 w-56"
          />
          <ExportButton onClick={() => downloadDonorHistoryCsv(filtered)} disabled={filtered.length === 0} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-navy-900 text-white text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">S.No</th>
                <th className="px-4 py-3 font-semibold">
                  <ColumnSortMenu label="Name" sortDir={sortColumn === "account" ? sortDir : null} onSort={setSortFor("account")} />
                </th>
                <th className="px-4 py-3 font-semibold text-right">
                  <ColumnSortMenu label="Amount" sortDir={sortColumn === "amount" ? sortDir : null} onSort={setSortFor("amount")} />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="Month"
                    options={monthOptions}
                    selected={filters.month}
                    onToggle={toggleOption("month")}
                    onSelectAll={selectAll("month")}
                    onClearAll={clearAll("month")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="Type"
                    options={typeOptions}
                    selected={filters.type}
                    onToggle={toggleOption("type")}
                    onSelectAll={selectAll("type")}
                    onClearAll={clearAll("type")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="Donor Type"
                    options={donorTypeOptions}
                    selected={filters.donorType}
                    onToggle={toggleOption("donorType")}
                    onSelectAll={selectAll("donorType")}
                    onClearAll={clearAll("donorType")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="Platform"
                    options={platformOptions}
                    selected={filters.platform}
                    onToggle={toggleOption("platform")}
                    onSelectAll={selectAll("platform")}
                    onClearAll={clearAll("platform")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="KAM"
                    options={kamOptions}
                    selected={filters.kam}
                    onToggle={toggleOption("kam")}
                    onSelectAll={selectAll("kam")}
                    onClearAll={clearAll("kam")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <HeaderFilterMenu
                    label="SPOC"
                    options={spocOptions}
                    selected={filters.spoc}
                    onToggle={toggleOption("spoc")}
                    onSelectAll={selectAll("spoc")}
                    onClearAll={clearAll("spoc")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={`${r.dealName}-${start + i}`} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-3 text-slate-500">{String(start + i + 1).padStart(2, "0")}</td>
                  <td className="px-4 py-3 text-navy-900 font-medium">{r.account}</td>
                  <td className="px-4 py-3 text-right font-bold text-navy-900 whitespace-nowrap" title={fullMoney(r.amount)}>
                    {moneyForDonorType(r.amount, r.donorType)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.monthLabel || "—"}</td>
                  <td className="px-4 py-3">
                    <Pill value={r.type} theme={TYPE_THEME} />
                  </td>
                  <td className="px-4 py-3">
                    <Pill value={r.donorType} theme={DONOR_TYPE_THEME} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.platform}</td>
                  <td className="px-4 py-3 text-slate-600">{r.kam}</td>
                  <td className="px-4 py-3 text-slate-600">{r.spoc}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-400 text-xs">
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

// Axis ticks in Crore, matching the "₹ XX.XX Cr" labels already shown
// on each point — whole numbers stay bare (e.g. "₹80 Cr"), fractional
// values keep one decimal (e.g. "₹32.7 Cr").
function crTick(v) {
  const cr = (v || 0) / 10000000;
  const formatted = Number.isInteger(cr) ? String(cr) : cr.toFixed(1);
  return `₹${formatted} Cr`;
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
            tickFormatter={crTick}
            tick={{ fontSize: 11, fill: "#64748b" }}
            width={90}
            label={{ value: "Sum of Amount (₹ Cr)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }}
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
  const [filterOptions, setFilterOptions] = useState({ types: [], platforms: [] });
  const [selectedTypes, setSelectedTypes] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState(null);

  // Which of the 3 top KPI cards is the active data scope — everything
  // below (breakdown tables, month-wise table, Donor History) follows
  // whichever is selected, same idea as the FY cards on the Overview
  // page. "fy" is the whole-year closed total (the page's original
  // default view), "pipeline" swaps in the open Standard Pipeline for
  // this FY, "month" narrows down to just the current month's closed
  // deals.
  const [scope, setScope] = useState("fy"); // "fy" | "pipeline" | "month"

  const [pipelineData, setPipelineData] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState(null);

  // Generic donor-list popup for any donor count on this page (KPI
  // cards, breakdown table rows, Month-wise table).
  const [drilldown, setDrilldown] = useState(null); // { title, rows } | null
  const openDrilldown = (title, rows) => setDrilldown({ title, rows });

  // The "Total Pipeline" KPI card's donor count needs the open-pipeline
  // table, which is only fetched once the "pipeline" scope has actually
  // been selected — if it hasn't, fetch it on the fly just for this
  // click rather than forcing the person to switch scope first.
  const openPipelineDrilldown = async () => {
    let pd = pipelineData;
    if (!pd) {
      try {
        const params = new URLSearchParams({ fy: FY });
        if (selectedTypes != null) params.set("types", selectedTypes.join(","));
        if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
        const res = await fetch(`/api/crm-analysis/standard-pipeline?${params.toString()}`);
        if (res.ok) {
          pd = await res.json();
          setPipelineData(pd); // cache it — also primes the "pipeline" scope if picked next
        }
      } catch {
        // Falls through with pd still null; drilldown just opens empty.
      }
    }
    openDrilldown("Total Pipeline 2026-2027", pd ? filterRows(pd.table, () => true) : []);
  };

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

  const togglePlatform = (value) => {
    setSelectedPlatforms((current) => {
      const all = filterOptions.platforms;
      const base = current == null ? all : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return current;
      if (next.length === all.length) return null;
      return next;
    });
  };

  useEffect(() => {
    fetch(`/api/crm-analysis/filter-options`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setFilterOptions({ types: json.types || [], platforms: json.platforms || [] }))
      .catch(() => {
        /* Filter pills just won't render if this fails — non-fatal. */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fy: FY });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
    fetch(`/api/crm-analysis/closed-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTypes, selectedPlatforms]);

  // Fetched separately, purely to draw the prior-year line on the trend
  // chart — this page otherwise stays scoped to FY 2026-27 only.
  useEffect(() => {
    const params = new URLSearchParams({ fy: PREV_FY });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
    fetch(`/api/crm-analysis/closed-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setPrevYearData)
      .catch(() => {
        /* Chart just renders with the current-FY line only if this fails. */
      });
  }, [selectedTypes, selectedPlatforms]);

  // The open-pipeline breakdown is only fetched once the "Total
  // Pipeline" card is actually selected — no point paying for it
  // up front when the page defaults to the FY-total scope.
  useEffect(() => {
    if (scope !== "pipeline") return;
    setPipelineLoading(true);
    setPipelineError(null);
    const params = new URLSearchParams({ fy: FY });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
    fetch(`/api/crm-analysis/standard-pipeline?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setPipelineData)
      .catch((e) => setPipelineError(e.message))
      .finally(() => setPipelineLoading(false));
  }, [scope, selectedTypes, selectedPlatforms]);

  // The data actually driving the breakdown tables / month-wise table /
  // Donor History — swaps with the selected scope. "month" is derived
  // client-side from the already-loaded closed-donors data (it's just a
  // filter over what we have); "pipeline" waits on pipelineData above.
  const scoped = useMemo(() => {
    if (!data) return null;

    if (scope === "month") {
      const monthRows = data.table
        .filter((r) => monthNameOf(r.closingDate) === data.currentMonth.name)
        .map((r) => ({ ...r, monthLabel: monthNameOf(r.closingDate) }));
      return {
        label: `${data.currentMonth.name} only`,
        monthColumnLabel: "Month",
        byPlatform: groupByField(monthRows, "platform"),
        byDonorType: groupByField(monthRows, "donorType"),
        byKAM: groupByField(monthRows, "kam"),
        monthWise: data.monthWise.filter((m) => m.name === data.currentMonth.name),
        table: monthRows,
      };
    }

    if (scope === "pipeline") {
      if (!pipelineData) return null;
      return {
        label: `FY ${pipelineData.fy} open pipeline`,
        monthColumnLabel: "Expected Conversion Month",
        byPlatform: pipelineData.byPlatform,
        byDonorType: pipelineData.byDonorType,
        byKAM: pipelineData.byKAM,
        monthWise: pipelineData.monthWise,
        table: pipelineData.table.map((r) => ({
          ...r,
          monthLabel: r.expectedMonth && r.expectedMonth !== "Unspecified" ? r.expectedMonth : null,
        })),
      };
    }

    return {
      label: `FY ${data.fy}, full year`,
      monthColumnLabel: "Month",
      byPlatform: data.byPlatform,
      byDonorType: data.byDonorType,
      byKAM: data.byKAM,
      monthWise: data.monthWise,
      table: data.table.map((r) => ({ ...r, monthLabel: monthNameOf(r.closingDate) })),
    };
  }, [data, scope, pipelineData]);

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

  const hasActiveFilters = selectedTypes != null || selectedPlatforms != null || scope !== "fy";
  const clearAllFilters = () => {
    setSelectedTypes(null);
    setSelectedPlatforms(null);
    setScope("fy");
  };
  const filterSummary = [
    selectedTypes != null ? `Type: ${selectedTypes.join(", ")}` : null,
    selectedPlatforms != null ? `Platform: ${selectedPlatforms.join(", ")}` : null,
    scope === "pipeline"
      ? "Scope: Total Pipeline"
      : scope === "month"
      ? `Scope: ${data?.currentMonth?.name || "Current"} Month`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterBar = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <FilterGroup
        label="Type"
        options={filterOptions.types}
        selected={selectedTypes}
        onToggle={toggleType}
      />
      <FilterGroup
        label="Platform"
        options={filterOptions.platforms}
        selected={selectedPlatforms}
        onToggle={togglePlatform}
      />
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <ClearFiltersBar active={hasActiveFilters} summary={filterSummary} onClear={clearAllFilters} />
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
        <ClearFiltersBar active={hasActiveFilters} summary={filterSummary} onClear={clearAllFilters} />
        {filterBar}
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load closed donors: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <ClearFiltersBar active={hasActiveFilters} summary={filterSummary} onClear={clearAllFilters} />
      {filterBar}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={`FY ${data.fy} Total`}
          amount={data.totals.amount}
          donors={data.totals.donors}
          accent="emerald"
          active={scope === "fy"}
          onClick={() => setScope("fy")}
          onDonorsClick={() => openDrilldown(`FY ${data.fy} Total`, filterRows(data.table, () => true))}
        />
        <KpiCard
          label={`Total Pipeline ${data.fy}`}
          amount={data.pipelineTotals.amount}
          donors={data.pipelineTotals.donors}
          accent="pink"
          active={scope === "pipeline"}
          onClick={() => setScope("pipeline")}
          onDonorsClick={openPipelineDrilldown}
        />
        <KpiCard
          label={`${data.currentMonth.name} Month Conversion`}
          amount={data.currentMonth.amount}
          donors={data.currentMonth.donors}
          accent="navy"
          active={scope === "month"}
          onClick={() => setScope("month")}
          onDonorsClick={() =>
            openDrilldown(
              `${data.currentMonth.name} Month Conversion`,
              filterRows(data.table, (r) => monthNameOf(r.closingDate) === data.currentMonth.name)
            )
          }
        />
      </div>

      {scope === "pipeline" && pipelineLoading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
          Loading open pipeline…
        </div>
      )}

      {scope === "pipeline" && pipelineError && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load open pipeline: {pipelineError}
        </div>
      )}

      {scoped && (
        <>
          <p className="text-xs text-slate-400 -mb-2">
            Showing: <span className="font-semibold text-navy-700">{scoped.label}</span>
          </p>

          <div className="grid gap-4 md:grid-cols-2 items-start">
            <div className="flex flex-col gap-4">
              <BreakdownTable
                title="By Platform"
                nameLabel="Platform"
                rows={scoped.byPlatform}
                onDonorsClick={(name) =>
                  openDrilldown(`Platform: ${name}`, filterRows(scoped.table, (r) => r.platform === name))
                }
              />
              <BreakdownTable
                title="By Donor Type"
                nameLabel="Donor Type"
                rows={scoped.byDonorType}
                onDonorsClick={(name) =>
                  openDrilldown(`Donor Type: ${name}`, filterRows(scoped.table, (r) => r.donorType === name))
                }
              />
            </div>
            <BreakdownTable
              title="By KAM"
              nameLabel="KAM"
              rows={scoped.byKAM}
              onDonorsClick={(name) => openDrilldown(`KAM: ${name}`, filterRows(scoped.table, (r) => r.kam === name))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[auto,1fr] items-start">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden self-start">
              <div className="bg-navy-900 text-white px-5 py-2.5">
                <p className="font-display font-semibold text-xs whitespace-nowrap">
                  {scope === "pipeline"
                    ? `Month-wise pipeline (Expected Conversion, FY ${pipelineData?.fy || data.fy})`
                    : scope === "month"
                    ? `Month-wise conversion — ${data.currentMonth.name} only`
                    : `Month-wise conversion (FY ${data.fy})`}
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
                    {scoped.monthWise.map((m, i) => (
                      <tr key={m.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="pl-5 pr-6 py-2 text-navy-900 font-medium whitespace-nowrap">{m.name}</td>
                        <td className="pr-6 py-2 text-right whitespace-nowrap">{moneyCr(m.amount)}</td>
                        <td className="pr-5 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              m.donors > 0 &&
                              openDrilldown(m.name, filterRows(scoped.table, (r) => r.monthLabel === m.name))
                            }
                            disabled={m.donors === 0}
                            className={`font-semibold ${
                              m.donors > 0 ? "text-emerald-600 underline hover:text-emerald-700" : "text-slate-300"
                            }`}
                          >
                            {m.donors}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {scoped.monthWise.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-center text-slate-400 text-xs">
                          No data for this scope
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <ConversionTrendChart chartData={chartData} currentFY={data.fy} prevFY={PREV_FY} />
          </div>

          <DonorHistoryTable
            rows={scoped.table}
            subtitle={
              scope === "fy"
                ? "A detailed list of donors, their contributions and key details."
                : `Scoped to: ${scoped.label}.`
            }
          />
        </>
      )}

      <DonorDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title}
        donors={drilldown?.rows || []}
      />
    </div>
  );
}