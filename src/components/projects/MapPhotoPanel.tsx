import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  ChevronLeft,
  ChevronsLeftRight,
  Link2,
  Link2Off,
  LocateFixed,
  MapPinOff,
  MapPinPlus,
  MoreHorizontal,
  Move,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { useModalFocus } from '../../hooks/useModalFocus';
import { cn, formatBytes } from '../../lib/utils';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { Button } from '../ui/button';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
import type { MapPhoto } from './ProjectPhotoMap';

function isMapped(photo: MapPhoto): boolean {
  return photo.attachment.latitude !== undefined && photo.attachment.longitude !== undefined;
}

function formatLocation(photo: MapPhoto): string {
  if (!isMapped(photo)) return 'Location unavailable';
  return `${photo.attachment.latitude!.toFixed(5)}, ${photo.attachment.longitude!.toFixed(5)}`;
}

function locationSourceLabel(photo: MapPhoto): string {
  if (photo.attachment.locationSource === 'exif') return 'Phone GPS';
  if (photo.attachment.locationSource === 'manual') return 'Manually placed';
  return 'Location unavailable';
}

const formatUploadDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Full-screen photo viewer for the map's photos panel. Map-local copy of the
 * plan viewer's Lightbox pattern — deliberately NOT wired to the zustand
 * lightbox store, which belongs to plan task photos. Rendered via portal so
 * it layers above the map, panel, sidebar, and header.
 */
