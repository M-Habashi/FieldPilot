import { v } from 'convex/values';

export const taskAttributeKey = v.union(
  v.literal('plan'),
  v.literal('location'),
  v.literal('startDate'),
  v.literal('dueDate'),
  v.literal('manpower'),
  v.literal('cost'),
  v.literal('tags'),
  v.literal('quantity'),
);

export const taskAttributeSetting = v.object({
  key: taskAttributeKey,
  visible: v.boolean(),
});

export const customTaskAttributeType = v.union(
  v.literal('text'),
  v.literal('number'),
  v.literal('date'),
  v.literal('select'),
  v.literal('boolean'),
);

export const taskAttributeLayoutItem = v.union(
  v.object({ kind: v.literal('builtin'), key: taskAttributeKey, visible: v.boolean() }),
  v.object({
    kind: v.literal('custom'),
    definitionId: v.id('taskAttributeDefinitions'),
    visible: v.boolean(),
  }),
);

export const customTaskAttributeValue = v.union(
  v.object({ type: v.literal('text'), value: v.string() }),
  v.object({ type: v.literal('number'), value: v.number() }),
  v.object({ type: v.literal('date'), value: v.string() }),
  v.object({ type: v.literal('select'), optionId: v.string() }),
  v.object({ type: v.literal('boolean'), value: v.boolean() }),
);

export const TASK_ATTRIBUTE_KEYS = [
  'plan',
  'location',
  'startDate',
  'dueDate',
  'manpower',
  'cost',
  'tags',
  'quantity',
] as const;

export type TaskAttributeKey = (typeof TASK_ATTRIBUTE_KEYS)[number];

export const BUILT_IN_TASK_ATTRIBUTE_NAMES = [
  'status',
  'priority',
  'category',
  'assignee',
  'plan',
  'location',
  'start date',
  'due date',
  'manpower',
  'cost',
  'tags',
  'quantity',
] as const;

export function validateTaskAttributeSettings(
  settings: Array<{ key: TaskAttributeKey; visible: boolean }>,
) {
  const suppliedKeys = new Set(settings.map((setting) => setting.key));
  if (settings.length !== TASK_ATTRIBUTE_KEYS.length || suppliedKeys.size !== settings.length) {
    throw new Error('Task attribute settings must include every configurable attribute once');
  }
  for (const key of TASK_ATTRIBUTE_KEYS) {
    if (!suppliedKeys.has(key)) {
      throw new Error('Task attribute settings must include every configurable attribute once');
    }
  }
  return settings;
}
