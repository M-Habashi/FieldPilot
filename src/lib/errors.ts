export function userFacingError(error: unknown) {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';

  const uncaught = error.message.match(
    /Uncaught Error:\s*([\s\S]*?)(?:\s+at handler\b|\n\s*at\b|\s+Called by client\b|$)/u,
  );
  if (uncaught?.[1]) return uncaught[1].trim();

  return error.message
    .replace(/^\[CONVEX[^\]]*\]\s*/u, '')
    .replace(/^\[Request ID:[^\]]*\]\s*Server Error\s*/u, '')
    .trim();
}
