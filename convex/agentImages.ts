import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { requireProjectMember } from './lib/authz';

const imageState = v.optional(v.union(v.literal('active'), v.literal('trashed'), v.literal('all')));
const assignmentState = v.optional(
  v.union(v.literal('assigned'), v.literal('unassigned'), v.literal('all')),
);
const mapState = v.optional(v.union(v.literal('mapped'), v.literal('unmapped'), v.literal('all')));

async function projectPhotoRows(
  ctx: Parameters<typeof requireProjectMember>[0],
  projectId: Id<'projects'>,
) {
  const [attachments, tasks, memberships] = await Promise.all([
    ctx.db
      .query('attachments')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
  ]);
  const photos = attachments.filter((attachment) => attachment.kind === 'photo');
  const taskById = new Map(tasks.map((task) => [task._id, task]));
  const userIds = [...new Set(memberships.map((membership) => membership.userId))];
  const users = await Promise.all(userIds.map((userId) => ctx.db.get(userId)));
  const userById = new Map(userIds.map((userId, index) => [userId, users[index]]));
  return photos.map((photo) => ({
    photo,
    task: photo.taskId ? taskById.get(photo.taskId) : undefined,
    uploader: userById.get(photo.uploadedBy),
  }));
}

function photoMetadata(
  photo: Doc<'attachments'>,
  task: Doc<'tasks'> | undefined,
  uploader: Doc<'users'> | null | undefined,
) {
  return {
    photoId: photo._id,
    photoUpdatedAt: photo.photoUpdatedAt ?? photo.createdAt,
    fileName: photo.fileName,
    contentType: photo.contentType,
    sizeBytes: photo.size,
    state: photo.deletedAt === undefined ? ('active' as const) : ('trashed' as const),
    assignedTask: task ? { taskNumber: task.seq, title: task.title, color: task.color } : null,
    mapLocation:
      photo.latitude !== undefined && photo.longitude !== undefined
        ? {
            latitude: photo.latitude,
            longitude: photo.longitude,
            source: photo.locationSource,
          }
        : null,
    suggestedLocation:
      photo.suggestedLatitude !== undefined && photo.suggestedLongitude !== undefined
        ? {
            latitude: photo.suggestedLatitude,
            longitude: photo.suggestedLongitude,
            accuracyMeters: photo.suggestedAccuracy,
          }
        : null,
    hasOriginalGps: photo.originalLatitude !== undefined && photo.originalLongitude !== undefined,
    uploadedBy: uploader?.name ?? uploader?.email ?? 'Project member',
    createdAt: photo.createdAt,
    locationUpdatedAt: photo.locationUpdatedAt,
    deletedAt: photo.deletedAt,
  };
}

export const overview = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  handler: async (ctx, { projectId, userId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const rows = await projectPhotoRows(ctx, projectId);
    const active = rows.filter(({ photo }) => photo.deletedAt === undefined);
    const trashed = rows.length - active.length;
    const mapped = active.filter(
      ({ photo }) => photo.latitude !== undefined && photo.longitude !== undefined,
    ).length;
    const assigned = active.filter(({ task }) => task !== undefined).length;
    return {
      total: rows.length,
      active: active.length,
      trashed,
      mapped,
      unmapped: active.length - mapped,
      assigned,
      unassigned: active.length - assigned,
    };
  },
});

export const list = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    state: imageState,
    assignment: assignmentState,
    map: mapState,
    taskNumber: v.optional(v.number()),
    text: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectMember(ctx, args.projectId, args.userId);
    const state = args.state ?? 'active';
    const assignment = args.assignment ?? 'all';
    const map = args.map ?? 'all';
    const text = args.text?.trim().toLocaleLowerCase();
    const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 25), 50));
    const rows = (await projectPhotoRows(ctx, args.projectId))
      .filter(({ photo, task }) => {
        const trashed = photo.deletedAt !== undefined;
        const mapped = photo.latitude !== undefined && photo.longitude !== undefined;
        if (state === 'active' && trashed) return false;
        if (state === 'trashed' && !trashed) return false;
        if (assignment === 'assigned' && !task) return false;
        if (assignment === 'unassigned' && task) return false;
        if (map === 'mapped' && !mapped) return false;
        if (map === 'unmapped' && mapped) return false;
        if (args.taskNumber !== undefined && task?.seq !== args.taskNumber) return false;
        if (text) {
          const searchable = [photo.fileName, photo.contentType, task?.seq, task?.title]
            .filter((value) => value !== undefined)
            .join(' ')
            .toLocaleLowerCase();
          if (!searchable.includes(text)) return false;
        }
        return true;
      })
      .sort((a, b) => b.photo.createdAt - a.photo.createdAt);
    return {
      totalMatches: rows.length,
      truncated: rows.length > limit,
      images: rows
        .slice(0, limit)
        .map(({ photo, task, uploader }) => photoMetadata(photo, task, uploader)),
    };
  },
});

export const details = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    photoId: v.id('attachments'),
  },
  handler: async (ctx, { projectId, userId, photoId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.projectId !== projectId || photo.kind !== 'photo') {
      throw new Error('Photo not found in this project');
    }
    const [task, uploader] = await Promise.all([
      photo.taskId ? ctx.db.get(photo.taskId) : Promise.resolve(null),
      ctx.db.get(photo.uploadedBy),
    ]);
    return photoMetadata(photo, task ?? undefined, uploader);
  },
});

export const analysisSources = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    photoIds: v.array(v.id('attachments')),
  },
  handler: async (ctx, { projectId, userId, photoIds }) => {
    await requireProjectMember(ctx, projectId, userId);
    if (photoIds.length < 1 || photoIds.length > 6) {
      throw new Error('Analyze between one and six photos per call');
    }
    if (new Set(photoIds).size !== photoIds.length) throw new Error('Duplicate photo ids');
    const photos = await Promise.all(photoIds.map((photoId) => ctx.db.get(photoId)));
    return photos.map((photo, index) => {
      if (!photo || photo.projectId !== projectId || photo.kind !== 'photo') {
        throw new Error(`Photo ${index + 1} was not found in this project`);
      }
      if (photo.deletedAt !== undefined) throw new Error(`${photo.fileName} is in the trash`);
      return {
        photoId: photo._id,
        fileName: photo.fileName,
        contentType: photo.contentType,
        sizeBytes: photo.size,
        storageRef: photo.storageRef,
      };
    });
  },
});
