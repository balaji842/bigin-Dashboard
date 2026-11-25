import { useEffect, useMemo, useRef, useState } from "react";

const BADGE = {
  CSR: "bg-emerald-50 text-emerald-700",
  Tender: "bg-amber-50 text-amber-700",
};
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ------------------------------------------------------------------ dates (local time)
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayKey = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "unknown" : keyOf(d);
};
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
const fmtDate = (key) => `${key.slice(8, 10)} ${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function dayLabel(key) {
  if (key === "unknown") return "Date not available";
  const today = keyOf(new Date());
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return fmtDate(key);
}
const timeOf = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

// The bounds of a range choice -> { from, to } (yyyy-mm-dd), or null for "all time".
function boundsOf(range) {
  const today = keyOf(new Date());
  switch (range.key) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "custom":
      return { from: range.from, to: range.to };
    default:
      return null;
  }
}
// The period right before, for the "+12%" comparison.
function previousBounds(b) {
  if (!b) return null;
  const n = daysBetween(b.from, b.to) + 1;
  return { from: addDays(b.from, -n), to: addDays(b.from, -1) };
}
const inBounds = (item, b) => {
  if (!b) return true;
  const k = dayKey(item.publishedAt);
  return k !== "unknown" && k >= b.from && k <= b.to;
};
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

// ------------------------------------------------------------------ icons
const sv = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const IconCalendar = (p) => (
  <svg {...sv} className={p.className}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
const IconChevron = (p) => (
  <svg {...sv} className={p.className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconNewsBig = (p) => (
  <svg {...sv} className={p.className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 13h8M8 17h5" />
  </svg>
);
const IconHeart = (p) => (
  <svg {...sv} className={p.className}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
  </svg>
);
const IconDoc = (p) => (
  <svg {...sv} className={p.className}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </svg>
);
const IconSearch = (p) => (
  <svg {...sv} className={p.className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
const IconArrowUp = (p) => (
  <svg {...sv} strokeWidth={2.2} className={p.className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
const IconArrowDown = (p) => (
  <svg {...sv} strokeWidth={2.2} className={p.className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

// ------------------------------------------------------------------ pieces
function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const Arrow = up ? IconArrowUp : IconArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${up ? "bg-emerald-100/70 text-emerald-600" : "bg-red-100/70 text-red-500"}`}
      title="Compared with the previous period of the same length"
    >
      <Arrow className="w-4 h-4" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

// A summary card that is also a filter: click to select, click again to go back to "All".
function SummaryCard({ title, value, pct, note, Icon, tone, active, onClick }) {
  const tones = {
    blue: ["border-sky-100 from-sky-50 to-blue-100/60", "bg-blue-100 text-blue-600", "text-blue-600"],
    green: ["border-emerald-100 from-emerald-50 to-green-100/60", "bg-emerald-100 text-emerald-600", "text-emerald-600"],
    orange: ["border-orange-100 from-orange-50 to-amber-100/50", "bg-orange-100 text-orange-500", "text-orange-500"],
  }[tone];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={`cursor-pointer rounded-2xl border bg-gradient-to-r p-5 transition-shadow ${tones[0]} ${
        active ? "ring-2 ring-indigo-500 shadow-md" : "hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tones[1]}`}>
          <Icon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="font-display font-bold text-navy-900">{title}</p>
          <div className="flex flex-wrap items-center gap-3 my-0.5">
            <p className={`font-display text-3xl font-bold ${tones[2]}`}>{value}</p>
            <TrendBadge pct={pct} />
          </div>
          <p className="text-xs text-slate-500">{note}</p>
        </div>
      </div>
    </div>
  );
}

