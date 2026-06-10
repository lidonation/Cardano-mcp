interface NativeAsset {
  unit: string;
  policy_id?: string;
  asset_name_hex?: string;
  asset_name_utf8?: string;
  quantity: string;
}

interface RecentTx {
  tx_hash: string;
  block_height?: number;
  block_time?: number;
}

export interface AddressData {
  address: string;
  total_ada: string;
  total_lovelace: string;
  utxo_count: number;
  native_assets: NativeAsset[];
  recent_txs: RecentTx[];
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 14)}…${addr.slice(-8)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function AddressCard({ data }: { data: AddressData }) {
  const hasAssets = data.native_assets.length > 0;
  const hasTxs    = data.recent_txs.length > 0;

  return (
    <div className="mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
        <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wider">Address</p>
        <p className="text-xs font-mono text-white mt-0.5">{shortAddr(data.address)}</p>
      </div>

      <div className="p-3 space-y-3">
        {/* Balance row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-900">₳{data.total_ada}</p>
            <p className="text-xs text-gray-400">{data.total_lovelace} lovelace</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-700">{data.utxo_count}</p>
            <p className="text-xs text-gray-400">UTxO{data.utxo_count !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Native assets */}
        {hasAssets && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Native assets ({data.native_assets.length})
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {data.native_assets.slice(0, 20).map((a, i) => {
                const name = a.asset_name_utf8 || a.asset_name_hex?.slice(0, 10) || a.unit.slice(56, 70);
                const qty  = Number(a.quantity).toLocaleString();
                const pid  = (a.policy_id ?? a.unit.slice(0, 56)).slice(0, 12);
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                      <span className="truncate text-gray-700 font-medium">{name || "(no name)"}</span>
                      <span className="text-gray-400 font-mono text-[10px] shrink-0">{pid}…</span>
                    </div>
                    <span className="font-semibold text-gray-800 shrink-0 ml-2">{qty}</span>
                  </div>
                );
              })}
              {data.native_assets.length > 20 && (
                <p className="text-[10px] text-gray-400">+{data.native_assets.length - 20} more</p>
              )}
            </div>
          </div>
        )}

        {/* Recent transactions */}
        {hasTxs && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Recent transactions
            </p>
            <div className="space-y-1">
              {data.recent_txs.slice(0, 5).map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <a
                    href={`https://cardanoscan.io/transaction/${tx.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-500 hover:underline"
                  >
                    {shortHash(tx.tx_hash)}
                  </a>
                  {tx.block_time && (
                    <span className="text-gray-400 text-[10px]">
                      {new Date(tx.block_time * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
