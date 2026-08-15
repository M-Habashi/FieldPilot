import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';

interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

interface SelectProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  ({ id, value, options, onValueChange, className, ariaLabel }, forwardedRef) => {
    const generatedId = useId();
    const triggerId = id ?? `${generatedId}-trigger`;
    const listboxId = `${generatedId}-listbox`;
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const selected = options[selectedIndex];
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(selectedIndex);

    useEffect(() => {
      if (!open) setActiveIndex(selectedIndex);
    }, [open, selectedIndex]);

    useEffect(() => {
      if (!open) return;
      const frame = requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
      return () => cancelAnimationFrame(frame);
    }, [activeIndex, open]);

    useEffect(() => {
      if (!open) return;
      const closeOnOutsidePress = (event: PointerEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', closeOnOutsidePress);
      return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
    }, [open]);

    const openAt = (index: number) => {
      if (!options.length) return;
      setActiveIndex(Math.min(Math.max(index, 0), options.length - 1));
      setOpen(true);
    };

    const closeAndFocusTrigger = () => {
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const selectOption = (index: number) => {
      const option = options[index];
      if (!option) return;
      onValueChange(option.value);
      closeAndFocusTrigger();
    };

    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openAt(selectedIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openAt(selectedIndex);
      } else if (event.key === 'Home') {
        event.preventDefault();
        openAt(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        openAt(options.length - 1);
      } else if ((event.key === 'Enter' || event.key === ' ') && !open) {
        event.preventDefault();
        openAt(selectedIndex);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        closeAndFocusTrigger();
      }
    };

    const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index + 1) % options.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index - 1 + options.length) % options.length);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(options.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectOption(index);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeAndFocusTrigger();
      } else if (event.key === 'Tab') {
        setOpen(false);
      }
    };

    return (
      <div ref={rootRef} className={cn('relative', open && 'z-50')}>
        <button
          ref={(node) => {
            triggerRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          className={cn(
            'fp-select-trigger flex h-7 w-full cursor-pointer items-center gap-1.5 bg-transparent text-left text-xs text-t1 outline-none',
            'transition-colors duration-(--fp-dur-fast) hover:text-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
            className,
          )}
          onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
          onKeyDown={handleTriggerKeyDown}
        >
          {selected?.color && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: selected.color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
          <ChevronDown
            className={cn('size-3.5 shrink-0 text-t3 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={ariaLabel ? undefined : triggerId}
            aria-label={ariaLabel}
            className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-line bg-surface py-1 shadow-e2"
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={index === activeIndex ? 0 : -1}
                className={cn(
                  'fp-select-option flex min-h-9 w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left text-xs text-t1 outline-none',
                  'hover:bg-surface2 focus:bg-surface2 focus:text-accent',
                )}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => selectOption(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {option.value === value && <Check className="text-accent" />}
                </span>
                {option.color && (
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: option.color }}
                  />
                )}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
