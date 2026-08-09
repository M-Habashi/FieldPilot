import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { extractExifPhotoLocation } from './lib/photoExif';

interface CompletePhotoUploadResult {
  attachmentId: Id<'attachments'>;
  hasExifLocation: boolean;
}

export const complete = action({
  args: {
    projectId: v.id('projects'),
    taskId: v.optional(v.id('tasks')),
    storageRef: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<CompletePhotoUploadResult> => {
    if ((await ctx.auth.getUserIdentity()) === null) throw new Error('Unauthenticated');

    const file = await ctx.storage.get(args.storageRef);
    if (file === null) throw new Error('The uploaded file could not be found.');
    const location = await extractExifPhotoLocation(file);

    const attachmentId: Id<'attachments'> = await ctx.runMutation(api.attachments.completeUpload, {
      ...args,
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

    return { attachmentId, hasExifLocation: location !== null };
  },
});
