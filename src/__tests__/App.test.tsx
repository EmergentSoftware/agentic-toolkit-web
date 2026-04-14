import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '@/App';
import { SESSION_STORAGE_KEYS } from '@/lib/session';

describe('App', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the signed-out landing at `/` when no session exists', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('signed-out-landing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /agentic toolkit/i })).toBeInTheDocument();
    expect(screen.getByTestId('landing-sign-in')).toBeInTheDocument();
  });

  it('renders the NotFound catch-all for unknown paths', () => {
    render(
      <MemoryRouter initialEntries={['/totally/unknown/path']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
  });

  it('redirects protected routes to `/` when signed out', () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.token);
    render(
      <MemoryRouter initialEntries={['/bundles']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('signed-out-landing')).toBeInTheDocument();
  });
});
