import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import { markupData, pageCalibration } from './lib/markup';

function validatePoints(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) throw new Error('A markup needs at least one point');
  for (const point of points) {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    ) {
      throw new Error('Markup points must use normalized page coordinates');
    }
  }
}

export const listByPdf = query({
  args: { sheetId: v.id('sheets') },
  handler: async (ctx, { sheetId }) => {
    const anchor = await ctx.db.get(sheetId);
    if (anchor === null) throw new Error('Plan not found');
    await requireProjectMember(ctx, anchor.projectId);

    const pages = await ctx.db
      .query('sheets')
      .withIndex('by_project_sourceFileRef', (q) =>
        q.eq('projectId', anchor.projectId).eq('sourceFileRef', anchor.sourceFileRef),
      )
      .collect();
    const rows = await Promise.all(
      pages.map(async (page) => ({
        page: page.pageIndex + 1,
        markups: await ctx.db
          .query('markups')
          .withIndex('by_sheet', (q) => q.eq('sheetId', page._id))
          .collect(),
      })),
    );
    return rows.flatMap(({ page, markups }) => markups.map((markup) => ({ markup, page })));
  },
});

export const save = mutation({
  args: {
    projectId: v.id('projects'),
    sheetId: v.id('sheets'),
    clientId: v.string(),
    data: markupData,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireProjectRole(ctx, args.projectId, CONTENT_EDITOR_ROLES, userId);
    const clientId = args.clientId.trim();
    if (!clientId) throw new Error('Markup ID is required');
    validatePoints(args.data.points);

    const sheet = await ctx.db.get(args.sheetId);
    if (sheet === null || sheet.projectId !== args.projectId) {
      throw new Error('Sheet does not belong to this project');
    }

    const existing = await ctx.db
      .query('markups')
      .withIndex('by_project_client', (q) =>
        q.eq('projectId', args.projectId).eq('clientId', clientId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { sheetId: args.sheetId, data: args.data, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert('markups', {
      projectId: args.projectId,
      sheetId: args.sheetId,
      clientId,
      data: args.data,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { projectId: v.id('projects'), clientId: v.string() },
  handler: async (ctx, { projectId, clientId }) => {
    await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES);
    const markup = await ctx.db
      .query('markups')
      .withIndex('by_project_client', (q) => q.eq('projectId', projectId).eq('clientId', clientId))
      .unique();
    if (markup) await ctx.db.delete(markup._id);
  },
});

export const setCalibration = mutation({
  args: { sheetId: v.id('sheets'), calibration: v.union(pageCalibration, v.null()) },
  handler: async (ctx, { sheetId, calibration }) => {
    const sheet = await ctx.db.get(sheetId);
    if (sheet === null) throw new Error('Plan not found');
    await requireProjectRole(ctx, sheet.projectId, CONTENT_EDITOR_ROLES);
    await ctx.db.patch(sheetId, { calibration: calibration ?? undefined, updatedAt: Date.now() });
  },
});
