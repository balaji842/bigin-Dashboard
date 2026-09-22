import { useEffect, useMemo, useState } from "react";
import { moneyCr } from "../lib/format.js";

const TYPES = ["Cash", "Kind", "School Engagement"];

function TypeTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
        active
          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm"
          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

// One KAM's row: a track with the achieved amount as a filled bar, and
// a distinct marker + label for the Target — both drawn to the same
// scale (`maxScale`) so every row in the chart is visually comparable,
// not just relative to its own numbers. The target itself is editable
// right here — same PUT the per-KAM Target row above already uses,
// just typed directly against this chart instead.
function KamRow({ row, maxScale, fy, type, onTargetSaved }) {
  const [inputValue, setInputValue] = useState(row.target != null ? String(row.target / 10000000) : "");
  const [saving, setSaving] = useState(false);

  // Keeps the input in sync with the actual stored target whenever it
  // (or the active Type tab) changes — not just on mount. Without this,
  // switching tabs quickly could mount this row with a stale value from
  // the previous tab (captured right before the fresh fetch resolved)
  // and the input would then be stuck showing the wrong tab's number,
  // since useState's initial value only ever runs once.
  useEffect(() => {
    setInputValue(row.target != null ? String(row.target / 10000000) : "");
  }, [row.target, type]);

  const achievedPct = maxScale > 0 ? Math.min(100, (row.achieved / maxScale) * 100) : 0;
  const targetPct = row.target != null && maxScale > 0 ? Math.min(100, (row.target / maxScale) * 100) : null;
  const hasTarget = row.target != null;
  const met = hasTarget && row.achieved >= row.target;

  const barColor = !hasTarget ? "bg-indigo-400" : met ? "bg-emerald-500" : "bg-amber-500";

  const handleBlur = () => {
    const trimmed = inputValue.trim();
    if (trimmed === "") return; // leave the existing target alone rather than clearing it
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      setInputValue(row.target != null ? String(row.target / 10000000) : "");
      return;
    }
    setSaving(true);
    fetch("/api/crm-analysis/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kam: row.kam, fy, type, value: parsed }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        onTargetSaved(row.kam, parsed * 10000000);
      })
      .catch(() => {
        // Revert the input on a failed save — the chart itself stays
        // at whatever the last confirmed target was.
        setInputValue(row.target != null ? String(row.target / 10000000) : "");
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex items-center gap-3">
      <p className="w-40 shrink-0 text-sm font-medium text-navy-900 truncate" title={row.kam}>
        {row.kam}
      </p>
      <div className="relative flex-1 h-8 bg-slate-100 rounded-lg overflow-visible">
        <div
          className={`absolute inset-y-0 left-0 rounded-lg ${barColor} flex items-center justify-end pr-2 transition-all`}
          style={{ width: `${Math.max(achievedPct, row.achieved > 0 ? 4 : 0)}%` }}
        >
          {achievedPct > 18 && (
            <span className="text-[11px] font-semibold text-white whitespace-nowrap">{moneyCr(row.achieved)}</span>
          )}
        </div>
        {achievedPct <= 18 && (
          <span
            className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-navy-700 whitespace-nowrap"
            style={{ left: `calc(${Math.max(achievedPct, row.achieved > 0 ? 4 : 0)}% + 6px)` }}
          >
            {moneyCr(row.achieved)}
          </span>
        )}
        {hasTarget && (
          <div className="absolute inset-y-0 flex items-center" style={{ left: `${targetPct}%` }}>
            <div className="w-0.5 h-full bg-navy-900" />
          </div>
        )}
      </div>
      <div className="w-36 shrink-0 flex items-center gap-1.5">
        <span className="text-[11px] text-slate-400 whitespace-nowrap">Target ₹</span>
        <input
          type="number"
          step="0.01"
          value={inputValue}
          placeholder="Set target"
          disabled={saving}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-20 text-sm font-semibold text-navy-900 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
        />
        <span className="text-[11px] text-slate-400">Cr</span>
      </div>
    </div>
  );
}

// KAM-wise Target chart: for the selected Type (Cash/Kind/School
// Engagement), shows every KAM's Total Conversion so far against their
// Target for FY 2026-2027, as one comparable bar chart instead of the
// per-month, per-KAM tables above it.
export default function KamTargetChart({ fy }) {
  const [type, setType] = useState("Cash");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null); // clear the previous tab's rows immediately, so a row is never
    // briefly rendered under the new Type's tab while still holding
    // the old tab's numbers (which is what fed the stale-input bug).
    fetch(`/api/crm-analysis/kam-targets-overview?${new URLSearchParams({ fy, type }).toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy, type]);

  const maxScale = useMemo(() => {
    if (!data) return 0;
    const highest = data.rows.reduce((m, r) => Math.max(m, r.achieved, r.target || 0), 0);
    return highest * 1.15; // headroom so the Target label/marker never sits flush against the edge
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return { achieved: 0, target: 0, anyTarget: false };
    return data.rows.reduce(
      (acc, r) => ({
        achieved: acc.achieved + r.achieved,
        target: acc.target + (r.target || 0),
        anyTarget: acc.anyTarget || r.target != null,
      }),
      { achieved: 0, target: 0, anyTarget: false }
    );
  }, [data]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-display font-bold text-navy-900 text-lg">KAM-wise Target</p>
          <p className="text-sm text-slate-400">Total Conversion vs Target, FY {fy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <TypeTab key={t} label={t} active={type === t} onClick={() => setType(t)} />
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="py-10 text-center text-slate-400 text-sm">Loading KAM-wise target…</div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load KAM-wise target: {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between px-1 mb-3 pb-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-500">Total ({type})</p>
            <p className="text-sm">
              <span className="font-bold text-navy-900">{moneyCr(totals.achieved)}</span>
              {totals.anyTarget && <span className="text-slate-400"> {" "}/ Target {moneyCr(totals.target)}</span>}
            </p>
          </div>

          <div className="space-y-3">
            {data.rows.map((row) => (
              <KamRow
                key={`${type}-${row.kam}`}
                row={row}
                maxScale={maxScale}
                fy={fy}
                type={type}
                onTargetSaved={(kam, newTargetRupees) =>
                  setData((prev) => ({
                    ...prev,
                    rows: prev.rows.map((r) => (r.kam === kam ? { ...r, target: newTargetRupees } : r)),
                  }))
                }
              />
            ))}
            {data.rows.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">
                No {type} conversions or targets found for FY {fy}.
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Target met
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Below target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" /> No target set
            </span>
          </div>
        </>
      )}
    </div>
  );
}