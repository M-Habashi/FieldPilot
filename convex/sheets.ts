import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { requireProjectMember, requireProjectRole, requireUser } from './lib/authz';

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
  },
});

export const listByProjectWithMetadata = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    const plans = await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect();
    return await Promise.all(
      plans.map(async (plan) => {
        const creator = await ctx.db.get(plan.createdBy);
        return {
          plan,
          createdByName: creator?.name ?? creator?.email ?? 'Project member',
        };
      }),
    );
  },
});

export const getPdfWorkspace = query({
  args: { sheetId: v.id('sheets') },
  handler: async (ctx, { sheetId }) => {
    const sheet = await ctx.db.get(sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectMember(ctx, sheet.projectId);

    const pages = await ctx.db
      .query('sheets')
      .withIndex('by_project_sourceFileRef', (q) =>
        q.eq('projectId', sheet.projectId).eq('sourceFileRef', sheet.sourceFileRef),
      )
      .collect();
    pages.sort((a, b) => a.pageIndex - b.pageIndex);

    const storageUrl =
      sheet.sourceStorageId === undefined ? null : await ctx.storage.getUrl(sheet.sourceStorageId);
    return {
      primary: pages[0] ?? sheet,
      pages,
      pdfUrl: storageUrl ?? sheet.sourceFileRef,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
    number: v.string(),
    discipline: v.optional(v.string()),
    sourceFileRef: v.string(),
    sourceStorageId: v.optional(v.id('_storage')),
    sourceFileName: v.optional(v.string()),
    sourceFileSize: v.optional(v.number()),
    sourceContentType: v.optional(v.string()),
    pageIndex: v.number(),
    width: v.number(),
    height: v.number(),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, args.projectId, ['owner', 'admin'], userId);
    const now = Date.now();
    return await ctx.db.insert('sheets', {
      ...args,
      name: args.name.trim(),
      number: args.number.trim(),
      discipline: args.discipline?.trim() || undefined,
      version: args.version ?? 1,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateUploadUrl = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectRole(ctx, projectId, ['owner', 'admin']);
    return await ctx.storage.generateUploadUrl();
  },
});

export const completePdfUpload = mutation({
  args: {
    projectId: v.id('projects'),
    storageId: v.id('_storage'),
    fileName: v.string(),
    pages: v.array(
      v.object({
        name: v.string(),
        number: v.string(),
        pageIndex: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, args.projectId, ['owner', 'admin'], userId);

    const fileName = args.fileName.trim();
    if (!fileName || !fileName.toLowerCase().endsWith('.pdf')) {
      throw new Error('Choose a PDF plan to upload');
    }
    if (args.pages.length === 0) throw new Error('The PDF does not contain any pages');

    const storedFile = await ctx.db.system.get('_storage', args.storageId);
    if (storedFile === null) throw new Error('Uploaded plan file was not found');
    if (storedFile.contentType !== undefined && storedFile.contentType !== 'application/pdf') {
      throw new Error('Only PDF plans can be uploaded');
    }

    const now = Date.now();
    const sheetIds = [];
    for (const page of args.pages) {
      const name = page.name.trim();
      const number = page.number.trim();
      if (!name) throw new Error('Plan name is required');
      if (!number) throw new Error('Plan number is required');
      if (!Number.isInteger(page.pageIndex) || page.pageIndex < 0) {
        throw new Error('Plan page index is invalid');
      }
      if (page.width <= 0 || page.height <= 0) {
        throw new Error('Plan dimensions are invalid');
      }

      sheetIds.push(
        await ctx.db.insert('sheets', {
          projectId: args.projectId,
          name,
          number,
          sourceFileRef: args.storageId,
          sourceStorageId: args.storageId,
          sourceFileName: fileName,
          sourceFileSize: storedFile.size,
          sourceContentType: storedFile.contentType ?? 'application/pdf',
          pageIndex: page.pageIndex,
          width: page.width,
          height: page.height,
          version: 1,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return sheetIds;
  },
});

export const update = mutation({
  args: {
    sheetId: v.id('sheets'),
    name: v.optional(v.string()),
    number: v.optional(v.string()),
    discipline: v.optional(v.union(v.string(), v.null())),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectRole(ctx, sheet.projectId, ['owner', 'admin']);

    const patch: Partial<Doc<'sheets'>> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error('Plan name is required');
      patch.name = name;
    }
    if (args.number !== undefined) {
      const number = args.number.trim();
      if (!number) throw new Error('Plan number is required');
      patch.number = number;
    }
    if (args.discipline !== undefined) patch.discipline = args.discipline?.trim() || undefined;
    if (args.version !== undefined) {
      if (!Number.isInteger(args.version) || args.version < 1) {
        throw new Error('Plan version must be a positive whole number');
      }
      patch.version = args.version;
    }
    await ctx.db.patch(sheet._id, patch);
  },
});

export const updatePdf = mutation({
  args: {
    sheetId: v.id('sheets'),
    name: v.string(),
    discipline: v.union(v.string(), v.null()),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectRole(ctx, sheet.projectId, ['owner', 'admin']);

    const name = args.name.trim();
    if (!name) throw new Error('Plan name is required');
    if (!Number.isInteger(args.version) || args.version < 1) {
      throw new Error('Plan version must be a positive whole number');
    }

    const pages = await ctx.db
      .query('sheets')
      .withIndex('by_project_sourceFileRef', (q) =>
        q.eq('projectId', sheet.projectId).eq('sourceFileRef', sheet.sourceFileRef),
      )
      .collect();
    const updatedAt = Date.now();
    await Promise.all(
      pages.map((page) =>
        ctx.db.patch(page._id, {
          name,
          discipline: args.discipline?.trim() || undefined,
          version: args.version,
          updatedAt,
        }),
      ),
    );
  },
});

async function deleteSheetData(ctx: MutationCtx, sheetId: Id<'sheets'>) {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_sheet', (q) => q.eq('sheetId', sheetId))
    .collect();
  for (const task of tasks) {
    const [notes, attachments] = await Promise.all([
      ctx.db
        .query('notes')
        .withIndex('by_task', (q) => q.eq('taskId', task._id))
        .collect(),
      ctx.db
        .query('attachments')
        .withIndex('by_task', (q) => q.eq('taskId', task._id))
        .collect(),
    ]);
    await Promise.all([
      ...notes.map((doc) => ctx.db.delete(doc._id)),
      ...attachments.map((doc) => ctx.db.delete(doc._id)),
    ]);
    await ctx.db.delete(task._id);
  }
  await ctx.db.delete(sheetId);
}

export const remove = mutation({
  args: { sheetId: v.id('sheets') },
  handler: async (ctx, { sheetId }) => {
    const sheet = await ctx.db.get(sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectRole(ctx, sheet.projectId, ['owner', 'admin']);

    await deleteSheetData(ctx, sheetId);

    if (sheet.sourceStorageId !== undefined) {
      const remainingPage = await ctx.db
        .query('sheets')
        .withIndex('by_project_sourceFileRef', (q) =>
          q.eq('projectId', sheet.projectId).eq('sourceFileRef', sheet.sourceFileRef),
        )
        .first();
      if (remainingPage === null) await ctx.storage.delete(sheet.sourceStorageId);
    }
  },
});

export const removePdf = mutation({
  args: { sheetId: v.id('sheets') },
  handler: async (ctx, { sheetId }) => {
    const sheet = await ctx.db.get(sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectRole(ctx, sheet.projectId, ['owner', 'admin']);

    const pages = await ctx.db
      .query('sheets')
      .withIndex('by_project_sourceFileRef', (q) =>
        q.eq('projectId', sheet.projectId).eq('sourceFileRef', sheet.sourceFileRef),
      )
      .collect();
    for (const page of pages) await deleteSheetData(ctx, page._id);
    if (sheet.sourceStorageId !== undefined) await ctx.storage.delete(sheet.sourceStorageId);
  },
});
