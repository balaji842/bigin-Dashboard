import { useMemo, useState } from "react";
import { moneyCr } from "../lib/format.js";
import HeaderFilterMenu, { optionsFor, matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import ColumnSortMenu from "./ColumnSortMenu.jsx";

function DiffBadge({ pct, amount }) {
  if (pct == null) return <span className="text-slate-300">—</span>;
  return (
    <span className={`font-semibold whitespace-nowrap ${pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%{" "}
      <span className="font-bold">({moneyCr(amount)})</span>
    </span>
  );
}

function BucketSection({ title, donorCount, totalAmount, children }) {
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 py-2.5 flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
        <p className="font-display font-semibold text-sm">{title}</p>
        <p className="text-xs text-white/70">
          Donor Unique Count: <span className="text-white font-semibold">{donorCount}</span>
          <span className="mx-2">·</span>
          Total Amount: <span className="text-white font-semibold">{moneyCr(totalAmount)}</span>
        </p>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ span }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-4 text-center text-slate-400 text-xs">
        None this month.
      </td>
    </tr>
  );
}

// Shared filter+sort state for one bucket's table. `filterKeys` are the
// categorical columns that get the standard checkbox multi-select
// (Select all/Clear all); `sortKeys` are the numeric/string columns
// that get the click-to-cycle sort arrow. Both work exactly like every
// other table on the dashboard — options/filtering computed from the
// bucket's own rows, one field at a time.
function useBucketTable(rows, filterKeys, sortKeys) {
  const [filters, setFilters] = useState(() => Object.fromEntries(filterKeys.map((k) => [k, null])));
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [, setPageNoop] = useState(0); // this modal has no pagination; makeFilterHandlers just needs a setter to call

  const optionsByField = useMemo(() => {
    const out = {};
    for (const k of filterKeys) out[k] = optionsFor(rows, k);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setFilters, setPageNoop, optionsByField);

  const setSortFor = (column) => (dir) => {
    setSortColumn(dir == null ? null : column);
    setSortDir(dir);
  };

  const filtered = useMemo(() => {
    let out = rows.filter((r) => filterKeys.every((k) => matchesFilter(r[k], filters[k])));
    if (sortColumn && sortDir) {
      const sortDef = sortKeys.find((s) => s.key === sortColumn);
      if (sortDef) {
        out = [...out].sort((a, b) => {
          if (sortDef.type === "number") {
            const av = a[sortColumn] || 0;
            const bv = b[sortColumn] || 0;
            return sortDir === "asc" ? av - bv : bv - av;
          }
          const av = String(a[sortColumn] || "");
          const bv = String(b[sortColumn] || "");
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, sortColumn, sortDir]);

  return { filtered, filters, optionsByField, toggleOption, selectAll, clearAll, sortColumn, sortDir, setSortFor };
}

// Wraps HeaderFilterMenu with this modal's light-header variant so every
// call site below stays one line.
function FilterTh({ label, field, table }) {
  return (
    <th className="px-4 py-2 font-semibold">
      <HeaderFilterMenu
        variant="light"
        label={label}
        options={table.optionsByField[field] || []}
        selected={table.filters[field]}
        onToggle={table.toggleOption(field)}
        onSelectAll={table.selectAll(field)}
        onClearAll={table.clearAll(field)}
      />
    </th>
  );
}

function SortTh({ label, field, table, align }) {
  return (
    <th className={`px-4 py-2 font-semibold ${align === "right" ? "text-right" : ""}`}>
      <ColumnSortMenu
        variant="light"
        label={label}
        sortDir={table.sortColumn === field ? table.sortDir : null}
        onSort={table.setSortFor(field)}
      />
    </th>
  );
}

export default function MonthDonorBreakdownModal({ open, onClose, monthName, fy1, fy2, loading, error, data }) {
  const matching = useBucketTable(
    data?.matching?.rows || [],
    ["fy1Type", "fy2Type", "kam", "spoc"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
      { key: "fy2Amount", type: "number" },
    ]
  );
  const missing = useBucketTable(
    data?.missing?.rows || [],
    ["fy1Type", "kam", "spoc"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
    ]
  );
  const newDonors = useBucketTable(
    data?.newDonors?.rows || [],
    ["fy1Type", "fy2Type", "platform", "kam", "spoc"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
      { key: "fy2Amount", type: "number" },
    ]
  );
  const past = useBucketTable(
    data?.past?.rows || [],
    ["fy2Type", "platform", "kam", "spoc"],
    [
      { key: "account", type: "string" },
      { key: "fy2Amount", type: "number" },
    ]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg max-w-6xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <p className="font-display font-semibold text-sm">
            {monthName} — FY {fy1} vs FY {fy2} donor breakdown
          </p>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4 bg-slate-50">
          {loading && (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 text-sm">Loading donors…</div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100">
              Couldn't load donor breakdown: {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <BucketSection title="Matching Donors" donorCount={matching.filtered.length} totalAmount={matching.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <SortTh label="Donor" field="account" table={matching} />
                        <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={matching} align="right" />
                        <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={matching} align="right" />
                        <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={matching} />
                        <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={matching} />
                        <th className="px-4 py-2 font-semibold">FY {fy2} Month</th>
                        <th className="px-4 py-2 font-semibold text-right">Difference</th>
                        <FilterTh label="KAM" field="kam" table={matching} />
                        <FilterTh label="SPOC" field="spoc" table={matching} />
                      </tr>
                    </thead>
                    <tbody>
                      {matching.filtered.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.fy1Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {r.fy2Month && r.fy2Month !== monthName ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700" title={`Gave again in ${r.fy2Month} instead of ${monthName}`}>
                                {r.fy2Month}
                              </span>
                            ) : (
                              r.fy2Month || "—"
                            )}
                          </td>
                          <td className="px-4 py-2 text-right"><DiffBadge pct={r.diffPct} amount={r.diffAmount} /></td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {matching.filtered.length === 0 && <EmptyRow span={10} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="Missing Donors" donorCount={missing.filtered.length} totalAmount={missing.filtered.reduce((s, r) => s + (r.fy1Amount || 0), 0)}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <SortTh label="Donor" field="account" table={missing} />
                        <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={missing} align="right" />
                        <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={missing} />
                        <FilterTh label="KAM" field="kam" table={missing} />
                        <FilterTh label="SPOC" field="spoc" table={missing} />
                      </tr>
                    </thead>
                    <tbody>
                      {missing.filtered.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.fy1Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {missing.filtered.length === 0 && <EmptyRow span={6} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="New Donors" donorCount={newDonors.filtered.length} totalAmount={newDonors.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[880px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <SortTh label="Donor" field="account" table={newDonors} />
                        <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={newDonors} align="right" />
                        <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={newDonors} align="right" />
                        <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={newDonors} />
                        <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={newDonors} />
                        <FilterTh label="Platform" field="platform" table={newDonors} />
                        <FilterTh label="KAM" field="kam" table={newDonors} />
                        <FilterTh label="SPOC" field="spoc" table={newDonors} />
                      </tr>
                    </thead>
                    <tbody>
                      {newDonors.filtered.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {r.fy1Amount == null ? <span className="text-slate-300">—</span> : moneyCr(r.fy1Amount)}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {r.fy1Type ? `${r.fy1Type}${r.fy1Month ? ` (${r.fy1Month})` : ""}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {newDonors.filtered.length === 0 && <EmptyRow span={9} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>

              <BucketSection title="Past Donors" donorCount={past.filtered.length} totalAmount={past.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-semibold">#</th>
                        <SortTh label="Donor" field="account" table={past} />
                        <th className="px-4 py-2 font-semibold">Prior FY Giving</th>
                        <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={past} align="right" />
                        <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={past} />
                        <FilterTh label="Platform" field="platform" table={past} />
                        <FilterTh label="KAM" field="kam" table={past} />
                        <FilterTh label="SPOC" field="spoc" table={past} />
                      </tr>
                    </thead>
                    <tbody>
                      {past.filtered.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                          <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{r.priorSummary}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                        </tr>
                      ))}
                      {past.filtered.length === 0 && <EmptyRow span={8} />}
                    </tbody>
                  </table>
                </div>
              </BucketSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}