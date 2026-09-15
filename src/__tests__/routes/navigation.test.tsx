import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '@/App';
import { createFakeEntraClient } from '@/lib/entra';

/**
 * Routing smoke tests. Auth-protected routes redirect unauthenticated users
 * back to `/` (the signed-out landing); see AuthGating tests for the signed-in
 * variants that use a mocked session.
 */
interface RouteCase {
  heading: RegExp;
  path: string;
}

const SIGNED_OUT_CASES: RouteCase[] = [
  { heading: /agentic toolkit/i, path: '/' },
  { heading: /sign in/i, path: '/sign-in' },
  { heading: /not authorized/i, path: '/not-authorized' },
  { heading: /page not found/i, path: '/nope/does-not-exist' },
];

const REDIRECTED_CASES: RouteCase[] = [
  { heading: /agentic toolkit/i, path: '/bundles' },
  { heading: /agentic toolkit/i, path: '/bundles/example-bundle' },
  { heading: /agentic toolkit/i, path: '/contribute' },
];

describe('route navigation (signed-out)', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it.each(SIGNED_OUT_CASES)('renders $path with its PageHeader title', async ({ heading, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <NuqsTestingAdapter>
          <App entraClient={createFakeEntraClient()} />
        </NuqsTestingAdapter>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it.each(REDIRECTED_CASES)('redirects $path to the landing when signed out', async ({ heading, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <NuqsTestingAdapter>
          <App entraClient={createFakeEntraClient()} />
        </NuqsTestingAdapter>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});
