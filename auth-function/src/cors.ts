const DEV_ORIGIN = 'http://localhost:5173';

export function isOriginAllowed(
  requestOrigin: null | string | undefined,
  allowedOrigins: string[],
): boolean {
  return !!requestOrigin && allowedOrigins.includes(requestOrigin);
}

export function parseAllowedOrigins(configured: string | undefined): string[] {
  const set = new Set<string>([DEV_ORIGIN]);
  if (configured) {
    for (const raw of configured.split(',')) {
      const trimmed = raw.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set];
}

export function resolveCorsHeaders(
  requestOrigin: null | string | undefined,
  allowedOrigins: string[],
): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
  };
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}
