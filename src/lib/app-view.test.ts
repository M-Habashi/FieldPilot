import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAppView, patchAppView, readAppView } from './app-view';

const STORAGE_KEY = 'fp:app-view';

// Tests run in node, and the repo injects storage rather than pulling in a DOM.
function memorySessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { sessionStorage: memorySessionStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAppView', () => {
  it('defaults to the project list when nothing is stored', () => {
    expect(readAppView()).toEqual({ projectId: null, sheetId: null, view: 'plans' });
  });

  it('restores a stored project, sheet and view', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ projectId: 'p1', sheetId: 's1', view: 'map' }),
    );

    expect(readAppView()).toEqual({ projectId: 'p1', sheetId: 's1', view: 'map' });
  });

  it('drops a sheet stored without its project, which cannot be reopened safely', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sheetId: 's1', view: 'map' }));

    expect(readAppView()).toEqual({ projectId: null, sheetId: null, view: 'map' });
  });

  it('falls back to plans for an unrecognised view', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId: 'p1', view: 'gantt' }));

    expect(readAppView().view).toBe('plans');
  });

  it('survives corrupt storage', () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'not json');

    expect(readAppView()).toEqual({ projectId: null, sheetId: null, view: 'plans' });
  });
});

describe('patchAppView', () => {
  it('merges into the stored view rather than replacing it', () => {
    patchAppView({ projectId: 'p1', sheetId: 's1' });
    patchAppView({ view: 'map' });

    expect(readAppView()).toEqual({ projectId: 'p1', sheetId: 's1', view: 'map' });
  });

  it('clears the sheet when the project is cleared', () => {
    patchAppView({ projectId: 'p1', sheetId: 's1' });
    patchAppView({ projectId: null, sheetId: null });

    expect(readAppView()).toEqual({ projectId: null, sheetId: null, view: 'plans' });
  });
});

describe('clearAppView', () => {
  it('resets to the project list so entering from home starts fresh', () => {
    patchAppView({ projectId: 'p1', sheetId: 's1', view: 'map' });

    clearAppView();

    expect(readAppView()).toEqual({ projectId: null, sheetId: null, view: 'plans' });
  });
});
