import { useEffect, useMemo, useRef, useState } from "react";
import { moneyCr } from "../lib/format.js";

const TYPES = ["Cash", "Kind", "School Engagement"];

// One KAM's row: a track with the achieved amount as a filled bar, and
// a distinct marker for the Target, with its value labeled right next
// to that marker — both drawn to the same scale (`maxScale`) so every
// row in the chart is visually comparable, not just relative to its
// own numbers.
//
// Hovering the bar shows a read-only tooltip (KAM name, amount, balance
// to achieve) — always available, regardless of how many Types are
// selected. Double-clicking opens the same info as an editable overlay
// with a Target field, but only when exactly one Type is selected,
// since a combined multi-Type or multi-KAM figure has no single place
// to write an edit back to.
function KamRow({ row, maxScale, fy, editType, canEdit, onTargetSaved }) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(row.target != null ? String(row.target / 10000000) : "");
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef(null);

  // Keeps the field in sync with the actual stored target whenever it
  // (or the active Type selection) changes — not just on mount, so a
  // quick Type switch can never leave this showing a stale number.
  useEffect(() => {
    setInputValue(row.target != null ? String(row.target / 10000000) : "");
  }, [row.target, editType]);

  useEffect(() => {
    if (!editing) return;
    function handleClickOutside(e) {
      if (overlayRef.current && !overlayRef.current.contains(e.target)) setEditing(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing]);

  const achievedPct = maxScale > 0 ? Math.min(100, (row.achieved / maxScale) * 100) : 0;
  const targetPct = row.target != null && maxScale > 0 ? Math.min(100, (row.target / maxScale) * 100) : null;
  const hasTarget = row.target != null;
  const met = hasTarget && row.achieved >= row.target;
  const balance = hasTarget ? Math.max(0, row.target - row.achieved) : null;

  const barColor = !hasTarget ? "bg-indigo-400" : met ? "bg-emerald-500" : "bg-amber-500";

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed === "" || !canEdit) return;
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      setInputValue(row.target != null ? String(row.target / 10000000) : "");
      return;
    }
    setSaving(true);
    fetch("/api/crm-analysis/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kam: row.kam, fy, type: editType, value: parsed }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        onTargetSaved(row.kam, parsed * 10000000);
        setEditing(false);
      })
      .catch(() => {
        setInputValue(row.target != null ? String(row.target / 10000000) : "");
      })
      .finally(() => setSaving(false));
  };

  // The same KAM/Amount/Balance block is shown in the read-only hover
  // tooltip and at the top of the editable double-click overlay — kept
  // as one piece so the two stay visually identical apart from the
  // Target field the editable version adds underneath.
  const infoBlock = (
    <>
      <p className="text-xs font-semibold text-slate-500 mb-2 truncate" title={row.kam}>
        {row.kam}
      </p>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-400">Amount</span>
        <span className="font-bold text-navy-900">{moneyCr(row.achieved)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Balance to achieve</span>
        {balance != null ? (
          <span className={`font-bold ${balance === 0 ? "text-emerald-600" : "text-amber-600"}`}>
            {balance === 0 ? "Target met" : moneyCr(balance)}
          </span>
        ) : (
          <span className="text-slate-300">No target set</span>
        )}
      </div>
    </>
  );

  return (
    <div className="relative flex items-center gap-3">
      <p className="w-40 shrink-0 text-sm font-medium text-navy-900 truncate" title={row.kam}>
        {row.kam}
      </p>
      <div
        className={`relative flex-1 h-12 bg-slate-100 rounded-lg overflow-visible ${canEdit ? "cursor-pointer" : ""}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onDoubleClick={() => {
          if (!canEdit) return;
          setHovering(false);
          setEditing(true);
        }}
      >
        {/* Achieved bar sits in the top half of the track; its label (inside
            the bar when there's room, or just above/after it when the bar
            is too short) stays pinned to the top half. The Target marker's
            label sits in the bottom half instead of the same vertical
            center — that's what keeps the two from ever overlapping each
            other's text, even when achieved is small and Target sits close
            by. */}
        <div
          className={`absolute top-1 h-6 left-0 rounded-lg ${barColor} flex items-center justify-end pr-2 transition-all`}
          style={{ width: `${Math.max(achievedPct, row.achieved > 0 ? 4 : 0)}%` }}
        >
          {achievedPct > 18 && (
            <span className="text-[11px] font-semibold text-white whitespace-nowrap">{moneyCr(row.achieved)}</span>
          )}
        </div>
        {achievedPct <= 18 && (
          <span
            className="absolute top-1 h-6 flex items-center text-[11px] font-semibold text-navy-700 whitespace-nowrap"
            style={{ left: `calc(${Math.max(achievedPct, row.achieved > 0 ? 4 : 0)}% + 6px)` }}
          >
            {moneyCr(row.achieved)}
          </span>
        )}
        {hasTarget && (
          <div className="absolute inset-y-0 flex flex-col items-start" style={{ left: `${targetPct}%` }}>
            <div className="w-0.5 h-full bg-navy-900" />
            <span className="absolute bottom-0.5 left-1.5 text-[11px] font-semibold text-navy-700 whitespace-nowrap">
              Target: {moneyCr(row.target)}
            </span>
          </div>
        )}
      </div>

      {/* Read-only hover tooltip — shown any time the bar is hovered and
          the editable overlay isn't already open. Doesn't require a
          single Type to be selected; it's purely informational. */}
      {hovering && !editing && (
        <div className="absolute z-10 top-full mt-1.5 left-40 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-3 pointer-events-none">
          {infoBlock}
          {!canEdit && (
            <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
              Select exactly one Type above to edit this target.
            </p>
          )}
        </div>
      )}

      {editing && (
        <div
          ref={overlayRef}
          className="absolute z-20 top-full mt-1.5 left-40 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-3.5"
        >
          <div className="mb-3">{infoBlock}</div>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-slate-400 whitespace-nowrap">Target ₹</span>
            <input
              autoFocus
              type="number"
              step="0.01"
              value={inputValue}
              placeholder="0.00"
              disabled={saving}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-20 text-sm font-semibold text-navy-900 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
            />
            <span className="text-xs text-slate-400">Cr</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// KAM-wise Target chart: for the selected Type(s) (Cash/Kind/School
// Engagement, multi-select, controlled by the parent's shared Type
// filter — see selectedTypes/onToggleType), shows every KAM's Total
// Conversion so far against their combined Target for FY 2026-2027, as
// one comparable bar chart instead of the per-month, per-KAM tables
// above it.
export default function KamTargetChart({ fy, selectedTypes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const typesInUse = selectedTypes || TYPES;
  const typesKey = typesInUse.join(",");
  // Editing a target needs exactly one specific Type to write the value
  // against — with several selected at once there's no single Type key
  // an edit could resolve to, the same reasoning that makes the KAM
  // Target row read-only once more than one KAM is in view.
  const canEdit = typesInUse.length === 1;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null); // clear the previous selection's rows immediately, so a row is never
    // briefly rendered under a new Type combo while still holding the
    // old one's numbers.
    fetch(`/api/crm-analysis/kam-targets-overview?${new URLSearchParams({ fy, types: typesKey }).toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy, typesKey]);

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

  const typesLabel = selectedTypes == null ? "All Types" : selectedTypes.join(", ");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="mb-4">
        <p className="font-display font-bold text-navy-900 text-lg">KAM-wise Target</p>
        <p className="text-sm text-slate-400">
          Total Conversion vs Target, FY {fy}
          {!canEdit && " — select exactly one Type above to edit a target"}
        </p>
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
            <p className="text-sm font-semibold text-slate-500">Total ({typesLabel})</p>
            <p className="text-sm">
              <span className="font-bold text-navy-900">{moneyCr(totals.achieved)}</span>
              {totals.anyTarget && <span className="text-slate-400"> {" "}/ Target {moneyCr(totals.target)}</span>}
            </p>
          </div>

          <div className="space-y-3">
            {data.rows.map((row) => (
              <KamRow
                key={`${typesKey}-${row.kam}`}
                row={row}
                maxScale={maxScale}
                fy={fy}
                editType={canEdit ? typesInUse[0] : null}
                canEdit={canEdit}
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
                No {typesLabel} conversions or targets found for FY {fy}.
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