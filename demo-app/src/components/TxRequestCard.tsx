import { useState } from "react";
import type { ConnectedWallet } from "../hooks/useWallet";

export interface TxRequestData {
  to_address:      string;
  amount_ada:      string;
  amount_lovelace: string;
}

type TxStatus = "idle" | "building" | "signing" | "submitting" | "done" | "error";

const STATUS_LABELS: Record<TxStatus, string> = {
  idle:       "Sign & Send",
  building:   "Building tx…",
  signing:    "Waiting for wallet…",
  submitting: "Submitting…",
  done:       "Sent!",
  error:      "Retry",
};

interface Props {
  data: TxRequestData;
  wallet: ConnectedWallet | null;
  onConnectWallet: () => void;
  onCancel: () => void;
}

export function TxRequestCard({ data, wallet, onConnectWallet, onCancel }: Props) {
  const [status,  setStatus]  = useState<TxStatus>("idle");
  const [txHash,  setTxHash]  = useState<string | null>(null);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

  const shortTo = `${data.to_address.slice(0, 12)}…${data.to_address.slice(-8)}`;
  const amount  = Number(data.amount_ada).toLocaleString();

  const execute = async () => {
    if (!wallet) return;
    setErrMsg(null);

    try {
      // 1. Build unsigned tx server-side (server fetches UTxOs from Blockfrost)
      setStatus("building");
      const buildRes = await fetch("/build-tx", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          from_address:    wallet.address,
          to_address:      data.to_address,
          amount_lovelace: data.amount_lovelace,
        }),
      });
      const buildData = await buildRes.json() as { unsigned_cbor?: string; error?: string };
      if (!buildRes.ok || !buildData.unsigned_cbor) {
        throw new Error(buildData.error ?? "Failed to build transaction");
      }

      // 2. Ask wallet to sign
      setStatus("signing");
      const signedCbor = await wallet.api.signTx(buildData.unsigned_cbor, true);

      // 3. Submit — prefer the wallet's own node, fall back to our server
      setStatus("submitting");
      let hash: string;
      try {
        hash = await wallet.api.submitTx(signedCbor);
      } catch {
        const submitRes = await fetch("/submit-tx", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ signed_cbor: signedCbor }),
        });
        const submitData = await submitRes.json() as { tx_hash?: string; error?: string };
        if (!submitRes.ok || !submitData.tx_hash) {
          throw new Error(submitData.error ?? "Failed to submit transaction");
        }
        hash = submitData.tx_hash;
      }

      setTxHash(hash);
      setStatus("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return (
    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base">💸</span>
        <p className="text-sm font-semibold text-amber-900">Transaction request</p>
      </div>

      {/* Details */}
      <div className="bg-white rounded-lg p-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Send</span>
          <span className="font-bold text-amber-700">₳{amount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">To</span>
          <span className="font-mono text-xs text-gray-700">{shortTo}</span>
        </div>
        {wallet && (
          <div className="flex justify-between">
            <span className="text-gray-500">From</span>
            <span className="font-mono text-xs text-gray-700">
              {wallet.address.slice(0, 12)}…{wallet.address.slice(-6)}
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {errMsg && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}

      {/* Success */}
      {status === "done" && txHash && (
        <div className="bg-green-50 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-green-700">Transaction submitted!</p>
          <a
            href={`https://cardanoscan.io/transaction/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-green-600 hover:underline break-all"
          >
            {txHash}
          </a>
        </div>
      )}

      {/* Action */}
      {status !== "done" && (
        <div className="flex gap-2">
          {wallet ? (
            <button
              onClick={execute}
              disabled={status !== "idle" && status !== "error"}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {STATUS_LABELS[status]}
            </button>
          ) : (
            <button
              onClick={onConnectWallet}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Connect wallet to send
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={status !== "idle" && status !== "error"}
            className="px-4 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-600 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
