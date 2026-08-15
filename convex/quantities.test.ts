import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('project quantities', () => {
  it('manages project items, defaults task units, reports quantities, and preserves archived history', async () => {
    const t = convexTest(schema, modules);
    const [ownerId, memberId, viewerId] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.insert('users', { name: 'Owner', email: 'quantity-owner@example.com' }),
        ctx.db.insert('users', { name: 'Member', email: 'quantity-member@example.com' }),
        ctx.db.insert('users', { name: 'Viewer', email: 'quantity-viewer@example.com' }),
      ]),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const viewer = t.withIdentity({ subject: viewerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Quantity report' });
    await t.run(async (ctx) => {
      await ctx.db.insert('projectMembers', {
        projectId,
        userId: memberId,
        role: 'member',
        addedBy: ownerId,
        joinedAt: Date.now(),
      });
      await ctx.db.insert('projectMembers', {
        projectId,
        userId: viewerId,
        role: 'viewer',
        addedBy: ownerId,
        joinedAt: Date.now(),
      });
    });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Level 2',
      number: 'A-102',
      sourceFileRef: '/level-2.pdf',
      pageIndex: 0,
      width: 1000,
      height: 1000,
    });
    const itemId = await owner.mutation(api.quantities.createItem, {
      projectId,
      name: '  Wall   protection ',
      defaultUnit: ' lf ',
    });
    await expect(
      member.mutation(api.quantities.createItem, {
        projectId,
        name: 'Concrete',
        defaultUnit: 'CY',
      }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(
      owner.mutation(api.quantities.createItem, {
        projectId,
        name: 'wall protection',
        defaultUnit: 'SF',
      }),
    ).rejects.toThrow('already exists');

    const taskId = await member.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.5,
      title: 'Corridor walls',
      quantityItemId: itemId,
      plannedQuantity: 120,
      completedQuantity: 40,
    });
    expect((await viewer.query(api.tasks.listByProject, { projectId }))[0].quantityUnit).toBe('LF');
    const report = await viewer.query(api.quantities.getProjectReport, { projectId });
    expect(report[0]).toMatchObject({
      taskId,
      itemName: 'Wall protection',
      quantityUnit: 'LF',
      planNumber: 'A-102',
    });
    expect((await viewer.query(api.quantities.listItems, { projectId }))[0].taskCount).toBe(1);

    const concreteItemId = await owner.mutation(api.quantities.createItem, {
      projectId,
      name: 'Concrete',
      defaultUnit: 'CY',
    });
    const concreteLineId = await member.mutation(api.quantities.addTaskLine, { taskId });
    await member.mutation(api.quantities.updateTaskLine, {
      taskId,
      lineId: concreteLineId,
      quantityItemId: concreteItemId,
      plannedQuantity: 18,
      completedQuantity: 6,
    });
    const taskLines = await viewer.query(api.quantities.listTaskLines, { taskId });
    expect(taskLines).toHaveLength(2);
    expect(taskLines[0]).toMatchObject({
      quantityItemId: itemId,
      plannedQuantity: 120,
      completedQuantity: 40,
      quantityUnit: 'LF',
    });
    expect(taskLines[1]).toMatchObject({
      lineId: concreteLineId,
      quantityItemId: concreteItemId,
      quantityUnit: 'CY',
    });
    const multiLineReport = await viewer.query(api.quantities.getProjectReport, { projectId });
    expect(multiLineReport).toHaveLength(2);
    expect(multiLineReport.find((row) => row.quantityItemId === concreteItemId)).toMatchObject({
      taskId,
      plannedQuantity: 18,
      completedQuantity: 6,
      quantityUnit: 'CY',
    });
    const itemCounts = await viewer.query(api.quantities.listItems, { projectId });
    expect(itemCounts.find((item) => item._id === itemId)?.taskCount).toBe(1);
    expect(itemCounts.find((item) => item._id === concreteItemId)?.taskCount).toBe(1);
    await expect(viewer.mutation(api.quantities.addTaskLine, { taskId })).rejects.toThrow(
      'Insufficient project permissions',
    );

    await owner.mutation(api.quantities.archiveItem, { itemId });
    expect(await viewer.query(api.quantities.listItems, { projectId })).toHaveLength(1);
    expect(
      (await viewer.query(api.quantities.getProjectReport, { projectId })).find(
        (row) => row.quantityItemId === itemId,
      ),
    ).toMatchObject({
      itemName: 'Wall protection',
      itemArchived: true,
    });
    await expect(
      member.mutation(api.tasks.update, { taskId, quantityItemId: itemId }),
    ).rejects.toThrow('does not belong');
  });
});
