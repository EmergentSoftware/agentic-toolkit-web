import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function renderBundles() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
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
    );
  }
  return render(<BundlesRoute />, { wrapper: Wrapper });
}

describe('BundlesRoute', () => {
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

  it('narrows visible rows when filtering by tag', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    const tagsGroup = screen.getByRole('group', { name: /tags/i });
    fireEvent.click(within(tagsGroup).getByLabelText('quality'));

    expect(screen.getByTestId('bundles-row-quality-bundle')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-row-feature-workflow')).not.toBeInTheDocument();
  });

  it('renders the empty state when the org-only toggle filters out all bundles', () => {
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getByLabelText(/org-scoped only/i));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
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

  it('invokes the download hook when the row action is activated', () => {
    const download = vi.fn().mockResolvedValue(undefined);
    useDownloadBundleMock.mockReturnValueOnce({ download, isDownloading: () => false });
    mockUseRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    renderBundles();

    fireEvent.click(screen.getAllByTestId('bundles-download-feature-workflow')[0]!);

    expect(download).toHaveBeenCalledWith('feature-workflow', expect.objectContaining({ resolveVersion: expect.any(Function) }));
  });
});
