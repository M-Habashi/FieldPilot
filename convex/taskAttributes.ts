import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import {
  BUILT_IN_TASK_ATTRIBUTE_NAMES,
  customTaskAttributeType,
  customTaskAttributeValue,
  taskAttributeKey,
  validateTaskAttributeSettings,
} from './lib/taskAttributes';
import { recordTaskChange } from './lib/taskActivity';

const MAX_DEFINITIONS = 50;
const MAX_OPTIONS = 50;
const NAME_MAX_LENGTH = 60;
const OPTION_MAX_LENGTH = 80;
const UNIT_MAX_LENGTH = 16;
const TEXT_MAX_LENGTH = 2_000;

function displayCustomValue(
  definition: {
    type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    unit?: string;
    options?: Array<{ id: string; label: string; active: boolean }>;
  },
  value:
    | {
        textValue?: string;
        numberValue?: number;
        dateValue?: string;
        booleanValue?: boolean;
        selectOptionId?: string;
      }
    | undefined,
) {
  if (!value) return undefined;
  if (definition.type === 'text') return value.textValue;
  if (definition.type === 'number') {
    return value.numberValue === undefined
      ? undefined
      : `${value.numberValue}${definition.unit ? ` ${definition.unit}` : ''}`;
  }
  if (definition.type === 'date') return value.dateValue;
  if (definition.type === 'boolean') {
    return value.booleanValue === undefined ? undefined : value.booleanValue ? 'Yes' : 'No';
  }
  return definition.options?.find((option) => option.id === value.selectOptionId)?.label;
}

const definitionInput = v.object({
  clientId: v.string(),
  definitionId: v.optional(v.id('taskAttributeDefinitions')),
  name: v.string(),
  type: customTaskAttributeType,
  unit: v.optional(v.string()),
  options: v.optional(v.array(v.object({ id: v.string(), label: v.string() }))),
});

const layoutInput = v.union(
  v.object({ kind: v.literal('builtin'), key: taskAttributeKey, visible: v.boolean() }),
  v.object({ kind: v.literal('custom'), definitionKey: v.string(), visible: v.boolean() }),
);

function normalizedName(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const getConfiguration = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const project = await ctx.db.get(projectId);
    if (project === null) throw new Error('Project not found');
    const definitions = await ctx.db
      .query('taskAttributeDefinitions')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
    const activeDefinitions = definitions.filter(
      (definition) => definition.archivedAt === undefined,
    );
    return {
      definitions: await Promise.all(
        activeDefinitions.map(async (definition) => ({
          ...definition,
          valueCount: await ctx.db
            .query('taskAttributeValues')
            .withIndex('by_definition', (q) => q.eq('definitionId', definition._id))
            .collect()
            .then((values) => values.length),
        })),
      ),
      layout: project.taskAttributeLayout,
      legacySettings: project.taskAttributeSettings,
    };
  },
});

