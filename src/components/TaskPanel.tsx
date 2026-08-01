import { useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus, LocateFixed, Send, Trash2, X } from 'lucide-react';
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
import { relativeTime } from '../lib/utils';
import { useProject } from '../store/project';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Separator } from './ui/separator';
import { ConfirmDialog } from './ui/dialog';
import { usePhotoUrl } from '../hooks/usePhotoUrl';

/**
 * Task detail content for the shared right drawer. Presence/positioning is owned
 * by the drawer shell (RightDrawer); this renders only the properties content.
 */
export function TaskPanelBody({ taskId }: { taskId: string }) {
  const task = useProject((s) => s.tasks[taskId]) as Task | undefined;
  const updateTask = useProject((s) => s.updateTask);
  const deleteTask = useProject((s) => s.deleteTask);
  const selectTask = useProject((s) => s.selectTask);
  const focusTask = useProject((s) => s.focusTask);
  const addNote = useProject((s) => s.addNote);
  const addPhotos = useProject((s) => s.addPhotos);
  const removePhoto = useProject((s) => s.removePhoto);
  const setLightbox = useProject((s) => s.setLightbox);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The drawer deliberately stays mounted when selection changes to avoid a
  // content flash. Reset only task-local transient state instead of remounting
  // the entire Properties view.
  useLayoutEffect(() => {
    setConfirmDelete(false);
    setNoteDraft('');
  }, [taskId]);

  // Task is gone (e.g. deleted) while the panel animates out — leave the shell.
  if (!task) return null;

  const category = categoryById(task.category);

  const submitNote = () => {
    addNote(task.id, noteDraft);
    setNoteDraft('');
  };

  return (
    <>
      {/* header */}
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-xs">
        <span className="size-1.5 rounded-full" style={{ background: category.color }} />
        <span style={{ color: category.color }}>{category.label}</span>
        <span className="font-mono text-t3">#{task.seq}</span>
        <span className="text-t3">· sheet {task.page}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="text"
            size="iconXs"
            aria-label="Close panel"
            onClick={() => selectTask(null)}
          >
            <X />
          </Button>
        </div>
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 px-3 py-3 text-xs">
          <div>
            <label htmlFor="fp-title" className="mb-0.5 block text-xs text-t3">
              Title
            </label>
            <div className="flex items-center gap-1">
              <input
                id="fp-title"
                className="h-7 min-w-0 flex-1 bg-transparent p-0 text-xs font-semibold text-t1 outline-none transition-colors duration-(--fp-dur-fast) placeholder:font-normal placeholder:text-t3 hover:text-accent focus:text-accent focus-visible:shadow-none"
                placeholder="Name this task…"
                value={task.title}
                autoFocus={task.title === ''}
                onChange={(e) => updateTask(task.id, { title: e.target.value })}
              />
              <Button
                variant="text"
                size="iconXs"
                aria-label={`Locate ${task.title || `task ${task.seq}`} on plan`}
                title="Locate on plan"
                onClick={() => focusTask(task.id)}
              >
                <LocateFixed />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-2 @[340px]:grid-cols-2">
            <div>
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-status"
              >
                Status
              </Label>
              <Select
                id="fp-status"
                value={task.status}
                options={STATUS_ORDER.map((status) => ({
                  value: status,
                  label: STATUSES[status].label,
                  color: STATUSES[status].color,
                }))}
                onValueChange={(value) => updateTask(task.id, { status: value as Status })}
              />
            </div>
            <div>
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-priority"
              >
                Priority
              </Label>
              <Select
                id="fp-priority"
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
            </div>
            <div>
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-category"
              >
                Category
              </Label>
              <Select
                id="fp-category"
                value={task.category}
                options={CATEGORIES.map((categoryOption) => ({
                  value: categoryOption.id,
                  label: categoryOption.label,
                  color: categoryOption.color,
                }))}
                onValueChange={(value) => updateTask(task.id, { category: value })}
              />
            </div>
            <div>
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-due"
              >
                Due date
              </Label>
              <Input
                id="fp-due"
                type="date"
                className="h-7 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
                value={task.dueDate ?? ''}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
              />
            </div>
            <div className="@[340px]:col-span-2">
              <Label className="mb-1 text-xs font-normal normal-case tracking-normal">
                Pin color
              </Label>
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Pin color"
              >
                {TASK_COLORS.map((color) => {
                  const selected = pinColor(task) === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      aria-label={`${color.label} pin color`}
                      aria-pressed={selected}
                      title={color.label}
                      className={`size-4 rounded-full transition-transform duration-(--fp-dur-fast) hover:scale-110 ${
                        selected ? 'ring-2 ring-offset-2 ring-offset-surface' : ''
                      }`}
                      style={{
                        background: color.value,
                        ...(selected
                          ? ({ '--tw-ring-color': color.value } as React.CSSProperties)
                          : {}),
                      }}
                      onClick={() => updateTask(task.id, { color: color.value })}
                    />
                  );
                })}
                <span className="text-xs" style={{ color: pinColor(task) }}>
                  {TASK_COLORS.find((color) => color.value === pinColor(task))?.label ?? 'Custom'}
                </span>
              </div>
            </div>
            <div className="@[340px]:col-span-2">
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-assignee"
              >
                Assignee
              </Label>
              <Input
                id="fp-assignee"
                className="h-7 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
                placeholder="Who is on it?"
                value={task.assignee}
                onChange={(e) => updateTask(task.id, { assignee: e.target.value })}
              />
            </div>
            <div className="@[340px]:col-span-2">
              <Label
                className="mb-0.5 text-xs font-normal normal-case tracking-normal"
                htmlFor="fp-desc"
              >
                Description
              </Label>
              <Textarea
                id="fp-desc"
                className="min-h-14 border-0 bg-transparent px-0 py-1 text-xs hover:text-accent focus:ring-0"
                placeholder="What needs to happen here?"
                value={task.description}
                onChange={(e) => updateTask(task.id, { description: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          {/* photos */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-t3">
                Photos {task.photos.length > 0 && `(${task.photos.length})`}
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {task.photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  id={photo.id}
                  name={photo.name}
                  remoteUrl={photo.url}
                  onOpen={() => setLightbox(photo.id)}
                  onRemove={() => void removePhoto(task.id, photo.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="mt-1 inline-flex cursor-pointer items-center gap-1 py-1 text-xs text-t3 transition-colors duration-(--fp-dur-fast) hover:text-accent"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              <span>Add photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void addPhotos(task.id, files);
                e.target.value = '';
              }}
            />
          </section>

          <Separator />

          {/* notes */}
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-t3">
              Notes {task.notes.length > 0 && `(${task.notes.length})`}
            </h3>
            <div className="flex gap-2">
              <Input
                className="h-7 border-0 bg-transparent px-0 text-xs hover:text-accent focus:ring-0"
                placeholder="Add a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNote();
                }}
              />
              <Button
                variant="text"
                size="iconXs"
                aria-label="Add note"
                disabled={!noteDraft.trim()}
                onClick={submitNote}
              >
                <Send />
              </Button>
            </div>
            <ul className="mt-3 space-y-2.5">
              {task.notes.map((note) => (
                <li key={note.id} className="py-1.5">
                  <p className="whitespace-pre-wrap text-xs text-t1">{note.text}</p>
                  <p className="mt-0.5 text-xs text-t3">{relativeTime(note.createdAt)}</p>
                </li>
              ))}
              {task.notes.length === 0 && (
                <li className="text-xs text-t3">
                  No notes yet — log progress, blockers, decisions.
                </li>
              )}
            </ul>
          </section>

          <Separator />

          {/* Danger zone — deliberately separated from the header Close control. */}
          <section>
            <h3 className="mb-1 text-xs font-medium text-t3">Danger zone</h3>
            <Button
              variant="text"
              size="sm"
              className="px-0 text-danger hover:text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Delete task
            </Button>
          </section>
        </div>
      </div>

      <div className="border-t border-line px-3 py-1.5 text-xs text-t3">
        Created {relativeTime(task.createdAt)} · updated {relativeTime(task.updatedAt)}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete task #${task.seq}?`}
        description="The pin, its notes, and its photos will be removed. This cannot be undone."
        confirmLabel="Delete task"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteTask(task.id);
        }}
      />
    </>
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
  onRemove: () => void;
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
      {/* Always visible (not hover-only) so removal is reachable by touch and
          keyboard; hover/focus just deepens it. */}
      <button
        type="button"
        aria-label={`Remove photo ${name}`}
        className="absolute right-1 top-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-danger hover:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
