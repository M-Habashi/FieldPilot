import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { requireProjectMember } from './lib/authz';
import { buildProjectQuantityReport } from './lib/quantityReport';

const taskStatusArg = v.optional(
  v.union(v.literal('open'), v.literal('in-progress'), v.literal('done'), v.literal('verified')),
);
const taskPriorityArg = v.optional(v.union(v.literal(1), v.literal(2), v.literal(3)));

const AGENT_TASK_CATEGORIES = [
  'general',
  'structural',
  'electrical',
  'plumbing',
  'hvac',
  'finishes',
  'safety',
  'punch',
];

const AGENT_PIN_COLORS = [
  { name: 'Amber', value: '#d97706' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Slate', value: '#475569' },
];

function clip(value: string | undefined, max = 1200) {
  if (!value) return value;
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

export const projectSummary = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    today: v.string(),
  },
  handler: async (ctx, { projectId, userId, today }) => {
    const membership = await requireProjectMember(ctx, projectId, userId);
    const [project, tasks, sheets, members] = await Promise.all([
      ctx.db.get(projectId),
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ]);
    if (project === null) throw new Error('Project not found');

    const byStatus = { open: 0, 'in-progress': 0, done: 0, verified: 0 };
    const byPriority = { high: 0, medium: 0, low: 0 };
    let overdue = 0;
    let unassigned = 0;
    for (const task of tasks) {
      byStatus[task.status] += 1;
      if (task.priority === 1) byPriority.high += 1;
      else if (task.priority === 2) byPriority.medium += 1;
      else byPriority.low += 1;
      if (task.dueDate && task.dueDate < today && !['done', 'verified'].includes(task.status)) {
        overdue += 1;
      }
      if (!task.assigneeUserId && !task.assigneeText) unassigned += 1;
    }

    return {
      project: { name: project.name, code: project.code },
      callerRole: membership.role,
      today,
      sheetCount: sheets.length,
      memberCount: members.length,
      taskCount: tasks.length,
      byStatus,
      byPriority,
      overdue,
      unassigned,
    };
  },
});

