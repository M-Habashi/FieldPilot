import { useContext } from 'react';
import { NotificationContext } from './notification-context';

export function useNotify() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotify must be used inside NotificationProvider');
  return context;
}
