import { useState } from "react";
import { callTool } from "../lib/api";
import { HashDisplay } from "../components/HashDisplay";
import { Skeleton } from "../components/Skeleton";

interface AssetInfo {
  asset: string;
  policy_id: string;
  asset_name: string;
  asset_name_utf8: string | null;
  fingerprint: string;
  quantity: string;
  onchain_metadata: Record<string, unknown> | null;
  metadata: { name?: string; description?: string; ticker?: string; logo?: string } | null;
}

export function Tokens() {
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [data, setData]   = useState<AssetInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim().replace(".", "");
    if (!val) return;
    setQuery(val);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await callTool<AssetInfo>("get_asset_info", { asset: val });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Asset not found");
    } finally {
      setLoading(false);
    }
  };

  const meta = data?.onchain_metadata ?? data?.metadata;
  const name = (meta as any)?.name ?? data?.asset_name_utf8 ?? data?.asset_name ?? "Unknown";
  const description = (meta as any)?.description ?? null;
  const image = (meta as any)?.image ?? null;
  const ticker = (meta as any)?.ticker ?? null;

  return (
    <div className="space-y-6">
      {/* ── Search ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Look up a Token or NFT
        </label>
        <form onSubmit={search} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Asset ID (policyId + assetName) or policyId.assetName"
            className="flex-1 font-mono text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cardano focus:ring-1 focus:ring-cardano"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-cardano text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-cardano-dark disabled:opacity-40 transition-colors"
          >
            {loading ? "…" : "Look up"}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Example (MIN token):{" "}
          <button
            className="font-mono text-cardano hover:underline"
            onClick={() => setInput("29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e")}
          >
            29d222ce…4d494e
          </button>
        </p>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!query && !loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3 opacity-30">◈</div>
          <p className="font-medium text-gray-500">Search for any Cardano token or NFT</p>
          <p className="text-sm mt-1">Enter a full asset ID to see its metadata</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {/* ── Result ── */}
      {data && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-start gap-4">
            {/* Image if available */}
            {image && typeof image === "string" && image.startsWith("http") && (
              <img
                src={image}
                alt={name}
                className="w-20 h-20 rounded-lg object-cover border border-gray-100"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-900">{name}</h3>
                {ticker && (
                  <span className="text-xs bg-cardano/10 text-cardano px-2 py-0.5 rounded-full font-mono">
                    {ticker}
                  </span>
                )}
              </div>
              {description && (
                <p className="text-sm text-gray-500 mt-1">{String(description)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Policy ID</p>
              <HashDisplay hash={data.policy_id} head={12} tail={8} />
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Fingerprint</p>
              <HashDisplay hash={data.fingerprint} head={12} tail={8} />
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Total supply</p>
              <p className="font-mono font-medium text-gray-700">
                {Number(data.quantity).toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Asset name (hex)</p>
              <p className="font-mono text-gray-600 text-xs break-all">{data.asset_name || "(none)"}</p>
            </div>
          </div>

          {/* Raw onchain metadata */}
          {data.onchain_metadata && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                Raw on-chain metadata
              </summary>
              <pre className="mt-2 bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600">
                {JSON.stringify(data.onchain_metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
