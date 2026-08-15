import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import { recordTaskChange, recordTaskEvent } from './lib/taskActivity';

const ITEM_NAME_MAX_LENGTH = 80;
const UNIT_MAX_LENGTH = 24;

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Quantity item name is required');
  if (name.length > ITEM_NAME_MAX_LENGTH) {
    throw new Error(`Quantity item name must be ${ITEM_NAME_MAX_LENGTH} characters or fewer`);
  }
  return name;
}

function normalizeUnit(value: string) {
  const unit = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!unit) throw new Error('Default unit is required');
  if (unit.length > UNIT_MAX_LENGTH) {
    throw new Error(`Default unit must be ${UNIT_MAX_LENGTH} characters or fewer`);
  }
  return unit;
}

function normalizeOptionalUnit(value: string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const unit = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!unit) return undefined;
  if (unit.length > UNIT_MAX_LENGTH) {
    throw new Error(`Quantity unit must be ${UNIT_MAX_LENGTH} characters or fewer`);
  }
  return unit;
}

function assertNonNegativeNumber(value: number | null | undefined, label: string) {
  if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

function taskHasLegacyQuantity(task: Doc<'tasks'>) {
  return (
    task.quantityItemId !== undefined ||
    task.plannedQuantity !== undefined ||
    task.completedQuantity !== undefined
  );
}

function quantitySnapshot(value: {
  itemName?: string;
  plannedQuantity?: number;
  completedQuantity?: number;
  quantityUnit?: string;
}) {
  const parts = [
    value.itemName ?? 'Unclassified',
    value.plannedQuantity === undefined ? undefined : `${value.plannedQuantity} planned`,
    value.completedQuantity === undefined ? undefined : `${value.completedQuantity} completed`,
    value.quantityUnit,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

async function getActiveItem(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  itemId: Id<'quantityItems'> | null | undefined,
) {
  if (!itemId) return undefined;
  const item = await ctx.db.get(itemId);
  if (item === null || item.projectId !== projectId || item.archivedAt !== undefined) {
    throw new Error('Quantity item does not belong to this project or is archived');
  }
  return item;
}

async function materializeLegacyQuantity(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  userId: Id<'users'>,
) {
  if (!taskHasLegacyQuantity(task)) return undefined;
  const now = Date.now();
  const lineId = await ctx.db.insert('taskQuantities', {
    projectId: task.projectId,
    taskId: task._id,
    quantityItemId: task.quantityItemId,
    plannedQuantity: task.plannedQuantity,
    completedQuantity: task.completedQuantity,
    quantityUnit: task.quantityUnit,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(task._id, {
    quantityItemId: undefined,
    plannedQuantity: undefined,
    completedQuantity: undefined,
    quantityUnit: undefined,
    updatedAt: now,
  });
  return lineId;
}

async function assertUniqueName(
  ctx: Parameters<typeof requireProjectMember>[0],
  projectId: Parameters<typeof requireProjectMember>[1],
  name: string,
  exceptId?: string,
) {
  const comparable = name.toLocaleLowerCase();
  const items = await ctx.db
    .query('quantityItems')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  if (
    items.some(
      (item) =>
        item.archivedAt === undefined &&
        item._id !== exceptId &&
        item.name.toLocaleLowerCase() === comparable,
    )
  ) {
    throw new Error('A quantity item with this name already exists');
  }
}

export const listItems = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const [items, tasks, quantityLines] = await Promise.all([
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ]);
    const taskIdsWithLines = new Set(quantityLines.map((line) => line.taskId));
    const taskIdsByItem = new Map<string, Set<string>>();
    for (const line of quantityLines) {
      if (!line.quantityItemId) continue;
      const taskIds = taskIdsByItem.get(line.quantityItemId) ?? new Set<string>();
      taskIds.add(line.taskId);
      taskIdsByItem.set(line.quantityItemId, taskIds);
    }
    for (const task of tasks) {
      if (taskIdsWithLines.has(task._id) || !task.quantityItemId) continue;
      const taskIds = taskIdsByItem.get(task.quantityItemId) ?? new Set<string>();
      taskIds.add(task._id);
      taskIdsByItem.set(task.quantityItemId, taskIds);
    }
    return items
      .filter((item) => item.archivedAt === undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ ...item, taskCount: taskIdsByItem.get(item._id)?.size ?? 0 }));
  },
});

export const listTaskLines = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    const lines = await ctx.db
      .query('taskQuantities')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
    if (lines.length > 0) {
      return lines
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((line) => ({
          lineId: line._id,
          legacy: false as const,
          quantityItemId: line.quantityItemId,
          plannedQuantity: line.plannedQuantity,
          completedQuantity: line.completedQuantity,
          quantityUnit: line.quantityUnit,
        }));
    }
    if (!taskHasLegacyQuantity(task)) return [];
    return [
      {
        legacy: true as const,
        quantityItemId: task.quantityItemId,
        plannedQuantity: task.plannedQuantity,
        completedQuantity: task.completedQuantity,
        quantityUnit: task.quantityUnit,
      },
    ];
  },
});

