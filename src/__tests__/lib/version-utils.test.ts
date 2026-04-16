import { describe, expect, it } from 'vitest';

import { bumpVersion } from '@/lib/version-utils';

describe('bumpVersion', () => {
  it('bumps patch', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
  });

  it('bumps minor and resets patch', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps major and resets minor/patch', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('throws on invalid input', () => {
    expect(() => bumpVersion('not-semver', 'patch')).toThrow(/Failed to bump/);
  });
});
