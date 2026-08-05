import { describe, expect, it } from 'vitest';
import { createAuthStorage, getAuthPersistence, setAuthPersistence } from './auth-storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('createAuthStorage', () => {
  const verifierKey = '__convexAuthOAuthVerifier_httpsgrandkookabura810convexcloud';

  it('recovers an OAuth verifier from the tab-scoped fallback', () => {
    const primary = memoryStorage();
    const fallback = memoryStorage({ [verifierKey]: 'verifier-id' });
    const storage = createAuthStorage(primary, fallback);

    expect(storage.getItem(verifierKey)).toBe('verifier-id');
  });

  it('can complete the verifier lifecycle when primary storage is unavailable', () => {
    const unavailablePrimary = {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
      removeItem: () => {
        throw new Error('unavailable');
      },
    };
    const fallback = memoryStorage();
    const storage = createAuthStorage(unavailablePrimary, fallback);

    expect(() => storage.setItem(verifierKey, 'verifier-id')).not.toThrow();
    expect(storage.getItem(verifierKey)).toBe('verifier-id');
    expect(() => storage.removeItem(verifierKey)).not.toThrow();
    expect(fallback.getItem(verifierKey)).toBeNull();
  });

  it('mirrors and removes only the short-lived OAuth verifier', () => {
    const primary = memoryStorage();
    const fallback = memoryStorage();
    const storage = createAuthStorage(primary, fallback);

    storage.setItem(verifierKey, 'verifier-id');
    storage.setItem('__convexAuthJWT_namespace', 'jwt');

    expect(fallback.getItem(verifierKey)).toBe('verifier-id');
    expect(fallback.getItem('__convexAuthJWT_namespace')).toBeNull();

    storage.removeItem(verifierKey);
    expect(primary.getItem(verifierKey)).toBeNull();
    expect(fallback.getItem(verifierKey)).toBeNull();
  });

  it('keeps the normal verifier path working when tab storage is unavailable', () => {
    const primary = memoryStorage();
    const unavailableFallback = {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
      removeItem: () => {
        throw new Error('unavailable');
      },
    };
    const storage = createAuthStorage(primary, unavailableFallback);

    expect(() => storage.setItem(verifierKey, 'verifier-id')).not.toThrow();
    expect(storage.getItem(verifierKey)).toBe('verifier-id');
    expect(() => storage.removeItem(verifierKey)).not.toThrow();
  });

  it('keeps auth tokens in session storage when remember me is off', () => {
    const persistent = memoryStorage();
    const session = memoryStorage();
    setAuthPersistence(false, persistent);
    const storage = createAuthStorage(persistent, session);

    storage.setItem('__convexAuthJWT_namespace', 'jwt');
    storage.setItem('__convexAuthRefreshToken_namespace', 'refresh');

    expect(getAuthPersistence(persistent)).toBe('session');
    expect(persistent.getItem('__convexAuthJWT_namespace')).toBeNull();
    expect(session.getItem('__convexAuthJWT_namespace')).toBe('jwt');
    expect(storage.getItem('__convexAuthRefreshToken_namespace')).toBe('refresh');
  });

  it('persists auth tokens when remember me is on and clears stale session tokens', () => {
    const persistent = memoryStorage();
    const session = memoryStorage({ __convexAuthJWT_namespace: 'stale-jwt' });
    setAuthPersistence(true, persistent);
    const storage = createAuthStorage(persistent, session);

    storage.setItem('__convexAuthJWT_namespace', 'current-jwt');

    expect(getAuthPersistence(persistent)).toBe('persistent');
    expect(persistent.getItem('__convexAuthJWT_namespace')).toBe('current-jwt');
    expect(session.getItem('__convexAuthJWT_namespace')).toBeNull();
  });

  it('sign-out cleanup removes tokens from both storage areas', () => {
    const persistent = memoryStorage({ __convexAuthJWT_namespace: 'persistent-jwt' });
    const session = memoryStorage({ __convexAuthJWT_namespace: 'session-jwt' });
    const storage = createAuthStorage(persistent, session);

    storage.removeItem('__convexAuthJWT_namespace');

    expect(persistent.getItem('__convexAuthJWT_namespace')).toBeNull();
    expect(session.getItem('__convexAuthJWT_namespace')).toBeNull();
  });
});
