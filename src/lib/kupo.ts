import { KUPO_URL } from "../config.js";
import type { KupoMatch } from "../types/cardano.js";

async function kupoFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${KUPO_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Kupo ${path} → ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

/** Get all UTxO matches for a Kupo pattern (address, payment cred, or wildcard). */
export async function getMatches(pattern: string): Promise<KupoMatch[]> {
  return kupoFetch<KupoMatch[]>(`/matches/${encodeURIComponent(pattern)}`);
}

/** Register a new watch pattern with Kupo. */
export async function watchPattern(pattern: string): Promise<void> {
  await fetch(`${KUPO_URL}/matches/${encodeURIComponent(pattern)}`, {
    method: "PUT",
    headers: { Accept: "application/json" },
  });
}

/** Get Kupo health/sync status. */
export async function getKupoHealth(): Promise<{
  connection_status: string;
  most_recent_checkpoint: number;
  most_recent_node_tip: number;
  configuration: unknown;
}> {
  return kupoFetch("/health");
}
