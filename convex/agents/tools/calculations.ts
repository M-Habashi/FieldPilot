import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { FieldPilotToolCtx } from './reads';

type InspectCalculationsInput = {
  view: 'overview' | 'item' | 'task' | 'exceptions' | 'catalog';
  item?: string;
  taskNumber?: number;
  planNumber?: string;
  includeArchived?: boolean;
  limit?: number;
};

export const inspectCalculationsTool = createTool<
  InspectCalculationsInput,
  unknown,
  FieldPilotToolCtx
>({
  description:
    'Read the Quantities tab and its source rows. Use overview for exact project totals and groups; item to explain one item and its contributors; task for editable line numbers; exceptions for rows needing attention; catalog for item names, default units, and permissions. Derived totals cannot be edited directly.',
  inputSchema: z.object({
    view: z.enum(['overview', 'item', 'task', 'exceptions', 'catalog']),
    item: z.string().optional().describe('Required for view="item"; item name or partial name.'),
    taskNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Required for view="task"; the visible task number.'),
    planNumber: z.string().optional().describe('Optional plan number/name filter.'),
    includeArchived: z.boolean().optional().describe('For catalog; defaults to false.'),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  execute: async (ctx, input): Promise<unknown> => {
    if (input.view === 'task') {
      if (input.taskNumber === undefined) throw new Error('taskNumber is required for task view');
      return await ctx.runQuery(internal.agentCalculations.task, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        taskNumber: input.taskNumber,
      });
    }
    if (input.view === 'catalog') {
      return await ctx.runQuery(internal.agentCalculations.catalog, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        includeArchived: input.includeArchived ?? false,
      });
    }
    if (input.view === 'item' && !input.item?.trim()) {
      throw new Error('item is required for item view');
    }
    return await ctx.runQuery(internal.agentCalculations.report, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      item: input.view === 'item' ? input.item : undefined,
      planNumber: input.planNumber,
      attentionOnly: input.view === 'exceptions',
      limit: input.limit,
    });
  },
});

const calculationChange = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_task_quantity'),
    taskNumber: z.number().int().positive(),
    lineNumber: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Use the task view line number; use 0 to add a row.'),
    quantityItemName: z
      .string()
      .nullable()
      .optional()
      .describe('Exact active catalog item name, or null to unclassify.'),
    plannedQuantity: z.number().nonnegative().nullable().optional(),
    completedQuantity: z.number().nonnegative().nullable().optional(),
    quantityUnit: z.string().max(24).nullable().optional(),
  }),
  z.object({
    kind: z.literal('remove_task_quantity'),
    taskNumber: z.number().int().positive(),
    lineNumber: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('create_quantity_item'),
    name: z.string().min(1).max(80),
    defaultUnit: z.string().min(1).max(24),
  }),
  z.object({
    kind: z.literal('update_quantity_item'),
    itemName: z.string().min(1).describe('Current exact active item name from catalog.'),
    name: z.string().min(1).max(80).optional(),
    defaultUnit: z.string().min(1).max(24).optional(),
  }),
  z.object({
    kind: z.literal('archive_quantity_item'),
    itemName: z.string().min(1).describe('Exact active item name from catalog.'),
  }),
]);

const changeCalculationDataInput = z.object({
  changes: z.array(calculationChange).min(1).max(25),
});

type ChangeCalculationDataInput = z.infer<typeof changeCalculationDataInput>;

export const changeCalculationDataTool = createTool<
  ChangeCalculationDataInput,
  unknown,
  FieldPilotToolCtx
>({
  description:
    'Change quantity source rows or the quantity-item catalog in one approved batch. Inspect each task for line numbers and inspect the catalog for exact item names first. Use lineNumber 0 to add, remove_task_quantity to remove, and archive_quantity_item instead of deleting catalog history. Every approved call supports atomic Undo.',
  inputSchema: changeCalculationDataInput,
  needsApproval: true,
  execute: async (ctx, input, options): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.changeProjectData, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      jobId: ctx.jobId,
      toolCallId: options.toolCallId,
      changes: input.changes,
    }),
});

export const fieldPilotCalculationTools = {
  inspect_calculations: inspectCalculationsTool,
  change_calculation_data: changeCalculationDataTool,
};
