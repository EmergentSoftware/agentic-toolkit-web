import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@/lib/api-client';

import { useAssetFiles } from '@/hooks/useAssetFiles';
import { useBundleReadme } from '@/hooks/useBundleReadme';
import { useRegistry } from '@/hooks/useRegistry';
import { queryKeys } from '@/lib/query-keys';

import { loadFixtureRegistry } from '../fixtures';
import { apiErrorResponse, jsonResponse, makeTestApiClient, stubFetch, textResponse } from '../utils/api-stub';

// Intercept the session so we can feed the hooks a controlled API client (or null).
const sessionValueMock: {
  api: ApiClient | null;
  token: null | string;
} = { api: null, token: null };

vi.mock('@/hooks/useSession', () => ({
  useSession: () => sessionValueMock,
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: Infinity },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useRegistry (TanStack Query)', () => {
  beforeEach(() => {
    sessionValueMock.api = null;
    sessionValueMock.token = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays disabled when no API client is available on the session', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches and caches registry data via the API (no refetch on rerender)', async () => {
    const fixture = loadFixtureRegistry();
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    const { calls } = stubFetch(() => jsonResponse(fixture));

    const { Wrapper } = makeWrapper();
    const { rerender, result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assets).toHaveLength(fixture.assets.length);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://localhost:7071/registry');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok');

    rerender();
    expect(calls).toHaveLength(1);
  });

  it('refetches when the query is invalidated', async () => {
    const fixture = loadFixtureRegistry();
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    const { calls } = stubFetch(() => jsonResponse(fixture));

    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toHaveLength(1);

    await client.invalidateQueries({ queryKey: queryKeys.registry() });
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('surfaces 404s through useQuery.error as RegistryNotFoundError', async () => {
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    stubFetch(() => apiErrorResponse(404, 'not_found', 'registry.json is missing'));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe('RegistryNotFoundError');
  });
});

describe('useAssetFiles (TanStack Query)', () => {
  beforeEach(() => {
    sessionValueMock.api = null;
    sessionValueMock.token = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays disabled until the ref is complete and a client is available', async () => {
    sessionValueMock.api = makeTestApiClient('tok');
    const { calls } = stubFetch(() => jsonResponse({}));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssetFiles({ name: 'validate', type: 'agent' }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(calls).toHaveLength(0);
  });

  it('fetches the file listing under the assetFiles key', async () => {
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    const listing = {
      files: [
        { path: 'AGENT.md', sha: 'a', size: 10 },
        { path: 'manifest.json', sha: 'b', size: 20 },
      ],
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      version: '1.1.0',
    };
    const { calls } = stubFetch(() => jsonResponse(listing));

    const { client, Wrapper } = makeWrapper();
    const ref = { name: 'validate', org: 'agentic-toolkit', type: 'agent' as const, version: '1.1.0' };
    const { result } = renderHook(() => useAssetFiles(ref), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.files.map((f) => f.path)).toEqual(['AGENT.md', 'manifest.json']);
    expect(calls[0]!.url).toBe('http://localhost:7071/assets/agent/validate/1.1.0/files?org=agentic-toolkit');
    expect(client.getQueryData(queryKeys.assetFiles(ref))).toBeDefined();
  });
});

describe('useBundleReadme (TanStack Query)', () => {
  beforeEach(() => {
    sessionValueMock.api = null;
    sessionValueMock.token = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays disabled until the registry has resolved a version', async () => {
    sessionValueMock.api = makeTestApiClient('tok');
    const { calls } = stubFetch(() => textResponse('# Hi'));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBundleReadme({ name: 'qa-bundle', org: 'cupay' }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(calls).toHaveLength(0);
  });

  it('fetches the README markdown under the bundleReadme key', async () => {
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    const { calls } = stubFetch(() => textResponse('# Hi'));

    const { client, Wrapper } = makeWrapper();
    const ref = { name: 'qa-bundle', org: 'cupay', version: '1.0.0' };
    const { result } = renderHook(() => useBundleReadme(ref), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('# Hi');
    expect(calls[0]!.url).toBe('http://localhost:7071/bundles/qa-bundle/1.0.0/readme?org=cupay');
    expect(client.getQueryData(queryKeys.bundleReadme(ref))).toBe('# Hi');
  });

  it('resolves to null when the bundle has no README', async () => {
    sessionValueMock.token = 'tok';
    sessionValueMock.api = makeTestApiClient('tok');
    stubFetch(() => apiErrorResponse(404, 'not_found', 'No README'));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBundleReadme({ name: 'feature-workflow', version: '1.0.0' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
