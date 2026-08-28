# Bigin CRM Analysis Dashboard

Live, read-only analytics dashboard for your NSNOP Bigin CRM — Deals,
Accounts, Contacts, Tasks, Calls, and Meetings — plus a COQL explorer for
ad-hoc queries. Every screen calls the Bigin API in real time; nothing is
stored in a database.

**Stack:** Node.js + Express (backend, holds your Zoho credentials and
proxies API calls) + React + Vite + Tailwind + Recharts (frontend).

Why two servers? Your Client Secret and Refresh Token must never sit in
browser JavaScript — anyone could open dev tools and steal them. The Express
server keeps them server-side and the React app only ever talks to
`localhost:4000`, never directly to Zoho.

---

## 1. Get a Client ID, Client Secret, and Refresh Token

You already have a working pair (`Bigin_GSheet_Connector`) from Apps Script.
You can either reuse those exact values, or register a fresh client
dedicated to this dashboard (recommended, so you can tell traffic apart in
Zoho's logs later):

1. Go to https://api-console.zoho.in/ (India DC — matches your account)
2. **Add Client** → **Self Client** (same type you already used)
3. Copy the **Client ID** and **Client Secret** shown

### Generate a refresh token (one-time)

Self Clients need a **Generate Code** step to get a grant token, which you
then exchange for a refresh token:

1. In the API console, open your client → **Generate Code** tab
2. Scope needed for this dashboard:
   ```
   ZohoBigin.modules.ALL,ZohoBigin.settings.ALL,ZohoBigin.coql.READ
   ```
3. Set duration to 10 minutes, click **Create**, copy the generated code
   (starts with `1000.`)
4. Exchange it for tokens — run this once from a terminal (replace the
   placeholders):

   ```bash
   curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=THE_GRANT_CODE_YOU_JUST_COPIED"
   ```

5. The JSON response includes a `refresh_token` — copy it. This does not
   expire (see the notes from our earlier chat) unless revoked.

---

## 2. Configure the backend

```bash
cd server
cp .env.example .env
```

Open `.env` and fill in:

```
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_DC=in
PORT=4000
```

Install and run:

```bash
npm install
npm run dev
```

You should see `Bigin dashboard API running at http://localhost:4000`.
Sanity check: open http://localhost:4000/api/health — should return
`{"ok":true}`.

---

## 3. Run the dashboard

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Vite dev
server proxies `/api/*` to your Express server on port 4000, so both need
to be running.

---

## 4. Opening this in VSCode

- Open the `bigin-dashboard` folder as your VSCode workspace root
- Use two integrated terminals (`Ctrl+\`` / `Cmd+\``), one for `server`,
  one for `client`, both running `npm run dev`
- Recommended extensions: ESLint, Tailwind CSS IntelliSense

---

## What's included

- **Overview** — stat cards + charts (deals by stage, deal value by stage,
  accounts by industry, activity mix), all computed live from fresh API
  pulls on every refresh
- **Deals / Accounts / Contacts** — searchable, paginated live tables
- **Activities** — Tasks / Calls / Meetings in sub-tabs
- **COQL Explorer** — run any read-only COQL query and see it rendered as a
  table, same query language you already use for audits

## Notes on scaling this up

- `fetchAllRecords` in `server/src/zohoClient.js` paginates automatically
  (200/page, capped at 25 pages = 5,000 records per module per load). Raise
  `maxPages` there if a module ever exceeds that.
- Access tokens are cached in memory on the server and silently refreshed
  ~1 minute before their 1-hour expiry — you don't need to think about this.
- Everything here is read-only. No route in `server/src/routes` performs a
  POST/PUT/DELETE against Bigin records, by design — this is an analysis
  tool, not a data-entry tool.
- If you later want it to survive Zoho API rate limits under heavier use,
  the natural next step is the "periodic sync to a local DB" pattern
  instead of live-on-every-load — happy to build that variant too.
