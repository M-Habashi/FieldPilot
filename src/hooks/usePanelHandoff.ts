import { useEffect, type AnimationEvent } from 'react';

const HANDOFF_FALLBACK_MS = 400;

/**
 * Reveals an incoming right panel from zero width to the outgoing panel's
 * measured width. The outgoing panel can then close without exposing the
 * workspace beneath it during the handoff.
 */
export function usePanelHandoff({
  incoming,
  targetWidth,
  onComplete,
}: {
  incoming: boolean;
  targetWidth: number | null;
  onComplete: () => void;
}) {
  useEffect(() => {
    if (!incoming) return;
    const timeout = window.setTimeout(onComplete, HANDOFF_FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [incoming, onComplete]);

  const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (
      incoming &&
      event.target === event.currentTarget &&
      event.animationName === 'fp-panel-handoff-in'
    ) {
      onComplete();
    }
  };

  return {
    handoffWidth: incoming ? Math.max(0, targetWidth ?? 0) : null,
    onAnimationEnd,
  };
}
