import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import { taskPriority, taskStatus } from './schema';
import { recordTaskChange } from './lib/taskActivity';

const STATUS_LABELS = {
  open: 'Open',
  'in-progress': 'In progress',
  done: 'Done',
  verified: 'Verified',
} as const;

const PRIORITY_LABELS = {
  1: 'P1 — Critical',
  2: 'P2 — Important',
  3: 'P3 — Standard',
} as const;

function displayCategory(value: string | undefined) {
  if (!value) return undefined;
  if (value === 'hvac') return 'HVAC';
  if (value === 'punch') return 'Punch list';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function displayList(value: string[] | undefined) {
  return value?.length ? value.join(', ') : undefined;
}

function displayCost(costMinor: number | undefined, currencyCode: string | undefined) {
  return costMinor === undefined
    ? undefined
    : `${currencyCode ?? 'USD'} ${(costMinor / 100).toFixed(2)}`;
}

function assertNormalizedCoordinate(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a normalized coordinate between 0 and 1`);
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertNonNegativeNumber(value: number | undefined, label: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

function assertNonNegativeInteger(value: number | undefined, label: string) {
  assertNonNegativeNumber(value, label);
  if (value !== undefined && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
}

function normalizeText(value: string | undefined | null, label: string, maxLength: number) {
  const normalized = value?.trim() || undefined;
  if (normalized && normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeDate(value: string | undefined | null, label: string) {
  const normalized = normalizeText(value, label, 10);
  if (normalized && !DATE_PATTERN.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD format`);
  }
  if (normalized) {
    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error(`${label} must be a valid calendar date`);
    }
  }
  return normalized;
}

function assertDateRange(startDate: string | undefined, dueDate: string | undefined) {
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error('Due date cannot be earlier than start date');
  }
}

function normalizeCurrencyCode(value: string | undefined | null) {
  const normalized = value?.trim().toUpperCase() || undefined;
  if (normalized && !/^[A-Z]{3}$/.test(normalized)) {
    throw new Error('Currency must be a three-letter code');
  }
  return normalized;
}

function normalizeTags(value: string[] | undefined | null) {
  if (!value) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const suppliedTag of value) {
    const tag = suppliedTag.trim();
    if (!tag) continue;
    if (tag.length > 40) throw new Error('Each tag must be 40 characters or fewer');
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > 20) throw new Error('A task can have at most 20 tags');
  return tags.length > 0 ? tags : undefined;
}

export type CoreTaskUpdateArgs = {
  taskId: Id<'tasks'>;
  status?: Doc<'tasks'>['status'];
  priority?: Doc<'tasks'>['priority'];
  dueDate?: string | null;
  assigneeText?: string | null;
  assigneeUserId?: Id<'users'> | null;
};

// Shared by ordinary UI mutations and approved agent tools for the most
// common field operations. Keeping validation, authorization, and activity
// events here prevents the two write paths from drifting apart.
export async function updateCoreTaskFieldsForActor(
  ctx: MutationCtx,
  args: CoreTaskUpdateArgs,
  actorId: Id<'users'>,
) {
  const task = await ctx.db.get(args.taskId);
  if (task === null) throw new Error('Task not found');
  await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);
  if (args.assigneeUserId) {
    await requireProjectMember(ctx, task.projectId, args.assigneeUserId);
  }
  const dueDate =
    args.dueDate === undefined ? task.dueDate : normalizeDate(args.dueDate, 'Due date');
  assertDateRange(task.startDate, dueDate);

  const patch: Partial<Doc<'tasks'>> = { updatedAt: Date.now() };
  if (args.status !== undefined) patch.status = args.status;
  if (args.priority !== undefined) patch.priority = args.priority;
  if (args.dueDate !== undefined) patch.dueDate = dueDate;
  if (args.assigneeText !== undefined) {
    patch.assigneeText = args.assigneeText?.trim() || undefined;
  }
  if (args.assigneeUserId !== undefined) {
    patch.assigneeUserId = args.assigneeUserId ?? undefined;
  }
  await ctx.db.patch(task._id, patch);
  const next = { ...task, ...patch };

  const changes: Array<{
    fieldKey: string;
    fieldLabel: string;
    oldValue?: string;
    newValue?: string;
  }> = [];
  if (args.status !== undefined && task.status !== next.status) {
    changes.push({
      fieldKey: 'status',
      fieldLabel: 'Status',
      oldValue: STATUS_LABELS[task.status],
      newValue: STATUS_LABELS[next.status],
    });
  }
  if (args.priority !== undefined && task.priority !== next.priority) {
    changes.push({
      fieldKey: 'priority',
      fieldLabel: 'Priority',
      oldValue: PRIORITY_LABELS[task.priority],
      newValue: PRIORITY_LABELS[next.priority],
    });
  }
  if (args.dueDate !== undefined && task.dueDate !== next.dueDate) {
    changes.push({
      fieldKey: 'dueDate',
      fieldLabel: 'Due date',
      oldValue: task.dueDate,
      newValue: next.dueDate,
    });
  }
  if (
    (args.assigneeUserId !== undefined || args.assigneeText !== undefined) &&
    (task.assigneeUserId !== next.assigneeUserId || task.assigneeText !== next.assigneeText)
  ) {
    changes.push({
      fieldKey: 'assignee',
      fieldLabel: 'Assignee',
      oldValue: task.assigneeText,
      newValue: next.assigneeText,
    });
  }
  for (const change of changes) {
    await recordTaskChange(ctx, {
      projectId: task.projectId,
      taskId: task._id,
      actorId,
      ...change,
    });
  }
  return await ctx.db.get(task._id);
}

