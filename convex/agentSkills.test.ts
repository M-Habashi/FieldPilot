import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('database-backed agent skills', () => {
  it('synchronizes exactly the code-controlled task and image skills', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agentSkills.syncBuiltIns, {});
    await t.mutation(internal.agentSkills.syncBuiltIns, {});
    const skills = await t.run(async (ctx) =>
      ctx.db.query('agentSkills').withIndex('by_key').collect(),
    );
    expect(skills).toHaveLength(2);
    expect(skills.map((skill) => skill.key).sort()).toEqual(['images', 'tasks']);
    expect(skills.find((skill) => skill.key === 'images')).toMatchObject({
      allowedTools: [
        'inspect_images',
        'analyze_images',
        'change_image_data',
        'delete_images_permanently',
      ],
      revision: 10,
    });
    expect(skills.find((skill) => skill.key === 'images')?.instructions).toContain(
      'visibleInPhotosTab',
    );
    expect(skills.find((skill) => skill.key === 'images')?.instructions).toContain(
      'Trash lasts 30 days',
    );
    expect(skills.find((skill) => skill.key === 'images')?.instructions).toContain(
      'Total: {visibleInPhotosTab}; Assigned: {assigned}',
    );
    expect(skills.find((skill) => skill.key === 'images')?.instructions).toContain(
      'ignore trashed and includingTrash completely',
    );
    expect(skills.find((skill) => skill.key === 'tasks')?.instructions).toContain(
      'Use change_project_data',
    );
  });
});