function MapPhotoLightbox({ photo, onClose }: { photo: MapPhoto; onClose: () => void }) {
  const lightboxRef = useRef<HTMLDivElement>(null);
  useModalFocus(true, lightboxRef, onClose);

  return createPortal(
    <div
      ref={lightboxRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      tabIndex={-1}
      className="fp-lightbox fixed inset-0 z-90 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close photo"
        className="absolute right-4 top-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25"
        onClick={onClose}
      >
        <X className="size-5" />
      </button>
      {photo.url ? (
        <img
          src={photo.url}
          alt={photo.attachment.fileName}
          className="max-h-full max-w-full rounded-lg object-contain shadow-e3"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/70">
          <Camera className="size-10" />
          <p className="text-sm">Preview unavailable</p>
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * One photo row, shared by the photos list and the stack drill-in list.
 * Mapped photos get a locate (pan) action; unmapped photos get a place
 * action that starts move mode.
 */
function PhotoRow({
  photo,
  selected = false,
  onSelect,
  onLocate,
  onPlace,
  onHover,
  onHoverEnd,
}: {
  photo: MapPhoto;
  selected?: boolean;
  onSelect: (photo: MapPhoto) => void;
  onLocate?: (photo: MapPhoto) => void;
  onPlace?: (photo: MapPhoto) => void;
  onHover?: (photo: MapPhoto) => void;
  onHoverEnd?: () => void;
}) {
  const mapped = isMapped(photo);
  return (
    <div
      className={cn(
        'group flex min-h-10 w-full items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-(--fp-dur-fast)',
        selected ? 'bg-accent-soft text-accent' : 'text-t1 hover:bg-surface2',
      )}
      onMouseEnter={onHover ? () => onHover(photo) : undefined}
      onMouseLeave={onHoverEnd}
    >
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch text-left"
        onClick={() => onSelect(photo)}
      >
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-surface2">
          {photo.url ? (
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="size-3.5 text-t3" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{photo.attachment.fileName}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-t3">
            {photo.task ? (
              <>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: photo.task.color ?? '#64748b' }}
                />
                <span className="shrink-0">Task #{photo.task.seq}</span>
              </>
            ) : (
              <span className="shrink-0">Unassigned</span>
            )}
            {!mapped && (
              <span className="rounded-full bg-warn/10 px-1.5 py-px font-medium text-warn">
                No location
              </span>
            )}
          </span>
        </span>
      </button>
      {mapped && onLocate && (
        <button
          type="button"
          aria-label={`Locate ${photo.attachment.fileName} on map`}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center text-t3 transition-colors duration-(--fp-dur-fast) hover:text-accent"
          onClick={() => onLocate(photo)}
        >
          <LocateFixed className="size-3.5" />
        </button>
      )}
      {!mapped && onPlace && (
        <button
          type="button"
          aria-label={`Place ${photo.attachment.fileName} on map`}
          title="Place on map"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center text-t3 transition-colors duration-(--fp-dur-fast) hover:text-accent"
          onClick={() => onPlace(photo)}
        >
          <MapPinPlus className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Right-docked photos panel for the map, modeled on the plan viewer's task
 * drawer: a Photos list that drills into photo details (and stack drill-in).
 * Open from the toolbar Photos button or by selecting a photo. Its left
 * border is a col-resize handle that closes the panel (click, drag left of
 * the midpoint, or ArrowLeft when focused) — the mirror of the left sidebar.
 */
export function MapPhotoPanel({
  photos,
  selectedPhotos,
  canEdit,
  tasks,
  listOpen,
  pickerOpen,
  setPickerOpen,
  taskSearch,
  setTaskSearch,
  drilledId,
  setDrilledId,
  onSelect,
  onLocate,
  onPlace,
  onAssign,
  onDelete,
  onMove,
  onRemoveFromMap,
  onRestoreOriginal,
  onClose,
  onBackToList,
  onHoverPhoto,
  onHoverEnd,
}: {
  photos: MapPhoto[];
  selectedPhotos: MapPhoto[];
  canEdit: boolean;
  tasks: Doc<'tasks'>[];
  listOpen: boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  taskSearch: string;
  setTaskSearch: (search: string) => void;
  drilledId: string | null;
  setDrilledId: (id: string | null) => void;
  onSelect: (photo: MapPhoto) => void;
  onLocate: (photo: MapPhoto) => void;
  onPlace: (photo: MapPhoto) => void;
  onAssign: (photo: MapPhoto, taskId: Id<'tasks'> | undefined) => void;
  onDelete: (photo: MapPhoto) => void;
  onMove: (photo: MapPhoto) => void;
  onRemoveFromMap: (photo: MapPhoto) => void;
  onRestoreOriginal: (photo: MapPhoto) => void;
  onClose: () => void;
  onBackToList: () => void;
  onHoverPhoto: (photo: MapPhoto) => void;
  onHoverEnd: () => void;
}) {
  const present = listOpen || selectedPhotos.length > 0;
  const { mounted, state, onAnimationEnd } = usePresence(present);
  const [lightboxPhoto, setLightboxPhoto] = useState<MapPhoto | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!present) {
      setLightboxPhoto(null);
    }
  }, [present]);

  const detail = selectedPhotos.length > 0;
  const stack = selectedPhotos.length > 1;
  const drilled = drilledId
    ? (selectedPhotos.find((p) => p.attachment._id === drilledId) ?? null)
    : null;
  const viewPhoto = (stack ? drilled : selectedPhotos[0]) ?? null;

  const taskMatches = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    return tasks.filter(
      (task) =>
        !query || task.title.toLowerCase().includes(query) || String(task.seq).includes(query),
    );
  }, [taskSearch, tasks]);

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a convenience; window listeners below still work.
    }
    dragStateRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    const onPointerMove = (moveEvent: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (Math.hypot(dx, dy) >= 4) state.moved = true;
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state) return;
      const close = !state.moved || upEvent.clientX < window.innerWidth - 192;
      if (close) onClose();
      handle.blur();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onClose();
    }
  };

  if (!mounted) return null;

  const header = !detail ? (
    <h2 className="text-xs font-semibold text-t1">
      Photos <span className="font-mono font-normal text-t3">({photos.length})</span>
    </h2>
  ) : stack && !drilled ? (
    <h2 className="text-xs font-semibold text-t1">{selectedPhotos.length} photos at this location</h2>
  ) : drilled ? (
    <h2 className="truncate text-xs font-semibold text-t1">{drilled.attachment.fileName}</h2>
  ) : (
    <h2 className="text-xs font-semibold text-t1">Photo details</h2>
  );

  const headerAction = !detail ? (
    <Button
      variant="text"
      size="iconXs"
      aria-label="Close photos list"
      onClick={onClose}
    >
      <X />
    </Button>
  ) : (
    <div className="flex items-center gap-1">
      {canEdit && viewPhoto && (
        <Dropdown
          align="right"
          trigger={
            <Button
              variant="ghost"
              size="iconXs"
              aria-label="More actions"
              title="More actions"
            >
              <MoreHorizontal />
            </Button>
          }
        >
          {(close) => (
            <>
              <DropdownItem
                onClick={() => {
                  onMove(viewPhoto);
                  close();
                }}
              >
                <Move /> Move location
              </DropdownItem>
              {isMapped(viewPhoto) && (
                <DropdownItem
                  onClick={() => {
                    onRemoveFromMap(viewPhoto);
                    close();
                  }}
                >
                  <MapPinOff /> Remove from map
                </DropdownItem>
              )}
              <DropdownItem
                disabled={viewPhoto.attachment.originalLatitude === undefined}
                onClick={() => {
                  onRestoreOriginal(viewPhoto);
                  close();
                }}
              >
                <RotateCcw /> Restore original GPS location
              </DropdownItem>
            </>
          )}
        </Dropdown>
      )}
      <button
        type="button"
        aria-label={drilled ? 'Back to stack' : 'Back to photos'}
        title={drilled ? 'Back to stack' : 'Back to photos'}
        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-t2 transition-colors duration-(--fp-dur-fast) hover:bg-surface2 hover:text-t1"
        onClick={() => (drilled ? setDrilledId(null) : onBackToList())}
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );

  return (
    <aside
      data-state={state}
      onAnimationEnd={onAnimationEnd}
      aria-label="Photos"
      className="fp-panel absolute inset-y-0 right-0 z-[500] flex w-full max-w-[var(--fp-drawer-width)] flex-col"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Collapse photos panel"
        tabIndex={0}
        onPointerDown={onHandlePointerDown}
        onKeyDown={onHandleKeyDown}
        className="fp-resize-handle group absolute inset-y-0 -left-1 z-10 flex w-2 cursor-col-resize items-center justify-center"
      >
        <span className="pointer-events-none flex h-7 w-1.5 items-center justify-center rounded-full bg-line-strong opacity-0 transition-opacity duration-(--fp-dur-fast) group-hover:opacity-100 group-focus-visible:opacity-100">
          <ChevronsLeftRight className="size-3 text-t2" />
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-1.5">
        {header}
        {headerAction}
      </div>

      {!detail ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
          {photos.length === 0 ? (
            <div className="flex flex-col items-center px-3 py-8 text-center">
              <Camera className="mb-2 size-6 text-t3" />
              <p className="text-xs text-t3">No photos match the current filter.</p>
            </div>
          ) : (
            <ul>
              {photos.map((photo) => (
                <li key={photo.attachment._id}>
                  <PhotoRow
                    photo={photo}
                    selected={photo.attachment._id === selectedPhotos[0]?.attachment._id}
                    onSelect={onSelect}
                    onLocate={onLocate}
                    onPlace={onPlace}
                    onHover={onHoverPhoto}
                    onHoverEnd={onHoverEnd}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : stack && !drilled ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
          <ul>
            {selectedPhotos.map((photo) => (
              <li key={photo.attachment._id}>
                <PhotoRow
                  photo={photo}
                  onSelect={(p) => setDrilledId(p.attachment._id)}
                  onHover={onHoverPhoto}
                  onHoverEnd={onHoverEnd}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : viewPhoto ? (
        <>
          <button
            type="button"
            onClick={() => setLightboxPhoto(viewPhoto)}
            aria-label="View photo full size"
            className="block h-[38%] max-h-72 w-full shrink-0 cursor-zoom-in overflow-hidden bg-surface2"
          >
            {viewPhoto.url ? (
              <img
                src={viewPhoto.url}
                alt={viewPhoto.attachment.fileName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center">
                <Camera className="size-8 text-t3" />
              </span>
            )}
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <dl className="space-y-2.5 text-xs">
              <div>
                <dt className="text-t3">Name</dt>
                <dd className="mt-0.5 truncate font-medium text-t1">
                  {viewPhoto.attachment.fileName}
                </dd>
              </div>
              <div>
                <dt className="text-t3">Location</dt>
                <dd className="mt-0.5 text-t1">
                  <span className="font-mono">{formatLocation(viewPhoto)}</span>
                  <span className="text-t3"> · {locationSourceLabel(viewPhoto)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-t3">Date uploaded</dt>
                <dd className="mt-0.5 text-t1">
                  {formatUploadDate.format(viewPhoto.attachment.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-t3">Size</dt>
                <dd className="mt-0.5 text-t1">{formatBytes(viewPhoto.attachment.size)}</dd>
              </div>
            </dl>

            {canEdit && (
              <section className="mt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-t3">
                  Assignment
                </h3>
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-line bg-surface2 px-2 py-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: viewPhoto.task?.color ?? '#64748b' }}
                  />
                  {viewPhoto.task ? (
                    <span className="min-w-0 truncate text-xs text-t1">
                      <span className="font-mono text-t3">#{viewPhoto.task.seq}</span>{' '}
                      {viewPhoto.task.title || 'Untitled task'}
                    </span>
                  ) : (
                    <span className="text-xs text-t3">Unassigned</span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setPickerOpen(true)}
                >
                  <Link2 /> {viewPhoto.task ? 'Reassign task' : 'Assign task'}
                </Button>

                {pickerOpen && (
                  <div className="mt-2 rounded-md border border-line bg-surface2 p-2">
                    <p className="truncate text-xs text-t3">
                      Assign photo{' '}
                      <span className="font-medium text-t1">{viewPhoto.attachment.fileName}</span>{' '}
                      to:
                    </p>
                    <input
                      autoFocus
                      value={taskSearch}
                      onChange={(event) => setTaskSearch(event.target.value)}
                      placeholder="Find a task…"
                      className="mt-1 w-full bg-transparent text-xs text-t1 outline-none placeholder:text-t3"
                    />
                    <div className="mt-1 max-h-40 overflow-y-auto">
                      {taskMatches.map((task) => (
                        <button
                          type="button"
                          key={task._id}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-t2 transition-colors hover:bg-surface hover:text-t1"
                          onClick={() => onAssign(viewPhoto, task._id)}
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: task.color ?? '#64748b' }}
                          />
                          <span className="shrink-0 font-mono text-t3">#{task.seq}</span>
                          <span className="truncate">{task.title || 'Untitled task'}</span>
                        </button>
                      ))}
                    </div>
                    {viewPhoto.task && (
                      <button
                        type="button"
                        className="mt-1 flex w-full items-center justify-center gap-2 border-t border-line pt-1.5 text-xs text-danger transition-colors hover:text-danger"
                        onClick={() => onAssign(viewPhoto, undefined)}
                      >
                        <Link2Off className="size-3.5" /> Unassign task
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          {canEdit && (
            <div className="flex shrink-0 gap-1.5 border-t border-line px-3 py-2.5">
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => onDelete(viewPhoto)}
              >
                <Trash2 /> Delete photo
              </Button>
            </div>
          )}
        </>
      ) : null}

      {lightboxPhoto && (
        <MapPhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </aside>
  );
}
