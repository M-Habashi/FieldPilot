import { ChevronRight, Layers } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProject } from '../store/project';

/**
 * Left rail. Two genuinely distinct states (no clipped wide sidebar):
 *  - collapsed → a narrow 56px icon-only rail (labels hidden, icons centered)
 *  - expanded  → a 200px rail with icon + label
 * A compact chevron button sits at the rail's bottom edge to toggle.
 */
export function Sidebar() {
  const collapsed = useProject((s) => s.sidebarCollapsed);
  const toggleSidebar = useProject((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'fp-sidebar absolute inset-y-0 left-0 z-20 flex flex-col transition-[width,box-shadow] duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
        collapsed ? 'w-14' : 'w-50',
        !collapsed && 'shadow-e2',
      )}
      aria-label="Primary"
    >
      <nav className="flex-1 space-y-1 p-2">
        <SidebarItem icon={<Layers />} label="Plans" active collapsed={collapsed} />
      </nav>

      <div className={cn('p-2', collapsed ? 'flex justify-center' : 'flex justify-end')}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="flex size-8 items-center justify-center rounded-md text-t3 transition-colors duration-(--fp-dur-fast) hover:bg-surface2 hover:text-t1 cursor-pointer"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
              !collapsed && 'rotate-180',
            )}
          />
        </button>
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
        'flex h-10 items-center rounded-md text-sm font-medium [&_svg]:size-5 [&_svg]:shrink-0',
        collapsed ? 'justify-center px-0' : 'gap-3 px-3.5',
        active ? 'bg-accent-soft text-accent' : 'text-t2',
      )}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {!collapsed && <span className="truncate whitespace-nowrap">{label}</span>}
    </span>
  );
}
