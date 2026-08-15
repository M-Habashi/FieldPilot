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

export interface TaskAttributeSetting {
  key: TaskAttributeKey;
  visible: boolean;
}

export type CustomTaskAttributeType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomTaskAttributeOption {
  id: string;
  label: string;
  active: boolean;
}

export interface CustomTaskAttributeDefinition {
  id: string;
  name: string;
  type: CustomTaskAttributeType;
  unit?: string;
  options?: CustomTaskAttributeOption[];
  valueCount: number;
}

export type TaskAttributeLayoutItem =
  | { kind: 'builtin'; key: TaskAttributeKey; visible: boolean }
  | { kind: 'custom'; definitionId: string; visible: boolean };

export type CustomTaskAttributeValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'date'; value: string }
  | { type: 'select'; optionId: string }
  | { type: 'boolean'; value: boolean };

export interface CustomTaskAttributeValueRow {
  definitionId: string;
  textValue?: string;
  numberValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  selectOptionId?: string;
}

export interface TaskAttributeDefinitionDraft {
  clientId: string;
  definitionId?: string;
  name: string;
  type: CustomTaskAttributeType;
  unit?: string;
  options?: Array<{ id: string; label: string }>;
}

export interface TaskAttributeConfigurationDraft {
  definitions: TaskAttributeDefinitionDraft[];
  layout: Array<
    | { kind: 'builtin'; key: TaskAttributeKey; visible: boolean }
    | { kind: 'custom'; definitionKey: string; visible: boolean }
  >;
  archivedDefinitionIds: string[];
}

export const DEFAULT_TASK_ATTRIBUTE_SETTINGS: TaskAttributeSetting[] = [
  { key: 'plan', visible: true },
  { key: 'location', visible: true },
  { key: 'startDate', visible: true },
  { key: 'dueDate', visible: true },
  { key: 'manpower', visible: true },
  { key: 'cost', visible: true },
  { key: 'tags', visible: true },
  { key: 'quantity', visible: true },
];

export function normalizeTaskAttributeSettings(
  settings: readonly TaskAttributeSetting[] | null | undefined,
): TaskAttributeSetting[] {
  const normalized: TaskAttributeSetting[] = [];
  const seen = new Set<TaskAttributeKey>();
  for (const setting of settings ?? []) {
    if (!TASK_ATTRIBUTE_KEYS.includes(setting.key) || seen.has(setting.key)) continue;
    seen.add(setting.key);
    normalized.push({ key: setting.key, visible: setting.visible });
  }
  for (const fallback of DEFAULT_TASK_ATTRIBUTE_SETTINGS) {
    if (!seen.has(fallback.key)) normalized.push({ ...fallback });
  }
  return normalized;
}

export function normalizeTaskAttributeLayout(
  layout: readonly TaskAttributeLayoutItem[] | null | undefined,
  legacySettings: readonly TaskAttributeSetting[] | null | undefined,
  definitions: readonly CustomTaskAttributeDefinition[],
): TaskAttributeLayoutItem[] {
  const normalized: TaskAttributeLayoutItem[] = [];
  const seenBuiltIns = new Set<TaskAttributeKey>();
  const activeDefinitionIds = new Set(definitions.map((definition) => definition.id));
  const seenDefinitions = new Set<string>();
  for (const item of layout ?? []) {
    if (item.kind === 'builtin') {
      if (!TASK_ATTRIBUTE_KEYS.includes(item.key) || seenBuiltIns.has(item.key)) continue;
      seenBuiltIns.add(item.key);
      normalized.push({ kind: 'builtin', key: item.key, visible: item.visible });
    } else if (
      activeDefinitionIds.has(item.definitionId) &&
      !seenDefinitions.has(item.definitionId)
    ) {
      seenDefinitions.add(item.definitionId);
      normalized.push({
        kind: 'custom',
        definitionId: item.definitionId,
        visible: item.visible,
      });
    }
  }
  for (const setting of normalizeTaskAttributeSettings(legacySettings)) {
    if (!seenBuiltIns.has(setting.key)) {
      seenBuiltIns.add(setting.key);
      normalized.push({ kind: 'builtin', ...setting });
    }
  }
  for (const definition of definitions) {
    if (!seenDefinitions.has(definition.id)) {
      normalized.push({ kind: 'custom', definitionId: definition.id, visible: true });
    }
  }
  return normalized;
}