export type CreateTaskForActorArgs = {
  projectId: Id<'projects'>;
  sheetId: Id<'sheets'>;
  x: number;
  y: number;
  title?: string;
  description?: string;
  status?: Doc<'tasks'>['status'];
  priority?: Doc<'tasks'>['priority'];
  category?: string;
  color?: string;
  plannedQuantity?: number;
  completedQuantity?: number;
  quantityUnit?: string;
  quantityItemId?: Id<'quantityItems'>;
  startDate?: string;
  locationText?: string;
  tags?: string[];
  manpowerCount?: number;
  costMinor?: number;
  currencyCode?: string;
  assigneeText?: string;
  assigneeUserId?: Id<'users'>;
  dueDate?: string;
};

export async function createTaskForActor(
  ctx: MutationCtx,
  args: CreateTaskForActorArgs,
  userId: Id<'users'>,
) {
  await requireProjectRole(ctx, args.projectId, CONTENT_EDITOR_ROLES, userId);
  assertNormalizedCoordinate(args.x, 'x');
  assertNormalizedCoordinate(args.y, 'y');

  const sheet = await ctx.db.get(args.sheetId);
  if (sheet === null || sheet.projectId !== args.projectId) {
    throw new Error('Sheet does not belong to this project');
  }
  if (args.assigneeUserId !== undefined) {
    await requireProjectMember(ctx, args.projectId, args.assigneeUserId);
  }
  const quantityItem = args.quantityItemId ? await ctx.db.get(args.quantityItemId) : undefined;
  if (
    quantityItem !== undefined &&
    (quantityItem === null ||
      quantityItem.projectId !== args.projectId ||
      quantityItem.archivedAt !== undefined)
  ) {
    throw new Error('Quantity item does not belong to this project');
  }

  assertNonNegativeNumber(args.plannedQuantity, 'Planned quantity');
  assertNonNegativeNumber(args.completedQuantity, 'Completed quantity');
  assertNonNegativeInteger(args.manpowerCount, 'Manpower');
  assertNonNegativeInteger(args.costMinor, 'Cost');
  const quantityUnit = normalizeText(
    args.quantityUnit ?? quantityItem?.defaultUnit,
    'Quantity unit',
    24,
  );
  const startDate = normalizeDate(args.startDate, 'Start date');
  const dueDate = normalizeDate(args.dueDate, 'Due date');
  assertDateRange(startDate, dueDate);
  const locationText = normalizeText(args.locationText, 'Location', 120);
  const tags = normalizeTags(args.tags);
  const currencyCode = normalizeCurrencyCode(args.currencyCode);

  const project = await ctx.db.get(args.projectId);
  if (project === null) throw new Error('Project not found');
  const now = Date.now();
  const seq = project.nextTaskSeq;
  await ctx.db.patch(project._id, { nextTaskSeq: seq + 1, updatedAt: now });

  return await ctx.db.insert('tasks', {
    projectId: args.projectId,
    sheetId: args.sheetId,
    seq,
    x: args.x,
    y: args.y,
    title: args.title?.trim() ?? '',
    description: args.description?.trim() ?? '',
    status: args.status ?? 'open',
    priority: args.priority ?? 2,
    category: args.category?.trim() || 'general',
    color: args.color,
    plannedQuantity: args.plannedQuantity,
    completedQuantity: args.completedQuantity,
    quantityUnit,
    quantityItemId: args.quantityItemId,
    startDate,
    locationText,
    tags,
    manpowerCount: args.manpowerCount,
    costMinor: args.costMinor,
    currencyCode,
    assigneeText: args.assigneeText?.trim() || undefined,
    assigneeUserId: args.assigneeUserId,
    dueDate,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

export const listByPdf = query({
  args: { sheetId: v.id('sheets') },
  handler: async (ctx, { sheetId }) => {
    const anchor = await ctx.db.get(sheetId);
    if (anchor === null) throw new Error('Plan not found');
    await requireProjectMember(ctx, anchor.projectId);

    const pages = await ctx.db
      .query('sheets')
      .withIndex('by_project_sourceFileRef', (q) =>
        q.eq('projectId', anchor.projectId).eq('sourceFileRef', anchor.sourceFileRef),
      )
      .collect();
    pages.sort((a, b) => a.pageIndex - b.pageIndex);

    const pageBySheet = new Map(pages.map((page) => [page._id, page.pageIndex + 1]));
    const projectTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', anchor.projectId))
      .collect();
    const rows = projectTasks.flatMap((task) => {
      const page = pageBySheet.get(task.sheetId);
      return page === undefined ? [] : [{ task, page }];
    });
    const projectAttachments = await ctx.db
      .query('attachments')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', anchor.projectId))
      .collect();
    const evidencePhotoCountByTask = new Map<Doc<'tasks'>['_id'], number>(
      rows.map(({ task }) => [task._id, 0] as const),
    );
    for (const attachment of projectAttachments) {
      if (
        attachment.kind !== 'photo' ||
        attachment.deletedAt !== undefined ||
        attachment.taskId === undefined ||
        !evidencePhotoCountByTask.has(attachment.taskId)
      ) {
        continue;
      }
      evidencePhotoCountByTask.set(
        attachment.taskId,
        (evidencePhotoCountByTask.get(attachment.taskId) ?? 0) + 1,
      );
    }
    return rows
      .map((row) => ({
        ...row,
        evidencePhotoCount: evidencePhotoCountByTask.get(row.task._id) ?? 0,
      }))
      .sort((a, b) => a.task.seq - b.task.seq);
  },
});

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
    return tasks.sort((a, b) => a.seq - b.seq);
  },
});

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    sheetId: v.id('sheets'),
    x: v.number(),
    y: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    priority: v.optional(taskPriority),
    category: v.optional(v.string()),
    color: v.optional(v.string()),
    plannedQuantity: v.optional(v.number()),
    completedQuantity: v.optional(v.number()),
    quantityUnit: v.optional(v.string()),
    quantityItemId: v.optional(v.id('quantityItems')),
    startDate: v.optional(v.string()),
    locationText: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    manpowerCount: v.optional(v.number()),
    costMinor: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    assigneeText: v.optional(v.string()),
    assigneeUserId: v.optional(v.id('users')),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await createTaskForActor(ctx, args, userId);
  },
});

