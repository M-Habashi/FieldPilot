import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none cursor-pointer transition-[background,color,border-color,box-shadow,transform] duration-(--fp-dur-fast) ease-(--fp-ease) disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-on-accent hover:bg-accent-hover shadow-e1 rounded-md',
        secondary:
          'bg-surface text-t1 border border-line hover:border-line-strong hover:bg-surface2 rounded-md',
        ghost: 'text-t2 hover:bg-surface2 hover:text-t1 rounded-md',
        outline: 'border border-line-strong text-t1 hover:bg-surface2 rounded-md',
        danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white rounded-md',
        toggle:
          'text-t2 hover:bg-surface2 hover:text-t1 rounded-md data-[on=true]:bg-accent data-[on=true]:text-on-accent data-[on=true]:shadow-e1',
        text: 'rounded-none text-t3 hover:text-t1 active:scale-100 data-[active=true]:text-accent',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        icon: 'size-9 [&_svg]:size-4',
        iconSm: 'size-8 [&_svg]:size-4',
        iconXs: 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
