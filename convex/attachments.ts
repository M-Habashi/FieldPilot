import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireProjectMember, requireUser } from './lib/authz';

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    return await ctx.db
      .query('attachments')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
  },
});

export const generateUploadUrl = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const completeUpload = mutation({
  args: {
    taskId: v.id('tasks'),
    kind: v.union(v.literal('photo'), v.literal('file')),
    storageRef: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const uploadedBy = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId, uploadedBy);
    if (args.size < 0) throw new Error('Attachment size cannot be negative');

    return await ctx.db.insert('attachments', {
      projectId: task.projectId,
      taskId: task._id,
      kind: args.kind,
      storageRef: args.storageRef,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      uploadedBy,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { attachmentId: v.id('attachments') },
  handler: async (ctx, { attachmentId }) => {
    const attachment = await ctx.db.get(attachmentId);
    if (attachment === null) throw new Error('Attachment not found');
    await requireProjectMember(ctx, attachment.projectId);
    try {
      await ctx.storage.delete(attachment.storageRef as Id<'_storage'>);
    } catch {
      // Remove stale attachment metadata even if the blob was already deleted.
    }
    await ctx.db.delete(attachmentId);
  },
});
