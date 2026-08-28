import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { PHOTO_TRASH_RETENTION_MS } from './attachments';
import schema from './schema';
import { modules } from './test.setup';

describe('photo trash retention', () => {
  it('permanently removes only photos that have spent at least 30 days in trash', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Trash Owner', email: 'trash-owner@example.com' }),
    );
    const projectId = await t.run(async (ctx) =>
      ctx.db.insert('projects', {
        name: 'Trash Retention',
        createdBy: ownerId,
        nextTaskSeq: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const seeded = await t.run(async (ctx) => {
      const [expiredStorage, boundaryStorage, recentStorage, activeStorage, fileStorage] =
        await Promise.all([
          ctx.storage.store(new Blob(['expired'], { type: 'image/jpeg' })),
          ctx.storage.store(new Blob(['boundary'], { type: 'image/jpeg' })),
          ctx.storage.store(new Blob(['recent'], { type: 'image/jpeg' })),
          ctx.storage.store(new Blob(['active'], { type: 'image/jpeg' })),
          ctx.storage.store(new Blob(['file'], { type: 'application/pdf' })),
        ]);
      const insert = async (
        storageRef: typeof expiredStorage,
        fileName: string,
        kind: 'photo' | 'file',
        deletedAt?: number,
      ) =>
        await ctx.db.insert('attachments', {
          projectId,
          kind,
          storageRef,
          fileName,
          contentType: kind === 'photo' ? 'image/jpeg' : 'application/pdf',
          size: 8,
          uploadedBy: ownerId,
          createdAt: now - PHOTO_TRASH_RETENTION_MS - 1,
          deletedAt,
        });
      return {
        expiredId: await insert(
          expiredStorage,
          'expired.jpg',
          'photo',
          now - PHOTO_TRASH_RETENTION_MS - 1,
        ),
        boundaryId: await insert(
          boundaryStorage,
          'boundary.jpg',
          'photo',
          now - PHOTO_TRASH_RETENTION_MS,
        ),
        recentId: await insert(
          recentStorage,
          'recent.jpg',
          'photo',
          now - PHOTO_TRASH_RETENTION_MS + 60_000,
        ),
        activeId: await insert(activeStorage, 'active.jpg', 'photo'),
        fileId: await insert(
          fileStorage,
          'archived.pdf',
          'file',
          now - PHOTO_TRASH_RETENTION_MS - 1,
        ),
        expiredStorage,
        boundaryStorage,
        recentStorage,
        activeStorage,
        fileStorage,
      };
    });

    const result = await t.mutation(internal.attachments.purgeExpiredTrashedPhotos, {});

    expect(result).toMatchObject({ deleted: 2, missingStorageObjects: 0, hasMore: false });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(seeded.expiredId)).toBeNull();
      expect(await ctx.db.get(seeded.boundaryId)).toBeNull();
      expect(await ctx.db.get(seeded.recentId)).not.toBeNull();
      expect(await ctx.db.get(seeded.activeId)).not.toBeNull();
      expect(await ctx.db.get(seeded.fileId)).not.toBeNull();
      expect(await ctx.db.system.get('_storage', seeded.expiredStorage)).toBeNull();
      expect(await ctx.db.system.get('_storage', seeded.boundaryStorage)).toBeNull();
      expect(await ctx.db.system.get('_storage', seeded.recentStorage)).not.toBeNull();
      expect(await ctx.db.system.get('_storage', seeded.activeStorage)).not.toBeNull();
      expect(await ctx.db.system.get('_storage', seeded.fileStorage)).not.toBeNull();
    });
  });
});
