import { useRef, useState } from 'react';
import { ImagePlus, Send, Trash2, X } from 'lucide-react';
import type { Priority, Status, Task } from '../types';
import { CATEGORIES, PRIORITIES, STATUSES, STATUS_ORDER, categoryById } from '../types';
import { relativeTime } from '../lib/utils';
import { useProject } from '../store/project';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ConfirmDialog } from './ui/dialog';
import { usePhotoUrl } from './usePhotoUrl';

/**
 * Task detail content for the shared right drawer. Presence/positioning is owned
 * by the drawer shell (RightDrawer); this renders only the properties content.
 */
export function TaskPanelBody({ taskId }: { taskId: string }) {
  const task = useProject((s) => s.tasks[taskId]) as Task | undefined;
  const updateTask = useProject((s) => s.updateTask);
  const deleteTask = useProject((s) => s.deleteTask);
  const selectTask = useProject((s) => s.selectTask);
  const addNote = useProject((s) => s.addNote);
  const addPhotos = useProject((s) => s.addPhotos);
  const removePhoto = useProject((s) => s.removePhoto);
  const setLightbox = useProject((s) => s.setLightbox);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Badge color={category.color} dot>
          {category.label}
        </Badge>
        <span className="font-mono text-xs text-t3">#{task.seq}</span>
        <span className="text-xs text-t3">· sheet {task.page}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="iconSm" aria-label="Close panel" onClick={() => selectTask(null)}>
            <X />
          </Button>
        </div>
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          <div>
            <label htmlFor="fp-title" className="mb-1 block text-[11px] font-medium text-t3">
              Title
            </label>
            <input
              id="fp-title"
              className="w-full rounded-xs border-b border-line bg-transparent pb-1 font-display text-lg font-semibold text-t1 outline-none transition-colors duration-(--fp-dur-fast) placeholder:font-normal placeholder:text-t3 hover:border-line-strong focus:border-accent"
              placeholder="Name this task…"
              value={task.title}
              autoFocus={task.title === ''}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 @[340px]:grid-cols-2">
            <div>
              <Label htmlFor="fp-status">Status</Label>
              <Select
                id="fp-status"
                value={task.status}
                onChange={(e) => updateTask(task.id, { status: e.target.value as Status })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUSES[s].label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fp-priority">Priority</Label>
              <Select
                id="fp-priority"
                value={task.priority}
                onChange={(e) => updateTask(task.id, { priority: Number(e.target.value) as Priority })}
              >
                {([1, 2, 3] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITIES[p].label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fp-category">Category</Label>
              <Select
                id="fp-category"
                value={task.category}
                onChange={(e) => updateTask(task.id, { category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fp-due">Due date</Label>
              <Input
                id="fp-due"
                type="date"
                value={task.dueDate ?? ''}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
              />
            </div>
            <div className="@[340px]:col-span-2">
              <Label htmlFor="fp-assignee">Assignee</Label>
              <Input
                id="fp-assignee"
                placeholder="Who is on it?"
                value={task.assignee}
                onChange={(e) => updateTask(task.id, { assignee: e.target.value })}
              />
            </div>
            <div className="@[340px]:col-span-2">
              <Label htmlFor="fp-desc">Description</Label>
              <Textarea
                id="fp-desc"
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
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-t3">
                Photos {task.photos.length > 0 && `(${task.photos.length})`}
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {task.photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  id={photo.id}
                  name={photo.name}
                  onOpen={() => setLightbox(photo.id)}
                  onRemove={() => void removePhoto(task.id, photo.id)}
                />
              ))}
              <button
                type="button"
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line text-t3 transition-colors duration-(--fp-dur-fast) hover:border-accent hover:text-accent"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-5" />
                <span className="text-[10px] font-medium">Add photo</span>
              </button>
            </div>
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
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-t3">
              Notes {task.notes.length > 0 && `(${task.notes.length})`}
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Add a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNote();
                }}
              />
              <Button
                variant="default"
                size="icon"
                aria-label="Add note"
                disabled={!noteDraft.trim()}
                onClick={submitNote}
              >
                <Send />
              </Button>
            </div>
            <ul className="mt-3 space-y-2.5">
              {task.notes.map((note) => (
                <li key={note.id} className="rounded-md bg-surface2 px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-t1">{note.text}</p>
                  <p className="mt-1 text-[11px] text-t3">{relativeTime(note.createdAt)}</p>
                </li>
              ))}
              {task.notes.length === 0 && (
                <li className="text-xs text-t3">No notes yet — log progress, blockers, decisions.</li>
              )}
            </ul>
          </section>

          <Separator />

          {/* Danger zone — deliberately separated from the header Close control. */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-t3">
              Danger zone
            </h3>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete task
            </Button>
          </section>
        </div>
      </div>

      <div className="border-t border-line px-4 py-2 text-[11px] text-t3">
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
  onOpen,
  onRemove,
}: {
  id: string;
  name: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const url = usePhotoUrl(id);
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
