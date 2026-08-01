import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

interface NoticeProps {
  tone: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  onDismiss?: () => void;
}

const toneStyles: Record<
  NoticeTone,
  {
    icon: typeof CheckCircle2;
    container: string;
    iconContainer: string;
    iconColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    container: 'border-ok/30 bg-surface',
    iconContainer: 'bg-accent-soft',
    iconColor: 'text-ok',
  },
  error: {
    icon: AlertCircle,
    container: 'border-danger/30 bg-danger-soft',
    iconContainer: 'bg-danger/10',
    iconColor: 'text-danger',
  },
  warning: {
    icon: TriangleAlert,
    container: 'border-warn/30 bg-surface',
    iconContainer: 'bg-surface2',
    iconColor: 'text-warn',
  },
  info: {
    icon: Info,
    container: 'border-accent/25 bg-accent-soft',
    iconContainer: 'bg-accent/10',
    iconColor: 'text-accent',
  },
};

export function Notice({
  tone,
  title,
  children,
  className,
  compact = false,
  onDismiss,
}: NoticeProps) {
  const styles = toneStyles[tone];
  const Icon = styles.icon;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-md border px-3.5 py-3 text-sm',
        styles.container,
        compact && 'gap-2 px-2.5 py-2 text-xs',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
          styles.iconContainer,
          compact && 'size-5',
        )}
      >
        <Icon className={cn('size-4', compact && 'size-3.5', styles.iconColor)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 leading-5">
        {title && <p className="font-semibold text-t1">{title}</p>}
        <div className={cn('text-t2', title && 'mt-0.5')}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-t3 transition-colors hover:bg-black/5 hover:text-t1"
          onClick={onDismiss}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface ToastInput {
  tone: NoticeTone;
  title: string;
  message?: ReactNode;
  duration?: number;
}
