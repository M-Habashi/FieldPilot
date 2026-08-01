import { createContext } from 'react';
import type { ToastInput } from './notice';

export interface NotificationContextValue {
  notify: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);
