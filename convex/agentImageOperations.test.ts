import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('agent image writes', () => {
  it('changes only mutable photo fields and restores them through atomic Undo', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Image Writer', email: 'image-writer@example.com' }),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Image Writes' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Image sheet',
      number: 'I-101',
      sourceFileRef: '/plans/image.pdf',
      pageIndex: 0,
      width: 1000,
      height: 800,
    });
    const taskId = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.4,
      y: 0.5,
      title: 'Image target',
    });
    const { bindingId, photoId, createdAt, version } = await t.run(async (ctx) => {
      const now = Date.now();
      const storageRef = await ctx.storage.store(new Blob(['pixels'], { type: 'image/jpeg' }));
      const photoId = await ctx.db.insert('attachments', {
        projectId,
        kind: 'photo',
        storageRef,
        fileName: 'site.jpg',
        contentType: 'image/jpeg',
        size: 6,
        uploadedBy: ownerId,
        createdAt: now,
        originalLatitude: 39.6,
        originalLongitude: -86.2,
        photoMapVersion: 1,
        photoUpdatedAt: now,
      });
      const bindingId = await ctx.db.insert('agentThreadBindings', {
        projectId,
        userId: ownerId,
        clientThreadId: 'image-client',
        componentThreadId: 'image-component',
        runStatus: 'idle',
        createdAt: now,
        updatedAt: now,
      });
      return { bindingId, photoId, createdAt: now, version: now };
    });

    const receipt = await t.mutation(internal.agentOperations.changeImageData, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'image-job-1',
      toolCallId: 'image-tool-1',
      changes: [
        {
          photoId,
          photoUpdatedAt: version,
          fileName: 'renamed.jpg',
          taskNumber: 1,
          location: { latitude: 40, longitude: -85 },
          suggestedLocation: { latitude: 40.1, longitude: -85.1, accuracyMeters: 12 },
          trashed: true,
        },
      ],
    });
    expect(receipt).toMatchObject({ undoAvailable: true, jobId: 'image-job-1' });
    expect(await t.run(async (ctx) => ctx.db.get(photoId))).toMatchObject({
      taskId,
      fileName: 'renamed.jpg',
      latitude: 40,
      longitude: -85,
      locationSource: 'manual',
      originalLatitude: 39.6,
      originalLongitude: -86.2,
      createdAt,
      suggestedLatitude: 40.1,
      suggestedLongitude: -85.1,
      suggestedAccuracy: 12,
      deletedAt: expect.any(Number),
    });

    await owner.mutation(api.agentOperations.undoJob, {
      projectId,
      jobId: 'image-job-1',
    });
    const restored = await t.run(async (ctx) => ctx.db.get(photoId));
    expect(restored).toMatchObject({
      originalLatitude: 39.6,
      originalLongitude: -86.2,
      fileName: 'site.jpg',
      createdAt,
      photoUpdatedAt: version,
    });
    expect(restored?.taskId).toBeUndefined();
    expect(restored?.latitude).toBeUndefined();
    expect(restored?.longitude).toBeUndefined();
    expect(restored?.suggestedLatitude).toBeUndefined();
    expect(restored?.suggestedLongitude).toBeUndefined();
    expect(restored?.deletedAt).toBeUndefined();

    await expect(
      t.mutation(internal.agentOperations.deleteImagesPermanently, {
        projectId,
        userId: ownerId,
        bindingId,
        jobId: 'image-delete-active',
        toolCallId: 'image-delete-active-tool',
        photos: [{ photoId, photoUpdatedAt: version, confirmFileName: 'site.jpg' }],
      }),
    ).rejects.toThrow('must be moved to trash');

    const trashed = await t.mutation(internal.agentOperations.changeImageData, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'image-trash-before-delete',
      toolCallId: 'image-trash-before-delete-tool',
      changes: [{ photoId, photoUpdatedAt: version, trashed: true }],
    });
    const trashedPhoto = await t.run(async (ctx) => ctx.db.get(photoId));
    const deleted = await t.mutation(internal.agentOperations.deleteImagesPermanently, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'image-delete-final',
      toolCallId: 'image-delete-final-tool',
      photos: [
        {
          photoId,
          photoUpdatedAt: trashedPhoto!.photoUpdatedAt!,
          confirmFileName: 'site.jpg',
        },
      ],
    });
    expect(trashed).toMatchObject({ undoAvailable: true });
    expect(deleted).toMatchObject({ undoAvailable: false });
    expect(await t.run(async (ctx) => ctx.db.get(photoId))).toBeNull();
    await expect(
      owner.mutation(api.agentOperations.undoJob, {
        projectId,
        jobId: 'image-delete-final',
      }),
    ).rejects.toThrow('cannot be undone');
  });
});
