const OAUTH_VERIFIER_KEY_PREFIX = '__convexAuthOAuthVerifier_';
const AUTH_PERSISTENCE_KEY = 'fp:auth-persistence';

export type AuthPersistence = 'persistent' | 'session';

type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isOAuthVerifierKey(key: string) {
  return key.startsWith(OAUTH_VERIFIER_KEY_PREFIX);
}

function readPersistence(storage: AuthStorage): AuthPersistence | null {
  try {
    const value = storage.getItem(AUTH_PERSISTENCE_KEY);
    return value === 'persistent' || value === 'session' ? value : null;
  } catch {
    return null;
  }
}

/** Update where the next successful sign-in stores its auth tokens. */
export function setAuthPersistence(remember: boolean, storage: AuthStorage = window.localStorage) {
  storage.setItem(AUTH_PERSISTENCE_KEY, remember ? 'persistent' : 'session');
}

/** Used to keep the sign-in control aligned with the user's last choice. */
export function getAuthPersistence(storage: AuthStorage = window.localStorage): AuthPersistence {
  return readPersistence(storage) ?? 'session';
}

/**
 * Auth tokens are stored in localStorage only when "Remember me" is selected;
 * otherwise they remain scoped to the current browser tab in sessionStorage.
 * The one-time OAuth verifier is mirrored so a Google callback can complete
 * regardless of the selected persistence policy.
 */
export function createAuthStorage(persistent: AuthStorage, session: AuthStorage): AuthStorage {
  return {
    getItem(key) {
      if (!isOAuthVerifierKey(key)) {
        const persistence = readPersistence(persistent);
        if (persistence === 'session') return session.getItem(key);
        if (persistence === 'persistent') return persistent.getItem(key);

        // Preserve sessions created before the persistence option existed.
        const legacyValue = persistent.getItem(key);
        return legacyValue ?? session.getItem(key);
      }

      let persistentError: unknown;
      try {
        const value = persistent.getItem(key);
        if (value !== null) return value;
      } catch (caught) {
        persistentError = caught;
      }

      try {
        return session.getItem(key);
      } catch (sessionError) {
        if (persistentError) throw persistentError;
        throw sessionError;
      }
    },
    setItem(key, value) {
      if (!isOAuthVerifierKey(key)) {
        const persistence = readPersistence(persistent) ?? 'persistent';
        const preferred = persistence === 'persistent' ? persistent : session;
        const stale = persistence === 'persistent' ? session : persistent;
        preferred.setItem(key, value);
        try {
          stale.removeItem(key);
        } catch {
          // The intended storage write succeeded, so stale cleanup is best effort.
        }
        return;
      }

      let persistentError: unknown;
      try {
        persistent.setItem(key, value);
      } catch (caught) {
        persistentError = caught;
      }

      try {
        session.setItem(key, value);
      } catch {
        if (persistentError) throw persistentError;
        // The persistent write succeeded, so the OAuth callback remains intact.
      }
    },
    removeItem(key) {
      let persistentError: unknown;
      try {
        persistent.removeItem(key);
      } catch (caught) {
        persistentError = caught;
      }

      try {
        session.removeItem(key);
      } catch {
        if (persistentError) throw persistentError;
        return;
      }
    },
  };
}
