import type { CSSProperties } from 'react';
import { Navbar } from './Navbar';
import { HeroMockup } from './HeroMockup';
import { Button } from '../ui/button';

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
      className="mkt-polaroid relative w-36 shrink-0 rounded-md bg-surface p-2 pb-1 shadow-e2 transition-[transform,box-shadow] hover:z-10 hover:shadow-e3 sm:w-44 lg:w-38"
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

        <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 lg:px-10 lg:pb-8">
          <div className="grid min-h-0 flex-1 items-center gap-12 pt-9 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:pt-2">
            {/* Copy */}
            <div>
              <img
                src="/images/landing/built-for-engineers-stamp.png"
                alt="Built for engineers"
                className="mkt-rise block h-11 w-56 object-cover object-center drop-shadow-sm"
                style={{ '--rise-delay': '60ms' } as CSSProperties}
              />
              <h1
                className="mkt-rise mt-6 max-w-xl text-balance font-display text-6xl font-bold leading-[0.92] tracking-[-0.025em] sm:text-7xl lg:text-[5.25rem] xl:text-8xl"
                style={{ '--rise-delay': '140ms' } as CSSProperties}
              >
                Plans move
                <br />
                Work follows
              </h1>
              <p
                className="mkt-rise mt-6 max-w-lg text-base leading-7 text-t2 sm:text-lg sm:leading-8"
                style={{ '--rise-delay': '220ms' } as CSSProperties}
              >
                Turn every drawing into a live, shared record of what needs attention—and
                what&rsquo;s already done.
              </p>
              <div
                className="mkt-rise mt-8 flex flex-wrap gap-3"
                style={{ '--rise-delay': '300ms' } as CSSProperties}
              >
                <Button
                  variant="default"
                  size="md"
                  className="group h-11 gap-3 px-5 font-sans text-base"
                  onClick={() => {
                    window.location.hash = '/login';
                  }}
                >
                  <span>Bring plans to life</span>
                  <svg
                    aria-hidden="true"
                    width="100%"
                    height="100%"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="mkt-arrow !h-5 !w-5 shrink-0 text-on-accent transition-transform duration-200 group-hover:translate-x-1"
                  >
                    <path
                      d="M4 12H20M20 12L14 6M20 12L14 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </div>
            </div>

            {/* App mockup */}
            <HeroMockup />
          </div>

          {/* Field notes strip: polaroids + sheet stamp above the torn plan */}
          <div className="relative z-10 mt-8 flex items-end justify-between gap-6 pb-24 sm:pb-28 lg:mt-1 lg:pb-0">
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
