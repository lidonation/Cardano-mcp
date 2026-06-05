import { useState, useEffect, useCallback } from "react";
import { callTool } from "../lib/api";
import { HashDisplay } from "../components/HashDisplay";
import { Skeleton } from "../components/Skeleton";

const LS_KEY = "cardano_address";

interface UtxoResult {
  address: string;
  utxo_count: number;
  total_ada: string;
  total_lovelace: string;
  native_assets: {
    unit: string;
    policy_id: string;
    asset_name_utf8: string;
    quantity: string;
  }[];
}

interface TxResult {
  tx_hash: string;
  block_height: number;
  block_time: number;
}

interface HistoryResult {
  transactions: TxResult[];
}

export function Wallet() {
  const [address, setAddress] = useState(() => localStorage.getItem(LS_KEY) ?? "");
  const [input, setInput] = useState(() => localStorage.getItem(LS_KEY) ?? "");

  const [utxoData, setUtxoData]     = useState<UtxoResult | null>(null);
  const [historyData, setHistoryData] = useState<TxResult[]>([]);
  const [loading, setLoading]       = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fetchWallet = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    setLoading(true);
    setHistLoading(true);
    setError(null);
    setUtxoData(null);
    setHistoryData([]);

    // UTxOs and history in parallel
    try {
      const [utxos, history] = await Promise.allSettled([
        callTool<UtxoResult>("get_address_utxos", { address: addr }),
        callTool<HistoryResult>("query_address_history", { address: addr, count: 10 }),
      ]);

      if (utxos.status === "fulfilled") {
        setUtxoData(utxos.value);
      } else {
        setError(utxos.reason?.message ?? "Failed to fetch UTxOs");
      }

      if (history.status === "fulfilled") {
        setHistoryData(history.value.transactions ?? []);
      }
    } finally {
      setLoading(false);
      setHistLoading(false);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    setAddress(trimmed);
    localStorage.setItem(LS_KEY, trimmed);
    fetchWallet(trimmed);
  };

  // Auto-load on first render if address is saved
  useEffect(() => {
    if (address) fetchWallet(address);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* ── Address input ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Your Cardano Address
        </label>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="addr1q…"
            className="flex-1 font-mono text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cardano focus:ring-1 focus:ring-cardano transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-cardano text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-cardano-dark disabled:opacity-40 transition-colors"
          >
            {loading ? "Loading…" : "Look up"}
          </button>
        </form>
        {address && (
          <p className="mt-2 text-xs text-gray-400 font-mono truncate">{address}</p>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!address && !loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3 opacity-30">₳</div>
          <p className="font-medium text-gray-500">Enter your address to get started</p>
          <p className="text-sm mt-1">Your balance and activity will appear here</p>
        </div>
      )}

      {/* ── Balance cards ── */}
      {(loading || utxoData) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Balance</p>
            {loading ? (
              <Skeleton className="h-9 w-32 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900">
                ₳ {utxoData?.total_ada ?? "0"}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">UTxOs</p>
            {loading ? (
              <Skeleton className="h-9 w-16 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900">{utxoData?.utxo_count ?? 0}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">unspent outputs</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Assets</p>
            {loading ? (
              <Skeleton className="h-9 w-16 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900">
                {utxoData?.native_assets.length ?? 0}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">token types</p>
          </div>
        </div>
      )}

      {/* ── Native assets ── */}
      {utxoData && utxoData.native_assets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Native Assets ({utxoData.native_assets.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {utxoData.native_assets.map((a) => (
              <div
                key={a.unit}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {a.asset_name_utf8 || "(unnamed)"}
                  </p>
                  <HashDisplay hash={a.policy_id} className="text-xs" />
                </div>
                <span className="font-mono text-gray-600 ml-3 shrink-0">
                  {Number(a.quantity).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent activity ── */}
      {(histLoading || historyData.length > 0 || (utxoData && !histLoading)) && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Activity</h3>

          {histLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          )}

          {!histLoading && historyData.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No recent transactions found.</p>
          )}

          {!histLoading && historyData.length > 0 && (
            <div className="divide-y divide-gray-50">
              {historyData.map((tx) => {
                const time = tx.block_time
                  ? new Date(tx.block_time * 1000).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })
                  : "Unknown date";
                return (
                  <div key={tx.tx_hash} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">⬡</span>
                      <HashDisplay hash={tx.tx_hash} />
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <p>{time}</p>
                      {tx.block_height && (
                        <p>block {tx.block_height.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
