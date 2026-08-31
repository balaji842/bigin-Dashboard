import { moneyCr } from "../lib/format.js";

function DiffBadge({ pct, amount }) {
  if (pct == null) return <span className="text-slate-300">—</span>;
  return (
    <span className={`font-semibold whitespace-nowrap ${pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%{" "}
      <span className="font-bold">({moneyCr(amount)})</span>
    </span>
  );
}

function BucketSection({ title, donorCount, totalAmount, children }) {
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 py-2.5 flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
        <p className="font-display font-semibold text-sm">{title}</p>
        <p className="text-xs text-white/70">
          Donor Unique Count: <span className="text-white font-semibold">{donorCount}</span>
          <span className="mx-2">·</span>
          Total Amount: <span className="text-white font-semibold">{moneyCr(totalAmount)}</span>
        </p>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ span }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-4 text-center text-slate-400 text-xs">
        None this month.
      </td>
    </tr>
  );
}

export default function MonthDonorBreakdownModal({ open, onClose, monthName, fy1, fy2, loading, error, data }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg max-w-6xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <p className="font-display font-semibold text-sm">
            {monthName} — FY {fy1} vs FY {fy2} donor breakdown
          </p>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4 bg-slate-50">
          {loading && (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 text-sm">Loading donors…</div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
              Couldn't load donor breakdown: {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <BucketSection title="Matching Donors" donorCount={data.matching.donorCount} totalAmount={data.matching.totalAmount}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <th className="px-4 py-2 font-semibold">Donor</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy1} Amount &amp; Type</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy2} Amount &amp; Type</th>
                        <th className="px-4 py-2 font-semibold text-right">Difference</th>
                        <th className="px-4 py-2 font-semibold">KAM</th>
                        <th className="px-4 py-2 font-semibold">SPOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.matching.rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)} — {r.fy1Type}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)} — {r.fy2Type}</td>
                          <td className="px-4 py-2 text-right"><DiffBadge pct={r.diffPct} amount={r.diffAmount} /></td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {data.matching.rows.length === 0 && <EmptyRow span={7} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="Missing Donors" donorCount={data.missing.donorCount} totalAmount={data.missing.totalAmount}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <th className="px-4 py-2 font-semibold">Donor</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy1} Amount &amp; Type</th>
                        <th className="px-4 py-2 font-semibold">KAM</th>
                        <th className="px-4 py-2 font-semibold">SPOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.missing.rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)} — {r.fy1Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {data.missing.rows.length === 0 && <EmptyRow span={5} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="New Donors" donorCount={data.newDonors.donorCount} totalAmount={data.newDonors.totalAmount}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <th className="px-4 py-2 font-semibold">Donor</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy1} Amount, Type &amp; Month</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy2} Amount &amp; Type</th>
                        <th className="px-4 py-2 font-semibold">Platform</th>
                        <th className="px-4 py-2 font-semibold">KAM</th>
                        <th className="px-4 py-2 font-semibold">SPOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.newDonors.rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {r.fy1Amount == null ? (
                              <span className="text-slate-300">No prior giving</span>
                            ) : (
                              `${moneyCr(r.fy1Amount)} — ${r.fy1Type} (${r.fy1Month})`
                            )}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)} — {r.fy2Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {data.newDonors.rows.length === 0 && <EmptyRow span={7} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="Past Donors" donorCount={data.past.donorCount} totalAmount={data.past.totalAmount}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <th className="px-4 py-2 font-semibold">Donor</th>
                        <th className="px-4 py-2 font-semibold">Prior FY Giving</th>
                        <th className="px-4 py-2 font-semibold text-right">FY {fy2} Amount &amp; Type</th>
                        <th className="px-4 py-2 font-semibold">Platform</th>
                        <th className="px-4 py-2 font-semibold">KAM</th>
                        <th className="px-4 py-2 font-semibold">SPOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.past.rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{r.priorSummary}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)} — {r.fy2Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {data.past.rows.length === 0 && <EmptyRow span={7} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}