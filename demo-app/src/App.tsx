import { useState, useEffect } from "react";
import { checkServerHealth } from "./lib/api";
import { Wallet } from "./tabs/Wallet";
import { Tokens } from "./tabs/Tokens";
import { Governance } from "./tabs/Governance";
import { Network } from "./tabs/Network";
import { Contracts } from "./tabs/Contracts";
import { ChatBot } from "./components/ChatBot";

type Tab = "wallet" | "tokens" | "governance" | "network" | "contracts";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "wallet",     label: "Wallet",      icon: "₳" },
  { id: "tokens",     label: "Tokens & NFTs", icon: "◈" },
  { id: "governance", label: "Governance",  icon: "⚖" },
  { id: "contracts",  label: "Contracts",   icon: "📜" },
  { id: "network",    label: "Network",     icon: "⬡" },
];

interface ServerStatus {
  ok: boolean;
  network?: string;
  checking: boolean;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("wallet");
  const [server, setServer] = useState<ServerStatus>({ ok: false, checking: true });

  // Poll server health every 15s
  useEffect(() => {
    async function check() {
      try {
        const h = await checkServerHealth();
        setServer({ ok: h.status === "ok", network: h.network, checking: false });
      } catch {
        setServer({ ok: false, checking: false });
      }
    }
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-cardano font-bold text-xl">₳</span>
            <span className="font-semibold text-gray-900">Cardano Companion</span>
            {server.network && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                {server.network}
              </span>
            )}
          </div>

          {/* MCP server status indicator */}
          <div className="flex items-center gap-2 text-sm">
            {server.checking ? (
              <span className="text-gray-400 text-xs">checking…</span>
            ) : server.ok ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-gray-500 text-xs hidden sm:inline">MCP connected</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-500 text-xs">MCP not connected</span>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-cardano text-cardano"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <span className="text-xs opacity-70">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Server offline banner ── */}
      {!server.checking && !server.ok && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <span className="text-red-500 mt-0.5">⚠</span>
            <div className="text-sm text-red-700">
              <strong>MCP server not running.</strong>{" "}
              Start it with:{" "}
              <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono text-xs">
                cd demo-app && yarn server
              </code>{" "}
              in a separate terminal.
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {tab === "wallet"     && <Wallet />}
        {tab === "tokens"     && <Tokens />}
        {tab === "governance" && <Governance />}
        {tab === "contracts"  && <Contracts />}
        {tab === "network"    && <Network />}
      </main>

      <footer className="text-center py-4 text-xs text-gray-400">
        cardano/mcp demo · data via Blockfrost + Koios
      </footer>

      <ChatBot />
    </div>
  );
}
