import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moneyCr } from "../lib/format.js";

// "Monthwise Cash Target" / "Monthwise Kind Target" / "Monthwise Cash & Kind Target" —
// Target vs Achieved for a fiscal year, one row per month. Sits between the Conversion
// cards and the By Month table.
//
//   - The Cash and Kind boxes in the top-right corner are ticked independently (at
//     least one stays ticked): Cash alone, Kind alone, or both together. With both
//     ticked the targets and the achieved amounts are added up, and each bar is split
//     into its Cash part (pink) and its Kind part (indigo).
//   - Achieved (the coloured bar): what was converted that month — Closed Leads deals of
//     Type Cash / Kind (not On Hold / Lost), put in the month of their Expected Conversion
//     Month, exactly like the Bigin report. It is for the whole programme: the filters on
//     the page don't change it, because a target isn't per KAM / platform.
//   - Target (navy marker + label): set by YOU — double-click a month (or press Enter on
//     it). With one type ticked you type its target in crores; with both ticked there is
//     a box for each, and the marker shows their sum. Saved on the server.
//   - Each row shows the % achieved and the balance still to achieve. Hover a month for
//     the details (with the Cash / Kind breakdown when both are ticked).
//
// By default only the current month and the ones still to come are listed (that's
// what a target is for); "Show all months" brings back the earlier ones.

const TRACK = "#DDE5FB";
const TYPES = ["Cash", "Kind"];
const THEMES = {
  Cash: { bar: "linear-gradient(90deg, #E11D6A, #EC407A)", solid: "#E11D6A", text: "text-rose-600", accent: "bg-rose-600", glow: "bg-rose-200/40", wash: "to-rose-50/70", pill: "bg-rose-50", pillNow: "bg-rose-100 ring-2 ring-rose-300" },
  Kind: { bar: "linear-gradient(90deg, #4F46E5, #7C6CF0)", solid: "#4F46E5", text: "text-indigo-600", accent: "bg-indigo-600", glow: "bg-indigo-200/40", wash: "to-indigo-50/70", pill: "bg-indigo-50", pillNow: "bg-indigo-100 ring-2 ring-indigo-300" },
  Both: { bar: "linear-gradient(90deg, #E11D6A, #7C3AED)", solid: "#7C3AED", text: "text-violet-700", accent: "bg-violet-600", glow: "bg-violet-200/40", wash: "to-violet-50/70", pill: "bg-violet-50", pillNow: "bg-violet-100 ring-2 ring-violet-300" },
};
const LABEL_W = 112; // px — width of the month pills (a phone gets NARROW_LABEL_W)
const NARROW_LABEL_W = 78;
const STATS_W = 136; // px — the "% achieved / balance" column on the right of each row (wide screens)
const PLOT_PAD_R = 30; // px — on a phone (no stats column): room so the last axis label stays inside the panel

const trim = (n) => String(Number(n.toFixed(2)));
const amountLabel = (rupees) => (rupees >= 1e7 ? `${trim(rupees / 1e7)} Cr` : `${trim(rupees / 1e5)} L`);

// Axis for the bars: a round maximum a little above the biggest number, with <= 6 steps.
function niceAxis(biggestRupees) {
  const cr = Math.max(biggestRupees / 1e7, 0.5) * 1.08;
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => Math.ceil(cr / s) <= 6) || 1000;
  const max = Math.ceil(cr / step) * step;
  const ticks = [];
  for (let v = step; v <= max + 1e-9; v += step) ticks.push(v);
  return { max: max * 1e7, ticks: ticks.map((v) => v * 1e7) };
}

// Balance and percentage for a target: { pct, raw, left, over, met }
//   pct   achieved / target as a whole percent ("<1" when something was achieved but under 1%)
//   left  what is still to reach (0 once the target is met); over — how far past it
function progressOf(achieved, target) {
  if (!(target > 0)) return null;
  const raw = (achieved / target) * 100;
  const pct = raw > 0 && raw < 1 ? "<1" : String(Math.round(raw));
  return { pct, raw, left: Math.max(target - achieved, 0), over: Math.max(achieved - target, 0), met: achieved >= target };
}

