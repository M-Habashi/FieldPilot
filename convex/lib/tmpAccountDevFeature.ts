/**
 * Temporary developer accounts backed by the configured Convex deployment.
 * Set this one boolean to false and deploy Convex to disable their sign-ins.
 */
export const TMP_ACCOUNT_DEV_FEATURE_ENABLED = true;

const TMP_ACCOUNTS = [
  {
    email: 'fake_acc_1@fieldpilot.dev',
    password: 'fake_acc_1',
    name: 'Fake Account 1',
  },
  {
    email: 'fake_acc_2@fieldpilot.dev',
    password: 'fake_acc_2',
    name: 'Fake Account 2',
  },
] as const;

export type TmpAccount = (typeof TMP_ACCOUNTS)[number];

export function tmpAccountForEmail(value: unknown): TmpAccount | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  return TMP_ACCOUNTS.find((account) => account.email === email);
}

export function isTmpAccountEmail(value: unknown): boolean {
  return tmpAccountForEmail(value) !== undefined;
}
