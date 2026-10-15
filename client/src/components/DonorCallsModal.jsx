import { useEffect } from "react";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";

// Popup opened from the Calls count in the Donor History table: every call
// logged in Bigin (Activities -> Calls) about that donor, newest first.
// `donor` is a Donor History row; its `calls` are
// { donorName, date, spoc, purpose, description, type, result }, where
// donorName is the call's "To/From" in Bigin.

function formatCallDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time}`;
}

const dash = (v) => (v ? v : <span className="text-slate-300">—</span>);

export default function DonorCallsModal({ open, onClose, donor }) {
  // Esc closes the popup.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !donor) return null;
  const calls = donor.calls || [];

  const handleExport = () => {
    downloadCsv(
      `calls-${donor.account}.csv`.replace(/[\\/:*?"<>|]+/g, "-"),
      ["Donor Name", "Date", "Call SPOC Name", "Call Purpose", "Description", "Call Type", "Call Result"],
      calls.map((c) => [
        c.donorName || donor.account,
        formatCallDate(c.date),
        c.spoc,
        c.purpose,
        (c.description || "").replace(/\s+/g, " "),
        c.type,
        c.result,
      ])
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Calls for ${donor.account}`}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy-900 text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-bold text-lg truncate">Calls — {donor.account}</p>
            <p className="text-xs text-white/60">
              {calls.length} {calls.length === 1 ? "call" : "calls"} logged in Bigin, newest first
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ExportButton onClick={handleExport} disabled={calls.length === 0} />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/10 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide sticky top-0">
                <th className="px-5 py-3 font-semibold">Donor Name</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Call SPOC Name</th>
                <th className="px-5 py-3 font-semibold">Call Purpose</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold">Call Type</th>
                <th className="px-5 py-3 font-semibold">Call Result</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => (
                <tr key={c.id || i} className={`align-top ${i % 2 === 1 ? "bg-slate-50" : ""}`}>
                  <td className="px-5 py-3 font-medium text-navy-900">{c.donorName || donor.account}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{dash(formatCallDate(c.date))}</td>
                  <td className="px-5 py-3 text-slate-600">{dash(c.spoc)}</td>
                  <td className="px-5 py-3 text-slate-600">{dash(c.purpose)}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-pre-line break-words max-w-[340px]">{dash(c.description)}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{dash(c.type)}</td>
                  <td className="px-5 py-3 text-slate-600">{dash(c.result)}</td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">
                    No calls found for this donor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}