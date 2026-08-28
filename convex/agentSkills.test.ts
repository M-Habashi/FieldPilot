import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('database-backed agent skills', () => {
  it('synchronizes exactly the three code-controlled workflow skills', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agentSkills.syncBuiltIns, {});
    await t.mutation(internal.agentSkills.syncBuiltIns, {});
    const skills = await t.run(async (ctx) =>
      ctx.db.query('agentSkills').withIndex('by_key').collect(),
    );
    expect(skills).toHaveLength(3);
    expect(skills.map((skill) => skill.key).sort()).toEqual(['images', 'quantities', 'tasks']);
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
    expect(skills.find((skill) => skill.key === 'quantities')).toMatchObject({
      allowedTools: ['inspect_calculations', 'change_calculation_data'],
      revision: 1,
    });
    const quantityInstructions = skills.find((skill) => skill.key === 'quantities')?.instructions;
    expect(quantityInstructions).toContain('Remaining=Σ max(planned−completed,0)');
    expect(quantityInstructions).toContain('Measured tasks currently equals quantity-row count');
    expect(quantityInstructions).toContain('Editable source fields are in a task panel');
  });
});
