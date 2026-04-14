/**
 * Fetch wrapper with automatic retry for transient failures.
 *
 * Retries on network errors and retryable HTTP status codes (429, 500, 502, 503, 504)
 * using exponential backoff with randomized jitter. Respects Retry-After headers
 * from 429 responses when present.
 */

/** Configurable options for retry behavior. */
export interface RetryOptions {
  /** Base delay in milliseconds before the first retry (default: 1000). */
  baseDelayMs?: number;
  /** Whether to apply randomized jitter to the delay (default: true). */
  jitter?: boolean;
  /** Maximum delay cap in milliseconds (default: 10000). */
  maxDelayMs?: number;
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  baseDelayMs: 1_000,
  jitter: true,
  maxDelayMs: 10_000,
  maxRetries: 3,
};

/** HTTP status codes that indicate a transient/retryable failure. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Fetch with automatic retry for transient failures.
 *
 * Wraps the standard `fetch` API and retries on:
 * - Network errors (fetch throws)
 * - Retryable HTTP status codes: 429, 500, 502, 503, 504
 *
 * Non-retryable responses (e.g. 400, 401, 403, 404) are returned immediately
 * without retry.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options
 * @param retryOptions - Configurable retry behavior
 * @returns The fetch Response
 * @throws The last network error if all retry attempts fail
 */
export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  const options: Required<RetryOptions> = { ...DEFAULT_OPTIONS, ...retryOptions };
  const signal = init?.signal ?? null;

  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Non-retryable status — return immediately
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      // Retryable status — retry if attempts remain
      if (attempt < options.maxRetries) {
        const retryAfterMs = response.status === 429 ? parseRetryAfter(response) : null;
        const delay = retryAfterMs ?? computeDelay(attempt, options);
        await sleep(delay, signal);
        continue;
      }

      // All retries exhausted — return the last retryable response
      return response;
    } catch (error: unknown) {
      lastError = error;

      // If the caller's signal was aborted, propagate immediately
      if (signal?.aborted) {
        throw error;
      }

      // Network error — retry if attempts remain
      if (attempt < options.maxRetries) {
        const delay = computeDelay(attempt, options);
        await sleep(delay, signal);
        continue;
      }

      // All retries exhausted — throw the last error
      throw error;
    }
  }

  // This should be unreachable, but TypeScript needs it
  throw lastError;
}

/**
 * Check whether an HTTP status code is retryable (transient failure).
 *
 * Retryable statuses: 429 (Too Many Requests), 500 (Internal Server Error),
 * 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout).
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Compute the delay before the next retry attempt.
 *
 * Uses exponential backoff: baseDelay * 2^attempt, capped at maxDelay.
 * Applies randomized jitter (0.5x to 1.5x) when enabled.
 */
function computeDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.baseDelayMs * 2 ** attempt;
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

  if (!options.jitter) {
    return cappedDelay;
  }

  // Apply jitter: multiply by a random factor between 0.5 and 1.5
  const jitterFactor = 0.5 + Math.random();
  return Math.min(jitterFactor * cappedDelay, options.maxDelayMs);
}

/**
 * Parse the Retry-After header value from a response.
 *
 * Supports integer seconds format. Returns the delay in milliseconds,
 * or null if the header is missing or unparseable.
 */
function parseRetryAfter(response: Response): null | number {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1_000;
  }

  return null;
}

/**
 * Sleep for the specified duration, respecting an optional abort signal.
 *
 * Resolves after the delay or rejects immediately if the signal is already
 * aborted or becomes aborted during the wait.
 */
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
