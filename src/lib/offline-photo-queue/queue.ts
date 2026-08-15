import { openOfflinePhotoQueueDatabase } from './db';
import type {
  OfflinePhotoFailureKind,
  OfflinePhotoQueueSummary,
  OfflinePhotoUploadCompletion,
  QueuedPhotoUpload,
} from './types';
import type { PhotoUploadDiagnosticEvent } from '../photo-upload-diagnostics';

const UPLOAD_LEASE_MS = 130_000;
const MAX_AUTOMATIC_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 60_000;

type QueueListener = () => void;
type CompletionListener = (completion: OfflinePhotoUploadCompletion) => void;

const queueListeners = new Set<QueueListener>();
const completionListeners = new Set<CompletionListener>();
let persistentStorageRequested = false;

type QueueBroadcastMessage =
  | { type: 'queue-changed' }
  | { type: 'upload-completed'; completion: OfflinePhotoUploadCompletion };

const broadcastChannel =
  typeof globalThis.window !== 'undefined' && typeof globalThis.BroadcastChannel === 'function'
    ? new BroadcastChannel('fieldpilot-offline-photo-queue')
    : null;

if (broadcastChannel) {
  broadcastChannel.onmessage = (event: MessageEvent<QueueBroadcastMessage>) => {
    if (event.data.type === 'queue-changed') {
      for (const listener of queueListeners) listener();
    } else if (event.data.type === 'upload-completed') {
      for (const listener of completionListeners) listener(event.data.completion);
    }
  };
}

function notifyQueueChanged() {
  for (const listener of queueListeners) listener();
  broadcastChannel?.postMessage({ type: 'queue-changed' } satisfies QueueBroadcastMessage);
}

function notifyUploadCompleted(completion: OfflinePhotoUploadCompletion) {
  for (const listener of completionListeners) listener(completion);
  broadcastChannel?.postMessage({
    type: 'upload-completed',
    completion,
  } satisfies QueueBroadcastMessage);
}

async function requestPersistentStorage() {
  if (persistentStorageRequested) return;
  persistentStorageRequested = true;
  try {
    await globalThis.navigator?.storage?.persist?.();
  } catch {
    // Persistence is a best-effort durability improvement. IndexedDB remains usable without it.
  }
}

export class OfflinePhotoQueueStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OfflinePhotoQueueStorageError';
  }
}

export interface EnqueueMaterializedPhotoInput {
  clientUploadId: string;
  projectId: string;
  userId: string;
  file: File;
  contentType: string;
  clientDiagnostics: Omit<PhotoUploadDiagnosticEvent, 'phase'>;
  now?: number;
}

export async function enqueueMaterializedPhoto({
  clientUploadId,
  projectId,
  userId,
  file,
  contentType,
  clientDiagnostics,
  now = Date.now(),
}: EnqueueMaterializedPhotoInput): Promise<QueuedPhotoUpload> {
  if (!clientUploadId || !projectId || !userId) {
    throw new OfflinePhotoQueueStorageError('The photo is missing its upload identity.');
  }
  if (!file.name.trim() || file.size === 0 || !contentType.startsWith('image/')) {
    throw new OfflinePhotoQueueStorageError('The selected photo is empty or unsupported.');
  }

  await requestPersistentStorage();
  const queuedPhoto: QueuedPhotoUpload = {
    clientUploadId,
    projectId,
    userId,
    blob: new Blob([file], { type: contentType }),
    filename: file.name,
    contentType,
    lastModified: file.lastModified,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    clientDiagnostics,
  };

  try {
    const database = await openOfflinePhotoQueueDatabase();
    await database.put('photos', queuedPhoto);
  } catch (error) {
    const quotaExceeded = error instanceof DOMException && error.name === 'QuotaExceededError';
    throw new OfflinePhotoQueueStorageError(
      quotaExceeded
        ? 'This device does not have enough browser storage to save the photo for upload.'
        : 'The photo could not be saved safely on this device.',
      { cause: error },
    );
  }

  notifyQueueChanged();
  return queuedPhoto;
}

export async function listQueuedPhotoUploads(userId: string, projectId?: string) {
  const database = await openOfflinePhotoQueueDatabase();
  const records = projectId
    ? await database.getAllFromIndex('photos', 'by-user-project', [userId, projectId])
    : await database.getAllFromIndex('photos', 'by-user', userId);
  return records.sort((left, right) => left.createdAt - right.createdAt);
}

function isEligibleForClaim(photo: QueuedPhotoUpload, now: number) {
  if (photo.status === 'pending') return true;
  if (photo.status === 'uploading') return (photo.leaseUntil ?? 0) <= now;
  return (
    photo.failureKind !== 'auth' &&
    photo.failureKind !== 'permanent' &&
    photo.failureKind !== 'retry-exhausted' &&
    (photo.nextAttemptAt ?? 0) <= now
  );
}

