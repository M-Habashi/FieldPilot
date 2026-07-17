import { Check, Palette } from 'lucide-react';
import { DESIGNS } from '../themes/designs';
import { useProject } from '../store/project';
import { Button } from './ui/button';
import { Dropdown, DropdownItem, DropdownLabel } from './ui/dropdown-menu';

export function DesignSwitcher() {
  const design = useProject((s) => s.design);
  const setDesign = useProject((s) => s.setDesign);

  return (
    <Dropdown
      trigger={
        <Button variant="text" size="sm" aria-label="Switch design">
          <Palette />
          <span className="hidden sm:inline">{DESIGNS.find((d) => d.id === design)?.label ?? 'Design'}</span>
        </Button>
      }
    >
      {(close) => (
        <>
          <DropdownLabel>Design</DropdownLabel>
          {DESIGNS.map((d) => (
            <DropdownItem
              key={d.id}
              onClick={() => {
                setDesign(d.id);
                close();
              }}
            >
              <span className="flex size-4 items-center justify-center">
                {d.id === design && <Check className="size-4 text-accent" />}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{d.label}</span>
                <span className="block text-xs text-t3">{d.tagline}</span>
              </span>
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
