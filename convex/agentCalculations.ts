import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireProjectMember } from './lib/authz';
import { buildProjectQuantityReport } from './lib/quantityReport';

function normalizedUnit(unit: string | undefined) {
  return unit?.trim().replace(/\s+/g, ' ').toUpperCase() || 'NO UNIT';
}

function attentionReasons(row: ReturnType<typeof buildProjectQuantityReport>[number]) {
  const completed = row.completedQuantity ?? 0;
  return [
    !row.quantityItemId ? 'unclassified' : undefined,
    row.itemArchived ? 'archived item' : undefined,
    row.plannedQuantity === undefined ? 'planned quantity missing' : undefined,
    row.plannedQuantity !== undefined && completed > row.plannedQuantity
      ? 'completed exceeds planned'
      : undefined,
  ].filter((reason): reason is string => reason !== undefined);
}

function rowMath(row: ReturnType<typeof buildProjectQuantityReport>[number]) {
  const completed = row.completedQuantity ?? 0;
  const difference =
    row.plannedQuantity === undefined ? undefined : row.plannedQuantity - completed;
  const percent =
    row.plannedQuantity === undefined
      ? null
      : row.plannedQuantity === 0
        ? completed > 0
          ? 100
          : 0
        : Math.round((completed / row.plannedQuantity) * 100);
  return {
    completed,
    remaining: difference === undefined ? null : Math.max(difference, 0),
    overrun: difference === undefined ? 0 : Math.max(-difference, 0),
    percent,
  };
}

export const report = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    item: v.optional(v.string()),
    taskNumber: v.optional(v.number()),
    planNumber: v.optional(v.string()),
    attentionOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectMember(ctx, args.projectId, args.userId);
    const [tasks, sheets, items, quantityLines] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
    ]);
    const allRows = buildProjectQuantityReport({ tasks, sheets, items, quantityLines });
    const itemNeedle = args.item?.trim().toLocaleLowerCase();
    const planNeedle = args.planNumber?.trim().toLocaleLowerCase();
    const rows = allRows.filter((row) => {
      if (
        itemNeedle &&
        !(row.itemName ?? 'Needs classification').toLocaleLowerCase().includes(itemNeedle)
      ) {
        return false;
      }
      if (args.taskNumber !== undefined && row.seq !== args.taskNumber) return false;
      if (
        planNeedle &&
        !row.planNumber.toLocaleLowerCase().includes(planNeedle) &&
        !row.planName.toLocaleLowerCase().includes(planNeedle)
      ) {
        return false;
      }
      if (args.attentionOnly && attentionReasons(row).length === 0) return false;
      return true;
    });

    const groups = new Map<
      string,
      {
        itemId?: string;
        item: string;
        unit: string;
        planned: number;
        completed: number;
        remaining: number;
        overrun: number;
        missingPlanned: number;
        taskIds: Set<string>;
        planIds: Set<string>;
        rowCount: number;
      }
    >();
    for (const row of rows) {
      const unit = normalizedUnit(row.quantityUnit);
      const key = `${row.quantityItemId ?? 'unclassified'}\u0000${unit}`;
      const completed = row.completedQuantity ?? 0;
      const difference =
        row.plannedQuantity === undefined ? undefined : row.plannedQuantity - completed;
      const group = groups.get(key) ?? {
        itemId: row.quantityItemId,
        item: row.itemName ?? 'Needs classification',
        unit,
        planned: 0,
        completed: 0,
        remaining: 0,
        overrun: 0,
        missingPlanned: 0,
        taskIds: new Set<string>(),
        planIds: new Set<string>(),
        rowCount: 0,
      };
      group.planned += row.plannedQuantity ?? 0;
      group.completed += completed;
      group.remaining += difference === undefined ? 0 : Math.max(difference, 0);
      group.overrun += difference === undefined ? 0 : Math.max(-difference, 0);
      if (row.plannedQuantity === undefined) group.missingPlanned += 1;
      group.taskIds.add(row.taskId);
      group.planIds.add(row.sourceFileRef || row.sheetId);
      group.rowCount += 1;
      groups.set(key, group);
    }
    const grouped = [...groups.values()]
      .map((group) => ({
        item: group.item,
        unit: group.unit,
        planned: group.planned,
        completed: group.completed,
        remaining: group.remaining,
        overrun: group.overrun,
        progressPercent:
          group.planned > 0 ? Math.round((group.completed / group.planned) * 100) : null,
        missingPlanned: group.missingPlanned,
        quantityRows: group.rowCount,
        tasks: group.taskIds.size,
        plans: group.planIds.size,
      }))
      .sort((a, b) => a.item.localeCompare(b.item) || a.unit.localeCompare(b.unit));
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 100);
    return {
      scope: {
        item: args.item,
        taskNumber: args.taskNumber,
        planNumber: args.planNumber,
        attentionOnly: args.attentionOnly ?? false,
      },
      summary: {
        itemsTracked: new Set(
          rows.flatMap((row) => (row.quantityItemId ? [row.quantityItemId] : [])),
        ).size,
        quantityRows: rows.length,
        tasksWithQuantities: new Set(rows.map((row) => row.taskId)).size,
        plansRepresented: new Set(rows.map((row) => row.sourceFileRef || row.sheetId)).size,
        exceptions: rows.filter((row) => attentionReasons(row).length > 0).length,
      },
      groups: grouped,
      lines: rows.slice(0, limit).map((row) => ({
        taskNumber: row.seq,
        taskTitle: row.title,
        item: row.itemName ?? 'Needs classification',
        itemArchived: row.itemArchived ?? false,
        unit: normalizedUnit(row.quantityUnit),
        planned: row.plannedQuantity ?? null,
        ...rowMath(row),
        status: row.status,
        assignee: row.assigneeText,
        plan: { number: row.planNumber, name: row.planName, page: row.planPage },
        attentionReasons: attentionReasons(row),
      })),
      truncated: rows.length > limit,
    };
  },
});

