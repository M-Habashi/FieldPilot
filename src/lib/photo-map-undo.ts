import type { PhotoLocation } from './photo-location';

export type PhotoUndoOperation =
  | {
      kind: 'location';
      attachmentId: string;
      expectedPhotoUpdatedAt: number;
      previousLocation: (PhotoLocation & { source: 'exif' | 'manual' }) | null;
      nextLocation: (PhotoLocation & { source: 'exif' | 'manual' }) | null;
    }
  | {
      kind: 'assignment';
      attachmentId: string;
      expectedPhotoUpdatedAt: number;
      previousTaskId: string | null;
      nextTaskId: string | null;
    }
  | { kind: 'trash'; attachmentId: string; expectedPhotoUpdatedAt: number };

const MAX_UNDO_STEPS = 100;

function storageKey(scope: string, stack: 'undo' | 'redo'): string {
  return `fp:photo-map:${stack}:${scope}`;
}

function readPhotoHistory(scope: string, stack: 'undo' | 'redo'): PhotoUndoOperation[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope, stack));
    const parsed = raw ? (JSON.parse(raw) as PhotoUndoOperation[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_UNDO_STEPS) : [];
  } catch {
    return [];
  }
}

function pushPhotoHistory(
  scope: string,
  stack: 'undo' | 'redo',
  operation: PhotoUndoOperation,
): PhotoUndoOperation[] {
  const next = [...readPhotoHistory(scope, stack), operation].slice(-MAX_UNDO_STEPS);
  window.sessionStorage.setItem(storageKey(scope, stack), JSON.stringify(next));
  return next;
}

function popPhotoHistory(scope: string, stack: 'undo' | 'redo'): PhotoUndoOperation | null {
  const entries = readPhotoHistory(scope, stack);
  const operation = entries.pop() ?? null;
  window.sessionStorage.setItem(storageKey(scope, stack), JSON.stringify(entries));
  return operation;
}

export function readPhotoUndo(scope: string): PhotoUndoOperation[] {
  return readPhotoHistory(scope, 'undo');
}

export function pushPhotoUndo(scope: string, operation: PhotoUndoOperation): PhotoUndoOperation[] {
  return pushPhotoHistory(scope, 'undo', operation);
}

export function popPhotoUndo(scope: string): PhotoUndoOperation | null {
  return popPhotoHistory(scope, 'undo');
}

export function readPhotoRedo(scope: string): PhotoUndoOperation[] {
  return readPhotoHistory(scope, 'redo');
}

export function pushPhotoRedo(scope: string, operation: PhotoUndoOperation): PhotoUndoOperation[] {
  return pushPhotoHistory(scope, 'redo', operation);
}

export function popPhotoRedo(scope: string): PhotoUndoOperation | null {
  return popPhotoHistory(scope, 'redo');
}

/**
 * Undo history is session-persisted. Older sessions can contain operations
 * recorded before redo had enough information to replay them safely.
 */
export function supportsPhotoRedo(operation: PhotoUndoOperation): boolean {
  if (operation.kind === 'trash') return true;
  if (operation.kind === 'assignment') return 'nextTaskId' in operation;
  return 'nextLocation' in operation;
}

export function clearPhotoRedo(scope: string): void {
  window.sessionStorage.removeItem(storageKey(scope, 'redo'));
}
