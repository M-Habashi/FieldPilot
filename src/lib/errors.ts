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
  if (/^InvalidAccountId$/iu.test(message)) {
    return 'Enter a valid email address, like name@example.com.';
  }
  return message;
}
