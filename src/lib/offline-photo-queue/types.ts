import type { PhotoUploadDiagnosticEvent } from '../photo-upload-diagnostics';

export type OfflinePhotoQueueStatus = 'pending' | 'uploading' | 'failed';

export type OfflinePhotoFailureKind =
  'network' | 'server' | 'auth' | 'permanent' | 'retry-exhausted';

export interface QueuedPhotoUpload {
  clientUploadId: string;
  projectId: string;
  userId: string;
  blob: Blob;
  filename: string;
  contentType: string;
  lastModified: number;
  status: OfflinePhotoQueueStatus;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  nextAttemptAt?: number;
  leaseUntil?: number;
  failureKind?: OfflinePhotoFailureKind;
  lastError?: string;
  clientDiagnostics: Omit<PhotoUploadDiagnosticEvent, 'phase'>;
}

export interface OfflinePhotoQueueSummary {
  pendingCount: number;
  uploadingCount: number;
  failedCount: number;
  totalCount: number;
}

export interface OfflinePhotoUploadCompletion {
  clientUploadId: string;
  projectId: string;
  userId: string;
  attachmentId: string;
  hasExifLocation: boolean;
  exifStatus: 'found' | 'missing' | 'unreadable';
}
