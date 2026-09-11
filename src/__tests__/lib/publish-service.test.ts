/* eslint-disable perfectionist/sort-modules */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublishRequest } from '@/lib/api/types.gen';
import type { Bundle } from '@/lib/schemas/bundle';
import type { Manifest } from '@/lib/schemas/manifest';

import {
  PublishBranchCollisionError,
  PublishError,
  PublishNetworkError,
  PublishPermissionError,
  PublishRateLimitError,
  PublishValidationError,
  PublishVersionConflictError,
} from '@/lib/publish-errors';
import {
  buildAssetPublishRequest,
  DRY_RUN_PR_URL_MARKER,
  expectedBranchName,
  publishBundle,
  publishContribution,
} from '@/lib/publish-service';

import {
  API_BASE,
  apiErrorResponse,
  jsonResponse,
  makeTestApiClient,
  stubFetch,
  textResponse,
} from '../utils/api-stub';

const client = makeTestApiClient('tok');

function baseFiles() {
  return [{ content: '# Skill body', path: 'skill.md' }];
}

function baseManifest(): Manifest {
  return {
    author: 'octo-login',
    description: 'A helpful skill',
    entrypoint: 'skill.md',
    name: 'my-skill',
    tags: ['test'],
    tools: ['claude-code'],
    type: 'skill',
    version: '1.0.0',
  } as Manifest;
}

function publishedResponse(overrides: Record<string, unknown> = {}) {
  return jsonResponse(
    {
      branchName: 'asset/skill/my-skill/1.0.0',
      commitSha: 'abc123',
      prNumber: 42,
      prUrl: 'https://github.com/EmergentSoftware/agentic-toolkit-registry/pull/42',
      reviewers: ['jasonpaff'],
      warnings: [],
      ...overrides,
    },
    201,
  );
}

function planResponse(overrides: Record<string, unknown> = {}) {
  return jsonResponse({
    assetType: 'skill',
    branchName: 'asset/skill/my-skill/1.0.0',
    files: ['manifest.json', 'skill.md'],
    isUpdate: false,
    kind: 'asset',
    name: 'my-skill',
    prBody: '## New Asset: my-skill',
    prTitle: 'feat(registry): add skill my-skill@1.0.0',
    registryPath: 'assets/skills/my-skill/1.0.0/',
    reviewers: ['jasonpaff'],
    version: '1.0.0',
    warnings: ['No README.md'],
    ...overrides,
  });
}

function bodyOf(index = 0): PublishRequest {
  const call = calls()[index];
  if (!call) throw new Error(`no request #${index}`);
  return JSON.parse(call.body) as PublishRequest;
}

let recorded: ReturnType<typeof stubFetch> | undefined;
function calls() {
  if (!recorded) throw new Error('fetch not stubbed');
  return recorded.calls;
}

