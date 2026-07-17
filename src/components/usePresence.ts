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
  // `present` participates in `mounted` directly so an opening panel mounts in
  // the same render as the store update. Waiting for an effect here creates one
  // paint with the old full-width viewer before the drawer appears, which reads
  // as a flash when opening Properties from a pin.
  const [retained, setRetained] = useState(present);
  const mounted = present || retained;
  const state: PresenceState = present ? 'open' : 'closing';

  useEffect(() => {
    if (present) setRetained(true);
  }, [present]);

  const onAnimationEnd = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    // Ignore animations bubbling up from descendants.
    if (e.target !== e.currentTarget) return;
    if (!present) setRetained(false);
  };

  return { mounted, state, onAnimationEnd };
}
