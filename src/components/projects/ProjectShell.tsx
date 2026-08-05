import { useEffect } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';
import { Brand } from '../Brand';
import { useNotify } from '../ui/use-notify';
import { HeaderAccountControls, type InvitationNotification } from './HeaderAccountControls';

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
  const { notify } = useNotify();

  useEffect(() => {
    const notice = window.sessionStorage.getItem('fp:auth-notice');
    if (!notice) return;
    window.sessionStorage.removeItem('fp:auth-notice');
    const message =
      notice === 'Email verified. You are signed in.' ||
      notice === 'Email verified. Your account is ready.' ||
      notice === 'Password updated. You are signed in.'
        ? notice
        : null;
    if (!message) return;
    notify({
      tone: 'success',
      message,
    });
  }, [notify]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-t1">
      <header className="relative z-60 flex h-16 shrink-0 items-center border-b border-line-strong bg-surface px-5 sm:px-7">
        <a href="#/" className="inline-flex" aria-label="Go to the FieldPilot landing page">
          <Brand size="md" />
        </a>

        <button
          type="button"
          className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 cursor-pointer items-center border-b-[3px] border-accent px-5 text-sm font-semibold text-t1 transition-colors hover:bg-accent-soft/45"
          onClick={onShowProjects}
        >
          Projects
        </button>

        <div className="ml-auto">
          <HeaderAccountControls
            user={user}
            invitations={invitations}
            onAcceptInvitation={onAcceptInvitation}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
