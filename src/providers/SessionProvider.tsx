import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { me } from '@/lib/api';
import {
  type ApiClient,
  type ApiCredential,
  createApiClient,
  isApiError,
  SESSION_EXPIRED_CODE,
  sessionExpiredError,
  unwrap,
} from '@/lib/api-client';
import { describeEntraError, type EntraAccount, type EntraClient, isSessionExpiredError } from '@/lib/entra';
import { queryKeys } from '@/lib/query-keys';
import {
  buildAuthorizeUrl,
  clearOAuthState,
  clearToken,
  defaultRedirectUri,
  fingerprintToken,
  generateOAuthState,
  getClientId,
  OAUTH_SCOPES,
  readToken,
  type SessionNotice,
  type SessionScheme,
  type SessionStatus,
  type SessionUser,
  writeOAuthState,
  writeToken,
} from '@/lib/session';

export interface SessionContextValue {
  /** ATK API client configured with the session credential; null when signed out. */
  api: ApiClient | null;
  /** Called by the AuthCallback route after a successful GitHub code exchange. */
  completeSignIn: (token: string) => void;
  dismissNotice: () => void;
  /** Why the last session ended, shown on the signed-out landing. */
  notice: null | SessionNotice;
  /** Which provider the current session came from; null when signed out. */
  scheme: null | SessionScheme;
  /** Start a sign-in. Either provider first clears the other's state. */
  signIn: (provider: SessionScheme, returnPath?: string) => void;
  signOut: () => void;
  status: SessionStatus;
  user: null | SessionUser;
}

export const SessionContext = createContext<null | SessionContextValue>(null);

interface SessionProviderProps {
  children: ReactNode;
  /** The Entra (MSAL) client; production passes `createEntraClient()`, tests a fake. */
  entraClient: EntraClient;
}

const ENTRA_EXPIRED_MESSAGE = 'Your Emergent sign-in has expired. Sign in again.';

/**
 * One session, two providers.
 *
 * - GitHub: the token from the OAuth callback lives in sessionStorage.
 * - Entra: MSAL owns the account and tokens (also sessionStorage); the API
 *   client asks it for an access token on every request.
 *
 * Startup initializes MSAL and completes a redirect return before the status
 * is anything other than `verifying`, so no route sees the redirect in flight.
 * `GET /me` then identifies the caller and enforces membership for both
 * schemes: 2xx is `member`; 403 `not_org_member` / `org_membership_unverifiable`
 * / `guest_not_allowed` is `non-member`; 401 ends the session.
 */
