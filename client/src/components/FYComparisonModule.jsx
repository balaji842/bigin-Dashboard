import { useEffect, useRef, useState } from "react";
import MonthDonorBreakdownModal from "./MonthDonorBreakdownModal.jsx";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";
import { IconBuilding, IconCalendar, IconTag, IconUsers, IconLayers } from "./icons.jsx";
import { moneyCr } from "../lib/format.js";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

// Color/icon pairing per table section — gives each panel a distinct
// identity instead of every header being the same flat navy bar.
const TABLE_THEMES = {
  type: { bar: "bg-gradient-to-r from-rose-500 to-orange-400", icon: IconTag },
  donorType: { bar: "bg-gradient-to-r from-indigo-600 to-blue-500", icon: IconUsers },
  kam: { bar: "bg-gradient-to-r from-orange-500 to-amber-400", icon: IconUsers },
  platform: { bar: "bg-gradient-to-r from-emerald-600 to-teal-500", icon: IconLayers },
  month: { bar: "bg-gradient-to-r from-blue-600 to-indigo-500", icon: IconCalendar },
};

// Generic multi-select pill filter, reused for Type, KAM, SPOC, and
// Platform. `selected: null` means "everything" (no restriction, no
// pills highlighted as excluded); once the person deselects at least
// one option, `selected` becomes the explicit array of what's still on.
function FilterGroup({ label, options, selected, onToggle }) {
  if (!options || options.length === 0) return null;
  return (
    <div className="mb-3">
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

// Dropdown multi-select with checkboxes — used for KAM, SPOC, and
// Platform, which can have many more options than Type. `selected: null`
// means "everything" selected. Closes when clicking outside of it.
function MultiSelectDropdown({ label, options, selected, onToggle, onSelectAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!options || options.length === 0) return null;

  const allSelected = selected == null;
  const count = allSelected ? options.length : selected.length;
  const summary = allSelected ? "All" : `${count} of ${options.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg border transition-colors ${
          open
            ? "border-transparent bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
            : allSelected
            ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            : "border-indigo-200 bg-indigo-50 text-indigo-900"
        }`}
      >
        <span className="font-semibold">{label}</span>
        <span className={`text-xs ${open ? "text-white/70" : "text-slate-400"}`}>{summary}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""} ${open ? "text-white/70" : "text-slate-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            {!allSelected && (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Select all
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = allSelected || selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-navy-900 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                    className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// A small real trend chart built from actual monthly amounts (not
// decorative filler) — bars plus a connecting line, colored to match
// the card it sits in. Renders nothing if there isn't enough data yet.
function Sparkline({ values, stroke, fill }) {
  if (!values || values.filter((v) => v > 0).length < 2) return null;

  const w = 100;
  const h = 36;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const points = values.map((v, i) => [i * stepX, h - ((v - min) / range) * h]);
  const barWidth = Math.max(stepX * 0.5, 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 mt-4" preserveAspectRatio="none">
      {points.map(([x, y], i) => (
        <rect key={i} x={x - barWidth / 2} y={y} width={barWidth} height={h - y} fill={fill} opacity={0.35} rx={1} />
      ))}
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.slice(0, -1).map(([x, y], i) => (
        <circle key={`d-${i}`} cx={x} cy={y} r={2} fill={stroke} />
      ))}
    </svg>
  );
}

// One of the three cumulative Conversion cards. `diff` (only passed on
// the FY 2026-2027 card) shows the ▼/▲ % plus the bold ₹ gap vs the
// same-period card right before it. `theme` colors the title, big
// number, badge, and sparkline consistently. `sparkValues` is the real
// month-by-month amount series behind this card's total.
const CARD_THEMES = {
  blue: {
    bg: "bg-gradient-to-b from-blue-50/70 to-white",
    title: "text-blue-700",
    number: "text-blue-700",
    badge: "bg-blue-100 text-blue-600",
    sparkStroke: "#3b82f6",
    sparkFill: "#60a5fa",
  },
  emerald: {
    bg: "bg-gradient-to-b from-emerald-50/70 to-white",
    title: "text-emerald-700",
    number: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-600",
    sparkStroke: "#10b981",
    sparkFill: "#34d399",
  },
  rose: {
    bg: "bg-gradient-to-b from-rose-50/70 to-white",
    title: "text-rose-600",
    number: "text-rose-600",
    badge: "bg-rose-100 text-rose-600",
    sparkStroke: "#f43f5e",
    sparkFill: "#fb7185",
  },
};

function ConversionCard({ title, sublabel, amount, donors, theme, diff, sparkValues }) {
  const t = CARD_THEMES[theme] || CARD_THEMES.blue;
  return (
    <div className={`rounded-2xl border border-slate-100 shadow-sm p-5 relative ${t.bg}`}>
      <span className={`absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center ${t.badge}`}>
        <IconCalendar className="w-4 h-4" />
      </span>
      <p className={`text-xs uppercase tracking-wide font-bold mb-1 pr-8 ${t.title}`}>{title}</p>
      {sublabel && <p className="text-xs text-slate-500 font-medium mb-3">{sublabel}</p>}
      <p className={`font-display text-2xl font-bold ${t.number}`}>{moneyCr(amount)}</p>
      <p className={`text-xs font-semibold mt-1 ${t.title}`}>{donors} donors</p>
      {diff && diff.pctChange != null && (
        <p className={`text-xs font-semibold mt-3 ${diff.pctChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {diff.pctChange >= 0 ? "▲" : "▼"} {Math.abs(diff.pctChange).toFixed(1)}%
          <span className="font-bold ml-1">
            ({moneyCr(diff.amount)})
          </span>
        </p>
      )}
      <Sparkline values={sparkValues} stroke={t.sparkStroke} fill={t.sparkFill} />
    </div>
  );
}

// 4th card, sitting in the same row as the 3 Conversion cards: this
// calendar month only (not cumulative) for both years, stacked with a
// dashed divider — last year's figure is the headline, this year's is
// the small comparison figure below it. Automatically shows September
// once the fiscal cutoff moves there.
function MonthComparisonCard({ monthName, fy1, fy2, amountA, donorsA, amountB, donorsB, diffPct, diffAmount }) {
  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm p-5 relative bg-gradient-to-b from-indigo-50/70 to-white">
      <span className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600">
        <IconCalendar className="w-4 h-4" />
      </span>
      <p className="text-xs uppercase tracking-wide text-slate-800 font-bold mb-3 pr-8">{monthName}</p>

      <p className="text-xs text-slate-500 font-semibold">FY {fy1}</p>
      <p className="font-display text-2xl font-bold text-indigo-600">{moneyCr(amountA)}</p>
      <p className="text-xs text-indigo-600 font-semibold mt-1">{donorsA} donors</p>

      <div className="border-t border-dashed border-slate-200 my-3" />

      <p className="text-xs text-slate-500 font-semibold">FY {fy2}</p>
      <p className="font-display text-lg font-bold text-pink-600">{moneyCr(amountB)}</p>
      <p className="text-xs text-pink-600 font-semibold mt-1">{donorsB} donors</p>

      {diffPct != null && (
        <>
          <div className="border-t border-dashed border-slate-200 my-3" />
          <p className={`text-xs font-semibold ${diffPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {diffPct >= 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
            <span className="font-bold ml-1">({moneyCr(diffAmount)})</span>
          </p>
        </>
      )}
    </div>
  );
}

function ComparisonTable({ title, rows, fy1, fy2, theme }) {
  const { bar, icon: Icon } = TABLE_THEMES[theme] || TABLE_THEMES.type;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className={`${bar} text-white px-4 sm:px-5 py-3 flex items-center gap-2`}>
        <Icon className="w-4 h-4" />
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

// Month-by-month FY25-26 vs FY26-27 breakdown, replacing the old "By
// Stage" table and the Standard Pipeline card. Months in FY2 that are
// still in the future (haven't happened yet this fiscal year) show "—"
// in the Difference column instead of a misleading -100%.
// Difference cells are clickable (when diffPct isn't null — i.e. the
// month has actually happened in both years) and open the donor-level
// 4-bucket breakdown modal for that month via onDiffClick. Donors count
// cells are always clickable (when > 0) and open a simple donor list for
// that one FY+month via onDonorCountClick.
function MonthlyTable({ rows, fy1, fy2, onDiffClick, onDonorCountClick }) {
  const { bar, icon: Icon } = TABLE_THEMES.month;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className={`${bar} text-white px-4 sm:px-5 py-3 flex items-center gap-2`}>
        <Icon className="w-4 h-4" />
        <p className="font-display font-semibold text-sm">By Month</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th rowSpan={2} className="px-4 py-2 font-semibold text-left align-bottom">Month</th>
              <th colSpan={2} className="px-4 py-2 font-semibold border-l border-slate-100">FY {fy1}</th>
              <th colSpan={2} className="px-4 py-2 font-semibold border-l border-slate-100">FY {fy2}</th>
              <th rowSpan={2} className="px-4 py-2 font-semibold border-l border-slate-100 align-bottom">Difference</th>
            </tr>
            <tr className="text-center text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-1.5 font-medium border-l border-slate-100">Amount</th>
              <th className="px-4 py-1.5 font-medium">Donors</th>
              <th className="px-4 py-1.5 font-medium border-l border-slate-100">Amount</th>
              <th className="px-4 py-1.5 font-medium">Donors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2 text-navy-900 font-medium whitespace-nowrap">{r.name}</td>
                <td className="px-4 py-2 text-right text-slate-600 border-l border-slate-100">{money(r.amountA)}</td>
                <td className="px-4 py-2 text-right border-l-0">
                  {r.donorsA > 0 ? (
                    <button
                      type="button"
                      onClick={() => onDonorCountClick(fy1, r.name)}
                      className="text-navy-700 font-semibold hover:underline cursor-pointer w-full text-right"
                    >
                      {r.donorsA}
                    </button>
                  ) : (
                    <span className="text-slate-400">{r.donorsA}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-slate-600 border-l border-slate-100">{money(r.amountB)}</td>
                <td className="px-4 py-2 text-right">
                  {r.donorsB > 0 ? (
                    <button
                      type="button"
                      onClick={() => onDonorCountClick(fy2, r.name)}
                      className="text-navy-700 font-semibold hover:underline cursor-pointer w-full text-right"
                    >
                      {r.donorsB}
                    </button>
                  ) : (
                    <span className="text-slate-400">{r.donorsB}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right border-l border-slate-100 whitespace-nowrap">
                  {r.diffPct == null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDiffClick(r.name)}
                      className={`font-semibold hover:underline cursor-pointer ${r.diffPct >= 0 ? "text-emerald-600" : "text-red-500"}`}
                    >
                      {r.diffPct >= 0 ? "▲" : "▼"} {Math.abs(r.diffPct).toFixed(1)}%{" "}
                      <span className="font-bold">({money(r.diffAmount)})</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
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

  // Filter option lists (distinct values across all deals), fetched once.
  const [filterOptions, setFilterOptions] = useState({ types: [], kams: [], spocs: [], platforms: [] });

  // Each filter is either null ("everything") or an explicit array of
  // the values still selected. Toggling down to zero is blocked; toggling
  // back up to the full list collapses back to null.
  const [selectedTypes, setSelectedTypes] = useState(null);
  const [selectedKams, setSelectedKams] = useState(null);
  const [selectedSpocs, setSelectedSpocs] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState(null);

  const toggleIn = (setter, allOptions) => (value) => {
    setter((current) => {
      const base = current == null ? allOptions : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return current; // never allow zero selected
      if (next.length === allOptions.length) return null; // back to "everything"
      return next;
    });
  };
  const toggleType = toggleIn(setSelectedTypes, filterOptions.types);
  const toggleKam = toggleIn(setSelectedKams, filterOptions.kams);
  const toggleSpoc = toggleIn(setSelectedSpocs, filterOptions.spocs);
  const togglePlatform = toggleIn(setSelectedPlatforms, filterOptions.platforms);
  const buildFilterParams = () => {
    const params = new URLSearchParams({ fy1, fy2 });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    if (selectedKams != null) params.set("kams", selectedKams.join(","));
    if (selectedSpocs != null) params.set("spocs", selectedSpocs.join(","));
    if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
    return params;
  };

  // Donor breakdown modal for a clicked month's Difference cell.
  const [modalMonth, setModalMonth] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  const openMonthModal = (monthName) => {
    setModalMonth(monthName);
    setModalData(null);
    setModalError(null);
    setModalLoading(true);

    const params = buildFilterParams();
    params.set("month", monthName);
    fetch(`/api/crm-analysis/fy-comparison/month-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setModalData)
      .catch((e) => setModalError(e.message))
      .finally(() => setModalLoading(false));
  };

  // Donor list modal for a clicked Donors count cell (one FY + month).
  const [donorListOpen, setDonorListOpen] = useState(false);
  const [donorListFy, setDonorListFy] = useState(null);
  const [donorListMonth, setDonorListMonth] = useState(null);
  const [donorListRows, setDonorListRows] = useState([]);

  const openDonorListModal = (fy, monthName) => {
    setDonorListFy(fy);
    setDonorListMonth(monthName);
    setDonorListRows([]);
    setDonorListOpen(true);

    const params = buildFilterParams();
    params.set("fy", fy);
    params.set("month", monthName);
    fetch(`/api/crm-analysis/fy-comparison/month-donor-list?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setDonorListRows(json.donors || []))
      .catch(() => setDonorListRows([]));
  };

  useEffect(() => {
    fetch(`/api/crm-analysis/filter-options`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFilterOptions)
      .catch(() => {
        /* Filter pills just won't render if this fails — non-fatal. */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = buildFilterParams();
    fetch(`/api/crm-analysis/fy-comparison?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTypes, selectedKams, selectedSpocs, selectedPlatforms]);

  const filterBar = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <FilterGroup label="Type" options={filterOptions.types} selected={selectedTypes} onToggle={toggleType} />
      <div className="flex flex-wrap gap-2.5">
        <MultiSelectDropdown
          label="KAM"
          options={filterOptions.kams}
          selected={selectedKams}
          onToggle={toggleKam}
          onSelectAll={() => setSelectedKams(null)}
        />
        <MultiSelectDropdown
          label="SPOC"
          options={filterOptions.spocs}
          selected={selectedSpocs}
          onToggle={toggleSpoc}
          onSelectAll={() => setSelectedSpocs(null)}
        />
        <MultiSelectDropdown
          label="Platform"
          options={filterOptions.platforms}
          selected={selectedPlatforms}
          onToggle={togglePlatform}
          onSelectAll={() => setSelectedPlatforms(null)}
        />
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {filterBar}
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
          Loading FY comparison…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {filterBar}
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load FY comparison: {error}
        </div>
      </div>
    );
  }

  const conv = data.conversion || {};
  const monthLabel = conv.currentMonthLabel || "";

  return (
    <div className="space-y-5 sm:space-y-6">
      {filterBar}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <IconBuilding className="w-4 h-4" />
          </span>
          <p className="font-display font-bold text-sm text-navy-900">Conversion</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ConversionCard
            title={`FY ${data.fy1}`}
            sublabel="Full year"
            amount={conv.fy1Full?.amount}
            donors={conv.fy1Full?.donors}
            theme="blue"
            sparkValues={data.byMonth?.map((r) => r.amountA)}
          />
          <ConversionCard
            title={`FY ${data.fy1}`}
            sublabel={`Apr\u2013${monthLabel} (same period)`}
            amount={conv.fy1YTD?.amount}
            donors={conv.fy1YTD?.donors}
            theme="emerald"
            sparkValues={data.byMonth?.filter((r) => r.diffPct != null).map((r) => r.amountA)}
          />
          <ConversionCard
            title={`FY ${data.fy2}`}
            sublabel={`Apr\u2013${monthLabel}`}
            amount={conv.fy2YTD?.amount}
            donors={conv.fy2YTD?.donors}
            theme="rose"
            sparkValues={data.byMonth?.filter((r) => r.diffPct != null).map((r) => r.amountB)}
            diff={{
              pctChange: conv.ytdPctChange,
              amount: conv.ytdDiffAmount,
              vsLabel: `FY ${data.fy1} same period`,
            }}
          />
          <MonthComparisonCard
            monthName={conv.currentMonth?.name}
            fy1={data.fy1}
            fy2={data.fy2}
            amountA={conv.currentMonth?.fy1Amount}
            donorsA={conv.currentMonth?.fy1Donors}
            amountB={conv.currentMonth?.fy2Amount}
            donorsB={conv.currentMonth?.fy2Donors}
            diffPct={conv.currentMonth?.diffPct}
            diffAmount={conv.currentMonth?.diffAmount}
          />
        </div>
      </div>

      <MonthlyTable
        rows={data.byMonth}
        fy1={data.fy1}
        fy2={data.fy2}
        onDiffClick={openMonthModal}
        onDonorCountClick={openDonorListModal}
      />

      <div className="grid sm:grid-cols-2 gap-5">
        <ComparisonTable title="By Type (Cash/Kind/SE)" rows={data.byType} fy1={data.fy1} fy2={data.fy2} theme="type" />
        <ComparisonTable title="By Donor Type" rows={data.byDonorType} fy1={data.fy1} fy2={data.fy2} theme="donorType" />
        <ComparisonTable title="By KAM" rows={data.byKAM} fy1={data.fy1} fy2={data.fy2} theme="kam" />
        <ComparisonTable title="By Platform" rows={data.byPlatform} fy1={data.fy1} fy2={data.fy2} theme="platform" />
      </div>

      <MonthDonorBreakdownModal
        open={modalMonth != null}
        onClose={() => setModalMonth(null)}
        monthName={modalMonth}
        fy1={data.fy1}
        fy2={data.fy2}
        loading={modalLoading}
        error={modalError}
        data={modalData}
      />

      <DonorDrilldownModal
        open={donorListOpen}
        onClose={() => setDonorListOpen(false)}
        monthName={donorListMonth}
        fy={donorListFy}
        donors={donorListRows}
      />
    </div>
  );
}