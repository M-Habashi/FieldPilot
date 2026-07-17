import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { DEFAULT_TASK_COLOR, type Photo, type Task } from '../types';
import { uid } from '../lib/utils';
import { deletePhotoBlob, savePhotoBlob } from '../lib/photos';

interface PersistedProject {
  tasks: Record<string, Task>;
  nextSeq: number;
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
  addPinMode: boolean;
  taskListOpen: boolean;
  sidebarCollapsed: boolean;
  lightboxPhotoId: string | null;
  focusRequest: FocusRequest | null;
  design: string;
  lastTaskColor: string;

  loadDocument(meta: { fileName: string; fingerprint: string; pageCount: number }): Promise<void>;
  setPage(page: number): void;
  addTask(page: number, x: number, y: number): string;
  updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'seq' | 'createdAt'>>): void;
  moveTask(id: string, x: number, y: number): void;
  deleteTask(id: string): Promise<void>;
  addNote(taskId: string, text: string): void;
  addPhotos(taskId: string, files: File[]): Promise<void>;
  removePhoto(taskId: string, photoId: string): Promise<void>;
  selectTask(id: string | null): void;
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
  addPinMode: false,
  taskListOpen: false,
  // Default to the narrow icon rail; the single "Plans" item doesn't justify
  // the wide sidebar. Users expand it explicitly via the chevron.
  sidebarCollapsed: true,
  lightboxPhotoId: null,
  focusRequest: null,
  design: localStorage.getItem('fp:design') ?? 'blueprint',
  lastTaskColor: localStorage.getItem('fp:last-task-color') ?? DEFAULT_TASK_COLOR,

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
      addPinMode: false,
      focusRequest: null,
    });
  },

  setPage(page) {
    const { pageCount } = get();
    const p = Math.min(Math.max(1, page), Math.max(1, pageCount));
    set({ currentPage: p });
  },

  addTask(page, x, y) {
    const id = uid();
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
    }));
    schedulePersist(get);
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
    schedulePersist(get);
  },

  moveTask(id, x, y) {
    get().updateTask(id, { x, y });
  },

  async deleteTask(id) {
    const task = get().tasks[id];
    if (!task) return;
    for (const photo of task.photos) {
      await deletePhotoBlob(photo.id);
    }
    set((s) => {
      const tasks = { ...s.tasks };
      delete tasks[id];
      return {
        tasks,
        selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
      };
    });
    schedulePersist(get);
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
    schedulePersist(get);
  },

  async addPhotos(taskId, files) {
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
    await deletePhotoBlob(photoId);
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
    schedulePersist(get);
  },

  selectTask(id) {
    set({ selectedTaskId: id });
  },

  focusTask(id) {
    const task = get().tasks[id];
    if (!task) return;
    set({
      currentPage: task.page,
      selectedTaskId: id,
      focusRequest: { taskId: id, ts: Date.now() },
    });
  },

  setAddPinMode(on) {
    set({ addPinMode: on });
  },

  showTaskList() {
    set({ taskListOpen: true, selectedTaskId: null });
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
    set({ tasks, nextSeq, selectedTaskId: null });
    schedulePersist(get);
  },
}));
