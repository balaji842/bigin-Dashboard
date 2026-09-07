import { useEffect, useMemo, useRef, useState } from "react";
import { moneyCr } from "../lib/format.js";
import { IconClipboard, IconCheckCircle, IconXCircle } from "./icons.jsx";
import KamComparisonTables from "./KamComparisonTables.jsx";

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function FunnelIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
    </svg>
  );
}

// Distinct up/down-chevron icon for sort-only headers, so it reads
// differently from the funnel (filter) icon used elsewhere.
function SortIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}

function ArrowUpIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

// Filter-only column header control (checkbox list, no sort) — used for
// every categorical column: Type of Engagement, Engagement Status,
// Platform, SPOC, KAM, Donor Type, Category. `selected: null` means
// "everything" (no filtering on that field).
function ColumnFilterMenu({ label, options, selected, onToggle, onSelectAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = selected == null;

  return (
    <span className="relative inline-flex items-center gap-1" ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-0.5 rounded ${!allSelected ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
        aria-label={`Filter ${label}`}
      >
        <FunnelIcon className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="absolute z-30 top-full mt-1 left-1/2 -translate-x-1/2 w-52 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden text-left normal-case"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Filter</p>
            {!allSelected && (
              <button type="button" onClick={onSelectAll} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                Select all
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = allSelected || selected.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-navy-900 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

// Sort-only column header control (Ascending/Descending, no filter) —
// used only for the two Amount (₹) columns. No popup: clicking the icon
// cycles straight through none → ascending → descending → none.
function ColumnSortMenu({ label, sortDir, onSort }) {
  const nextDir = sortDir === null ? "asc" : sortDir === "asc" ? "desc" : null;

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onSort(nextDir)}
        className={`p-0.5 rounded ${sortDir != null ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
        aria-label={`Sort ${label} ${sortDir === "asc" ? "descending" : sortDir === "desc" ? "off" : "ascending"}`}
        title={sortDir === "asc" ? "Ascending — click for descending" : sortDir === "desc" ? "Descending — click to clear" : "Click to sort ascending"}
      >
        {sortDir === "asc" ? (
          <ArrowUpIcon className="w-3.5 h-3.5" />
        ) : sortDir === "desc" ? (
          <ArrowDownIcon className="w-3.5 h-3.5" />
        ) : (
          <SortIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </span>
  );
}

// Shared clickable shell for the 3 summary cards — just the border/ring
// active-state styling. Each card supplies its own internal layout as
// children, since Total/Engaged/Not Engaged each show different content.
function SummaryCardShell({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-sm p-5 transition-colors ${
        active ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-100 bg-white hover:border-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryIconBadge({ iconBg, icon: Icon }) {
  return (
    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

function EngagementPill({ engaged }) {
  return engaged ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">
      <IconCheckCircle className="w-3.5 h-3.5" /> Engaged
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 whitespace-nowrap">
      <IconXCircle className="w-3.5 h-3.5" /> Not Engaged
    </span>
  );
}

const DONOR_TYPE_COLORS = {
  Corporate: "bg-emerald-50 text-emerald-700",
  Individual: "bg-blue-50 text-blue-700",
  Business: "bg-indigo-50 text-indigo-700",
  NGO: "bg-amber-50 text-amber-700",
};

function DonorTypeBadge({ value }) {
  const cls = DONOR_TYPE_COLORS[value] || "bg-slate-100 text-slate-600";
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{value}</span>;
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Categorical columns: checkbox filter only, no sort.
const FILTERABLE_KEYS = ["fy1Type", "fy2Type", "engaged", "platform", "spoc", "kam", "donorType", "category"];
// Numeric columns: sort only, no filter.
const SORTABLE_KEYS = ["fy1Amount", "fy2Amount"];

// How to read each column's comparable value off a row.
const COLUMN_DEFS = {
  fy1Type: (r) => r.fy1Type || "",
  fy2Type: (r) => r.fy2Type || "",
  engaged: (r) => (r.engaged ? "Engaged" : "Not Engaged"),
  platform: (r) => r.platform || "",
  spoc: (r) => r.spoc || "",
  kam: (r) => r.kam || "",
  donorType: (r) => r.donorType || "",
  category: (r) => r.category || "",
  fy1Amount: (r) => r.fy1Amount,
  fy2Amount: (r) => r.fy2Amount,
};

export default function EngagementStatusModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fy1 = "2025-2026";
  const fy2 = "2026-2027";

  const [search, setSearch] = useState("");

  // One filter state per filterable (categorical) column — null means
  // "everything".
  const [filters, setFilters] = useState(
    Object.fromEntries(FILTERABLE_KEYS.map((k) => [k, null]))
  );

  // Only one column sorts at a time, and only the two Amount columns
  // are sortable.
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm-analysis/engagement-status?fy1=${fy1}&fy2=${fy2}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Distinct option list per filterable column, computed once data is in.
  const optionsFor = useMemo(() => {
    const out = {};
    for (const key of FILTERABLE_KEYS) out[key] = [];
    if (!data) return out;
    for (const key of FILTERABLE_KEYS) {
      const set = new Set();
      data.rows.forEach((r) => {
        const v = COLUMN_DEFS[key](r);
        if (v) set.add(v);
      });
      out[key] = [...set].sort();
    }
    return out;
  }, [data]);

  const toggleFilter = (key) => (value) => {
    setFilters((prev) => {
      const allOptions = optionsFor[key];
      const current = prev[key];
      const base = current == null ? allOptions : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      let resolved;
      if (next.length === 0) resolved = current; // never allow zero selected
      else if (next.length === allOptions.length) resolved = null; // back to "everything"
      else resolved = next;
      return { ...prev, [key]: resolved };
    });
  };

  const clearFilter = (key) => () => setFilters((prev) => ({ ...prev, [key]: null }));

  const setSortFor = (column) => (dir) => {
    if (dir == null) {
      setSortColumn(null);
      setSortDir(null);
    } else {
      setSortColumn(column);
      setSortDir(dir);
    }
  };

  // FY1/FY2 Type of Engagement filters behave differently depending on
  // whether one or both are active:
  //   - Only ONE set: plain row-level filter on that side (pick "Cash"
  //     on FY1 -> only FY1=Cash rows show, Kind rows are hidden).
  //   - BOTH set: cross-year mode — finds donors who have *some* row
  //     matching the FY1 filter AND *some* row matching the FY2 filter
  //     (e.g. gave Kind in FY1, Cash in FY2), then shows only the rows
  //     that actually match one side or the other for those donors —
  //     not every unrelated row that donor happens to have.
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const fy1Filter = filters.fy1Type;
    const fy2Filter = filters.fy2Type;

    let baseRows = data.rows;

    if (fy1Filter != null && fy2Filter != null) {
      const fy1Donors = new Set();
      const fy2Donors = new Set();
      for (const r of data.rows) {
        if (r.fy1Type && fy1Filter.includes(r.fy1Type)) fy1Donors.add(r.account);
        if (r.fy2Type && fy2Filter.includes(r.fy2Type)) fy2Donors.add(r.account);
      }
      baseRows = data.rows.filter((r) => {
        if (!fy1Donors.has(r.account) || !fy2Donors.has(r.account)) return false;
        const matchesFy1 = r.fy1Type && fy1Filter.includes(r.fy1Type);
        const matchesFy2 = r.fy2Type && fy2Filter.includes(r.fy2Type);
        return matchesFy1 || matchesFy2;
      });
    } else if (fy1Filter != null) {
      baseRows = data.rows.filter((r) => r.fy1Type && fy1Filter.includes(r.fy1Type));
    } else if (fy2Filter != null) {
      baseRows = data.rows.filter((r) => r.fy2Type && fy2Filter.includes(r.fy2Type));
    }

    let rows = baseRows.filter((r) => {
      if (q && !r.account.toLowerCase().includes(q)) return false;
      for (const key of FILTERABLE_KEYS) {
        if (key === "fy1Type" || key === "fy2Type") continue; // handled above
        const selected = filters[key];
        if (selected == null) continue;
        const value = COLUMN_DEFS[key](r);
        if (!value || !selected.includes(value)) return false;
      }
      return true;
    });

    if (sortColumn && sortDir) {
      const getValue = COLUMN_DEFS[sortColumn];
      rows = [...rows].sort((a, b) => {
        const av = getValue(a);
        const bv = getValue(b);
        const aEmpty = av == null || av === "";
        const bEmpty = bv == null || bv === "";
        // Blank/null values always sink to the bottom regardless of direction.
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }

    return rows;
  }, [data, search, filters, sortColumn, sortDir]);

  // Unique-donor counts AND amount totals for the summary cards — now
  // computed from the FILTERED rows (search + every column filter), so
  // the cards reflect whatever the table currently shows. Note: clicking
  // the Engaged/Not Engaged card itself sets filters.engaged, so once
  // one of those is active the other card will correctly read 0 — that's
  // expected, not a bug. "Not engaged" donors have no FY2 activity by
  // definition, so there's no notEngagedFy2Amount to show. `totalAmount`
  // is FY1-only (the Total card is scoped to FY 2025-2026, not combined).
  const donorSummary = useMemo(() => {
    const seen = new Map(); // account -> engaged
    let totalAmount = 0;
    let engagedFy1Amount = 0;
    let engagedFy2Amount = 0;
    let notEngagedFy1Amount = 0;
    for (const r of filteredRows) {
      if (!seen.has(r.account)) seen.set(r.account, r.engaged);
      totalAmount += r.fy1Amount || 0;
      if (r.engaged) {
        engagedFy1Amount += r.fy1Amount || 0;
        engagedFy2Amount += r.fy2Amount || 0;
      } else {
        notEngagedFy1Amount += r.fy1Amount || 0;
      }
    }
    let engaged = 0;
    for (const isEngaged of seen.values()) if (isEngaged) engaged++;
    return {
      total: seen.size,
      engaged,
      notEngaged: seen.size - engaged,
      totalAmount,
      engagedFy1Amount,
      engagedFy2Amount,
      notEngagedFy1Amount,
    };
  }, [filteredRows]);

  // Reset to page 1 whenever the filtered/sorted set or page size changes.
  useEffect(() => setPage(1), [search, filters, sortColumn, sortDir, rowsPerPage]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Donor-group index computed over the FULL filtered list (not just the
  // current page), so S.No keeps counting up across pages instead of
  // resetting to 1 every page. Falls back to per-row numbering wherever
  // a donor's rows aren't adjacent (e.g. after a Type-of-Engagement
  // column filter scrambles order) — same safe-degrade rule as merging.
  const filteredGroupIndices = useMemo(() => {
    const indices = [];
    let gi = -1;
    let prevAccount = null;
    for (const r of filteredRows) {
      if (r.account !== prevAccount) {
        gi++;
        prevAccount = r.account;
      }
      indices.push(gi);
    }
    return indices;
  }, [filteredRows]);
  const pageGroupIndices = filteredGroupIndices.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // "Showing X to Y of Z entries" should count donors (S.No groups), not
  // raw sub-rows — a donor with 2 Type-of-Engagement rows is 1 entry,
  // not 2. Total comes from the last group index in the whole filtered
  // list; the on-page range comes from the first/last group index shown.
  const totalEntries = filteredGroupIndices.length > 0 ? filteredGroupIndices[filteredGroupIndices.length - 1] + 1 : 0;
  const firstEntryOnPage = pageGroupIndices.length > 0 ? pageGroupIndices[0] + 1 : 0;
  const lastEntryOnPage = pageGroupIndices.length > 0 ? pageGroupIndices[pageGroupIndices.length - 1] + 1 : 0;

  const pageNumbers = useMemo(() => {
    const nums = [];
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    let end = Math.min(pageCount, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, pageCount]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
        Loading engagement status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load engagement status: {error}
      </div>
    );
  }

  // Small helpers so each header cell wiring below stays one line.
  const filterMenuProps = (key, label) => ({
    label,
    options: optionsFor[key],
    selected: filters[key],
    onToggle: toggleFilter(key),
    onSelectAll: clearFilter(key),
  });
  const sortMenuProps = (key, label) => ({
    label,
    sortDir: sortColumn === key ? sortDir : null,
    onSort: setSortFor(key),
  });

  // Merge Donor Name and Engagement Status into one visual row per donor
  // when that donor has multiple Type of Engagement sub-rows (e.g. Kind
  // + School Engagement). This only merges rows that are actually
  // adjacent on the current page — if a Type-of-Engagement sort has
  // scattered a donor's rows apart, each row just renders on its own
  // (safe fallback; never merges unrelated donors together).
  const rowSpanFor = (i) => {
    if (i > 0 && pageRows[i - 1].account === pageRows[i].account) return 0; // covered by a prior rowSpan
    let span = 1;
    while (i + span < pageRows.length && pageRows[i + span].account === pageRows[i].account) span++;
    return span;
  };

  return (
    <div className="space-y-5">
      <KamComparisonTables fy1={fy1} fy2={fy2} />

      {/* Summary cards — click to filter Engagement Status; the Total
          card resets that filter back to showing everyone. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCardShell active={filters.engaged == null} onClick={() => setFilters((prev) => ({ ...prev, engaged: null }))}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Total Amount</p>
            <SummaryIconBadge iconBg="bg-indigo-100 text-indigo-600" icon={IconClipboard} />
          </div>
          <p className="font-display text-2xl font-bold text-navy-800">{moneyCr(donorSummary.totalAmount)}</p>
          <p className="text-xs text-slate-400 mb-3">for FY {fy1}</p>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Total Donors</p>
            <p className="font-display text-xl font-bold text-indigo-700">{donorSummary.total}</p>
            <p className="text-xs text-slate-400">donors</p>
          </div>
        </SummaryCardShell>

        <SummaryCardShell
          active={filters.engaged != null && filters.engaged.length === 1 && filters.engaged[0] === "Engaged"}
          onClick={() => setFilters((prev) => ({ ...prev, engaged: ["Engaged"] }))}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Engaged Donors</p>
            <SummaryIconBadge iconBg="bg-emerald-100 text-emerald-600" icon={IconCheckCircle} />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-indigo-700">FY {fy1}</p>
              <p className="text-lg font-bold text-emerald-700">{moneyCr(donorSummary.engagedFy1Amount)}</p>
              <p className="text-[11px] text-slate-400">Total Amount</p>
            </div>
            <div className="border-l border-slate-100 pl-3">
              <p className="text-xs font-semibold text-indigo-700">FY {fy2}</p>
              <p className="text-lg font-bold text-emerald-700">{moneyCr(donorSummary.engagedFy2Amount)}</p>
              <p className="text-[11px] text-slate-400">Total Amount</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Engaged Donors</p>
            <p className="font-display text-xl font-bold text-emerald-700">{donorSummary.engaged}</p>
            <p className="text-xs text-slate-400">donors</p>
          </div>
        </SummaryCardShell>

        <SummaryCardShell
          active={filters.engaged != null && filters.engaged.length === 1 && filters.engaged[0] === "Not Engaged"}
          onClick={() => setFilters((prev) => ({ ...prev, engaged: ["Not Engaged"] }))}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Not Engaged Donors</p>
            <SummaryIconBadge iconBg="bg-red-100 text-red-600" icon={IconXCircle} />
          </div>
          <p className="text-xs font-semibold text-red-600">FY {fy1}</p>
          <p className="font-display text-2xl font-bold text-red-600">{moneyCr(donorSummary.notEngagedFy1Amount)}</p>
          <p className="text-xs text-slate-400 mb-3">Total Amount</p>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Not Engaged Donors</p>
            <p className="font-display text-xl font-bold text-red-600">{donorSummary.notEngaged}</p>
            <p className="text-xs text-slate-400">donors</p>
          </div>
        </SummaryCardShell>
      </div>

      {/* Filter bar — donor name search only; every other filter now
          lives in its own column header, CRM-table style. */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Search Donor</p>
        <div className="relative max-w-sm">
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a donor name…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white px-4 sm:px-5 py-3 flex items-center gap-2">
          <IconClipboard className="w-4 h-4" />
          <p className="font-display font-semibold text-sm">Donor Wise Comparison</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1500px]">
            <thead>
              <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th rowSpan={2} className="px-3 py-2.5 font-semibold text-left align-middle">S.No</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold text-left align-middle">Donor Name</th>
                <th colSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">FY {fy1}</th>
                <th colSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">FY {fy2}</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">Difference</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">Percentage (%)</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">Amount Difference (₹)</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">
                  <ColumnFilterMenu {...filterMenuProps("engaged", "Engagement Status")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...filterMenuProps("platform", "Platform")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...filterMenuProps("spoc", "SPOC")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...filterMenuProps("kam", "KAM")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...filterMenuProps("donorType", "Donor Type")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...filterMenuProps("category", "Category")} />
                </th>
              </tr>
              <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-3 py-2 font-medium align-middle border-l border-slate-100">
                  <ColumnSortMenu {...sortMenuProps("fy1Amount", "Amount (₹)")} />
                </th>
                <th className="px-3 py-2 font-medium align-middle">
                  <ColumnFilterMenu {...filterMenuProps("fy1Type", "Type of Engagement")} />
                </th>
                <th className="px-3 py-2 font-medium align-middle border-l border-slate-100">
                  <ColumnSortMenu {...sortMenuProps("fy2Amount", "Amount (₹)")} />
                </th>
                <th className="px-3 py-2 font-medium align-middle">
                  <ColumnFilterMenu {...filterMenuProps("fy2Type", "Type of Engagement")} />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const span = rowSpanFor(i);
                const isContinuation = span === 0;
                return (
                  <tr key={`${r.account}-${r.fy1Type}-${r.fy2Type}-${i}`} className={pageGroupIndices[i] % 2 === 1 ? "bg-slate-50" : ""}>
                    {!isContinuation && (
                      <td rowSpan={span} className="px-3 py-2.5 text-slate-400 align-middle">{pageGroupIndices[i] + 1}</td>
                    )}
                    {!isContinuation && (
                      <td rowSpan={span} className="px-3 py-2.5 font-medium text-navy-900 whitespace-nowrap align-middle border-r border-slate-100">
                        {r.account}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right text-slate-700 border-l border-slate-100 whitespace-nowrap align-middle">
                      {r.fy1Amount != null ? moneyCr(r.fy1Amount) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                      {r.fy1Type || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 border-l border-slate-100 whitespace-nowrap align-middle">
                      {r.fy2Amount != null ? moneyCr(r.fy2Amount) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                      {r.fy2Type || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center border-l border-slate-100 whitespace-nowrap align-middle">
                      {r.diffAmount != null ? (
                        r.diffAmount > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <ArrowUpIcon className="w-3.5 h-3.5" /> Increase
                          </span>
                        ) : r.diffAmount < 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-500">
                            <ArrowDownIcon className="w-3.5 h-3.5" /> Decrease
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">— No Change</span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap align-middle">
                      {r.diffPct != null ? (
                        <span
                          className={`font-semibold ${
                            r.diffPct > 0 ? "text-emerald-600" : r.diffPct < 0 ? "text-red-500" : "text-slate-500"
                          }`}
                        >
                          {r.diffPct > 0 ? "" : r.diffPct < 0 ? "-" : ""}{Math.abs(r.diffPct).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap align-middle">
                      {r.diffAmount != null ? (
                        <span
                          className={`font-semibold ${
                            r.diffAmount > 0 ? "text-emerald-600" : r.diffAmount < 0 ? "text-red-500" : "text-slate-500"
                          }`}
                        >
                          {r.diffAmount > 0 ? "+" : r.diffAmount < 0 ? "-" : ""}{moneyCr(r.absDiffAmount)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {!isContinuation && (
                      <td rowSpan={span} className="px-3 py-2.5 text-center border-l border-slate-100 align-middle">
                        <EngagementPill engaged={r.engaged} />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.platform || "—"}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.spoc || "—"}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.kam || "—"}</td>
                    <td className="px-3 py-2.5 text-center align-middle">
                      <DonorTypeBadge value={r.donorType || "Unspecified"} />
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.category || "—"}</td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-3 py-10 text-center text-slate-400 text-xs">
                    No donors match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
          <p>
            Showing {totalEntries === 0 ? 0 : firstEntryOnPage}
            {" "}to {lastEntryOnPage} of {totalEntries} entries
          </p>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Rows per page:
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              >
                {ROWS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 rounded-md border border-slate-200 disabled:opacity-40 text-xs"
              >
                Prev
              </button>
              {pageNumbers[0] > 1 && <span className="px-1 text-xs text-slate-400">…</span>}
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-7 h-7 rounded-md text-xs font-semibold ${
                    n === page ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {n}
                </button>
              ))}
              {pageNumbers[pageNumbers.length - 1] < pageCount && <span className="px-1 text-xs text-slate-400">…</span>}
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                className="px-2 py-1 rounded-md border border-slate-200 disabled:opacity-40 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}