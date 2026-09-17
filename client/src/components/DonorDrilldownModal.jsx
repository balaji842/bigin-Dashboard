import { useEffect, useMemo, useState } from "react";
import { moneyCr } from "../lib/format.js";
import HeaderFilterMenu, { optionsFor, matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";

const DEFAULT_FILTERS = { platform: null, kam: null, type: null, donorType: null };

// `title` overrides the monthName+fy combo entirely — lets every donor
// count across the dashboard (KPI cards, FY cards, breakdown-table rows,
// not just the Month-wise table) reuse this same modal with whatever
// heading fits what was clicked.
//
// Platform / KAM / Type (Donation Type) / Donor Type each get the same
// multi-select checkbox filter (with Select all / Clear all) used
// everywhere else on the dashboard — donor rows here already carry
// those fields the same way every /crm-analysis/* table does.
export default function DonorDrilldownModal({ open, onClose, monthName, fy, title, donors }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // dummy setter — this modal has no pagination, but makeFilterHandlers
  // expects one to call after every toggle/select-all/clear-all.
  const [, setPageNoop] = useState(0);

  const heading = title || `${monthName} ${fy}`;

  // Fresh filters every time a new drilldown is opened, so a filter
  // left on from the last popup never silently hides everything in
  // this one.
  useEffect(() => {
    if (open) setFilters(DEFAULT_FILTERS);
  }, [open, title]);

  const platformOptions = useMemo(() => optionsFor(donors, "platform"), [donors]);
  const kamOptions = useMemo(() => optionsFor(donors, "kam"), [donors]);
  const typeOptions = useMemo(() => optionsFor(donors, "type"), [donors]);
  const donorTypeOptions = useMemo(() => optionsFor(donors, "donorType"), [donors]);
  const optionsByField = { platform: platformOptions, kam: kamOptions, type: typeOptions, donorType: donorTypeOptions };
  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setFilters, setPageNoop, optionsByField);

  const filtered = useMemo(
    () =>
      donors.filter(
        (d) =>
          matchesFilter(d.platform, filters.platform) &&
          matchesFilter(d.kam, filters.kam) &&
          matchesFilter(d.type, filters.type) &&
          matchesFilter(d.donorType, filters.donorType)
      ),
    [donors, filters]
  );

  // Sums whatever's currently shown, so this updates as the column
  // filters narrow the list — same idea as the donor count next to it.
  const totalAmount = useMemo(() => filtered.reduce((sum, d) => sum + (d.amount || 0), 0), [filtered]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg max-w-5xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <p className="font-display font-semibold text-sm">
            {heading} — {moneyCr(totalAmount)} · {filtered.length} donor{filtered.length !== 1 ? "s" : ""}
          </p>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Donor</th>
                <th className="px-4 py-2 font-semibold text-right">Amount</th>
                <th className="px-4 py-2 font-semibold">
                  <HeaderFilterMenu
                    variant="light"
                    label="Platform"
                    options={platformOptions}
                    selected={filters.platform}
                    onToggle={toggleOption("platform")}
                    onSelectAll={selectAll("platform")}
                    onClearAll={clearAll("platform")}
                  />
                </th>
                <th className="px-4 py-2 font-semibold">
                  <HeaderFilterMenu
                    variant="light"
                    label="KAM"
                    options={kamOptions}
                    selected={filters.kam}
                    onToggle={toggleOption("kam")}
                    onSelectAll={selectAll("kam")}
                    onClearAll={clearAll("kam")}
                  />
                </th>
                <th className="px-4 py-2 font-semibold">SPOC</th>
                <th className="px-4 py-2 font-semibold">
                  <HeaderFilterMenu
                    variant="light"
                    label="Donation Type"
                    options={typeOptions}
                    selected={filters.type}
                    onToggle={toggleOption("type")}
                    onSelectAll={selectAll("type")}
                    onClearAll={clearAll("type")}
                  />
                </th>
                <th className="px-4 py-2 font-semibold">
                  <HeaderFilterMenu
                    variant="light"
                    label="Donor Type"
                    options={donorTypeOptions}
                    selected={filters.donorType}
                    onToggle={toggleOption("donorType")}
                    onSelectAll={selectAll("donorType")}
                    onClearAll={clearAll("donorType")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{d.account}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(d.amount)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.platform}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.kam}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.spoc || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.type || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{d.donorType || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-xs">
                    No donors found for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}