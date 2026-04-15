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
    for (const entry of splitConfigured(configured)) {
      const cleaned = stripQuotes(entry.trim());
      if (cleaned) set.add(cleaned);
    }
  }
  return Array.from(set);
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

function splitConfigured(configured: string): string[] {
  const trimmed = configured.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => (typeof v === 'string' ? v : String(v)));
      }
    } catch {
      // Fall through to CSV parsing on malformed JSON.
    }
  }
  return trimmed.split(',');
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}
