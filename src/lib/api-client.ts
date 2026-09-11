/**
 * Hand-written wrapper around the generated ATK API client (`src/lib/api/`).
 *
 * Owns three concerns the generated code does not:
 * - Base URL resolution from `VITE_ATK_API_URL`.
 * - Wiring: bearer auth from the session token and retries through
 *   {@link fetchWithRetry}.
 * - Error mapping: every non-2xx result becomes an {@link ApiRequestError}
 *   with a stable `code`, an HTTP `status`, and a message the UI can show.
 *
 * Nothing outside this module may import the generated default client in
 * `api/client.gen.ts`; it points at production and carries no auth.
 */

import type { ApiErrorDetail } from './api/types.gen';

import { type Client, createClient } from './api/client';
import { fetchWithRetry, type RetryOptions } from './fetch-retry';

export type { ApiErrorDetail } from './api/types.gen';

/** A configured ATK API client: base URL, bearer auth, and retries wired in. */
export type ApiClient = Client;

/** Shape of a generated SDK call result with `throwOnError: false` and `responseStyle: 'fields'`. */
export interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response?: Response;
}

/** Options for {@link createApiClient}. */
export interface CreateApiClientOptions {
  /** Override retry behaviour (tests use fast backoff). */
  retry?: RetryOptions;
}

/** The API's error envelope, as returned by every non-2xx response. */
interface ApiErrorEnvelope {
  details?: ApiErrorDetail[] | null;
  error: string;
  message: string;
}

/**
 * Thrown by {@link unwrap} for any failed ATK API call.
 *
 * `status` is the HTTP status (0 for a network failure). `code` is the API's
 * machine-readable error code (`not_found`, `version_not_bumped`, ...), or a
 * synthetic one (`network_error`, `http_error`) when the API did not send an
 * envelope. `details` carries per-item validation problems when present.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly resource: string;
  readonly status: number;

  constructor(
    message: string,
    options: { cause?: unknown; code: string; details?: ApiErrorDetail[]; resource: string; status: number },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ApiRequestError';
    this.code = options.code;
    this.details = options.details;
    this.resource = options.resource;
    this.status = options.status;
  }
}

/** Codes the API uses for a 403 that means "signed in, but not an org member". */
export const NOT_MEMBER_CODES = new Set(['not_org_member', 'org_membership_unverifiable']);

/**
 * Build an ATK API client for a session token.
 *
 * `token` may be `null` for the one unauthenticated call (the OAuth code
 * exchange); the bearer header is simply omitted. Every request is routed
 * through {@link fetchWithRetry}, so 429/5xx responses and network errors are
 * retried with backoff before the caller sees them.
 */
export function createApiClient(token: null | string, options: CreateApiClientOptions = {}): ApiClient {
  return createClient({
    auth: () => token ?? undefined,
    baseUrl: getApiUrl(),
    fetch: (input: Request | string | URL, init?: RequestInit) => fetchWithRetry(input, init, options.retry),
    throwOnError: false,
  });
}

/** Read the ATK API base URL from the Vite environment (trailing slash stripped). */
export function getApiUrl(): string {
  const value = import.meta.env.VITE_ATK_API_URL;
  if (!value) {
    throw new Error('VITE_ATK_API_URL is not set. Copy .env.example to .env.local and fill in the ATK API URL.');
  }
  return value.replace(/\/+$/, '');
}

/**
 * Type guard for {@link ApiRequestError}, optionally narrowed by API error
 * code and/or HTTP status.
 */
export function isApiError(err: unknown, code?: string, status?: number): err is ApiRequestError {
  if (!(err instanceof ApiRequestError)) return false;
  if (code !== undefined && err.code !== code) return false;
  if (status !== undefined && err.status !== status) return false;
  return true;
}

/**
 * Convert a generated-client result into its `data`, or throw an
 * {@link ApiRequestError} describing why the call failed.
 *
 * @param result - The `{ data, error, response }` object returned by an SDK function
 * @param resource - Human-readable name of what was requested (used in messages)
 */
export function unwrap<T>(result: ApiResult<T>, resource: string): T {
  const { data, error, response } = result;

  if (response === undefined) {
    // The fetch itself threw (offline, DNS, CORS, abort, ...).
    const cause = error instanceof Error ? error.message : error ? String(error) : 'Network request failed';
    throw new ApiRequestError(`Could not reach the ATK API while loading ${resource}: ${cause}`, {
      cause: error,
      code: 'network_error',
      resource,
      status: 0,
    });
  }

  if (response.ok && error === undefined) {
    return data as T;
  }

  throw toApiRequestError(response.status, error, resource);
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorEnvelope).error === 'string' &&
    typeof (value as ApiErrorEnvelope).message === 'string'
  );
}

/**
 * Map an HTTP status plus the API's error envelope (when present) to an
 * {@link ApiRequestError} with a message suitable for a toast or banner.
 */
function toApiRequestError(status: number, error: unknown, resource: string): ApiRequestError {
  const envelope = isErrorEnvelope(error) ? error : undefined;
  const code = envelope?.error ?? 'http_error';
  const apiMessage = envelope?.message ?? (typeof error === 'string' && error ? error : undefined);
  const details = envelope?.details ?? undefined;
  const make = (message: string) => new ApiRequestError(message, { code, details, resource, status });

  if (status === 401) {
    return make('Your GitHub session is no longer valid. Sign in again.');
  }

  if (status === 403 && NOT_MEMBER_CODES.has(code)) {
    return make(
      'Your GitHub account is not an active member of the EmergentSoftware organization, or membership could not be verified.',
    );
  }

  if (status === 404) {
    return make(apiMessage ?? `${capitalize(resource)} was not found.`);
  }

  if (status === 429) {
    return make('The ATK API is rate limiting requests. Wait a minute and try again.');
  }

  if (status >= 500) {
    const detail = apiMessage ? ` (${code}: ${apiMessage})` : '';
    return make(
      `The ATK API is unavailable while loading ${resource}: HTTP ${status}${detail}. Try again in a moment.`,
    );
  }

  // 400/403/409 and anything else: the API message is the best text we have.
  return make(apiMessage ?? `Loading ${resource} failed with HTTP ${status}.`);
}
