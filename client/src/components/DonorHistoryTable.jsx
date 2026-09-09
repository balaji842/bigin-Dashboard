import { useMemo, useState } from "react";
import { moneyCr } from "../lib/format.js";

function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconFilter(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
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
// distinct type across their deals, which prints as a comma list instead
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

const PAGE_SIZE = 10;

export default function DonorHistoryTable({ donors, onSelectDonor }) {
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [donorTypeFilter, setDonorTypeFilter] = useState(null); // null = all
  const [page, setPage] = useState(0);

  const donorTypeOptions = useMemo(() => {
    const set = new Set();
    donors.forEach((d) => {
      if (d.donorType && d.donorType !== "—") {
        d.donorType.split(",").forEach((t) => set.add(t.trim()));
      }
    });
    return [...set].sort();
  }, [donors]);

  const filtered = useMemo(() => {
    let out = donors;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((d) => d.account.toLowerCase().includes(q));
    }
    if (donorTypeFilter) {
      out = out.filter((d) => d.donorType.includes(donorTypeFilter));
    }
    return out;
  }, [donors, search, donorTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const updateSearch = (v) => {
    setSearch(v);
    setPage(0);
  };

  const toggleDonorType = (type) => {
    setDonorTypeFilter((prev) => (prev === type ? null : type));
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-4">
        <div>
          <p className="font-display font-bold text-navy-900 text-lg">Donor History</p>
          <p className="text-sm text-slate-400">List of donors and their contribution details</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search by donor name..."
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-400/60 focus:border-pink-400 w-56"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border transition-colors ${
                donorTypeFilter
                  ? "border-pink-300 text-pink-600 bg-pink-50/60"
                  : "border-slate-200 text-navy-700 hover:border-slate-300"
              }`}
            >
              <IconFilter className="w-4 h-4" />
              Filter
            </button>
            {filterOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-100 shadow-lg p-3 z-10">
                <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">
                  Donor Type
                </p>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setDonorTypeFilter(null);
                      setFilterOpen(false);
                      setPage(0);
                    }}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg ${
                      !donorTypeFilter ? "bg-pink-50 text-pink-600 font-medium" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    All types
                  </button>
                  {donorTypeOptions.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        toggleDonorType(type);
                        setFilterOpen(false);
                      }}
                      className={`text-left text-sm px-2 py-1.5 rounded-lg ${
                        donorTypeFilter === type ? "bg-pink-50 text-pink-600 font-medium" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-navy-900 text-white text-left text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-semibold">S.No</th>
              <th className="px-5 py-3 font-semibold">Donor Name</th>
              <th className="px-5 py-3 font-semibold text-right">Total Amount</th>
              <th className="px-5 py-3 font-semibold">Donor Type</th>
              <th className="px-5 py-3 font-semibold">KAM</th>
              <th className="px-5 py-3 font-semibold">SPOC</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((d, i) => (
              <tr key={d.account} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-5 py-3 text-slate-400">{safePage * PAGE_SIZE + i + 1}</td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectDonor(d)}
                    className="font-medium text-navy-900 hover:text-pink-600 hover:underline text-left"
                  >
                    {d.account}
                  </button>
                </td>
                <td className="px-5 py-3 text-right font-bold text-navy-900 whitespace-nowrap">
                  {moneyCr(d.totalAmount)}
                </td>
                <td className="px-5 py-3">
                  <DonorTypeBadge donorType={d.donorType} />
                </td>
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{d.kam}</td>
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{d.spoc}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">
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
}