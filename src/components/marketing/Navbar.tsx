import type { CSSProperties } from 'react';
import { Brand } from '../Brand';

/**
 * Landing page top navigation. Section links are placeholders until the
 * marketing pages exist — only "Sign in" navigates.
 */
export function Navbar() {
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

        <a
          href="#/login"
          className="mkt-rise inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-on-accent shadow-e1 transition-[background,box-shadow,transform] hover:bg-accent-hover hover:shadow-e2 active:translate-y-px"
          style={{ '--rise-delay': '240ms' } as CSSProperties}
        >
          Sign in
        </a>
      </div>
    </header>
  );
}
