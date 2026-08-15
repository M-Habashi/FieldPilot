import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  CircleDollarSign,
  Hash,
  Layers3,
  List,
  LockKeyhole,
  Map,
  MapPin,
  Pencil,
  Plus,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import { userFacingError } from '../lib/errors';
import {
  type CustomTaskAttributeDefinition,
  type CustomTaskAttributeType,
  type TaskAttributeConfigurationDraft,
  type TaskAttributeDefinitionDraft,
  type TaskAttributeKey,
  type TaskAttributeLayoutItem,
} from '../task-attributes';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface AttributeDefinition {
  key: string;
  label: string;
  type: string;
  icon: ReactNode;
}

const REQUIRED_ATTRIBUTES: AttributeDefinition[] = [
  { key: 'status', label: 'Status', type: 'Status', icon: <Layers3 /> },
  { key: 'priority', label: 'Priority', type: 'Priority', icon: <Layers3 /> },
  { key: 'category', label: 'Category', type: 'Category', icon: <Tag /> },
  { key: 'assignee', label: 'Assignee', type: 'Member', icon: <UserRound /> },
];

const CONFIGURABLE_ATTRIBUTES: Record<TaskAttributeKey, AttributeDefinition> = {
  plan: { key: 'plan', label: 'Plan', type: 'Plan location', icon: <Map /> },
  location: { key: 'location', label: 'Location', type: 'Text', icon: <MapPin /> },
  startDate: { key: 'startDate', label: 'Start date', type: 'Date', icon: <CalendarDays /> },
  dueDate: { key: 'dueDate', label: 'Due date', type: 'Date', icon: <CalendarDays /> },
  manpower: { key: 'manpower', label: 'Manpower', type: 'People', icon: <UsersRound /> },
  cost: { key: 'cost', label: 'Cost', type: 'Currency', icon: <CircleDollarSign /> },
  tags: { key: 'tags', label: 'Tags', type: 'Tags', icon: <Tag /> },
  quantity: { key: 'quantity', label: 'Quantity', type: 'Progress', icon: <Hash /> },
};

const TYPE_LABELS: Record<CustomTaskAttributeType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  boolean: 'Yes / No',
};

const TYPE_ICONS: Record<CustomTaskAttributeType, ReactNode> = {
  text: <AlignLeft />,
  number: <Hash />,
  date: <CalendarDays />,
  select: <List />,
  boolean: <CheckSquare />,
};

interface EditorDraft extends TaskAttributeDefinitionDraft {
  valueCount: number;
}

