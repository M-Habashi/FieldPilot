import { ChevronRight, Layers } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProject } from '../store/project';

/**
 * Left rail. Two genuinely distinct states (no clipped wide sidebar):
 *  - collapsed → a narrow 56px icon-only rail (labels hidden, icons centered)
 *  - expanded  → a 200px rail with icon + label
 * A compact chevron sits just outside the rail's top edge and follows that
 * edge as the sidebar expands.
 */
export function Sidebar({ onShowPlans }: { onShowPlans?: () => void } = {}) {
  const collapsed = useProject((s) => s.sidebarCollapsed);
  const toggleSidebar = useProject((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'fp-sidebar absolute inset-y-0 left-0 z-50 flex flex-col transition-[width,box-shadow] duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
        collapsed ? 'w-14' : 'w-50',
        !collapsed && 'shadow-e2',
      )}
      aria-label="Primary"
    >
      <nav className="flex-1 space-y-1 p-2">
        <SidebarItem
          icon={<Layers />}
          label="Plans"
          active
          collapsed={collapsed}
          onClick={onShowPlans}
        />
      </nav>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="absolute top-1 left-full flex size-8 items-center justify-center rounded-md text-t3 transition-[color,background-color,transform] duration-(--fp-motion-duration) ease-(--fp-motion-ease) hover:bg-surface2 hover:text-t1 cursor-pointer"
      >
        <ChevronRight
          className={cn(
            'size-4 shrink-0 transition-transform duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
            !collapsed && 'rotate-180',
          )}
        />
      </button>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    'flex h-10 w-full items-center rounded-md text-sm font-medium [&_svg]:size-5 [&_svg]:shrink-0',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3.5',
    active ? 'bg-accent-soft text-accent' : 'text-t2',
    onClick && 'cursor-pointer',
  );
  const content = (
    <>
      {icon}
      {!collapsed && <span className="truncate whitespace-nowrap">{label}</span>}
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span
      className={className}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </span>
  );
}
