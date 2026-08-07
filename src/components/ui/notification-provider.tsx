import { useCallback, useMemo, type ReactNode } from 'react';
import { NotificationContext } from './notification-context';

/**
 * Toast notifications were removed by request: the top notification bar is
 * gone for every screen. `notify`/`dismiss` remain working no-op sinks so
 * all call sites keep functioning, but nothing is rendered.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const notify = useCallback(() => '', []);
  const dismiss = useCallback(() => {}, []);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
