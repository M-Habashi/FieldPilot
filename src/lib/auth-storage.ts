const OAUTH_VERIFIER_KEY_PREFIX = '__convexAuthOAuthVerifier_';

type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isOAuthVerifierKey(key: string) {
  return key.startsWith(OAUTH_VERIFIER_KEY_PREFIX);
}

/**
 * Convex Auth normally keeps its one-time OAuth verifier in localStorage.
 * Mirror only that short-lived value to sessionStorage so a callback can
 * still finish if one browser storage area drops the value during the Google
 * round trip. JWTs and refresh tokens remain in localStorage only.
 */
export function createAuthStorage(
  primary: AuthStorage,
  verifierFallback: AuthStorage,
): AuthStorage {
  return {
    getItem(key) {
      if (!isOAuthVerifierKey(key)) return primary.getItem(key);

      let primaryError: unknown;
      try {
        const value = primary.getItem(key);
        if (value !== null) return value;
      } catch (caught) {
        primaryError = caught;
      }

      try {
        return verifierFallback.getItem(key);
      } catch (fallbackError) {
        if (primaryError) throw primaryError;
        throw fallbackError;
      }
    },
    setItem(key, value) {
      if (!isOAuthVerifierKey(key)) {
        primary.setItem(key, value);
        return;
      }

      let primaryError: unknown;
      try {
        primary.setItem(key, value);
      } catch (caught) {
        primaryError = caught;
      }

      try {
        verifierFallback.setItem(key, value);
      } catch {
        if (primaryError) throw primaryError;
        // The primary write succeeded, so the normal Convex Auth path is intact.
      }
    },
    removeItem(key) {
      if (!isOAuthVerifierKey(key)) {
        primary.removeItem(key);
        return;
      }

      let primaryError: unknown;
      try {
        primary.removeItem(key);
      } catch (caught) {
        primaryError = caught;
      }

      try {
        verifierFallback.removeItem(key);
      } catch {
        if (primaryError) throw primaryError;
        return;
      }
    },
  };
}
