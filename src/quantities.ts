import type { Status } from './types';

export interface QuantityItemOption {
  id: string;
  name: string;
  defaultUnit: string;
  taskCount: number;
}

export interface TaskQuantityLine {
  lineId?: string;
  legacy: boolean;
  quantityItemId?: string;
  plannedQuantity?: number;
  completedQuantity?: number;
  quantityUnit?: string;
}

export interface TaskQuantityPatch {
  quantityItemId?: string | null;
  plannedQuantity?: number | null;
  completedQuantity?: number | null;
  quantityUnit?: string | null;
}

export interface QuantityReportRow {
  reportLineId: string;
  taskId: string;
  sheetId: string;
  seq: number;
  title: string;
  status: Status;
  category: string;
  assigneeText?: string;
  plannedQuantity?: number;
  completedQuantity?: number;
  quantityUnit?: string;
  quantityItemId?: string;
  itemName?: string;
  itemArchived?: boolean;
  planName: string;
  planNumber: string;
  planPage: number;
  sourceFileRef: string;
}

export interface QuantityGroup {
  key: string;
  itemId?: string;
  itemName: string;
  unit: string;
  planned: number;
  completed: number;
  remaining: number;
  overrun: number;
  percent: number | null;
  missingPlanned: number;
  planCount: number;
  taskCount: number;
  rows: QuantityReportRow[];
}

export function normalizeQuantityUnit(unit: string | undefined) {
  return unit?.trim().replace(/\s+/g, ' ').toUpperCase() || 'NO UNIT';
}

export function quantityRowNeedsAttention(row: QuantityReportRow) {
  const completed = row.completedQuantity ?? 0;
  return (
    !row.quantityItemId ||
    row.itemArchived === true ||
    row.plannedQuantity === undefined ||
    (row.plannedQuantity !== undefined && completed > row.plannedQuantity)
  );
}

export function groupQuantityRows(rows: readonly QuantityReportRow[]): QuantityGroup[] {
  const groups = new Map<string, QuantityGroup>();
  for (const row of rows) {
    const unit = normalizeQuantityUnit(row.quantityUnit);
    const itemKey = row.quantityItemId ?? 'unclassified';
    const key = `${itemKey}:${unit}`;
    const planned = row.plannedQuantity ?? 0;
    const completed = row.completedQuantity ?? 0;
    const difference = row.plannedQuantity === undefined ? 0 : planned - completed;
    const current = groups.get(key) ?? {
      key,
      itemId: row.quantityItemId,
      itemName: row.itemName ?? 'Needs classification',
      unit,
      planned: 0,
      completed: 0,
      remaining: 0,
      overrun: 0,
      percent: null,
      missingPlanned: 0,
      planCount: 0,
      taskCount: 0,
      rows: [],
    };
    current.planned += planned;
    current.completed += completed;
    current.remaining += Math.max(difference, 0);
    current.overrun += Math.max(-difference, 0);
    if (row.plannedQuantity === undefined) current.missingPlanned += 1;
    current.rows.push(row);
    groups.set(key, current);
  }
  for (const group of groups.values()) {
    group.percent = group.planned > 0 ? Math.round((group.completed / group.planned) * 100) : null;
    group.planCount = new Set(group.rows.map((row) => row.sourceFileRef || row.sheetId)).size;
    group.taskCount = new Set(group.rows.map((row) => row.taskId)).size;
  }
  return [...groups.values()].sort((a, b) => {
    if (a.itemId === undefined) return 1;
    if (b.itemId === undefined) return -1;
    return a.itemName.localeCompare(b.itemName) || a.unit.localeCompare(b.unit);
  });
}

export function quantityRowRemaining(row: QuantityReportRow) {
  if (row.plannedQuantity === undefined) return null;
  return Math.max(row.plannedQuantity - (row.completedQuantity ?? 0), 0);
}

export function quantityRowOverrun(row: QuantityReportRow) {
  if (row.plannedQuantity === undefined) return 0;
  return Math.max((row.completedQuantity ?? 0) - row.plannedQuantity, 0);
}
