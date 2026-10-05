// Maps the old app's hash routes to the new ATK web app's URLs.
// Spec: docs/prompts/step-8b-web.md (Part 5) in the Emergent.AgenticToolkit monorepo.

export const NEW_ORIGIN = 'https://ashy-wave-0d3ec6210.3.azurestaticapps.net';

/**
 * The new app's root-relative URL for an old `location.hash`. Never throws.
 * The old page's own query (`location.search`) is never forwarded.
 */
export function newPathFor(hash) {
  const route = hash.replace(/^#/, '');
  const queryAt = route.indexOf('?');
  const path = queryAt === -1 ? route : route.slice(0, queryAt);
  const query = new URLSearchParams(queryAt === -1 ? '' : route.slice(queryAt + 1));

  let segments;
  try {
    segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return '/';
  }

  const [first, second, third, fourth] = segments;

  if (segments.length === 0) {
    const q = query.get('q');
    return q ? withQuery('/', [['q', q]]) : '/';
  }
  if (first === 'assets' && segments.length === 4) {
    const org = query.get('org');
    return withQuery('/asset/', [['type', second], ['name', third], ...(org ? [['org', org]] : []), ['version', fourth]]);
  }
  if (first === 'bundles') {
    if (segments.length === 1) return '/bundles/';
    if (segments.length === 2) return second === 'new' ? '/publish/bundle/' : withQuery('/bundle/', [['name', second]]);
    if (segments.length === 3 && !(second === 'new' && third === 'success')) {
      return withQuery('/bundle/', [['name', third], ['org', second]]);
    }
    return '/';
  }
  if (first === 'contribute' && segments.length === 1) return '/publish/asset/';
  return '/';
}

function withQuery(path, pairs) {
  return `${path}?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}