export const searchTasks = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    today: v.string(),
    text: v.optional(v.string()),
    status: taskStatusArg,
    priority: taskPriorityArg,
    assignee: v.optional(v.string()),
    sheetNumber: v.optional(v.string()),
    dueBefore: v.optional(v.string()),
    dueAfter: v.optional(v.string()),
    overdueOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectMember(ctx, args.projectId, args.userId);
    const [tasks, sheets] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
    ]);
    const sheetById = new Map(sheets.map((sheet) => [sheet._id, sheet]));
    const text = args.text?.trim().toLocaleLowerCase();
    const assignee = args.assignee?.trim().toLocaleLowerCase();
    const sheetNumber = args.sheetNumber?.trim().toLocaleLowerCase();
    const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 25), 50));

    const matches = tasks
      .filter((task) => {
        const sheet = sheetById.get(task.sheetId);
        if (args.status && task.status !== args.status) return false;
        if (args.priority && task.priority !== args.priority) return false;
        if (args.dueBefore && (!task.dueDate || task.dueDate > args.dueBefore)) return false;
        if (args.dueAfter && (!task.dueDate || task.dueDate < args.dueAfter)) return false;
        if (
          args.overdueOnly &&
          (!task.dueDate ||
            task.dueDate >= args.today ||
            ['done', 'verified'].includes(task.status))
        ) {
          return false;
        }
        if (assignee && !(task.assigneeText ?? '').toLocaleLowerCase().includes(assignee)) {
          return false;
        }
        if (sheetNumber && !(sheet?.number ?? '').toLocaleLowerCase().includes(sheetNumber)) {
          return false;
        }
        if (text) {
          const searchable = [
            String(task.seq),
            task.title,
            task.description,
            task.category,
            task.locationText,
            task.assigneeText,
            ...(task.tags ?? []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase();
          if (!searchable.includes(text)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.seq - b.seq;
      });

    return {
      totalMatches: matches.length,
      truncated: matches.length > limit,
      tasks: matches.slice(0, limit).map((task) => {
        const sheet = sheetById.get(task.sheetId);
        return {
          taskNumber: task.seq,
          title: clip(task.title, 240),
          description: clip(task.description, 400),
          status: task.status,
          priority: task.priority,
          category: task.category,
          assignee: task.assigneeText,
          dueDate: task.dueDate,
          overdue:
            Boolean(task.dueDate && task.dueDate < args.today) &&
            !['done', 'verified'].includes(task.status),
          sheet: sheet
            ? { number: sheet.number, name: sheet.name, page: sheet.pageIndex + 1 }
            : undefined,
        };
      }),
    };
  },
});

export const taskDetails = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    taskNumber: v.number(),
  },
  handler: async (ctx, { projectId, userId, taskNumber }) => {
    await requireProjectMember(ctx, projectId, userId);
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_project_seq', (q) => q.eq('projectId', projectId).eq('seq', taskNumber))
      .unique();
    if (task === null) throw new Error(`Task #${taskNumber} was not found in this project`);

    const [sheet, notes, quantityLines, attributes, definitions, activities, attachments] =
      await Promise.all([
        ctx.db.get(task.sheetId),
        ctx.db
          .query('notes')
          .withIndex('by_task', (q) => q.eq('taskId', task._id))
          .order('desc')
          .take(20),
        ctx.db
          .query('taskQuantities')
          .withIndex('by_task', (q) => q.eq('taskId', task._id))
          .collect(),
        ctx.db
          .query('taskAttributeValues')
          .withIndex('by_task', (q) => q.eq('taskId', task._id))
          .collect(),
        ctx.db
          .query('taskAttributeDefinitions')
          .withIndex('by_project', (q) => q.eq('projectId', projectId))
          .collect(),
        ctx.db
          .query('taskActivityEvents')
          .withIndex('by_task_createdAt', (q) => q.eq('taskId', task._id))
          .order('desc')
          .take(20),
        ctx.db
          .query('attachments')
          .withIndex('by_task', (q) => q.eq('taskId', task._id))
          .collect(),
      ]);
    const authorIds = [...new Set(notes.map((note) => note.authorId))];
    const authors = await Promise.all(authorIds.map((authorId) => ctx.db.get(authorId)));
    const authorById = new Map(authorIds.map((id, index) => [id, authors[index]]));
    const itemIds = [
      ...new Set(
        [...quantityLines.map((line) => line.quantityItemId), task.quantityItemId].filter(
          (id): id is NonNullable<typeof id> => id !== undefined,
        ),
      ),
    ];
    const items = await Promise.all(itemIds.map((itemId) => ctx.db.get(itemId)));
    const itemById = new Map(itemIds.map((id, index) => [id, items[index]]));
    const storedQuantities = [...quantityLines]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((line, index) => ({
        lineNumber: index + 1,
        legacy: false,
        item: line.quantityItemId ? itemById.get(line.quantityItemId)?.name : undefined,
        planned: line.plannedQuantity,
        completed: line.completedQuantity,
        remaining:
          line.plannedQuantity === undefined
            ? undefined
            : line.plannedQuantity - (line.completedQuantity ?? 0),
        unit: line.quantityUnit,
      }));
    const quantities =
      storedQuantities.length > 0
        ? storedQuantities
        : [
            {
              lineNumber: 1,
              legacy: true,
              item: task.quantityItemId ? itemById.get(task.quantityItemId)?.name : undefined,
              planned: task.plannedQuantity,
              completed: task.completedQuantity,
              remaining:
                task.plannedQuantity === undefined
                  ? undefined
                  : task.plannedQuantity - (task.completedQuantity ?? 0),
              unit: task.quantityUnit,
            },
          ].filter(
            (line) =>
              line.item !== undefined ||
              line.planned !== undefined ||
              line.completed !== undefined ||
              line.unit !== undefined,
          );

    return {
      task: {
        taskNumber: task.seq,
        title: clip(task.title, 300),
        description: clip(task.description),
        status: task.status,
        priority: task.priority,
        category: task.category,
        color: task.color,
        assignee: task.assigneeText,
        startDate: task.startDate,
        dueDate: task.dueDate,
        location: task.locationText,
        tags: task.tags,
        manpowerCount: task.manpowerCount,
        costMinor: task.costMinor,
        currencyCode: task.currencyCode,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      sheet: sheet
        ? { number: sheet.number, name: sheet.name, page: sheet.pageIndex + 1 }
        : undefined,
      quantities,
      attributes: definitions
        .filter((definition) => definition.archivedAt === undefined)
        .map((definition) => {
          const attribute = attributes.find(
            (candidate) => candidate.definitionId === definition._id,
          );
          const selectedOption = definition.options?.find(
            (option) => option.id === attribute?.selectOptionId,
          );
          const value = attribute
            ? (attribute.textValue ??
              attribute.numberValue ??
              attribute.dateValue ??
              attribute.booleanValue ??
              selectedOption?.label)
            : undefined;
          return {
            name: definition.name,
            type: definition.type,
            unit: definition.unit,
            value,
            options:
              definition.type === 'select'
                ? definition.options
                    ?.filter((option) => option.active)
                    .map((option) => option.label)
                : undefined,
          };
        }),
      notes: notes.map((note) => ({
        author: authorById.get(note.authorId)?.name ?? 'Project member',
        text: clip(note.text),
        createdAt: note.createdAt,
      })),
      recentActivity: activities.map((activity) => ({
        summary: activity.summary,
        createdAt: activity.createdAt,
      })),
      attachments: attachments
        .filter((attachment) => attachment.deletedAt === undefined)
        .map((attachment) => ({
          kind: attachment.kind,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          createdAt: attachment.createdAt,
          hasMapLocation: attachment.latitude !== undefined && attachment.longitude !== undefined,
        })),
    };
  },
});

