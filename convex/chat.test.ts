import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

function createTest() {
  return convexTest(schema, modules);
}

type TestInstance = ReturnType<typeof createTest>;

async function seedUser(t: TestInstance, name: string, email: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', { name, email: email.trim().toLowerCase() }),
  );
}

async function seedMembership(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  addedBy: Id<'users'>,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'member',
      addedBy,
      joinedAt: Date.now(),
    });
  });
}

describe('AI chat', () => {
  it('keeps conversations private per project member and returns them in order', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const memberId = await seedUser(t, 'Chat Member', 'chat-member@example.com');
    const outsiderId = await seedUser(t, 'Chat Outsider', 'chat-outsider@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const outsider = t.withIdentity({ subject: outsiderId });

    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });
    await seedMembership(t, projectId, memberId, ownerId);

    await expect(t.query(api.chat.history, { projectId })).rejects.toThrow('Unauthenticated');
    await expect(outsider.query(api.chat.history, { projectId })).rejects.toThrow(
      'Not authorized for this project',
    );
    await expect(
      outsider.mutation(internal.chat.recordUserMessage, { projectId, content: 'Hello' }),
    ).rejects.toThrow('Not authorized for this project');

    await member.mutation(internal.chat.recordUserMessage, {
      projectId,
      content: '  Hello plan  ',
    });
    await member.mutation(internal.chat.recordAssistantMessage, {
      projectId,
      userId: memberId,
      content: 'Hello! How can I help?',
    });
    await owner.mutation(internal.chat.recordUserMessage, {
      projectId,
      content: 'Owner thread',
    });

    const memberHistory = await member.query(api.chat.history, { projectId });
    expect(memberHistory.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Hello plan'],
      ['assistant', 'Hello! How can I help?'],
    ]);

    const ownerHistory = await owner.query(api.chat.history, { projectId });
    expect(ownerHistory.map((message) => message.content)).toEqual(['Owner thread']);
  });

  it('validates message content', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });

    await expect(
      owner.mutation(internal.chat.recordUserMessage, { projectId, content: '   ' }),
    ).rejects.toThrow('Message is required');
    await expect(
      owner.mutation(internal.chat.recordUserMessage, {
        projectId,
        content: 'x'.repeat(4001),
      }),
    ).rejects.toThrow('Message is too long');
  });

  it("clears only the requesting member's conversation", async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const memberId = await seedUser(t, 'Chat Member', 'chat-member@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });
    await seedMembership(t, projectId, memberId, ownerId);

    await owner.mutation(internal.chat.recordUserMessage, { projectId, content: 'Owner note' });
    await member.mutation(internal.chat.recordUserMessage, { projectId, content: 'Member note' });

    await member.mutation(api.chat.clear, { projectId });
    expect(await member.query(api.chat.history, { projectId })).toEqual([]);
    expect((await owner.query(api.chat.history, { projectId })).map((m) => m.content)).toEqual([
      'Owner note',
    ]);
  });
});
