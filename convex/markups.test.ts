import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

const data = {
  type: 'line' as const,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.7 },
  ],
  text: '',
  stroke: '#dc2626',
  fill: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 14,
};

describe('shared plan markups', () => {
  it('persists editable markups and calibration while enforcing project roles', async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Owner', email: 'owner@example.com' });
      const viewerId = await ctx.db.insert('users', {
        name: 'Viewer',
        email: 'viewer@example.com',
      });
      const now = Date.now();
      const projectId = await ctx.db.insert('projects', {
        name: 'Markup project',
        createdBy: ownerId,
        nextTaskSeq: 1,
        createdAt: now,
        updatedAt: now,
      });
      await Promise.all([
        ctx.db.insert('projectMembers', {
          projectId,
          userId: ownerId,
          role: 'owner',
          addedBy: ownerId,
          joinedAt: now,
        }),
        ctx.db.insert('projectMembers', {
          projectId,
          userId: viewerId,
          role: 'viewer',
          addedBy: ownerId,
          joinedAt: now,
        }),
      ]);
      const sheetId = await ctx.db.insert('sheets', {
        projectId,
        name: 'A1',
        number: 'A1',
        sourceFileRef: '/demo/demo-plan.pdf',
        pageIndex: 0,
        width: 612,
        height: 792,
        version: 1,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      });
      return { ownerId, viewerId, projectId, sheetId };
    });
    const owner = t.withIdentity({ subject: seeded.ownerId });
    const viewer = t.withIdentity({ subject: seeded.viewerId });

    await owner.mutation(api.markups.save, {
      projectId: seeded.projectId,
      sheetId: seeded.sheetId,
      clientId: 'markup-1',
      data,
    });
    await owner.mutation(api.markups.save, {
      projectId: seeded.projectId,
      sheetId: seeded.sheetId,
      clientId: 'markup-1',
      data: { ...data, stroke: '#2563eb' },
    });

    const rows = await viewer.query(api.markups.listByPdf, { sheetId: seeded.sheetId });
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe(1);
    expect(rows[0].markup.data.stroke).toBe('#2563eb');
    await expect(
      viewer.mutation(api.markups.save, {
        projectId: seeded.projectId,
        sheetId: seeded.sheetId,
        clientId: 'forbidden',
        data,
      }),
    ).rejects.toThrow('Insufficient project permissions');

    const calibration = {
      unitsPerPoint: 0.125,
      unit: 'ft' as const,
      referenceLength: 10,
      calibratedAt: Date.now(),
    };
    await owner.mutation(api.markups.setCalibration, { sheetId: seeded.sheetId, calibration });
    const workspace = await viewer.query(api.sheets.getPdfWorkspace, { sheetId: seeded.sheetId });
    expect(workspace.primary.calibration).toEqual(calibration);

    await owner.mutation(api.markups.remove, {
      projectId: seeded.projectId,
      clientId: 'markup-1',
    });
    expect(await owner.query(api.markups.listByPdf, { sheetId: seeded.sheetId })).toEqual([]);
  });
});
