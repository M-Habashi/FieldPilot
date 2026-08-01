import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';

const BRAND_SIZES = {
  sm: { root: 'gap-1.5 text-sm', mark: 'size-5' },
  md: { root: 'gap-2 text-lg', mark: 'size-6' },
  lg: { root: 'gap-2 text-xl', mark: 'size-7' },
} as const;

type BrandProps = ComponentPropsWithoutRef<'span'> & {
  size?: keyof typeof BRAND_SIZES;
};

export function Brand({ className, size = 'md', ...props }: BrandProps) {
  const sizing = BRAND_SIZES[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-display font-bold tracking-tight text-t1',
        sizing.root,
        className,
      )}
      {...props}
    >
      <img src="/favicon.svg" alt="" aria-hidden="true" className={cn('shrink-0', sizing.mark)} />
      <span>FieldPilot</span>
    </span>
  );
}
