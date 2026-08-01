import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
type AuthzCtx = QueryCtx | MutationCtx;

export async function requireUser(ctx: AuthzCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error('Unauthenticated');
  return userId;
}

export async function requireProjectMember(
  ctx: AuthzCtx,
  projectId: Id<'projects'>,
  userId?: Id<'users'>,
) {
  const resolvedUserId = userId ?? (await requireUser(ctx));
  const membership = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', resolvedUserId))
    .unique();

  if (membership === null) throw new Error('Not authorized for this project');
  return membership;
}

export async function requireProjectRole(
  ctx: AuthzCtx,
  projectId: Id<'projects'>,
  allowedRoles: readonly ProjectRole[],
  userId?: Id<'users'>,
) {
  const membership = await requireProjectMember(ctx, projectId, userId);
  if (!allowedRoles.includes(membership.role)) {
    throw new Error('Insufficient project permissions');
  }
  return membership;
}
