import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

function createTest() {
  return convexTest(schema, modules);
}

type TestInstance = ReturnType<typeof createTest>;

async function seedUser(t: TestInstance, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', { name, email: `${name.toLocaleLowerCase()}@example.com` }),
  );
}

async function addMember(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  ownerId: Id<'users'>,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'member',
      addedBy: ownerId,
      joinedAt: Date.now(),
    });
  });
}

describe('agent project reads', () => {
  it('returns grounded summaries and filtered tasks only to project members', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner');
    const memberId = await seedUser(t, 'Member');
    const outsiderId = await seedUser(t, 'Outsider');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Agent Project' });
    await addMember(t, projectId, memberId, ownerId);
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Level 2',
      number: 'A-201',
      sourceFileRef: '/plans/a-201.pdf',
      pageIndex: 0,
      width: 1200,
      height: 800,
    });
    await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.25,
      y: 0.4,
      title: 'Close corridor punch items',
      status: 'open',
      priority: 1,
      assigneeText: 'Member',
      dueDate: '2026-08-20',
    });
    await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.6,
      title: 'Verified ceiling grid',
      status: 'verified',
      priority: 3,
      dueDate: '2026-08-10',
    });

    const summary = await t.query(internal.agentData.projectSummary, {
      projectId,
      userId: memberId,
      today: '2026-08-27',
    });
    expect(summary).toMatchObject({
      taskCount: 2,
      sheetCount: 1,
      overdue: 1,
      byStatus: { open: 1, verified: 1 },
      byPriority: { high: 1, low: 1 },
    });

    const search = await t.query(internal.agentData.searchTasks, {
      projectId,
      userId: memberId,
      today: '2026-08-27',
      overdueOnly: true,
      priority: 1,
    });
    expect(search.totalMatches).toBe(1);
    expect(search.tasks[0]).toMatchObject({
      taskNumber: 1,
      title: 'Close corridor punch items',
      overdue: true,
      sheet: { number: 'A-201' },
    });

    await expect(
      t.query(internal.agentData.projectSummary, {
        projectId,
        userId: outsiderId,
        today: '2026-08-27',
      }),
    ).rejects.toThrow('Not authorized for this project');
  });

  it('shares the quantities report logic with the regular project report', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'QuantityOwner');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Quantity Agent' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Floor Plan',
      number: 'A-101',
      sourceFileRef: '/plans/a-101.pdf',
      pageIndex: 0,
      width: 1000,
      height: 800,
    });
    await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.2,
      y: 0.3,
      title: 'Install base',
      plannedQuantity: 100,
      completedQuantity: 35,
      quantityUnit: 'LF',
    });

    const regular = await owner.query(api.quantities.getProjectReport, { projectId });
    const agent = await t.query(internal.agentData.quantityReport, { projectId, userId: ownerId });
    expect(regular).toHaveLength(1);
    expect(agent.lines).toEqual([
      expect.objectContaining({
        taskNumber: 1,
        planned: 100,
        completed: 35,
        remaining: 65,
        unit: 'LF',
      }),
    ]);
  });
});
