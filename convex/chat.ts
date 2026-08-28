import { listUIMessages, syncStreams, vStreamArgs } from '@convex-dev/agent';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import {
  activeFieldPilotToolNames,
  createFieldPilotAgent,
  fieldPilotInstructions,
  shouldOfferProjectSkills,
  type FieldPilotAgentContext,
} from './agents/fieldPilot';
import { syncBuiltInAgentSkills, type AgentSkillKey } from './agents/skills/definitions';
import { assertChatConfigured, chatProviderInfo } from './agents/provider';
import {
  CONTENT_EDITOR_ROLES,
  requireProjectMember,
  requireProjectRole,
  requireUser,
} from './lib/authz';
import { limitAiChat } from './lib/rateLimits';

const MAX_MESSAGE_CHARS = 4000;
const MAX_THREAD_ID_CHARS = 128;
const HISTORY_LIMIT = 100;

const chatContextArgs = v.optional(
  v.object({
    projectName: v.optional(v.string()),
    sheetName: v.optional(v.string()),
    page: v.optional(v.number()),
    view: v.optional(v.string()),
    localDate: v.optional(v.string()),
  }),
);

type ChatContext = {
  projectName?: string;
  sheetName?: string;
  page?: number;
  view?: string;
  localDate?: string;
};

function requireThreadId(threadId: string) {
  const normalized = threadId.trim();
  if (!normalized) throw new Error('Conversation id is required');
  if (normalized.length > MAX_THREAD_ID_CHARS) throw new Error('Conversation id is too long');
  return normalized;
}

function requireMessage(content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message is required');
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    throw new Error(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
  }
  return trimmed;
}

function normalizedLocalDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function approvalIdsFromSavedMessages(
  savedMessages: Array<{ message?: { content?: unknown } }> | undefined,
) {
  const approvalIds = new Set<string>();
  for (const savedMessage of savedMessages ?? []) {
    const content = savedMessage.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'tool-approval-request' &&
        typeof (part as { approvalId?: unknown }).approvalId === 'string'
      ) {
        approvalIds.add((part as { approvalId: string }).approvalId);
      }
    }
  }
  return [...approvalIds];
}

async function findBinding(
  ctx: Parameters<typeof requireProjectMember>[0],
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  clientThreadId: string,
) {
  return await ctx.db
    .query('agentThreadBindings')
    .withIndex('by_project_user_client', (q) =>
      q.eq('projectId', projectId).eq('userId', userId).eq('clientThreadId', clientThreadId),
    )
    .unique();
}

// Legacy history remains readable during the rollout. New messages are owned
// by the Agent component and rendered through listThreadMessages below.
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
    await ctx.db.insert('chatMessages', {
      projectId,
      userId,
      threadId: requireThreadId(threadId),
      role: 'user',
      content: requireMessage(content),
      createdAt: Date.now(),
    });
    return { userId };
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
    await ctx.db.insert('chatMessages', {
      projectId,
      userId,
      threadId: requireThreadId(threadId),
      role: 'assistant',
      content,
      createdAt: Date.now(),
    });
  },
});

export const threadState = query({
  args: { projectId: v.id('projects'), threadId: v.string() },
  handler: async (ctx, { projectId, threadId }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const binding = await findBinding(ctx, projectId, userId, requireThreadId(threadId));
    if (binding === null) return { exists: false as const, runStatus: 'idle' as const };
    return {
      exists: true as const,
      runStatus: binding.runStatus,
      lastError: binding.lastError,
    };
  },
});

export const listThreadMessages = query({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, { projectId, threadId, paginationOpts, streamArgs }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const binding = await findBinding(ctx, projectId, userId, requireThreadId(threadId));
    if (binding === null) throw new Error('Conversation not found');
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: binding.componentThreadId,
      paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: binding.componentThreadId,
      streamArgs,
    });
    return { ...paginated, streams };
  },
});

