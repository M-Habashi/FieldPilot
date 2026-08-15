import { useCallback, useEffect, useState } from 'react';
import type { Id } from '../../convex/_generated/dataModel';
import type { PhotoUploadDiagnosticEvent } from '../lib/photo-upload-diagnostics';
import {
  getOfflinePhotoQueueSummary,
  requeueAuthenticationFailures,
  retryFailedPhotoUploads,
  subscribeOfflinePhotoQueue,
} from '../lib/offline-photo-queue/queue';
import {
  processOfflinePhotoQueue,
  waitForOfflinePhotoQueueSync,
} from '../lib/offline-photo-queue/sync';
import type { OfflinePhotoQueueSummary } from '../lib/offline-photo-queue/types';

const EMPTY_SUMMARY: OfflinePhotoQueueSummary = {
  pendingCount: 0,
  uploadingCount: 0,
  failedCount: 0,
  totalCount: 0,
};

const syncRequestListeners = new Set<() => void>();

export function requestOfflinePhotoQueueSync() {
  for (const listener of syncRequestListeners) listener();
}

interface OfflinePhotoQueueCoordinatorOptions {
  userId: string | null;
  authToken: string | null;
  reportDiagnostic: (
    projectId: Id<'projects'>,
    event: PhotoUploadDiagnosticEvent,
  ) => void | Promise<void>;
}

export function useOfflinePhotoQueueCoordinator({
  userId,
  authToken,
  reportDiagnostic,
}: OfflinePhotoQueueCoordinatorOptions) {
  const runSync = useCallback(() => {
    if (!userId || !authToken || !globalThis.navigator.onLine) return;
    void processOfflinePhotoQueue({ userId, authToken, reportDiagnostic }).catch(
      (error: unknown) => {
        console.error('Offline photo queue processing failed', error);
      },
    );
  }, [authToken, reportDiagnostic, userId]);

  useEffect(() => {
    if (!userId || !authToken) return;
    let cancelled = false;
    void waitForOfflinePhotoQueueSync(userId)
      .then(() => requeueAuthenticationFailures(userId))
      .then(() => {
        if (!cancelled) runSync();
      })
      .catch((error: unknown) => {
        console.error('Offline photo queue could not resume after authentication', error);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, runSync, userId]);

  useEffect(() => {
    if (!userId || !authToken) return;
    const onOnline = () => runSync();
    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState === 'visible') runSync();
    };
    const unsubscribeQueue = subscribeOfflinePhotoQueue(runSync);
    syncRequestListeners.add(runSync);
    globalThis.addEventListener('online', onOnline);
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = globalThis.setInterval(runSync, 15_000);
    runSync();
    return () => {
      unsubscribeQueue();
      syncRequestListeners.delete(runSync);
      globalThis.removeEventListener('online', onOnline);
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.clearInterval(interval);
    };
  }, [authToken, runSync, userId]);
}

export function useOfflinePhotoQueue(projectId: string, userId: string) {
  const [summary, setSummary] = useState<OfflinePhotoQueueSummary>(EMPTY_SUMMARY);
  const [isOnline, setIsOnline] = useState(() => globalThis.navigator.onLine);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getOfflinePhotoQueueSummary(userId, projectId)
        .then((nextSummary) => {
          if (!cancelled) setSummary(nextSummary);
        })
        .catch((error: unknown) => {
          console.error('Offline photo queue state could not be read', error);
        });
    };
    refresh();
    const unsubscribe = subscribeOfflinePhotoQueue(refresh);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    globalThis.addEventListener('online', onOnline);
    globalThis.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      unsubscribe();
      globalThis.removeEventListener('online', onOnline);
      globalThis.removeEventListener('offline', onOffline);
    };
  }, [projectId, userId]);

  const retry = useCallback(async () => {
    await retryFailedPhotoUploads(userId, projectId);
    requestOfflinePhotoQueueSync();
  }, [projectId, userId]);

  return { ...summary, isOnline, retry };
}
