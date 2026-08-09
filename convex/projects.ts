import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { requireProjectMember, requireProjectRole, requireUser } from './lib/authz';

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (membership) => {
        const [project, memberCount] = await Promise.all([
          ctx.db.get(membership.projectId),
          ctx.db
            .query('projectMembers')
            .withIndex('by_project', (q) => q.eq('projectId', membership.projectId))
            .collect()
            .then((members) => members.length),
        ]);
        return { membership, project, memberCount };
      }),
    );
    return rows.filter((row) => row.project !== null && row.project.archivedAt === undefined);
  },
});

export const get = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectMember(ctx, projectId);
    return await ctx.db.get(projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error('Project name is required');

    const now = Date.now();
    const projectId = await ctx.db.insert('projects', {
      name,
      code: args.code?.trim() || undefined,
      createdBy: userId,
      nextTaskSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'owner',
      addedBy: userId,
      joinedAt: now,
    });
    return projectId;
  },
});

export const rename = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
  },
  handler: async (ctx, { projectId, name: suppliedName }) => {
    await requireProjectRole(ctx, projectId, ['owner', 'admin']);
    const name = suppliedName.trim();
    if (!name) throw new Error('Project name is required');
    await ctx.db.patch(projectId, { name, updatedAt: Date.now() });
  },
});

async function deleteProjectData(ctx: MutationCtx, projectId: Id<'projects'>) {
  const [
    members,
    invitations,
    sheets,
    tasks,
    notes,
    attachments,
    uploadDiagnostics,
    pendingUploads,
  ] = await Promise.all([
    ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('projectInvitations')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('notes')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('attachments')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('photoUploadDiagnostics')
      .withIndex('by_project_createdAt', (q) => q.eq('projectId', projectId))
      .collect(),
    ctx.db
      .query('pendingUploads')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect(),
  ]);

  const planStorageIds = [
    ...new Set(
      sheets.flatMap((sheet) =>
        sheet.sourceStorageId === undefined ? [] : [sheet.sourceStorageId],
      ),
    ),
  ];
  const attachmentStorageIds = attachments.map((attachment) => attachment.storageRef);

  await Promise.all([
    ...notes.map((doc) => ctx.db.delete(doc._id)),
    ...attachments.map((doc) => ctx.db.delete(doc._id)),
    ...uploadDiagnostics.map((doc) => ctx.db.delete(doc._id)),
    ...tasks.map((doc) => ctx.db.delete(doc._id)),
    ...sheets.map((doc) => ctx.db.delete(doc._id)),
    ...invitations.map((doc) => ctx.db.delete(doc._id)),
    ...members.map((doc) => ctx.db.delete(doc._id)),
    ...pendingUploads.map((doc) => ctx.db.delete(doc._id)),
  ]);
  await Promise.all(
    [...planStorageIds, ...attachmentStorageIds].map(async (storageId) => {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Metadata cleanup must still finish if an older blob is already absent.
      }
    }),
  );
  await ctx.db.delete(projectId);
}

export const remove = mutation({
  args: {
    projectId: v.id('projects'),
    confirmationName: v.string(),
  },
  handler: async (ctx, { projectId, confirmationName }) => {
    await requireProjectRole(ctx, projectId, ['owner']);
    const project = await ctx.db.get(projectId);
    if (project === null) throw new Error('Project not found');
    if (confirmationName !== project.name) {
      throw new Error('Project name does not match exactly');
    }
    await deleteProjectData(ctx, projectId);
  },
});

export const leave = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    const membership = await requireProjectMember(ctx, projectId, userId);
    if (membership.role === 'owner') {
      throw new Error('The project owner cannot leave the project');
    }
    await ctx.db.delete(membership._id);
  },
});
