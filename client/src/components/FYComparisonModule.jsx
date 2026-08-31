import { useEffect, useState } from "react";
import MonthDonorBreakdownModal from "./MonthDonorBreakdownModal.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const TYPE_OPTIONS = ["Cash", "Kind", "School Engagement"];

// Multi-select pill filter. All types are selected by default; clicking
// a pill toggles it, but at least one type must always stay selected.
function TypeFilter({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {TYPE_OPTIONS.map((t) => {
        const active = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              active
                ? "bg-navy-900 text-white border-navy-900"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {t}
          </button>
        );
      })}
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
// breakdown modal for that month via onMonthClick.
function MonthlyTable({ rows, fy1, fy2, onMonthClick }) {
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
                <td className="px-4 py-2 text-right text-slate-600">{r.donorsA}</td>
                <td className="px-4 py-2 text-right text-slate-600 border-l border-slate-100">{money(r.amountB)}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.donorsB}</td>
                <td className="px-4 py-2 text-right border-l border-slate-100 whitespace-nowrap">
                  {r.diffPct == null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onMonthClick(r.name)}
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
  const [selectedTypes, setSelectedTypes] = useState(TYPE_OPTIONS);
  const fy1 = "2025-2026";
  const fy2 = "2026-2027";

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

    const params = new URLSearchParams({ fy1, fy2, month: monthName });
    if (selectedTypes.length < TYPE_OPTIONS.length) {
      params.set("types", selectedTypes.join(","));
    }
    fetch(`/api/crm-analysis/fy-comparison/month-donors?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setModalData)
      .catch((e) => setModalError(e.message))
      .finally(() => setModalLoading(false));
  };

  const toggleType = (t) => {
    setSelectedTypes((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      return next.length === 0 ? prev : next; // never allow zero types selected
    });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fy1, fy2 });
    if (selectedTypes.length < TYPE_OPTIONS.length) {
      params.set("types", selectedTypes.join(","));
    }
    fetch(`/api/crm-analysis/fy-comparison?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTypes]);

  if (loading && !data) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <TypeFilter selected={selectedTypes} onToggle={toggleType} />
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
          Loading FY comparison…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <TypeFilter selected={selectedTypes} onToggle={toggleType} />
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
      <TypeFilter selected={selectedTypes} onToggle={toggleType} />

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

      <MonthlyTable rows={data.byMonth} fy1={data.fy1} fy2={data.fy2} onMonthClick={openMonthModal} />

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
    </div>
  );
}