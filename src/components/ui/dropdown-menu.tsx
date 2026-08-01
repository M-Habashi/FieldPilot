import * as React from 'react';
import { cn } from '../../lib/utils';

interface DropdownProps {
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
}

/** Minimal dropdown: click trigger to open, click outside or Esc to close. */
export function Dropdown({ trigger, align = 'right', children, className }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={rootRef} className="relative z-50">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'fp-dropdown-menu absolute top-full mt-1.5 z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-e3',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            className,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-t2 cursor-pointer',
        'hover:text-t1 transition-colors duration-(--fp-dur-fast) [&_svg]:size-3.5 [&_svg]:text-current',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
