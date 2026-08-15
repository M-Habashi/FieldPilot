import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { requireProjectMember } from './lib/authz';

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (task === null) throw new Error('Task not found');
    await requireProjectMember(ctx, task.projectId);
    const [notes, attachments, events] = await Promise.all([
      ctx.db
        .query('notes')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('attachments')
        .withIndex('by_task', (q) => q.eq('taskId', taskId))
        .collect(),
      ctx.db
        .query('taskActivityEvents')
        .withIndex('by_task_createdAt', (q) => q.eq('taskId', taskId))
        .collect(),
    ]);
    const actorIds = new Set([
      task.createdBy,
      ...notes.map((note) => note.authorId),
      ...attachments.map((attachment) => attachment.uploadedBy),
      ...events.map((event) => event.actorId),
    ]);
    const users = await Promise.all([...actorIds].map((actorId) => ctx.db.get(actorId)));
    const actorNameById = new Map(
      users.flatMap((user) =>
        user
          ? [[user._id, user.name?.trim() || user.email?.trim() || 'Project member'] as const]
          : [],
      ),
    );
    const actorName = (actorId: Id<'users'>) => actorNameById.get(actorId) ?? 'Project member';

    const photoEntries = await Promise.all(
      attachments
        .filter((attachment) => attachment.kind === 'photo' && attachment.deletedAt === undefined)
        .map(async (attachment) => ({
          id: `photo:${attachment._id}`,
          type: 'photo' as const,
          actorName: actorName(attachment.uploadedBy),
          createdAt: attachment.createdAt,
          attachmentId: attachment._id,
          fileName: attachment.fileName,
          url: await ctx.storage.getUrl(attachment.storageRef).catch(() => null),
        })),
    );
    return [
      ...notes.map((note) => ({
        id: `comment:${note._id}`,
        type: 'comment' as const,
        actorName: actorName(note.authorId),
        createdAt: note.createdAt,
        text: note.text,
      })),
      ...photoEntries,
      ...events.map((event) => ({
        id: `change:${event._id}`,
        type: 'change' as const,
        actorName: actorName(event.actorId),
        createdAt: event.updatedAt,
        summary: event.summary,
        changeKind: event.kind,
      })),
      {
        id: `created:${task._id}`,
        type: 'change' as const,
        actorName: actorName(task.createdBy),
        createdAt: task.createdAt,
        summary: 'Created this task',
        changeKind: 'task_created' as const,
      },
    ].sort((a, b) => b.createdAt - a.createdAt);
  },
});
