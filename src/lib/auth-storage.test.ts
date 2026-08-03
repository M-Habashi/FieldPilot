import { describe, expect, it } from 'vitest';
import { createAuthStorage } from './auth-storage';

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
});
