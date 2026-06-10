/**
 * Thin wrapper around fetch calls to the demo bridge server.
 * Every MCP tool becomes: callTool("tool_name", { ...params })
 */

export async function callTool<T = unknown>(
  toolName: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const text = await res.text();
  if (!text.trim()) throw new Error(`${toolName} returned an empty response (${res.status})`);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${toolName} returned invalid JSON: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    throw new Error((data as any).error ?? `${toolName} failed (${res.status})`);
  }

  return data as T;
}

export async function checkServerHealth(): Promise<{
  status: string;
  network: string;
  blockfrost_configured: boolean;
}> {
  const res = await fetch("/health");
  if (!res.ok) throw new Error("Server unreachable");
  return res.json();
}

/** Convert lovelace string → "1,234.56" ADA string */
export function lovelaceToAda(lovelace: string | number): string {
  const n = Number(lovelace) / 1_000_000;
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Truncate a long hash: first 8 + "…" + last 6 */
export function truncateHash(hash: string, head = 8, tail = 6): string {
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
