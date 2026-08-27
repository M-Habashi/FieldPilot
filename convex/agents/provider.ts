import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

type ChatEnvironmentName =
  'AI_CHAT_API_KEY' | 'AI_CHAT_BASE_URL' | 'AI_CHAT_MODEL' | 'AI_CHAT_PROVIDER';

function environment(name: ChatEnvironmentName) {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

export function assertChatConfigured() {
  if (!environment('AI_CHAT_API_KEY')) {
    throw new Error(
      'AI chat is not configured yet. Set AI_CHAT_API_KEY (and optionally AI_CHAT_PROVIDER, AI_CHAT_BASE_URL, and AI_CHAT_MODEL) on the Convex deployment.',
    );
  }
}

export function chatProviderInfo() {
  const provider = environment('AI_CHAT_PROVIDER')?.trim().toLocaleLowerCase() ?? 'compatible';
  if (provider !== 'compatible' && provider !== 'openai') {
    throw new Error('AI_CHAT_PROVIDER must be either "compatible" or "openai"');
  }
  return {
    provider,
    baseURL: (environment('AI_CHAT_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: environment('AI_CHAT_MODEL') ?? DEFAULT_MODEL,
  } as const;
}

export function fieldPilotLanguageModel() {
  const apiKey = environment('AI_CHAT_API_KEY') ?? 'not-configured';
  const { provider, baseURL, model } = chatProviderInfo();
  if (provider === 'openai') {
    return createOpenAI({ apiKey, baseURL }).responses(model);
  }
  return createOpenAICompatible({
    name: 'fieldpilot-compatible',
    apiKey,
    baseURL,
  }).chatModel(model);
}
