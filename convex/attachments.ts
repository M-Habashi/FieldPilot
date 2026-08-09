import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';

function nextPhotoUpdatedAt(photo: { photoUpdatedAt?: number }): number {
  return Math.max(Date.now(), (photo.photoUpdatedAt ?? 0) + 1);
}

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    const attachments = await ctx.db
      .query('attachments')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
    return attachments.filter((attachment) => attachment.deletedAt === undefined);
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
        .filter((attachment) => attachment.kind === 'photo' && attachment.deletedAt === undefined)
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

export const listProjectPhotos = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const attachments = await ctx.db
      .query('attachments')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect();
    return await Promise.all(
      attachments
        .filter((attachment) => attachment.kind === 'photo' && attachment.deletedAt === undefined)
        .map(async (attachment) => {
          const [task, url] = await Promise.all([
            attachment.photoMapVersion === 1 && attachment.taskId
              ? ctx.db.get(attachment.taskId)
              : Promise.resolve(null),
            ctx.storage.getUrl(attachment.storageRef).catch(() => null),
          ]);
          return { attachment, task, url };
        }),
    );
  },
});

export const getPhotoMapState = query({
  args: { attachmentId: v.id('attachments') },
  handler: async (ctx, { attachmentId }) => {
    const attachment = await ctx.db.get(attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectMember(ctx, attachment.projectId);
    return { photoUpdatedAt: attachment.photoUpdatedAt };
  },
});

export const generateUploadUrl = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES);
    return await ctx.storage.generateUploadUrl();
  },
});

export const completeUpload = mutation({
  args: {
    projectId: v.optional(v.id('projects')),
    taskId: v.optional(v.id('tasks')),
    kind: v.union(v.literal('photo'), v.literal('file')),
    storageRef: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    originalLatitude: v.optional(v.number()),
    originalLongitude: v.optional(v.number()),
    suggestedLatitude: v.optional(v.number()),
    suggestedLongitude: v.optional(v.number()),
    suggestedAccuracy: v.optional(v.number()),
    locationSource: v.optional(
      v.union(v.literal('exif'), v.literal('manual'), v.literal('device')),
    ),
  },
  handler: async (ctx, args) => {
    const uploadedBy = await requireUser(ctx);
    const task = args.taskId ? await ctx.db.get(args.taskId) : null;
    if (args.taskId && task === null) throw new Error('Task not found');
    const projectId = args.projectId ?? task?.projectId;
    if (!projectId) throw new Error('Choose a project before uploading a photo.');
    if (task && task.projectId !== projectId)
      throw new Error('The task belongs to another project.');
    await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, uploadedBy);
    if (args.size < 0) throw new Error('Attachment size cannot be negative');
    const hasLocation = args.latitude !== undefined || args.longitude !== undefined;
    if (hasLocation && (args.latitude === undefined || args.longitude === undefined)) {
      throw new Error('A photo location needs both latitude and longitude.');
    }
    if (
      (args.latitude !== undefined && (args.latitude < -90 || args.latitude > 90)) ||
      (args.longitude !== undefined && (args.longitude < -180 || args.longitude > 180))
    ) {
      throw new Error('The photo location is outside the valid latitude or longitude range.');
    }
    if (hasLocation && !args.locationSource)
      throw new Error('Choose how the photo location was set.');
    const hasOriginalLocation =
      args.originalLatitude !== undefined || args.originalLongitude !== undefined;
    if (
      hasOriginalLocation &&
      (args.originalLatitude === undefined || args.originalLongitude === undefined)
    ) {
      throw new Error('The original photo location needs both latitude and longitude.');
    }
    const hasSuggestedLocation =
      args.suggestedLatitude !== undefined || args.suggestedLongitude !== undefined;
    if (
      hasSuggestedLocation &&
      (args.suggestedLatitude === undefined || args.suggestedLongitude === undefined)
    ) {
      throw new Error('The suggested photo location needs both latitude and longitude.');
    }
    if (
      hasSuggestedLocation &&
      (args.suggestedLatitude! < -90 ||
        args.suggestedLatitude! > 90 ||
        args.suggestedLongitude! < -180 ||
        args.suggestedLongitude! > 180)
    ) {
      throw new Error('The suggested location is outside the valid latitude or longitude range.');
    }
    const storedFile = await ctx.db.system.get('_storage', args.storageRef);
    if (storedFile === null) throw new Error('The uploaded file could not be found.');
    const [existingSheet, existingAttachment] = await Promise.all([
      ctx.db
        .query('sheets')
        .withIndex('by_sourceStorageId', (q) => q.eq('sourceStorageId', args.storageRef))
        .first(),
      ctx.db
        .query('attachments')
        .withIndex('by_storageRef', (q) => q.eq('storageRef', args.storageRef))
        .first(),
    ]);
    if (existingSheet !== null || existingAttachment !== null) {
      throw new Error('This uploaded file is already in use.');
    }
    const storedContentType = storedFile.contentType ?? args.contentType;
    if (args.kind === 'photo' && !storedContentType.startsWith('image/')) {
      throw new Error('Only image files can be added as photos.');
    }

    const now = Date.now();
    return await ctx.db.insert('attachments', {
      projectId,
      ...(task ? { taskId: task._id } : {}),
      kind: args.kind,
      storageRef: args.storageRef,
      fileName: args.fileName,
      contentType: storedContentType,
      size: storedFile.size,
      uploadedBy,
      createdAt: now,
      ...(args.kind === 'photo' ? { photoMapVersion: 1, photoUpdatedAt: now } : {}),
      ...(hasLocation
        ? {
            latitude: args.latitude,
            longitude: args.longitude,
            locationSource: args.locationSource,
            locationUpdatedAt: now,
          }
        : {}),
      ...(hasOriginalLocation
        ? {
            originalLatitude: args.originalLatitude,
            originalLongitude: args.originalLongitude,
          }
        : {}),
      ...(hasSuggestedLocation
        ? {
            suggestedLatitude: args.suggestedLatitude,
            suggestedLongitude: args.suggestedLongitude,
            suggestedAccuracy: args.suggestedAccuracy,
          }
        : {}),
    });
  },
});

