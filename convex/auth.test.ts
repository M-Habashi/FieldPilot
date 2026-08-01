import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { createOrUpdateAuthUser, type CreateOrUpdateAuthUserArgs } from './lib/authUser';
import { DEMO_PLAN_NAME, DEMO_PROJECT_NAME, ensureDemoProjectForUser } from './lib/demoProject';
import schema from './schema';
import { modules } from './test.setup';

describe('new account onboarding', () => {
  it('creates an owned demo project with the bundled demo plan', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name: 'New User',
        email: 'new-user@example.com',
      });

      const firstResult = await ensureDemoProjectForUser(ctx, userId);
      const secondResult = await ensureDemoProjectForUser(ctx, userId);
      const projectId = firstResult.projectId;
      const project = await ctx.db.get(projectId);
      const memberships = await ctx.db.query('projectMembers').collect();
      const plans = await ctx.db.query('sheets').collect();

      expect(project).toMatchObject({
        name: DEMO_PROJECT_NAME,
        isDemo: true,
        createdBy: userId,
        nextTaskSeq: 1,
      });
      expect(firstResult.created).toBe(true);
      expect(secondResult).toEqual({ projectId, created: false });
      expect(await ctx.db.query('projects').collect()).toHaveLength(1);
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({
        projectId,
        userId,
        role: 'owner',
        addedBy: userId,
      });
      expect(plans).toHaveLength(3);
      expect(plans.map((plan) => plan.pageIndex)).toEqual([0, 1, 2]);
      expect(plans[0]).toMatchObject({
        projectId,
        name: DEMO_PLAN_NAME,
        number: 'A-101',
        discipline: 'Architectural',
        sourceFileRef: '/demo/demo-plan.pdf',
        pageIndex: 0,
        width: 2592,
        height: 1728,
        version: 1,
        createdBy: userId,
      });
    });
  });

  it('waits for email verification before creating the demo project', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const passwordProvider = {
        id: 'password',
        type: 'credentials',
      } as unknown as CreateOrUpdateAuthUserArgs['provider'];

      const userId = await createOrUpdateAuthUser(ctx, {
        existingUserId: null,
        type: 'credentials',
        provider: passwordProvider,
        profile: { name: 'Email User', email: 'EMAIL-USER@example.com' },
      });

      expect(await ctx.db.get(userId)).toMatchObject({
        name: 'Email User',
        email: 'email-user@example.com',
      });
      expect(await ctx.db.query('projects').collect()).toHaveLength(0);

      await createOrUpdateAuthUser(ctx, {
        existingUserId: userId,
        type: 'verification',
        provider: passwordProvider,
        profile: { email: 'email-user@example.com', emailVerified: true },
      });

      expect((await ctx.db.get(userId))?.emailVerificationTime).toEqual(expect.any(Number));
      expect(await ctx.db.query('projects').collect()).toHaveLength(1);
      expect(await ctx.db.query('sheets').collect()).toHaveLength(3);
    });
  });

  it('rejects password signup when the email already belongs to Google', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name: 'Google User',
        email: 'google-user@example.com',
        emailVerificationTime: Date.now(),
      });
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'google',
        providerAccountId: 'google-subject',
        emailVerified: 'google-user@example.com',
      });

      await expect(
        createOrUpdateAuthUser(ctx, {
          existingUserId: null,
          type: 'credentials',
          provider: {
            id: 'password',
            type: 'credentials',
          } as unknown as CreateOrUpdateAuthUserArgs['provider'],
          profile: { email: 'GOOGLE-USER@example.com' },
        }),
      ).rejects.toThrow('This email is already registered with Google. Continue with Google.');

      expect(await ctx.db.query('users').collect()).toHaveLength(1);
      expect(await ctx.db.query('authAccounts').collect()).toHaveLength(1);
    });
  });

  it('lets verified Google claim an unfinished email signup without duplicating the user', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const passwordProvider = {
        id: 'password',
        type: 'credentials',
      } as unknown as CreateOrUpdateAuthUserArgs['provider'];
      const googleProvider = {
        id: 'google',
        type: 'oauth',
      } as unknown as CreateOrUpdateAuthUserArgs['provider'];

      const pendingUserId = await createOrUpdateAuthUser(ctx, {
        existingUserId: null,
        type: 'credentials',
        provider: passwordProvider,
        profile: { email: 'pending@example.com' },
      });
      const googleUserId = await createOrUpdateAuthUser(ctx, {
        existingUserId: null,
        type: 'oauth',
        provider: googleProvider,
        profile: {
          email: 'PENDING@example.com',
          name: 'Verified Google User',
          emailVerified: true,
        },
      });

      expect(googleUserId).toBe(pendingUserId);
      expect(await ctx.db.query('users').collect()).toHaveLength(1);
      expect(await ctx.db.query('projects').collect()).toHaveLength(1);
    });
  });
});
