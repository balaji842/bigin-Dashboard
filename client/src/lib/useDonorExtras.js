import { useEffect, useState } from "react";

// Loads the two "extras" every donor table shows next to the CRM figures —
// both from Bigin, both keyed by the donor's Bigin company id:
//   - remarksById[companyId] = the Notes on that company, newest first
//   - callsById[companyId]   = the calls logged about that company, newest first
// They don't depend on any page filter, so they're fetched once when the
// page opens (the server keeps them cached). If Bigin can't provide one of
// them (typically the Zoho token lacks that permission) the matching
// `...Note` carries a short message for the table to show; the table itself
// still works, with empty Remarks / 0 Calls.
// Phone numbers per donor (from the Bigin company record and its contacts),
// keyed by the donor's Bigin company id: phonesById[companyId] = ["98765 43210", ...].
// Used by the Engagement Status table's "Mobile Number" column. Like the
// extras above, a failure only fills `phonesNote` — the table still works.
export function useDonorPhones() {
  const [phonesById, setPhonesById] = useState({});
  const [phonesNote, setPhonesNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm-analysis/donor-phones")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        setPhonesById(json.phones || {});
        setPhonesNote(json.error || null);
      })
      .catch((e) => {
        if (!cancelled) setPhonesNote(`Mobile numbers couldn't be loaded (${e.message}).`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { phonesById, phonesNote };
}

// `enabled` (default true) lets a popup load these only when it's opened
// (it fetches again each time it opens, which is cheap — the server keeps
// them cached).
export function useDonorExtras(enabled = true) {
  const [remarksById, setRemarksById] = useState({});
  const [remarksNote, setRemarksNote] = useState(null);
  const [callsById, setCallsById] = useState({});
  const [callsNote, setCallsNote] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    fetch("/api/crm-analysis/donor-remarks")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        setRemarksById(json.remarks || {});
        setRemarksNote(json.error || null);
      })
      .catch((e) => {
        if (!cancelled) setRemarksNote(`Remarks couldn't be loaded (${e.message}).`);
      });

    fetch("/api/crm-analysis/donor-calls")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        setCallsById(json.calls || {});
        setCallsNote(json.error || null);
      })
      .catch((e) => {
        if (!cancelled) setCallsNote(`Calls couldn't be loaded (${e.message}).`);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { remarksById, remarksNote, callsById, callsNote };
}