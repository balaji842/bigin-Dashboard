import { useEffect, useMemo, useRef, useState } from "react";
import { moneyAutoScale } from "../lib/format.js";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";
import ClearFiltersBar from "./ClearFiltersBar.jsx";
import { IconClipboard, IconCheckCircle, IconXCircle } from "./icons.jsx";
import DonorCallsModal from "./DonorCallsModal.jsx";
import { RemarksCell, CallsCell, ExtrasNote, remarksForExport } from "./DonorExtras.jsx";
import { useDonorExtras } from "../lib/useDonorExtras.js";

// Overall Comparison — every donor against EVERY financial year at once.
//
// Filters: financial years and Type (Cash / Kind / School Engagement),
// both multi-select pills like the Type filter on the other pages.
// Table: one row per donor, and for each selected financial year that
// year's Amount and Conversion Month(s) (hover the months for the amount
// split by month, as on the Engagement Status page). The last two columns
// are the donor's Remarks (Bigin Notes) and Calls (Bigin Activities ->
// Calls), matched by the donor's Bigin company id.
//
// Donor-level columns, as on the Engagement Status page: Platform, SPOC, KAM
// and Donor Type (each with its own column filter), and for every financial
// year a "Type of Engagement" column — the Type(s) the donor gave in that
// year (Cash, Kind, School Engagement), next to that year's Amount.
//
// Category (A / B / C) here is based on the donor's CUMULATIVE amount
// across ALL financial years (every Type) — A above ₹1 Cr, B ₹50 L to
// ₹1 Cr, C below ₹50 L. It is calculated on the server and is never
// changed by the filters on this page.
//
// Engagement Status DOES follow the filters, and compares the selected
// financial years: the latest selected year is the "current" one and every
// earlier selected year is "history".
//   - Engaged:     gave in EVERY selected year (all the earlier ones AND the
//                  latest). So every Engaged row has an amount in each
//                  selected year's column.
//   - Not Engaged: gave in an earlier selected year but not in every
//                  selected year — either they stopped (nothing in the
//                  latest year) or there's a gap in an earlier year.
//   - "—":         gave only in the latest year (nothing earlier to compare
//                  with), or only one year is selected.
// With two years (e.g. 2022-23 + 2026-27) that's simply "gave in both" vs
// "gave in 2022-23 only". It's worked out from the amounts shown in the
// table, so the Type filter counts too.
//
// Summary Card: the amount and unique donors for the earlier selected years
// combined and for the latest selected year — from the same donors the
// table lists, so it follows every filter.

const SNO_W = 56;
const DONOR_W = 240;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
const TYPE_ORDER = ["Cash", "Kind", "School Engagement"];
const ENGAGEMENT_OPTIONS = ["Engaged", "Not Engaged"];

