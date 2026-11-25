import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

// Sending the "donors stuck in a stage" mails to SPOCs, through Brevo.
//
// Settings (server/.env — never in the code, never in GitHub):
//   BREVO_API_KEY         the Brevo API key (starts with xkeysib-)
//   MAIL_FROM_EMAIL       a sender you have verified in Brevo (Settings -> Senders, domains & IPs)
//   MAIL_FROM_NAME        optional, shown as the sender's name (default "NSNOP CRM")
//   MAIL_REPLY_TO         optional, where replies go
//   MAIL_ALLOWED_DOMAINS  optional, e.g. "mbyom.com" — mail may then only go to those domains
//                         (strongly recommended: the dashboard has no login, so anyone who can
//                         open it can use this to send mail)
//   MAIL_DAILY_LIMIT      optional, most mails per day through the dashboard (default 200)
// The Brevo SMTP key is not needed: the API key is used.

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const EMAILS_FILE = path.join(DATA_DIR, "spoc-emails.json");
const LOG_FILE = path.join(DATA_DIR, "mail-log.jsonl");
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export const LIMITS = { recipients: 50, dealsPerRecipient: 300, subject: 200, body: 30000, cc: 5 };

/* ───────────────────────── small helpers ───────────────────────── */

export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const isEmail = (s) => {
  const v = String(s || "").trim();
  return v.length <= 254 && /^[^\s@<>()[\]\\",;:]+@[^\s@<>()[\]\\",;:]+\.[^\s@<>()[\]\\",;:]{2,}$/.test(v);
};

const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const crore = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr(v);
};

// calendar day (Asia/Kolkata) of an ISO timestamp -> "YYYY-MM-DD"
const istDay = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? null : d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};
const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};
// whole calendar days between a timestamp and now, counted on the Asia/Kolkata calendar
const dayNumber = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const daysSince = (iso, now = new Date()) => {
  const a = istDay(iso);
  const b = istDay(now.toISOString());
  if (!a || !b) return null;
  return Math.max(0, dayNumber(b) - dayNumber(a));
};
const agoText = (days) => (days == null ? "" : days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`);

/* ───────────────────────── configuration ───────────────────────── */

const allowedDomains = () =>
  String(process.env.MAIL_ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

// What the dashboard may show (never the key itself).
export function mailStatus() {
  const configured = !!(process.env.BREVO_API_KEY && isEmail(process.env.MAIL_FROM_EMAIL));
  return {
    configured,
    fromEmail: isEmail(process.env.MAIL_FROM_EMAIL) ? process.env.MAIL_FROM_EMAIL.trim() : null,
    fromName: process.env.MAIL_FROM_NAME || "NSNOP CRM",
    allowedDomains: allowedDomains(),
    missing: [!process.env.BREVO_API_KEY && "BREVO_API_KEY", !isEmail(process.env.MAIL_FROM_EMAIL) && "MAIL_FROM_EMAIL"].filter(Boolean),
  };
}

// null when the address may be used, otherwise why not
export function addressProblem(email) {
  if (!isEmail(email)) return `"${String(email).slice(0, 60)}" is not a valid email address`;
  const domains = allowedDomains();
  if (domains.length && !domains.includes(String(email).trim().toLowerCase().split("@")[1])) {
    return `${email} is outside the allowed domains (${domains.join(", ")})`;
  }
  return null;
}

/* ───────────────────────── saved SPOC email addresses ───────────────────────── */

let emailCache = null;
function loadEmails() {
  if (emailCache) return emailCache;
  try {
    emailCache = JSON.parse(fs.readFileSync(EMAILS_FILE, "utf8"));
  } catch {
    emailCache = {};
  }
  return emailCache;
}
export const getSpocEmails = () => ({ ...loadEmails() });

// Saves (or, with an empty email, forgets) one SPOC's address.
export function saveSpocEmail(spoc, email) {
  const all = loadEmails();
  const key = String(spoc || "").trim();
  if (!key) throw Object.assign(new Error("spoc is required"), { status: 400 });
  if (String(email || "").trim() === "") delete all[key];
  else {
    const problem = addressProblem(email);
    if (problem) throw Object.assign(new Error(problem), { status: 400 });
    all[key] = String(email).trim();
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(`${EMAILS_FILE}.tmp`, JSON.stringify(all, null, 2));
  fs.renameSync(`${EMAILS_FILE}.tmp`, EMAILS_FILE);
  return { ...all };
}

/* ───────────────────────── the message body: keep it safe ───────────────────────── */

const ALLOWED_TAGS = ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "div", "span"];
const DROP_WITH_CONTENT = "script|style|iframe|object|embed|svg|math|template|noscript";

// The body is typed in the browser (contenteditable), so it is cleaned here before it goes
// into an email: only simple formatting survives, links must be http(s)/mailto, and
// everything else (scripts, styles, event handlers, other tags) is removed.
export function sanitizeBody(input) {
  let s = String(input ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(new RegExp(`<(${DROP_WITH_CONTENT})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "");
  s = s.replace(new RegExp(`<\\/?(${DROP_WITH_CONTENT}|link|meta|base|form|input|button|textarea|select)\\b[^>]*>`, "gi"), "");
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, close, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return "";
    if (close) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const m = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const href = (m ? m[1] ?? m[2] : "").trim();
      // quotes and angle brackets are escaped; "&" is left alone because the browser already wrote entities as &amp;
      const safeHref = href.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${safeHref}" style="color:#0b57d0" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${tag}>`;
  });
  // a "<" that is not part of a tag we kept is just text
  s = s.replace(new RegExp(`<(?!\\/?(?:${ALLOWED_TAGS.join("|")})\\b)`, "gi"), "&lt;");
  return s;
}