afterEach(() => {
  recorded = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('publishContribution', () => {
  it('POSTs the payload to /publish and returns the created PR', async () => {
    recorded = stubFetch(() => publishedResponse());
    const progress: string[] = [];

    const result = await publishContribution({
      client,
      files: baseFiles(),
      manifest: baseManifest(),
      onProgress: (event) => progress.push(event.step),
      readme: '# Hello',
    });

    expect(result).toEqual({
      branchName: 'asset/skill/my-skill/1.0.0',
      dryRun: false,
      prNumber: 42,
      prUrl: 'https://github.com/EmergentSoftware/agentic-toolkit-registry/pull/42',
      reviewers: ['jasonpaff'],
      warnings: [],
    });
    expect(progress).toEqual(['preparing-workspace', 'opening-pull-request']);

    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.method).toBe('POST');
    expect(calls()[0]!.url).toBe(`${API_BASE}/publish`);
    expect(calls()[0]!.headers.get('authorization')).toBe('Bearer tok');
    expect(calls()[0]!.headers.get('content-type')).toBe('application/json');

    const body = bodyOf();
    expect(body.kind).toBe('asset');
    expect(body.client).toBe('web');
    expect(body.manifest).toEqual(baseManifest());
    // manifest.json comes from `manifest`; README is appended as a file.
    expect(body.files).toEqual([
      { content: '# Skill body', encoding: 'utf8', path: 'skill.md' },
      { content: '# Hello\n', encoding: 'utf8', path: 'README.md' },
    ]);
  });

  it('omits README.md from files when the readme is blank', async () => {
    recorded = stubFetch(() => publishedResponse());

    await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '   ' });

    expect(bodyOf().files?.map((f) => f.path)).toEqual(['skill.md']);
  });

  it('drops uploaded manifest.json / README.md in favour of the wizard values', async () => {
    recorded = stubFetch(() => publishedResponse());

    await publishContribution({
      client,
      files: [
        { content: '{"stale":true}', path: 'manifest.json' },
        { content: '# stale readme', path: 'README.md' },
        { content: '# Skill body', path: 'SKILL.md' },
      ],
      manifest: baseManifest(),
      readme: '# fresh',
    });

    expect(bodyOf().files?.map((f) => f.path)).toEqual(['SKILL.md', 'README.md']);
    expect(bodyOf().files?.find((f) => f.path === 'README.md')?.content).toBe('# fresh\n');
  });

  it('strips a common wrapper folder added by browser folder uploads', async () => {
    recorded = stubFetch(() => publishedResponse());

    await publishContribution({
      client,
      files: [
        { content: '# Skill body', path: 'emergent-brand/SKILL.md' },
        { content: '# Guide', path: 'emergent-brand/references/guide.md' },
      ],
      manifest: { ...baseManifest(), name: 'emergent-brand-skill' } as Manifest,
      readme: '',
    });

    const paths = bodyOf().files?.map((f) => f.path);
    expect(paths).toEqual(['SKILL.md', 'references/guide.md']);
  });

  it('leaves flat file drops and divergent top-level directories unchanged', async () => {
    recorded = stubFetch(() => publishedResponse());

    await publishContribution({
      client,
      files: [
        { content: 'x', path: 'a/x.md' },
        { content: 'y', path: 'b/y.md' },
      ],
      manifest: baseManifest(),
      readme: '',
    });

    expect(bodyOf().files?.map((f) => f.path)).toEqual(['a/x.md', 'b/y.md']);
  });

  it('sends base64 entries verbatim with their encoding and utf8 entries as text', async () => {
    recorded = stubFetch(() => publishedResponse());
    const pngBase64 = 'iVBORw0KGgo=';

    await publishContribution({
      client,
      files: [
        { content: '# Skill body', encoding: 'utf8', path: 'SKILL.md' },
        { content: pngBase64, encoding: 'base64', path: 'assets/logo.png' },
      ],
      manifest: baseManifest(),
      readme: '',
    });

    expect(bodyOf().files).toEqual([
      { content: '# Skill body', encoding: 'utf8', path: 'SKILL.md' },
      { content: pngBase64, encoding: 'base64', path: 'assets/logo.png' },
    ]);
  });

  it('expands a files: "auto" manifest into the concrete uploaded list', () => {
    const request = buildAssetPublishRequest({
      files: [
        { content: 'a', path: 'skill.md' },
        { content: 'b', path: 'reference/notes.md' },
      ],
      manifest: { ...baseManifest(), files: 'auto' } as Manifest,
      readme: '',
    });

    expect((request.manifest as { files: unknown }).files).toEqual(['reference/notes.md']);
  });

  it('keeps the org inside the manifest and predicts the org-scoped branch', () => {
    const request = buildAssetPublishRequest({
      files: baseFiles(),
      manifest: { ...baseManifest(), org: 'acme' } as Manifest,
      readme: '',
    });

    expect((request.manifest as { org?: string }).org).toBe('acme');
    expect(expectedBranchName(request)).toBe('asset/skill/acme/my-skill/1.0.0');
  });

  it('dry-run mode POSTs to /publish/plan and returns the synthesized marker URL', async () => {
    recorded = stubFetch(() => planResponse());
    const progress: string[] = [];

    const result = await publishContribution({
      client,
      dryRun: true,
      files: baseFiles(),
      manifest: baseManifest(),
      onProgress: (event) => progress.push(event.step),
      readme: '',
    });

    expect(result).toEqual({
      branchName: 'asset/skill/my-skill/1.0.0',
      dryRun: true,
      prUrl: DRY_RUN_PR_URL_MARKER,
      reviewers: ['jasonpaff'],
      warnings: ['No README.md'],
    });
    expect(progress).toEqual(['preparing-workspace', 'uploading-files']);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.url).toBe(`${API_BASE}/publish/plan`);
    expect(bodyOf().kind).toBe('asset');
  });

  it('maps 409 branch_exists to PublishBranchCollisionError naming the branch', async () => {
    recorded = stubFetch(() => apiErrorResponse(409, 'branch_exists', 'Branch already exists'));

    const error = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(PublishBranchCollisionError);
    expect((error as PublishBranchCollisionError).branchName).toBe('asset/skill/my-skill/1.0.0');
  });

  it('maps 409 version_not_bumped / version_exists to PublishVersionConflictError with the API message', async () => {
    recorded = stubFetch(() => apiErrorResponse(409, 'version_not_bumped', '1.0.0 is not newer than 1.2.0'));

    const error = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(PublishVersionConflictError);
    expect((error as PublishVersionConflictError).code).toBe('version_not_bumped');
    expect((error as PublishError).userMessage).toBe('1.0.0 is not newer than 1.2.0');
  });

  it('maps 400 validation_failed / schema_invalid to PublishValidationError carrying details', async () => {
    const details = [
      { message: 'must match pattern ^[a-z]', path: '/manifest/name' },
      { message: 'entrypoint skill.md is not in files', path: null },
    ];
    recorded = stubFetch(() => apiErrorResponse(400, 'validation_failed', 'Validation failed', details));

    const error = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(PublishValidationError);
    expect((error as PublishValidationError).details).toEqual(details);
    expect((error as PublishError).userMessage).toBe('Validation failed');
  });

  it('maps 401 and non-member 403 to PublishPermissionError', async () => {
    recorded = stubFetch(() => apiErrorResponse(401, 'unauthorized', 'Bad token'));
    await expect(
      publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }),
    ).rejects.toBeInstanceOf(PublishPermissionError);

    recorded = stubFetch(() => apiErrorResponse(403, 'not_org_member', 'Not a member'));
    await expect(
      publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }),
    ).rejects.toBeInstanceOf(PublishPermissionError);
  });

  it('surfaces other 400s (e.g. reviewers_not_allowed) as a PublishError with the API message', async () => {
    recorded = stubFetch(() => apiErrorResponse(400, 'reviewers_not_allowed', 'Global targets cannot set reviewers'));

    const error = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(PublishError);
    expect(error).not.toBeInstanceOf(PublishValidationError);
    expect((error as PublishError).userMessage).toBe('Global targets cannot set reviewers');
  });

  it('maps 429 responses to PublishRateLimitError (after retries)', async () => {
    recorded = stubFetch(() => apiErrorResponse(429, 'rate_limited', 'Slow down'));

    await expect(
      publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }),
    ).rejects.toBeInstanceOf(PublishRateLimitError);
    expect(calls().length).toBeGreaterThan(1);
  });

  it('maps transport failures and 5xx responses to PublishNetworkError', async () => {
    recorded = stubFetch(() => {
      throw new TypeError('offline');
    });
    await expect(
      publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }),
    ).rejects.toBeInstanceOf(PublishNetworkError);

    recorded = stubFetch(() => textResponse('Bad Gateway', 502, 'text/plain'));
    const error = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(PublishNetworkError);
    expect((error as PublishNetworkError).status).toBe(502);
  });

  it('passes the reviewer warning through when the PR opened but reviewers failed', async () => {
    recorded = stubFetch(() => publishedResponse({ reviewers: [], reviewerWarning: 'Could not request reviewers' }));

    const result = await publishContribution({ client, files: baseFiles(), manifest: baseManifest(), readme: '' });

    expect(result.reviewerWarning).toBe('Could not request reviewers');
  });
});

