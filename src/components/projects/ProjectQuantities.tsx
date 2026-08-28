import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Download,
  FilterX,
  LocateFixed,
  Search,
  Settings2,
  Sigma,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import {
  groupQuantityRows,
  normalizeQuantityUnit,
  quantityRowNeedsAttention,
  quantityRowOverrun,
  quantityRowRemaining,
  type QuantityGroup,
  type QuantityReportRow,
} from '../../quantities';
import { CATEGORIES, STATUSES } from '../../types';
import { cn } from '../../lib/utils';
import { useProject } from '../../store/project';
import { ManageQuantityItemsDialog } from '../ManageQuantityItemsDialog';
import { ActionBar, ActionBarButton, ActionBarGroup } from '../ui/action-bar';
import { Button } from '../ui/button';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
import { Input } from '../ui/input';

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

export function ProjectQuantities({
  project,
  role,
  onOpenTask,
  endActions,
}: {
  project: Doc<'projects'>;
  role: Doc<'projectMembers'>['role'];
  onOpenTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
  endActions?: ReactNode;
}) {
  const reportRows = useQuery(api.quantities.getProjectReport, { projectId: project._id });
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [unit, setUnit] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [manageItems, setManageItems] = useState(false);
  const canManage = role === 'owner' || role === 'admin';

  const rows = useMemo(() => (reportRows ?? []) as QuantityReportRow[], [reportRows]);
  const plans = useMemo(
    () =>
      [...new Map(rows.map((row) => [row.sourceFileRef || row.sheetId, row.planName])).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows],
  );
  const units = useMemo(
    () => [...new Set(rows.map((row) => normalizeQuantityUnit(row.quantityUnit)))].sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (plan !== 'all' && (row.sourceFileRef || row.sheetId) !== plan) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (unit !== 'all' && normalizeQuantityUnit(row.quantityUnit) !== unit) return false;
      if (attentionOnly && !quantityRowNeedsAttention(row)) return false;
      if (!needle) return true;
      return [
        row.itemName,
        row.title,
        String(row.seq),
        row.planName,
        row.planNumber,
        row.assigneeText,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle));
    });
  }, [attentionOnly, plan, rows, search, status, unit]);
  const groups = useMemo(() => groupQuantityRows(filteredRows), [filteredRows]);
  const exceptionCount = rows.filter(quantityRowNeedsAttention).length;
  const trackedItemCount = new Set(
    rows.flatMap((row) => (row.quantityItemId ? [row.quantityItemId] : [])),
  ).size;
  const planCount = new Set(rows.map((row) => row.sourceFileRef || row.sheetId)).size;
  const hasFilters = Boolean(
    search || plan !== 'all' || status !== 'all' || unit !== 'all' || attentionOnly,
  );

  const resetFilters = () => {
    setSearch('');
    setPlan('all');
    setStatus('all');
    setUnit('all');
    setAttentionOnly(false);
  };

  return (
    <section
      className="relative z-0 flex min-h-0 flex-1 flex-col bg-app"
      aria-label="Project quantities"
    >
      <ActionBar
        label="Quantity tools"
        onOpenNav={() => useProject.getState().toggleSidebarMobile()}
      >
        <ActionBarGroup>
          {canManage && (
            <ActionBarButton
              icon={<Settings2 />}
              label="Manage items"
              onClick={() => setManageItems(true)}
            />
          )}
        </ActionBarGroup>
        <ActionBarGroup align="end">
          <Dropdown trigger={<ActionBarButton icon={<Download />} label="Export CSV" menu />}>
            {(close) => (
              <>
                <DropdownItem
                  onClick={() => {
                    exportSummary(groups, project.name);
                    close();
                  }}
                >
                  <Sigma /> Export summary
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    exportDetails(filteredRows, project.name);
                    close();
                  }}
                >
                  <Download /> Export task details
                </DropdownItem>
              </>
            )}
          </Dropdown>
          {endActions}
        </ActionBarGroup>
      </ActionBar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold leading-none tracking-[-0.02em] text-t1">
                Quantities
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-t2">
                Project-wide planned, completed, and remaining work—traceable to every contributing
                pin.
              </p>
            </div>
            {exceptionCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                data-on={attentionOnly}
                className={attentionOnly ? 'border-warn bg-surface2 text-t1' : ''}
                onClick={() => setAttentionOnly((current) => !current)}
              >
                <AlertTriangle className="text-warn" /> {exceptionCount} need attention
              </Button>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-2 border-y border-line bg-surface sm:grid-cols-4">
            <SummaryFact label="Items tracked" value={trackedItemCount} />
            <SummaryFact label="Measured tasks" value={rows.length} />
            <SummaryFact label="Plans represented" value={planCount} />
            <SummaryFact label="Exceptions" value={exceptionCount} warn={exceptionCount > 0} />
          </dl>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_11rem_9rem_auto]">
            <label className="relative block">
              <span className="sr-only">Search quantities</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-t3" />
              <Input
                className="pl-9"
                placeholder="Search item, task, plan, or assignee"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <FilterSelect
              label="Plan"
              allLabel="All plans"
              value={plan}
              onChange={setPlan}
              options={plans}
            />
            <FilterSelect
              label="Status"
              allLabel="All statuses"
              value={status}
              onChange={setStatus}
              options={Object.entries(STATUSES).map(([value, definition]) => ({
                value,
                label: definition.label,
              }))}
            />
            <FilterSelect
              label="Unit"
              allLabel="All units"
              value={unit}
              onChange={setUnit}
              options={units.map((value) => ({ value, label: value }))}
            />
            <Button variant="ghost" className="h-10" disabled={!hasFilters} onClick={resetFilters}>
              <FilterX /> Clear
            </Button>
          </div>

          {rows.some((row) => !row.quantityItemId || row.itemArchived) && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2.5 text-xs leading-5 text-t2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <span>
                Some task quantities need an active quantity item before they can be included in a
                named total.
              </span>
            </div>
          )}

          {reportRows === undefined ? (
            <QuantitySkeleton />
          ) : rows.length === 0 ? (
            <EmptyQuantities canManage={canManage} onManage={() => setManageItems(true)} />
          ) : groups.length === 0 ? (
            <div className="mt-8 flex min-h-64 flex-col items-center justify-center border-y border-line bg-surface px-6 text-center">
              <FilterX className="size-7 text-t3" />
              <h2 className="mt-3 text-sm font-semibold text-t1">
                No quantities match these filters
              </h2>
              <p className="mt-1 text-xs text-t2">
                Clear the filters to return to the full project register.
              </p>
              <Button variant="text" size="sm" className="mt-2" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <QuantityRegister
              groups={groups}
              expanded={expanded}
              onToggle={(key) =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onOpenTask={onOpenTask}
            />
          )}
        </div>
      </div>

      <ManageQuantityItemsDialog
        open={manageItems}
        projectId={project._id}
        onClose={() => setManageItems(false)}
      />
    </section>
  );
}

