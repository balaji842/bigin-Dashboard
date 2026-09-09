import { useEffect, useMemo, useState } from "react";
import DonorDrilldownModal from "./DonorDrilldownModal.jsx";
import DonorHistoryTable from "./DonorHistoryTable.jsx";
import DonorHistoryModal from "./DonorHistoryModal.jsx";
import { moneyCr } from "../lib/format.js";

function KpiCard({ label, amount, donors, accent = "pink" }) {
  const theme = { pink: "text-pink-600", navy: "text-navy-700", emerald: "text-emerald-600" }[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${theme}`}>{moneyCr(amount)}</p>
      <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} Donors</p>
    </div>
  );
}

function FYCard({ year, amount, donors, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-sm p-4 transition-colors ${
        active ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 bg-white hover:border-slate-200"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">FY {year}</p>
      <p className={`font-display text-xl font-bold ${active ? "text-pink-600" : "text-navy-700"}`}>{moneyCr(amount)}</p>
      <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} Donors</p>
    </button>
  );
}

function MiniStatCard({ name, amount, donors }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2 break-words" title={name}>
        {name}
      </p>
      <p className="font-display text-lg font-bold text-navy-900">{moneyCr(amount)}</p>
      <p className="text-xs text-emerald-600 font-semibold mt-1">{donors} donors</p>
    </div>
  );
}

function TypeFilterPills({ options, selected, onToggle }) {
  if (!options || options.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Type</p>
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
// deals — joined with ", " when a donor has more than one of any of
// these. Each donor's full list of underlying deals is kept as `deals`
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
        deals: [],
      };
    }
    const entry = byAccount[row.account];
    entry.totalAmount += row.amount || 0;
    if (row.donorType && row.donorType !== "Unspecified") entry.donorTypes.add(row.donorType);
    if (row.kam && row.kam !== "Unspecified") entry.kams.add(row.kam);
    if (row.spoc && row.spoc !== "Unspecified") entry.spocs.add(row.spoc);
    entry.deals.push(row);
  }

  return Object.values(byAccount)
    .map((d) => ({
      account: d.account,
      totalAmount: d.totalAmount,
      donorType: [...d.donorTypes].join(", ") || "—",
      kam: [...d.kams].join(", ") || "—",
      spoc: [...d.spocs].join(", ") || "—",
      deals: d.deals,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function monthNameOf(closingDate) {
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

function buildMonthDonors(table, monthName, fy) {
  const rowsThisMonth = table.filter(
    (r) =>
      r.subPipeline !== "Standard Pipeline" &&
      r.fiscalYear === fy &&
      r.closingDate &&
      monthNameOf(r.closingDate) === monthName
  );

  return rowsThisMonth.map((r) => {
    const history = table
      .filter(
        (h) =>
          h.account === r.account &&
          h.fiscalYear !== fy &&
          h.subPipeline !== "Standard Pipeline" &&
          h.closingDate
      )
      .map((h) => ({ fiscalYear: h.fiscalYear, amount: h.amount, month: monthNameOf(h.closingDate) }))
      .sort((a, b) => (b.fiscalYear || "").localeCompare(a.fiscalYear || ""));
    return { ...r, history };
  });
}

export default function CRMOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fy, setFy] = useState("2025-2026");
  const [modalMonth, setModalMonth] = useState(null);
  const [modalDonor, setModalDonor] = useState(null);

  const [typeOptions, setTypeOptions] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState(null);

  useEffect(() => {
    fetch("/api/crm-analysis/filter-options")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setTypeOptions(json.types || []))
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

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fy });
    if (selectedTypes != null) params.set("types", selectedTypes.join(","));
    fetch(`/api/crm-analysis/overview?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy, selectedTypes]);

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
      <TypeFilterPills options={typeOptions} selected={selectedTypes} onToggle={toggleType} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Conversion FY 2022-2027"
          amount={data.closed.allTime.amount}
          donors={data.closed.allTime.donors}
          accent="emerald"
        />
        <KpiCard
          label="Pipeline 2026-2027"
          amount={data.pipeline2027Approved.amount}
          donors={data.pipeline2027Approved.donors}
          accent="navy"
        />
        <FYCard
          year={fy2027.name}
          amount={fy2027.amount}
          donors={fy2027.donors}
          active={fy2027.name === fy}
          onClick={() => setFy(fy2027.name)}
        />
      </div>

      <div>
        <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Closed Deals by Fiscal Year</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {otherYears.map((y) => (
            <FYCard
              key={y.name}
              year={y.name}
              amount={y.amount}
              donors={y.donors}
              active={y.name === fy}
              onClick={() => setFy(y.name)}
            />
          ))}
          {otherYears.length === 0 && <p className="text-xs text-slate-400 col-span-full">No data</p>}
        </div>
      </div>

      <div>
        <p className="font-display font-semibold text-navy-900 mb-3 text-sm">By Donor Type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.byDonorType.map((r) => (
            <MiniStatCard key={r.name} name={r.name} amount={r.amount} donors={r.donors} />
          ))}
          {data.byDonorType.length === 0 && <p className="text-xs text-slate-400 col-span-full">No data</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-navy-900 text-white px-5 py-3">
          <p className="font-display font-semibold text-sm">
            Month-wise (FY {data.fy}) — April to March
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

      <DonorHistoryTable donors={donorHistory} onSelectDonor={setModalDonor} />

      <DonorDrilldownModal
        open={!!modalMonth}
        onClose={() => setModalMonth(null)}
        monthName={modalMonth}
        fy={data.fy}
        donors={monthDonors}
      />

      <DonorHistoryModal
        open={!!modalDonor}
        onClose={() => setModalDonor(null)}
        donor={modalDonor}
      />
    </div>
  );
}