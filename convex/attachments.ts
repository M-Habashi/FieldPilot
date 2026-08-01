import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import { consumeUploadClaim, issueUploadClaim } from './lib/uploads';

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

export const listPhotosByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    const attachments = await ctx.db
      .query('attachments')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
    return await Promise.all(
      attachments
        .filter((attachment) => attachment.kind === 'photo')
        .map(async (attachment) => {
          let url: string | null = null;
          try {
            url = await ctx.storage.getUrl(attachment.storageRef);
          } catch {
            // Keep metadata visible if an older development blob is already missing.
          }
          return { attachment, url };
        }),
    );
  },
});

export const generateUploadUrl = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, userId);
    return await issueUploadClaim(ctx, projectId, userId, 'attachment');
  },
});

export const completeUpload = mutation({
  args: {
    taskId: v.id('tasks'),
    kind: v.union(v.literal('photo'), v.literal('file')),
    uploadClaimId: v.id('pendingUploads'),
    storageRef: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const uploadedBy = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, uploadedBy);
    if (args.size < 0) throw new Error('Attachment size cannot be negative');
    const storedFile = await consumeUploadClaim(ctx, {
      uploadClaimId: args.uploadClaimId,
      storageId: args.storageRef,
      projectId: task.projectId,
      userId: uploadedBy,
      purpose: 'attachment',
    });
    const storedContentType = storedFile.contentType ?? args.contentType;
    if (args.kind === 'photo' && !storedContentType.startsWith('image/')) {
      throw new Error('Only image files can be added as photos.');
    }

    return await ctx.db.insert('attachments', {
      projectId: task.projectId,
      taskId: task._id,
      kind: args.kind,
      storageRef: args.storageRef,
      fileName: args.fileName,
      contentType: storedContentType,
      size: storedFile.size,
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
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    try {
      await ctx.storage.delete(attachment.storageRef);
    } catch {
      // Remove stale attachment metadata even if the blob was already deleted.
    }
    await ctx.db.delete(attachmentId);
  },
});