export const saveConfiguration = mutation({
  args: {
    projectId: v.id('projects'),
    definitions: v.array(definitionInput),
    layout: v.array(layoutInput),
    archivedDefinitionIds: v.array(v.id('taskAttributeDefinitions')),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, args.projectId, ['owner', 'admin'], userId);
    if (args.definitions.length > MAX_DEFINITIONS) {
      throw new Error(`A project can have up to ${MAX_DEFINITIONS} custom attributes`);
    }

    const existingDefinitions = await ctx.db
      .query('taskAttributeDefinitions')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    const existingById = new Map(
      existingDefinitions.map((definition) => [definition._id, definition]),
    );
    const archivedIds = new Set(args.archivedDefinitionIds);
    for (const definitionId of archivedIds) {
      const definition = existingById.get(definitionId);
      if (definition === undefined || definition.archivedAt !== undefined) {
        throw new Error('A custom attribute selected for archiving was not found');
      }
    }

    const suppliedClientIds = new Set<string>();
    const suppliedDefinitionIds = new Set<Id<'taskAttributeDefinitions'>>();
    const normalizedDefinitions = args.definitions.map((input) => {
      if (!input.clientId.trim() || suppliedClientIds.has(input.clientId)) {
        throw new Error('Every custom attribute must have a unique identifier');
      }
      suppliedClientIds.add(input.clientId);
      const existing = input.definitionId ? existingById.get(input.definitionId) : undefined;
      if (input.definitionId !== undefined) {
        if (
          existing === undefined ||
          existing.archivedAt !== undefined ||
          archivedIds.has(input.definitionId)
        ) {
          throw new Error('A custom attribute could not be found');
        }
        if (suppliedDefinitionIds.has(input.definitionId)) {
          throw new Error('Every custom attribute must be included once');
        }
        suppliedDefinitionIds.add(input.definitionId);
      }
      const name = normalizedName(input.name, 'Attribute name', NAME_MAX_LENGTH);
      const unit =
        input.type === 'number' && input.unit?.trim()
          ? normalizedName(input.unit, 'Unit', UNIT_MAX_LENGTH)
          : undefined;
      const optionIds = new Set<string>();
      const optionLabels = new Set<string>();
      const options =
        input.type === 'select'
          ? (input.options ?? []).map((option) => {
              const id = normalizedName(option.id, 'Option identifier', 100);
              const label = normalizedName(option.label, 'Option label', OPTION_MAX_LENGTH);
              if (optionIds.has(id) || optionLabels.has(label.toLocaleLowerCase())) {
                throw new Error('Dropdown options must be unique');
              }
              optionIds.add(id);
              optionLabels.add(label.toLocaleLowerCase());
              return { id, label };
            })
          : [];
      if (input.type === 'select' && (options.length === 0 || options.length > MAX_OPTIONS)) {
        throw new Error(`Dropdown attributes need 1 to ${MAX_OPTIONS} options`);
      }
      return { ...input, name, unit, options, existing };
    });

    const activeExistingIds = existingDefinitions
      .filter(
        (definition) => definition.archivedAt === undefined && !archivedIds.has(definition._id),
      )
      .map((definition) => definition._id);
    if (activeExistingIds.some((id) => !suppliedDefinitionIds.has(id))) {
      throw new Error('Every active custom attribute must be included once');
    }

    const reservedNames = new Set(BUILT_IN_TASK_ATTRIBUTE_NAMES);
    const names = new Set<string>();
    for (const definition of normalizedDefinitions) {
      const comparableName = definition.name.toLocaleLowerCase();
      if (reservedNames.has(comparableName as (typeof BUILT_IN_TASK_ATTRIBUTE_NAMES)[number])) {
        throw new Error(`“${definition.name}” is reserved for a built-in attribute`);
      }
      if (names.has(comparableName)) throw new Error('Custom attribute names must be unique');
      names.add(comparableName);
    }

    for (const definition of normalizedDefinitions) {
      if (definition.existing === undefined || definition.existing.type === definition.type)
        continue;
      const value = await ctx.db
        .query('taskAttributeValues')
        .withIndex('by_definition', (q) => q.eq('definitionId', definition.existing!._id))
        .first();
      if (value !== null) throw new Error('An attribute type cannot change after values are added');
    }

    const now = Date.now();
    const resolvedIds = new Map<string, Id<'taskAttributeDefinitions'>>();
    for (const definition of normalizedDefinitions) {
      const existingOptions = definition.existing?.options ?? [];
      const activeOptions = definition.options.map((option) => ({ ...option, active: true }));
      const activeOptionIds = new Set(activeOptions.map((option) => option.id));
      const options =
        definition.type === 'select'
          ? [
              ...activeOptions,
              ...existingOptions
                .filter((option) => !activeOptionIds.has(option.id))
                .map((option) => ({
                  ...option,
                  active: false,
                })),
            ]
          : undefined;
      if (definition.existing !== undefined) {
        await ctx.db.patch(definition.existing._id, {
          name: definition.name,
          type: definition.type,
          unit: definition.unit,
          options,
          updatedAt: now,
        });
        resolvedIds.set(definition.clientId, definition.existing._id);
      } else {
        const definitionId = await ctx.db.insert('taskAttributeDefinitions', {
          projectId: args.projectId,
          name: definition.name,
          type: definition.type,
          unit: definition.unit,
          options,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        });
        resolvedIds.set(definition.clientId, definitionId);
      }
    }
    for (const definitionId of archivedIds) {
      await ctx.db.patch(definitionId, { archivedAt: now, updatedAt: now });
    }

    const builtInSettings = args.layout
      .filter((item): item is Extract<typeof item, { kind: 'builtin' }> => item.kind === 'builtin')
      .map(({ key, visible }) => ({ key, visible }));
    validateTaskAttributeSettings(builtInSettings);
    const seenCustom = new Set<string>();
    const layout = args.layout.map((item) => {
      if (item.kind === 'builtin') return item;
      const definitionId = resolvedIds.get(item.definitionKey);
      if (definitionId === undefined || seenCustom.has(item.definitionKey)) {
        throw new Error('Every active custom attribute must appear in the layout once');
      }
      seenCustom.add(item.definitionKey);
      return { kind: 'custom' as const, definitionId, visible: item.visible };
    });
    if (seenCustom.size !== normalizedDefinitions.length) {
      throw new Error('Every active custom attribute must appear in the layout once');
    }
    await ctx.db.patch(args.projectId, {
      taskAttributeSettings: builtInSettings,
      taskAttributeLayout: layout,
      updatedAt: now,
    });
  },
});

