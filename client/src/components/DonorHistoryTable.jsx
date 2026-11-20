import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { moneyForDonorType } from "../lib/format.js";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";
import HeaderFilterMenu, { makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import { facetOptions } from "../lib/facetOptions.js";
import ColumnSortMenu from "./ColumnSortMenu.jsx";

function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconFunnel(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
    </svg>
  );
}

// Header with a one-click "Is not empty" filter (like Bigin's): on, only the
// rows that have a value in this column stay; off, every row is back.
function NotEmptyHeader({ label, active, onClick, onTitle, offTitle }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={offTitle}
        title={active ? onTitle : offTitle}
        className={`p-0.5 rounded transition-colors ${active ? "text-pink-400" : "text-white/70 hover:text-white"}`}
      >
        <IconFunnel className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// A / B / C — from the Total Amount shown on the row (A above ₹1 Cr, B ₹50 L to
// ₹1 Cr, C below ₹50 L); "—" when the donor has nothing closed in the current scope.
const CATEGORY_STYLES = {
  A: "bg-emerald-50 text-emerald-700",
  B: "bg-sky-50 text-sky-700",
  C: "bg-slate-100 text-slate-600",
};
function CategoryBadge({ value }) {
  if (!value) return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${CATEGORY_STYLES[value] || "bg-slate-100 text-slate-600"}`}>
      {value}
    </span>
  );
}

function IconChevronLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// Colour themes for the Donor Type pill — falls back to a neutral slate
// pill for any type not in this list (or when a donor has more than one
// distinct type across their donors, which prints as a comma list instead
// of a single pill).
const DONOR_TYPE_THEME = {
  Corporate: "bg-blue-50 text-blue-700",
  Individual: "bg-emerald-50 text-emerald-700",
  NPO: "bg-purple-50 text-purple-700",
};

function DonorTypeBadge({ donorType }) {
  if (!donorType || donorType === "—") {
    return <span className="text-slate-300">—</span>;
  }
  const isSingle = !donorType.includes(",");
  if (!isSingle) {
    return <span className="text-slate-600 text-xs">{donorType}</span>;
  }
  const theme = DONOR_TYPE_THEME[donorType] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${theme}`}>
      {donorType}
    </span>
  );
}

// ---------------------------------------------------------------- remarks
// Remarks are the donor's Bigin Notes (newest first), each
// { title, content, createdTime, author }, attached to the donor row as
// `remarks` by the Overview page.

// One note as plain text: "Title — content" (either part may be empty).
const noteText = (n) =>
  [n.title, n.content]
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ");

function formatNoteDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// For search: every note's text joined together.
const remarksSearchText = (d) => (d.remarks || []).map(noteText).join(" ");

// For Excel: every note, newest first — "[12 Oct 2026] Title — content | [..] .."
const remarksForExport = (d) =>
  (d.remarks || [])
    .map((n) => {
      const date = formatNoteDate(n.createdTime);
      return `${date ? `[${date}] ` : ""}${noteText(n)}`;
    })
    .join(" | ");

const POPUP_NOTES = 5; // how many notes the hover popup lists
const POPUP_NOTE_CHARS = 220; // long notes are cut off in the popup

