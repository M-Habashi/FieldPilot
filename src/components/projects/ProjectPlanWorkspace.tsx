import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { openPdf, type PDFDocumentProxy } from '../../lib/pdf';
import { setRemoteProjectSync, useProject, type RemoteProjectSync } from '../../store/project';
import type { Priority, Status, Task } from '../../types';
import { Lightbox } from '../Lightbox';
import { RightDrawer } from '../RightDrawer';
import { Sidebar } from '../Sidebar';
import { StatusBar } from '../StatusBar';
import { AppHeader, Toolbar } from '../Toolbar';
import { Viewer } from '../Viewer';

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

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const remoteTasksRef = useRef<Record<string, Task> | null>(null);
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
    };
  }, [
    completeAttachmentUpload,
    createNote,
    createTask,
    generateAttachmentUploadUrl,
    project._id,
    removeAttachment,
    removeTask,
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
    setDocumentError(null);
    void (async () => {
      try {
        const response = await fetch(workspacePdfUrl);
        if (!response.ok) throw new Error('The plan PDF could not be loaded.');
        const opened = await openPdf(await response.arrayBuffer());
        if (!active) return;
        useProject.getState().loadRemoteDocument({
          fileName: workspaceFileName,
          fingerprint: `project:${project._id}:pdf:${workspaceSourceRef}`,
          pageCount: opened.pageCount,
        });
        if (remoteTasksRef.current) {
          useProject.getState().replaceProject(remoteTasksRef.current, nextTaskSeqRef.current);
        }
        setDocument(opened.doc);
      } catch (error) {
        if (active) setDocumentError(userFacingError(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [project._id, workspaceFileName, workspacePdfUrl, workspaceSourceRef]);

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
        if (state.selectedTaskId || state.pinTooltipTaskId) state.selectTask(null);
        if (target.closest('.fp-pin')) target.blur();
        return;
      }
      if (typing || !document) return;
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
            onOpenPdf={() => undefined}
            onImportJson={() => undefined}
          />
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <main className="relative min-w-0 flex-1 overflow-hidden">
              {document ? (
                <Viewer doc={document} />
              ) : (
                <div className="fp-canvas-stage flex h-full items-center justify-center p-6">
                  {documentError ? (
                    <p className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                      {documentError}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-t2">
                      <Loader2 className="size-4 animate-spin text-accent" />
                      Opening plan…
                    </div>
                  )}
                </div>
              )}
              {document && syncError && (
                <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-md bg-danger px-3 py-2 text-xs font-medium text-white shadow-e2">
                  {syncError}
                </div>
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
