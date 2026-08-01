import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProjectMember, requireProjectRole, requireUser } from './lib/authz';

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
    number: v.string(),
    discipline: v.optional(v.string()),
    sourceFileRef: v.string(),
    pageIndex: v.number(),
    width: v.number(),
    height: v.number(),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, args.projectId, ['owner', 'admin'], userId);
    const now = Date.now();
    return await ctx.db.insert('sheets', {
      ...args,
      name: args.name.trim(),
      number: args.number.trim(),
      discipline: args.discipline?.trim() || undefined,
      version: args.version ?? 1,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
