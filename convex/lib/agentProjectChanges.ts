import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { CONTENT_EDITOR_ROLES, requireProjectRole } from './authz';
import { createNoteForActor } from '../notes';

const optionalString = v.optional(v.union(v.string(), v.null()));
const optionalNumber = v.optional(v.union(v.number(), v.null()));

const updateTaskChange = v.object({
  kind: v.literal('update_task'),
  taskNumber: v.number(),
  title: v.optional(v.string()),
  description: optionalString,
  status: v.optional(
    v.union(v.literal('open'), v.literal('in-progress'), v.literal('done'), v.literal('verified')),
  ),
  priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
  category: optionalString,
  color: optionalString,
  startDate: optionalString,
  dueDate: optionalString,
  locationText: optionalString,
  tags: v.optional(v.union(v.array(v.string()), v.null())),
  manpowerCount: optionalNumber,
  costMinor: optionalNumber,
  currencyCode: optionalString,
  assigneeName: optionalString,
  customAttributes: v.optional(
    v.array(
      v.object({
        name: v.string(),
        value: v.union(v.string(), v.number(), v.boolean(), v.null()),
      }),
    ),
  ),
});

const setTaskQuantityChange = v.object({
  kind: v.literal('set_task_quantity'),
  taskNumber: v.number(),
  lineNumber: v.optional(v.number()),
  quantityItemName: optionalString,
  plannedQuantity: optionalNumber,
  completedQuantity: optionalNumber,
  quantityUnit: optionalString,
});

export const agentProjectChange = v.union(
  updateTaskChange,
  setTaskQuantityChange,
  v.object({ kind: v.literal('add_task_note'), taskNumber: v.number(), text: v.string() }),
  v.object({
    kind: v.literal('update_project'),
    name: v.optional(v.string()),
    code: optionalString,
  }),
  v.object({
    kind: v.literal('update_sheet'),
    sheetNumber: v.string(),
    name: v.optional(v.string()),
    number: v.optional(v.string()),
    discipline: optionalString,
    version: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal('create_quantity_item'),
    name: v.string(),
    defaultUnit: v.string(),
  }),
  v.object({
    kind: v.literal('update_quantity_item'),
    itemName: v.string(),
    name: v.optional(v.string()),
    defaultUnit: v.optional(v.string()),
  }),
);

export type AgentProjectChange =
  | {
      kind: 'update_task';
      taskNumber: number;
      title?: string;
      description?: string | null;
      status?: Doc<'tasks'>['status'];
      priority?: Doc<'tasks'>['priority'];
      category?: string | null;
      color?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
      locationText?: string | null;
      tags?: string[] | null;
      manpowerCount?: number | null;
      costMinor?: number | null;
      currencyCode?: string | null;
      assigneeName?: string | null;
      customAttributes?: Array<{ name: string; value: string | number | boolean | null }>;
    }
  | {
      kind: 'set_task_quantity';
      taskNumber: number;
      lineNumber?: number;
      quantityItemName?: string | null;
      plannedQuantity?: number | null;
      completedQuantity?: number | null;
      quantityUnit?: string | null;
    }
  | { kind: 'add_task_note'; taskNumber: number; text: string }
  | { kind: 'update_project'; name?: string; code?: string | null }
  | {
      kind: 'update_sheet';
      sheetNumber: string;
      name?: string;
      number?: string;
      discipline?: string | null;
      version?: number;
    }
  | { kind: 'create_quantity_item'; name: string; defaultUnit: string }
  | { kind: 'update_quantity_item'; itemName: string; name?: string; defaultUnit?: string };

type TaskSnapshot = {
  title: string;
  description: string;
  status: Doc<'tasks'>['status'];
  priority: Doc<'tasks'>['priority'];
  category: string;
  color: string | null;
  plannedQuantity: number | null;
  completedQuantity: number | null;
  quantityUnit: string | null;
  quantityItemId: Id<'quantityItems'> | null;
  startDate: string | null;
  locationText: string | null;
  tags: string[] | null;
  manpowerCount: number | null;
  costMinor: number | null;
  currencyCode: string | null;
  assigneeText: string | null;
  assigneeUserId: Id<'users'> | null;
  dueDate: string | null;
  updatedAt: number;
};

type AttributeSnapshot = {
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  booleanValue: boolean | null;
  selectOptionId: string | null;
  updatedBy: Id<'users'>;
  createdAt: number;
  updatedAt: number;
} | null;

type QuantityLineSnapshot = {
  quantityItemId: Id<'quantityItems'> | null;
  plannedQuantity: number | null;
  completedQuantity: number | null;
  quantityUnit: string | null;
  updatedAt: number;
};

type UndoEntry =
  | {
      kind: 'restore_task';
      taskId: Id<'tasks'>;
      before: TaskSnapshot;
      afterUpdatedAt: number;
    }
  | { kind: 'delete_note'; noteId: Id<'notes'>; createdAt: number }
  | {
      kind: 'restore_project';
      projectId: Id<'projects'>;
      before: { name: string; code: string | null; updatedAt: number };
      afterUpdatedAt: number;
    }
  | {
      kind: 'restore_sheet';
      sheetId: Id<'sheets'>;
      before: {
        name: string;
        number: string;
        discipline: string | null;
        version: number;
        updatedAt: number;
      };
      afterUpdatedAt: number;
    }
  | {
      kind: 'restore_attribute';
      taskId: Id<'tasks'>;
      definitionId: Id<'taskAttributeDefinitions'>;
      before: AttributeSnapshot;
      after: AttributeSnapshot;
    }
  | {
      kind: 'restore_quantity_line';
      lineId: Id<'taskQuantities'>;
      before: QuantityLineSnapshot;
      afterUpdatedAt: number;
    }
  | { kind: 'delete_quantity_line'; lineId: Id<'taskQuantities'>; createdAt: number }
  | {
      kind: 'restore_quantity_item';
      itemId: Id<'quantityItems'>;
      before: { name: string; defaultUnit: string; updatedAt: number };
      afterUpdatedAt: number;
    }
  | { kind: 'delete_quantity_item'; itemId: Id<'quantityItems'>; createdAt: number };

