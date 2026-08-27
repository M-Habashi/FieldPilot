import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { FieldPilotToolCtx } from './reads';

type WriteTool<Input> = ReturnType<typeof createTool<Input, unknown, FieldPilotToolCtx>>;

type UpdateTaskInput = {
  taskNumber: number;
  status?: 'open' | 'in-progress' | 'done' | 'verified';
  priority?: 1 | 2 | 3;
  dueDate?: string | null;
  assigneeName?: string | null;
};

export const updateTaskTool: WriteTool<UpdateTaskInput> = createTool({
  description:
    'Update one existing task in the current project by task number. Every call requires user approval. Use null dueDate to clear the due date and null assigneeName to unassign.',
  inputSchema: z.object({
    taskNumber: z.number().int().positive(),
    status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    dueDate: z.string().nullable().optional().describe('YYYY-MM-DD, or null to clear.'),
    assigneeName: z
      .string()
      .nullable()
      .optional()
      .describe('Exact project-member name or email, or null to unassign.'),
  }),
  needsApproval: true,
  execute: async (ctx: FieldPilotToolCtx, input: UpdateTaskInput, options): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.updateTask, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      toolCallId: options.toolCallId,
      ...input,
    }),
});

type AddTaskNoteInput = { taskNumber: number; text: string };

export const addTaskNoteTool: WriteTool<AddTaskNoteInput> = createTool({
  description:
    'Add a note to one existing task in the current project. Every call requires user approval.',
  inputSchema: z.object({
    taskNumber: z.number().int().positive(),
    text: z.string().min(1).max(4000),
  }),
  needsApproval: true,
  execute: async (ctx: FieldPilotToolCtx, input: AddTaskNoteInput, options): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.addTaskNote, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      toolCallId: options.toolCallId,
      ...input,
    }),
});

type CreateTaskInput = {
  sheetNumber: string;
  title: string;
  description?: string;
  status?: 'open' | 'in-progress' | 'done' | 'verified';
  priority?: 1 | 2 | 3;
  category?: string;
  assigneeName?: string;
  dueDate?: string;
  locationText?: string;
  tags?: string[];
};

export const createTaskTool: WriteTool<CreateTaskInput> = createTool({
  description:
    'Prepare a new task for a specific sheet. Every call requires approval. This never creates a task row or guesses coordinates; after approval it asks the user to click the plan, and only that click creates the task.',
  inputSchema: z.object({
    sheetNumber: z.string().min(1).describe('Exact sheet number returned by list_sheets.'),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    category: z.string().max(80).optional(),
    assigneeName: z.string().optional().describe('Exact project-member name or email.'),
    dueDate: z.string().optional().describe('YYYY-MM-DD.'),
    locationText: z.string().max(120).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
  }),
  needsApproval: true,
  execute: async (ctx: FieldPilotToolCtx, input: CreateTaskInput, options): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.prepareTaskPlacement, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      toolCallId: options.toolCallId,
      ...input,
    }),
});

export const fieldPilotWriteTools = {
  update_task: updateTaskTool,
  add_task_note: addTaskNoteTool,
  create_task: createTaskTool,
};
