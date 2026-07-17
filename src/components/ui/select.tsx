import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dropdown, DropdownItem } from './dropdown-menu';

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
}

export function Select({ id, value, options, onValueChange, className }: SelectProps) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Dropdown
      align="left"
      className="min-w-full whitespace-nowrap"
      trigger={
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          className={cn(
            'flex h-7 w-full items-center gap-1.5 bg-transparent text-left text-xs text-t1 outline-none cursor-pointer',
            'transition-colors duration-(--fp-dur-fast) hover:text-accent focus-visible:text-accent focus-visible:shadow-none',
            className,
          )}
        >
          {selected?.color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: selected.color }} />}
          <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-t3" />
        </button>
      }
    >
      {(close) => (
        <div role="listbox" aria-labelledby={id}>
          {options.map((option) => (
            <DropdownItem
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onValueChange(option.value);
                close();
              }}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {option.value === value && <Check className="text-accent" />}
              </span>
              {option.color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: option.color }} />}
              <span>{option.label}</span>
            </DropdownItem>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
