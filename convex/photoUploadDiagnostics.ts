import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireProjectMember } from './lib/authz';

const phase = v.union(
  v.literal('selected'),
  v.literal('storage-uploaded'),
  v.literal('completed'),
  v.literal('failed'),
);

const stage = v.union(
  v.literal('selection'),
  v.literal('upload-url'),
  v.literal('storage-upload'),
  v.literal('backend-complete'),
  v.literal('post-complete'),
);

function bounded(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

export const record = mutation({
  args: {
    projectId: v.id('projects'),
    attemptId: v.string(),
    phase,
    stage: v.optional(stage),
    contentType: v.optional(v.string()),
    extension: v.optional(v.string()),
    size: v.optional(v.number()),
    fileNamePattern: v.optional(
      v.union(v.literal('numeric'), v.literal('img-prefixed'), v.literal('other')),
    ),
    lastModifiedAgeMs: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    platform: v.optional(v.string()),
    effectiveConnectionType: v.optional(v.string()),
    online: v.optional(v.boolean()),
    httpStatus: v.optional(v.number()),
    exifStatus: v.optional(
      v.union(v.literal('found'), v.literal('missing'), v.literal('unreadable')),
    ),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireProjectMember(ctx, args.projectId);
    const now = Date.now();
    const event = {
      ...args,
      attemptId: bounded(args.attemptId, 80) ?? 'invalid',
      contentType: bounded(args.contentType, 100),
      extension: bounded(args.extension, 16),
      userAgent: bounded(args.userAgent, 320),
      platform: bounded(args.platform, 80),
      effectiveConnectionType: bounded(args.effectiveConnectionType, 24),
      errorName: bounded(args.errorName, 80),
      errorMessage: bounded(args.errorMessage, 240),
      userId: membership.userId,
      createdAt: now,
    };

    const eventId = await ctx.db.insert('photoUploadDiagnostics', event);

    // Diagnostics contain no photo bytes, coordinates, or complete filename.
    // Opportunistically remove old rows so this temporary support trail does
    // not become a permanent device history.
    const expired = await ctx.db
      .query('photoUploadDiagnostics')
      .withIndex('by_project_createdAt', (q) =>
        q.eq('projectId', args.projectId).lt('createdAt', now - 30 * 24 * 60 * 60 * 1_000),
      )
      .take(25);
    await Promise.all(expired.map(async (entry) => await ctx.db.delete(entry._id)));

    console.info(
      'photo_upload_diagnostic',
      JSON.stringify({
        attemptId: event.attemptId,
        phase: event.phase,
        stage: event.stage,
        contentType: event.contentType,
        extension: event.extension,
        size: event.size,
        fileNamePattern: event.fileNamePattern,
        httpStatus: event.httpStatus,
        exifStatus: event.exifStatus,
        errorName: event.errorName,
      }),
    );
    return eventId;
  },
});
