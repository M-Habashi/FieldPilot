import type { AuthProviderMaterializedConfig } from '@convex-dev/auth/server';
import type { GenericId } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { ensureDemoProjectForUser } from './demoProject';

type AuthProfile = Record<string, unknown> & {
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
};

export type CreateOrUpdateAuthUserArgs = {
  existingUserId: GenericId<'users'> | null;
  type: 'oauth' | 'credentials' | 'email' | 'phone' | 'verification';
  provider: AuthProviderMaterializedConfig;
  profile: AuthProfile;
};

function normalizedEmail(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined;
}

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function userPatch(args: CreateOrUpdateAuthUserArgs) {
  const email = normalizedEmail(args.profile.email);
  const emailVerified =
    args.profile.emailVerified === true || args.type === 'oauth' || args.provider.type === 'oidc';

  return {
    ...(normalizedString(args.profile.name) ? { name: normalizedString(args.profile.name) } : {}),
    ...(normalizedString(args.profile.image)
      ? { image: normalizedString(args.profile.image) }
      : {}),
    ...(email ? { email } : {}),
    ...(email && emailVerified ? { emailVerificationTime: Date.now() } : {}),
    ...(normalizedString(args.profile.phone)
      ? { phone: normalizedString(args.profile.phone) }
      : {}),
    ...(args.profile.phoneVerified === true ? { phoneVerificationTime: Date.now() } : {}),
  };
}

async function usersWithEmail(ctx: MutationCtx, email: string) {
  return await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .take(2);
}

async function hasGoogleAccount(ctx: MutationCtx, userId: Id<'users'>) {
  return (
    (await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'google'))
      .first()) !== null
  );
}

/**
 * Owns auth identity linking so a password signup can never create or attach
 * credentials to an email that already belongs to Google.
 */
export async function createOrUpdateAuthUser(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
): Promise<Id<'users'>> {
  const email = normalizedEmail(args.profile.email);
  const patch = userPatch(args);

  if (args.existingUserId !== null) {
    const userId = args.existingUserId as Id<'users'>;
    if (email) {
      const conflictingUser = (await usersWithEmail(ctx, email)).find(
        (candidate) => candidate._id !== userId,
      );
      if (conflictingUser) {
        throw new Error('This email address is already linked to another account.');
      }
    }
    await ctx.db.patch(userId, patch);

    if (args.type === 'verification' && args.profile.emailVerified === true) {
      await ensureDemoProjectForUser(ctx, userId);
    }
    return userId;
  }

  const matches = email ? await usersWithEmail(ctx, email) : [];
  if (matches.length > 1) {
    throw new Error('We found a problem with this account. Contact support before signing in.');
  }

  if (args.type === 'credentials' && matches.length === 1) {
    const existingUser = matches[0];
    if (await hasGoogleAccount(ctx, existingUser._id)) {
      throw new Error('This email uses Google. Sign in with Google.');
    }
    throw new Error('An account already exists for this email. Sign in instead.');
  }

  // A verified OAuth identity may safely claim a matching unverified email
  // account. This prevents duplicate users if someone starts email signup and
  // then chooses Google before entering the verification code.
  if ((args.type === 'oauth' || args.provider.type === 'oidc') && matches.length === 1) {
    const userId = matches[0]._id;
    await ctx.db.patch(userId, patch);
    await ensureDemoProjectForUser(ctx, userId);
    return userId;
  }

  const userId = await ctx.db.insert('users', patch);
  if (args.type === 'oauth' || args.provider.type === 'oidc') {
    await ensureDemoProjectForUser(ctx, userId);
  }
  return userId;
}
