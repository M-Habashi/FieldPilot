const GENERIC_ERROR = 'Something went wrong. Please try again.';

function structuredErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data === 'string') return data.trim() || null;
  if (typeof data !== 'object' || data === null || !('message' in data)) return null;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' ? message.trim() || null : null;
}

export function userFacingError(error: unknown, fallback = GENERIC_ERROR) {
  const structuredMessage = structuredErrorMessage(error);
  if (!(error instanceof Error) && structuredMessage === null) return fallback;

  const rawMessage = structuredMessage ?? (error as Error).message;
  const uncaught = rawMessage.match(
    /Uncaught Error:\s*([\s\S]*?)(?:\s+at handler\b|\n\s*at\b|\s+Called by client\b|$)/u,
  );
  const message =
    uncaught?.[1]?.trim() ??
    rawMessage
      .replace(/^\[CONVEX[^\]]*\]\s*/u, '')
      .replace(/^\[Request ID:[^\]]*\]\s*Server Error\s*/u, '')
      .trim();

  if (!message) return fallback;
  if (
    /^(?:Server Error\s*)?Called by client$/iu.test(message) ||
    /^Server Error$/iu.test(message)
  ) {
    return fallback;
  }
  if (/^(InvalidAccountId|InvalidSecret)$/iu.test(message)) {
    return 'The email address or password is incorrect.';
  }
  if (/^TooManyFailedAttempts$/iu.test(message)) {
    return 'Too many attempts. Try again later or reset your password.';
  }
  if (/This email is already registered with Google/iu.test(message)) {
    return 'This email uses Google. Sign in with Google.';
  }
  return message;
}
