import { useEffect, useRef, useState } from "react";

const HISTORY_KEY = "smartAiChatHistory";
const MAX_SAVED_SESSIONS = 20;

const GREETING = {
  role: "assistant",
  content: "Hello! 👋 I'm your Smart Ai Assistant. Ask me anything about your CRM data.",
};

const EXPORT_INTENT_RE = /\b(excel|xlsx|csv|export|download|spreadsheet|data dump)\b/i;
const SCOPE_LAPSED_RE = /\b(not\s+donat\w*|didn'?t\s+donat\w*|didn'?t\s+conv\w*|not\s+conv\w*|lapsed|churn\w*|stopped\s+giving|missing\s+donors?)\b/i;
const SCOPE_CLOSED_RE = /\b(closed|converted|conversion)\b/i;
const SCOPE_PIPELINE_RE = /\b(pipeline|open deals?)\b/i;

const LAPSED_FY1 = "2025-2026";
const LAPSED_FY2 = "2026-2027";

const FY_TOKEN_RE = /\b(20\d{2})\s*[-/]\s*(\d{2,4})\b/g;
const NEGATION_RE = /\b(not|didn'?t|excluding|except|without)\b/i;
const POSITIVE_VERB_RE = /\b(donated|gave|converted|contributed)\b/i;

function normalizeFY(y1, y2raw) {
  const y2 = y2raw.length === 2 ? y1.slice(0, 2) + y2raw : y2raw;
  return `${y1}-${y2}`;
}

function parseYearFilter(text) {
  const tokens = [];
  let match;
  FY_TOKEN_RE.lastIndex = 0;
  while ((match = FY_TOKEN_RE.exec(text)) !== null) {
    tokens.push({ fy: normalizeFY(match[1], match[2]), index: match.index, end: match.index + match[0].length });
  }
  if (tokens.length === 0) return null;

  const include = [];
  const exclude = [];
  let mode = "include";
  let cursor = 0;

  tokens.forEach((t) => {
    const segment = text.slice(cursor, t.index);
    if (NEGATION_RE.test(segment)) {
      mode = "exclude";
    } else if (POSITIVE_VERB_RE.test(segment)) {
      mode = "include";
    }
    (mode === "exclude" ? exclude : include).push(t.fy);
    cursor = t.end;
  });

  return { include: [...new Set(include)], exclude: [...new Set(exclude)] };
}

const SCOPE_LABELS = { all: "All deals", closed: "Closed/converted deals", pipeline: "Open pipeline deals" };

function buildExportRequest(text) {
  const yearFilter = parseYearFilter(text);
  if (yearFilter && yearFilter.include.length > 0) {
    return { scope: "yearFilter", include: yearFilter.include, exclude: yearFilter.exclude };
  }
  if (SCOPE_LAPSED_RE.test(text)) return { scope: "lapsed" };
  if (SCOPE_CLOSED_RE.test(text)) return { scope: "closed" };
  if (SCOPE_PIPELINE_RE.test(text)) return { scope: "pipeline" };
  return { scope: "all" };
}

function describeExport(request) {
  if (request.scope === "yearFilter") {
    const incl = request.include.join(", ");
    const excl = request.exclude.length ? ` and NOT in ${request.exclude.join(", ")}` : "";
    return `Donors who gave in ${incl}${excl}`;
  }
  if (request.scope === "lapsed") {
    return `Donors from FY ${LAPSED_FY1} who didn't give in FY ${LAPSED_FY2}`;
  }
  return SCOPE_LABELS[request.scope] || "All deals";
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_SAVED_SESSIONS)));
  } catch {
    /* localStorage full or unavailable — history just won't persist */
  }
}

