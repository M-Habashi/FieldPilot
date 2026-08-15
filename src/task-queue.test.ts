import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import {
  DEFAULT_TASK_QUEUE_FILTERS,
  filterTaskQueue,
  groupTaskQueue,
  sortTaskQueue,
  taskAttentionFlags,
} from './task-queue';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    page: 1,
    x: 0.2,
    y: 0.3,
    seq: 1,
    title: 'Install door hardware',
    description: '',
    status: 'open',
    priority: 2,
    category: 'finishes',
    assignee: '',
    assigneeUserId: null,
    plannedQuantity: null,
    completedQuantity: null,
    quantityUnit: 'EA',
    startDate: null,
    dueDate: null,
    locationText: 'Level 2',
    tags: [],
    manpowerCount: null,
    costMinor: null,
    currencyCode: 'USD',
    notes: [],
    photos: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('task queue', () => {
  it('identifies overdue, blocked, missing-evidence, and unverified work', () => {
    expect(
      taskAttentionFlags(
        task({ status: 'done', dueDate: '2026-08-01', tags: ['Blocked'], evidencePhotoCount: 0 }),
        '2026-08-15',
      ),
    ).toEqual({ overdue: false, blocked: true, missingEvidence: true, unverified: true });
  });

  it('combines search, this-sheet, attention, and advanced filters', () => {
    const tasks = [
      task({ id: 'a', page: 1, status: 'open', dueDate: '2026-08-14', assigneeUserId: 'u1' }),
      task({
        id: 'b',
        page: 2,
        seq: 2,
        status: 'verified',
        title: 'Close ceiling',
        assigneeUserId: 'u1',
      }),
    ];
    const result = filterTaskQueue(
      tasks,
      {
        ...DEFAULT_TASK_QUEUE_FILTERS,
        search: 'door',
        thisSheet: true,
        needsAttention: true,
        statuses: ['open'],
        assignees: ['u1'],
        categories: ['finishes'],
        priorities: [2],
        due: 'overdue',
      },
      1,
      '2026-08-15',
    );
    expect(result.map((item) => item.id)).toEqual(['a']);
  });

  it('sorts attention work first and groups by location', () => {
    const tasks = sortTaskQueue(
      [
        task({ id: 'a', seq: 1, locationText: '', status: 'verified', evidencePhotoCount: 1 }),
        task({ id: 'b', seq: 2, locationText: 'Roof', tags: ['blocked'] }),
      ],
      '2026-08-15',
    );
    expect(tasks[0].id).toBe('b');
    expect(groupTaskQueue(tasks, 'location').map((group) => group.label)).toEqual([
      'No location',
      'Roof',
    ]);
  });
});
