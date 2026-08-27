import { createTool, type ToolCtx } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { DataModel, Id } from '../../_generated/dataModel';

export type FieldPilotToolCtx = ToolCtx<DataModel> & {
  projectId: Id<'projects'>;
  actorId: Id<'users'>;
  bindingId: Id<'agentThreadBindings'>;
  today: string;
};

type ReadTool<Input> = ReturnType<typeof createTool<Input, unknown, FieldPilotToolCtx>>;
type EmptyInput = Record<string, never>;
type SearchTasksInput = {
  text?: string;
  status?: 'open' | 'in-progress' | 'done' | 'verified';
  priority?: 1 | 2 | 3;
  assignee?: string;
  sheetNumber?: string;
  dueBefore?: string;
  dueAfter?: string;
  overdueOnly?: boolean;
  limit?: number;
};

export const projectSummaryTool: ReadTool<EmptyInput> = createTool({
  description:
    'Get the current project overview: task totals, status and priority breakdowns, overdue and unassigned counts, sheets, members, and the caller role.',
  inputSchema: z.object({}),
  execute: async (ctx: FieldPilotToolCtx): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.projectSummary, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      today: ctx.today,
    }),
});

export const searchTasksTool: ReadTool<SearchTasksInput> = createTool({
  description:
    'Search tasks in the current project. Use the numeric taskNumber returned here with get_task_details. Priority 1 is high, 2 medium, and 3 low.',
  inputSchema: z.object({
    text: z
      .string()
      .optional()
      .describe(
        'Text found in task number, title, description, category, location, assignee, or tags.',
      ),
    status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    assignee: z.string().optional().describe('Partial assignee display name.'),
    sheetNumber: z.string().optional().describe('Partial plan or sheet number, such as A-201.'),
    dueBefore: z.string().optional().describe('Inclusive YYYY-MM-DD upper due-date bound.'),
    dueAfter: z.string().optional().describe('Inclusive YYYY-MM-DD lower due-date bound.'),
    overdueOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async (ctx: FieldPilotToolCtx, input: SearchTasksInput): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.searchTasks, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      today: ctx.today,
      ...input,
    }),
});

export const taskDetailsTool: ReadTool<{ taskNumber: number }> = createTool({
  description:
    'Get one task by its project task number, including plan, notes, quantities, custom attributes, recent activity, and attachment metadata.',
  inputSchema: z.object({
    taskNumber: z.number().int().positive().describe('The project-visible task number.'),
  }),
  execute: async (ctx: FieldPilotToolCtx, input: { taskNumber: number }): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.taskDetails, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      taskNumber: input.taskNumber,
    }),
});

export const quantityReportTool: ReadTool<EmptyInput> = createTool({
  description:
    'Get planned, completed, and remaining quantities for this project, grouped by quantity item and unit, plus task-level lines.',
  inputSchema: z.object({}),
  execute: async (ctx: FieldPilotToolCtx): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.quantityReport, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
    }),
});

export const listSheetsTool: ReadTool<EmptyInput> = createTool({
  description:
    'List plans and sheets in the current project with number, name, page, version, and calibration state.',
  inputSchema: z.object({}),
  execute: async (ctx: FieldPilotToolCtx): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.listSheets, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
    }),
});

export const listMembersTool: ReadTool<EmptyInput> = createTool({
  description: 'List the current project members by display name and project role.',
  inputSchema: z.object({}),
  execute: async (ctx: FieldPilotToolCtx): Promise<unknown> =>
    await ctx.runQuery(internal.agentData.listMembers, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
    }),
});

export const fieldPilotReadTools = {
  get_project_overview: projectSummaryTool,
  search_tasks: searchTasksTool,
  get_task_details: taskDetailsTool,
  get_quantity_report: quantityReportTool,
  list_sheets: listSheetsTool,
  list_project_members: listMembersTool,
};
