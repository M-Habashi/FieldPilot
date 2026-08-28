import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('agent image reads', () => {
  it('reports project-wide photos, including unassigned and trashed records', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Photo Owner', email: 'photos@example.com' }),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Photo Project' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Photo sheet',
      number: 'P-101',
      sourceFileRef: '/plans/photo.pdf',
      pageIndex: 0,
      width: 1000,
      height: 800,
    });
    const taskId = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.2,
      y: 0.3,
      title: 'Photo task',
    });
    const [assignedId, unassignedId, trashedId] = await t.run(async (ctx) => {
      const storageIds = await Promise.all([
        ctx.storage.store(new Blob(['one'], { type: 'image/jpeg' })),
        ctx.storage.store(new Blob(['two'], { type: 'image/jpeg' })),
        ctx.storage.store(new Blob(['three'], { type: 'image/jpeg' })),
      ]);
      const now = Date.now();
      return await Promise.all([
        ctx.db.insert('attachments', {
          projectId,
          taskId,
          kind: 'photo',
          storageRef: storageIds[0],
          fileName: 'assigned.jpg',
          contentType: 'image/jpeg',
          size: 3,
          uploadedBy: ownerId,
          createdAt: now,
          latitude: 39.7,
          longitude: -86.1,
          originalLatitude: 39.6,
          originalLongitude: -86.2,
          locationSource: 'manual',
          photoMapVersion: 1,
          photoUpdatedAt: now,
        }),
        ctx.db.insert('attachments', {
          projectId,
          kind: 'photo',
          storageRef: storageIds[1],
          fileName: 'unassigned.jpg',
          contentType: 'image/jpeg',
          size: 3,
          uploadedBy: ownerId,
          createdAt: now + 1,
          photoMapVersion: 1,
          photoUpdatedAt: now + 1,
        }),
        ctx.db.insert('attachments', {
          projectId,
          kind: 'photo',
          storageRef: storageIds[2],
          fileName: 'trashed.jpg',
          contentType: 'image/jpeg',
          size: 5,
          uploadedBy: ownerId,
          createdAt: now + 2,
          deletedAt: now + 3,
          photoMapVersion: 1,
          photoUpdatedAt: now + 3,
        }),
      ]);
    });

    expect(await t.query(internal.agentImages.overview, { projectId, userId: ownerId })).toEqual({
      total: 3,
      active: 2,
      trashed: 1,
      mapped: 1,
      unmapped: 1,
      assigned: 1,
      unassigned: 1,
    });
    const listed = await t.query(internal.agentImages.list, {
      projectId,
      userId: ownerId,
      state: 'all',
    });
    expect(listed.totalMatches).toBe(3);
    expect(listed.images.map((image) => image.photoId)).toEqual([
      trashedId,
      unassignedId,
      assignedId,
    ]);
    const details = await t.query(internal.agentImages.details, {
      projectId,
      userId: ownerId,
      photoId: assignedId,
    });
    expect(details).toMatchObject({
      fileName: 'assigned.jpg',
      hasOriginalGps: true,
      assignedTask: { taskNumber: 1, title: 'Photo task' },
      mapLocation: { latitude: 39.7, longitude: -86.1 },
    });
    expect(details).not.toHaveProperty('originalLatitude');

    await expect(
      t.query(internal.agentImages.analysisSources, {
        projectId,
        userId: ownerId,
        photoIds: [trashedId],
      }),
    ).rejects.toThrow('is in the trash');
  });
});
