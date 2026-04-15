import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Registry } from '@/lib/schemas';

import { BundlesRoute } from '@/routes/Bundles';

import { loadFixtureRegistry } from '../fixtures';

const useRegistryMock = vi.hoisted(() => vi.fn());
const useDownloadBundleMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));
vi.mock('@/hooks/useDownloadBundle', () => ({ useDownloadBundle: useDownloadBundleMock }));

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
    default:
      return /.*/;
  }
}

function renderBundles() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NuqsTestingAdapter>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/bundles']}>
            <Routes>
              <Route element={children} path='/bundles' />
              <Route
                element={<div data-testid='bundle-detail-route'>BUNDLE DETAIL</div>}
                path='/bundles/:bundleId'
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </NuqsTestingAdapter>
    );
  }
  return render(<BundlesRoute />, { wrapper: Wrapper });
}

describe('BundlesRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('atk.bundles.showOrgScoped', 'true');
  });

  afterEach(() => {
    useRegistryMock.mockReset();
  });

  it('renders a loading indicator while the registry query is inflight', () => {
    mockUseRegistry({ isLoading: true });
    renderBundles();
    expect(screen.getByRole('status', { name: /loading registry/i })).toBeInTheDocument();
  });

  it('renders an error fallback when the registry query fails', () => {
    mockUseRegistry({ error: new Error('kaboom'), isError: true });
    renderBundles();
    expect(screen.getByTestId('bundles-error')).toBeInTheDocument();
    expect(screen.getByText(/kaboom/i)).toBeInTheDocument();
  });

  it('renders all bundles from the fixture registry by default', () => {
    const fixture = loadFixtureRegistry();
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBundles();

    for (const bundle of fixture.bundles ?? []) {
      expect(screen.getByTestId(`bundles-row-${bundle.name}`)).toBeInTheDocument();
    }
  });

  it('narrows visible rows when filtering by tag via the dropdown', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-tags', 'quality');

    await waitFor(() => {
      expect(screen.queryByTestId('bundles-row-feature-workflow')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('bundles-row-quality-bundle')).toBeInTheDocument();
  });

  it('narrows visible rows when filtering by org via the dropdown', async () => {
    const fixture = loadFixtureRegistry();
    fixture.bundles![0]!.org = 'agentic-toolkit';
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-orgs', 'agentic-toolkit');

    await waitFor(() => {
      expect(screen.queryByTestId('bundles-row-quality-bundle')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`bundles-row-${fixture.bundles![0]!.name}`)).toBeInTheDocument();
  });

  it('renders a removable chip for each active facet selection', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-tags', 'quality');

    const chips = await screen.findByTestId('active-filter-chips');
    expect(within(chips).getByText(/tag: quality/i)).toBeInTheDocument();

    fireEvent.click(within(chips).getByRole('button', { name: /remove tag: quality/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('bundles-row-feature-workflow')).toBeInTheDocument();
  });

  it('clears every filter when Clear all filters is pressed', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-tags', 'quality');

    fireEvent.click(await screen.findByTestId('clear-all-filters'));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('bundles-row-feature-workflow')).toBeInTheDocument();
  });

  it('orders rows by search relevance via the ported ranking', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.change(screen.getByLabelText(/search bundles/i), { target: { value: 'quality' } });

    const rows = screen.getAllByRole('link', { name: /^open /i });
    expect(rows[0]).toHaveAttribute('data-testid', 'bundles-row-quality-bundle');
  });

  it('navigates to /bundles/:bundleId when a row is clicked', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getByTestId('bundles-row-feature-workflow'));
    expect(screen.getByTestId('bundle-detail-route')).toBeInTheDocument();
  });

  it('invokes the download hook (with resolveVersion) when the row action is activated', () => {
    const download = vi.fn().mockResolvedValue(undefined);
    useDownloadBundleMock.mockReturnValueOnce({ download, isDownloading: () => false });
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getAllByTestId('bundles-download-feature-workflow')[0]!);

    expect(download).toHaveBeenCalledWith(
      'feature-workflow',
      expect.objectContaining({ resolveVersion: expect.any(Function) }),
    );
  });

  it('hides org-scoped bundles by default', () => {
    window.localStorage.removeItem('atk.bundles.showOrgScoped');
    const fixture = loadFixtureRegistry();
    fixture.bundles![0]!.org = 'agentic-toolkit';
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBundles();

    expect(screen.queryByTestId('bundles-row-feature-workflow')).not.toBeInTheDocument();
    expect(screen.getByTestId('bundles-row-quality-bundle')).toBeInTheDocument();
  });

  it('shows org-scoped bundles when the toggle is enabled', async () => {
    window.localStorage.removeItem('atk.bundles.showOrgScoped');
    const fixture = loadFixtureRegistry();
    fixture.bundles![0]!.org = 'agentic-toolkit';
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getByTestId('toggle-show-org-scoped'));

    await waitFor(() => {
      expect(screen.getByTestId('bundles-row-feature-workflow')).toBeInTheDocument();
    });
  });

  it('does not hide org-scoped bundles when an Orgs filter is active', async () => {
    window.localStorage.removeItem('atk.bundles.showOrgScoped');
    const fixture = loadFixtureRegistry();
    fixture.bundles![0]!.org = 'agentic-toolkit';
    mockUseRegistry({ data: fixture, isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-orgs', 'agentic-toolkit');

    await waitFor(() => {
      expect(screen.getByTestId('bundles-row-feature-workflow')).toBeInTheDocument();
    });
  });

  it('persists the show-org-scoped toggle to localStorage', async () => {
    window.localStorage.removeItem('atk.bundles.showOrgScoped');
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getByTestId('toggle-show-org-scoped'));

    await waitFor(() => {
      expect(window.localStorage.getItem('atk.bundles.showOrgScoped')).toBe('true');
    });
  });

  it('clear-all filters does not alter showOrgScoped', async () => {
    window.localStorage.setItem('atk.bundles.showOrgScoped', 'true');
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    await openFilterAndClick('filter-tags', 'quality');
    fireEvent.click(await screen.findByTestId('clear-all-filters'));

    await waitFor(() => {
      expect(screen.getByTestId('toggle-show-org-scoped')).toBeChecked();
    });
  });

  it('persists column visibility to localStorage', async () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getByTestId('columns-popover-trigger'));
    const popup = await screen.findByRole('group', { name: /visible columns/i });
    fireEvent.click(within(popup).getByLabelText(/version/i));

    await waitFor(() => {
      const raw = window.localStorage.getItem('atk.bundles.columnVisibility');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.version).toBe(false);
    });
  });

  it('hides author and tags columns by default (compact density)', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    const tableWrapper = screen.getByTestId('bundles-table-wrapper');
    expect(
      within(tableWrapper).queryByRole('columnheader', { name: /^author$/i }),
    ).not.toBeInTheDocument();
    expect(
      within(tableWrapper).queryByRole('columnheader', { name: /^tags$/i }),
    ).not.toBeInTheDocument();
  });
});
