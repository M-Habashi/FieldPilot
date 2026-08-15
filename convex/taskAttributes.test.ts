import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

function createTest() {
  return convexTest(schema, modules);
}

const builtInLayout = [
  { kind: 'builtin' as const, key: 'plan' as const, visible: true },
  { kind: 'builtin' as const, key: 'location' as const, visible: true },
  { kind: 'builtin' as const, key: 'startDate' as const, visible: true },
  { kind: 'builtin' as const, key: 'dueDate' as const, visible: true },
  { kind: 'builtin' as const, key: 'manpower' as const, visible: true },
  { kind: 'builtin' as const, key: 'cost' as const, visible: true },
  { kind: 'builtin' as const, key: 'tags' as const, visible: true },
  { kind: 'builtin' as const, key: 'quantity' as const, visible: true },
];

describe('custom task attributes', () => {
  it('manages definitions and typed values with project role safeguards', async () => {
    const t = createTest();
    const [ownerId, memberId, viewerId] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.insert('users', { name: 'Owner', email: 'attr-owner@example.com' }),
        ctx.db.insert('users', { name: 'Member', email: 'attr-member@example.com' }),
        ctx.db.insert('users', { name: 'Viewer', email: 'attr-viewer@example.com' }),
      ]),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const viewer = t.withIdentity({ subject: viewerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Custom fields' });
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
      name: 'Plan',
      number: 'A-101',
      sourceFileRef: '/test.pdf',
      pageIndex: 0,
      width: 1000,
      height: 1000,
    });
    const taskId = await owner.mutation(api.tasks.create, { projectId, sheetId, x: 0.5, y: 0.5 });

    await owner.mutation(api.taskAttributes.saveConfiguration, {
      projectId,
      definitions: [
        {
          clientId: 'inspection',
          name: 'Inspection result',
          type: 'select',
          options: [
            { id: 'pass', label: 'Pass' },
            { id: 'fail', label: 'Fail' },
          ],
        },
        { clientId: 'temperature', name: 'Temperature', type: 'number', unit: '°F' },
      ],
      layout: [
        ...builtInLayout,
        { kind: 'custom', definitionKey: 'inspection', visible: true },
        { kind: 'custom', definitionKey: 'temperature', visible: false },
      ],
      archivedDefinitionIds: [],
    });
    const configuration = await viewer.query(api.taskAttributes.getConfiguration, { projectId });
    expect(configuration.definitions.map((definition) => definition.name)).toEqual([
      'Inspection result',
      'Temperature',
    ]);
    expect(configuration.layout).toHaveLength(10);
    const inspection = configuration.definitions.find(
      (definition) => definition.name === 'Inspection result',
    )!;
    await member.mutation(api.taskAttributes.setTaskValue, {
      taskId,
      definitionId: inspection._id,
      value: { type: 'select', optionId: 'pass' },
    });
    expect(
      (await viewer.query(api.taskAttributes.listValuesByTask, { taskId }))[0].selectOptionId,
    ).toBe('pass');
    await expect(
      viewer.mutation(api.taskAttributes.setTaskValue, {
        taskId,
        definitionId: inspection._id,
        value: null,
      }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(
      owner.mutation(api.taskAttributes.saveConfiguration, {
        projectId,
        definitions: configuration.definitions.map((definition) => ({
          clientId: definition._id,
          definitionId: definition._id,
          name: definition.name,
          type: definition._id === inspection._id ? ('text' as const) : definition.type,
          unit: definition.unit,
          options: definition.options
            ?.filter((option) => option.active)
            .map(({ id, label }) => ({ id, label })),
        })),
        layout: configuration.layout!.map((item) =>
          item.kind === 'builtin'
            ? item
            : { kind: 'custom' as const, definitionKey: item.definitionId, visible: item.visible },
        ),
        archivedDefinitionIds: [],
      }),
    ).rejects.toThrow('cannot change after values are added');

    const remaining = configuration.definitions.filter(
      (definition) => definition._id !== inspection._id,
    );
    await owner.mutation(api.taskAttributes.saveConfiguration, {
      projectId,
      definitions: remaining.map((definition) => ({
        clientId: definition._id,
        definitionId: definition._id,
        name: definition.name,
        type: definition.type,
        unit: definition.unit,
      })),
      layout: configuration
        .layout!.filter((item) => item.kind === 'builtin' || item.definitionId !== inspection._id)
        .map((item) =>
          item.kind === 'builtin'
            ? item
            : { kind: 'custom' as const, definitionKey: item.definitionId, visible: item.visible },
        ),
      archivedDefinitionIds: [inspection._id],
    });
    expect(
      (await owner.query(api.taskAttributes.getConfiguration, { projectId })).definitions,
    ).toHaveLength(1);
    expect(await owner.query(api.taskAttributes.listValuesByTask, { taskId })).toHaveLength(1);
  });

  it('rejects invalid and reserved definition names', async () => {
    const t = createTest();
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Owner', email: 'reserved@example.com' }),
    );
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Reserved names' });
    await expect(
      owner.mutation(api.taskAttributes.saveConfiguration, {
        projectId,
        definitions: [{ clientId: 'bad', name: 'Quantity', type: 'text' }],
        layout: [...builtInLayout, { kind: 'custom', definitionKey: 'bad', visible: true }],
        archivedDefinitionIds: [] as Id<'taskAttributeDefinitions'>[],
      }),
    ).rejects.toThrow('reserved');
  });
});
