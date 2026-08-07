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
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
}

type RemoteTaskPatch = Partial<
  Pick<
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
  >
>;

export interface RemoteProjectSync {
  createTask(task: Task): Promise<string>;
  updateTask(taskId: string, patch: RemoteTaskPatch): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  addNote(taskId: string, text: string): Promise<string>;
  addPhotos(taskId: string, files: File[]): Promise<void>;
  removePhoto(taskId: string, photoId: string): Promise<void>;
  saveMarkup(markup: Markup): Promise<void>;
  deleteMarkup(markupId: string): Promise<void>;
  setCalibration(page: number, calibration: PageCalibration | null): Promise<void>;
}

let remoteSync: RemoteProjectSync | null = null;
const remoteUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRemoteUpdates = new Set<string>();
const pendingRemotePatches = new Map<string, RemoteTaskPatch>();
const markupSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRemoteMarkups = new Set<string>();
const pendingDeletedMarkups = new Set<string>();
const pendingCalibrationPages = new Set<number>();

function syncErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function reportRemoteError(error: unknown, fallback: string) {
  useProject.setState({ syncError: syncErrorMessage(error, fallback) });
}

function saveMarkupRemotely(markup: Markup, adapter: RemoteProjectSync) {
  pendingRemoteMarkups.add(markup.id);
  void adapter
    .saveMarkup(markup)
    .then(() => useProject.setState({ syncError: null }))
    .catch((error: unknown) => reportRemoteError(error, 'The markup could not be saved.'))
    .finally(() => pendingRemoteMarkups.delete(markup.id));
}

function syncMarkupHistory(
  before: HistorySnapshot,
  after: HistorySnapshot,
  adapter: RemoteProjectSync,
) {
  const markupIds = new Set([...Object.keys(before.markups), ...Object.keys(after.markups)]);
  for (const id of markupIds) {
    const previous = before.markups[id];
    const next = after.markups[id];
    if (!next) {
      pendingDeletedMarkups.add(id);
      void adapter
        .deleteMarkup(id)
        .catch((error: unknown) => reportRemoteError(error, 'The markup could not be deleted.'))
        .finally(() => pendingDeletedMarkups.delete(id));
    } else if (previous !== next) {
      saveMarkupRemotely(next, adapter);
    }
  }

  const pages = new Set([
    ...Object.keys(before.calibrations).map(Number),
    ...Object.keys(after.calibrations).map(Number),
  ]);
  for (const page of pages) {
    if (before.calibrations[page] === after.calibrations[page]) continue;
    pendingCalibrationPages.add(page);
    void adapter
      .setCalibration(page, after.calibrations[page] ?? null)
      .catch((error: unknown) => reportRemoteError(error, 'The calibration could not be saved.'))
      .finally(() => pendingCalibrationPages.delete(page));
  }
}

function sendPendingRemoteUpdate(taskId: string, adapter: RemoteProjectSync) {
  const patch = pendingRemotePatches.get(taskId);
  pendingRemotePatches.delete(taskId);
  if (!patch) {
    pendingRemoteUpdates.delete(taskId);
    return;
  }
  void adapter
    .updateTask(taskId, patch)
    .then(() => useProject.setState({ syncError: null }))
    .catch((error: unknown) => {
      useProject.setState({
        syncError: error instanceof Error ? error.message : 'The task changes could not be saved.',
      });
    })
    .finally(() => {
      if (!pendingRemotePatches.has(taskId)) pendingRemoteUpdates.delete(taskId);
    });
}

