import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { DEFAULT_TASK_COLOR, type Photo, type Task } from '../types';
import { uid } from '../lib/utils';
import { deletePhotoBlob, savePhotoBlob } from '../lib/photos';

interface PersistedProject {
  tasks: Record<string, Task>;
  nextSeq: number;
}

type RemoteTaskPatch = Pick<
  Task,
  | 'page'
  | 'x'
  | 'y'
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'category'
  | 'color'
  | 'assignee'
  | 'dueDate'
>;

export interface RemoteProjectSync {
  createTask(task: Task): Promise<string>;
  updateTask(taskId: string, patch: RemoteTaskPatch): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  addNote(taskId: string, text: string): Promise<void>;
  addPhotos(taskId: string, files: File[]): Promise<void>;
  removePhoto(taskId: string, photoId: string): Promise<void>;
}

let remoteSync: RemoteProjectSync | null = null;
const remoteUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRemoteUpdates = new Set<string>();

export function setRemoteProjectSync(sync: RemoteProjectSync | null) {
  remoteSync = sync;
  if (sync !== null) return;
  for (const timer of remoteUpdateTimers.values()) clearTimeout(timer);
  remoteUpdateTimers.clear();
  pendingRemoteUpdates.clear();
}

function remotePatch(task: Task): RemoteTaskPatch {
  return {
    page: task.page,
    x: task.x,
    y: task.y,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    color: task.color,
    assignee: task.assignee,
    dueDate: task.dueDate,
  };
}

function projectKey(fingerprint: string): string {
  return `fp:proj:${fingerprint}`;
}

export interface FocusRequest {
  taskId: string;
  ts: number;
}

interface ProjectState {
  // document
  fileName: string | null;
  fingerprint: string | null;
  pageCount: number;
  currentPage: number;
  // data
  tasks: Record<string, Task>;
  nextSeq: number;
  // ui
  selectedTaskId: string | null;
  pinTooltipTaskId: string | null;
  addPinMode: boolean;
  taskListOpen: boolean;
  sidebarCollapsed: boolean;
  lightboxPhotoId: string | null;
  focusRequest: FocusRequest | null;
  design: string;
  lastTaskColor: string;
  syncError: string | null;

  loadDocument(meta: { fileName: string; fingerprint: string; pageCount: number }): Promise<void>;
  loadRemoteDocument(meta: { fileName: string; fingerprint: string; pageCount: number }): void;
  setPage(page: number): void;
  addTask(page: number, x: number, y: number): string;
  updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'seq' | 'createdAt'>>): void;
  moveTask(id: string, x: number, y: number): void;
  deleteTask(id: string): Promise<void>;
  addNote(taskId: string, text: string): void;
  addPhotos(taskId: string, files: File[]): Promise<void>;
  removePhoto(taskId: string, photoId: string): Promise<void>;
  selectTask(id: string | null): void;
  showPinTooltip(id: string | null): void;
  focusTask(id: string): void;
  setAddPinMode(on: boolean): void;
  showTaskList(): void;
  closeTaskList(): void;
  toggleSidebar(): void;
  setLightbox(photoId: string | null): void;
  setDesign(id: string): void;
  replaceProject(tasks: Record<string, Task>, nextSeq: number): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => ProjectState) {
  if (remoteSync) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { fingerprint, tasks, nextSeq } = get();
    if (!fingerprint) return;
    const data: PersistedProject = { tasks, nextSeq };
    void idbSet(projectKey(fingerprint), data);
  }, 300);
}

