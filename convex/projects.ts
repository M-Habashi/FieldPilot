import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProjectMember, requireUser } from './lib/authz';

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (membership) => ({
        membership,
        project: await ctx.db.get(membership.projectId),
      })),
    );
    return rows.filter((row) => row.project !== null && row.project.archivedAt === undefined);
  },
});

export const get = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.db.get(projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error('Project name is required');

    const now = Date.now();
    const projectId = await ctx.db.insert('projects', {
      name,
      code: args.code?.trim() || undefined,
      createdBy: userId,
      nextTaskSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'owner',
      addedBy: userId,
      joinedAt: now,
    });
    return projectId;
  },
});