// Remarks cell: the latest note on one line (cut off with "…" when it
// doesn't fit), plus a small "+N" when there are older notes. Hovering
// opens a popup with the notes, newest first. The popup is `fixed`, so
// the table's horizontal scroll can't clip it.
function RemarksCell({ notes }) {
  const [tip, setTip] = useState(null);
  if (!notes || notes.length === 0) return <span className="text-slate-300">—</span>;

  const latest = noteText(notes[0]) || "(empty note)";
  const shown = notes.slice(0, POPUP_NOTES);
  const hidden = notes.length - shown.length;

  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const estHeight = 56 + shown.length * 78;
    const fitsBelow = rect.bottom + estHeight + 12 < window.innerHeight;
    setTip({
      left: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170),
      top: fitsBelow ? rect.bottom + 6 : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + 6,
    });
  };

  return (
    <span className="flex items-center gap-2 max-w-[260px]" onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      <span className="truncate cursor-help text-slate-700">{latest}</span>
      {notes.length > 1 && (
        <span className="shrink-0 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
          +{notes.length - 1}
        </span>
      )}
      {tip && (
        <span
          className="fixed z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-left pointer-events-none block"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom, transform: "translateX(-50%)" }}
        >
          <span className="block text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
            Remarks · {notes.length} {notes.length === 1 ? "note" : "notes"}
          </span>
          {shown.map((n, i) => {
            const body = (n.content || "").replace(/\s+/g, " ").trim();
            return (
              <span key={i} className={`block text-xs ${i > 0 ? "border-t border-slate-100 mt-2 pt-2" : ""}`}>
                <span className="block text-[10px] text-slate-400 mb-0.5">
                  {[formatNoteDate(n.createdTime), n.author].filter(Boolean).join(" · ")}
                </span>
                {n.title && <span className="block font-semibold text-navy-900">{n.title}</span>}
                {body && (
                  <span className="block text-slate-600 break-words">
                    {body.length > POPUP_NOTE_CHARS ? `${body.slice(0, POPUP_NOTE_CHARS)}…` : body}
                  </span>
                )}
              </span>
            );
          })}
          {hidden > 0 && (
            <span className="block text-[11px] text-slate-400 border-t border-slate-100 mt-2 pt-2">
              and {hidden} earlier {hidden === 1 ? "note" : "notes"}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// The Donor Type, KAM, SPOC and Platform cells hold ALL of a donor's values
// joined with ", " ("P2, P3", "Mubithaa, Anoj"). Their filters list those cell
// values exactly as the table shows them — a donor with "P2, P3" is its own entry,
// next to "P2" and "P3" — and tick one to see the donors whose cell is exactly that.
// "—" (no value) isn't offered.
const cellOptions = (rows, field) =>
  [...new Set(rows.map((r) => r[field]).filter((v) => v && v !== "—"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const cellMatches = (value, selected) => selected == null || selected.includes(value);

// What the search box looks at for one donor row.
const searchHay = (d) =>
  `${d.account} ${d.donorType || ""} ${d.kam || ""} ${d.spoc || ""} ${d.donor || ""} ${d.platform || ""} ${remarksSearchText(d)}`.toLowerCase();

const POPUP_DONORS = 15; // how many names the Donor popup lists

// Donor cell: all the donors on one line, cut off with "…" when they don't fit.
// Hovering opens a popup with every donor on its own line (only when there is
// more to see — several donors, or one name that got cut off). The popup is
// `fixed`, so the table's horizontal scroll can't clip it.
function DonorsCell({ names }) {
  const [tip, setTip] = useState(null);
  if (!names || names.length === 0) return <span className="text-slate-300">—</span>;

  const shown = names.slice(0, POPUP_DONORS);
  const hidden = names.length - shown.length;

  const show = (e) => {
    const line = e.currentTarget.firstChild;
    const cutOff = line && line.scrollWidth > line.clientWidth;
    if (names.length < 2 && !cutOff) return; // nothing more to show
    const rect = e.currentTarget.getBoundingClientRect();
    const estHeight = 52 + shown.length * 26;
    const fitsBelow = rect.bottom + estHeight + 12 < window.innerHeight;
    setTip({
      left: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170),
      top: fitsBelow ? rect.bottom + 6 : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + 6,
    });
  };

  return (
    <span className="flex items-center max-w-[260px]" onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      <span className="truncate cursor-help text-slate-600">{names.join(", ")}</span>
      {tip && (
        <span
          className="fixed z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-left pointer-events-none block"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom, transform: "translateX(-50%)" }}
        >
          <span className="block text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
            Donors · {names.length}
          </span>
          {shown.map((n, i) => (
            <span key={n} className={`block text-xs text-slate-700 break-words py-1 ${i > 0 ? "border-t border-slate-100" : ""}`}>
              {n}
            </span>
          ))}
          {hidden > 0 && (
            <span className="block text-[11px] text-slate-400 border-t border-slate-100 mt-1 pt-1.5">
              and {hidden} more
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// Frozen columns: the number column and the Donor Name stay in place while
// every other column scrolls sideways underneath them.
const SNO_W = 64;
const DONOR_W = 240;

const PAGE_SIZE = 10;

const EMPTY_FILTERS = { donorType: null, kam: null, spoc: null, platform: null, category: null };

// forwardRef so the parent page's "Clear all filters" bar can reach in
// and reset this table's own search/column-filters/sort — those are
// otherwise entirely private to this component, which is exactly why
// that bar didn't previously notice or clear them. onFiltersActiveChange
// reports outward whenever they change, so the parent's bar can light
// up even though the filtering itself still happens in here.
// `remarksNote` / `callsNote` (optional) are short messages shown under the
// title when the Remarks / Calls couldn't be loaded from Bigin.
// `onSelectCalls(donor)` opens the popup with that donor's calls (each
// donor row carries its `calls`, newest first).
const DonorHistoryTable = forwardRef(function DonorHistoryTable({ donors, onSelectDonor, onSelectCalls, onFiltersActiveChange, remarksNote, callsNote, scopeLabel }, ref) {
  const [search, setSearch] = useState("");
  // Multi-select per column — null means "everything" for that column.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortColumn, setSortColumn] = useState(null); // "account" | "totalAmount" | null
  const [sortDir, setSortDir] = useState(null); // "asc" | "desc" | null
  // Donor column: true = only donors whose Bigin "Donor" field is filled in.
  const [donorOnly, setDonorOnly] = useState(false);
  const [page, setPage] = useState(0);

  const hasActiveFilters =
    search.trim() !== "" || Object.values(filters).some((v) => v != null) || sortColumn != null || donorOnly;

  useEffect(() => {
    onFiltersActiveChange?.(hasActiveFilters);
  }, [hasActiveFilters, onFiltersActiveChange]);

  useImperativeHandle(ref, () => ({
    clearFilters: () => {
      setSearch("");
      setFilters(EMPTY_FILTERS);
      setDonorOnly(false);
      setSortColumn(null);
      setSortDir(null);
      setPage(0);
    },
  }));

  // Each column's list holds only the values in the rows the table can show:
  // the rows left by the search box, the Donor "not empty" switch and the OTHER
  // columns' filters (see lib/facetOptions.js).
  const facets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keep = (d) => (!q || searchHay(d).includes(q)) && (!donorOnly || (d.donor && d.donor !== "—"));
    return facetOptions({
      rows: donors,
      fieldOf: { donorType: "donorType", kam: "kam", spoc: "spoc", platform: "platform", category: "category" },
      filters,
      matches: cellMatches,
      optionsFor: cellOptions,
      keep,
    });
  }, [donors, filters, search, donorOnly]);
  const { donorType: donorTypeOptions, kam: kamOptions, spoc: spocOptions, platform: platformOptions, category: categoryOptions } = facets;
  const optionsByField = { donorType: donorTypeOptions, kam: kamOptions, spoc: spocOptions, platform: platformOptions, category: categoryOptions };
  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setFilters, setPage, optionsByField);

  const setSortFor = (column) => (dir) => {
    setSortColumn(dir == null ? null : column);
    setSortDir(dir);
    setPage(0);
  };

  const filtered = useMemo(() => {
    let out = donors;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Search the donor's name AND the columns actually shown next to
      // it (Donor Type, KAM, SPOC, Platform, Remarks) — not just the
      // name — so typing a Donor Type like "corporate" finds every donor
      // with that badge, and typing a word from a note finds the donors
      // whose Remarks mention it.
      out = out.filter((d) => searchHay(d).includes(q));
    }
    out = out.filter(
      (d) =>
        cellMatches(d.donorType, filters.donorType) &&
        cellMatches(d.kam, filters.kam) &&
        cellMatches(d.spoc, filters.spoc) &&
        cellMatches(d.platform, filters.platform) &&
        cellMatches(d.category, filters.category)
    );
    // "Is not empty" on the Donor column: drop donors with no Donor value ("—").
    if (donorOnly) out = out.filter((d) => d.donor && d.donor !== "—");
    if (sortColumn && sortDir) {
      out = [...out].sort((a, b) => {
        if (sortColumn === "totalAmount") {
          return sortDir === "asc" ? (a.totalAmount || 0) - (b.totalAmount || 0) : (b.totalAmount || 0) - (a.totalAmount || 0);
        }
        // "account" — plain alphabetical.
        return sortDir === "asc" ? a.account.localeCompare(b.account) : b.account.localeCompare(a.account);
      });
    }
    return out;
  }, [donors, search, filters, sortColumn, sortDir, donorOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const updateSearch = (v) => {
    setSearch(v);
    setPage(0);
  };

  // Windowed page numbers, e.g. for page 6 of 20: 4 5 [6] 7 8
  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    let start = Math.max(0, safePage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize);
    start = Math.max(0, end - windowSize);
    return Array.from({ length: end - start }, (_, i) => start + i);
  }, [safePage, totalPages]);

  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const handleExport = () => {
    downloadCsv(
      "donor-history.csv",
      ["S.No", "Donor Name", "Total Amount", "Category", "Donor Type", "Platform", "KAM", "SPOC", "Donor", "Remarks", "Calls"],
      filtered.map((d, i) => [i + 1, d.account, d.totalAmount, d.category || "", d.donorType, d.platform, d.kam, d.spoc, d.donor === "—" ? "" : d.donor, remarksForExport(d), (d.calls || []).length])
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-4">
        <div>
          <p className="font-display font-bold text-navy-900 text-lg">Donor History</p>
          <p className="text-sm text-slate-400">
            List of donors and their contribution details{scopeLabel ? ` · ${scopeLabel}` : ""}
          </p>
          {remarksNote && <p className="text-xs text-amber-600 mt-1">{remarksNote}</p>}
          {callsNote && <p className="text-xs text-amber-600 mt-1">{callsNote}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ExportButton onClick={handleExport} disabled={filtered.length === 0} />
          <div className="relative">
            <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search name, donor type, KAM, SPOC, donor or remarks..."
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-400/60 focus:border-pink-400 w-56"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1380px]">
          <thead>
            <tr className="bg-navy-900 text-white text-left text-xs uppercase tracking-wide">
              <th
                style={{ position: "sticky", left: 0, width: SNO_W, minWidth: SNO_W, maxWidth: SNO_W }}
                className="px-5 py-3 font-semibold bg-navy-900 z-20"
              >
                S.No
              </th>
              <th
                style={{
                  position: "sticky",
                  left: SNO_W,
                  width: DONOR_W,
                  minWidth: DONOR_W,
                  maxWidth: DONOR_W,
                  boxShadow: "inset -1px 0 0 rgba(255,255,255,0.15)",
                }}
                className="px-5 py-3 font-semibold bg-navy-900 z-20"
              >
                <ColumnSortMenu label="Donor Name" sortDir={sortColumn === "account" ? sortDir : null} onSort={setSortFor("account")} />
              </th>
              <th className="px-5 py-3 font-semibold text-right">
                <ColumnSortMenu
                  label="Total Amount"
                  sortDir={sortColumn === "totalAmount" ? sortDir : null}
                  onSort={setSortFor("totalAmount")}
                />
              </th>
              <th className="px-5 py-3 font-semibold">
                <span title="A: above ₹1 Cr · B: ₹50 L to ₹1 Cr · C: below ₹50 L — from the Total Amount shown">
                  <HeaderFilterMenu
                    label="Category"
                    options={categoryOptions}
                    selected={filters.category}
                    onToggle={toggleOption("category")}
                    onSelectAll={selectAll("category")}
                    onClearAll={clearAll("category")}
                  />
                </span>
              </th>
              <th className="px-5 py-3 font-semibold">
                <HeaderFilterMenu
                  label="Donor Type"
                  options={donorTypeOptions}
                  selected={filters.donorType}
                  onToggle={toggleOption("donorType")}
                  onSelectAll={selectAll("donorType")}
                  onClearAll={clearAll("donorType")}
                />
              </th>
              <th className="px-5 py-3 font-semibold">
                <HeaderFilterMenu
                  label="Platform"
                  options={platformOptions}
                  selected={filters.platform}
                  onToggle={toggleOption("platform")}
                  onSelectAll={selectAll("platform")}
                  onClearAll={clearAll("platform")}
                />
              </th>
              <th className="px-5 py-3 font-semibold">
                <HeaderFilterMenu
                  label="KAM"
                  options={kamOptions}
                  selected={filters.kam}
                  onToggle={toggleOption("kam")}
                  onSelectAll={selectAll("kam")}
                  onClearAll={clearAll("kam")}
                />
              </th>
              <th className="px-5 py-3 font-semibold">
                <HeaderFilterMenu
                  label="SPOC"
                  options={spocOptions}
                  selected={filters.spoc}
                  onToggle={toggleOption("spoc")}
                  onSelectAll={selectAll("spoc")}
                  onClearAll={clearAll("spoc")}
                />
              </th>
              <th className="px-5 py-3 font-semibold">
                <NotEmptyHeader
                  label="Donor"
                  active={donorOnly}
                  onClick={() => {
                    setDonorOnly((v) => !v);
                    setPage(0);
                  }}
                  onTitle="Showing only donors with a Donor value — click to show everyone"
                  offTitle="Show only donors with a Donor value (hide blanks)"
                />
              </th>
              <th className="px-5 py-3 font-semibold">Remarks</th>
              <th className="px-5 py-3 font-semibold text-center">Calls</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((d, i) => (
              <tr key={d.account} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td
                  style={{ position: "sticky", left: 0, width: SNO_W, minWidth: SNO_W, maxWidth: SNO_W }}
                  className={`px-5 py-3 text-slate-400 z-10 ${i % 2 === 1 ? "bg-slate-50" : "bg-white"}`}
                >
                  {safePage * PAGE_SIZE + i + 1}
                </td>
                <td
                  style={{
                    position: "sticky",
                    left: SNO_W,
                    width: DONOR_W,
                    minWidth: DONOR_W,
                    maxWidth: DONOR_W,
                    boxShadow: "inset -1px 0 0 #e2e8f0",
                  }}
                  className={`px-5 py-3 break-words z-10 ${i % 2 === 1 ? "bg-slate-50" : "bg-white"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDonor(d)}
                    className="font-medium text-navy-900 hover:text-pink-600 hover:underline text-left"
                  >
                    {d.account}
                  </button>
                </td>
                <td className="px-5 py-3 text-right font-bold text-navy-900 whitespace-nowrap">
                  {moneyForDonorType(d.totalAmount, d.donorType)}
                </td>
                <td className="px-5 py-3">
                  <CategoryBadge value={d.category} />
                </td>
                <td className="px-5 py-3">
                  <DonorTypeBadge donorType={d.donorType} />
                </td>
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{d.platform}</td>
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{d.kam}</td>
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{d.spoc}</td>
                <td className="px-5 py-3">
                  <DonorsCell names={d.donorList || (d.donor && d.donor !== "—" ? [d.donor] : [])} />
                </td>
                <td className="px-5 py-3">
                  <RemarksCell notes={d.remarks} />
                </td>
                <td className="px-5 py-3 text-center whitespace-nowrap">
                  {(d.calls || []).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelectCalls?.(d)}
                      className="font-semibold text-emerald-600 underline hover:text-emerald-700"
                      title="See the calls logged for this donor"
                    >
                      {d.calls.length}
                    </button>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-center text-slate-400 text-sm">
                  No donors match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
        <p className="text-sm text-slate-400">
          Showing {from} to {to} of {filtered.length} records
        </p>
        <div className="flex items-center gap-1.5">
          <button
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:border-slate-300"
            aria-label="Previous page"
          >
            <IconChevronLeft className="w-4 h-4" />
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium border transition-colors ${
                p === safePage
                  ? "bg-navy-900 text-white border-navy-900"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {p + 1}
            </button>
          ))}
          <button
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:border-slate-300"
            aria-label="Next page"
          >
            <IconChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default DonorHistoryTable;