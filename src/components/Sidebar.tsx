import { useRef } from 'react';
import { ChevronsLeftRight, Layers, Map, Sigma } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProject } from '../store/project';

/**
 * Left rail. Two genuinely distinct states (no clipped wide sidebar):
 *  - collapsed → a narrow 56px icon-only rail (labels hidden, icons centered)
 *  - expanded  → a 200px rail with icon + label
 * The right border is the control: drag it (right of the 128px midpoint
 * expands, left collapses), click it to toggle, or focus it and use the
 * arrow keys. The handle floats just outside the rail's edge so it never
 * overlaps the app content beside it.
 */
export function Sidebar({
  onShowPlans,
  onShowMap,
  onShowQuantities,
  activeItem = 'plans',
}: {
  onShowPlans?: () => void;
  onShowMap?: () => void;
  onShowQuantities?: () => void;
  activeItem?: 'plans' | 'map' | 'quantities';
} = {}) {
  const collapsed = useProject((s) => s.sidebarCollapsed);
  const toggleSidebar = useProject((s) => s.toggleSidebar);
  const setSidebarCollapsed = useProject((s) => s.setSidebarCollapsed);
  const mobileOpen = useProject((s) => s.sidebarMobileOpen);
  const setMobileOpen = useProject((s) => s.setSidebarMobileOpen);
  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a convenience; window listeners below still work.
    }
    dragStateRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    const onPointerMove = (moveEvent: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (Math.hypot(dx, dy) >= 4) state.moved = true;
      setSidebarCollapsed(moveEvent.clientX <= 128);
    };
    const onPointerUp = () => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (state && !state.moved) toggleSidebar();
      handle.blur();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarCollapsed(true);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarCollapsed(false);
    }
  };

  // Phones: the rail becomes an off-canvas drawer, hidden until the hamburger
  // button opens it. Desktop keeps the collapsed/expanded rail behavior.
  const navTo = (navigate?: () => void) => () => {
    navigate?.();
    setMobileOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        className={cn(
          'fp-sidebar-backdrop absolute inset-0 z-40 md:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        data-state={mobileOpen ? 'open' : 'closed'}
        className={cn(
          'fp-sidebar absolute inset-y-0 left-0 z-50 flex flex-col',
          collapsed ? 'md:w-14' : 'md:w-50',
          'max-md:w-64 max-md:shadow-e3',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
          !collapsed && 'md:shadow-e2',
        )}
        aria-label="Primary"
      >
        <nav className="flex-1 space-y-1 p-2">
          <SidebarItem
            icon={<Layers />}
            label="Plans"
            active={activeItem === 'plans'}
            collapsed={collapsed && !mobileOpen}
            onClick={navTo(onShowPlans)}
          />
          <SidebarItem
            icon={<Map />}
            label="Map"
            active={activeItem === 'map'}
            collapsed={collapsed && !mobileOpen}
            onClick={navTo(onShowMap)}
          />
          <SidebarItem
            icon={<Sigma />}
            label="Quantities"
            active={activeItem === 'quantities'}
            collapsed={collapsed && !mobileOpen}
            onClick={navTo(onShowQuantities)}
          />
        </nav>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
          className="fp-resize-handle group absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize items-center justify-center md:flex"
        >
          <span className="pointer-events-none flex h-7 w-1.5 items-center justify-center rounded-full bg-line-strong opacity-0 transition-opacity duration-(--fp-dur-fast) group-hover:opacity-100 group-focus-visible:opacity-100">
            <ChevronsLeftRight className="size-3 text-t2" />
          </span>
        </div>
      </aside>
    </>
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
    'flex h-10 w-full items-center rounded-md text-sm font-medium transition-[background-color,color,gap,padding] duration-(--fp-dur-fast) ease-(--fp-ease) [&_svg]:size-5 [&_svg]:shrink-0',
    collapsed ? 'justify-center gap-0 px-0' : 'gap-3 px-3.5',
    active ? 'bg-accent-soft text-accent' : 'text-t2',
    onClick && 'cursor-pointer',
  );
  const content = (
    <>
      {icon}
      <span
        aria-hidden={collapsed}
        className={cn(
          'fp-sidebar-item-label min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
          collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-40 translate-x-0 opacity-100',
        )}
      >
        {label}
      </span>
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={className} aria-current={active ? 'page' : undefined}>
      {content}
    </span>
  );
}
