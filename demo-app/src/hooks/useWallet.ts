import { useState, useEffect } from "react";

export interface WalletApi {
  getChangeAddress: () => Promise<string>;
  getUsedAddresses: () => Promise<string[]>;
  getUtxos: () => Promise<string[] | null>;
  signTx: (tx: string, partialSign?: boolean) => Promise<string>;
  submitTx: (tx: string) => Promise<string>;
}

export interface AvailableWallet {
  key: string;
  name: string;
  icon: string;
}

export interface ConnectedWallet {
  key: string;
  name: string;
  icon: string;
  api: WalletApi;
  address: string; // bech32
}

export function useWallet() {
  const [available, setAvailable]   = useState<AvailableWallet[]>([]);
  const [connected, setConnected]   = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Detect CIP-30 wallets after mount (window.cardano is not available SSR)
  useEffect(() => {
    const cardano = (window as any).cardano ?? {};
    const wallets: AvailableWallet[] = Object.keys(cardano)
      .filter((k) => typeof cardano[k]?.enable === "function" && cardano[k]?.name)
      .map((k) => ({ key: k, name: cardano[k].name as string, icon: cardano[k].icon as string ?? "" }));
    setAvailable(wallets);
  }, []);

  const connect = async (walletKey: string) => {
    setConnecting(true);
    setError(null);
    try {
      const cardano = (window as any).cardano ?? {};
      const api: WalletApi = await cardano[walletKey].enable();

      // CIP-30 returns CBOR-encoded addresses — decode server-side with CSL
      const changeAddrCbor = await api.getChangeAddress();
      const res = await fetch("/decode-address", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cbor_hex: changeAddrCbor }),
      });
      if (!res.ok) throw new Error("Failed to decode wallet address");
      const { bech32 } = (await res.json()) as { bech32: string };

      setConnected({
        key:     walletKey,
        name:    cardano[walletKey].name as string,
        icon:    cardano[walletKey].icon as string ?? "",
        api,
        address: bech32,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => setConnected(null);

  return { available, connected, connecting, error, connect, disconnect };
}
