import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAssetManifest, fetchBundleManifest, fetchRegistry } from '@/lib/registry-client';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from '@/lib/registry-errors';

import { loadFixtureRegistry } from '../fixtures';

function encodeContents(obj: unknown): { content: string; encoding: 'base64' } {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return { content: btoa(binary), encoding: 'base64' };
}

function githubOk(obj: unknown): Response {
  return new Response(JSON.stringify(encodeContents(obj)), { status: 200 });
}

const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 1 } as const;

describe('registry-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchRegistry', () => {
    it('fetches, decodes, and validates against the fixture', async () => {
      const fixture = loadFixtureRegistry();
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk(fixture));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchRegistry({ retry: fastRetry });

      expect(result.assets).toHaveLength(fixture.assets.length);
      expect(result.bundles?.[0]?.name).toBe('feature-workflow');
      expect(result.deprecated?.[0]?.name).toBe('old-validate');

      const [calledUrl, calledInit] = fetchMock.mock.calls[0] ?? [];
      expect(String(calledUrl)).toBe(
        'https://api.github.com/repos/EmergentSoftware/agentic-toolkit-registry/contents/registry.json',
      );
      const headers = new Headers((calledInit as RequestInit).headers);
      expect(headers.get('Accept')).toBe('application/vnd.github+json');
      expect(headers.get('Authorization')).toBeNull();
    });

    it('applies owner/repo/ref/token overrides', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk(loadFixtureRegistry()));
      vi.stubGlobal('fetch', fetchMock);

      await fetchRegistry({
        owner: 'acme',
        ref: 'main',
        repo: 'registry',
        retry: fastRetry,
        token: 'abc',
      });

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe('https://api.github.com/repos/acme/registry/contents/registry.json?ref=main');
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('Authorization')).toBe('Bearer abc');
    });

    it('throws RegistryParseError with a readable message on malformed content', async () => {
      const badEnvelope = { content: btoa('{not json'), encoding: 'base64' };
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(badEnvelope), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchRegistry({ retry: fastRetry })).rejects.toMatchObject({
        constructor: RegistryParseError,
        message: expect.stringContaining('not valid JSON'),
      });
    });

    it('throws RegistryParseError when schema validation fails', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk({ not: 'a registry' }));
      vi.stubGlobal('fetch', fetchMock);

      const error = await fetchRegistry({ retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryParseError);
      expect((error as RegistryParseError).zodError).toBeDefined();
      expect((error as RegistryParseError).message).toMatch(/schema validation/);
      expect((error as RegistryParseError).payloadExcerpt).toContain('not');
    });

    it('throws RegistryNotFoundError on 404 without retry', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchRegistry({ retry: fastRetry })).rejects.toBeInstanceOf(RegistryNotFoundError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws RegistryFetchError on transport failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
      vi.stubGlobal('fetch', fetchMock);

      const error = await fetchRegistry({ retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).cause).toBeInstanceOf(TypeError);
    });

    it('throws RegistryFetchError on non-retryable HTTP failure', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }));
      vi.stubGlobal('fetch', fetchMock);

      const error = await fetchRegistry({ retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).status).toBe(403);
    });
  });

  describe('fetchAssetManifest', () => {
    it('builds the correct contents path with an org scope', async () => {
      const manifest = {
        author: 'EmergentSoftware',
        description: 'd',
        entrypoint: 'AGENT.md',
        name: 'validate',
        org: 'agentic-toolkit',
        type: 'agent',
        version: '1.1.0',
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk(manifest));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchAssetManifest(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { retry: fastRetry },
      );

      expect(result.name).toBe('validate');
      const [url] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe(
        'https://api.github.com/repos/EmergentSoftware/agentic-toolkit-registry/contents/assets/agents/agentic-toolkit/validate/1.1.0/manifest.json',
      );
    });

    it('builds an unscoped path when org is omitted', async () => {
      const manifest = {
        author: 'community',
        description: 'd',
        entrypoint: 'AGENT.md',
        name: 'clarification-agent',
        type: 'agent',
        version: '1.0.0',
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk(manifest));
      vi.stubGlobal('fetch', fetchMock);

      await fetchAssetManifest(
        { name: 'clarification-agent', type: 'agent', version: '1.0.0' },
        { retry: fastRetry },
      );

      const [url] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toContain('/contents/assets/agents/clarification-agent/1.0.0/manifest.json');
    });
  });

  describe('fetchBundleManifest', () => {
    it('fetches a bundle.json by name', async () => {
      const bundle = {
        assets: [{ name: 'dev-commands-rule', type: 'rule' }],
        author: 'EmergentSoftware',
        description: 'd',
        name: 'quality-bundle',
        version: '0.3.0',
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(githubOk(bundle));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchBundleManifest({ name: 'quality-bundle' }, { retry: fastRetry });
      expect(result.name).toBe('quality-bundle');
      const [url] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toContain('/contents/bundles/quality-bundle/bundle.json');
    });
  });
});
