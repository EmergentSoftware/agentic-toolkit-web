import type { Octokit } from '@octokit/rest';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PublishBranchCollisionError,
  PublishDefaultBranchChangedError,
  PublishNetworkError,
  PublishPermissionError,
  PublishRateLimitError,
} from '@/lib/publish-errors';
import { DRY_RUN_PR_URL_MARKER, publishContribution } from '@/lib/publish-service';
import type { Manifest } from '@/lib/schemas/manifest';

const fastRetry = { baseDelayMs: 1, jitter: false, maxDelayMs: 5, maxRetries: 0 } as const;

function httpError(status: number, message = `HTTP ${status}`, extra: Record<string, unknown> = {}): Error & {
  status: number;
} {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  Object.assign(err, extra);
  return err;
}

type Handler = (input: unknown) => Promise<unknown> | unknown;

interface OctokitQueues {
  createBlob?: Handler[];
  createCommit?: Handler[];
  createFork?: Handler[];
  createRef?: Handler[];
  createTree?: Handler[];
  getRef?: Handler[];
  mergeUpstream?: Handler[];
  pullsCreate?: Handler[];
  reposGet?: Handler[];
}

interface FakeOctokitResult {
  octokit: Octokit;
  spies: Record<keyof OctokitQueues, ReturnType<typeof vi.fn>>;
}

function queue(items: Handler[] | undefined): ReturnType<typeof vi.fn> {
  const pending = items ?? [];
  return vi.fn(async (args: unknown) => {
    const next = pending.shift();
    if (!next) throw new Error('fakeOctokit queue exhausted');
    const result = await next(args);
    return result;
  });
}

function makeFakeOctokit(queues: OctokitQueues): FakeOctokitResult {
  const spies = {
    createBlob: queue(queues.createBlob),
    createCommit: queue(queues.createCommit),
    createFork: queue(queues.createFork),
    createRef: queue(queues.createRef),
    createTree: queue(queues.createTree),
    getRef: queue(queues.getRef),
    mergeUpstream: queue(queues.mergeUpstream),
    pullsCreate: queue(queues.pullsCreate),
    reposGet: queue(queues.reposGet),
  } as Record<keyof OctokitQueues, ReturnType<typeof vi.fn>>;

  const octokit = {
    rest: {
      git: {
        createBlob: spies.createBlob,
        createCommit: spies.createCommit,
        createRef: spies.createRef,
        createTree: spies.createTree,
        getRef: spies.getRef,
      },
      pulls: { create: spies.pullsCreate },
      repos: {
        createFork: spies.createFork,
        get: spies.reposGet,
        mergeUpstream: spies.mergeUpstream,
      },
    },
  } as unknown as Octokit;

  return { octokit, spies };
}

function baseManifest(): Manifest {
  return {
    author: 'octo-login',
    description: 'A helpful skill',
    entrypoint: 'skill.md',
    name: 'my-skill',
    tags: ['test'],
    tools: [{ tool: 'claude-code' }],
    type: 'skill',
    version: '1.0.0',
  } as Manifest;
}

function baseFiles() {
  return [{ content: '# Skill body', path: 'skill.md' }];
}

