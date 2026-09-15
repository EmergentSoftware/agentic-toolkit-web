/**
 * Microsoft Entra sign-in for the web app, over `@azure/msal-browser` v5.
 *
 * The MSAL instance sits behind the small {@link EntraClient} interface so the
 * session provider and its tests never touch the package directly: production
 * uses {@link createEntraClient}, tests inject {@link createFakeEntraClient}.
 *
 * Flow: auth-code + PKCE via `loginRedirect`. Entra returns to the redirect
 * bridge page (`auth-redirect.html`), which hands the response to MSAL and
 * navigates back to the route that started sign-in; `handleRedirectPromise()`
 * on that load completes the sign-in. Tokens live in sessionStorage (per tab).
 */

import {
  type AccountInfo,
  AuthError,
  BrowserAuthError,
  BrowserAuthErrorCodes,
  ClientAuthError,
  ClientAuthErrorCodes,
  InteractionRequiredAuthError,
  PublicClientApplication,
  ServerError,
} from '@azure/msal-browser';

/** The Emergent Software tenant. */
export const ENTRA_TENANT_ID = '25ee13ae-a8a5-4bc2-bb23-aea90536fb0c';
export const ENTRA_AUTHORITY = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`;
/** The `ES ATK Web` SPA app registration (shared by dev and prod). */
export const ENTRA_CLIENT_ID = '07a23158-19c4-4180-a2a9-41cb80882a65';
/** The `ES ATK API` scope; MSAL adds `openid profile offline_access` itself. */
export const ENTRA_SCOPES = ['api://8da5aa72-0565-4ae8-bf5a-db89d8bd3186/access_as_user'];

/** The signed-in Entra account, as much of MSAL's `AccountInfo` as the app needs. */
export interface EntraAccount {
  /** MSAL's stable per-account key; used as the `/me` query-key segment. */
  homeAccountId: string;
  name?: string;
  /** The user principal name (`jasonp@emergentsoftware.net`). */
  username: string;
}

/** What the session provider needs from MSAL. */
export interface EntraClient {
  /** Silently get an API access token for the active account; never interactive. */
  acquireToken(): Promise<string>;
  /** Drop the active account and its tokens without a redirect (expired session). */
  clearAccount(): Promise<void>;
  /** The active account in this tab, or null. */
  getAccount(): EntraAccount | null;
  /**
   * Complete a redirect return. Resolves to the signed-in account, or null
   * when this page load is not a return from Entra. Rejects when the sign-in
   * failed (cancelled, `redirect_uri_mismatch`, network).
   */
  handleRedirect(): Promise<EntraAccount | null>;
  /** Must resolve before any other method is called. */
  initialize(): Promise<void>;
  /** Start the redirect sign-in; the app is re-entered at `#<returnPath>`. */
  login(returnPath: string): Promise<void>;
  /** Sign out of Entra and land on the app root, signed out. */
  logout(): Promise<void>;
}

export type FakeEntraCall =
  | { method: 'acquireToken' | 'clearAccount' | 'handleRedirect' | 'initialize' | 'logout' }
  | { method: 'login'; returnPath: string };

/** Scripted stand-in for tests. Mutate `state` to drive the next call's outcome. */
export interface FakeEntraClient extends EntraClient {
  calls: FakeEntraCall[];
  state: FakeEntraState;
}

export interface FakeEntraState {
  /** What `getAccount()` returns, and what `handleRedirect()` installs on success. */
  account: EntraAccount | null;
  /** When set, `handleRedirect()` rejects with it. */
  redirectError?: unknown;
  /** When set, `handleRedirect()` resolves with it (and installs it as `account`). */
  redirectResult?: EntraAccount | null;
  /** What `acquireToken()` resolves with. */
  token: string;
  /** When set, `acquireToken()` rejects with it. */
  tokenError?: unknown;
}

