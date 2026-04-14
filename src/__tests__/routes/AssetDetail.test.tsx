import type { UseQueryResult } from '@tanstack/react-query';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Manifest } from '@/lib/schemas';

import { RegistryNotFoundError } from '@/lib/registry-errors';
import { AssetDetailRoute } from '@/routes/AssetDetail';

const useAssetManifestMock = vi.hoisted(() => vi.fn());
const useAssetReadmeMock = vi.hoisted(() => vi.fn());
const useDownloadAssetMock = vi.hoisted(() =>
  vi.fn(() => ({ download: vi.fn().mockResolvedValue(undefined), isDownloading: () => false })),
);

vi.mock('@/hooks/useAssetManifest', () => ({ useAssetManifest: useAssetManifestMock }));
vi.mock('@/hooks/useAssetReadme', () => ({ useAssetReadme: useAssetReadmeMock }));
vi.mock('@/hooks/useDownloadAsset', () => ({ useDownloadAsset: useDownloadAssetMock }));

type ManifestQueryShape = Partial<UseQueryResult<Manifest, Error>>;
type ReadmeQueryShape = Partial<UseQueryResult<null | string, Error>>;

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
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
  afterEach(() => {
    useAssetManifestMock.mockReset();
    useAssetReadmeMock.mockReset();
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
});
