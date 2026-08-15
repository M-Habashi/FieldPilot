import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Id } from '../../convex/_generated/dataModel';
import {
  AlertTriangle,
  CameraOff,
  Check,
  ChevronDown,
  Clock3,
  Filter,
  Layers3,
  LocateFixed,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  categoryById,
  pinColor,
  type Priority,
  type Status,
  type Task,
} from '../types';
import {
  countAdvancedTaskFilters,
  DEFAULT_TASK_QUEUE_FILTERS,
  filterTaskQueue,
  groupTaskQueue,
  sortTaskQueue,
  taskAttentionFlags,
  taskNeedsAttention,
  type SavedTaskView,
  type TaskQueueFilters,
  type TaskQueueGroupBy,
} from '../task-queue';
import { isMobileViewport } from '../lib/utils';
import { useProject } from '../store/project';
import type { ProjectMemberOption } from './TaskPanel';
import { Button } from './ui/button';
import { Dropdown, DropdownItem, DropdownLabel } from './ui/dropdown-menu';
import { Input } from './ui/input';
import { Select } from './ui/select';

const SAVED_VIEWS_KEY = 'fp:task-queue-views:v1';
const TASK_QUEUE_PAGE_SIZE = 50;

const GROUP_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'location', label: 'Location' },
];

const DUE_OPTIONS = [
  { value: 'all', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due in 7 days' },
  { value: 'none', label: 'No due date' },
];

function savedViewsKey(projectId: Id<'projects'>) {
  return `${SAVED_VIEWS_KEY}:${projectId}`;
}

function isSavedTaskView(value: unknown): value is SavedTaskView {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedTaskView>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.groupBy === 'string' &&
    Boolean(candidate.filters) &&
    typeof candidate.filters?.search === 'string' &&
    Array.isArray(candidate.filters?.statuses) &&
    Array.isArray(candidate.filters?.assignees) &&
    Array.isArray(candidate.filters?.categories) &&
    Array.isArray(candidate.filters?.priorities)
  );
}

function readSavedViews(projectId: Id<'projects'>): SavedTaskView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(savedViewsKey(projectId)) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedTaskView) : [];
  } catch {
    return [];
  }
}

function writeSavedViews(projectId: Id<'projects'>, views: SavedTaskView[]) {
  localStorage.setItem(savedViewsKey(projectId), JSON.stringify(views));
}

