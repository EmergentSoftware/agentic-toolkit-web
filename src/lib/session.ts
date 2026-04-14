/** Constants, types, and helpers for the GitHub OAuth session layer. */

export const SESSION_STORAGE_KEYS = {
  oauthState: 'atk:session:oauth-state',
  pendingReturn: 'atk:session:pending-return',
  token: 'atk:session:token',
} as const;

export const EMERGENT_ORG = 'EmergentSoftware';
export const OAUTH_SCOPES = 'read:org repo';

/** Record persisted in sessionStorage during the redirect to GitHub. */
export interface OAuthStateRecord {
  returnPath: string;
  state: string;
}

/** Session status machine. */
export type SessionStatus =
  | 'authenticating'
  | 'member'
  | 'non-member'
  | 'signed-out'
  | 'verifying';

/** Build the GitHub authorize URL for an OAuth redirect. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes);
  url.searchParams.set('state', params.state);
  return url.toString();
}

/** Clear the access token from sessionStorage. */
export function clearToken(): void {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.token);
}

/** Read and clear the OAuth state record after the GitHub callback. */
export function consumeOAuthState(): null | OAuthStateRecord {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEYS.oauthState);
  if (!raw) return null;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.oauthState);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'state' in parsed &&
      'returnPath' in parsed &&
      typeof (parsed as { state: unknown }).state === 'string' &&
      typeof (parsed as { returnPath: unknown }).returnPath === 'string'
    ) {
      return parsed as OAuthStateRecord;
    }
  } catch {
    // fallthrough
  }
  return null;
}

/** Read and clear the pending return path. */
export function consumePendingReturnPath(): string | undefined {
  const value = window.sessionStorage.getItem(SESSION_STORAGE_KEYS.pendingReturn);
  if (value) window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.pendingReturn);
  return value ?? undefined;
}

/**
 * Default redirect URI for the callback route.
 *
 * HashRouter uses the fragment for routing, so callback URLs must include `#/`.
 * GitHub appends `?code=...&state=...` to the URL *before* the fragment (RFC 6749),
 * so AuthCallback reads OAuth params from `window.location.search`, not from the
 * hash-router's search.
 *
 * Honors Vite's `base` config so the redirect URI matches the SPA's actual URL
 * (important when deployed under a sub-path like GitHub Pages).
 */
export function defaultRedirectUri(): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/#/auth/callback`;
}

/** Exchange an OAuth code for an access token via the auth-function broker. */
export async function exchangeCodeForToken(code: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${getAuthFunctionUrl()}/api/auth/exchange`, {
    body: JSON.stringify({ code }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.message ?? body.error;
    } catch {
      // fallthrough
    }
    throw new Error(
      `Auth exchange failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Auth exchange succeeded but response contained no access_token');
  }
  return payload.access_token;
}

/** A stable, non-sensitive fingerprint of the token for use as a query-key segment. */
export function fingerprintToken(token: string): string {
  // Short fingerprint: first/last chars + length. Not a hash; only used to
  // invalidate cached user queries when the token changes, never logged.
  return `${token.slice(0, 4)}:${token.slice(-4)}:${token.length}`;
}

/** Generate a cryptographically random state value (32 bytes → 64 hex chars). */
export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read the auth-function broker URL from the Vite environment. */
export function getAuthFunctionUrl(): string {
  const value = import.meta.env.VITE_AUTH_FUNCTION_URL;
  if (!value) {
    throw new Error(
      'VITE_AUTH_FUNCTION_URL is not set. Copy .env.example to .env.local and fill in your auth-function URL.',
    );
  }
  return value.replace(/\/$/, '');
}

/** Read the OAuth client ID from the Vite environment. */
export function getClientId(): string {
  const value = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID;
  if (!value) {
    throw new Error(
      'VITE_GITHUB_OAUTH_CLIENT_ID is not set. Copy .env.example to .env.local and fill in your GitHub OAuth client ID.',
    );
  }
  return value;
}

/** Read the access token from sessionStorage. */
export function readToken(): null | string {
  return window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token);
}

/** Stash the caller's current path so the signed-out landing can restore it on sign-in. */
export function stashPendingReturnPath(path: string): void {
  if (!path || path === '/') return;
  window.sessionStorage.setItem(SESSION_STORAGE_KEYS.pendingReturn, path);
}

/** Persist the OAuth state record prior to redirecting to GitHub. */
export function writeOAuthState(record: OAuthStateRecord): void {
  window.sessionStorage.setItem(SESSION_STORAGE_KEYS.oauthState, JSON.stringify(record));
}

/** Persist the access token to sessionStorage. */
export function writeToken(token: string): void {
  window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, token);
}
