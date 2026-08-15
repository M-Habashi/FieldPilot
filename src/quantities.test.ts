import { describe, expect, it } from 'vitest';
import { groupQuantityRows, quantityRowNeedsAttention } from './quantities';

describe('quantity reporting', () => {
  it('groups by item and normalized unit without mixing unrelated work', () => {
    const groups = groupQuantityRows([
      {
        reportLineId: 'line-1',
        taskId: '1',
        sheetId: 's1',
        seq: 1,
        title: 'A',
        status: 'open',
        category: 'general',
        plannedQuantity: 10,
        completedQuantity: 12,
        quantityUnit: ' lf ',
        quantityItemId: 'wall',
        itemName: 'Wall protection',
        planName: 'Plan',
        planNumber: 'A1',
        planPage: 1,
        sourceFileRef: 'p1',
      },
      {
        reportLineId: 'line-2',
        taskId: '2',
        sheetId: 's2',
        seq: 2,
        title: 'B',
        status: 'open',
        category: 'general',
        plannedQuantity: 10,
        completedQuantity: 4,
        quantityUnit: 'LF',
        quantityItemId: 'wall',
        itemName: 'Wall protection',
        planName: 'Plan',
        planNumber: 'A2',
        planPage: 2,
        sourceFileRef: 'p1',
      },
      {
        reportLineId: 'line-3',
        taskId: '3',
        sheetId: 's3',
        seq: 3,
        title: 'C',
        status: 'open',
        category: 'general',
        plannedQuantity: 5,
        completedQuantity: 1,
        quantityUnit: 'LF',
        quantityItemId: 'pipe',
        itemName: 'Pipe',
        planName: 'Other',
        planNumber: 'M1',
        planPage: 1,
        sourceFileRef: 'p2',
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      itemName: 'Wall protection',
      unit: 'LF',
      planned: 20,
      completed: 16,
      remaining: 6,
      overrun: 2,
      planCount: 1,
      taskCount: 2,
    });
  });

  it('flags unclassified, missing-plan, and overrun rows', () => {
    const base = {
      reportLineId: 'line-1',
      taskId: '1',
      sheetId: 's1',
      seq: 1,
      title: '',
      status: 'open' as const,
      category: 'general',
      planName: 'Plan',
      planNumber: 'A1',
      planPage: 1,
      sourceFileRef: 'p1',
    };
    expect(quantityRowNeedsAttention({ ...base, completedQuantity: 1 })).toBe(true);
    expect(
      quantityRowNeedsAttention({
        ...base,
        quantityItemId: 'wall',
        itemName: 'Wall',
        plannedQuantity: 2,
        completedQuantity: 1,
      }),
    ).toBe(false);
    expect(
      quantityRowNeedsAttention({
        ...base,
        quantityItemId: 'wall',
        itemName: 'Wall',
        plannedQuantity: 2,
        completedQuantity: 3,
      }),
    ).toBe(true);
  });
});
