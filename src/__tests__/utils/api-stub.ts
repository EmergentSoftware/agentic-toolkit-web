import { vi } from 'vitest';

import { type ApiClient, createApiClient } from '@/lib/api-client';

/** Matches `VITE_ATK_API_URL` stubbed in `setupTests.ts`. */
export const API_BASE = 'http://localhost:7071';

/** Retry policy that keeps tests fast while still exercising one retry. */
export const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 1 } as const;

/** One request the stubbed `fetch` received, with its body already read. */
export interface RecordedRequest {
  body: string;
  headers: Headers;
  method: string;
  url: string;
}

type FetchHandler = (request: RecordedRequest, index: number) => Promise<Response> | Response;

/** An ATK API error envelope response. */
export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  details?: Array<{ message: string; path?: null | string }>,
): Response {
  return jsonResponse({ details: details ?? null, error: code, message }, status);
}

/** A binary (zip) response. */
export function blobResponse(bytes: string | Uint8Array, contentType = 'application/zip'): Response {
  const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return new Response(body as BodyInit, { headers: { 'content-type': contentType }, status: 200 });
}

/** A JSON response. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

/** Build a real API client (bearer auth + retries) pointed at the test base URL. */
export function makeTestApiClient(token: null | string = 'test-token', retry = fastRetry): ApiClient {
  return createApiClient(token, { retry });
}

/**
 * Replace global `fetch` with a recorder that hands each request to `handler`.
 * The generated client calls `fetch(Request)`, so the stub normalises either
 * calling convention and reads the body up front for assertions.
 */
export function stubFetch(handler: FetchHandler): { calls: RecordedRequest[]; mock: ReturnType<typeof vi.fn> } {
  const calls: RecordedRequest[] = [];
  const mock = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const recorded: RecordedRequest = {
      body: await request.clone().text(),
      headers: request.headers,
      method: request.method,
      url: request.url,
    };
    calls.push(recorded);
    return handler(recorded, calls.length - 1);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

/** A plain-text response (README markdown, or an error body without an envelope). */
export function textResponse(text: string, status = 200, contentType = 'text/markdown'): Response {
  return new Response(text, { headers: { 'content-type': contentType }, status });
}
