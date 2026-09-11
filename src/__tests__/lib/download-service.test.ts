import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadAsset, downloadBundle } from '@/lib/download-service';
import { RegistryFetchError, RegistryNotFoundError } from '@/lib/registry-errors';

import {
  API_BASE,
  apiErrorResponse,
  blobResponse,
  makeTestApiClient,
  stubFetch,
  textResponse,
} from '../utils/api-stub';

const client = makeTestApiClient('tok');

/** Fake zip bytes; the API builds real archives, the client only forwards them. */
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]);

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

function parseUrl(url: string): { path: string; query: Record<string, string> } {
  const parsed = new URL(url);
  return { path: parsed.pathname, query: Object.fromEntries(parsed.searchParams.entries()) };
}

describe('downloadAsset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches the zip from the download endpoint and hands the blob to the browser', async () => {
    const { calls } = stubFetch(() => blobResponse(ZIP_BYTES));
    const trigger = vi.fn();

    const result = await downloadAsset(
      { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
      { client, triggerDownload: trigger },
    );

    expect(result.filename).toBe('validate-1.1.0.zip');
    expect(await bytesOf(result.blob)).toEqual(Array.from(ZIP_BYTES));
    expect(trigger).toHaveBeenCalledWith(result.blob, 'validate-1.1.0.zip');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok');
    expect(parseUrl(calls[0]!.url)).toEqual({
      path: '/assets/agent/validate/1.1.0/download',
      query: { format: 'zip', org: 'agentic-toolkit' },
    });
    expect(calls[0]!.url.startsWith(API_BASE)).toBe(true);
  });

  it('requests format=skill and uses the .skill extension', async () => {
    const { calls } = stubFetch(() => blobResponse(ZIP_BYTES));
    const trigger = vi.fn();

    const result = await downloadAsset(
      { name: 'my-skill', type: 'skill', version: '2.0.0' },
      { client, format: 'skill', triggerDownload: trigger },
    );

    expect(result.filename).toBe('my-skill-2.0.0.skill');
    expect(trigger).toHaveBeenCalledWith(result.blob, 'my-skill-2.0.0.skill');
    expect(parseUrl(calls[0]!.url)).toEqual({
      path: '/assets/skill/my-skill/2.0.0/download',
      query: { format: 'skill' },
    });
  });

  it('retries transient 5xx responses and eventually succeeds', async () => {
    const { calls } = stubFetch((_req, index) =>
      index === 0 ? textResponse('', 503, 'text/plain') : blobResponse(ZIP_BYTES),
    );

    const { blob } = await downloadAsset(
      { name: 'flaky', type: 'skill', version: '1.0.0' },
      { client, triggerDownload: vi.fn() },
    );

    expect(calls).toHaveLength(2);
    expect(await bytesOf(blob)).toEqual(Array.from(ZIP_BYTES));
  });

  it('surfaces RegistryNotFoundError when the asset version is unknown', async () => {
    stubFetch(() => apiErrorResponse(404, 'not_found', 'Unknown asset version'));

    await expect(
      downloadAsset({ name: 'broken', type: 'skill', version: '1.0.0' }, { client, triggerDownload: vi.fn() }),
    ).rejects.toBeInstanceOf(RegistryNotFoundError);
  });

  it('surfaces a RegistryFetchError with the status for non-retryable HTTP failures', async () => {
    stubFetch(() => apiErrorResponse(403, 'not_org_member', 'Not a member'));

    const error = await downloadAsset(
      { name: 'forbidden', type: 'skill', version: '1.0.0' },
      { client, triggerDownload: vi.fn() },
    ).catch((e) => e);

    expect(error).toBeInstanceOf(RegistryFetchError);
    expect((error as RegistryFetchError).status).toBe(403);
  });

  it('surfaces a RegistryFetchError when the API is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('offline');
    });

    await expect(
      downloadAsset({ name: 'offline', type: 'skill', version: '1.0.0' }, { client, triggerDownload: vi.fn() }),
    ).rejects.toBeInstanceOf(RegistryFetchError);
  });
});

describe('downloadBundle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches the bundle zip and names it {name}-{version}.zip', async () => {
    const { calls } = stubFetch(() => blobResponse(ZIP_BYTES));
    const trigger = vi.fn();

    const result = await downloadBundle('feature-workflow', { client, triggerDownload: trigger, version: '1.0.0' });

    expect(result.filename).toBe('feature-workflow-1.0.0.zip');
    expect(await bytesOf(result.blob)).toEqual(Array.from(ZIP_BYTES));
    expect(trigger).toHaveBeenCalledWith(result.blob, 'feature-workflow-1.0.0.zip');
    expect(parseUrl(calls[0]!.url)).toEqual({
      path: '/bundles/feature-workflow/1.0.0/download',
      query: { format: 'zip' },
    });
  });

  it('keeps the .zip extension for the skill variant and requests format=skill', async () => {
    const { calls } = stubFetch(() => blobResponse(ZIP_BYTES));

    const result = await downloadBundle('review-workflow', {
      client,
      format: 'skill',
      triggerDownload: vi.fn(),
      version: '1.0.0',
    });

    expect(result.filename).toBe('review-workflow-1.0.0.zip');
    expect(parseUrl(calls[0]!.url).query).toEqual({ format: 'skill' });
  });

  it('passes the org as a query parameter for an org-scoped bundle (W1)', async () => {
    const { calls } = stubFetch(() => blobResponse(ZIP_BYTES));

    const { filename } = await downloadBundle('qa-bundle', {
      client,
      org: 'cupay',
      triggerDownload: vi.fn(),
      version: '1.0.0',
    });

    expect(filename).toBe('qa-bundle-1.0.0.zip');
    expect(parseUrl(calls[0]!.url)).toEqual({
      path: '/bundles/qa-bundle/1.0.0/download',
      query: { format: 'zip', org: 'cupay' },
    });
  });

  it('surfaces RegistryNotFoundError when the bundle is missing', async () => {
    stubFetch(() => apiErrorResponse(404, 'not_found', 'Unknown bundle'));

    await expect(
      downloadBundle('missing-bundle', { client, triggerDownload: vi.fn(), version: '1.0.0' }),
    ).rejects.toBeInstanceOf(RegistryNotFoundError);
  });

  it('surfaces the API message for a member that cannot be resolved (W4)', async () => {
    stubFetch(() => apiErrorResponse(404, 'not_found', "Bundle member 'login-helper' not found in org 'cupay'"));

    await expect(
      downloadBundle('qa-bundle', { client, org: 'cupay', triggerDownload: vi.fn(), version: '1.0.0' }),
    ).rejects.toThrow(/not found/);
  });
});
