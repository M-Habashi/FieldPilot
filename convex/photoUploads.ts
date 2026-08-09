import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { inspectExifPhotoLocation } from './lib/photoExif';

interface CompletePhotoUploadResult {
  attachmentId: Id<'attachments'>;
  hasExifLocation: boolean;
  exifStatus: 'found' | 'missing' | 'unreadable';
}

export const complete = action({
  args: {
    projectId: v.id('projects'),
    taskId: v.optional(v.id('tasks')),
    storageRef: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    attemptId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CompletePhotoUploadResult> => {
    if ((await ctx.auth.getUserIdentity()) === null) throw new Error('Unauthenticated');

    const { attemptId, ...uploadArgs } = args;
    const file = await ctx.storage.get(uploadArgs.storageRef);
    if (file === null) throw new Error('The uploaded file could not be found.');
    const inspection = await inspectExifPhotoLocation(file);
    const location = inspection.status === 'found' ? inspection.location : null;

    console.info(
      'photo_exif_inspection',
      JSON.stringify({
        attemptId,
        status: inspection.status,
        claimedContentType: uploadArgs.contentType,
        claimedSize: uploadArgs.size,
        storedContentType: file.type || undefined,
        storedSize: file.size,
      }),
    );

    const attachmentId: Id<'attachments'> = await ctx.runMutation(api.attachments.completeUpload, {
      ...uploadArgs,
      kind: 'photo',
      ...(location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            originalLatitude: location.latitude,
            originalLongitude: location.longitude,
            locationSource: 'exif' as const,
          }
        : {}),
    });

    return {
      attachmentId,
      hasExifLocation: location !== null,
      exifStatus: inspection.status,
    };
  },
});
