import type { CSSProperties } from 'react';
import {
  ChevronDown,
  FileText,
  Layers,
  LayoutGrid,
  MapPin,
  Maximize2,
  Minus,
  MoreVertical,
  MousePointer2,
  PenTool,
  Plus,
  Search,
  Square,
} from 'lucide-react';

const GRID_COLS = ['A', 'B', 'C', 'D'];
const GRID_ROWS = ['1', '2', '3'];

/** Stylized second-floor plan, drawn with the active theme's tokens. */
function PlanSheet() {
  return (
    <svg viewBox="0 0 520 380" className="block h-auto w-full" aria-hidden>
      <rect x="0" y="0" width="520" height="380" className="fill-surface" />

      {/* Grid bubbles */}
      {GRID_COLS.map((c, i) => (
        <g key={c}>
          <circle cx={150 + i * 90} cy="30" r="9" className="fill-surface stroke-line-strong" />
          <text
            x={150 + i * 90}
            y="34"
            textAnchor="middle"
            className="fill-t2 font-mono text-[10px]"
          >
            {c}
          </text>
          <line
            x1={150 + i * 90}
            y1="42"
            x2={150 + i * 90}
            y2="360"
            className="stroke-line"
            strokeDasharray="3 4"
          />
        </g>
      ))}
      {GRID_ROWS.map((r, i) => (
        <g key={r}>
          <circle cx="60" cy={110 + i * 100} r="9" className="fill-surface stroke-line-strong" />
          <text
            x="60"
            y={114 + i * 100}
            textAnchor="middle"
            className="fill-t2 font-mono text-[10px]"
          >
            {r}
          </text>
          <line
            x1="72"
            y1={110 + i * 100}
            x2="500"
            y2={110 + i * 100}
            className="stroke-line"
            strokeDasharray="3 4"
          />
        </g>
      ))}

      {/* Dimension strings */}
      <text x="195" y="52" textAnchor="middle" className="fill-t3 font-mono text-[9px]">
        24&prime;-0&Prime;
      </text>
      <text x="285" y="52" textAnchor="middle" className="fill-t3 font-mono text-[9px]">
        16&prime;-0&Prime;
      </text>
      <text
        x="44"
        y="160"
        textAnchor="middle"
        className="fill-t3 font-mono text-[9px]"
        transform="rotate(-90 44 160)"
      >
        20&prime;-0&Prime;
      </text>
      <text
        x="44"
        y="260"
        textAnchor="middle"
        className="fill-t3 font-mono text-[9px]"
        transform="rotate(-90 44 260)"
      >
        40&prime;-0&Prime;
      </text>

      {/* Exterior walls (double line) */}
      <g className="stroke-accent/60" fill="none" strokeWidth="1.4">
        <rect x="100" y="70" width="360" height="270" />
        <rect x="106" y="76" width="348" height="258" />
      </g>

      {/* Stair core, top left */}
      <g className="stroke-accent/45" fill="none" strokeWidth="1">
        <rect x="116" y="86" width="84" height="94" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={i} x1={124 + i * 11} y1="92" x2={124 + i * 11} y2="174" />
        ))}
        <line x1="120" y1="130" x2="196" y2="130" />
      </g>

      {/* Mech room */}
      <g className="stroke-accent/45" fill="none" strokeWidth="1.2">
        <path d="M226 76 L226 180 L316 180 L316 76" />
        <path d="M226 180 L200 180" />
      </g>
      <text x="271" y="126" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        MECH.
      </text>
      <text x="271" y="140" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        202
      </text>

      {/* Open to below, top right */}
      <text x="396" y="118" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        OPEN TO
      </text>
      <text x="396" y="132" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        201
      </text>
      <line
        x1="340"
        y1="76"
        x2="340"
        y2="180"
        className="stroke-accent/45"
        strokeWidth="1.2"
        strokeDasharray="6 3"
      />
      <line x1="340" y1="180" x2="454" y2="180" className="stroke-accent/45" strokeWidth="1.2" />

      {/* Corridor */}
      <text x="280" y="238" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        CORRIDOR
      </text>
      <text x="280" y="252" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        203
      </text>

      {/* Offices along the bottom */}
      <g className="stroke-accent/45" fill="none" strokeWidth="1.2">
        <line x1="106" y1="270" x2="454" y2="270" />
        <line x1="220" y1="270" x2="220" y2="334" />
        <line x1="340" y1="270" x2="340" y2="334" />
      </g>
      <text x="163" y="298" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        OFFICE
      </text>
      <text x="163" y="312" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        205
      </text>
      <text x="280" y="298" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        OFFICE
      </text>
      <text x="280" y="312" textAnchor="middle" className="fill-t2 font-mono text-[10px]">
        204
      </text>

      {/* Door swings */}
      <g className="stroke-accent/45" fill="none" strokeWidth="1">
        <path d="M226 158 A 22 22 0 0 1 248 180" />
        <path d="M226 270 A 24 24 0 0 1 202 246" />
        <path d="M340 292 A 22 22 0 0 1 362 270" />
        <path d="M120 270 A 26 26 0 0 0 146 244" />
      </g>
    </svg>
  );
}