export const addTaskLine = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, userId);
    const existingLines = await ctx.db
      .query('taskQuantities')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
    if (existingLines.length === 0) await materializeLegacyQuantity(ctx, task, userId);
    const now = Date.now();
    const lineId = await ctx.db.insert('taskQuantities', {
      projectId: task.projectId,
      taskId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordTaskEvent(ctx, {
      projectId: task.projectId,
      taskId,
      actorId: userId,
      kind: 'quantity_added',
      summary: 'Added a quantity',
    });
    return lineId;
  },
});

export const updateTaskLine = mutation({
  args: {
    taskId: v.id('tasks'),
    lineId: v.optional(v.id('taskQuantities')),
    quantityItemId: v.optional(v.union(v.id('quantityItems'), v.null())),
    plannedQuantity: v.optional(v.union(v.number(), v.null())),
    completedQuantity: v.optional(v.union(v.number(), v.null())),
    quantityUnit: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);
    const item = await getActiveItem(ctx, task.projectId, args.quantityItemId);
    assertNonNegativeNumber(args.plannedQuantity, 'Planned quantity');
    assertNonNegativeNumber(args.completedQuantity, 'Completed quantity');
    const normalizedUnit = normalizeOptionalUnit(args.quantityUnit);
    const patch: {
      quantityItemId?: Id<'quantityItems'>;
      plannedQuantity?: number;
      completedQuantity?: number;
      quantityUnit?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.quantityItemId !== undefined) patch.quantityItemId = args.quantityItemId ?? undefined;
    if (args.plannedQuantity !== undefined) {
      patch.plannedQuantity = args.plannedQuantity ?? undefined;
    }
    if (args.completedQuantity !== undefined) {
      patch.completedQuantity = args.completedQuantity ?? undefined;
    }
    if (args.quantityUnit !== undefined) patch.quantityUnit = normalizedUnit;
    else if (item) patch.quantityUnit = item.defaultUnit;

    if (args.lineId) {
      const line = await ctx.db.get(args.lineId);
      if (line === null || line.taskId !== task._id || line.projectId !== task.projectId) {
        throw new Error('Quantity line not found');
      }
      const oldItem = line.quantityItemId ? await ctx.db.get(line.quantityItemId) : undefined;
      const nextLine = { ...line, ...patch };
      await ctx.db.patch(line._id, patch);
      await recordTaskChange(ctx, {
        projectId: task.projectId,
        taskId: task._id,
        actorId,
        kind: 'quantity_changed',
        fieldKey: `quantity:${line._id}`,
        fieldLabel: `${item?.name ?? oldItem?.name ?? 'Quantity'} quantity`,
        oldValue: quantitySnapshot({
          itemName: oldItem?.name,
          plannedQuantity: line.plannedQuantity,
          completedQuantity: line.completedQuantity,
          quantityUnit: line.quantityUnit,
        }),
        newValue: quantitySnapshot({
          itemName: item?.name ?? (args.quantityItemId === undefined ? oldItem?.name : undefined),
          plannedQuantity: nextLine.plannedQuantity,
          completedQuantity: nextLine.completedQuantity,
          quantityUnit: nextLine.quantityUnit,
        }),
      });
      return;
    }

    const storedLine = await ctx.db
      .query('taskQuantities')
      .withIndex('by_task', (q) => q.eq('taskId', task._id))
      .first();
    if (storedLine !== null) throw new Error('Quantity line has changed; please try again');
    const oldItem = task.quantityItemId ? await ctx.db.get(task.quantityItemId) : undefined;
    const nextTask = { ...task, ...patch };
    await ctx.db.patch(task._id, patch);
    await recordTaskChange(ctx, {
      projectId: task.projectId,
      taskId: task._id,
      actorId,
      kind: 'quantity_changed',
      fieldKey: 'quantity:legacy',
      fieldLabel: `${item?.name ?? oldItem?.name ?? 'Quantity'} quantity`,
      oldValue: quantitySnapshot({
        itemName: oldItem?.name,
        plannedQuantity: task.plannedQuantity,
        completedQuantity: task.completedQuantity,
        quantityUnit: task.quantityUnit,
      }),
      newValue: quantitySnapshot({
        itemName: item?.name ?? (args.quantityItemId === undefined ? oldItem?.name : undefined),
        plannedQuantity: nextTask.plannedQuantity,
        completedQuantity: nextTask.completedQuantity,
        quantityUnit: nextTask.quantityUnit,
      }),
    });
  },
});

