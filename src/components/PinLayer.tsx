import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { Task } from '../types';
import { pinColor } from '../types';
import { clamp, cn } from '../lib/utils';
import { useProject } from '../store/project';

const TOUCH_DRAG_ARM_DELAY = 300;
const TOUCH_DRAG_THRESHOLD = 10;

interface PinLayerProps {
  viewScale: number;
  isOverCancelZone: (clientX: number, clientY: number) => boolean;
  onTouchDragStart: (taskId: string, originX: number, originY: number) => void;
  onTouchDragMove: (taskId: string, clientX: number, clientY: number) => void;
  onTouchDragEnd: (taskId: string) => void;
}

export function PinLayer({
  viewScale,
  isOverCancelZone,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
}: PinLayerProps) {
  const tasks = useProject((s) => s.tasks);
  const currentPage = useProject((s) => s.currentPage);
  const selectedTaskId = useProject((s) => s.selectedTaskId);

  const pins = Object.values(tasks)
    .filter((t) => t.page === currentPage)
    .sort((a, b) => a.seq - b.seq);

  return (
    <div data-pin-layer className="pointer-events-none absolute inset-0">
      {pins.map((task) => (
        <Pin
          key={task.id}
          task={task}
          viewScale={viewScale}
          selected={task.id === selectedTaskId}
          isOverCancelZone={isOverCancelZone}
          onTouchDragStart={onTouchDragStart}
          onTouchDragMove={onTouchDragMove}
          onTouchDragEnd={onTouchDragEnd}
        />
      ))}
    </div>
  );
}

interface PinProps extends PinLayerProps {
  task: Task;
  selected: boolean;
}

function Pin({
  viewScale,
  task,
  selected,
  isOverCancelZone,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
}: PinProps) {
  const selectTask = useProject((s) => s.selectTask);
  const moveTask = useProject((s) => s.moveTask);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    moved: boolean;
    armed: boolean;
    touch: boolean;
    originX: number;
    originY: number;
  } | null>(null);
  const touchArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = task.status === 'done' || task.status === 'verified';

  useEffect(() => {
    return () => {
      if (touchArmTimerRef.current) clearTimeout(touchArmTimerRef.current);
    };
  }, []);

  const clearTouchArmTimer = () => {
    if (!touchArmTimerRef.current) return;
    clearTimeout(touchArmTimerRef.current);
    touchArmTimerRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTouchArmTimer();
    const touch = e.pointerType === 'touch';
    const drag = {
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      armed: !touch,
      touch,
      originX: task.x,
      originY: task.y,
    };
    dragRef.current = drag;

    if (touch) {
      touchArmTimerRef.current = setTimeout(() => {
        const current = dragRef.current;
        if (!current || current !== drag || current.moved) return;
        current.armed = true;
        onTouchDragStart(task.id, current.originX, current.originY);
        globalThis.navigator.vibrate?.(15);
      }, TOUCH_DRAG_ARM_DELAY);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;

    const threshold = d.touch ? TOUCH_DRAG_THRESHOLD : 4;
    if (d.touch && !d.armed) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > threshold) {
        d.moved = true;
        clearTouchArmTimer();
      }
      return;
    }

    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > threshold) {
      d.moved = true;
    }
    if (!d.moved) return;

    if (d.touch) onTouchDragMove(task.id, e.clientX, e.clientY);
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
    clearTouchArmTimer();
    if (!d) return;

    if (d.touch && d.armed) {
      if (isOverCancelZone(e.clientX, e.clientY)) {
        moveTask(task.id, d.originX, d.originY);
      }
      onTouchDragEnd(task.id);
    }

    if (d.moved) return;

    selectTask(task.id);
  };

  const onPointerCancel = () => {
    const d = dragRef.current;
    dragRef.current = null;
    clearTouchArmTimer();
    if (!d) return;
    if (d.touch && d.armed) {
      if (d.moved) moveTask(task.id, d.originX, d.originY);
      onTouchDragEnd(task.id);
    }
  };

  return (
    <button
      type="button"
      className={cn('fp-pin pointer-events-auto', selected && 'fp-pin-selected')}
      style={
        {
          left: `${task.x * 100}%`,
          top: `${task.y * 100}%`,
          '--fp-pin-view-scale': String(Math.max(0.01, viewScale)),
        } as React.CSSProperties
      }
      aria-label={`Pin ${task.seq}: ${task.title || 'untitled task'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
