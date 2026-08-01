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

  const pins = Object.values(tasks)
    .filter((t) => t.page === currentPage)
    .sort((a, b) => a.seq - b.seq);

  return (
    <div data-pin-layer className="pointer-events-none absolute inset-0">
      {pins.map((task) => (
        <Pin key={task.id} task={task} selected={task.id === selectedTaskId} />
      ))}
    </div>
  );
}

function Pin({ task, selected }: { task: Task; selected: boolean }) {
  const selectTask = useProject((s) => s.selectTask);
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
    >
      <span
        className="fp-pin-marker"
        style={{ '--pin-color': pinColor(task) } as React.CSSProperties}
      >
        <span className="fp-pin-label">
          {done ? <Check size={13} strokeWidth={3.5} /> : task.seq}
        </span>
      </span>
    </button>
  );
}
