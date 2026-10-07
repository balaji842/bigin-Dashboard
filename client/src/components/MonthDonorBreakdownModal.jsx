import { useMemo, useState } from "react";
import { moneyCr, moneyAutoScale } from "../lib/format.js";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";
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

// A / B / C donor category — calculated from the donor's FY 2025-2026
// total (A above ₹1 Cr, B ₹50 L to ₹1 Cr, C below ₹50 L). "—" when the
// donor gave nothing in that year, so has no category.
const CATEGORY_STYLES = {
  A: "bg-emerald-50 text-emerald-700",
  B: "bg-sky-50 text-sky-700",
  C: "bg-slate-100 text-slate-600",
};
function CategoryBadge({ value }) {
  if (!value || value === "—") return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${CATEGORY_STYLES[value] || "bg-slate-100 text-slate-600"}`}>
      {value}
    </span>
  );
}

// "FY 2026-2027 Month" cell of the Engaged Donors table (only shown when
// the popup was opened from the Difference cell). Always pill-shaped.
// Hovering it opens a small popup with the amount for each of those
// months — they add up to that donor's FY 2026-2027 Amount. The popup is
// `fixed` and placed from the pill's screen position so the table's
// scroll area can't clip it; it opens below, or above when the pill is
// near the bottom of the screen.
function MonthPill({ month, split }) {
  const [tip, setTip] = useState(null);
  if (!month) return <span className="text-slate-300">—</span>;

  const hasSplit = split && split.length > 0;
  const total = hasSplit ? split.reduce((s, x) => s + x.amount, 0) : 0;

  const show = (e) => {
    if (!hasSplit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const estHeight = 64 + split.length * 24;
    const fitsBelow = rect.bottom + estHeight + 12 < window.innerHeight;
    setTip({
      left: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130),
      top: fitsBelow ? rect.bottom + 6 : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + 6,
    });
  };

  return (
    <span className="inline-block" onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-50 text-amber-700 ${
          hasSplit ? "cursor-help" : ""
        }`}
      >
        {month}
      </span>
      {tip && (
        <span
          className="fixed z-[60] w-60 bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-left normal-case font-normal text-slate-600 pointer-events-none block"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom, transform: "translateX(-50%)" }}
        >
          <span className="block text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
            Amount by month
          </span>
          {split.map((s) => (
            <span key={s.month} className="flex items-center justify-between gap-3 text-xs py-0.5">
              <span className="text-slate-600">{s.month}</span>
              <span className="font-semibold text-navy-900 whitespace-nowrap">{moneyAutoScale(s.amount)}</span>
            </span>
          ))}
          <span className="flex items-center justify-between gap-3 text-xs font-bold text-navy-900 border-t border-slate-100 mt-1.5 pt-1.5">
            <span>Total</span>
            <span className="whitespace-nowrap">{moneyAutoScale(total)}</span>
          </span>
        </span>
      )}
    </span>
  );
}