function happyPathQueues(): OctokitQueues {
  return {
    createBlob: [() => ({ data: { sha: 'blob-1' } }), () => ({ data: { sha: 'blob-2' } })],
    createCommit: [() => ({ data: { sha: 'commit-sha' } })],
    createRef: [() => ({ data: {} })],
    createTree: [() => ({ data: { sha: 'tree-sha' } })],
    getRef: [
      // upstream HEAD
      () => ({ data: { object: { sha: 'base-sha' } } }),
      // collision check for branch (404 = available)
      () => {
        throw httpError(404, 'not found');
      },
    ],
    mergeUpstream: [() => ({ data: {} })],
    pullsCreate: [
      () => ({ data: { html_url: 'https://github.com/EmergentSoftware/agentic-toolkit-registry/pull/42' } }),
    ],
    reposGet: [
      () => ({ data: { default_branch: 'main' } }),
      () => ({ data: { default_branch: 'main' } }),
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('publishContribution', () => {
  it('walks the full happy path and returns the created PR URL', async () => {
    const { octokit, spies } = makeFakeOctokit(happyPathQueues());
    const progress: string[] = [];

    const result = await publishContribution({
      files: baseFiles(),
      manifest: baseManifest(),
      octokit,
      onProgress: (event) => progress.push(event.step),
      readme: '# Hello',
      retry: fastRetry,
      user: { login: 'octo-login' },
    });

    expect(result.prUrl).toMatch(/pull\/42$/);
    expect(result.dryRun).toBe(false);
    expect(result.branchName).toBe('asset/skill/my-skill/1.0.0');
    expect(progress).toEqual(['preparing-workspace', 'uploading-files', 'opening-pull-request']);

    // 2 blobs: manifest.json + skill.md (README also — 3 blobs)
    expect(spies.createBlob).toHaveBeenCalledTimes(3);
    expect(spies.createTree).toHaveBeenCalledTimes(1);
    expect(spies.createCommit).toHaveBeenCalledTimes(1);
    expect(spies.createRef).toHaveBeenCalledTimes(1);
    expect(spies.pullsCreate).toHaveBeenCalledTimes(1);

    expect(spies.pullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        base: 'main',
        head: 'octo-login:asset/skill/my-skill/1.0.0',
        owner: 'EmergentSoftware',
        repo: 'agentic-toolkit-registry',
        title: 'feat(registry): add skill my-skill@1.0.0',
      }),
    );
  });

  it('creates the fork when it does not yet exist', async () => {
    const queues: OctokitQueues = {
      ...happyPathQueues(),
      createFork: [() => ({ data: {} })],
      reposGet: [
        // upstream
        () => ({ data: { default_branch: 'main' } }),
        // fork lookup → 404
        () => {
          throw httpError(404);
        },
        // first poll → 404
        () => {
          throw httpError(404);
        },
        // second poll → ready
        () => ({ data: { default_branch: 'main' } }),
      ],
    };
    const { octokit, spies } = makeFakeOctokit(queues);

    const result = await publishContribution({
      files: baseFiles(),
      forkPollDelayMs: 1,
      manifest: baseManifest(),
      octokit,
      readme: '',
      retry: fastRetry,
      user: { login: 'octo-login' },
    });

    expect(result.prUrl).toMatch(/pull\/42$/);
    expect(spies.createFork).toHaveBeenCalledTimes(1);
    expect(spies.reposGet).toHaveBeenCalledTimes(4);
  });

  it('calls mergeUpstream to sync a stale fork', async () => {
    const { octokit, spies } = makeFakeOctokit(happyPathQueues());

    await publishContribution({
      files: baseFiles(),
      manifest: baseManifest(),
      octokit,
      readme: '',
      retry: fastRetry,
      user: { login: 'octo-login' },
    });

    expect(spies.mergeUpstream).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'main',
        owner: 'octo-login',
        repo: 'agentic-toolkit-registry',
      }),
    );
  });

  it('throws PublishBranchCollisionError when the fork branch already exists', async () => {
    const queues: OctokitQueues = {
      ...happyPathQueues(),
      getRef: [
        // upstream HEAD
        () => ({ data: { object: { sha: 'base-sha' } } }),
        // collision check — ref EXISTS
        () => ({ data: { object: { sha: 'existing' } } }),
      ],
    };
    const { octokit } = makeFakeOctokit(queues);

    await expect(
      publishContribution({
        files: baseFiles(),
        manifest: baseManifest(),
        octokit,
        readme: '',
        retry: fastRetry,
        user: { login: 'octo-login' },
      }),
    ).rejects.toBeInstanceOf(PublishBranchCollisionError);
  });

  it('maps 429 responses to PublishRateLimitError', async () => {
    const queues: OctokitQueues = {
      reposGet: [
        () => {
          throw httpError(429, 'too many requests');
        },
      ],
    };
    const { octokit } = makeFakeOctokit(queues);

    await expect(
      publishContribution({
        files: baseFiles(),
        manifest: baseManifest(),
        octokit,
        readme: '',
        retry: fastRetry,
        user: { login: 'octo-login' },
      }),
    ).rejects.toBeInstanceOf(PublishRateLimitError);
  });

  it('maps 403 responses to PublishPermissionError', async () => {
    const queues: OctokitQueues = {
      reposGet: [
        () => {
          throw httpError(403, 'forbidden');
        },
      ],
    };
    const { octokit } = makeFakeOctokit(queues);

    await expect(
      publishContribution({
        files: baseFiles(),
        manifest: baseManifest(),
        octokit,
        readme: '',
        retry: fastRetry,
        user: { login: 'octo-login' },
      }),
    ).rejects.toBeInstanceOf(PublishPermissionError);
  });

  it('throws PublishDefaultBranchChangedError when fork default_branch drifts', async () => {
    const queues: OctokitQueues = {
      ...happyPathQueues(),
      reposGet: [
        () => ({ data: { default_branch: 'main' } }),
        () => ({ data: { default_branch: 'trunk' } }),
      ],
    };
    const { octokit } = makeFakeOctokit(queues);

    await expect(
      publishContribution({
        files: baseFiles(),
        manifest: baseManifest(),
        octokit,
        readme: '',
        retry: fastRetry,
        user: { login: 'octo-login' },
      }),
    ).rejects.toBeInstanceOf(PublishDefaultBranchChangedError);
  });

  it('maps transport failures to PublishNetworkError', async () => {
    const queues: OctokitQueues = {
      reposGet: [
        () => {
          throw new TypeError('offline');
        },
      ],
    };
    const { octokit } = makeFakeOctokit(queues);

    await expect(
      publishContribution({
        files: baseFiles(),
        manifest: baseManifest(),
        octokit,
        readme: '',
        retry: fastRetry,
        user: { login: 'octo-login' },
      }),
    ).rejects.toBeInstanceOf(PublishNetworkError);
  });

  it('dry-run mode skips pulls.create and returns the synthesized marker URL', async () => {
    const queues = happyPathQueues();
    queues.pullsCreate = []; // must never be called
    const { octokit, spies } = makeFakeOctokit(queues);

    const result = await publishContribution({
      dryRun: true,
      files: baseFiles(),
      manifest: baseManifest(),
      octokit,
      readme: '',
      retry: fastRetry,
      user: { login: 'octo-login' },
    });

    expect(result.dryRun).toBe(true);
    expect(result.prUrl).toBe(DRY_RUN_PR_URL_MARKER);
    expect(spies.pullsCreate).not.toHaveBeenCalled();
    // The branch ref should still have been created so QA can verify the commit.
    expect(spies.createRef).toHaveBeenCalledTimes(1);
  });

  it('prefixes committed files with the registry path including @org scope', async () => {
    const queues = happyPathQueues();
    const treeSpy = vi.fn(() => ({ data: { sha: 'tree-sha' } }));
    queues.createTree = [treeSpy as Handler];
    const { octokit } = makeFakeOctokit(queues);

    await publishContribution({
      files: baseFiles(),
      manifest: { ...baseManifest(), org: 'acme' } as Manifest,
      octokit,
      readme: '',
      retry: fastRetry,
      user: { login: 'octo-login' },
    });

    expect(treeSpy).toHaveBeenCalledTimes(1);
    const treeArgs = treeSpy.mock.calls[0]![0] as { tree: Array<{ path: string }> };
    const paths = treeArgs.tree.map((entry) => entry.path);
    expect(paths).toContain('assets/skills/@acme/my-skill/1.0.0/manifest.json');
    expect(paths).toContain('assets/skills/@acme/my-skill/1.0.0/skill.md');
  });
});