export function setRemoteProjectSync(sync: RemoteProjectSync | null) {
  const previousSync = remoteSync;
  if (sync === null && previousSync !== null) {
    // React cleanup cannot await, but starting the mutation with the captured adapter prevents the
    // final debounced keystroke from being discarded when the user navigates away.
    for (const taskId of pendingRemotePatches.keys()) {
      const timer = remoteUpdateTimers.get(taskId);
      if (timer) clearTimeout(timer);
      remoteUpdateTimers.delete(taskId);
      sendPendingRemoteUpdate(taskId, previousSync);
    }
    for (const [markupId, timer] of markupSaveTimers) {
      clearTimeout(timer);
      markupSaveTimers.delete(markupId);
      const markup = useProject.getState().markups[markupId];
      if (markup) saveMarkupRemotely(markup, previousSync);
    }
  }
  remoteSync = sync;
  if (sync !== null) return;
  for (const timer of remoteUpdateTimers.values()) clearTimeout(timer);
  remoteUpdateTimers.clear();
  for (const timer of markupSaveTimers.values()) clearTimeout(timer);
  markupSaveTimers.clear();
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
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
  // ui
  selectedTaskId: string | null;
  addPinMode: boolean;
  taskListOpen: boolean;
  sidebarCollapsed: boolean;
  lightboxPhotoId: string | null;
  focusRequest: FocusRequest | null;
  selectedMarkupId: string | null;
  markupTool: MarkupTool | null;
  snappingEnabled: boolean;
  lastTaskColor: string;
  syncError: string | null;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];

  loadDocument(meta: { fileName: string; fingerprint: string; pageCount: number }): Promise<void>;
  loadRemoteDocument(meta: { fileName: string; fingerprint: string; pageCount: number }): void;
  setPage(page: number): void;
  addTask(page: number, x: number, y: number): string;
  updateTask(id: string, patch: RemoteTaskPatch): void;
  moveTask(id: string, x: number, y: number): void;
  deleteTask(id: string): Promise<void>;
  addNote(taskId: string, text: string): void;
  addPhotos(taskId: string, files: File[]): Promise<void>;
  removePhoto(taskId: string, photoId: string): Promise<void>;
  selectTask(id: string | null): void;
  focusTask(id: string): void;
  setAddPinMode(on: boolean): void;
  setMarkupTool(tool: MarkupTool | null): void;
  setSnappingEnabled(enabled: boolean): void;
  addMarkup(markup: Omit<Markup, 'id' | 'createdAt' | 'updatedAt'>): string;
  updateMarkup(id: string, patch: Partial<Omit<Markup, 'id' | 'page' | 'createdAt'>>): void;
  deleteMarkup(id: string): void;
  selectMarkup(id: string | null): void;
  setCalibration(page: number, calibration: PageCalibration): void;
  undo(): void;
  redo(): void;
  showTaskList(): void;
  closeTaskList(): void;
  toggleSidebar(): void;
  setSidebarCollapsed(collapsed: boolean): void;
  setLightbox(photoId: string | null): void;
  replaceProject(tasks: Record<string, Task>, nextSeq: number): void;
  replaceMarkups(
    markups: Record<string, Markup>,
    calibrations: Record<number, PageCalibration>,
  ): void;
  replaceTaskDetails(taskId: string, notes: Task['notes'], photos: Task['photos']): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => ProjectState) {
  if (remoteSync) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { fingerprint, tasks, nextSeq, markups, calibrations } = get();
    if (!fingerprint) return;
    const data: PersistedProject = { tasks, nextSeq, markups, calibrations };
    void idbSet(projectKey(fingerprint), data);
  }, 300);
}

function captureHistory(state: ProjectState): HistorySnapshot {
  return { markups: state.markups, calibrations: state.calibrations };
}

let historyKey: string | null = null;
let historyAt = 0;

