import { useCallback, useRef, useState } from 'react';

import { downloadBundle, type DownloadBundleOptions } from '@/lib/download-service';

import { useSession } from './useSession';
import { useToast } from './useToast';

/** Per-call download options; the API client comes from the session. */
export type DownloadBundleHookOptions = Omit<DownloadBundleOptions, 'client'>;

export interface UseDownloadBundleResult {
  download: (name: string, options: DownloadBundleHookOptions) => Promise<void>;
  isDownloading: (name: string, org?: string) => boolean;
}

/**
 * Tracks per-bundle in-flight state so callers can render a loading spinner on
 * the button that triggered the download. Surfaces success and error feedback
 * via the shared toast manager.
 */
export function useDownloadBundle(): UseDownloadBundleResult {
  const toast = useToast();
  const { api } = useSession();
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const inFlightRef = useRef(inFlight);
  inFlightRef.current = inFlight;

  const markStart = useCallback((key: string) => {
    setInFlight((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const markDone = useCallback((key: string) => {
    setInFlight((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const download = useCallback(
    async (name: string, options: DownloadBundleHookOptions) => {
      const key = bundleKey(name, options.org);
      if (inFlightRef.current.has(key)) return;
      if (!api) {
        toast.add({
          description: 'Sign in to download bundles from the registry.',
          priority: 'high',
          title: `Failed to download ${name}`,
        });
        return;
      }
      markStart(key);
      try {
        await downloadBundle(name, { ...options, client: api });
        toast.add({
          description: `Bundle ${name} downloaded.`,
          priority: 'low',
          title: 'Download ready',
        });
      } catch (error) {
        toast.add({
          description: error instanceof Error ? error.message : 'An unknown error occurred.',
          priority: 'high',
          title: `Failed to download ${name}`,
        });
      } finally {
        markDone(key);
      }
    },
    [api, markDone, markStart, toast],
  );

  const isDownloading = useCallback((name: string, org?: string) => inFlight.has(bundleKey(name, org)), [inFlight]);

  return { download, isDownloading };
}

/** In-flight key that keeps same-named bundles in different orgs distinct. */
function bundleKey(name: string, org?: string): string {
  return `${org ?? ''}:${name}`;
}
