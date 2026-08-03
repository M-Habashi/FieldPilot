import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import {
  DEFAULT_TASK_COLOR,
  type Markup,
  type MarkupTool,
  type PageCalibration,
  type Photo,
  type Task,
} from '../types';
import { uid } from '../lib/utils';
import { deletePhotoBlob, savePhotoBlob } from '../lib/photos';

interface PersistedProject {
  tasks: Record<string, Task>;
  nextSeq: number;
  markups?: Record<string, Markup>;
  calibrations?: Record<number, PageCalibration>;
}

interface HistorySnapshot {
  tasks: Record<string, Task>;
  nextSeq: number;
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
  lastTaskColor: string;
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
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
  // ui
  selectedTaskId: string | null;
  pinTooltipTaskId: string | null;
  addPinMode: boolean;
  taskListOpen: boolean;
  sidebarCollapsed: boolean;
  lightboxPhotoId: string | null;
  focusRequest: FocusRequest | null;
  selectedMarkupId: string | null;
  markupTool: MarkupTool | null;
  snappingEnabled: boolean;
  design: string;
  lastTaskColor: string;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];

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
  showPinTooltip(id: string | null): void;
  focusTask(id: string): void;
  setAddPinMode(on: boolean): void;
  setMarkupTool(tool: MarkupTool | null): void;
  setSnappingEnabled(enabled: boolean): void;
  undo(): void;
  redo(): void;
  addMarkup(markup: Omit<Markup, 'id' | 'createdAt' | 'updatedAt'>): string;
  updateMarkup(id: string, patch: Partial<Omit<Markup, 'id' | 'page' | 'createdAt'>>): void;
  deleteMarkup(id: string): void;
  selectMarkup(id: string | null): void;
  setCalibration(page: number, calibration: PageCalibration): void;
  showTaskList(): void;
  closeTaskList(): void;
  toggleSidebar(): void;
  setLightbox(photoId: string | null): void;
  setDesign(id: string): void;
  replaceProject(
    tasks: Record<string, Task>,
    nextSeq: number,
    markups?: Record<string, Markup>,
    calibrations?: Record<number, PageCalibration>,
  ): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => ProjectState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { fingerprint, tasks, nextSeq, markups, calibrations } = get();
    if (!fingerprint) return;
    const data: PersistedProject = { tasks, nextSeq, markups, calibrations };
    void idbSet(projectKey(fingerprint), data);
  }, 300);
}

function captureHistory(state: ProjectState): HistorySnapshot {
  return {
    tasks: state.tasks,
    nextSeq: state.nextSeq,
    markups: state.markups,
    calibrations: state.calibrations,
    lastTaskColor: state.lastTaskColor,
  };
}

let historyKey: string | null = null;
let historyAt = 0;