function toggleValue<T extends string | number>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function TaskListBody({
  canEdit,
  members,
  projectId,
}: {
  canEdit: boolean;
  members: ProjectMemberOption[];
  projectId: Id<'projects'>;
}) {
  const tasks = useProject((state) => state.tasks);
  const selectedTaskId = useProject((state) => state.selectedTaskId);
  const currentPage = useProject((state) => state.currentPage);
  const selectTask = useProject((state) => state.selectTask);
  const focusTask = useProject((state) => state.focusTask);
  const updateTask = useProject((state) => state.updateTask);
  const closeTaskList = useProject((state) => state.closeTaskList);
  const setAddPinMode = useProject((state) => state.setAddPinMode);
  const [filters, setFilters] = useState<TaskQueueFilters>(DEFAULT_TASK_QUEUE_FILTERS);
  const [groupBy, setGroupBy] = useState<TaskQueueGroupBy>('none');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(TASK_QUEUE_PAGE_SIZE);
  const [savedViews, setSavedViews] = useState<SavedTaskView[]>(() => readSavedViews(projectId));
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState('');

  const all = useMemo(() => sortTaskQueue(Object.values(tasks)), [tasks]);
  const visible = useMemo(
    () => sortTaskQueue(filterTaskQueue(all, filters, currentPage)),
    [all, currentPage, filters],
  );
  const displayedTasks = useMemo(() => visible.slice(0, visibleLimit), [visible, visibleLimit]);
  const groups = useMemo(() => groupTaskQueue(displayedTasks, groupBy), [displayedTasks, groupBy]);
  const attentionCount = useMemo(
    () => all.filter((task) => taskNeedsAttention(task)).length,
    [all],
  );
  const sheetCount = useMemo(
    () => all.filter((task) => task.page === currentPage).length,
    [all, currentPage],
  );
  const advancedFilterCount = countAdvancedTaskFilters(filters);
  const displayedSelectedCount = displayedTasks.filter((task) => selectedIds.has(task.id)).length;
  const allDisplayedSelected =
    displayedTasks.length > 0 && displayedSelectedCount === displayedTasks.length;
  const someDisplayedSelected = displayedSelectedCount > 0 && !allDisplayedSelected;
  const hasAnyFilter =
    Boolean(filters.search) ||
    filters.thisSheet ||
    filters.needsAttention ||
    advancedFilterCount > 0;

  const assigneeFilterOptions = useMemo(() => {
    const options = [{ value: 'unassigned', label: 'Unassigned' }];
    options.push(...members.map((member) => ({ value: member.userId, label: member.name })));
    for (const task of all) {
      if (!task.assignee || task.assigneeUserId) continue;
      const value = `legacy:${task.assignee}`;
      if (!options.some((option) => option.value === value)) {
        options.push({ value, label: `${task.assignee} (legacy)` });
      }
    }
    return options;
  }, [all, members]);

  const assigneeEditOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...members.map((member) => ({ value: member.userId, label: member.name })),
    ],
    [members],
  );

  useEffect(() => {
    setVisibleLimit(TASK_QUEUE_PAGE_SIZE);
  }, [filters, groupBy]);

  useEffect(() => {
    const visibleIds = new Set(visible.map((task) => task.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visible]);

  useEffect(() => {
    setSavedViews(readSavedViews(projectId));
  }, [projectId]);

  const patchFilters = (patch: Partial<TaskQueueFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const locateTask = (taskId: string) => {
    focusTask(taskId);
    if (isMobileViewport()) {
      selectTask(null);
      closeTaskList();
    }
  };

  const updateAssignee = (taskId: string, userId: string) => {
    const member = members.find((candidate) => candidate.userId === userId);
    updateTask(taskId, { assigneeUserId: userId || null, assignee: member?.name ?? '' });
  };

  const updateSelected = (patch: Partial<Pick<Task, 'status' | 'assignee' | 'assigneeUserId'>>) => {
    for (const taskId of selectedIds) updateTask(taskId, patch);
  };

  const selectDisplayedTasks = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const task of displayedTasks) {
        if (checked) next.add(task.id);
        else next.delete(task.id);
      }
      return next;
    });
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next = [
      ...savedViews,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
        name,
        filters: { ...filters },
        groupBy,
      },
    ];
    setSavedViews(next);
    writeSavedViews(projectId, next);
    setSavingView(false);
    setViewName('');
  };

  const removeSavedView = (id: string) => {
    const next = savedViews.filter((view) => view.id !== id);
    setSavedViews(next);
    writeSavedViews(projectId, next);
  };

  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-t1">Task queue</h2>
            <p className="text-[11px] text-t3" aria-live="polite">
              {visible.length} of {all.length} tasks · attention first
            </p>
          </div>
          <Button
            variant="text"
            size="iconXs"
            aria-label="Close task queue"
            onClick={closeTaskList}
          >
            <X />
          </Button>
        </div>

        <div className="space-y-2 px-3 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-t3" />
            <Input
              value={filters.search}
              onChange={(event) => patchFilters({ search: event.target.value })}
              placeholder="Search tasks, tags, locations…"
              aria-label="Search tasks"
              className="h-9 pl-8 pr-8 text-xs"
            />
            {filters.search && (
              <button
                type="button"
                aria-label="Clear task search"
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-t3 hover:bg-surface2 hover:text-t1"
                onClick={() => patchFilters({ search: '' })}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <QuickFilter
              pressed={filters.thisSheet}
              label="This sheet"
              count={sheetCount}
              icon={<Layers3 />}
              onClick={() => patchFilters({ thisSheet: !filters.thisSheet })}
            />
            <QuickFilter
              pressed={filters.needsAttention}
              label="Needs attention"
              count={attentionCount}
              icon={<AlertTriangle />}
              tone="attention"
              onClick={() => patchFilters({ needsAttention: !filters.needsAttention })}
            />
            <button
              type="button"
              aria-expanded={filtersOpen}
              className={`fp-task-queue-touch flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                filtersOpen || advancedFilterCount > 0
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line-strong text-t2 hover:bg-surface2 hover:text-t1'
              }`}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="size-3.5" />
              Filters
              {advancedFilterCount > 0 && <span className="font-mono">{advancedFilterCount}</span>}
              <ChevronDown
                className={`size-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <SavedViewsMenu
              views={savedViews}
              saving={savingView}
              viewName={viewName}
              onViewNameChange={setViewName}
              onStartSaving={() => setSavingView(true)}
              onCancelSaving={() => {
                setSavingView(false);
                setViewName('');
              }}
              onSave={saveCurrentView}
              onApply={(view) => {
                setFilters(view.filters);
                setGroupBy(view.groupBy);
                setFiltersOpen(false);
              }}
              onRemove={removeSavedView}
            />
          </div>

          {filtersOpen && (
            <div className="space-y-2 border-t border-line pt-2">
              <div className="grid grid-cols-2 gap-2">
                <FilterMenu
                  label="Status"
                  selected={filters.statuses}
                  options={Object.entries(STATUSES).map(([value, status]) => ({
                    value,
                    label: status.label,
                  }))}
                  onToggle={(value) =>
                    patchFilters({ statuses: toggleValue(filters.statuses, value as Status) })
                  }
                />
                <FilterMenu
                  label="Priority"
                  selected={filters.priorities.map(String)}
                  options={Object.entries(PRIORITIES).map(([value, priority]) => ({
                    value,
                    label: priority.label,
                  }))}
                  onToggle={(value) =>
                    patchFilters({
                      priorities: toggleValue(filters.priorities, Number(value) as Priority),
                    })
                  }
                />
                <FilterMenu
                  label="Assignee"
                  selected={filters.assignees}
                  options={assigneeFilterOptions}
                  onToggle={(value) =>
                    patchFilters({ assignees: toggleValue(filters.assignees, value) })
                  }
                />
                <FilterMenu
                  label="Category"
                  selected={filters.categories}
                  options={CATEGORIES.map((category) => ({
                    value: category.id,
                    label: category.label,
                  }))}
                  onToggle={(value) =>
                    patchFilters({ categories: toggleValue(filters.categories, value) })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-t3">
                    Due
                  </span>
                  <Select
                    value={filters.due}
                    options={DUE_OPTIONS}
                    ariaLabel="Filter by due date"
                    className="rounded-md border border-line-strong px-2"
                    onValueChange={(value) =>
                      patchFilters({ due: value as TaskQueueFilters['due'] })
                    }
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-t3">
                    Group by
                  </span>
                  <Select
                    value={groupBy}
                    options={GROUP_OPTIONS}
                    ariaLabel="Group tasks"
                    className="rounded-md border border-line-strong px-2"
                    onValueChange={(value) => setGroupBy(value as TaskQueueGroupBy)}
                  />
                </div>
              </div>
              {hasAnyFilter && (
                <button
                  type="button"
                  className="cursor-pointer text-[11px] font-semibold text-accent hover:text-accent-hover"
                  onClick={() => setFilters(DEFAULT_TASK_QUEUE_FILTERS)}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {canEdit && selectedIds.size > 0 && (
        <div className="border-b border-line bg-accent-soft px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-accent" aria-live="polite">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              className="cursor-pointer text-[11px] font-semibold text-accent hover:text-accent-hover"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value=""
              options={[
                { value: '', label: 'Set status…' },
                ...Object.entries(STATUSES).map(([value, status]) => ({
                  value,
                  label: status.label,
                  color: status.color,
                })),
              ]}
              ariaLabel="Set status for selected tasks"
              className="rounded-md border border-accent/30 bg-surface px-2"
              onValueChange={(value) => value && updateSelected({ status: value as Status })}
            />
            <Select
              value="bulk-placeholder"
              options={[
                { value: 'bulk-placeholder', label: 'Set assignee…' },
                ...assigneeEditOptions,
              ]}
              ariaLabel="Set assignee for selected tasks"
              className="rounded-md border border-accent/30 bg-surface px-2"
              onValueChange={(value) => {
                if (value === 'bulk-placeholder') return;
                const member = members.find((candidate) => candidate.userId === value);
                updateSelected({ assigneeUserId: value || null, assignee: member?.name ?? '' });
              }}
            />
          </div>
          {allDisplayedSelected && visible.length > displayedTasks.length && (
            <button
              type="button"
              className="mt-2 cursor-pointer text-[11px] font-semibold text-accent hover:text-accent-hover"
              onClick={() => setSelectedIds(new Set(visible.map((task) => task.id)))}
            >
              Select all {visible.length} matching tasks
            </button>
          )}
        </div>
      )}

      {canEdit && displayedTasks.length > 0 && (
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <SelectVisibleTasks
            checked={allDisplayedSelected}
            indeterminate={someDisplayedSelected}
            count={displayedTasks.length}
            onChange={selectDisplayedTasks}
          />
          <span className="text-[10px] text-t3">
            Showing {displayedTasks.length} of {visible.length}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {all.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <MapPin className="mb-2 size-7 text-t3" />
            <p className="text-sm font-semibold text-t1">No tasks yet</p>
            <p className="mt-1 max-w-60 text-xs text-t3">
              Drop a pin on the plan to start the field queue.
            </p>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => setAddPinMode(true)}
              >
                <Plus /> Add pin
              </Button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <SlidersHorizontal className="mb-2 size-7 text-t3" />
            <p className="text-sm font-semibold text-t1">No tasks match this view</p>
            <p className="mt-1 text-xs text-t3">Clear filters or switch to a saved view.</p>
            <Button
              variant="text"
              size="sm"
              className="mt-3 text-accent"
              onClick={() => setFilters(DEFAULT_TASK_QUEUE_FILTERS)}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`task-group-${group.key}`}>
              {groupBy !== 'none' && (
                <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-2 py-1.5 backdrop-blur-sm">
                  <h3
                    id={`task-group-${group.key}`}
                    className="truncate text-[10px] font-semibold uppercase tracking-wide text-t3"
                  >
                    {group.label}
                  </h3>
                  <span className="font-mono text-[10px] text-t3">{group.tasks.length}</span>
                </div>
              )}
              <ul className="space-y-0.5">
                {group.tasks.map((task) => (
                  <TaskQueueRow
                    key={task.id}
                    task={task}
                    canEdit={canEdit}
                    selected={task.id === selectedTaskId}
                    checked={selectedIds.has(task.id)}
                    assigneeOptions={assigneeEditOptions}
                    onCheckedChange={(checked) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(task.id);
                        else next.delete(task.id);
                        return next;
                      })
                    }
                    onOpen={() => selectTask(task.id)}
                    onLocate={() => locateTask(task.id)}
                    onStatusChange={(status) => updateTask(task.id, { status })}
                    onAssigneeChange={(userId) => updateAssignee(task.id, userId)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        {visibleLimit < visible.length && (
          <div className="flex justify-center px-3 py-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVisibleLimit((current) => current + TASK_QUEUE_PAGE_SIZE)}
            >
              Show next {Math.min(TASK_QUEUE_PAGE_SIZE, visible.length - visibleLimit)} tasks
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function SelectVisibleTasks({
  checked,
  indeterminate,
  count,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  count: number;
  onChange: (checked: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="fp-task-queue-touch flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-t2">
      <input
        ref={inputRef}
        type="checkbox"
        className="size-3.5 accent-accent"
        checked={checked}
        aria-label={`Select all ${count} visible tasks`}
        onChange={(event) => onChange(event.target.checked)}
      />
      Select visible
    </label>
  );
}

function QuickFilter({
  pressed,
  label,
  count,
  icon,
  tone = 'default',
  onClick,
}: {
  pressed: boolean;
  label: string;
  count: number;
  icon: ReactNode;
  tone?: 'default' | 'attention';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`fp-task-queue-touch flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors [&_svg]:size-3.5 ${
        pressed
          ? tone === 'attention'
            ? 'border-warn bg-warn-soft text-warn'
            : 'border-accent bg-accent-soft text-accent'
          : 'border-line-strong text-t2 hover:bg-surface2 hover:text-t1'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
      <span className="font-mono text-[10px]">{count}</span>
    </button>
  );
}

function FilterMenu({
  label,
  selected,
  options,
  onToggle,
}: {
  label: string;
  selected: string[];
  options: Array<{ value: string; label: string }>;
  onToggle: (value: string) => void;
}) {
  return (
    <Dropdown
      align="left"
      className="max-h-64 min-w-56 overflow-y-auto"
      trigger={
        <button
          type="button"
          className="fp-task-queue-touch flex h-8 w-full cursor-pointer items-center justify-between rounded-md border border-line-strong px-2 text-xs text-t2 hover:bg-surface2 hover:text-t1"
        >
          <span>{label}</span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-t3">
            {selected.length || 'All'} <ChevronDown className="size-3" />
          </span>
        </button>
      }
    >
      <DropdownLabel>{label}</DropdownLabel>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <DropdownItem
            key={option.value}
            role="menuitemcheckbox"
            aria-checked={checked}
            onClick={() => onToggle(option.value)}
          >
            <span className="flex size-3.5 items-center justify-center rounded-sm border border-line-strong">
              {checked && <Check className="size-3 text-accent" />}
            </span>
            {option.label}
          </DropdownItem>
        );
      })}
    </Dropdown>
  );
}

