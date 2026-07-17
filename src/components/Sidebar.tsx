import { ChevronLeft, Layers, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProject } from '../store/project';

const EXPANDED_WIDTH = 200;
const COLLAPSED_WIDTH = 56;

export function Sidebar() {
  const collapsed = useProject((s) => s.sidebarCollapsed);
  const toggleSidebar = useProject((s) => s.toggleSidebar);

  return (
    <aside
      className="fp-sidebar z-20 shrink-0 overflow-hidden transition-[width] duration-(--fp-dur-med) ease-(--fp-ease)"
      style={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      aria-label="Primary"
    >
      {/* Fixed inner width so labels never reflow-squish while the rail collapses. */}
      <div className="flex h-full flex-col" style={{ width: EXPANDED_WIDTH }}>
        <nav className="flex-1 px-2 py-3">
          <SidebarItem icon={<Layers />} label="Plans" active collapsed={collapsed} />
        </nav>

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="mx-2 mb-2 flex h-9 items-center gap-3 rounded-md px-3 text-t2 transition-colors duration-(--fp-dur-fast) hover:bg-surface2 hover:text-t1 cursor-pointer"
        >
          <ChevronLeft
            className={cn(
              'size-4 shrink-0 transition-transform duration-(--fp-dur-med) ease-(--fp-ease)',
              collapsed && 'rotate-180',
            )}
          />
          <span className="whitespace-nowrap text-xs font-medium">Collapse</span>
        </button>

        {/* User badge — static display, pinned to the bottom. */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <User className="size-4" />
          </span>
          <span className="min-w-0 whitespace-nowrap">
            <span className="block truncate text-xs font-medium text-t1">Site user</span>
            <span className="block truncate text-[11px] text-t3">On this device</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
}) {
  return (
    <span
      className={cn(
        'flex h-10 items-center gap-3 rounded-md px-3.5 text-sm font-medium [&_svg]:size-5 [&_svg]:shrink-0',
        active ? 'bg-accent-soft text-accent' : 'text-t2',
      )}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