export type AgentChangeUndoData = {
  version: 1;
  entries: UndoEntry[];
  activityEventIds: Id<'taskActivityEvents'>[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PIN_COLORS: Record<string, string> = {
  amber: '#d97706',
  red: '#dc2626',
  blue: '#2563eb',
  cyan: '#0891b2',
  green: '#16a34a',
  teal: '#0f766e',
  violet: '#7c3aed',
  slate: '#475569',
};

function timestampAfter(previous: number) {
  return Math.max(Date.now(), previous + 1);
}

function normalizedRequired(value: string, label: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizedOptional(value: string | null | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const normalized = value?.trim() || undefined;
  if (normalized && normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizedDate(value: string | null | undefined, label: string) {
  const normalized = normalizedOptional(value, label, 10);
  if (!normalized) return normalized;
  if (!DATE_PATTERN.test(normalized)) throw new Error(`${label} must use YYYY-MM-DD format`);
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return normalized;
}

function normalizedTags(value: string[] | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const supplied of value) {
    const tag = supplied.trim();
    if (!tag) continue;
    if (tag.length > 40) throw new Error('Each tag must be 40 characters or fewer');
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > 20) throw new Error('A task can have at most 20 tags');
  return tags.length ? tags : undefined;
}

function normalizedColor(value: string | null | undefined) {
  if (value === undefined || value === null || !value.trim())
    return value === undefined ? undefined : null;
  const normalized = value.trim().toLocaleLowerCase();
  const paletteColor = PIN_COLORS[normalized];
  if (paletteColor) return paletteColor;
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new Error('Pin color must be a standard color name or #RRGGBB value');
  }
  return normalized;
}

function assertNonNegative(value: number | null | undefined, label: string, whole = false) {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || value < 0 || (whole && !Number.isSafeInteger(value))) {
    throw new Error(`${label} must be a non-negative${whole ? ' whole' : ''} number`);
  }
}

function taskSnapshot(task: Doc<'tasks'>): TaskSnapshot {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    color: task.color ?? null,
    plannedQuantity: task.plannedQuantity ?? null,
    completedQuantity: task.completedQuantity ?? null,
    quantityUnit: task.quantityUnit ?? null,
    quantityItemId: task.quantityItemId ?? null,
    startDate: task.startDate ?? null,
    locationText: task.locationText ?? null,
    tags: task.tags ?? null,
    manpowerCount: task.manpowerCount ?? null,
    costMinor: task.costMinor ?? null,
    currencyCode: task.currencyCode ?? null,
    assigneeText: task.assigneeText ?? null,
    assigneeUserId: task.assigneeUserId ?? null,
    dueDate: task.dueDate ?? null,
    updatedAt: task.updatedAt,
  };
}

function attributeSnapshot(value: Doc<'taskAttributeValues'> | null): AttributeSnapshot {
  return value
    ? {
        textValue: value.textValue ?? null,
        numberValue: value.numberValue ?? null,
        dateValue: value.dateValue ?? null,
        booleanValue: value.booleanValue ?? null,
        selectOptionId: value.selectOptionId ?? null,
        updatedBy: value.updatedBy,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      }
    : null;
}

function quantityLineSnapshot(line: Doc<'taskQuantities'>): QuantityLineSnapshot {
  return {
    quantityItemId: line.quantityItemId ?? null,
    plannedQuantity: line.plannedQuantity ?? null,
    completedQuantity: line.completedQuantity ?? null,
    quantityUnit: line.quantityUnit ?? null,
    updatedAt: line.updatedAt,
  };
}

async function taskByNumber(ctx: MutationCtx, projectId: Id<'projects'>, taskNumber: number) {
  if (!Number.isSafeInteger(taskNumber) || taskNumber < 1) {
    throw new Error('Task number must be a positive whole number');
  }
  const task = await ctx.db
    .query('tasks')
    .withIndex('by_project_seq', (q) => q.eq('projectId', projectId).eq('seq', taskNumber))
    .unique();
  if (!task) throw new Error(`Task #${taskNumber} was not found in this project`);
  return task;
}

async function resolveAssignee(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  suppliedName: string | null | undefined,
) {
  if (suppliedName === undefined) return undefined;
  if (suppliedName === null || !suppliedName.trim()) {
    return { assigneeUserId: undefined, assigneeText: undefined };
  }
  const matchText = suppliedName.trim().toLocaleLowerCase();
  const memberships = await ctx.db
    .query('projectMembers')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  const rows = await Promise.all(
    memberships.map(async (membership) => ({
      membership,
      user: await ctx.db.get(membership.userId),
    })),
  );
  const matches = rows.filter(({ user }) =>
    [user?.name, user?.email].some((value) => value?.trim().toLocaleLowerCase() === matchText),
  );
  if (matches.length !== 1 || !matches[0].user) {
    throw new Error(
      matches.length > 1
        ? `More than one project member matches "${suppliedName}"`
        : `No project member exactly matches "${suppliedName}"`,
    );
  }
  return {
    assigneeUserId: matches[0].membership.userId,
    assigneeText: matches[0].user.name?.trim() || matches[0].user.email?.trim(),
  };
}

async function recordAgentChange(
  ctx: MutationCtx,
  args: {
    projectId: Id<'projects'>;
    taskId: Id<'tasks'>;
    actorId: Id<'users'>;
    fieldKey: string;
    fieldLabel: string;
    oldValue?: string;
    newValue?: string;
    kind?: 'attribute_changed' | 'quantity_changed';
  },
) {
  if (args.oldValue === args.newValue) return undefined;
  const label = args.fieldLabel.toLocaleLowerCase();
  const summary =
    args.oldValue === undefined
      ? `Set ${label} to ${args.newValue}`
      : args.newValue === undefined
        ? `Cleared ${label}`
        : `Changed ${label} from ${args.oldValue} to ${args.newValue}`;
  const now = Date.now();
  return await ctx.db.insert('taskActivityEvents', {
    projectId: args.projectId,
    taskId: args.taskId,
    actorId: args.actorId,
    kind: args.kind ?? 'attribute_changed',
    fieldKey: args.fieldKey,
    fieldLabel: args.fieldLabel,
    oldValue: args.oldValue?.slice(0, 500),
    newValue: args.newValue?.slice(0, 500),
    summary: summary.slice(0, 500),
    createdAt: now,
    updatedAt: now,
  });
}

function displayTaskValue(key: keyof TaskSnapshot, value: TaskSnapshot[keyof TaskSnapshot]) {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) return value.join(', ');
  if (key === 'costMinor' && typeof value === 'number') return (value / 100).toFixed(2);
  return String(value);
}

