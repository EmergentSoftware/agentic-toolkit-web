import { describe, expect, it } from 'vitest';

import { parseAllowedOrigins } from '../cors.js';

const DEV_ORIGIN = 'http://localhost:5173';

describe('parseAllowedOrigins', () => {
  it('returns just the dev origin when input is undefined', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([DEV_ORIGIN]);
  });

  it('parses a single CSV origin', () => {
    expect(parseAllowedOrigins('https://emergentsoftware.github.io')).toEqual([
      DEV_ORIGIN,
      'https://emergentsoftware.github.io',
    ]);
  });

  it('parses multiple CSV origins and trims whitespace', () => {
    expect(
      parseAllowedOrigins('https://a.example.com, https://b.example.com'),
    ).toEqual([DEV_ORIGIN, 'https://a.example.com', 'https://b.example.com']);
  });

  it('parses a JSON-array string', () => {
    expect(
      parseAllowedOrigins('["https://emergentsoftware.github.io"]'),
    ).toEqual([DEV_ORIGIN, 'https://emergentsoftware.github.io']);
  });

  it('parses a JSON array with multiple origins', () => {
    expect(
      parseAllowedOrigins('["https://a.example.com","https://b.example.com"]'),
    ).toEqual([DEV_ORIGIN, 'https://a.example.com', 'https://b.example.com']);
  });

  it('strips stray surrounding quotes on a CSV entry', () => {
    expect(parseAllowedOrigins('"https://emergentsoftware.github.io"')).toEqual(
      [DEV_ORIGIN, 'https://emergentsoftware.github.io'],
    );
  });

  it('falls back to CSV parsing when JSON is malformed', () => {
    expect(parseAllowedOrigins('[https://a.example.com')).toEqual([
      DEV_ORIGIN,
      '[https://a.example.com',
    ]);
  });

  it('deduplicates the dev origin when provided explicitly', () => {
    expect(parseAllowedOrigins(DEV_ORIGIN)).toEqual([DEV_ORIGIN]);
  });
});