// Which ticked types have achieved something this month but no target (only matters with both ticked)
const typesWithoutTarget = (month, types) => (types.length > 1 ? types.filter((t) => month.byType?.[t] && month.byType[t].target == null) : []);

const tickText = (rupees, narrow) => `₹${trim(rupees / 1e7)}${!narrow && rupees / 1e7 % 1 === 0 ? ".00" : ""} Cr`;

// true on a phone-width screen
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return narrow;
}

const IconBars = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <rect x="3.5" y="12" width="4.2" height="8" rx="1.2" />
    <rect x="9.9" y="7" width="4.2" height="13" rx="1.2" />
    <rect x="16.3" y="3.5" width="4.2" height="16.5" rx="1.2" />
  </svg>
);
const IconRefresh = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v5h-5" />
  </svg>
);
const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

// Floating card placed from the row's rectangle (rendered into <body>, so nothing clips it).
function useFloatingPosition(rect, width, estimatedHeight, anchorX) {
  if (!rect) return null;
  const left = Math.min(Math.max(8, (anchorX ?? rect.left + rect.width / 2) - width / 2), Math.max(8, window.innerWidth - width - 8));
  const below = window.innerHeight - rect.bottom >= estimatedHeight + 12 || rect.top < estimatedHeight + 12;
  return below ? { left, top: rect.bottom + 8 } : { left, bottom: window.innerHeight - rect.top + 8 };
}

