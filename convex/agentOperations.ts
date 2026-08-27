import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { CONTENT_EDITOR_ROLES, requireProjectRole, requireUser } from './lib/authz';
import { createNoteForActor } from './notes';
import { createTaskForActor, updateCoreTaskFieldsForActor, type CoreTaskUpdateArgs } from './tasks';

async function requireAgentBinding(
  ctx: MutationCtx,
  bindingId: Id<'agentThreadBindings'>,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
) {
  const binding = await ctx.db.get(bindingId);
  if (binding === null || binding.projectId !== projectId || binding.userId !== userId) {
    throw new Error('Agent conversation binding is invalid');
  }
  await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, userId);
  return binding;
}

async function existingOperation(
  ctx: MutationCtx,
  bindingId: Id<'agentThreadBindings'>,
  toolCallId: string,
) {
  return await ctx.db
    .query('agentOperations')
    .withIndex('by_binding_tool_call', (q) =>
      q.eq('threadBindingId', bindingId).eq('toolCallId', toolCallId),
    )
    .unique();
}

function operationReceipt(operation: Doc<'agentOperations'>, undoAvailable?: boolean) {
  return {
    operationId: operation._id,
    kind: operation.kind,
    status: operation.status,
    summary: operation.summary,
    undoAvailable:
      undoAvailable ??
      (operation.status === 'executed' &&
        (operation.kind === 'update_task' || operation.kind === 'add_task_note')),
  };
}

async function taskByNumber(ctx: MutationCtx, projectId: Id<'projects'>, taskNumber: number) {
  const task = await ctx.db
    .query('tasks')
    .withIndex('by_project_seq', (q) => q.eq('projectId', projectId).eq('seq', taskNumber))
    .unique();
  if (task === null) throw new Error(`Task #${taskNumber} was not found in this project`);
  return task;
}

async function resolveAssignee(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  suppliedName: string | null | undefined,
) {
  if (suppliedName === undefined) return undefined;
  if (suppliedName === null || !suppliedName.trim()) {
    return { assigneeUserId: null, assigneeText: null } as const;
  }
  const name = suppliedName.trim().toLocaleLowerCase();
  const memberships = await ctx.db
    .query('projectMembers')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect();
  const rows = await Promise.all(
    memberships.map(async (membership) => ({
      membership,
      user: await ctx.db.get(membership.userId),
    })),
  );
  const matches = rows.filter(({ user }) => {
    const displayName = user?.name?.trim().toLocaleLowerCase();
    const email = user?.email?.trim().toLocaleLowerCase();
    return displayName === name || email === name;
  });
  if (matches.length !== 1 || !matches[0].user) {
    throw new Error(
      matches.length > 1
        ? `More than one project member matches "${suppliedName}"`
        : `No project member exactly matches "${suppliedName}"`,
    );
  }
  return {
    assigneeUserId: matches[0].membership.userId,
    assigneeText: matches[0].user.name?.trim() || matches[0].user.email?.trim() || 'Project member',
  } as const;
}

export const updateTask = internalMutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    bindingId: v.id('agentThreadBindings'),
    toolCallId: v.string(),
    taskNumber: v.number(),
    status: v.optional(
      v.union(
        v.literal('open'),
        v.literal('in-progress'),
        v.literal('done'),
        v.literal('verified'),
      ),
    ),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    dueDate: v.optional(v.union(v.string(), v.null())),
    assigneeName: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAgentBinding(ctx, args.bindingId, args.projectId, args.userId);
    const existing = await existingOperation(ctx, args.bindingId, args.toolCallId);
    if (existing) return operationReceipt(existing);
    if (
      args.status === undefined &&
      args.priority === undefined &&
      args.dueDate === undefined &&
      args.assigneeName === undefined
    ) {
      throw new Error('At least one task field must be changed');
    }

    const task = await taskByNumber(ctx, args.projectId, args.taskNumber);
    const assignee = await resolveAssignee(ctx, args.projectId, args.assigneeName);
    const patch: CoreTaskUpdateArgs = { taskId: task._id };
    const undoData: Omit<CoreTaskUpdateArgs, 'taskId'> = {};
    const changedLabels: string[] = [];
    if (args.status !== undefined) {
      patch.status = args.status;
      undoData.status = task.status;
      changedLabels.push('status');
    }
    if (args.priority !== undefined) {
      patch.priority = args.priority;
      undoData.priority = task.priority;
      changedLabels.push('priority');
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate;
      undoData.dueDate = task.dueDate ?? null;
      changedLabels.push('due date');
    }
    if (assignee !== undefined) {
      patch.assigneeUserId = assignee.assigneeUserId;
      patch.assigneeText = assignee.assigneeText;
      undoData.assigneeUserId = task.assigneeUserId ?? null;
      undoData.assigneeText = task.assigneeText ?? null;
      changedLabels.push('assignee');
    }

    const updated = await updateCoreTaskFieldsForActor(ctx, patch, args.userId);
    if (updated === null) throw new Error('Task disappeared during update');
    const summary = `Updated Task #${task.seq}: ${changedLabels.join(', ')}`;
    const now = Date.now();
    const operationId = await ctx.db.insert('agentOperations', {
      projectId: args.projectId,
      userId: args.userId,
      threadBindingId: args.bindingId,
      toolCallId: args.toolCallId,
      kind: 'update_task',
      status: 'executed',
      summary,
      input: { taskNumber: args.taskNumber },
      undoData,
      targetTaskId: task._id,
      targetUpdatedAt: updated.updatedAt,
      createdAt: now,
      updatedAt: now,
    });
    const operation = await ctx.db.get(operationId);
    if (operation === null) throw new Error('Could not save the action receipt');
    return operationReceipt(operation, true);
  },
});

