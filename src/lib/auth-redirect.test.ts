import { describe, expect, it } from 'vitest';
import { GOOGLE_AUTH_CALLBACK_ROUTE, googleAuthRedirectTo } from './auth-redirect';

describe('googleAuthRedirectTo', () => {
  it('pins the OAuth callback to the origin that started sign-in', () => {
    expect(googleAuthRedirectTo('https://fieldpilot-app.vercel.app')).toBe(
      `https://fieldpilot-app.vercel.app/#${GOOGLE_AUTH_CALLBACK_ROUTE}`,
    );
  });

  it('preserves a local development port', () => {
    expect(googleAuthRedirectTo('http://localhost:5173')).toBe(
      `http://localhost:5173/#${GOOGLE_AUTH_CALLBACK_ROUTE}`,
    );
  });

  it('rejects origins that cannot safely receive an OAuth callback', () => {
    expect(() => googleAuthRedirectTo('file:///fieldpilot')).toThrow(
      'Google sign-in requires an HTTP(S) origin.',
    );
  });
});
