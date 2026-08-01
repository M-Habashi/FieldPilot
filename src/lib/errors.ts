const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function userFacingError(error: unknown) {
  if (!(error instanceof Error)) return GENERIC_ERROR;

  const uncaught = error.message.match(
    /Uncaught Error:\s*([\s\S]*?)(?:\s+at handler\b|\n\s*at\b|\s+Called by client\b|$)/u,
  );
  const message =
    uncaught?.[1]?.trim() ??
    error.message
      .replace(/^\[CONVEX[^\]]*\]\s*/u, '')
      .replace(/^\[Request ID:[^\]]*\]\s*Server Error\s*/u, '')
      .trim();

  if (!message) return GENERIC_ERROR;
  if (/^(InvalidAccountId|InvalidSecret)$/iu.test(message)) {
    return 'The email or password is incorrect.';
  }
  if (/^TooManyFailedAttempts$/iu.test(message)) {
    return 'Too many attempts. Try again later or reset your password.';
  }
  if (/This email is already registered with Google/iu.test(message)) {
    return 'This email uses Google. Sign in with Google.';
  }
  return message;
}
