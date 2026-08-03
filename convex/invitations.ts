import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProjectRole, requireUser } from './lib/authz';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = user?.email ? normalizeEmail(user.email) : null;
    if (!email) return [];

    const invitations = await ctx.db
      .query('projectInvitations')
      .withIndex('by_email_status', (q) => q.eq('email', email).eq('status', 'pending'))
      .collect();

    const rows = await Promise.all(
      invitations.map(async (invitation) => {
        const [project, inviter] = await Promise.all([
          ctx.db.get(invitation.projectId),
          ctx.db.get(invitation.invitedBy),
        ]);
        return {
          invitation,
          projectName: project?.name ?? null,
          inviterName: inviter?.name ?? inviter?.email ?? 'A FieldPilot user',
        };
      }),
    );
    return rows.filter((row) => row.projectName !== null);
  },
});

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    email: v.string(),
  },
  handler: async (ctx, { projectId, email: suppliedEmail }) => {
    const invitedBy = await requireUser(ctx);
    await requireProjectRole(ctx, projectId, ['owner', 'admin'], invitedBy);
    const email = normalizeEmail(suppliedEmail);
    if (!isEmail(email)) throw new ConvexError('Enter a valid email address.');

    const inviter = await ctx.db.get(invitedBy);
    if (inviter?.email && normalizeEmail(inviter.email) === email) {
      throw new ConvexError('You are already a member of this project.');
    }

    const pending = await ctx.db
      .query('projectInvitations')
      .withIndex('by_project_email_status', (q) =>
        q.eq('projectId', projectId).eq('email', email).eq('status', 'pending'),
      )
      .unique();
    if (pending !== null) {
      throw new ConvexError('An invitation is already pending for this email address.');
    }

    // Convex Auth already defines the `email` index. Account emails are normalized at the auth
    // boundary, so invitation checks stay bounded instead of scanning the full users table.
    const matchingUsers = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .take(2);
    if (matchingUsers.length === 0) {
      throw new ConvexError('No FieldPilot account uses this email address.');
    }
    for (const user of matchingUsers) {
      const membership = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', user._id))
        .unique();
      if (membership !== null) {
        throw new ConvexError('This person is already a project member.');
      }
    }

    return await ctx.db.insert('projectInvitations', {
      projectId,
      email,
      invitedBy,
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});

export const accept = mutation({
  args: { invitationId: v.id('projectInvitations') },
  handler: async (ctx, { invitationId }) => {
    const userId = await requireUser(ctx);
    const [user, invitation] = await Promise.all([ctx.db.get(userId), ctx.db.get(invitationId)]);
    if (invitation === null || invitation.status !== 'pending') {
      throw new ConvexError('This invitation is no longer available.');
    }
    if (!user?.email || normalizeEmail(user.email) !== invitation.email) {
      throw new ConvexError('This invitation belongs to another email address.');
    }
    const project = await ctx.db.get(invitation.projectId);
    if (project === null || project.archivedAt !== undefined) {
      throw new ConvexError('This project is no longer available.');
    }

    const existingMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', (q) =>
        q.eq('projectId', invitation.projectId).eq('userId', userId),
      )
      .unique();
    const now = Date.now();
    if (existingMembership === null) {
      await ctx.db.insert('projectMembers', {
        projectId: invitation.projectId,
        userId,
        role: 'member',
        addedBy: invitation.invitedBy,
        joinedAt: now,
      });
    }
    await ctx.db.patch(invitation._id, {
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: userId,
    });
    return invitation.projectId;
  },
});
