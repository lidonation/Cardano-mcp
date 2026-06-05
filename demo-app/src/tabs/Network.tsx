import { useState, useEffect } from "react";
import { callTool } from "../lib/api";
import { CardSkeleton } from "../components/Skeleton";

interface NetworkInfo {
  network: string;
  chain_tip: {
    block_height: number;
    slot: number;
    epoch: number;
    block_time: string;
  };
  current_epoch: {
    epoch: number;
    start_time: string;
    end_time: string;
    block_count: number;
    tx_count: number;
    total_output_ada: string;
  };
}

interface ProtocolParams {
  min_fee_a: number;
  min_fee_b: number;
  coins_per_utxo_size: number;
  max_tx_size: number;
  key_deposit: string;
  pool_deposit: string;
  max_val_size: string;
}

const PARAM_TOOLTIPS: Record<string, string> = {
  min_fee_a:          "Fee per byte of transaction size. Larger transactions cost more.",
  min_fee_b:          "Base fee added to every transaction, regardless of size.",
  coins_per_utxo_size:"Minimum ADA required per byte of UTxO storage. Prevents blockchain bloat.",
  max_tx_size:        "Maximum size a transaction can be (in bytes). Keeps blocks manageable.",
  key_deposit:        "ADA you lock up when you register a staking key. Returned when you de-register.",
  pool_deposit:       "ADA pledged when creating a stake pool. Returned if the pool retires.",
};

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ParamRow({ name, value, tooltip }: { name: string; value: string | number; tooltip?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-gray-700">{name}</span>
        {tooltip && (
          <span className="relative">
            <button
              onMouseEnter={() => setShow(true)}
              onMouseLeave={() => setShow(false)}
              className="text-gray-300 hover:text-gray-500 text-xs leading-none"
            >
              ?
            </button>
            {show && (
              <div className="absolute left-0 bottom-full mb-1 w-56 bg-gray-900 text-white text-xs rounded-lg p-2.5 z-10 shadow-lg">
                {tooltip}
              </div>
            )}
          </span>
        )}
      </div>
      <span className="font-mono text-gray-600">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  );
}

export function Network() {
  const [netInfo, setNetInfo]   = useState<NetworkInfo | null>(null);
  const [params, setParams]     = useState<ProtocolParams | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [net, p] = await Promise.all([
          callTool<NetworkInfo>("get_network_info"),
          callTool<ProtocolParams>("get_protocol_params"),
        ]);
        setNetInfo(net);
        setParams(p);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load network data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Network Status</h2>
        <p className="text-sm text-gray-500 mt-0.5">Live chain metrics from the Cardano mainnet.</p>
      </div>

      {/* ── Chain tip cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : netInfo ? (
          <>
            <MetricCard label="Epoch"        value={netInfo.current_epoch.epoch} />
            <MetricCard label="Block height" value={netInfo.chain_tip.block_height} />
            <MetricCard label="Slot"         value={netInfo.chain_tip.slot} />
            <MetricCard label="Epoch TXs"    value={netInfo.current_epoch.tx_count}
              sub={`${netInfo.current_epoch.block_count.toLocaleString()} blocks`} />
          </>
        ) : null}
      </div>

      {netInfo && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Epoch window</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div>
              <span className="text-gray-400 mr-2">Start</span>
              <span className="font-mono text-gray-700">{new Date(netInfo.current_epoch.start_time).toUTCString()}</span>
            </div>
            <div>
              <span className="text-gray-400 mr-2">End</span>
              <span className="font-mono text-gray-700">{new Date(netInfo.current_epoch.end_time).toUTCString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Protocol params ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Protocol Parameters</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          The rules that govern every Cardano transaction. Hover the{" "}
          <span className="text-gray-400">?</span> for plain-English explanations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 skeleton rounded" />
            ))}
          </div>
        ) : params ? (
          <>
            <ParamRow name="min_fee_a"          value={params.min_fee_a}          tooltip={PARAM_TOOLTIPS.min_fee_a} />
            <ParamRow name="min_fee_b"          value={params.min_fee_b}          tooltip={PARAM_TOOLTIPS.min_fee_b} />
            <ParamRow name="coins_per_utxo_size" value={params.coins_per_utxo_size} tooltip={PARAM_TOOLTIPS.coins_per_utxo_size} />
            <ParamRow name="max_tx_size"        value={params.max_tx_size}        tooltip={PARAM_TOOLTIPS.max_tx_size} />
            <ParamRow name="key_deposit"        value={`₳ ${Number(params.key_deposit) / 1_000_000}`} tooltip={PARAM_TOOLTIPS.key_deposit} />
            <ParamRow name="pool_deposit"       value={`₳ ${Number(params.pool_deposit) / 1_000_000}`} tooltip={PARAM_TOOLTIPS.pool_deposit} />
          </>
        ) : null}
      </div>
    </div>
  );
}