// ---------------------------------------------------------------- icons
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
function SortIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}
function ArrowUpIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function ArrowDownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------- filters
// Multi-select pills, same look and behaviour as the Type filter on the
// other pages: `selected: null` = everything; clicking a lit pill turns
// it off, and at least one always stays on.
function PillFilter({ label, options, selected, onToggle }) {
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

// `onSelectAll` ticks everything again (no filter); `onClearAll` unticks
// everything so you can then tick just the few you want.
function ColumnFilterMenu({ label, options, selected, onToggle, onSelectAll, onClearAll }) {
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
  const noneSelected = selected != null && selected.length === 0;

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
          className="absolute z-30 top-full mt-1 left-1/2 -translate-x-1/2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden text-left normal-case"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Filter</p>
            <div className="flex items-center gap-3">
              {!allSelected && (
                <button type="button" onClick={onSelectAll} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                  Select all
                </button>
              )}
              {onClearAll && !noneSelected && (
                <button type="button" onClick={onClearAll} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                  Clear all
                </button>
              )}
            </div>
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

// Sort-only header control: click cycles none → ascending → descending → none.
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

// ---------------------------------------------------------------- months
// Every distinct month a donor gave in, for one financial year, newest
// first with repeats collapsed ("March, April", not "March, March, April").
function monthsText(deals) {
  return [...new Set(deals.map((d) => d.month).filter(Boolean))].join(", ");
}

// The year's amount split by month, in the same order as the text. Gifts
// in the same month are added together; a gift with no closing date goes
// on a "No closing date" line so the lines still add up to the Amount.
function monthSplit(deals) {
  const order = [];
  const totals = {};
  for (const d of deals) {
    const m = d.month || "No closing date";
    if (!(m in totals)) {
      totals[m] = 0;
      order.push(m);
    }
    totals[m] += d.amount || 0;
  }
  return order.map((m) => ({ month: m, amount: totals[m] }));
}

// The Type(s) of Engagement a donor gave in one financial year, in the
// usual order — "Cash", or "Cash, Kind" when they gave more than one Type
// that year. (Deals of Types switched off in the Type filter aren't here.)
function typesText(deals) {
  const present = [...new Set(deals.map((d) => d.type).filter((t) => t && t !== "Unspecified"))];
  return present
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a);
      const ib = TYPE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .join(", ");
}

// Export format: "March - 90000, April - 80000, May - 70000".
function monthsWithAmounts(deals) {
  return monthSplit(deals)
    .map((x) => `${x.month} - ${Number((x.amount || 0).toFixed(2))}`)
    .join(", ");
}

// Conversion Month cell: one line (cut off with "…" if it doesn't fit);
// hovering it opens a small popup with the amount for each month, which
// adds up to the Amount next to it. The popup is `fixed`, so the table's
// horizontal scroll can't clip it.
function MonthBreakdown({ deals }) {
  const [tip, setTip] = useState(null);
  const text = monthsText(deals);
  if (!text) return <span className="text-slate-300">—</span>;

  const split = monthSplit(deals);
  const total = split.reduce((s, x) => s + x.amount, 0);

  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const estHeight = 64 + split.length * 24;
    const fitsBelow = rect.bottom + estHeight + 12 < window.innerHeight;
    setTip({
      left: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130),
      top: fitsBelow ? rect.bottom + 6 : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + 6,
    });
  };

  return (
    <span className="block w-[140px] mx-auto" onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      <span className="block truncate cursor-help underline decoration-dotted decoration-slate-300 underline-offset-4">
        {text}
      </span>
      {tip && (
        <span
          className="fixed z-50 w-60 bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-left normal-case pointer-events-none block no-underline"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom, transform: "translateX(-50%)" }}
        >
          <span className="block text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
            Amount by month
          </span>
          {split.map((s) => (
            <span key={s.month} className="flex items-center justify-between gap-3 text-xs py-0.5">
              <span className="text-slate-600">{s.month}</span>
              <span className="font-semibold text-navy-900 whitespace-nowrap">{moneyAutoScale(s.amount)}</span>
            </span>
          ))}
          <span className="flex items-center justify-between gap-3 text-xs font-bold text-navy-900 border-t border-slate-100 mt-1.5 pt-1.5">
            <span>Total</span>
            <span className="whitespace-nowrap">{moneyAutoScale(total)}</span>
          </span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- category
const CATEGORY_STYLES = {
  A: "bg-emerald-50 text-emerald-700",
  B: "bg-sky-50 text-sky-700",
  C: "bg-slate-100 text-slate-600",
};
function CategoryBadge({ value }) {
  if (!value) return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${CATEGORY_STYLES[value] || "bg-slate-100 text-slate-600"}`}>
      {value}
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
  if (!value) return <span className="text-slate-300">—</span>;
  const cls = DONOR_TYPE_COLORS[value] || "bg-slate-100 text-slate-600";
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{value}</span>;
}

function EngagementPill({ status }) {
  if (status === "Engaged") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold whitespace-nowrap">
        <IconCheckCircle className="w-3.5 h-3.5" /> Engaged
      </span>
    );
  }
  if (status === "Not Engaged") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold whitespace-nowrap">
        <IconXCircle className="w-3.5 h-3.5" /> Not Engaged
      </span>
    );
  }
  return (
    <span
      className="text-slate-300 cursor-help"
      title="Nothing to compare: this donor didn't give in an earlier selected year (or only one year is selected)."
    >
      —
    </span>
  );
}

function ChartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  );
}

// One figure in the Summary Card: an amount and its unique donors.
function SummaryStat({ label, sub, amount, donors, tone, empty }) {
  const color = { navy: "text-navy-700", emerald: "text-emerald-600", pink: "text-pink-600" }[tone];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={sub}>
        {sub}
      </p>
      {empty ? (
        <p className="font-display text-2xl font-bold text-slate-300 mt-2">—</p>
      ) : (
        <>
          <p className={`font-display text-2xl font-bold mt-2 ${color}`}>{moneyAutoScale(amount)}</p>
          <p className="text-xs text-slate-400 mt-1">{donors} donors</p>
        </>
      )}
    </div>
  );
}

// Multi-select toggle shared by the year and Type pills (null = all).
const toggleIn = (setter, all) => (value) =>
  setter((current) => {
    const base = current == null ? all : current;
    const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
    if (next.length === 0) return current; // never allow zero selected
    if (next.length === all.length) return null; // back to "everything"
    return next;
  });

// ---------------------------------------------------------------- page
export default function OverallComparisonModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedYears, setSelectedYears] = useState(null); // null = every financial year
  const [selectedTypes, setSelectedTypes] = useState(null); // null = every Type
  const [categoryFilter, setCategoryFilter] = useState(null); // null = every category
  const [engagementFilter, setEngagementFilter] = useState(null); // null = Engaged + Not Engaged
  // Column filters for the donor-level columns (null = every value).
  const [attrFilters, setAttrFilters] = useState({ platform: null, spoc: null, kam: null, donorType: null });
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState(null); // "total" | "fy:<year>" | null
  const [sortDir, setSortDir] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(0);

  // Remarks (Bigin Notes) and Calls (Bigin Activities -> Calls) per donor,
  // shown as the last two columns of the table (matched by the donor's
  // Bigin company id), and the donor whose Calls popup is open.
  const { remarksById, remarksNote, callsById, callsNote } = useDonorExtras();
  const [callsDonor, setCallsDonor] = useState(null); // { account, calls } | null

  useEffect(() => {
    fetch("/api/crm-analysis/overall-comparison")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Every financial year in the data (oldest first) and every Type.
  const allYears = data?.years || [];
  const allTypes = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    data.rows.forEach((r) => r.deals.forEach((d) => d.type && d.type !== "Unspecified" && set.add(d.type)));
    return [...set].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a);
      const ib = TYPE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [data]);

  const toggleYear = toggleIn(setSelectedYears, allYears);
  const toggleType = toggleIn(setSelectedTypes, allTypes);

  // The financial-year column groups on screen, oldest first.
  const shownYears = useMemo(() => [...(selectedYears ?? allYears)].sort(), [selectedYears, allYears]);

  // One entry per donor with, for each shown year, that year's amount and
  // deals — counting only deals of the selected Types. A donor with
  // nothing in the shown years (for those Types) isn't listed.
  // `total` / `category` are the donor's all-years figures from the
  // server and are NOT affected by these filters.
  const view = useMemo(() => {
    if (!data) return [];
    const yearSet = new Set(shownYears);
    const typeSet = selectedTypes ? new Set(selectedTypes) : null;
    const latestYear = shownYears[shownYears.length - 1]; // the "current" year for Engagement Status
    const earlierYears = shownYears.slice(0, -1); // the years it's compared against
    const out = [];
    for (const d of data.rows) {
      const perYear = {};
      let any = false;
      for (const deal of d.deals) {
        if (!yearSet.has(deal.fy)) continue;
        if (typeSet && !typeSet.has(deal.type)) continue;
        const y = (perYear[deal.fy] ||= { amount: 0, deals: [] });
        y.amount += deal.amount || 0;
        y.deals.push(deal);
        any = true;
      }
      if (any) {
        out.push({
          account: d.account,
          accountId: d.accountId, // the Bigin company id — links the donor to its Remarks and Calls
          category: d.category,
          platform: d.platform,
          spoc: d.spoc,
          kam: d.kam,
          donorType: d.donorType,
          total: d.total,
          perYear,
          // null when there's nothing earlier to compare with; "Engaged" only
          // when the donor gave in every selected year; otherwise "Not Engaged".
          status: earlierYears.some((y) => perYear[y])
            ? earlierYears.every((y) => perYear[y]) && perYear[latestYear]
              ? "Engaged"
              : "Not Engaged"
            : null,
        });
      }
    }
    return out;
  }, [data, shownYears, selectedTypes]);

  const categoryOptions = useMemo(() => {
    const present = new Set(view.map((r) => r.category || "—"));
    return ["A", "B", "C", "—"].filter((c) => present.has(c));
  }, [view]);

  // The values each donor-level column filter offers: whatever the donors
  // currently in `view` have.
  const attrOptions = useMemo(() => {
    const out = { platform: [], spoc: [], kam: [], donorType: [] };
    for (const key of Object.keys(out)) {
      out[key] = [...new Set(view.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [view]);

  const toggleAttr = (key) => (value) =>
    setAttrFilters((prev) => {
      const all = attrOptions[key];
      const current = prev[key];
      const base = current == null ? all : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      const resolved = next.length === 0 ? current : next.length === all.length ? null : next;
      return { ...prev, [key]: resolved };
    });
  const clearAttr = (key) => () => setAttrFilters((prev) => ({ ...prev, [key]: null }));
  const attrFilterProps = (key, label) => ({
    label,
    options: attrOptions[key],
    selected: attrFilters[key],
    onToggle: toggleAttr(key),
    onSelectAll: clearAttr(key),
    onClearAll: () => setAttrFilters((prev) => ({ ...prev, [key]: [] })),
  });

  const toggleEngagement = toggleIn(setEngagementFilter, ENGAGEMENT_OPTIONS);

  const toggleCategory = (value) =>
    setCategoryFilter((current) => {
      const base = current == null ? categoryOptions : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return current;
      if (next.length === categoryOptions.length) return null;
      return next;
    });

  const setSortFor = (column) => (dir) => {
    setSortColumn(dir == null ? null : column);
    setSortDir(dir);
  };

  // Default order (no sort chosen): biggest all-years total first, which
  // is how the server sends the donors.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = view.filter((r) => {
      if (q && !r.account.toLowerCase().includes(q)) return false;
      if (categoryFilter != null && !categoryFilter.includes(r.category || "—")) return false;
      if (engagementFilter != null && !engagementFilter.includes(r.status)) return false;
      for (const key of ["platform", "spoc", "kam", "donorType"]) {
        if (attrFilters[key] != null && !attrFilters[key].includes(r[key])) return false;
      }
      return true;
    });
    if (sortColumn && sortDir) {
      const value = (r) => (sortColumn === "total" ? r.total : r.perYear[sortColumn.slice(3)]?.amount ?? null);
      out = [...out].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // blanks always sink to the bottom
        if (bv == null) return -1;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return out;
  }, [view, search, categoryFilter, engagementFilter, attrFilters, sortColumn, sortDir]);

  // Back to the first page whenever what's listed changes.
  useEffect(() => {
    setPage(0);
  }, [search, selectedYears, selectedTypes, categoryFilter, engagementFilter, attrFilters, sortColumn, sortDir, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * rowsPerPage;
  const pageRows = rows.slice(start, start + rowsPerPage);
  const windowStart = Math.max(0, Math.min(safePage - 2, totalPages - 5));
  const pageNumbers = [];
  for (let i = windowStart; i < Math.min(totalPages, windowStart + 5); i++) pageNumbers.push(i);

  const engagedCount = useMemo(() => rows.filter((r) => r.status === "Engaged").length, [rows]);
  const notEngagedCount = useMemo(() => rows.filter((r) => r.status === "Not Engaged").length, [rows]);
  const notComparedCount = rows.length - engagedCount - notEngagedCount;

  // Summary cards: for each financial year on screen, the amount and the
  // number of donors who gave in it — worked out from `rows`, i.e. from
  // exactly the donors the table lists after every filter (years, Type,
  // Category, Engagement Status and the search box). So each card always
  // equals the total of its Amount column.
  const yearSummary = useMemo(
    () =>
      shownYears.map((y) => {
        let amount = 0;
        let donors = 0;
        for (const r of rows) {
          const cell = r.perYear[y];
          if (cell) {
            amount += cell.amount;
            donors += 1;
          }
        }
        return { year: y, amount, donors };
      }),
    [rows, shownYears]
  );

  const shownTotal = useMemo(
    () => rows.reduce((s, r) => s + shownYears.reduce((ys, y) => ys + (r.perYear[y]?.amount || 0), 0), 0),
    [rows, shownYears]
  );

  // Summary Card: amount + unique donors for the earlier selected years
  // combined and for the latest selected year — from `rows` (the donors the
  // table lists after every filter). A donor who gave in several of the
  // combined years counts once.
  const summary = useMemo(() => {
    const latest = shownYears[shownYears.length - 1];
    const earlier = shownYears.slice(0, -1);
    const totalFor = (years) => {
      let amount = 0;
      let donors = 0;
      for (const r of rows) {
        let gave = false;
        for (const y of years) {
          const cell = r.perYear[y];
          if (cell) {
            amount += cell.amount;
            gave = true;
          }
        }
        if (gave) donors += 1;
      }
      return { amount, donors };
    };
    return { latest, earlier, previous: totalFor(earlier), current: totalFor([latest]) };
  }, [rows, shownYears]);

  const hasActiveFilters =
    selectedYears != null ||
    selectedTypes != null ||
    categoryFilter != null ||
    engagementFilter != null ||
    Object.values(attrFilters).some((v) => v != null) ||
    search.trim() !== "" ||
    sortColumn != null;
  const clearAllFilters = () => {
    setSelectedYears(null);
    setSelectedTypes(null);
    setCategoryFilter(null);
    setEngagementFilter(null);
    setAttrFilters({ platform: null, spoc: null, kam: null, donorType: null });
    setSearch("");
    setSortColumn(null);
    setSortDir(null);
  };
  const filterSummary = [
    selectedYears != null ? `Financial years: ${[...selectedYears].sort().join(", ")}` : null,
    selectedTypes != null ? `Type: ${selectedTypes.join(", ")}` : null,
    categoryFilter != null ? `Category: ${categoryFilter.join(", ") || "none"}` : null,
    engagementFilter != null ? `Engagement: ${engagementFilter.join(", ") || "none"}` : null,
    attrFilters.platform != null ? `Platform: ${attrFilters.platform.join(", ") || "none"}` : null,
    attrFilters.spoc != null ? `SPOC: ${attrFilters.spoc.join(", ") || "none"}` : null,
    attrFilters.kam != null ? `KAM: ${attrFilters.kam.join(", ") || "none"}` : null,
    attrFilters.donorType != null ? `Donor Type: ${attrFilters.donorType.join(", ") || "none"}` : null,
    search.trim() !== "" ? `Search: "${search.trim()}"` : null,
    sortColumn != null ? "Sorted" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const latestShownYear = shownYears[shownYears.length - 1];

  const filterBar = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FunnelIcon className="w-5 h-5 text-indigo-600" />
        <p className="font-display font-bold text-navy-900">Filters</p>
      </div>
      <PillFilter label="Financial year" options={allYears} selected={selectedYears} onToggle={toggleYear} />
      <PillFilter label="Type" options={allTypes} selected={selectedTypes} onToggle={toggleType} />
      {/* <p className="text-[11px] text-slate-400">
        Category is based on each donor's cumulative amount across all financial years (all Types): A above ₹1 Cr ·
        B ₹50 L to ₹1 Cr · C below ₹50 L. These filters don't change it.
      </p>
      <p className="text-[11px] text-slate-400">
        {shownYears.length < 2 ? (
          <>Engagement Status compares financial years — select two or more years to see it.</>
        ) : shownYears.length === 2 ? (
          <>
            Engagement Status compares FY {shownYears[0]} with FY {latestShownYear}:{" "}
            <span className="font-semibold text-slate-500">Engaged</span> = gave in both;{" "}
            <span className="font-semibold text-slate-500">Not Engaged</span> = gave in FY {shownYears[0]} but not in FY{" "}
            {latestShownYear}. Donors who only gave in FY {latestShownYear} show — (nothing to compare).
          </>
        ) : (
          <>
            Engagement Status compares the selected years (FY {shownYears[0]} to FY {latestShownYear}):{" "}
            <span className="font-semibold text-slate-500">Engaged</span> = gave in every selected year;{" "}
            <span className="font-semibold text-slate-500">Not Engaged</span> = gave in an earlier selected year but not in every
            selected year. Donors who only gave in FY {latestShownYear} show — (nothing to compare).
          </>
        )}
      </p> */}
    </div>
  );

  const summaryCard = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <ChartIcon className="w-5 h-5 text-indigo-600" />
        <p className="font-display font-bold text-navy-900">Summary Card</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat
          label="Previous financial years"
          sub={summary.earlier.length > 0 ? `FY ${summary.earlier.join(", ")}` : "No earlier year selected"}
          amount={summary.previous.amount}
          donors={summary.previous.donors}
          tone="navy"
          empty={summary.earlier.length === 0}
        />
        <SummaryStat
          label="This financial year"
          sub={`FY ${summary.latest}`}
          amount={summary.current.amount}
          donors={summary.current.donors}
          tone="emerald"
        />
      </div>
      {/* <p className="text-[11px] text-slate-400 mt-3">
        Follows every filter above and the table's search and column filters. A donor who gave in several of the combined years counts once.
      </p> */}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
          Loading all financial years…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load the overall comparison: {error}
      </div>
    );
  }

  const exportCsv = () =>
    downloadCsv(
      "overall-comparison.csv",
      [
        "Donor Name",
        "Category",
        "Platform",
        "SPOC",
        "Engagement Status",
        ...shownYears.flatMap((y) => [`FY ${y} Amount`, `FY ${y} Type of Engagement`, `FY ${y} Conversion Month`]),
        "All-years total",
        "KAM",
        "Donor Type",
        "Remarks",
        "Calls",
      ],
      rows.map((r) => [
        r.account,
        r.category || "",
        r.platform || "",
        r.spoc || "",
        r.status || "",
        ...shownYears.flatMap((y) => {
          const cell = r.perYear[y];
          // Every month with its amount: "March - 90000, April - 80000"
          return [cell ? cell.amount : "", cell ? typesText(cell.deals) : "", cell ? monthsWithAmounts(cell.deals) : ""];
        }),
        r.total,
        r.kam || "",
        r.donorType || "",
        remarksForExport(remarksById[r.accountId]),
        (callsById[r.accountId] || []).length,
      ])
    );

  return (
    <div className="space-y-5 sm:space-y-6">
      <ClearFiltersBar active={hasActiveFilters} summary={filterSummary} onClear={clearAllFilters} />
      <div className="grid gap-4 lg:grid-cols-2 items-stretch">
        {filterBar}
        {summaryCard}
      </div>

      {/* One card per financial year on screen: that year's total amount and
          the donors who gave in it, under the filters currently applied. */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {yearSummary.map((c) => (
          <div key={c.year} className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">FY {c.year}</p>
            <p className="font-display text-2xl font-bold text-emerald-600">{moneyAutoScale(c.amount)}</p>
            <p className="text-xs text-slate-400 mt-1">{c.donors} donors</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <IconClipboard className="w-5 h-5" />
            <p className="font-display font-semibold text-lg">Overall Comparison</p>
          </div>
          <ExportButton onClick={exportCsv} disabled={rows.length === 0} />
        </div>

        <ExtrasNote remarksNote={remarksNote} callsNote={callsNote} className="px-5 py-2 border-b border-slate-100" />

        <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100">
          <label className="relative block sm:w-72">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search donor name…"
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-navy-900">{rows.length}</span> donors ·{" "}
            <span className="font-semibold text-emerald-600">{engagedCount}</span> engaged ·{" "}
            <span className="font-semibold text-red-500">{notEngagedCount}</span> not engaged ·{" "}
            {notComparedCount > 0 && (
              <>
                <span className="font-semibold text-slate-500">{notComparedCount}</span> not compared ·{" "}
              </>
            )}
            selected years total{" "}
            <span className="font-semibold text-navy-900">{moneyAutoScale(shownTotal)}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1520 + shownYears.length * 520 }}>
            <thead>
              <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th
                  rowSpan={2}
                  style={{ position: "sticky", left: 0, width: SNO_W, minWidth: SNO_W, maxWidth: SNO_W }}
                  className="px-3 py-2.5 font-semibold text-left align-middle bg-white z-20"
                >
                  S.No
                </th>
                <th
                  rowSpan={2}
                  style={{
                    position: "sticky",
                    left: SNO_W,
                    width: DONOR_W,
                    minWidth: DONOR_W,
                    maxWidth: DONOR_W,
                    boxShadow: "inset -1px 0 0 #e2e8f0",
                  }}
                  className="px-3 py-2.5 font-semibold text-left align-middle bg-white z-20"
                >
                  Donor Name
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu
                    label="Category"
                    options={categoryOptions}
                    selected={categoryFilter}
                    onToggle={toggleCategory}
                    onSelectAll={() => setCategoryFilter(null)}
                    onClearAll={() => setCategoryFilter([])}
                  />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...attrFilterProps("platform", "Platform")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...attrFilterProps("spoc", "SPOC")} />
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 font-semibold align-middle"
                  title={
                    shownYears.length < 2
                      ? "Select two or more financial years to compare."
                      : shownYears.length === 2
                      ? `Engaged = gave in both FY ${shownYears[0]} and FY ${latestShownYear}. Not Engaged = gave in FY ${shownYears[0]} but not in FY ${latestShownYear}. — = only gave in FY ${latestShownYear}.`
                      : `Engaged = gave in every selected year. Not Engaged = gave in an earlier selected year but not in every selected year. — = only gave in FY ${latestShownYear}.`
                  }
                >
                  <ColumnFilterMenu
                    label="Engagement Status"
                    options={ENGAGEMENT_OPTIONS}
                    selected={engagementFilter}
                    onToggle={toggleEngagement}
                    onSelectAll={() => setEngagementFilter(null)}
                    onClearAll={() => setEngagementFilter([])}
                  />
                </th>
                {shownYears.map((y) => (
                  <th key={y} colSpan={3} className="px-3 py-2.5 font-semibold border-l border-slate-100">
                    FY {y}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100"
                  title="Cumulative amount across ALL financial years and all Types — the amount Category is based on"
                >
                  <ColumnSortMenu
                    label="All-years total"
                    sortDir={sortColumn === "total" ? sortDir : null}
                    onSort={setSortFor("total")}
                  />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">
                  <ColumnFilterMenu {...attrFilterProps("kam", "KAM")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  <ColumnFilterMenu {...attrFilterProps("donorType", "Donor Type")} />
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle border-l border-slate-100">
                  Remarks
                </th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">
                  Calls
                </th>
              </tr>
              <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                {shownYears.flatMap((y) => [
                  <th key={`${y}-a`} className="px-3 py-2 font-medium border-l border-slate-100">
                    <ColumnSortMenu
                      label="Amount"
                      sortDir={sortColumn === `fy:${y}` ? sortDir : null}
                      onSort={setSortFor(`fy:${y}`)}
                    />
                  </th>,
                  <th key={`${y}-t`} className="px-3 py-2 font-medium">
                    Type of Engagement
                  </th>,
                  <th key={`${y}-m`} className="px-3 py-2 font-medium">
                    Conversion Month
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const stripe = i % 2 === 1;
                const stickyBg = stripe ? "bg-slate-50" : "bg-white";
                return (
                  <tr key={`${r.account}-${start + i}`} className={stripe ? "bg-slate-50" : ""}>
                    <td
                      style={{ position: "sticky", left: 0, width: SNO_W, minWidth: SNO_W, maxWidth: SNO_W }}
                      className={`px-3 py-2.5 text-slate-400 align-middle z-10 ${stickyBg}`}
                    >
                      {start + i + 1}
                    </td>
                    <td
                      style={{
                        position: "sticky",
                        left: SNO_W,
                        width: DONOR_W,
                        minWidth: DONOR_W,
                        maxWidth: DONOR_W,
                        boxShadow: "inset -1px 0 0 #e2e8f0",
                      }}
                      className={`px-3 py-2.5 font-medium text-navy-900 break-words align-middle z-10 ${stickyBg}`}
                    >
                      {r.account}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                      <CategoryBadge value={r.category} />
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.platform || "—"}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">{r.spoc || "—"}</td>
                    <td className="px-3 py-2.5 text-center align-middle">
                      <EngagementPill status={r.status} />
                    </td>
                    {shownYears.flatMap((y) => {
                      const cell = r.perYear[y];
                      return [
                        <td key={`${y}-a`} className="px-3 py-2.5 text-right text-slate-700 border-l border-slate-100 whitespace-nowrap align-middle">
                          {cell ? moneyAutoScale(cell.amount) : <span className="text-slate-300">—</span>}
                        </td>,
                        <td key={`${y}-t`} className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                          {cell ? typesText(cell.deals) || "—" : <span className="text-slate-300">—</span>}
                        </td>,
                        <td key={`${y}-m`} className="px-3 py-2.5 text-center align-middle">
                          {cell ? <MonthBreakdown deals={cell.deals} /> : <span className="text-slate-300">—</span>}
                        </td>,
                      ];
                    })}
                    <td className="px-3 py-2.5 text-right font-bold text-navy-900 border-l border-slate-100 whitespace-nowrap align-middle">
                      {moneyAutoScale(r.total)}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap border-l border-slate-100 align-middle">{r.kam || "—"}</td>
                    <td className="px-3 py-2.5 text-center align-middle">
                      <DonorTypeBadge value={r.donorType} />
                    </td>
                    <td className="px-3 py-2.5 border-l border-slate-100 align-middle">
                      <RemarksCell notes={remarksById[r.accountId]} />
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                      <CallsCell
                        calls={callsById[r.accountId]}
                        onOpen={() => setCallsDonor({ account: r.account, calls: callsById[r.accountId] || [] })}
                      />
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={11 + shownYears.length * 3} className="px-4 py-8 text-center text-slate-400 text-xs">
                    No donors match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 text-sm text-slate-500">
          <span>
            {rows.length === 0
              ? "Showing 0 entries"
              : `Showing ${start + 1} to ${Math.min(start + rowsPerPage, rows.length)} of ${rows.length} entries`}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              Rows per page:
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none"
              >
                {ROWS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className="px-2.5 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-xs"
              >
                Prev
              </button>
              {pageNumbers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold ${
                    p === safePage ? "bg-indigo-600 text-white" : "border border-slate-200 text-navy-700 hover:border-slate-300"
                  }`}
                >
                  {p + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(safePage + 1)}
                className="px-2.5 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <DonorCallsModal open={!!callsDonor} onClose={() => setCallsDonor(null)} donor={callsDonor} />
    </div>
  );
}