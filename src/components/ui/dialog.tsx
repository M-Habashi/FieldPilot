import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4"
      style={{ animation: 'fp-fade-in var(--fp-dur-fast) var(--fp-ease) both' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-base font-semibold text-t1">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1.5 text-sm text-t2">
            {description}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-t1 hover:bg-surface2 cursor-pointer"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            className={cn(
              'h-9 rounded-md px-3.5 text-sm font-medium cursor-pointer text-white',
              danger ? 'bg-danger hover:opacity-90' : 'bg-accent hover:bg-accent-hover',
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
