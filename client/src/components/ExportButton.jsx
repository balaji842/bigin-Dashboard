function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

// Reusable "Export" button, used on every exportable table across the
// dashboard so they all look and behave the same. `onClick` is expected
// to build the CSV from whatever rows are currently on screen (already
// filtered/sorted) — this component doesn't do any data work itself.
export default function ExportButton({ onClick, label = "Export", disabled = false, variant = "light" }) {
  const theme =
    variant === "dark"
      ? "border-white/20 text-white hover:bg-white/10"
      : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${theme}`}
      title="Export the currently filtered data as CSV"
    >
      <DownloadIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}