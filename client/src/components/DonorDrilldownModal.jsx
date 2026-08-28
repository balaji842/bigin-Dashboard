import { moneyCr } from "../lib/format.js";

export default function DonorDrilldownModal({ open, onClose, monthName, fy, donors }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <p className="font-display font-semibold text-sm">
            {monthName} {fy} — {donors.length} donor{donors.length !== 1 ? "s" : ""}
          </p>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Donor</th>
                <th className="px-4 py-2 font-semibold text-right">Amount</th>
                <th className="px-4 py-2 font-semibold">Platform</th>
                <th className="px-4 py-2 font-semibold">KAM</th>
                <th className="px-4 py-2 font-semibold">Past FY Giving</th>
              </tr>
            </thead>
            <tbody>
              {donors.map((d, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{d.account}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(d.amount)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.platform}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.kam}</td>
                  <td className="px-4 py-2">
                    {d.history.length === 0 ? (
                      <span className="text-slate-300 text-xs">No prior giving on record</span>
                    ) : (
                      <div className="space-y-0.5">
                        {d.history.map((h, j) => (
                          <div key={j} className="text-xs text-slate-500 whitespace-nowrap">
                            FY {h.fiscalYear}: {moneyCr(h.amount)}{h.month ? ` (${h.month})` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {donors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-xs">
                    No donors closed in this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}