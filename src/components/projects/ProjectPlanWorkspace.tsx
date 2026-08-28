import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { patchAppView, readAppView } from '../../lib/app-view';
import { userFacingError } from '../../lib/errors';
import { openPdf, type PDFDocumentProxy } from '../../lib/pdf';
import { photoContentType } from '../../lib/photo-file';
import { setRemoteProjectSync, useProject, type RemoteProjectSync } from '../../store/project';
import type { Markup, PageCalibration, Priority, Status, Task } from '../../types';
import { Lightbox } from '../Lightbox';
import { AIChat, AIChatTrigger } from '../chat/AIChat';
import { RightDrawer } from '../RightDrawer';
import { Sidebar } from '../Sidebar';
import { StatusBar } from '../StatusBar';
import { AppHeader, Toolbar } from '../Toolbar';
import { Viewer } from '../Viewer';
import { MarkupPropertiesBar } from '../MarkupPropertiesBar';
import { ProjectPhotoMap } from './ProjectPhotoMap';
import { ProjectQuantities } from './ProjectQuantities';
import { Notice } from '../ui/notice';
import {
  normalizeTaskAttributeLayout,
  type CustomTaskAttributeDefinition,
  type CustomTaskAttributeValue,
  type TaskAttributeConfigurationDraft,
} from '../../task-attributes';
import type { QuantityItemOption, TaskQuantityLine, TaskQuantityPatch } from '../../quantities';
import type { TaskActivityEntry } from '../../task-activity';

interface ProjectPlanWorkspaceProps {
  project: Doc<'projects'>;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  userId: string;
  sheetId: Id<'sheets'>;
  chatThreadId: string;
  initialTaskId: Id<'tasks'> | null;
  onInitialTaskOpened: () => void;
  onOpenQuantityTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
  onBackToProject: () => void;
  onNewChatThread: () => void;
}

type WorkspaceRightPanel = 'photos' | 'chat';

interface WorkspaceRightPanelState {
  active: WorkspaceRightPanel | null;
  incoming: WorkspaceRightPanel | null;
  handoffWidth: number | null;
}

