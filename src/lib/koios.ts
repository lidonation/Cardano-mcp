import { KOIOS_BASE_URL, MAX_RETRIES, RETRY_BASE_DELAY_MS } from "../config.js";

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
  // Unreachable but satisfies TS
  throw new Error("Max retries exceeded");
}

/**
 * Typed Koios API client.
 * Pass a body to use POST (most Koios endpoints), omit for GET.
 */
export async function koios<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${KOIOS_BASE_URL}${path}`;
  const method = body !== undefined ? "POST" : "GET";

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Koios ${method} ${path} → ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
