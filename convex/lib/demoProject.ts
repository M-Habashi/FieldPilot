import type { AnyDataModel, GenericMutationCtx } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export const DEMO_PROJECT_NAME = 'Demo project';
export const DEMO_PLAN_NAME = 'Demo plan';
const DEMO_PDF_REF = '/demo/demo-plan.pdf';
const DEMO_PAGE_COUNT = 3;

async function insertMissingDemoPages(
  ctx: GenericMutationCtx<AnyDataModel>,
  projectId: GenericId<'projects'>,
  userId: GenericId<'users'>,
  existingPageIndexes: Set<number>,
  createdAt: number,
) {
  for (let pageIndex = 0; pageIndex < DEMO_PAGE_COUNT; pageIndex += 1) {
    if (existingPageIndexes.has(pageIndex)) continue;
    await ctx.db.insert('sheets', {
      projectId,
      name: DEMO_PLAN_NAME,
      number: `A-${101 + pageIndex}`,
      discipline: 'Architectural',
      sourceFileRef: DEMO_PDF_REF,
      sourceFileName: 'demo-plan.pdf',
      sourceContentType: 'application/pdf',
      pageIndex,
      width: 2592,
      height: 1728,
      version: 1,
      createdBy: userId,
      createdAt,
      updatedAt: createdAt,
    });
  }
}

export async function createDemoProjectForUser(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: GenericId<'users'>,
) {
  const now = Date.now();
  const projectId = await ctx.db.insert('projects', {
    name: DEMO_PROJECT_NAME,
    isDemo: true,
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

  await insertMissingDemoPages(ctx, projectId, userId, new Set(), now);

  return projectId;
}

export async function ensureDemoProjectForUser(ctx: MutationCtx, userId: Id<'users'>) {
  const ownedProjects = await ctx.db
    .query('projects')
    .withIndex('by_createdBy', (q) => q.eq('createdBy', userId))
    .collect();

  for (const project of ownedProjects) {
    if (project.isDemo === true) return { projectId: project._id, created: false };
    if (project.name !== DEMO_PROJECT_NAME) continue;

    const plans = await ctx.db
      .query('sheets')
      .withIndex('by_project', (q) => q.eq('projectId', project._id))
      .collect();
    const demoPlans = plans.filter((plan) => plan.sourceFileRef === DEMO_PDF_REF);
    if (demoPlans.length > 0) {
      await ctx.db.patch(project._id, { isDemo: true });
      await insertMissingDemoPages(
        ctx,
        project._id,
        userId,
        new Set(demoPlans.map((plan) => plan.pageIndex)),
        project.createdAt,
      );
      return { projectId: project._id, created: false };
    }
  }

  return {
    projectId: await createDemoProjectForUser(ctx, userId),
    created: true,
  };
}