function SavedViewsMenu({
  views,
  saving,
  viewName,
  onViewNameChange,
  onStartSaving,
  onCancelSaving,
  onSave,
  onApply,
  onRemove,
}: {
  views: SavedTaskView[];
  saving: boolean;
  viewName: string;
  onViewNameChange: (value: string) => void;
  onStartSaving: () => void;
  onCancelSaving: () => void;
  onSave: () => void;
  onApply: (view: SavedTaskView) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Dropdown
      align="right"
      className="w-72"
      trigger={
        <button
          type="button"
          className="fp-task-queue-touch flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-2.5 text-[11px] font-semibold text-t2 hover:bg-surface2 hover:text-t1"
        >
          <Save className="size-3.5" /> Views
          {views.length > 0 && <span className="font-mono text-[10px]">{views.length}</span>}
        </button>
      }
    >
      <DropdownLabel>Personal saved views</DropdownLabel>
      {views.length === 0 && !saving && (
        <p className="px-2.5 py-2 text-xs text-t3">
          Save the current filters and grouping for later.
        </p>
      )}
      {views.map((view) => (
        <div key={view.id} className="flex items-center gap-1 rounded-md hover:bg-surface2">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate px-2.5 py-2 text-left text-xs font-medium text-t1"
            onClick={() => onApply(view)}
          >
            {view.name}
          </button>
          <button
            type="button"
            aria-label={`Delete saved view ${view.name}`}
            className="mr-1 flex size-8 cursor-pointer items-center justify-center rounded-md text-t3 hover:text-danger"
            onClick={() => onRemove(view.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      {saving ? (
        <div className="mt-1 border-t border-line p-2">
          <Input
            autoFocus
            value={viewName}
            maxLength={40}
            placeholder="View name"
            aria-label="Saved view name"
            className="h-9 text-xs"
            onChange={(event) => onViewNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSave();
              if (event.key === 'Escape') onCancelSaving();
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="text" size="sm" onClick={onCancelSaving}>
              Cancel
            </Button>
            <Button variant="default" size="sm" disabled={!viewName.trim()} onClick={onSave}>
              Save view
            </Button>
          </div>
        </div>
      ) : (
        <DropdownItem
          className="mt-1 border-t border-line pt-2 text-accent"
          onClick={onStartSaving}
        >
          <Plus /> Save current view
        </DropdownItem>
      )}
    </Dropdown>
  );
}

function TaskQueueRow({
  task,
  canEdit,
  selected,
  checked,
  assigneeOptions,
  onCheckedChange,
  onOpen,
  onLocate,
  onStatusChange,
  onAssigneeChange,
}: {
  task: Task;
  canEdit: boolean;
  selected: boolean;
  checked: boolean;
  assigneeOptions: Array<{ value: string; label: string }>;
  onCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
  onLocate: () => void;
  onStatusChange: (status: Status) => void;
  onAssigneeChange: (userId: string) => void;
}) {
  const done = task.status === 'done' || task.status === 'verified';
  const flags = taskAttentionFlags(task);
  const assigneeValue = task.assigneeUserId ?? '';
  const category = categoryById(task.category);

  return (
    <li
      className={`rounded-md border transition-colors ${
        selected
          ? 'border-accent/50 bg-accent-soft'
          : checked
            ? 'border-accent/30 bg-accent-soft/50'
            : 'border-transparent hover:border-line hover:bg-surface2'
      }`}
    >
      <div className="flex items-start gap-1.5 px-2 pt-2">
        {canEdit && (
          <label className="fp-task-queue-touch mt-0.5 flex size-6 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="size-3.5 accent-accent"
              checked={checked}
              aria-label={`Select ${task.title || `task ${task.seq}`}`}
              onChange={(event) => onCheckedChange(event.target.checked)}
            />
          </label>
        )}
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
          onClick={onOpen}
        >
          <span
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold text-white"
            style={{ background: pinColor(task) }}
          >
            {done ? <Check size={11} strokeWidth={3.5} /> : task.seq}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-xs ${done ? 'text-t3' : 'font-semibold text-t1'}`}
            >
              {task.title || 'Untitled task'}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-t3">
              <span style={{ color: category.color }}>{category.label}</span> ·{' '}
              {PRIORITIES[task.priority].short} · Sheet {task.page}
              {task.locationText ? ` · ${task.locationText}` : ''}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={`Locate ${task.title || `task ${task.seq}`} on plan`}
          className="fp-task-queue-touch flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-t3 hover:bg-surface hover:text-accent"
          onClick={onLocate}
        >
          <LocateFixed className="size-3.5" />
        </button>
      </div>

      {(flags.overdue || flags.blocked || flags.missingEvidence || flags.unverified) && (
        <div className={`flex flex-wrap gap-1 px-2 pb-1.5 ${canEdit ? 'pl-10' : 'pl-9'}`}>
          {flags.overdue && (
            <AttentionBadge
              icon={<Clock3 />}
              label={`Overdue · ${formatDueDate(task.dueDate)}`}
              tone="danger"
            />
          )}
          {flags.blocked && <AttentionBadge icon={<ShieldAlert />} label="Blocked" tone="danger" />}
          {flags.missingEvidence && (
            <AttentionBadge icon={<CameraOff />} label="Missing evidence" tone="warn" />
          )}
          {flags.unverified && (
            <AttentionBadge icon={<AlertTriangle />} label="Unverified" tone="warn" />
          )}
        </div>
      )}

      <div className={`grid grid-cols-2 gap-1.5 px-2 pb-2 ${canEdit ? 'pl-10' : 'pl-9'}`}>
        {canEdit ? (
          <>
            <Select
              value={task.status}
              options={Object.entries(STATUSES).map(([value, status]) => ({
                value,
                label: status.label,
                color: status.color,
              }))}
              ariaLabel={`Status for ${task.title || `task ${task.seq}`}`}
              className="fp-task-queue-touch rounded-md border border-line px-2"
              onValueChange={(value) => onStatusChange(value as Status)}
            />
            <Select
              value={assigneeValue}
              options={
                task.assignee && !task.assigneeUserId
                  ? [{ value: 'legacy', label: `${task.assignee} (legacy)` }, ...assigneeOptions]
                  : assigneeOptions
              }
              ariaLabel={`Assignee for ${task.title || `task ${task.seq}`}`}
              className="fp-task-queue-touch rounded-md border border-line px-2"
              onValueChange={(value) => onAssigneeChange(value === 'legacy' ? '' : value)}
            />
          </>
        ) : (
          <>
            <span className="flex h-7 items-center gap-1.5 truncate text-[10px] text-t2">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: STATUSES[task.status].color }}
              />
              {STATUSES[task.status].label}
            </span>
            <span className="flex h-7 items-center gap-1.5 truncate text-[10px] text-t2">
              <UserRound className="size-3 text-t3" /> {task.assignee || 'Unassigned'}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

function AttentionBadge({
  icon,
  label,
  tone,
}: {
  icon: ReactNode;
  label: string;
  tone: 'danger' | 'warn';
}) {
  return (
    <span
      className={`inline-flex min-h-5 items-center gap-1 rounded-full px-1.5 text-[9px] font-semibold [&_svg]:size-3 ${
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
      }`}
    >
      {icon} {label}
    </span>
  );
}
