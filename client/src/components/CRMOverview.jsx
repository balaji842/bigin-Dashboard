import { useEffect, useMemo, useState } from "react";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";
import DonorHistoryTable from "./DonorHistoryTable.jsx";
import DonorHistoryModal from "./DonorHistoryModal.jsx";
import ClearFiltersBar from "./ClearFiltersBar.jsx";
import { isApprovedOpenPipelineRow, filterRows } from "../lib/donorRows.js";
import { moneyCr } from "../lib/format.js";

// `onDonorsClick` (optional) makes just the donor-count line open a
// drilldown, independent of the card's own onClick (which toggles this
// card in/out of the FY/Donor Type selection) — the outer element is a
// div rather than a button so the two click targets don't nest one
// button inside another.
function DonorsLine({ donors, onDonorsClick }) {
  if (!onDonorsClick) {
    return <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} Donors</p>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (donors > 0) onDonorsClick();
      }}
      disabled={donors === 0}
      className={`text-xs font-semibold mt-1 ${
        donors > 0 ? "text-emerald-600 underline hover:text-emerald-700" : "text-slate-300"
      }`}
    >
      {donors} Donors
    </button>
  );
}

function KpiCard({ label, amount, donors, accent = "pink", active, onClick, onDonorsClick }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={`text-left rounded-2xl border shadow-sm p-5 transition-colors w-full ${
        active
          ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200"
          : "border-slate-100 bg-white " + (clickable ? "hover:border-slate-200 cursor-pointer" : "")
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${active ? "text-pink-600" : theme}`}>{moneyCr(amount)}</p>
      <DonorsLine donors={donors} onDonorsClick={onDonorsClick} />
    </div>
  );
}

