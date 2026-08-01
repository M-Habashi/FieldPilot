import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireProjectMember, requireUser } from './lib/authz';
import { taskPriority, taskStatus } from './schema';

function assertNormalizedCoordinate(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a normalized coordinate between 0 and 1`);
  }
}

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    sheetId: v.id('sheets'),
    x: v.number(),
    y: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    priority: v.optional(taskPriority),
    category: v.optional(v.string()),
    color: v.optional(v.string()),
    assigneeText: v.optional(v.string()),
    assigneeUserId: v.optional(v.id('users')),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, args.projectId, userId);
    assertNormalizedCoordinate(args.x, 'x');
    assertNormalizedCoordinate(args.y, 'y');

    const sheet = await ctx.db.get(args.sheetId);
    if (sheet === null || sheet.projectId !== args.projectId) {
      throw new Error('Sheet does not belong to this project');
    }
    if (args.assigneeUserId !== undefined) {
      await requireProjectMember(ctx, args.projectId, args.assigneeUserId);
    }

    const project = await ctx.db.get(args.projectId);
    if (project === null) throw new Error('Project not found');
    const now = Date.now();
    const seq = project.nextTaskSeq;
    await ctx.db.patch(project._id, { nextTaskSeq: seq + 1, updatedAt: now });

    return await ctx.db.insert('tasks', {
      projectId: args.projectId,
      sheetId: args.sheetId,
      seq,
      x: args.x,
      y: args.y,
      title: args.title?.trim() ?? '',
      description: args.description?.trim() ?? '',
      status: args.status ?? 'open',
      priority: args.priority ?? 2,
      category: args.category?.trim() || 'general',
      color: args.color,
      assigneeText: args.assigneeText?.trim() || undefined,
      assigneeUserId: args.assigneeUserId,
      dueDate: args.dueDate,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id('tasks'),
    sheetId: v.optional(v.id('sheets')),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    priority: v.optional(taskPriority),
    category: v.optional(v.string()),
    color: v.optional(v.string()),
    assigneeText: v.optional(v.union(v.string(), v.null())),
    assigneeUserId: v.optional(v.union(v.id('users'), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);

    if (args.x !== undefined) assertNormalizedCoordinate(args.x, 'x');
    if (args.y !== undefined) assertNormalizedCoordinate(args.y, 'y');
    if (args.sheetId !== undefined) {
      const sheet = await ctx.db.get(args.sheetId);
      if (sheet === null || sheet.projectId !== task.projectId) {
        throw new Error('Sheet does not belong to this project');
      }
    }
    if (args.assigneeUserId) {
      await requireProjectMember(ctx, task.projectId, args.assigneeUserId);
    }

    const patch: Partial<Doc<'tasks'>> = { updatedAt: Date.now() };
    if (args.sheetId !== undefined) patch.sheetId = args.sheetId;
    if (args.x !== undefined) patch.x = args.x;
    if (args.y !== undefined) patch.y = args.y;
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.color !== undefined) patch.color = args.color;
    if (args.assigneeText !== undefined) {
      patch.assigneeText = args.assigneeText?.trim() || undefined;
    }
    if (args.assigneeUserId !== undefined) {
      patch.assigneeUserId = args.assigneeUserId ?? undefined;
    }
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;

    await ctx.db.patch(task._id, patch);
  },
});
