import { useMemo } from "react";
import { moneyCr, fullMoney } from "../lib/format.js";

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

function TypeBadge({ type }) {
  if (!type || type === "Unspecified") return <span className="text-slate-300">—</span>;
  const theme = TYPE_THEME[type] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${theme}`}>
      {type}
    </span>
  );
}

export default function DonorHistoryModal({ open, onClose, donor }) {
  // Hooks must run unconditionally, so this is computed before the
  // early-return check below (it just yields an empty shape when closed).
  const { fyRows, sortedDeals } = useMemo(() => {
    if (!donor) return { fyRows: [], sortedDeals: [] };

    const byFY = {};
    for (const d of donor.deals) {
      const fy = d.fiscalYear || "Unspecified";
      if (!byFY[fy]) byFY[fy] = { amount: 0, count: 0 };
      byFY[fy].amount += d.amount || 0;
      byFY[fy].count += 1;
    }
    const fyRowsCalc = Object.entries(byFY)
      .map(([fy, v]) => ({ fy, ...v }))
      .sort((a, b) => b.fy.localeCompare(a.fy));

    const sorted = [...donor.deals].sort((a, b) => {
      const fyCmp = (b.fiscalYear || "").localeCompare(a.fiscalYear || "");
      if (fyCmp !== 0) return fyCmp;
      const da = a.closingDate ? new Date(a.closingDate).getTime() : 0;
      const db = b.closingDate ? new Date(b.closingDate).getTime() : 0;
      return db - da;
    });

    return { fyRows: fyRowsCalc, sortedDeals: sorted };
  }, [donor]);

  if (!open || !donor) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-navy-900 text-white px-5 sm:px-6 py-4 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-display font-bold text-base sm:text-lg truncate">{donor.account}</p>
            <p className="text-xs text-white/50 mt-0.5">Full donor history · {donor.deals.length} deal{donor.deals.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none ml-4 shrink-0">
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Summary strip */}
          <div className="p-5 sm:p-6 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Total Amount</p>
              <p className="font-display text-lg font-bold text-pink-600">{moneyCr(donor.totalAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Donor Type</p>
              <p className="text-sm font-medium text-navy-900">{donor.donorType}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">KAM(s)</p>
              <p className="text-sm font-medium text-navy-900">{donor.kam}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">SPOC(s)</p>
              {/* Multiple SPOCs are already comma-separated in donor.spoc */}
              <p className="text-sm font-medium text-navy-900">{donor.spoc}</p>
            </div>
          </div>

          {/* Fiscal-year split */}
          <div className="px-5 sm:px-6 pt-5">
            <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Fiscal-year split</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              {fyRows.map((r) => (
                <div key={r.fy} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">FY {r.fy}</p>
                  <p className="font-display text-base font-bold text-navy-900">{moneyCr(r.amount)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.count} deal{r.count !== 1 ? "s" : ""}</p>
                </div>
              ))}
              {fyRows.length === 0 && (
                <p className="text-xs text-slate-400 col-span-full">No fiscal-year data available.</p>
              )}
            </div>
          </div>

          {/* Full deal-by-deal history */}
          <div className="px-5 sm:px-6 py-5">
            <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Deal history</p>
            <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-semibold">FY</th>
                    <th className="px-4 py-2.5 font-semibold">Month</th>
                    <th className="px-4 py-2.5 font-semibold">Pipeline Month</th>
                    <th className="px-4 py-2.5 font-semibold">Type of Engagement</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">KAM</th>
                    <th className="px-4 py-2.5 font-semibold">SPOC</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDeals.map((d, i) => {
                    const isPipeline = d.subPipeline === "Standard Pipeline";
                    return (
                      <tr key={i} className={i % 2 === 1 ? "bg-slate-50/60" : ""}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.fiscalYear || "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                          {monthNameOf(d.closingDate) || "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {isPipeline && d.expectedMonth && d.expectedMonth !== "Unspecified" ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700">
                              {d.expectedMonth}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <TypeBadge type={d.type} />
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap text-navy-900 font-medium" title={fullMoney(d.amount)}>
                          {moneyCr(d.amount)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.kam}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.spoc}</td>
                      </tr>
                    );
                  })}
                  {sortedDeals.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-xs">
                        No deal history found for this donor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}