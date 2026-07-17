import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-9 w-full appearance-none rounded-xs border border-line bg-surface pl-3 pr-8 text-sm text-t1 cursor-pointer',
        'transition-[border-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease)',
        'hover:border-line-strong focus:border-accent focus-visible:shadow-none focus:ring-2 focus:ring-accent/25 outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-t3" />
  </div>
));
Select.displayName = 'Select';
