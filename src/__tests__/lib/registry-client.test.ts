import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAssetFiles,
  fetchAssetManifest,
  fetchAssetReadme,
  fetchBundleManifest,
  fetchBundleReadme,
  fetchRegistry,
  findExistingAsset,
  findExistingBundle,
} from '@/lib/registry-client';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from '@/lib/registry-errors';

import { loadFixtureRegistry } from '../fixtures';
import {
  API_BASE,
  apiErrorResponse,
  jsonResponse,
  makeTestApiClient,
  stubFetch,
  textResponse,
} from '../utils/api-stub';

const client = makeTestApiClient('tok');

describe('registry-client (ATK API-backed)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('fetchRegistry', () => {
    it('fetches, parses, and validates the registry via GET /registry with the bearer token', async () => {
      const fixture = loadFixtureRegistry();
      const { calls } = stubFetch(() => jsonResponse(fixture));

      const result = await fetchRegistry({ client });

      expect(result.assets).toHaveLength(fixture.assets.length);
      expect(result.bundles?.[0]?.name).toBe('feature-workflow');
      expect(result.deprecated?.[0]?.name).toBe('old-validate');

      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe('GET');
      expect(calls[0]!.url).toBe(`${API_BASE}/registry`);
      expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok');
    });

    it('throws RegistryParseError when schema validation fails', async () => {
      stubFetch(() => jsonResponse({ not: 'a registry' }));

      const error = await fetchRegistry({ client }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryParseError);
      expect((error as RegistryParseError).zodError).toBeDefined();
      expect((error as RegistryParseError).message).toMatch(/schema validation/);
    });

    it('throws RegistryNotFoundError on 404 without retry', async () => {
      const { calls } = stubFetch(() => apiErrorResponse(404, 'not_found', 'registry.json is missing'));

      await expect(fetchRegistry({ client })).rejects.toBeInstanceOf(RegistryNotFoundError);
      expect(calls).toHaveLength(1);
    });

    it('throws RegistryFetchError on transport failure (after exhausting retries)', async () => {
      const { calls } = stubFetch(() => {
        throw new TypeError('offline');
      });

      const error = await fetchRegistry({ client }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).status).toBeUndefined();
      expect((error as RegistryFetchError).message).toMatch(/could not reach the atk api/i);
      expect(calls).toHaveLength(2);
    });

    it('throws RegistryFetchError carrying the status on non-retryable HTTP failure', async () => {
      stubFetch(() => apiErrorResponse(403, 'not_org_member', 'Not a member'));

      const error = await fetchRegistry({ client }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistryFetchError);
      expect((error as RegistryFetchError).status).toBe(403);
      expect((error as RegistryFetchError).message).toMatch(/EmergentSoftware/);
    });

    it('retries transient 503 responses', async () => {
      const { calls } = stubFetch((_req, index) =>
        index === 0 ? textResponse('', 503, 'text/plain') : jsonResponse(loadFixtureRegistry()),
      );

      const result = await fetchRegistry({ client });
      expect(result.assets.length).toBeGreaterThan(0);
      expect(calls).toHaveLength(2);
    });
  });

  describe('fetchAssetManifest', () => {
    const manifest = {
      author: 'EmergentSoftware',
      description: 'd',
      entrypoint: 'AGENT.md',
      name: 'validate',
      org: 'agentic-toolkit',
      type: 'agent',
      version: '1.1.0',
    };

    it('requests the manifest endpoint with the org as a query parameter', async () => {
      const { calls } = stubFetch(() => jsonResponse(manifest));

      const result = await fetchAssetManifest(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { client },
      );

      expect(result.name).toBe('validate');
      expect(calls[0]!.url).toBe(`${API_BASE}/assets/agent/validate/1.1.0/manifest?org=agentic-toolkit`);
    });

    it('omits the org query when the asset is global', async () => {
      const { calls } = stubFetch(() => jsonResponse({ ...manifest, name: 'clarification-agent', org: undefined }));

      await fetchAssetManifest({ name: 'clarification-agent', type: 'agent', version: '1.0.0' }, { client });

      expect(calls[0]!.url).toBe(`${API_BASE}/assets/agent/clarification-agent/1.0.0/manifest`);
    });

    it('throws RegistryParseError when the manifest fails the Zod guard', async () => {
      stubFetch(() => jsonResponse({ name: 'broken' }));

      await expect(
        fetchAssetManifest({ name: 'broken', type: 'skill', version: '1.0.0' }, { client }),
      ).rejects.toBeInstanceOf(RegistryParseError);
    });
  });

  describe('fetchAssetReadme', () => {
    it('fetches README markdown as text', async () => {
      const markdown = '# Hello\n\nBody.';
      const { calls } = stubFetch(() => textResponse(markdown));

      const result = await fetchAssetReadme(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { client },
      );

      expect(result).toBe(markdown);
      expect(calls[0]!.url).toBe(`${API_BASE}/assets/agent/validate/1.1.0/readme?org=agentic-toolkit`);
    });

    it('returns null when the README is missing (HTTP 404)', async () => {
      stubFetch(() => apiErrorResponse(404, 'not_found', 'No README'));

      const result = await fetchAssetReadme({ name: 'no-readme', type: 'skill', version: '1.0.0' }, { client });
      expect(result).toBeNull();
    });

    it('propagates transport errors as RegistryFetchError', async () => {
      stubFetch(() => {
        throw new TypeError('offline');
      });

      await expect(fetchAssetReadme({ name: 'x', type: 'skill', version: '1.0.0' }, { client })).rejects.toBeInstanceOf(
        RegistryFetchError,
      );
    });
  });

  describe('fetchAssetFiles', () => {
    it('returns the API directory listing (manifest and README included)', async () => {
      const listing = {
        files: [
          { path: 'AGENT.md', sha: 'a', size: 12 },
          { path: 'README.md', sha: 'b', size: 34 },
          { path: 'manifest.json', sha: 'c', size: 56 },
          { path: 'reference/guide.md', sha: 'd', size: 78 },
        ],
        name: 'validate',
        org: 'agentic-toolkit',
        type: 'agent',
        version: '1.1.0',
      };
      const { calls } = stubFetch(() => jsonResponse(listing));

      const result = await fetchAssetFiles(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        { client },
      );

      expect(result.files.map((f) => f.path)).toEqual(['AGENT.md', 'README.md', 'manifest.json', 'reference/guide.md']);
      expect(result.org).toBe('agentic-toolkit');
      expect(calls[0]!.url).toBe(`${API_BASE}/assets/agent/validate/1.1.0/files?org=agentic-toolkit`);
    });

    it('normalises a null org to undefined', async () => {
      stubFetch(() => jsonResponse({ files: [], name: 'x', org: null, type: 'skill', version: '1.0.0' }));

      const result = await fetchAssetFiles({ name: 'x', type: 'skill', version: '1.0.0' }, { client });
      expect(result.org).toBeUndefined();
    });

    it('throws RegistryNotFoundError for an unknown version', async () => {
      stubFetch(() => apiErrorResponse(404, 'not_found', 'Unknown version'));

      await expect(fetchAssetFiles({ name: 'x', type: 'skill', version: '9.9.9' }, { client })).rejects.toBeInstanceOf(
        RegistryNotFoundError,
      );
    });
  });

  describe('fetchBundleManifest', () => {
    it('fetches a global bundle.json by name and version', async () => {
      const bundleJson = {
        assets: [{ name: 'dev-commands-rule', type: 'rule' }],
        author: 'EmergentSoftware',
        description: 'd',
        name: 'quality-bundle',
        version: '0.3.0',
      };
      const { calls } = stubFetch(() => jsonResponse(bundleJson));

      const result = await fetchBundleManifest({ name: 'quality-bundle', version: '0.3.0' }, { client });
      expect(result.name).toBe('quality-bundle');
      expect(calls[0]!.url).toBe(`${API_BASE}/bundles/quality-bundle/0.3.0/manifest`);
    });

    it('passes the org as a query parameter for an org bundle', async () => {
      const bundleJson = {
        assets: [{ name: 'dev-commands-rule', type: 'rule' }],
        author: 'cupay',
        description: 'd',
        name: 'qa-bundle',
        org: 'cupay',
        version: '1.0.0',
      };
      const { calls } = stubFetch(() => jsonResponse(bundleJson));

      const result = await fetchBundleManifest({ name: 'qa-bundle', org: 'cupay', version: '1.0.0' }, { client });
      expect(result.name).toBe('qa-bundle');
      expect(calls[0]!.url).toBe(`${API_BASE}/bundles/qa-bundle/1.0.0/manifest?org=cupay`);
    });
  });

  describe('fetchBundleReadme', () => {
    it('fetches a global bundle README as text', async () => {
      const markdown = '# Quality bundle\n\nBody.';
      const { calls } = stubFetch(() => textResponse(markdown));

      const result = await fetchBundleReadme({ name: 'quality-bundle', version: '0.3.0' }, { client });

      expect(result).toBe(markdown);
      expect(calls[0]!.url).toBe(`${API_BASE}/bundles/quality-bundle/0.3.0/readme`);
    });

    it('passes the org as a query parameter for an org bundle', async () => {
      const { calls } = stubFetch(() => textResponse('# QA'));

      const result = await fetchBundleReadme({ name: 'qa-bundle', org: 'cupay', version: '1.0.0' }, { client });

      expect(result).toBe('# QA');
      expect(calls[0]!.url).toBe(`${API_BASE}/bundles/qa-bundle/1.0.0/readme?org=cupay`);
    });

    it('returns null when the README is missing (HTTP 404)', async () => {
      stubFetch(() => apiErrorResponse(404, 'not_found', 'No README'));

      const result = await fetchBundleReadme({ name: 'feature-workflow', version: '1.0.0' }, { client });
      expect(result).toBeNull();
    });

    it('propagates transport errors as RegistryFetchError', async () => {
      stubFetch(() => {
        throw new TypeError('offline');
      });

      await expect(fetchBundleReadme({ name: 'x', version: '1.0.0' }, { client })).rejects.toBeInstanceOf(
        RegistryFetchError,
      );
    });
  });

  describe('findExistingBundle', () => {
    it('returns the latest version for an existing global bundle and undefined otherwise', () => {
      const registry = loadFixtureRegistry();
      expect(findExistingBundle(registry, { name: 'feature-workflow' })).toEqual({
        latest: '1.0.0',
        org: undefined,
      });
      expect(findExistingBundle(registry, { name: 'does-not-exist' })).toBeUndefined();
    });

    it('matches org-scoped bundles strictly and never falls back across scope', () => {
      const registry = loadFixtureRegistry();
      registry.bundles!.push({
        assetCount: 1,
        author: 'cupay',
        description: 'qa',
        name: 'qa-bundle',
        org: 'cupay',
        tags: [],
        version: '1.0.0',
      });

      // Exact org match resolves.
      expect(findExistingBundle(registry, { name: 'qa-bundle', org: 'cupay' })).toEqual({
        latest: '1.0.0',
        org: 'cupay',
      });
      // An unscoped query must not match an org bundle…
      expect(findExistingBundle(registry, { name: 'qa-bundle' })).toBeUndefined();
      // …and an org query must not match a global bundle.
      expect(findExistingBundle(registry, { name: 'feature-workflow', org: 'cupay' })).toBeUndefined();
      // A different org does not match.
      expect(findExistingBundle(registry, { name: 'qa-bundle', org: 'acme' })).toBeUndefined();
    });
  });

  describe('findExistingAsset', () => {
    it('matches an org-scoped asset by name, type, and org', () => {
      const registry = loadFixtureRegistry();
      const result = findExistingAsset(registry, {
        name: 'validate',
        org: 'agentic-toolkit',
        type: 'agent',
      });
      expect(result).toEqual({ latest: '1.1.0', org: 'agentic-toolkit' });
    });

    it('does not fall back to a global asset when an org-scoped match is missing', () => {
      const registry = loadFixtureRegistry();
      // "clarification-agent" exists only as a global entry; an org-scoped
      // query for the same name must not match it.
      const result = findExistingAsset(registry, {
        name: 'clarification-agent',
        org: 'acme',
        type: 'agent',
      });
      expect(result).toBeUndefined();
    });

    it('does not match an org-scoped entry from a different org', () => {
      const registry = loadFixtureRegistry();
      // "validate" only exists under the agentic-toolkit org.
      const result = findExistingAsset(registry, {
        name: 'validate',
        org: 'someone-else',
        type: 'agent',
      });
      expect(result).toBeUndefined();
    });

    it('treats an empty-string org as unscoped', () => {
      const registry = loadFixtureRegistry();
      const result = findExistingAsset(registry, {
        name: 'feature-skill',
        org: '',
        type: 'skill',
      });
      expect(result).toEqual({ latest: '0.2.0', org: undefined });
    });

    it('matches a global asset when no org is provided', () => {
      const registry = loadFixtureRegistry();
      const result = findExistingAsset(registry, { name: 'feature-skill', type: 'skill' });
      expect(result).toEqual({ latest: '0.2.0', org: undefined });
    });

    it('does not fall back to org-scoped assets when org is absent', () => {
      const registry = loadFixtureRegistry();
      // "validate" only exists under the agentic-toolkit org in the fixture.
      const result = findExistingAsset(registry, { name: 'validate', type: 'agent' });
      expect(result).toBeUndefined();
    });

    it('returns undefined when nothing matches', () => {
      const registry = loadFixtureRegistry();
      const result = findExistingAsset(registry, { name: 'does-not-exist', type: 'skill' });
      expect(result).toBeUndefined();
    });

    it('filters by type — same name in a different type is not a match', () => {
      const registry = loadFixtureRegistry();
      const result = findExistingAsset(registry, { name: 'dev-commands-rule', type: 'skill' });
      expect(result).toBeUndefined();
    });
  });
});
