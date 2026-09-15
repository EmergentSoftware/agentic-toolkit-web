import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  ClientAuthError,
  ClientAuthErrorCodes,
  InteractionRequiredAuthError,
  ServerError,
} from '@azure/msal-browser';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appRootUrl,
  createFakeEntraClient,
  describeEntraError,
  ENTRA_AUTHORITY,
  ENTRA_CLIENT_ID,
  ENTRA_SCOPES,
  ENTRA_TENANT_ID,
  isSessionExpiredError,
  redirectBridgeUrl,
  scrubRedirectState,
} from '@/lib/entra';

describe('entra constants', () => {
  it('targets the Emergent Software tenant, the ES ATK Web SPA client and the ATK API scope', () => {
    expect(ENTRA_TENANT_ID).toBe('25ee13ae-a8a5-4bc2-bb23-aea90536fb0c');
    expect(ENTRA_AUTHORITY).toBe(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}`);
    expect(ENTRA_CLIENT_ID).toBe('07a23158-19c4-4180-a2a9-41cb80882a65');
    expect(ENTRA_SCOPES).toEqual(['api://8da5aa72-0565-4ae8-bf5a-db89d8bd3186/access_as_user']);
  });

  it('derives the redirect URIs from the page origin and the Vite base', () => {
    // vitest serves BASE_URL as '/'; the build uses '/agentic-toolkit-web/'.
    expect(appRootUrl()).toBe(`${window.location.origin}/`);
    expect(redirectBridgeUrl()).toBe(`${window.location.origin}/auth-redirect.html`);
  });
});

describe('scrubRedirectState', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('removes the state MSAL appends to the post-logout URL and keeps the rest', () => {
    window.history.replaceState({}, '', '/agentic-toolkit-web/?state=abc&keep=1#/bundles');
    scrubRedirectState();
    expect(window.location.pathname).toBe('/agentic-toolkit-web/');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#/bundles');
  });

  it('leaves a URL without state untouched', () => {
    window.history.replaceState({}, '', '/agentic-toolkit-web/#/');
    scrubRedirectState();
    expect(window.location.href).toBe(`${window.location.origin}/agentic-toolkit-web/#/`);
  });
});

describe('isSessionExpiredError', () => {
  it('treats interaction-required, invalid_grant and no-account failures as an expired session', () => {
    expect(isSessionExpiredError(new InteractionRequiredAuthError('login_required', 'c'))).toBe(true);
    expect(isSessionExpiredError(new InteractionRequiredAuthError('refresh_token_expired', 'c'))).toBe(true);
    expect(isSessionExpiredError(new ServerError('invalid_grant', 'c'))).toBe(true);
    expect(isSessionExpiredError(new BrowserAuthError(BrowserAuthErrorCodes.noAccountError, 'c'))).toBe(true);
    expect(isSessionExpiredError(new ClientAuthError(ClientAuthErrorCodes.noAccountFound, 'c'))).toBe(true);
  });

  it('treats transient failures as not expired', () => {
    expect(isSessionExpiredError(new BrowserAuthError(BrowserAuthErrorCodes.noNetworkConnectivity, 'c'))).toBe(false);
    expect(isSessionExpiredError(new BrowserAuthError(BrowserAuthErrorCodes.interactionInProgress, 'c'))).toBe(false);
    expect(isSessionExpiredError(new ClientAuthError(ClientAuthErrorCodes.networkError, 'c'))).toBe(false);
    expect(isSessionExpiredError(new ServerError('server_error', 'c'))).toBe(false);
    expect(isSessionExpiredError(new Error('boom'))).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
  });
});

describe('describeEntraError', () => {
  it("keeps Entra's own description for server errors", () => {
    const error = new ServerError('access_denied', 'c', 'AADSTS65004: User declined to consent.');
    expect(describeEntraError(error)).toBe(
      'Sign-in did not complete (access_denied): AADSTS65004: User declined to consent.',
    );
  });

  it('falls back to the code when MSAL only carries a hashed message pointer', () => {
    const error = new BrowserAuthError(BrowserAuthErrorCodes.userCancelled, 'c');
    expect(describeEntraError(error)).toBe('Sign-in did not complete (user_cancelled).');
  });

  it('describes plain errors and unknown values', () => {
    expect(describeEntraError(new Error('offline'))).toBe('Sign-in did not complete: offline');
    expect(describeEntraError('?')).toBe('Sign-in did not complete.');
  });
});

describe('createFakeEntraClient', () => {
  const account = { homeAccountId: 'home-1', name: 'Jason Paff', username: 'jasonp@emergentsoftware.net' };

  it('installs the redirect result as the account and records calls', async () => {
    const client = createFakeEntraClient({ redirectResult: account });
    await client.initialize();
    expect(client.getAccount()).toBeNull();
    await expect(client.handleRedirect()).resolves.toEqual(account);
    expect(client.getAccount()).toEqual(account);
    await expect(client.acquireToken()).resolves.toBe('entra-access-token');
    await client.login('/bundles');
    expect(client.calls).toEqual([
      { method: 'initialize' },
      { method: 'handleRedirect' },
      { method: 'acquireToken' },
      { method: 'login', returnPath: '/bundles' },
    ]);
  });

  it('rejects from the scripted errors and forgets the account on logout and clearAccount', async () => {
    const client = createFakeEntraClient({
      account,
      redirectError: new Error('cancelled'),
      tokenError: new Error('x'),
    });
    await expect(client.handleRedirect()).rejects.toThrow('cancelled');
    await expect(client.acquireToken()).rejects.toThrow('x');
    await client.clearAccount();
    expect(client.getAccount()).toBeNull();
    client.state.account = account;
    await client.logout();
    expect(client.getAccount()).toBeNull();
  });
});
