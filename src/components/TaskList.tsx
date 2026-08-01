import { Check, LocateFixed, MapPin, Plus, X } from 'lucide-react';
import { PRIORITIES, STATUSES, categoryById, pinColor } from '../types';
import { isMobileViewport } from '../lib/utils';
import { useProject } from '../store/project';
import { Button } from './ui/button';

/**
 * Task list content for the shared right drawer. Renders no width/positioning
 * itself — the drawer shell owns those so Tasks and Properties share one frame.
 */
export function TaskListBody() {
  const tasks = useProject((s) => s.tasks);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const selectTask = useProject((s) => s.selectTask);
  const focusTask = useProject((s) => s.focusTask);
  const closeTaskList = useProject((s) => s.closeTaskList);
  const setAddPinMode = useProject((s) => s.setAddPinMode);

  const locateTask = (taskId: string) => {
    focusTask(taskId);
    if (isMobileViewport()) {
      selectTask(null);
      closeTaskList();
    }
  };

  const all = Object.values(tasks).sort((a, b) => a.seq - b.seq);

  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="text-xs font-semibold text-t1">
          Tasks <span className="font-mono font-normal text-t3">({all.length})</span>
        </h2>
        <Button variant="text" size="iconXs" aria-label="Close task list" onClick={closeTaskList}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        {all.length === 0 ? (
          <div className="flex flex-col items-center px-3 py-8 text-center">
            <MapPin className="mb-2 size-6 text-t3" />
            <p className="text-xs text-t3">No tasks yet. Drop a pin on the sheet to create one.</p>
            <Button
              variant="text"
              size="sm"
              className="mt-3 text-accent hover:text-accent-hover"
              onClick={() => setAddPinMode(true)}
            >
              <Plus />
              Add pin
            </Button>
          </div>
        ) : (
          <ul>
            {all.map((task) => {
              const done = task.status === 'done' || task.status === 'verified';
              const selected = task.id === selectedTaskId;
              return (
                <li key={task.id}>
                  <div
                    className={`fp-task-row group flex w-full items-start px-2 py-1.5 transition-colors duration-(--fp-dur-fast) ${
                      selected ? 'text-accent' : 'text-t1 hover:text-accent'
                    }`}
                  >
                    <button
                      type="button"
                      aria-current={selected ? 'true' : undefined}
                      className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
                      onClick={() => selectTask(task.id)}
                    >
                      <span
                        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold text-white"
                        style={{ background: pinColor(task) }}
                      >
                        {done ? <Check size={11} strokeWidth={3.5} /> : task.seq}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-xs ${
                            done
                              ? 'text-t3 line-through'
                              : selected
                                ? 'font-semibold text-accent'
                                : 'text-current'
                          }`}
                        >
                          {task.title || 'Untitled task'}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-t3 group-hover:text-t2">
                          <span style={{ color: STATUSES[task.status].color }}>
                            {STATUSES[task.status].label}
                          </span>
                          {' · '}
                          {PRIORITIES[task.priority].short} · {categoryById(task.category).label} ·
                          sheet {task.page}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Locate ${task.title || `task ${task.seq}`} on plan`}
                      className="ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center text-t3 transition-colors duration-(--fp-dur-fast) hover:text-accent"
                      onClick={() => locateTask(task.id)}
                    >
                      <LocateFixed className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
