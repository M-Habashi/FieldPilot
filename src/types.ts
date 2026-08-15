export type Priority = 1 | 2 | 3;

export type Status = 'open' | 'in-progress' | 'done' | 'verified';

interface Note {
  id: string;
  text: string;
  createdAt: number;
}

/** Photo metadata. Remote project photos include their short-lived Convex storage URL. */
export interface Photo {
  id: string;
  name: string;
  createdAt: number;
  url?: string;
}

export interface Task {
  id: string;
  /** 1-based PDF page (sheet) index. */
  page: number;
  /** Normalized 0..1 coordinates relative to the PDF page box. */
  x: number;
  y: number;
  /** Human-friendly sequential number within the project. */
  seq: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  category: string;
  /** Optional for backwards compatibility with projects saved before task colors. */
  color?: string;
  assignee: string;
  assigneeUserId: string | null;
  plannedQuantity: number | null;
  completedQuantity: number | null;
  quantityUnit: string;
  /** Project-wide grouping definition for quantity reporting. */
  quantityItemId?: string | null;
  startDate: string | null;
  dueDate: string | null;
  locationText: string;
  tags: string[];
  manpowerCount: number | null;
  costMinor: number | null;
  currencyCode: string;
  createdByUserId?: string;
  notes: Note[];
  photos: Photo[];
  /** Photo evidence count supplied by remote list queries for queue triage. */
  evidencePhotoCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MarkupPoint {
  /** Normalized 0..1 coordinates relative to the PDF page box. */
  x: number;
  y: number;
}

export type MarkupType =
  | 'text'
  | 'pen'
  | 'highlight'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'cloud'
  | 'callout'
  | 'cloud-plus'
  | 'dimension'
  | 'area'
  | 'radius'
  | 'diameter'
  | 'arc';

export type MarkupTool = 'select' | 'calibrate' | MarkupType;

export type MarkupLineStyle =
  'solid' | 'dashed-1' | 'dashed-2' | 'dashed-3' | 'dashed-4' | 'dashed-5' | 'dashed-6' | 'cloud';

export type MarkupLineEnding =
  'none' | 'open-arrow' | 'closed-arrow' | 'filled-arrow' | 'butt' | 'slash' | 'dot' | 'square';

export type MarkupBoxShape = 'rectangle' | 'rounded' | 'ellipse' | 'none';

/** Editable vector annotation stored in page-normalized coordinates. */
export interface Markup {
  id: string;
  page: number;
  type: MarkupType;
  points: MarkupPoint[];
  text: string;
  /** Optional independent font color; older markups fall back to `stroke`. */
  textColor?: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  /** Optional Bluebeam-style boundary pattern. Older markups are solid. */
  lineStyle?: MarkupLineStyle;
  /** Independent endpoint styles for lines, arrows, and dimensions. */
  startEnding?: MarkupLineEnding;
  endEnding?: MarkupLineEnding;
  /** Fill transparency is independent from the boundary/markup opacity. */
  fillOpacity?: number;
  /** Callout and Cloud+ leader appearance. */
  leaderStroke?: string;
  leaderStrokeWidth?: number;
  leaderOpacity?: number;
  leaderLineStyle?: MarkupLineStyle;
  leaderEnding?: MarkupLineEnding;
  /** Text-box/callout boundary shape and revision-cloud scallop size. */
  boxShape?: MarkupBoxShape;
  cloudRadius?: number;
  fontSize: number;
  fontFamily?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  measurementUnit?: 'calibrated' | 'in' | 'ft' | 'mm' | 'cm' | 'm';
  fractionDenominator?: 1 | 2 | 4 | 8 | 16;
  /** Dimension construction controls, stored in page display points. */
  witnessLines?: boolean;
  extensionOffset?: number;
  extensionLength?: number;
  arrowSize?: number;
  createdAt: number;
  updatedAt: number;
}

/** A page scale expressed as real-world units per PDF point. */
export interface PageCalibration {
  unitsPerPoint: number;
  unit: 'in' | 'ft' | 'mm' | 'cm' | 'm';
  referenceLength: number;
  calibratedAt: number;
}

export const MARKUP_COLORS = [
  '#dc2626',
  '#f59e0b',
  '#facc15',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  '#111827',
  '#ffffff',
] as const;

export const DEFAULT_TASK_COLOR = '#d97706';

export const TASK_COLORS = [
  { label: 'Amber', value: '#d97706' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Cyan', value: '#0891b2' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Slate', value: '#475569' },
] as const;

export interface Category {
  id: string;
  label: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: 'general', label: 'General', color: '#6366f1' },
  { id: 'structural', label: 'Structural', color: '#0ea5e9' },
  { id: 'electrical', label: 'Electrical', color: '#f59e0b' },
  { id: 'plumbing', label: 'Plumbing', color: '#06b6d4' },
  { id: 'hvac', label: 'HVAC', color: '#10b981' },
  { id: 'finishes', label: 'Finishes', color: '#a855f7' },
  { id: 'safety', label: 'Safety', color: '#ef4444' },
  { id: 'punch', label: 'Punch list', color: '#f97316' },
];

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

export const PRIORITIES: Record<Priority, { label: string; short: string; color: string }> = {
  1: { label: 'P1 — Critical', short: 'P1', color: '#dc2626' },
  2: { label: 'P2 — Important', short: 'P2', color: '#d97706' },
  3: { label: 'P3 — Standard', short: 'P3', color: '#2563eb' },
};

export const STATUSES: Record<Status, { label: string; color: string }> = {
  open: { label: 'Open', color: '#64748b' },
  'in-progress': { label: 'In progress', color: '#2563eb' },
  done: { label: 'Done', color: '#16a34a' },
  verified: { label: 'Verified', color: '#0f766e' },
};

export const STATUS_ORDER: Status[] = ['open', 'in-progress', 'done', 'verified'];

export function pinColor(task: Task): string {
  if (task.color) return task.color;
  if (task.status === 'done' || task.status === 'verified') return STATUSES[task.status].color;
  return PRIORITIES[task.priority].color;
}

export function taskQuantityProgress(task: Task) {
  const planned = task.plannedQuantity ?? null;
  const completed = task.completedQuantity ?? 0;
  if (planned === null) {
    return { planned, completed, remaining: null, overrun: 0, percent: null };
  }
  const difference = planned - completed;
  return {
    planned,
    completed,
    remaining: Math.max(difference, 0),
    overrun: Math.max(-difference, 0),
    percent: planned === 0 ? (completed > 0 ? 100 : 0) : Math.round((completed / planned) * 100),
  };
}
