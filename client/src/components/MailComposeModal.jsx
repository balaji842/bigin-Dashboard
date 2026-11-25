import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAIL_TEMPLATES, MAIL_TOKENS } from "../lib/mailTemplates.js";

// "New Message" — a Gmail-style compose window for mailing SPOCs about the donors you
// ticked in a Pipeline popup. One email goes to each SPOC, with only THEIR donors.
//
//   Type manually / Use template   write your own, or pick one and edit it
//   To                             one chip per SPOC; type the address once — it is remembered
//   Cc                             optional, added to every mail
//   Message                        bold / italic / underline / list / link, plus {{tokens}}
//   Add the donor table            each SPOC's donors as a table (or place {{table}} yourself)
//   Preview                        the real email for the first SPOC, exactly as it will be sent
//
// `recipients` is [{ spoc, dealIds, donors }]. Sending is done by the server (Brevo); the
// donors in each mail are looked up there, not taken from the browser.

const BLUE = "#0b57d0";
const looksLikeEmail = (s) => /^[^\s@<>()[\]\\",;:]+@[^\s@<>()[\]\\",;:]+\.[^\s@<>()[\]\\",;:]{2,}$/.test(String(s || "").trim());
const hasText = (html) => !!String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

const Svg = ({ children, size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
);
const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
const IconMin = (p) => (
  <Svg {...p}>
    <path d="M5 19h10" />
  </Svg>
);
const IconPen = (p) => (
  <Svg size={16} {...p}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Svg>
);
const IconDoc = (p) => (
  <Svg size={16} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Svg>
);
const IconTrash = (p) => (
  <Svg size={20} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
const IconEye = (p) => (
  <Svg size={18} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const IconLink = (p) => (
  <Svg size={19} {...p}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Svg>
);
const IconList = (p) => (
  <Svg size={19} {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Svg>
);
const IconWarn = (p) => (
  <Svg size={22} stroke="#d93025" {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.5" />
  </Svg>
);

function ToolButton({ label, onClick, children, active }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // keep the caret in the message while a formatting button is pressed
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full text-[#444746] hover:bg-black/[0.07] ${active ? "bg-black/[0.07]" : ""}`}
    >
      {children}
    </button>
  );
}

export default function MailComposeModal({ open, onClose, recipients, skipped = 0, onSent }) {
  const [setup, setSetup] = useState(null); // { configured, fromEmail, fromName, missing, emails, allowedDomains }
  const [setupError, setSetupError] = useState(null);
  const [chips, setChips] = useState([]); // [{ spoc, dealIds, count, email }]
  const [mode, setMode] = useState("manual"); // "manual" | "template"
  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [includeTable, setIncludeTable] = useState(true);
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null); // text shown in the red bar
  const [sentSpocs, setSentSpocs] = useState({}); // spoc -> true (already sent in an earlier try)
  const [failures, setFailures] = useState({}); // spoc -> error text
  const [preview, setPreview] = useState(null); // null | { spoc, loading, html, subject, error }
  const editor = useRef(null);
  const shell = useRef(null);
  const bodyRef = useRef(""); // the message as last typed — the editor is removed from the page while previewing or minimised

  // ── open / reset ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;
    setMode("manual");
    setTemplateKey("");
    setSubject("");
    setBodyHtml("");
    setIncludeTable(true);
    setShowCc(false);
    setCc("");
    setMinimized(false);
    setSending(false);
    setProblem(null);
    setSentSpocs({});
    setFailures({});
    setPreview(null);
    bodyRef.current = "";
    setChips(recipients.map((r) => ({ spoc: r.spoc, dealIds: r.dealIds, count: r.dealIds.length, email: "" })));
    if (editor.current) editor.current.innerHTML = "";
    let cancelled = false;
    setSetup(null);
    setSetupError(null);
    fetch("/api/crm-analysis/mail/setup")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((s) => {
        if (cancelled) return;
        setSetup(s);
        // fill in the addresses we already know, without overwriting anything typed meanwhile
        setChips((prev) => prev.map((c) => (c.email ? c : { ...c, email: s.emails?.[c.spoc] || "" })));
      })
      .catch((e) => !cancelled && setSetupError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close (✕, Esc, the bin). Asks first if a message has been started.
  const close = useCallback(() => {
    if (sending) return;
    const started = hasText(bodyRef.current) || subject.trim() !== "";
    if (started && !Object.keys(sentSpocs).length && !window.confirm("Discard this message?")) return;
    onClose();
  }, [sending, onClose, subject, sentSpocs]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ── the message ──────────────────────────────────────────────────────────────
  const syncBody = () => {
    const html = editor.current ? editor.current.innerHTML : bodyRef.current;
    bodyRef.current = html;
    setBodyHtml(html);
  };
  // the editor comes back empty after Preview / minimise — put the message back
  useEffect(() => {
    if (open && !preview && !minimized && editor.current && editor.current.innerHTML !== bodyRef.current) editor.current.innerHTML = bodyRef.current;
  }, [open, preview, minimized]);
  const chooseMode = (m) => {
    setMode(m);
    if (m === "manual") setTemplateKey("");
  };
  const chooseTemplate = (key) => {
    setTemplateKey(key);
    const t = MAIL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setSubject(t.subject);
    if (editor.current) editor.current.innerHTML = t.body;
    bodyRef.current = t.body;
    setBodyHtml(t.body);
  };
  const run = (command, value) => {
    editor.current?.focus();
    // execCommand is old but it is the simplest way to format a contenteditable
    if (typeof document.execCommand === "function") document.execCommand(command, false, value);
    syncBody();
  };
  const addLink = () => {
    const url = window.prompt("Link address (starting with https://)");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      setProblem("A link must start with https:// (or mailto:).");
      return;
    }
    run("createLink", url.trim());
  };
  const insertToken = (t) => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && (!sel.anchorNode || !el.contains(sel.anchorNode))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (typeof document.execCommand === "function") document.execCommand(t.block ? "insertHTML" : "insertText", false, t.block ? `<div>${t.token}</div>` : t.token);
    else el.innerHTML += t.block ? `<div>${t.token}</div>` : t.token;
    syncBody();
  };

  // ── recipients ───────────────────────────────────────────────────────────────
  const setEmail = (spoc, email) => setChips((prev) => prev.map((c) => (c.spoc === spoc ? { ...c, email } : c)));
  const removeChip = (spoc) => setChips((prev) => prev.filter((c) => c.spoc !== spoc));
  // remember a valid address as soon as you leave its box
  const rememberEmail = (spoc, email) => {
    const clean = email.trim();
    if (!looksLikeEmail(clean) || setup?.emails?.[spoc] === clean) return;
    fetch("/api/crm-analysis/mail/spoc-email", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spoc, email: clean }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setSetup((s) => (s ? { ...s, emails: j.emails } : s));
        else setProblem(`${spoc}: ${j.error}`);
      })
      .catch(() => {});
  };

  const todo = useMemo(() => chips.filter((c) => !sentSpocs[c.spoc]), [chips, sentSpocs]);
  const ccList = useMemo(() => cc.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean), [cc]);
  const donorCount = todo.reduce((n, c) => n + c.count, 0);
  const bodyHasTable = /\{\{\s*table\s*\}\}/i.test(bodyHtml);
  const request = (list) => ({ subject, body: editor.current ? editor.current.innerHTML : bodyRef.current, includeTable, cc: ccList, recipients: list.map((c) => ({ spoc: c.spoc, email: c.email.trim(), dealIds: c.dealIds })) });

  // ── preview ──────────────────────────────────────────────────────────────────
  const openPreview = async (spoc) => {
    syncBody();
    const chip = todo.find((c) => c.spoc === spoc) || todo[0];
    if (!chip) return;
    if (!subject.trim()) return setProblem("Enter a subject first.");
    if (!hasText(editor.current ? editor.current.innerHTML : bodyRef.current)) return setProblem("Write a message, or pick a template, first.");
    setProblem(null);
    setPreview({ spoc: chip.spoc, loading: true });
    try {
      const r = await fetch("/api/crm-analysis/mail/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request([chip])) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setPreview({ spoc: chip.spoc, loading: false, html: j.html, subject: j.subject, donors: j.donors });
    } catch (e) {
      setPreview({ spoc: chip.spoc, loading: false, error: e.message });
    }
  };

  // ── send ─────────────────────────────────────────────────────────────────────
  const send = async () => {
    if (sending) return;
    setProblem(null);
    if (!setup?.configured) return setProblem(setup ? `Mail isn't set up yet: add ${setup.missing.join(" and ")} to server/.env and restart the server.` : "Still checking the mail settings — try again in a moment.");
    if (todo.length === 0) return setProblem("Add at least one recipient.");
    const bad = todo.find((c) => !looksLikeEmail(c.email));
    if (bad) return setProblem(`Type ${bad.spoc}'s email address in the To box.`);
    if (!subject.trim()) return setProblem("Enter a subject.");
    if (!hasText(editor.current ? editor.current.innerHTML : bodyRef.current)) return setProblem("Write a message, or pick a template.");
    const badCc = ccList.find((x) => !looksLikeEmail(x));
    if (badCc) return setProblem(`"${badCc}" in Cc is not a valid email address.`);

    setSending(true);
    try {
      const r = await fetch("/api/crm-analysis/mail/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request(todo)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const sentNow = {};
      const failedNow = {};
      for (const res of j.results) (res.ok ? sentNow : failedNow)[res.spoc] = res.ok ? true : res.error;
      setSentSpocs((prev) => ({ ...prev, ...sentNow }));
      setFailures(failedNow);
      if (j.failed === 0) {
        onSent?.({ sent: j.sent, results: j.results });
        onClose();
      } else {
        setProblem(j.sent > 0 ? `Sent to ${j.sent}, but ${j.failed} failed. Fix the ones marked in red and press Send again — the ones already sent won't be sent twice.` : "Nothing was sent. See the reason on each recipient.");
      }
    } catch (e) {
      setProblem(e.message);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        send();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const notReady = setup && !setup.configured;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(10,15,35,0.55)] p-4" onMouseDown={(e) => e.stopPropagation()}>
      <div
        ref={shell}
        role="dialog"
        aria-label="New Message"
        className={`flex w-full max-w-[820px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,0.4)] ${minimized ? "" : "h-[min(700px,calc(100vh-2rem))]"}`}
        style={{ fontFamily: "'Google Sans', Inter, system-ui, sans-serif" }}
      >
        {/* title bar */}
        <div className="flex items-center gap-1.5 bg-[#eef3fc] px-6 py-3.5 text-base font-medium text-[#041e49]">
          <span className="flex-1">New Message</span>
          <button type="button" aria-label="Minimize" onClick={() => setMinimized((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full text-[#444746] hover:bg-black/[0.07]">
            <IconMin size={16} />
          </button>
          <button type="button" aria-label="Close" onClick={close} disabled={sending} className="grid h-9 w-9 place-items-center rounded-full text-[#444746] hover:bg-black/[0.07] disabled:opacity-40">
            <IconClose />
          </button>
        </div>

        {!minimized && (
          <>
            <div className="flex min-h-0 flex-1 flex-col px-6">
              {/* problems and set-up notices */}
              {(setupError || notReady) && (
                <div className="-mx-6 flex items-start gap-3 bg-[#fce8e6] px-6 py-3 text-sm text-[#1f1f1f]" role="alert">
                  <IconWarn />
                  <div>
                    {setupError ? (
                      <>
                        <b>Can't reach the server.</b> Mail can't be sent right now ({setupError}).
                      </>
                    ) : (
                      <>
                        <b>Mail isn't set up yet.</b> Add {setup.missing.join(" and ")} to <code>server/.env</code> and restart the server (see the notes that came with this feature). You can still write and preview your message.
                      </>
                    )}
                  </div>
                </div>
              )}
              {skipped > 0 && (
                <div className="-mx-6 bg-[#fef7e0] px-6 py-2 text-[13px] text-[#5f4b00]">
                  {skipped} selected donor{skipped === 1 ? " has" : "s have"} no SPOC set, so {skipped === 1 ? "it is" : "they are"} left out.
                </div>
              )}

              {preview ? (
                <div className="flex min-h-0 flex-1 flex-col pb-2 pt-3" data-preview>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <button type="button" onClick={() => setPreview(null)} className="rounded-full border border-[#dadce0] px-3.5 py-1.5 font-medium text-[#041e49] hover:bg-slate-50">
                      ← Back to editing
                    </button>
                    {todo.length > 1 && (
                      <label className="flex items-center gap-2 text-[#5f6368]">
                        Preview for
                        <select value={preview.spoc} onChange={(e) => openPreview(e.target.value)} className="rounded-lg border border-[#dadce0] px-2 py-1 text-[#1f1f1f]">
                          {todo.map((c) => (
                            <option key={c.spoc} value={c.spoc}>
                              {c.spoc}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {preview.subject && (
                      <span className="min-w-0 truncate text-[#5f6368]">
                        Subject: <b className="text-[#1f1f1f]">{preview.subject}</b>
                      </span>
                    )}
                  </div>
                  {preview.loading && <p className="py-10 text-center text-sm text-[#5f6368]">Building the preview…</p>}
                  {preview.error && <p className="rounded-lg bg-[#fce8e6] px-4 py-3 text-sm text-[#a50e0e]">{preview.error}</p>}
                  {preview.html && <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="min-h-0 w-full flex-1 rounded-xl border border-[#e8eaed]" />}
                </div>
              ) : (
                <>
                  {/* Type manually / Use template */}
                  <div className="flex gap-1.5 pb-3 pt-3.5" role="tablist">
                    <button type="button" role="tab" aria-selected={mode === "manual"} data-mode="manual" onClick={() => chooseMode("manual")} className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${mode === "manual" ? "border-[#d3e3fd] bg-[#d3e3fd] font-medium text-[#041e49]" : "border-[#dadce0] bg-white text-[#444746]"}`}>
                      <IconPen /> Type manually
                    </button>
                    <button type="button" role="tab" aria-selected={mode === "template"} data-mode="template" onClick={() => chooseMode("template")} className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${mode === "template" ? "border-[#d3e3fd] bg-[#d3e3fd] font-medium text-[#041e49]" : "border-[#dadce0] bg-white text-[#444746]"}`}>
                      <IconDoc /> Use template
                    </button>
                  </div>

                  {setup?.fromEmail && (
                    <div className="flex min-h-[40px] items-center gap-2.5 border-b border-[#e8eaed] text-[15px]">
                      <span className="text-[#5f6368]">From</span>
                      <span className="text-[#1f1f1f]">
                        {setup.fromName} <span className="text-[#5f6368]">&lt;{setup.fromEmail}&gt;</span>
                      </span>
                    </div>
                  )}

                  {/* To */}
                  <div className="flex min-h-[46px] items-start gap-2.5 border-b border-[#e8eaed] text-[15px]">
                    <span className="pt-3 text-[#5f6368]">To</span>
                    <div className="flex max-h-[120px] flex-1 flex-wrap gap-1.5 overflow-auto py-2" data-chips>
                      {chips.length === 0 && <span className="py-1 text-[#80868b]">No recipients — close this window and tick some donors.</span>}
                      {chips.map((c) => {
                        const missing = !c.email.trim();
                        const invalid = !!c.email.trim() && !looksLikeEmail(c.email);
                        const sent = !!sentSpocs[c.spoc];
                        const failed = failures[c.spoc];
                        return (
                          <span
                            key={c.spoc}
                            data-chip={c.spoc}
                            title={failed || `${c.count} donor${c.count === 1 ? "" : "s"} for ${c.spoc}`}
                            className={`inline-flex items-center gap-2 rounded-full border py-[3px] pl-1.5 pr-1.5 text-[13.5px] ${failed ? "border-[#d93025] bg-[#fce8e6]" : sent ? "border-[#188038] bg-[#e6f4ea]" : missing || invalid ? "border-[#f9ab00] bg-[#fef7e0]" : "border-[#dadce0] bg-white"}`}
                          >
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0b57d0] text-xs font-semibold uppercase text-white">{c.spoc.slice(0, 1)}</span>
                            <span className="font-medium text-[#1f1f1f]">{c.spoc}</span>
                            <span className="text-xs text-[#5f6368]">· {c.count} donor{c.count === 1 ? "" : "s"}</span>
                            {sent ? (
                              <span className="text-xs font-semibold text-[#188038]">✓ sent</span>
                            ) : (
                              <input
                                type="email"
                                aria-label={`${c.spoc}'s email address`}
                                value={c.email}
                                placeholder="add email address"
                                disabled={sending}
                                onChange={(e) => setEmail(c.spoc, e.target.value)}
                                onBlur={(e) => rememberEmail(c.spoc, e.target.value)}
                                className={`w-[190px] border-0 bg-transparent px-1 py-0.5 text-[13px] outline-none ${invalid ? "text-[#d93025]" : "text-[#1f1f1f]"} placeholder:text-[#b06000]`}
                              />
                            )}
                            {!sent && (
                              <button type="button" aria-label={`Remove ${c.spoc}`} onClick={() => removeChip(c.spoc)} disabled={sending} className="grid h-5 w-5 place-items-center rounded-full text-base leading-none text-[#5f6368] hover:bg-[#e8eaed]">
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => setShowCc((v) => !v)} className="pt-3 text-sm text-[#444746] hover:underline" aria-expanded={showCc}>
                      Cc
                    </button>
                  </div>
                  {Object.keys(failures).length > 0 && (
                    <ul className="border-b border-[#e8eaed] py-2 text-[13px] text-[#a50e0e]">
                      {Object.entries(failures).map(([spoc, why]) => (
                        <li key={spoc}>
                          <b>{spoc}:</b> {why}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showCc && (
                    <div className="flex min-h-[46px] items-center gap-2.5 border-b border-[#e8eaed] text-[15px]">
                      <label htmlFor="mail-cc" className="text-[#5f6368]">
                        Cc
                      </label>
                      <input id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="addresses, separated by commas (added to every mail)" className="flex-1 border-0 bg-transparent py-2.5 text-[#1f1f1f] outline-none" />
                    </div>
                  )}

                  {/* template picker */}
                  {mode === "template" && (
                    <div className="flex min-h-[46px] items-center gap-2.5 border-b border-[#e8eaed] text-[15px]">
                      <label htmlFor="mail-template" className="text-[#5f6368]">
                        Template
                      </label>
                      <select id="mail-template" value={templateKey} onChange={(e) => chooseTemplate(e.target.value)} className="flex-1 cursor-pointer border-0 bg-transparent py-2.5 text-[#1f1f1f] outline-none">
                        <option value="">Select a template…</option>
                        {MAIL_TEMPLATES.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex min-h-[46px] items-center border-b border-[#e8eaed]">
                    <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1 border-0 bg-transparent py-2.5 text-[15px] text-[#1f1f1f] outline-none" />
                  </div>

                  <div
                    ref={editor}
                    role="textbox"
                    aria-label="Message"
                    aria-multiline="true"
                    contentEditable
                    suppressContentEditableWarning
                    data-ph="Write your message…"
                    onInput={syncBody}
                    onBlur={syncBody}
                    className="min-h-[120px] flex-1 overflow-auto py-4 text-[15px] leading-relaxed text-[#1f1f1f] outline-none empty:before:text-[#80868b] empty:before:content-[attr(data-ph)] [&_a]:text-[#0b57d0] [&_a]:underline [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:ml-6 [&_ul]:list-disc"
                  />

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2 text-[12.5px] text-[#5f6368]">
                    <span>Insert:</span>
                    {MAIL_TOKENS.map((t) => (
                      <button key={t.token} type="button" title={t.hint} data-token={t.token} onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(t)} className="rounded-full border border-[#dadce0] bg-white px-2.5 py-0.5 font-mono text-[12px] text-[#041e49] hover:bg-[#eef3fc]">
                        {t.token}
                      </button>
                    ))}
                    <label className="ml-auto flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={includeTable} onChange={(e) => setIncludeTable(e.target.checked)} disabled={bodyHasTable} className="h-4 w-4 accent-[#0b57d0]" />
                      {bodyHasTable ? "The donor table goes where you put {{table}}" : "Add the donor table below my message"}
                    </label>
                  </div>
                </>
              )}

              {problem && (
                <div className="-mx-6 bg-[#f1f1f1] px-6 py-3 text-sm text-[#1f1f1f]" role="alert" data-problem>
                  <span className="font-semibold text-[#d93025]">!</span> {problem}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center gap-1 px-6 pb-4 pt-3.5">
              <button
                type="button"
                onClick={send}
                disabled={sending || todo.length === 0}
                data-send
                title="Send (Ctrl+Enter)"
                className="mr-2.5 flex h-11 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-white disabled:opacity-60"
                style={{ background: BLUE }}
              >
                {sending ? "Sending…" : `Send${todo.length > 1 ? ` to ${todo.length}` : ""}`}
                {!sending && todo.length > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs" title={`${donorCount} donor${donorCount === 1 ? "" : "s"} across the mails`}>
                    {donorCount} donor{donorCount === 1 ? "" : "s"}
                  </span>
                )}
              </button>
              {!preview && (
                <>
                  <ToolButton label="Bold" onClick={() => run("bold")}>
                    <b style={{ fontSize: 16 }}>B</b>
                  </ToolButton>
                  <ToolButton label="Italic" onClick={() => run("italic")}>
                    <i style={{ fontSize: 16, fontFamily: "serif" }}>I</i>
                  </ToolButton>
                  <ToolButton label="Underline" onClick={() => run("underline")}>
                    <u style={{ fontSize: 16 }}>U</u>
                  </ToolButton>
                  <ToolButton label="Bulleted list" onClick={() => run("insertUnorderedList")}>
                    <IconList />
                  </ToolButton>
                  <ToolButton label="Insert link" onClick={addLink}>
                    <IconLink />
                  </ToolButton>
                </>
              )}
              <button type="button" onClick={() => (preview ? setPreview(null) : openPreview(todo[0]?.spoc))} disabled={todo.length === 0} data-preview-btn className="ml-1 flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-[#444746] hover:bg-black/[0.07] disabled:opacity-40">
                <IconEye /> {preview ? "Edit" : "Preview"}
              </button>
              <span className="flex-1" />
              <ToolButton label="Discard" onClick={close}>
                <IconTrash />
              </ToolButton>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}