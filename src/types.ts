export type Priority = 1 | 2 | 3;

export type Status = 'open' | 'in-progress' | 'done' | 'verified';

export interface Note {
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
  dueDate: string | null;
  notes: Note[];
  photos: Photo[];
  createdAt: number;
  updatedAt: number;
}

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
