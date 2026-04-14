import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

interface RouteCase {
  heading: RegExp;
  path: string;
}

const ROUTE_CASES: RouteCase[] = [
  { heading: /browse assets/i, path: '/' },
  { heading: /sign in/i, path: '/sign-in' },
  { heading: /asset detail/i, path: '/assets/example-asset' },
  { heading: /bundle detail/i, path: '/bundles/example-bundle' },
  { heading: /contribute/i, path: '/contribute' },
  { heading: /not authorized/i, path: '/not-authorized' },
  { heading: /page not found/i, path: '/nope/does-not-exist' },
];

describe('route navigation', () => {
  it.each(ROUTE_CASES)('renders $path with its PageHeader title', ({ heading, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('exposes asset and bundle URL params to their detail pages', () => {
    render(
      <MemoryRouter initialEntries={['/assets/super-skill']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText(/"super-skill"/)).toBeInTheDocument();
  });
});
