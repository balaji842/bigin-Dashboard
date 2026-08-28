const THEME = {
  pink: "bg-pink-100 text-pink-600",
  navy: "bg-navy-100 text-navy-700",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
};

export default function StatCard({ label, value, icon: Icon, accent = "pink", sub }) {
  const iconTheme = THEME[accent] || THEME.pink;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
      <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
        <span
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${iconTheme}`}
        >
          {Icon && <Icon className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px]" />}
        </span>
        <p className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-400 font-semibold leading-tight">
          {label}
        </p>
      </div>
      <p className="font-display text-xl sm:text-2xl font-bold text-navy-900 truncate">
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}