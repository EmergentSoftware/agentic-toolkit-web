import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { Manifest } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetManifest } from '@/lib/registry-client';

export interface ManifestGraphState {
  error: Error | null;
  isLoading: boolean;
  manifests: Map<string, Manifest>;
  order: string[];
}

export function refKey(ref: AssetManifestRef): string {
  return `${ref.type}:${ref.org ?? ''}:${ref.name}:${ref.version}`;
}

/**
 * Breadth-first-walk the given refs and all their transitive dependencies,
 * fetching each manifest through react-query's cache. The returned map is
 * keyed by `refKey(ref)` and enumerated in discovery order so callers can
 * render groups in a stable sequence.
 *
 * Duplicate refs (same type/org/name/version) are visited once. Dependencies
 * whose `version` is missing are skipped — the UI can only render what the
 * download pipeline would actually fetch.
 */
export function useManifestGraph(refs: AssetManifestRef[]): ManifestGraphState {
  const { octokit } = useSession();
  const queryClient = useQueryClient();

  const refsKey = useMemo(() => refs.map(refKey).sort().join('|'), [refs]);

  const initialRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: AssetManifestRef[] = [];
    for (const ref of refs) {
      const key = refKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  const [state, setState] = useState<ManifestGraphState>({
    error: null,
    isLoading: initialRefs.length > 0,
    manifests: new Map(),
    order: [],
  });

  useEffect(() => {
    if (!octokit || initialRefs.length === 0) {
      setState({ error: null, isLoading: false, manifests: new Map(), order: [] });
      return;
    }

    let cancelled = false;
    setState({ error: null, isLoading: true, manifests: new Map(), order: [] });

    const seen = new Set<string>(initialRefs.map(refKey));
    const queue: AssetManifestRef[] = [...initialRefs];
    const order: string[] = [];
    const manifests = new Map<string, Manifest>();

    (async () => {
      while (queue.length > 0) {
        const ref = queue.shift()!;
        const key = refKey(ref);
        try {
          const manifest = await queryClient.fetchQuery({
            queryFn: ({ signal }) => fetchAssetManifest(ref, { octokit, signal }),
            queryKey: queryKeys.assetManifest(ref),
          });
          if (cancelled) return;
          manifests.set(key, manifest);
          order.push(key);
          for (const dep of manifest.dependencies ?? []) {
            if (!dep.version) continue;
            const depRef: AssetManifestRef = {
              name: dep.name,
              type: dep.type,
              version: dep.version,
            };
            const depKey = refKey(depRef);
            if (seen.has(depKey)) continue;
            seen.add(depKey);
            queue.push(depRef);
          }
        } catch (err) {
          if (cancelled) return;
          setState({
            error: err instanceof Error ? err : new Error(String(err)),
            isLoading: false,
            manifests: new Map(manifests),
            order: [...order],
          });
          return;
        }
      }
      if (cancelled) return;
      setState({ error: null, isLoading: false, manifests, order });
    })();

    return () => {
      cancelled = true;
    };
  }, [octokit, queryClient, initialRefs]);

  return state;
}