/* ───────────────────────── building one SPOC's email ───────────────────────── */

// rows: [{ account, amount, createdTime, stage, platform, kam }]
export function buildTableHtml(rows, now = new Date()) {
  const th = (t, align = "left") =>
    `<th align="${align}" style="padding:10px 12px;background:#0f1b3d;color:#ffffff;font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;text-align:${align};white-space:nowrap">${t}</th>`;
  const body = rows
    .map((r, i) => {
      const days = r.createdTime ? daysSince(r.createdTime, now) : null;
      const bg = i % 2 ? "#f4f6fb" : "#ffffff";
      const td = (inner, extra = "") => `<td style="padding:10px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e6ebf3;background:${bg};vertical-align:top;${extra}">${inner}</td>`;
      return `<tr>${td(i + 1, "color:#94a3b8;")}${td(`<strong style="color:#0f1b3d">${esc(r.account)}</strong>`)}${td(esc(inr(r.amount)), "text-align:right;white-space:nowrap;")}${td(
        r.createdTime ? `${esc(fmtDate(r.createdTime))}<div style="color:#ef4444;font-size:12px;margin-top:2px">${esc(agoText(days))}</div>` : "—",
        "white-space:nowrap;"
      )}${td(esc(r.stage || "—"))}${td(esc(r.platform || "—"))}</tr>`;
    })
    .join("");
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #e6ebf3;border-radius:10px;overflow:hidden;margin:12px 0">` +
    `<thead><tr>${th("#")}${th("Donor")}${th("Amount", "right")}${th("Created")}${th("Stage")}${th("Platform")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="6" style="padding:10px 12px;font-size:13px;color:#475569;background:#f8fafc">${rows.length} donor${rows.length === 1 ? "" : "s"} · total ${esc(inr(total))}</td></tr></tfoot>` +
    `</table>`
  );
}

