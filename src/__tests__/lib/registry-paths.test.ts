import { describe, expect, it } from 'vitest';

import {
  assetPathSegments,
  bundlePathSegments,
  encodePathSegment,
  encodeRegistryPath,
  toRegistryPath,
} from '@/lib/registry-paths';

describe('registry-paths', () => {
  describe('assetPathSegments', () => {
    it('builds an unscoped asset path', () => {
      const segments = assetPathSegments(
        { name: 'clarification-agent', type: 'agent', version: '1.0.0' },
        'manifest.json',
      );
      expect(toRegistryPath(segments)).toBe('assets/agents/clarification-agent/1.0.0/manifest.json');
    });

    it('prepends a bare org with @ (stored org never carries @)', () => {
      const segments = assetPathSegments(
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
        'manifest.json',
      );
      expect(toRegistryPath(segments)).toBe(
        'assets/agents/@agentic-toolkit/validate/1.1.0/manifest.json',
      );
    });

    it('splits a nested file path into segments', () => {
      const segments = assetPathSegments(
        { name: 'my-skill', type: 'skill', version: '2.0.0' },
        'references/data.md',
      );
      expect(toRegistryPath(segments)).toBe(
        'assets/skills/my-skill/2.0.0/references/data.md',
      );
    });

    it('omits the trailing file when none is given (version directory)', () => {
      const segments = assetPathSegments({ name: 'x', type: 'rule', version: '1.0.0' });
      expect(toRegistryPath(segments)).toBe('assets/rules/x/1.0.0');
    });
  });

  describe('bundlePathSegments', () => {
    it('defaults to bundle.json and builds a global bundle path', () => {
      expect(toRegistryPath(bundlePathSegments({ name: 'quality-bundle', version: '0.3.0' }))).toBe(
        'bundles/quality-bundle/0.3.0/bundle.json',
      );
    });

    it('prepends a bare org with @ for org-scoped bundles', () => {
      expect(
        toRegistryPath(bundlePathSegments({ name: 'qa-bundle', org: 'cupay', version: '1.0.0' })),
      ).toBe('bundles/@cupay/qa-bundle/1.0.0/bundle.json');
    });
  });

  describe('encoding', () => {
    it('preserves a leading @ but percent-encodes other reserved characters', () => {
      expect(encodePathSegment('@cupay')).toBe('@cupay');
      expect(encodePathSegment('a b')).toBe('a%20b');
    });

    it('encodes each segment while preserving @ across the joined path', () => {
      const segments = bundlePathSegments({ name: 'qa bundle', org: 'cupay', version: '1.0.0' });
      expect(encodeRegistryPath(segments)).toBe('bundles/@cupay/qa%20bundle/1.0.0/bundle.json');
    });
  });
});