function FYCard({ year, amount, donors, active, onClick, onDonorsClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`text-left rounded-2xl border shadow-sm p-4 transition-colors cursor-pointer ${
        active ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 bg-white hover:border-slate-200"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">FY {year}</p>
      <p className={`font-display text-xl font-bold ${active ? "text-pink-600" : "text-navy-700"}`}>{moneyCr(amount)}</p>
      <DonorsLine donors={donors} onDonorsClick={onDonorsClick} />
    </div>
  );
}

function MiniStatCard({ name, amount, donors, active, onClick, onDonorsClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={`text-left rounded-xl border shadow-sm p-4 min-w-0 w-full transition-colors ${
        active
          ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200"
          : "border-slate-100 bg-white " + (clickable ? "hover:border-slate-200 cursor-pointer" : "")
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2 break-words" title={name}>
        {name}
      </p>
      <p className={`font-display text-lg font-bold ${active ? "text-pink-600" : "text-navy-900"}`}>
        {moneyCr(amount)}
      </p>
      <DonorsLine donors={donors} onDonorsClick={onDonorsClick} />
    </div>
  );
}

function TypeFilterPills({ label, options, selected, onToggle }) {
  if (!options || options.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected == null || selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Collapses the raw per-deal table into one row per donor (Account_Name)
// for the Donor History table: total amount across every deal, plus the
// distinct Donor Type(s)/KAM(s)/SPOC(s) that appear across that donor's
// donors — joined with ", " when a donor has more than one of any of
// these. Each donor's full list of underlying donors is kept as `donors`
// so the drilldown modal can show fiscal-year splits, months, and
// per-deal engagement type without a second network call.
function buildDonorHistory(table) {
  const byAccount = {};
  for (const row of table) {
    if (!row.account || row.account === "Unspecified") continue;
    if (!byAccount[row.account]) {
      byAccount[row.account] = {
        account: row.account,
        totalAmount: 0,
        donorTypes: new Set(),
        kams: new Set(),
        spocs: new Set(),
        platforms: new Set(),
        donors: [],
      };
    }
    const entry = byAccount[row.account];
    entry.totalAmount += row.amount || 0;
    if (row.donorType && row.donorType !== "Unspecified") entry.donorTypes.add(row.donorType);
    if (row.kam && row.kam !== "Unspecified") entry.kams.add(row.kam);
    if (row.spoc && row.spoc !== "Unspecified") entry.spocs.add(row.spoc);
    if (row.platform && row.platform !== "Unspecified") entry.platforms.add(row.platform);
    entry.donors.push(row);
  }

  return Object.values(byAccount)
    .map((d) => ({
      account: d.account,
      totalAmount: d.totalAmount,
      donorType: [...d.donorTypes].join(", ") || "—",
      kam: [...d.kams].join(", ") || "—",
      spoc: [...d.spocs].join(", ") || "—",
      platform: [...d.platforms].join(", ") || "—",
      donors: d.donors,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function monthNameOf(closingDate) {
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

// fys can be "ALL" here too — in that case donors aren't scoped to a
// particular fiscal year for the clicked month, and the "history" list
// for each donor excludes only that exact deal (by reference) rather
// than excluding "the currently selected FY(s)". Otherwise fys is an
// array of one or more selected fiscal years.
function buildMonthDonors(table, monthName, fys) {
  const isAll = fys === "ALL";
  const rowsThisMonth = table.filter(
    (r) =>
      r.subPipeline !== "Standard Pipeline" &&
      r.closingDate &&
      monthNameOf(r.closingDate) === monthName &&
      (isAll || fys.includes(r.fiscalYear))
  );

  return rowsThisMonth.map((r) => {
    const history = table
      .filter(
        (h) =>
          h.account === r.account &&
          h.subPipeline !== "Standard Pipeline" &&
          h.closingDate &&
          (isAll ? h !== r : !fys.includes(h.fiscalYear))
      )
      .map((h) => ({ fiscalYear: h.fiscalYear, amount: h.amount, month: monthNameOf(h.closingDate) }))
      .sort((a, b) => (b.fiscalYear || "").localeCompare(a.fiscalYear || ""));
    return { ...r, history };
  });
}

// Short display label for whichever FY(s) are currently selected —
// "All Years" when nothing's selected, "FY 2026-2027" for one, or
// "FY 2025-2026, 2026-2027" when several are combined.
function fyLabel(fys) {
  return fys === "ALL" || !fys || fys.length === 0 ? "All Years" : `FY ${fys.join(", ")}`;
}

export default function CRMOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalMonth, setModalMonth] = useState(null);
  const [modalDonor, setModalDonor] = useState(null);
  // Generic donor-list popup for every OTHER donor count on this page
  // (KPI cards, FY cards, Donor Type cards) — the Month-wise table's
  // count keeps its own modalMonth/monthDonors path above since that
  // one already worked before this was added.
  const [drilldown, setDrilldown] = useState(null); // { title, rows } | null
  const openDrilldown = (title, rows) => setDrilldown({ title, rows });

  const [typeOptions, setTypeOptions] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState(null);
  const [platformOptions, setPlatformOptions] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState(null);

  // Multi-select: null means nothing picked (FY side = "every year
  // combined", Donor Type side = "every type"). Clicking a card toggles
  // it in/out of the array; clicking the last remaining one resets back
  // to null rather than leaving an empty array around.
  const [selectedFYs, setSelectedFYs] = useState(null);
  const [selectedDonorTypes, setSelectedDonorTypes] = useState(null);

  const toggleFY = (year) => {
    setSelectedFYs((prev) => {
      const base = prev || [];
      const next = base.includes(year) ? base.filter((y) => y !== year) : [...base, year];
      return next.length === 0 ? null : next;
    });
  };

  const toggleDonorType = (name) => {
    setSelectedDonorTypes((prev) => {
      const base = prev || [];
      const next = base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
      return next.length === 0 ? null : next;
    });
  };

  const hasActiveFilters = selectedFYs != null || selectedDonorTypes != null || selectedTypes != null || selectedPlatforms != null;
  const clearAllFilters = () => {
    setSelectedFYs(null);
    setSelectedDonorTypes(null);
    setSelectedTypes(null);
    setSelectedPlatforms(null);
  };

  useEffect(() => {
    fetch("/api/crm-analysis/filter-options")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setTypeOptions(json.types || []);
        setPlatformOptions(json.platforms || []);
      })
      .catch(() => {});
  }, []);

  const toggleType = (value) => {
    setSelectedTypes((prev) => {
      const base = prev == null ? typeOptions : prev;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return prev;
      if (next.length === typeOptions.length) return null;
      return next;
    });
  };

  const togglePlatform = (value) => {
    setSelectedPlatforms((prev) => {
      const base = prev == null ? platformOptions : prev;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      if (next.length === 0) return prev;
      if (next.length === platformOptions.length) return null;
      return next;
    });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("fy", selectedFYs && selectedFYs.length > 0 ? selectedFYs.join(",") : "ALL");
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    if (selectedPlatforms != null) params.set("platforms", selectedPlatforms.join(","));
    if (selectedDonorTypes && selectedDonorTypes.length > 0) params.set("donorTypes", selectedDonorTypes.join(","));
    fetch(`/api/crm-analysis/overview?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedFYs, selectedTypes, selectedPlatforms, selectedDonorTypes]);

  const monthDonors = useMemo(() => {
    if (!data || !modalMonth) return [];
    return buildMonthDonors(data.table, modalMonth, data.fy);
  }, [data, modalMonth]);

  // Donor History table aggregates across the FULL raw table (every
  // fiscal year, closed + standard pipeline) — not scoped to the
  // currently-selected `fy`, since the point of this table is to search
  // any donor's entire history regardless of which year is picked above.
  const donorHistory = useMemo(() => {
    if (!data) return [];
    return buildDonorHistory(data.table);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
        Loading CRM analysis…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
        Couldn't load CRM analysis: {error}
      </div>
    );
  }

  const fy2027 = data.byFiscalYear.find((y) => y.name === "2026-2027") || {
    name: "2026-2027",
    amount: 0,
    donors: 0,
  };
  const otherYears = data.byFiscalYear.filter((y) => y.name !== "2026-2027");

  return (
    <div className="space-y-5 sm:space-y-6">
      <ClearFiltersBar
        active={hasActiveFilters}
        onClear={clearAllFilters}
        emptyText="No filters applied — showing every fiscal year and donor type"
        summary={[
          selectedFYs != null ? `FY ${selectedFYs.join(", ")}` : null,
          selectedDonorTypes != null ? `Donor Type: ${selectedDonorTypes.join(", ")}` : null,
          selectedTypes != null ? `Type: ${selectedTypes.join(", ")}` : null,
          selectedPlatforms != null ? `Platform: ${selectedPlatforms.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <TypeFilterPills label="Type" options={typeOptions} selected={selectedTypes} onToggle={toggleType} />
        <TypeFilterPills label="Platform" options={platformOptions} selected={selectedPlatforms} onToggle={togglePlatform} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Conversion FY 2022-2027"
          amount={data.closed.allTime.amount}
          donors={data.closed.allTime.donors}
          accent="emerald"
          active={selectedFYs == null}
          onClick={() => setSelectedFYs(null)}
          onDonorsClick={() =>
            openDrilldown(
              "Total Conversion FY 2022-2027",
              filterRows(data.table, (r) => r.subPipeline !== "Standard Pipeline")
            )
          }
        />
        <KpiCard
          label="Pipeline 2026-2027"
          amount={data.pipeline2027Approved.amount}
          donors={data.pipeline2027Approved.donors}
          accent="navy"
          onDonorsClick={() =>
            openDrilldown(
              "Pipeline 2026-2027",
              filterRows(
                data.table,
                (r) => r.subPipeline === "Standard Pipeline" && r.fiscalYear === "2026-2027" && isApprovedOpenPipelineRow(r)
              )
            )
          }
        />
        <FYCard
          year={fy2027.name}
          amount={fy2027.amount}
          donors={fy2027.donors}
          active={selectedFYs != null && selectedFYs.includes(fy2027.name)}
          onClick={() => toggleFY(fy2027.name)}
          onDonorsClick={() =>
            openDrilldown(
              `FY ${fy2027.name}`,
              filterRows(data.table, (r) => r.subPipeline !== "Standard Pipeline" && r.fiscalYear === fy2027.name)
            )
          }
        />
      </div>

      <div>
        <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Closed donors by Fiscal Year</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {otherYears.map((y) => (
            <FYCard
              key={y.name}
              year={y.name}
              amount={y.amount}
              donors={y.donors}
              active={selectedFYs != null && selectedFYs.includes(y.name)}
              onClick={() => toggleFY(y.name)}
              onDonorsClick={() =>
                openDrilldown(
                  `FY ${y.name}`,
                  filterRows(data.table, (r) => r.subPipeline !== "Standard Pipeline" && r.fiscalYear === y.name)
                )
              }
            />
          ))}
          {otherYears.length === 0 && <p className="text-xs text-slate-400 col-span-full">No data</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="bg-navy-900 text-white px-5 py-3">
            <p className="font-display font-semibold text-sm">
              {selectedFYs == null
                ? "Month-wise (All Fiscal Years, 2022-2027 combined)"
                : `Month-wise (FY ${selectedFYs.join(", ")}) — April to March`}
              {selectedDonorTypes != null ? ` · ${selectedDonorTypes.join(", ")}` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Month</th>
                  <th className="px-4 py-2 font-semibold text-right">Amount</th>
                  <th className="px-4 py-2 font-semibold text-right">Donors</th>
                </tr>
              </thead>
              <tbody>
                {data.monthWise.map((m, i) => (
                  <tr key={m.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                    <td className="px-4 py-2 text-navy-900 font-medium">{m.name}</td>
                    <td className="px-4 py-2 text-right">{moneyCr(m.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => m.donors > 0 && setModalMonth(m.name)}
                        disabled={m.donors === 0}
                        className={`font-semibold ${
                          m.donors > 0
                            ? "text-emerald-600 underline hover:text-emerald-700"
                            : "text-slate-300"
                        }`}
                      >
                        {m.donors}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <p className="font-display font-semibold text-navy-900 text-sm">By Donor Type</p>
            {selectedDonorTypes != null && (
              <button
                type="button"
                onClick={() => setSelectedDonorTypes(null)}
                className="text-xs text-pink-600 font-semibold hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {selectedFYs == null ? "Across all fiscal years (2022-2027)" : `FY ${selectedFYs.join(", ")}`}
            {" · click a card to filter"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {data.byDonorType.map((r) => (
              <MiniStatCard
                key={r.name}
                name={r.name}
                amount={r.amount}
                donors={r.donors}
                active={selectedDonorTypes != null && selectedDonorTypes.includes(r.name)}
                onClick={() => toggleDonorType(r.name)}
                onDonorsClick={() =>
                  openDrilldown(
                    `Donor Type: ${r.name}`,
                    filterRows(
                      data.table,
                      (row) =>
                        row.subPipeline !== "Standard Pipeline" &&
                        row.donorType === r.name &&
                        (selectedFYs == null || selectedFYs.includes(row.fiscalYear))
                    )
                  )
                }
              />
            ))}
            {data.byDonorType.length === 0 && <p className="text-xs text-slate-400 col-span-full">No data</p>}
          </div>
        </div>
      </div>

      <DonorHistoryTable donors={donorHistory} onSelectDonor={setModalDonor} />

      <DonorDrilldownModal
        open={!!modalMonth}
        onClose={() => setModalMonth(null)}
        monthName={modalMonth}
        fy={fyLabel(data.fy)}
        donors={monthDonors}
      />

      <DonorDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title}
        donors={drilldown?.rows || []}
      />

      <DonorHistoryModal
        open={!!modalDonor}
        onClose={() => setModalDonor(null)}
        donor={modalDonor}
      />
    </div>
  );
}