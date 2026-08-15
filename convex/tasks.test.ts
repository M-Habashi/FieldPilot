import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

function createTest() {
  return convexTest(schema, modules);
}

type TestInstance = ReturnType<typeof createTest>;

async function seedUser(t: TestInstance, name: string, email: string) {
  return await t.run(async (ctx) => ctx.db.insert('users', { name, email }));
}

async function seedMembership(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  addedBy: Id<'users'>,
  role: 'member' | 'viewer',
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role,
      addedBy,
      joinedAt: Date.now(),
    });
  });
}

async function seedProjectWithSheet(t: TestInstance, ownerId: Id<'users'>) {
  const owner = t.withIdentity({ subject: ownerId });
  const projectId = await owner.mutation(api.projects.create, { name: 'Quantity Project' });
  const sheetId = await owner.mutation(api.sheets.create, {
    projectId,
    name: 'Level 2',
    number: 'A-201',
    sourceFileRef: '/plans/a-201.pdf',
    pageIndex: 0,
    width: 1200,
    height: 800,
  });
  return { owner, projectId, sheetId };
}

describe('task core attributes', () => {
  it('creates, lists, updates, and clears the consistent attribute set', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner', 'owner@example.com');
    const assigneeId = await seedUser(t, 'Field Lead', 'lead@example.com');
    const { owner, projectId, sheetId } = await seedProjectWithSheet(t, ownerId);
    await seedMembership(t, projectId, assigneeId, ownerId, 'member');

    expect(await owner.query(api.projects.listMembers, { projectId })).toEqual([
      { userId: assigneeId, name: 'Field Lead', email: 'lead@example.com', role: 'member' },
      { userId: ownerId, name: 'Owner', email: 'owner@example.com', role: 'owner' },
    ]);

    const taskId = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.25,
      y: 0.75,
      title: 'Install wall protection',
      assigneeText: 'Field Lead',
      assigneeUserId: assigneeId,
      plannedQuantity: 120.5,
      completedQuantity: 40,
      quantityUnit: ' lf ',
      startDate: '2026-08-12',
      dueDate: '2026-08-20',
      locationText: ' Level 2 / Corridor 2A ',
      tags: ['Punch', ' interiors ', 'punch'],
      manpowerCount: 4,
      costMinor: 125050,
      currencyCode: 'usd',
    });

    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({
      plannedQuantity: 120.5,
      completedQuantity: 40,
      quantityUnit: 'lf',
      startDate: '2026-08-12',
      dueDate: '2026-08-20',
      locationText: 'Level 2 / Corridor 2A',
      tags: ['Punch', 'interiors'],
      manpowerCount: 4,
      costMinor: 125050,
      currencyCode: 'USD',
      assigneeUserId: assigneeId,
    });

    await owner.mutation(api.tasks.update, {
      taskId,
      completedQuantity: 128,
      tags: [],
      manpowerCount: null,
      costMinor: null,
      startDate: null,
    });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.completedQuantity).toBe(128);
    expect(task?.tags).toBeUndefined();
    expect(task?.manpowerCount).toBeUndefined();
    expect(task?.costMinor).toBeUndefined();
    expect(task?.startDate).toBeUndefined();
  });

  it('rejects invalid quantities, schedules, costs, and non-member assignees', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner', 'owner@example.com');
    const outsiderId = await seedUser(t, 'Outsider', 'outsider@example.com');
    const { owner, projectId, sheetId } = await seedProjectWithSheet(t, ownerId);

    await expect(
      owner.mutation(api.tasks.create, {
        projectId,
        sheetId,
        x: 0.5,
        y: 0.5,
        plannedQuantity: -1,
      }),
    ).rejects.toThrow('Planned quantity must be a non-negative number');

    await expect(
      owner.mutation(api.tasks.create, {
        projectId,
        sheetId,
        x: 0.5,
        y: 0.5,
        startDate: '2026-08-20',
        dueDate: '2026-08-12',
      }),
    ).rejects.toThrow('Due date cannot be earlier than start date');

    await expect(
      owner.mutation(api.tasks.create, {
        projectId,
        sheetId,
        x: 0.5,
        y: 0.5,
        startDate: '2026-02-30',
      }),
    ).rejects.toThrow('Start date must be a valid calendar date');

    await expect(
      owner.mutation(api.tasks.create, {
        projectId,
        sheetId,
        x: 0.5,
        y: 0.5,
        costMinor: 10.5,
      }),
    ).rejects.toThrow('Cost must be a whole number');

    await expect(
      owner.mutation(api.tasks.create, {
        projectId,
        sheetId,
        x: 0.5,
        y: 0.5,
        assigneeUserId: outsiderId,
      }),
    ).rejects.toThrow('Not authorized for this project');
  });

  it('lets viewers read member options and attributes but not update them', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner', 'owner@example.com');
    const viewerId = await seedUser(t, 'Viewer', 'viewer@example.com');
    const { owner, projectId, sheetId } = await seedProjectWithSheet(t, ownerId);
    await seedMembership(t, projectId, viewerId, ownerId, 'viewer');
    const viewer = t.withIdentity({ subject: viewerId });
    const taskId = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.5,
      plannedQuantity: 10,
      completedQuantity: 2,
      quantityUnit: 'EA',
    });

    expect(await viewer.query(api.projects.listMembers, { projectId })).toHaveLength(2);
    expect(await viewer.query(api.tasks.listByPdf, { sheetId })).toHaveLength(1);
    await expect(
      viewer.mutation(api.tasks.update, { taskId, completedQuantity: 3 }),
    ).rejects.toThrow('Insufficient project permissions');
  });
});
