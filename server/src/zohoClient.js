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

async function fetchAllRecords(module, { fields, extraParams = {}, maxPages = 200 } = {}) {
  const perPage = 200;
  const all = [];
  const fieldsToUse = fields || DEFAULT_FIELDS[module];

  if (!fieldsToUse) {
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

export { biginRequest, fetchAllRecords, getAccessToken, DEFAULT_FIELDS };