import { useState } from "react";
import type { AvailableWallet, ConnectedWallet } from "../hooks/useWallet";

interface Props {
  available: AvailableWallet[];
  connected: ConnectedWallet | null;
  connecting: boolean;
  onConnect: (key: string) => void;
  onDisconnect: () => void;
}

export function WalletButton({ available, connected, connecting, onConnect, onDisconnect }: Props) {
  const [open, setOpen] = useState(false);

  if (connected) {
    const short = `${connected.address.slice(0, 8)}…${connected.address.slice(-6)}`;
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg transition-colors"
        >
          {connected.icon && (
            <img src={connected.icon} alt={connected.name} className="w-3.5 h-3.5 rounded-sm" />
          )}
          <span className="font-mono">{short}</span>
          <span className="opacity-60">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 p-2 z-10 min-w-max">
            <p className="text-xs text-gray-500 px-2 py-1">{connected.name}</p>
            <p className="text-[10px] font-mono text-gray-400 px-2 pb-1">{connected.address.slice(0, 20)}…</p>
            <button
              onClick={() => { onDisconnect(); setOpen(false); }}
              className="w-full text-left text-xs text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <span className="text-xs text-blue-200 opacity-70">No wallet detected</span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={connecting}
        className="text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 p-2 z-10 min-w-[160px]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
            Available wallets
          </p>
          {available.map((w) => (
            <button
              key={w.key}
              onClick={() => { onConnect(w.key); setOpen(false); }}
              className="w-full flex items-center gap-2 text-left text-sm text-gray-700 hover:bg-gray-50 px-2 py-1.5 rounded-lg"
            >
              {w.icon && <img src={w.icon} alt={w.name} className="w-5 h-5 rounded-sm" />}
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
