import {
  MAESTRO_BASE_URL,
  MAESTRO_API_KEY,
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
 * Typed Maestro API client.
 * Maestro offers 9x faster multi-address UTxO queries than Blockfrost.
 * Requires MAESTRO_API_KEY env var.
 */
export async function maestro<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!MAESTRO_API_KEY) {
    throw new Error(
      "MAESTRO_API_KEY env var is not set. Get a free key at gomaestro.org"
    );
  }

  const url = `${MAESTRO_BASE_URL}${path}`;

  const mergedOptions: RequestInit = {
    ...options,
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "api-key": MAESTRO_API_KEY,
      ...(options.headers as Record<string, string> | undefined),
    },
  };

  const response = await fetchWithRetry(url, mergedOptions);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Maestro ${path} → ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
