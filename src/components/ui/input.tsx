import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-xs border border-line bg-surface px-3 text-sm text-t1 placeholder:text-t3',
        'transition-[border-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease)',
        'hover:border-line-strong focus:border-accent focus-visible:shadow-none focus:ring-2 focus:ring-accent/25 outline-none',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