export function ManageTaskAttributesDialog({
  open,
  layout,
  definitions,
  onCancel,
  onSave,
}: {
  open: boolean;
  layout: TaskAttributeLayoutItem[];
  definitions: CustomTaskAttributeDefinition[];
  onCancel: () => void;
  onSave: (configuration: TaskAttributeConfigurationDraft) => Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draftLayout, setDraftLayout] = useState<TaskAttributeConfigurationDraft['layout']>([]);
  const [draftDefinitions, setDraftDefinitions] = useState<EditorDraft[]>([]);
  const [archivedDefinitionIds, setArchivedDefinitionIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(open, dialogRef, onCancel);

  useEffect(() => {
    if (!open) return;
    setDraftDefinitions(
      definitions.map((definition) => ({
        clientId: definition.id,
        definitionId: definition.id,
        name: definition.name,
        type: definition.type,
        unit: definition.unit,
        options: definition.options
          ?.filter((option) => option.active)
          .map(({ id, label }) => ({ id, label })),
        valueCount: definition.valueCount,
      })),
    );
    setDraftLayout(
      layout.map((item) =>
        item.kind === 'builtin'
          ? item
          : { kind: 'custom' as const, definitionKey: item.definitionId, visible: item.visible },
      ),
    );
    setArchivedDefinitionIds([]);
    setEditor(null);
    setConfirmArchive(false);
    setSaving(false);
    setError(null);
  }, [definitions, layout, open]);

  if (!open) return null;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftLayout.length) return;
    setDraftLayout((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const applyEditor = () => {
    if (editor === null) return;
    const name = editor.name.trim();
    if (!name) {
      setError('Enter a name for this attribute.');
      return;
    }
    let normalizedEditor = editor;
    if (editor.type === 'select') {
      const options = (editor.options ?? []).map((option) => ({
        ...option,
        label: option.label.trim(),
      }));
      if (options.length === 0 || options.some((option) => !option.label)) {
        setError('Add at least one named dropdown option.');
        return;
      }
      normalizedEditor = { ...editor, options };
    }
    setDraftDefinitions((current) => {
      const exists = current.some((definition) => definition.clientId === editor!.clientId);
      return exists
        ? current.map((definition) =>
            definition.clientId === editor!.clientId ? { ...normalizedEditor, name } : definition,
          )
        : [...current, { ...normalizedEditor, name }];
    });
    setDraftLayout((current) =>
      current.some((item) => item.kind === 'custom' && item.definitionKey === editor!.clientId)
        ? current
        : [...current, { kind: 'custom' as const, definitionKey: editor!.clientId, visible: true }],
    );
    setEditor(null);
    setError(null);
  };

  const archiveEditor = () => {
    if (editor === null) return;
    setDraftDefinitions((current) =>
      current.filter((definition) => definition.clientId !== editor.clientId),
    );
    setDraftLayout((current) =>
      current.filter((item) => item.kind !== 'custom' || item.definitionKey !== editor.clientId),
    );
    if (editor.definitionId) {
      setArchivedDefinitionIds((current) => [...current, editor.definitionId!]);
    }
    setEditor(null);
    setConfirmArchive(false);
    setError(null);
  };

  const startNewAttribute = () => {
    const clientId = crypto.randomUUID();
    setEditor({ clientId, name: '', type: 'text', valueCount: 0 });
    setConfirmArchive(false);
    setError(null);
  };

  const heading = editor
    ? editor.definitionId
      ? 'Edit custom attribute'
      : 'New custom attribute'
    : 'Manage task attributes';
  const description = editor
    ? 'Set the field name and how teammates enter its value.'
    : 'Choose which attributes appear and set their order for every task in this project.';

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/45 p-3 sm:p-6"
      style={{ animation: 'fp-fade-in var(--fp-dur-fast) var(--fp-ease) both' }}
      onClick={() => !saving && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(46rem,calc(100vh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface shadow-e3 sm:max-h-[min(46rem,calc(100vh-3rem))]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-2 border-b border-line px-4 py-4 sm:px-5">
          {editor && (
            <Button
              variant="ghost"
              size="iconSm"
              className="mt-0.5 size-10 shrink-0"
              aria-label="Back to task attributes"
              disabled={saving}
              onClick={() => {
                setEditor(null);
                setConfirmArchive(false);
                setError(null);
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-semibold text-t1">
              {heading}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-t2">
              {description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            className="size-10 shrink-0"
            aria-label="Close task attribute manager"
            disabled={saving}
            onClick={onCancel}
          >
            <X />
          </Button>
        </header>

        {editor ? (
          <AttributeEditor
            editor={editor}
            confirmArchive={confirmArchive}
            onChange={setEditor}
            onConfirmArchiveChange={setConfirmArchive}
            onArchive={archiveEditor}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-2 border-b border-line bg-surface py-2 text-[10px] font-semibold uppercase tracking-wide text-t3 sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem]">
              <span>Attribute</span>
              <span>Display</span>
              <span className="text-right">Order</span>
            </div>
            <div className="divide-y divide-line">
              {REQUIRED_ATTRIBUTES.map((attribute) => (
                <div
                  key={attribute.key}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem]"
                >
                  <AttributeName attribute={attribute} />
                  <span className="text-[11px] font-medium text-t3">Required</span>
                  <span className="flex justify-end text-t3" title="Required attribute">
                    <LockKeyhole className="size-3.5" aria-hidden="true" />
                  </span>
                </div>
              ))}
              {draftLayout.map((item, index) => {
                const custom =
                  item.kind === 'custom'
                    ? draftDefinitions.find(
                        (definition) => definition.clientId === item.definitionKey,
                      )
                    : undefined;
                if (item.kind === 'custom' && custom === undefined) return null;
                const attribute =
                  item.kind === 'builtin'
                    ? CONFIGURABLE_ATTRIBUTES[item.key]
                    : {
                        key: custom!.clientId,
                        label: custom!.name,
                        type: TYPE_LABELS[custom!.type],
                        icon: TYPE_ICONS[custom!.type],
                      };
                return (
                  <div
                    key={item.kind === 'builtin' ? item.key : item.definitionKey}
                    className="grid min-h-14 grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem]"
                  >
                    {item.kind === 'custom' ? (
                      <button
                        type="button"
                        className="group min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        onClick={() => setEditor({ ...custom! })}
                      >
                        <AttributeName attribute={attribute} accessory={<Pencil />} />
                      </button>
                    ) : (
                      <AttributeName attribute={attribute} />
                    )}
                    <VisibilitySwitch
                      label={attribute.label}
                      checked={item.visible}
                      onChange={() =>
                        setDraftLayout((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, visible: !candidate.visible }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="size-10"
                        aria-label={`Move ${attribute.label} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="size-10"
                        aria-label={`Move ${attribute.label} down`}
                        disabled={index === draftLayout.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="text" size="sm" className="my-3 px-0" onClick={startNewAttribute}>
              <Plus /> Add custom attribute
            </Button>
          </div>
        )}

        <footer className="border-t border-line px-4 py-3 sm:px-5">
          {error && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {editor ? (
              <>
                <Button disabled={saving} onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button variant="default" disabled={saving} onClick={applyEditor}>
                  Apply attribute
                </Button>
              </>
            ) : (
              <>
                <Button disabled={saving} onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true);
                    setError(null);
                    void onSave({
                      definitions: draftDefinitions.map((definition) => ({
                        clientId: definition.clientId,
                        definitionId: definition.definitionId,
                        name: definition.name,
                        type: definition.type,
                        unit: definition.unit,
                        options: definition.options,
                      })),
                      layout: draftLayout,
                      archivedDefinitionIds,
                    })
                      .then(onCancel)
                      .catch((saveError) => {
                        setError(userFacingError(saveError, 'Task attributes could not be saved.'));
                        setSaving(false);
                      });
                  }}
                >
                  {saving ? 'Saving…' : 'Save attributes'}
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function AttributeEditor({
  editor,
  confirmArchive,
  onChange,
  onConfirmArchiveChange,
  onArchive,
}: {
  editor: EditorDraft;
  confirmArchive: boolean;
  onChange: (editor: EditorDraft) => void;
  onConfirmArchiveChange: (confirm: boolean) => void;
  onArchive: () => void;
}) {
  const typeLocked = editor.definitionId !== undefined && editor.valueCount > 0;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
      <div className="mx-auto max-w-lg space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-t2">Attribute name</span>
          <Input
            autoFocus
            maxLength={60}
            placeholder="e.g. Inspection reference"
            value={editor.name}
            onChange={(event) => onChange({ ...editor, name: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium text-t2">
            Value type
            {typeLocked && (
              <span className="text-[10px] font-normal text-t3">Locked after values are added</span>
            )}
          </span>
          <select
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-t1 outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-surface2 disabled:text-t3"
            value={editor.type}
            disabled={typeLocked}
            onChange={(event) =>
              onChange({
                ...editor,
                type: event.target.value as CustomTaskAttributeType,
                unit: undefined,
                options:
                  event.target.value === 'select'
                    ? editor.options?.length
                      ? editor.options
                      : [{ id: crypto.randomUUID(), label: '' }]
                    : undefined,
              })
            }
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {editor.type === 'number' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-t2">
              Unit <span className="font-normal text-t3">(optional)</span>
            </span>
            <Input
              maxLength={16}
              placeholder="e.g. LF, kg, hours"
              value={editor.unit ?? ''}
              onChange={(event) => onChange({ ...editor, unit: event.target.value })}
            />
          </label>
        )}
        {editor.type === 'select' && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-t2">Dropdown options</legend>
            <div className="space-y-2">
              {(editor.options ?? []).map((option, index) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Input
                    maxLength={80}
                    aria-label={`Option ${index + 1}`}
                    placeholder={`Option ${index + 1}`}
                    value={option.label}
                    onChange={(event) =>
                      onChange({
                        ...editor,
                        options: editor.options!.map((candidate) =>
                          candidate.id === option.id
                            ? { ...candidate, label: event.target.value }
                            : candidate,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="size-10 shrink-0 text-t3 hover:text-danger"
                    aria-label={`Remove option ${index + 1}`}
                    disabled={(editor.options?.length ?? 0) === 1}
                    onClick={() =>
                      onChange({
                        ...editor,
                        options: editor.options!.filter((candidate) => candidate.id !== option.id),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="text"
              size="sm"
              className="mt-2 px-0"
              disabled={(editor.options?.length ?? 0) >= 50}
              onClick={() =>
                onChange({
                  ...editor,
                  options: [...(editor.options ?? []), { id: crypto.randomUUID(), label: '' }],
                })
              }
            >
              <Plus /> Add option
            </Button>
          </fieldset>
        )}
        {editor.definitionId ? (
          <div className="border-t border-line pt-5">
            {confirmArchive ? (
              <div className="rounded-lg bg-danger/8 p-3">
                <p className="text-xs font-semibold text-t1">
                  Archive “{editor.name || 'this attribute'}”?
                </p>
                <p className="mt-1 text-[11px] leading-4 text-t2">
                  It will disappear from tasks.{' '}
                  {editor.valueCount === 0
                    ? 'No task values are stored.'
                    : `${editor.valueCount} task ${editor.valueCount === 1 ? 'value is' : 'values are'} retained for recovery.`}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => onConfirmArchiveChange(false)}>
                    Keep attribute
                  </Button>
                  <Button variant="danger" size="sm" onClick={onArchive}>
                    <Archive /> Archive attribute
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="text"
                size="sm"
                className="px-0 text-danger"
                onClick={() => onConfirmArchiveChange(true)}
              >
                <Archive /> Archive custom attribute
              </Button>
            )}
          </div>
        ) : (
          <div className="border-t border-line pt-5">
            <Button variant="text" size="sm" className="px-0 text-danger" onClick={onArchive}>
              <Trash2 /> Remove draft attribute
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function VisibilitySwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={`Show ${label}`}
      aria-checked={checked}
      className="group flex size-11 items-center justify-center outline-none focus-visible:!shadow-none"
      onClick={onChange}
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-[34px] rounded-full transition-[background-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease) group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface ${checked ? 'bg-[var(--fp-switch-on)]' : 'bg-[var(--fp-switch-off)]'}`}
      >
        <span
          className={`absolute left-px top-px size-[18px] rounded-full bg-white transition-transform duration-(--fp-dur-fast) ease-(--fp-ease) ${checked ? 'translate-x-[14px]' : 'translate-x-0'}`}
        />
      </span>
    </button>
  );
}

function AttributeName({
  attribute,
  accessory,
}: {
  attribute: AttributeDefinition;
  accessory?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center text-t3 [&_svg]:size-4">
        {attribute.icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 truncate text-xs font-medium text-t1">
          <span className="truncate">{attribute.label}</span>
          {accessory && <span className="shrink-0 text-t3 [&_svg]:size-3">{accessory}</span>}
        </span>
        <span className="block truncate text-[10px] text-t3">{attribute.type}</span>
      </span>
    </div>
  );
}
