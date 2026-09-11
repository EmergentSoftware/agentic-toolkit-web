/* eslint-disable perfectionist/sort-modules */
import type { PublishFile, PublishRequest } from './api/types.gen';
import type { FileEncoding } from './file-entry';
import type { Bundle } from './schemas/bundle';
import type { Manifest } from './schemas/manifest';

import { publish as apiPublish, publishPlan as apiPublishPlan } from './api';
import { type ApiClient, unwrap } from './api-client';
import { basename, stripCommonRoot } from './file-entry';
import { mapApiError, PublishError } from './publish-errors';

export interface PublishFileEntry {
  content: string;
  /** `base64` content is sent verbatim; absent/`utf8` is sent as text. */
  encoding?: FileEncoding;
  path: string;
}

export type PublishProgressStep = 'opening-pull-request' | 'preparing-workspace' | 'uploading-files';

export interface PublishProgressEvent {
  /** Non-technical copy suitable to display directly to the user. */
  message: string;
  step: PublishProgressStep;
}

export interface PublishContributionOptions {
  client: ApiClient;
  dryRun?: boolean;
  files: PublishFileEntry[];
  manifest: Manifest;
  onProgress?: (event: PublishProgressEvent) => void;
  readme: string;
  signal?: AbortSignal;
}

export interface PublishBundleOptions {
  bundle: Bundle;
  client: ApiClient;
  dryRun?: boolean;
  onProgress?: (event: PublishProgressEvent) => void;
  readme: string;
  signal?: AbortSignal;
}

export interface PublishResult {
  branchName: string;
  dryRun: boolean;
  prNumber?: number;
  prUrl: string;
  reviewers?: string[];
  /** Set when the API opened the PR but could not request reviewers. */
  reviewerWarning?: string;
  /** Non-blocking advice from the API's validation (missing README, tags, unlisted files). */
  warnings: string[];
}

const PROGRESS_COPY: Record<PublishProgressStep, string> = {
  'opening-pull-request': 'Uploading your files and opening your pull request',
  'preparing-workspace': 'Preparing your contribution',
  'uploading-files': 'Validating your contribution with the registry',
};

/** Synthesized PR URL marker returned when the service runs in dry-run mode. */
export const DRY_RUN_PR_URL_MARKER = 'https://dry-run.local/atk/contribute/preview';

/**
 * Publish a prepared contribution through the ATK API, which validates the
 * payload and opens a pull request against the registry with the signed-in
 * user's own token (so the PR is authored by them). This mirrors the CLI's
 * `atk publish` flow.
 *
 * When `dryRun` is true the payload is sent to `POST /publish/plan` instead:
 * the API validates it and returns the plan without touching GitHub, and the
 * result carries the synthesized DRY_RUN_PR_URL_MARKER so QA can exercise the
 * full flow without creating a real PR.
 */
export async function publishContribution(options: PublishContributionOptions): Promise<PublishResult> {
  const { client, dryRun = false, files, manifest, onProgress, readme, signal } = options;
  const emit = makeEmitter(onProgress);
  emit('preparing-workspace');
  const request = buildAssetPublishRequest({ files, manifest, readme });
  return await executePublish(request, { client, dryRun, emit, signal });
}

/**
 * Publish a bundle (`bundle.json` plus an optional README) through the ATK
 * API. A bundle is metadata-only — it references already-published assets —
 * so this is a thin sibling of {@link publishContribution}. Org-scoped
 * bundles carry their `org` inside `bundle.json`; the API derives the
 * `bundles/@{org}/{name}/{version}/` path and branch from it.
 */
export async function publishBundle(options: PublishBundleOptions): Promise<PublishResult> {
  const { bundle, client, dryRun = false, onProgress, readme, signal } = options;
  const emit = makeEmitter(onProgress);
  emit('preparing-workspace');
  const request = buildBundlePublishRequest({ bundle, readme });
  return await executePublish(request, { client, dryRun, emit, signal });
}

/**
 * Build the `POST /publish` payload for an asset: the manifest object plus
 * every other file (entrypoint, listed files, README). A common wrapper
 * folder from a browser folder upload is stripped, and any uploaded
 * `manifest.json` / `README.md` is dropped in favour of the wizard's own.
 */
