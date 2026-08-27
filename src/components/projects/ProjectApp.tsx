import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { createChatThreadId, patchAppView, readAppView } from '../../lib/app-view';
import type { PhotoUploadDiagnosticEvent } from '../../lib/photo-upload-diagnostics';
import { useBackGuard } from '../../hooks/useBackGuard';
import { useOfflinePhotoQueueCoordinator } from '../../hooks/useOfflinePhotoQueue';
import { ProjectListPage } from './ProjectListPage';
import { ProjectPlanWorkspace } from './ProjectPlanWorkspace';
import { ProjectPlansPage } from './ProjectPlansPage';
import { ProjectShell } from './ProjectShell';

export function ProjectApp() {
  const user = useQuery(api.users.current);
  const projects = useQuery(api.projects.listMine);
  const invitations = useQuery(api.invitations.listMine);
  const acceptInvitation = useMutation(api.invitations.accept);
  const recordUploadDiagnostic = useMutation(api.photoUploadDiagnostics.record);
  const authToken = useAuthToken();
  const [initialView] = useState(readAppView);
  const [activeProjectId, setActiveProjectId] = useState<Id<'projects'> | null>(
    (initialView.projectId as Id<'projects'> | null) ?? null,
  );
  const [activeSheetId, setActiveSheetId] = useState<Id<'sheets'> | null>(
    (initialView.sheetId as Id<'sheets'> | null) ?? null,
  );
  const [chatThreadId, setChatThreadId] = useState(
    () => initialView.chatThreadId ?? createChatThreadId(),
  );
  const [pendingTaskId, setPendingTaskId] = useState<Id<'tasks'> | null>(null);

  const reportUploadDiagnostic = useCallback(
    async (projectId: Id<'projects'>, event: PhotoUploadDiagnosticEvent) => {
      await recordUploadDiagnostic({ projectId, ...event });
    },
    [recordUploadDiagnostic],
  );
  useOfflinePhotoQueueCoordinator({
    userId: user?._id ?? null,
    authToken,
    reportDiagnostic: reportUploadDiagnostic,
  });

  useEffect(() => {
    patchAppView({
      projectId: activeProjectId,
      sheetId: activeSheetId,
      chatThreadId: activeProjectId === null ? null : chatThreadId,
    });
  }, [activeProjectId, activeSheetId, chatThreadId]);

  // The phone's back gesture climbs the app's own hierarchy — sheet, then
  // project, then the list — instead of leaving for the landing page. Panes
  // inside the workspace register their own guards and unwind first.
  useBackGuard(activeProjectId !== null || activeSheetId !== null, () => {
    if (activeSheetId !== null) {
      setActiveSheetId(null);
      return;
    }
    setActiveProjectId(null);
  });

  const activeRow = useMemo(
    () =>
      activeProjectId === null
        ? null
        : (projects?.find((row) => row.project?._id === activeProjectId) ?? null),
    [activeProjectId, projects],
  );

  // Drop the open project only once it is genuinely gone. `listMine` can come
  // back briefly empty while the auth token is refreshing, and treating that
  // as "the project no longer exists" is what kicked the user out to the
  // project list at random moments.
  useEffect(() => {
    if (activeProjectId === null || projects === undefined || projects.length === 0) return;
    if (activeRow !== null) return;
    setActiveProjectId(null);
    setActiveSheetId(null);
  }, [activeProjectId, activeRow, projects]);

  if (activeRow?.project && activeSheetId) {
    return (
      <ProjectPlanWorkspace
        key={activeSheetId}
        project={activeRow.project}
        role={activeRow.membership.role}
        userId={user?._id ?? 'pending-user'}
        sheetId={activeSheetId}
        chatThreadId={chatThreadId}
        initialTaskId={pendingTaskId}
        onInitialTaskOpened={() => setPendingTaskId(null)}
        onOpenQuantityTask={(sheetId, taskId) => {
          setPendingTaskId(taskId);
          setActiveSheetId(sheetId);
        }}
        onBackToProject={() => setActiveSheetId(null)}
        onNewChatThread={() => setChatThreadId(createChatThreadId())}
      />
    );
  }

  return (
    <ProjectShell
      user={user}
      invitations={invitations}
      onShowProjects={() => {
        setActiveProjectId(null);
        setActiveSheetId(null);
      }}
      onAcceptInvitation={async (invitationId) => {
        await acceptInvitation({ invitationId });
      }}
    >
      {activeRow?.project ? (
        <ProjectPlansPage
          project={activeRow.project}
          role={activeRow.membership.role}
          onBackToProjects={() => {
            setActiveProjectId(null);
            setActiveSheetId(null);
          }}
          onOpenPlan={setActiveSheetId}
        />
      ) : (
        <ProjectListPage
          onOpenProject={(projectId) => {
            setChatThreadId(createChatThreadId());
            setActiveProjectId(projectId);
            setActiveSheetId(null);
          }}
        />
      )}
    </ProjectShell>
  );
}