export const setPhotoLocation = mutation({
  args: {
    attachmentId: v.id('attachments'),
    latitude: v.number(),
    longitude: v.number(),
    // 'device' means the user confirmed the device-location suggestion, which
    // is a GPS fix rather than a point picked off the basemap by eye.
    source: v.optional(v.union(v.literal('manual'), v.literal('device'))),
    expectedPhotoUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      args.expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== args.expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    if (
      args.latitude < -90 ||
      args.latitude > 90 ||
      args.longitude < -180 ||
      args.longitude > 180
    ) {
      throw new Error('The photo location is outside the valid latitude or longitude range.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, {
      latitude: args.latitude,
      longitude: args.longitude,
      locationSource: args.source ?? 'manual',
      locationUpdatedAt: now,
      photoUpdatedAt: now,
    });
    return { photoUpdatedAt: now };
  },
});

export const clearPhotoLocation = mutation({
  args: { attachmentId: v.id('attachments'), expectedPhotoUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      args.expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== args.expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, {
      latitude: undefined,
      longitude: undefined,
      locationSource: undefined,
      locationUpdatedAt: undefined,
      photoUpdatedAt: now,
    });
    return { photoUpdatedAt: now };
  },
});

export const restoreOriginalLocation = mutation({
  args: { attachmentId: v.id('attachments'), expectedPhotoUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, { attachmentId, expectedPhotoUpdatedAt }) => {
    const attachment = await ctx.db.get(attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    if (attachment.originalLatitude === undefined || attachment.originalLongitude === undefined) {
      throw new Error('This photo has no original GPS location to restore.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, {
      latitude: attachment.originalLatitude,
      longitude: attachment.originalLongitude,
      locationSource: 'exif',
      locationUpdatedAt: now,
      photoUpdatedAt: now,
    });
    return { photoUpdatedAt: now };
  },
});

export const assignPhoto = mutation({
  args: {
    attachmentId: v.id('attachments'),
    taskId: v.optional(v.id('tasks')),
    expectedPhotoUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      args.expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== args.expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    const task = args.taskId ? await ctx.db.get(args.taskId) : null;
    if (args.taskId && task === null) throw new Error('Task not found');
    if (task && task.projectId !== attachment.projectId) {
      throw new Error('Choose a task in the same project.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, {
      taskId: task?._id,
      photoMapVersion: 1,
      photoUpdatedAt: now,
    });
    return { photoUpdatedAt: now };
  },
});

export const trashPhoto = mutation({
  args: { attachmentId: v.id('attachments'), expectedPhotoUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      args.expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== args.expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, { deletedAt: now, photoUpdatedAt: now });
    return { photoUpdatedAt: now };
  },
});

export const restorePhoto = mutation({
  args: { attachmentId: v.id('attachments'), expectedPhotoUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (attachment === null || attachment.kind !== 'photo') throw new Error('Photo not found');
    await requireProjectRole(ctx, attachment.projectId, CONTENT_EDITOR_ROLES);
    if (
      args.expectedPhotoUpdatedAt !== undefined &&
      attachment.photoUpdatedAt !== args.expectedPhotoUpdatedAt
    ) {
      throw new Error('This photo changed before it could be undone.');
    }
    const now = nextPhotoUpdatedAt(attachment);
    await ctx.db.patch(attachment._id, { deletedAt: undefined, photoUpdatedAt: now });
    return { photoUpdatedAt: now };
  },
});

export const unassignLegacyPhotos = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES);
    const attachments = await ctx.db
      .query('attachments')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect();
    const legacyPhotos = attachments.filter(
      (attachment) => attachment.kind === 'photo' && attachment.photoMapVersion === undefined,
    );
    await Promise.all(
      legacyPhotos.map((attachment) =>
        ctx.db.patch(attachment._id, {
          taskId: undefined,
          photoMapVersion: 1,
          photoUpdatedAt: nextPhotoUpdatedAt(attachment),
        }),
      ),
    );
    return legacyPhotos.length;
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