export const useProject = create<ProjectState>((set, get) => ({
  fileName: null,
  fingerprint: null,
  pageCount: 0,
  currentPage: 1,
  tasks: {},
  nextSeq: 1,
  selectedTaskId: null,
  pinTooltipTaskId: null,
  addPinMode: false,
  taskListOpen: false,
  // Default to the narrow icon rail; the single "Plans" item doesn't justify
  // the wide sidebar. Users expand it explicitly via the chevron.
  sidebarCollapsed: true,
  lightboxPhotoId: null,
  focusRequest: null,
  design: localStorage.getItem('fp:design') ?? 'blueprint',
  lastTaskColor: localStorage.getItem('fp:last-task-color') ?? DEFAULT_TASK_COLOR,
  syncError: null,

  async loadDocument({ fileName, fingerprint, pageCount }) {
    const persisted = await idbGet<PersistedProject>(projectKey(fingerprint));
    set({
      fileName,
      fingerprint,
      pageCount,
      currentPage: 1,
      tasks: persisted?.tasks ?? {},
      nextSeq: persisted?.nextSeq ?? 1,
      selectedTaskId: null,
      pinTooltipTaskId: null,
      addPinMode: false,
      focusRequest: null,
    });
  },

  loadRemoteDocument({ fileName, fingerprint, pageCount }) {
    set({
      fileName,
      fingerprint,
      pageCount,
      currentPage: 1,
      tasks: {},
      nextSeq: 1,
      selectedTaskId: null,
      pinTooltipTaskId: null,
      addPinMode: false,
      taskListOpen: false,
      focusRequest: null,
      syncError: null,
    });
  },

  setPage(page) {
    const { pageCount } = get();
    const p = Math.min(Math.max(1, page), Math.max(1, pageCount));
    set({ currentPage: p });
  },

  addTask(page, x, y) {
    const adapter = remoteSync;
    const id = adapter ? `local:${uid()}` : uid();
    const now = Date.now();
    const seq = get().nextSeq;
    const task: Task = {
      id,
      page,
      x,
      y,
      seq,
      title: '',
      description: '',
      status: 'open',
      priority: 2,
      category: 'general',
      color: get().lastTaskColor,
      assignee: '',
      dueDate: null,
      notes: [],
      photos: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      tasks: { ...s.tasks, [id]: task },
      nextSeq: seq + 1,
      selectedTaskId: id,
      pinTooltipTaskId: null,
    }));
    schedulePersist(get);
    if (adapter) {
      void adapter
        .createTask(task)
        .then((serverId) => {
          let currentTask: Task | null = null;
          set((state) => {
            const current = state.tasks[id];
            if (!current) return state;
            currentTask = { ...current, id: serverId };
            const tasks = { ...state.tasks };
            delete tasks[id];
            tasks[serverId] = currentTask;
            return {
              tasks,
              selectedTaskId: state.selectedTaskId === id ? serverId : state.selectedTaskId,
              pinTooltipTaskId: state.pinTooltipTaskId === id ? serverId : state.pinTooltipTaskId,
            };
          });
          if (currentTask) {
            pendingRemoteUpdates.add(serverId);
            void adapter
              .updateTask(serverId, remotePatch(currentTask))
              .finally(() => pendingRemoteUpdates.delete(serverId));
          } else {
            void adapter.deleteTask(serverId);
          }
        })
        .catch((error: unknown) => {
          set({
            syncError: error instanceof Error ? error.message : 'The pin could not be saved.',
          });
        });
    }
    return id;
  },

  updateTask(id, patch) {
    if (patch.color) {
      localStorage.setItem('fp:last-task-color', patch.color);
      set({ lastTaskColor: patch.color });
    }
    set((s) => {
      const task = s.tasks[id];
      if (!task) return s;
      return {
        tasks: { ...s.tasks, [id]: { ...task, ...patch, updatedAt: Date.now() } },
      };
    });
    if (remoteSync && !id.startsWith('local:')) {
      const existing = remoteUpdateTimers.get(id);
      if (existing) clearTimeout(existing);
      pendingRemoteUpdates.add(id);
      remoteUpdateTimers.set(
        id,
        setTimeout(() => {
          remoteUpdateTimers.delete(id);
          const task = get().tasks[id];
          const adapter = remoteSync;
          if (!task || !adapter) {
            pendingRemoteUpdates.delete(id);
            return;
          }
          void adapter
            .updateTask(id, remotePatch(task))
            .catch((error: unknown) => {
              set({
                syncError:
                  error instanceof Error ? error.message : 'The task changes could not be saved.',
              });
            })
            .finally(() => pendingRemoteUpdates.delete(id));
        }, 350),
      );
    } else {
      schedulePersist(get);
    }
  },

  moveTask(id, x, y) {
    get().updateTask(id, { x, y });
  },

  async deleteTask(id) {
    const task = get().tasks[id];
    if (!task) return;
    const adapter = remoteSync;
    if (!adapter) {
      for (const photo of task.photos) {
        await deletePhotoBlob(photo.id);
      }
    }
    set((s) => {
      const tasks = { ...s.tasks };
      delete tasks[id];
      return {
        tasks,
        selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
        pinTooltipTaskId: s.pinTooltipTaskId === id ? null : s.pinTooltipTaskId,
      };
    });
    if (adapter && !id.startsWith('local:')) {
      void adapter.deleteTask(id).catch((error: unknown) => {
        set({
          syncError: error instanceof Error ? error.message : 'The task could not be deleted.',
        });
      });
    } else {
      schedulePersist(get);
    }
  },

  addNote(taskId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = { id: uid(), text: trimmed, createdAt: Date.now() };
    set((s) => {
      const task = s.tasks[taskId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [taskId]: { ...task, notes: [note, ...task.notes], updatedAt: Date.now() },
        },
      };
    });
    if (remoteSync && !taskId.startsWith('local:')) {
      void remoteSync.addNote(taskId, trimmed).catch((error: unknown) => {
        set({ syncError: error instanceof Error ? error.message : 'The note could not be saved.' });
      });
    } else {
      schedulePersist(get);
    }
  },

  async addPhotos(taskId, files) {
    if (remoteSync && !taskId.startsWith('local:')) {
      try {
        await remoteSync.addPhotos(taskId, files);
      } catch (error) {
        set({
          syncError: error instanceof Error ? error.message : 'The photos could not be saved.',
        });
      }
      return;
    }
    const photos: Photo[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const id = uid();
      await savePhotoBlob(id, file);
      photos.push({ id, name: file.name, createdAt: Date.now() });
    }
    if (photos.length === 0) return;
    set((s) => {
      const task = s.tasks[taskId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [taskId]: { ...task, photos: [...task.photos, ...photos], updatedAt: Date.now() },
        },
      };
    });
    schedulePersist(get);
  },

  async removePhoto(taskId, photoId) {
    const adapter = remoteSync;
    if (!adapter) await deletePhotoBlob(photoId);
    set((s) => {
      const task = s.tasks[taskId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [taskId]: {
            ...task,
            photos: task.photos.filter((p) => p.id !== photoId),
            updatedAt: Date.now(),
          },
        },
        lightboxPhotoId: s.lightboxPhotoId === photoId ? null : s.lightboxPhotoId,
      };
    });
    if (adapter && !taskId.startsWith('local:')) {
      void adapter.removePhoto(taskId, photoId).catch((error: unknown) => {
        set({
          syncError: error instanceof Error ? error.message : 'The photo could not be removed.',
        });
      });
    } else {
      schedulePersist(get);
    }
  },

  selectTask(id) {
    set({ selectedTaskId: id, pinTooltipTaskId: null });
  },

  showPinTooltip(id) {
    set({ pinTooltipTaskId: id });
  },

  focusTask(id) {
    const task = get().tasks[id];
    if (!task) return;
    set({
      currentPage: task.page,
      pinTooltipTaskId: null,
      focusRequest: { taskId: id, ts: Date.now() },
    });
  },

  setAddPinMode(on) {
    set({ addPinMode: on });
  },

  showTaskList() {
    set({ taskListOpen: true, selectedTaskId: null, pinTooltipTaskId: null });
  },

  closeTaskList() {
    set({ taskListOpen: false });
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  },

  setLightbox(photoId) {
    set({ lightboxPhotoId: photoId });
  },

  setDesign(id) {
    localStorage.setItem('fp:design', id);
    document.documentElement.dataset.design = id;
    set({ design: id });
  },

  replaceProject(tasks, nextSeq) {
    set((state) => {
      const merged = { ...tasks };
      for (const [id, task] of Object.entries(state.tasks)) {
        if (id.startsWith('local:') || pendingRemoteUpdates.has(id)) merged[id] = task;
      }
      return {
        tasks: merged,
        nextSeq,
        selectedTaskId:
          state.selectedTaskId && merged[state.selectedTaskId] ? state.selectedTaskId : null,
        pinTooltipTaskId:
          state.pinTooltipTaskId && merged[state.pinTooltipTaskId] ? state.pinTooltipTaskId : null,
      };
    });
    schedulePersist(get);
  },
}));