export const addTaskNote = internalMutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    bindingId: v.id('agentThreadBindings'),
    toolCallId: v.string(),
    taskNumber: v.number(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAgentBinding(ctx, args.bindingId, args.projectId, args.userId);
    const existing = await existingOperation(ctx, args.bindingId, args.toolCallId);
    if (existing) return operationReceipt(existing);
    const task = await taskByNumber(ctx, args.projectId, args.taskNumber);
    const noteId = await createNoteForActor(
      ctx,
      { taskId: task._id, text: args.text },
      args.userId,
    );
    const summary = `Added a note to Task #${task.seq}`;
    const now = Date.now();
    const operationId = await ctx.db.insert('agentOperations', {
      projectId: args.projectId,
      userId: args.userId,
      threadBindingId: args.bindingId,
      toolCallId: args.toolCallId,
      kind: 'add_task_note',
      status: 'executed',
      summary,
      input: { taskNumber: args.taskNumber },
      undoData: {},
      targetTaskId: task._id,
      targetNoteId: noteId,
      createdAt: now,
      updatedAt: now,
    });
    const operation = await ctx.db.get(operationId);
    if (operation === null) throw new Error('Could not save the action receipt');
    return operationReceipt(operation, true);
  },
});

export const prepareTaskPlacement = internalMutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    bindingId: v.id('agentThreadBindings'),
    toolCallId: v.string(),
    sheetNumber: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('open'),
        v.literal('in-progress'),
        v.literal('done'),
        v.literal('verified'),
      ),
    ),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    category: v.optional(v.string()),
    assigneeName: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    locationText: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAgentBinding(ctx, args.bindingId, args.projectId, args.userId);
    const existing = await existingOperation(ctx, args.bindingId, args.toolCallId);
    if (existing) {
      return {
        ...operationReceipt(existing, false),
        clientDirective:
          existing.status === 'awaiting-placement'
            ? {
                kind: 'place_task_pin' as const,
                operationId: existing._id,
                page: (existing.input as { page?: number }).page,
                sheetNumber: (existing.input as { sheetNumber?: string }).sheetNumber,
                task: (existing.input as { task?: unknown }).task,
              }
            : undefined,
      };
    }

    const title = args.title.trim();
    if (!title) throw new Error('Task title is required');
    if (title.length > 200) throw new Error('Task title must be 200 characters or fewer');
    if (args.description && args.description.trim().length > 4000) {
      throw new Error('Task description must be 4000 characters or fewer');
    }
    if (args.category && args.category.trim().length > 80) {
      throw new Error('Task category must be 80 characters or fewer');
    }
    if (args.locationText && args.locationText.trim().length > 120) {
      throw new Error('Task location must be 120 characters or fewer');
    }
    if (args.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) {
      throw new Error('Due date must use YYYY-MM-DD format');
    }
    const sheets = await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    const requestedSheet = args.sheetNumber.trim().toLocaleLowerCase();
    const matches = sheets.filter(
      (sheet) => sheet.number.trim().toLocaleLowerCase() === requestedSheet,
    );
    if (matches.length !== 1) {
      throw new Error(
        matches.length > 1
          ? `More than one sheet is numbered "${args.sheetNumber}"`
          : `Sheet "${args.sheetNumber}" was not found`,
      );
    }
    const sheet = matches[0];
    const assignee = await resolveAssignee(ctx, args.projectId, args.assigneeName);
    const task = {
      title,
      description: args.description?.trim() ?? '',
      status: args.status ?? ('open' as const),
      priority: args.priority ?? (2 as const),
      category: args.category?.trim() || 'general',
      ...(assignee ? { assigneeText: assignee.assigneeText } : {}),
      ...(assignee?.assigneeUserId ? { assigneeUserId: assignee.assigneeUserId } : {}),
      ...(args.dueDate ? { dueDate: args.dueDate } : {}),
      ...(args.locationText?.trim() ? { locationText: args.locationText.trim() } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    };
    const summary = `Ready to place "${title}" on ${sheet.number}`;
    const now = Date.now();
    const operationId = await ctx.db.insert('agentOperations', {
      projectId: args.projectId,
      userId: args.userId,
      threadBindingId: args.bindingId,
      toolCallId: args.toolCallId,
      kind: 'create_task',
      status: 'awaiting-placement',
      summary,
      input: { page: sheet.pageIndex + 1, sheetNumber: sheet.number, task },
      targetSheetId: sheet._id,
      createdAt: now,
      updatedAt: now,
    });
    const operation = await ctx.db.get(operationId);
    if (operation === null) throw new Error('Could not save the placement request');
    return {
      ...operationReceipt(operation, false),
      clientDirective: {
        kind: 'place_task_pin' as const,
        operationId,
        page: sheet.pageIndex + 1,
        sheetNumber: sheet.number,
        task,
      },
    };
  },
});