export const removeTaskLine = mutation({
  args: { taskId: v.id('tasks'), lineId: v.optional(v.id('taskQuantities')) },
  handler: async (ctx, { taskId, lineId }) => {
    const actorId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);
    if (lineId) {
      const line = await ctx.db.get(lineId);
      if (line === null || line.taskId !== task._id || line.projectId !== task.projectId) {
        throw new Error('Quantity line not found');
      }
      const item = line.quantityItemId ? await ctx.db.get(line.quantityItemId) : undefined;
      await ctx.db.delete(line._id);
      await recordTaskEvent(ctx, {
        projectId: task.projectId,
        taskId: task._id,
        actorId,
        kind: 'quantity_removed',
        summary: `Removed ${item?.name ?? 'an unclassified'} quantity`,
      });
      return;
    }
    const storedLine = await ctx.db
      .query('taskQuantities')
      .withIndex('by_task', (q) => q.eq('taskId', task._id))
      .first();
    if (storedLine !== null) throw new Error('Quantity line has changed; please try again');
    const item = task.quantityItemId ? await ctx.db.get(task.quantityItemId) : undefined;
    await ctx.db.patch(task._id, {
      quantityItemId: undefined,
      plannedQuantity: undefined,
      completedQuantity: undefined,
      quantityUnit: undefined,
      updatedAt: Date.now(),
    });
    await recordTaskEvent(ctx, {
      projectId: task.projectId,
      taskId: task._id,
      actorId,
      kind: 'quantity_removed',
      summary: `Removed ${item?.name ?? 'an unclassified'} quantity`,
    });
  },
});

export const createItem = mutation({
  args: { projectId: v.id('projects'), name: v.string(), defaultUnit: v.string() },
  handler: async (ctx, { projectId, name: suppliedName, defaultUnit: suppliedUnit }) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, projectId, ['owner', 'admin'], userId);
    const name = normalizeName(suppliedName);
    const defaultUnit = normalizeUnit(suppliedUnit);
    await assertUniqueName(ctx, projectId, name);
    const now = Date.now();
    return await ctx.db.insert('quantityItems', {
      projectId,
      name,
      defaultUnit,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: { itemId: v.id('quantityItems'), name: v.string(), defaultUnit: v.string() },
  handler: async (ctx, { itemId, name: suppliedName, defaultUnit: suppliedUnit }) => {
    const item = await ctx.db.get(itemId);
    if (item === null || item.archivedAt !== undefined) throw new Error('Quantity item not found');
    await requireProjectRole(ctx, item.projectId, ['owner', 'admin']);
    const name = normalizeName(suppliedName);
    const defaultUnit = normalizeUnit(suppliedUnit);
    await assertUniqueName(ctx, item.projectId, name, itemId);
    await ctx.db.patch(itemId, { name, defaultUnit, updatedAt: Date.now() });
  },
});

export const archiveItem = mutation({
  args: { itemId: v.id('quantityItems') },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (item === null || item.archivedAt !== undefined) throw new Error('Quantity item not found');
    await requireProjectRole(ctx, item.projectId, ['owner', 'admin']);
    await ctx.db.patch(itemId, { archivedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const getProjectReport = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const [tasks, sheets, items, quantityLines] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ]);
    const sheetById = new Map(sheets.map((sheet) => [sheet._id, sheet]));
    const itemById = new Map(items.map((item) => [item._id, item]));
    const taskById = new Map(tasks.map((task) => [task._id, task]));
    const taskIdsWithLines = new Set(quantityLines.map((line) => line.taskId));
    const reportLines = [
      ...quantityLines.map((line) => ({
        reportLineId: line._id as string,
        taskId: line.taskId,
        quantityItemId: line.quantityItemId,
        plannedQuantity: line.plannedQuantity,
        completedQuantity: line.completedQuantity,
        quantityUnit: line.quantityUnit,
      })),
      ...tasks
        .filter((task) => !taskIdsWithLines.has(task._id) && taskHasLegacyQuantity(task))
        .map((task) => ({
          reportLineId: `legacy:${task._id}`,
          taskId: task._id,
          quantityItemId: task.quantityItemId,
          plannedQuantity: task.plannedQuantity,
          completedQuantity: task.completedQuantity,
          quantityUnit: task.quantityUnit,
        })),
    ];
    return reportLines
      .flatMap((line) => {
        const task = taskById.get(line.taskId);
        if (!task) return [];
        const sheet = sheetById.get(task.sheetId);
        const item = line.quantityItemId ? itemById.get(line.quantityItemId) : undefined;
        return [
          {
            reportLineId: line.reportLineId,
            taskId: task._id,
            sheetId: task.sheetId,
            seq: task.seq,
            title: task.title,
            status: task.status,
            category: task.category,
            assigneeText: task.assigneeText,
            plannedQuantity: line.plannedQuantity,
            completedQuantity: line.completedQuantity,
            quantityUnit: line.quantityUnit,
            quantityItemId: line.quantityItemId,
            itemName: item?.name,
            itemArchived: item?.archivedAt !== undefined,
            planName: sheet?.name ?? 'Unknown plan',
            planNumber: sheet?.number ?? '',
            planPage: sheet ? sheet.pageIndex + 1 : 1,
            sourceFileRef: sheet?.sourceFileRef ?? '',
          },
        ];
      })
      .sort((a, b) => a.seq - b.seq);
  },
});
