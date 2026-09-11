/* eslint-disable perfectionist/sort-modules */
/** Error classes raised by the contribution publish pipeline. Base class PublishError must precede subclasses. */

import { type ApiErrorDetail, ApiRequestError, NOT_MEMBER_CODES } from './api-client';

/** Base class for publish pipeline errors. Every subclass carries a user-facing `userMessage`. */
export class PublishError extends Error {
  readonly userMessage: string;

  constructor(message: string, userMessage: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PublishError';
    this.userMessage = userMessage;
  }
}

/** The ATK API (or GitHub behind it) is rate limiting the caller. */
export class PublishRateLimitError extends PublishError {
  constructor(params: { cause?: unknown }) {
    super(
      'Rate limited while publishing contribution',
      'The registry is rate-limiting requests right now. Please wait a minute and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishRateLimitError';
  }
}

/** Caller is signed out, not an org member, or otherwise not allowed to publish. */
export class PublishPermissionError extends PublishError {
  constructor(params: { cause?: unknown; detail?: string }) {
    super(
      `Insufficient permissions to publish: ${params.detail ?? 'unknown'}`,
      'Your GitHub session does not allow publishing. Sign out and sign back in, making sure you are an active member of the EmergentSoftware organization.',
      { cause: params.cause },
    );
    this.name = 'PublishPermissionError';
  }
}

/** The publish branch already exists on the registry (a prior attempt, or an open PR). */
export class PublishBranchCollisionError extends PublishError {
  readonly branchName: string;

  constructor(params: { branchName: string; cause?: unknown }) {
    super(
      `Registry branch already exists: ${params.branchName}`,
      'A branch for this contribution already exists in the registry. A pull request may already be open for this version — please bump the version number or check GitHub for an existing PR.',
      { cause: params.cause },
    );
    this.name = 'PublishBranchCollisionError';
    this.branchName = params.branchName;
  }
}

/** The version is not newer than what the registry already has (`version_not_bumped` / `version_exists`). */
export class PublishVersionConflictError extends PublishError {
  readonly code: string;

  constructor(params: { cause?: unknown; code: string; detail?: string }) {
    super(
      `Version conflict (${params.code}): ${params.detail ?? 'unknown'}`,
      params.detail ?? 'The registry already has this version. Bump the version number and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishVersionConflictError';
    this.code = params.code;
  }
}

/** The API rejected the payload (`validation_failed` / `schema_invalid`); `details` lists each problem. */
export class PublishValidationError extends PublishError {
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(params: { cause?: unknown; code: string; detail?: string; details?: ApiErrorDetail[] }) {
    super(
      `Publish payload rejected (${params.code}): ${params.detail ?? 'unknown'}`,
      params.detail ?? 'The registry rejected this contribution. Review the issues listed and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishValidationError';
    this.code = params.code;
    this.details = params.details ?? [];
  }
}

/** Transport-layer failure or a 5xx from the ATK API. */
export class PublishNetworkError extends PublishError {
  readonly status?: number;

  constructor(params: { cause?: unknown; status?: number }) {
    super(
      `Network failure while publishing${params.status !== undefined ? ` (HTTP ${params.status})` : ''}`,
      'We could not reach the registry. Check your internet connection and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishNetworkError';
    this.status = params.status;
  }
}

/**
 * Translate an {@link ApiRequestError} (or any other failure) from the ATK
 * API's publish endpoints into a typed {@link PublishError}.
 */
export function mapApiError(error: unknown, context: { branchName?: string } = {}): PublishError {
  if (error instanceof PublishError) return error;

  if (!(error instanceof ApiRequestError)) {
    return new PublishNetworkError({ cause: error });
  }

  const { code, details, message, status } = error;

  if (status === 0) {
    return new PublishNetworkError({ cause: error });
  }

  if (status === 401 || (status === 403 && NOT_MEMBER_CODES.has(code))) {
    return new PublishPermissionError({ cause: error, detail: message });
  }

  if (status === 429) {
    return new PublishRateLimitError({ cause: error });
  }

  if (status === 409 && code === 'branch_exists') {
    return new PublishBranchCollisionError({ branchName: context.branchName ?? 'unknown', cause: error });
  }

  if (status === 409 && (code === 'version_not_bumped' || code === 'version_exists')) {
    return new PublishVersionConflictError({ cause: error, code, detail: message });
  }

  if (status === 400 && (code === 'validation_failed' || code === 'schema_invalid')) {
    return new PublishValidationError({ cause: error, code, detail: message, details });
  }

  if (status >= 500) {
    return new PublishNetworkError({ cause: error, status });
  }

  // 400 (invalid_reviewer, reviewers_not_allowed, ...), other 403s, and anything
  // else: the API message is the best text we have.
  return new PublishError(`Publish rejected (${code}): ${message}`, message, { cause: error });
}
