import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const COALESCE_WINDOW_MS = 15_000;

type ActivityKind =
  | 'attribute_changed'
  | 'quantity_added'
  | 'quantity_changed'
  | 'quantity_removed'
  | 'photo_removed';

function cleanValue(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 500) : undefined;
}

function changeSummary(label: string, oldValue: string | undefined, newValue: string | undefined) {
  const lowerLabel = label.toLocaleLowerCase();
  if (oldValue === newValue) return undefined;
  if (oldValue === undefined && newValue !== undefined) return `Set ${lowerLabel} to ${newValue}`;
  if (newValue === undefined) return `Cleared ${lowerLabel}`;
  return `Changed ${lowerLabel} from ${oldValue} to ${newValue}`;
}

export async function recordTaskChange(
  ctx: MutationCtx,
  args: {
    projectId: Id<'projects'>;
    taskId: Id<'tasks'>;
    actorId: Id<'users'>;
    kind?: 'attribute_changed' | 'quantity_changed';
    fieldKey: string;
    fieldLabel: string;
    oldValue?: string | null;
    newValue?: string | null;
  },
) {
  const oldValue = cleanValue(args.oldValue);
  const newValue = cleanValue(args.newValue);
  const summary = changeSummary(args.fieldLabel, oldValue, newValue);
  if (!summary) return;
  const kind = args.kind ?? 'attribute_changed';
  const now = Date.now();
  const latest = await ctx.db
    .query('taskActivityEvents')
    .withIndex('by_task_createdAt', (q) => q.eq('taskId', args.taskId))
    .order('desc')
    .first();
  if (
    latest &&
    latest.actorId === args.actorId &&
    latest.kind === kind &&
    latest.fieldKey === args.fieldKey &&
    now - latest.updatedAt <= COALESCE_WINDOW_MS
  ) {
    const coalescedSummary = changeSummary(args.fieldLabel, latest.oldValue, newValue);
    if (!coalescedSummary) {
      await ctx.db.delete(latest._id);
      return;
    }
    await ctx.db.patch(latest._id, {
      newValue,
      summary: coalescedSummary,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert('taskActivityEvents', {
    projectId: args.projectId,
    taskId: args.taskId,
    actorId: args.actorId,
    kind,
    fieldKey: args.fieldKey,
    fieldLabel: args.fieldLabel,
    oldValue,
    newValue,
    summary,
    createdAt: now,
    updatedAt: now,
  });
}

export async function recordTaskEvent(
  ctx: MutationCtx,
  args: {
    projectId: Id<'projects'>;
    taskId: Id<'tasks'>;
    actorId: Id<'users'>;
    kind: Exclude<ActivityKind, 'attribute_changed' | 'quantity_changed'>;
    summary: string;
  },
) {
  const now = Date.now();
  await ctx.db.insert('taskActivityEvents', {
    ...args,
    summary: args.summary.trim().slice(0, 500),
    createdAt: now,
    updatedAt: now,
  });
}
