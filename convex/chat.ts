import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireProjectMember, requireUser } from './lib/authz';

const MAX_MESSAGE_CHARS = 4000;
const MAX_THREAD_ID_CHARS = 128;
const HISTORY_LIMIT = 100;
const PROMPT_HISTORY_LIMIT = 20;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

// The LLM is called through an OpenAI-compatible chat-completions endpoint so
// any compatible provider (OpenAI, OpenRouter, a self-hosted gateway) works.
// Only variable NAMES are committed; the key lives in the Convex deployment.
function environment(name: 'AI_CHAT_API_KEY' | 'AI_CHAT_BASE_URL' | 'AI_CHAT_MODEL') {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

interface ChatPromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  projectName?: string;
  sheetName?: string;
  page?: number;
  view?: string;
}

function requireThreadId(threadId: string) {
  const normalized = threadId.trim();
  if (!normalized) throw new Error('Conversation id is required');
  if (normalized.length > MAX_THREAD_ID_CHARS) throw new Error('Conversation id is too long');
  return normalized;
}

const chatContextArgs = v.optional(
  v.object({
    projectName: v.optional(v.string()),
    sheetName: v.optional(v.string()),
    page: v.optional(v.number()),
    view: v.optional(v.string()),
  }),
);

export const history = query({
  args: { projectId: v.id('projects'), threadId: v.string() },
  handler: async (ctx, { projectId, threadId }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_project_user_thread', (q) =>
        q.eq('projectId', projectId).eq('userId', userId).eq('threadId', currentThreadId),
      )
      .order('desc')
      .take(HISTORY_LIMIT);
    return recent.reverse();
  },
});

export const clear = mutation({
  args: { projectId: v.id('projects'), threadId: v.string() },
  handler: async (ctx, { projectId, threadId }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_project_user_thread', (q) =>
        q.eq('projectId', projectId).eq('userId', userId).eq('threadId', currentThreadId),
      )
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
  },
});

export const recordUserMessage = internalMutation({
  args: { projectId: v.id('projects'), threadId: v.string(), content: v.string() },
  handler: async (ctx, { projectId, threadId, content }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Message is required');
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      throw new Error(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
    }
    await ctx.db.insert('chatMessages', {
      projectId,
      userId,
      threadId: currentThreadId,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    });
    return { userId };
  },
});

export const recentForPrompt = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users'), threadId: v.string() },
  handler: async (ctx, { projectId, userId, threadId }) => {
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_project_user_thread', (q) =>
        q.eq('projectId', projectId).eq('userId', userId).eq('threadId', currentThreadId),
      )
      .order('desc')
      .take(PROMPT_HISTORY_LIMIT);
    return recent
      .reverse()
      .map((message): ChatPromptMessage => ({ role: message.role, content: message.content }));
  },
});

export const recordAssistantMessage = internalMutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { projectId, userId, threadId, content }) => {
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    await ctx.db.insert('chatMessages', {
      projectId,
      userId,
      threadId: currentThreadId,
      role: 'assistant',
      content,
      createdAt: Date.now(),
    });
  },
});

export const send = action({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    content: v.string(),
    context: chatContextArgs,
  },
  handler: async (ctx, { projectId, threadId, content, context }): Promise<{ reply: string }> => {
    const currentThreadId = requireThreadId(threadId);
    // Persisting the user message first lets the client render it immediately
    // through the realtime history query while the provider call is pending.
    const { userId } = await ctx.runMutation(internal.chat.recordUserMessage, {
      projectId,
      threadId: currentThreadId,
      content,
    });
    const messages = await ctx.runQuery(internal.chat.recentForPrompt, {
      projectId,
      userId,
      threadId: currentThreadId,
    });
    const reply = await completeChatReply(messages, context);
    await ctx.runMutation(internal.chat.recordAssistantMessage, {
      projectId,
      userId,
      threadId: currentThreadId,
      content: reply,
    });
    return { reply };
  },
});

function systemPrompt(context?: ChatContext) {
  const lines = [
    'You are FieldPilot AI, an assistant built into a construction field-management app.',
    'You help field crews and project managers with construction plans, tasks, quantities, punch items, and day-to-day site questions.',
    'Answer concisely and practically, in the language the user writes in.',
    'You cannot see the plan drawing itself, only the context listed below. If an answer needs drawing details you do not have, say so instead of inventing them.',
  ];
  if (context?.projectName) lines.push(`Current project: ${context.projectName}.`);
  if (context?.sheetName) {
    lines.push(`Open sheet: ${context.sheetName}${context.page ? ` (page ${context.page})` : ''}.`);
  }
  if (context?.view) lines.push(`The user is currently viewing: ${context.view}.`);
  return lines.join('\n');
}

async function completeChatReply(
  messages: ChatPromptMessage[],
  context?: ChatContext,
): Promise<string> {
  const apiKey = environment('AI_CHAT_API_KEY');
  if (!apiKey) {
    throw new Error(
      'AI chat is not configured yet. Set AI_CHAT_API_KEY (and optionally AI_CHAT_BASE_URL and AI_CHAT_MODEL) on the Convex deployment.',
    );
  }
  const baseUrl = (environment('AI_CHAT_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = environment('AI_CHAT_MODEL') ?? DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 800,
      messages: [{ role: 'system', content: systemPrompt(context) }, ...messages],
    }),
  });

  if (!response.ok) {
    // Do not log the provider response body: it can echo prompt content.
    console.error('AI chat provider rejected the request', response.status);
    throw new Error('The AI assistant is unavailable right now. Try again in a moment.');
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('The AI assistant returned an empty reply. Try again.');
  }
  return reply.trim();
}
