import { IconChartBars, IconDot, IconX, IconRefresh, IconTarget, IconWallet, IconTrendingUp, IconCalendar, IconCheckCircle } from "./icons.jsx";
const NAV_ITEMS = [
  //{ id: "bigin-overview", label: "Bigin Overview", ready: true },
  { id: "crm-overview", label: "Overview", ready: true, icon: IconTarget },
  { id: "closed-deals", label: "Conversion", ready: true, icon: IconWallet },
  { id: "standard-pipeline", label: "Pipeline", ready: true, icon: IconTrendingUp },
  { id: "fy-comparison", label: "FY Comparison 2025-26 & 2026-27", ready: true, icon: IconCalendar },
    { id: "engagement-status", label: "Engagement Status", ready: true, icon: IconCheckCircle },

];

export default function Sidebar({ lastUpdated, onRefresh, loading, open, onClose, activePage, onNavigate }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:sticky inset-y-0 left-0 md:top-0 z-40 w-64 shrink-0 text-white flex flex-col h-screen overflow-y-auto
          bg-gradient-to-b from-indigo-950 via-[#241a52] to-violet-900
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-6 py-6 border-b border-white/10 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-400 text-white flex items-center justify-center shrink-0 shadow-sm shadow-black/20">
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
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                disabled={!item.ready}
                onClick={() => item.ready && onNavigate(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors
                  ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 shadow-sm shadow-black/20"
                      : item.ready
                      ? "hover:bg-white/5"
                      : "opacity-40 cursor-not-allowed"
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-white/40"}`} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-300 font-semibold uppercase tracking-wide">
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
            className="w-full mb-2 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm shadow-black/20"
          >
            <IconRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing…" : "Refresh live data"}
          </button>
          {lastUpdated && <p>Last pulled: {lastUpdated}</p>}
        </div>
      </aside>
    </>
  );
}