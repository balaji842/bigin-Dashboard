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

export { biginRequest, fetchAllRecords, fetchAllNotes, fetchAllCalls, getAccessToken, DEFAULT_FIELDS };