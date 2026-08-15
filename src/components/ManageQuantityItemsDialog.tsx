import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { Archive, ArrowLeft, Boxes, Pencil, Plus, X } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useModalFocus } from '../hooks/useModalFocus';
import { userFacingError } from '../lib/errors';
import { Button } from './ui/button';
import { Input } from './ui/input';

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

interface ItemDraft {
  id?: Id<'quantityItems'>;
  name: string;
  defaultUnit: string;
  taskCount: number;
}

export function ManageQuantityItemsDialog({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: Id<'projects'>;
  onClose: () => void;
}) {
  const items = useQuery(api.quantities.listItems, open ? { projectId } : 'skip');
  const createItem = useMutation(api.quantities.createItem);
  const updateItem = useMutation(api.quantities.updateItem);
  const archiveItem = useMutation(api.quantities.archiveItem);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<ItemDraft | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(open, dialogRef, onClose);

  useEffect(() => {
    if (!open) return;
    setEditor(null);
    setConfirmArchive(false);
    setSaving(false);
    setError(null);
  }, [open]);

  if (!open) return null;
  const heading = editor
    ? editor.id
      ? 'Edit quantity item'
      : 'New quantity item'
    : 'Manage quantity items';
  const description = editor
    ? 'Use one consistent name and default unit wherever this work is measured.'
    : 'Quantity items keep project totals consistent across plans and tasks.';

  const saveEditor = async () => {
    if (!editor) return;
    setSaving(true);
    setError(null);
    try {
      if (editor.id) {
        await updateItem({ itemId: editor.id, name: editor.name, defaultUnit: editor.defaultUnit });
      } else {
        await createItem({ projectId, name: editor.name, defaultUnit: editor.defaultUnit });
      }
      setEditor(null);
    } catch (saveError) {
      setError(userFacingError(saveError, 'The quantity item could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onClick={() => !saving && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(40rem,calc(100vh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-surface shadow-e3"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-2 border-b border-line px-4 py-4 sm:px-5">
          {editor && (
            <Button
              variant="ghost"
              size="iconSm"
              className="mt-0.5 size-10 shrink-0"
              aria-label="Back to quantity items"
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
            aria-label="Close quantity item manager"
            disabled={saving}
            onClick={onClose}
          >
            <X />
          </Button>
        </header>

        {editor ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <div className="mx-auto max-w-md space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-t2">Item name</span>
                <Input
                  autoFocus
                  maxLength={80}
                  placeholder="e.g. Wall protection"
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-t2">Default unit</span>
                <Input
                  list="fp-quantity-item-units"
                  maxLength={24}
                  placeholder="e.g. LF"
                  value={editor.defaultUnit}
                  onChange={(event) =>
                    setEditor({ ...editor, defaultUnit: event.target.value.toUpperCase() })
                  }
                />
                <datalist id="fp-quantity-item-units">
                  {QUANTITY_UNITS.map((unit) => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
                <span className="mt-1.5 block text-[11px] leading-4 text-t3">
                  Tasks receive this unit when the item is selected.
                </span>
              </label>
              {editor.id && (
                <div className="border-t border-line pt-5">
                  {confirmArchive ? (
                    <div className="rounded-lg bg-danger/8 p-3">
                      <p className="text-xs font-semibold text-t1">Archive “{editor.name}”?</p>
                      <p className="mt-1 text-[11px] leading-4 text-t2">
                        It will no longer be selectable.{' '}
                        {editor.taskCount === 0
                          ? 'No tasks currently use it.'
                          : `${editor.taskCount} ${editor.taskCount === 1 ? 'task keeps' : 'tasks keep'} the item for historical reporting.`}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => setConfirmArchive(false)}>
                          Keep item
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={saving}
                          onClick={() => {
                            setSaving(true);
                            void archiveItem({ itemId: editor.id! })
                              .then(() => setEditor(null))
                              .catch((archiveError) =>
                                setError(
                                  userFacingError(
                                    archiveError,
                                    'The quantity item could not be archived.',
                                  ),
                                ),
                              )
                              .finally(() => setSaving(false));
                          }}
                        >
                          <Archive /> Archive item
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="text"
                      size="sm"
                      className="px-0 text-danger"
                      onClick={() => setConfirmArchive(true)}
                    >
                      <Archive /> Archive quantity item
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5">
            <div className="sticky top-0 z-10 grid grid-cols-[1fr_5rem_4rem] gap-3 border-b border-line bg-surface py-2 text-[10px] font-semibold uppercase tracking-wide text-t3">
              <span>Item</span>
              <span>Unit</span>
              <span className="text-right">Tasks</span>
            </div>
            {items === undefined ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-12 animate-pulse rounded-md bg-surface2" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
                <Boxes className="size-7 text-t3" />
                <p className="mt-3 text-sm font-semibold text-t1">No quantity items yet</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-t2">
                  Create an item to consistently group quantities across tasks and plans.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {items.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className="grid min-h-14 w-full grid-cols-[1fr_5rem_4rem] items-center gap-3 py-2 text-left outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() =>
                      setEditor({
                        id: item._id,
                        name: item.name,
                        defaultUnit: item.defaultUnit,
                        taskCount: item.taskCount,
                      })
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center text-t3">
                        <Boxes className="size-4" />
                      </span>
                      <span className="min-w-0 truncate text-xs font-medium text-t1">
                        {item.name}
                      </span>
                      <Pencil className="size-3 shrink-0 text-t3" />
                    </span>
                    <span className="font-mono text-xs text-t2">{item.defaultUnit}</span>
                    <span className="text-right font-mono text-xs text-t2">{item.taskCount}</span>
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="text"
              size="sm"
              className="my-3 px-0"
              onClick={() => setEditor({ name: '', defaultUnit: 'EA', taskCount: 0 })}
            >
              <Plus /> Add quantity item
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
                <Button
                  variant="default"
                  disabled={saving || !editor.name.trim() || !editor.defaultUnit.trim()}
                  onClick={() => void saveEditor()}
                >
                  {saving ? 'Saving…' : 'Save item'}
                </Button>
              </>
            ) : (
              <Button variant="default" onClick={onClose}>
                Done
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