/** The app root (`origin` + Vite `base`), always with a trailing slash. A registered redirect URI. */
export function appRootUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base.endsWith('/') ? base : `${base}/`}`;
}

/** The {@link EntraClient} used in production. */
export function createEntraClient(): EntraClient {
  const pca = new PublicClientApplication({
    auth: {
      authority: ENTRA_AUTHORITY,
      clientId: ENTRA_CLIENT_ID,
      postLogoutRedirectUri: appRootUrl(),
      redirectUri: redirectBridgeUrl(),
    },
    cache: {
      cacheLocation: 'sessionStorage',
    },
  });

  const activeAccount = (): AccountInfo | null => {
    const active = pca.getActiveAccount();
    if (active) return active;
    const first = pca.getAllAccounts()[0] ?? null;
    if (first) pca.setActiveAccount(first);
    return first;
  };

  return {
    async acquireToken() {
      // With no account MSAL throws `no_account_error`, which counts as an expired session.
      const result = await pca.acquireTokenSilent({ account: activeAccount() ?? undefined, scopes: ENTRA_SCOPES });
      return result.accessToken;
    },
    async clearAccount() {
      const account = activeAccount();
      await pca.clearCache({ account });
      pca.setActiveAccount(null);
    },
    getAccount() {
      const account = activeAccount();
      return account ? toEntraAccount(account) : null;
    },
    async handleRedirect() {
      const result = await pca.handleRedirectPromise();
      if (!result?.account) return null;
      pca.setActiveAccount(result.account);
      return toEntraAccount(result.account);
    },
    initialize: () => pca.initialize(),
    login(returnPath) {
      return pca.loginRedirect({
        redirectStartPage: `${appRootUrl()}#${returnPath}`,
        scopes: ENTRA_SCOPES,
      });
    },
    logout() {
      return pca.logoutRedirect({
        account: activeAccount() ?? undefined,
        postLogoutRedirectUri: appRootUrl(),
      });
    },
  };
}

/** A scripted {@link EntraClient} for tests. */
export function createFakeEntraClient(seed: Partial<FakeEntraState> = {}): FakeEntraClient {
  const state: FakeEntraState = { account: null, token: 'entra-access-token', ...seed };
  const calls: FakeEntraCall[] = [];
  return {
    async acquireToken() {
      calls.push({ method: 'acquireToken' });
      if (state.tokenError !== undefined) throw state.tokenError;
      return state.token;
    },
    calls,
    async clearAccount() {
      calls.push({ method: 'clearAccount' });
      state.account = null;
    },
    getAccount() {
      return state.account;
    },
    async handleRedirect() {
      calls.push({ method: 'handleRedirect' });
      if (state.redirectError !== undefined) throw state.redirectError;
      if (state.redirectResult) state.account = state.redirectResult;
      return state.redirectResult ?? null;
    },
    async initialize() {
      calls.push({ method: 'initialize' });
    },
    async login(returnPath) {
      calls.push({ method: 'login', returnPath });
    },
    async logout() {
      calls.push({ method: 'logout' });
      state.account = null;
    },
    state,
  };
}

/**
 * A user-facing description of a failed Entra sign-in. Server errors carry
 * Entra's own description (e.g. the user cancelled); MSAL's library errors
 * only carry a hashed pointer, so those fall back to the error code.
 */
export function describeEntraError(error: unknown): string {
  if (error instanceof AuthError) {
    const message = error.errorMessage && !error.errorMessage.startsWith('See https://') ? error.errorMessage : '';
    return message
      ? `Sign-in did not complete (${error.errorCode}): ${message}`
      : `Sign-in did not complete (${error.errorCode}).`;
  }
  if (error instanceof Error) return `Sign-in did not complete: ${error.message}`;
  return 'Sign-in did not complete.';
}

/**
 * True when a silent token request failed because the Entra session is over
 * and only a new interactive sign-in can fix it. Anything else (network,
 * timeouts, an interaction already in progress) is transient.
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) return true;
  if (error instanceof ServerError) return error.errorCode === 'invalid_grant';
  if (error instanceof BrowserAuthError) return error.errorCode === BrowserAuthErrorCodes.noAccountError;
  if (error instanceof ClientAuthError) return error.errorCode === ClientAuthErrorCodes.noAccountFound;
  return false;
}

/** The redirect bridge page, `<app root>auth-redirect.html`. A registered redirect URI. */
export function redirectBridgeUrl(): string {
  return `${appRootUrl()}auth-redirect.html`;
}

function toEntraAccount(account: AccountInfo): EntraAccount {
  return {
    homeAccountId: account.homeAccountId,
    ...(account.name ? { name: account.name } : {}),
    username: account.username,
  };
}
