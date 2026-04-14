import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Registry } from '@/lib/schemas';

import { BrowseRoute } from '@/routes/Browse';

import { loadFixtureRegistry } from '../fixtures';

const useRegistryMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));

type QueryShape = Partial<UseQueryResult<Registry, Error>>;

function mockUseRegistry(state: QueryShape) {
  useRegistryMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: false,
    ...state,
  });
}

function renderBrowse() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={children} path='/' />
            <Route element={<div data-testid='asset-route'>ASSET ROUTE</div>} path='assets/:assetId' />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(<BrowseRoute />, { wrapper: Wrapper });
}

describe('BrowseRoute', () => {
  afterEach(() => {
    useRegistryMock.mockReset();
  });

  it('renders a loading indicator while the registry query is inflight', () => {
    mockUseRegistry({ isLoading: true });
    renderBrowse();
    expect(screen.getByRole('status', { name: /loading registry/i })).toBeInTheDocument();
  });

  it('renders an error fallback when the registry query fails', () => {
    mockUseRegistry({ error: new Error('boom'), isError: true });
    renderBrowse();
    expect(screen.getByTestId('browse-error')).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it('renders an empty state when filters exclude every row', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.change(screen.getByLabelText(/search assets/i), {
      target: { value: 'definitely-nothing-matches' },
    });

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders all assets from the fixture registry by default', () => {
    const fixture = loadFixtureRegistry();
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBrowse();

    for (const asset of fixture.assets) {
      expect(screen.getByTestId(`browse-row-${asset.name}`)).toBeInTheDocument();
    }
  });

  it('narrows visible rows when filtering by asset type', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.click(screen.getByLabelText('agent', { selector: 'input' }));

    expect(screen.getByTestId('browse-row-validate')).toBeInTheDocument();
    expect(screen.getByTestId('browse-row-clarification-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-feature-skill')).not.toBeInTheDocument();
  });

  it('narrows visible rows when filtering by tag', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    const tagsGroup = screen.getByRole('group', { name: /tags/i });
    fireEvent.click(within(tagsGroup).getByLabelText('workflow'));

    expect(screen.getByTestId('browse-row-clarification-agent')).toBeInTheDocument();
    expect(screen.getByTestId('browse-row-feature-skill')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-validate')).not.toBeInTheDocument();
  });

  it('narrows visible rows when filtering by tool compatibility', () => {
    const fixture = loadFixtureRegistry();
    // Give one asset a distinct tool so the filter actually narrows the set.
    fixture.assets[0]!.versions[fixture.assets[0]!.latest]!.tools = ['other-tool'];
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBrowse();

    const toolGroup = screen.getByRole('group', { name: /tool compatibility/i });
    fireEvent.click(within(toolGroup).getByLabelText('other-tool'));

    expect(screen.getByTestId(`browse-row-${fixture.assets[0]!.name}`)).toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
  });

  it('narrows to org-scoped assets when the org toggle is enabled', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.click(screen.getByLabelText(/org-scoped only/i));

    expect(screen.getByTestId('browse-row-validate')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
  });

  it('orders rows by search relevance via the ported ranking', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.change(screen.getByLabelText(/search assets/i), { target: { value: 'validate' } });

    const rows = screen.getAllByRole('link', { name: /^open /i });
    expect(rows[0]).toHaveAttribute('data-testid', 'browse-row-validate');
  });

  it('navigates to /assets/:name when a row is clicked', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.click(screen.getByTestId('browse-row-feature-skill'));

    expect(screen.getByTestId('asset-route')).toBeInTheDocument();
  });

  it('navigates when a row is activated via keyboard', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.keyDown(screen.getByTestId('browse-row-feature-skill'), { key: 'Enter' });

    expect(screen.getByTestId('asset-route')).toBeInTheDocument();
  });
});
