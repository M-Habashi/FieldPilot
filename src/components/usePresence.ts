import { useEffect, useState } from 'react';

export type PresenceState = 'open' | 'closing';

/**
 * Small presence hook so an element can animate BOTH in and out.
 *
 * While `present` is true the element is mounted with data-state="open".
 * When `present` flips to false we keep it mounted, switch it to
 * data-state="closing" (which plays the exit animation), and only unmount
 * once that animation ends. Wire the returned `onAnimationEnd` to the same
 * element whose CSS animation you are driving.
 */
export function usePresence(present: boolean): {
  mounted: boolean;
  state: PresenceState;
  onAnimationEnd: (e: { target: EventTarget; currentTarget: EventTarget }) => void;
} {
  const [mounted, setMounted] = useState(present);
  const [state, setState] = useState<PresenceState>('open');

  useEffect(() => {
    if (present) {
      setMounted(true);
      setState('open');
    } else if (mounted) {
      setState('closing');
    }
  }, [present, mounted]);

  const onAnimationEnd = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    // Ignore animations bubbling up from descendants.
    if (e.target !== e.currentTarget) return;
    if (!present) setMounted(false);
  };

  return { mounted, state, onAnimationEnd };
}
