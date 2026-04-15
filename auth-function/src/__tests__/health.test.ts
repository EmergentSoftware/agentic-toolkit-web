import type { HttpRequest } from '@azure/functions';

import { describe, expect, it } from 'vitest';

import { healthHandler } from '../health.js';

function makeRequest(): HttpRequest {
  const req = new Request('http://localhost/api/health', { method: 'GET' });
  return req as unknown as HttpRequest;
}

describe('healthHandler', () => {
  it('returns 200 with status ok and a version string', async () => {
    const response = await healthHandler(makeRequest(), {} as never);

    expect(response.status).toBe(200);
    const body = response.jsonBody as { status: string; version: string };
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('marks the response as non-cacheable JSON', async () => {
    const response = await healthHandler(makeRequest(), {} as never);
    const headers = response.headers as Record<string, string>;

    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
