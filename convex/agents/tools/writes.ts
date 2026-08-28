import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { FieldPilotToolCtx } from './reads';

type WriteTool<Input> = ReturnType<typeof createTool<Input, unknown, FieldPilotToolCtx>>;

const nullableText = z.string().nullable().optional();
const nullableNonnegativeNumber = z.number().nonnegative().nullable().optional();

const projectChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('update_task'),
    taskNumber: z.number().int().positive(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    category: z.string().max(80).nullable().optional(),
    color: z
      .string()
      .nullable()
      .optional()
      .describe('A standard color name from reference_data, #RRGGBB, or null to clear.'),
    startDate: nullableText.describe('YYYY-MM-DD, or null to clear.'),
    dueDate: nullableText.describe('YYYY-MM-DD, or null to clear.'),
    locationText: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).nullable().optional(),
    manpowerCount: z.number().int().nonnegative().nullable().optional(),
    costMinor: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .describe('Cost in minor units: cents for USD, not dollars.'),
    currencyCode: z.string().length(3).nullable().optional(),
    assigneeName: z
      .string()
      .nullable()
      .optional()
      .describe('Exact member name/email from reference_data, or null to unassign.'),
    customAttributes: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
        }),
      )
      .max(30)
      .optional()
      .describe('Use exact attribute and dropdown-option names from reference_data.'),
  }),
  z.object({
    kind: z.literal('set_task_quantity'),
    taskNumber: z.number().int().positive(),
    lineNumber: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Use the task view line number. Use 0 to add a new quantity row.'),
    quantityItemName: nullableText.describe(
      'Exact quantity item name from reference_data, or null to unclassify.',
    ),
    plannedQuantity: nullableNonnegativeNumber,
    completedQuantity: nullableNonnegativeNumber,
    quantityUnit: nullableText,
  }),
  z.object({
    kind: z.literal('add_task_note'),
    taskNumber: z.number().int().positive(),
    text: z.string().min(1).max(4000),
  }),
  z.object({
    kind: z.literal('update_project'),
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(40).nullable().optional(),
  }),
  z.object({
    kind: z.literal('update_sheet'),
    sheetNumber: z.string().min(1).describe('Current exact sheet number from reference_data.'),
    name: z.string().min(1).max(200).optional(),
    number: z.string().min(1).max(120).optional(),
    discipline: z.string().max(120).nullable().optional(),
    version: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('create_quantity_item'),
    name: z.string().min(1).max(80),
    defaultUnit: z.string().min(1).max(24),
  }),
  z.object({
    kind: z.literal('update_quantity_item'),
    itemName: z.string().min(1).describe('Current exact item name from reference_data.'),
    name: z.string().min(1).max(80).optional(),
    defaultUnit: z.string().min(1).max(24).optional(),
  }),
]);

const changeProjectDataInput = z.object({
  changes: z
    .array(projectChangeSchema)
    .min(1)
    .max(25)
    .describe(
      'All independent changes requested by the user. Put related changes in one batch when their targets and values are already known.',
    ),
});

type ChangeProjectDataInput = z.infer<typeof changeProjectDataInput>;

export const changeProjectDataTool: WriteTool<ChangeProjectDataInput> = createTool({
  description:
    'Change existing project data in one approved batch. Use update_task for title, description, status, priority, category, pin color, dates, location, tags, manpower, cost, currency, assignee, and custom attributes; set_task_quantity for quantity rows; add_task_note for new notes; update_project/update_sheet for admin metadata; and create_quantity_item/update_quantity_item for the quantity catalog. Before calling, inspect every target and use reference_data for exact names and allowed values. Include all already-known related edits in one changes array. Every approved call is grouped with any other write calls from the same user request and Undo reverses the whole AI job atomically.',
  inputSchema: changeProjectDataInput,
  needsApproval: true,
  execute: async (
    ctx: FieldPilotToolCtx,
    input: ChangeProjectDataInput,
    options,
  ): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.changeProjectData, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      jobId: ctx.jobId,
      toolCallId: options.toolCallId,
      changes: input.changes,
    }),
});

const prepareTaskInput = z.object({
  sheetNumber: z.string().min(1).describe('Exact sheet number from reference_data.'),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  status: z.enum(['open', 'in-progress', 'done', 'verified']).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  category: z.string().max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  assigneeName: z.string().optional().describe('Exact member name/email from reference_data.'),
  startDate: z.string().optional().describe('YYYY-MM-DD.'),
  dueDate: z.string().optional().describe('YYYY-MM-DD.'),
  locationText: z.string().max(120).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  manpowerCount: z.number().int().nonnegative().optional(),
  costMinor: z.number().int().nonnegative().optional().describe('Cost in minor currency units.'),
  currencyCode: z.string().length(3).optional(),
  plannedQuantity: z.number().nonnegative().optional(),
  completedQuantity: z.number().nonnegative().optional(),
  quantityUnit: z.string().max(24).optional(),
  quantityItemName: z.string().optional().describe('Exact item name from reference_data.'),
});

type PrepareTaskInput = z.infer<typeof prepareTaskInput>;

export const prepareTaskTool: WriteTool<PrepareTaskInput> = createTool({
  description:
    'Prepare one brand-new task only when the user asks to create it. First inspect reference_data for the exact sheet and any member or quantity item. This tool never guesses plan coordinates and does not immediately create a database task: after approval, the user must click the requested sheet to place the pin. Use change_project_data instead for every edit to an existing task.',
  inputSchema: prepareTaskInput,
  needsApproval: true,
  execute: async (ctx: FieldPilotToolCtx, input: PrepareTaskInput, options): Promise<unknown> =>
    await ctx.runMutation(internal.agentOperations.prepareTaskPlacement, {
      projectId: ctx.projectId,
      userId: ctx.actorId,
      bindingId: ctx.bindingId,
      jobId: ctx.jobId,
      toolCallId: options.toolCallId,
      ...input,
    }),
});

export const fieldPilotWriteTools = {
  change_project_data: changeProjectDataTool,
  prepare_new_task: prepareTaskTool,
};
