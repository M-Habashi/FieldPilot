import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    return await ctx.db
      .query('notes')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .order('desc')
      .collect();
  },
});

export const create = mutation({
  args: {
    taskId: v.id('tasks'),
    text: v.string(),
  },
  handler: async (ctx, { taskId, text }) => {
    const authorId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, authorId);

    const trimmed = text.trim();
    if (!trimmed) throw new Error('Note text is required');
    return await ctx.db.insert('notes', {
      projectId: task.projectId,
      taskId,
      authorId,
      text: trimmed,
      createdAt: Date.now(),
    });
  },
});
