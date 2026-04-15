import type { Octokit } from '@octokit/rest';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAssetManifest, fetchAssetReadme, fetchBundleManifest, fetchRegistry } from '@/lib/registry-client';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from '@/lib/registry-errors';

import { loadFixtureRegistry } from '../fixtures';

const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 1 } as const;

type GetContentResult = Awaited<ReturnType<Octokit['rest']['repos']['getContent']>>;

function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * Build a minimal fake Octokit whose `rest.repos.getContent` resolves from the
 * given queue. The queue is consumed FIFO; a value can be a raw string, an
 * Error to throw, or a ready-made response envelope.
 */
function makeFakeOctokit(queue: Array<Error | GetContentResult | string>): {
  octokit: Octokit;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('fakeOctokit: queue exhausted');
    if (next instanceof Error) throw next;
    if (typeof next === 'string') return rawResponse(next);
    return next;
  });
  const octokit = { rest: { repos: { getContent: spy } } } as unknown as Octokit;
  return { octokit, spy };
}

function rawResponse(raw: string): GetContentResult {
  return { data: raw } as unknown as GetContentResult;
}

describe('registry-client (Octokit-backed)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchRegistry', () => {
    it('fetches, parses, and validates the registry via octokit.rest.repos.getContent', async () => {
      const fixture = loadFixtureRegistry();
      const { octokit, spy } = makeFakeOctokit([JSON.stringify(fixture)]);

      const result = await fetchRegistry({ octokit, retry: fastRetry });

      expect(result.assets).toHaveLength(fixture.assets.length);
      expect(result.bundles?.[0]?.name).toBe('feature-workflow');
      expect(result.deprecated?.[0]?.name).toBe('old-validate');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: { format: 'raw' },
          owner: 'EmergentSoftware',
          path: 'registry.json',
          repo: 'agentic-toolkit-registry',
        }),
      );
    });

    it('applies owner/repo/ref overrides', async () => {
      const { octokit, spy } = makeFakeOctokit([JSON.stringify(loadFixtureRegistry())]);

      await fetchRegistry({ octokit, owner: 'acme', ref: 'main', repo: 'registry', retry: fastRetry });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'acme', ref: 'main', repo: 'registry' }),
      );
    });

    it('throws RegistryParseError on malformed JSON', async () => {
      const { octokit } = makeFakeOctokit(['{not json']);

      await expect(fetchRegistry({ octokit, retry: fastRetry })).rejects.toMatchObject({
        constructor: RegistryParseError,
        message: expect.stringContaining('not valid JSON'),
      });
    });

    it('throws RegistryParseError when schema validation fails', async () => {
      const { octokit } = makeFakeOctokit([JSON.stringify({ not: 'a registry' })]);

      const error = await fetchRegistry({ octokit, retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryParseError);
      expect((error as RegistryParseError).zodError).toBeDefined();
      expect((error as RegistryParseError).message).toMatch(/schema validation/);
    });

    it('throws RegistryNotFoundError on 404 without retry', async () => {
      const { octokit, spy } = makeFakeOctokit([httpError(404, 'not found')]);

      await expect(fetchRegistry({ octokit, retry: fastRetry })).rejects.toBeInstanceOf(RegistryNotFoundError);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('throws RegistryFetchError on transport failure (after exhausting retries)', async () => {
      const { octokit } = makeFakeOctokit([
        new TypeError('offline'),
        new TypeError('offline'),
      ]);

      const error = await fetchRegistry({ octokit, retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).cause).toBeInstanceOf(TypeError);
    });

    it('throws RegistryFetchError on non-retryable HTTP failure', async () => {
      const { octokit } = makeFakeOctokit([httpError(403, 'forbidden')]);

      const error = await fetchRegistry({ octokit, retry: fastRetry }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).status).toBe(403);
    });

    it('retries transient 503 responses', async () => {
      const { octokit, spy } = makeFakeOctokit([
        httpError(503, 'unavailable'),
        JSON.stringify(loadFixtureRegistry()),
      ]);

      const result = await fetchRegistry({ octokit, retry: fastRetry });
      expect(result.assets.length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchAssetManifest', () => {
    const manifestJson = JSON.stringify({
      author: 'EmergentSoftware',
      description: 'd',
      entrypoint: 'AGENT.md',
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      version: '1.1.0',
    });

    it('builds the correct contents path with an org scope', async () => {
      const { octokit, spy } = makeFakeOctokit([manifestJson]);

      const result = await fetchAssetManifest(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { octokit, retry: fastRetry },
      );

      expect(result.name).toBe('validate');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'assets/agents/@agentic-toolkit/validate/1.1.0/manifest.json',
        }),
      );
    });

    it('builds an unscoped path when org is omitted', async () => {
      const manifest = JSON.stringify({
        author: 'community',
        description: 'd',
        entrypoint: 'AGENT.md',
        name: 'clarification-agent',
        type: 'agent',
        version: '1.0.0',
      });
      const { octokit, spy } = makeFakeOctokit([manifest]);

      await fetchAssetManifest(
        { name: 'clarification-agent', type: 'agent', version: '1.0.0' },
        { octokit, retry: fastRetry },
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'assets/agents/clarification-agent/1.0.0/manifest.json',
        }),
      );
    });
  });

  describe('fetchAssetReadme', () => {
    it('fetches README.md alongside the manifest path', async () => {
      const markdown = '# Hello\n\nBody.';
      const { octokit, spy } = makeFakeOctokit([markdown]);

      const result = await fetchAssetReadme(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { octokit, retry: fastRetry },
      );

      expect(result).toBe(markdown);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'assets/agents/@agentic-toolkit/validate/1.1.0/README.md',
        }),
      );
    });

    it('returns null when the README is missing (HTTP 404)', async () => {
      const { octokit } = makeFakeOctokit([httpError(404)]);

      const result = await fetchAssetReadme(
        { name: 'no-readme', type: 'skill', version: '1.0.0' },
        { octokit, retry: fastRetry },
      );
      expect(result).toBeNull();
    });

    it('propagates transport errors as RegistryFetchError', async () => {
      const { octokit } = makeFakeOctokit([
        new TypeError('offline'),
        new TypeError('offline'),
      ]);

      await expect(
        fetchAssetReadme({ name: 'x', type: 'skill', version: '1.0.0' }, { octokit, retry: fastRetry }),
      ).rejects.toBeInstanceOf(RegistryFetchError);
    });
  });

  describe('fetchBundleManifest', () => {
    it('fetches a bundle.json by name', async () => {
      const bundleJson = JSON.stringify({
        assets: [{ name: 'dev-commands-rule', type: 'rule' }],
        author: 'EmergentSoftware',
        description: 'd',
        name: 'quality-bundle',
        version: '0.3.0',
      });
      const { octokit, spy } = makeFakeOctokit([bundleJson]);

      const result = await fetchBundleManifest({ name: 'quality-bundle' }, { octokit, retry: fastRetry });
      expect(result.name).toBe('quality-bundle');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'bundles/quality-bundle/bundle.json' }),
      );
    });
  });
});