export function buildAssetPublishRequest(params: {
  files: PublishFileEntry[];
  manifest: Manifest;
  readme: string;
}): PublishRequest {
  const { files, manifest, readme } = params;

  const normalized = stripCommonRoot(files);
  const filtered = normalized.filter((file) => {
    const base = basename(file.path).toLowerCase();
    return base !== 'manifest.json' && base !== 'readme.md';
  });

  // The registry schema only accepts a concrete `files` array; the "auto"
  // sentinel is CLI-side sugar and must never reach the API.
  const concreteManifest: Manifest =
    manifest.files === 'auto'
      ? { ...manifest, files: filtered.map((file) => file.path).filter((path) => path !== manifest.entrypoint) }
      : manifest;

  const payloadFiles: PublishFile[] = filtered.map(toPublishFile);
  if (readme.trim().length > 0) {
    payloadFiles.push({ content: readme.endsWith('\n') ? readme : `${readme}\n`, encoding: 'utf8', path: 'README.md' });
  }

  return {
    client: 'web',
    files: payloadFiles,
    kind: 'asset',
    manifest: concreteManifest as Record<string, unknown>,
  };
}

/** Build the `POST /publish` payload for a bundle: `bundle.json` plus an optional README. */
export function buildBundlePublishRequest(params: { bundle: Bundle; readme: string }): PublishRequest {
  const { bundle, readme } = params;
  const payloadFiles: PublishFile[] = [];
  if (readme.trim().length > 0) {
    payloadFiles.push({ content: readme.endsWith('\n') ? readme : `${readme}\n`, encoding: 'utf8', path: 'README.md' });
  }
  return {
    client: 'web',
    files: payloadFiles,
    kind: 'bundle',
    manifest: bundle as Record<string, unknown>,
  };
}

/**
 * The branch the API will push for this request, computed locally only so a
 * `409 branch_exists` can name it in the error. Mirrors the CLI convention:
 * `asset/{type}/[{org}/]{name}/{version}` and `bundle/[{org}/]{name}/{version}`.
 */
export function expectedBranchName(request: PublishRequest): string {
  const manifest = request.manifest as { name?: string; org?: string; type?: string; version?: string };
  const scope = manifest.org ? `${manifest.org}/` : '';
  if (request.kind === 'bundle') return `bundle/${scope}${manifest.name}/${manifest.version}`;
  return `asset/${manifest.type}/${scope}${manifest.name}/${manifest.version}`;
}

interface ExecutePublishContext {
  client: ApiClient;
  dryRun: boolean;
  emit: (step: PublishProgressStep) => void;
  signal?: AbortSignal;
}

async function executePublish(request: PublishRequest, context: ExecutePublishContext): Promise<PublishResult> {
  const { client, dryRun, emit, signal } = context;
  const branchName = expectedBranchName(request);

  try {
    if (dryRun) {
      emit('uploading-files');
      const plan = unwrap(await apiPublishPlan({ body: request, client, signal }), 'the publish plan');
      return {
        branchName: plan.branchName || branchName,
        dryRun: true,
        prUrl: DRY_RUN_PR_URL_MARKER,
        reviewers: plan.reviewers,
        warnings: plan.warnings ?? [],
      };
    }

    emit('opening-pull-request');
    const published = unwrap(await apiPublish({ body: request, client, signal }), 'the publish request');
    return {
      branchName: published.branchName || branchName,
      dryRun: false,
      prNumber: published.prNumber,
      prUrl: published.prUrl,
      ...(published.reviewerWarning ? { reviewerWarning: published.reviewerWarning } : {}),
      reviewers: published.reviewers,
      warnings: published.warnings ?? [],
    };
  } catch (error) {
    if (error instanceof PublishError) throw error;
    throw mapApiError(error, { branchName });
  }
}

function makeEmitter(onProgress?: (event: PublishProgressEvent) => void) {
  return (step: PublishProgressStep) => {
    onProgress?.({ message: PROGRESS_COPY[step], step });
  };
}

function toPublishFile(file: PublishFileEntry): PublishFile {
  return { content: file.content, encoding: file.encoding === 'base64' ? 'base64' : 'utf8', path: file.path };
}
