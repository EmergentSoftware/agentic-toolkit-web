/* eslint-disable perfectionist/sort-modules */
import type { Octokit } from '@octokit/rest';

import type { Manifest } from './schemas/manifest';

import { callWithRetry, type RetryOptions } from './fetch-retry';
import { mapOctokitError, PublishBranchCollisionError, PublishError } from './publish-errors';
import { DEFAULT_OWNER, DEFAULT_REPO } from './registry-client';

export interface PublishFileEntry {
  content: string;
  path: string;
}

export type PublishProgressStep =
  | 'opening-pull-request'
  | 'preparing-workspace'
  | 'uploading-files';

export interface PublishProgressEvent {
  /** Non-technical copy suitable to display directly to the user. */
  message: string;
  step: PublishProgressStep;
}

export interface PublishContributionOptions {
  dryRun?: boolean;
  files: PublishFileEntry[];
  manifest: Manifest;
  octokit: Octokit;
  onProgress?: (event: PublishProgressEvent) => void;
  readme: string;
  retry?: RetryOptions;
  signal?: AbortSignal;
}

export interface PublishResult {
  branchName: string;
  dryRun: boolean;
  prUrl: string;
}

const PROGRESS_COPY: Record<PublishProgressStep, string> = {
  'opening-pull-request': 'Opening your pull request',
  'preparing-workspace': 'Preparing your workspace',
  'uploading-files': 'Uploading your files',
};

/** Synthesized PR URL marker returned when the service runs in dry-run mode. */
export const DRY_RUN_PR_URL_MARKER = 'https://dry-run.local/atk/contribute/preview';

/**
 * Publish a prepared contribution by pushing a branch directly to
 * EmergentSoftware/agentic-toolkit-registry via the Git Data API and opening a
 * pull request against the default branch. This mirrors the CLI's `atk publish`
 * flow and requires the authenticated user to have push access to the registry.
 *
 * When `dryRun` is true every step runs up to — but skipping — the final PR
 * creation, and the result contains the synthesized DRY_RUN_PR_URL_MARKER so
 * QA can exercise the full flow without creating a real PR.
 */
