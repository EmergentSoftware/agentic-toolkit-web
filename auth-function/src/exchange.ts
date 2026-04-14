import type {
  HttpHandler,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';

import { z } from 'zod';

import {
  isOriginAllowed,
  parseAllowedOrigins,
  resolveCorsHeaders,
} from './cors.js';
import { makeLogger, scrub } from './logging.js';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

const BodySchema = z.object({
  code: z.string().trim().min(1, 'code must be a non-empty string'),
});

interface ErrorEnvelope {
  error: string;
  message: string;
}

function errorResponse(
  status: number,
  error: string,
  message: string,
  corsHeaders: Record<string, string>,
): HttpResponseInit {
  const envelope: ErrorEnvelope = { error, message };
  return jsonResponse(status, envelope, corsHeaders);
}

function jsonResponse(
  status: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): HttpResponseInit {
  return {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
    jsonBody: body,
    status,
  };
}

export const exchangeHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  const log = makeLogger((msg) => context.log(msg));
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const corsHeaders = resolveCorsHeaders(origin, allowedOrigins);

  if (request.method === 'OPTIONS') {
    if (!isOriginAllowed(origin, allowedOrigins)) {
      log.info({
        event: 'cors_preflight_rejected',
        method: 'OPTIONS',
        origin: origin ?? null,
      });
      return { headers: { Vary: 'Origin' }, status: 403 };
    }
    log.info({ event: 'cors_preflight', origin });
    return { headers: corsHeaders, status: 204 };
  }

  if (!isOriginAllowed(origin, allowedOrigins)) {
    log.info({
      allowedOrigins,
      configuredRaw: process.env.CORS_ALLOWED_ORIGINS ?? null,
      event: 'origin_rejected',
      method: request.method,
      origin: origin ?? null,
      originBytes: origin ? [...origin].map((c) => c.charCodeAt(0)) : null,
    });
    return errorResponse(
      403,
      'origin_not_allowed',
      'Request origin is not permitted.',
      { Vary: 'Origin' },
    );
  }

  if (request.method !== 'POST') {
    return errorResponse(
      405,
      'method_not_allowed',
      `Method ${request.method} is not supported.`,
      { ...corsHeaders, Allow: 'POST, OPTIONS' },
    );
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log.error({
      event: 'missing_app_settings',
      has_client_id: !!clientId,
      has_client_secret: !!clientSecret,
    });
    return errorResponse(
      500,
      'server_misconfigured',
      'OAuth application settings are not configured.',
      corsHeaders,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(
      400,
      'invalid_json',
      'Request body must be valid JSON.',
      corsHeaders,
    );
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    log.info({
      event: 'validation_error',
      issues: parsed.error.issues.map((i) => ({
        code: i.code,
        message: i.message,
        path: i.path,
      })),
    });
    return errorResponse(
      400,
      'invalid_request',
      parsed.error.issues[0]?.message ?? 'Request body failed validation.',
      corsHeaders,
    );
  }

  const { code } = parsed.data;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(GITHUB_TOKEN_URL, {
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'atk-auth-function',
      },
      method: 'POST',
    });
  } catch (err) {
    log.error({
      event: 'upstream_network_error',
      message: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(
      502,
      'upstream_unavailable',
      'Failed to reach GitHub to exchange the code.',
      corsHeaders,
    );
  }

  let upstreamBody: unknown;
  try {
    upstreamBody = await upstreamResponse.json();
  } catch {
    log.error({
      event: 'upstream_invalid_json',
      status: upstreamResponse.status,
    });
    return errorResponse(
      502,
      'upstream_invalid_response',
      'GitHub returned a response that could not be parsed as JSON.',
      corsHeaders,
    );
  }

  if (!upstreamResponse.ok) {
    log.error({
      body: scrub(upstreamBody),
      event: 'upstream_http_error',
      status: upstreamResponse.status,
    });
    return errorResponse(
      502,
      'upstream_error',
      `GitHub returned status ${upstreamResponse.status}.`,
      corsHeaders,
    );
  }

  if (
    upstreamBody &&
    typeof upstreamBody === 'object' &&
    'error' in (upstreamBody as Record<string, unknown>)
  ) {
    const body = upstreamBody as Record<string, unknown>;
    const ghError =
      typeof body.error === 'string' ? body.error : 'github_error';
    const ghDescription =
      typeof body.error_description === 'string'
        ? body.error_description
        : 'GitHub rejected the authorization code.';
    log.info({
      event: 'github_oauth_error',
      github_error: ghError,
    });
    return errorResponse(400, ghError, ghDescription, corsHeaders);
  }

  log.info({ event: 'exchange_success' });
  return jsonResponse(200, upstreamBody, corsHeaders);
};
