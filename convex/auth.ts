import Google from '@auth/core/providers/google';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import type { DataModel } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { emailVerificationProvider, passwordResetProvider } from './authEmail';
import { createOrUpdateAuthUser } from './lib/authUser';

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

const password = Password<DataModel>({
  profile: (params) => ({
    email: normalizeEmail(params.email),
    ...(typeof params.name === 'string' && params.name.trim() ? { name: params.name.trim() } : {}),
  }),
  validatePasswordRequirements: (value) => {
    if (value.length < 8) throw new Error('Password must be at least 8 characters.');
    if (value.length > 128) throw new Error('Password must be 128 characters or fewer.');
  },
  verify: emailVerificationProvider,
  reset: passwordResetProvider,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, password],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      return await createOrUpdateAuthUser(ctx as MutationCtx, args);
    },
  },
});
