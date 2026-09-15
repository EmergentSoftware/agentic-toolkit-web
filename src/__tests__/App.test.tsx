import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '@/App';
import { createFakeEntraClient } from '@/lib/entra';
import { SESSION_STORAGE_KEYS } from '@/lib/session';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NuqsTestingAdapter>
        <App entraClient={createFakeEntraClient()} />
      </NuqsTestingAdapter>
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the signed-out landing at `/` when no session exists', async () => {
    renderApp('/');

    expect(await screen.findByTestId('signed-out-landing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /agentic toolkit/i })).toBeInTheDocument();
    expect(screen.getByTestId('landing-sign-in')).toHaveTextContent(/emergent account/i);
    expect(screen.getByTestId('landing-sign-in-github')).toHaveTextContent(/github/i);
  });

  it('renders the NotFound catch-all for unknown paths', () => {
    renderApp('/totally/unknown/path');

    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
  });

  it('redirects protected routes to `/` when signed out', async () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.token);
    renderApp('/bundles');

    expect(await screen.findByTestId('signed-out-landing')).toBeInTheDocument();
  });
});
