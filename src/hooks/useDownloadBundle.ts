import { useCallback, useRef, useState } from 'react';

import { downloadBundle, type DownloadBundleOptions } from '@/lib/download-service';

import { useSession } from './useSession';
import { useToast } from './useToast';

export interface UseDownloadBundleResult {
  download: (name: string, options?: DownloadBundleOptions) => Promise<void>;
  isDownloading: (name: string) => boolean;
}

/**
 * Tracks per-bundle in-flight state so callers can render a loading spinner on
 * the button that triggered the download. Surfaces success and error feedback
 * via the shared toast manager.
 */
export function useDownloadBundle(): UseDownloadBundleResult {
  const toast = useToast();
  const { token } = useSession();
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
    async (name: string, options?: DownloadBundleOptions) => {
      if (inFlightRef.current.has(name)) return;
      markStart(name);
      try {
        await downloadBundle(name, { ...(token ? { token } : {}), ...options });
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
        markDone(name);
      }
    },
    [markDone, markStart, toast, token],
  );

  const isDownloading = useCallback((name: string) => inFlight.has(name), [inFlight]);

  return { download, isDownloading };
}
