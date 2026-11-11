import { useEffect, useMemo, useRef, useState } from "react";
import { moneyAutoScale, fullMoney } from "../lib/format.js";
import { downloadCsv } from "../lib/csvExport.js";
import HeaderFilterMenu, { matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import ColumnSortMenu from "./ColumnSortMenu.jsx";

// CER Dashboard — the donations received under CER.
//
// A deal belongs to CER when its Donation Type (the Donation Type field of the
// deal in Bigin's Pipelines module) is "CER". Only CLOSED deals are donations
// received, so only those are used here. The page loads one small record per
// donation (/api/crm-analysis/category-dashboard?category=cer) and does the
// totals itself.
//
//   - Type pills (multi-select, like the other pages; at least one stays on).
//   - Date range (top right): by closing date. Default: last financial year +
//     this one, e.g. 01 Apr 2025 - 31 Mar 2027. Also This / Last Financial Year,
//     All time, or a custom range.
//   - Total Donation Amount and Total Donors for that range, with the change
//     against the previous period of the same length (hidden when there is
//     nothing to compare with).
//   - Financial Year cards for last and this financial year (they follow the
//     Type pills, not the date range).
//   - Donation Details: one row per donation, with search and Export.
//       Column filters on Type, KAM, SPOC and Month (checkbox lists, like the other
//       tables), and sorting from the header like the other tables: click the arrows
//       icon on Donor Name (A → Z, then Z → A) or Amount (low to high, then high to
//       low); a third click turns the sort off. Newest first when no sort is chosen.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const TYPE_ORDER = ["Cash", "Kind", "School Engagement"];
const PAGE_SIZE = 10;
const FILTER_FIELDS = ["type", "kam", "spoc", "monthLabel"];
const EMPTY_COL_FILTERS = { type: null, kam: null, spoc: null, monthLabel: null };

// ------------------------------------------------------------------ dates
const fmtDate = (iso) => `${iso.slice(8, 10)} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const shiftYears = (iso, years) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const toMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const addDays = (iso, n) => toIso(toMs(iso) + n * 86400000);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / 86400000);
const fyBounds = (startYear) => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });

// The bounds of a period choice ({ key, from, to } -> { from, to } | null for "all").
function boundsOf(range, curStart) {
  switch (range.key) {
    case "recent":
      return { from: `${curStart - 1}-04-01`, to: `${curStart + 1}-03-31` };
    case "fy":
      return fyBounds(curStart);
    case "lastfy":
      return fyBounds(curStart - 1);
    case "custom":
      return { from: range.from, to: range.to };
    default:
      return null; // all time
  }
}

// The period right before, for the "+12%" comparison.
function previousBounds(range, b) {
  if (!b) return null;
  if (range.key === "recent") return { from: shiftYears(b.from, -2), to: shiftYears(b.to, -2) };
  if (range.key === "fy" || range.key === "lastfy") return { from: shiftYears(b.from, -1), to: shiftYears(b.to, -1) };
  const n = daysBetween(b.from, b.to) + 1;
  return { from: addDays(b.from, -n), to: addDays(b.from, -1) };
}

const inBounds = (deal, b) => {
  if (!b) return true;
  const d = String(deal.closingDate || "").slice(0, 10);
  return d !== "" && d >= b.from && d <= b.to;
};

// ------------------------------------------------------------------ small helpers
const sum = (list) => list.reduce((s, d) => s + d.amount, 0);
const donorCount = (list) => new Set(list.map((d) => d.accountId || d.account)).size;
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const monthLabel = (d) => {
  const hit = /^(\d{4})-(\d{2})/.exec(String(d.closingDate || ""));
  return hit ? `${MONTH_NAMES[Number(hit[2]) - 1]} ${hit[1]}` : "—";
};

// ------------------------------------------------------------------ icons
const sv = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const IconDatabase = (p) => (
  <svg {...sv} className={p.className}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </svg>
);
const IconPeople = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className}>
    <circle cx="9" cy="8" r="3.2" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M2.5 19c0-3.4 2.8-5.2 6.5-5.2s6.5 1.8 6.5 5.2zM15.5 14.2c.5-.1 1-.2 1.5-.2 3 0 4.7 1.5 4.7 4.2h-4.6c0-1.6-.6-3-1.6-4z" />
  </svg>
);
const IconCalendar = (p) => (
  <svg {...sv} className={p.className}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
const IconChevron = (p) => (
  <svg {...sv} className={p.className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconCheck = (p) => (
  <svg viewBox="0 0 24 24" className={p.className}>
    <circle cx="12" cy="12" r="10" fill="white" />
    <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSearch = (p) => (
  <svg {...sv} className={p.className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
const IconDownload = (p) => (
  <svg {...sv} className={p.className}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);
const IconArrowUp = (p) => (
  <svg {...sv} strokeWidth={2.2} className={p.className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
const IconArrowDown = (p) => (
  <svg {...sv} strokeWidth={2.2} className={p.className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
// the faded ascending bars at the right of the cards
const BarsArt = ({ className }) => (
  <svg viewBox="0 0 64 56" className={className} fill="currentColor" aria-hidden="true">
    <rect x="2" y="38" width="10" height="16" rx="2.5" opacity=".45" />
    <rect x="17" y="28" width="10" height="26" rx="2.5" opacity=".6" />
    <rect x="32" y="16" width="10" height="38" rx="2.5" opacity=".75" />
    <rect x="47" y="2" width="12" height="52" rx="2.5" />
  </svg>
);

// ------------------------------------------------------------------ pieces
const TYPE_PILL_ON = {
  Cash: "from-sky-500 to-blue-600",
  Kind: "from-indigo-600 to-purple-600",
  "School Engagement": "from-teal-500 to-emerald-600",
};
const TYPE_BADGE = {
  Cash: "bg-emerald-50 text-emerald-700",
  Kind: "bg-purple-100 text-purple-700",
  "School Engagement": "bg-amber-50 text-amber-700",
};
const KAM_BADGES = [
  "bg-blue-50 text-blue-600",
  "bg-purple-50 text-purple-600",
  "bg-orange-50 text-orange-600",
  "bg-emerald-50 text-emerald-600",
  "bg-pink-50 text-pink-600",
  "bg-sky-50 text-sky-600",
];
const kamBadge = (name) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return KAM_BADGES[h % KAM_BADGES.length];
};

function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const Arrow = up ? IconArrowUp : IconArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${up ? "bg-emerald-100/70 text-emerald-600" : "bg-red-100/70 text-red-500"}`}
      title="Compared with the previous period of the same length"
    >
      <Arrow className="w-4 h-4" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function DateRangePicker({ range, label, presets, onChange }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-navy-900 shadow-sm hover:border-slate-300"
      >
        <IconCalendar className="w-5 h-5 text-slate-600" />
        <span className="font-medium" data-testid="range-label">{label}</span>
        <IconChevron className="w-4 h-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg" role="listbox">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              role="option"
              aria-selected={range.key === p.key}
              onClick={() => {
                onChange({ key: p.key });
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${range.key === p.key ? "bg-indigo-50 font-semibold text-indigo-700" : "text-navy-900"}`}
            >
              <span className="block">{p.label}</span>
              {p.sub && <span className="block text-xs text-slate-400">{p.sub}</span>}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-100 px-3 pt-2 pb-1">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Custom range</p>
            <div className="flex items-center gap-2">
              <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
              <span className="text-slate-400 text-xs">to</span>
              <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
            </div>
            <button
              type="button"
              disabled={!from || !to || from > to}
              onClick={() => {
                onChange({ key: "custom", from, to });
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function CERDashboardModule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(null); // null = every Type shown
  const [range, setRange] = useState({ key: "recent" });
  const [search, setSearch] = useState("");
  // Column filters (null = every value) and the sort chosen in the header.
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);
  const [sort, setSort] = useState({ field: null, dir: null }); // field: "account" | "amount"
  const [page, setPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm-analysis/category-dashboard?category=cer")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => !cancelled && setData(json))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const close = (e) => exportRef.current && !exportRef.current.contains(e.target) && setExportOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const deals = data?.closed || [];
  // "today" = the server's date; the current financial year starts the April before it
  const curStart = useMemo(() => {
    const now = data ? new Date(data.generatedAt) : new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }, [data]);

  // Type pills: Cash and Kind always, plus any other Type CER donations have.
  const typeOptions = useMemo(() => {
    const set = new Set(["Cash", "Kind", ...deals.map((d) => d.type).filter((t) => t && t !== "Unspecified")]);
    return [...set].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a);
      const ib = TYPE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [deals]);
  const activeTypes = selectedTypes ?? typeOptions;
  const toggleType = (t) =>
    setSelectedTypes((cur) => {
      const base = cur ?? typeOptions;
      const next = base.includes(t) ? base.filter((x) => x !== t) : [...base, t];
      if (next.length === 0) return cur; // at least one stays on
      return next.length === typeOptions.length ? null : next;
    });

  const byType = useMemo(() => deals.filter((d) => activeTypes.includes(d.type)), [deals, activeTypes]);

  const bounds = useMemo(() => boundsOf(range, curStart), [range, curStart]);
  const prevBounds = useMemo(() => previousBounds(range, bounds), [range, bounds]);
  const inRange = useMemo(() => byType.filter((d) => inBounds(d, bounds)), [byType, bounds]);
  const prevRange = useMemo(() => (prevBounds ? byType.filter((d) => inBounds(d, prevBounds)) : null), [byType, prevBounds]);

  const totalAmount = sum(inRange);
  const totalDonors = donorCount(inRange);
  const amountPct = prevRange ? pctChange(totalAmount, sum(prevRange)) : null;
  const donorsPct = prevRange ? pctChange(totalDonors, donorCount(prevRange)) : null;

  const fyCards = [curStart - 1, curStart].map((start) => {
    const fy = `${start}-${start + 1}`;
    const list = byType.filter((d) => d.fy === fy);
    return { fy, label: `${start} - ${String(start + 1).slice(2)}`, amount: sum(list), donors: donorCount(list) };
  });

  const presets = [
    { key: "recent", label: "Last & this financial year", sub: `${fmtDate(boundsOf({ key: "recent" }, curStart).from)} - ${fmtDate(boundsOf({ key: "recent" }, curStart).to)}` },
    { key: "fy", label: "This financial year", sub: `${fmtDate(fyBounds(curStart).from)} - ${fmtDate(fyBounds(curStart).to)}` },
    { key: "lastfy", label: "Last financial year", sub: `${fmtDate(fyBounds(curStart - 1).from)} - ${fmtDate(fyBounds(curStart - 1).to)}` },
    { key: "all", label: "All time" },
  ];
  const rangeLabel = bounds ? `${fmtDate(bounds.from)} - ${fmtDate(bounds.to)}` : "All time";

  // Donation Details. `sorted` = everything in the date range, newest first. The
  // table then applies the column filters, the search box and finally the sort
  // chosen in the header (newest first when none is chosen).
  const sorted = useMemo(
    () => [...inRange].sort((a, b) => String(b.closingDate || "").localeCompare(String(a.closingDate || ""))),
    [inRange]
  );
  const withMonth = useMemo(() => sorted.map((d) => ({ ...d, monthLabel: monthLabel(d) })), [sorted]);

  // What each column filter offers: the values in the date range (so a list
  // never shrinks as other filters are applied). Months newest first.
  const optionsByField = useMemo(() => {
    const uniq = (get) => [...new Set(withMonth.map(get).filter(Boolean))];
    const alpha = (a, b) => a.localeCompare(b);
    return {
      type: uniq((d) => d.type).sort((a, b) => {
        const ia = TYPE_ORDER.indexOf(a);
        const ib = TYPE_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || alpha(a, b);
      }),
      kam: uniq((d) => d.kam).sort(alpha),
      spoc: uniq((d) => d.spoc).sort(alpha),
      monthLabel: uniq((d) => d.monthLabel),
    };
  }, [withMonth]);
  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setColFilters, setPage, optionsByField);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = withMonth.filter((d) => FILTER_FIELDS.every((f) => matchesFilter(d[f], colFilters[f])));
    if (q) out = out.filter((d) => `${d.account} ${d.kam} ${d.spoc} ${d.type} ${d.monthLabel}`.toLowerCase().includes(q));
    if (sort.field && sort.dir) {
      const sign = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) =>
        sort.field === "amount"
          ? sign * (a.amount - b.amount)
          : sign * String(a.account).localeCompare(String(b.account), undefined, { sensitivity: "base" })
      );
    }
    return out;
  }, [withMonth, colFilters, search, sort]);

  // A different date range or Type pill changes which values exist, so start the
  // column filters afresh rather than leave a stale selection hiding rows.
  useEffect(() => setColFilters(EMPTY_COL_FILTERS), [selectedTypes, range]);
  useEffect(() => setPage(0), [search, selectedTypes, range, colFilters, sort]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const windowStart = Math.max(0, Math.min(safePage - 2, totalPages - 5));
  const pageNumbers = [];
  for (let i = windowStart; i < Math.min(totalPages, windowStart + 5); i++) pageNumbers.push(i);

  const exportRows = (list, name) => {
    downloadCsv(
      name,
      ["S.No", "Donor Name", "Amount", "Type", "KAM", "SPOC", "Month", "Closing Date"],
      list.map((d, i) => [i + 1, d.account, d.amount, d.type, d.kam, d.spoc, monthLabel(d), String(d.closingDate || "").slice(0, 10)])
    );
    setExportOpen(false);
  };

  if (error) {
    return <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">Couldn't load the CER dashboard: {error}</div>;
  }
  if (!data) {
    return <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">Loading CER dashboard…</div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Type pills (left) and the date range (right) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Type</p>
          <div className="flex flex-wrap gap-3">
            {typeOptions.map((t) => {
              const on = activeTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
                    on
                      ? `bg-gradient-to-r ${TYPE_PILL_ON[t] || "from-indigo-600 to-purple-600"} text-white border-transparent shadow-sm`
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {on && <IconCheck className="w-5 h-5 text-indigo-600" />}
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <DateRangePicker range={range} label={rangeLabel} presets={presets} onChange={setRange} />
      </div>

      {deals.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No CER donations found. A deal counts as CER when its Donation Type is "CER", and only closed deals are donations received.
        </div>
      )}

      {/* Total Donation Amount / Total Donors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-blue-100/60 p-6">
          <div className="flex items-center gap-5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <IconDatabase className="h-10 w-10" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-navy-900 text-lg">Total Donation Amount</p>
              <div className="flex flex-wrap items-center gap-3 my-1">
                <p className="font-display text-4xl font-bold text-blue-600" title={fullMoney(totalAmount)}>{moneyAutoScale(totalAmount)}</p>
                <TrendBadge pct={amountPct} />
              </div>
            </div>
          </div>
          <BarsArt className="absolute right-6 top-1/2 h-20 w-24 -translate-y-1/2 text-blue-300/70 hidden sm:block" />
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-green-100/60 p-6">
          <div className="flex items-center gap-5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <IconPeople className="h-10 w-10" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-navy-900 text-lg">Total Donors</p>
              <div className="flex flex-wrap items-center gap-3 my-1">
                <p className="font-display text-4xl font-bold text-emerald-600">{totalDonors}</p>
                <TrendBadge pct={donorsPct} />
              </div>
              <p className="text-sm text-slate-500">Individuals &amp; Organizations</p>
            </div>
          </div>
          <IconPeople className="absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-emerald-200/80 hidden sm:block" />
        </div>
      </div>

      {/* Financial Year cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {fyCards.map((c, i) => {
          const purple = i === 0;
          return (
            <div
              key={c.fy}
              className={`relative overflow-hidden rounded-2xl border p-5 ${purple ? "border-purple-100 bg-gradient-to-r from-purple-50 to-violet-100/50" : "border-orange-100 bg-gradient-to-r from-orange-50 to-amber-100/50"}`}
            >
              <div className="flex items-start gap-4">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${purple ? "bg-purple-100 text-purple-600" : "bg-orange-100 text-orange-500"}`}>
                  <IconCalendar className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-navy-900 text-lg">Financial Year {c.label}</p>
                  <div className="mt-2 flex items-stretch gap-6">
                    <div>
                      <p className="text-sm text-navy-900">Amount</p>
                      <p className={`font-display text-2xl font-bold ${purple ? "text-purple-600" : "text-orange-500"}`} title={fullMoney(c.amount)}>
                        {moneyAutoScale(c.amount)}
                      </p>
                    </div>
                    <div className={`w-px ${purple ? "bg-purple-200" : "bg-orange-200"}`} />
                    <div>
                      <p className="text-sm text-navy-900">Donor Count</p>
                      <p className={`font-display text-2xl font-bold ${purple ? "text-indigo-700" : "text-orange-500"}`}>{c.donors}</p>
                    </div>
                  </div>
                </div>
              </div>
              <BarsArt className={`absolute right-6 bottom-4 h-14 w-16 hidden sm:block ${purple ? "text-purple-300/70" : "text-orange-300/80"}`} />
            </div>
          );
        })}
      </div>

      {/* Donation Details */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <p className="font-display font-bold text-navy-900 text-xl">Donation Details</p>
            <p className="text-sm text-slate-400">List of all donations received under CER</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block w-full sm:w-80">
              <IconSearch className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by donor name, KAM, SPOC, month…"
                className="w-full text-sm pl-11 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 hover:border-slate-300"
              >
                <IconDownload className="w-5 h-5" />
                Export
                <IconChevron className="w-4 h-4 text-slate-500" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <button type="button" disabled={rows.length === 0} onClick={() => exportRows(rows, "cer-donations.csv")} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
                    Current view <span className="text-slate-400">({rows.length})</span>
                    <span className="block text-xs text-slate-400">What the table shows, with its filters, search and sort</span>
                  </button>
                  <button type="button" disabled={sorted.length === 0} onClick={() => exportRows(sorted, "cer-donations-date-range.csv")} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
                    Everything in the date range <span className="text-slate-400">({sorted.length})</span>
                    <span className="block text-xs text-slate-400">Ignores the column filters and the search box</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-slate-100/70 text-left text-navy-900">
                <th className="px-4 py-3 font-semibold rounded-l-lg w-12">S.No</th>
                <th className="px-4 py-3 font-semibold">
                  <ColumnSortMenu
                    variant="light"
                    label="Donor Name"
                    sortDir={sort.field === "account" ? sort.dir : null}
                    onSort={(dir) => setSort(dir ? { field: "account", dir } : { field: null, dir: null })}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">
                  <ColumnSortMenu
                    variant="light"
                    label="Amount"
                    sortDir={sort.field === "amount" ? sort.dir : null}
                    onSort={(dir) => setSort(dir ? { field: "amount", dir } : { field: null, dir: null })}
                  />
                </th>
                {[
                  ["type", "Type"],
                  ["kam", "KAM"],
                  ["spoc", "SPOC"],
                  ["monthLabel", "Month"],
                ].map(([field, label], i, all) => (
                  <th key={field} className={`px-4 py-3 font-semibold ${i === all.length - 1 ? "rounded-r-lg" : ""}`}>
                    <HeaderFilterMenu
                      variant="light"
                      label={label}
                      options={optionsByField[field] || []}
                      selected={colFilters[field]}
                      onToggle={toggleOption(field)}
                      onSelectAll={selectAll(field)}
                      onClearAll={clearAll(field)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d, i) => (
                <tr key={`${d.accountId || d.account}-${start + i}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-slate-500">{start + i + 1}</td>
                  <td className="px-4 py-2.5 text-navy-900">{d.account}</td>
                  <td className="px-4 py-2.5 text-navy-900 whitespace-nowrap">{fullMoney(d.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${TYPE_BADGE[d.type] || "bg-slate-100 text-slate-600"}`}>{d.type}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${kamBadge(d.kam)}`}>{d.kam}</span>
                  </td>
                  <td className="px-4 py-2.5 text-navy-900">{d.spoc}</td>
                  <td className="px-4 py-2.5 text-navy-900 whitespace-nowrap">{monthLabel(d)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                    No donations match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 text-sm text-slate-400">
          <span>{rows.length === 0 ? "Showing 0 donations" : `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length} donations`}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-navy-700">‹</button>
            {pageNumbers.map((p) => (
              <button key={p} type="button" onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-semibold ${p === safePage ? "bg-navy-900 text-white" : "border border-slate-200 text-navy-700 hover:border-slate-300"}`}>
                {p + 1}
              </button>
            ))}
            <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)} className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-40 text-navy-700">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}