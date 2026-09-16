import { useEffect, useMemo, useState } from "react";
import { moneyCr, fullMoney } from "../lib/format.js";
import { IconBuilding, IconUsers } from "./icons.jsx";

function monthNameOf(closingDate) {
  if (!closingDate) return null;
  const d = new Date(closingDate);
  return isNaN(d) ? null : d.toLocaleString("en-US", { month: "long" });
}

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
  "Donation Type",
  "Rhapsody / IGCC",
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
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">{label}</p>
      <p className="text-sm font-medium text-navy-900 break-words">{value || <span className="text-slate-300">--</span>}</p>
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
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Company</p>
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
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Contact</p>
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

export default function DonorHistoryModal({ open, onClose, donor }) {
  // Hooks must run unconditionally, so this is computed before the
  // early-return check below (it just yields an empty shape when closed).
  const { fyRows, sorteddonors } = useMemo(() => {
    if (!donor) return { fyRows: [], sorteddonors: [] };

    const byFY = {};
    for (const d of donor.donors) {
      const fy = d.fiscalYear || "Unspecified";
      if (!byFY[fy]) byFY[fy] = { amount: 0, count: 0 };
      byFY[fy].amount += d.amount || 0;
      byFY[fy].count += 1;
    }
    const fyRowsCalc = Object.entries(byFY)
      .map(([fy, v]) => ({ fy, ...v }))
      .sort((a, b) => b.fy.localeCompare(a.fy));

    const sorted = [...donor.donors].sort((a, b) => {
      const fyCmp = (b.fiscalYear || "").localeCompare(a.fiscalYear || "");
      if (fyCmp !== 0) return fyCmp;
      const da = a.closingDate ? new Date(a.closingDate).getTime() : 0;
      const db = b.closingDate ? new Date(b.closingDate).getTime() : 0;
      return db - da;
    });

    return { fyRows: fyRowsCalc, sorteddonors: sorted };
  }, [donor]);

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
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Total Amount</p>
              <p className="font-display text-lg font-bold text-pink-600">{moneyCr(donor.totalAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Donor Type</p>
              <p className="text-sm font-medium text-navy-900">{donor.donorType}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">KAM(s)</p>
              <p className="text-sm font-medium text-navy-900">{donor.kam}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">SPOC(s)</p>
              {/* Multiple SPOCs are already comma-separated in donor.spoc */}
              <p className="text-sm font-medium text-navy-900">{donor.spoc}</p>
            </div>
          </div>

          {/* Fiscal-year split */}
          <div className="px-5 sm:px-6 pt-5">
            <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Fiscal-year split</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              {fyRows.map((r) => (
                <div key={r.fy} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">FY {r.fy}</p>
                  <p className="font-display text-base font-bold text-navy-900">{moneyCr(r.amount)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.count} deal{r.count !== 1 ? "s" : ""}</p>
                </div>
              ))}
              {fyRows.length === 0 && (
                <p className="text-xs text-slate-400 col-span-full">No fiscal-year data available.</p>
              )}
            </div>
          </div>

          {/* Full deal-by-deal history */}
          <div className="px-5 sm:px-6 py-5">
            <p className="font-display font-semibold text-navy-900 mb-3 text-sm">Deal history</p>
            <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-semibold">FY</th>
                    <th className="px-4 py-2.5 font-semibold">Month</th>
                    <th className="px-4 py-2.5 font-semibold">Pipeline Month</th>
                    <th className="px-4 py-2.5 font-semibold">Type of Engagement</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">KAM</th>
                    <th className="px-4 py-2.5 font-semibold">SPOC</th>
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
                          {moneyCr(d.amount)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.kam}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{d.spoc}</td>
                      </tr>
                    );
                  })}
                  {sorteddonors.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-xs">
                        No deal history found for this donor.
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