// `action` (optional) is rendered in the header bar next to the counts —
// used for each table's Export button. `hideSummary` drops the
// "Donor Unique Count · Total Amount" text from the header (the Engaged
// Donors table doesn't show it).
function BucketSection({ title, donorCount, totalAmount, action, hideSummary = false, children }) {
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 py-2.5 flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
        <p className="font-display font-semibold text-sm">{title}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {!hideSummary && (
            <p className="text-xs text-white/70">
              Donor Unique Count: <span className="text-white font-semibold">{donorCount}</span>
              <span className="mx-2">·</span>
              Total Amount: <span className="text-white font-semibold">{moneyCr(totalAmount)}</span>
            </p>
          )}
          {action}
        </div>
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

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// `view` decides which tables are shown:
//   "matching"   -> only the Engaged Donors table (opened from the
//                   Engaged Donors count), without the FY 2026-2027 Month
//                   column
//   "missing"    -> only the Not Engaged Donors table
//   "difference" -> every table (opened from the Difference cell), and the
//                   Engaged Donors table also shows the FY 2026-2027 Month
//                   column with its hover split
export default function MonthDonorBreakdownModal({
  open,
  onClose,
  monthName,
  fy1,
  fy2,
  loading,
  error,
  data,
  view = "difference",
}) {
  // A donor with no category (nothing given in FY 2025-2026) is shown as
  // "—", which also makes "—" a pickable option in each Category filter.
  const withCategory = (rows) => (rows || []).map((r) => (r.category ? r : { ...r, category: "—" }));
  const matchingRows = useMemo(() => withCategory(data?.matching?.rows), [data]);
  const missingRows = useMemo(() => withCategory(data?.missing?.rows), [data]);
  const returningRows = useMemo(() => withCategory(data?.returning?.rows), [data]);
  const newRows = useMemo(() => withCategory(data?.newDonors?.rows), [data]);
  const pastRows = useMemo(() => withCategory(data?.past?.rows), [data]);

  const engaged = useBucketTable(
    matchingRows,
    ["fy1Type", "fy2Type", "kam", "spoc", "category"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
      { key: "fy2Amount", type: "number" },
    ]
  );
  const notEngaged = useBucketTable(
    missingRows,
    ["fy1Type", "kam", "spoc", "category"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
    ]
  );
  // "Returning" — gave this month in fy2, AND gave in fy1 at some OTHER
  // month (shifted timing, not a new donor).
  const returning = useBucketTable(
    returningRows,
    ["fy1Type", "fy2Type", "platform", "kam", "spoc", "category"],
    [
      { key: "account", type: "string" },
      { key: "fy1Amount", type: "number" },
      { key: "fy2Amount", type: "number" },
    ]
  );
  // "New" — gave this month in fy2, with NO giving history anywhere
  // (not fy1, not any earlier year). Genuinely first-time donors.
  const newDonors = useBucketTable(
    newRows,
    ["fy2Type", "platform", "kam", "spoc", "category"],
    [
      { key: "account", type: "string" },
      { key: "fy2Amount", type: "number" },
    ]
  );
  const past = useBucketTable(
    pastRows,
    ["fy2Type", "platform", "kam", "spoc", "category"],
    [
      { key: "account", type: "string" },
      { key: "fy2Amount", type: "number" },
    ]
  );

  if (!open) return null;

  const showEngaged = view === "matching" || view === "difference";
  const showNotEngaged = view === "missing" || view === "difference";
  const showOthers = view === "difference";
  const showMonthCol = view === "difference";

  const titleText =
    view === "matching"
      ? `${monthName} — FY ${fy1} vs FY ${fy2} engaged donors`
      : view === "missing"
      ? `${monthName} — FY ${fy1} vs FY ${fy2} not engaged donors`
      : `${monthName} — FY ${fy1} vs FY ${fy2} donor breakdown`;

  // Each export contains exactly the rows currently shown in that table
  // (after its filters/sort) and the columns it displays. Amounts are
  // plain rupee numbers so Excel can add them up. Opens in Excel as CSV,
  // same as every other export on the dashboard.
  const catText = (c) => (c && c !== "—" ? c : "");
  const file = (what) => `${slug(monthName)}-${what}-${fy1}-vs-${fy2}.csv`;

  const exportEngaged = () =>
    downloadCsv(
      file("engaged-donors"),
      [
        "S.No",
        "Donor",
        `FY ${fy1} Amount`,
        `FY ${fy1} Type`,
        `FY ${fy2} Amount`,
        `FY ${fy2} Type`,
        ...(showMonthCol ? [`FY ${fy2} Month`] : []),
        "Difference (%)",
        "Difference (₹)",
        "KAM",
        "SPOC",
        "Category",
      ],
      engaged.filtered.map((r, i) => [
        i + 1,
        r.account,
        r.fy1Amount ?? "",
        r.fy1Type || "",
        r.fy2Amount ?? "",
        r.fy2Type || "",
        ...(showMonthCol ? [r.fy2Month || ""] : []),
        r.diffPct == null ? "" : r.diffPct.toFixed(2),
        r.diffAmount ?? "",
        r.kam || "",
        r.spoc || "",
        catText(r.category),
      ])
    );

  const exportNotEngaged = () =>
    downloadCsv(
      file("not-engaged-donors"),
      ["S.No", "Donor", `FY ${fy1} Amount`, `FY ${fy1} Type`, "KAM", "SPOC", "Category"],
      notEngaged.filtered.map((r, i) => [i + 1, r.account, r.fy1Amount ?? "", r.fy1Type || "", r.kam || "", r.spoc || "", catText(r.category)])
    );

  const exportReturning = () =>
    downloadCsv(
      file("returning-donors"),
      [
        "S.No",
        "Donor",
        `FY ${fy1} Amount`,
        `FY ${fy1} Type`,
        `FY ${fy1} Month`,
        `FY ${fy2} Amount`,
        `FY ${fy2} Type`,
        "Platform",
        "KAM",
        "SPOC",
        "Category",
      ],
      returning.filtered.map((r, i) => [
        i + 1,
        r.account,
        r.fy1Amount ?? "",
        r.fy1Type || "",
        r.fy1Month || "",
        r.fy2Amount ?? "",
        r.fy2Type || "",
        r.platform || "",
        r.kam || "",
        r.spoc || "",
        catText(r.category),
      ])
    );

  const exportNew = () =>
    downloadCsv(
      file("new-donors"),
      ["S.No", "Donor", `FY ${fy2} Amount`, `FY ${fy2} Type`, "Platform", "KAM", "SPOC", "Category"],
      newDonors.filtered.map((r, i) => [
        i + 1,
        r.account,
        r.fy2Amount ?? "",
        r.fy2Type || "",
        r.platform || "",
        r.kam || "",
        r.spoc || "",
        catText(r.category),
      ])
    );

  const exportPast = () =>
    downloadCsv(
      file("past-donors"),
      ["S.No", "Donor", "Prior FY Giving", `FY ${fy2} Amount`, `FY ${fy2} Type`, "Platform", "KAM", "SPOC", "Category"],
      past.filtered.map((r, i) => [
        i + 1,
        r.account,
        r.priorSummary || "",
        r.fy2Amount ?? "",
        r.fy2Type || "",
        r.platform || "",
        r.kam || "",
        r.spoc || "",
        catText(r.category),
      ])
    );

  const exportBtn = (onClick, rows) => (
    <ExportButton variant="dark" onClick={onClick} disabled={rows.length === 0} />
  );

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
          <p className="font-display font-semibold text-sm">{titleText}</p>
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
              {showEngaged && (
                <BucketSection
                  title="Engaged Donors"
                  hideSummary
                  donorCount={engaged.filtered.length}
                  totalAmount={engaged.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}
                  action={exportBtn(exportEngaged, engaged.filtered)}
                >
                  <div className="overflow-x-auto bg-white">
                    <table className={`w-full text-sm ${showMonthCol ? "min-w-[1000px]" : "min-w-[900px]"}`}>
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="px-4 py-2 font-semibold">S.No</th>
                          <SortTh label="Donor" field="account" table={engaged} />
                          <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={engaged} align="right" />
                          <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={engaged} />
                          <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={engaged} align="right" />
                          <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={engaged} />
                          {showMonthCol && <th className="px-4 py-2 font-semibold">FY {fy2} Month</th>}
                          <th className="px-4 py-2 font-semibold text-right">Difference</th>
                          <FilterTh label="KAM" field="kam" table={engaged} />
                          <FilterTh label="SPOC" field="spoc" table={engaged} />
                          <FilterTh label="Category" field="category" table={engaged} />
                        </tr>
                      </thead>
                      <tbody>
                        {engaged.filtered.map((r, i) => (
                          <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                            <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.fy1Type}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                            {showMonthCol && (
                              <td className="px-4 py-2 whitespace-nowrap">
                                <MonthPill month={r.fy2Month} split={r.fy2MonthSplit} />
                              </td>
                            )}
                            <td className="px-4 py-2 text-right"><DiffBadge pct={r.diffPct} amount={r.diffAmount} /></td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                            <td className="px-4 py-2 whitespace-nowrap"><CategoryBadge value={r.category} /></td>
                          </tr>
                        ))}
                        {engaged.filtered.length === 0 && <EmptyRow span={showMonthCol ? 11 : 10} />}
                      </tbody>
                    </table>
                  </div>
                </BucketSection>
              )}

              {showNotEngaged && (
                <BucketSection
                  title="Not Engaged Donors"
                  donorCount={notEngaged.filtered.length}
                  totalAmount={notEngaged.filtered.reduce((s, r) => s + (r.fy1Amount || 0), 0)}
                  action={exportBtn(exportNotEngaged, notEngaged.filtered)}
                >
                  <div className="overflow-x-auto bg-white">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="px-4 py-2 font-semibold">S.No</th>
                          <SortTh label="Donor" field="account" table={notEngaged} />
                          <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={notEngaged} align="right" />
                          <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={notEngaged} />
                          <FilterTh label="KAM" field="kam" table={notEngaged} />
                          <FilterTh label="SPOC" field="spoc" table={notEngaged} />
                          <FilterTh label="Category" field="category" table={notEngaged} />
                        </tr>
                      </thead>
                      <tbody>
                        {notEngaged.filtered.map((r, i) => (
                          <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                            <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.fy1Type}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                            <td className="px-4 py-2 whitespace-nowrap"><CategoryBadge value={r.category} /></td>
                          </tr>
                        ))}
                        {notEngaged.filtered.length === 0 && <EmptyRow span={7} />}
                      </tbody>
                    </table>
                  </div>
                </BucketSection>
              )}

              {showOthers && (
                <>
                  <BucketSection
                    title="Returning Donors (Different Month)"
                    donorCount={returning.filtered.length}
                    totalAmount={returning.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}
                    action={exportBtn(exportReturning, returning.filtered)}
                  >
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-sm min-w-[880px]">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                            <th className="px-4 py-2 font-semibold">S.No</th>
                            <SortTh label="Donor" field="account" table={returning} />
                            <SortTh label={`FY ${fy1} Amount`} field="fy1Amount" table={returning} align="right" />
                            <FilterTh label={`FY ${fy1} Type`} field="fy1Type" table={returning} />
                            <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={returning} align="right" />
                            <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={returning} />
                            <FilterTh label="Platform" field="platform" table={returning} />
                            <FilterTh label="KAM" field="kam" table={returning} />
                            <FilterTh label="SPOC" field="spoc" table={returning} />
                            <FilterTh label="Category" field="category" table={returning} />
                          </tr>
                        </thead>
                        <tbody>
                          {returning.filtered.map((r, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                              <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy1Amount)}</td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                {r.fy1Type}{r.fy1Month ? ` (${r.fy1Month})` : ""}
                              </td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                              <td className="px-4 py-2 whitespace-nowrap"><CategoryBadge value={r.category} /></td>
                            </tr>
                          ))}
                          {returning.filtered.length === 0 && <EmptyRow span={10} />}
                        </tbody>
                      </table>
                    </div>
                  </BucketSection>

                  <BucketSection
                    title="New Donors"
                    donorCount={newDonors.filtered.length}
                    totalAmount={newDonors.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}
                    action={exportBtn(exportNew, newDonors.filtered)}
                  >
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                            <th className="px-4 py-2 font-semibold">S.No</th>
                            <SortTh label="Donor" field="account" table={newDonors} />
                            <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={newDonors} align="right" />
                            <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={newDonors} />
                            <FilterTh label="Platform" field="platform" table={newDonors} />
                            <FilterTh label="KAM" field="kam" table={newDonors} />
                            <FilterTh label="SPOC" field="spoc" table={newDonors} />
                            <FilterTh label="Category" field="category" table={newDonors} />
                          </tr>
                        </thead>
                        <tbody>
                          {newDonors.filtered.map((r, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                              <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.account}</td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">{moneyCr(r.fy2Amount)}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.fy2Type}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.platform}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.kam}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{r.spoc}</td>
                              <td className="px-4 py-2 whitespace-nowrap"><CategoryBadge value={r.category} /></td>
                            </tr>
                          ))}
                          {newDonors.filtered.length === 0 && <EmptyRow span={8} />}
                        </tbody>
                      </table>
                    </div>
                  </BucketSection>

                  <BucketSection
                    title="Past Donors"
                    donorCount={past.filtered.length}
                    totalAmount={past.filtered.reduce((s, r) => s + (r.fy2Amount || 0), 0)}
                    action={exportBtn(exportPast, past.filtered)}
                  >
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-sm min-w-[820px]">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                            <th className="px-4 py-2 font-semibold">S.No</th>
                            <SortTh label="Donor" field="account" table={past} />
                            <th className="px-4 py-2 font-semibold">Prior FY Giving</th>
                            <SortTh label={`FY ${fy2} Amount`} field="fy2Amount" table={past} align="right" />
                            <FilterTh label={`FY ${fy2} Type`} field="fy2Type" table={past} />
                            <FilterTh label="Platform" field="platform" table={past} />
                            <FilterTh label="KAM" field="kam" table={past} />
                            <FilterTh label="SPOC" field="spoc" table={past} />
                            <FilterTh label="Category" field="category" table={past} />
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
                              <td className="px-4 py-2 whitespace-nowrap"><CategoryBadge value={r.category} /></td>
                            </tr>
                          ))}
                          {past.filtered.length === 0 && <EmptyRow span={9} />}
                        </tbody>
                      </table>
                    </div>
                  </BucketSection>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}