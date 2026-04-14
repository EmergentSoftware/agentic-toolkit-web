import type { Octokit } from '@octokit/rest';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SessionContext, type SessionContextValue } from '@/providers/SessionProvider';

interface SessionHarnessProps {
  children: ReactNode;
  client?: QueryClient;
  session: SessionContextValue;
}

/** Default no-op session. Override fields as needed per test. */
export function makeSessionValue(overrides: Partial<SessionContextValue> = {}): SessionContextValue {
  return {
    completeSignIn: () => {},
    octokit: null,
    signIn: () => {},
    signOut: () => {},
    status: 'signed-out',
    token: null,
    user: null,
    ...overrides,
  };
}

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: Infinity },
    },
  });
}

/** Wrapper that mounts a QueryClientProvider + a fixed SessionContext value. */
export function SessionHarness({ children, client, session }: SessionHarnessProps) {
  const qc = client ?? makeTestQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  );
}

/** Minimal Octokit stub whose only method is `rest.repos.getContent`. */
export function stubOctokit(
  getContent: (params: unknown) => Promise<unknown>,
): Octokit {
  return { rest: { repos: { getContent } } } as unknown as Octokit;
}
