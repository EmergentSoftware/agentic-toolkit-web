import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Manifest, Registry } from '@/lib/schemas';

import { RegistryNotFoundError } from '@/lib/registry-errors';
import { AssetDetailRoute } from '@/routes/AssetDetail';

const useAssetManifestMock = vi.hoisted(() => vi.fn());
const useAssetReadmeMock = vi.hoisted(() => vi.fn());
const useDownloadAssetMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);
const useManifestGraphMock = vi.hoisted(() =>
  vi.fn(() => ({ error: null, isLoading: false, manifests: new Map(), order: [] })),
);
const useRegistryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAssetManifest', () => ({ useAssetManifest: useAssetManifestMock }));
vi.mock('@/hooks/useAssetReadme', () => ({ useAssetReadme: useAssetReadmeMock }));
vi.mock('@/hooks/useDownloadAsset', () => ({ useDownloadAsset: useDownloadAssetMock }));
vi.mock('@/hooks/useManifestGraph', () => ({
  refKey: (ref: { name: string; org?: string; type: string; version: string }) =>
    `${ref.type}:${ref.org ?? ''}:${ref.name}:${ref.version}`,
  useManifestGraph: useManifestGraphMock,
}));
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));

type ManifestQueryShape = Partial<UseQueryResult<Manifest, Error>>;
type ReadmeQueryShape = Partial<UseQueryResult<null | string, Error>>;
type RegistryQueryShape = Partial<UseQueryResult<Registry, Error>>;

function buildRegistryWith(asset: { latest: string; name: string; org?: string; type: Manifest['type']; versions: string[] }): Registry {
  const versions: Registry['assets'][number]['versions'] = {};
  for (const v of asset.versions) {
    versions[v] = {
      author: 'x',
      checksum: 'sha256-x',
      description: 'x',
      tools: [],
    };
  }
  return {
    assets: [
      {
        latest: asset.latest,
        name: asset.name,
        org: asset.org,
        tags: [],
        type: asset.type,
        versions,
      },
    ],
    version: '2026-01-01T00:00:00Z',
  };
}

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-pathname={loc.pathname} data-search={loc.search} data-testid='location-probe' />
  );
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <Routes>
            <Route element={children} path='assets/:type/:name/:version' />
            <Route element={<div data-testid='home'>HOME</div>} path='/' />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(<AssetDetailRoute />, { wrapper: Wrapper });
}

function setManifest(state: ManifestQueryShape) {
  useAssetManifestMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: false,
    ...state,
  });
}

