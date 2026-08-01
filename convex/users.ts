import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { ensureDemoProjectForUser } from './lib/demoProject';

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await ctx.db.get(userId);
  },
});

export const ensureDemoForEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const matchingUsers = (await ctx.db.query('users').collect()).filter(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (matchingUsers.length === 0) throw new Error('Account not found');
    if (matchingUsers.length > 1) throw new Error('Multiple accounts use this email');
    return await ensureDemoProjectForUser(ctx, matchingUsers[0]._id);
  },
});
