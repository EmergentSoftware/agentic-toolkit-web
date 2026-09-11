import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { me } from '@/lib/api';
import { type ApiClient, createApiClient, isApiError, unwrap } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  buildAuthorizeUrl,
  clearToken,
  defaultRedirectUri,
  fingerprintToken,
  generateOAuthState,
  getClientId,
  OAUTH_SCOPES,
  readToken,
  type SessionStatus,
  writeOAuthState,
  writeToken,
} from '@/lib/session';

export interface SessionContextValue {
  /** ATK API client configured with the session token; null when signed out. */
  api: ApiClient | null;
  /** Called by the AuthCallback route after a successful code exchange. */
  completeSignIn: (token: string) => void;
  signIn: (returnPath?: string) => void;
  signOut: () => void;
  status: SessionStatus;
  token: null | string;
  user: null | SessionUser;
}

export interface SessionUser {
  avatarUrl: null | string;
  login: string;
  name: null | string;
}

export const SessionContext = createContext<null | SessionContextValue>(null);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [token, setToken] = useState<null | string>(() => readToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const api = useMemo(() => (token ? createApiClient(token) : null), [token]);

  // `GET /me` both identifies the caller and enforces EmergentSoftware
  // membership: a 2xx means "active member"; 401 means the token is dead;
  // 403 `not_org_member` / `org_membership_unverifiable` means "signed in, but
  // not allowed in".
  const verifyQuery = useQuery<SessionUser, Error>({
    enabled: Boolean(token && api),
    queryFn: async ({ signal }) => {
      if (!api) throw new Error('API client not initialized');
      const principal = unwrap(await me({ client: api, signal }), 'your GitHub account');
      return {
        avatarUrl: principal.avatarUrl ?? null,
        login: principal.login,
        name: principal.name ?? null,
      };
    },
    queryKey: token ? queryKeys.session.user(fingerprintToken(token)) : ['session', 'user', 'none'],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const verifyError = verifyQuery.error;
  const tokenRejected = isApiError(verifyError, undefined, 401);

  useEffect(() => {
    if (!verifyError) return;
    if (isApiError(verifyError, 'org_membership_unverifiable')) {
      console.warn('[SessionProvider] Org membership could not be verified:', {
        hints: [
          'OAuth App restriction: the EmergentSoftware org must approve this OAuth App at https://github.com/orgs/EmergentSoftware/policies/applications',
          'SAML SSO: authorize the OAuth token for the org at https://github.com/settings/tokens',
        ],
        message: verifyError.message,
        status: verifyError.status,
      });
    } else if (!isApiError(verifyError, 'not_org_member') && !tokenRejected) {
      console.warn('[SessionProvider] Session verification failed:', verifyError);
    }
  }, [tokenRejected, verifyError]);

  const status = useMemo<SessionStatus>(() => {
    if (isAuthenticating) return 'authenticating';
    if (!token) return 'signed-out';
    if (verifyQuery.isPending || verifyQuery.isFetching) return 'verifying';
    if (verifyQuery.isError) return tokenRejected ? 'signed-out' : 'non-member';
    return verifyQuery.data ? 'member' : 'non-member';
  }, [
    isAuthenticating,
    token,
    tokenRejected,
    verifyQuery.data,
    verifyQuery.isError,
    verifyQuery.isFetching,
    verifyQuery.isPending,
  ]);

  const signIn = useCallback((returnPath?: string) => {
    // HashRouter URL after the leading '#'. Fallback to '/'.
    const currentHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const resolvedReturn = returnPath ?? (currentHash || '/');
    const stateValue = generateOAuthState();
    writeOAuthState({ returnPath: resolvedReturn, state: stateValue });
    setIsAuthenticating(true);
    const authorizeUrl = buildAuthorizeUrl({
      clientId: getClientId(),
      redirectUri: defaultRedirectUri(),
      scopes: OAUTH_SCOPES,
      state: stateValue,
    });
    window.location.assign(authorizeUrl);
  }, []);

  const completeSignIn = useCallback((newToken: string) => {
    writeToken(newToken);
    setToken(newToken);
    setIsAuthenticating(false);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setToken(null);
    setIsAuthenticating(false);
  }, []);

  // A 401 from the API means the stored token is dead: drop it so the app
  // returns to the signed-out landing instead of retrying forever.
  useEffect(() => {
    if (tokenRejected) signOut();
  }, [signOut, tokenRejected]);

  // Keep isAuthenticating in sync if the user returns to the tab with an existing token.
  useEffect(() => {
    if (token) setIsAuthenticating(false);
  }, [token]);

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      completeSignIn,
      signIn,
      signOut,
      status,
      token,
      user: verifyQuery.data ?? null,
    }),
    [api, completeSignIn, signIn, signOut, status, token, verifyQuery.data],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
