import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Manifest } from '@/lib/schemas';
import type { Bundle } from '@/lib/schemas';

import { downloadAsset, downloadBundle } from '@/lib/download-service';
import { RegistryFetchError, RegistryNotFoundError } from '@/lib/registry-errors';

const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 2 } as const;

interface FakeAsset {
  files: Record<string, string>;
  manifest: Manifest;
  org?: string;
}

function buildManifestBytes(manifest: Manifest): string {
  return JSON.stringify(manifest, null, 2);
}

function buildUrl(
  type: string,
  name: string,
  version: string,
  path: string,
  org?: string,
): string {
  const typeDir = `${type}s`;
  const parts = ['assets', typeDir];
  if (org) parts.push(encodeURIComponent(org));
  parts.push(encodeURIComponent(name), encodeURIComponent(version), path);
  return `https://api.github.com/repos/EmergentSoftware/agentic-toolkit-registry/contents/${parts.join('/')}`;
}

function encodeBase64Text(text: string): { content: string; encoding: 'base64' } {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return { content: btoa(binary), encoding: 'base64' };
}

function okResponse(envelope: unknown): Response {
  return new Response(JSON.stringify(envelope), { status: 200 });
}

async function readZipEntries(blob: Blob): Promise<Record<string, string>> {
  const ab = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  const entries: Record<string, string> = {};
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    entries[path] = await file.async('string');
  }
  return entries;
}

function setupFetchForAssets(assets: FakeAsset[]): ReturnType<typeof vi.fn> {
  const urlMap = new Map<string, (() => Response) | Response>();
  for (const asset of assets) {
    const { name, type, version } = asset.manifest;
    const manifestText = buildManifestBytes(asset.manifest);
    urlMap.set(buildUrl(type, name, version, 'manifest.json', asset.org), okResponse(encodeBase64Text(manifestText)));
    for (const [path, contents] of Object.entries(asset.files)) {
      urlMap.set(buildUrl(type, name, version, path, asset.org), okResponse(encodeBase64Text(contents)));
    }
  }

  return vi.fn(async (url: RequestInfo | URL) => {
    const key = String(url);
    const entry = urlMap.get(key);
    if (!entry) {
      return new Response('', { status: 404 });
    }
    return typeof entry === 'function' ? entry() : entry.clone();
  });
}

