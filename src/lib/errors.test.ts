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

  it('translates raw auth account errors into guidance', () => {
    expect(userFacingError(new Error('InvalidAccountId'))).toBe(
      'Enter a valid email address, like name@example.com.',
    );
  });
});
