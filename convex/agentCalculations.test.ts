import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('agent quantity calculations', () => {
  it('matches the Quantities tab math and traces task rows exactly', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Quantity owner', email: 'calc-owner@example.com' }),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Calculation project' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Level 1',
      number: 'A-101',
      sourceFileRef: '/plans/level-1.pdf',
      pageIndex: 0,
      width: 1000,
      height: 800,
    });
    const itemId = await owner.mutation(api.quantities.createItem, {
      projectId,
      name: 'Wall protection',
      defaultUnit: 'LF',
    });
    const task1 = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.2,
      y: 0.2,
      title: 'North corridor',
      quantityItemId: itemId,
      plannedQuantity: 10,
      completedQuantity: 12,
    });
    await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.4,
      y: 0.4,
      title: 'South corridor',
      quantityItemId: itemId,
      plannedQuantity: 10,
      completedQuantity: 4,
    });
    await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.6,
      y: 0.6,
      title: 'Unclassified work',
      completedQuantity: 1,
    });

    const report = await t.query(internal.agentCalculations.report, {
      projectId,
      userId: ownerId,
    });
    expect(report.summary).toEqual({
      itemsTracked: 1,
      quantityRows: 3,
      tasksWithQuantities: 3,
      plansRepresented: 1,
      exceptions: 2,
    });
    expect(report.groups.find((group) => group.item === 'Wall protection')).toMatchObject({
      unit: 'LF',
      planned: 20,
      completed: 16,
      remaining: 6,
      overrun: 2,
      progressPercent: 80,
      tasks: 2,
      plans: 1,
    });
    expect(report.lines.find((line) => line.taskNumber === 1)).toMatchObject({
      remaining: 0,
      overrun: 2,
      percent: 120,
      attentionReasons: ['completed exceeds planned'],
    });

    const zeroPlanLine = await owner.mutation(api.quantities.addTaskLine, { taskId: task1 });
    await owner.mutation(api.quantities.updateTaskLine, {
      taskId: task1,
      lineId: zeroPlanLine,
      quantityItemId: itemId,
      plannedQuantity: 0,
      completedQuantity: 5,
    });
    const task = await t.query(internal.agentCalculations.task, {
      projectId,
      userId: ownerId,
      taskNumber: 1,
    });
    expect(task.quantities).toHaveLength(2);
    expect(task.quantities[1]).toMatchObject({
      lineNumber: 2,
      planned: 0,
      completed: 5,
      remaining: 0,
      overrun: 5,
      percent: 100,
    });

    const catalog = await t.query(internal.agentCalculations.catalog, {
      projectId,
      userId: ownerId,
      includeArchived: false,
    });
    expect(catalog).toMatchObject({
      callerRole: 'owner',
      canEditTaskQuantities: true,
      canManageItems: true,
      items: [{ name: 'Wall protection', defaultUnit: 'LF', taskCount: 2 }],
    });
  });
});
