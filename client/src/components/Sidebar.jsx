import { IconChartBars, IconDot, IconX } from "./icons.jsx";

const NAV_ITEMS = [
  //{ id: "bigin-overview", label: "Bigin Overview", ready: true },
  { id: "crm-overview", label: "Overview", ready: true },
  { id: "closed-deals", label: "Conversion", ready: true },
  { id: "standard-pipeline", label: "Pipeline", ready: true },
  { id: "fy-comparison", label: "FY Comparison 2025-26 & 2026-27", ready: true },
];

export default function Sidebar({ lastUpdated, onRefresh, loading, open, onClose, activePage, onNavigate }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 shrink-0 bg-navy-950 text-white flex flex-col min-h-screen
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-6 py-6 border-b border-white/10 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
            <IconChartBars className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="font-display font-bold text-lg tracking-tight leading-none">
              Bigin<span className="text-pink-400">.</span>Analysis
            </p>
            <p className="text-xs text-white/40 mt-1">NSNOP · Live CRM data</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto md:hidden text-white/50 hover:text-white p-1"
            aria-label="Close menu"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 py-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-white/30 font-semibold mb-2 px-2">
            Dashboard
          </p>
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                disabled={!item.ready}
                onClick={() => item.ready && onNavigate(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors
                  ${isActive ? "bg-white/10" : item.ready ? "hover:bg-white/5" : "opacity-40 cursor-not-allowed"}`}
              >
                <IconChartBars className={`w-4 h-4 shrink-0 ${isActive ? "text-pink-400" : "text-white/40"}`} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">
                    <IconDot className="w-1.5 h-1.5" />
                    Live
                  </span>
                )}
                {!item.ready && (
                  <span className="ml-auto text-[10px] text-white/30 uppercase tracking-wide">Soon</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 px-6 py-2">
          <p className="text-sm text-white/50 leading-relaxed">
          </p>
        </div>

        <div className="px-4 py-5 border-t border-white/10 text-xs text-white/40">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="w-full mb-2 py-2 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {loading ? "Refreshing…" : "Refresh live data"}
          </button>
          {lastUpdated && <p>Last pulled: {lastUpdated}</p>}
        </div>
      </aside>
    </>
  );
}