import { CATEGORIES, STATUSES, categoryById, type Priority, type Status, type Task } from './types';

export type TaskQueueDueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export type TaskQueueGroupBy = 'none' | 'status' | 'sheet' | 'assignee' | 'location';

export interface TaskQueueFilters {
  search: string;
  thisSheet: boolean;
  needsAttention: boolean;
  statuses: Status[];
  assignees: string[];
  categories: string[];
  priorities: Priority[];
  due: TaskQueueDueFilter;
}

export interface SavedTaskView {
  id: string;
  name: string;
  filters: TaskQueueFilters;
  groupBy: TaskQueueGroupBy;
}

export interface TaskAttentionFlags {
  overdue: boolean;
  blocked: boolean;
  missingEvidence: boolean;
  unverified: boolean;
}

export interface TaskQueueGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export const DEFAULT_TASK_QUEUE_FILTERS: TaskQueueFilters = {
  search: '',
  thisSheet: false,
  needsAttention: false,
  statuses: [],
  assignees: [],
  categories: [],
  priorities: [],
  due: 'all',
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function taskEvidencePhotoCount(task: Task) {
  return task.evidencePhotoCount ?? task.photos.length;
}

export function taskAttentionFlags(
  task: Task,
  today = localDateString(new Date()),
): TaskAttentionFlags {
  const finished = task.status === 'done' || task.status === 'verified';
  return {
    overdue: Boolean(task.dueDate && task.dueDate < today && !finished),
    blocked: task.tags.some((tag) => tag.trim().toLocaleLowerCase() === 'blocked'),
    missingEvidence: finished && taskEvidencePhotoCount(task) === 0,
    unverified: task.status === 'done',
  };
}

export function taskNeedsAttention(task: Task, today?: string) {
  return Object.values(taskAttentionFlags(task, today)).some(Boolean);
}

function matchesDueFilter(task: Task, due: TaskQueueDueFilter, today: string) {
  if (due === 'all') return true;
  if (due === 'none') return task.dueDate === null;
  if (due === 'overdue') return taskAttentionFlags(task, today).overdue;
  if (due === 'today') return task.dueDate === today;
  return Boolean(task.dueDate && task.dueDate >= today && task.dueDate <= addDays(today, 7));
}

function searchableTaskText(task: Task) {
  return [
    task.seq,
    task.title,
    task.description,
    task.assignee,
    task.locationText,
    ...task.tags,
    categoryById(task.category).label,
    STATUSES[task.status].label,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

export function filterTaskQueue(
  tasks: Task[],
  filters: TaskQueueFilters,
  currentPage: number,
  today = localDateString(new Date()),
) {
  const search = filters.search.trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    if (search && !searchableTaskText(task).includes(search)) return false;
    if (filters.thisSheet && task.page !== currentPage) return false;
    if (filters.needsAttention && !taskNeedsAttention(task, today)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false;
    const assigneeKey =
      task.assigneeUserId ?? (task.assignee ? `legacy:${task.assignee}` : 'unassigned');
    if (filters.assignees.length > 0 && !filters.assignees.includes(assigneeKey)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(task.category)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false;
    return matchesDueFilter(task, filters.due, today);
  });
}

export function sortTaskQueue(tasks: Task[], today = localDateString(new Date())) {
  return [...tasks].sort((a, b) => {
    const attentionDifference =
      Number(taskNeedsAttention(b, today)) - Number(taskNeedsAttention(a, today));
    if (attentionDifference !== 0) return attentionDifference;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate)
      return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.seq - b.seq;
  });
}

function groupKey(task: Task, groupBy: TaskQueueGroupBy) {
  if (groupBy === 'status') return task.status;
  if (groupBy === 'sheet') return String(task.page);
  if (groupBy === 'assignee') {
    return task.assigneeUserId ?? (task.assignee ? `legacy:${task.assignee}` : 'unassigned');
  }
  if (groupBy === 'location') return task.locationText.trim() || 'no-location';
  return 'all';
}

function groupLabel(task: Task, groupBy: TaskQueueGroupBy) {
  if (groupBy === 'status') return STATUSES[task.status].label;
  if (groupBy === 'sheet') return `Sheet ${task.page}`;
  if (groupBy === 'assignee') return task.assignee || 'Unassigned';
  if (groupBy === 'location') return task.locationText.trim() || 'No location';
  return 'Tasks';
}

export function groupTaskQueue(tasks: Task[], groupBy: TaskQueueGroupBy): TaskQueueGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: 'Tasks', tasks }];
  const groups = new Map<string, TaskQueueGroup>();
  for (const task of tasks) {
    const key = groupKey(task, groupBy);
    const existing = groups.get(key);
    if (existing) existing.tasks.push(task);
    else groups.set(key, { key, label: groupLabel(task, groupBy), tasks: [task] });
  }
  return [...groups.values()].sort((a, b) => {
    if (groupBy === 'sheet') return Number(a.key) - Number(b.key);
    if (groupBy === 'status') {
      return Object.keys(STATUSES).indexOf(a.key) - Object.keys(STATUSES).indexOf(b.key);
    }
    return a.label.localeCompare(b.label);
  });
}

export function countAdvancedTaskFilters(filters: TaskQueueFilters) {
  return (
    filters.statuses.length +
    filters.assignees.length +
    filters.categories.length +
    filters.priorities.length +
    Number(filters.due !== 'all')
  );
}

export function taskQueueCategoryOptions() {
  return CATEGORIES.map((category) => ({ value: category.id, label: category.label }));
}