// {{spoc}} {{count}} {{total}} {{donors}} {{table}} in a template or in what you typed
function fillTokens(text, ctx, asHtml) {
  // braces are neutralised so a donor's name can never act as a {{token}} itself
  const val = (v) => (asHtml ? esc(v) : String(v)).replace(/\{\{/g, asHtml ? "&#123;&#123;" : "{ {");
  return String(text)
    .replace(/\{\{\s*spoc\s*\}\}/gi, () => val(ctx.spoc))
    .replace(/\{\{\s*count\s*\}\}/gi, () => String(ctx.count))
    .replace(/\{\{\s*total\s*\}\}/gi, () => val(ctx.total))
    .replace(/\{\{\s*donors\s*\}\}/gi, () => val(ctx.donorNames));
}

const TABLE_TOKEN = /\{\{\s*table\s*\}\}/gi;

function htmlToText(html) {
  return String(html)
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#123;/g, "{")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildEmail({ subject, bodyHtml, includeTable = true, spoc, rows, fromName = "NSNOP CRM", now = new Date() }) {
  const ctx = {
    spoc,
    count: rows.length,
    total: crore(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
    donorNames: rows.map((r) => r.account).join(", "),
  };
  const table = buildTableHtml(rows, now);
  const safe = sanitizeBody(bodyHtml);
  const filled = fillTokens(safe, ctx, true); // the words, with {{table}} still a marker
  const placed = TABLE_TOKEN.test(filled);
  TABLE_TOKEN.lastIndex = 0;
  const inner = placed ? filled.replace(TABLE_TOKEN, () => table) : includeTable ? `${filled}${table}` : filled;

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb">` +
    `<div style="background:#f4f6fb;padding:24px 12px;font-family:Inter,Segoe UI,Arial,sans-serif">` +
    `<div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6ebf3">` +
    `<div style="background:#0f1b3d;color:#ffffff;padding:18px 24px;font-size:16px;font-weight:600">Donor follow-up</div>` +
    `<div style="padding:24px;font-size:15px;line-height:1.6;color:#1f2937">${inner}</div>` +
    `<div style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px">Sent from the ${esc(fromName)} dashboard.</div>` +
    `</div></div></body></html>`;

  return {
    subject: fillTokens(String(subject).replace(/[\r\n]+/g, " "), ctx, false).trim(),
    html,
    text: htmlToText(filled.replace(TABLE_TOKEN, "")) + "\n\n" + rows.map((r, i) => `${i + 1}. ${r.account} — ${inr(r.amount)} — ${r.stage || "—"}${r.createdTime ? ` — created ${fmtDate(r.createdTime)} (${agoText(daysSince(r.createdTime, now))})` : ""}`).join("\n"),
  };
}

/* ───────────────────────── sending through Brevo ───────────────────────── */

let counter = { day: null, count: 0 };
export function dailyAllowance(want) {
  const limit = Number(process.env.MAIL_DAILY_LIMIT) > 0 ? Number(process.env.MAIL_DAILY_LIMIT) : 200;
  const today = new Date().toISOString().slice(0, 10);
  if (counter.day !== today) counter = { day: today, count: 0 };
  return { limit, used: counter.count, ok: counter.count + want <= limit };
}

function brevoProblem(err) {
  const status = err.response?.status;
  const msg = err.response?.data?.message || err.message || "unknown error";
  if (status === 401) return `Brevo rejected the API key (${msg}). Check BREVO_API_KEY in server/.env — it should start with xkeysib-.`;
  if (/sender/i.test(msg)) return `Brevo says the sender isn't valid (${msg}). Verify ${process.env.MAIL_FROM_EMAIL || "MAIL_FROM_EMAIL"} under Senders, domains & IPs in Brevo.`;
  if (status === 402 || status === 403) return `Brevo refused the request (${msg}). The account may be out of sending credit or the IP is not allowed.`;
  return `Brevo error${status ? ` ${status}` : ""}: ${msg}`;
}

export async function sendViaBrevo({ to, toName, cc, subject, html, text }) {
  const cfg = mailStatus();
  if (!cfg.configured) throw Object.assign(new Error(`Mail isn't set up yet: add ${cfg.missing.join(" and ")} to server/.env and restart the server.`), { status: 503 });
  const payload = {
    sender: { name: cfg.fromName, email: cfg.fromEmail },
    to: [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject,
    htmlContent: html,
    textContent: text,
  };
  if (cc?.length) payload.cc = cc.map((email) => ({ email }));
  if (isEmail(process.env.MAIL_REPLY_TO)) payload.replyTo = { email: process.env.MAIL_REPLY_TO.trim() };
  try {
    const res = await axios.post(BREVO_URL, payload, {
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      timeout: 20000,
    });
    counter.count += 1;
    return { messageId: res.data?.messageId || null };
  } catch (err) {
    throw Object.assign(new Error(brevoProblem(err)), { status: err.response?.status || 502 });
  }
}

export function logMail(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    // the log is a convenience; never fail a send because of it
  }
}