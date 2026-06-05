/**
 * Floating AI chatbot powered by Claude + Cardano MCP tools.
 * The server routes queries to Claude, which calls MCP tools as needed.
 */
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What is the current ADA treasury balance?",
  "What epoch are we on?",
  "Explain how eUTxO works",
  "What are the active governance proposals?",
  "What's the minimum ADA for a UTxO with 3 assets?",
];

export function ChatBot() {
  const [open,     setOpen]    = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]   = useState("");
  const [loading,  setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.reply ?? data.error ?? "No response." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Could not reach the server. Is it running?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 w-13 h-13 bg-cardano text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-cardano-dark transition-colors z-50"
        title="Ask the Cardano AI assistant"
        style={{ width: 52, height: 52 }}
      >
        {open ? "✕" : "₳"}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div className="fixed bottom-20 right-5 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-50 overflow-hidden"
          style={{ maxHeight: "70vh" }}>

          {/* Header */}
          <div className="bg-cardano px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-sm">Cardano AI</p>
              <p className="text-blue-200 text-xs">Powered by Claude + MCP</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white text-lg">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200 }}>
            {messages.length === 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  Ask anything about Cardano — I can look up live chain data.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-2 text-gray-600 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-cardano text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-gray-100 p-3 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Cardano…"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cardano"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-cardano text-white px-3 py-2 rounded-xl text-sm hover:bg-cardano-dark disabled:opacity-40 transition-colors"
            >
              ↑
            </button>
          </form>
        </div>
      )}
    </>
  );
}