function SummaryFact({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="border-line px-4 py-3 not-last:border-r">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-t3">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-mono text-lg font-semibold tabular-nums text-t1',
          warn && 'text-warn',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuantityRegister({
  groups,
  expanded,
  onToggle,
  onOpenTask,
}: {
  groups: QuantityGroup[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onOpenTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[58rem] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface2 text-[10px] font-semibold uppercase tracking-wide text-t3">
            <tr>
              <th className="w-10 px-2 py-2.5" aria-label="Expand" />
              <th className="px-3 py-2.5 text-left">Item</th>
              <th className="px-3 py-2.5 text-left">Unit</th>
              <th className="px-3 py-2.5 text-right">Planned</th>
              <th className="px-3 py-2.5 text-right">Completed</th>
              <th className="px-3 py-2.5 text-right">Remaining</th>
              <th className="w-48 px-3 py-2.5 text-left">Progress</th>
              <th className="px-3 py-2.5 text-right">Tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {groups.map((group) => (
              <QuantityDesktopRows
                key={group.key}
                group={group}
                open={expanded.has(group.key)}
                onToggle={() => onToggle(group.key)}
                onOpenTask={onOpenTask}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-line md:hidden">
        {groups.map((group) => (
          <QuantityMobileGroup
            key={group.key}
            group={group}
            open={expanded.has(group.key)}
            onToggle={() => onToggle(group.key)}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </div>
  );
}

function QuantityDesktopRows({
  group,
  open,
  onToggle,
  onOpenTask,
}: {
  group: QuantityGroup;
  open: boolean;
  onToggle: () => void;
  onOpenTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
}) {
  return (
    <>
      <tr className="hover:bg-surface2/70">
        <td className="px-2 py-3 text-center">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md text-t3 outline-none hover:bg-surface2 hover:text-t1 focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${group.itemName}`}
            aria-expanded={open}
            onClick={onToggle}
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        </td>
        <td className="px-3 py-3">
          <span className={cn('font-semibold text-t1', !group.itemId && 'text-warn')}>
            {group.itemName}
          </span>
          {group.missingPlanned > 0 && (
            <span className="ml-2 text-[10px] text-warn">{group.missingPlanned} missing plan</span>
          )}
        </td>
        <td className="px-3 py-3 font-mono text-t2">{group.unit}</td>
        <QuantityCell value={group.planned} />
        <QuantityCell value={group.completed} />
        <td className="px-3 py-3 text-right font-mono tabular-nums text-t1">
          {formatQuantity(group.remaining)}
          {group.overrun > 0 && (
            <span className="block text-[10px] text-danger">
              +{formatQuantity(group.overrun)} over
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          <ProgressBar percent={group.percent} overrun={group.overrun > 0} />
        </td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-t2">{group.taskCount}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-surface2/55 px-5 py-3">
            <TaskBreakdown rows={group.rows} onOpenTask={onOpenTask} />
          </td>
        </tr>
      )}
    </>
  );
}

function QuantityMobileGroup({
  group,
  open,
  onToggle,
  onOpenTask,
}: {
  group: QuantityGroup;
  open: boolean;
  onToggle: () => void;
  onOpenTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="w-full px-4 py-4 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'truncate text-sm font-semibold text-t1',
                  !group.itemId && 'text-warn',
                )}
              >
                {group.itemName}
              </span>
              <span className="font-mono text-[10px] text-t3">{group.unit}</span>
            </div>
            <p className="mt-1 text-[11px] text-t2">
              {formatQuantity(group.remaining)} remaining · {group.taskCount}{' '}
              {group.taskCount === 1 ? 'task' : 'tasks'}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'mt-0.5 size-4 shrink-0 text-t3 transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
        <div className="mt-3">
          <ProgressBar percent={group.percent} overrun={group.overrun > 0} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MobileMetric label="Planned" value={group.planned} />
          <MobileMetric label="Completed" value={group.completed} />
          <MobileMetric
            label={group.overrun > 0 ? 'Overrun' : 'Remaining'}
            value={group.overrun > 0 ? group.overrun : group.remaining}
            danger={group.overrun > 0}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-line bg-surface2/55 px-3 py-3">
          <TaskBreakdown rows={group.rows} onOpenTask={onOpenTask} />
        </div>
      )}
    </div>
  );
}

function TaskBreakdown({
  rows,
  onOpenTask,
}: {
  rows: QuantityReportRow[];
  onOpenTask: (sheetId: Id<'sheets'>, taskId: Id<'tasks'>) => void;
}) {
  return (
    <div className="space-y-1">
      {rows.map((row) => {
        const remaining = quantityRowRemaining(row);
        const overrun = quantityRowOverrun(row);
        return (
          <button
            key={row.reportLineId}
            type="button"
            className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[minmax(0,1.5fr)_minmax(8rem,1fr)_5rem_5rem_5rem_auto]"
            onClick={() => onOpenTask(row.sheetId as Id<'sheets'>, row.taskId as Id<'tasks'>)}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-t1">
                #{row.seq} {row.title || 'Untitled task'}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-t3">
                {STATUSES[row.status].label} · {row.assigneeText || 'Unassigned'}
              </span>
            </span>
            <span className="hidden min-w-0 truncate text-[11px] text-t2 sm:block">
              {row.planNumber || row.planName} · page {row.planPage}
            </span>
            <DetailMetric label="Planned" value={row.plannedQuantity} />
            <DetailMetric label="Done" value={row.completedQuantity ?? 0} />
            <DetailMetric
              label={overrun > 0 ? 'Over' : 'Remain'}
              value={overrun > 0 ? overrun : remaining}
              danger={overrun > 0}
            />
            <span className="flex size-8 items-center justify-center text-accent" title="Open pin">
              <LocateFixed className="size-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuantityCell({ value }: { value: number }) {
  return (
    <td className="px-3 py-3 text-right font-mono tabular-nums text-t1">{formatQuantity(value)}</td>
  );
}
function MobileMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <span>
      <span className="block text-[9px] uppercase tracking-wide text-t3">{label}</span>
      <span
        className={cn(
          'mt-0.5 block font-mono text-xs font-semibold tabular-nums text-t1',
          danger && 'text-danger',
        )}
      >
        {formatQuantity(value)}
      </span>
    </span>
  );
}
function DetailMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number | null | undefined;
  danger?: boolean;
}) {
  return (
    <span className="hidden text-right sm:block">
      <span className="block text-[9px] uppercase tracking-wide text-t3">{label}</span>
      <span className={cn('font-mono text-[11px] tabular-nums text-t1', danger && 'text-danger')}>
        {value === null || value === undefined ? '—' : formatQuantity(value)}
      </span>
    </span>
  );
}

function ProgressBar({ percent, overrun }: { percent: number | null; overrun: boolean }) {
  const shown = percent === null ? 0 : Math.min(percent, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            'h-full rounded-full',
            overrun ? 'bg-danger' : percent !== null && percent >= 100 ? 'bg-ok' : 'bg-accent',
          )}
          style={{ width: `${shown}%` }}
        />
      </div>
      <span
        className={cn(
          'w-9 text-right font-mono text-[10px] tabular-nums text-t2',
          overrun && 'text-danger',
        )}
      >
        {percent === null ? '—' : `${percent}%`}
      </span>
    </div>
  );
}

function QuantitySkeleton() {
  return (
    <div className="mt-5 space-y-px overflow-hidden rounded-lg border border-line bg-line">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-14 animate-pulse bg-surface" />
      ))}
    </div>
  );
}
function EmptyQuantities({ canManage, onManage }: { canManage: boolean; onManage: () => void }) {
  return (
    <div className="mt-8 flex min-h-72 flex-col items-center justify-center border-y border-line bg-surface px-6 text-center">
      <Boxes className="size-8 text-t3" />
      <h2 className="mt-4 font-display text-lg font-semibold text-t1">
        No quantities have been recorded
      </h2>
      <p className="mt-1 max-w-md text-sm leading-5 text-t2">
        Add a planned or completed quantity to a task, then assign a quantity item to include it in
        this register.
      </p>
      {canManage && (
        <Button variant="default" className="mt-4" onClick={onManage}>
          <Settings2 /> Create quantity items
        </Button>
      )}
    </div>
  );
}
function formatQuantity(value: number) {
  return numberFormatter.format(value);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
function safeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLocaleLowerCase() || 'project'
  );
}
function exportSummary(groups: QuantityGroup[], projectName: string) {
  downloadCsv(`${safeFileName(projectName)}-quantity-summary.csv`, [
    [
      'Item',
      'Unit',
      'Planned',
      'Completed',
      'Remaining',
      'Overrun',
      'Progress percent',
      'Tasks',
      'Plans',
    ],
    ...groups.map((group) => [
      group.itemName,
      group.unit,
      group.planned,
      group.completed,
      group.remaining,
      group.overrun,
      group.percent ?? '',
      group.taskCount,
      group.planCount,
    ]),
  ]);
}
function exportDetails(rows: QuantityReportRow[], projectName: string) {
  downloadCsv(`${safeFileName(projectName)}-quantity-details.csv`, [
    [
      'Item',
      'Unit',
      'Task',
      'Title',
      'Plan',
      'Page',
      'Status',
      'Category',
      'Assignee',
      'Planned',
      'Completed',
      'Remaining',
      'Overrun',
    ],
    ...rows.map((row) => [
      row.itemName ?? 'Needs classification',
      normalizeQuantityUnit(row.quantityUnit),
      row.seq,
      row.title,
      row.planNumber || row.planName,
      row.planPage,
      STATUSES[row.status].label,
      CATEGORIES.find((category) => category.id === row.category)?.label ?? row.category,
      row.assigneeText ?? '',
      row.plannedQuantity ?? '',
      row.completedQuantity ?? 0,
      quantityRowRemaining(row) ?? '',
      quantityRowOverrun(row),
    ]),
  ]);
}