type PlacementInput = {
  task: {
    title: string;
    description: string;
    status: Doc<'tasks'>['status'];
    priority: Doc<'tasks'>['priority'];
    category: string;
    assigneeText?: string;
    assigneeUserId?: Id<'users'>;
    dueDate?: string;
    locationText?: string;
    tags?: string[];
  };
};

export const placeTask = mutation({
  args: {
    operationId: v.id('agentOperations'),
    sheetId: v.id('sheets'),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, { operationId, sheetId, x, y }) => {
    const userId = await requireUser(ctx);
    const operation = await ctx.db.get(operationId);
    if (operation === null || operation.kind !== 'create_task') {
      throw new Error('Task placement request not found');
    }
    if (operation.userId !== userId) throw new Error('This placement belongs to another user');
    await requireProjectRole(ctx, operation.projectId, CONTENT_EDITOR_ROLES, userId);
    if (operation.status === 'executed' && operation.targetTaskId) {
      const task = await ctx.db.get(operation.targetTaskId);
      if (task === null) throw new Error('The placed task no longer exists');
      return { taskId: task._id, taskNumber: task.seq };
    }
    if (operation.status !== 'awaiting-placement') {
      throw new Error('This placement request is no longer active');
    }
    if (operation.targetSheetId !== sheetId) {
      throw new Error('Place this task on the sheet selected in the approval card');
    }
    const input = operation.input as PlacementInput;
    const taskId = await createTaskForActor(
      ctx,
      {
        projectId: operation.projectId,
        sheetId,
        x,
        y,
        ...input.task,
      },
      userId,
    );
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task disappeared during placement');
    await ctx.db.patch(operationId, {
      status: 'executed',
      summary: `Created Task #${task.seq}: ${task.title}`,
      targetTaskId: taskId,
      targetUpdatedAt: task.updatedAt,
      updatedAt: Date.now(),
    });
    return { taskId, taskNumber: task.seq };
  },
});

export const undo = mutation({
  args: { operationId: v.id('agentOperations') },
  handler: async (ctx, { operationId }) => {
    const userId = await requireUser(ctx);
    const operation = await ctx.db.get(operationId);
    if (operation === null) throw new Error('AI action receipt not found');
    if (operation.userId !== userId) throw new Error('This AI action belongs to another user');
    await requireProjectRole(ctx, operation.projectId, CONTENT_EDITOR_ROLES, userId);
    if (operation.status === 'undone') return { undone: true as const };
    if (operation.status !== 'executed') throw new Error('This AI action cannot be undone yet');

    if (operation.kind === 'update_task') {
      if (!operation.targetTaskId) throw new Error('Updated task is missing from the receipt');
      const task = await ctx.db.get(operation.targetTaskId);
      if (task === null) throw new Error('The updated task no longer exists');
      if (task.updatedAt !== operation.targetUpdatedAt) {
        throw new Error(
          'This task changed after the AI action, so Undo would overwrite newer work',
        );
      }
      const undoData = operation.undoData as Omit<CoreTaskUpdateArgs, 'taskId'>;
      await updateCoreTaskFieldsForActor(
        ctx,
        { taskId: operation.targetTaskId, ...undoData },
        userId,
      );
    } else if (operation.kind === 'add_task_note') {
      if (!operation.targetNoteId) throw new Error('Added note is missing from the receipt');
      const note = await ctx.db.get(operation.targetNoteId);
      if (note === null) throw new Error('The added note no longer exists');
      if (note.authorId !== userId || note.editedAt !== undefined) {
        throw new Error('This note changed after the AI action and cannot be undone safely');
      }
      await ctx.db.delete(note._id);
    } else {
      throw new Error('Undo for placed tasks is not available in this release');
    }

    await ctx.db.patch(operationId, {
      status: 'undone',
      summary: `Undid: ${operation.summary}`,
      undoneAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { undone: true as const };
  },
});

export const cancelPlacement = mutation({
  args: { operationId: v.id('agentOperations') },
  handler: async (ctx, { operationId }) => {
    const userId = await requireUser(ctx);
    const operation = await ctx.db.get(operationId);
    if (operation === null || operation.kind !== 'create_task') {
      throw new Error('Task placement request not found');
    }
    if (operation.userId !== userId) throw new Error('This placement belongs to another user');
    await requireProjectRole(ctx, operation.projectId, CONTENT_EDITOR_ROLES, userId);
    if (operation.status !== 'awaiting-placement') return;
    await ctx.db.patch(operationId, {
      status: 'undone',
      summary: `Canceled: ${operation.summary}`,
      undoneAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
