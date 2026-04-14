const SENSITIVE_KEYS = new Set([
  'access_token',
  'authorization',
  'client_secret',
  'code',
  'refresh_token',
]);

const REDACTED = '[REDACTED]';

export interface Logger {
  error: (payload: Record<string, unknown>) => void;
  info: (payload: Record<string, unknown>) => void;
}

export function makeLogger(log: (msg: string) => void): Logger {
  const emit = (level: string, payload: Record<string, unknown>) => {
    const line = {
      level,
      timestamp: new Date().toISOString(),
      ...(scrub(payload) as Record<string, unknown>),
    };
    log(JSON.stringify(line));
  };
  return {
    error: (payload) => emit('error', payload),
    info: (payload) => emit('info', payload),
  };
}

export function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : scrub(v);
    }
    return out;
  }
  return value;
}
