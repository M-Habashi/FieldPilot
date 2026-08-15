import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_ATTRIBUTE_SETTINGS,
  normalizeTaskAttributeLayout,
  normalizeTaskAttributeSettings,
} from './task-attributes';

describe('task attribute settings', () => {
  it('uses the default project layout when settings have not been saved', () => {
    expect(normalizeTaskAttributeSettings(undefined)).toEqual(DEFAULT_TASK_ATTRIBUTE_SETTINGS);
  });

  it('preserves saved order and visibility while repairing missing or duplicate keys', () => {
    expect(
      normalizeTaskAttributeSettings([
        { key: 'quantity', visible: false },
        { key: 'plan', visible: true },
        { key: 'quantity', visible: true },
      ]),
    ).toEqual([
      { key: 'quantity', visible: false },
      { key: 'plan', visible: true },
      { key: 'location', visible: true },
      { key: 'startDate', visible: true },
      { key: 'dueDate', visible: true },
      { key: 'manpower', visible: true },
      { key: 'cost', visible: true },
      { key: 'tags', visible: true },
    ]);
  });

  it('merges a saved mixed layout with missing built-ins and new custom attributes', () => {
    const definitions = [
      { id: 'custom-a', name: 'Area', type: 'text' as const, valueCount: 0 },
      { id: 'custom-b', name: 'Approved', type: 'boolean' as const, valueCount: 0 },
    ];
    const normalized = normalizeTaskAttributeLayout(
      [
        { kind: 'custom', definitionId: 'custom-a', visible: false },
        { kind: 'builtin', key: 'quantity', visible: true },
        { kind: 'custom', definitionId: 'archived', visible: true },
      ],
      undefined,
      definitions,
    );
    expect(normalized[0]).toEqual({ kind: 'custom', definitionId: 'custom-a', visible: false });
    expect(normalized[1]).toEqual({ kind: 'builtin', key: 'quantity', visible: true });
    expect(normalized.at(-1)).toEqual({ kind: 'custom', definitionId: 'custom-b', visible: true });
    expect(normalized.filter((item) => item.kind === 'builtin')).toHaveLength(8);
  });
});