function taskHasLegacyQuantity(task: Doc<'tasks'>) {
  return (
    task.quantityItemId !== undefined ||
    task.plannedQuantity !== undefined ||
    task.completedQuantity !== undefined
  );
}

export const task = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users'), taskNumber: v.number() },
  handler: async (ctx, { projectId, userId, taskNumber }) => {
    await requireProjectMember(ctx, projectId, userId);
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_project_seq', (q) => q.eq('projectId', projectId).eq('seq', taskNumber))
      .unique();
    if (!task) throw new Error(`Task #${taskNumber} was not found in this project`);
    const [storedLines, items, sheet] = await Promise.all([
      ctx.db
        .query('taskQuantities')
        .withIndex('by_task', (q) => q.eq('taskId', task._id))
        .collect(),
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db.get(task.sheetId),
    ]);
    storedLines.sort((a, b) => a.createdAt - b.createdAt);
    const lines =
      storedLines.length > 0
        ? storedLines
        : taskHasLegacyQuantity(task)
          ? [
              {
                quantityItemId: task.quantityItemId,
                plannedQuantity: task.plannedQuantity,
                completedQuantity: task.completedQuantity,
                quantityUnit: task.quantityUnit,
              },
            ]
          : [];
    const itemById = new Map(items.map((item) => [item._id, item]));
    return {
      task: {
        number: task.seq,
        title: task.title,
        status: task.status,
        plan: sheet
          ? { number: sheet.number, name: sheet.name, page: sheet.pageIndex + 1 }
          : undefined,
      },
      quantities: lines.map((line, index) => {
        const item = line.quantityItemId ? itemById.get(line.quantityItemId) : undefined;
        const row = {
          plannedQuantity: line.plannedQuantity,
          completedQuantity: line.completedQuantity,
        } as ReturnType<typeof buildProjectQuantityReport>[number];
        return {
          lineNumber: index + 1,
          item: item?.name ?? 'Needs classification',
          itemArchived: item?.archivedAt !== undefined,
          unit: normalizedUnit(line.quantityUnit ?? item?.defaultUnit),
          planned: line.plannedQuantity ?? null,
          ...rowMath(row),
          attentionReasons: [
            !line.quantityItemId ? 'unclassified' : undefined,
            item?.archivedAt !== undefined ? 'archived item' : undefined,
            line.plannedQuantity === undefined ? 'planned quantity missing' : undefined,
            line.plannedQuantity !== undefined &&
            (line.completedQuantity ?? 0) > line.plannedQuantity
              ? 'completed exceeds planned'
              : undefined,
          ].filter((reason): reason is string => reason !== undefined),
        };
      }),
    };
  },
});

export const catalog = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users'), includeArchived: v.boolean() },
  handler: async (ctx, { projectId, userId, includeArchived }) => {
    const membership = await requireProjectMember(ctx, projectId, userId);
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
    const taskIdsByItem = new Map<string, Set<string>>();
    for (const line of quantityLines) {
      if (!line.quantityItemId) continue;
      const taskIds = taskIdsByItem.get(line.quantityItemId) ?? new Set<string>();
      taskIds.add(line.taskId);
      taskIdsByItem.set(line.quantityItemId, taskIds);
    }
    const tasksWithLines = new Set(quantityLines.map((line) => line.taskId));
    for (const task of tasks) {
      if (!task.quantityItemId || tasksWithLines.has(task._id)) continue;
      const taskIds = taskIdsByItem.get(task.quantityItemId) ?? new Set<string>();
      taskIds.add(task._id);
      taskIdsByItem.set(task.quantityItemId, taskIds);
    }
    return {
      callerRole: membership.role,
      canEditTaskQuantities: membership.role !== 'viewer',
      canManageItems: membership.role === 'owner' || membership.role === 'admin',
      items: items
        .filter((item) => includeArchived || item.archivedAt === undefined)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
          name: item.name,
          defaultUnit: item.defaultUnit,
          archived: item.archivedAt !== undefined,
          taskCount: taskIdsByItem.get(item._id)?.size ?? 0,
        })),
    };
  },
});
