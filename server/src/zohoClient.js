import axios from "axios";
import "dotenv/config";

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_DC = "in",
} = process.env;

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
  console.warn(
    "[zohoClient] Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN in .env — API calls will fail until set."
  );
}

const ACCOUNTS_BASE = `https://accounts.zoho.${ZOHO_DC}`;
const API_BASE = `https://www.zohoapis.${ZOHO_DC}/bigin/v2`;

let cachedToken = null;
let cachedTokenExpiry = 0;
let refreshPromise = null; // ensures only one refresh call happens at a time

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60_000) {
    return cachedToken;
  }

  // If a refresh is already in flight, wait for that one instead of
  // starting a second, parallel request to Zoho.
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const params = new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    });

    try {
      const { data } = await axios.post(
        `${ACCOUNTS_BASE}/oauth/v2/token?${params.toString()}`
      );

      if (!data.access_token) {
        throw new Error(
          `Failed to get access token from Zoho: ${JSON.stringify(data)}`
        );
      }

      cachedToken = data.access_token;
      cachedTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
      return cachedToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function biginRequest(path, { method = "GET", params, data } = {}) {
  const token = await getAccessToken();
  try {
    const res = await axios({
      method,
      url: `${API_BASE}${path}`,
      params,
      data,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const e = new Error(
        `Bigin API error ${status} on ${path}: ${JSON.stringify(body)}`
      );
      e.status = status;
      e.body = body;
      throw e;
    }
    throw err;
  }
}

// Some Bigin modules (notably Contacts and Pipelines) reject list calls
// with REQUIRED_PARAM_MISSING unless "fields" is explicitly passed.
// Every module fetched via fetchAllRecords() needs an entry here, or the
// call silently goes out with no "fields" param and Bigin 400s on it.
const DEFAULT_FIELDS = {
  Contacts: "Full_Name,Account_Name,Email,Phone,Owner",
  Pipelines:
    "id,Deal_Name,Account_Name,Contact_Name,Pipeline,Sub_Pipeline,Stage,Amount," +
    "Closing_Date,Platform,Category,Fiscal_year,Expected_Conversion_Month," +
    "Expected_Week_of_Conversion,Type_of_donor,Priority,Spoc,Pipeline_KAM," +
    "Fresh_Re_engagement,District,Approved_by_Rajesh,Type,Created_Time," +
    "Category_of_Donation,Owner",
  Accounts: "Account_Name,Owner,Created_Time,Modified_Time",
  Tasks: "Subject,Status,Due_Date,Owner,Closed_Time",
  Calls: "Subject,Call_Type,Call_Start_Time,Call_Duration,Owner",
  Events: "Event_Title,Start_DateTime,End_DateTime,Owner",
};

// `fields: false` deliberately sends no "fields" param at all (and skips
// the missing-fields warning) — used by fetchAllNotes()'s fallback.
async function fetchAllRecords(module, { fields, extraParams = {}, maxPages = 200 } = {}) {
  const perPage = 200;
  const all = [];
  const fieldsToUse = fields === false ? null : fields || DEFAULT_FIELDS[module];

  if (!fieldsToUse && fields !== false) {
    console.warn(
      `[zohoClient] No "fields" defined for module "${module}" in DEFAULT_FIELDS — ` +
      `Bigin will likely reject this call with REQUIRED_PARAM_MISSING. Add an entry ` +
      `for "${module}" to DEFAULT_FIELDS or pass { fields: "..." } explicitly.`
    );
  }

  let page = 1;
  let pageToken = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const params = {
      per_page: perPage,
      ...(fieldsToUse ? { fields: fieldsToUse } : {}),
      ...extraParams,
    };

    // Bigin's offset pagination (page=N) only works up to ~2000 records
    // (DISCRETE_PAGINATION_LIMIT_EXCEEDED beyond that). Once the API hands
    // us a next_page_token, we must switch to cursor-based paging and stop
    // sending "page" entirely — the two params are mutually exclusive.
    if (pageToken) {
      params.page_token = pageToken;
    } else {
      params.page = page;
    }

    const data = await biginRequest(`/${module}`, { params });
    const records = data?.data || [];
    all.push(...records);
    pageCount += 1;

    const info = data?.info || {};
    if (!info.more_records || records.length === 0) break;

    if (info.next_page_token) {
      pageToken = info.next_page_token;
    } else {
      page += 1;
    }
  }

  if (pageCount >= maxPages) {
    console.warn(
      `[zohoClient] fetchAllRecords("${module}") hit maxPages (${maxPages}) — ` +
      `results may be truncated. Increase maxPages if this module genuinely has more records.`
    );
  }

  return all;
}

// Every note in Bigin, from every record, in one paged read (GET /Notes,
// 200 per call) — far cheaper than asking for each company's notes one by
// one. Each note says which record it belongs to in Parent_Id ({ id, name,
// module }), which is how the dashboard matches notes to donors.
//
// Needs the ZohoBigin.modules.notes.READ scope on the Zoho API client /
// refresh token. If Bigin rejects one of the requested field names (400),
// it asks again without a "fields" list so Bigin sends its default set.
const NOTE_FIELDS = "Note_Title,Note_Content,Parent_Id,Created_Time,Created_By,Owner";

async function fetchAllNotes() {
  try {
    return await fetchAllRecords("Notes", { fields: NOTE_FIELDS });
  } catch (err) {
    if (err.status !== 400) throw err;
    console.warn("[zohoClient] Bigin rejected the Notes field list; retrying with Bigin's default fields.");
    return fetchAllRecords("Notes", { fields: false });
  }
}

// Every call logged in Bigin (Activities -> Calls), for the Calls column on
// the Overview page. Each call says which record it's "Related To" in
// What_Id (a company) and who it was "To/From" in Who_Id.
//
// "Call SPOC Names" is a custom field, so its API name isn't known up
// front. The Fields metadata API is asked for the Calls fields and the ones
// we need are found by their on-screen LABEL; those API names are added to
// the request and returned in `fieldKeys`. That lookup is optional — if
// it's refused (it needs ZohoBigin.settings.fields.READ) or a field name is
// rejected (400), the request is retried with no "fields" list at all (so
// Bigin sends its default set and the SPOC field is found by name among it),
// and last with just the standard documented fields.
//
// Needs the ZohoBigin.modules.calls.READ scope (or ZohoBigin.modules.ALL).
const CALL_STANDARD_FIELDS =
  "Subject,Call_Type,Call_Start_Time,Call_Duration,Call_Purpose,Call_Result,Call_Agenda,Description,Who_Id,What_Id,Owner";

const CALL_LABELS = {
  toFrom: ["to/from"],
  spoc: ["call spoc names", "call spoc name", "call spoc", "spoc"],
};

async function getCallFieldKeys() {
  const data = await biginRequest("/settings/fields", { params: { module: "Calls" } });
  const byLabel = {};
  for (const f of data?.fields || []) {
    byLabel[String(f.field_label || f.display_label || "").trim().toLowerCase()] = f.api_name;
  }
  const keys = {};
  for (const [name, labels] of Object.entries(CALL_LABELS)) {
    const hit = labels.find((l) => byLabel[l]);
    if (hit) keys[name] = byLabel[hit];
  }
  return keys;
}

async function fetchAllCalls() {
  let fieldKeys = {};
  try {
    fieldKeys = await getCallFieldKeys();
  } catch (err) {
    console.warn(`[zohoClient] Couldn't look up the Calls field names (${err.message}); using the standard ones.`);
  }

  const extra = Object.values(fieldKeys);
  const withExtra = [...new Set([...CALL_STANDARD_FIELDS.split(","), ...extra])].join(",");
  // Best first: the looked-up field list; then NO list (Bigin's own default
  // set, which includes custom fields like the SPOC one); then only the
  // standard documented fields as a last resort.
  const attempts = (extra.length ? [withExtra, false, CALL_STANDARD_FIELDS] : [false, CALL_STANDARD_FIELDS]).filter(
    (f, i, a) => a.indexOf(f) === i
  );

  let lastErr;
  for (const fields of attempts) {
    try {
      const calls = await fetchAllRecords("Calls", { fields });
      return { calls, fieldKeys };
    } catch (err) {
      if (err.status !== 400) throw err;
      lastErr = err;
      console.warn("[zohoClient] Bigin rejected the Calls field list; trying a simpler request.");
    }
  }
  throw lastErr;
}

// Donors' phone numbers, for the "Mobile Number" column of the Engagement
// Status table. A donor's number can sit on the company record (Companies,
// API name "Accounts") or on one of its contacts (Contacts), so both modules
// are read; each contact points back to its company in Account_Name.
//
// Which fields hold phone numbers differs from setup to setup (Phone, Mobile,
// a custom "Mobile Number"…), so the Fields metadata API is asked for every
// field of data type "phone" in each module (that lookup needs
// ZohoBigin.settings.fields.READ and is optional). If it's refused, or Bigin
// rejects a field name (400), it retries with the usual names (Phone /
// Mobile) and finally with no "fields" list at all.
//
// Needs read access to the Companies and Contacts modules
// (ZohoBigin.modules.accounts.READ / ZohoBigin.modules.contacts.READ, or
// ZohoBigin.modules.ALL).
const PHONE_GUESS = { Accounts: ["Phone", "Mobile"], Contacts: ["Mobile", "Phone"] };

async function getPhoneFieldNames(module) {
  const data = await biginRequest("/settings/fields", { params: { module } });
  return (data?.fields || [])
    .filter((f) => String(f.data_type || "").toLowerCase() === "phone")
    .map((f) => f.api_name)
    .filter(Boolean);
}

async function fetchModulePhones(module) {
  let phoneFields = [];
  try {
    phoneFields = await getPhoneFieldNames(module);
  } catch (err) {
    console.warn(`[zohoClient] Couldn't look up the ${module} phone fields (${err.message}); using the usual names.`);
  }
  const base = module === "Contacts" ? ["Full_Name", "Account_Name"] : ["Account_Name"];
  const attempts = [
    phoneFields.length ? [...base, ...phoneFields].join(",") : null,
    [...base, ...PHONE_GUESS[module]].join(","),
    [...base, PHONE_GUESS[module][0]].join(","),
    false,
  ].filter((f, i, a) => f !== null && a.indexOf(f) === i);

  let lastErr;
  for (const fields of attempts) {
    try {
      const records = await fetchAllRecords(module, { fields });
      return { records, phoneFields };
    } catch (err) {
      if (err.status !== 400) throw err;
      lastErr = err;
      console.warn(`[zohoClient] Bigin rejected the ${module} field list; trying a simpler request.`);
    }
  }
  throw lastErr;
}

async function fetchAllDonorPhones() {
  const result = { accounts: [], contacts: [], phoneFields: { Accounts: [], Contacts: [] } };
  const errors = [];
  for (const module of ["Accounts", "Contacts"]) {
    try {
      const { records, phoneFields } = await fetchModulePhones(module);
      result[module === "Accounts" ? "accounts" : "contacts"] = records;
      result.phoneFields[module] = phoneFields;
    } catch (err) {
      errors.push(err);
      console.warn(`[zohoClient] Couldn't read ${module} for phone numbers: ${err.message}`);
    }
  }
  if (errors.length === 2) throw errors[0]; // both failed — nothing to show
  return result;
}

// The deals (Pipelines module), with two extra Bigin fields added:
//
//   Donation Type  → `Donation_Type`  (CER donations are the deals whose Donation
//                    Type is "CER" — a different field from Category of Donation
//                    and from Type = Cash / Kind)
//   Donor          → `Donor_Field`    (the pipeline's "Donor" field, shown in the
//                    Overview's Donor History table next to SPOC)
//
// The fields' API names aren't hard-coded: they are found by their LABEL in the
// Fields metadata (needs ZohoBigin.settings.fields.READ, optional). If that lookup
// is refused, "Donation_Type" and "Donor" are tried. If Bigin rejects the field
// list (400) it retries with fewer extras — each one alone, then none — so a
// wrong guess can never stop the dashboard loading; it just leaves that field
// out. A field that turns out to be one the deal list already has (for example
// when "Donor" is the label of the deal-name field) is read from that field and
// not requested twice.
//
// Each deal gets the values under the fixed keys above, whatever the fields are
// really called in Bigin.
let pipelineExtrasPromise = null;
const normFieldLabel = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function findPipelineExtraFields() {
  const data = await biginRequest("/settings/fields", { params: { module: "Pipelines" } });
  const byLabel = (label) =>
    (data?.fields || []).find((f) => normFieldLabel(f.field_label || f.display_label) === label)?.api_name || null;
  return { ok: true, donationType: byLabel("donationtype"), donor: byLabel("donor") };
}

async function fetchAllPipelines() {
  if (!pipelineExtrasPromise) {
    pipelineExtrasPromise = findPipelineExtraFields().catch((err) => {
      console.warn(`[zohoClient] Couldn't look up the Donation Type / Donor fields (${err.message}); trying "Donation_Type" and "Donor".`);
      return { ok: false };
    });
  }
  const found = await pipelineExtrasPromise;
  // After a good lookup a field Bigin doesn't have is skipped; after a failed one, the usual names are guessed.
  const guess = (api, fallback) => (found.ok ? api : api || fallback);
  const wanted = [
    ["Donation_Type", guess(found.donationType, "Donation_Type")],
    ["Donor_Field", guess(found.donor, "Donor")],
  ].filter(([, api]) => api);

  // all extras, then each on its own, then none
  const attempts = [wanted, ...(wanted.length > 1 ? wanted.map((w) => [w]) : []), []];
  const base = new Set(DEFAULT_FIELDS.Pipelines.split(",").map((f) => f.trim()));

  let lastErr;
  for (const extras of attempts) {
    const requested = [...new Set(extras.map(([, api]) => api).filter((api) => !base.has(api)))];
    const fields = [DEFAULT_FIELDS.Pipelines, ...requested].join(",");
    try {
      const records = await fetchAllRecords("Pipelines", { fields });
      for (const [key, api] of extras) if (key !== api) for (const r of records) r[key] = r[api];
      const missing = wanted.filter(([key]) => !extras.some(([k]) => k === key)).map(([key]) => key);
      if (missing.length) console.warn(`[zohoClient] Loaded deals WITHOUT: ${missing.join(", ")} — those columns will be empty.`);
      return records;
    } catch (err) {
      if (err.status !== 400) throw err;
      lastErr = err;
      console.warn(`[zohoClient] Bigin rejected the deal field list with extras [${extras.map(([, api]) => api).join(", ") || "none"}]; trying a simpler one.`);
    }
  }
  throw lastErr;
}

// ── Stage history of ONE deal ─────────────────────────────────────────
//
// Bigin shows it on the "Stage History" tab of a pipeline record. Bigin's API
// docs don't spell out the route, so this finds it instead of assuming:
//   1. the record's Stage History related list — its API name is read from the
//      related-lists metadata (GET /settings/related_lists?module=Pipelines);
//      if that lookup is refused, "Stage_History" is tried;
//   2. that list is asked for with no `fields`, then with a few field lists,
//      because some Bigin lists answer REQUIRED_PARAM_MISSING without them;
//   3. last resort: the record's timeline (…/__timeline), keeping the Stage changes.
// The first combination that works is remembered, so later deals take one call.
// If nothing works for the first few deals, it stops trying for ten minutes
// instead of burning API credits, and says why (see /crm-analysis/stage-history-debug).
//
// Returns { source: "related" | "timeline", rows: [raw Bigin rows] }.
let stageHistoryNameP = null;
let stageHistoryPlan = null; // { kind: "related", api, fields } | { kind: "timeline" }
let stageHistoryEverWorked = false;
let stageHistoryFailures = 0;
let stageHistoryBlockedUntil = 0;
const STAGE_HISTORY_FIELD_SETS = [null, "Stage,Modified_Time", "Stage,Modified_Time,Moved_To,Amount,Closing_Date", "id,Stage"];

async function findStageHistoryList() {
  const data = await biginRequest("/settings/related_lists", { params: { module: "Pipelines" } });
  const hit = (data?.related_lists || []).find((l) => /stage.?history/i.test(`${l.api_name} ${l.name} ${l.display_label}`));
  return hit?.api_name || null;
}

const rowsOf = (data) => (Array.isArray(data?.data) ? data.data : data === "" || data == null ? [] : null);

async function fetchStageHistory(dealId, log = null) {
  const note = (s) => log && log.push(s);
  if (Date.now() < stageHistoryBlockedUntil) {
    const e = new Error("Stage history isn't available from the Bigin API (see /api/crm-analysis/stage-history-debug).");
    e.status = 501;
    throw e;
  }

  const tryRelated = async (api, fields) => {
    const params = fields ? { fields } : undefined;
    try {
      const data = await biginRequest(`/Pipelines/${dealId}/${api}`, { params });
      const rows = rowsOf(data);
      note(`related ${api} fields=${fields || "(none)"} → ${rows ? `${rows.length} rows` : "unexpected shape"}`);
      if (rows) return { source: "related", rows, plan: { kind: "related", api, fields } };
    } catch (err) {
      note(`related ${api} fields=${fields || "(none)"} → ${err.status || "?"} ${String(err.message).slice(0, 160)}`);
      err.stageAttempt = true;
      throw err;
    }
    return null;
  };

  const tryTimeline = async () => {
    try {
      const data = await biginRequest(`/Pipelines/${dealId}/__timeline`);
      const rows = Array.isArray(data?.__timeline) ? data.__timeline : null;
      note(`timeline → ${rows ? `${rows.length} events` : "unexpected shape"}`);
      if (rows) return { source: "timeline", rows, plan: { kind: "timeline" } };
    } catch (err) {
      note(`timeline → ${err.status || "?"} ${String(err.message).slice(0, 160)}`);
    }
    return null;
  };

  let result = null;

  // 1. what worked last time
  if (stageHistoryPlan) {
    try {
      result = stageHistoryPlan.kind === "timeline" ? await tryTimeline() : await tryRelated(stageHistoryPlan.api, stageHistoryPlan.fields);
    } catch (err) {
      if (![400, 404].includes(err.status)) throw err; // auth, rate limit, outage: not a "wrong route" problem
    }
  }

  // 2. work it out
  if (!result) {
    if (!stageHistoryNameP) {
      stageHistoryNameP = findStageHistoryList().catch((err) => {
        note(`related-lists lookup → ${err.status || "?"} ${String(err.message).slice(0, 120)}`);
        return null;
      });
    }
    const found = await stageHistoryNameP;
    note(`related list found by label: ${found || "(none)"}`);
    const apis = [...new Set([found, "Stage_History"].filter(Boolean))];
    outer: for (const api of apis) {
      for (const fields of STAGE_HISTORY_FIELD_SETS) {
        try {
          result = await tryRelated(api, fields);
          if (result) break outer;
        } catch (err) {
          if (err.status === 404) break; // this name isn't a route at all — next name
          if (err.status !== 400) throw err; // auth / rate limit / outage — stop here
        }
      }
    }
    if (!result) result = await tryTimeline();
  }

  if (!result) {
    stageHistoryFailures += 1;
    if (!stageHistoryEverWorked && stageHistoryFailures >= 3) stageHistoryBlockedUntil = Date.now() + 10 * 60 * 1000;
    const e = new Error("Bigin did not return stage history for this record.");
    e.status = 404;
    throw e;
  }

  stageHistoryPlan = result.plan;
  stageHistoryEverWorked = true;
  stageHistoryFailures = 0;
  return { source: result.source, rows: result.rows };
}

// For the diagnostics route: runs fetchStageHistory for one deal and reports every step.
async function debugStageHistory(dealId) {
  const log = [];
  stageHistoryBlockedUntil = 0; // a manual check is always allowed to try
  let out = null;
  let error = null;
  try {
    out = await fetchStageHistory(dealId, log);
  } catch (err) {
    error = `${err.status || ""} ${err.message}`.trim();
  }
  return { dealId, attempts: log, plan: stageHistoryPlan, error, source: out?.source || null, sampleRows: out ? out.rows.slice(0, 3) : [], rowCount: out ? out.rows.length : 0 };
}

export { biginRequest, fetchAllRecords, fetchAllPipelines, fetchAllNotes, fetchAllCalls, fetchAllDonorPhones, fetchStageHistory, debugStageHistory, getAccessToken, DEFAULT_FIELDS };