import type { HttpRequest, InvocationContext } from '@azure/functions';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exchangeHandler } from '../exchange.js';

const ALLOWED_ORIGIN = 'https://emergentsoftware.github.io';

function makeContext(): { context: InvocationContext; logs: string[] } {
  const logs: string[] = [];
  const log = vi.fn((msg: string) => {
    logs.push(msg);
  });
  // The handler only uses context.log(), so a minimal stub is enough.
  const context = { log } as unknown as InvocationContext;
  return { context, logs };
}

function makeRequest(init: {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}): HttpRequest {
  const headers = new Headers(init.headers);
  const method = init.method ?? 'POST';
  const hasBody = init.body !== undefined && method !== 'GET' && method !== 'OPTIONS';
  const req = new Request('http://localhost/api/auth/exchange', {
    body: hasBody ? JSON.stringify(init.body) : undefined,
    headers,
    method,
  });
  return req as unknown as HttpRequest;
}

describe('exchangeHandler', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.CORS_ALLOWED_ORIGINS;
    vi.restoreAllMocks();
  });

  it('exchanges a valid code for an access token', async () => {
    const upstream = {
      access_token: 'gho_secret_token_xyz',
      scope: 'read:org,repo',
      token_type: 'bearer',
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(upstream), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { context, logs } = makeContext();
    const req = makeRequest({
      body: { code: 'abc123' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(upstream);
    const headers = response.headers as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(headers.Vary).toBe('Origin');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      code: 'abc123',
    });

    for (const line of logs) {
      expect(line).not.toContain('gho_secret_token_xyz');
      expect(line).not.toContain('test-client-secret');
      expect(line).not.toContain('abc123');
    }
  });

  it('maps GitHub OAuth error responses to a 400 error envelope', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
          error_uri: 'https://docs.github.com/',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      ),
    ) as unknown as typeof fetch;

    const { context } = makeContext();
    const req = makeRequest({
      body: { code: 'expired' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(400);
    expect(response.jsonBody).toEqual({
      error: 'bad_verification_code',
      message: 'The code passed is incorrect or expired.',
    });
  });

  it('rejects a missing/empty code with a 400 validation error', async () => {
    const { context } = makeContext();
    const req = makeRequest({
      body: { code: '' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(400);
    const body = response.jsonBody as { error: string; message: string };
    expect(body.error).toBe('invalid_request');
    expect(body.message).toContain('code');
  });

  it('returns 500 when GitHub OAuth app settings are missing', async () => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;

    const { context } = makeContext();
    const req = makeRequest({
      body: { code: 'abc123' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({
      error: 'server_misconfigured',
      message: 'OAuth application settings are not configured.',
    });
  });

  it('responds to CORS preflight OPTIONS with 204 and allowed-origin headers', async () => {
    const { context } = makeContext();
    const req = makeRequest({
      headers: {
        'Access-Control-Request-Method': 'POST',
        Origin: ALLOWED_ORIGIN,
      },
      method: 'OPTIONS',
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(204);
    const headers = response.headers as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
    expect(headers.Vary).toBe('Origin');
  });

  it('rejects preflight from an unknown origin with 403 and no CORS headers', async () => {
    const { context } = makeContext();
    const req = makeRequest({
      headers: { Origin: 'https://evil.example.com' },
      method: 'OPTIONS',
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(403);
    const headers = response.headers as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('rejects POSTs from an unknown origin before calling GitHub', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { context } = makeContext();
    const req = makeRequest({
      body: { code: 'abc123' },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
      },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream network failures to a 502 error envelope', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('network unreachable');
    }) as unknown as typeof fetch;

    const { context, logs } = makeContext();
    const req = makeRequest({
      body: { code: 'abc123' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    const response = await exchangeHandler(req, context);

    expect(response.status).toBe(502);
    expect((response.jsonBody as { error: string }).error).toBe(
      'upstream_unavailable',
    );
    for (const line of logs) {
      expect(line).not.toContain('abc123');
    }
  });

  it('scrubs sensitive fields from error log output', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: 'leaky_token',
          error: 'server_error',
        }),
        { status: 500 },
      ),
    ) as unknown as typeof fetch;

    const { context, logs } = makeContext();
    const req = makeRequest({
      body: { code: 'abc123' },
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    });

    await exchangeHandler(req, context);

    for (const line of logs) {
      expect(line).not.toContain('leaky_token');
      expect(line).not.toContain('abc123');
      expect(line).not.toContain('test-client-secret');
    }
  });
});
