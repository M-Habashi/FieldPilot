export function allowUnverifiedEmailAuth() {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.AUTH_ALLOW_UNVERIFIED_EMAIL === 'true'
  );
}