export const sendMessage = mutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    content: v.string(),
    context: chatContextArgs,
  },
  handler: async (ctx, { projectId, threadId, content, context }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    const currentThreadId = requireThreadId(threadId);
    const prompt = requireMessage(content);
    let binding = await findBinding(ctx, projectId, userId, currentThreadId);
    if (binding?.runStatus === 'queued' || binding?.runStatus === 'running') {
      throw new Error('Please wait for the current reply to finish');
    }
    await limitAiChat(ctx, userId);
    await syncBuiltInAgentSkills(ctx);

    const agent = createFieldPilotAgent();
    if (binding === null) {
      const { threadId: componentThreadId } = await agent.createThread(ctx, {
        userId: `${projectId}:${userId}`,
        title: `FieldPilot project conversation ${currentThreadId}`,
      });
      const now = Date.now();
      const bindingId = await ctx.db.insert('agentThreadBindings', {
        projectId,
        userId,
        clientThreadId: currentThreadId,
        componentThreadId,
        runStatus: 'idle',
        createdAt: now,
        updatedAt: now,
      });
      binding = await ctx.db.get(bindingId);
      if (binding === null) throw new Error('Could not create conversation');
    }

    const { messageId } = await agent.saveMessage(ctx, {
      threadId: binding.componentThreadId,
      userId: `${projectId}:${userId}`,
      prompt,
      skipEmbeddings: true,
    });
    await ctx.db.patch(binding._id, {
      runStatus: 'queued',
      activePromptMessageId: messageId,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      bindingId: binding._id,
      promptMessageId: messageId,
      jobId: messageId,
      context,
      allowSkillLoading: shouldOfferProjectSkills(prompt),
    });
    return { accepted: true as const };
  },
});

export const respondToApproval = mutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    approvalId: v.string(),
    approved: v.boolean(),
    context: chatContextArgs,
  },
  handler: async (ctx, { projectId, threadId, approvalId, approved, context }) => {
    const userId = await requireUser(ctx);
    await requireProjectMember(ctx, projectId, userId);
    if (approved) await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, userId);
    const binding = await findBinding(ctx, projectId, userId, requireThreadId(threadId));
    if (binding === null) throw new Error('Conversation not found');
    if (binding.runStatus === 'queued' || binding.runStatus === 'running') {
      throw new Error('Please wait for the current reply to finish');
    }
    await limitAiChat(ctx, userId);
    const agent = createFieldPilotAgent();
    const approvalJob = binding.pendingApprovalJobs?.find(
      (candidate) => candidate.approvalId === approvalId,
    );
    const jobId = approvalJob?.jobId ?? approvalId;
    const { messageId } = approved
      ? await agent.approveToolCall(ctx, {
          threadId: binding.componentThreadId,
          approvalId,
        })
      : await agent.denyToolCall(ctx, {
          threadId: binding.componentThreadId,
          approvalId,
          reason: 'The user declined this action.',
        });
    await ctx.db.patch(binding._id, {
      runStatus: 'queued',
      activePromptMessageId: messageId,
      pendingApprovalJobs: binding.pendingApprovalJobs?.filter(
        (candidate) => candidate.approvalId !== approvalId,
      ),
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      bindingId: binding._id,
      promptMessageId: messageId,
      jobId,
      context,
      resumeApproval: true,
    });
  },
});

export const getRunBinding = internalQuery({
  args: { bindingId: v.id('agentThreadBindings') },
  handler: async (ctx, { bindingId }) => {
    const binding = await ctx.db.get(bindingId);
    if (binding === null) throw new Error('Conversation not found');
    const membership = await requireProjectMember(ctx, binding.projectId, binding.userId);
    return { ...binding, role: membership.role };
  },
});

export const setRunState = internalMutation({
  args: {
    bindingId: v.id('agentThreadBindings'),
    promptMessageId: v.string(),
    runStatus: v.union(v.literal('running'), v.literal('idle'), v.literal('failed')),
    error: v.optional(v.string()),
    jobId: v.optional(v.string()),
    approvalIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { bindingId, promptMessageId, runStatus, error, jobId, approvalIds }) => {
    const binding = await ctx.db.get(bindingId);
    if (binding === null || binding.activePromptMessageId !== promptMessageId) return;
    await requireProjectMember(ctx, binding.projectId, binding.userId);
    const pendingApprovalJobs = [...(binding.pendingApprovalJobs ?? [])];
    if (jobId && approvalIds) {
      for (const approvalId of approvalIds) {
        const existingIndex = pendingApprovalJobs.findIndex(
          (candidate) => candidate.approvalId === approvalId,
        );
        const record = { approvalId, jobId };
        if (existingIndex === -1) pendingApprovalJobs.push(record);
        else pendingApprovalJobs[existingIndex] = record;
      }
    }
    await ctx.db.patch(bindingId, {
      runStatus,
      activePromptMessageId: runStatus === 'running' ? promptMessageId : undefined,
      pendingApprovalJobs: pendingApprovalJobs.slice(-100),
      lastError: error,
      updatedAt: Date.now(),
    });
  },
});

