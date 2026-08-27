/**
 * Which project, sheet and workspace view the user currently has open.
 *
 * None of this lives in the URL, so without persisting it a reload drops the
 * user back on the project list. Session storage rather than local storage:
 * surviving a refresh is the point, whereas a brand new tab reopening
 * yesterday's sheet would be surprising.
 */
export interface AppView {
  projectId: string | null;
  sheetId: string | null;
  chatThreadId: string | null;
  view: 'plans' | 'map' | 'quantities';
}

const STORAGE_KEY = 'fp:app-view';

const emptyView: AppView = {
  projectId: null,
  sheetId: null,
  chatThreadId: null,
  view: 'plans',
};

/** Creates an opaque conversation id. It is not a credential. */
export function createChatThreadId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function readAppView(): AppView {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyView;
    const parsed = JSON.parse(raw) as Partial<AppView>;
    const projectId = typeof parsed.projectId === 'string' ? parsed.projectId : null;
    return {
      projectId,
      // A sheet without its project cannot be restored, and keeping it would
      // reopen a workspace against the wrong project.
      sheetId: projectId !== null && typeof parsed.sheetId === 'string' ? parsed.sheetId : null,
      // Threads follow the same project boundary. A refresh inside a project
      // keeps the conversation, while entering from Projects creates a new id.
      chatThreadId:
        projectId !== null &&
        typeof parsed.chatThreadId === 'string' &&
        parsed.chatThreadId.length > 0
          ? parsed.chatThreadId
          : null,
      view: parsed.view === 'map' || parsed.view === 'quantities' ? parsed.view : 'plans',
    };
  } catch {
    return emptyView;
  }
}

/**
 * Forgets the stored view. Called whenever the landing page is shown, so
 * entering the app from home always starts on the project list — restoring a
 * deep view is for an accidental refresh, not for a deliberate fresh start.
 */
export function clearAppView(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

/** Merges a partial update into the stored view. Never throws. */
export function patchAppView(patch: Partial<AppView>): void {
  try {
    const next = { ...readAppView(), ...patch };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures must not break navigation.
  }
}
