import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('task activity', () => {
  it('merges comments with task history and coalesces rapid edits', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Omar', email: 'omar@example.com' }),
    );
    const user = t.withIdentity({ subject: userId });
    const projectId = await user.mutation(api.projects.create, { name: 'Activity project' });
    const sheetId = await user.mutation(api.sheets.create, {
      projectId,
      name: 'Ground floor',
      number: 'A-101',
      sourceFileRef: '/ground-floor.pdf',
      pageIndex: 0,
      width: 1000,
      height: 1000,
    });
    const taskId = await user.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.5,
      title: 'Initial title',
    });

    await user.mutation(api.tasks.update, { taskId, title: 'Install' });
    await user.mutation(api.tasks.update, { taskId, title: 'Install wall protection' });
    await user.mutation(api.tasks.update, { taskId, status: 'in-progress' });
    await user.mutation(api.notes.create, { taskId, text: 'Crew started in corridor 2A.' });

    const activity = await user.query(api.activity.listByTask, { taskId });
    expect(activity.filter((entry) => entry.type === 'comment')).toHaveLength(1);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'comment',
          actorName: 'Omar',
          text: 'Crew started in corridor 2A.',
        }),
        expect.objectContaining({
          type: 'change',
          summary: 'Changed task title from Initial title to Install wall protection',
        }),
        expect.objectContaining({
          type: 'change',
          summary: 'Changed status from Open to In progress',
        }),
        expect.objectContaining({ type: 'change', summary: 'Created this task' }),
      ]),
    );
    expect(
      activity.filter((entry) => entry.type === 'change' && entry.summary.includes('task title')),
    ).toHaveLength(1);
  });
});