function DateRangePicker({ range, label, presets, onChange }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef(null);
  const todayKey = keyOf(new Date());
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-navy-900 shadow-sm hover:border-slate-300"
      >
        <IconCalendar className="w-5 h-5 text-slate-600" />
        <span className="font-medium">{label}</span>
        <IconChevron className="w-4 h-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange({ key: p.key });
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${range.key === p.key ? "bg-indigo-50 font-semibold text-indigo-700" : "text-navy-900"}`}
            >
              <span className="block">{p.label}</span>
              {p.sub && <span className="block text-xs text-slate-400">{p.sub}</span>}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-100 px-3 pt-3 pb-2 space-y-2">
            <p className="text-xs font-semibold text-slate-500">Custom range</p>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">From</span>
              <input
                type="date"
                max={todayKey}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">To</span>
              <input
                type="date"
                max={todayKey}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!from || !to || from > to}
              onClick={() => {
                onChange({ key: "custom", from, to });
                setOpen(false);
              }}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function DailyUpdatesModule() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("All"); // "All" | "CSR" | "Tender", set by clicking the cards
  const [range, setRange] = useState({ key: "7d" });
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  // force = true asks the server to read the Google News feeds again
  // instead of reusing its 10-minute saved copy.
  const load = (force = false) => {
    setError(null);
    setRefreshing(true);
    fetch(`/api/daily-updates${force ? "?refresh=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setItems(json.data || []);
        setUpdatedAt(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  };
  useEffect(() => {
    load();
  }, []);

  const bounds = useMemo(() => boundsOf(range), [range]);
  const prevBounds = useMemo(() => previousBounds(bounds), [bounds]);

  const inRange = useMemo(() => (items || []).filter((i) => inBounds(i, bounds)), [items, bounds]);
  const prevRange = useMemo(() => (prevBounds ? (items || []).filter((i) => inBounds(i, prevBounds)) : null), [items, prevBounds]);

  const countOf = (list, cat) => (cat === "All" ? list.length : list.filter((i) => i.category === cat).length);
  const stat = (cat) => ({
    value: countOf(inRange, cat),
    pct: prevRange ? pctChange(countOf(inRange, cat), countOf(prevRange, cat)) : null,
  });

  const today = keyOf(new Date());
  const presets = [
    { key: "today", label: "Today", sub: fmtDate(today) },
    { key: "yesterday", label: "Yesterday", sub: fmtDate(addDays(today, -1)) },
    { key: "7d", label: "Last 7 days", sub: `${fmtDate(addDays(today, -6))} - ${fmtDate(today)}` },
    { key: "30d", label: "Last 30 days", sub: `${fmtDate(addDays(today, -29))} - ${fmtDate(today)}` },
    { key: "all", label: "All time" },
  ];
  const rangeLabel = !bounds ? "All time" : bounds.from === bounds.to ? fmtDate(bounds.from) : `${fmtDate(bounds.from)} - ${fmtDate(bounds.to)}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inRange.filter(
      (i) => (tab === "All" || i.category === tab) && (!q || `${i.title} ${i.source}`.toLowerCase().includes(q))
    );
  }, [inRange, tab, search]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((i) => {
      const k = dayKey(i.publishedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    });
    return [...map.entries()];
  }, [filtered]);

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load the daily updates: {error}
        <button type="button" onClick={() => load(true)} className="ml-3 underline font-semibold">
          Try again
        </button>
      </div>
    );
  }
  if (!items) {
    return <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">Loading daily updates…</div>;
  }

  const all = stat("All");
  const csr = stat("CSR");
  const tender = stat("Tender");
  const listTitle = tab === "All" ? "Latest updates" : `${tab} updates`;

  return (
    <div className="space-y-5">
      {/* Top bar: description (left), date range + refresh (right) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          CSR and Tender news from your Google News feeds
          {updatedAt && ` · Updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
        <div className="flex items-center gap-3">
          <DateRangePicker range={range} label={rangeLabel} presets={presets} onChange={setRange} />
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 hover:border-slate-300 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary cards: click one to filter the list below */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <SummaryCard
          title="Total Updates"
          value={all.value}
          pct={all.pct}
          note="CSR + Tender in this range"
          Icon={IconNewsBig}
          tone="blue"
          active={tab === "All"}
          onClick={() => setTab("All")}
        />
        <SummaryCard
          title="CSR Updates"
          value={csr.value}
          pct={csr.pct}
          note="Click to show CSR only"
          Icon={IconHeart}
          tone="green"
          active={tab === "CSR"}
          onClick={() => setTab(tab === "CSR" ? "All" : "CSR")}
        />
        <SummaryCard
          title="Tender Updates"
          value={tender.value}
          pct={tender.pct}
          note="Click to show Tender only"
          Icon={IconDoc}
          tone="orange"
          active={tab === "Tender"}
          onClick={() => setTab(tab === "Tender" ? "All" : "Tender")}
        />
      </div>

      {/* Updates list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <p className="font-display font-bold text-navy-900 text-lg leading-tight">{listTitle}</p>
            <p className="text-xs text-slate-400">
              {filtered.length} {filtered.length === 1 ? "item" : "items"} · {rangeLabel}
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <IconSearch className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search headline or source…"
              className="w-full text-sm pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
        </div>

        {groups.length === 0 && (
          <div className="py-10 text-center text-slate-400 text-sm">No updates in this date range.</div>
        )}

        <div className="space-y-4">
          {groups.map(([key, list]) => (
            <section key={key}>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                {dayLabel(key)} · {list.length}
              </p>
              <div className="space-y-2">
                {list.map((i, n) => (
                  <div key={`${i.link}-${n}`} className="rounded-xl border border-slate-100 px-4 py-3 flex items-start justify-between gap-4 hover:border-slate-200">
                    <div className="min-w-0">
                      <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold mb-1 ${BADGE[i.category] || "bg-slate-100 text-slate-600"}`}>
                        {i.category}
                      </span>
                      <p className="font-semibold text-navy-900">{i.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {i.source}
                        {i.source && timeOf(i.publishedAt) ? " · " : ""}
                        {timeOf(i.publishedAt)}
                      </p>
                    </div>
                    <a
                      href={i.link}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:border-indigo-300"
                    >
                      Open article
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}