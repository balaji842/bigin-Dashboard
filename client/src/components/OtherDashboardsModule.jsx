import { useState } from "react";
import CRMOverview from "./CRMOverview.jsx";
import CategoryDashboardCards from "./CategoryDashboardCards.jsx";

// Other Dashboards — the dashboards of the donation categories that are NOT
// part of the NSNOP numbers on the other pages (their deals are left out of
// every other page): Rhapsody and IGCC.
//
// One button per dashboard, styled like the Type pills but single-select:
// exactly one is always on. Switching shows that category's dashboard, built
// only from the deals of the selected category.
//
// Both dashboards have the same layout: the Overview dashboard's FY 2026-2027
// and Pipeline 2026-2027 cards, then "Closed donors by Fiscal Year" (no Total
// Conversion card, no Type / Platform filters), followed
// by the six cards — Conversion Donation Amount, Pipeline Donation Type, Target
// Amount, Platform, KAM Conversion Amount, KAM Pipeline Amount (see
// CategoryDashboardCards.jsx). Set `cards: false` on a dashboard below to show
// the full Overview dashboard for it instead.
//
// The dashboard is remounted on every switch (`key`), so the filters picked
// on one dashboard never carry over to the other.
const DASHBOARDS = [
  { key: "rhapsody", label: "Rhapsody", cards: true },
  { key: "igcc", label: "IGCC", cards: true },
];

export default function OtherDashboardsModule() {
  const [selected, setSelected] = useState(DASHBOARDS[0].key);
  const current = DASHBOARDS.find((d) => d.key === selected);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Dashboard</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Other dashboards">
          {DASHBOARDS.map((d) => {
            const active = d.key === selected;
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(d.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {current.cards ? (
        <CRMOverview
          key={selected}
          category={selected}
          hideFilters
          showTotalConversion={false}
          afterFiscalYear={<CategoryDashboardCards category={selected} />}
        />
      ) : (
        <CRMOverview key={selected} category={selected} />
      )}
    </div>
  );
}