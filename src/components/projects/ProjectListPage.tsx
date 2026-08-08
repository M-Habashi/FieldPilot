import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import {
  CalendarDays,
  Crown,
  Ellipsis,
  Folder,
  LogOut,
  MailPlus,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
import { Notice } from '../ui/notice';
import { useNotify } from '../ui/use-notify';
import { CreateProjectDialog, DeleteProjectDialog, InviteDialog } from './ProjectDialogs';

interface ProjectListPageProps {
  onOpenProject: (projectId: Id<'projects'>) => void;
}

interface InlineRename {
  projectId: Id<'projects'>;
  value: string;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

export function ProjectListPage({ onOpenProject }: ProjectListPageProps) {
  const { notify } = useNotify();
  const projects = useQuery(api.projects.listMine);
  const createProject = useMutation(api.projects.create);
  const renameProject = useMutation(api.projects.rename);
  const deleteProject = useMutation(api.projects.remove);
  const leaveProject = useMutation(api.projects.leave);
  const inviteToProject = useMutation(api.invitations.create);

  const [showCreate, setShowCreate] = useState(false);
  const [rename, setRename] = useState<InlineRename | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [inviteProject, setInviteProject] = useState<Doc<'projects'> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc<'projects'> | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<Doc<'projects'> | null>(null);

  async function commitRename(projectId: Id<'projects'>) {
    if (!rename || rename.projectId !== projectId || renameBusy) return;
    const name = rename.value.trim();
    if (!name) {
      setRenameError('Project name is required.');
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameProject({ projectId, name });
      setRename(null);
      notify({
        tone: 'success',
        message: `Project renamed to ${name}.`,
      });
    } catch (error) {
      setRenameError(userFacingError(error, 'Try again.'));
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
        <h1 className="font-display text-4xl font-semibold leading-none tracking-[-0.02em] text-t1">
          Projects
        </h1>
        <Button variant="default" size="md" onClick={() => setShowCreate(true)}>
          <Plus />
          Add project
        </Button>
      </div>

      {renameError && (
        <Notice tone="error" className="mt-5">
          Couldn’t rename project: {renameError}
        </Notice>
      )}

      {projects === undefined ? (
        <div className="grid gap-5 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-lg border border-line bg-surface"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-9 flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 text-center">
          <div className="flex size-12 items-center justify-center text-accent">
            <Folder className="size-6" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-t1">No projects yet</h2>
          <p className="mt-1 max-w-sm text-sm text-t2">Add your first project to get started.</p>
        </div>
      ) : (
        <div className="grid gap-5 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(({ project, membership, memberCount }) => {
            if (!project) return null;
            const canManage = membership.role === 'owner' || membership.role === 'admin';
            const isOwner = membership.role === 'owner';
            const isRenaming = rename?.projectId === project._id;

            return (
              <article
                key={project._id}
                className="fp-project-card group relative flex min-h-44 flex-col rounded-lg border border-line p-6 transition-[border-color,background-color,transform] duration-(--fp-dur-fast) hover:-translate-y-0.5 hover:border-accent"
              >
                <button
                  type="button"
                  className="absolute inset-0 z-0 cursor-pointer rounded-lg"
                  aria-label={`Open ${project.name}`}
                  onClick={() => onOpenProject(project._id)}
                />
                <div className="pointer-events-none relative z-20 flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-start justify-center text-accent">
                    <Folder className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        autoFocus
                        aria-label="Project name"
                        className="pointer-events-auto h-8 w-full rounded-xs border border-accent bg-surface px-2 text-sm font-semibold text-t1 outline-none ring-2 ring-accent/20"
                        value={rename.value}
                        disabled={renameBusy}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setRename({ projectId: project._id, value: event.target.value })
                        }
                        onBlur={() => void commitRename(project._id)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            setRename(null);
                            setRenameError(null);
                          }
                        }}
                      />
                    ) : (
                      <h2 className="truncate font-display text-xl font-semibold leading-none text-t1">
                        {project.name}
                      </h2>
                    )}
                    <p className="mt-1.5 text-xs capitalize text-t2">
                      {membership.role === 'owner' ? 'Project owner' : membership.role}
                    </p>
                  </div>

                  <div
                    className="pointer-events-auto relative z-30 flex items-center gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canManage && (
                      <span className="p-1 text-accent" role="img" aria-label="Project admin">
                        <Crown className="size-4" aria-hidden />
                      </span>
                    )}
                    <Dropdown
                      className="min-w-44"
                      trigger={
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Project actions for ${project.name}`}
                        >
                          <Ellipsis />
                        </Button>
                      }
                    >
                      {(close) => (
                        <>
                          {canManage && (
                            <>
                              <DropdownItem
                                className="rounded-md"
                                onClick={() => {
                                  close();
                                  setRenameError(null);
                                  setRename({ projectId: project._id, value: project.name });
                                }}
                              >
                                <Pencil />
                                Rename
                              </DropdownItem>
                              <DropdownItem
                                className="rounded-md"
                                onClick={() => {
                                  close();
                                  setInviteProject(project);
                                }}
                              >
                                <MailPlus />
                                Invite member
                              </DropdownItem>
                            </>
                          )}
                          {!isOwner && (
                            <DropdownItem
                              className="rounded-md"
                              onClick={() => {
                                close();
                                setLeaveTarget(project);
                              }}
                            >
                              <LogOut />
                              Leave project
                            </DropdownItem>
                          )}
                          {isOwner && (
                            <>
                              <div className="my-1 border-t border-line" />
                              <DropdownItem
                                className="rounded-md text-danger hover:bg-danger-soft hover:text-danger"
                                onClick={() => {
                                  close();
                                  setDeleteTarget(project);
                                }}
                              >
                                <Trash2 />
                                Delete project
                              </DropdownItem>
                            </>
                          )}
                        </>
                      )}
                    </Dropdown>
                  </div>
                </div>

                <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-3 pt-7 text-xs text-t2">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="size-4 text-t3" aria-hidden />
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-1.5"
                    aria-label={`${memberCount} project ${memberCount === 1 ? 'member' : 'members'}`}
                  >
                    <Users className="size-4 text-t3" />
                    <span>{memberCount}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CreateProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async (name) => {
          await createProject({ name });
          notify({
            tone: 'success',
            message: `${name.trim()} was created.`,
          });
        }}
      />
      <InviteDialog
        project={inviteProject}
        onClose={() => setInviteProject(null)}
        onInvite={async (projectId, email) => {
          await inviteToProject({ projectId, email });
          notify({
            tone: 'success',
            message: `Invitation sent to ${email.trim()}.`,
          });
        }}
      />
      <DeleteProjectDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={async (projectId, confirmationName) => {
          await deleteProject({ projectId, confirmationName });
          notify({
            tone: 'success',
            message: 'The project and its data were deleted.',
          });
        }}
      />
      <ConfirmDialog
        open={leaveTarget !== null}
        title={`Leave ${leaveTarget?.name ?? 'project'}?`}
        description="You will lose access to this project's plans and shared information."
        confirmLabel="Leave project"
        danger
        onCancel={() => setLeaveTarget(null)}
        onConfirm={() => {
          if (!leaveTarget) return;
          const projectName = leaveTarget.name;
          void leaveProject({ projectId: leaveTarget._id })
            .then(() => {
              setLeaveTarget(null);
              notify({
                tone: 'success',
                message: `You left ${projectName}.`,
              });
            })
            .catch((error: unknown) => {
              notify({
                tone: 'error',
                message: `Couldn’t leave ${projectName}: ${userFacingError(error, 'Try again.')}`,
              });
            });
        }}
      />
    </main>
  );
}