export const listValuesByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    return await ctx.db
      .query('taskAttributeValues')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .collect();
  },
});

export const setTaskValue = mutation({
  args: {
    taskId: v.id('tasks'),
    definitionId: v.id('taskAttributeDefinitions'),
    value: v.union(customTaskAttributeValue, v.null()),
  },
  handler: async (ctx, { taskId, definitionId, value }) => {
    const userId = await requireUser(ctx);
    const [task, definition] = await Promise.all([ctx.db.get(taskId), ctx.db.get(definitionId)]);
    if (task === null) throw new Error('Task not found');
    if (
      definition === null ||
      definition.projectId !== task.projectId ||
      definition.archivedAt !== undefined
    ) {
      throw new Error('Custom attribute not found');
    }
    await requireProjectRole(ctx, task.projectId, CONTENT_EDITOR_ROLES, userId);
    const existing = await ctx.db
      .query('taskAttributeValues')
      .withIndex('by_task_definition', (q) =>
        q.eq('taskId', taskId).eq('definitionId', definitionId),
      )
      .collect();
    const current = existing[0];
    const recordChange = async (nextValue?: {
      textValue?: string;
      numberValue?: number;
      dateValue?: string;
      booleanValue?: boolean;
      selectOptionId?: string;
    }) => {
      await recordTaskChange(ctx, {
        projectId: task.projectId,
        taskId,
        actorId: userId,
        fieldKey: `custom:${definitionId}`,
        fieldLabel: definition.name,
        oldValue: displayCustomValue(definition, current),
        newValue: displayCustomValue(definition, nextValue),
      });
    };
    if (value === null) {
      await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
      await recordChange();
      return;
    }
    if (value.type !== definition.type) throw new Error('Value does not match the attribute type');
    const fields: {
      textValue?: string;
      numberValue?: number;
      dateValue?: string;
      booleanValue?: boolean;
      selectOptionId?: string;
    } = {};
    if (value.type === 'text') {
      const textValue = value.value.trim();
      if (!textValue) {
        await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
        await recordChange();
        return;
      }
      if (textValue.length > TEXT_MAX_LENGTH) {
        throw new Error(`Text values must be ${TEXT_MAX_LENGTH} characters or fewer`);
      }
      fields.textValue = textValue;
    } else if (value.type === 'number') {
      if (!Number.isFinite(value.value)) throw new Error('Number value must be finite');
      fields.numberValue = value.value;
    } else if (value.type === 'date') {
      if (!isValidDate(value.value)) throw new Error('Date must be valid');
      fields.dateValue = value.value;
    } else if (value.type === 'boolean') {
      fields.booleanValue = value.value;
    } else {
      const option = definition.options?.find(
        (candidate) => candidate.id === value.optionId && candidate.active,
      );
      if (option === undefined) throw new Error('Dropdown option not found');
      fields.selectOptionId = option.id;
    }
    const now = Date.now();
    if (current === undefined) {
      await ctx.db.insert('taskAttributeValues', {
        projectId: task.projectId,
        taskId,
        definitionId,
        ...fields,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(current._id, {
        textValue: undefined,
        numberValue: undefined,
        dateValue: undefined,
        booleanValue: undefined,
        selectOptionId: undefined,
        ...fields,
        updatedBy: userId,
        updatedAt: now,
      });
      await Promise.all(existing.slice(1).map((row) => ctx.db.delete(row._id)));
    }
    await recordChange(fields);
  },
});
