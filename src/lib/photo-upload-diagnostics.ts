export type PhotoUploadStage =
  'selection' | 'upload-url' | 'storage-upload' | 'backend-complete' | 'post-complete';

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
  errorName?: string;
  errorMessage?: string;
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
