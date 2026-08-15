import { useEffect, useState } from 'react';
import { useProject } from '../store/project';
import { usePresence } from '../hooks/usePresence';
import { TaskListBody } from './TaskList';
import { TaskPanelBody, type ProjectMemberOption } from './TaskPanel';
import type {
  CustomTaskAttributeDefinition,
  CustomTaskAttributeValue,
  CustomTaskAttributeValueRow,
  TaskAttributeConfigurationDraft,
  TaskAttributeLayoutItem,
} from '../task-attributes';
import type { QuantityItemOption, TaskQuantityLine, TaskQuantityPatch } from '../quantities';
import type { Id } from '../../convex/_generated/dataModel';
import type { TaskActivityEntry } from '../task-activity';

/**
 * One right-hand drawer shell shared by Tasks and Task Properties. Both render
 * inside the SAME fixed-width frame, so navigating list → properties swaps
 * content in place instead of overlaying a wider panel. Width is identical in
 * every theme (--fp-drawer-width).
 *
 * Layout: always overlays the plan. Reflowing the viewer while the drawer width
 * animates makes the PDF appear to flash/jump during a double-click open.
 */
export function RightDrawer({
  canEdit,
  canManageAttributes,
  members,
  projectId,
  quantityItems,
  taskQuantityLines,
  taskActivity,
  taskAttributeLayout,
  customTaskAttributeDefinitions,
  customTaskAttributeValues,
  onTaskAttributeConfigurationChange,
  onCustomTaskAttributeValueChange,
  onAddTaskQuantityLine,
  onUpdateTaskQuantityLine,
  onRemoveTaskQuantityLine,
}: {
  canEdit: boolean;
  canManageAttributes: boolean;
  members: ProjectMemberOption[];
  projectId: Id<'projects'>;
  quantityItems: QuantityItemOption[];
  taskQuantityLines: TaskQuantityLine[] | undefined;
  taskActivity: TaskActivityEntry[] | undefined;
  taskAttributeLayout: TaskAttributeLayoutItem[];
  customTaskAttributeDefinitions: CustomTaskAttributeDefinition[];
  customTaskAttributeValues: CustomTaskAttributeValueRow[];
  onTaskAttributeConfigurationChange: (
    configuration: TaskAttributeConfigurationDraft,
  ) => Promise<void>;
  onCustomTaskAttributeValueChange: (
    definitionId: string,
    value: CustomTaskAttributeValue | null,
  ) => Promise<void>;
  onAddTaskQuantityLine: () => Promise<void>;
  onUpdateTaskQuantityLine: (lineId: string | undefined, patch: TaskQuantityPatch) => Promise<void>;
  onRemoveTaskQuantityLine: (lineId: string | undefined) => Promise<void>;
}) {
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
  // Use the live selection immediately when opening from a closed drawer.
  // renderTaskId deliberately lags in state so Properties can remain visible
  // during an exit animation, but using it for entrance caused one frame of
  // the Tasks list to render before Properties — the visible main-view flash.
  const visibleTaskId = selectedTaskId ?? renderTaskId;

  return (
    <aside
      data-state={state}
      onAnimationEnd={onAnimationEnd}
      aria-label={showProps ? 'Task details' : 'Task list'}
      className={`${showProps ? 'fp-task-workspace max-w-[min(1120px,100%)]' : 'fp-task-queue max-w-[var(--fp-drawer-width)]'} fp-panel absolute inset-y-0 right-0 z-30 flex min-h-0 w-full flex-col`}
    >
      <div
        // Keep the Properties view mounted while switching tasks. A task-id key
        // replayed the entrance fade on every selection, producing a visible
        // blink even though the drawer itself never closed.
        key={showProps ? 'props' : 'list'}
        className="fp-drawer-view flex min-h-0 flex-1 flex-col"
      >
        {showProps && visibleTaskId ? (
          <TaskPanelBody
            taskId={visibleTaskId}
            canEdit={canEdit}
            canManageAttributes={canManageAttributes}
            members={members}
            projectId={projectId}
            quantityItems={quantityItems}
            taskQuantityLines={taskQuantityLines}
            taskActivity={taskActivity}
            taskAttributeLayout={taskAttributeLayout}
            customTaskAttributeDefinitions={customTaskAttributeDefinitions}
            customTaskAttributeValues={customTaskAttributeValues}
            onTaskAttributeConfigurationChange={onTaskAttributeConfigurationChange}
            onCustomTaskAttributeValueChange={onCustomTaskAttributeValueChange}
            onAddTaskQuantityLine={onAddTaskQuantityLine}
            onUpdateTaskQuantityLine={onUpdateTaskQuantityLine}
            onRemoveTaskQuantityLine={onRemoveTaskQuantityLine}
          />
        ) : (
          <TaskListBody canEdit={canEdit} members={members} projectId={projectId} />
        )}
      </div>
    </aside>
  );
}
