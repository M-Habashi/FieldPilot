import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  CircleGauge,
  Hash,
  History,
  ImagePlus,
  Layers3,
  List,
  LocateFixed,
  MapPin,
  MessageSquare,
  Paperclip,
  Palette,
  Plus,
  Send,
  Settings2,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { Priority, Status, Task } from '../types';
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  STATUS_ORDER,
  TASK_COLORS,
  categoryById,
  pinColor,
} from '../types';
import { isMobileViewport, relativeTime } from '../lib/utils';
import { userFacingError } from '../lib/errors';
import { useProject } from '../store/project';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select } from './ui/select';
import { Separator } from './ui/separator';
import { ConfirmDialog } from './ui/dialog';
import { usePhotoUrl } from '../hooks/usePhotoUrl';
import type {
  CustomTaskAttributeDefinition,
  CustomTaskAttributeValue,
  CustomTaskAttributeValueRow,
  TaskAttributeConfigurationDraft,
  TaskAttributeKey,
  TaskAttributeLayoutItem,
} from '../task-attributes';
import { ManageTaskAttributesDialog } from './ManageTaskAttributesDialog';
import { ManageQuantityItemsDialog } from './ManageQuantityItemsDialog';
import type { QuantityItemOption, TaskQuantityLine, TaskQuantityPatch } from '../quantities';
import type { Id } from '../../convex/_generated/dataModel';
import type { TaskActivityEntry, TaskActivityFilter, TaskPhotoActivity } from '../task-activity';

export interface ProjectMemberOption {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

const QUANTITY_UNITS = [
  'EA',
  'LF',
  'SF',
  'SY',
  'CF',
  'CY',
  'IN',
  'FT',
  'MM',
  'CM',
  'M',
  'M2',
  'M3',
  'KG',
  'TON',
  'HR',
  'DAY',
  '%',
];

const CURRENCY_OPTIONS = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'AED', 'SAR', 'QAR'].map(
  (currency) => ({ value: currency, label: currency }),
);

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

