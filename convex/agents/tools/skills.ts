import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import type { AgentSkillKey } from '../skills/definitions';
import type { FieldPilotToolCtx } from './reads';

export function createLoadSkillTool(loadedSkills: Set<AgentSkillKey>) {
  return createTool({
    description:
      'Load one stored workflow skill before using project tools. Load tasks for task/project/sheet/quantity/note work. Load images for photo metadata, map operations, or visual pixel analysis. Do not load a skill for greetings, thanks, small talk, or general questions.',
    inputSchema: z.object({
      skill: z.enum(['tasks', 'images']).describe('The single workflow needed next.'),
    }),
    execute: async (ctx: FieldPilotToolCtx, { skill }): Promise<unknown> => {
      const record = await ctx.runQuery(internal.agentSkills.getForAgent, {
        projectId: ctx.projectId,
        userId: ctx.actorId,
        key: skill,
      });
      loadedSkills.add(skill);
      return record;
    },
  });
}
