import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { components } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const aiChatRateLimiter = new RateLimiter(components.rateLimiter, {
  aiChatBurst: { kind: 'token bucket', rate: 6, period: MINUTE, capacity: 3 },
  aiChatHourly: { kind: 'fixed window', rate: 60, period: HOUR },
});

export async function limitAiChat(ctx: MutationCtx, userId: Id<'users'>) {
  const key = userId as string;
  const burst = await aiChatRateLimiter.limit(ctx, 'aiChatBurst', { key });
  if (!burst.ok) throwRateLimitError(burst.retryAfter);
  const hourly = await aiChatRateLimiter.limit(ctx, 'aiChatHourly', { key });
  if (!hourly.ok) throwRateLimitError(hourly.retryAfter);
}

function throwRateLimitError(retryAfter: number): never {
  const seconds = Math.max(1, Math.ceil(retryAfter / 1000));
  throw new Error(`AI message limit reached. Try again in about ${seconds} seconds.`);
}
