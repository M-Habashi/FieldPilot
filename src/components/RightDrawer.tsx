import { useEffect, useState } from 'react';
import { useProject } from '../store/project';
import { usePresence } from './usePresence';
import { TaskListBody } from './TaskList';
import { TaskPanelBody } from './TaskPanel';

/**
 * One right-hand drawer shell shared by Tasks and Task Properties. Both render
 * inside the SAME fixed-width frame, so navigating list → properties swaps
 * content in place instead of overlaying a wider panel. Width is identical in
 * every theme (--fp-drawer-width).
 *
 * Layout: in-flow (pushes the plan) on wide screens; an overlay on narrow ones
 * so the plan is never crushed. The parent row clips transient slide overflow.
 */
export function RightDrawer() {
  const taskListOpen = useProject((s) => s.taskListOpen);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const present = taskListOpen || selectedTaskId !== null;
  const { mounted, state, onAnimationEnd } = usePresence(present);

  // Retain the last content + task id so the exit animation never goes blank
  // (e.g. closing Properties should keep showing Properties as it slides out).
  const [lastMode, setLastMode] = useState<'list' | 'props'>('list');
  const [renderTaskId, setRenderTaskId] = useState<string | null>(selectedTaskId);
  useEffect(() => {
    if (selectedTaskId) {
      setLastMode('props');
      setRenderTaskId(selectedTaskId);
    } else if (taskListOpen) {
      setLastMode('list');
    }
  }, [selectedTaskId, taskListOpen]);

  if (!mounted) return null;

  const showProps = present ? selectedTaskId !== null : lastMode === 'props';

  return (
    <aside
      data-state={state}
      onAnimationEnd={onAnimationEnd}
      aria-label={showProps ? 'Task details' : 'Task list'}
      className={
        'fp-panel z-30 flex min-h-0 w-full max-w-[var(--fp-drawer-width)] flex-col ' +
        'absolute inset-y-0 right-0 ' +
        'lg:static lg:z-20 lg:w-[var(--fp-drawer-width)] lg:max-w-none'
      }
    >
      {showProps && renderTaskId ? (
        <TaskPanelBody key={renderTaskId} taskId={renderTaskId} />
      ) : (
        <TaskListBody />
      )}
    </aside>
  );
}