function setReadme(state: ReadmeQueryShape) {
  useAssetReadmeMock.mockReturnValue({
    data: null,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: true,
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

const FULL_MANIFEST: Manifest = {
  author: 'EmergentSoftware',
  dependencies: [
    { name: 'dev-commands-rule', type: 'rule', version: '^1.0.0' },
    { name: 'sidecar', type: 'skill' },
  ],
  description: 'Runs lint, typecheck, and test and returns a concise summary.',
  entrypoint: 'AGENT.md',
  files: ['AGENT.md'],
  name: 'validate',
  org: 'agentic-toolkit',
  security: {
    permissions: ['filesystem', 'network'],
    reviewedAt: '2026-03-01',
    reviewedBy: 'security-team',
  },
  tags: ['quality', 'ci'],
  tools: [
    { maxVersion: '2.0.0', minVersion: '1.0.0', notes: 'Primary target.', tool: 'claude-code' },
    { tool: 'cursor' },
  ],
  type: 'agent',
  version: '1.1.0',
};

const MINIMAL_MANIFEST: Manifest = {
  author: 'community',
  description: 'Minimal asset.',
  entrypoint: 'SKILL.md',
  name: 'bare-skill',
  type: 'skill',
  version: '0.1.0',
};

const RICH_README = `# Validate

A short description.

## Usage

- item one
- item two

| Column A | Column B |
| --- | --- |
| cell 1 | cell 2 |

\`\`\`ts
const answer = 42;
\`\`\`

See [docs](https://example.com).
`;

describe('AssetDetailRoute', () => {
  beforeEach(() => {
    setRegistry({ data: undefined });
  });

  afterEach(() => {
    useAssetManifestMock.mockReset();
    useAssetReadmeMock.mockReset();
    useRegistryMock.mockReset();
  });

  it('renders every field of a fully populated manifest', () => {
    setManifest({ data: FULL_MANIFEST, isSuccess: true });
    setReadme({ data: '# Ready', isSuccess: true });

    renderAt('/assets/agent/validate/1.1.0?org=agentic-toolkit');

    expect(screen.getByRole('heading', { level: 1, name: 'validate' })).toBeInTheDocument();
    expect(screen.getByText('EmergentSoftware')).toBeInTheDocument();
    expect(screen.getByText(/runs lint, typecheck/i)).toBeInTheDocument();
    expect(screen.getByText('agentic-toolkit')).toBeInTheDocument();
    expect(screen.getByText('quality')).toBeInTheDocument();
    expect(screen.getByText('ci')).toBeInTheDocument();

    const tools = screen.getByTestId('tool-compatibility');
    expect(within(tools).getByText('claude-code')).toBeInTheDocument();
    expect(within(tools).getByText(/min: 1\.0\.0/)).toBeInTheDocument();
    expect(within(tools).getByText(/max: 2\.0\.0/)).toBeInTheDocument();
    expect(within(tools).getByText('Primary target.')).toBeInTheDocument();
    expect(within(tools).getByText('cursor')).toBeInTheDocument();

    const security = screen.getByTestId('security-block');
    expect(within(security).getByText('filesystem')).toBeInTheDocument();
    expect(within(security).getByText('network')).toBeInTheDocument();
    expect(within(security).getByText(/security-team/)).toBeInTheDocument();
    expect(within(security).getByText(/2026-03-01/)).toBeInTheDocument();

    const deps = screen.getByTestId('asset-dependencies');
    expect(within(deps).getByText('dev-commands-rule')).toBeInTheDocument();
    expect(within(deps).getByText('^1.0.0')).toBeInTheDocument();
    expect(within(deps).getByText('sidecar')).toBeInTheDocument();

    const download = screen.getByRole('button', { name: /download validate/i });
    expect(download).toBeEnabled();
  });

  it('degrades gracefully when optional fields are missing', () => {
    setManifest({ data: MINIMAL_MANIFEST, isSuccess: true });
    setReadme({ data: null, isSuccess: true });

    renderAt('/assets/skill/bare-skill/0.1.0');

    expect(screen.getByRole('heading', { level: 1, name: 'bare-skill' })).toBeInTheDocument();
    expect(screen.getByText('global')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-compatibility')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-dependencies')).not.toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-readme-missing')).toBeInTheDocument();
  });

  it('renders README markdown covering headings, code, tables, lists, and links', () => {
    setManifest({ data: FULL_MANIFEST, isSuccess: true });
    setReadme({ data: RICH_README, isSuccess: true });

    renderAt('/assets/agent/validate/1.1.0');

    const readme = screen.getByTestId('asset-detail-readme');
    expect(within(readme).getByRole('heading', { level: 1, name: 'Validate' })).toBeInTheDocument();
    expect(within(readme).getByRole('heading', { level: 2, name: 'Usage' })).toBeInTheDocument();
    expect(within(readme).getByText('item one')).toBeInTheDocument();
    expect(within(readme).getByText('item two')).toBeInTheDocument();
    expect(within(readme).getByRole('table')).toBeInTheDocument();
    expect(within(readme).getByText('cell 1')).toBeInTheDocument();
    expect(within(readme).getByText('42')).toBeInTheDocument();
    expect(within(readme).getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com');
  });

  it('shows a not-found state with a back-to-browse link when the manifest is missing', () => {
    setManifest({
      error: new RegistryNotFoundError('missing', { url: 'x' }),
      isError: true,
    });
    setReadme({ data: null });

    renderAt('/assets/agent/does-not-exist/1.0.0');

    expect(screen.getByRole('status')).toHaveTextContent(/asset not found/i);
    expect(screen.getByRole('link', { name: /back to browse/i })).toHaveAttribute('href', '/');
  });

  it('shows a loading state while the manifest is inflight', () => {
    setManifest({ isLoading: true });
    setReadme({ isLoading: true });

    renderAt('/assets/agent/validate/1.1.0');

    expect(screen.getByRole('status', { name: /loading asset manifest/i })).toBeInTheDocument();
  });

  describe('version selector', () => {
    const REGISTRY = buildRegistryWith({
      latest: '1.1.0',
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      versions: ['1.0.0', '1.1.0', '0.9.0', '1.0.1'],
    });

    it('lists all versions sorted semver-descending with a latest badge on asset.latest', () => {
      setManifest({ data: FULL_MANIFEST, isSuccess: true });
      setReadme({ data: null, isSuccess: true });
      setRegistry({ data: REGISTRY, isSuccess: true });

      renderAt('/assets/agent/validate/1.1.0?org=agentic-toolkit');

      fireEvent.click(screen.getByTestId('asset-detail-version-selector'));

      const listbox = screen.getByRole('listbox', { name: /versions/i });
      const options = within(listbox).getAllByRole('option');
      expect(options.map((o) => o.textContent?.replace(/latest/, '').trim())).toEqual([
        'v1.1.0',
        'v1.0.1',
        'v1.0.0',
        'v0.9.0',
      ]);
      expect(within(listbox).getByTestId('version-option-1.1.0-latest-badge')).toHaveTextContent('latest');
      expect(within(listbox).queryByTestId('version-option-1.0.0-latest-badge')).not.toBeInTheDocument();
      expect(within(listbox).queryByTestId('version-option-0.9.0-latest-badge')).not.toBeInTheDocument();
    });

    it('navigates to the chosen version while preserving the org query param', () => {
      setManifest({ data: FULL_MANIFEST, isSuccess: true });
      setReadme({ data: null, isSuccess: true });
      setRegistry({ data: REGISTRY, isSuccess: true });

      renderAt('/assets/agent/validate/1.1.0?org=agentic-toolkit');

      fireEvent.click(screen.getByTestId('asset-detail-version-selector'));
      fireEvent.click(screen.getByTestId('version-option-1.0.0'));

      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-pathname')).toBe('/assets/agent/validate/1.0.0');
      expect(probe.getAttribute('data-search')).toBe('?org=agentic-toolkit');
    });

    it('rekeys manifest/readme/download against the newly selected version after navigation', () => {
      const download = vi.fn().mockResolvedValue(undefined);
      useDownloadAssetMock.mockReturnValue({ download, isDownloading: () => false });

      const V100_MANIFEST: Manifest = { ...FULL_MANIFEST, version: '1.0.0' };
      useAssetManifestMock.mockImplementation((ref: { version?: string }) => ({
        data: ref.version === '1.0.0' ? V100_MANIFEST : FULL_MANIFEST,
        error: null,
        isError: false,
        isLoading: false,
        isSuccess: true,
      }));
      useAssetReadmeMock.mockImplementation((ref: { version?: string }) => ({
        data: ref.version === '1.0.0' ? '# old readme' : '# new readme',
        error: null,
        isError: false,
        isLoading: false,
        isSuccess: true,
      }));
      setRegistry({ data: REGISTRY, isSuccess: true });

      renderAt('/assets/agent/validate/1.1.0?org=agentic-toolkit');

      expect(within(screen.getByTestId('asset-detail-readme')).getByText(/new readme/)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('asset-detail-version-selector'));
      fireEvent.click(screen.getByTestId('version-option-1.0.0'));

      expect(within(screen.getByTestId('asset-detail-readme')).getByText(/old readme/)).toBeInTheDocument();
      expect(screen.getByTestId('asset-detail-version-selector')).toHaveTextContent('v1.0.0');

      fireEvent.click(screen.getByRole('button', { name: /download validate/i }));
      expect(download).toHaveBeenCalledWith(expect.objectContaining({ name: 'validate', version: '1.0.0' }));
    });
  });
});
