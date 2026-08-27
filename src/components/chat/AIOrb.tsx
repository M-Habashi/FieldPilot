import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { cn } from '../../lib/utils';

const ORB_SIZES = {
  sm: 20,
  md: 20,
  lg: 64,
} as const;

/**
 * FieldPilot AI mark: a dotted thought-orb from the thinking-orbs package.
 * The idle mark uses the composing state; in-flight work can opt into a
 * searching orb so the animation communicates that the assistant is busy.
 * Canvas-rendered, pauses offscreen, and renders a static frame under
 * prefers-reduced-motion. The theme is pinned to light because every chat
 * surface it sits on is light.
 */
export function AIOrb({
  size = 'md',
  state = 'composing',
  className,
}: {
  size?: keyof typeof ORB_SIZES;
  state?: OrbState;
  className?: string;
}) {
  return (
    <ThinkingOrb
      state={state}
      size={ORB_SIZES[size]}
      speed={1}
      theme="light"
      className={cn('fp-ai-orb', className)}
      aria-label="FieldPilot AI"
    />
  );
}
