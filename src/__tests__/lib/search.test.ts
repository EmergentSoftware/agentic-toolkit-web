import { describe, expect, it } from 'vitest';

import { rankAssetNames, rankBundleNames, scoreItem, searchRegistry } from '@/lib/search';

import { loadFixtureRegistry } from '../fixtures';

describe('search', () => {
  it('scores exact name matches higher than partial matches', () => {
    const exact = scoreItem('validate', 'runs things', 'author', ['quality'], ['validate'], 'validate');
    const partial = scoreItem('validator', 'runs things', 'author', ['quality'], ['validate'], 'validate');
    expect(exact).toBeGreaterThan(partial);
  });

  it('ranks assets by relevance, preferring name matches over description matches', () => {
    const registry = loadFixtureRegistry();
    const ordered = rankAssetNames(registry.assets, 'validate');
    expect(ordered[0]).toBe('validate');
  });

  it('searchRegistry filters by asset type', () => {
    const registry = loadFixtureRegistry();
    const results = searchRegistry(registry, { query: 'workflow', type: 'skill' });
    for (const result of results) {
      expect(result.kind).toBe('asset');
      if (result.kind === 'asset') expect(result.item.type).toBe('skill');
    }
  });

  it('searchRegistry excludes bundles when a tool filter is active', () => {
    const registry = loadFixtureRegistry();
    const results = searchRegistry(registry, { query: 'workflow', tool: 'claude-code' });
    expect(results.every((r) => r.kind === 'asset')).toBe(true);
  });

  it('rankBundleNames orders by relevance then alphabetically when empty', () => {
    const registry = loadFixtureRegistry();
    expect(rankBundleNames(registry.bundles ?? [], '')).toEqual(['feature-workflow', 'quality-bundle']);
  });

  it('rankBundleNames prefers name match, then description and tag matches', () => {
    const registry = loadFixtureRegistry();
    const quality = rankBundleNames(registry.bundles ?? [], 'quality');
    expect(quality[0]).toBe('quality-bundle');

    const workflow = rankBundleNames(registry.bundles ?? [], 'workflow');
    expect(workflow[0]).toBe('feature-workflow');
  });

  it('rankBundleNames drops bundles with zero score', () => {
    const registry = loadFixtureRegistry();
    expect(rankBundleNames(registry.bundles ?? [], 'zzz-nothing-matches')).toEqual([]);
  });
});