export async function claimNextQueuedPhoto(
  userId: string,
  now = Date.now(),
): Promise<QueuedPhotoUpload | null> {
  const database = await openOfflinePhotoQueueDatabase();
  const transaction = database.transaction('photos', 'readwrite');
  const records = await transaction.store.index('by-user').getAll(userId);
  const next = records
    .filter((photo) => isEligibleForClaim(photo, now))
    .sort((left, right) => left.createdAt - right.createdAt)[0];

  if (!next) {
    await transaction.done;
    return null;
  }

  const claimed: QueuedPhotoUpload = {
    ...next,
    status: 'uploading',
    updatedAt: now,
    leaseUntil: now + UPLOAD_LEASE_MS,
    nextAttemptAt: undefined,
  };
  await transaction.store.put(claimed);
  await transaction.done;
  notifyQueueChanged();
  return claimed;
}

function retryDelayMs(retryCount: number) {
  return Math.min(1_000 * 2 ** Math.max(0, retryCount - 1), MAX_RETRY_DELAY_MS);
}

export async function markQueuedPhotoFailed(
  clientUploadId: string,
  failure: {
    kind: Exclude<OfflinePhotoFailureKind, 'retry-exhausted'>;
    message: string;
    retryable: boolean;
  },
  now = Date.now(),
) {
  const database = await openOfflinePhotoQueueDatabase();
  const transaction = database.transaction('photos', 'readwrite');
  const existing = await transaction.store.get(clientUploadId);
  if (!existing) {
    await transaction.done;
    return;
  }

  const retryCount = existing.retryCount + 1;
  const automaticRetry = failure.retryable && retryCount < MAX_AUTOMATIC_RETRIES;
  const failureKind =
    failure.retryable && !automaticRetry ? ('retry-exhausted' as const) : failure.kind;
  await transaction.store.put({
    ...existing,
    status: 'failed',
    updatedAt: now,
    retryCount,
    leaseUntil: undefined,
    nextAttemptAt: automaticRetry ? now + retryDelayMs(retryCount) : undefined,
    failureKind,
    lastError: failure.message.slice(0, 240),
  });
  await transaction.done;
  notifyQueueChanged();
}

export async function completeQueuedPhotoUpload(completion: OfflinePhotoUploadCompletion) {
  const database = await openOfflinePhotoQueueDatabase();
  await database.delete('photos', completion.clientUploadId);
  notifyQueueChanged();
  notifyUploadCompleted(completion);
}

export async function retryFailedPhotoUploads(userId: string, projectId?: string) {
  const database = await openOfflinePhotoQueueDatabase();
  const transaction = database.transaction('photos', 'readwrite');
  const records = await transaction.store.index('by-user').getAll(userId);
  const now = Date.now();
  for (const photo of records) {
    if (photo.status !== 'failed' || (projectId && photo.projectId !== projectId)) continue;
    await transaction.store.put({
      ...photo,
      status: 'pending',
      updatedAt: now,
      retryCount: 0,
      nextAttemptAt: undefined,
      leaseUntil: undefined,
      failureKind: undefined,
      lastError: undefined,
    });
  }
  await transaction.done;
  notifyQueueChanged();
}

export async function requeueAuthenticationFailures(userId: string) {
  const database = await openOfflinePhotoQueueDatabase();
  const transaction = database.transaction('photos', 'readwrite');
  const records = await transaction.store.index('by-user').getAll(userId);
  const now = Date.now();
  let changed = false;
  for (const photo of records) {
    if (photo.status !== 'failed' || photo.failureKind !== 'auth') continue;
    changed = true;
    await transaction.store.put({
      ...photo,
      status: 'pending',
      updatedAt: now,
      nextAttemptAt: undefined,
      leaseUntil: undefined,
      failureKind: undefined,
      lastError: undefined,
    });
  }
  await transaction.done;
  if (changed) notifyQueueChanged();
}

export async function getOfflinePhotoQueueSummary(
  userId: string,
  projectId?: string,
): Promise<OfflinePhotoQueueSummary> {
  const records = await listQueuedPhotoUploads(userId, projectId);
  const pendingCount = records.filter((photo) => photo.status === 'pending').length;
  const uploadingCount = records.filter((photo) => photo.status === 'uploading').length;
  const failedCount = records.filter((photo) => photo.status === 'failed').length;
  return {
    pendingCount,
    uploadingCount,
    failedCount,
    totalCount: records.length,
  };
}

export function subscribeOfflinePhotoQueue(listener: QueueListener) {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

export function subscribeOfflinePhotoUploadCompletions(listener: CompletionListener) {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}
