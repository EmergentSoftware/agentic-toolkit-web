import { describe, expect, it } from 'vitest';

import { defaultAuthorFor, formatSunsetDate } from '@/lib/session';

describe('defaultAuthorFor', () => {
  it('uses the GitHub login for a GitHub session', () => {
    expect(defaultAuthorFor('github', { id: '1', login: 'octo', name: 'Octo Cat', scheme: 'github' })).toBe('octo');
  });

  it('uses the display name for an Entra session, falling back to the UPN', () => {
    const upn = 'jasonp@emergentsoftware.net';
    expect(defaultAuthorFor('entra', { id: 'oid', login: upn, name: 'Jason Paff', scheme: 'entra' })).toBe(
      'Jason Paff',
    );
    expect(defaultAuthorFor('entra', { id: 'oid', login: upn, name: null, scheme: 'entra' })).toBe(upn);
    expect(defaultAuthorFor('entra', { id: 'oid', login: upn, name: '', scheme: 'entra' })).toBe(upn);
  });

  it('is empty when signed out', () => {
    expect(defaultAuthorFor(null, null)).toBe('');
  });
});

describe('formatSunsetDate', () => {
  it('formats an RFC 3339 timestamp as the UTC calendar date', () => {
    expect(formatSunsetDate('2027-01-31T00:00:00+00:00')).toBe('2027-01-31');
    expect(formatSunsetDate('2027-01-31T23:30:00-05:00')).toBe('2027-02-01');
  });

  it('passes an unparseable value through', () => {
    expect(formatSunsetDate('soon')).toBe('soon');
  });
});
