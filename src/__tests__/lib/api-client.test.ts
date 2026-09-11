import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRegistry, me } from '@/lib/api';
import { ApiRequestError, createApiClient, getApiUrl, isApiError, unwrap } from '@/lib/api-client';

import { apiErrorResponse, jsonResponse, makeTestApiClient, stubFetch, textResponse } from '../utils/api-stub';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_ATK_API_URL', 'http://localhost:7071');
});

describe('getApiUrl', () => {
  it('reads VITE_ATK_API_URL and strips trailing slashes', () => {
    vi.stubEnv('VITE_ATK_API_URL', 'https://func-atk-dev.azurewebsites.net//');
    expect(getApiUrl()).toBe('https://func-atk-dev.azurewebsites.net');
  });

  it('throws the copy-.env.example error when unset', () => {
    vi.stubEnv('VITE_ATK_API_URL', '');
    expect(() => getApiUrl()).toThrow(/VITE_ATK_API_URL is not set.*\.env\.example/);
  });
});

describe('createApiClient', () => {
  it('sends the bearer token and routes requests through the configured base URL', async () => {
    const { calls } = stubFetch(() => jsonResponse({ login: 'octo', scheme: 'github' }));

    const result = await me({ client: makeTestApiClient('gho_abc') });

    expect(result.response?.status).toBe(200);
    expect(calls[0]!.url).toBe('http://localhost:7071/me');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer gho_abc');
  });

  it('omits the Authorization header when built without a token', async () => {
    const { calls } = stubFetch(() => jsonResponse({}));

    await getRegistry({ client: createApiClient(null, { retry: { maxRetries: 0 } }) });

    expect(calls[0]!.headers.get('authorization')).toBeNull();
  });

  it('retries transient failures through fetchWithRetry', async () => {
    const fixture = { assets: [], version: 'x' };
    const { calls } = stubFetch((_req, index) => (index === 0 ? textResponse('', 503) : jsonResponse(fixture)));

    const result = await getRegistry({ client: makeTestApiClient() });

    expect(calls).toHaveLength(2);
    expect(result.data).toEqual(fixture);
  });
});

describe('unwrap', () => {
  it('returns data for a 2xx result', () => {
    expect(unwrap({ data: { ok: true }, response: new Response(null, { status: 200 }) }, 'thing')).toEqual({
      ok: true,
    });
  });

  it('maps a thrown fetch to a network_error with status 0', () => {
    const err = catchError(() => unwrap({ error: new TypeError('offline') }, 'the registry index'));
    expect(isApiError(err, 'network_error', 0)).toBe(true);
    expect(err.message).toMatch(/could not reach the atk api.*offline/i);
  });

  it('uses the API error code and message from the envelope', () => {
    const err = catchError(() =>
      unwrap(
        {
          error: { error: 'version_not_bumped', message: '1.0.0 is not newer than 1.2.0' },
          response: new Response(null, { status: 409 }),
        },
        'the publish request',
      ),
    );
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('version_not_bumped');
    expect(err.status).toBe(409);
    expect(err.message).toBe('1.0.0 is not newer than 1.2.0');
  });

  it('carries validation details through', () => {
    const details = [{ message: 'must match pattern', path: '/manifest/name' }];
    const err = catchError(() =>
      unwrap(
        {
          error: { details, error: 'schema_invalid', message: 'Manifest failed schema validation' },
          response: new Response(null, { status: 400 }),
        },
        'the publish request',
      ),
    );
    expect(err.code).toBe('schema_invalid');
    expect(err.details).toEqual(details);
  });

  it('describes 401, non-member 403, 404, 429 and 5xx in user-facing terms', () => {
    const at = (status: number, error?: unknown) =>
      catchError(() => unwrap({ error: error ?? {}, response: new Response(null, { status }) }, 'the registry index'));

    expect(at(401).message).toMatch(/sign in again/i);
    expect(at(403, { error: 'not_org_member', message: 'nope' }).message).toMatch(/EmergentSoftware/);
    expect(at(403, { error: 'not_org_member', message: 'nope' }).code).toBe('not_org_member');
    expect(at(404).message).toMatch(/was not found/i);
    expect(at(429).message).toMatch(/rate limiting/i);
    expect(at(503, { error: 'upstream_unavailable', message: 'GitHub timed out' }).message).toMatch(
      /unavailable.*HTTP 503.*GitHub timed out/i,
    );
  });

  it('falls back to http_error with the raw body when there is no envelope', () => {
    const err = catchError(() =>
      unwrap({ error: 'Bad Gateway', response: new Response(null, { status: 502 }) }, 'the registry index'),
    );
    expect(err.code).toBe('http_error');
    expect(err.status).toBe(502);
  });

  it('isApiError narrows by code and status', () => {
    const err = new ApiRequestError('x', { code: 'not_found', resource: 'r', status: 404 });
    expect(isApiError(err)).toBe(true);
    expect(isApiError(err, 'not_found')).toBe(true);
    expect(isApiError(err, 'not_found', 404)).toBe(true);
    expect(isApiError(err, 'branch_exists')).toBe(false);
    expect(isApiError(err, undefined, 409)).toBe(false);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});

it('carries a real API envelope through the generated client into ApiRequestError', async () => {
  stubFetch(() => apiErrorResponse(403, 'org_membership_unverifiable', 'SAML SSO required'));

  const result = await me({ client: makeTestApiClient() });
  const mapped = catchError(() => unwrap(result, 'your GitHub account'));
  expect(mapped.code).toBe('org_membership_unverifiable');
  expect(mapped.status).toBe(403);
  expect(mapped.resource).toBe('your GitHub account');
});

function catchError(fn: () => unknown): ApiRequestError {
  try {
    fn();
  } catch (error) {
    return error as ApiRequestError;
  }
  throw new Error('expected the call to throw');
}
