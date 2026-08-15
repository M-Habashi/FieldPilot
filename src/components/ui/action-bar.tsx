import * as React from 'react';
import { ChevronDown, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

/**
 * The workspace action bar: the strip of tool controls directly under the app
 * header. Every tab (plans, photo map, …) renders the same shell so heights,
 * spacing and button styling stay identical across views.
 */

interface ActionBarProps {
  /** Accessible name for the bar, e.g. "Plan tools". */
  label: string;
  /** Wire up to open the mobile sidebar; the button only shows below `md`. */
  onOpenNav?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function ActionBar({ label, onOpenNav, className, children }: ActionBarProps) {
  return (
    <header
      className={cn(
        'fp-actionbar z-40 flex shrink-0 items-center gap-0.5 px-1.5 text-xs sm:gap-1 sm:px-2.5',
        className,
      )}
      aria-label={label}
    >
      {onOpenNav && (
        <Button
          variant="ghost"
          size="iconSm"
          className="shrink-0 md:hidden"
          aria-label="Open navigation menu"
          onClick={onOpenNav}
        >
          <Menu />
        </Button>
      )}
      {children}
    </header>
  );
}

interface ActionBarGroupProps {
  /** `end` pushes the group to the far edge of the bar. */
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

export function ActionBarGroup({ align = 'start', className, children }: ActionBarGroupProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-0.5 sm:gap-1',
        align === 'end' && 'ml-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ActionBarSeparator() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-line sm:mx-1" aria-hidden />;
}

/** Compact trailing value on a button — a count, or an on/off state. */
export function ActionBarBadge({ children }: { children: React.ReactNode }) {
  return <span className="hidden font-mono text-[10px] sm:inline">{children}</span>;
}

/** Trailing status light on a button, e.g. sheet calibrated / not calibrated. */
export function ActionBarDot({ tone }: { tone: 'ok' | 'warn' }) {
  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', tone === 'ok' ? 'bg-ok' : 'bg-warn')}
      aria-hidden
    />
  );
}

/** Breakpoint at which the button's text label joins its icon. */
type LabelFrom = 'always' | 'sm' | 'lg' | 'never';

const LABEL_VISIBILITY: Record<LabelFrom, string> = {
  always: '',
  sm: 'hidden sm:inline',
  lg: 'hidden lg:inline',
  never: '',
};

export interface ActionBarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** Text label; also the accessible name unless `aria-label` is passed. */
  label: string;
  labelFrom?: LabelFrom;
  /** Tool is engaged / panel is open — paints the control accent. */
  active?: boolean;
  /** Prominent primary workspace action. Use sparingly. */
  emphasis?: boolean;
  /** Adds the chevron shared by every menu trigger in the bar. */
  menu?: boolean;
  /** Trailing decoration, e.g. `ActionBarBadge` or `ActionBarDot`. */
  children?: React.ReactNode;
}

export const ActionBarButton = React.forwardRef<HTMLButtonElement, ActionBarButtonProps>(
  (
    {
      icon,
      label,
      labelFrom = 'sm',
      active = false,
      emphasis = false,
      menu = false,
      className,
      title,
      children,
      ...props
    },
    ref,
  ) => (
    <Button
      ref={ref}
      variant={emphasis ? 'default' : 'text'}
      size="sm"
      data-active={active}
      aria-label={label}
      title={title ?? label}
      className={cn('shrink-0', active && 'text-accent hover:text-accent-hover', className)}
      {...props}
    >
      {icon}
      {labelFrom !== 'never' && <span className={LABEL_VISIBILITY[labelFrom]}>{label}</span>}
      {children}
      {menu && <ChevronDown className="hidden sm:block" />}
    </Button>
  ),
);
ActionBarButton.displayName = 'ActionBarButton';
