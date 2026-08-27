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
    const threadId = 'thread-1';

    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });
    await seedMembership(t, projectId, memberId, ownerId);

    await expect(t.query(api.chat.history, { projectId, threadId })).rejects.toThrow(
      'Unauthenticated',
    );
    await expect(outsider.query(api.chat.history, { projectId, threadId })).rejects.toThrow(
      'Not authorized for this project',
    );
    await expect(
      outsider.mutation(internal.chat.recordUserMessage, {
        projectId,
        threadId,
        content: 'Hello',
      }),
    ).rejects.toThrow('Not authorized for this project');

    await member.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId,
      content: '  Hello plan  ',
    });
    await member.mutation(internal.chat.recordAssistantMessage, {
      projectId,
      userId: memberId,
      threadId,
      content: 'Hello! How can I help?',
    });
    await owner.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId,
      content: 'Owner thread',
    });

    const memberHistory = await member.query(api.chat.history, { projectId, threadId });
    expect(memberHistory.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Hello plan'],
      ['assistant', 'Hello! How can I help?'],
    ]);

    const ownerHistory = await owner.query(api.chat.history, { projectId, threadId });
    expect(ownerHistory.map((message) => message.content)).toEqual(['Owner thread']);
  });

  it('validates message content', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });

    await expect(
      owner.mutation(internal.chat.recordUserMessage, {
        projectId,
        threadId: 'thread-1',
        content: '   ',
      }),
    ).rejects.toThrow('Message is required');
    await expect(
      owner.mutation(internal.chat.recordUserMessage, {
        projectId,
        threadId: 'thread-1',
        content: 'x'.repeat(4001),
      }),
    ).rejects.toThrow('Message is too long');
  });

  it('keeps project-entry threads separate', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });

    await owner.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: 'first-visit',
      content: 'Previous visit',
    });
    await owner.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: 'second-visit',
      content: 'Current visit',
    });

    expect(
      (await owner.query(api.chat.history, { projectId, threadId: 'second-visit' })).map(
        (message) => message.content,
      ),
    ).toEqual(['Current visit']);
  });

  it("clears only the requesting member's selected thread", async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Chat Owner', 'chat-owner@example.com');
    const memberId = await seedUser(t, 'Chat Member', 'chat-member@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Chat Project' });
    await seedMembership(t, projectId, memberId, ownerId);

    await owner.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: 'thread-1',
      content: 'Owner note',
    });
    await member.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: 'thread-1',
      content: 'Member note',
    });
    await member.mutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: 'thread-2',
      content: 'Member note in another thread',
    });

    await member.mutation(api.chat.clear, { projectId, threadId: 'thread-1' });
    expect(await member.query(api.chat.history, { projectId, threadId: 'thread-1' })).toEqual([]);
    expect(
      (await member.query(api.chat.history, { projectId, threadId: 'thread-2' })).map(
        (message) => message.content,
      ),
    ).toEqual(['Member note in another thread']);
    expect(
      (await owner.query(api.chat.history, { projectId, threadId: 'thread-1' })).map(
        (message) => message.content,
      ),
    ).toEqual(['Owner note']);
  });
});
