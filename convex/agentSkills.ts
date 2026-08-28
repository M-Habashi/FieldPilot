import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { syncBuiltInAgentSkills } from './agents/skills/definitions';
import { requireProjectMember } from './lib/authz';

export const syncBuiltIns = internalMutation({
  args: {},
  handler: async (ctx) => {
    await syncBuiltInAgentSkills(ctx);
    return { synced: true as const };
  },
});

export const getForAgent = internalQuery({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    key: v.union(v.literal('tasks'), v.literal('images')),
  },
  handler: async (ctx, { projectId, userId, key }) => {
    await requireProjectMember(ctx, projectId, userId);
    const skill = await ctx.db
      .query('agentSkills')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!skill) throw new Error(`The ${key} skill is not installed`);
    return {
      key: skill.key,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      allowedTools: skill.allowedTools,
      revision: skill.revision,
    };
  },
});
