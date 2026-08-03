import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { openPdf, type PDFDocumentProxy } from '../../lib/pdf';
import { setRemoteProjectSync, useProject, type RemoteProjectSync } from '../../store/project';
import type { Markup, PageCalibration, Priority, Status, Task } from '../../types';
import { Lightbox } from '../Lightbox';
import { RightDrawer } from '../RightDrawer';
import { Sidebar } from '../Sidebar';
import { StatusBar } from '../StatusBar';
import { AppHeader, Toolbar } from '../Toolbar';
import { Viewer } from '../Viewer';
import { MarkupPropertiesBar } from '../MarkupPropertiesBar';
import { Notice } from '../ui/notice';

interface ProjectPlanWorkspaceProps {
  project: Doc<'projects'>;
  sheetId: Id<'sheets'>;
  onBackToProject: () => void;
}

export function ProjectPlanWorkspace({
  project,
  sheetId,
  onBackToProject,
}: ProjectPlanWorkspaceProps) {
  const workspace = useQuery(api.sheets.getPdfWorkspace, { sheetId });
  const taskRows = useQuery(api.tasks.listByPdf, { sheetId });
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
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);
  const createNote = useMutation(api.notes.create);
  const generateAttachmentUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const completeAttachmentUpload = useMutation(api.attachments.completeUpload);
  const removeAttachment = useMutation(api.attachments.remove);
  const saveMarkupMutation = useMutation(api.markups.save);
  const removeMarkupMutation = useMutation(api.markups.remove);
  const setCalibrationMutation = useMutation(api.markups.setCalibration);

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const sourcePdfRef = useRef<Uint8Array | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
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
      async createTask(task) {
        const page = pageSheet(task.page);
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
          dueDate: task.dueDate ?? undefined,
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
          ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
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
          if (!file.type.startsWith('image/')) continue;
          const { uploadUrl, uploadClaimId } = await generateAttachmentUploadUrl({
            projectId: project._id,
          });
          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!response.ok) throw new Error('A photo could not be uploaded. Please try again.');
          const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
          await completeAttachmentUpload({
            taskId: taskId as Id<'tasks'>,
            kind: 'photo',
            uploadClaimId,
            storageRef: storageId,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
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
    completeAttachmentUpload,
    createNote,
    createTask,
    generateAttachmentUploadUrl,
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
        dueDate: task.dueDate ?? null,
        notes: [],
        photos: [],
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
  }, [document]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app font-sans text-t1">
      <AppHeader onLogoClick={onBackToProject} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar onShowPlans={onBackToProject} />
        <div className="w-14 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Toolbar
            hasDoc={document !== null}
            allowLocalFiles={false}
            savingPdf={savingPdf}
            onOpenPdf={() => undefined}
            onImportJson={() => undefined}
            onSavePdf={() => void saveMarkedUpPdf()}
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
            {document && <RightDrawer />}
          </div>
          <StatusBar hasDoc={document !== null} />
        </div>
      </div>
      <Lightbox />
    </div>
  );
}
