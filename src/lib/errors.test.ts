import { describe, expect, it } from 'vitest';
import { userFacingError } from './errors';

describe('userFacingError', () => {
  it('removes Convex request and stack details', () => {
    const error = new Error(
      '[Request ID: abc123] Server Error\nUncaught Error: An invitation is already pending for this email\n    at handler (../convex/invitations.ts:66:46)\n\nCalled by client',
    );

    expect(userFacingError(error)).toBe('An invitation is already pending for this email');
  });

  it('falls back safely for non-Error values', () => {
    expect(userFacingError('failure')).toBe('Something went wrong. Please try again.');
  });

  it('uses the call-site fallback for opaque Convex server envelopes', () => {
    const error = new Error('[CONVEX A(auth:signIn)] Server Error\nCalled by client');

    expect(userFacingError(error)).toBe('Something went wrong. Please try again.');
    expect(
      userFacingError(error, 'The email address or password is incorrect.'),
    ).toBe('The email address or password is incorrect.');
  });

  it('reads user-safe structured Convex errors', () => {
    expect(
      userFacingError({ data: 'No FieldPilot account uses this email address.' }),
    ).toBe('No FieldPilot account uses this email address.');
  });

  it.each(['InvalidAccountId', 'InvalidSecret'])(
    'translates %s into a safe credentials message',
    (code) => {
      expect(userFacingError(new Error(code))).toBe(
        'The email address or password is incorrect.',
      );
    },
  );

  it('translates rate-limit errors into next-step guidance', () => {
    expect(userFacingError(new Error('TooManyFailedAttempts'))).toBe(
      'Too many attempts. Try again later or reset your password.',
    );
  });

  it('translates an existing Google account into a concise signup action', () => {
    const error = new Error(
      'Uncaught Error: This email is already registered with Google. Continue with Google.',
    );

    expect(userFacingError(error)).toBe('This email uses Google. Sign in with Google.');
  });
});
