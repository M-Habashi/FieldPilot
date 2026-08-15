import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { inspectExifPhotoLocation, photoByteFingerprint } from './lib/photoExif';

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
    clientUploadId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CompletePhotoUploadResult> => {
    if ((await ctx.auth.getUserIdentity()) === null) throw new Error('Unauthenticated');

    const { attemptId, ...uploadArgs } = args;
    const file = await ctx.storage.get(uploadArgs.storageRef);
    if (file === null) throw new Error('The uploaded file could not be found.');
    const inspection = await inspectExifPhotoLocation(file);
    const location = inspection.status === 'found' ? inspection.location : null;
    if (attemptId) {
      try {
        await ctx.runMutation(api.photoUploadDiagnostics.record, {
          projectId: uploadArgs.projectId,
          attemptId,
          phase: 'storage-uploaded',
          stage: 'storage-persisted',
          contentType: file.type || uploadArgs.contentType,
          size: file.size,
          exifStatus: inspection.status,
          byteFingerprint: await photoByteFingerprint(file),
        });
      } catch {
        console.warn('photo_stored_diagnostic_failed', JSON.stringify({ attemptId }));
      }
    }

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
    const completedUpload = await ctx.runQuery(internal.attachments.getPhotoUploadStorageRef, {
      attachmentId,
    });
    if (completedUpload.storageRef !== uploadArgs.storageRef) {
      await ctx.storage.delete(uploadArgs.storageRef).catch(() => {
        console.warn(
          'duplicate_photo_storage_cleanup_failed',
          JSON.stringify({ clientUploadId: uploadArgs.clientUploadId }),
        );
      });
    }

    return {
      attachmentId,
      hasExifLocation: location !== null,
      exifStatus: inspection.status,
    };
  },
});
