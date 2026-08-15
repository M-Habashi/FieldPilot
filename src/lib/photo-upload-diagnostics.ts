import exifr from 'exifr';
import { enableExtendedHeicRecognition } from './exifr-heic-compat';

enableExtendedHeicRecognition(exifr);

export type PhotoUploadStage =
  | 'selection'
  | 'upload-url'
  | 'backend-received'
  | 'storage-persisted'
  | 'storage-upload'
  | 'backend-complete'
  | 'post-complete';

export interface PhotoUploadDiagnosticEvent {
  attemptId: string;
  phase: 'selected' | 'storage-uploaded' | 'completed' | 'failed';
  stage?: PhotoUploadStage;
  contentType?: string;
  extension?: string;
  size?: number;
  fileNamePattern?: 'numeric' | 'img-prefixed' | 'other';
  lastModifiedAgeMs?: number;
  userAgent?: string;
  platform?: string;
  effectiveConnectionType?: string;
  online?: boolean;
  httpStatus?: number;
  exifStatus?: 'found' | 'missing' | 'unreadable';
  byteFingerprint?: string;
  errorName?: string;
  errorMessage?: string;
}

function validGps(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Identifies whether the bytes exposed to browser JavaScript still contain
 * GPS. The short digest correlates this boundary with the backend without
 * retaining photo data, a complete filename, or coordinates.
 */
export async function inspectSelectedPhotoBytes(file: File): Promise<{
  byteFingerprint?: string;
  exifStatus: 'found' | 'missing' | 'unreadable';
}> {
  try {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const byteFingerprint = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    try {
      const gps = await exifr.gps(bytes);
      return {
        byteFingerprint,
        exifStatus: gps && validGps(gps.latitude, gps.longitude) ? 'found' : 'missing',
      };
    } catch {
      return { byteFingerprint, exifStatus: 'unreadable' };
    }
  } catch {
    return { exifStatus: 'unreadable' };
  }
}

function bounded(value: string, maximum: number): string | undefined {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

export function createPhotoUploadAttemptId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  );
}

export function photoUploadFileDiagnostics(file: File, now = Date.now()) {
  const extensionCandidate = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  const extension = extensionCandidate ? bounded(extensionCandidate.toLowerCase(), 16) : undefined;
  const baseName = extension ? file.name.slice(0, -(extension.length + 1)) : file.name;
  const fileNamePattern = /^\d{8,}$/u.test(baseName)
    ? ('numeric' as const)
    : /^img[_-]/iu.test(baseName)
      ? ('img-prefixed' as const)
      : ('other' as const);

  return {
    contentType: bounded(file.type.toLowerCase(), 100),
    extension,
    size: file.size,
    fileNamePattern,
    lastModifiedAgeMs:
      Number.isFinite(file.lastModified) && file.lastModified > 0
        ? Math.max(0, now - file.lastModified)
        : undefined,
  };
}

export function photoUploadClientDiagnostics() {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;
  return {
    userAgent: bounded(navigator.userAgent, 320),
    platform: bounded(navigator.platform, 80),
    effectiveConnectionType: connection?.effectiveType
      ? bounded(connection.effectiveType, 24)
      : undefined,
    online: navigator.onLine,
  };
}

export function photoUploadErrorDiagnostics(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: bounded(error.name, 80),
      errorMessage: bounded(error.message, 240),
    };
  }
  return {
    errorName: 'UnknownError',
    errorMessage: bounded(String(error), 240),
  };
}
