/* eslint-disable perfectionist/sort-modules */
/** Error classes raised by the contribution publish pipeline. Base class PublishError must precede subclasses. */

/** Base class for publish pipeline errors. Every subclass carries a user-facing `userMessage`. */
export class PublishError extends Error {
  readonly userMessage: string;

  constructor(message: string, userMessage: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PublishError';
    this.userMessage = userMessage;
  }
}

/** GitHub rate limit exceeded (primary or secondary). */
export class PublishRateLimitError extends PublishError {
  readonly retryAfterSeconds?: number;

  constructor(params: { cause?: unknown; retryAfterSeconds?: number }) {
    super(
      'GitHub rate limit exceeded while publishing contribution',
      params.retryAfterSeconds
        ? `GitHub is rate-limiting your account. Please try again in about ${Math.ceil(params.retryAfterSeconds / 60)} minute(s).`
        : 'GitHub is rate-limiting your account. Please wait a few minutes and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishRateLimitError';
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

/** Caller lacks the permissions required to fork, push, or open a PR. */
export class PublishPermissionError extends PublishError {
  constructor(params: { cause?: unknown; detail?: string }) {
    super(
      `Insufficient GitHub permissions: ${params.detail ?? 'unknown'}`,
      'Your GitHub account does not have the permissions needed to publish. Sign out and sign back in, making sure to approve access for the EmergentSoftware organization.',
      { cause: params.cause },
    );
    this.name = 'PublishPermissionError';
  }
}

/** The contribution branch already exists on the fork (collision with a prior attempt). */
export class PublishBranchCollisionError extends PublishError {
  readonly branchName: string;

  constructor(params: { branchName: string; cause?: unknown }) {
    super(
      `Fork branch already exists: ${params.branchName}`,
      'A branch for this contribution already exists on your fork. A pull request may already be open for this version — please bump the version number or check GitHub for an existing PR.',
      { cause: params.cause },
    );
    this.name = 'PublishBranchCollisionError';
    this.branchName = params.branchName;
  }
}

/** Transport-layer / network failure talking to GitHub. */
export class PublishNetworkError extends PublishError {
  readonly status?: number;

  constructor(params: { cause?: unknown; status?: number }) {
    super(
      `Network failure while publishing${params.status !== undefined ? ` (HTTP ${params.status})` : ''}`,
      'We could not reach GitHub. Check your internet connection and try again.',
      { cause: params.cause },
    );
    this.name = 'PublishNetworkError';
    this.status = params.status;
  }
}

/**
 * Translate an arbitrary Octokit/transport error into a typed PublishError.
 * Caller is responsible for wrapping the original error as `cause`.
 */
export function mapOctokitError(error: unknown): PublishError {
  if (error instanceof PublishError) return error;

  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403) {
    // Rate limit is signalled via 403 with x-ratelimit-remaining: 0 on GitHub,
    // or explicit "rate limit" text. Treat those as rate limit; otherwise permission.
    const isRateLimit =
      /rate limit/i.test(message) ||
      (error as { response?: { headers?: Record<string, string> } }).response?.headers?.[
        'x-ratelimit-remaining'
      ] === '0';
    if (isRateLimit) {
      const retryAfterHeader = (error as { response?: { headers?: Record<string, string> } }).response
        ?.headers?.['retry-after'];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return new PublishRateLimitError({
        cause: error,
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds ? { retryAfterSeconds } : {}),
      });
    }
    return new PublishPermissionError({ cause: error, detail: message });
  }

  if (status === 429) {
    const retryAfterHeader = (error as { response?: { headers?: Record<string, string> } }).response
      ?.headers?.['retry-after'];
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    return new PublishRateLimitError({
      cause: error,
      ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds ? { retryAfterSeconds } : {}),
    });
  }

  if (status === 422 && /reference already exists|already exists/i.test(message)) {
    return new PublishBranchCollisionError({ branchName: 'unknown', cause: error });
  }

  return new PublishNetworkError({ cause: error, ...(status !== undefined ? { status } : {}) });
}
