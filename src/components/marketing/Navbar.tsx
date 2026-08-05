import type { CSSProperties } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Brand } from '../Brand';
import { HeaderAccountControls } from '../projects/HeaderAccountControls';

/**
 * Landing page top navigation. Signed-in visitors keep their normal account
 * and notification controls without losing access to the public landing page.
 */
export function Navbar({ authenticated = false }: { authenticated?: boolean }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
        <a
          href="#/"
          className="inline-flex mkt-rise"
          style={{ '--rise-delay': '0ms' } as CSSProperties}
        >
          <Brand size="lg" className="font-extrabold" />
        </a>

        <p
          className="mkt-rise hidden text-sm font-medium tracking-wide text-t2 md:block"
          style={{ '--rise-delay': '80ms' } as CSSProperties}
        >
          Plans. Pins. Field progress.
        </p>

        <div className="mkt-rise" style={{ '--rise-delay': '240ms' } as CSSProperties}>
          {authenticated ? (
            <AuthenticatedNavbarActions />
          ) : (
            <a
              href="#/login"
              className="inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-on-accent shadow-e1 transition-[background,box-shadow,transform] hover:bg-accent-hover hover:shadow-e2 active:translate-y-px"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function AuthenticatedNavbarActions() {
  const user = useQuery(api.users.current);
  const invitations = useQuery(api.invitations.listMine);
  const acceptInvitation = useMutation(api.invitations.accept);

  return (
    <HeaderAccountControls
      user={user}
      invitations={invitations}
      onAcceptInvitation={async (invitationId) => {
        await acceptInvitation({ invitationId });
      }}
    />
  );
}