async function updateCustomAttribute(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  actorId: Id<'users'>,
  input: { name: string; value: string | number | boolean | null },
  entries: UndoEntry[],
  activityEventIds: Id<'taskActivityEvents'>[],
) {
  const definitions = await ctx.db
    .query('taskAttributeDefinitions')
    .withIndex('by_project', (q) => q.eq('projectId', task.projectId))
    .collect();
  const name = normalizedRequired(input.name, 'Custom attribute name', 60).toLocaleLowerCase();
  const matches = definitions.filter(
    (definition) =>
      definition.archivedAt === undefined && definition.name.toLocaleLowerCase() === name,
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length > 1
        ? `More than one custom attribute is named "${input.name}"`
        : `Custom attribute "${input.name}" was not found`,
    );
  }
  const definition = matches[0];
  const existingRows = await ctx.db
    .query('taskAttributeValues')
    .withIndex('by_task_definition', (q) =>
      q.eq('taskId', task._id).eq('definitionId', definition._id),
    )
    .collect();
  const current = existingRows[0] ?? null;
  const before = attributeSnapshot(current);
  let fields:
    | {
        textValue?: string;
        numberValue?: number;
        dateValue?: string;
        booleanValue?: boolean;
        selectOptionId?: string;
      }
    | undefined;
  let displayValue: string | undefined;

  if (input.value !== null) {
    fields = {};
    if (definition.type === 'text') {
      if (typeof input.value !== 'string') throw new Error(`${definition.name} requires text`);
      const value = normalizedRequired(input.value, definition.name, 2000);
      fields.textValue = value;
      displayValue = value;
    } else if (definition.type === 'number') {
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
        throw new Error(`${definition.name} requires a finite number`);
      }
      fields.numberValue = input.value;
      displayValue = `${input.value}${definition.unit ? ` ${definition.unit}` : ''}`;
    } else if (definition.type === 'date') {
      if (typeof input.value !== 'string') throw new Error(`${definition.name} requires a date`);
      fields.dateValue = normalizedDate(input.value, definition.name);
      displayValue = fields.dateValue;
    } else if (definition.type === 'boolean') {
      if (typeof input.value !== 'boolean')
        throw new Error(`${definition.name} requires true or false`);
      fields.booleanValue = input.value;
      displayValue = input.value ? 'Yes' : 'No';
    } else {
      if (typeof input.value !== 'string') {
        throw new Error(`${definition.name} requires a dropdown option label`);
      }
      const optionText = input.value.trim().toLocaleLowerCase();
      const options = definition.options?.filter(
        (option) =>
          option.active &&
          (option.id.toLocaleLowerCase() === optionText ||
            option.label.toLocaleLowerCase() === optionText),
      );
      if (options?.length !== 1) throw new Error(`Dropdown option "${input.value}" was not found`);
      fields.selectOptionId = options[0].id;
      displayValue = options[0].label;
    }
  }

  if (fields === undefined) {
    await Promise.all(existingRows.map((row) => ctx.db.delete(row._id)));
  } else {
    const now = timestampAfter(current?.updatedAt ?? 0);
    if (current) {
      await ctx.db.patch(current._id, {
        textValue: undefined,
        numberValue: undefined,
        dateValue: undefined,
        booleanValue: undefined,
        selectOptionId: undefined,
        ...fields,
        updatedBy: actorId,
        updatedAt: now,
      });
      await Promise.all(existingRows.slice(1).map((row) => ctx.db.delete(row._id)));
    } else {
      await ctx.db.insert('taskAttributeValues', {
        projectId: task.projectId,
        taskId: task._id,
        definitionId: definition._id,
        ...fields,
        updatedBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const nextRows = await ctx.db
    .query('taskAttributeValues')
    .withIndex('by_task_definition', (q) =>
      q.eq('taskId', task._id).eq('definitionId', definition._id),
    )
    .collect();
  const after = attributeSnapshot(nextRows[0] ?? null);
  if (attributeMatches(before, after)) return;
  entries.push({
    kind: 'restore_attribute',
    taskId: task._id,
    definitionId: definition._id,
    before,
    after,
  });
  const oldDisplay = before
    ? (before.textValue ??
      before.numberValue?.toString() ??
      before.dateValue ??
      (before.booleanValue === null ? undefined : before.booleanValue ? 'Yes' : 'No') ??
      definition.options?.find((option) => option.id === before.selectOptionId)?.label)
    : undefined;
  const eventId = await recordAgentChange(ctx, {
    projectId: task.projectId,
    taskId: task._id,
    actorId,
    fieldKey: `custom:${definition._id}`,
    fieldLabel: definition.name,
    oldValue: oldDisplay,
    newValue: displayValue,
  });
  if (eventId) activityEventIds.push(eventId);
}

async function applyTaskUpdate(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  actorId: Id<'users'>,
  change: Extract<AgentProjectChange, { kind: 'update_task' }>,
  entries: UndoEntry[],
  activityEventIds: Id<'taskActivityEvents'>[],
) {
  const task = await taskByNumber(ctx, projectId, change.taskNumber);
  const before = taskSnapshot(task);
  const assignee = await resolveAssignee(ctx, projectId, change.assigneeName);
  const patch: Partial<Doc<'tasks'>> = {};
  const changedFields: Array<{ key: keyof TaskSnapshot; label: string }> = [];

  if (change.title !== undefined) {
    patch.title = normalizedRequired(change.title, 'Task title', 200);
    changedFields.push({ key: 'title', label: 'Task title' });
  }
  if (change.description !== undefined) {
    patch.description = normalizedOptional(change.description, 'Task description', 4000) ?? '';
    changedFields.push({ key: 'description', label: 'Description' });
  }
  if (change.status !== undefined) {
    patch.status = change.status;
    changedFields.push({ key: 'status', label: 'Status' });
  }
  if (change.priority !== undefined) {
    patch.priority = change.priority;
    changedFields.push({ key: 'priority', label: 'Priority' });
  }
  if (change.category !== undefined) {
    patch.category = normalizedOptional(change.category, 'Task category', 80) ?? 'general';
    changedFields.push({ key: 'category', label: 'Category' });
  }
  if (change.color !== undefined) {
    patch.color = normalizedColor(change.color) ?? undefined;
    changedFields.push({ key: 'color', label: 'Pin color' });
  }
  if (change.startDate !== undefined) {
    patch.startDate = normalizedDate(change.startDate, 'Start date');
    changedFields.push({ key: 'startDate', label: 'Start date' });
  }
  if (change.dueDate !== undefined) {
    patch.dueDate = normalizedDate(change.dueDate, 'Due date');
    changedFields.push({ key: 'dueDate', label: 'Due date' });
  }
  if (change.locationText !== undefined) {
    patch.locationText = normalizedOptional(change.locationText, 'Location', 120);
    changedFields.push({ key: 'locationText', label: 'Location' });
  }
  if (change.tags !== undefined) {
    patch.tags = normalizedTags(change.tags);
    changedFields.push({ key: 'tags', label: 'Tags' });
  }
  if (change.manpowerCount !== undefined) {
    assertNonNegative(change.manpowerCount, 'Manpower', true);
    patch.manpowerCount = change.manpowerCount ?? undefined;
    changedFields.push({ key: 'manpowerCount', label: 'Manpower' });
  }
  if (change.costMinor !== undefined) {
    assertNonNegative(change.costMinor, 'Cost', true);
    patch.costMinor = change.costMinor ?? undefined;
    changedFields.push({ key: 'costMinor', label: 'Cost' });
  }
  if (change.currencyCode !== undefined) {
    const currencyCode = normalizedOptional(change.currencyCode, 'Currency', 3)?.toUpperCase();
    if (currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) {
      throw new Error('Currency must be a three-letter code');
    }
    patch.currencyCode = currencyCode;
    changedFields.push({ key: 'currencyCode', label: 'Currency' });
  }
  if (assignee !== undefined) {
    patch.assigneeUserId = assignee.assigneeUserId;
    patch.assigneeText = assignee.assigneeText;
    changedFields.push({ key: 'assigneeText', label: 'Assignee' });
  }
  const nextStartDate = change.startDate !== undefined ? patch.startDate : task.startDate;
  const nextDueDate = change.dueDate !== undefined ? patch.dueDate : task.dueDate;
  if (nextStartDate && nextDueDate && nextDueDate < nextStartDate) {
    throw new Error('Due date cannot be earlier than start date');
  }
  if (changedFields.length === 0 && !change.customAttributes?.length) {
    throw new Error(`No fields were supplied for Task #${task.seq}`);
  }

  if (changedFields.length > 0) {
    const updatedAt = timestampAfter(task.updatedAt);
    patch.updatedAt = updatedAt;
    await ctx.db.patch(task._id, patch);
    entries.push({ kind: 'restore_task', taskId: task._id, before, afterUpdatedAt: updatedAt });
    const after = taskSnapshot({ ...task, ...patch } as Doc<'tasks'>);
    for (const field of changedFields) {
      const eventId = await recordAgentChange(ctx, {
        projectId,
        taskId: task._id,
        actorId,
        fieldKey: String(field.key),
        fieldLabel: field.label,
        oldValue: displayTaskValue(field.key, before[field.key]),
        newValue: displayTaskValue(field.key, after[field.key]),
      });
      if (eventId) activityEventIds.push(eventId);
    }
  }

  const currentTask = (await ctx.db.get(task._id)) ?? task;
  for (const attribute of change.customAttributes ?? []) {
    await updateCustomAttribute(ctx, currentTask, actorId, attribute, entries, activityEventIds);
  }
  const labels = [
    ...changedFields.map((field) => field.label.toLocaleLowerCase()),
    ...(change.customAttributes ?? []).map((attribute) => attribute.name),
  ];
  return `Task #${task.seq} (${labels.join(', ')})`;
}

async function activeQuantityItemByName(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  suppliedName: string | null | undefined,
) {
  if (suppliedName === undefined) return undefined;
  if (suppliedName === null || !suppliedName.trim()) return null;
  const name = suppliedName.trim().toLocaleLowerCase();
  const items = await ctx.db
    .query('quantityItems')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  const matches = items.filter(
    (item) => item.archivedAt === undefined && item.name.toLocaleLowerCase() === name,
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length > 1
        ? `More than one quantity item is named "${suppliedName}"`
        : `Quantity item "${suppliedName}" was not found`,
    );
  }
  return matches[0];
}

function displayQuantity(
  itemName: string | undefined,
  planned: number | undefined,
  completed: number | undefined,
  unit: string | undefined,
) {
  return [
    itemName,
    planned === undefined ? undefined : `${planned} planned`,
    completed === undefined ? undefined : `${completed} completed`,
    unit,
  ]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');
}

async function applyTaskQuantity(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  actorId: Id<'users'>,
  change: Extract<AgentProjectChange, { kind: 'set_task_quantity' }>,
  entries: UndoEntry[],
  activityEventIds: Id<'taskActivityEvents'>[],
) {
  if (
    change.quantityItemName === undefined &&
    change.plannedQuantity === undefined &&
    change.completedQuantity === undefined &&
    change.quantityUnit === undefined
  ) {
    throw new Error(`No quantity fields were supplied for Task #${change.taskNumber}`);
  }
  if (
    change.lineNumber !== undefined &&
    (!Number.isSafeInteger(change.lineNumber) || change.lineNumber < 0)
  ) {
    throw new Error('Quantity line number must be zero or a positive whole number');
  }
  assertNonNegative(change.plannedQuantity, 'Planned quantity');
  assertNonNegative(change.completedQuantity, 'Completed quantity');
  const task = await taskByNumber(ctx, projectId, change.taskNumber);
  const item = await activeQuantityItemByName(ctx, projectId, change.quantityItemName);
  const unit =
    change.quantityUnit === undefined
      ? undefined
      : normalizedOptional(change.quantityUnit, 'Quantity unit', 24)?.toUpperCase();
  const lines = await ctx.db
    .query('taskQuantities')
    .withIndex('by_task', (q) => q.eq('taskId', task._id))
    .collect();
  lines.sort((a, b) => a.createdAt - b.createdAt);

  if (change.lineNumber === 0) {
    if (
      lines.length === 0 &&
      (task.quantityItemId !== undefined ||
        task.plannedQuantity !== undefined ||
        task.completedQuantity !== undefined)
    ) {
      throw new Error(
        `Task #${task.seq} has a legacy quantity. Update line 1 before adding another line`,
      );
    }
    const now = Date.now();
    const lineId = await ctx.db.insert('taskQuantities', {
      projectId,
      taskId: task._id,
      quantityItemId: item === undefined ? undefined : (item?._id ?? undefined),
      plannedQuantity: change.plannedQuantity ?? undefined,
      completedQuantity: change.completedQuantity ?? undefined,
      quantityUnit: unit ?? item?.defaultUnit,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
    entries.push({ kind: 'delete_quantity_line', lineId, createdAt: now });
    const eventId = await recordAgentChange(ctx, {
      projectId,
      taskId: task._id,
      actorId,
      kind: 'quantity_changed',
      fieldKey: `quantity:${lineId}`,
      fieldLabel: `${item?.name ?? 'Unclassified'} quantity`,
      newValue: displayQuantity(
        item?.name,
        change.plannedQuantity ?? undefined,
        change.completedQuantity ?? undefined,
        unit ?? item?.defaultUnit,
      ),
    });
    if (eventId) activityEventIds.push(eventId);
    return `Task #${task.seq} quantity line ${lines.length + 1}`;
  }

  const requestedLine = change.lineNumber;
  if (lines.length > 0) {
    if (requestedLine === undefined && lines.length !== 1) {
      throw new Error(`Task #${task.seq} has multiple quantities; provide lineNumber`);
    }
    const index = (requestedLine ?? 1) - 1;
    const line = lines[index];
    if (!line) throw new Error(`Quantity line ${requestedLine} was not found on Task #${task.seq}`);
    const before = quantityLineSnapshot(line);
    const oldItem = line.quantityItemId ? await ctx.db.get(line.quantityItemId) : undefined;
    const patch: Partial<Doc<'taskQuantities'>> = {
      updatedAt: timestampAfter(line.updatedAt),
    };
    if (change.quantityItemName !== undefined) patch.quantityItemId = item?._id;
    if (change.plannedQuantity !== undefined)
      patch.plannedQuantity = change.plannedQuantity ?? undefined;
    if (change.completedQuantity !== undefined) {
      patch.completedQuantity = change.completedQuantity ?? undefined;
    }
    if (change.quantityUnit !== undefined) patch.quantityUnit = unit;
    else if (item) patch.quantityUnit = item.defaultUnit;
    await ctx.db.patch(line._id, patch);
    entries.push({
      kind: 'restore_quantity_line',
      lineId: line._id,
      before,
      afterUpdatedAt: patch.updatedAt!,
    });
    const eventId = await recordAgentChange(ctx, {
      projectId,
      taskId: task._id,
      actorId,
      kind: 'quantity_changed',
      fieldKey: `quantity:${line._id}`,
      fieldLabel: `${item?.name ?? oldItem?.name ?? 'Unclassified'} quantity`,
      oldValue: displayQuantity(
        oldItem?.name,
        line.plannedQuantity,
        line.completedQuantity,
        line.quantityUnit,
      ),
      newValue: displayQuantity(
        item?.name ?? (change.quantityItemName === undefined ? oldItem?.name : undefined),
        change.plannedQuantity !== undefined
          ? (change.plannedQuantity ?? undefined)
          : line.plannedQuantity,
        change.completedQuantity !== undefined
          ? (change.completedQuantity ?? undefined)
          : line.completedQuantity,
        change.quantityUnit !== undefined ? unit : (patch.quantityUnit ?? line.quantityUnit),
      ),
    });
    if (eventId) activityEventIds.push(eventId);
    return `Task #${task.seq} quantity line ${index + 1}`;
  }

  if (requestedLine !== undefined && requestedLine !== 1) {
    throw new Error(`Quantity line ${requestedLine} was not found on Task #${task.seq}`);
  }
  const before = taskSnapshot(task);
  const oldItem = task.quantityItemId ? await ctx.db.get(task.quantityItemId) : undefined;
  const patch: Partial<Doc<'tasks'>> = { updatedAt: timestampAfter(task.updatedAt) };
  if (change.quantityItemName !== undefined) patch.quantityItemId = item?._id;
  if (change.plannedQuantity !== undefined)
    patch.plannedQuantity = change.plannedQuantity ?? undefined;
  if (change.completedQuantity !== undefined) {
    patch.completedQuantity = change.completedQuantity ?? undefined;
  }
  if (change.quantityUnit !== undefined) patch.quantityUnit = unit;
  else if (item) patch.quantityUnit = item.defaultUnit;
  await ctx.db.patch(task._id, patch);
  entries.push({
    kind: 'restore_task',
    taskId: task._id,
    before,
    afterUpdatedAt: patch.updatedAt!,
  });
  const eventId = await recordAgentChange(ctx, {
    projectId,
    taskId: task._id,
    actorId,
    kind: 'quantity_changed',
    fieldKey: 'quantity:legacy',
    fieldLabel: `${item?.name ?? oldItem?.name ?? 'Unclassified'} quantity`,
    oldValue: displayQuantity(
      oldItem?.name,
      task.plannedQuantity,
      task.completedQuantity,
      task.quantityUnit,
    ),
    newValue: displayQuantity(
      item?.name ?? (change.quantityItemName === undefined ? oldItem?.name : undefined),
      change.plannedQuantity !== undefined
        ? (change.plannedQuantity ?? undefined)
        : task.plannedQuantity,
      change.completedQuantity !== undefined
        ? (change.completedQuantity ?? undefined)
        : task.completedQuantity,
      change.quantityUnit !== undefined ? unit : (patch.quantityUnit ?? task.quantityUnit),
    ),
  });
  if (eventId) activityEventIds.push(eventId);
  return `Task #${task.seq} quantity line 1`;
}

async function uniqueSheetByNumber(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  sheetNumber: string,
) {
  const wanted = normalizedRequired(sheetNumber, 'Sheet number', 120).toLocaleLowerCase();
  const sheets = await ctx.db
    .query('sheets')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  const matches = sheets.filter((sheet) => sheet.number.toLocaleLowerCase() === wanted);
  if (matches.length !== 1) {
    throw new Error(
      matches.length > 1
        ? `More than one sheet is numbered "${sheetNumber}"`
        : `Sheet "${sheetNumber}" was not found`,
    );
  }
  return matches[0];
}

async function assertUniqueQuantityItemName(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  name: string,
  exceptId?: Id<'quantityItems'>,
) {
  const items = await ctx.db
    .query('quantityItems')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  if (
    items.some(
      (item) =>
        item.archivedAt === undefined &&
        item._id !== exceptId &&
        item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  ) {
    throw new Error(`A quantity item named "${name}" already exists`);
  }
}

export async function executeAgentProjectChanges(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  actorId: Id<'users'>,
  changes: AgentProjectChange[],
) {
  await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, actorId);
  if (changes.length < 1 || changes.length > 25) {
    throw new Error('Submit between 1 and 25 changes in one approved batch');
  }
  const entries: UndoEntry[] = [];
  const activityEventIds: Id<'taskActivityEvents'>[] = [];
  const summaries: string[] = [];

  for (const change of changes) {
    if (change.kind === 'update_task') {
      summaries.push(
        await applyTaskUpdate(ctx, projectId, actorId, change, entries, activityEventIds),
      );
      continue;
    }
    if (change.kind === 'set_task_quantity') {
      summaries.push(
        await applyTaskQuantity(ctx, projectId, actorId, change, entries, activityEventIds),
      );
      continue;
    }
    if (change.kind === 'add_task_note') {
      const task = await taskByNumber(ctx, projectId, change.taskNumber);
      const text = change.text.trim();
      if (!text) throw new Error('Note is required');
      if (text.length > 4000) throw new Error('Note must be 4000 characters or fewer');
      const noteId = await createNoteForActor(ctx, { taskId: task._id, text }, actorId);
      const note = await ctx.db.get(noteId);
      if (!note) throw new Error('Could not save the task note');
      entries.push({ kind: 'delete_note', noteId, createdAt: note.createdAt });
      summaries.push(`Task #${task.seq} note`);
      continue;
    }
    if (change.kind === 'update_project') {
      await requireProjectRole(ctx, projectId, ['owner', 'admin'], actorId);
      if (change.name === undefined && change.code === undefined) {
        throw new Error('No project fields were supplied');
      }
      const project = await ctx.db.get(projectId);
      if (!project) throw new Error('Project not found');
      const before = {
        name: project.name,
        code: project.code ?? null,
        updatedAt: project.updatedAt,
      };
      const patch: Partial<Doc<'projects'>> = {
        updatedAt: timestampAfter(project.updatedAt),
      };
      if (change.name !== undefined)
        patch.name = normalizedRequired(change.name, 'Project name', 120);
      if (change.code !== undefined)
        patch.code = normalizedOptional(change.code, 'Project code', 40);
      await ctx.db.patch(projectId, patch);
      entries.push({
        kind: 'restore_project',
        projectId,
        before,
        afterUpdatedAt: patch.updatedAt!,
      });
      summaries.push('project metadata');
      continue;
    }
    if (change.kind === 'update_sheet') {
      await requireProjectRole(ctx, projectId, ['owner', 'admin'], actorId);
      if (
        change.name === undefined &&
        change.number === undefined &&
        change.discipline === undefined &&
        change.version === undefined
      ) {
        throw new Error(`No fields were supplied for sheet ${change.sheetNumber}`);
      }
      const sheet = await uniqueSheetByNumber(ctx, projectId, change.sheetNumber);
      const before = {
        name: sheet.name,
        number: sheet.number,
        discipline: sheet.discipline ?? null,
        version: sheet.version,
        updatedAt: sheet.updatedAt,
      };
      const patch: Partial<Doc<'sheets'>> = { updatedAt: timestampAfter(sheet.updatedAt) };
      if (change.name !== undefined)
        patch.name = normalizedRequired(change.name, 'Sheet name', 200);
      if (change.number !== undefined) {
        patch.number = normalizedRequired(change.number, 'Sheet number', 120);
      }
      if (change.discipline !== undefined) {
        patch.discipline = normalizedOptional(change.discipline, 'Discipline', 120);
      }
      if (change.version !== undefined) {
        if (!Number.isSafeInteger(change.version) || change.version < 1) {
          throw new Error('Sheet version must be a positive whole number');
        }
        patch.version = change.version;
      }
      await ctx.db.patch(sheet._id, patch);
      entries.push({
        kind: 'restore_sheet',
        sheetId: sheet._id,
        before,
        afterUpdatedAt: patch.updatedAt!,
      });
      summaries.push(`sheet ${sheet.number}`);
      continue;
    }
    if (change.kind === 'create_quantity_item') {
      await requireProjectRole(ctx, projectId, ['owner', 'admin'], actorId);
      const name = normalizedRequired(change.name, 'Quantity item name', 80);
      const defaultUnit = normalizedRequired(change.defaultUnit, 'Default unit', 24).toUpperCase();
      await assertUniqueQuantityItemName(ctx, projectId, name);
      const now = Date.now();
      const itemId = await ctx.db.insert('quantityItems', {
        projectId,
        name,
        defaultUnit,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
      entries.push({ kind: 'delete_quantity_item', itemId, createdAt: now });
      summaries.push(`quantity item ${name}`);
      continue;
    }
    await requireProjectRole(ctx, projectId, ['owner', 'admin'], actorId);
    if (change.name === undefined && change.defaultUnit === undefined) {
      throw new Error(`No fields were supplied for quantity item ${change.itemName}`);
    }
    const item = await activeQuantityItemByName(ctx, projectId, change.itemName);
    if (!item) throw new Error(`Quantity item "${change.itemName}" was not found`);
    const nextName =
      change.name === undefined
        ? item.name
        : normalizedRequired(change.name, 'Quantity item name', 80);
    const defaultUnit =
      change.defaultUnit === undefined
        ? item.defaultUnit
        : normalizedRequired(change.defaultUnit, 'Default unit', 24).toUpperCase();
    await assertUniqueQuantityItemName(ctx, projectId, nextName, item._id);
    const before = { name: item.name, defaultUnit: item.defaultUnit, updatedAt: item.updatedAt };
    const updatedAt = timestampAfter(item.updatedAt);
    await ctx.db.patch(item._id, { name: nextName, defaultUnit, updatedAt });
    entries.push({
      kind: 'restore_quantity_item',
      itemId: item._id,
      before,
      afterUpdatedAt: updatedAt,
    });
    summaries.push(`quantity item ${item.name}`);
  }

  return {
    summary:
      summaries.length === 1
        ? `Changed ${summaries[0]}`
        : `Changed ${summaries.length} records: ${summaries.join('; ')}`,
    undoData: { version: 1, entries, activityEventIds } satisfies AgentChangeUndoData,
  };
}

function taskRestorePatch(before: TaskSnapshot): Partial<Doc<'tasks'>> {
  return {
    title: before.title,
    description: before.description,
    status: before.status,
    priority: before.priority,
    category: before.category,
    color: before.color ?? undefined,
    plannedQuantity: before.plannedQuantity ?? undefined,
    completedQuantity: before.completedQuantity ?? undefined,
    quantityUnit: before.quantityUnit ?? undefined,
    quantityItemId: before.quantityItemId ?? undefined,
    startDate: before.startDate ?? undefined,
    locationText: before.locationText ?? undefined,
    tags: before.tags ?? undefined,
    manpowerCount: before.manpowerCount ?? undefined,
    costMinor: before.costMinor ?? undefined,
    currencyCode: before.currencyCode ?? undefined,
    assigneeText: before.assigneeText ?? undefined,
    assigneeUserId: before.assigneeUserId ?? undefined,
    dueDate: before.dueDate ?? undefined,
    updatedAt: before.updatedAt,
  };
}

function attributeMatches(current: AttributeSnapshot, expected: AttributeSnapshot) {
  if (current === null || expected === null) return current === expected;
  return (
    current.textValue === expected.textValue &&
    current.numberValue === expected.numberValue &&
    current.dateValue === expected.dateValue &&
    current.booleanValue === expected.booleanValue &&
    current.selectOptionId === expected.selectOptionId &&
    current.updatedBy === expected.updatedBy &&
    current.createdAt === expected.createdAt &&
    current.updatedAt === expected.updatedAt
  );
}

async function setAttributeSnapshot(
  ctx: MutationCtx,
  taskId: Id<'tasks'>,
  definitionId: Id<'taskAttributeDefinitions'>,
  snapshot: AttributeSnapshot,
) {
  const existing = await ctx.db
    .query('taskAttributeValues')
    .withIndex('by_task_definition', (q) => q.eq('taskId', taskId).eq('definitionId', definitionId))
    .collect();
  if (!snapshot) {
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
    return;
  }
  const fields = {
    textValue: snapshot.textValue ?? undefined,
    numberValue: snapshot.numberValue ?? undefined,
    dateValue: snapshot.dateValue ?? undefined,
    booleanValue: snapshot.booleanValue ?? undefined,
    selectOptionId: snapshot.selectOptionId ?? undefined,
    updatedBy: snapshot.updatedBy,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
  if (existing[0]) {
    await ctx.db.patch(existing[0]._id, fields);
    await Promise.all(existing.slice(1).map((row) => ctx.db.delete(row._id)));
    return;
  }
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error('The task for a custom attribute no longer exists');
  await ctx.db.insert('taskAttributeValues', {
    projectId: task.projectId,
    taskId,
    definitionId,
    ...fields,
  });
}

export async function undoAgentProjectChanges(
  ctx: MutationCtx,
  rawUndoData: unknown,
  actorId: Id<'users'>,
) {
  const undoData = rawUndoData as AgentChangeUndoData;
  if (!undoData || undoData.version !== 1 || !Array.isArray(undoData.entries)) {
    throw new Error('This AI change does not contain valid undo data');
  }

  for (const entry of [...undoData.entries].reverse()) {
    if (entry.kind === 'restore_task') {
      const task = await ctx.db.get(entry.taskId);
      if (!task) throw new Error('A task changed by this AI job no longer exists');
      await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);
      if (task.updatedAt !== entry.afterUpdatedAt) {
        throw new Error(
          `Task #${task.seq} changed after the AI job, so Undo would overwrite newer work`,
        );
      }
      await ctx.db.patch(task._id, taskRestorePatch(entry.before));
      continue;
    }
    if (entry.kind === 'delete_note') {
      const note = await ctx.db.get(entry.noteId);
      if (!note) throw new Error('A note added by this AI job no longer exists');
      await requireProjectRole(ctx, note.projectId, CONTENT_EDITOR_ROLES, actorId);
      if (
        note.authorId !== actorId ||
        note.createdAt !== entry.createdAt ||
        note.editedAt !== undefined
      ) {
        throw new Error('A note added by this AI job changed and cannot be undone safely');
      }
      await ctx.db.delete(note._id);
      continue;
    }
    if (entry.kind === 'restore_project') {
      const project = await ctx.db.get(entry.projectId);
      if (!project) throw new Error('The project changed by this AI job no longer exists');
      await requireProjectRole(ctx, project._id, ['owner', 'admin'], actorId);
      if (project.updatedAt !== entry.afterUpdatedAt) {
        throw new Error('Project metadata changed after the AI job and cannot be overwritten');
      }
      await ctx.db.patch(project._id, {
        name: entry.before.name,
        code: entry.before.code ?? undefined,
        updatedAt: entry.before.updatedAt,
      });
      continue;
    }
    if (entry.kind === 'restore_sheet') {
      const sheet = await ctx.db.get(entry.sheetId);
      if (!sheet) throw new Error('A sheet changed by this AI job no longer exists');
      await requireProjectRole(ctx, sheet.projectId, ['owner', 'admin'], actorId);
      if (sheet.updatedAt !== entry.afterUpdatedAt) {
        throw new Error(`Sheet ${sheet.number} changed after the AI job and cannot be overwritten`);
      }
      await ctx.db.patch(sheet._id, {
        name: entry.before.name,
        number: entry.before.number,
        discipline: entry.before.discipline ?? undefined,
        version: entry.before.version,
        updatedAt: entry.before.updatedAt,
      });
      continue;
    }
    if (entry.kind === 'restore_attribute') {
      const task = await ctx.db.get(entry.taskId);
      if (!task) throw new Error('The task for a custom attribute no longer exists');
      await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, actorId);
      const currentRows = await ctx.db
        .query('taskAttributeValues')
        .withIndex('by_task_definition', (q) =>
          q.eq('taskId', entry.taskId).eq('definitionId', entry.definitionId),
        )
        .collect();
      const current = attributeSnapshot(currentRows[0] ?? null);
      if (currentRows.length > 1 || !attributeMatches(current, entry.after)) {
        throw new Error('A custom task attribute changed after the AI job');
      }
      await setAttributeSnapshot(ctx, entry.taskId, entry.definitionId, entry.before);
      continue;
    }
    if (entry.kind === 'restore_quantity_line') {
      const line = await ctx.db.get(entry.lineId);
      if (!line) throw new Error('A quantity changed by this AI job no longer exists');
      await requireProjectRole(ctx, line.projectId, CONTENT_EDITOR_ROLES, actorId);
      if (line.updatedAt !== entry.afterUpdatedAt) {
        throw new Error('A task quantity changed after the AI job');
      }
      await ctx.db.patch(line._id, {
        quantityItemId: entry.before.quantityItemId ?? undefined,
        plannedQuantity: entry.before.plannedQuantity ?? undefined,
        completedQuantity: entry.before.completedQuantity ?? undefined,
        quantityUnit: entry.before.quantityUnit ?? undefined,
        updatedAt: entry.before.updatedAt,
      });
      continue;
    }
    if (entry.kind === 'delete_quantity_line') {
      const line = await ctx.db.get(entry.lineId);
      if (!line) throw new Error('A quantity added by this AI job no longer exists');
      await requireProjectRole(ctx, line.projectId, CONTENT_EDITOR_ROLES, actorId);
      if (line.createdAt !== entry.createdAt || line.updatedAt !== entry.createdAt) {
        throw new Error('A quantity added by this AI job changed and cannot be undone safely');
      }
      await ctx.db.delete(line._id);
      continue;
    }
    if (entry.kind === 'restore_quantity_item') {
      const item = await ctx.db.get(entry.itemId);
      if (!item) throw new Error('A quantity item changed by this AI job no longer exists');
      await requireProjectRole(ctx, item.projectId, ['owner', 'admin'], actorId);
      if (item.updatedAt !== entry.afterUpdatedAt) {
        throw new Error('A quantity item changed after the AI job');
      }
      await ctx.db.patch(item._id, {
        name: entry.before.name,
        defaultUnit: entry.before.defaultUnit,
        updatedAt: entry.before.updatedAt,
      });
      continue;
    }
    const item = await ctx.db.get(entry.itemId);
    if (!item) throw new Error('A quantity item added by this AI job no longer exists');
    await requireProjectRole(ctx, item.projectId, ['owner', 'admin'], actorId);
    if (item.createdAt !== entry.createdAt || item.updatedAt !== entry.createdAt) {
      throw new Error('A quantity item added by this AI job changed and cannot be undone safely');
    }
    const [tasks, quantityLines] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', item.projectId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_quantity_item', (q) => q.eq('quantityItemId', item._id))
        .collect(),
    ]);
    if (tasks.some((task) => task.quantityItemId === item._id) || quantityLines.length > 0) {
      throw new Error('A quantity item added by this AI job is now in use');
    }
    await ctx.db.delete(item._id);
  }

  for (const eventId of undoData.activityEventIds ?? []) {
    const event = await ctx.db.get(eventId);
    if (event && event.actorId === actorId) await ctx.db.delete(event._id);
  }
}
