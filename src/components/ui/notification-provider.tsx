import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Notice, type ToastInput } from './notice';
import { NotificationContext } from './notification-context';

interface Toast extends ToastInput {
  id: string;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const duration = toast.duration ?? (toast.tone === 'error' ? 7_000 : 4_500);

  useEffect(() => {
    if (duration <= 0) return;
    const timeout = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onDismiss]);

  return (
    <div
      className="pointer-events-auto w-full max-w-sm"
      style={{ animation: 'fp-toast-in var(--fp-motion-duration) var(--fp-motion-ease) both' }}
    >
      <Notice tone={toast.tone} title={toast.title} onDismiss={onDismiss}>
        {toast.message}
      </Notice>
    </div>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 top-18 z-100 flex flex-col items-end gap-2 sm:left-auto sm:w-full sm:max-w-sm"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sequence = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((input: ToastInput) => {
    const id = `toast-${sequence.current++}`;
    setToasts((current) => [...current, { ...input, id }].slice(-4));
    return id;
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </NotificationContext.Provider>
  );
}