function baseBundle(): Bundle {
  return {
    assets: [
      { name: 'distill-feature', type: 'skill' },
      { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
    ],
    author: 'octo-login',
    description: 'A structured feature workflow',
    name: 'feature-workflow',
    tags: ['workflow'],
    version: '1.0.0',
  };
}

describe('publishBundle', () => {
  it('POSTs bundle.json as the manifest with kind=bundle and client=web', async () => {
    recorded = stubFetch(() =>
      publishedResponse({
        branchName: 'bundle/feature-workflow/1.0.0',
        prUrl: 'https://github.com/EmergentSoftware/agentic-toolkit-registry/pull/7',
      }),
    );

    const result = await publishBundle({ bundle: baseBundle(), client, readme: '# Feature workflow' });

    expect(result.dryRun).toBe(false);
    expect(result.branchName).toBe('bundle/feature-workflow/1.0.0');
    expect(result.prUrl).toMatch(/pull\/7$/);

    const body = bodyOf();
    expect(body.kind).toBe('bundle');
    expect(body.client).toBe('web');
    expect(body.manifest).toEqual(baseBundle());
    expect(body.files).toEqual([{ content: '# Feature workflow\n', encoding: 'utf8', path: 'README.md' }]);
  });

  it('sends no files when the readme is blank', async () => {
    recorded = stubFetch(() => publishedResponse({ branchName: 'bundle/feature-workflow/1.0.0' }));

    await publishBundle({ bundle: baseBundle(), client, readme: '' });

    expect(bodyOf().files).toEqual([]);
  });

  it('keeps the org in bundle.json for org-scoped bundles and predicts the org branch on collision', async () => {
    recorded = stubFetch(() => apiErrorResponse(409, 'branch_exists', 'exists'));

    const error = await publishBundle({
      bundle: { ...baseBundle(), name: 'qa-bundle', org: 'cupay' },
      client,
      readme: '',
    }).catch((e) => e);

    expect((bodyOf().manifest as { org?: string }).org).toBe('cupay');
    expect(error).toBeInstanceOf(PublishBranchCollisionError);
    expect((error as PublishBranchCollisionError).branchName).toBe('bundle/cupay/qa-bundle/1.0.0');
  });

  it('dry-run mode POSTs to /publish/plan and returns the synthesized marker URL', async () => {
    recorded = stubFetch(() =>
      planResponse({ assetType: null, branchName: 'bundle/feature-workflow/1.0.0', kind: 'bundle', warnings: [] }),
    );

    const result = await publishBundle({ bundle: baseBundle(), client, dryRun: true, readme: '' });

    expect(result.dryRun).toBe(true);
    expect(result.prUrl).toBe(DRY_RUN_PR_URL_MARKER);
    expect(result.branchName).toBe('bundle/feature-workflow/1.0.0');
    expect(calls()[0]!.url).toBe(`${API_BASE}/publish/plan`);
  });
});
