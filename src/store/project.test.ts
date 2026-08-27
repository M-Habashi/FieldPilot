import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Markup, Task } from '../types';
import type { RemoteProjectSync } from './project';

let projectStore: typeof import('./project');

const task: Task = {
  id: 'server-task',
  page: 1,
  x: 0.5,
  y: 0.5,
  seq: 1,
  title: 'Original title',
  description: 'Original description',
  status: 'open',
  priority: 2,
  category: 'general',
  color: '#d97706',
  assignee: '',
  assigneeUserId: null,
  plannedQuantity: null,
  completedQuantity: null,
  quantityUnit: 'EA',
  startDate: null,
  dueDate: null,
  locationText: '',
  tags: [],
  manpowerCount: null,
  costMinor: null,
  currencyCode: 'USD',
  notes: [],
  photos: [],
  createdAt: 1,
  updatedAt: 1,
};

const markupInput: Omit<Markup, 'id' | 'createdAt' | 'updatedAt'> = {
  page: 1,
  type: 'line',
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.7 },
  ],
  text: '',
  stroke: '#dc2626',
  fill: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 14,
};

function remoteSync(overrides: Partial<RemoteProjectSync> = {}): RemoteProjectSync {
  return {
    createTask: vi.fn(async () => 'created-task'),
    updateTask: vi.fn(async () => undefined),
    deleteTask: vi.fn(async () => undefined),
    addNote: vi.fn(async () => 'created-note'),
    addPhotos: vi.fn(async () => undefined),
    removePhoto: vi.fn(async () => undefined),
    saveMarkup: vi.fn(async () => undefined),
    deleteMarkup: vi.fn(async () => undefined),
    setCalibration: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeAll(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  projectStore = await import('./project');
});

afterEach(() => {
  projectStore.setRemoteProjectSync(null);
  projectStore.useProject.setState({
    tasks: {},
    nextSeq: 1,
    selectedTaskId: null,
    markups: {},
    calibrations: {},
    selectedMarkupId: null,
    historyPast: [],
    historyFuture: [],
    syncError: null,
    agentTaskPlacement: null,
    addPinMode: false,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('remote project synchronization', () => {
  it('merges only changed fields and flushes them when the workspace unmounts', () => {
    const updateTask = vi.fn(async () => undefined);
    projectStore.useProject.setState({ tasks: { [task.id]: task } });
    projectStore.setRemoteProjectSync(remoteSync({ updateTask }));

    projectStore.useProject.getState().updateTask(task.id, { title: 'New title' });
    projectStore.useProject.getState().updateTask(task.id, { description: 'New description' });
    projectStore.setRemoteProjectSync(null);

    expect(updateTask).toHaveBeenCalledOnce();
    expect(updateTask).toHaveBeenCalledWith(task.id, {
      title: 'New title',
      description: 'New description',
    });
  });

  it('rolls back an optimistic note when its mutation fails', async () => {
    projectStore.useProject.setState({ tasks: { [task.id]: task } });
    projectStore.setRemoteProjectSync(
      remoteSync({ addNote: vi.fn(async () => Promise.reject(new Error('Note rejected'))) }),
    );

    projectStore.useProject.getState().addNote(task.id, 'Unsaved note');
    expect(projectStore.useProject.getState().tasks[task.id].notes).toHaveLength(1);

    await vi.waitFor(() => {
      expect(projectStore.useProject.getState().tasks[task.id].notes).toEqual([]);
      expect(projectStore.useProject.getState().syncError).toBe('Note rejected');
    });
  });

  it('persists markup undo and redo through the remote adapter', () => {
    const saveMarkup = vi.fn(async () => undefined);
    const deleteMarkup = vi.fn(async () => undefined);
    projectStore.setRemoteProjectSync(remoteSync({ saveMarkup, deleteMarkup }));

    const markupId = projectStore.useProject.getState().addMarkup(markupInput);
    expect(saveMarkup).toHaveBeenCalledOnce();

    projectStore.useProject.getState().undo();
    expect(projectStore.useProject.getState().markups).toEqual({});
    expect(deleteMarkup).toHaveBeenCalledWith(markupId);

    projectStore.useProject.getState().redo();
    expect(projectStore.useProject.getState().markups[markupId]).toBeDefined();
    expect(saveMarkup).toHaveBeenCalledTimes(2);
  });

  it('waits for the plan click before creating an agent-prepared task', async () => {
    const createTask = vi.fn(async () => 'agent-task');
    projectStore.setRemoteProjectSync(remoteSync({ createTask }));
    projectStore.useProject.getState().startAgentTaskPlacement({
      operationId: 'operation-1',
      page: 2,
      task: {
        title: 'Install firestopping',
        description: 'At the rated corridor wall',
        status: 'open',
        priority: 1,
        category: 'punch',
        dueDate: '2026-09-01',
      },
    });

    expect(createTask).not.toHaveBeenCalled();
    expect(projectStore.useProject.getState()).toMatchObject({ currentPage: 2, addPinMode: true });

    projectStore.useProject.getState().addTask(2, 0.4, 0.6);
    expect(createTask).toHaveBeenCalledOnce();
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        x: 0.4,
        y: 0.6,
        title: 'Install firestopping',
        priority: 1,
      }),
      'operation-1',
    );
    expect(projectStore.useProject.getState().addPinMode).toBe(false);

    await vi.waitFor(() => {
      expect(projectStore.useProject.getState().tasks['agent-task']).toBeDefined();
    });
  });
});
