import { useEffect, useMemo, useState } from "react";
import { moneyCr, fullMoney, moneyForDonorType } from "../lib/format.js";
import { IconBuilding, IconUsers } from "./icons.jsx";
import HeaderFilterMenu, { optionsFor, matchesFilter, makeFilterHandlers } from "./HeaderFilterMenu.jsx";
import { facetOptions } from "../lib/facetOptions.js";
import { downloadCsv } from "../lib/csvExport.js";
import ExportButton from "./ExportButton.jsx";

function monthNameOf(closingDate) {
  if (!closingDate) return null;
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

const FILTER_FIELDS = ["fiscalYear", "monthLabel", "expectedMonth", "type", "kam", "spoc"];

const TYPE_THEME = {
  Cash: "bg-[#dfe9ee] text-slate-700",
  Kind: "bg-[#f3e7cf] text-amber-800",
  "School Engagement": "bg-indigo-100 text-indigo-700",
};

function TypeBadge({ type }) {
  if (!type || type === "Unspecified") return <span className="text-slate-300">—</span>;
  const theme = TYPE_THEME[type] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${theme}`}>
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

// ---------------------------------------------------------------------
// Look of this popup: a soft cream palette — cream KPI cards and table
// header, white panels with a warm hairline border, dark navy text. The
// header is the donor: "DONOR DETAILS", the name with the donor-type badge,
// and one line of contact details (phone · email · place) read from the
// donor's Bigin contact.
// ---------------------------------------------------------------------

const CREAM = "bg-[#f3efe4]";
const HAIRLINE = "border-[#e8e3d3]";

const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
const IconPhone = (p) => (
  <svg {...ico} className={p.className}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
  </svg>
);
const IconMail = (p) => (
  <svg {...ico} className={p.className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
const IconPin = (p) => (
  <svg {...ico} className={p.className}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

// Long values (an e-mail, an address) get a whole row to themselves so they
// never break in the middle of a word; short ones sit two to a row.
const WIDE_LABELS = new Set(["Email", "Secondary Email", "Address"]);

function InfoField({ label, value }) {
  return (
    <div className={`min-w-0 ${WIDE_LABELS.has(label) ? "col-span-full" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-700 font-bold mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-600 [overflow-wrap:anywhere]">{value || <span className="text-slate-300">--</span>}</p>
    </div>
  );
}

// The Bigin Accounts record and Contacts of this company, loaded once per
// donor. Used by the header's contact line AND the Company & Contact panels.
function useCompanyContact(accountName) {
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

  return state;
}

// "9876543210 · ramesh@email.com · Chennai" — the first contact's phone,
// e-mail and district, each with its icon; whatever Bigin doesn't have is left out.
function ContactLine({ contact }) {
  if (contact.loading) return <p className="text-sm text-slate-400">Loading contact details…</p>;
  const first = contact.contacts[0];
  const get = (label) => first?.fields.find((f) => f.label === label)?.value;
  const items = [
    { Icon: IconPhone, value: get("Phone") || get("Other Phone"), tone: "text-pink-500" },
    { Icon: IconMail, value: get("Email"), tone: "text-slate-500" },
    { Icon: IconPin, value: get("District"), tone: "text-rose-500" },
  ].filter((x) => x.value);
  if (items.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
      {items.map(({ Icon, value, tone }, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
          <span className="[overflow-wrap:anywhere]">{value}</span>
        </span>
      ))}
    </p>
  );
}

function Panel({ icon: Icon, title, children, className = "" }) {
  return (
    <div className={`rounded-2xl border ${HAIRLINE} bg-white p-4 sm:p-5 flex flex-col min-w-0 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <p className="text-xs uppercase tracking-wide text-slate-700 font-bold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function CompanyContactSection({ state, accountName }) {
  return (
    <div>
      <p className="font-display font-semibold text-navy-900 mb-3 text-base">Company &amp; Contact</p>

      {state.loading && <div className={`rounded-2xl border ${HAIRLINE} bg-white p-4 text-xs text-slate-400`}>Loading from Bigin…</div>}

      {!state.loading && state.error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs text-red-600">Couldn't load company/contact info: {state.error}</div>
      )}

      {!state.loading && !state.error && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
          <Panel icon={IconBuilding} title="Company" className="md:col-span-2">
            <p className="text-base font-semibold text-navy-900 mb-3 [overflow-wrap:anywhere]">{accountName}</p>
            {!state.account ? (
              <p className="text-xs text-slate-400">No matching Accounts record found in Bigin.</p>
            ) : (
              <div className="grid grid-cols-1 gap-y-3">
                {state.accountFields.map((f) => (
                  <InfoField key={f.label} label={f.label} value={f.value} />
                ))}
                {state.accountFields.length === 0 && <p className="text-xs text-slate-400 col-span-2">No additional fields available.</p>}
              </div>
            )}
          </Panel>

          <Panel icon={IconUsers} title="Contact" className="md:col-span-3">
            {state.contacts.length === 0 ? (
              <p className="text-xs text-slate-400">No linked Contacts record found in Bigin.</p>
            ) : (
              <div className="space-y-4">
                {state.contacts.slice(0, 2).map((c, i) => (
                  <div key={i} className={i > 0 ? `pt-4 border-t ${HAIRLINE}` : ""}>
                    <p className="text-base font-semibold text-navy-900 mb-3 [overflow-wrap:anywhere]">{c.name}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {c.fields.map((f) => (
                        <InfoField key={f.label} label={f.label} value={f.value} />
                      ))}
                      {c.fields.length === 0 && <p className="text-xs text-slate-400 col-span-2">No additional fields available.</p>}
                    </div>
                  </div>
                ))}
                {state.contacts.length > 2 && <p className="text-[11px] text-slate-400">+{state.contacts.length - 2} more contact(s) in Bigin</p>}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

// One cream KPI card: a quiet label, the number big and bold, a small line
// of detail under it. Becomes a button (and lights up pink when selected)
// when it filters the Deal history table.
function KpiCard({ label, value, sub, valueClass = "", active = false, onClick, children }) {
  const base = "rounded-2xl p-4 text-left min-w-0 transition-colors";
  const look = active ? "bg-pink-50 ring-2 ring-pink-300" : CREAM;
  const body = (
    <>
      <p className="text-sm text-slate-600">{label}</p>
      {children ?? <p className={`font-display text-2xl font-bold text-navy-900 mt-1 [overflow-wrap:anywhere] ${valueClass}`}>{value}</p>}
      {sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} ${look} ${active ? "" : "hover:bg-[#ece7d8]"}`}>
      {body}
    </button>
  ) : (
    <div className={`${base} ${look}`}>{body}</div>
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

  // Bigin company + contact details (header line and the two panels).
  const contact = useCompanyContact(open && donor ? donor.account : null);

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

    // Each column's list holds only the values in the rows the table can show —
    // the rows left by the OTHER columns' filters (see lib/facetOptions.js).
    const byField = facetOptions({
      rows: withMonth,
      fieldOf: Object.fromEntries(FILTER_FIELDS.map((f) => [f, f])),
      filters,
      matches: matchesFilter,
      optionsFor,
    });

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

  const dealCount = donor.donors.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#fdfcf8] rounded-2xl shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: the donor */}
        <div className={`px-5 sm:px-7 pt-5 pb-4 border-b ${HAIRLINE} shrink-0 relative`}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 w-9 h-9 rounded-full text-slate-500 hover:bg-[#f3efe4] hover:text-navy-900 text-2xl leading-none flex items-center justify-center"
          >
            ×
          </button>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Donor details
            <span className="normal-case tracking-normal text-slate-400"> · Full donor history · {dealCount} deal{dealCount !== 1 ? "s" : ""}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1 pr-10">
            <h2 className="font-display font-bold text-2xl text-navy-900 [overflow-wrap:anywhere]">{donor.account}</h2>
            {donor.donorType && donor.donorType !== "Unspecified" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dfe9ee] px-3 py-1 text-sm font-semibold text-[#14586a]">
                <span className="text-[8px] leading-none">●</span>
                {donor.donorType}
              </span>
            )}
          </div>
          <div className="mt-2">
            <ContactLine contact={contact} />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 sm:px-7 py-5 space-y-6">
          {/* Company & Contact — live from Bigin Accounts/Contacts */}
          <CompanyContactSection state={contact} accountName={donor.account} />

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Amount" value={moneyForDonorType(donor.totalAmount, donor.donorType)} />
            <KpiCard label="KAM(s)" value={donor.kam || "—"} valueClass="!text-lg leading-snug" />
            {/* Multiple SPOCs are already comma-separated in donor.spoc */}
            <KpiCard label="SPOC(s)" value={donor.spoc || "—"} valueClass="!text-lg leading-snug" />
          </div>

          {/* Fiscal-year split + Type split */}
          <div>
            <div className="flex items-center justify-between flex-wrap gap-1 mb-3">
              <p className="font-display font-semibold text-navy-900 text-base">Fiscal-year split</p>
              <p className="text-[11px] text-slate-400">Click a card to filter the table below · multi-select</p>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${fyRows.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {fyRows.map((r) => {
                const active = filters.fiscalYear != null && filters.fiscalYear.includes(r.fy);
                return (
                  <KpiCard
                    key={r.fy}
                    label={`FY ${r.fy}`}
                    active={active}
                    onClick={() => toggleCard("fiscalYear")(r.fy)}
                    sub={`${r.count} donation${r.count !== 1 ? "s" : ""}`}
                  >
                    {r.pipelineAmount > 0 ? (
                      <div className="mt-1">
                        <p className="font-display text-2xl font-bold text-navy-900">
                          {moneyForDonorType(r.convertedAmount, donor.donorType)}
                          <span className="ml-1.5 text-xs font-medium text-slate-500">converted</span>
                        </p>
                        <p className="font-display text-base font-bold text-sky-600">
                          {moneyForDonorType(r.pipelineAmount, donor.donorType)}
                          <span className="ml-1.5 text-xs font-medium text-slate-500">pipeline</span>
                        </p>
                      </div>
                    ) : (
                      <p className="font-display text-2xl font-bold text-navy-900 mt-1">{moneyForDonorType(r.amount, donor.donorType)}</p>
                    )}
                  </KpiCard>
                );
              })}
              {fyRows.length === 0 && <p className="text-xs text-slate-400 col-span-full">No fiscal-year data available.</p>}
            </div>

            {/* By Type — same donor, split by Cash/Kind/School
                Engagement across their whole history rather than by
                year. Always shows all 3, zero-filled, as a row of its own
                under the fiscal-year cards. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {TYPE_CARDS.map((type) => {
                const t = typeTotals[type] || { amount: 0, count: 0 };
                const active = filters.type != null && filters.type.includes(type);
                return (
                  <KpiCard
                    key={type}
                    label={type}
                    value={moneyForDonorType(t.amount, donor.donorType)}
                    active={active}
                    onClick={() => toggleCard("type")(type)}
                    sub={`${t.count} donation${t.count !== 1 ? "s" : ""}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Full deal-by-deal history */}
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="font-display font-semibold text-navy-900 text-base">
                Deal history
                <span className="text-slate-400 font-normal text-sm"> · {sorteddonors.length} of {donor.donors.length} deals shown</span>
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
            <div className={`rounded-2xl border ${HAIRLINE} bg-white overflow-hidden overflow-x-auto`}>
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className={`text-left text-xs uppercase tracking-wide text-slate-700 font-bold ${CREAM}`}>
                    <th className="px-3 py-3 font-bold">
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
                    <th className="px-3 py-3 font-bold">
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
                    <th className="px-3 py-3 font-bold">
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
                    <th className="px-3 py-3 font-bold">
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
                    <th className="px-3 py-3 font-bold text-right">Amount</th>
                    <th className="px-3 py-3 font-bold">
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
                    <th className="px-3 py-3 font-bold">
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
                      <tr key={i} className="border-b border-[#eee9da] last:border-0 hover:bg-[#faf8f1]">
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{d.fiscalYear || "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{monthNameOf(d.closingDate) || "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {isPipeline && d.expectedMonth && d.expectedMonth !== "Unspecified" ? (
                            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700">{d.expectedMonth}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <TypeBadge type={d.type} />
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap text-navy-900 font-semibold" title={fullMoney(d.amount)}>
                          {moneyForDonorType(d.amount, donor.donorType)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{d.kam}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{d.spoc}</td>
                      </tr>
                    );
                  })}
                  {sorteddonors.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-400 text-xs">
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