import {
  BLOCKFROST_BASE_URL,
  BLOCKFROST_PROJECT_ID,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "../config.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < retries) {
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
      continue;
    }

    return response;
  }
  throw new Error("Max retries exceeded");
}

/**
 * Typed Blockfrost API client.
 * Automatically injects project_id header and network-aware base URL.
 */
export async function blockfrost<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!BLOCKFROST_PROJECT_ID) {
    throw new Error(
      "BLOCKFROST_PROJECT_ID env var is not set. Get a free key at blockfrost.io"
    );
  }

  const url = `${BLOCKFROST_BASE_URL}${path}`;

  const mergedOptions: RequestInit = {
    ...options,
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      project_id: BLOCKFROST_PROJECT_ID,
      ...(options.headers as Record<string, string> | undefined),
    },
  };

  const response = await fetchWithRetry(url, mergedOptions);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Blockfrost ${path} → ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

/** POST helper for Blockfrost endpoints that accept a body (e.g. /tx/submit). */
export async function blockfrostPost<T>(
  path: string,
  body: Buffer | string | Uint8Array,
  contentType = "application/json"
): Promise<T> {
  return blockfrost<T>(path, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}
