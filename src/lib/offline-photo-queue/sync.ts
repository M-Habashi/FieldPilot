import type { Id } from '../../../convex/_generated/dataModel';
import {
  inspectSelectedPhotoBytes,
  photoUploadErrorDiagnostics,
  type PhotoUploadDiagnosticEvent,
} from '../photo-upload-diagnostics';
import { uploadPhotoForm } from '../photo-upload-transport';
import { claimNextQueuedPhoto, completeQueuedPhotoUpload, markQueuedPhotoFailed } from './queue';
import type { OfflinePhotoUploadCompletion, QueuedPhotoUpload } from './types';

export interface OfflinePhotoSyncOptions {
  userId: string;
  authToken: string;
  reportDiagnostic?: (
    projectId: Id<'projects'>,
    event: PhotoUploadDiagnosticEvent,
  ) => void | Promise<void>;
}

export interface OfflinePhotoSyncResult {
  uploaded: number;
  failed: number;
}

const inFlightByUser = new Map<string, Promise<OfflinePhotoSyncResult>>();

function queuedPhotoFile(photo: QueuedPhotoUpload) {
  return new File([photo.blob], photo.filename, {
    type: photo.contentType,
    lastModified: photo.lastModified,
  });
}

async function safeReportDiagnostic(
  options: OfflinePhotoSyncOptions,
  projectId: string,
  event: PhotoUploadDiagnosticEvent,
) {
  try {
    await options.reportDiagnostic?.(projectId as Id<'projects'>, event);
  } catch {
    // Diagnostics must never block or change the upload queue.
  }
}

function responseFailure(status: number) {
  if (status === 401) {
    return {
      kind: 'auth' as const,
      retryable: false,
      message: 'Sign in again to continue uploading this photo.',
    };
  }
  if (status === 429 || status >= 500) {
    return {
      kind: 'server' as const,
      retryable: true,
      message: 'The photo service is temporarily unavailable.',
    };
  }
  return {
    kind: 'permanent' as const,
    retryable: false,
    message: 'The server could not accept this photo. Retry it after checking your access.',
  };
}

function parseUploadCompletion(
  photo: QueuedPhotoUpload,
  body: string,
): OfflinePhotoUploadCompletion {
  const parsed = JSON.parse(body) as Partial<OfflinePhotoUploadCompletion>;
  if (
    typeof parsed.attachmentId !== 'string' ||
    typeof parsed.hasExifLocation !== 'boolean' ||
    !['found', 'missing', 'unreadable'].includes(parsed.exifStatus ?? '')
  ) {
    throw new Error('The photo service returned an incomplete response.');
  }
  return {
    clientUploadId: photo.clientUploadId,
    projectId: photo.projectId,
    userId: photo.userId,
    attachmentId: parsed.attachmentId,
    hasExifLocation: parsed.hasExifLocation,
    exifStatus: parsed.exifStatus as OfflinePhotoUploadCompletion['exifStatus'],
  };
}

async function uploadClaimedPhoto(photo: QueuedPhotoUpload, options: OfflinePhotoSyncOptions) {
  const uploadFile = queuedPhotoFile(photo);
  const selectedBytes = await inspectSelectedPhotoBytes(uploadFile);
  const diagnosticBase = {
    ...photo.clientDiagnostics,
    ...selectedBytes,
    attemptId: photo.clientUploadId,
    contentType: photo.contentType,
  };
  await safeReportDiagnostic(options, photo.projectId, {
    ...diagnosticBase,
    phase: 'selected',
    stage: 'selection',
  });

  const form = new FormData();
  form.append('projectId', photo.projectId);
  form.append('attemptId', photo.clientUploadId);
  form.append('clientUploadId', photo.clientUploadId);
  form.append('contentType', photo.contentType);
  form.append('photo', uploadFile, uploadFile.name);

  try {
    const response = await uploadPhotoForm('/api/photo-upload', options.authToken, form);
    if (!response.ok) {
      const failure = responseFailure(response.status);
      await safeReportDiagnostic(options, photo.projectId, {
        ...diagnosticBase,
        phase: 'failed',
        stage: 'storage-upload',
        httpStatus: response.status,
        errorName: 'PhotoUploadHttpError',
        errorMessage: failure.message,
      });
      await markQueuedPhotoFailed(photo.clientUploadId, failure);
      return false;
    }

    const completion = parseUploadCompletion(photo, response.body);
    await safeReportDiagnostic(options, photo.projectId, {
      ...diagnosticBase,
      phase: 'storage-uploaded',
      stage: 'storage-upload',
      httpStatus: response.status,
    });
    await safeReportDiagnostic(options, photo.projectId, {
      ...diagnosticBase,
      phase: 'completed',
      stage: 'backend-complete',
      httpStatus: response.status,
      exifStatus: completion.exifStatus,
    });
    await completeQueuedPhotoUpload(completion);
    return true;
  } catch (error) {
    const errorDiagnostic = photoUploadErrorDiagnostics(error);
    await safeReportDiagnostic(options, photo.projectId, {
      ...diagnosticBase,
      phase: 'failed',
      stage: 'storage-upload',
      ...errorDiagnostic,
    });
    await markQueuedPhotoFailed(photo.clientUploadId, {
      kind: 'network',
      retryable: true,
      message: errorDiagnostic.errorMessage ?? 'The photo upload could not reach the server.',
    });
    return false;
  }
}

async function processQueue(options: OfflinePhotoSyncOptions): Promise<OfflinePhotoSyncResult> {
  let uploaded = 0;
  let failed = 0;
  while (true) {
    const photo = await claimNextQueuedPhoto(options.userId);
    if (!photo) break;
    if (await uploadClaimedPhoto(photo, options)) uploaded += 1;
    else failed += 1;
  }
  return { uploaded, failed };
}

export function processOfflinePhotoQueue(options: OfflinePhotoSyncOptions) {
  const existing = inFlightByUser.get(options.userId);
  if (existing) return existing;
  const processing = processQueue(options).finally(() => {
    if (inFlightByUser.get(options.userId) === processing) {
      inFlightByUser.delete(options.userId);
    }
  });
  inFlightByUser.set(options.userId, processing);
  return processing;
}

export async function waitForOfflinePhotoQueueSync(userId: string) {
  await inFlightByUser.get(userId);
}