export function TaskPanelBody({
  taskId,
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
  taskId: string;
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
  const task = useProject((s) => s.tasks[taskId]) as Task | undefined;
  const updateTask = useProject((s) => s.updateTask);
  const deleteTask = useProject((s) => s.deleteTask);
  const selectTask = useProject((s) => s.selectTask);
  const focusTask = useProject((s) => s.focusTask);
  const closeTaskList = useProject((s) => s.closeTaskList);
  const addNote = useProject((s) => s.addNote);
  const addPhotos = useProject((s) => s.addPhotos);
  const removePhoto = useProject((s) => s.removePhoto);
  const setLightbox = useProject((s) => s.setLightbox);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manageAttributes, setManageAttributes] = useState(false);
  const [manageQuantityItems, setManageQuantityItems] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [activityFilter, setActivityFilter] = useState<TaskActivityFilter>('all');
  const [activityError, setActivityError] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setConfirmDelete(false);
    setManageAttributes(false);
    setManageQuantityItems(false);
    setNoteDraft('');
    setActivityFilter('all');
    setActivityError(null);
    setPostingComment(false);
    setUploadingPhotos(false);
    setPendingPhotos([]);
  }, [taskId]);

  const assigneeOptions = useMemo(() => {
    const options = [{ value: '', label: 'Unassigned' }];
    if (task?.assignee && !task.assigneeUserId) {
      options.push({ value: 'legacy', label: `${task.assignee} (legacy)` });
    }
    options.push(
      ...members.map((member) => ({
        value: member.userId,
        label: member.name,
      })),
    );
    return options;
  }, [members, task?.assignee, task?.assigneeUserId]);

  if (!task) return null;

  const category = categoryById(task.category);
  const assigneeValue = task.assigneeUserId ?? (task.assignee ? 'legacy' : '');
  const createdBy = members.find((member) => member.userId === task.createdByUserId);

  const submitActivity = async () => {
    if (!canEdit || (!noteDraft.trim() && pendingPhotos.length === 0)) return;
    setPostingComment(true);
    setUploadingPhotos(pendingPhotos.length > 0);
    setActivityError(null);
    try {
      if (pendingPhotos.length > 0) {
        await addPhotos(task.id, pendingPhotos);
        setPendingPhotos([]);
      }
      if (noteDraft.trim()) {
        await addNote(task.id, noteDraft);
        setNoteDraft('');
      }
      setActivityFilter('all');
    } catch (caught) {
      setActivityError(userFacingError(caught, 'The update could not be shared. Try again.'));
    } finally {
      setPostingComment(false);
      setUploadingPhotos(false);
    }
  };

  const stageActivityPhotos = (files: File[]) => {
    if (!files.length) return;
    setActivityError(null);
    setPendingPhotos((current) => [...current, ...files].slice(0, 20));
  };

  const locateTask = () => {
    focusTask(task.id);
    if (isMobileViewport()) {
      selectTask(null);
      closeTaskList();
    }
  };

  return (
    <>
      <header className="flex min-h-18 items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <span
          className="size-3 shrink-0 rounded-full ring-4 ring-surface2"
          style={{ background: category.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-t3">
            <span className="font-mono">Task #{task.seq}</span>
            <span aria-hidden>·</span>
            <span className="truncate" style={{ color: category.color }}>
              {category.label}
            </span>
            {!canEdit && (
              <span className="rounded-full bg-surface2 px-2 py-0.5 normal-case tracking-normal text-t2">
                View only
              </span>
            )}
          </div>
          {canEdit ? (
            <input
              id="fp-title"
              aria-label="Task title"
              className="w-full min-w-0 bg-transparent p-0 text-base font-semibold leading-6 text-t1 outline-none placeholder:font-normal placeholder:text-t3 hover:text-accent focus:text-accent"
              placeholder="Name this task..."
              value={task.title}
              autoFocus={task.title === ''}
              onChange={(event) => updateTask(task.id, { title: event.target.value })}
            />
          ) : (
            <h2 className="truncate text-base font-semibold leading-6 text-t1">
              {task.title || 'Untitled task'}
            </h2>
          )}
        </div>
        <span className="hidden min-h-7 items-center gap-2 rounded-full bg-surface2 px-3 text-[11px] font-semibold text-t2 sm:flex">
          <span
            className="size-2 rounded-full"
            style={{ background: STATUSES[task.status].color }}
          />
          {STATUSES[task.status].label}
        </span>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label={`Locate ${task.title || `task ${task.seq}`} on plan`}
          title="Locate on plan"
          onClick={locateTask}
        >
          <LocateFixed />
        </Button>
        <Button
          variant="text"
          size="iconSm"
          aria-label="Close task details"
          title="Close task details"
          onClick={() => selectTask(null)}
        >
          <X />
        </Button>
      </header>

      <div className="@container grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_23rem] lg:overflow-hidden">
        <TaskActivityConversation
          entries={taskActivity}
          filter={activityFilter}
          canEdit={canEdit}
          commentDraft={noteDraft}
          pendingPhotos={pendingPhotos}
          postingComment={postingComment}
          uploadingPhotos={uploadingPhotos}
          error={activityError}
          onFilterChange={setActivityFilter}
          onCommentDraftChange={setNoteDraft}
          onSubmitComment={() => void submitActivity()}
          onChoosePhotos={() => fileInputRef.current?.click()}
          onRemovePendingPhoto={(index) =>
            setPendingPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))
          }
          onOpenPhoto={setLightbox}
          onRemovePhoto={(photo) => void removePhoto(task.id, photo.attachmentId)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            stageActivityPhotos(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        <aside className="border-t border-line bg-surface px-4 py-4 text-xs lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-5">
          <div className="space-y-5">
            <AttributeSection
              title="Task attributes"
              action={
                canManageAttributes ? (
                  <Button
                    variant="text"
                    size="sm"
                    className="h-7 px-0"
                    onClick={() => setManageAttributes(true)}
                  >
                    <Settings2 /> Manage
                  </Button>
                ) : undefined
              }
            >
              <AttributeRow icon={<CircleGauge />} label="Status">
                {canEdit ? (
                  <Select
                    id="fp-status"
                    ariaLabel="Status"
                    className="h-10"
                    value={task.status}
                    options={STATUS_ORDER.map((status) => ({
                      value: status,
                      label: STATUSES[status].label,
                      color: STATUSES[status].color,
                    }))}
                    onValueChange={(value) => updateTask(task.id, { status: value as Status })}
                  />
                ) : (
                  <ValueWithDot
                    value={STATUSES[task.status].label}
                    color={STATUSES[task.status].color}
                  />
                )}
              </AttributeRow>
              <AttributeRow icon={<Layers3 />} label="Priority">
                {canEdit ? (
                  <Select
                    id="fp-priority"
                    ariaLabel="Priority"
                    className="h-10"
                    value={String(task.priority)}
                    options={([1, 2, 3] as Priority[]).map((priority) => ({
                      value: String(priority),
                      label: PRIORITIES[priority].label,
                      color: PRIORITIES[priority].color,
                    }))}
                    onValueChange={(value) =>
                      updateTask(task.id, { priority: Number(value) as Priority })
                    }
                  />
                ) : (
                  <ValueWithDot
                    value={PRIORITIES[task.priority].label}
                    color={PRIORITIES[task.priority].color}
                  />
                )}
              </AttributeRow>
              <AttributeRow icon={<Tag />} label="Category">
                {canEdit ? (
                  <Select
                    id="fp-category"
                    ariaLabel="Category"
                    className="h-10"
                    value={task.category}
                    options={CATEGORIES.map((categoryOption) => ({
                      value: categoryOption.id,
                      label: categoryOption.label,
                      color: categoryOption.color,
                    }))}
                    onValueChange={(value) => updateTask(task.id, { category: value })}
                  />
                ) : (
                  <ValueWithDot value={category.label} color={category.color} />
                )}
              </AttributeRow>
              <AttributeRow icon={<UserRound />} label="Assignee">
                {canEdit ? (
                  <Select
                    id="fp-assignee"
                    ariaLabel="Assignee"
                    className="h-10"
                    value={assigneeValue}
                    options={assigneeOptions}
                    onValueChange={(value) => {
                      if (value === 'legacy') return;
                      const member = members.find((candidate) => candidate.userId === value);
                      updateTask(task.id, {
                        assigneeUserId: value || null,
                        assignee: member?.name ?? '',
                      });
                    }}
                  />
                ) : (
                  <ReadValue>{task.assignee || 'Unassigned'}</ReadValue>
                )}
              </AttributeRow>
              {taskAttributeLayout
                .filter((item) => item.visible)
                .map((item) => {
                  if (item.kind === 'builtin') {
                    return (
                      <ManagedTaskAttribute
                        key={item.key}
                        attributeKey={item.key}
                        task={task}
                        canEdit={canEdit}
                        locateTask={locateTask}
                        onChange={(patch) => updateTask(task.id, patch)}
                        quantityItems={quantityItems}
                        quantityLines={taskQuantityLines}
                        canManageQuantityItems={canManageAttributes}
                        onManageQuantityItems={() => setManageQuantityItems(true)}
                        onAddQuantityLine={onAddTaskQuantityLine}
                        onUpdateQuantityLine={onUpdateTaskQuantityLine}
                        onRemoveQuantityLine={onRemoveTaskQuantityLine}
                      />
                    );
                  }
                  const definition = customTaskAttributeDefinitions.find(
                    (candidate) => candidate.id === item.definitionId,
                  );
                  if (!definition) return null;
                  const value = customTaskAttributeValues.find(
                    (candidate) => candidate.definitionId === definition.id,
                  );
                  return (
                    <CustomTaskAttributeField
                      key={definition.id}
                      definition={definition}
                      value={value}
                      canEdit={canEdit}
                      onChange={(nextValue) =>
                        void onCustomTaskAttributeValueChange(definition.id, nextValue)
                      }
                    />
                  );
                })}
            </AttributeSection>

            <AttributeSection title="Description">
              {canEdit ? (
                <Textarea
                  id="fp-desc"
                  aria-label="Description"
                  className="min-h-24 text-xs"
                  placeholder="Scope, acceptance criteria, or field instructions"
                  value={task.description}
                  onChange={(event) => updateTask(task.id, { description: event.target.value })}
                />
              ) : (
                <p className="whitespace-pre-wrap text-xs leading-5 text-t1">
                  {task.description || 'No description.'}
                </p>
              )}
            </AttributeSection>

            <details className="group rounded-lg bg-surface2 px-3 py-2.5">
              <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-medium text-t2 outline-none hover:text-t1 focus-visible:text-accent">
                <Palette className="size-4" />
                Pin appearance
                <ChevronDown className="ml-auto size-4 text-t3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pt-3">
                {canEdit ? (
                  <PinColorEditor
                    task={task}
                    onChange={(color) => updateTask(task.id, { color })}
                  />
                ) : (
                  <ValueWithDot
                    value={
                      TASK_COLORS.find((color) => color.value === pinColor(task))?.label ?? 'Custom'
                    }
                    color={pinColor(task)}
                  />
                )}
              </div>
            </details>

            {canEdit && (
              <>
                <Separator />
                <section>
                  <h3 className="mb-1 text-xs font-semibold text-t2">Delete task</h3>
                  <p className="mb-2 text-[11px] leading-4 text-t3">
                    Removes the pin and task data. Attached project photos remain available on the
                    map.
                  </p>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete task
                  </Button>
                </section>
              </>
            )}
            <div className="border-t border-line pt-3 text-[10px] leading-4 text-t3">
              {createdBy ? `Created by ${createdBy.name} ` : 'Created '}
              {relativeTime(task.createdAt)} · updated {relativeTime(task.updatedAt)}
              {canEdit && (
                <span className="block">Changes save automatically and appear in activity.</span>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete task #${task.seq}?`}
        description="The pin and its notes will be removed. Project photos will be kept and unassigned. This cannot be undone."
        confirmLabel="Delete task"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteTask(task.id);
        }}
      />
      <ManageTaskAttributesDialog
        open={manageAttributes}
        layout={taskAttributeLayout}
        definitions={customTaskAttributeDefinitions}
        onCancel={() => setManageAttributes(false)}
        onSave={onTaskAttributeConfigurationChange}
      />
      <ManageQuantityItemsDialog
        open={manageQuantityItems}
        projectId={projectId}
        onClose={() => setManageQuantityItems(false)}
      />
    </>
  );
}

function AttributeSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div
        className={
          action
            ? 'mb-1.5 flex min-h-7 items-center justify-between gap-3'
            : 'mb-1.5 flex items-center'
        }
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-t3">{title}</h3>
        {action}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function ManagedTaskAttribute({
  attributeKey,
  task,
  canEdit,
  locateTask,
  onChange,
  quantityItems,
  quantityLines,
  canManageQuantityItems,
  onManageQuantityItems,
  onAddQuantityLine,
  onUpdateQuantityLine,
  onRemoveQuantityLine,
}: {
  attributeKey: TaskAttributeKey;
  task: Task;
  canEdit: boolean;
  locateTask: () => void;
  onChange: (patch: Partial<Task>) => void;
  quantityItems: QuantityItemOption[];
  quantityLines: TaskQuantityLine[] | undefined;
  canManageQuantityItems: boolean;
  onManageQuantityItems: () => void;
  onAddQuantityLine: () => Promise<void>;
  onUpdateQuantityLine: (lineId: string | undefined, patch: TaskQuantityPatch) => Promise<void>;
  onRemoveQuantityLine: (lineId: string | undefined) => Promise<void>;
}) {
  switch (attributeKey) {
    case 'plan':
      return (
        <AttributeRow icon={<MapPin />} label="Plan">
          <div className="flex min-h-10 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-t1">Sheet page {task.page}</span>
            <Button
              variant="text"
              size="sm"
              className="px-1.5"
              onClick={locateTask}
              aria-label="Locate pin on plan"
            >
              <LocateFixed /> Locate
            </Button>
          </div>
        </AttributeRow>
      );
    case 'location':
      return (
        <AttributeRow icon={<MapPin />} label="Location" vertical>
          {canEdit ? (
            <Input
              id="fp-location"
              aria-label="Location"
              className="h-10"
              maxLength={120}
              placeholder="Level, room, grid, or zone"
              value={task.locationText ?? ''}
              onChange={(event) => onChange({ locationText: event.target.value })}
            />
          ) : (
            <ReadValue>{task.locationText || 'Not specified'}</ReadValue>
          )}
        </AttributeRow>
      );
    case 'startDate':
      return (
        <AttributeRow icon={<CalendarDays />} label="Start date">
          {canEdit ? (
            <Input
              id="fp-start"
              aria-label="Start date"
              type="date"
              max={task.dueDate ?? undefined}
              className="h-10 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
              value={task.startDate ?? ''}
              onInput={(event) => onChange({ startDate: event.currentTarget.value || null })}
            />
          ) : (
            <ReadValue>{formatDate(task.startDate)}</ReadValue>
          )}
        </AttributeRow>
      );
    case 'dueDate':
      return (
        <AttributeRow icon={<CalendarDays />} label="Due date">
          {canEdit ? (
            <Input
              id="fp-due"
              aria-label="Due date"
              type="date"
              min={task.startDate ?? undefined}
              className="h-10 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
              value={task.dueDate ?? ''}
              onInput={(event) => onChange({ dueDate: event.currentTarget.value || null })}
            />
          ) : (
            <ReadValue>{formatDate(task.dueDate)}</ReadValue>
          )}
        </AttributeRow>
      );
    case 'manpower':
      return (
        <AttributeRow icon={<UsersRound />} label="Manpower">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <NumericInput
                id="fp-manpower"
                ariaLabel="Manpower in people"
                value={task.manpowerCount ?? null}
                integer
                onValueChange={(value) => onChange({ manpowerCount: value })}
              />
              <span className="shrink-0 text-t3">people</span>
            </div>
          ) : (
            <ReadValue>
              {task.manpowerCount === null || task.manpowerCount === undefined
                ? 'Not specified'
                : `${task.manpowerCount} people`}
            </ReadValue>
          )}
        </AttributeRow>
      );
    case 'cost':
      return (
        <AttributeRow icon={<CircleDollarSign />} label="Cost" vertical>
          {canEdit ? (
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <NumericInput
                id="fp-cost"
                ariaLabel="Task cost"
                value={task.costMinor == null ? null : task.costMinor / 100}
                step="0.01"
                onValueChange={(value) =>
                  onChange({ costMinor: value === null ? null : Math.round(value * 100) })
                }
              />
              <Select
                id="fp-currency"
                ariaLabel="Currency"
                className="h-10 rounded-md border border-line-strong px-2"
                value={task.currencyCode || 'USD'}
                options={CURRENCY_OPTIONS}
                onValueChange={(currencyCode) => onChange({ currencyCode })}
              />
            </div>
          ) : (
            <ReadValue>{formatCost(task.costMinor, task.currencyCode)}</ReadValue>
          )}
        </AttributeRow>
      );
    case 'tags':
      return (
        <AttributeRow icon={<Tag />} label="Tags" vertical>
          {canEdit ? (
            <TagEditor tags={task.tags ?? []} onChange={(tags) => onChange({ tags })} />
          ) : task.tags?.length ? (
            <TagList tags={task.tags} />
          ) : (
            <ReadValue>None</ReadValue>
          )}
        </AttributeRow>
      );
    case 'quantity':
      return (
        <div className="py-3">
          <QuantitySection
            task={task}
            canEdit={canEdit}
            items={quantityItems}
            lines={quantityLines}
            canManageItems={canManageQuantityItems}
            onManageItems={onManageQuantityItems}
            onLegacyChange={onChange}
            onAddLine={onAddQuantityLine}
            onUpdateLine={onUpdateQuantityLine}
            onRemoveLine={onRemoveQuantityLine}
          />
        </div>
      );
  }
}

