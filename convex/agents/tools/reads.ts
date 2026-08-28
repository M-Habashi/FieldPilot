import { createTool, type ToolCtx } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { DataModel, Id } from '../../_generated/dataModel';

export type FieldPilotToolCtx = ToolCtx<DataModel> & {
  projectId: Id<'projects'>;
  actorId: Id<'users'>;
  bindingId: Id<'agentThreadBindings'>;
  jobId: string;
  today: string;
};

type InspectProjectInput = {
  view: 'overview' | 'tasks' | 'task' | 'quantities' | 'reference_data';
  taskNumber?: number;
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

export const inspectProjectTool = createTool<InspectProjectInput, unknown, FieldPilotToolCtx>({
  description:
    'Read current project data. Choose exactly one view: overview for counts and health; tasks to find/filter task numbers and ground simple bulk status or priority edits; task for one complete task before detailed edits; quantities for the quantity report; reference_data for exact member, sheet, quantity-item, custom-attribute, category, color, project, and permission values. This is the only project read tool. Use it repeatedly when one view does not contain enough information, and never guess identifiers or current values.',
  inputSchema: z.object({
    view: z.enum(['overview', 'tasks', 'task', 'quantities', 'reference_data']),
    taskNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Required only for view="task". Use the project-visible task number.'),
    text: z
      .string()
      .optional()
      .describe('For view="tasks": text in task number, title, description, or metadata.'),
    status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    assignee: z.string().optional().describe('For view="tasks": partial assignee name.'),
    sheetNumber: z.string().optional().describe('For view="tasks": partial sheet number.'),
    dueBefore: z.string().optional().describe('Inclusive YYYY-MM-DD upper due-date bound.'),
    dueAfter: z.string().optional().describe('Inclusive YYYY-MM-DD lower due-date bound.'),
    overdueOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async (ctx: FieldPilotToolCtx, input: InspectProjectInput): Promise<unknown> => {
    if (input.view === 'overview') {
      return await ctx.runQuery(internal.agentData.projectSummary, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        today: ctx.today,
      });
    }
    if (input.view === 'tasks') {
      return await ctx.runQuery(internal.agentData.searchTasks, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        today: ctx.today,
        text: input.text,
        status: input.status,
        priority: input.priority,
        assignee: input.assignee,
        sheetNumber: input.sheetNumber,
        dueBefore: input.dueBefore,
        dueAfter: input.dueAfter,
        overdueOnly: input.overdueOnly,
        limit: input.limit,
      });
    }
    if (input.view === 'task') {
      if (input.taskNumber === undefined) {
        throw new Error('taskNumber is required for the task view');
      }
      return await ctx.runQuery(internal.agentData.taskDetails, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        taskNumber: input.taskNumber,
      });
    }
    if (input.view === 'quantities') {
      return await ctx.runQuery(internal.agentData.quantityReport, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
      });
    }
    return await ctx.runQuery(internal.agentData.referenceData, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
    });
  },
});

export const fieldPilotReadTools = {
  inspect_project_data: inspectProjectTool,
};
