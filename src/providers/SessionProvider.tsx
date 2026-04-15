import { Octokit } from '@octokit/rest';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { queryKeys } from '@/lib/query-keys';
import {
  buildAuthorizeUrl,
  clearToken,
  defaultRedirectUri,
  EMERGENT_ORG,
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
  /** Called by the AuthCallback route after a successful code exchange. */
  completeSignIn: (token: string) => void;
  octokit: null | Octokit;
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

  const octokit = useMemo(() => (token ? new Octokit({ auth: token }) : null), [token]);

  const verifyQuery = useQuery<{ membership: boolean; user: SessionUser }, Error>({
    enabled: Boolean(token && octokit),
    queryFn: async () => {
      if (!octokit) throw new Error('Octokit client not initialized');
      const userResp = await octokit.rest.users.getAuthenticated();
      const sessionUser: SessionUser = {
        avatarUrl: userResp.data.avatar_url ?? null,
        login: userResp.data.login,
        name: userResp.data.name ?? null,
      };
      let membership = false;
      try {
        // /user/memberships/orgs/{org} — checks the AUTHENTICATED user's own
        // membership. Works regardless of membership visibility (public/private)
        // and does not depend on the "requester can see the org members" rule
        // that trips up `checkMembershipForUser`.
        const res = await octokit.rest.orgs.getMembershipForAuthenticatedUser({
          org: EMERGENT_ORG,
        });
        membership = res.data.state === 'active';
      } catch (error: unknown) {
        const err = error as { message?: string; response?: { data?: unknown; headers?: Record<string, string> }; status?: number };
         
        console.warn('[SessionProvider] Org-membership check failed:', {
          body: err.response?.data,
          hint:
            err.status === 404
              ? 'Likely OAuth App restriction: the EmergentSoftware org must approve this OAuth App. Visit https://github.com/orgs/EmergentSoftware/policies/applications'
              : err.status === 403
                ? 'Likely SAML SSO: authorize the OAuth token for the org at https://github.com/settings/tokens'
                : undefined,
          message: err.message,
          ssoHeader: err.response?.headers?.['x-github-sso'],
          status: err.status,
        });
        // 404 → not a member OR OAuth App is not approved for the org.
        // 403 → forbidden (token lacks read:org, or SAML SSO not authorized).
        if (err.status === 404 || err.status === 403) membership = false;
        else throw error;
      }
      return { membership, user: sessionUser };
    },
    queryKey: token ? queryKeys.session.user(fingerprintToken(token)) : ['session', 'user', 'none'],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const status = useMemo<SessionStatus>(() => {
    if (isAuthenticating) return 'authenticating';
    if (!token) return 'signed-out';
    if (verifyQuery.isPending || verifyQuery.isFetching) return 'verifying';
    if (verifyQuery.isError) return 'non-member';
    return verifyQuery.data?.membership ? 'member' : 'non-member';
  }, [isAuthenticating, token, verifyQuery.data, verifyQuery.isError, verifyQuery.isFetching, verifyQuery.isPending]);

  const signIn = useCallback((returnPath?: string) => {
    // HashRouter URL after the leading '#'. Fallback to '/'.
    const currentHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
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

  // Keep isAuthenticating in sync if the user returns to the tab with an existing token.
  useEffect(() => {
    if (token) setIsAuthenticating(false);
  }, [token]);

  const value = useMemo<SessionContextValue>(
    () => ({
      completeSignIn,
      octokit,
      signIn,
      signOut,
      status,
      token,
      user: verifyQuery.data?.user ?? null,
    }),
    [completeSignIn, octokit, signIn, signOut, status, token, verifyQuery.data?.user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
