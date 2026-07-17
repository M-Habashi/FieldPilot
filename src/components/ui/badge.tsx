import * as React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Base color; rendered as a soft tinted chip. */
  color?: string;
  dot?: boolean;
}

export function Badge({ className, color, dot, children, style, ...props }: BadgeProps) {
  return (
    <span
      className={cn('fp-chip inline-flex items-center gap-1 px-2 py-1', className)}
      style={{
        color: color,
        background: color ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
        ...style,
      }}
      {...props}
    >
      {dot && (
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ background: color ?? 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}
