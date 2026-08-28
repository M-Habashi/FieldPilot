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

async function seedBinding(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  suffix: string,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('agentThreadBindings', {
      projectId,
      userId,
      clientThreadId: `client-${suffix}`,
      componentThreadId: `component-${suffix}`,
      runStatus: 'idle',
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function seedProjectTask(t: TestInstance, ownerId: Id<'users'>) {
  const owner = t.withIdentity({ subject: ownerId });
  const projectId = await owner.mutation(api.projects.create, { name: 'Agent Writes' });
  const sheetId = await owner.mutation(api.sheets.create, {
    projectId,
    name: 'Level 1',
    number: 'A-101',
    sourceFileRef: '/plans/a-101.pdf',
    pageIndex: 0,
    width: 1000,
    height: 800,
  });
  const taskId = await owner.mutation(api.tasks.create, {
    projectId,
    sheetId,
    x: 0.2,
    y: 0.3,
    title: 'Original task',
    status: 'open',
    priority: 2,
  });
  return { owner, projectId, sheetId, taskId };
}

describe('agent write operations', () => {
  it('re-checks the current project role when an approved tool executes', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'RoleOwner');
    const viewerId = await seedUser(t, 'RoleViewer');
    const { projectId } = await seedProjectTask(t, ownerId);
    await t.run(async (ctx) => {
      await ctx.db.insert('projectMembers', {
        projectId,
        userId: viewerId,
        role: 'viewer',
        addedBy: ownerId,
        joinedAt: Date.now(),
      });
    });
    const bindingId = await seedBinding(t, projectId, viewerId, 'viewer');

    await expect(
      t.mutation(internal.agentOperations.updateTask, {
        projectId,
        userId: viewerId,
        bindingId,
        toolCallId: 'viewer-write',
        taskNumber: 1,
        status: 'done',
      }),
    ).rejects.toThrow('Insufficient project permissions');
  });

  it('executes an approved task update once and safely undoes it', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'update');
    const args = {
      projectId,
      userId: ownerId,
      bindingId,
      toolCallId: 'tool-update-1',
      taskNumber: 1,
      status: 'in-progress' as const,
      priority: 1 as const,
    };

    const first = await t.mutation(internal.agentOperations.updateTask, args);
    const retry = await t.mutation(internal.agentOperations.updateTask, args);
    expect(retry.operationId).toBe(first.operationId);
    expect((await t.run(async (ctx) => ctx.db.get(taskId)))?.status).toBe('in-progress');
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('agentOperations')
          .withIndex('by_binding_tool_call', (q) =>
            q.eq('threadBindingId', bindingId).eq('toolCallId', 'tool-update-1'),
          )
          .collect(),
      ),
    ).toHaveLength(1);

    await owner.mutation(api.agentOperations.undo, { operationId: first.operationId });
    const restored = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(restored).toMatchObject({ status: 'open', priority: 2 });
    expect(await t.run(async (ctx) => ctx.db.get(first.operationId))).toMatchObject({
      status: 'undone',
    });
  });

  it('adds one note for a retried tool call and removes it through Undo', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'NoteOwner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'note');
    const args = {
      projectId,
      userId: ownerId,
      bindingId,
      toolCallId: 'tool-note-1',
      taskNumber: 1,
      text: 'Check the installed backing before close-in.',
    };
    const first = await t.mutation(internal.agentOperations.addTaskNote, args);
    await t.mutation(internal.agentOperations.addTaskNote, args);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('notes')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toHaveLength(1);

    await owner.mutation(api.agentOperations.undo, { operationId: first.operationId });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('notes')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toEqual([]);
  });

  it('does not insert a task until placement and makes the placement idempotent', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'PlacementOwner');
    const { owner, projectId, sheetId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'placement');
    const prepared = await t.mutation(internal.agentOperations.prepareTaskPlacement, {
      projectId,
      userId: ownerId,
      bindingId,
      toolCallId: 'tool-create-1',
      sheetNumber: 'A-101',
      title: 'Place firestopping pin',
      priority: 1,
      dueDate: '2026-09-01',
    });
    expect(prepared.status).toBe('awaiting-placement');
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('tasks')
          .withIndex('by_project', (q) => q.eq('projectId', projectId))
          .collect(),
      ),
    ).toHaveLength(1);

    const placed = await owner.mutation(api.agentOperations.placeTask, {
      operationId: prepared.operationId,
      sheetId,
      x: 0.75,
      y: 0.6,
    });
    const retried = await owner.mutation(api.agentOperations.placeTask, {
      operationId: prepared.operationId,
      sheetId,
      x: 0.75,
      y: 0.6,
    });
    expect(retried.taskId).toBe(placed.taskId);
    expect(await t.run(async (ctx) => ctx.db.get(placed.taskId))).toMatchObject({
      title: 'Place firestopping pin',
      sheetId,
      x: 0.75,
      y: 0.6,
      priority: 1,
    });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('tasks')
          .withIndex('by_project', (q) => q.eq('projectId', projectId))
          .collect(),
      ),
    ).toHaveLength(2);
  });

  it('changes broad project data in one batch and restores the entire batch through one Undo', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'BroadOwner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'broad-change');
    await owner.mutation(api.quantities.createItem, {
      projectId,
      name: 'Concrete',
      defaultUnit: 'CY',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('taskAttributeDefinitions', {
        projectId,
        name: 'Inspection required',
        type: 'boolean',
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      });
    });

    const receipt = await t.mutation(internal.agentOperations.changeProjectData, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'job-broad-1',
      toolCallId: 'tool-broad-1',
      changes: [
        {
          kind: 'update_task',
          taskNumber: 1,
          title: 'Renamed by AI',
          color: 'red',
          startDate: '2026-08-28',
          dueDate: '2026-09-04',
          tags: ['closeout', 'priority'],
          manpowerCount: 4,
          costMinor: 12500,
          currencyCode: 'usd',
          customAttributes: [{ name: 'Inspection required', value: true }],
        },
        {
          kind: 'set_task_quantity',
          taskNumber: 1,
          quantityItemName: 'Concrete',
          plannedQuantity: 12,
          completedQuantity: 3,
        },
        { kind: 'add_task_note', taskNumber: 1, text: 'AI-created coordination note.' },
        { kind: 'update_project', name: 'Agent Writes Renamed', code: 'AWR' },
      ],
    });

    expect(receipt).toMatchObject({ jobId: 'job-broad-1', undoAvailable: true });
    expect(await t.run(async (ctx) => ctx.db.get(taskId))).toMatchObject({
      title: 'Renamed by AI',
      color: '#dc2626',
      startDate: '2026-08-28',
      dueDate: '2026-09-04',
      tags: ['closeout', 'priority'],
      manpowerCount: 4,
      costMinor: 12500,
      currencyCode: 'USD',
      plannedQuantity: 12,
      completedQuantity: 3,
    });
    expect((await t.run(async (ctx) => ctx.db.get(projectId)))?.name).toBe('Agent Writes Renamed');
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('notes')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toHaveLength(1);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('taskAttributeValues')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toHaveLength(1);

    await owner.mutation(api.agentOperations.undoJob, { projectId, jobId: 'job-broad-1' });

    expect(await t.run(async (ctx) => ctx.db.get(taskId))).toMatchObject({
      title: 'Original task',
      status: 'open',
      priority: 2,
    });
    const restoredTask = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(restoredTask?.color).toBeUndefined();
    expect(restoredTask?.plannedQuantity).toBeUndefined();
    expect(restoredTask?.completedQuantity).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.get(projectId)))?.name).toBe('Agent Writes');
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('notes')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toEqual([]);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('taskAttributeValues')
          .withIndex('by_task', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toEqual([]);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('taskActivityEvents')
          .withIndex('by_task_createdAt', (q) => q.eq('taskId', taskId))
          .collect(),
      ),
    ).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.get(receipt.operationId))).toMatchObject({
      status: 'undone',
    });
  });

  it('groups multiple tool calls from one AI job into one atomic Undo step', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'GroupedOwner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'grouped-change');
    const shared = { projectId, userId: ownerId, bindingId, jobId: 'job-grouped-1' };

    const first = await t.mutation(internal.agentOperations.changeProjectData, {
      ...shared,
      toolCallId: 'tool-grouped-1',
      changes: [{ kind: 'update_task', taskNumber: 1, title: 'First AI edit' }],
    });
    const second = await t.mutation(internal.agentOperations.changeProjectData, {
      ...shared,
      toolCallId: 'tool-grouped-2',
      changes: [{ kind: 'update_task', taskNumber: 1, color: '#2563eb', status: 'done' }],
    });
    expect(await t.run(async (ctx) => ctx.db.get(taskId))).toMatchObject({
      title: 'First AI edit',
      color: '#2563eb',
      status: 'done',
    });

    await owner.mutation(api.agentOperations.undoJob, { projectId, jobId: 'job-grouped-1' });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({ title: 'Original task', status: 'open' });
    expect(task?.color).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.get(first.operationId))).toMatchObject({
      status: 'undone',
    });
    expect(await t.run(async (ctx) => ctx.db.get(second.operationId))).toMatchObject({
      status: 'undone',
    });
  });

  it('refuses the whole grouped Undo when newer work would be overwritten', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'ConflictOwner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'conflict-change');
    const shared = { projectId, userId: ownerId, bindingId, jobId: 'job-conflict-1' };
    const projectChange = await t.mutation(internal.agentOperations.changeProjectData, {
      ...shared,
      toolCallId: 'tool-conflict-project',
      changes: [{ kind: 'update_project', name: 'AI Project Name' }],
    });
    const taskChange = await t.mutation(internal.agentOperations.changeProjectData, {
      ...shared,
      toolCallId: 'tool-conflict-task',
      changes: [{ kind: 'update_task', taskNumber: 1, title: 'AI Task Name' }],
    });
    await owner.mutation(api.tasks.update, { taskId, status: 'verified' });

    await expect(
      owner.mutation(api.agentOperations.undoJob, { projectId, jobId: 'job-conflict-1' }),
    ).rejects.toThrow('changed after the AI job');

    expect(await t.run(async (ctx) => ctx.db.get(taskId))).toMatchObject({
      title: 'AI Task Name',
      status: 'verified',
    });
    expect((await t.run(async (ctx) => ctx.db.get(projectId)))?.name).toBe('AI Project Name');
    expect(await t.run(async (ctx) => ctx.db.get(projectChange.operationId))).toMatchObject({
      status: 'executed',
    });
    expect(await t.run(async (ctx) => ctx.db.get(taskChange.operationId))).toMatchObject({
      status: 'executed',
    });
  });

  it('can undo an AI-created task after the user places its pin', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'CreatedTaskOwner');
    const { owner, projectId, sheetId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'created-task-undo');
    const prepared = await t.mutation(internal.agentOperations.prepareTaskPlacement, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'job-create-1',
      toolCallId: 'tool-create-undo-1',
      sheetNumber: 'A-101',
      title: 'Temporary AI task',
      color: '#16a34a',
      manpowerCount: 2,
    });
    const placed = await owner.mutation(api.agentOperations.placeTask, {
      operationId: prepared.operationId,
      sheetId,
      x: 0.4,
      y: 0.5,
    });
    expect(await t.run(async (ctx) => ctx.db.get(placed.taskId))).toMatchObject({
      title: 'Temporary AI task',
      color: '#16a34a',
      manpowerCount: 2,
    });

    await owner.mutation(api.agentOperations.undoJob, { projectId, jobId: 'job-create-1' });

    expect(await t.run(async (ctx) => ctx.db.get(placed.taskId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(prepared.operationId))).toMatchObject({
      status: 'undone',
    });
  });

  it('removes quantity rows, archives catalog items, and restores both with one Undo', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'CalculationOwner');
    const { owner, projectId, taskId } = await seedProjectTask(t, ownerId);
    const bindingId = await seedBinding(t, projectId, ownerId, 'calculation-change');
    const itemId = await owner.mutation(api.quantities.createItem, {
      projectId,
      name: 'Concrete',
      defaultUnit: 'CY',
    });
    await owner.mutation(api.quantities.updateTaskLine, {
      taskId,
      quantityItemId: itemId,
      plannedQuantity: 12,
      completedQuantity: 3,
    });
    const secondLineId = await owner.mutation(api.quantities.addTaskLine, { taskId });
    await owner.mutation(api.quantities.updateTaskLine, {
      taskId,
      lineId: secondLineId,
      quantityItemId: itemId,
      plannedQuantity: 5,
      completedQuantity: 1,
    });

    await t.mutation(internal.agentOperations.changeProjectData, {
      projectId,
      userId: ownerId,
      bindingId,
      jobId: 'job-calculation-1',
      toolCallId: 'tool-calculation-1',
      changes: [
        { kind: 'remove_task_quantity', taskNumber: 1, lineNumber: 2 },
        { kind: 'archive_quantity_item', itemName: 'Concrete' },
      ],
    });

    expect(await owner.query(api.quantities.listTaskLines, { taskId })).toHaveLength(1);
    expect(await owner.query(api.quantities.listItems, { projectId })).toEqual([]);

    await owner.mutation(api.agentOperations.undoJob, {
      projectId,
      jobId: 'job-calculation-1',
    });

    expect(await owner.query(api.quantities.listTaskLines, { taskId })).toHaveLength(2);
    expect(await owner.query(api.quantities.listItems, { projectId })).toEqual([
      expect.objectContaining({ _id: itemId, name: 'Concrete', defaultUnit: 'CY' }),
    ]);
  });
});
