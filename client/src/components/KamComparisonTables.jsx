import { useEffect, useState } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown.jsx";

// Values here are entered/displayed directly in Crore units (matching
// how Target is typed in), not full rupees — so this just divides and
// formats, no currency symbol, matching the plain-number spreadsheet
// style these tables are modeled on.
const cr = (rupees) => (Number(rupees) || 0) / 10000000;
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

function shortFy(fy) {
  const parts = String(fy).split("-");
  if (parts.length !== 2) return fy;
  return `${parts[0]}-${parts[1].slice(2)}`;
}

function typeNamesOf(breakdowns) {
  const STANDARD = ["Cash", "Kind", "School Engagement"];
  const set = new Set();
  for (const b of breakdowns) (b?.types || []).forEach((t) => set.add(t.type));
  return [...set].sort((a, b) => {
    const ai = STANDARD.indexOf(a);
    const bi = STANDARD.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function cellOf(breakdown, typeName, platform) {
  const t = breakdown?.types?.find((x) => x.type === typeName);
  if (!t) return { amount: 0, donors: 0 };
  return t.byPlatform[platform] || { amount: 0, donors: 0 };
}

function typeTotalOf(breakdown, typeName) {
  const t = breakdown?.types?.find((x) => x.type === typeName);
  return t ? t.total : { amount: 0, donors: 0 };
}

// Shared cell classes so every <td>/<th> in these tables gets the same
// full grid border on every side (Excel's classic gridline look),
// instead of the "border-left only" web-table style used elsewhere in
// this app. No sticky positioning anywhere — that was overlapping and
// clipping adjacent header text.
const CELL = "border border-slate-300 px-1.5 py-1";

// One donors+amount data row (Total conversion / Apr-Month / Pipeline),
// split out across every Type's platform columns plus that Type's own
// Total sub-columns, plus the single grand-total amount cell at the end.
function DataRow({ label, breakdown, typeLayout, highlight }) {
  return (
    <tr className={highlight ? "bg-slate-50 font-semibold" : ""}>
      <td className={`${CELL} text-left font-medium text-navy-900 whitespace-nowrap`}>{label}</td>
      {typeLayout.map(({ type, platforms }) => (
        <>
          {platforms.flatMap((p) => {
            const c = cellOf(breakdown, type, p);
            return [
              <td key={`${type}-${p}-d`} className={`${CELL} text-right text-xs`}>{c.donors}</td>,
              <td key={`${type}-${p}-a`} className={`${CELL} text-right text-xs`}>{fmt(cr(c.amount))}</td>,
            ];
          })}
          <td className={`${CELL} text-right text-xs font-semibold bg-slate-50`}>{typeTotalOf(breakdown, type).donors}</td>
          <td className={`${CELL} text-right text-xs font-semibold bg-slate-50`}>{fmt(cr(typeTotalOf(breakdown, type).amount))}</td>
        </>
      ))}
      <td className={`${CELL} text-right font-bold text-navy-900 bg-slate-100`}>{fmt(cr(breakdown?.grandTotalAmount))}</td>
    </tr>
  );
}

// The "Balance to be achieved" row: one merged value per Type (spanning
// that Type's full platform+total width) instead of per-platform values,
// since a balance-to-target figure only makes sense at the Type level.
function BalanceRow({ typeLayout, targets, conversion, pipeline }) {
  const perType = typeLayout.map(({ type }) => {
    const target = targets[type];
    const achieved = cr(typeTotalOf(conversion, type).amount) + cr(typeTotalOf(pipeline, type).amount);
    return { type, target, achieved, balance: target != null ? target - achieved : null };
  });
  const withTarget = perType.filter((t) => t.target != null);
  const grandBalance =
    withTarget.length > 0
      ? withTarget.reduce((s, t) => s + t.target, 0) - withTarget.reduce((s, t) => s + t.achieved, 0)
      : null;

  return (
    <tr className="bg-slate-200">
      <td className={`${CELL} text-left font-bold text-navy-900 whitespace-nowrap`}>Balance to be achieved</td>
      {typeLayout.map(({ type, platforms }) => {
        const row = perType.find((t) => t.type === type);
        return (
          <td key={type} colSpan={platforms.length * 2 + 2} className={`${CELL} text-center font-semibold`}>
            {row.balance != null ? fmt(row.balance) : <span className="text-slate-400 font-normal text-xs">Set target</span>}
          </td>
        );
      })}
      <td className={`${CELL} text-right font-bold text-white bg-red-600`}>
        {grandBalance != null ? fmt(grandBalance) : <span className="font-normal text-xs">—</span>}
      </td>
    </tr>
  );
}

function TargetRow({ typeLayout, targets, onChange, onBlur, readOnly }) {
  const grandTotal = typeLayout.reduce((s, { type }) => s + (targets[type] || 0), 0);
  const anySet = typeLayout.some(({ type }) => targets[type] != null);
  return (
    <tr className="bg-amber-50">
      <td className={`${CELL} text-left font-semibold text-amber-800 whitespace-nowrap`}>
        Target{readOnly ? " (combined)" : ""}
      </td>
      {typeLayout.map(({ type, platforms }) => (
        <td key={type} colSpan={platforms.length * 2 + 2} className={`${CELL} text-center`}>
          {readOnly ? (
            <span className="text-sm font-semibold text-amber-800">
              {targets[type] != null ? fmt(targets[type]) : <span className="text-slate-400 font-normal text-xs">—</span>}
            </span>
          ) : (
            <input
              type="number"
              step="0.01"
              value={targets[type] ?? ""}
              placeholder="0.00"
              onChange={(e) => onChange(type, e.target.value === "" ? null : Number(e.target.value))}
              onBlur={() => onBlur(type)}
              className="w-20 text-center text-sm font-semibold text-amber-800 bg-white border border-amber-300 rounded-sm px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          )}
        </td>
      ))}
      <td className={`${CELL} text-right font-bold text-amber-800`}>
        {anySet ? fmt(grandTotal) : <span className="text-slate-400 font-normal text-xs">—</span>}
      </td>
    </tr>
  );
}

// One full table: the Type-name header row, the editable Target row, the
// Platform sub-header row, the Donors/Amount sub-sub-header row, then
// data rows. `mode` picks which extra rows appear below "Total conversion":
// "past" -> an "Apr-<month>" same-period row; "current" -> "Pipeline" +
// "Balance to be achieved".
function YearTable({ kamLabel, readOnly, fy, mode, yearData, monthLabel, targets, onTargetChange, onTargetBlur, allPlatforms }) {
  const types = typeNamesOf([yearData?.conversion, yearData?.ytd, yearData?.pipeline]);
  // Every Type shows the SAME Platform columns (the full set found across
  // all donors, not just this KAM's), so the table shape is predictable
  // and consistent no matter which KAM is selected — a KAM with zero
  // School Engagement donors still shows P1/P2/P3, just zero-filled,
  // rather than silently dropping those columns.
  const typeLayout = types.map((type) => ({ type, platforms: allPlatforms }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white px-4 sm:px-5 py-3">
        <p className="font-display font-semibold text-sm">
          Comparison of &quot;{kamLabel}&quot; for the year {fy}
        </p>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${CELL} text-left bg-yellow-200 font-bold text-navy-900`}>{shortFy(fy)}</th>
              {typeLayout.map(({ type, platforms }) => (
                <th key={type} colSpan={platforms.length * 2 + 2} className={`${CELL} bg-rose-200 font-bold text-navy-900`}>
                  {type}
                </th>
              ))}
              <th className={`${CELL} bg-slate-100 font-bold text-navy-900 align-middle`}>Total</th>
</tr>
{mode === "current" && (
  <TargetRow
    typeLayout={typeLayout}
    targets={targets}
    onChange={onTargetChange}
    onBlur={onTargetBlur}
    readOnly={readOnly}
  />
)}
            <tr>
              <th className={`${CELL} text-left bg-slate-50 font-semibold text-slate-500`}>Platform</th>
              {typeLayout.map(({ type, platforms }) => (
                <>
                  {platforms.map((p) => (
                    <th key={`${type}-${p}`} colSpan={2} className={`${CELL} bg-slate-50 font-semibold text-slate-600`}>{p}</th>
                  ))}
                  <th colSpan={2} className={`${CELL} bg-slate-100 font-semibold text-slate-600`}>Total</th>
                </>
              ))}
              <th rowSpan={2} className={`${CELL} bg-slate-100`}></th>
            </tr>
            <tr>
              <th className={`${CELL} text-left bg-slate-50 font-semibold text-slate-500`}>category</th>
              {typeLayout.map(({ type, platforms }) => (
                <>
                  {platforms.flatMap((p) => [
                    <th key={`${type}-${p}-d`} className={`${CELL} bg-white font-medium text-slate-500 text-xs`}>Donors</th>,
                    <th key={`${type}-${p}-a`} className={`${CELL} bg-white font-medium text-slate-500 text-xs`}>Amount</th>,
                  ])}
                  <th className={`${CELL} bg-slate-50 font-medium text-slate-500 text-xs`}>Donors</th>
                  <th className={`${CELL} bg-slate-50 font-medium text-slate-500 text-xs`}>Amount</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            <DataRow label="Total conversion" breakdown={yearData?.conversion} typeLayout={typeLayout} highlight />
            {mode === "past" ? (
              <DataRow label={`Apr - ${monthLabel}`} breakdown={yearData?.ytd} typeLayout={typeLayout} />
            ) : (
              <>
                <DataRow label="Pipeline" breakdown={yearData?.pipeline} typeLayout={typeLayout} />
                <BalanceRow
                  typeLayout={typeLayout}
                  targets={targets}
                  conversion={yearData?.conversion}
                  pipeline={yearData?.pipeline}
                />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function KamComparisonTables({ fy1, fy2 }) {
  const [kams, setKams] = useState([]);
  // null = "All KAM" (every KAM aggregated — the default); an array
  // (including an empty one, reachable via "Clear all") is the
  // explicit subset currently selected.
  const [selectedKams, setSelectedKams] = useState(null);
  const [allPlatforms, setAllPlatforms] = useState([]);

  const [spocs, setSpocs] = useState([]);
  const [selectedSpocs, setSelectedSpocs] = useState(null);
  const [donorTypes, setDonorTypes] = useState([]);
  const [selectedDonorTypes, setSelectedDonorTypes] = useState(null);

  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const [targets, setTargets] = useState({ fy1: {}, fy2: {} });
  const [error, setError] = useState(null);

  // Load the KAM/SPOC/Donor Type lists and the full Platform list once,
  // from the existing filter-options endpoint. Platforms come from here
  // (not from this KAM's own donors) so every table always shows the same
  // P1/P2/P3 columns for every Type, regardless of which KAM is selected.
  useEffect(() => {
    fetch("/api/crm-analysis/filter-options")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setKams(json.kams || []);
        setAllPlatforms(json.platforms || []);
        setSpocs(json.spocs || []);
        setDonorTypes(json.donorTypes || []);
      })
      .catch(() => {
        /* KAM dropdown just stays empty — non-fatal */
      });
  }, []);

  // Standard multi-select toggle: null (nothing chosen yet =
  // "everything") starts from every option checked, unchecking one
  // moves to an explicit list, and unchecking the very last one snaps
  // back to null instead of leaving an empty "show nothing" state.
  const toggleIn = (setter, allOptions) => (value) => {
    setter((current) => {
      const base = current == null ? allOptions : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return current;
      if (next.length === allOptions.length) return null;
      return next;
    });
  };
  const toggleKam = toggleIn(setSelectedKams, kams);
  const toggleSpoc = toggleIn(setSelectedSpocs, spocs);
  const toggleDonorType = toggleIn(setSelectedDonorTypes, donorTypes);

  // Builds the `kam`/`spoc`/`donorType` query values for both the
  // comparison and targets fetches below. "__NONE__" is a sentinel that
  // never matches a real value — used for an explicit empty selection
  // (from "Clear all") so it correctly filters everything out instead
  // of an empty query string being read as "no filter" server-side.
  const kamParam = selectedKams == null ? "ALL" : selectedKams.length === 0 ? "__NONE__" : selectedKams.join(",");
  const spocParam = selectedSpocs == null ? null : selectedSpocs.length === 0 ? "__NONE__" : selectedSpocs.join(",");
  const donorTypeParam =
    selectedDonorTypes == null ? null : selectedDonorTypes.length === 0 ? "__NONE__" : selectedDonorTypes.join(",");

  const kamLabel =
    selectedKams == null ? "All KAM" : selectedKams.length === 0 ? "No KAM selected" : selectedKams.join(", ");

  const reload = () => {
    setLoadingComparison(true);
    setError(null);
    const params = new URLSearchParams({ kam: kamParam, fy1, fy2 });
    if (spocParam != null) params.set("spoc", spocParam);
    if (donorTypeParam != null) params.set("donorType", donorTypeParam);
    Promise.all([
      fetch(`/api/crm-analysis/kam-comparison?${params.toString()}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`/api/crm-analysis/targets?${new URLSearchParams({ kam: kamParam, fy1, fy2 }).toString()}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([comparison, targetsRes]) => {
        setComparisonData(comparison);
        setTargets({ fy1: targetsRes.fy1.targets, fy2: targetsRes.fy2.targets });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingComparison(false));
  };

  useEffect(reload, [kamParam, spocParam, donorTypeParam, fy1, fy2]);

  const handleTargetChange = (yearKey, fyValue, type, value) => {
    setTargets((prev) => ({ ...prev, [yearKey]: { ...prev[yearKey], [type]: value } }));
  };

  const handleTargetBlur = (yearKey, fyValue, type) => {
    const value = targets[yearKey][type];
    // Only ever called from an editable Target row, which only renders
    // when exactly one specific KAM is in view (see comparisonData.editable) —
    // so `selectedKams` is guaranteed to be a single-item array here.
    if (value == null || !selectedKams || selectedKams.length !== 1) return;
    fetch("/api/crm-analysis/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kam: selectedKams[0], fy: fyValue, type, value }),
    }).catch(() => {
      /* Best-effort save — a failed save just means it reverts on next reload */
    });
  };

  if (kams.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">KAM</p>
            <MultiSelectDropdown
              label="KAM"
              options={kams}
              selected={selectedKams}
              onToggle={toggleKam}
              onSelectAll={() => setSelectedKams(null)}
              onClearAll={() => setSelectedKams([])}
            />
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">SPOC</p>
            <MultiSelectDropdown
              label="SPOC"
              options={spocs}
              selected={selectedSpocs}
              onToggle={toggleSpoc}
              onSelectAll={() => setSelectedSpocs(null)}
              onClearAll={() => setSelectedSpocs([])}
            />
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Donor Type</p>
            <MultiSelectDropdown
              label="Donor Type"
              options={donorTypes}
              selected={selectedDonorTypes}
              onToggle={toggleDonorType}
              onSelectAll={() => setSelectedDonorTypes(null)}
              onClearAll={() => setSelectedDonorTypes([])}
            />
          </div>
        </div>
      </div>

      {loadingComparison && !comparisonData && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
          Loading KAM comparison…
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
          Couldn't load KAM comparison: {error}
        </div>
      )}

      {comparisonData && (
        <>
          <YearTable
            kamLabel={kamLabel}
            readOnly={!comparisonData.editable}
            fy={fy2}
            mode="current"
            yearData={comparisonData.fy2}
            targets={targets.fy2}
            allPlatforms={allPlatforms}
            onTargetChange={(type, value) => handleTargetChange("fy2", fy2, type, value)}
            onTargetBlur={(type) => handleTargetBlur("fy2", fy2, type)}
          />
          <YearTable
            kamLabel={kamLabel}
            readOnly={!comparisonData.editable}
            fy={fy1}
            mode="past"
            monthLabel={comparisonData.currentMonthLabel}
            yearData={comparisonData.fy1}
            targets={targets.fy1}
            allPlatforms={allPlatforms}
            onTargetChange={(type, value) => handleTargetChange("fy1", fy1, type, value)}
            onTargetBlur={(type) => handleTargetBlur("fy1", fy1, type)}
          />
        </>
      )}
    </div>
  );
}