function recordHistory(
  set: (partial: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => void,
  get: () => ProjectState,
  key?: string,
) {
  const now = Date.now();
  if (key && historyKey === key && now - historyAt < 500) return;
  const current = captureHistory(get());
  set((state) => ({
    historyPast: [...state.historyPast, current].slice(-100),
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
  lastTaskColor: localStorage.getItem('fp:last-task-color') ?? DEFAULT_TASK_COLOR,
  syncError: null,
  historyPast: [],
  historyFuture: [],

  async loadDocument({ fileName, fingerprint, pageCount }) {
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
      selectedMarkupId: null,
      markupTool: null,
      addPinMode: false,
      focusRequest: null,
      historyPast: [],
      historyFuture: [],
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
      markups: {},
      calibrations: {},
      selectedTaskId: null,
      selectedMarkupId: null,
      markupTool: null,
      addPinMode: false,
      taskListOpen: false,
      focusRequest: null,
      syncError: null,
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
      pendingRemotePatches.set(id, { ...pendingRemotePatches.get(id), ...patch });
      set({ syncError: null });
      remoteUpdateTimers.set(
        id,
        setTimeout(() => {
          remoteUpdateTimers.delete(id);
          const adapter = remoteSync;
          if (!adapter) {
            pendingRemoteUpdates.delete(id);
            return;
          }
          sendPendingRemoteUpdate(id, adapter);
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
    const pendingTimer = remoteUpdateTimers.get(id);
    if (pendingTimer) clearTimeout(pendingTimer);
    remoteUpdateTimers.delete(id);
    pendingRemotePatches.delete(id);
    pendingRemoteUpdates.delete(id);
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
    const note = {
      id: remoteSync ? `local-note:${uid()}` : uid(),
      text: trimmed,
      createdAt: Date.now(),
    };
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
      void remoteSync
        .addNote(taskId, trimmed)
        .then((serverNoteId) => {
          set((state) => {
            const task = state.tasks[taskId];
            if (!task) return state;
            const serverNoteAlreadyPresent = task.notes.some(
              (candidate) => candidate.id === serverNoteId,
            );
            return {
              tasks: {
                ...state.tasks,
                [taskId]: {
                  ...task,
                  notes: serverNoteAlreadyPresent
                    ? task.notes.filter((candidate) => candidate.id !== note.id)
                    : task.notes.map((candidate) =>
                        candidate.id === note.id ? { ...candidate, id: serverNoteId } : candidate,
                      ),
                },
              },
              syncError: null,
            };
          });
        })
        .catch((error: unknown) => {
          set((state) => {
            const task = state.tasks[taskId];
            if (!task) {
              return {
                syncError: error instanceof Error ? error.message : 'The note could not be saved.',
              };
            }
            return {
              tasks: {
                ...state.tasks,
                [taskId]: {
                  ...task,
                  notes: task.notes.filter((candidate) => candidate.id !== note.id),
                },
              },
              syncError: error instanceof Error ? error.message : 'The note could not be saved.',
            };
          });
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
    set({ selectedTaskId: id, selectedMarkupId: null });
  },

  focusTask(id) {
    const task = get().tasks[id];
    if (!task) return;
    set({
      currentPage: task.page,
      focusRequest: { taskId: id, ts: Date.now() },
    });
  },

  setAddPinMode(on) {
    set({ addPinMode: on, markupTool: on ? null : get().markupTool, selectedMarkupId: null });
  },

  setMarkupTool(tool) {
    set({
      markupTool: tool,
      addPinMode: false,
      selectedTaskId: null,
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
    set((state) => ({
      markups: { ...state.markups, [id]: created },
      selectedMarkupId: id,
      selectedTaskId: null,
      taskListOpen: false,
    }));
    const adapter = remoteSync;
    if (adapter) saveMarkupRemotely(created, adapter);
    else schedulePersist(get);
    return id;
  },

  updateMarkup(id, patch) {
    const current = get().markups[id];
    if (!current) return;
    recordHistory(set, get, `markup:${id}`);
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    set((state) => ({ markups: { ...state.markups, [id]: updated } }));

    const adapter = remoteSync;
    if (!adapter) {
      schedulePersist(get);
      return;
    }
    const existing = markupSaveTimers.get(id);
    if (existing) clearTimeout(existing);
    pendingRemoteMarkups.add(id);
    markupSaveTimers.set(
      id,
      setTimeout(() => {
        markupSaveTimers.delete(id);
        const latest = useProject.getState().markups[id];
        const activeAdapter = remoteSync;
        if (latest && activeAdapter) saveMarkupRemotely(latest, activeAdapter);
        else pendingRemoteMarkups.delete(id);
      }, 250),
    );
  },

  deleteMarkup(id) {
    if (!get().markups[id]) return;
    recordHistory(set, get);
    const timer = markupSaveTimers.get(id);
    if (timer) clearTimeout(timer);
    markupSaveTimers.delete(id);
    pendingRemoteMarkups.delete(id);
    set((state) => {
      const markups = { ...state.markups };
      delete markups[id];
      return {
        markups,
        selectedMarkupId: state.selectedMarkupId === id ? null : state.selectedMarkupId,
      };
    });
    const adapter = remoteSync;
    if (!adapter) {
      schedulePersist(get);
      return;
    }
    pendingDeletedMarkups.add(id);
    void adapter
      .deleteMarkup(id)
      .then(() => set({ syncError: null }))
      .catch((error: unknown) => reportRemoteError(error, 'The markup could not be deleted.'))
      .finally(() => pendingDeletedMarkups.delete(id));
  },

  selectMarkup(id) {
    set({
      selectedMarkupId: id,
      selectedTaskId: null,
      taskListOpen: false,
      markupTool: 'select',
    });
  },

  setCalibration(page, calibration) {
    recordHistory(set, get, `calibration:${page}`);
    set((state) => ({ calibrations: { ...state.calibrations, [page]: calibration } }));
    const adapter = remoteSync;
    if (!adapter) {
      schedulePersist(get);
      return;
    }
    pendingCalibrationPages.add(page);
    void adapter
      .setCalibration(page, calibration)
      .then(() => set({ syncError: null }))
      .catch((error: unknown) => reportRemoteError(error, 'The calibration could not be saved.'))
      .finally(() => pendingCalibrationPages.delete(page));
  },

  undo() {
    const state = get();
    const previous = state.historyPast.at(-1);
    if (!previous) return;
    const current = captureHistory(state);
    historyKey = null;
    set({
      ...previous,
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [...state.historyFuture, current].slice(-100),
      selectedMarkupId: null,
    });
    if (remoteSync) syncMarkupHistory(current, previous, remoteSync);
    else schedulePersist(get);
  },

  redo() {
    const state = get();
    const next = state.historyFuture.at(-1);
    if (!next) return;
    const current = captureHistory(state);
    historyKey = null;
    set({
      ...next,
      historyPast: [...state.historyPast, current].slice(-100),
      historyFuture: state.historyFuture.slice(0, -1),
      selectedMarkupId: null,
    });
    if (remoteSync) syncMarkupHistory(current, next, remoteSync);
    else schedulePersist(get);
  },

  showTaskList() {
    set({ taskListOpen: true, selectedTaskId: null, selectedMarkupId: null });
  },

  closeTaskList() {
    set({ taskListOpen: false });
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  },

  setSidebarCollapsed(collapsed) {
    set({ sidebarCollapsed: collapsed });
  },

  setLightbox(photoId) {
    set({ lightboxPhotoId: photoId });
  },

  replaceProject(tasks, nextSeq) {
    set((state) => {
      const merged = Object.fromEntries(
        Object.entries(tasks).map(([id, task]) => {
          const current = state.tasks[id];
          return [id, current ? { ...task, notes: current.notes, photos: current.photos } : task];
        }),
      );
      for (const [id, task] of Object.entries(state.tasks)) {
        if (id.startsWith('local:') || pendingRemoteUpdates.has(id)) merged[id] = task;
      }
      return {
        tasks: merged,
        nextSeq,
        selectedTaskId:
          state.selectedTaskId && merged[state.selectedTaskId] ? state.selectedTaskId : null,
      };
    });
    schedulePersist(get);
  },

  replaceMarkups(markups, calibrations) {
    set((state) => {
      const mergedMarkups = { ...markups };
      for (const id of pendingDeletedMarkups) delete mergedMarkups[id];
      for (const id of pendingRemoteMarkups) {
        if (state.markups[id]) mergedMarkups[id] = state.markups[id];
      }
      const mergedCalibrations = { ...calibrations };
      for (const page of pendingCalibrationPages) {
        if (state.calibrations[page]) mergedCalibrations[page] = state.calibrations[page];
        else delete mergedCalibrations[page];
      }
      return {
        markups: mergedMarkups,
        calibrations: mergedCalibrations,
        selectedMarkupId:
          state.selectedMarkupId && mergedMarkups[state.selectedMarkupId]
            ? state.selectedMarkupId
            : null,
      };
    });
  },

  replaceTaskDetails(taskId, notes, photos) {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      const pendingNotes = task.notes.filter((note) => note.id.startsWith('local-note:'));
      const pendingIds = new Set(pendingNotes.map((note) => note.id));
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            notes: [...pendingNotes, ...notes.filter((note) => !pendingIds.has(note.id))],
            photos,
          },
        },
      };
    });
  },
}));
