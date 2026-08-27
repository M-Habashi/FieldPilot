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
});