export const update = mutation({
  args: {
    taskId: v.id('tasks'),
    sheetId: v.optional(v.id('sheets')),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    priority: v.optional(taskPriority),
    category: v.optional(v.string()),
    color: v.optional(v.string()),
    plannedQuantity: v.optional(v.union(v.number(), v.null())),
    completedQuantity: v.optional(v.union(v.number(), v.null())),
    quantityUnit: v.optional(v.union(v.string(), v.null())),
    quantityItemId: v.optional(v.union(v.id('quantityItems'), v.null())),
    startDate: v.optional(v.union(v.string(), v.null())),
    locationText: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.union(v.array(v.string()), v.null())),
    manpowerCount: v.optional(v.union(v.number(), v.null())),
    costMinor: v.optional(v.union(v.number(), v.null())),
    currencyCode: v.optional(v.union(v.string(), v.null())),
    assigneeText: v.optional(v.union(v.string(), v.null())),
    assigneeUserId: v.optional(v.union(v.id('users'), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const suppliedKeys = Object.keys(args).filter(
      (key) => key !== 'taskId' && args[key as keyof typeof args] !== undefined,
    );
    if (
      suppliedKeys.every((key) =>
        ['status', 'priority', 'dueDate', 'assigneeText', 'assigneeUserId'].includes(key),
      )
    ) {
      await updateCoreTaskFieldsForActor(ctx, args, actorId);
      return;
    }
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);

    if (args.x !== undefined) assertNormalizedCoordinate(args.x, 'x');
    if (args.y !== undefined) assertNormalizedCoordinate(args.y, 'y');
    if (args.sheetId !== undefined) {
      const sheet = await ctx.db.get(args.sheetId);
      if (sheet === null || sheet.projectId !== task.projectId) {
        throw new Error('Sheet does not belong to this project');
      }
    }
    if (args.assigneeUserId) {
      await requireProjectMember(ctx, task.projectId, args.assigneeUserId);
    }
    const quantityItem = args.quantityItemId ? await ctx.db.get(args.quantityItemId) : undefined;
    if (
      quantityItem !== undefined &&
      (quantityItem === null ||
        quantityItem.projectId !== task.projectId ||
        quantityItem.archivedAt !== undefined)
    ) {
      throw new Error('Quantity item does not belong to this project');
    }

    const plannedQuantity =
      args.plannedQuantity === undefined
        ? task.plannedQuantity
        : (args.plannedQuantity ?? undefined);
    const completedQuantity =
      args.completedQuantity === undefined
        ? task.completedQuantity
        : (args.completedQuantity ?? undefined);
    const manpowerCount =
      args.manpowerCount === undefined ? task.manpowerCount : (args.manpowerCount ?? undefined);
    const costMinor = args.costMinor === undefined ? task.costMinor : (args.costMinor ?? undefined);
    assertNonNegativeNumber(plannedQuantity, 'Planned quantity');
    assertNonNegativeNumber(completedQuantity, 'Completed quantity');
    assertNonNegativeInteger(manpowerCount, 'Manpower');
    assertNonNegativeInteger(costMinor, 'Cost');
    const startDate =
      args.startDate === undefined ? task.startDate : normalizeDate(args.startDate, 'Start date');
    const dueDate =
      args.dueDate === undefined ? task.dueDate : normalizeDate(args.dueDate, 'Due date');
    assertDateRange(startDate, dueDate);

    const patch: Partial<Doc<'tasks'>> = { updatedAt: Date.now() };
    if (args.sheetId !== undefined) patch.sheetId = args.sheetId;
    if (args.x !== undefined) patch.x = args.x;
    if (args.y !== undefined) patch.y = args.y;
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.color !== undefined) patch.color = args.color;
    if (args.plannedQuantity !== undefined)
      patch.plannedQuantity = args.plannedQuantity ?? undefined;
    if (args.completedQuantity !== undefined) {
      patch.completedQuantity = args.completedQuantity ?? undefined;
    }
    if (args.quantityUnit !== undefined) {
      patch.quantityUnit = normalizeText(args.quantityUnit, 'Quantity unit', 24);
    }
    if (args.quantityItemId !== undefined) {
      patch.quantityItemId = args.quantityItemId ?? undefined;
      if (args.quantityUnit === undefined && quantityItem) {
        patch.quantityUnit = quantityItem.defaultUnit;
      }
    }
    if (args.startDate !== undefined) patch.startDate = startDate;
    if (args.locationText !== undefined) {
      patch.locationText = normalizeText(args.locationText, 'Location', 120);
    }
    if (args.tags !== undefined) patch.tags = normalizeTags(args.tags);
    if (args.manpowerCount !== undefined) patch.manpowerCount = args.manpowerCount ?? undefined;
    if (args.costMinor !== undefined) patch.costMinor = args.costMinor ?? undefined;
    if (args.currencyCode !== undefined) {
      patch.currencyCode = normalizeCurrencyCode(args.currencyCode);
    }
    if (args.assigneeText !== undefined) {
      patch.assigneeText = args.assigneeText?.trim() || undefined;
    }
    if (args.assigneeUserId !== undefined) {
      patch.assigneeUserId = args.assigneeUserId ?? undefined;
    }
    if (args.dueDate !== undefined) patch.dueDate = dueDate;

    await ctx.db.patch(task._id, patch);

    const next = { ...task, ...patch };
    const changes: Array<{
      fieldKey: string;
      fieldLabel: string;
      oldValue?: string | null;
      newValue?: string | null;
    }> = [];
    if (args.title !== undefined) {
      changes.push({
        fieldKey: 'title',
        fieldLabel: 'Task title',
        oldValue: task.title,
        newValue: next.title,
      });
    }
    if (args.description !== undefined && task.description !== next.description) {
      changes.push({
        fieldKey: 'description',
        fieldLabel: 'Description',
        oldValue: task.description ? 'previous text' : undefined,
        newValue: next.description ? 'new text' : undefined,
      });
    }
    if (args.status !== undefined) {
      changes.push({
        fieldKey: 'status',
        fieldLabel: 'Status',
        oldValue: STATUS_LABELS[task.status],
        newValue: STATUS_LABELS[next.status],
      });
    }
    if (args.priority !== undefined) {
      changes.push({
        fieldKey: 'priority',
        fieldLabel: 'Priority',
        oldValue: PRIORITY_LABELS[task.priority],
        newValue: PRIORITY_LABELS[next.priority],
      });
    }
    if (args.category !== undefined) {
      changes.push({
        fieldKey: 'category',
        fieldLabel: 'Category',
        oldValue: displayCategory(task.category),
        newValue: displayCategory(next.category),
      });
    }
    if (args.assigneeUserId !== undefined || args.assigneeText !== undefined) {
      changes.push({
        fieldKey: 'assignee',
        fieldLabel: 'Assignee',
        oldValue: task.assigneeText,
        newValue: next.assigneeText,
      });
    }
    if (args.startDate !== undefined) {
      changes.push({
        fieldKey: 'startDate',
        fieldLabel: 'Start date',
        oldValue: task.startDate,
        newValue: next.startDate,
      });
    }
    if (args.dueDate !== undefined) {
      changes.push({
        fieldKey: 'dueDate',
        fieldLabel: 'Due date',
        oldValue: task.dueDate,
        newValue: next.dueDate,
      });
    }
    if (args.locationText !== undefined) {
      changes.push({
        fieldKey: 'location',
        fieldLabel: 'Location',
        oldValue: task.locationText,
        newValue: next.locationText,
      });
    }
    if (args.tags !== undefined) {
      changes.push({
        fieldKey: 'tags',
        fieldLabel: 'Tags',
        oldValue: displayList(task.tags),
        newValue: displayList(next.tags),
      });
    }
    if (args.manpowerCount !== undefined) {
      changes.push({
        fieldKey: 'manpower',
        fieldLabel: 'Manpower',
        oldValue: task.manpowerCount === undefined ? undefined : `${task.manpowerCount} people`,
        newValue: next.manpowerCount === undefined ? undefined : `${next.manpowerCount} people`,
      });
    }
    if (args.costMinor !== undefined || args.currencyCode !== undefined) {
      changes.push({
        fieldKey: 'cost',
        fieldLabel: 'Cost',
        oldValue: displayCost(task.costMinor, task.currencyCode),
        newValue: displayCost(next.costMinor, next.currencyCode),
      });
    }
    if (args.color !== undefined) {
      changes.push({
        fieldKey: 'pinColor',
        fieldLabel: 'Pin color',
        oldValue: task.color,
        newValue: next.color,
      });
    }
    for (const change of changes) {
      await recordTaskChange(ctx, {
        projectId: task.projectId,
        taskId: task._id,
        actorId,
        ...change,
      });
    }
  },
});

