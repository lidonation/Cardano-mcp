/**
 * Lightweight sessionStorage cache with TTL.
 * Data survives tab navigation but resets on browser close — appropriate for
 * live chain data that shouldn't persist across sessions.
 */

interface Entry<T> {
  data: T;
  expires: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: Entry<T> = JSON.parse(raw);
    if (Date.now() > entry.expires) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function write<T>(key: string, data: T, ttl: number): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expires: Date.now() + ttl }));
  } catch { /* storage quota — silently skip */ }
}

/**
 * Cache key derived from tool name + params so different param sets are
 * stored independently.
 */
function cacheKey(tool: string, params: Record<string, unknown>): string {
  return `mcp:${tool}:${JSON.stringify(params)}`;
}

/**
 * Drop-in replacement for `callTool` that caches the result.
 * Falls back to a live call on cache miss or expiry.
 */
export async function cachedTool<T = unknown>(
  toolName: string,
  params: Record<string, unknown> = {},
  ttl = DEFAULT_TTL
): Promise<T> {
  const key = cacheKey(toolName, params);
  const hit = read<T>(key);
  if (hit !== null) return hit;

  const { callTool } = await import("./api");
  const data = await callTool<T>(toolName, params);
  write(key, data, ttl);
  return data;
}

/** Manually invalidate a cached tool response (e.g. after a mutation). */
export function invalidateTool(toolName: string, params: Record<string, unknown> = {}): void {
  try { sessionStorage.removeItem(cacheKey(toolName, params)); } catch { /* ignore */ }
}