function recordHistory(
  set: (partial: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => void,
  get: () => ProjectState,
  key?: string,
) {
  const now = Date.now();
  // Pointer drags and text/property edits call update repeatedly. Coalesce
  // adjacent updates for the same object into one user-level action.
  if (key && historyKey === key && now - historyAt < 500) return;
  const current = get();
  set((state) => ({
    historyPast: [...state.historyPast, captureHistory(current)].slice(-100),
    historyFuture: [],
  }));
  historyKey = key ?? null;
  historyAt = now;
}

export const useProject = create<ProjectState>((set, get) => ({
  fileName: null,
  fingerprint: null,
  pageCount: 0,
  currentPage: 1,
  tasks: {},
  nextSeq: 1,
  markups: {},
  calibrations: {},
  selectedTaskId: null,
  pinTooltipTaskId: null,
  addPinMode: false,
  taskListOpen: false,
  // Default to the narrow icon rail; the single "Plans" item doesn't justify
  // the wide sidebar. Users expand it explicitly via the chevron.
  sidebarCollapsed: true,
  lightboxPhotoId: null,
  focusRequest: null,
  selectedMarkupId: null,
  markupTool: null,
  snappingEnabled: localStorage.getItem('fp:snapping') !== 'off',
  design: localStorage.getItem('fp:design') ?? 'blueprint',
  lastTaskColor: localStorage.getItem('fp:last-task-color') ?? DEFAULT_TASK_COLOR,
  historyPast: [],
  historyFuture: [],

  async loadDocument({ fileName, fingerprint, pageCount }) {
    historyKey = null;
    historyAt = 0;
    const persisted = await idbGet<PersistedProject>(projectKey(fingerprint));
    set({
      fileName,
      fingerprint,
      pageCount,
      currentPage: 1,
      tasks: persisted?.tasks ?? {},
      nextSeq: persisted?.nextSeq ?? 1,
      markups: persisted?.markups ?? {},
      calibrations: persisted?.calibrations ?? {},
      selectedTaskId: null,
      pinTooltipTaskId: null,
      addPinMode: false,
      selectedMarkupId: null,
      markupTool: null,
      focusRequest: null,
      historyPast: [],
      historyFuture: [],
    });
  },

  setPage(page) {
    const { pageCount } = get();
    const p = Math.min(Math.max(1, page), Math.max(1, pageCount));
    set({ currentPage: p });
  },

  addTask(page, x, y) {
    recordHistory(set, get);
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
      pinTooltipTaskId: null,
    }));
    schedulePersist(get);
    return id;
  },

  updateTask(id, patch) {
    if (!get().tasks[id]) return;
    recordHistory(set, get, `task:${id}`);
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
    recordHistory(set, get);
    for (const photo of task.photos) {
      await deletePhotoBlob(photo.id);
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
    schedulePersist(get);
  },

  addNote(taskId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!get().tasks[taskId]) return;
    recordHistory(set, get);
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
    if (!get().tasks[taskId]) return;
    const photos: Photo[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const id = uid();
      await savePhotoBlob(id, file);
      photos.push({ id, name: file.name, createdAt: Date.now() });
    }
    if (photos.length === 0) return;
    recordHistory(set, get);
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
    if (!get().tasks[taskId]) return;
    recordHistory(set, get);
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
    set({ selectedTaskId: id, pinTooltipTaskId: null, selectedMarkupId: null });
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
    set({ addPinMode: on, markupTool: on ? null : get().markupTool, selectedMarkupId: on ? null : get().selectedMarkupId });
  },

  setMarkupTool(tool) {
    set({
      markupTool: tool,
      addPinMode: false,
      selectedTaskId: null,
      pinTooltipTaskId: null,
      taskListOpen: false,
      selectedMarkupId: tool === 'select' ? get().selectedMarkupId : null,
    });
  },

  setSnappingEnabled(enabled) {
    localStorage.setItem('fp:snapping', enabled ? 'on' : 'off');
    set({ snappingEnabled: enabled });
  },

  addMarkup(markup) {
    recordHistory(set, get);
    const id = uid();
    const now = Date.now();
    const created: Markup = { ...markup, id, createdAt: now, updatedAt: now };
    set((s) => ({
      markups: { ...s.markups, [id]: created },
      selectedMarkupId: id,
      selectedTaskId: null,
      taskListOpen: false,
    }));
    schedulePersist(get);
    return id;
  },

  updateMarkup(id, patch) {
    if (!get().markups[id]) return;
    recordHistory(set, get, `markup:${id}`);
    set((s) => {
      const markup = s.markups[id];
      if (!markup) return s;
      return { markups: { ...s.markups, [id]: { ...markup, ...patch, updatedAt: Date.now() } } };
    });
    schedulePersist(get);
  },

  deleteMarkup(id) {
    if (!get().markups[id]) return;
    recordHistory(set, get);
    set((s) => {
      const markups = { ...s.markups };
      delete markups[id];
      return { markups, selectedMarkupId: s.selectedMarkupId === id ? null : s.selectedMarkupId };
    });
    schedulePersist(get);
  },

  selectMarkup(id) {
    set({
      selectedMarkupId: id,
      selectedTaskId: null,
      pinTooltipTaskId: null,
      taskListOpen: false,
      markupTool: 'select',
    });
  },

  setCalibration(page, calibration) {
    recordHistory(set, get, `calibration:${page}`);
    set((s) => ({ calibrations: { ...s.calibrations, [page]: calibration } }));
    schedulePersist(get);
  },

  undo() {
    const state = get();
    const previous = state.historyPast[state.historyPast.length - 1];
    if (!previous) return;
    const current = captureHistory(state);
    historyKey = null;
    historyAt = 0;
    set({
      ...previous,
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [...state.historyFuture, current].slice(-100),
      selectedMarkupId: null,
      selectedTaskId: null,
      pinTooltipTaskId: null,
    });
    schedulePersist(get);
  },

  redo() {
    const state = get();
    const next = state.historyFuture[state.historyFuture.length - 1];
    if (!next) return;
    const current = captureHistory(state);
    historyKey = null;
    historyAt = 0;
    set({
      ...next,
      historyPast: [...state.historyPast, current].slice(-100),
      historyFuture: state.historyFuture.slice(0, -1),
      selectedMarkupId: null,
      selectedTaskId: null,
      pinTooltipTaskId: null,
    });
    schedulePersist(get);
  },

  showTaskList() {
    set({ taskListOpen: true, selectedTaskId: null, pinTooltipTaskId: null, selectedMarkupId: null });
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

  replaceProject(tasks, nextSeq, markups = {}, calibrations = {}) {
    recordHistory(set, get);
    set({ tasks, nextSeq, markups, calibrations, selectedTaskId: null, pinTooltipTaskId: null, selectedMarkupId: null });
    schedulePersist(get);
  },
}));
