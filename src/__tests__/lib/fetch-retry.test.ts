import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithRetry, isRetryableStatus } from '@/lib/fetch-retry';

function mockResponse(init: { body?: string; headers?: Record<string, string>; status: number }): Response {
  return new Response(init.body ?? '', {
    headers: init.headers ?? {},
    status: init.status,
  });
}

const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 3 } as const;

describe('fetch-retry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies retryable statuses', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  it('retries on 503 and eventually returns a 200', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 503 }))
      .mockResolvedValueOnce(mockResponse({ status: 503 }))
      .mockResolvedValueOnce(mockResponse({ body: 'ok', status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://example.test/foo', undefined, fastRetry);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable 404', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse({ status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://example.test/missing', undefined, fastRetry);
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respects Retry-After on 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ headers: { 'Retry-After': '1' }, status: 429 }))
      .mockResolvedValueOnce(mockResponse({ body: 'ok', status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const res = await fetchWithRetry('https://example.test/limited', undefined, {
      baseDelayMs: 1,
      jitter: false,
      maxDelayMs: 10_000,
      maxRetries: 3,
    });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(1_000);
  });

  it('returns the last retryable response after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://example.test/down', undefined, fastRetry);
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(fastRetry.maxRetries + 1);
  });

  it('propagates abort errors without retry', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://example.test/foo', { signal: controller.signal }, fastRetry),
    ).rejects.toBeInstanceOf(DOMException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the last network error after exhausting retries', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithRetry('https://example.test/foo', undefined, fastRetry)).rejects.toThrow(
      /network down/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(fastRetry.maxRetries + 1);
  });
});