function CustomTaskAttributeField({
  definition,
  value,
  canEdit,
  onChange,
}: {
  definition: CustomTaskAttributeDefinition;
  value?: CustomTaskAttributeValueRow;
  canEdit: boolean;
  onChange: (value: CustomTaskAttributeValue | null) => void;
}) {
  const id = `fp-custom-${definition.id}`;
  const icon =
    definition.type === 'number' ? (
      <Hash />
    ) : definition.type === 'date' ? (
      <CalendarDays />
    ) : definition.type === 'select' ? (
      <List />
    ) : definition.type === 'boolean' ? (
      <CheckSquare />
    ) : (
      <AlignLeft />
    );

  if (!canEdit) {
    let display = 'Not specified';
    if (definition.type === 'text' && value?.textValue) display = value.textValue;
    if (definition.type === 'number' && value?.numberValue !== undefined) {
      display = `${numberFormatter.format(value.numberValue)}${definition.unit ? ` ${definition.unit}` : ''}`;
    }
    if (definition.type === 'date' && value?.dateValue) display = formatDate(value.dateValue);
    if (definition.type === 'select' && value?.selectOptionId) {
      display =
        definition.options?.find((option) => option.id === value.selectOptionId)?.label ??
        'Archived option';
    }
    if (definition.type === 'boolean' && value?.booleanValue !== undefined) {
      display = value.booleanValue ? 'Yes' : 'No';
    }
    return (
      <AttributeRow icon={icon} label={definition.name}>
        <ReadValue>{display}</ReadValue>
      </AttributeRow>
    );
  }

  if (definition.type === 'text') {
    return (
      <AttributeRow icon={icon} label={definition.name} vertical>
        <CustomTextInput
          id={id}
          label={definition.name}
          value={value?.textValue ?? ''}
          onCommit={(text) => onChange(text ? { type: 'text', value: text } : null)}
        />
      </AttributeRow>
    );
  }
  if (definition.type === 'number') {
    return (
      <AttributeRow icon={icon} label={definition.name}>
        <div className="flex items-center gap-2">
          <NumericInput
            id={id}
            ariaLabel={definition.name}
            value={value?.numberValue ?? null}
            onValueChange={(number) =>
              onChange(number === null ? null : { type: 'number', value: number })
            }
          />
          {definition.unit && <span className="shrink-0 text-t3">{definition.unit}</span>}
        </div>
      </AttributeRow>
    );
  }
  if (definition.type === 'date') {
    return (
      <AttributeRow icon={icon} label={definition.name}>
        <Input
          id={id}
          aria-label={definition.name}
          type="date"
          className="h-10 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
          value={value?.dateValue ?? ''}
          onInput={(event) =>
            onChange(
              event.currentTarget.value ? { type: 'date', value: event.currentTarget.value } : null,
            )
          }
        />
      </AttributeRow>
    );
  }
  if (definition.type === 'select') {
    return (
      <AttributeRow icon={icon} label={definition.name}>
        <Select
          id={id}
          ariaLabel={definition.name}
          className="h-10"
          value={value?.selectOptionId ?? ''}
          options={[
            { value: '', label: 'Not selected' },
            ...(definition.options ?? [])
              .filter((option) => option.active)
              .map((option) => ({ value: option.id, label: option.label })),
          ]}
          onValueChange={(optionId) => onChange(optionId ? { type: 'select', optionId } : null)}
        />
      </AttributeRow>
    );
  }
  return (
    <AttributeRow icon={icon} label={definition.name}>
      <Select
        id={id}
        ariaLabel={definition.name}
        className="h-10"
        value={value?.booleanValue === undefined ? '' : value.booleanValue ? 'yes' : 'no'}
        options={[
          { value: '', label: 'Not specified' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onValueChange={(next) =>
          onChange(next === '' ? null : { type: 'boolean', value: next === 'yes' })
        }
      />
    </AttributeRow>
  );
}

function CustomTextInput({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const normalized = draft.trim();
    if (normalized !== value) onCommit(normalized);
  };
  return (
    <Input
      id={id}
      aria-label={label}
      maxLength={2_000}
      placeholder="Enter a value"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function AttributeRow({
  icon,
  label,
  vertical = false,
  children,
}: {
  icon: ReactNode;
  label: string;
  vertical?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        vertical ? 'py-2.5' : 'grid min-h-12 grid-cols-[7.5rem_1fr] items-center gap-3 py-1'
      }
    >
      <div className={`flex items-center gap-2 text-t3 ${vertical ? 'mb-2' : ''}`}>
        <span className="[&_svg]:size-4">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReadValue({ children }: { children: ReactNode }) {
  return <span className="flex min-h-10 items-center text-t1">{children}</span>;
}

function ValueWithDot({ value, color }: { value: string; color: string }) {
  return (
    <span className="flex min-h-10 items-center gap-2 text-t1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="truncate">{value}</span>
    </span>
  );
}

function QuantitySection({
  task,
  canEdit,
  items,
  lines,
  canManageItems,
  onManageItems,
  onLegacyChange,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
}: {
  task: Task;
  canEdit: boolean;
  items: QuantityItemOption[];
  lines: TaskQuantityLine[] | undefined;
  canManageItems: boolean;
  onManageItems: () => void;
  onLegacyChange: (patch: Partial<Task>) => void;
  onAddLine: () => Promise<void>;
  onUpdateLine: (lineId: string | undefined, patch: TaskQuantityPatch) => Promise<void>;
  onRemoveLine: (lineId: string | undefined) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TaskQuantityLine | null>(null);
  const hasLegacyQuantity =
    task.quantityItemId != null || task.plannedQuantity != null || task.completedQuantity != null;
  const isLocalTask = task.id.startsWith('local:');
  const resolvedLines =
    lines ??
    (isLocalTask && hasLegacyQuantity
      ? [
          {
            legacy: true,
            quantityItemId: task.quantityItemId ?? undefined,
            plannedQuantity: task.plannedQuantity ?? undefined,
            completedQuantity: task.completedQuantity ?? undefined,
            quantityUnit: task.quantityUnit ?? undefined,
          },
        ]
      : undefined);

  const addLine = async () => {
    setError(null);
    setActionPending(true);
    try {
      await onAddLine();
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setActionPending(false);
    }
  };

  const updateLine = (line: TaskQuantityLine, patch: TaskQuantityPatch) => {
    setError(null);
    if (isLocalTask && line.legacy) {
      const { quantityUnit, ...legacyPatch } = patch;
      onLegacyChange({
        ...legacyPatch,
        ...(quantityUnit === undefined ? {} : { quantityUnit: quantityUnit ?? '' }),
      });
      return;
    }
    void onUpdateLine(line.lineId, patch).catch((caught) => setError(userFacingError(caught)));
  };

  const removeLine = async () => {
    if (!pendingRemoval) return;
    setError(null);
    setActionPending(true);
    try {
      if (isLocalTask && pendingRemoval.legacy) {
        onLegacyChange({
          quantityItemId: null,
          plannedQuantity: null,
          completedQuantity: null,
          quantityUnit: '',
        });
      } else {
        await onRemoveLine(pendingRemoval.lineId);
      }
      setPendingRemoval(null);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setActionPending(false);
    }
  };

  return (
    <section aria-labelledby="fp-quantity-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3
          id="fp-quantity-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-t3"
        >
          Quantities
        </h3>
        {canEdit && (
          <Button
            variant="default"
            size="sm"
            className="h-8 shrink-0"
            disabled={actionPending || isLocalTask}
            onClick={() => void addLine()}
            title={isLocalTask ? 'Available as soon as the task finishes saving' : undefined}
          >
            <Plus /> Add quantity
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface2">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
          <p className="min-w-0 text-[11px] leading-4 text-t2">
            Each row is totaled separately in the Quantities report.
          </p>
          {canManageItems && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 shrink-0 bg-surface"
              onClick={onManageItems}
            >
              <Settings2 /> Manage items
            </Button>
          )}
        </div>

        {resolvedLines === undefined ? (
          <div className="space-y-2 p-3" aria-label="Loading task quantities">
            <div className="h-10 animate-pulse rounded-md bg-line/70" />
            <div className="h-20 animate-pulse rounded-md bg-line/70" />
          </div>
        ) : resolvedLines.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Hash className="mx-auto size-5 text-t3" />
            <p className="mt-2 text-xs font-semibold text-t1">No quantities on this task</p>
            <p className="mx-auto mt-1 max-w-64 text-[11px] leading-4 text-t2">
              Add the first item to track its planned, completed, and remaining amount.
            </p>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 bg-surface"
                disabled={actionPending || isLocalTask}
                onClick={() => void addLine()}
              >
                <Plus /> Add first quantity
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {resolvedLines.map((line, index) => (
              <QuantityLineEditor
                key={line.lineId ?? 'legacy'}
                index={index}
                line={line}
                canEdit={canEdit}
                items={items}
                onChange={(patch) => updateLine(line, patch)}
                onRemove={() => setPendingRemoval(line)}
              />
            ))}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-4 text-danger">
          {error}
        </p>
      )}
      {canEdit && items.length === 0 && resolvedLines?.length !== 0 && (
        <p className="mt-2 text-[11px] leading-4 text-t2">
          {canManageItems
            ? 'Create a quantity item with Manage items, then assign it to each row for named totals.'
            : 'A project owner or administrator must create quantity items before rows can be classified.'}
        </p>
      )}
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this quantity?"
        description="Its planned and completed values will be removed from this task and from quantity reports. This cannot be undone."
        confirmLabel="Remove quantity"
        confirmDisabled={actionPending}
        danger
        onConfirm={() => void removeLine()}
        onCancel={() => setPendingRemoval(null)}
      />
      <datalist id="fp-quantity-units">
        {QUANTITY_UNITS.map((quantityUnit) => (
          <option key={quantityUnit} value={quantityUnit} />
        ))}
      </datalist>
    </section>
  );
}

function QuantityLineEditor({
  index,
  line,
  canEdit,
  items,
  onChange,
  onRemove,
}: {
  index: number;
  line: TaskQuantityLine;
  canEdit: boolean;
  items: QuantityItemOption[];
  onChange: (patch: TaskQuantityPatch) => void;
  onRemove: () => void;
}) {
  const planned = line.plannedQuantity ?? null;
  const completed = line.completedQuantity ?? 0;
  const difference = planned === null ? null : planned - completed;
  const remaining = difference === null ? null : Math.max(difference, 0);
  const overrun = difference === null ? 0 : Math.max(-difference, 0);
  const percent =
    planned === null
      ? null
      : planned === 0
        ? completed > 0
          ? 100
          : 0
        : Math.round((completed / planned) * 100);
  const item = items.find((candidate) => candidate.id === line.quantityItemId);
  const displayUnit = line.quantityUnit || item?.defaultUnit || 'EA';
  const controlId = line.lineId ?? 'legacy';
  const progressLabel =
    planned === null
      ? 'Set a planned quantity to calculate remaining work.'
      : overrun > 0
        ? `${numberFormatter.format(overrun)} ${displayUnit} over plan`
        : `${numberFormatter.format(remaining ?? 0)} ${displayUnit} remaining`;

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-t3">
          Quantity {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {percent !== null && (
            <span className="font-mono text-[11px] font-semibold text-t2">{percent}%</span>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="iconXs"
              className="text-t3 hover:bg-danger-soft hover:text-danger"
              aria-label={`Remove quantity ${index + 1}`}
              title="Remove quantity"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <label
        htmlFor={`fp-quantity-item-${controlId}`}
        className="mb-1 block text-[10px] font-medium text-t3"
      >
        Item
      </label>
      {canEdit ? (
        <Select
          id={`fp-quantity-item-${controlId}`}
          ariaLabel={`Quantity ${index + 1} item`}
          className="h-10 rounded-md border border-line-strong bg-surface px-2"
          value={line.quantityItemId ?? ''}
          options={[
            { value: '', label: 'No quantity item selected' },
            ...items.map((candidate) => ({ value: candidate.id, label: candidate.name })),
          ]}
          onValueChange={(quantityItemId) => onChange({ quantityItemId: quantityItemId || null })}
        />
      ) : (
        <ReadValue>{item?.name ?? 'No quantity item selected'}</ReadValue>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 @[360px]:grid-cols-3">
        {canEdit ? (
          <>
            <LabeledNumber
              id={`fp-planned-quantity-${controlId}`}
              label="Planned"
              value={planned}
              onValueChange={(plannedQuantity) => onChange({ plannedQuantity })}
            />
            <LabeledNumber
              id={`fp-completed-quantity-${controlId}`}
              label="Completed"
              value={line.completedQuantity ?? null}
              onValueChange={(completedQuantity) => onChange({ completedQuantity })}
            />
            <div className="col-span-2 @[360px]:col-span-1">
              <label className="mb-1 block text-[10px] font-medium text-t3">Remaining</label>
              <div className="flex h-10 items-center rounded-md bg-surface px-2 font-mono text-xs font-semibold text-t1">
                {remaining === null ? 'N/A' : numberFormatter.format(remaining)}
              </div>
            </div>
            <div className="col-span-2 @[360px]:col-span-3">
              <label
                htmlFor={`fp-quantity-unit-${controlId}`}
                className="mb-1 block text-[10px] font-medium text-t3"
              >
                Unit
              </label>
              <Input
                id={`fp-quantity-unit-${controlId}`}
                list="fp-quantity-units"
                className="h-10 uppercase"
                maxLength={24}
                value={line.quantityUnit ?? ''}
                placeholder={item?.defaultUnit || 'EA'}
                onChange={(event) => onChange({ quantityUnit: event.target.value.toUpperCase() })}
              />
            </div>
          </>
        ) : (
          <>
            <QuantityMetric label="Planned" value={planned} unit={displayUnit} />
            <QuantityMetric label="Completed" value={completed} unit={displayUnit} />
            <div className="col-span-2 @[360px]:col-span-1">
              <QuantityMetric label="Remaining" value={remaining} unit={displayUnit} />
            </div>
          </>
        )}
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={`Quantity ${index + 1} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.min(percent, 100)}
        aria-valuetext={
          percent === null ? 'Planned quantity not set' : `${percent}%, ${progressLabel}`
        }
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-(--fp-dur-med) ease-(--fp-ease) ${
            overrun > 0 ? 'bg-danger' : 'bg-accent'
          }`}
          style={{ width: `${Math.min(percent ?? 0, 100)}%` }}
        />
      </div>
      <p className={`mt-1.5 text-[11px] ${overrun > 0 ? 'text-danger' : 'text-t3'}`}>
        {progressLabel}
      </p>
    </div>
  );
}

function LabeledNumber({
  id,
  label,
  value,
  onValueChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[10px] font-medium text-t3">
        {label}
      </label>
      <NumericInput
        id={id}
        ariaLabel={`${label} quantity`}
        value={value}
        onValueChange={onValueChange}
      />
    </div>
  );
}

function NumericInput({
  id,
  ariaLabel,
  value,
  onValueChange,
  integer = false,
  step,
}: {
  id: string;
  ariaLabel: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  integer?: boolean;
  step?: string;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value === null ? '' : String(value));
  }, [value]);

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min="0"
      step={step ?? (integer ? '1' : 'any')}
      className="h-10 px-2 font-mono text-xs"
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft === '') {
          onValueChange(null);
          return;
        }
        const parsed = Number(nextDraft);
        if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed)))
          return;
        onValueChange(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(value === null ? '' : String(value));
      }}
    />
  );
}

function QuantityMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div>
      <span className="block text-[10px] text-t3">{label}</span>
      <strong className="mt-1 block font-mono text-xs text-t1">
        {value === null ? 'N/A' : `${numberFormatter.format(value)} ${unit}`}
      </strong>
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const addTag = (suppliedTag: string) => {
    const tag = suppliedTag.trim();
    if (!tag || tags.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...tags, tag].slice(0, 20));
    setDraft('');
  };

  return (
    <div>
      {tags.length > 0 && (
        <TagList tags={tags} onRemove={(tag) => onChange(tags.filter((item) => item !== tag))} />
      )}
      <Input
        className="mt-2 h-10"
        aria-label="Add task tag"
        maxLength={40}
        placeholder="Type a tag and press Enter"
        value={draft}
        onChange={(event) => {
          if (event.target.value.endsWith(',')) {
            addTag(event.target.value.slice(0, -1));
          } else {
            setDraft(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addTag(draft);
          }
        }}
        onBlur={() => addTag(draft)}
      />
    </div>
  );
}

function TagList({ tags, onRemove }: { tags: string[]; onRemove?: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-h-7 items-center gap-1 rounded-full bg-surface2 px-2.5 text-[11px] text-t2"
        >
          {tag}
          {onRemove && (
            <button
              type="button"
              className="-mr-1 flex size-6 items-center justify-center rounded-full text-t3 hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onRemove(tag)}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function PinColorEditor({ task, onChange }: { task: Task; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pin color">
      {TASK_COLORS.map((color) => {
        const selected = pinColor(task) === color.value;
        return (
          <button
            key={color.value}
            type="button"
            aria-label={`${color.label} pin color`}
            aria-pressed={selected}
            className={`size-8 rounded-full border-4 border-surface2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              selected ? 'ring-2 ring-offset-1 ring-offset-surface2' : ''
            }`}
            style={{
              background: color.value,
              ...(selected ? ({ '--tw-ring-color': color.value } as CSSProperties) : {}),
            }}
            onClick={() => onChange(color.value)}
          />
        );
      })}
    </div>
  );
}

function PhotoTile({
  id,
  name,
  remoteUrl,
  onOpen,
  onRemove,
}: {
  id: string;
  name: string;
  remoteUrl?: string;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const url = usePhotoUrl(id, remoteUrl);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-line bg-surface2">
      {url ? (
        <img
          src={url}
          alt={name}
          className="h-full w-full cursor-zoom-in object-cover transition-transform duration-(--fp-dur-med) ease-(--fp-ease) group-hover:scale-105"
          onClick={onOpen}
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-surface2" />
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove photo ${name}`}
          className="absolute right-1 top-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function TaskActivityConversation({
  entries,
  filter,
  canEdit,
  commentDraft,
  pendingPhotos,
  postingComment,
  uploadingPhotos,
  error,
  onFilterChange,
  onCommentDraftChange,
  onSubmitComment,
  onChoosePhotos,
  onRemovePendingPhoto,
  onOpenPhoto,
  onRemovePhoto,
}: {
  entries: TaskActivityEntry[] | undefined;
  filter: TaskActivityFilter;
  canEdit: boolean;
  commentDraft: string;
  pendingPhotos: File[];
  postingComment: boolean;
  uploadingPhotos: boolean;
  error: string | null;
  onFilterChange: (filter: TaskActivityFilter) => void;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: () => void;
  onChoosePhotos: () => void;
  onRemovePendingPhoto: (index: number) => void;
  onOpenPhoto: (photoId: string) => void;
  onRemovePhoto: (photo: TaskPhotoActivity) => void;
}) {
  const counts = {
    comment: entries?.filter((entry) => entry.type === 'comment').length ?? 0,
    photo: entries?.filter((entry) => entry.type === 'photo').length ?? 0,
    change: entries?.filter((entry) => entry.type === 'change').length ?? 0,
  };
  const visibleEntries = entries?.filter((entry) => filter === 'all' || entry.type === filter);
  const feedItems = visibleEntries ? buildActivityFeed(visibleEntries) : undefined;
  let previousDay = '';

  return (
    <section
      aria-labelledby="fp-activity-heading"
      className="flex min-h-[34rem] flex-col bg-surface2/45 lg:min-h-0"
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-5">
        <div>
          <h3 id="fp-activity-heading" className="text-sm font-semibold text-t1">
            Activity
          </h3>
          <p className="mt-0.5 text-[10px] text-t3">A dated record of field updates and changes</p>
        </div>
        <Select
          id="fp-activity-filter"
          ariaLabel="Filter task activity"
          className="h-8 w-40 shrink-0 bg-surface text-[11px]"
          value={filter}
          options={[
            { value: 'all', label: `All activity${entries ? ` (${entries.length})` : ''}` },
            { value: 'comment', label: `Comments (${counts.comment})` },
            { value: 'photo', label: `Photos (${counts.photo})` },
            { value: 'change', label: `Changes (${counts.change})` },
          ]}
          onValueChange={(value) => onFilterChange(value as TaskActivityFilter)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-visible px-4 pb-32 pt-4 sm:px-5 lg:overflow-y-auto lg:py-4">
        {feedItems === undefined ? (
          <div className="mx-auto max-w-3xl space-y-4" aria-label="Loading task activity">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex gap-3">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-line" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-32 animate-pulse rounded bg-line" />
                  <div className="h-20 animate-pulse rounded-xl bg-surface" />
                </div>
              </div>
            ))}
          </div>
        ) : feedItems.length === 0 ? (
          <div className="py-16 text-center">
            <History className="mx-auto size-5 text-t3" />
            <p className="mt-2 text-xs font-semibold text-t1">No matching activity</p>
            <p className="mt-1 text-[11px] text-t2">
              Choose another filter to see this task’s log.
            </p>
          </div>
        ) : (
          <ol className="mx-auto max-w-3xl">
            {feedItems.map((item, itemIndex) => {
              const dayKey = activityDayKey(item.createdAt);
              const showDay = dayKey !== previousDay;
              previousDay = dayKey;
              return (
                <li key={item.id}>
                  {showDay && (
                    <div
                      className={`mb-5 flex items-center gap-3 ${itemIndex === 0 ? '' : 'mt-7'}`}
                    >
                      <span className="h-px flex-1 bg-line" />
                      <time
                        dateTime={new Date(item.createdAt).toISOString()}
                        className="shrink-0 rounded-full bg-surface px-3 py-1 text-[10px] font-semibold text-t3 shadow-e1"
                      >
                        {formatActivityDay(item.createdAt)}
                      </time>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  {item.kind === 'change' ? (
                    <div className="mb-5 flex items-center justify-center gap-2 px-4 text-center text-[11px] leading-4 text-t3">
                      <History className="size-3.5 shrink-0" />
                      <span>
                        <strong className="font-semibold text-t2">{item.entry.actorName}</strong>{' '}
                        {sentenceCaseChange(item.entry.summary)}
                      </span>
                      <time
                        dateTime={new Date(item.entry.createdAt).toISOString()}
                        title={new Date(item.entry.createdAt).toLocaleString()}
                        className="shrink-0 font-mono text-[10px]"
                      >
                        {formatActivityTime(item.entry.createdAt)}
                      </time>
                    </div>
                  ) : (
                    <div className="mb-5 flex items-start gap-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent"
                        aria-hidden
                      >
                        {actorInitials(item.actorName)}
                      </span>
                      <div className="min-w-0 max-w-[min(38rem,calc(100%-2.75rem))]">
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="truncate text-[11px] font-semibold text-t1">
                            {item.actorName}
                          </span>
                          <time
                            dateTime={new Date(item.createdAt).toISOString()}
                            title={new Date(item.createdAt).toLocaleString()}
                            className="shrink-0 text-[10px] text-t3"
                          >
                            {formatActivityTime(item.createdAt)}
                          </time>
                        </div>
                        <div className="rounded-2xl rounded-tl-sm bg-surface p-2.5 shadow-e1">
                          {item.photos.length > 0 && (
                            <div
                              className={`grid gap-1.5 ${item.photos.length === 1 ? 'max-w-sm grid-cols-1' : 'grid-cols-2'}`}
                            >
                              {item.photos.map((photo) => (
                                <PhotoTile
                                  key={photo.id}
                                  id={photo.attachmentId}
                                  name={photo.fileName}
                                  remoteUrl={photo.url}
                                  onOpen={() => onOpenPhoto(photo.attachmentId)}
                                  onRemove={canEdit ? () => onRemovePhoto(photo) : undefined}
                                />
                              ))}
                            </div>
                          )}
                          {item.comments.map((comment) => (
                            <p
                              key={comment.id}
                              className={`${item.photos.length > 0 ? 'mt-2.5' : ''} whitespace-pre-wrap px-1 text-xs leading-5 text-t1`}
                            >
                              {comment.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {canEdit && (
        <div className="sticky bottom-0 z-10 border-t border-line bg-surface p-3 sm:px-5 sm:py-4 lg:static">
          <div className="mx-auto max-w-3xl">
            {pendingPhotos.length > 0 && (
              <div
                className="mb-2 flex gap-2 overflow-x-auto pb-1"
                aria-label="Photos ready to share"
              >
                {pendingPhotos.map((file, index) => (
                  <PendingPhotoTile
                    key={`${file.name}:${file.lastModified}:${index}`}
                    file={file}
                    onRemove={() => onRemovePendingPhoto(index)}
                  />
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface2 p-1.5 focus-within:border-accent">
              <Button
                variant="text"
                size="iconSm"
                className="mb-0.5 shrink-0"
                aria-label="Attach photos"
                title="Attach photos"
                disabled={postingComment}
                onClick={onChoosePhotos}
              >
                <Paperclip />
              </Button>
              <Textarea
                aria-label="Add task update"
                className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-xs leading-5 shadow-none focus:ring-0"
                maxLength={4_000}
                placeholder="Write an update or attach site photos…"
                value={commentDraft}
                onChange={(event) => onCommentDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSubmitComment();
                  }
                }}
              />
              <Button
                variant="default"
                size="iconSm"
                className="mb-0.5 shrink-0"
                aria-label={postingComment ? 'Sharing update' : 'Share update'}
                title="Share update"
                disabled={(!commentDraft.trim() && pendingPhotos.length === 0) || postingComment}
                onClick={onSubmitComment}
              >
                <Send />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[10px] text-t3">
              <span>Enter to share · Shift + Enter for a new line</span>
              {(postingComment || uploadingPhotos) && <span>Sharing update…</span>}
            </div>
            {error && (
              <p role="alert" className="mt-2 text-[11px] leading-4 text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type ActivityChangeEntry = Extract<TaskActivityEntry, { type: 'change' }>;
type ActivityCommentEntry = Extract<TaskActivityEntry, { type: 'comment' }>;

type ActivityFeedItem =
  | { kind: 'change'; id: string; createdAt: number; entry: ActivityChangeEntry }
  | {
      kind: 'conversation';
      id: string;
      actorName: string;
      createdAt: number;
      comments: ActivityCommentEntry[];
      photos: TaskPhotoActivity[];
    };

function buildActivityFeed(entries: TaskActivityEntry[]): ActivityFeedItem[] {
  const chronological = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const feed: ActivityFeedItem[] = [];
  for (const entry of chronological) {
    if (entry.type === 'change') {
      feed.push({ kind: 'change', id: entry.id, createdAt: entry.createdAt, entry });
      continue;
    }
    const previous = feed.at(-1);
    const canJoinPrevious =
      previous?.kind === 'conversation' &&
      previous.actorName === entry.actorName &&
      entry.createdAt - previous.createdAt <= 5 * 60 * 1_000;
    if (canJoinPrevious) {
      if (entry.type === 'photo') previous.photos.push(entry);
      else previous.comments.push(entry);
      continue;
    }
    feed.push({
      kind: 'conversation',
      id: entry.id,
      actorName: entry.actorName,
      createdAt: entry.createdAt,
      comments: entry.type === 'comment' ? [entry] : [],
      photos: entry.type === 'photo' ? [entry] : [],
    });
  }
  return feed;
}

function PendingPhotoTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return (
    <div className="group relative size-18 shrink-0 overflow-hidden rounded-lg bg-surface2">
      {previewUrl && <img src={previewUrl} alt="" className="size-full object-cover" />}
      <button
        type="button"
        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/65 text-white hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function actorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'FP'
  );
}

function sentenceCaseChange(summary: string) {
  return summary.length > 0 ? `${summary[0].toLocaleLowerCase()}${summary.slice(1)}` : summary;
}

export function TaskActivityLegacy({
  entries,
  filter,
  canEdit,
  commentDraft,
  postingComment,
  uploadingPhotos,
  error,
  onFilterChange,
  onCommentDraftChange,
  onSubmitComment,
  onChoosePhotos,
  onOpenPhoto,
  onRemovePhoto,
}: {
  entries: TaskActivityEntry[] | undefined;
  filter: TaskActivityFilter;
  canEdit: boolean;
  commentDraft: string;
  postingComment: boolean;
  uploadingPhotos: boolean;
  error: string | null;
  onFilterChange: (filter: TaskActivityFilter) => void;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: () => void;
  onChoosePhotos: () => void;
  onOpenPhoto: (photoId: string) => void;
  onRemovePhoto: (photo: TaskPhotoActivity) => void;
}) {
  const counts = {
    comment: entries?.filter((entry) => entry.type === 'comment').length ?? 0,
    photo: entries?.filter((entry) => entry.type === 'photo').length ?? 0,
    change: entries?.filter((entry) => entry.type === 'change').length ?? 0,
  };
  const visibleEntries = entries?.filter((entry) => filter === 'all' || entry.type === filter);
  let previousDay = '';

  return (
    <section aria-labelledby="fp-activity-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 id="fp-activity-heading" className="text-xs font-semibold text-t1">
            Activity
          </h3>
          <p className="mt-0.5 text-[10px] text-t3">Comments, photos, and task changes</p>
        </div>
        <Select
          id="fp-activity-filter"
          ariaLabel="Filter task activity"
          className="h-8 w-36 shrink-0 bg-surface text-[11px]"
          value={filter}
          options={[
            { value: 'all', label: `All activity${entries ? ` (${entries.length})` : ''}` },
            { value: 'comment', label: `Comments (${counts.comment})` },
            { value: 'photo', label: `Photos (${counts.photo})` },
            { value: 'change', label: `Changes (${counts.change})` },
          ]}
          onValueChange={(value) => onFilterChange(value as TaskActivityFilter)}
        />
      </div>

      {canEdit && (
        <div className="mb-4 rounded-xl bg-surface2 p-3">
          <Textarea
            aria-label="Add task comment"
            className="min-h-18 resize-none rounded-md text-xs leading-5"
            maxLength={4_000}
            placeholder="Add a progress update, blocker, or decision…"
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                onSubmitComment();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-surface"
              disabled={uploadingPhotos}
              onClick={onChoosePhotos}
            >
              <ImagePlus /> {uploadingPhotos ? 'Adding photos…' : 'Add photos'}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!commentDraft.trim() || postingComment}
              onClick={onSubmitComment}
            >
              <Send /> {postingComment ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-t3">Ctrl/⌘ + Enter to post</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 text-[11px] leading-4 text-danger">
          {error}
        </p>
      )}

      {visibleEntries === undefined ? (
        <div className="space-y-3" aria-label="Loading task activity">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex gap-3">
              <div className="size-7 shrink-0 animate-pulse rounded-full bg-line" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 w-32 animate-pulse rounded bg-line" />
                <div className="h-12 animate-pulse rounded-md bg-surface2" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="py-6 text-center">
          <History className="mx-auto size-5 text-t3" />
          <p className="mt-2 text-xs font-semibold text-t1">No matching activity</p>
          <p className="mt-1 text-[11px] text-t2">Choose another filter to see this task’s log.</p>
        </div>
      ) : (
        <ol>
          {visibleEntries.map((entry, entryIndex) => {
            const dayKey = activityDayKey(entry.createdAt);
            const showDay = dayKey !== previousDay;
            previousDay = dayKey;
            return (
              <li key={entry.id}>
                {showDay && (
                  <div className={`mb-3 flex items-center gap-2 ${entryIndex === 0 ? '' : 'mt-5'}`}>
                    <time
                      dateTime={new Date(entry.createdAt).toISOString()}
                      className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-t3"
                    >
                      {formatActivityDay(entry.createdAt)}
                    </time>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className="relative ml-3 border-l border-line pb-5 pl-5 last:pb-1">
                  <span className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full bg-surface2 text-t2 ring-4 ring-surface">
                    {entry.type === 'comment' ? (
                      <MessageSquare className="size-3" />
                    ) : entry.type === 'photo' ? (
                      <ImagePlus className="size-3" />
                    ) : (
                      <History className="size-3" />
                    )}
                  </span>
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-t1">
                      {entry.actorName}
                    </span>
                    <time
                      dateTime={new Date(entry.createdAt).toISOString()}
                      title={new Date(entry.createdAt).toLocaleString()}
                      className="shrink-0 text-[10px] text-t3"
                    >
                      {formatActivityTime(entry.createdAt)}
                    </time>
                  </div>
                  {entry.type === 'comment' ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-t1">
                      {entry.text}
                    </p>
                  ) : entry.type === 'photo' ? (
                    <div className="mt-2 max-w-52">
                      <PhotoTile
                        id={entry.attachmentId}
                        name={entry.fileName}
                        remoteUrl={entry.url}
                        onOpen={() => onOpenPhoto(entry.attachmentId)}
                        onRemove={canEdit ? () => onRemovePhoto(entry) : undefined}
                      />
                      <p className="mt-1.5 truncate text-[10px] text-t3" title={entry.fileName}>
                        {entry.fileName}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[11px] italic leading-4 text-t2">{entry.summary}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function activityDayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatActivityDay(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (activityDayKey(timestamp) === activityDayKey(today.getTime())) return `Today — ${dateLabel}`;
  if (activityDayKey(timestamp) === activityDayKey(yesterday.getTime())) {
    return `Yesterday — ${dateLabel}`;
  }
  return dateLabel;
}

function formatActivityTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatCost(value: number | null | undefined, currencyCode: string) {
  if (value === null || value === undefined) return 'Not specified';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currencyCode}`;
  }
}
