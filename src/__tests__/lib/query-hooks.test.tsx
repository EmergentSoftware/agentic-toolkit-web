import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRegistry } from '@/hooks';
import { queryKeys } from '@/lib/query-keys';

import { loadFixtureRegistry } from '../fixtures';

function encodeContents(obj: unknown): { content: string; encoding: 'base64' } {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return { content: btoa(binary), encoding: 'base64' };
}

function githubOk(obj: unknown): Response {
  return new Response(JSON.stringify(encodeContents(obj)), { status: 200 });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useRegistry (TanStack Query)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and caches registry data (no refetch on rerender)', async () => {
    const fixture = loadFixtureRegistry();
    const fetchMock = vi.fn().mockResolvedValue(githubOk(fixture));
    vi.stubGlobal('fetch', fetchMock);

    const { Wrapper } = makeWrapper();
    const { rerender, result } = renderHook(
      () => useRegistry({ retry: { baseDelayMs: 1, jitter: false, maxDelayMs: 1, maxRetries: 0 } }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assets).toHaveLength(fixture.assets.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches when the query is invalidated', async () => {
    const fixture = loadFixtureRegistry();
    const fetchMock = vi.fn().mockResolvedValue(githubOk(fixture));
    vi.stubGlobal('fetch', fetchMock);

    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useRegistry({ retry: { baseDelayMs: 1, jitter: false, maxDelayMs: 1, maxRetries: 0 } }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: queryKeys.registry() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('surfaces errors through useQuery.error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useRegistry({ retry: { baseDelayMs: 1, jitter: false, maxDelayMs: 1, maxRetries: 0 } }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe('RegistryNotFoundError');
  });
});
