import { useCallback, useRef, useState } from 'react';

import { type AssetRef, downloadAsset, type DownloadAssetOptions } from '@/lib/download-service';

import { useSession } from './useSession';
import { useToast } from './useToast';

export interface UseDownloadAssetResult {
  download: (ref: AssetRef, options?: DownloadAssetOptions) => Promise<void>;
  isDownloading: (ref: AssetRef) => boolean;
}

/**
 * Tracks per-asset in-flight state so callers can render a loading spinner on
 * the button that triggered the download. Surfaces success and error feedback
 * via the shared toast manager.
 */
export function useDownloadAsset(): UseDownloadAssetResult {
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
    async (ref: AssetRef, options?: DownloadAssetOptions) => {
      const key = refKey(ref);
      if (inFlightRef.current.has(key)) return;
      markStart(key);
      try {
        await downloadAsset(ref, { ...(token ? { token } : {}), ...options });
        toast.add({
          description: `${ref.name}@${ref.version} downloaded.`,
          priority: 'low',
          title: 'Download ready',
        });
      } catch (error) {
        toast.add({
          description: error instanceof Error ? error.message : 'An unknown error occurred.',
          priority: 'high',
          title: `Failed to download ${ref.name}`,
        });
      } finally {
        markDone(key);
      }
    },
    [markDone, markStart, toast, token],
  );

  const isDownloading = useCallback((ref: AssetRef) => inFlight.has(refKey(ref)), [inFlight]);

  return { download, isDownloading };
}

function refKey(ref: AssetRef): string {
  return `${ref.type}:${ref.org ?? ''}:${ref.name}:${ref.version}`;
}