function Tooltip({ month, fy, rect, anchorX, types, theme }) {
  const both = types.length > 1;
  const lower = both ? "cash + kind" : types[0].toLowerCase();
  const pos = useFloatingPosition(rect, 280, both ? 330 : 230, anchorX);
  const hasTarget = month.target != null;
  const prog = progressOf(month.achieved, month.target);
  const when = { current: "Current month", upcoming: "Coming up", past: "Past month" }[month.status];
  return createPortal(
    <div role="tooltip" style={{ position: "fixed", width: 280, zIndex: 90, ...pos }} className="pointer-events-none rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-base font-bold leading-tight text-navy-900">{month.name}</p>
          <p className="text-xs text-slate-400">FY {fy}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{when}</span>
      </div>
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Target</dt>
          <dd className="font-semibold text-navy-900">{hasTarget ? moneyCr(month.target) : <span className="font-normal text-slate-400">Not set</span>}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Achieved ({lower})</dt>
          <dd className={`text-right font-semibold ${theme.text}`}>
            {moneyCr(month.achieved)}
            <span className="block text-xs font-normal text-slate-400">
              {month.donors} donor{month.donors === 1 ? "" : "s"}
            </span>
          </dd>
        </div>
        {prog && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{prog.met ? "Exceeded by" : "Balance to achieve"}</dt>
              <dd className={`font-semibold ${prog.met ? "text-emerald-600" : "text-navy-900"}`}>{moneyCr(prog.met ? prog.over : prog.left)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Achieved</dt>
              <dd className={`font-semibold ${prog.met ? "text-emerald-600" : theme.text}`}>{prog.pct}% of target</dd>
            </div>
          </>
        )}
      </dl>
      {prog ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(prog.raw, 100)}%`, background: prog.met ? "#10B981" : theme.bar }} />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Set a target to see the balance to achieve and the percentage.</p>
      )}
      {both && (
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-2.5 text-xs" data-breakdown>
          {types.map((t) => {
            const v = month.byType[t];
            return (
              <div key={t} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 font-semibold text-navy-900">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: THEMES[t].solid }} />
                  {t}
                </span>
                <span className="text-right text-slate-500">
                  <span className="font-semibold text-navy-900">{moneyCr(v.achieved)}</span> {v.target != null ? `of ${moneyCr(v.target)}` : "· no target"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {/* <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-400">
        {both ? "Cash + Kind" : types[0]} conversions only. {hasTarget ? "Double-click to change the target." : "Double-click to set a target."}
      </p> */}
    </div>,
    document.body
  );
}

// The box that opens on double-click. One type ticked → one amount; both ticked → an amount
// for each (the month's target is their sum). `onSave` gets { Cash: rupees, Kind: rupees }.
function Editor({ month, fy, rect, types, saving, error, onSave, onClear, onCancel }) {
  const both = types.length > 1;
  const lower = both ? "cash + kind" : types[0].toLowerCase();
  const pos = useFloatingPosition(rect, 310, both ? 330 : 230, null);
  const [texts, setTexts] = useState(() => Object.fromEntries(types.map((t) => [t, month.byType?.[t]?.target != null ? trim(month.byType[t].target / 1e7) : ""])));
  const [problem, setProblem] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    const outside = (e) => box.current && !box.current.contains(e.target) && onCancel();
    const key = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [onCancel]);

  const submit = () => {
    const targets = {};
    for (const t of types) {
      const text = texts[t].trim();
      // with both ticked a blank box simply means "no target for that one"
      if (text === "" && both) {
        targets[t] = 0;
        continue;
      }
      const value = Number(text);
      if (text === "" || !Number.isFinite(value) || value < 0) {
        setProblem("Enter the target in crores, for example 8 or 1.5 (0 removes it).");
        return;
      }
      targets[t] = Math.round(value * 1e7);
    }
    if (both && Object.values(targets).every((v) => v === 0) && types.every((t) => month.byType?.[t]?.target == null)) {
      setProblem("Enter a target for Cash, for Kind, or for both.");
      return;
    }
    setProblem(null);
    onSave(targets);
  };

  const anyTarget = types.some((t) => month.byType?.[t]?.target != null);
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`Set the ${lower} target for ${month.name}`}
      style={{ position: "fixed", width: 310, zIndex: 95, ...pos }}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-2xl"
    >
      <p className="font-display font-bold text-navy-900">
        {month.name} {lower} target{both ? "s" : ""} <span className="font-medium text-slate-400">· FY {fy}</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        {both ? `Achieved so far: ${types.map((t) => `${t} ${moneyCr(month.byType[t].achieved)}`).join(" · ")}` : `Achieved so far: ${moneyCr(month.achieved)}`}
      </p>
      {types.map((t, i) => (
        <div key={t}>
          <label className="mt-3 block text-xs font-semibold text-slate-500" htmlFor={`month-target-${t}`}>
            {both ? `${t} target (crores)` : "Target (crores)"}
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-slate-500">₹</span>
            <input
              id={`month-target-${t}`}
              data-type={t}
              autoFocus={i === 0}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={texts[t]}
              onChange={(e) => setTexts((prev) => ({ ...prev, [t]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. 8"
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-navy-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <span className="font-semibold text-slate-500">Cr</span>
          </div>
        </div>
      ))}
      {both && <p className="mt-2 text-xs text-slate-400">The month's target is the two added together. Leave one blank to set only the other.</p>}
      {(problem || error) && <p className="mt-2 text-xs text-red-600">{problem || error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        {anyTarget && (
          <button type="button" onClick={onClear} disabled={saving} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            {both ? "Remove targets" : "Remove target"}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function MonthCashTargetCard({ fy }) {
  const [selected, setSelected] = useState(["Cash"]); // the ticked boxes — Cash, Kind or both
  const types = TYPES.filter((t) => selected.includes(t)); // always in the order Cash, Kind
  const both = types.length > 1;
  const lower = both ? "cash and kind" : types[0].toLowerCase();
  const theme = THEMES[both ? "Both" : types[0]];
  const [datas, setDatas] = useState({}); // loaded card data, one entry per `${fy}|${types}`
  const key = `${fy}|${types.join(",")}`;
  const data = datas[key] || null;
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState(null); // { name, rect, x }
  const [editing, setEditing] = useState(null); // { name, rect }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const narrow = useNarrow();
  const labelW = narrow ? NARROW_LABEL_W : LABEL_W;
  // space to the right of the tracks: the stats column on a wide screen, a little padding on a phone
  const plotRight = narrow ? PLOT_PAD_R : STATS_W + 12;

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/crm-analysis/month-cash-target?fy=${encodeURIComponent(fy)}&types=${types.join(",")}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setDatas((d) => ({ ...d, [key]: json })))
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, key]);

  // Load a combination the first time it's shown; coming back to one already loaded is instant.
  useEffect(() => {
    if (datas[key]) {
      setError(null);
      setLoading(false);
      return undefined;
    }
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Tick / untick Cash or Kind. At least one stays ticked.
  const toggleType = (t) => {
    if (selected.includes(t) && selected.length === 1) return;
    setHover(null);
    setEditing(null);
    setSaveError(null);
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  // Page scroll / resize closes the floating cards so they never drift off their row.
  useEffect(() => {
    const away = () => setHover(null);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, []);

  const months = data?.months || [];
  const upcomingExists = months.some((m) => m.status !== "past");
  const visible = showAll || !upcomingExists ? months : months.filter((m) => m.status !== "past");
  const hiddenCount = months.length - visible.length;

  const axis = useMemo(() => {
    const biggest = Math.max(0, ...visible.map((m) => Math.max(m.achieved, (m.target || 0) * 1.25)));
    return niceAxis(biggest);
  }, [visible]);

  // `targets` is { Cash: rupees, Kind: rupees } for the ticked types; 0 clears one.
  const save = async (targets) => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/crm-analysis/month-cash-target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy, month: editing.name, targets, types }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      // the other combinations now hold old targets — keep only this fresh one
      setDatas({ [key]: json });
      setEditing(null);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEditor = (month, el) => {
    setHover(null);
    setSaveError(null);
    setEditing({ name: month.name, rect: el.getBoundingClientRect() });
  };

  // on a phone only every other axis step gets a label (they'd run into each other)
  const labelledTicks = narrow ? axis.ticks.filter((_, i) => i % 2 === 1 || i === axis.ticks.length - 1) : axis.ticks;
  const fyLabel = String(fy).replace("-", " – ");
  const hoverMonth = hover && months.find((m) => m.name === hover.name);
  const editMonth = editing && months.find((m) => m.name === editing.name);
  const titleLabel = both ? "Cash & Kind" : types[0];

  return (
    <section aria-label={`Monthwise ${lower} target`} className={`relative overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-br from-white via-white ${theme.wash} shadow-sm`}>
      {/* soft wave + accent bar, as in the design (pink for Cash, indigo for Kind, violet for both) */}
      <div aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-16 h-44 w-96 rounded-full ${theme.glow} blur-3xl`} />
      <div aria-hidden="true" className={`absolute left-0 top-0 h-20 w-1.5 rounded-br-full ${theme.accent}`} />

      <header className="relative flex flex-wrap items-center justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white">
            <IconBars className="h-6 w-6" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold leading-tight text-navy-900">Monthwise {titleLabel} Target</h2>
            <p className="text-sm text-slate-500">
              Target vs Achieved {both ? "Cash + Kind" : types[0]} (FY {fyLabel})
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Cash / Kind boxes: tick one, or both */}
          <div role="group" aria-label="Show Cash, Kind or both" className="inline-flex gap-1.5 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200/70">
            {TYPES.map((t) => {
              const on = selected.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  data-type={t}
                  onClick={() => toggleType(t)}
                  title={on && selected.length === 1 ? "At least one of Cash / Kind stays ticked" : on ? `Untick to hide ${t}` : `Tick to include ${t}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors ${on ? "bg-navy-900 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-navy-900"}`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-white/70 bg-white/15" : "border-slate-300 bg-white"}`}>{on && <IconCheck className="h-3 w-3" />}</span>
                  {t}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label={`Refresh the monthwise ${lower} target`}
            title="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-navy-900 shadow-sm ring-1 ring-slate-100 hover:bg-slate-50 disabled:opacity-60"
          >
            <IconRefresh className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="relative mx-3 mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-6">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>Couldn't load the targets: {error}</span>
            <button type="button" onClick={load} className="font-semibold underline">
              Try again
            </button>
          </div>
        )}

        {!error && !data && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {data && !error && (
          <>
            {!narrow && (
              <div className="mb-1 flex items-end gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
                <span style={{ width: labelW }} className="shrink-0" />
                <span className="flex-1" />
                <span className="shrink-0 whitespace-nowrap text-right" style={{ width: STATS_W }}>
                  Achieved · Balance
                </span>
              </div>
            )}
            <div className="relative" style={narrow ? { paddingRight: PLOT_PAD_R } : undefined}>
              {/* dashed gridlines, one per axis step: over the tracks, under the markers and labels */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[5]" style={{ left: labelW + 12, right: plotRight }}>
                {axis.ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 border-l border-dashed border-indigo-200/90" style={{ left: `${(t / axis.max) * 100}%` }} />
                ))}
              </div>

              <ul className="relative space-y-3">
                {visible.map((m) => {
                  const barPct = Math.min((m.achieved / axis.max) * 100, 100);
                  const targetPct = m.target != null ? Math.min((m.target / axis.max) * 100, 100) : null;
                  const labelInside = barPct >= (narrow ? 38 : 14);
                  const chipLeft = targetPct != null && targetPct <= (narrow ? 50 : 78); // which side of the marker the label sits
                  const prog = progressOf(m.achieved, m.target);
                  const unset = prog ? typesWithoutTarget(m, types) : []; // with both ticked: a type that has no target of its own
                  return (
                    <li key={m.name}>
                      <div
                        role="button"
                        tabIndex={0}
                        data-month={m.name}
                        aria-label={`${m.name} ${lower}: achieved ${moneyCr(m.achieved)}, target ${m.target != null ? moneyCr(m.target) : "not set"}. Press Enter to set the target.`}
                        onDoubleClick={(e) => openEditor(m, e.currentTarget)}
                        onKeyDown={(e) => e.key === "Enter" && openEditor(m, e.currentTarget)}
                        onMouseEnter={(e) => !editing && setHover({ name: m.name, rect: e.currentTarget.getBoundingClientRect(), x: e.clientX })}
                        onMouseMove={(e) => !editing && setHover((h) => (h && h.name === m.name ? { ...h, x: e.clientX } : h))}
                        onMouseLeave={() => setHover(null)}
                        onFocus={(e) => !editing && setHover({ name: m.name, rect: e.currentTarget.getBoundingClientRect(), x: null })}
                        onBlur={() => setHover(null)}
                        className="flex cursor-pointer select-none items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                      >
                        <span
                          className={`flex h-12 shrink-0 items-center justify-center rounded-2xl px-2 text-xs font-bold sm:px-3 sm:text-sm ${
                            m.status === "current" ? `${theme.pillNow} text-navy-900` : `${theme.pill} text-navy-900`
                          }`}
                          style={{ width: labelW }}
                        >
                          <span className="flex flex-col items-center leading-tight">
                            {m.name}
                            {/* on a phone the achieved amount goes under the month name — the bar is too short to hold it */}
                            {narrow && m.achieved > 0 && <span className={`text-[10px] font-semibold ${theme.text}`}>{moneyCr(m.achieved)}</span>}
                          </span>
                        </span>

                        <div className="relative h-12 flex-1 rounded-xl" style={{ background: TRACK }}>
                          {m.achieved > 0 && (
                            <div className="absolute inset-y-1 left-0 flex items-center overflow-hidden rounded-lg" style={{ width: `${barPct}%`, minWidth: 6, background: both ? undefined : theme.bar }} data-bar={both ? "stacked" : "single"}>
                              {both &&
                                types.map((t) => (
                                  <span key={t} data-part={t} className="block h-full" style={{ width: `${(m.byType[t].achieved / m.achieved) * 100}%`, background: THEMES[t].bar }} />
                                ))}
                              {labelInside && !narrow && (
                                <span className={`${both ? "absolute inset-0 flex items-center justify-center" : "w-full text-center"} whitespace-nowrap text-xs font-bold text-white sm:text-sm`}>{moneyCr(m.achieved)}</span>
                              )}
                            </div>
                          )}
                          {m.achieved > 0 && !labelInside && !narrow && (
                            <span className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-bold sm:text-sm ${theme.text}`} style={{ left: `calc(${barPct}% + 8px)` }}>
                              {moneyCr(m.achieved)}
                            </span>
                          )}

                          {targetPct != null ? (
                            <>
                              <span aria-hidden="true" className="absolute -inset-y-1 z-10 w-1 -translate-x-1/2 rounded-full bg-navy-900" style={{ left: `${targetPct}%` }} />
                              <span
                                className="absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-xs font-bold text-navy-900 shadow-md ring-1 ring-slate-100 sm:px-3 sm:py-1.5 sm:text-sm"
                                style={chipLeft ? { left: `calc(${targetPct}% + 10px)` } : { right: `calc(${100 - targetPct}% + 10px)` }}
                              >
                                Target : {amountLabel(m.target)}
                              </span>
                            </>
                          ) : (
                            m.achieved === 0 && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400"></span>
                          )}
                        </div>

                        {!narrow && (
                          <div className="shrink-0 text-right leading-tight" style={{ width: STATS_W }} data-stats={m.name}>
                            {prog ? (
                              <>
                                <p className={`text-base font-bold ${prog.met ? "text-emerald-600" : theme.text}`}>{prog.pct}%</p>
                                <p className={`text-xs font-semibold ${prog.met ? "text-emerald-600" : "text-slate-500"}`}>
                                  {prog.met ? `${moneyCr(prog.over)} over` : `${moneyCr(prog.left)} to go`}
                                </p>
                                {unset.length > 0 && <p className="text-[10px] font-semibold text-amber-600">{unset.join(" & ")} target not set</p>}
                              </>
                            ) : (
                              <p className="text-xs text-slate-300">no target</p>
                            )}
                          </div>
                        )}
                      </div>
                      {narrow && prog && (
                        <p className="mt-1 text-[11px] font-semibold text-slate-500" style={{ paddingLeft: labelW + 12 }} data-stats={m.name}>
                          <span className={prog.met ? "text-emerald-600" : theme.text}>{prog.pct}%</span> ·{" "}
                          {prog.met ? `${moneyCr(prog.over)} over` : `${moneyCr(prog.left)} to go`}
                          {unset.length > 0 && <span className="text-amber-600"> · {unset.join(" & ")} target not set</span>}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* axis */}
            <div className="relative mt-3 h-6" style={{ marginLeft: labelW + 12, marginRight: plotRight }}>
              {labelledTicks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-navy-900 sm:text-xs" style={{ left: `${(t / axis.max) * 100}%` }}>
                  {tickText(t, narrow)}
                </span>
              ))}
            </div>
            <p className="mt-1 text-center text-sm text-slate-500">{both ? "Cash + Kind" : types[0]} Amount</p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-semibold text-navy-900">
              {both ? (
                types.map((t) => (
                  <span key={t} className="inline-flex items-center gap-2" data-legend={t}>
                    <span className="h-5 w-5 rounded-md" style={{ background: THEMES[t].solid }} /> {t}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span className="h-5 w-5 rounded-md" style={{ background: theme.solid }} /> Achieved
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <span className="h-5 w-5 rounded-md" style={{ background: "#C7D4F8" }} /> Target Range
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
              {/* <span>Double-click a month to set its target · hover for details · {both ? "cash + kind" : `${lower} only`}, all donors · months follow each deal's Expected Conversion Month, as in the Bigin report</span> */}
              {(hiddenCount > 0 || showAll) && upcomingExists && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="font-semibold text-indigo-600 hover:underline">
                  {showAll ? "Show current & upcoming months" : `Show all months (${hiddenCount} earlier)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {hoverMonth && !editing && <Tooltip month={hoverMonth} fy={fyLabel.replace(" – ", "-")} rect={hover.rect} anchorX={hover.x} types={types} theme={theme} />}
      {editMonth && (
        <Editor
          key={`${editMonth.name}|${types.join(",")}`}
          month={editMonth}
          fy={fyLabel.replace(" – ", "-")}
          rect={editing.rect}
          types={types}
          saving={saving}
          error={saveError}
          onSave={save}
          onClear={() => save(Object.fromEntries(types.map((t) => [t, 0])))}
          onCancel={() => !saving && setEditing(null)}
        />
      )}
    </section>
  );
}