export const recordRunMetric = internalMutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    bindingId: v.id('agentThreadBindings'),
    jobId: v.string(),
    provider: v.string(),
    model: v.string(),
    loadedSkills: v.array(v.union(v.literal('tasks'), v.literal('images'))),
    skillLoadingAllowed: v.boolean(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const binding = await ctx.db.get(args.bindingId);
    if (!binding || binding.projectId !== args.projectId || binding.userId !== args.userId) {
      throw new Error('Agent conversation binding is invalid');
    }
    await ctx.db.insert('agentRunMetrics', {
      projectId: args.projectId,
      userId: args.userId,
      threadBindingId: args.bindingId,
      jobId: args.jobId,
      provider: args.provider,
      model: args.model,
      loadedSkills: args.loadedSkills,
      skillLoadingAllowed: args.skillLoadingAllowed,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      createdAt: Date.now(),
    });
  },
});

export const generateResponse = internalAction({
  args: {
    bindingId: v.id('agentThreadBindings'),
    promptMessageId: v.string(),
    jobId: v.string(),
    context: chatContextArgs,
    resumeApproval: v.optional(v.boolean()),
    allowSkillLoading: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { bindingId, promptMessageId, jobId, context, resumeApproval, allowSkillLoading },
  ) => {
    const binding = await ctx.runQuery(internal.chat.getRunBinding, { bindingId });
    await ctx.runMutation(internal.chat.setRunState, {
      bindingId,
      promptMessageId,
      runStatus: 'running',
    });
    try {
      assertChatConfigured();
      const today = normalizedLocalDate(context?.localDate);
      const agentCtx = {
        ...ctx,
        projectId: binding.projectId,
        actorId: binding.userId,
        bindingId: binding._id,
        jobId,
        today,
      } satisfies typeof ctx & FieldPilotAgentContext;
      const canWrite = binding.role !== 'viewer';
      const loadedSkills = new Set<AgentSkillKey>();
      if (resumeApproval) {
        loadedSkills.add('tasks');
        loadedSkills.add('images');
      }
      const agent = createFieldPilotAgent(canWrite, loadedSkills);
      const scope = {
        userId: `${binding.projectId}:${binding.userId}`,
        threadId: binding.componentThreadId,
      };
      const prompt = {
        promptMessageId,
        instructions: fieldPilotInstructions(context as ChatContext | undefined),
        prepareStep: async () => ({
          activeTools: activeFieldPilotToolNames(
            canWrite,
            loadedSkills,
            resumeApproval || allowSkillLoading !== false,
          ),
        }),
      };
      let approvalIds: string[];
      let usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
      const providerInfo = chatProviderInfo();
      if (providerInfo.provider === 'openai') {
        const result = await agent.streamText(agentCtx, scope, prompt, {
          saveStreamDeltas: true,
        });
        approvalIds = approvalIdsFromSavedMessages(result.savedMessages);
        const resolvedUsage = await result.usage;
        usage = {
          inputTokens: resolvedUsage.inputTokens,
          outputTokens: resolvedUsage.outputTokens,
          totalTokens: resolvedUsage.totalTokens,
        };
      } else {
        // The existing provider contract guarantees Chat Completions and tool
        // calling, not SSE streaming. Keep that path non-streaming so current
        // OpenAI-compatible gateways continue to work unchanged.
        const result = await agent.generateText(agentCtx, scope, prompt);
        approvalIds = approvalIdsFromSavedMessages(result.savedMessages);
        usage = {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        };
      }
      await ctx.runMutation(internal.chat.recordRunMetric, {
        projectId: binding.projectId,
        userId: binding.userId,
        bindingId,
        jobId,
        provider: providerInfo.provider,
        model: providerInfo.model,
        loadedSkills: [...loadedSkills],
        skillLoadingAllowed: resumeApproval || allowSkillLoading !== false,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
      await ctx.runMutation(internal.chat.setRunState, {
        bindingId,
        promptMessageId,
        runStatus: 'idle',
        jobId,
        approvalIds,
      });
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message.startsWith('AI chat is not configured')
          ? cause.message
          : 'The AI assistant is unavailable right now. Try again in a moment.';
      console.error('FieldPilot agent run failed', cause instanceof Error ? cause.name : 'Error');
      await ctx.runMutation(internal.chat.setRunState, {
        bindingId,
        promptMessageId,
        runStatus: 'failed',
        error: message,
      });
    }
  },
});
