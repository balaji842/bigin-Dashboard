import { useEffect, useMemo, useState } from "react";
import { moneyAutoScale } from "../lib/format.js";

// The six cards of an Other Dashboards page (Rhapsody): Conversion Donation
// Amount, Pipeline Donation Type, Target Amount, Platform, KAM Conversion
// Amount and KAM Pipeline Amount.
//
// The page loads one small record per closed deal and per open pipeline deal
// (/api/crm-analysis/category-dashboard) and every card totals them itself, for
// the period picked in the card's own dropdown — so switching a period is
// instant. Periods:
//   - This Month / This Quarter / This Financial Year / Last Financial Year /
//     All Time. Quarters are the fiscal ones (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar).
//   - Closed deals are placed by their closing date; open pipeline deals by their
//     Expected Conversion Month (and fiscal year).
// Pipeline = the approved open pipeline (the same deals as the Pipeline card on
// the Overview page). The Target card compares a yearly target — typed in by
// hand with the pencil, saved on the server — with that fiscal year's conversions.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FISCAL_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];

const PERIODS = [
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "fy", label: "This Financial Year" },
  { key: "lastfy", label: "Last Financial Year" },
  { key: "all", label: "All Time" },
];
const TARGET_PERIODS = PERIODS.filter((p) => p.key === "fy" || p.key === "lastfy");

// "Today" and what it means for each period.
function periodContext(now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m >= 3 ? y : y - 1;
  const quarter = Math.floor(((m + 9) % 12) / 3); // Apr-Jun = 0 ... Jan-Mar = 3
  return {
    y,
    m,
    fy: `${start}-${start + 1}`,
    prevFy: `${start - 1}-${start}`,
    monthName: MONTH_NAMES[m],
    quarterMonths: FISCAL_MONTHS.slice(quarter * 3, quarter * 3 + 3),
  };
}

function closingParts(dateStr) {
  const hit = /^(\d{4})-(\d{2})/.exec(String(dateStr || ""));
  return hit ? { y: Number(hit[1]), m: Number(hit[2]) - 1 } : null;
}

// Does this deal fall in the period? kind: "closed" (placed by closing date)
// or "pipeline" (placed by expected conversion month).
function inPeriod(kind, deal, period, ctx) {
  if (period === "all") return true;
  if (period === "fy") return deal.fy === ctx.fy;
  if (period === "lastfy") return deal.fy === ctx.prevFy;
  if (kind === "closed") {
    const c = closingParts(deal.closingDate);
    if (!c) return false;
    if (period === "month") return c.y === ctx.y && c.m === ctx.m;
    return deal.fy === ctx.fy && ctx.quarterMonths.includes(MONTH_NAMES[c.m]); // quarter
  }
  if (period === "month") return deal.fy === ctx.fy && deal.expectedMonth === ctx.monthName;
  return deal.fy === ctx.fy && ctx.quarterMonths.includes(deal.expectedMonth); // quarter
}

function groupSum(list, key) {
  const map = new Map();
  for (const d of list) {
    const name = d[key] || "Unspecified";
    map.set(name, (map.get(name) || 0) + d.amount);
  }
  return [...map].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}
const totalOf = (list) => list.reduce((s, d) => s + d.amount, 0);
const donorsOf = (list) => new Set(list.map((d) => d.accountId || d.account)).size;

