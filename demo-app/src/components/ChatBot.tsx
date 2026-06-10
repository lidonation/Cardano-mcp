import { useState, useRef, useEffect } from "react";
import { ProposalCardList } from "./ProposalCard";
import { DRepCard } from "./DRepCard";
import { TxRequestCard } from "./TxRequestCard";
import { WalletButton } from "./WalletButton";
import { AddressCard } from "./AddressCard";
import { useWallet } from "../hooks/useWallet";

interface Message {
  role: "user" | "assistant";
  text: string;
  cards?: Array<{ type: string; data: any }>;
}

const SUGGESTIONS = [
  "What is the current ADA treasury balance?",
  "What epoch are we on?",
  "Explain how eUTxO works",
  "What are the active governance proposals?",
  "What's the minimum ADA for a UTxO with 3 assets?",
];

// ── Inline markdown renderer (no extra deps) ──────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="bg-gray-200 text-gray-800 text-xs px-1 py-0.5 rounded font-mono">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1">
      {segments.map((seg, si) => {
        if (seg.startsWith("```")) {
          const code = seg.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          return (
            <pre key={si} className="bg-gray-800 text-green-300 text-xs rounded-lg p-3 my-2 overflow-x-auto whitespace-pre">
              <code>{code.trimEnd()}</code>
            </pre>
          );
        }
        return seg.split("\n").map((line, li) => {
          const key = `${si}-${li}`;
          if (/^### /.test(line)) return <p key={key} className="font-semibold text-sm mt-2">{renderInline(line.slice(4))}</p>;
          if (/^## /.test(line))  return <p key={key} className="font-semibold text-sm mt-2">{renderInline(line.slice(3))}</p>;
          if (/^# /.test(line))   return <p key={key} className="font-bold text-sm mt-2">{renderInline(line.slice(2))}</p>;
          const bullet = line.match(/^[-*] (.+)/);
          if (bullet) return (
            <div key={key} className="flex gap-1.5 items-start">
              <span className="text-blue-500 mt-0.5 shrink-0">•</span>
              <span>{renderInline(bullet[1])}</span>
            </div>
          );
          const numbered = line.match(/^(\d+)\. (.+)/);
          if (numbered) return (
            <div key={key} className="flex gap-1.5 items-start">
              <span className="text-blue-500 font-medium shrink-0">{numbered[1]}.</span>
              <span>{renderInline(numbered[2])}</span>
            </div>
          );
          if (!line.trim()) return <div key={key} className="h-1" />;
          return <p key={key}>{renderInline(line)}</p>;
        });
      })}
    </div>
  );
}

// ── Card renderer ─────────────────────────────────────────────────────────
interface MessageCardsProps {
  cards: Array<{ type: string; data: any }>;
  wallet: import("../hooks/useWallet").ConnectedWallet | null;
  onConnectWallet: () => void;
  onCancelCard: (index: number) => void;
}

function MessageCards({ cards, wallet, onConnectWallet, onCancelCard }: MessageCardsProps) {
  return (
    <>
      {cards.map((card, i) => {
        if (card.type === "proposal_list") {
          return <ProposalCardList key={i} proposals={card.data} />;
        }
        if (card.type === "drep_profile") {
          return (
            <div key={i} className="mt-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">DRep Profile</p>
              <DRepCard drep={card.data} />
            </div>
          );
        }
        if (card.type === "address_utxos") {
          return <AddressCard key={i} data={card.data} />;
        }
        if (card.type === "tx_request") {
          return (
            <TxRequestCard
              key={i}
              data={card.data}
              wallet={wallet}
              onConnectWallet={onConnectWallet}
              onCancel={() => onCancelCard(i)}
            />
          );
        }
        return null;
      })}
    </>
  );
}

export function ChatBot() {
  const [open,     setOpen]    = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]   = useState("");
  const [loading,  setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { available, connected, connecting, connect, disconnect } = useWallet();

  // Called from TxRequestCard when no wallet is connected
  const handleConnectWallet = () => {
    if (available.length === 1 && available[0]) connect(available[0].key);
    // For multiple wallets the WalletButton in the header handles selection
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    // Add a placeholder assistant message we'll stream into
    setMessages((m) => [...m, { role: "assistant", text: "", cards: [] }]);

    try {
      const res = await fetch("/stream-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.filter((m) => m.text).slice(-8),
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;

          try {
            const event = JSON.parse(raw) as { type?: string; text?: string; cards?: any[]; error?: string };

            if (event.type === "cards" && event.cards) {
              console.log("[ChatBot] received cards:", event.cards);
              setMessages((m) => {
                const copy = [...m];
                const last = { ...copy[copy.length - 1], cards: event.cards };
                copy[copy.length - 1] = last;
                return copy;
              });
            } else if (event.type === "text" && event.text) {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = { ...last, text: last.text + event.text };
                return copy;
              });
            } else if (event.type === "error") {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { ...copy[copy.length - 1], text: `Error: ${event.error}` };
                return copy;
              });
            }
          } catch { /* malformed JSON — skip */ }
        }
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], text: "Could not reach the server. Is it running?" };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 bg-cardano text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-cardano-dark transition-colors z-50"
        title="Ask the Cardano AI assistant"
        style={{ width: 52, height: 52 }}
      >
        {open ? "✕" : "₳"}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div
          className="fixed bottom-20 right-5 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-50 overflow-hidden"
          style={{ width: "min(700px, calc(100vw - 24px))", maxHeight: "86vh" }}
        >
          {/* Header */}
          <div className="bg-cardano px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="text-white font-semibold text-sm">Cardano AI</p>
              <p className="text-blue-200 text-xs">Powered by Claude + MCP</p>
            </div>
            <div className="flex items-center gap-2">
              <WalletButton
                available={available}
                connected={connected}
                connecting={connecting}
                onConnect={connect}
                onDisconnect={disconnect}
              />
              <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white text-lg ml-1">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 240 }}>
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
                <div className={`max-w-[95%] ${m.role === "user" ? "w-auto" : "w-full"}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-cardano text-white rounded-br-sm whitespace-pre-wrap break-all inline-block"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm break-words overflow-hidden"
                    }`}
                  >
                    {m.role === "assistant"
                      ? (m.text ? renderMarkdown(m.text) : <span className="text-gray-400 italic text-xs">Thinking…</span>)
                      : m.text}
                  </div>

                  {/* Cards below the message bubble */}
                  {m.role === "assistant" && m.cards && m.cards.length > 0 && (
                    <MessageCards
                      cards={m.cards}
                      wallet={connected}
                      onConnectWallet={handleConnectWallet}
                      onCancelCard={(cardIndex) => {
                        setMessages((prev) => prev.map((msg, mi) =>
                          mi !== i ? msg : { ...msg, cards: msg.cards?.filter((_, ci) => ci !== cardIndex) }
                        ));
                      }}
                    />
                  )}
                </div>
              </div>
            ))}

            {loading && messages[messages.length - 1]?.text === "" && (
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
            className="border-t border-gray-100 p-3 flex gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Cardano…"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cardano"
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              name="cardano-chat-input"
              type="search"
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