const TOOL_RAIL = [MousePointer2, MapPin, Square, Layers, PenTool];

const PINS = [
  { n: 1, left: '41%', top: '47%', color: 'var(--fp-danger)', delay: '950ms' },
  { n: 2, left: '55%', top: '26%', color: 'var(--fp-accent)', delay: '1150ms' },
  { n: 3, left: '77%', top: '56%', color: 'var(--fp-ok)', delay: '1350ms' },
];

const TASK_ROWS: Array<[string, React.ReactNode]> = [
  [
    'Priority',
    <span key="p" className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full bg-danger" /> High
    </span>,
  ],
  ['Type', 'Work to be done'],
  ['Assigned to', 'Framing Crew'],
  ['Due date', 'May 23, 2024'],
  ['Location', 'A-204 - Grid B2'],
];

/**
 * A static, decorative recreation of the FieldPilot viewer used on the
 * landing page hero — window chrome, tool rail, plan sheet, dropping pins,
 * and the overlapping task card. Purely presentational.
 */
export function HeroMockup() {
  return (
    <div className="relative mkt-hero-in lg:w-full lg:max-w-[500px] lg:justify-self-end">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e3">
        {/* Window chrome */}
        <div className="flex h-10 items-center gap-3 border-b border-line bg-surface px-3">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-t1">
            A-204_Second_Floor_Plan.pdf
            <ChevronDown className="size-3.5 text-t3" />
          </span>
          <span className="ml-auto flex items-center gap-3 text-t3">
            <Search className="size-3.5" />
            <LayoutGrid className="size-3.5" />
            <MoreVertical className="size-3.5" />
          </span>
        </div>

        {/* Viewer body */}
        <div className="flex">
          <div className="flex w-9 flex-col items-center gap-1 border-r border-line bg-surface py-2">
            {TOOL_RAIL.map((Icon, i) => (
              <span
                key={i}
                className={
                  i === 1
                    ? 'flex size-6 items-center justify-center rounded-xs bg-accent text-on-accent'
                    : 'flex size-6 items-center justify-center text-t3'
                }
              >
                <Icon className="size-3.5" />
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <PlanSheet />
            {PINS.map((pin) => (
              <span
                key={pin.n}
                className="mkt-pin-drop absolute flex size-6 -translate-x-1/2 -translate-y-full rotate-[-45deg] items-center justify-center rounded-[50%_50%_50%_0] border-2 border-t2 font-mono text-[11px] font-bold text-white shadow-e2"
                style={
                  {
                    left: pin.left,
                    top: pin.top,
                    backgroundColor: pin.color,
                    color: pin.color,
                    '--pin-delay': pin.delay,
                  } as CSSProperties
                }
              >
                <span className="rotate-45 text-white">{pin.n}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex h-8 items-center justify-center gap-4 border-t border-line bg-surface text-[11px] text-t2">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-3" /> 1 / 1
          </span>
          <Minus className="size-3" />
          <span className="font-mono">100%</span>
          <Plus className="size-3" />
          <Maximize2 className="size-3" />
        </div>
      </div>

      {/* Overlapping task card */}
      <div className="mkt-card-in absolute -right-3 top-16 z-10 hidden w-[264px] rounded-lg border border-line bg-surface p-4 shadow-e3 sm:block xl:-right-8">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-on-accent">
              1
            </span>
            <p className="text-sm font-semibold text-t1">Frame opening at A-204</p>
          </div>
          <MoreVertical className="size-4 shrink-0 text-t3" />
        </div>

        <span className="mt-3 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-t2">
          Open <ChevronDown className="size-3 text-t3" />
        </span>

        <dl className="mt-3 space-y-1.5 text-xs">
          {TASK_ROWS.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[84px_1fr] gap-2">
              <dt className="text-t3">{label}</dt>
              <dd className="font-medium text-t1">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs leading-relaxed text-t2">
          Install header per detail 5/A-502 and shim per spec.
        </p>

        <p className="mt-3 text-[11px] font-semibold text-t3">2 photos</p>
        <div className="mt-1.5 flex gap-2">
          <img
            src="/images/landing/framing-corridor.png"
            alt="Framing corridor photo attached to the task"
            className="h-14 w-16 rounded-xs border border-line object-cover"
          />
          <img
            src="/images/landing/jobsite-rebar.png"
            alt="Jobsite rebar photo attached to the task"
            className="h-14 w-16 rounded-xs border border-line object-cover"
          />
        </div>
      </div>
    </div>
  );
}