// ------------------------------------------------------------------ icons
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const IconHeartHand = (p) => (
  <svg {...svgProps} className={p.className}>
    <path d="M12 12.5s-3.8-2.3-3.8-4.9A2.1 2.1 0 0112 6.5a2.1 2.1 0 013.8 1.1c0 2.6-3.8 4.9-3.8 4.9z" />
    <path d="M3 17h3.2l2.6 1.8h5.4l5.3-2.6a1.3 1.3 0 00-1.2-2.3L15 15" />
  </svg>
);
const IconCoins = (p) => (
  <svg {...svgProps} className={p.className}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
    <path d="M5 14v3c0 1.7 3.1 3 7 3s7-1.3 7-3v-3" />
  </svg>
);
const IconTargetArrow = (p) => (
  <svg {...svgProps} className={p.className}>
    <circle cx="11" cy="13" r="8" />
    <circle cx="11" cy="13" r="4.5" />
    <circle cx="11" cy="13" r="1" />
    <path d="M12 12l8-8M16 4h4v4" />
  </svg>
);
const IconShareNodes = (p) => (
  <svg {...svgProps} className={p.className}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
  </svg>
);
const IconPersonFill = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6z" />
  </svg>
);
const IconBuildings = (p) => (
  <svg {...svgProps} className={p.className}>
    <path d="M4 21V9l6-3v15M10 21V4l10 4v13M2 21h20" />
    <path d="M13 11h2M13 14h2M13 17h2M7 12h0M7 15h0M7 18h0" />
  </svg>
);
const IconCalendarSmall = (p) => (
  <svg {...svgProps} className={p.className}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
const IconChevron = (p) => (
  <svg {...svgProps} className={p.className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconInfo = (p) => (
  <svg {...svgProps} className={p.className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
const IconBars = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className}>
    <rect x="4" y="12" width="3.5" height="8" rx="1" />
    <rect x="10.2" y="6" width="3.5" height="14" rx="1" />
    <rect x="16.5" y="14" width="3.5" height="6" rx="1" />
  </svg>
);
const IconPencil = (p) => (
  <svg {...svgProps} className={p.className}>
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
  </svg>
);

// ------------------------------------------------------------------ look
// One pastel colour family per card, as in the design.
const TONES = {
  blue: { badge: "bg-sky-100 text-blue-600", head: "bg-sky-50", total: "bg-sky-50 text-blue-800", note: "bg-sky-50", dots: ["bg-blue-500"] },
  green: { badge: "bg-emerald-100 text-emerald-600", head: "bg-emerald-50", total: "bg-emerald-50 text-emerald-700", note: "bg-emerald-50", dots: ["bg-emerald-500", "bg-teal-500", "bg-green-400"] },
  orange: { badge: "bg-orange-100 text-orange-500", head: "bg-orange-50", total: "bg-orange-50 text-orange-700", note: "bg-orange-50", dots: ["bg-orange-500"] },
  indigo: { badge: "bg-indigo-100 text-indigo-600", head: "bg-indigo-50", total: "bg-indigo-50 text-indigo-800", note: "bg-indigo-50", dots: ["bg-indigo-800", "bg-blue-500", "bg-sky-400", "bg-violet-500"] },
  pink: { badge: "bg-pink-100 text-pink-500", head: "bg-pink-50", total: "bg-pink-50 text-pink-700", note: "bg-pink-50", dots: ["bg-pink-500", "bg-rose-400", "bg-fuchsia-400"] },
  amber: { badge: "bg-amber-100 text-amber-600", head: "bg-amber-50", total: "bg-amber-50 text-amber-800", note: "bg-amber-50", dots: ["bg-amber-400", "bg-yellow-500", "bg-orange-400"] },
};

function PeriodSelect({ value, onChange, options = PERIODS, label }) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-sm text-slate-600 shrink-0 cursor-pointer hover:border-slate-300">
      <IconCalendarSmall className="w-4 h-4 text-slate-500" />
      <select
        aria-label={`Period for ${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent outline-none cursor-pointer pr-1"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevron className="w-4 h-4 text-slate-500 absolute right-2 pointer-events-none" />
    </label>
  );
}

function CardShell({ tone, icon: Icon, title, subtitle, period, onPeriod, periodOptions, children }) {
  const t = TONES[tone];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${t.badge}`}>
            <Icon className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display font-bold text-navy-900 text-lg leading-tight">{title}</p>
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <PeriodSelect value={period} onChange={onPeriod} options={periodOptions} label={title} />
      </div>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ the cards
// Pipeline Donation Type / Platform / KAM Pipeline Amount / KAM Conversion
// Amount: a "<name> | Sum of Amount" table with a Total row.
function TableCard({ tone, icon, title, subtitle, firstLabel, kind, groupKey, deals, ctx, emptyBox = false }) {
  const [period, setPeriod] = useState("fy");
  const t = TONES[tone];
  const inRange = useMemo(() => deals.filter((d) => inPeriod(kind, d, period, ctx)), [deals, kind, period, ctx]);
  const rows = useMemo(() => groupSum(inRange, groupKey), [inRange, groupKey]);

  return (
    <CardShell tone={tone} icon={icon} title={title} subtitle={subtitle} period={period} onPeriod={setPeriod}>
      {rows.length === 0 && emptyBox ? (
        <div className={`rounded-xl ${t.note} flex items-center justify-center gap-2.5 py-8 text-slate-600`}>
          <IconBars className="w-5 h-5 text-slate-400" />
          <span>No data available</span>
        </div>
      ) : (
        <div className="text-sm">
          <div className={`grid grid-cols-2 px-3 py-2 font-semibold text-navy-900 rounded-t-lg ${t.head}`}>
            <span>{firstLabel}</span>
            <span>Sum of Amount</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.name} className="grid grid-cols-2 px-3 py-2.5 border-b border-slate-100 text-slate-700">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.dots[i % t.dots.length]}`} />
                <span className="truncate">{r.name}</span>
              </span>
              <span>{moneyAutoScale(r.amount)}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="px-3 py-3 text-slate-400 border-b border-slate-100">No data available</div>}
          <div className={`grid grid-cols-2 px-3 py-2.5 font-bold rounded-b-lg mt-1 ${t.total}`}>
            <span className="pl-5">Total</span>
            <span>{moneyAutoScale(totalOf(inRange))}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function ConversionCard({ deals, ctx }) {
  const [period, setPeriod] = useState("fy");
  const inRange = useMemo(() => deals.filter((d) => inPeriod("closed", d, period, ctx)), [deals, period, ctx]);
  const t = TONES.blue;
  return (
    <CardShell tone="blue" icon={IconHeartHand} title="Conversion Donation Amount"  period={period} onPeriod={setPeriod}>
      <p className="font-display text-4xl font-bold text-blue-800 mb-4">{moneyAutoScale(totalOf(inRange))}</p>
      <div className={`rounded-xl ${t.note} flex items-center gap-2.5 px-4 py-3 text-slate-600 text-sm`}>
        <IconInfo className="w-5 h-5 text-blue-500 shrink-0" />
        <span>
          {inRange.length === 0
            ? "No data available"
            : `${inRange.length} ${inRange.length === 1 ? "conversion" : "conversions"} from ${donorsOf(inRange)} ${donorsOf(inRange) === 1 ? "donor" : "donors"}`}
        </span>
      </div>
    </CardShell>
  );
}

// Half-circle progress gauge: grey track, orange progress, a needle.
function Gauge({ fraction }) {
  const R = 80;
  const len = Math.PI * R;
  const f = Math.max(0, Math.min(1, fraction));
  const angle = Math.PI * f; // 0 .. PI, from the left end
  const tipX = 100 - Math.cos(angle) * 62;
  const tipY = 100 - Math.sin(angle) * 62;
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" role="img" aria-label={`${Math.round(f * 100)}% of target`}>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth="18" />
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#f97316" strokeWidth="18" strokeDasharray={`${Math.max(f * len, 7)} ${len}`} />
      <line x1="100" y1="100" x2={tipX} y2={tipY} stroke="#334155" strokeWidth="6" strokeLinecap="round" />
      <circle cx="100" cy="100" r="7" fill="#334155" />
    </svg>
  );
}

function TargetCard({ category, deals, ctx, targets, onTargetSaved }) {
  const [period, setPeriod] = useState("fy");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fy = period === "lastfy" ? ctx.prevFy : ctx.fy;
  const target = Number(targets[fy]) || 0;
  const achieved = useMemo(() => totalOf(deals.filter((d) => d.fy === fy)), [deals, fy]);
  const remaining = Math.max(target - achieved, 0);
  const fraction = target > 0 ? achieved / target : 0;

  const startEdit = () => {
    setDraft(target > 0 ? String(Number((target / 1e7).toFixed(4))) : "");
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    const crore = Number(draft);
    if (!Number.isFinite(crore) || crore < 0) {
      setError("Enter the target in crore, e.g. 5 or 2.5");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/crm-analysis/category-target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, fy, amount: Math.round(crore * 1e7) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      onTargetSaved(json.targets || {});
      setEditing(false);
    } catch (e) {
      setError(`Couldn't save the target (${e.message})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CardShell tone="orange" icon={IconTargetArrow} title="Target Amount"  period={period} onPeriod={setPeriod} periodOptions={TARGET_PERIODS}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="sm:w-44 shrink-0 space-y-4">
          <div>
            <p className="text-slate-600 flex items-center gap-1.5">
              Target Amount
              {!editing && (
                <button type="button" onClick={startEdit} className="text-slate-400 hover:text-orange-500" aria-label="Edit target" title={`Set the FY ${fy} target`}>
                  <IconPencil className="w-3.5 h-3.5" />
                </button>
              )}
            </p>
            {editing ? (
              <div className="mt-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    placeholder="Crore"
                    aria-label="Target in crore"
                    className="w-20 text-sm px-2 py-1 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <span className="text-xs text-slate-500">Cr</span>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <button type="button" onClick={save} disabled={saving} className="text-orange-600 hover:underline disabled:opacity-50">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:underline">
                    Cancel
                  </button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            ) : (
              <p className="font-display text-2xl font-bold text-navy-900">
                {target > 0 ? moneyAutoScale(target) : <span className="text-slate-300 text-lg">Not set</span>}
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-slate-600">Remaining Amount</p>
            <p className="font-display text-2xl font-bold text-orange-600">{target > 0 ? moneyAutoScale(remaining) : "—"}</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <Gauge fraction={fraction} />
          <div className="w-full max-w-[260px] flex justify-between text-xs text-slate-500 -mt-1">
            <span>0</span>
            <span>Remaining : {target > 0 ? moneyAutoScale(remaining) : "—"}</span>
            <span>Target : {target > 0 ? moneyAutoScale(target) : "—"}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            FY {fy} · achieved <span className="font-semibold text-slate-600">{moneyAutoScale(achieved)}</span>
            {target > 0 ? ` (${Math.round(fraction * 100)}%)` : ""}
          </p>
        </div>
      </div>
    </CardShell>
  );
}

// ------------------------------------------------------------------ the page section
export default function CategoryDashboardCards({ category }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [targets, setTargets] = useState({});

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/crm-analysis/category-dashboard?category=${encodeURIComponent(category)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setTargets(json.targets || {});
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [category]);

  const ctx = useMemo(() => (data ? periodContext(new Date(data.generatedAt)) : null), [data]);

  if (error) {
    return <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">Couldn't load the dashboard: {error}</div>;
  }
  if (!data) {
    return <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">Loading dashboard…</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
      <ConversionCard deals={data.closed} ctx={ctx} />
      <TableCard tone="green" icon={IconCoins} title="Pipeline Donation Type"  firstLabel="Type" kind="pipeline" groupKey="type" deals={data.pipeline} ctx={ctx} />
      <TargetCard category={category} deals={data.closed} ctx={ctx} targets={targets} onTargetSaved={setTargets} />
      <TableCard tone="indigo" icon={IconShareNodes} title="Platform"  firstLabel="Platform" kind="pipeline" groupKey="platform" deals={data.pipeline} ctx={ctx} />
      <TableCard tone="pink" icon={IconPersonFill} title="KAM Conversion Amount" firstLabel="KAM" kind="closed" groupKey="kam" deals={data.closed} ctx={ctx} emptyBox />
      <TableCard tone="amber" icon={IconBuildings} title="KAM Pipeline Amount" firstLabel="Pipeline KAM" kind="pipeline" groupKey="kam" deals={data.pipeline} ctx={ctx} />
    </div>
  );
}