describe('downloadAsset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packages a single asset with a flat layout and preserves manifest bytes', async () => {
    const manifest: Manifest = {
      author: 'EmergentSoftware',
      description: 'validate',
      entrypoint: 'AGENT.md',
      files: ['AGENT.md'],
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      version: '1.1.0',
    };
    const readme = '# validate\n';
    const agent = 'agent body';

    const fetchMock = setupFetchForAssets([
      {
        files: { 'AGENT.md': agent, 'README.md': readme },
        manifest,
        org: 'agentic-toolkit',
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const trigger = vi.fn();
    const result = await downloadAsset(
      { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
      { retry: fastRetry, triggerDownload: trigger },
    );

    expect(result.filename).toBe('validate-1.1.0.zip');
    const entries = await readZipEntries(result.blob);
    expect(Object.keys(entries).sort()).toEqual(['AGENT.md', 'README.md', 'manifest.json']);
    expect(entries['manifest.json']).toBe(buildManifestBytes(manifest));
    expect(entries['AGENT.md']).toBe(agent);
    expect(entries['README.md']).toBe(readme);
    expect(trigger).toHaveBeenCalledWith(result.blob, 'validate-1.1.0.zip');
  });

  it('tolerates a missing README (HTTP 404) on the primary asset', async () => {
    const manifest: Manifest = {
      author: 'community',
      description: 'no readme',
      entrypoint: 'SKILL.md',
      name: 'no-readme',
      type: 'skill',
      version: '1.0.0',
    };

    const fetchMock = setupFetchForAssets([
      { files: { 'SKILL.md': 'body' }, manifest },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { blob } = await downloadAsset(
      { name: 'no-readme', type: 'skill', version: '1.0.0' },
      { retry: fastRetry, triggerDownload: vi.fn() },
    );

    const entries = await readZipEntries(blob);
    expect(Object.keys(entries).sort()).toEqual(['SKILL.md', 'manifest.json']);
  });

  it('places each dependency under dependencies/{name}/ with its own files', async () => {
    const primary: Manifest = {
      author: 'EmergentSoftware',
      dependencies: [{ name: 'dev-commands-rule', type: 'rule', version: '1.2.0' }],
      description: 'primary',
      entrypoint: 'AGENT.md',
      name: 'validate',
      type: 'agent',
      version: '1.1.0',
    };
    const dep: Manifest = {
      author: 'EmergentSoftware',
      description: 'dep',
      entrypoint: 'RULE.md',
      name: 'dev-commands-rule',
      type: 'rule',
      version: '1.2.0',
    };

    const fetchMock = setupFetchForAssets([
      { files: { 'AGENT.md': 'agent', 'README.md': 'primary readme' }, manifest: primary },
      { files: { 'README.md': 'dep readme', 'RULE.md': 'rule body' }, manifest: dep },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { blob } = await downloadAsset(
      { name: 'validate', type: 'agent', version: '1.1.0' },
      { retry: fastRetry, triggerDownload: vi.fn() },
    );

    const entries = await readZipEntries(blob);
    expect(Object.keys(entries).sort()).toEqual([
      'AGENT.md',
      'README.md',
      'dependencies/dev-commands-rule/README.md',
      'dependencies/dev-commands-rule/RULE.md',
      'dependencies/dev-commands-rule/manifest.json',
      'manifest.json',
    ]);
    expect(entries['dependencies/dev-commands-rule/manifest.json']).toBe(buildManifestBytes(dep));
    expect(entries['manifest.json']).toBe(buildManifestBytes(primary));
  });

  it('deduplicates dependencies encountered via multiple paths and guards against cycles', async () => {
    const a: Manifest = {
      author: 'x',
      dependencies: [{ name: 'b', type: 'skill', version: '1.0.0' }],
      description: 'a',
      entrypoint: 'A.md',
      name: 'a',
      type: 'skill',
      version: '1.0.0',
    };
    const b: Manifest = {
      author: 'x',
      dependencies: [{ name: 'a', type: 'skill', version: '1.0.0' }],
      description: 'b',
      entrypoint: 'B.md',
      name: 'b',
      type: 'skill',
      version: '1.0.0',
    };
    const fetchMock = setupFetchForAssets([
      { files: { 'A.md': 'a' }, manifest: a },
      { files: { 'B.md': 'b' }, manifest: b },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { blob } = await downloadAsset(
      { name: 'a', type: 'skill', version: '1.0.0' },
      { retry: fastRetry, triggerDownload: vi.fn() },
    );

    const entries = await readZipEntries(blob);
    // Cycle should resolve: primary a at root, b under dependencies/
    expect(Object.keys(entries)).toContain('A.md');
    expect(Object.keys(entries)).toContain('dependencies/b/B.md');
    expect(Object.keys(entries)).toContain('dependencies/b/manifest.json');
    // a should not recurse into itself as a dep
    expect(Object.keys(entries)).not.toContain('dependencies/a/A.md');
  });

  it('retries transient 5xx responses and eventually succeeds', async () => {
    const manifest: Manifest = {
      author: 'x',
      description: 'flaky',
      entrypoint: 'SKILL.md',
      name: 'flaky',
      type: 'skill',
      version: '1.0.0',
    };

    const manifestUrl = buildUrl('skill', 'flaky', '1.0.0', 'manifest.json');
    const skillUrl = buildUrl('skill', 'flaky', '1.0.0', 'SKILL.md');
    const readmeUrl = buildUrl('skill', 'flaky', '1.0.0', 'README.md');

    let manifestCalls = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const key = String(url);
      if (key === manifestUrl) {
        manifestCalls += 1;
        if (manifestCalls === 1) return new Response('', { status: 503 });
        return okResponse(encodeBase64Text(buildManifestBytes(manifest)));
      }
      if (key === skillUrl) return okResponse(encodeBase64Text('body'));
      if (key === readmeUrl) return new Response('', { status: 404 });
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { blob } = await downloadAsset(
      { name: 'flaky', type: 'skill', version: '1.0.0' },
      { retry: fastRetry, triggerDownload: vi.fn() },
    );
    expect(manifestCalls).toBeGreaterThanOrEqual(2);
    const entries = await readZipEntries(blob);
    expect(entries['SKILL.md']).toBe('body');
  });

  it('surfaces a typed error when a required file is missing', async () => {
    // Manifest fetch succeeds but the entrypoint returns 404 → non-tolerated miss
    const manifest: Manifest = {
      author: 'x',
      description: 'broken',
      entrypoint: 'SKILL.md',
      name: 'broken',
      type: 'skill',
      version: '1.0.0',
    };
    const manifestUrl = buildUrl('skill', 'broken', '1.0.0', 'manifest.json');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const key = String(url);
      if (key === manifestUrl) return okResponse(encodeBase64Text(buildManifestBytes(manifest)));
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadAsset(
        { name: 'broken', type: 'skill', version: '1.0.0' },
        { retry: fastRetry, triggerDownload: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(RegistryNotFoundError);
  });

  it('surfaces a RegistryFetchError for non-retryable HTTP failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadAsset(
        { name: 'forbidden', type: 'skill', version: '1.0.0' },
        { retry: fastRetry, triggerDownload: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(RegistryFetchError);
  });
});

function buildBundleUrl(name: string): string {
  return `https://api.github.com/repos/EmergentSoftware/agentic-toolkit-registry/contents/bundles/${encodeURIComponent(name)}/bundle.json`;
}

describe('downloadBundle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packages bundle.json at the root and each member under {memberName}/ with flat files', async () => {
    const bundle: Bundle = {
      assets: [
        { name: 'clarification-agent', type: 'agent' },
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
      ],
      author: 'EmergentSoftware',
      description: 'feature workflow',
      name: 'feature-workflow',
      setupInstructions: '## setup',
      tags: ['workflow'],
      version: '1.0.0',
    };

    const clarificationManifest: Manifest = {
      author: 'community',
      description: 'clarifier',
      entrypoint: 'AGENT.md',
      files: ['AGENT.md'],
      name: 'clarification-agent',
      type: 'agent',
      version: '1.0.0',
    };
    const validateManifest: Manifest = {
      author: 'EmergentSoftware',
      description: 'validate',
      entrypoint: 'AGENT.md',
      files: ['AGENT.md'],
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      version: '1.1.0',
    };

    const assetFetch = setupFetchForAssets([
      { files: { 'AGENT.md': 'clarifier body', 'README.md': 'clarifier readme' }, manifest: clarificationManifest },
      {
        files: { 'AGENT.md': 'validate body', 'README.md': 'validate readme' },
        manifest: validateManifest,
        org: 'agentic-toolkit',
      },
    ]);

    const bundleUrl = buildBundleUrl('feature-workflow');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === bundleUrl) return okResponse(encodeBase64Text(JSON.stringify(bundle, null, 2)));
      return (assetFetch as unknown as (u: RequestInfo | URL) => Promise<Response>)(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const trigger = vi.fn();
    const result = await downloadBundle('feature-workflow', {
      resolveVersion: (member) => (member.name === 'clarification-agent' ? '1.0.0' : undefined),
      retry: fastRetry,
      triggerDownload: trigger,
    });

    expect(result.filename).toBe('feature-workflow-1.0.0.zip');
    const entries = await readZipEntries(result.blob);
    const keys = Object.keys(entries).sort();
    expect(keys).toContain('bundle.json');
    expect(keys).toContain('clarification-agent/AGENT.md');
    expect(keys).toContain('clarification-agent/README.md');
    expect(keys).toContain('clarification-agent/manifest.json');
    expect(keys).toContain('validate/AGENT.md');
    expect(keys).toContain('validate/manifest.json');
    expect(entries['bundle.json']).toContain('"feature-workflow"');
    expect(trigger).toHaveBeenCalledWith(result.blob, 'feature-workflow-1.0.0.zip');
  });

  it('falls back to resolveVersion when a member omits its version', async () => {
    const bundle: Bundle = {
      assets: [{ name: 'clarification-agent', type: 'agent' }],
      author: 'x',
      description: 'b',
      name: 'tiny',
      version: '0.1.0',
    };
    const manifest: Manifest = {
      author: 'x',
      description: 'c',
      entrypoint: 'AGENT.md',
      name: 'clarification-agent',
      type: 'agent',
      version: '2.3.4',
    };

    const assetFetch = setupFetchForAssets([{ files: { 'AGENT.md': 'body' }, manifest }]);
    const bundleUrl = buildBundleUrl('tiny');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === bundleUrl) return okResponse(encodeBase64Text(JSON.stringify(bundle)));
      return (assetFetch as unknown as (u: RequestInfo | URL) => Promise<Response>)(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolveVersion = vi.fn(() => '2.3.4');
    const { blob } = await downloadBundle('tiny', {
      resolveVersion,
      retry: fastRetry,
      triggerDownload: vi.fn(),
    });

    expect(resolveVersion).toHaveBeenCalledTimes(1);
    const entries = await readZipEntries(blob);
    expect(Object.keys(entries)).toContain('clarification-agent/manifest.json');
  });

  it('throws when a member has no version and the resolver returns undefined', async () => {
    const bundle: Bundle = {
      assets: [{ name: 'unknown', type: 'agent' }],
      author: 'x',
      description: 'b',
      name: 'broken',
      version: '0.1.0',
    };
    const bundleUrl = buildBundleUrl('broken');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === bundleUrl) return okResponse(encodeBase64Text(JSON.stringify(bundle)));
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadBundle('broken', { retry: fastRetry, triggerDownload: vi.fn() }),
    ).rejects.toThrow(/missing a version/);
  });

  it('surfaces RegistryNotFoundError when the bundle manifest itself is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadBundle('missing-bundle', { retry: fastRetry, triggerDownload: vi.fn() }),
    ).rejects.toBeInstanceOf(RegistryNotFoundError);
  });
});
