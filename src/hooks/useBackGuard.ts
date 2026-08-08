import { useEffect, useRef } from 'react';

/**
 * Makes the phone's back gesture dismiss one layer of UI instead of leaving the
 * app — the touch equivalent of Escape.
 *
 * A history entry is pushed while any guard is active, so the gesture pops that
 * entry rather than navigating away. Handlers form a stack and the most
 * recently registered runs first, so an inner layer (a context menu) closes
 * before an outer one (the project workspace).
 *
 * The entry is deliberately NOT reclaimed when a layer closes by other means:
 * doing so would call history.back() during unmount too, navigating the user
 * somewhere they never asked to go. The cost is that closing a pane by tapping
 * and then immediately swiping back can spend one no-op swipe.
 */
type BackHandler = () => void;

const handlers: BackHandler[] = [];
let guardPushed = false;
let listening = false;

function armGuard(): void {
  if (handlers.length === 0 || guardPushed) return;
  guardPushed = true;
  window.history.pushState({ fpBackGuard: true }, '');
}

function onPopState(): void {
  if (!guardPushed) return;
  // Our entry is gone now; a further back should leave the page unless a
  // remaining layer re-arms below.
  guardPushed = false;
  const handler = handlers[handlers.length - 1];
  if (!handler) return;
  handler();
  // Re-arm after React has applied the dismissal, so handlers that just became
  // inactive have unregistered and the next gesture targets the layer below.
  window.setTimeout(armGuard, 0);
}

export function useBackGuard(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const handler = () => onBackRef.current();
    handlers.push(handler);
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    armGuard();
    return () => {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  }, [active]);
}
