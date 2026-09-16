import { useEffect, useMemo, useState } from "react";
import { moneyCr, fullMoney } from "../lib/format.js";

// Cash / Kind / School Engagement pill filter — same pattern as the
// Conversion and FY Comparison pages. `selected: null` means "everything".
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

// Clickable when given an onClick — acts as one of 2 mutually-exclusive
// scope selectors (FY total / current month), same pattern as the
// Conversion page's KPI cards.
function KpiCard({ label, amount, donors, accent = "pink", active, onClick }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  const clickable = typeof onClick === "function";
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-sm p-5 transition-colors w-full ${
        active
          ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200"
          : "border-slate-100 bg-white " + (clickable ? "hover:border-slate-200" : "")
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${active ? "text-pink-600" : theme}`}>{moneyCr(amount)}</p>
      <p className="text-xs text-slate-400 mt-1">{donors} unique donors</p>
    </Tag>
  );
}

// Client-side equivalent of the server's groupSummary() — amount sum +
// distinct donor (Account_Name) count per group value. Used to recompute
// the breakdown tables client-side when the "Month Pipeline" scope is
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
// Donor Type / By KAM / By Platform, matching the Conversion page.
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
  const header = ["S.No", "Name", "Amount", "Expected Month", "Type", "Donor Type", "KAM", "SPOC"];
  const lines = [header.join(",")];
  rows.forEach((r, i) => {
    lines.push(
      [i + 1, r.account, r.amount, r.expectedMonth || "", r.type, r.donorType, r.kam, r.spoc]
        .map(toCsvValue)
        .join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pipeline-donor-history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 10;

// Same "Donor History" table as the Conversion page, but for open
// pipeline donors — "Month" here is the projected/expected conversion
// month (a picklist field), not an actual closing date.
function DonorHistoryTable({ rows, subtitle }) {
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
      const month = r.expectedMonth || "";
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
          <p className="text-sm text-slate-400">{subtitle || "A detailed list of donors, their pipeline value and key details."}</p>
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
          <table className="w-full text-sm min-w-[840px]">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-semibold">S.No</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Expected Month</th>
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
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.expectedMonth || "—"}</td>
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

const FY = "2026-2027";

export default function StandardPipelineModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cash / Kind / School Engagement filter. null = everything selected.
  const [filterOptions, setFilterOptions] = useState({ types: [] });
  const [selectedTypes, setSelectedTypes] = useState(null);

  // Which KPI card is the active data scope — everything below
  // (breakdown tables, Projected Conversion Month table, Donor History)
  // follows whichever is selected, same idea as the Conversion page.
  // "total" is the whole FY's open pipeline (the original default
  // view); "month" narrows down to just the current month's projected
  // pipeline.
  const [scope, setScope] = useState("total"); // "total" | "month"

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
    fetch(`/api/crm-analysis/standard-pipeline?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTypes]);

  // The data actually driving the breakdown tables / Projected
  // Conversion Month table / Donor History — swaps with the selected
  // scope. "month" is derived client-side from the already-loaded
  // pipeline data (it's just a filter over what we have), so no extra
  // network call is needed.
  const scoped = useMemo(() => {
    if (!data) return null;

    if (scope === "month") {
      const monthRows = data.table.filter((r) => r.expectedMonth === data.currentMonth.name);
      return {
        label: `${data.currentMonth.name} only`,
        byPlatform: groupByField(monthRows, "platform"),
        byDonorType: groupByField(monthRows, "donorType"),
        byKAM: groupByField(monthRows, "kam"),
        monthWise: data.monthWise.filter((m) => m.name === data.currentMonth.name),
        table: monthRows,
      };
    }

    return {
      label: `FY ${data.fy}, full year`,
      byPlatform: data.byPlatform,
      byDonorType: data.byDonorType,
      byKAM: data.byKAM,
      monthWise: data.monthWise,
      table: data.table,
    };
  }, [data, scope]);

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
          Loading standard pipeline…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {filterBar}
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load standard pipeline: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {filterBar}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label={`Total Pipeline ${data.fy}`}
          amount={data.totals.amount}
          donors={data.totals.donors}
          accent="pink"
          active={scope === "total"}
          onClick={() => setScope("total")}
        />
        <KpiCard
          label={`${data.currentMonth.name} Month Pipeline`}
          amount={data.currentMonth.amount}
          donors={data.currentMonth.donors}
          accent="navy"
          active={scope === "month"}
          onClick={() => setScope("month")}
        />
      </div>

      {scoped && (
        <>
          <p className="text-xs text-slate-400 -mb-2">
            Showing: <span className="font-semibold text-navy-700">{scoped.label}</span>
          </p>

          <div className="grid gap-4 md:grid-cols-2 items-start">
            <div className="flex flex-col gap-4">
              <BreakdownTable title="By Platform" nameLabel="Platform" rows={scoped.byPlatform} />
              <BreakdownTable title="By Donor Type" nameLabel="Donor Type" rows={scoped.byDonorType} />
            </div>
            <BreakdownTable title="By KAM" nameLabel="KAM" rows={scoped.byKAM} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-navy-900 text-white px-5 py-3">
              <p className="font-display font-semibold text-sm">
                {scope === "month"
                  ? `Projected conversion month (FY ${data.fy}) — ${data.currentMonth.name} only`
                  : `Projected conversion month (FY ${data.fy}) — April to March`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2 font-semibold">Expected Month</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2 font-semibold text-right">Donors</th>
                  </tr>
                </thead>
                <tbody>
                  {scoped.monthWise
                    .filter((m) => m.amount !== 0 || m.donors !== 0)
                    .map((m, i) => (
                      <tr key={m.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-4 py-2 text-navy-900 font-medium">{m.name}</td>
                        <td className="px-4 py-2 text-right">{moneyCr(m.amount)}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{m.donors}</td>
                      </tr>
                    ))}
                  {scoped.monthWise.filter((m) => m.amount !== 0 || m.donors !== 0).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-slate-400 text-xs">
                        No standard pipeline donors with an expected month set
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DonorHistoryTable
            rows={scoped.table}
            subtitle={
              scope === "total"
                ? "A detailed list of donors, their pipeline value and key details."
                : `Scoped to: ${scoped.label}.`
            }
          />
        </>
      )}
    </div>
  );
}