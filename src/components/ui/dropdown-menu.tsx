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
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  const focusTrigger = React.useCallback(() => {
    triggerRef.current?.querySelector<HTMLElement>('button, [href], [tabindex="0"]')?.focus();
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        requestAnimationFrame(focusTrigger);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [focusTrigger, open]);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []),
    ];
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(currentIndex + direction + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const accessibleTrigger = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
      })
    : trigger;

  return (
    <div ref={rootRef} className="relative z-50">
      <div ref={triggerRef} onClick={() => setOpen((v) => !v)}>
        {accessibleTrigger}
      </div>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          onKeyDown={handleMenuKeyDown}
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
      role="menuitem"
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

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-t3 uppercase">
      {children}
    </div>
  );
}