function splitIntoLines(text) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\s*(?=\d+\.\s+\*\*)/g, "\n")
    .replace(/\s*(?=\*\s+\*\*)/g, "\n")
    .replace(/^\n+/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function renderInline(line) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function isTableRow(line) {
  return /^\|.*\|$/.test(line.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function MarkdownTable({ rows }) {
  let bodyRows = rows;
  let header = null;
  if (rows.length > 1 && isSeparatorRow(rows[1])) {
    header = rows[0];
    bodyRows = rows.slice(2);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 my-1">
      <table className="w-full text-xs">
        {header && (
          <thead>
            <tr className="bg-slate-100">
              {header.map((h, hi) => (
                <th key={hi} className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? "bg-slate-50" : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1.5 whitespace-nowrap">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageContent({ content }) {
  const lines = splitIntoLines(content);

  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i])) {
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", rows: tableLines });
    } else {
      blocks.push({ type: "text", line: lines[i] });
      i++;
    }
  }

  return (
    <div className="space-y-1 whitespace-pre-wrap break-words">
      {blocks.map((block, bi) =>
        block.type === "table" ? (
          <MarkdownTable key={bi} rows={block.rows} />
        ) : (
          <p key={bi}>{renderInline(block.line)}</p>
        )
      )}
    </div>
  );
}

function ExportLinks({ request }) {
  const download = (format) => {
    if (request.scope === "yearFilter") {
      const params = new URLSearchParams({
        format,
        include: request.include.join(","),
        exclude: request.exclude.join(","),
      });
      window.location.href = `/api/export/donor-filter?${params.toString()}`;
    } else if (request.scope === "lapsed") {
      window.location.href = `/api/export/lapsed-donors?format=${format}&fy1=${LAPSED_FY1}&fy2=${LAPSED_FY2}`;
    } else {
      window.location.href = `/api/export/deals?format=${format}&scope=${request.scope}`;
    }
  };

  return (
    <div>
      <p className="mb-2">Here's your export — {describeExport(request).toLowerCase()}:</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => download("csv")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          ⬇ Download CSV
        </button>
        <button
          type="button"
          onClick={() => download("xlsx")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          ⬇ Download Excel
        </button>
      </div>
    </div>
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([GREETING]);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState(loadHistory);
  const [viewingSessionId, setViewingSessionId] = useState(null);

  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const messagesEndRef = useRef(null);
  const sendMessageRef = useRef(() => {});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, viewingSessionId]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      setMessage((final || interim).trim());
      if (final) finalTranscriptRef.current = final.trim();
    };

    recognition.onerror = () => setIsListening(false);

    recognition.onend = () => {
      setIsListening(false);
      const finalText = finalTranscriptRef.current;
      finalTranscriptRef.current = "";
      if (finalText) sendMessageRef.current(finalText);
    };

    recognitionRef.current = recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (!voiceSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      finalTranscriptRef.current = "";
      setMessage("");
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  // apiMessage is what's actually sent to the AI (can be a long detailed
  // instruction). displayText is what's shown in the chat bubble and
  // stored in history (defaults to apiMessage for normal typed/voice
  // messages). Keeping these separate is what lets a quick-action button
  // send a long template instruction while showing a short clean label.
  const sendMessage = async (override, displayOverride) => {
    const apiMessage = (override ?? message).trim();
    const shownMessage = (displayOverride ?? apiMessage).trim();
    if (!apiMessage || loading || viewingSessionId) return;

    if (EXPORT_INTENT_RE.test(apiMessage)) {
      const request = buildExportRequest(apiMessage);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: shownMessage },
        { role: "assistant", type: "export", request },
      ]);
      setMessage("");
      return;
    }

    // History is built from what's DISPLAYED, not the raw apiMessage —
    // so a quick-action's short label ("CRM Summary") is what carries
    // forward into future turns' context, not its full template text.
    // Keeps later prompts smaller too.
    const historyForApi = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: shownMessage }]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: apiMessage, history: historyForApi }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed");

      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "❌ I couldn't reach the AI server. Please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  sendMessageRef.current = sendMessage;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    const hasContent = messages.some((m) => m.role === "user");
    if (hasContent) {
      const entry = { id: Date.now(), savedAt: new Date().toISOString(), messages };
      const next = [entry, ...historyList];
      setHistoryList(next);
      saveHistory(next);
    }
    setMessages([GREETING]);
    setViewingSessionId(null);
    setShowHistory(false);
  };

  const openSession = (id) => {
    setViewingSessionId(id);
  };

  const continueSession = () => {
    const session = historyList.find((h) => h.id === viewingSessionId);
    if (!session) return;

    const hasLiveContent = messages.some((m) => m.role === "user");
    if (hasLiveContent) {
      const entry = { id: Date.now(), savedAt: new Date().toISOString(), messages };
      const next = [entry, ...historyList];
      setHistoryList(next);
      saveHistory(next);
    }

    setMessages(session.messages);
    setViewingSessionId(null);
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    const next = historyList.filter((h) => h.id !== id);
    setHistoryList(next);
    saveHistory(next);
    if (viewingSessionId === id) setViewingSessionId(null);
  };

  const viewingSession = viewingSessionId ? historyList.find((h) => h.id === viewingSessionId) : null;
  const displayedMessages = viewingSession ? viewingSession.messages : messages;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[9999] w-16 h-16 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white text-2xl shadow-xl hover:scale-105 transition-transform flex items-center justify-center"
          title="Open Smart Ai"
        >
          🤖
        </button>
      )}

      {isOpen && (
        <div
          className={
            isFullscreen
              ? "fixed inset-3 sm:inset-6 z-[9999] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
              : "fixed bottom-6 right-6 z-[9999] w-[380px] max-w-[calc(100vw-30px)] h-[560px] max-h-[calc(100vh-40px)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          }
        >
          <div className="bg-gradient-to-r from-[#21164f] to-[#432080] text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-xl">
                🤖
              </div>
              <div>
                <h2 className="font-display font-bold text-base">Smart AI</h2>
                <p className="text-xs text-white/70">AI CRM Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                title="New chat"
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center text-sm"
              >
                ＋
              </button>
              <button
                onClick={() => setShowHistory((s) => !s)}
                title="Chat history"
                className={`w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm ${
                  showHistory ? "bg-white/15 text-white" : "text-white/80 hover:text-white"
                }`}
              >
                🕘
              </button>
              <button
                onClick={() => setIsFullscreen((f) => !f)}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center text-sm"
              >
                {isFullscreen ? "⤡" : "⛶"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center text-lg"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex">
            {showHistory && (
              <div
                className={
                  isFullscreen
                    ? "w-64 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto"
                    : "flex-1 min-w-0 bg-slate-50 overflow-y-auto"
                }
              >
                <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Past chats</p>
                  {!isFullscreen && (
                    <button
                      onClick={() => setShowHistory(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      ✕ Close
                    </button>
                  )}
                </div>
                {historyList.length === 0 && (
                  <p className="text-xs text-slate-400 px-4 py-4">No saved chats yet.</p>
                )}
                {historyList.map((h) => {
                  const firstUserMsg = h.messages.find((m) => m.role === "user");
                  return (
                    <button
                      key={h.id}
                      onClick={() => openSession(h.id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-white transition-colors group ${
                        viewingSessionId === h.id ? "bg-white" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 pr-1">
                        <p className="text-xs text-slate-400 mb-0.5">{formatTime(h.savedAt)}</p>
                        <button
                          onClick={(e) => deleteSession(h.id, e)}
                          title="Delete this chat"
                          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-5 h-5"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2 break-words">
                        {firstUserMsg?.content || "New conversation"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {(isFullscreen || !showHistory) && (
              <div className="flex-1 min-w-0 flex flex-col">
                {viewingSession && (
                  <div className="bg-amber-50 text-amber-700 text-xs px-4 py-2 flex items-center justify-between gap-2 shrink-0">
                    <span className="truncate">Viewing a past chat from {formatTime(viewingSession.savedAt)}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={continueSession} className="font-semibold underline">
                        Continue this chat
                      </button>
                      <button onClick={() => setViewingSessionId(null)} className="font-semibold underline">
                        Back to live chat
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50 space-y-3">
                  {displayedMessages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-pink-500 text-white rounded-br-md whitespace-pre-wrap break-words"
                            : "bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm"
                        }`}
                      >
                        {msg.type === "export" ? (
                          <ExportLinks request={msg.request} />
                        ) : msg.role === "assistant" ? (
                          <MessageContent content={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && !viewingSession && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-500">
                        🤖 Thinking...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {!viewingSession && (
                  <>
                    <div className="px-3 pt-3 bg-white shrink-0">
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        <button
                          onClick={() =>
                            sendMessage(
                              "Give me a CRM summary. Start with the total amount and unique donor count as plain bullet points. Then for EACH breakdown (Type, Financial Year, Donor Type, Platform, KAM), give a '### Breakdown by X' heading followed by a markdown pipe table with columns Name | Amount | Donors, listing EVERY item — not just a few.",
                              "CRM Summary"
                            )
                          }
                          className="whitespace-nowrap text-xs px-3 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          CRM Summary
                        </button>
                        <button
                          onClick={() =>
                            sendMessage(
                              "Give me the current FY conversion summary — current FY only. Start with the total amount and unique donor count as plain bullet points. Then for EACH breakdown (Type, Donor Type, Platform, KAM, Month), give a '### Breakdown by X' heading followed by a markdown pipe table with columns Name | Amount | Donors, listing EVERY item — not just a few.",
                              "Conversion 2026-27"
                            )
                          }
                          className="whitespace-nowrap text-xs px-3 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          Conversion 2026-27
                        </button>
                        <button
                          onClick={() =>
                            sendMessage(
                              "Give me the current FY approved pipeline summary, covering both the full-FY total and this month's approved pipeline. For each of those two sections, start with the total amount and unique donor count as plain bullet points, then for EACH breakdown (Type, Donor Type, Platform, KAM), give a '### Breakdown by X' heading followed by a markdown pipe table with columns Name | Amount | Donors, listing EVERY item — not just a few.",
                              "Pipeline 2026-27)"
                            )
                          }
                          className="whitespace-nowrap text-xs px-3 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          Pipeline 2026-27
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                      <div className="flex gap-2">
                        {voiceSupported && (
                          <button
                            onClick={toggleListening}
                            title={isListening ? "Stop listening" : "Speak your question"}
                            className={`w-12 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                              isListening
                                ? "bg-red-500 text-white animate-pulse"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            🎤
                          </button>
                        )}
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={isListening ? "Listening..." : "Ask about your CRM..."}
                          rows={1}
                          className="flex-1 min-w-0 resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                        />
                        <button
                          onClick={() => sendMessage()}
                          disabled={loading || !message.trim()}
                          className="w-12 rounded-xl bg-pink-500 text-white flex items-center justify-center hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          ➤
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}