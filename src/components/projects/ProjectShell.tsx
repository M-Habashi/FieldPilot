import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Bell, Check, ChevronDown, LogOut } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { Brand } from '../Brand';
import { Button } from '../ui/button';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';

interface InvitationNotification {
  invitation: {
    _id: Id<'projectInvitations'>;
    createdAt: number;
  };
  projectName: string | null;
  inviterName: string;
}

interface ProjectShellProps {
  user: { name?: string; email?: string } | null | undefined;
  invitations: InvitationNotification[] | undefined;
  onShowProjects: () => void;
  onAcceptInvitation: (invitationId: Id<'projectInvitations'>) => Promise<void>;
  children: React.ReactNode;
}

export function ProjectShell({
  user,
  invitations,
  onShowProjects,
  onAcceptInvitation,
  children,
}: ProjectShellProps) {
  const { signOut } = useAuthActions();
  const [acceptingId, setAcceptingId] = useState<Id<'projectInvitations'> | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'FieldPilot user';

  async function accept(invitationId: Id<'projectInvitations'>) {
    setAcceptingId(invitationId);
    setAcceptError(null);
    try {
      await onAcceptInvitation(invitationId);
    } catch (error) {
      setAcceptError(userFacingError(error));
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-t1">
      <header className="relative z-60 flex h-15 shrink-0 items-center border-b border-line bg-surface px-5 shadow-e1">
        <button
          type="button"
          className="cursor-pointer"
          aria-label="Go to projects"
          onClick={onShowProjects}
        >
          <Brand size="md" />
        </button>

        <button
          type="button"
          className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 cursor-pointer items-center border-b-2 border-accent px-4 text-sm font-semibold text-t1"
          onClick={onShowProjects}
        >
          Projects
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            className="w-84 max-w-[calc(100vw-2rem)] p-0"
            trigger={
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell />
                {!!invitations?.length && (
                  <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">
                    {invitations.length}
                  </span>
                )}
              </Button>
            }
          >
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-t1">Notifications</p>
            </div>
            <div className="max-h-88 overflow-y-auto p-2">
              {acceptError && (
                <p className="mx-2 mb-2 rounded-md bg-danger-soft px-2.5 py-2 text-xs text-danger">
                  {acceptError}
                </p>
              )}
              {invitations === undefined ? (
                <p className="px-2 py-5 text-center text-xs text-t3">Loading notifications…</p>
              ) : invitations.length === 0 ? (
                <p className="px-2 py-5 text-center text-xs text-t3">No new notifications</p>
              ) : (
                invitations.map(({ invitation, projectName, inviterName }) => (
                  <div key={invitation._id} className="rounded-md px-2 py-2.5 hover:bg-surface2">
                    <p className="text-sm font-medium text-t1">Project invitation</p>
                    <p className="mt-0.5 text-xs leading-5 text-t2">
                      {inviterName} invited you to{' '}
                      <span className="font-semibold">{projectName}</span>.
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      className="mt-2"
                      disabled={acceptingId !== null}
                      onClick={() => void accept(invitation._id)}
                    >
                      <Check />
                      {acceptingId === invitation._id ? 'Accepting…' : 'Accept invitation'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Dropdown>

          <Dropdown
            className="w-64 p-0"
            trigger={
              <Button variant="ghost" size="md" className="max-w-56 gap-2">
                <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
                <ChevronDown className="text-t3" />
              </Button>
            }
          >
            <div className="border-b border-line px-4 py-3.5">
              <p className="truncate text-sm font-semibold text-t1">{displayName}</p>
              {user?.email && <p className="mt-1 truncate text-xs text-t2">{user.email}</p>}
            </div>
            <div className="p-1.5">
              <DropdownItem className="rounded-md py-2" onClick={() => void signOut()}>
                <LogOut />
                Sign out
              </DropdownItem>
            </div>
          </Dropdown>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
