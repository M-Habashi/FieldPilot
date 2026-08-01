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
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
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

function IconTooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn('group/tooltip relative inline-flex', className)}
      tabIndex={0}
      aria-label={label}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-t1 px-2 py-1 text-[11px] font-medium text-surface opacity-0 shadow-e2 transition-opacity duration-(--fp-dur-fast) group-hover/tooltip:opacity-100 group-focus-visible/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function ProjectListPage({ onOpenProject }: ProjectListPageProps) {
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
    } catch (error) {
      setRenameError(userFacingError(error));
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-9 sm:px-8 lg:px-10">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-t1">Projects</h1>
        <Button variant="default" size="md" onClick={() => setShowCreate(true)}>
          <Plus />
          Add project
        </Button>
      </div>

      {renameError && (
        <div className="mt-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {renameError}
        </div>
      )}

      {projects === undefined ? (
        <div className="grid gap-4 pt-7 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-lg border border-line bg-surface"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Folder className="size-6" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-t1">No projects yet</h2>
          <p className="mt-1 max-w-sm text-sm text-t2">Add your first project to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 pt-7 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(({ project, membership, memberCount }) => {
            if (!project) return null;
            const canManage = membership.role === 'owner' || membership.role === 'admin';
            const isOwner = membership.role === 'owner';
            const isRenaming = rename?.projectId === project._id;

            return (
              <article
                key={project._id}
                className="group relative flex min-h-40 flex-col rounded-lg border border-line bg-surface p-5 shadow-e1 transition-[border-color,box-shadow,transform] duration-(--fp-dur-fast) hover:-translate-y-0.5 hover:border-line-strong hover:shadow-e2"
              >
                <button
                  type="button"
                  className="absolute inset-0 z-0 cursor-pointer rounded-lg"
                  aria-label={`Open ${project.name}`}
                  onClick={() => onOpenProject(project._id)}
                />
                <div className="pointer-events-none relative z-20 flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <Folder className="size-4.5" />
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
                      <h2 className="truncate font-display text-base font-semibold text-t1">
                        {project.name}
                      </h2>
                    )}
                    <p className="mt-1 text-xs capitalize text-t3">
                      {membership.role === 'owner' ? 'Project owner' : membership.role}
                    </p>
                  </div>

                  <div
                    className="pointer-events-auto relative z-30 flex items-center gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canManage && (
                      <IconTooltip label="Admin" className="p-1 text-accent">
                        <Crown className="size-4" />
                      </IconTooltip>
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
                    <IconTooltip label="Creation date" className="pointer-events-auto p-1 text-t3">
                      <CalendarDays className="size-4" />
                    </IconTooltip>
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
        }}
      />
      <InviteDialog
        project={inviteProject}
        onClose={() => setInviteProject(null)}
        onInvite={async (projectId, email) => {
          await inviteToProject({ projectId, email });
        }}
      />
      <DeleteProjectDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={async (projectId, confirmationName) => {
          await deleteProject({ projectId, confirmationName });
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
          void leaveProject({ projectId: leaveTarget._id }).then(() => setLeaveTarget(null));
        }}
      />
    </main>
  );
}
