import { useEffect, useRef, useState } from "react";
import MonthDonorBreakdownModal from "./MonthDonorBreakdownModal.jsx";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

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
                  ? "bg-navy-900 text-white border-navy-900"
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
            ? "border-navy-900 bg-navy-900 text-white"
            : allSelected
            ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            : "border-navy-900 bg-navy-100 text-navy-900"
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
                className="text-xs font-semibold text-navy-700 hover:underline"
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
                    className="w-4 h-4 rounded border-slate-300 accent-navy-900 cursor-pointer"
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

// One of the three cumulative Conversion cards. `diff` (only passed on
// the FY 2026-2027 card) shows the ▼/▲ % plus the bold ₹ gap vs the
// same-period card right before it.
function ConversionCard({ title, sublabel, amount, donors, donorColorClass, diff }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-600 font-bold mb-1">{title}</p>
      {sublabel && <p className="text-xs text-slate-500 font-medium mb-3">{sublabel}</p>}
      <p className="font-display text-2xl font-bold text-navy-700">{money(amount)}</p>
      <p className={`text-xs font-semibold mt-1 ${donorColorClass}`}>{donors} donors</p>
      {diff && diff.pctChange != null && (
        <p className={`text-xs font-semibold mt-3 ${diff.pctChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {diff.pctChange >= 0 ? "▲" : "▼"} {Math.abs(diff.pctChange).toFixed(1)}%
          <span className="font-bold ml-1">
            ({money(diff.amount)})
          </span>
        </p>
      )}
    </div>
  );
}

// 4th card, shown full-width below the 3-card row: this calendar month
// only (not cumulative) for both years, side by side. Automatically
// shows September once the fiscal cutoff moves there.
function MonthComparisonCard({ monthName, fy1, fy2, amountA, donorsA, amountB, donorsB, diffPct, diffAmount }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <p className="text-xs uppercase tracking-wide text-slate-600 font-bold mb-1">{monthName}</p>
      <p className="text-sm text-slate-500 font-medium mb-5">Month vs month</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5">
        <div>
          <p className="text-sm text-slate-500 font-semibold mb-1">FY {fy1}</p>
          <p className="font-display text-2xl font-bold text-navy-700">{money(amountA)}</p>
          <p className="text-sm text-blue-700 font-semibold mt-1">{donorsA} donors</p>
        </div>
        <div>
          <p className="text-sm text-slate-500 font-semibold mb-1">FY {fy2}</p>
          <p className="font-display text-2xl font-bold text-pink-600">{money(amountB)}</p>
          <p className="text-sm text-pink-700 font-semibold mt-1">{donorsB} donors</p>
        </div>
      </div>
      {diffPct != null && (
        <p className={`text-sm font-semibold mt-5 ${diffPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {diffPct >= 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
          <span className="font-bold ml-1">({money(diffAmount)})</span>
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
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 sm:px-5 py-3">
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
        <p className="font-display font-semibold text-sm text-navy-900 mb-3">Conversion</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ConversionCard
            title={`FY ${data.fy1}`}
            sublabel="Full year"
            amount={conv.fy1Full?.amount}
            donors={conv.fy1Full?.donors}
            donorColorClass="text-blue-700"
          />
          <ConversionCard
            title={`FY ${data.fy1}`}
            sublabel={`Apr\u2013${monthLabel} (same period)`}
            amount={conv.fy1YTD?.amount}
            donors={conv.fy1YTD?.donors}
            donorColorClass="text-emerald-700"
          />
          <ConversionCard
            title={`FY ${data.fy2}`}
            sublabel={`Apr\u2013${monthLabel}`}
            amount={conv.fy2YTD?.amount}
            donors={conv.fy2YTD?.donors}
            donorColorClass="text-pink-700"
            diff={{
              pctChange: conv.ytdPctChange,
              amount: conv.ytdDiffAmount,
              vsLabel: `FY ${data.fy1} same period`,
            }}
          />
        </div>

        <div className="mt-4">
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
        <ComparisonTable title="By Type (Cash/Kind/SE)" rows={data.byType} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By Donor Type" rows={data.byDonorType} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By KAM" rows={data.byKAM} fy1={data.fy1} fy2={data.fy2} />
        <ComparisonTable title="By Platform" rows={data.byPlatform} fy1={data.fy1} fy2={data.fy2} />
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