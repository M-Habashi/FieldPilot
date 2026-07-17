import { useRef } from 'react';
import { Check } from 'lucide-react';
import type { Task } from '../types';
import { pinColor } from '../types';
import { clamp, cn } from '../lib/utils';
import { useProject } from '../store/project';

export function PinLayer() {
  const tasks = useProject((s) => s.tasks);
  const currentPage = useProject((s) => s.currentPage);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const pinTooltipTaskId = useProject((s) => s.pinTooltipTaskId);

  const pins = Object.values(tasks)
    .filter((t) => t.page === currentPage)
    .sort((a, b) => a.seq - b.seq);

  return (
    <div data-pin-layer className="pointer-events-none absolute inset-0">
      {pins.map((task) => (
        <Pin
          key={task.id}
          task={task}
          selected={task.id === (selectedTaskId ?? pinTooltipTaskId)}
          tooltipOpen={task.id === pinTooltipTaskId}
        />
      ))}
    </div>
  );
}

function Pin({ task, selected, tooltipOpen }: { task: Task; selected: boolean; tooltipOpen: boolean }) {
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const selectTask = useProject((s) => s.selectTask);
  const showPinTooltip = useProject((s) => s.showPinTooltip);
  const moveTask = useProject((s) => s.moveTask);
  const dragRef = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);

  const done = task.status === 'done' || task.status === 'verified';

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) {
      d.moved = true;
    }
    if (!d.moved) return;
    const layer = e.currentTarget.closest('[data-pin-layer]');
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    moveTask(
      task.id,
      clamp((e.clientX - rect.left) / rect.width, 0, 1),
      clamp((e.clientY - rect.top) / rect.height, 0, 1),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;

    // Closed drawer: first click selects/previews, clicking that selected pin
    // again opens Properties. Open drawer: one click switches Properties to
    // whichever pin was clicked.
    if (selectedTaskId !== null || tooltipOpen) {
      selectTask(task.id);
    } else {
      showPinTooltip(task.id);
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    selectTask(task.id);
  };

  return (
    <button
      type="button"
      className={cn('fp-pin pointer-events-auto', selected && 'fp-pin-selected')}
      style={{ left: `${task.x * 100}%`, top: `${task.y * 100}%` }}
      aria-label={`Pin ${task.seq}: ${task.title || 'untitled task'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {tooltipOpen && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-t1 px-2 py-1 text-xs font-medium text-surface shadow-e2"
        >
          {task.title || 'Untitled task'}
        </span>
      )}
      <span className="fp-pin-marker" style={{ '--pin-color': pinColor(task) } as React.CSSProperties}>
        <span className="fp-pin-label">
          {done ? <Check size={13} strokeWidth={3.5} /> : task.seq}
        </span>
      </span>
    </button>
  );
}