export async function publishContribution(options: PublishContributionOptions): Promise<PublishResult> {
  const { dryRun = false, files, manifest, octokit, onProgress, readme, retry, signal } = options;

  const emit = (step: PublishProgressStep) => {
    onProgress?.({ message: PROGRESS_COPY[step], step });
  };

  try {
    emit('preparing-workspace');

    const upstreamRepo = await getRepo(octokit, retry, signal);
    const defaultBranch = upstreamRepo.default_branch;

    const upstreamRef = await getRef({
      octokit,
      ref: `heads/${defaultBranch}`,
      retry,
      signal,
    });
    const baseSha = upstreamRef.object.sha;

    const plan = buildPublishPlan({ files, manifest, readme });

    await ensureBranchAvailable({
      branchName: plan.branchName,
      octokit,
      retry,
      signal,
    });

    emit('uploading-files');

    const blobs = await Promise.all(
      plan.files.map(async (file) => {
        const response = await callWithRetry(
          () =>
            octokit.rest.git.createBlob({
              content: toBase64(file.content),
              encoding: 'base64',
              owner: DEFAULT_OWNER,
              repo: DEFAULT_REPO,
              ...(signal ? { request: { signal } } : {}),
            }),
          retry,
          signal,
        );
        return { path: `${plan.registryPath}${file.path}`, sha: response.data.sha };
      }),
    ).catch((error: unknown) => {
      throw wrapError(error);
    });

    const tree = await callWithRetry(
      () =>
        octokit.rest.git.createTree({
          base_tree: baseSha,
          owner: DEFAULT_OWNER,
          repo: DEFAULT_REPO,
          tree: blobs.map((blob) => ({
            mode: '100644',
            path: blob.path,
            sha: blob.sha,
            type: 'blob',
          })),
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    ).catch((error: unknown) => {
      throw wrapError(error);
    });

    const commit = await callWithRetry(
      () =>
        octokit.rest.git.createCommit({
          message: plan.prTitle,
          owner: DEFAULT_OWNER,
          parents: [baseSha],
          repo: DEFAULT_REPO,
          tree: tree.data.sha,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    ).catch((error: unknown) => {
      throw wrapError(error);
    });

    await callWithRetry(
      () =>
        octokit.rest.git.createRef({
          owner: DEFAULT_OWNER,
          ref: `refs/heads/${plan.branchName}`,
          repo: DEFAULT_REPO,
          sha: commit.data.sha,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    ).catch((error: unknown) => {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 422 && /already exists/i.test(message)) {
        throw new PublishBranchCollisionError({ branchName: plan.branchName, cause: error });
      }
      throw wrapError(error);
    });

    emit('opening-pull-request');

    if (dryRun) {
      return {
        branchName: plan.branchName,
        dryRun: true,
        prUrl: DRY_RUN_PR_URL_MARKER,
      };
    }

    const pr = await callWithRetry(
      () =>
        octokit.rest.pulls.create({
          base: defaultBranch,
          body: plan.prBody,
          head: plan.branchName,
          owner: DEFAULT_OWNER,
          repo: DEFAULT_REPO,
          title: plan.prTitle,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    ).catch((error: unknown) => {
      throw wrapError(error);
    });

    return {
      branchName: plan.branchName,
      dryRun: false,
      prUrl: pr.data.html_url,
    };
  } catch (error) {
    if (error instanceof PublishError) throw error;
    throw wrapError(error);
  }
}

interface PublishPlan {
  branchName: string;
  files: PublishFileEntry[];
  prBody: string;
  prTitle: string;
  registryPath: string;
}

function buildPublishPlan(params: {
  files: PublishFileEntry[];
  manifest: Manifest;
  readme: string;
}): PublishPlan {
  const { files, manifest, readme } = params;
  const { name, type: assetType, version } = manifest;
  const org = manifest.org;

  const branchName = org
    ? `asset/${assetType}/${org}/${name}/${version}`
    : `asset/${assetType}/${name}/${version}`;

  const registryPath = org
    ? `assets/${assetType}s/@${org}/${name}/${version}/`
    : `assets/${assetType}s/${name}/${version}/`;

  const filtered = files.filter((file) => {
    const base = basename(file.path).toLowerCase();
    if (base === 'manifest.json') return false;
    if (base === 'readme.md') return false;
    return true;
  });

  const payloadFiles: PublishFileEntry[] = [
    { content: `${JSON.stringify(manifest, null, 2)}\n`, path: 'manifest.json' },
    ...filtered,
  ];
  if (readme.trim().length > 0) {
    payloadFiles.push({ content: readme.endsWith('\n') ? readme : `${readme}\n`, path: 'README.md' });
  }

  const listedFiles = payloadFiles.map((file) => file.path);
  const prTitle = `feat(registry): add ${assetType} ${name}@${version}`;
  const prBody = generatePrBody({ listedFiles, manifest });

  return { branchName, files: payloadFiles, prBody, prTitle, registryPath };
}

function generatePrBody(params: { listedFiles: string[]; manifest: Manifest }): string {
  const { listedFiles, manifest } = params;
  const lines: string[] = [`## New Asset: ${manifest.name}`, ''];
  lines.push(`**Type:** ${manifest.type}`);
  lines.push(`**Version:** ${manifest.version}`);
  lines.push(`**Author:** ${manifest.author}`);
  lines.push('');
  lines.push('### Description');
  lines.push('');
  lines.push(manifest.description);
  lines.push('');
  lines.push('### Tool Compatibility');
  lines.push('');
  if (manifest.tools && manifest.tools.length > 0) {
    for (const tool of manifest.tools) lines.push(`- ${tool.tool}`);
  } else {
    lines.push('none');
  }
  lines.push('');
  lines.push('### Tags');
  lines.push('');
  lines.push(manifest.tags && manifest.tags.length > 0 ? manifest.tags.join(', ') : 'none');
  lines.push('');
  lines.push('### Dependencies');
  lines.push('');
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    for (const dep of manifest.dependencies) {
      lines.push(`- ${dep.type}:${dep.name}${dep.version ? `@${dep.version}` : ''}`);
    }
  } else {
    lines.push('none');
  }
  lines.push('');
  lines.push('### Files');
  lines.push('');
  for (const file of listedFiles) lines.push(`- ${file}`);
  lines.push('');
  lines.push('### Checklist');
  lines.push('');
  lines.push('- [ ] Manifest schema is valid');
  lines.push('- [ ] All referenced files are present');
  lines.push('- [ ] Asset has been tested locally');
  lines.push('- [ ] README.md is included');
  lines.push('');
  lines.push('---');
  lines.push('*Published via the ATK contribute web flow*');
  return lines.join('\n');
}

async function getRepo(
  octokit: Octokit,
  retry: RetryOptions | undefined,
  signal: AbortSignal | undefined,
): Promise<{ default_branch: string }> {
  try {
    const response = await callWithRetry(
      () =>
        octokit.rest.repos.get({
          owner: DEFAULT_OWNER,
          repo: DEFAULT_REPO,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    );
    return { default_branch: response.data.default_branch };
  } catch (error) {
    throw wrapError(error);
  }
}

async function getRef(params: {
  octokit: Octokit;
  ref: string;
  retry: RetryOptions | undefined;
  signal: AbortSignal | undefined;
}): Promise<{ object: { sha: string } }> {
  const { octokit, ref, retry, signal } = params;
  try {
    const response = await callWithRetry(
      () =>
        octokit.rest.git.getRef({
          owner: DEFAULT_OWNER,
          ref,
          repo: DEFAULT_REPO,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    );
    return { object: { sha: response.data.object.sha } };
  } catch (error) {
    throw wrapError(error);
  }
}

async function ensureBranchAvailable(params: {
  branchName: string;
  octokit: Octokit;
  retry: RetryOptions | undefined;
  signal: AbortSignal | undefined;
}): Promise<void> {
  const { branchName, octokit, retry, signal } = params;
  try {
    await callWithRetry(
      () =>
        octokit.rest.git.getRef({
          owner: DEFAULT_OWNER,
          ref: `heads/${branchName}`,
          repo: DEFAULT_REPO,
          ...(signal ? { request: { signal } } : {}),
        }),
      retry,
      signal,
    );
    // If we reached this point the ref exists — collision.
    throw new PublishBranchCollisionError({ branchName });
  } catch (error) {
    if (error instanceof PublishBranchCollisionError) throw error;
    const status = (error as { status?: number }).status;
    if (status === 404) return;
    throw wrapError(error);
  }
}

function wrapError(error: unknown): PublishError {
  return mapOctokitError(error);
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

function toBase64(content: string): string {
  if (typeof btoa === 'function') {
    // Encode UTF-8 safely: convert to bytes first to handle non-ASCII characters.
    const bytes = new TextEncoder().encode(content);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  // Node fallback used in tests.
  return Buffer.from(content, 'utf-8').toString('base64');
}
