import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ProjectListPage } from './ProjectListPage';
import { ProjectPlanWorkspace } from './ProjectPlanWorkspace';
import { ProjectPlansPage } from './ProjectPlansPage';
import { ProjectShell } from './ProjectShell';

export function ProjectApp() {
  const user = useQuery(api.users.current);
  const projects = useQuery(api.projects.listMine);
  const invitations = useQuery(api.invitations.listMine);
  const acceptInvitation = useMutation(api.invitations.accept);
  const [activeProjectId, setActiveProjectId] = useState<Id<'projects'> | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<Id<'sheets'> | null>(null);

  const activeRow = useMemo(
    () =>
      activeProjectId === null
        ? null
        : (projects?.find((row) => row.project?._id === activeProjectId) ?? null),
    [activeProjectId, projects],
  );

  useEffect(() => {
    if (activeProjectId !== null && projects !== undefined && activeRow === null) {
      setActiveProjectId(null);
      setActiveSheetId(null);
    }
  }, [activeProjectId, activeRow, projects]);

  if (activeRow?.project && activeSheetId) {
    return (
      <ProjectPlanWorkspace
        key={activeSheetId}
        project={activeRow.project}
        role={activeRow.membership.role}
        userId={user?._id ?? 'pending-user'}
        sheetId={activeSheetId}
        onBackToProject={() => setActiveSheetId(null)}
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
            setActiveProjectId(projectId);
            setActiveSheetId(null);
          }}
        />
      )}
    </ProjectShell>
  );
}
