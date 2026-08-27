import { ThinkingOrb } from 'thinking-orbs';
import { cn } from '../../lib/utils';

const ORB_SIZES = {
  sm: 20,
  md: 20,
  lg: 64,
} as const;

/**
 * FieldPilot AI mark: the dotted "composing" thought-orb (an undulating
 * multi-band sash) from the thinking-orbs package, run at normal speed.
 * Canvas-rendered, pauses offscreen, and renders a static frame under
 * prefers-reduced-motion. The theme is pinned to light because every chat
 * surface it sits on is light.
 */
export function AIOrb({
  size = 'md',
  className,
}: {
  size?: keyof typeof ORB_SIZES;
  className?: string;
}) {
  return (
    <ThinkingOrb
      state="composing"
      size={ORB_SIZES[size]}
      speed={1}
      theme="light"
      className={cn('fp-ai-orb', className)}
      aria-label="FieldPilot AI"
    />
  );
}
