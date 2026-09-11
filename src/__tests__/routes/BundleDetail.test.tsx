import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bundle, Manifest, Registry } from '@/lib/schemas';

import { RegistryNotFoundError } from '@/lib/registry-errors';
import { BundleDetailRoute } from '@/routes/BundleDetail';

import { loadFixtureRegistry } from '../fixtures';

const useBundleManifestMock = vi.hoisted(() => vi.fn());
const useBundleReadmeMock = vi.hoisted(() => vi.fn());
const useRegistryMock = vi.hoisted(() => vi.fn());
const useDownloadBundleMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);
const useManifestGraphMock = vi.hoisted(() =>
  vi.fn(() => ({
    error: null as Error | null,
    files: new Map<string, string[]>(),
    isLoading: false,
    manifests: new Map<string, Manifest>(),
    order: [] as string[],
  })),
);

vi.mock('@/hooks/useBundleManifest', () => ({ useBundleManifest: useBundleManifestMock }));
vi.mock('@/hooks/useBundleReadme', () => ({ useBundleReadme: useBundleReadmeMock }));
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));
vi.mock('@/hooks/useDownloadBundle', () => ({ useDownloadBundle: useDownloadBundleMock }));
vi.mock('@/hooks/useManifestGraph', () => ({
  refKey: (ref: { name: string; org?: string; type: string; version: string }) =>
    `${ref.type}:${ref.org ?? ''}:${ref.name}:${ref.version}`,
  useManifestGraph: useManifestGraphMock,
}));

type BundleQueryShape = Partial<UseQueryResult<Bundle, Error>>;
type ReadmeQueryShape = Partial<UseQueryResult<null | string, Error>>;
type RegistryQueryShape = Partial<UseQueryResult<Registry, Error>>;

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={children} path='/bundles/:bundleId' />
            <Route element={children} path='/bundles/:org/:name' />
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

