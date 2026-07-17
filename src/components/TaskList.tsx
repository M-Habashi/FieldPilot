import { Check, MapPin, Plus, X } from 'lucide-react';
import { PRIORITIES, STATUSES, categoryById, pinColor } from '../types';
import { useProject } from '../store/project';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

/**
 * Task list content for the shared right drawer. Renders no width/positioning
 * itself — the drawer shell owns those so Tasks and Properties share one frame.
 */
export function TaskListBody() {
  const tasks = useProject((s) => s.tasks);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const focusTask = useProject((s) => s.focusTask);
  const toggleTaskList = useProject((s) => s.toggleTaskList);
  const setAddPinMode = useProject((s) => s.setAddPinMode);

  const all = Object.values(tasks).sort((a, b) => a.seq - b.seq);

  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-t1">
          Tasks <span className="font-mono text-xs text-t3">({all.length})</span>
        </h2>
        <Button variant="ghost" size="iconSm" aria-label="Close task list" onClick={toggleTaskList}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {all.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <MapPin className="mb-2 size-6 text-t3" />
            <p className="text-xs text-t3">No tasks yet. Drop a pin on the sheet to create one.</p>
            <Button
              variant="default"
              size="sm"
              className="mt-4"
              onClick={() => setAddPinMode(true)}
            >
              <Plus />
              Add pin
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {all.map((task) => {
              const done = task.status === 'done' || task.status === 'verified';
              const selected = task.id === selectedTaskId;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    className={`fp-task-row flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-(--fp-dur-fast) ${
                      selected
                        ? 'bg-accent-soft shadow-[inset_2px_0_0_0_var(--fp-accent)]'
                        : 'hover:bg-surface2'
                    }`}
                    onClick={() => focusTask(task.id)}
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white ${
                        selected ? 'ring-2 ring-offset-1 ring-offset-surface' : ''
                      }`}
                      style={{
                        background: pinColor(task),
                        ...(selected ? { '--tw-ring-color': pinColor(task) } as React.CSSProperties : {}),
                      }}
                    >
                      {done ? <Check size={11} strokeWidth={3.5} /> : task.seq}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            done ? 'text-t3 line-through' : selected ? 'font-medium text-t1' : 'text-t1'
                          }`}
                        >
                          {task.title || 'Untitled task'}
                        </span>
                        <Badge color={STATUSES[task.status].color}>{STATUSES[task.status].label}</Badge>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-t3">
                        {PRIORITIES[task.priority].short} · {categoryById(task.category).label} · sheet{' '}
                        {task.page}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
