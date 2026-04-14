import type { ZodError } from 'zod';

const PAYLOAD_EXCERPT_MAX = 500;

/** Base class for registry client errors. */
export class RegistryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RegistryError';
  }
}

/** Transport-layer or non-2xx HTTP failure while talking to the registry. */
export class RegistryFetchError extends RegistryError {
  readonly status?: number;
  readonly url: string;

  constructor(message: string, params: { cause?: unknown; status?: number; url: string }) {
    super(message, { cause: params.cause });
    this.name = 'RegistryFetchError';
    this.status = params.status;
    this.url = params.url;
  }
}

/** Registry resource (404) not found. Separate from RegistryFetchError so callers can branch on it. */
export class RegistryNotFoundError extends RegistryError {
  readonly url: string;

  constructor(message: string, params: { url: string }) {
    super(message);
    this.name = 'RegistryNotFoundError';
    this.url = params.url;
  }
}

/** JSON parse failure or Zod schema validation failure. */
export class RegistryParseError extends RegistryError {
  readonly payloadExcerpt: string;
  readonly url: string;
  readonly zodError?: ZodError;

  constructor(message: string, params: { cause?: unknown; payload: string; url: string; zodError?: ZodError }) {
    super(message, { cause: params.cause });
    this.name = 'RegistryParseError';
    this.url = params.url;
    this.payloadExcerpt = excerpt(params.payload);
    this.zodError = params.zodError;
  }
}

function excerpt(payload: string): string {
  if (payload.length <= PAYLOAD_EXCERPT_MAX) return payload;
  return `${payload.slice(0, PAYLOAD_EXCERPT_MAX)}…`;
}
