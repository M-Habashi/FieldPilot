import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { useModalFocus } from '../../hooks/useModalFocus';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  showCancel?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmDisabled,
  showCancel = true,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useModalFocus(open, dialogRef, onCancel);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4"
      style={{ animation: 'fp-fade-in var(--fp-dur-fast) var(--fp-ease) both' }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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
          <div id={descriptionId} className="mt-1.5 text-sm text-t2">
            {description}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {showCancel && (
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-t1 hover:bg-surface2"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            autoFocus
            disabled={confirmDisabled}
            className={cn(
              'h-9 whitespace-nowrap rounded-md px-3.5 text-sm font-medium cursor-pointer text-white disabled:cursor-wait disabled:opacity-60',
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
