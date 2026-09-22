import { useEffect, useMemo, useState } from "react";
import { moneyCr, fullMoney, moneyForDonorType } from "../lib/format.js";
import { IconBuilding, IconUsers } from "./icons.jsx";
import HeaderFilterMenu, { optionsFor, matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";

function monthNameOf(closingDate) {
  if (!closingDate) return null;
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

const FILTER_FIELDS = ["fiscalYear", "monthLabel", "expectedMonth", "type", "kam", "spoc"];

const TYPE_THEME = {
  Cash: "bg-emerald-50 text-emerald-700",
  Kind: "bg-amber-50 text-amber-700",
  "School Engagement": "bg-indigo-50 text-indigo-700",
};

function TypeBadge({ type }) {
  if (!type || type === "Unspecified") return <span className="text-slate-300">—</span>;
  const theme = TYPE_THEME[type] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${theme}`}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------
// Company & Contact module — pulls the live Bigin Accounts record (and
// any linked Contacts) for the donor, via the generic /api/modules/*
// routes, and renders them the way Bigin itself would (label: value).
//
// Field API names aren't hardcoded: we fetch each module's field
// metadata (/api/modules/<module>/fields) once and match by the
// human-readable label shown in Bigin's UI (e.g. "Donor Type", "SPOC"),
// so this keeps working even if a field's underlying API name differs
// from what's guessed here.
// ---------------------------------------------------------------------

const ACCOUNT_INFO_LABELS = [
  "KAM",
  "Platform",
  "SPOC",
  "Donor Type",
  "Sub_KAM",
  "Category",
];

const CONTACT_INFO_LABELS = [
  "Email",
  "Phone",
  "Secondary Email",
  "Designation",
  "Other Phone",
  "Address",
  "District",
  "Pincode",
  "Lead Source",
];

function normLabel(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickValue(record, apiName) {
  if (!record || !apiName) return null;
  const raw = record[apiName];
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw.name || raw.value || null;
  return String(raw);
}

function buildLabelMap(fieldsMeta) {
  const map = {};
  for (const f of fieldsMeta || []) {
    const label = f.field_label || f.display_label || f.api_name;
    if (!label) continue;
    map[normLabel(label)] = f.api_name;
  }
  return map;
}

function resolveFields(record, labelMap, labels) {
  const out = [];
  for (const label of labels) {
    const apiName = labelMap[normLabel(label)];
    if (!apiName) continue; // this org's Bigin schema doesn't have this field
    out.push({ label, value: pickValue(record, apiName) });
  }
  return out;
}

// Cached at module scope — field schemas don't change per-donor, so
// every modal open after the first reuses the same in-flight/resolved
// promise instead of re-fetching.
let accountFieldsPromise = null;
let contactFieldsPromise = null;

async function loadFieldsMeta(moduleName) {
  const res = await fetch(`/api/modules/${moduleName}/fields`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.fields || json.data || [];
}

// Tries an exact-match criteria search first (fast, precise); if that
// comes back empty or errors — which can happen for account names
// containing characters the criteria syntax chokes on — falls back to
// a full-text word search and filters client-side for an exact match
// on Account_Name.
async function searchModuleByAccountName(moduleName, accountName) {
  const criteria = `(Account_Name:equals:${accountName})`;
  try {
    const res = await fetch(`/api/modules/${moduleName}/search?criteria=${encodeURIComponent(criteria)}`);
    if (res.ok) {
      const json = await res.json();
      const records = json?.data || [];
      if (records.length > 0) return records;
    }
  } catch {
    // fall through to word search
  }

  try {
    const res = await fetch(`/api/modules/${moduleName}/search?word=${encodeURIComponent(accountName)}`);
    if (res.ok) {
      const json = await res.json();
      const records = json?.data || [];
      const target = accountName.trim().toLowerCase();
      return records.filter((r) => {
        const raw = r.Account_Name;
        const name = raw && typeof raw === "object" ? raw.name : raw;
        return String(name || "").trim().toLowerCase() === target;
      });
    }
  } catch {
    // give up quietly — the section will show "not found"
  }

  return [];
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-600 break-words">{value || <span className="text-slate-300">--</span>}</p>
    </div>
  );
}

function CompanyContactModule({ accountName }) {
  const [state, setState] = useState({ loading: true, error: null, account: null, accountFields: [], contacts: [] });

  useEffect(() => {
    if (!accountName) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        if (!accountFieldsPromise) accountFieldsPromise = loadFieldsMeta("Accounts");
        if (!contactFieldsPromise) contactFieldsPromise = loadFieldsMeta("Contacts");

        const [accFieldsMeta, contactFieldsMeta, accounts, contacts] = await Promise.all([
          accountFieldsPromise,
          contactFieldsPromise,
          searchModuleByAccountName("Accounts", accountName),
          searchModuleByAccountName("Contacts", accountName),
        ]);

        if (cancelled) return;

        const account = accounts[0] || null;
        const accountFields = account ? resolveFields(account, buildLabelMap(accFieldsMeta), ACCOUNT_INFO_LABELS) : [];
        const contactLabelMap = buildLabelMap(contactFieldsMeta);
        const resolvedContacts = contacts.map((c) => ({
          name: pickValue(c, "Full_Name") || pickValue(c, "Last_Name") || "Contact",
          fields: resolveFields(c, contactLabelMap, CONTACT_INFO_LABELS),
        }));

        setState({ loading: false, error: null, account, accountFields, contacts: resolvedContacts });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountName]);

  return (
    <div className="px-5 sm:px-6 pt-5">
      <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Company &amp; Contact</p>

      {state.loading && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-400">
          Loading from Bigin…
        </div>
      )}

      {!state.loading && state.error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-600">
          Couldn't load company/contact info: {state.error}
        </div>
      )}

      {!state.loading && !state.error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company */}
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconBuilding className="w-4 h-4 text-slate-400" />
              <p className="text-xs uppercase tracking-wide text-slate-700 font-bold">Company</p>
            </div>
            {!state.account ? (
              <p className="text-xs text-slate-400">No matching Accounts record found in Bigin.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {state.accountFields.map((f) => (
                  <InfoField key={f.label} label={f.label} value={f.value} />
                ))}
                {state.accountFields.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-2">No additional fields available.</p>
                )}
              </div>
            )}
          </div>

          {/* Contact(s) */}
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconUsers className="w-4 h-4 text-slate-400" />
              <p className="text-xs uppercase tracking-wide text-slate-700 font-bold">Contact</p>
            </div>
            {state.contacts.length === 0 ? (
              <p className="text-xs text-slate-400">No linked Contacts record found in Bigin.</p>
            ) : (
              <div className="space-y-4">
                {state.contacts.slice(0, 2).map((c, i) => (
                  <div key={i} className={i > 0 ? "pt-3 border-t border-slate-100" : ""}>
                    <p className="text-sm font-semibold text-navy-900 mb-2">{c.name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {c.fields.map((f) => (
                        <InfoField key={f.label} label={f.label} value={f.value} />
                      ))}
                      {c.fields.length === 0 && (
                        <p className="text-xs text-slate-400 col-span-2">No additional fields available.</p>
                      )}
                    </div>
                  </div>
                ))}
                {state.contacts.length > 2 && (
                  <p className="text-[11px] text-slate-400">+{state.contacts.length - 2} more contact(s) in Bigin</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_CARDS = ["Cash", "Kind", "School Engagement"];

export default function DonorHistoryModal({ open, onClose, donor }) {
  // Multi-select filters shared by the Fiscal-year/Type cards AND the
  // Deal history table's own column headers — clicking a card and
  // toggling the matching column-header checkbox control the exact
  // same state, so either one narrows the table the same way. null
  // means "everything" for that field.
  const [filters, setFilters] = useState({
    fiscalYear: null,
    monthLabel: null,
    expectedMonth: null,
    type: null,
    kam: null,
    spoc: null,
  });
  const [, setPageNoop] = useState(0); // this modal has no pagination; makeFilterHandlers just needs a setter to call

  // Reset filters every time a different donor's popup is opened, so a
  // filter left on from the last donor never silently hides everything
  // in this one.
  useEffect(() => {
    if (open) {
      setFilters({
        fiscalYear: null,
        monthLabel: null,
        expectedMonth: null,
        type: null,
        kam: null,
        spoc: null,
      });
    }
  }, [open, donor?.account]);

  // Hooks must run unconditionally, so this is computed before the
  // early-return check below (it just yields an empty shape when closed).
  const { fyRows, typeTotals, rowsWithMonth, optionsByField, filteredRows, sorteddonors } = useMemo(() => {
    if (!donor) {
      return { fyRows: [], typeTotals: {}, rowsWithMonth: [], optionsByField: {}, filteredRows: [], sorteddonors: [] };
    }

    const byFY = {};
    const byType = {};
    // FY cards are scoped by the Type selection ONLY (never by their
    // own FY selection — a card needs to stay visible/clickable
    // whether or not it's currently the one selected), and Type cards
    // are scoped by the FY selection ONLY, the same way — same
    // "each dimension's cards react to the OTHER dimension's filter,
    // never their own" pattern used everywhere else on this dashboard
    // (e.g. Overview's FY cards vs Donor Type cards).
    const matchesTypeFilter = (d) => matchesFilter(d.type, filters.type);
    const matchesFYFilter = (d) => matchesFilter(d.fiscalYear, filters.fiscalYear);

    for (const d of donor.donors.filter(matchesTypeFilter)) {
      const fy = d.fiscalYear || "Unspecified";
      if (!byFY[fy]) byFY[fy] = { amount: 0, convertedAmount: 0, pipelineAmount: 0, count: 0 };
      // Standard Pipeline deals haven't closed yet — people were reading
      // an FY card's single number as "already converted", which broke
      // down for the current FY once it also had open pipeline mixed
      // in. Splitting the two here (see the FY card rendering below)
      // keeps that number honest.
      const isPipeline = d.subPipeline === "Standard Pipeline";
      byFY[fy].amount += d.amount || 0;
      if (isPipeline) byFY[fy].pipelineAmount += d.amount || 0;
      else byFY[fy].convertedAmount += d.amount || 0;
      byFY[fy].count += 1;
    }

    for (const d of donor.donors.filter(matchesFYFilter)) {
      const type = d.type && d.type !== "Unspecified" ? d.type : "Unspecified";
      if (!byType[type]) byType[type] = { amount: 0, count: 0 };
      byType[type].amount += d.amount || 0;
      byType[type].count += 1;
    }
    const fyRowsCalc = Object.entries(byFY)
      .map(([fy, v]) => ({ fy, ...v }))
      .sort((a, b) => b.fy.localeCompare(a.fy));

    // A real "monthLabel" field (derived from closingDate) so the Month
    // column can use the same generic filter machinery as every other
    // field — those all read straight off an existing property.
    const withMonth = donor.donors.map((d) => ({ ...d, monthLabel: monthNameOf(d.closingDate) }));

    const byField = {};
    for (const field of FILTER_FIELDS) byField[field] = optionsFor(withMonth, field);

    const filtered = withMonth.filter((d) => FILTER_FIELDS.every((field) => matchesFilter(d[field], filters[field])));

    const sorted = [...filtered].sort((a, b) => {
      const fyCmp = (b.fiscalYear || "").localeCompare(a.fiscalYear || "");
      if (fyCmp !== 0) return fyCmp;
      const da = a.closingDate ? new Date(a.closingDate).getTime() : 0;
      const db = b.closingDate ? new Date(b.closingDate).getTime() : 0;
      return db - da;
    });

    return {
      fyRows: fyRowsCalc,
      typeTotals: byType,
      rowsWithMonth: withMonth,
      optionsByField: byField,
      filteredRows: filtered,
      sorteddonors: sorted,
    };
  }, [donor, filters]);

  const { toggleOption, selectAll, clearAll } = makeFilterHandlers(setFilters, setPageNoop, optionsByField);

  // Cards need the OPPOSITE starting point from the column-header
  // checkboxes above: a checkbox dropdown shows every box checked when
  // `filters[field]` is null, so toggling one there means "uncheck just
  // this one, leave the rest checked" (subtractive from the full set).
  // A card click means "select just this one" starting from nothing
  // highlighted — additive from an empty set, not the full one — so it
  // needs its own toggle rather than reusing toggleOption above.
  const toggleCard = (field) => (value) => {
    setFilters((prev) => {
      const current = prev[field];
      const base = current == null ? [] : current;
      const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
      return { ...prev, [field]: next.length === 0 ? null : next };
    });
  };

  if (!open || !donor) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-navy-900 text-white px-5 sm:px-6 py-4 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-display font-bold text-base sm:text-lg truncate">{donor.account}</p>
            <p className="text-xs text-white/50 mt-0.5">Full donor history · {donor.donors.length} deal{donor.donors.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none ml-4 shrink-0">
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Company & Contact — live from Bigin Accounts/Contacts */}
          <CompanyContactModule accountName={donor.account} />

          {/* Summary strip */}
          <div className="p-5 sm:p-6 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">Total Amount</p>
              <p className="font-display text-lg font-bold text-pink-600">{moneyForDonorType(donor.totalAmount, donor.donorType)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">Donor Type</p>
              <p className="text-sm font-medium text-slate-600">{donor.donorType}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">KAM(s)</p>
              <p className="text-sm font-medium text-slate-600">{donor.kam}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">SPOC(s)</p>
              {/* Multiple SPOCs are already comma-separated in donor.spoc */}
              <p className="text-sm font-medium text-slate-600">{donor.spoc}</p>
            </div>
          </div>

          {/* Fiscal-year split */}
          <div className="px-5 sm:px-6 pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-semibold text-navy-900 text-sm">Fiscal-year split</p>
              <p className="text-[11px] text-slate-400">Click a card to filter the table below · multi-select</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              {fyRows.map((r) => {
                const active = filters.fiscalYear != null && filters.fiscalYear.includes(r.fy);
                return (
                  <button
                    type="button"
                    key={r.fy}
                    onClick={() => toggleCard("fiscalYear")(r.fy)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      active ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">FY {r.fy}</p>
                    {r.pipelineAmount > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <p className="font-display text-base font-bold text-navy-900">{moneyForDonorType(r.convertedAmount, donor.donorType)}</p>
                          <span className="text-[10px] text-slate-400 font-medium">converted</span>
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <p className="font-display text-sm font-bold text-sky-600">{moneyForDonorType(r.pipelineAmount, donor.donorType)}</p>
                          <span className="text-[10px] text-slate-400 font-medium">pipeline</span>
                        </div>
                      </>
                    ) : (
                      <p className={`font-display text-base font-bold ${active ? "text-pink-600" : "text-navy-900"}`}>{moneyForDonorType(r.amount, donor.donorType)}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">{r.count} donation{r.count !== 1 ? "s" : ""}</p>
                  </button>
                );
              })}
              {fyRows.length === 0 && (
                <p className="text-xs text-slate-400 col-span-full">No fiscal-year data available.</p>
              )}

              {/* By Type — same donor, split by Cash/Kind/School
                  Engagement across their whole history rather than by
                  year. Always shows all 3, zero-filled, so the row after
                  the FY cards fills out consistently. */}
              {TYPE_CARDS.map((type) => {
                const t = typeTotals[type] || { amount: 0, count: 0 };
                const active = filters.type != null && filters.type.includes(type);
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => toggleCard("type")(type)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      active ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-1">{type}</p>
                    <p className={`font-display text-base font-bold ${active ? "text-pink-600" : "text-navy-900"}`}>{moneyForDonorType(t.amount, donor.donorType)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t.count} donation{t.count !== 1 ? "s" : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full deal-by-deal history */}
          <div className="px-5 sm:px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="font-display font-semibold text-navy-900 text-sm">
                Deal history
                <span className="text-slate-400 font-normal"> · {sorteddonors.length} of {donor.donors.length} deals shown</span>
              </p>
              <ExportButton
                disabled={sorteddonors.length === 0}
                onClick={() =>
                  downloadCsv(
                    `${donor.account}-deal-history.csv`,
                    ["FY", "Month", "Pipeline Month", "Type of Engagement", "Amount", "KAM", "SPOC"],
                    sorteddonors.map((d) => [
                      d.fiscalYear || "",
                      monthNameOf(d.closingDate) || "",
                      d.subPipeline === "Standard Pipeline" ? d.expectedMonth || "" : "",
                      d.type || "",
                      d.amount,
                      d.kam || "",
                      d.spoc || "",
                    ])
                  )
                }
              />
            </div>
            <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-700 font-bold bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="FY"
                        options={optionsByField.fiscalYear || []}
                        selected={filters.fiscalYear}
                        onToggle={toggleOption("fiscalYear")}
                        onSelectAll={selectAll("fiscalYear")}
                        onClearAll={clearAll("fiscalYear")}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="Month"
                        options={optionsByField.monthLabel || []}
                        selected={filters.monthLabel}
                        onToggle={toggleOption("monthLabel")}
                        onSelectAll={selectAll("monthLabel")}
                        onClearAll={clearAll("monthLabel")}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="Pipeline Month"
                        options={optionsByField.expectedMonth || []}
                        selected={filters.expectedMonth}
                        onToggle={toggleOption("expectedMonth")}
                        onSelectAll={selectAll("expectedMonth")}
                        onClearAll={clearAll("expectedMonth")}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="Type of Engagement"
                        options={optionsByField.type || []}
                        selected={filters.type}
                        onToggle={toggleOption("type")}
                        onSelectAll={selectAll("type")}
                        onClearAll={clearAll("type")}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-bold text-right">Amount</th>
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="KAM"
                        options={optionsByField.kam || []}
                        selected={filters.kam}
                        onToggle={toggleOption("kam")}
                        onSelectAll={selectAll("kam")}
                        onClearAll={clearAll("kam")}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-bold">
                      <HeaderFilterMenu
                        variant="light"
                        label="SPOC"
                        options={optionsByField.spoc || []}
                        selected={filters.spoc}
                        onToggle={toggleOption("spoc")}
                        onSelectAll={selectAll("spoc")}
                        onClearAll={clearAll("spoc")}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorteddonors.map((d, i) => {
                    const isPipeline = d.subPipeline === "Standard Pipeline";
                    return (
                      <tr key={i} className={i % 2 === 1 ? "bg-slate-50/60" : ""}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.fiscalYear || "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                          {monthNameOf(d.closingDate) || "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {isPipeline && d.expectedMonth && d.expectedMonth !== "Unspecified" ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700">
                              {d.expectedMonth}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <TypeBadge type={d.type} />
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap text-navy-900 font-medium" title={fullMoney(d.amount)}>
                          {moneyForDonorType(d.amount, donor.donorType)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.kam}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.spoc}</td>
                      </tr>
                    );
                  })}
                  {sorteddonors.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-xs">
                        No deals match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}