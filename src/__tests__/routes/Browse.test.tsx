import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Registry } from '@/lib/schemas';

import { BrowseRoute } from '@/routes/Browse';

import { loadFixtureRegistry } from '../fixtures';

const useRegistryMock = vi.hoisted(() => vi.fn());
const useDownloadAssetMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));
vi.mock('@/hooks/useDownloadAsset', () => ({ useDownloadAsset: useDownloadAssetMock }));

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

async function openFilterAndClick(triggerTestId: string, optionLabel: RegExp | string) {
  fireEvent.click(screen.getByTestId(triggerTestId));
  const popup = await screen.findByRole('group', {
    name: popupNameForTrigger(triggerTestId),
  });
  fireEvent.click(within(popup).getByLabelText(optionLabel));
}

function popupNameForTrigger(triggerTestId: string): RegExp {
  switch (triggerTestId) {
    case 'filter-orgs':
      return /^orgs$/i;
    case 'filter-tags':
      return /^tags$/i;
    case 'filter-tools':
      return /^tool compatibility$/i;
    case 'filter-types':
      return /^asset type$/i;
    default:
      return /.*/;
  }
}

function renderBrowse() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NuqsTestingAdapter>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={children} path='/' />
              <Route
                element={<div data-testid='asset-route'>ASSET ROUTE</div>}
                path='assets/:type/:name/:version'
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </NuqsTestingAdapter>
    );
  }
  return render(<BrowseRoute />, { wrapper: Wrapper });
}

describe('BrowseRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('narrows visible rows when filtering by asset type via the dropdown', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-types', 'agent');

    await waitFor(() => {
      expect(screen.getByTestId('browse-row-validate')).toBeInTheDocument();
    });
    expect(screen.getByTestId('browse-row-clarification-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
    expect(screen.queryByTestId('browse-row-feature-skill')).not.toBeInTheDocument();
  });

  it('narrows visible rows when filtering by tag via the dropdown', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-tags', 'workflow');

    await waitFor(() => {
      expect(screen.queryByTestId('browse-row-validate')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('browse-row-clarification-agent')).toBeInTheDocument();
    expect(screen.getByTestId('browse-row-feature-skill')).toBeInTheDocument();
  });

  it('narrows visible rows when filtering by tool compatibility via the dropdown', async () => {
    const fixture = loadFixtureRegistry();
    fixture.assets[0]!.versions[fixture.assets[0]!.latest]!.tools = ['other-tool'];
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-tools', 'other-tool');

    await waitFor(() => {
      expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`browse-row-${fixture.assets[0]!.name}`)).toBeInTheDocument();
  });

  it('narrows visible rows when filtering by org via the dropdown', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-orgs', 'agentic-toolkit');

    await waitFor(() => {
      expect(screen.queryByTestId('browse-row-dev-commands-rule')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('browse-row-validate')).toBeInTheDocument();
  });

  it('renders a removable chip for each active facet selection', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-types', 'agent');

    const chips = await screen.findByTestId('active-filter-chips');
    const chip = within(chips).getByText(/type: agent/i);
    expect(chip).toBeInTheDocument();

    fireEvent.click(within(chips).getByRole('button', { name: /remove type: agent/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('browse-row-dev-commands-rule')).toBeInTheDocument();
  });

  it('clears every filter when Clear all filters is pressed', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    await openFilterAndClick('filter-types', 'agent');

    fireEvent.click(await screen.findByTestId('clear-all-filters'));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('browse-row-dev-commands-rule')).toBeInTheDocument();
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

  it('persists column visibility to localStorage', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBrowse();

    fireEvent.click(screen.getByTestId('columns-popover-trigger'));
    const popup = await screen.findByRole('group', { name: /visible columns/i });
    fireEvent.click(within(popup).getByLabelText(/version/i));

    await waitFor(() => {
      const raw = window.localStorage.getItem('atk.browse.columnVisibility');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.version).toBe(false);
    });
  });
});