function setReadme(state: ReadmeQueryShape) {
  useBundleReadmeMock.mockReturnValue({
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
    useBundleReadmeMock.mockReset();
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
    setReadme({ data: '# Feature Workflow\n\nUsage notes.', isSuccess: true });
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
    expect(validateLink).toHaveAttribute('href', '/assets/agent/validate/1.1.0?org=agentic-toolkit');

    const setup = screen.getByTestId('bundle-detail-setup');
    expect(within(setup).getByRole('heading', { level: 2, name: 'Setup' })).toBeInTheDocument();

    const readme = screen.getByTestId('bundle-detail-readme');
    expect(within(readme).getByRole('heading', { level: 1, name: 'Feature Workflow' })).toBeInTheDocument();
    expect(within(readme).getByText('Usage notes.')).toBeInTheDocument();
  });

  it('shows a missing-README message when the bundle has none', () => {
    setBundle({ data: FULL_BUNDLE, isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    setRegistry({ data: loadFixtureRegistry(), isSuccess: true });

    renderAt('/bundles/feature-workflow');

    expect(screen.getByTestId('bundle-detail-readme-missing')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the README is inflight', () => {
    setBundle({ data: FULL_BUNDLE, isSuccess: true });
    setReadme({ isLoading: true });
    setRegistry({ data: loadFixtureRegistry(), isSuccess: true });

    renderAt('/bundles/feature-workflow');

    expect(screen.getByRole('status', { name: /loading readme/i })).toBeInTheDocument();
  });

  it('lists bundle.json plus each member file from the API listing under the bundle group', () => {
    setBundle({ data: FULL_BUNDLE, isSuccess: true });
    setRegistry({ data: loadFixtureRegistry(), isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    const validateKey = 'agent:agentic-toolkit:validate:1.1.0';
    useManifestGraphMock.mockReturnValue({
      error: null,
      files: new Map([[validateKey, ['AGENT.md', 'manifest.json', 'reference/checks.md']]]),
      isLoading: false,
      manifests: new Map([
        [
          validateKey,
          {
            author: 'x',
            description: 'v',
            entrypoint: 'AGENT.md',
            name: 'validate',
            org: 'agentic-toolkit',
            type: 'agent',
            version: '1.1.0',
          } as Manifest,
        ],
      ]),
      order: [validateKey],
    });

    renderAt('/bundles/feature-workflow');

    const group = screen.getByTestId('files-group-feature-workflow');
    expect(within(group).getByText('bundle.json')).toBeInTheDocument();
    expect(within(group).getByText('validate/AGENT.md')).toBeInTheDocument();
    expect(within(group).getByText('validate/reference/checks.md')).toBeInTheDocument();
    useManifestGraphMock.mockReset();
    useManifestGraphMock.mockReturnValue({
      error: null,
      files: new Map(),
      isLoading: false,
      manifests: new Map(),
      order: [],
    });
  });

  it('downloads the bundle in the chosen format from the header menu', () => {
    const download = vi.fn().mockResolvedValue(undefined);
    useDownloadBundleMock.mockReturnValueOnce({ download, isDownloading: () => false });
    setBundle({ data: FULL_BUNDLE, isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    setRegistry({ data: loadFixtureRegistry(), isSuccess: true });

    renderAt('/bundles/feature-workflow');

    fireEvent.click(screen.getByTestId('bundle-detail-download'));
    fireEvent.click(screen.getByTestId('bundle-detail-download-skill'));

    expect(download).toHaveBeenCalledWith(
      'feature-workflow',
      expect.objectContaining({ format: 'skill', version: '1.0.0' }),
    );
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

  it('resolves an org-scoped bundle from /bundles/:org/:name and titles it @org/name', () => {
    const orgBundle: Bundle = {
      assets: [{ name: 'login-helper', org: 'cupay', type: 'skill', version: '1.0.0' }],
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      tags: ['qa'],
      version: '2.0.0',
    };
    const registry = loadFixtureRegistry();
    registry.bundles!.push({
      assetCount: 1,
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      tags: ['qa'],
      version: '2.0.0',
    });
    setBundle({ data: orgBundle, isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    setRegistry({ data: registry, isSuccess: true });

    renderAt('/bundles/cupay/qa-bundle');

    expect(screen.getByRole('heading', { level: 1, name: '@cupay/qa-bundle' })).toBeInTheDocument();
    // The manifest hook is queried with the parsed bare org + resolved version.
    expect(useBundleManifestMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'qa-bundle', org: 'cupay', version: '2.0.0' }),
    );
    expect(screen.getByTestId('bundle-detail-org')).toHaveTextContent('cupay');
  });

  it('passes the bundle org to the download hook for an org-scoped bundle', () => {
    const download = vi.fn().mockResolvedValue(undefined);
    useDownloadBundleMock.mockReturnValueOnce({ download, isDownloading: () => false });
    const orgBundle: Bundle = {
      assets: [{ name: 'login-helper', org: 'cupay', type: 'skill', version: '1.0.0' }],
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      version: '2.0.0',
    };
    const registry = loadFixtureRegistry();
    registry.bundles!.push({
      assetCount: 1,
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      tags: [],
      version: '2.0.0',
    });
    setBundle({ data: orgBundle, isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    setRegistry({ data: registry, isSuccess: true });

    renderAt('/bundles/cupay/qa-bundle');

    fireEvent.click(screen.getByTestId('bundle-detail-download'));
    fireEvent.click(screen.getByTestId('bundle-detail-download-zip'));

    expect(download).toHaveBeenCalledWith(
      'qa-bundle',
      expect.objectContaining({ format: 'zip', org: 'cupay', version: '2.0.0' }),
    );
  });

  it('explains an unresolved org-scoped member instead of a bare "unresolved" (W4)', () => {
    const orgBundle: Bundle = {
      // login-helper@cupay is absent from the fixture registry → unresolved.
      assets: [{ name: 'login-helper', org: 'cupay', type: 'skill' }],
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      version: '2.0.0',
    };
    const registry = loadFixtureRegistry();
    registry.bundles!.push({
      assetCount: 1,
      author: 'cupay',
      description: 'QA bundle.',
      name: 'qa-bundle',
      org: 'cupay',
      tags: [],
      version: '2.0.0',
    });
    setBundle({ data: orgBundle, isSuccess: true });
    setReadme({ data: null, isSuccess: true });
    setRegistry({ data: registry, isSuccess: true });

    renderAt('/bundles/cupay/qa-bundle');

    const memberCard = screen.getByTestId('bundle-member-login-helper');
    expect(memberCard).toHaveTextContent(/not found in org 'cupay'/i);
  });
});