export function ProjectPlanWorkspace({
  project,
  role,
  userId,
  sheetId,
  chatThreadId,
  initialTaskId,
  onInitialTaskOpened,
  onOpenQuantityTask,
  onBackToProject,
  onNewChatThread,
}: ProjectPlanWorkspaceProps) {
  const workspace = useQuery(api.sheets.getPdfWorkspace, { sheetId });
  const taskRows = useQuery(api.tasks.listByPdf, { sheetId });
  const projectMembers = useQuery(api.projects.listMembers, { projectId: project._id });
  const markupRows = useQuery(api.markups.listByPdf, { sheetId });
  const selectedTaskId = useProject((state) => state.selectedTaskId);
  const selectedRemoteTaskId =
    selectedTaskId && !selectedTaskId.startsWith('local:') ? (selectedTaskId as Id<'tasks'>) : null;
  const selectedNotes = useQuery(
    api.notes.listByTask,
    selectedRemoteTaskId ? { taskId: selectedRemoteTaskId } : 'skip',
  );
  const selectedPhotos = useQuery(
    api.attachments.listPhotosByTask,
    selectedRemoteTaskId ? { taskId: selectedRemoteTaskId } : 'skip',
  );
  const selectedActivityRows = useQuery(
    api.activity.listByTask,
    selectedRemoteTaskId ? { taskId: selectedRemoteTaskId } : 'skip',
  );
  const taskAttributeConfiguration = useQuery(api.taskAttributes.getConfiguration, {
    projectId: project._id,
  });
  const quantityItemRows = useQuery(api.quantities.listItems, { projectId: project._id });
  const selectedTaskAttributeValues = useQuery(
    api.taskAttributes.listValuesByTask,
    selectedRemoteTaskId ? { taskId: selectedRemoteTaskId } : 'skip',
  );
  const selectedTaskQuantityRows = useQuery(
    api.quantities.listTaskLines,
    selectedRemoteTaskId ? { taskId: selectedRemoteTaskId } : 'skip',
  );
  const createTask = useMutation(api.tasks.create);
  const placeAgentTask = useMutation(api.agentOperations.placeTask);
  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);
  const createNote = useMutation(api.notes.create);
  const generateAttachmentUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const completePhotoUpload = useAction(api.photoUploads.complete);
  const removeAttachment = useMutation(api.attachments.remove);
  const saveMarkupMutation = useMutation(api.markups.save);
  const removeMarkupMutation = useMutation(api.markups.remove);
  const setCalibrationMutation = useMutation(api.markups.setCalibration);
  const saveTaskAttributeConfigurationMutation = useMutation(api.taskAttributes.saveConfiguration);
  const setTaskAttributeValueMutation = useMutation(api.taskAttributes.setTaskValue);
  const addTaskQuantityLineMutation = useMutation(api.quantities.addTaskLine);
  const updateTaskQuantityLineMutation = useMutation(api.quantities.updateTaskLine);
  const removeTaskQuantityLineMutation = useMutation(api.quantities.removeTaskLine);

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const sourcePdfRef = useRef<Uint8Array | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [activeView, setActiveView] = useState<'plans' | 'map' | 'quantities'>(
    () => readAppView().view,
  );
  const panelWidthsRef = useRef<Record<WorkspaceRightPanel, number>>({
    photos: 384,
    chat: 380,
  });
  const [rightPanelState, setRightPanelState] = useState<WorkspaceRightPanelState>({
    active: null,
    incoming: null,
    handoffWidth: null,
  });

  const requestRightPanel = useCallback((panel: WorkspaceRightPanel) => {
    setRightPanelState((current) => {
      const visible = current.incoming ?? current.active;
      if (visible === panel) return current;
      if (visible === null) return { active: panel, incoming: null, handoffWidth: null };
      return {
        active: visible,
        incoming: panel,
        handoffWidth: panelWidthsRef.current[visible],
      };
    });
  }, []);

  const closeRightPanel = useCallback((panel: WorkspaceRightPanel) => {
    setRightPanelState((current) => {
      if (current.incoming === panel) {
        return { ...current, incoming: null, handoffWidth: null };
      }
      if (current.active !== panel) return current;
      if (current.incoming) {
        return { active: current.incoming, incoming: null, handoffWidth: null };
      }
      return { active: null, incoming: null, handoffWidth: null };
    });
  }, []);

  const completeRightPanelHandoff = useCallback((panel: WorkspaceRightPanel) => {
    setRightPanelState((current) =>
      current.incoming === panel
        ? { active: panel, incoming: null, handoffWidth: null }
        : current,
    );
  }, []);

  const reportRightPanelWidth = useCallback((panel: WorkspaceRightPanel, width: number) => {
    if (Number.isFinite(width) && width > 0) panelWidthsRef.current[panel] = width;
  }, []);

  const requestPhotosPanel = useCallback(
    () => requestRightPanel('photos'),
    [requestRightPanel],
  );
  const closePhotosPanel = useCallback(() => closeRightPanel('photos'), [closeRightPanel]);
  const completePhotosPanelHandoff = useCallback(
    () => completeRightPanelHandoff('photos'),
    [completeRightPanelHandoff],
  );
  const reportPhotosPanelWidth = useCallback(
    (width: number) => reportRightPanelWidth('photos', width),
    [reportRightPanelWidth],
  );
  const closeChatPanel = useCallback(() => closeRightPanel('chat'), [closeRightPanel]);
  const completeChatPanelHandoff = useCallback(
    () => completeRightPanelHandoff('chat'),
    [completeRightPanelHandoff],
  );
  const reportChatPanelWidth = useCallback(
    (width: number) => reportRightPanelWidth('chat', width),
    [reportRightPanelWidth],
  );

  const photosPanelRequested =
    rightPanelState.active === 'photos' || rightPanelState.incoming === 'photos';
  const chatPanelRequested =
    rightPanelState.active === 'chat' || rightPanelState.incoming === 'chat';

  const aiChatAction = (
    <AIChatTrigger
      open={chatPanelRequested}
      onOpen={() => (chatPanelRequested ? closeChatPanel() : requestRightPanel('chat'))}
    />
  );
  const customTaskAttributeDefinitions = useMemo<CustomTaskAttributeDefinition[]>(
    () =>
      (taskAttributeConfiguration?.definitions ?? []).map((definition) => ({
        id: definition._id,
        name: definition.name,
        type: definition.type,
        unit: definition.unit,
        options: definition.options,
        valueCount: definition.valueCount,
      })),
    [taskAttributeConfiguration?.definitions],
  );
  const taskAttributeLayout = useMemo(
    () =>
      normalizeTaskAttributeLayout(
        taskAttributeConfiguration?.layout,
        taskAttributeConfiguration?.legacySettings ?? project.taskAttributeSettings,
        customTaskAttributeDefinitions,
      ),
    [customTaskAttributeDefinitions, project.taskAttributeSettings, taskAttributeConfiguration],
  );
  const quantityItems = useMemo<QuantityItemOption[]>(
    () =>
      (quantityItemRows ?? []).map((item) => ({
        id: item._id,
        name: item.name,
        defaultUnit: item.defaultUnit,
        taskCount: item.taskCount,
      })),
    [quantityItemRows],
  );
  const selectedTaskQuantityLines = useMemo<TaskQuantityLine[] | undefined>(
    () =>
      selectedTaskQuantityRows?.map((line) => ({
        lineId: 'lineId' in line ? line.lineId : undefined,
        legacy: line.legacy,
        quantityItemId: line.quantityItemId,
        plannedQuantity: line.plannedQuantity,
        completedQuantity: line.completedQuantity,
        quantityUnit: line.quantityUnit,
      })),
    [selectedTaskQuantityRows],
  );
  const selectedTaskActivity = useMemo<TaskActivityEntry[] | undefined>(
    () =>
      selectedActivityRows?.map((entry) =>
        entry.type === 'photo'
          ? { ...entry, attachmentId: entry.attachmentId, url: entry.url ?? undefined }
          : entry,
      ),
    [selectedActivityRows],
  );

  const addTaskQuantityLine = async () => {
    if (!selectedRemoteTaskId)
      throw new Error('Wait for this task to finish saving, then try again.');
    await addTaskQuantityLineMutation({ taskId: selectedRemoteTaskId });
  };

  const updateTaskQuantityLine = async (lineId: string | undefined, patch: TaskQuantityPatch) => {
    if (!selectedRemoteTaskId)
      throw new Error('Wait for this task to finish saving, then try again.');
    await updateTaskQuantityLineMutation({
      taskId: selectedRemoteTaskId,
      lineId: lineId ? (lineId as Id<'taskQuantities'>) : undefined,
      quantityItemId:
        patch.quantityItemId === undefined
          ? undefined
          : patch.quantityItemId
            ? (patch.quantityItemId as Id<'quantityItems'>)
            : null,
      plannedQuantity: patch.plannedQuantity,
      completedQuantity: patch.completedQuantity,
      quantityUnit: patch.quantityUnit,
    });
  };

  const removeTaskQuantityLine = async (lineId: string | undefined) => {
    if (!selectedRemoteTaskId)
      throw new Error('Wait for this task to finish saving, then try again.');
    await removeTaskQuantityLineMutation({
      taskId: selectedRemoteTaskId,
      lineId: lineId ? (lineId as Id<'taskQuantities'>) : undefined,
    });
  };

  const saveTaskAttributeConfiguration = async (configuration: TaskAttributeConfigurationDraft) => {
    await saveTaskAttributeConfigurationMutation({
      projectId: project._id,
      definitions: configuration.definitions.map((definition) => ({
        ...definition,
        definitionId: definition.definitionId as Id<'taskAttributeDefinitions'> | undefined,
      })),
      layout: configuration.layout,
      archivedDefinitionIds:
        configuration.archivedDefinitionIds as Id<'taskAttributeDefinitions'>[],
    });
  };

  const setTaskAttributeValue = async (
    definitionId: string,
    value: CustomTaskAttributeValue | null,
  ) => {
    if (!selectedRemoteTaskId) return;
    await setTaskAttributeValueMutation({
      taskId: selectedRemoteTaskId,
      definitionId: definitionId as Id<'taskAttributeDefinitions'>,
      value,
    });
  };

  useEffect(() => {
    patchAppView({ view: activeView });
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'map') closeRightPanel('photos');
  }, [activeView, closeRightPanel]);

  const sidebarCollapsed = useProject((state) => state.sidebarCollapsed);
  const remoteTasksRef = useRef<Record<string, Task> | null>(null);
  const remoteMarkupsRef = useRef<Record<string, Markup> | null>(null);
  const remoteCalibrationsRef = useRef<Record<number, PageCalibration>>({});
  const nextTaskSeqRef = useRef(project.nextTaskSeq);
  const syncError = useProject((state) => state.syncError);
  nextTaskSeqRef.current = project.nextTaskSeq;

  const workspacePdfUrl = workspace?.pdfUrl;
  const workspaceFileName = workspace
    ? (workspace.primary.sourceFileName ?? `${workspace.primary.name}.pdf`)
    : undefined;
  const workspaceSourceRef = workspace?.primary.sourceFileRef;

  const remoteSync = useMemo<RemoteProjectSync | null>(() => {
    if (!workspace) return null;
    const workspaceData = workspace;

    function pageSheet(page: number) {
      const sheet = workspaceData.pages.find((candidate) => candidate.pageIndex === page - 1);
      if (!sheet) throw new Error('This PDF page is not available in the project.');
      return sheet;
    }

    return {
      async createTask(task, agentOperationId) {
        const page = pageSheet(task.page);
        if (agentOperationId) {
          const placed = await placeAgentTask({
            operationId: agentOperationId as Id<'agentOperations'>,
            sheetId: page._id,
            x: task.x,
            y: task.y,
          });
          return placed.taskId;
        }
        return await createTask({
          projectId: project._id,
          sheetId: page._id,
          x: task.x,
          y: task.y,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          category: task.category,
          color: task.color,
          assigneeText: task.assignee || undefined,
          assigneeUserId: task.assigneeUserId ? (task.assigneeUserId as Id<'users'>) : undefined,
          plannedQuantity: task.plannedQuantity ?? undefined,
          completedQuantity: task.completedQuantity ?? undefined,
          quantityUnit: task.quantityUnit || undefined,
          quantityItemId: task.quantityItemId
            ? (task.quantityItemId as Id<'quantityItems'>)
            : undefined,
          startDate: task.startDate ?? undefined,
          dueDate: task.dueDate ?? undefined,
          locationText: task.locationText || undefined,
          tags: task.tags.length > 0 ? task.tags : undefined,
          manpowerCount: task.manpowerCount ?? undefined,
          costMinor: task.costMinor ?? undefined,
          currencyCode: task.currencyCode || undefined,
        });
      },
      async updateTask(taskId, patch) {
        await updateTask({
          taskId: taskId as Id<'tasks'>,
          ...(patch.page === undefined ? {} : { sheetId: pageSheet(patch.page)._id }),
          ...(patch.x === undefined ? {} : { x: patch.x }),
          ...(patch.y === undefined ? {} : { y: patch.y }),
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          ...(patch.category === undefined ? {} : { category: patch.category }),
          ...(patch.color === undefined ? {} : { color: patch.color }),
          ...(patch.assignee === undefined ? {} : { assigneeText: patch.assignee || null }),
          ...(patch.assigneeUserId === undefined
            ? {}
            : {
                assigneeUserId: patch.assigneeUserId ? (patch.assigneeUserId as Id<'users'>) : null,
              }),
          ...(patch.plannedQuantity === undefined
            ? {}
            : { plannedQuantity: patch.plannedQuantity }),
          ...(patch.completedQuantity === undefined
            ? {}
            : { completedQuantity: patch.completedQuantity }),
          ...(patch.quantityUnit === undefined ? {} : { quantityUnit: patch.quantityUnit || null }),
          ...(patch.quantityItemId === undefined
            ? {}
            : {
                quantityItemId: patch.quantityItemId
                  ? (patch.quantityItemId as Id<'quantityItems'>)
                  : null,
              }),
          ...(patch.startDate === undefined ? {} : { startDate: patch.startDate }),
          ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
          ...(patch.locationText === undefined ? {} : { locationText: patch.locationText || null }),
          ...(patch.tags === undefined ? {} : { tags: patch.tags }),
          ...(patch.manpowerCount === undefined ? {} : { manpowerCount: patch.manpowerCount }),
          ...(patch.costMinor === undefined ? {} : { costMinor: patch.costMinor }),
          ...(patch.currencyCode === undefined ? {} : { currencyCode: patch.currencyCode || null }),
        });
      },
      async deleteTask(taskId) {
        await removeTask({ taskId: taskId as Id<'tasks'> });
      },
      async addNote(taskId, text) {
        return await createNote({ taskId: taskId as Id<'tasks'>, text });
      },
      async addPhotos(taskId, files) {
        for (const file of files) {
          const contentType = photoContentType(file);
          if (!contentType) continue;
          const uploadUrl = await generateAttachmentUploadUrl({ projectId: project._id });
          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body: file,
          });
          if (!response.ok) throw new Error('A photo could not be uploaded. Please try again.');
          const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
          await completePhotoUpload({
            projectId: project._id,
            taskId: taskId as Id<'tasks'>,
            storageRef: storageId,
            fileName: file.name,
            contentType,
            size: file.size,
          });
        }
      },
      async removePhoto(_taskId, photoId) {
        await removeAttachment({ attachmentId: photoId as Id<'attachments'> });
      },
      async saveMarkup(markup) {
        const { id, page, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = markup;
        void _createdAt;
        void _updatedAt;
        await saveMarkupMutation({
          projectId: project._id,
          sheetId: pageSheet(page)._id,
          clientId: id,
          data,
        });
      },
      async deleteMarkup(markupId) {
        await removeMarkupMutation({ projectId: project._id, clientId: markupId });
      },
      async setCalibration(page, calibration) {
        await setCalibrationMutation({ sheetId: pageSheet(page)._id, calibration });
      },
    };
  }, [
    completePhotoUpload,
    createNote,
    createTask,
    generateAttachmentUploadUrl,
    placeAgentTask,
    project._id,
    removeAttachment,
    removeTask,
    removeMarkupMutation,
    saveMarkupMutation,
    setCalibrationMutation,
    updateTask,
    workspace,
  ]);

  useEffect(() => {
    if (!remoteSync) return;
    setRemoteProjectSync(remoteSync);
    return () => setRemoteProjectSync(null);
  }, [remoteSync]);

  const remoteTasks = useMemo(() => {
    if (!taskRows) return null;
    const tasks: Record<string, Task> = {};
    for (const row of taskRows) {
      const task = row.task;
      tasks[task._id] = {
        id: task._id,
        page: row.page,
        x: task.x,
        y: task.y,
        seq: task.seq,
        title: task.title,
        description: task.description,
        status: task.status as Status,
        priority: task.priority as Priority,
        category: task.category,
        color: task.color,
        assignee: task.assigneeText ?? '',
        assigneeUserId: task.assigneeUserId ?? null,
        plannedQuantity: task.plannedQuantity ?? null,
        completedQuantity: task.completedQuantity ?? null,
        quantityUnit: task.quantityUnit ?? 'EA',
        quantityItemId: task.quantityItemId ?? null,
        startDate: task.startDate ?? null,
        dueDate: task.dueDate ?? null,
        locationText: task.locationText ?? '',
        tags: task.tags ?? [],
        manpowerCount: task.manpowerCount ?? null,
        costMinor: task.costMinor ?? null,
        currencyCode: task.currencyCode ?? 'USD',
        createdByUserId: task.createdBy,
        notes: [],
        photos: [],
        evidencePhotoCount: row.evidencePhotoCount,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    }
    return tasks;
  }, [taskRows]);

  useEffect(() => {
    remoteTasksRef.current = remoteTasks;
  }, [remoteTasks]);

  useEffect(() => {
    if (!remoteTasks) return;
    useProject.getState().replaceProject(remoteTasks, project.nextTaskSeq);
  }, [project.nextTaskSeq, remoteTasks]);

  const remoteMarkups = useMemo(() => {
    if (!markupRows) return null;
    const markups: Record<string, Markup> = {};
    for (const { markup, page } of markupRows) {
      markups[markup.clientId] = {
        id: markup.clientId,
        page,
        ...markup.data,
        createdAt: markup.createdAt,
        updatedAt: markup.updatedAt,
      } as Markup;
    }
    return markups;
  }, [markupRows]);

  const remoteCalibrations = useMemo(() => {
    const calibrations: Record<number, PageCalibration> = {};
    for (const page of workspace?.pages ?? []) {
      if (page.calibration) calibrations[page.pageIndex + 1] = page.calibration;
    }
    return calibrations;
  }, [workspace?.pages]);

  useEffect(() => {
    if (!remoteMarkups || !workspace) return;
    remoteMarkupsRef.current = remoteMarkups;
    remoteCalibrationsRef.current = remoteCalibrations;
    useProject.getState().replaceMarkups(remoteMarkups, remoteCalibrations);
  }, [remoteCalibrations, remoteMarkups, workspace]);

  useEffect(() => {
    if (!selectedRemoteTaskId || !selectedNotes || !selectedPhotos) return;
    useProject.getState().replaceTaskDetails(
      selectedRemoteTaskId,
      selectedNotes.map((note) => ({
        id: note._id,
        text: note.text,
        createdAt: note.createdAt,
      })),
      selectedPhotos.map(({ attachment, url }) => ({
        id: attachment._id,
        name: attachment.fileName,
        createdAt: attachment.createdAt,
        url: url ?? undefined,
      })),
    );
  }, [selectedNotes, selectedPhotos, selectedRemoteTaskId]);

  useEffect(() => {
    if (!initialTaskId || !remoteTasks?.[initialTaskId]) return;
    const task = remoteTasks[initialTaskId];
    setActiveView('plans');
    useProject.getState().setPage(task.page);
    useProject.getState().selectTask(initialTaskId);
    useProject.getState().focusTask(initialTaskId);
    onInitialTaskOpened();
  }, [initialTaskId, onInitialTaskOpened, remoteTasks]);

  useEffect(() => {
    if (!workspacePdfUrl || !workspaceFileName || !workspaceSourceRef) return;
    let active = true;
    setDocument(null);
    sourcePdfRef.current = null;
    setDocumentError(null);
    void (async () => {
      try {
        const response = await fetch(workspacePdfUrl);
        if (!response.ok) throw new Error('The plan PDF could not be loaded.');
        const buffer = await response.arrayBuffer();
        const source = new Uint8Array(buffer.slice(0));
        const opened = await openPdf(buffer);
        if (!active) return;
        useProject.getState().loadRemoteDocument({
          fileName: workspaceFileName,
          fingerprint: `project:${project._id}:pdf:${workspaceSourceRef}`,
          pageCount: opened.pageCount,
        });
        if (remoteTasksRef.current) {
          useProject.getState().replaceProject(remoteTasksRef.current, nextTaskSeqRef.current);
        }
        if (remoteMarkupsRef.current) {
          useProject
            .getState()
            .replaceMarkups(remoteMarkupsRef.current, remoteCalibrationsRef.current);
        }
        setDocument(opened.doc);
        sourcePdfRef.current = source;
      } catch (error) {
        if (active) {
          setDocumentError(userFacingError(error, 'The plan PDF could not be loaded.'));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [project._id, workspaceFileName, workspacePdfUrl, workspaceSourceRef]);

  const saveMarkedUpPdf = async () => {
    const sourcePdf = sourcePdfRef.current;
    if (!sourcePdf) return;
    setSavingPdf(true);
    setDownloadError(null);
    try {
      const { downloadAnnotatedPdf } = await import('../../lib/annotated-pdf');
      const state = useProject.getState();
      await downloadAnnotatedPdf(sourcePdf, {
        fileName: state.fileName,
        markups: state.markups,
        calibrations: state.calibrations,
      });
    } catch (error) {
      setDownloadError(userFacingError(error, 'The marked-up PDF could not be downloaded.'));
    } finally {
      setSavingPdf(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeView !== 'plans') return;
      const target = event.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      const state = useProject.getState();
      if (event.key === 'Escape') {
        if (state.addPinMode) {
          state.setAddPinMode(false);
          return;
        }
        if (state.markupTool && state.markupTool !== 'select') {
          state.setMarkupTool('select');
          return;
        }
        if (state.selectedMarkupId) {
          state.selectMarkup(null);
          return;
        }
        if (state.selectedTaskId) state.selectTask(null);
        if (target.closest('.fp-pin')) target.blur();
        return;
      }
      if (!typing && document && (event.ctrlKey || event.metaKey)) {
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          event.preventDefault();
          if (key === 'y' || event.shiftKey) state.redo();
          else state.undo();
          return;
        }
      }
      if (typing || !document) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedMarkupId) {
        event.preventDefault();
        state.deleteMarkup(state.selectedMarkupId);
        return;
      }
      if (event.key === 'p' || event.key === 'P') {
        state.setAddPinMode(!state.addPinMode);
      } else if (event.key === 'ArrowLeft') {
        state.setPage(state.currentPage - 1);
      } else if (event.key === 'ArrowRight') {
        state.setPage(state.currentPage + 1);
      }
    };
    globalThis.document.addEventListener('keydown', onKeyDown);
    return () => globalThis.document.removeEventListener('keydown', onKeyDown);
  }, [activeView, document]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app font-sans text-t1">
      <AppHeader onLogoClick={onBackToProject} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeItem={activeView}
          onShowPlans={() => setActiveView('plans')}
          onShowMap={() => setActiveView('map')}
          onShowQuantities={() => setActiveView('quantities')}
        />
        <div
          className={
            sidebarCollapsed
              ? 'hidden shrink-0 transition-[width] duration-(--fp-motion-duration) ease-(--fp-motion-ease) md:block md:w-14'
              : 'hidden shrink-0 transition-[width] duration-(--fp-motion-duration) ease-(--fp-motion-ease) md:block md:w-50'
          }
          aria-hidden
        />
        <div className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeView === 'map' ? (
            <ProjectPhotoMap
              project={project}
              role={role}
              userId={userId}
              aiChatAction={aiChatAction}
              photosPanelRequested={photosPanelRequested}
              photosPanelHandoffIncoming={rightPanelState.incoming === 'photos'}
              photosPanelHandoffWidth={rightPanelState.handoffWidth}
              onRequestOpenPhotos={requestPhotosPanel}
              onRequestClosePhotos={closePhotosPanel}
              onPhotosPanelHandoffComplete={completePhotosPanelHandoff}
              onPhotosPanelWidthChange={reportPhotosPanelWidth}
            />
          ) : activeView === 'quantities' ? (
            <ProjectQuantities
              project={project}
              role={role}
              onOpenTask={onOpenQuantityTask}
              endActions={aiChatAction}
            />
          ) : (
            <>
              <Toolbar
                hasDoc={document !== null}
                allowLocalFiles={false}
                savingPdf={savingPdf}
                onOpenPdf={() => undefined}
                onImportJson={() => undefined}
                onSavePdf={() => void saveMarkedUpPdf()}
                endActions={aiChatAction}
              />
              {document && <MarkupPropertiesBar />}
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <main className="relative min-w-0 flex-1 overflow-hidden">
                  {document ? (
                    <Viewer doc={document} />
                  ) : (
                    <div className="fp-canvas-stage flex h-full items-center justify-center p-6">
                      {documentError ? (
                        <Notice tone="error">This plan could not be opened: {documentError}</Notice>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-t2">
                          <Loader2 className="size-4 animate-spin text-accent" />
                          Opening plan…
                        </div>
                      )}
                    </div>
                  )}
                  {document && syncError && (
                    <Notice
                      tone="error"
                      compact
                      className="absolute left-1/2 top-4 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 shadow-e2"
                    >
                      Changes not saved: {syncError}
                    </Notice>
                  )}
                  {document && downloadError && (
                    <Notice
                      tone="error"
                      compact
                      className="absolute left-1/2 top-16 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 shadow-e2"
                    >
                      The marked-up PDF could not be saved: {downloadError}
                    </Notice>
                  )}
                </main>
                {document && (
                  <RightDrawer
                    canEdit={role !== 'viewer'}
                    canManageAttributes={role === 'owner' || role === 'admin'}
                    members={projectMembers ?? []}
                    projectId={project._id}
                    quantityItems={quantityItems}
                    taskQuantityLines={selectedTaskQuantityLines}
                    taskActivity={selectedTaskActivity}
                    taskAttributeLayout={taskAttributeLayout}
                    customTaskAttributeDefinitions={customTaskAttributeDefinitions}
                    customTaskAttributeValues={selectedTaskAttributeValues ?? []}
                    onTaskAttributeConfigurationChange={saveTaskAttributeConfiguration}
                    onCustomTaskAttributeValueChange={setTaskAttributeValue}
                    onAddTaskQuantityLine={addTaskQuantityLine}
                    onUpdateTaskQuantityLine={updateTaskQuantityLine}
                    onRemoveTaskQuantityLine={removeTaskQuantityLine}
                  />
                )}
              </div>
              <StatusBar hasDoc={document !== null} />
            </>
          )}
        </div>
        <AIChat
          projectId={project._id}
          projectName={project.name}
          activeView={activeView}
          threadId={chatThreadId}
          open={chatPanelRequested}
          handoffIncoming={rightPanelState.incoming === 'chat'}
          handoffWidth={rightPanelState.handoffWidth}
          onClose={closeChatPanel}
          onHandoffComplete={completeChatPanelHandoff}
          onPanelWidthChange={reportChatPanelWidth}
          onNewThread={onNewChatThread}
        />
      </div>
      <Lightbox />
    </div>
  );
}
