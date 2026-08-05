import Google from '@auth/core/providers/google';
import type { ConvexCredentialsUserConfig } from '@convex-dev/auth/providers/ConvexCredentials';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth, createAccount } from '@convex-dev/auth/server';
import type { DataModel } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import {
  assertAuthEmailConfigured,
  emailVerificationProvider,
  passwordResetProvider,
} from './authEmail';
import { createOrUpdateAuthUser } from './lib/authUser';
import { TMP_ACCOUNT_DEV_FEATURE_ENABLED, tmpAccountForEmail } from './lib/tmpAccountDevFeature';

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

const password = Password<DataModel>({
  profile: (params) => {
    if (params.flow === 'signUp') assertAuthEmailConfigured();
    return {
      email: normalizeEmail(params.email),
      ...(typeof params.name === 'string' && params.name.trim()
        ? { name: params.name.trim() }
        : {}),
    };
  },
  validatePasswordRequirements: (value) => {
    if (value.length < 8) throw new Error('Password must be at least 8 characters.');
    if (value.length > 128) throw new Error('Password must be 128 characters or fewer.');
  },
  verify: emailVerificationProvider,
  reset: passwordResetProvider,
});

// Keep the existing password provider and its verified email flows, but intercept the two
// reserved developer emails. Their first valid sign-in provisions real Convex Auth records and
// the normal demo project; later sign-ins reuse the same persisted users and project data.
const passwordOptions = (
  password as typeof password & { options: ConvexCredentialsUserConfig<DataModel> }
).options;
const authorizePassword = passwordOptions.authorize;
passwordOptions.authorize = async (params, ctx) => {
  const tmpAccount = tmpAccountForEmail(params.email);
  if (!tmpAccount) return await authorizePassword(params, ctx);

  if (!TMP_ACCOUNT_DEV_FEATURE_ENABLED) {
    throw new Error('Temporary developer accounts are disabled.');
  }
  if (params.flow !== 'signIn' || params.password !== tmpAccount.password) {
    throw new Error('Invalid credentials');
  }

  const { user } = await createAccount(ctx, {
    provider: 'password',
    account: { id: tmpAccount.email, secret: tmpAccount.password },
    profile: {
      name: tmpAccount.name,
      email: tmpAccount.email,
      emailVerified: true,
    },
    shouldLinkViaEmail: true,
  });
  return { userId: user._id };
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, password],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      return await createOrUpdateAuthUser(ctx as MutationCtx, args);
    },
  },
});
