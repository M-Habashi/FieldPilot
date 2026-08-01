import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
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
  dueDate: null,
  notes: [],
  photos: [],
  createdAt: 1,
  updatedAt: 1,
};

function remoteSync(overrides: Partial<RemoteProjectSync> = {}): RemoteProjectSync {
  return {
    createTask: vi.fn(async () => 'created-task'),
    updateTask: vi.fn(async () => undefined),
    deleteTask: vi.fn(async () => undefined),
    addNote: vi.fn(async () => 'created-note'),
    addPhotos: vi.fn(async () => undefined),
    removePhoto: vi.fn(async () => undefined),
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
    syncError: null,
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
});
