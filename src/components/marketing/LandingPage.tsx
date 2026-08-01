import type { CSSProperties } from 'react';
import { Navbar } from './Navbar';
import { HeroMockup } from './HeroMockup';

const CTA_PRIMARY =
  'inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-on-accent shadow-e1 transition-[background,transform] hover:bg-accent-hover active:scale-[0.97]';
const CTA_SECONDARY =
  'inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-surface px-6 text-sm font-semibold text-t1 shadow-e1 transition-[background,transform] hover:bg-surface2 active:scale-[0.97]';

function Polaroid({
  src,
  caption,
  tilt,
  tapeTilt,
  alt,
}: {
  src: string;
  caption: string;
  tilt: string;
  tapeTilt: string;
  alt: string;
}) {
  return (
    <figure
      className="mkt-polaroid relative w-36 shrink-0 rounded-sm border border-line bg-surface p-2 pb-1 shadow-e2 transition-transform hover:z-10 sm:w-44 lg:w-36"
      style={{ '--tilt': tilt } as CSSProperties}
    >
      <span className="mkt-tape" style={{ '--tape-tilt': tapeTilt } as CSSProperties} />
      <img src={src} alt={alt} className="aspect-[4/3] w-full rounded-xs object-cover" />
      <figcaption className="py-1.5 text-center font-mono text-[11px] text-t2">
        {caption}
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  return (
    <div className="h-full overflow-x-hidden overflow-y-auto bg-app font-sans text-t1 lg:overflow-hidden">
      <div className="relative flex min-h-full flex-col lg:h-full lg:min-h-0">
        {/* Faint drafting grid drifting behind everything. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="mkt-grid-drift absolute -inset-24 fp-canvas-stage"
            style={{ backgroundColor: 'transparent' }}
          />
        </div>

        <Navbar />

        <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 lg:px-10">
          <div className="grid min-h-0 flex-1 items-center gap-12 pt-10 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:pt-4">
            {/* Copy */}
            <div>
              <span
                className="mkt-rise inline-block rounded-xs border border-accent/40 bg-accent-soft px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-accent"
                style={{ '--rise-delay': '60ms' } as CSSProperties}
              >
                BUILT FOR THE CREW
              </span>
              <h1
                className="mkt-rise mt-5 font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl"
                style={{ '--rise-delay': '140ms' } as CSSProperties}
              >
                Plans move.
                <br />
                Work follows.
              </h1>
              <p
                className="mkt-rise mt-5 max-w-md text-base leading-relaxed text-t2 sm:text-lg"
                style={{ '--rise-delay': '220ms' } as CSSProperties}
              >
                Turn every drawing into a live, shared record of what needs attention—and
                what&rsquo;s already done.
              </p>
              <div
                className="mkt-rise mt-8 flex flex-wrap gap-3"
                style={{ '--rise-delay': '300ms' } as CSSProperties}
              >
                <a href="#/signup" className={CTA_PRIMARY}>
                  Start a project
                </a>
                <a
                  href="#/login"
                  className={CTA_SECONDARY}
                  title="Sign in to explore the demo workspace"
                >
                  Explore the demo
                </a>
              </div>
            </div>

            {/* App mockup */}
            <HeroMockup />
          </div>

          {/* Field notes strip: polaroids + sheet stamp above the torn plan */}
          <div className="relative z-10 mt-6 flex items-end justify-between gap-6 pb-24 sm:pb-28 lg:mt-0 lg:pb-0">
            <div className="flex items-end gap-4 sm:gap-6">
              <Polaroid
                src="/images/landing/jobsite-rebar.png"
                alt="Rebar and formwork on the level 2 deck"
                caption="5/14 — Level 2"
                tilt="-4deg"
                tapeTilt="-3deg"
              />
              <Polaroid
                src="/images/landing/framing-corridor.png"
                alt="Wood framing along the grid B2 corridor"
                caption="Grid B2"
                tilt="3deg"
                tapeTilt="2deg"
              />
            </div>
            <div
              className="mkt-rise hidden shrink-0 rounded-xs border border-accent/40 bg-surface/85 px-4 py-3 shadow-e1 backdrop-blur-sm md:block"
              style={{ '--rise-delay': '520ms' } as CSSProperties}
            >
              <p className="font-mono text-lg font-bold tracking-wide text-accent">A-204</p>
              <p className="mt-0.5 font-mono text-[10px] tracking-wide text-t2">
                SECOND FLOOR PLAN
              </p>
              <p className="font-mono text-[10px] tracking-wide text-t3">
                SCALE: 1/8&Prime; = 1&prime;-0&Prime;
              </p>
            </div>
          </div>
        </main>

        {/* Torn plan sheet along the bottom edge. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0" aria-hidden>
          <div className="relative">
            <img
              src="/images/landing/torn-blueprint.png"
              alt=""
              className="h-36 w-full object-cover object-bottom sm:h-44"
            />
            {/* Blend the image's white upper area into the page background. */}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-app to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
