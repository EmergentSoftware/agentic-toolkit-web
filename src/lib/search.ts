import type { AssetType } from './schemas/manifest';
import type { Registry, RegistryAsset, RegistryBundle } from './schemas/registry';

export interface SearchOptions {
  org?: string;
  query: string;
  tag?: string;
  tool?: string;
  type?: 'bundle' | AssetType;
}

export type SearchResult =
  | { item: RegistryAsset; kind: 'asset'; score: number }
  | { item: RegistryBundle; kind: 'bundle'; score: number };

/**
 * Rank a list of assets by relevance to a query, returning ordered names.
 * When query is empty, returns names in alphabetical order.
 */
export function rankAssetNames(assets: RegistryAsset[], query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...assets].sort((a, b) => a.name.localeCompare(b.name)).map((a) => a.name);
  }
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const scored = assets.map((asset) => ({ asset, score: scoreAsset(asset, terms, trimmed) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.asset.name.localeCompare(b.asset.name);
  });
  return scored.filter((s) => s.score > 0).map((s) => s.asset.name);
}

/**
 * Rank a list of bundles by relevance to a query, returning ordered names.
 * When query is empty, returns names in alphabetical order. Matches the
 * weighting used by {@link rankAssetNames}.
 */
export function rankBundleNames(bundles: RegistryBundle[], query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...bundles].sort((a, b) => a.name.localeCompare(b.name)).map((b) => b.name);
  }
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const scored = bundles.map((bundle) => ({ bundle, score: scoreBundle(bundle, terms, trimmed) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bundle.name.localeCompare(b.bundle.name);
  });
  return scored.filter((s) => s.score > 0).map((s) => s.bundle.name);
}

/**
 * Score a registry asset against a pre-split set of query terms and the full lowercased query.
 * Returns 0 when the item has no latest version, matching CLI behavior.
 */
export function scoreAsset(asset: RegistryAsset, terms: string[], fullQuery: string): number {
  const nameLower = asset.name.toLowerCase();
  const latest = asset.versions[asset.latest];
  const descLower = (latest?.description ?? '').toLowerCase();
  const authorLower = (latest?.author ?? '').toLowerCase();
  return scoreItem(nameLower, descLower, authorLower, asset.tags, terms, fullQuery);
}

/** Score a registry bundle. */
export function scoreBundle(bundle: RegistryBundle, terms: string[], fullQuery: string): number {
  const nameLower = bundle.name.toLowerCase();
  const descLower = bundle.description.toLowerCase();
  const authorLower = bundle.author.toLowerCase();
  return scoreItem(nameLower, descLower, authorLower, bundle.tags, terms, fullQuery);
}

/**
 * Score an item against lowercased fields and terms. Higher = better match.
 * Mirrors the CLI scoring weights (see agentic-toolkit/src/lib/search.ts).
 */
export function scoreItem(
  name: string,
  description: string,
  author: string,
  tags: string[],
  terms: string[],
  fullQuery: string,
): number {
  let score = 0;

  if (name === fullQuery) {
    score += 100;
  } else if (name.includes(fullQuery)) {
    score += 50;
  }

  if (description.includes(fullQuery)) {
    score += 20;
  }

  for (const term of terms) {
    if (name.includes(term)) score += 10;
    if (description.includes(term)) score += 5;
    if (tags.some((t) => t.toLowerCase() === term)) score += 8;
    if (author.includes(term)) score += 3;
  }

  return score;
}

/**
 * Search the registry for assets (and bundles when not filtered by asset type or tool).
 * Returns results sorted by score desc, then name asc.
 *
 * Unlike the CLI version, this does not apply org-visibility shadowing — the registry
 * fixture treats each asset as independently visible; filtering by org returns only
 * assets whose org matches.
 */
export function searchRegistry(registry: Registry, options: SearchOptions): SearchResult[] {
  const { org, query, tag, tool, type } = options;
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const results: SearchResult[] = [];

  if (type !== 'bundle') {
    for (const asset of registry.assets) {
      if (type && asset.type !== type) continue;
      if (tag && !asset.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (org && asset.org !== org) continue;
      const latest = asset.versions[asset.latest];
      if (!latest) continue;
      if (tool && !latest.tools.includes(tool)) continue;

      let score = scoreAsset(asset, queryTerms, queryLower);
      if (score > 0 && org && asset.org === org) score += 5;
      if (score > 0) results.push({ item: asset, kind: 'asset', score });
    }
  }

  if ((type === undefined || type === 'bundle') && !tool) {
    for (const bundle of registry.bundles ?? []) {
      if (tag && !bundle.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (org && bundle.org !== org) continue;
      const score = scoreBundle(bundle, queryTerms, queryLower);
      if (score > 0) results.push({ item: bundle, kind: 'bundle', score });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name);
  });

  return results;
}