export const remove = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES);

    const [notes, attachments, attributeValues, quantityLines, activityEvents] = await Promise.all([
      ctx.db
        .query('notes')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('attachments')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('taskAttributeValues')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('taskActivityEvents')
        .withIndex('by_task_createdAt', (q) => q.eq('taskId', taskId))
        .collect(),
    ]);
    const attachmentsToDelete = attachments.filter((attachment) => attachment.kind !== 'photo');
    const photosToUnassign = attachments.filter((attachment) => attachment.kind === 'photo');
    for (const attachment of attachmentsToDelete) {
      try {
        await ctx.storage.delete(attachment.storageRef);
      } catch {
        // The metadata still needs to be removed if its stored file is already gone.
      }
    }
    await Promise.all([
      ...notes.map((note) => ctx.db.delete(note._id)),
      ...attributeValues.map((value) => ctx.db.delete(value._id)),
      ...quantityLines.map((line) => ctx.db.delete(line._id)),
      ...activityEvents.map((event) => ctx.db.delete(event._id)),
      ...attachmentsToDelete.map((attachment) => ctx.db.delete(attachment._id)),
      ...photosToUnassign.map((attachment) =>
        ctx.db.patch(attachment._id, {
          taskId: undefined,
          photoUpdatedAt: Math.max(Date.now(), (attachment.photoUpdatedAt ?? 0) + 1),
        }),
      ),
    ]);
    await ctx.db.delete(taskId);
  },
});
