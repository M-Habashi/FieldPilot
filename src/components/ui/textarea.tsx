import * as React from 'react';
import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full min-h-20 rounded-xs border border-line bg-surface px-3 py-2 text-sm text-t1 placeholder:text-t3 resize-y',
      'transition-[border-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease)',
      'hover:border-line-strong focus:border-accent focus-visible:shadow-none focus:ring-2 focus:ring-accent/25 outline-none',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
