import { Check, MapPin, X } from 'lucide-react';
import { PRIORITIES, STATUSES, categoryById, pinColor } from '../types';
import { useProject } from '../store/project';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const PANE_WIDTH = 288; // w-72

export function TaskList() {
  const open = useProject((s) => s.taskListOpen);
  const tasks = useProject((s) => s.tasks);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const focusTask = useProject((s) => s.focusTask);
  const toggleTaskList = useProject((s) => s.toggleTaskList);

  const all = Object.values(tasks).sort((a, b) => a.seq - b.seq);

  return (
    <div
      className="z-20 shrink-0 overflow-hidden transition-[width] duration-(--fp-dur-med) ease-(--fp-ease)"
      style={{ width: open ? PANE_WIDTH : 0 }}
      aria-hidden={!open}
    >
      <aside
        className="fp-tasklist flex h-full flex-col"
        style={{ width: PANE_WIDTH }}
        aria-label="Task list"
      >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-t1">
          Tasks <span className="font-mono text-xs text-t3">({all.length})</span>
        </h2>
        <Button variant="ghost" size="iconSm" aria-label="Close task list" onClick={toggleTaskList}>
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {all.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-t3">
            <MapPin className="mx-auto mb-2 size-5" />
            No tasks yet. Switch on “Add pin” and click the sheet to create the first one.
          </div>
        )}
        <ul className="space-y-1">
          {all.map((task) => {
            const done = task.status === 'done' || task.status === 'verified';
            return (
              <li key={task.id}>
                <button
                  type="button"
                  className={`fp-task-row flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-(--fp-dur-fast) hover:bg-surface2 ${
                    task.id === selectedTaskId ? 'bg-accent-soft' : ''
                  }`}
                  onClick={() => focusTask(task.id)}
                >
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white"
                    style={{ background: pinColor(task) }}
                  >
                    {done ? <Check size={11} strokeWidth={3.5} /> : task.seq}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${done ? 'text-t3 line-through' : 'text-t1'}`}>
                      {task.title || 'Untitled task'}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge color={STATUSES[task.status].color}>{STATUSES[task.status].label}</Badge>
                      <Badge color={PRIORITIES[task.priority].color}>
                        {PRIORITIES[task.priority].short}
                      </Badge>
                      <Badge color={categoryById(task.category).color}>
                        {categoryById(task.category).label}
                      </Badge>
                      <span className="font-mono text-[10px] text-t3">p.{task.page}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      </aside>
    </div>
  );
}
