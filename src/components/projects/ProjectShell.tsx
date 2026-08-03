import { useEffect, useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Bell, BellDot, Check, Inbox, Loader2, LogOut, MailOpen } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { Brand } from '../Brand';
import { Button } from '../ui/button';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
import { Notice } from '../ui/notice';
import { useNotify } from '../ui/use-notify';

interface InvitationNotification {
  invitation: {
    _id: Id<'projectInvitations'>;
    createdAt: number;
  };
  projectName: string | null;
  inviterName: string;
}

interface ProjectShellProps {
  user: { name?: string; email?: string; image?: string } | null | undefined;
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
  const { notify } = useNotify();
  const [acceptingId, setAcceptingId] = useState<Id<'projectInvitations'> | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'FieldPilot user';

  const handleSignOut = () => {
    window.location.hash = '/';
    void signOut();
  };

  useEffect(() => {
    const notice = window.sessionStorage.getItem('fp:auth-notice');
    if (!notice) return;
    window.sessionStorage.removeItem('fp:auth-notice');
    const isPasswordUpdate = notice.startsWith('Password updated');
    notify({
      tone: 'success',
      message: isPasswordUpdate
        ? 'Password updated. You are signed in.'
        : 'Email verified. Your account is ready.',
    });
  }, [notify]);

  async function accept(invitationId: Id<'projectInvitations'>) {
    setAcceptingId(invitationId);
    setAcceptError(null);
    try {
      await onAcceptInvitation(invitationId);
      notify({
        tone: 'success',
        message: 'Invitation accepted. The project is now in your project list.',
      });
    } catch (error) {
      const message = userFacingError(error, 'We could not accept the invitation. Try again.');
      setAcceptError(message);
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-t1">
      <header className="relative z-60 flex h-16 shrink-0 items-center border-b border-line-strong bg-surface px-5 sm:px-7">
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
          className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 cursor-pointer items-center border-b-[3px] border-accent px-5 text-sm font-semibold text-t1 transition-colors hover:bg-accent-soft/45"
          onClick={onShowProjects}
        >
          Projects
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            className="w-84 max-w-[calc(100vw-2rem)] p-0"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  invitations?.length
                    ? `Notifications, ${invitations.length} pending invitation${invitations.length === 1 ? '' : 's'}`
                    : 'Notifications'
                }
                className="relative"
              >
                {invitations?.length ? <BellDot /> : <Bell />}
                {!!invitations?.length && (
                  <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[9px] font-bold leading-3.5 text-white">
                    {invitations.length}
                  </span>
                )}
              </Button>
            }
          >
            <div className="border-b border-line px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-t1">Notifications</p>
                  <p className="mt-0.5 text-xs text-t3">Project invitations and updates</p>
                </div>
                {!!invitations?.length && (
                  <span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent">
                    {invitations.length} pending
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {acceptError && (
                <Notice
                  tone="error"
                  compact
                  className="mx-2 mb-2"
                  onDismiss={() => setAcceptError(null)}
                >
                  Couldn’t accept invitation: {acceptError}
                </Notice>
              )}
              {invitations === undefined ? (
                <div className="space-y-2 px-2 py-2" aria-label="Loading notifications">
                  {[0, 1].map((item) => (
                    <div key={item} className="rounded-md border border-line bg-surface2/45 p-3">
                      <div className="flex items-start gap-3">
                        <div className="size-8 animate-pulse rounded-md bg-line" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-3 w-32 animate-pulse rounded bg-line" />
                          <div className="h-3 w-full animate-pulse rounded bg-line" />
                          <div className="h-3 w-20 animate-pulse rounded bg-line" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : invitations.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-8 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Inbox className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-t1">You’re all caught up</p>
                  <p className="mt-1 max-w-52 text-xs leading-5 text-t3">
                    New project invitations will show up here.
                  </p>
                </div>
              ) : (
                invitations.map(({ invitation, projectName, inviterName }) => (
                  <div
                    key={invitation._id}
                    className="rounded-md border border-line bg-surface2/45 p-3 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                        <MailOpen className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-t1">Project invitation</p>
                        <p className="mt-0.5 text-xs leading-5 text-t2">
                          {inviterName} invited you to{' '}
                          <span className="font-semibold text-t1">
                            {projectName ?? 'a project'}
                          </span>
                          .
                        </p>
                        <p className="mt-1 text-[11px] text-t3">
                          {formatRelativeTime(invitation.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={acceptingId !== null}
                      onClick={() => void accept(invitation._id)}
                    >
                      {acceptingId === invitation._id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Check />
                      )}
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
              <Button
                variant="ghost"
                size="md"
                className="max-w-56 gap-2"
                aria-label={`Account menu for ${displayName}`}
              >
                <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
                <UserAvatar name={user?.name} email={user?.email} image={user?.image} />
              </Button>
            }
          >
            <div className="border-b border-line px-4 py-3.5">
              <p className="truncate text-sm font-semibold text-t1">{displayName}</p>
              {user?.email && <p className="mt-1 truncate text-xs text-t2">{user.email}</p>}
            </div>
            <div className="p-1.5">
              <DropdownItem className="rounded-md py-2" onClick={handleSignOut}>
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

function UserAvatar({ name, email, image }: { name?: string; email?: string; image?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getUserInitials(name, email);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-accent-soft font-mono text-[10px] font-semibold text-accent"
      aria-hidden="true"
    >
      {image && !imageFailed ? (
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

function getUserInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.split('@')[0]?.trim() || '';
  const words = source
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  if (words.length === 0) return 'FP';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function formatRelativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}
