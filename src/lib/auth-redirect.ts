export const GOOGLE_AUTH_CALLBACK_ROUTE = '/auth/callback';

/**
 * Keep OAuth on the origin that started it. A relative redirect lets a
 * misconfigured Convex SITE_URL send the callback to another origin, where
 * the browser cannot read the verifier that was saved before leaving.
 */
export function googleAuthRedirectTo(origin: string) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new Error('Google sign-in requires an HTTP(S) origin.');
  }
  return `${parsedOrigin.origin}/#${GOOGLE_AUTH_CALLBACK_ROUTE}`;
}
