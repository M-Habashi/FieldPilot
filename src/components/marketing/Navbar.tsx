import type { CSSProperties } from 'react';

/**
 * Landing page top navigation. Section links are placeholders until the
 * marketing pages exist — only "Log in" navigates.
 */
export function Navbar() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 lg:px-10">
        <a
          href="#/"
          className="font-display text-lg font-bold tracking-tight text-t1 mkt-rise"
          style={{ '--rise-delay': '0ms' } as CSSProperties}
        >
          FieldPilot
        </a>

        {/* Placeholder sections — no target pages yet. */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {['How it works', 'For teams', 'Resources'].map((label, i) => (
            <button
              key={label}
              type="button"
              title="Coming soon"
              className="text-sm font-medium text-t2 transition-colors hover:text-t1 cursor-pointer mkt-rise"
              style={{ '--rise-delay': `${40 + i * 50}ms` } as CSSProperties}
            >
              {label}
            </button>
          ))}
        </nav>

        <a
          href="#/login"
          className="inline-flex h-9 items-center rounded-md border border-line-strong px-4 text-sm font-semibold text-t1 shadow-e1 transition-[background,transform] hover:bg-surface2 active:scale-[0.97] mkt-rise"
          style={{ '--rise-delay': '240ms' } as CSSProperties}
        >
          Log in
        </a>
      </div>
    </header>
  );
}