export function SessionProvider({ children, entraClient }: SessionProviderProps) {
  const [githubToken, setGithubToken] = useState<null | string>(() => readToken());
  const [entraAccount, setEntraAccount] = useState<EntraAccount | null>(null);
  const [entraReady, setEntraReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [notice, setNotice] = useState<null | SessionNotice>(null);
  const startedRef = useRef(false);

  const scheme: null | SessionScheme = entraAccount ? 'entra' : githubToken ? 'github' : null;

  const dropEntraAccount = useCallback(() => {
    setEntraAccount(null);
    entraClient.clearAccount().catch((error: unknown) => {
      console.warn('[SessionProvider] Could not clear the Entra account:', error);
    });
  }, [entraClient]);

  const dropGithubToken = useCallback(() => {
    clearToken();
    clearOAuthState();
    setGithubToken(null);
  }, []);

  // Startup: initialize MSAL, then complete a redirect return if this load is one.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        await entraClient.initialize();
        const returned = await entraClient.handleRedirect();
        const account = returned ?? entraClient.getAccount();
        if (account) {
          // One scheme at a time: an Entra account outranks a leftover GitHub token.
          if (readToken()) dropGithubToken();
          setEntraAccount(account);
        }
      } catch (error) {
        setNotice({ kind: 'sign_in_failed', message: describeEntraError(error) });
      } finally {
        setEntraReady(true);
      }
    })();
  }, [dropGithubToken, entraClient]);

  const expireEntraSession = useCallback(() => {
    setNotice({ kind: 'entra_expired', message: ENTRA_EXPIRED_MESSAGE });
    dropEntraAccount();
  }, [dropEntraAccount]);

  const credential = useMemo<ApiCredential>(() => {
    if (entraAccount) {
      return {
        getToken: async () => {
          try {
            return await entraClient.acquireToken();
          } catch (error) {
            if (isSessionExpiredError(error)) {
              expireEntraSession();
              throw sessionExpiredError();
            }
            throw error;
          }
        },
        scheme: 'entra',
      };
    }
    if (githubToken) return { scheme: 'github', token: githubToken };
    return null;
  }, [entraAccount, entraClient, expireEntraSession, githubToken]);

  const api = useMemo(() => (credential ? createApiClient(credential) : null), [credential]);

  const queryKey = entraAccount
    ? queryKeys.session.user(`entra:${entraAccount.homeAccountId}`)
    : githubToken
      ? queryKeys.session.user(`github:${fingerprintToken(githubToken)}`)
      : queryKeys.session.user('none');

  const verifyQuery = useQuery<SessionUser, Error>({
    // Nothing is sent until startup has settled which scheme (if any) is active.
    enabled: entraReady && Boolean(credential && api),
    queryFn: async ({ signal }) => {
      if (!api) throw new Error('API client not initialized');
      return unwrap(await me({ client: api, signal }), 'your account');
    },
    queryKey,
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
    } else if (
      !isApiError(verifyError, 'not_org_member') &&
      !isApiError(verifyError, 'guest_not_allowed') &&
      !tokenRejected
    ) {
      console.warn('[SessionProvider] Session verification failed:', verifyError);
    }
  }, [tokenRejected, verifyError]);

  const status = useMemo<SessionStatus>(() => {
    if (isAuthenticating) return 'authenticating';
    if (!entraReady) return 'verifying';
    if (!credential) return 'signed-out';
    if (verifyQuery.isPending || verifyQuery.isFetching) return 'verifying';
    if (verifyQuery.isError) return tokenRejected ? 'signed-out' : 'non-member';
    return verifyQuery.data ? 'member' : 'non-member';
  }, [
    credential,
    entraReady,
    isAuthenticating,
    tokenRejected,
    verifyQuery.data,
    verifyQuery.isError,
    verifyQuery.isFetching,
    verifyQuery.isPending,
  ]);

  const signIn = useCallback(
    (provider: SessionScheme, returnPath?: string) => {
      // HashRouter URL after the leading '#'. Fallback to '/'.
      const currentHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const resolvedReturn = returnPath ?? (currentHash || '/');
      setNotice(null);
      setIsAuthenticating(true);

      if (provider === 'entra') {
        if (githubToken) dropGithubToken();
        entraClient.login(resolvedReturn).catch((error: unknown) => {
          setNotice({ kind: 'sign_in_failed', message: describeEntraError(error) });
          setIsAuthenticating(false);
        });
        return;
      }

      if (entraAccount) dropEntraAccount();
      const stateValue = generateOAuthState();
      writeOAuthState({ returnPath: resolvedReturn, state: stateValue });
      const authorizeUrl = buildAuthorizeUrl({
        clientId: getClientId(),
        redirectUri: defaultRedirectUri(),
        scopes: OAUTH_SCOPES,
        state: stateValue,
      });
      window.location.assign(authorizeUrl);
    },
    [dropEntraAccount, dropGithubToken, entraAccount, entraClient, githubToken],
  );

  const completeSignIn = useCallback((newToken: string) => {
    writeToken(newToken);
    setGithubToken(newToken);
    setIsAuthenticating(false);
  }, []);

  const signOut = useCallback(() => {
    setNotice(null);
    setIsAuthenticating(false);
    if (entraAccount) {
      // Ends the Entra web session too; lands back on the app root, signed out.
      setEntraAccount(null);
      entraClient.logout().catch((error: unknown) => {
        console.warn('[SessionProvider] Entra sign-out redirect failed; clearing the local session:', error);
        dropEntraAccount();
      });
      return;
    }
    dropGithubToken();
  }, [dropEntraAccount, dropGithubToken, entraAccount, entraClient]);

  // A 401 from `/me` means the credential is dead: drop it so the app returns
  // to the signed-out landing instead of retrying forever. `github_auth_retired`
  // keeps the API's message; an expired Entra session set its own notice.
  useEffect(() => {
    if (!tokenRejected || !verifyError) return;
    const message: string = verifyError.message;
    const retired = isApiError(verifyError, 'github_auth_retired');
    const expired = isApiError(verifyError, SESSION_EXPIRED_CODE);
    if (retired) {
      setNotice({ kind: 'github_auth_retired', message });
    } else if (entraAccount && !expired) {
      setNotice({ kind: 'sign_in_failed', message: `Your Emergent sign-in was refused: ${message}` });
    }
    if (entraAccount) dropEntraAccount();
    else dropGithubToken();
  }, [dropEntraAccount, dropGithubToken, entraAccount, tokenRejected, verifyError]);

  // Keep isAuthenticating in sync if the user returns to the tab with a session.
  useEffect(() => {
    if (scheme) setIsAuthenticating(false);
  }, [scheme]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      completeSignIn,
      dismissNotice,
      notice,
      scheme,
      signIn,
      signOut,
      status,
      user: verifyQuery.data ?? null,
    }),
    [api, completeSignIn, dismissNotice, notice, scheme, signIn, signOut, status, verifyQuery.data],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