export const quantityReport = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  handler: async (ctx, { projectId, userId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const [tasks, sheets, items, quantityLines] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('taskQuantities')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ]);
    const rows = buildProjectQuantityReport({ tasks, sheets, items, quantityLines });
    const groups = new Map<
      string,
      { item: string; unit?: string; planned: number; completed: number; lineCount: number }
    >();
    for (const row of rows) {
      const key = `${row.itemName ?? 'Unclassified'}\u0000${row.quantityUnit ?? ''}`;
      const group = groups.get(key) ?? {
        item: row.itemName ?? 'Unclassified',
        unit: row.quantityUnit,
        planned: 0,
        completed: 0,
        lineCount: 0,
      };
      group.planned += row.plannedQuantity ?? 0;
      group.completed += row.completedQuantity ?? 0;
      group.lineCount += 1;
      groups.set(key, group);
    }
    return {
      lineCount: rows.length,
      groups: [...groups.values()].map((group) => ({
        ...group,
        remaining: group.planned - group.completed,
      })),
      lines: rows.slice(0, 100).map((row) => ({
        taskNumber: row.seq,
        taskTitle: clip(row.title, 240),
        item: row.itemName ?? 'Unclassified',
        planned: row.plannedQuantity,
        completed: row.completedQuantity,
        remaining:
          row.plannedQuantity === undefined
            ? undefined
            : row.plannedQuantity - (row.completedQuantity ?? 0),
        unit: row.quantityUnit,
        status: row.status,
        planNumber: row.planNumber,
      })),
      truncated: rows.length > 100,
    };
  },
});

export const listSheets = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  handler: async (ctx, { projectId, userId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const sheets = await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
    return sheets
      .sort((a, b) => a.pageIndex - b.pageIndex || a.number.localeCompare(b.number))
      .map((sheet) => ({
        number: sheet.number,
        name: sheet.name,
        discipline: sheet.discipline,
        page: sheet.pageIndex + 1,
        version: sheet.version,
        calibrated: sheet.calibration !== undefined,
      }));
  },
});

export const listMembers = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  handler: async (ctx, { projectId, userId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
    const users = await Promise.all(memberships.map((membership) => ctx.db.get(membership.userId)));
    return memberships
      .map((membership, index) => ({
        name: users[index]?.name ?? users[index]?.email ?? 'Project member',
        role: membership.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const referenceData = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  handler: async (ctx, { projectId, userId }) => {
    const membership = await requireProjectMember(ctx, projectId, userId);
    const [project, sheets, memberships, quantityItems, definitions] = await Promise.all([
      ctx.db.get(projectId),
      ctx.db
        .query('sheets')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('quantityItems')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('taskAttributeDefinitions')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ]);
    if (project === null) throw new Error('Project not found');
    const users = await Promise.all(
      memberships.map((projectMembership) => ctx.db.get(projectMembership.userId)),
    );
    return {
      project: { name: project.name, code: project.code, callerRole: membership.role },
      allowedTaskStatuses: ['open', 'in-progress', 'done', 'verified'],
      allowedTaskPriorities: [1, 2, 3],
      standardTaskCategories: AGENT_TASK_CATEGORIES,
      standardPinColors: AGENT_PIN_COLORS,
      sheets: sheets
        .sort((a, b) => a.pageIndex - b.pageIndex || a.number.localeCompare(b.number))
        .map((sheet) => ({
          number: sheet.number,
          name: sheet.name,
          discipline: sheet.discipline,
          page: sheet.pageIndex + 1,
          version: sheet.version,
        })),
      members: memberships
        .map((projectMembership, index) => ({
          name: users[index]?.name,
          email: users[index]?.email,
          role: projectMembership.role,
        }))
        .sort((a, b) => (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '')),
      quantityItems: quantityItems
        .filter((item) => item.archivedAt === undefined)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ name: item.name, defaultUnit: item.defaultUnit })),
      customTaskAttributes: definitions
        .filter((definition) => definition.archivedAt === undefined)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((definition) => ({
          name: definition.name,
          type: definition.type,
          unit: definition.unit,
          options: definition.options
            ?.filter((option) => option.active)
            .map((option) => option.label),
        })),
    };
  },
});
