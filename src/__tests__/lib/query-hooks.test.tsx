import type { Octokit } from '@octokit/rest';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRegistry } from '@/hooks/useRegistry';
import { queryKeys } from '@/lib/query-keys';

import { loadFixtureRegistry } from '../fixtures';

// Intercept the session so we can feed the hooks a controlled Octokit (or null).
const sessionValueMock: {
  octokit: null | Octokit;
  token: null | string;
} = { octokit: null, token: null };

vi.mock('@/hooks/useSession', () => ({
  useSession: () => sessionValueMock,
}));

type GetContentResult = Awaited<ReturnType<Octokit['rest']['repos']['getContent']>>;

function fakeOctokit(queue: Array<Error | GetContentResult | string>): Octokit {
  const spy = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('fakeOctokit: queue exhausted');
    if (next instanceof Error) throw next;
    if (typeof next === 'string') return rawResponse(next);
    return next;
  });
  return { rest: { repos: { getContent: spy } } } as unknown as Octokit;
}

function httpError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

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

function rawResponse(raw: string): GetContentResult {
  return { data: raw } as unknown as GetContentResult;
}

describe('useRegistry (TanStack Query)', () => {
  beforeEach(() => {
    sessionValueMock.octokit = null;
    sessionValueMock.token = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays disabled when no Octokit is available on the session', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches and caches registry data via Octokit (no refetch on rerender)', async () => {
    const fixture = loadFixtureRegistry();
    sessionValueMock.token = 'tok';
    sessionValueMock.octokit = fakeOctokit([
      JSON.stringify(fixture),
      JSON.stringify(fixture),
    ]);

    const { Wrapper } = makeWrapper();
    const { rerender, result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assets).toHaveLength(fixture.assets.length);

    const spy = sessionValueMock.octokit.rest.repos.getContent as unknown as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(1);

    rerender();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refetches when the query is invalidated', async () => {
    const fixture = loadFixtureRegistry();
    sessionValueMock.token = 'tok';
    sessionValueMock.octokit = fakeOctokit([
      JSON.stringify(fixture),
      JSON.stringify(fixture),
    ]);

    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const spy = sessionValueMock.octokit.rest.repos.getContent as unknown as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: queryKeys.registry() });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('surfaces 404s through useQuery.error as RegistryNotFoundError', async () => {
    sessionValueMock.token = 'tok';
    sessionValueMock.octokit = fakeOctokit([httpError(404)]);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRegistry(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe('RegistryNotFoundError');
  });
});
