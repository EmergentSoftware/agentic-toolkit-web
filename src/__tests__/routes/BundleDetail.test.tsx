import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bundle, Registry } from '@/lib/schemas';

import { RegistryNotFoundError } from '@/lib/registry-errors';
import { BundleDetailRoute } from '@/routes/BundleDetail';

import { loadFixtureRegistry } from '../fixtures';

const useBundleManifestMock = vi.hoisted(() => vi.fn());
const useRegistryMock = vi.hoisted(() => vi.fn());
const useDownloadBundleMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);

vi.mock('@/hooks/useBundleManifest', () => ({ useBundleManifest: useBundleManifestMock }));
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));
vi.mock('@/hooks/useDownloadBundle', () => ({ useDownloadBundle: useDownloadBundleMock }));

type BundleQueryShape = Partial<UseQueryResult<Bundle, Error>>;
type RegistryQueryShape = Partial<UseQueryResult<Registry, Error>>;

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={children} path='/bundles/:bundleId' />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(<BundleDetailRoute />, { wrapper: Wrapper });
}

function setBundle(state: BundleQueryShape) {
  useBundleManifestMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: false,
    ...state,
  });
}

function setRegistry(state: RegistryQueryShape) {
  useRegistryMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: false,
    ...state,
  });
}

const FULL_BUNDLE: Bundle = {
  assets: [
    { name: 'clarification-agent', type: 'agent' },
    { name: 'feature-skill', type: 'skill' },
    { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
  ],
  author: 'EmergentSoftware',
  description: 'Full feature workflow.',
  name: 'feature-workflow',
  setupInstructions: '## Setup\n\nRun `atk sync` after install.',
  tags: ['workflow'],
  version: '1.0.0',
};

describe('BundleDetailRoute', () => {
  afterEach(() => {
    useBundleManifestMock.mockReset();
    useRegistryMock.mockReset();
  });

  it('renders loading state while the bundle manifest is inflight', () => {
    setBundle({ isLoading: true });
    setRegistry({});
    renderAt('/bundles/feature-workflow');
    expect(screen.getByRole('status', { name: /loading bundle manifest/i })).toBeInTheDocument();
  });

  it('renders every field of a fully populated bundle manifest', () => {
    setBundle({ data: FULL_BUNDLE, isSuccess: true });
    setRegistry({ data: loadFixtureRegistry(), isSuccess: true });

    renderAt('/bundles/feature-workflow');

    expect(screen.getByRole('heading', { level: 1, name: 'feature-workflow' })).toBeInTheDocument();
    expect(screen.getByText('EmergentSoftware')).toBeInTheDocument();
    expect(screen.getByText(/full feature workflow/i)).toBeInTheDocument();
    expect(screen.getByText('workflow')).toBeInTheDocument();

    const assetsSection = screen.getByTestId('bundle-detail-assets');
    expect(within(assetsSection).getByTestId('bundle-member-clarification-agent')).toBeInTheDocument();
    expect(within(assetsSection).getByTestId('bundle-member-feature-skill')).toBeInTheDocument();
    expect(within(assetsSection).getByTestId('bundle-member-validate')).toBeInTheDocument();

    // clarification-agent omits a version → registry latest is 1.0.0
    const clarificationLink = within(assetsSection).getByRole('link', { name: /open clarification-agent/i });
    expect(clarificationLink).toHaveAttribute('href', '/assets/agent/clarification-agent/1.0.0');

    // validate has an explicit version + org
    const validateLink = within(assetsSection).getByRole('link', { name: /open validate/i });
    expect(validateLink).toHaveAttribute(
      'href',
      '/assets/agent/validate/1.1.0?org=agentic-toolkit',
    );

    const setup = screen.getByTestId('bundle-detail-setup');
    expect(within(setup).getByRole('heading', { level: 2, name: 'Setup' })).toBeInTheDocument();
  });

  it('shows a not-found state with a back link when the manifest is missing', () => {
    setBundle({ error: new RegistryNotFoundError('missing', { url: 'x' }), isError: true });
    setRegistry({});
    renderAt('/bundles/does-not-exist');

    expect(screen.getByRole('status')).toHaveTextContent(/bundle not found/i);
    expect(screen.getByRole('link', { name: /back to bundles/i })).toHaveAttribute('href', '/bundles');
  });

  it('surfaces a generic error banner for non-404 failures', () => {
    setBundle({ error: new Error('boom'), isError: true });
    setRegistry({});
    renderAt('/bundles/feature-workflow');

    expect(screen.getByTestId('bundle-detail-error')).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });
});
