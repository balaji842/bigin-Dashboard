import { useState } from "react";

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! 👋 I'm your Smart Ai Assistant. Ask me anything about your CRM data."
    }
  ]);

  const sendMessage = async () => {
    const userMessage = message.trim();

    if (!userMessage || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userMessage
      }
    ]);

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:4000/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userMessage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer
        }
      ]);
    } catch (error) {
      console.error("AI Chat Error:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "❌ I couldn't connect to the AI server. Please make sure your Node.js server and Ollama are running."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating AI Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="
            fixed bottom-6 right-6 z-[9999]
            w-16 h-16
            rounded-full
            bg-gradient-to-r from-pink-500 to-purple-500
            text-white text-2xl
            shadow-xl
            hover:scale-105
            transition-transform
            flex items-center justify-center
          "
          title="Open Smart Ai"
        >
          🤖
        </button>
      )}

      {/* AI Chat Window */}
      {isOpen && (
        <div
          className="
            fixed bottom-6 right-6
            z-[9999]
            w-[380px]
            max-w-[calc(100vw-30px)]
            h-[560px]
            max-h-[calc(100vh-40px)]
            bg-white
            rounded-2xl
            shadow-2xl
            border border-slate-200
            overflow-hidden
            flex flex-col
          "
        >
          {/* Header */}
          <div
            className="
              bg-gradient-to-r from-[#21164f] to-[#432080]
              text-white
              px-5 py-4
              flex items-center justify-between
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  w-10 h-10
                  rounded-full
                  bg-white/15
                  flex items-center justify-center
                  text-xl
                "
              >
                🤖
              </div>

              <div>
                <h2 className="font-display font-bold text-base">
                  Smart AI
                </h2>

                <p className="text-xs text-white/70">
                  AI CRM Assistant
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="
                text-white/80
                hover:text-white
                text-xl
                transition
              "
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            className="
              flex-1
              overflow-y-auto
              p-4
              bg-slate-50
              space-y-3
            "
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`
                    max-w-[85%]
                    px-4 py-3
                    rounded-2xl
                    text-sm
                    leading-relaxed
                    ${
                      msg.role === "user"
                        ? "bg-pink-500 text-white rounded-br-md"
                        : "bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm"
                    }
                  `}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="
                    bg-white
                    border border-slate-200
                    rounded-2xl rounded-bl-md
                    px-4 py-3
                    text-sm text-slate-500
                  "
                >
                  🤖 Thinking...
                </div>
              </div>
            )}
          </div>

          {/* Quick Questions */}
          <div className="px-3 pt-3 bg-white">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setMessage("How many open deals do we have?")}
                className="
                  whitespace-nowrap
                  text-xs
                  px-3 py-2
                  rounded-full
                  bg-slate-100
                  text-slate-600
                  hover:bg-slate-200
                "
              >
                Open deals
              </button>

              <button
                onClick={() =>
                  setMessage("What is our current pipeline value?")
                }
                className="
                  whitespace-nowrap
                  text-xs
                  px-3 py-2
                  rounded-full
                  bg-slate-100
                  text-slate-600
                  hover:bg-slate-200
                "
              >
                Pipeline value
              </button>

              <button
                onClick={() =>
                  setMessage("Give me a summary of the CRM.")
                }
                className="
                  whitespace-nowrap
                  text-xs
                  px-3 py-2
                  rounded-full
                  bg-slate-100
                  text-slate-600
                  hover:bg-slate-200
                "
              >
                CRM summary
              </button>
            </div>
          </div>

          {/* Input */}
          <div
            className="
              p-3
              bg-white
              border-t border-slate-200
            "
          >
            <div className="flex gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your CRM..."
                rows={1}
                className="
                  flex-1
                  resize-none
                  rounded-xl
                  border border-slate-300
                  px-3 py-3
                  text-sm
                  outline-none
                  focus:border-pink-400
                  focus:ring-2
                  focus:ring-pink-100
                "
              />

              <button
                onClick={sendMessage}
                disabled={loading || !message.trim()}
                className="
                  w-12
                  rounded-xl
                  bg-pink-500
                  text-white
                  flex items-center justify-center
                  hover:bg-pink-600
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                "
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}