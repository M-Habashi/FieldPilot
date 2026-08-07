import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  Filter,
  Images,
  Link2,
  Link2Off,
  MapPinOff,
  Move,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { extractPhotoLocation, type PhotoLocation } from '../../lib/photo-location';
import {
  clearPhotoRedo,
  popPhotoRedo,
  popPhotoUndo,
  pushPhotoRedo,
  pushPhotoUndo,
  readPhotoRedo,
  readPhotoUndo,
  supportsPhotoRedo,
  type PhotoUndoOperation,
} from '../../lib/photo-map-undo';
import { userFacingError } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { useProject } from '../../store/project';
import { ActionBar, ActionBarButton, ActionBarGroup, ActionBarSeparator } from '../ui/action-bar';
import { ConfirmDialog } from '../ui/dialog';
import { Dropdown, DropdownItem, DropdownLabel } from '../ui/dropdown-menu';
import { useNotify } from '../ui/use-notify';
import { MapPhotoPanel } from './MapPhotoPanel';

type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
type PhotoFilter = 'all' | 'assigned' | 'unassigned';

export interface MapPhoto {
  attachment: Doc<'attachments'>;
  task: Doc<'tasks'> | null;
  url: string | null;
}

interface PhotoGroup {
  latitude: number;
  longitude: number;
  photos: MapPhoto[];
}

interface ContextMenuState {
  left: number;
  top: number;
  photo: MapPhoto;
}

const initialMapView: L.LatLngExpression = [20, 0];
const initialMapZoom = 2;
const markerOverlapPx = 56;

const fitIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

const satelliteIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>';

const streetIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>';

function hasLocation(
  photo: MapPhoto,
): photo is MapPhoto & { attachment: Doc<'attachments'> & PhotoLocation } {
  return photo.attachment.latitude !== undefined && photo.attachment.longitude !== undefined;
}

function taskColor(photo: MapPhoto): string {
  return photo.task?.color ?? '#64748b';
}

function createPhotoIcon(
  group: PhotoGroup,
  options: {
    leadPhotoId?: string | null;
    hoverActive?: boolean;
    moving?: boolean;
    justPlacedId?: string | null;
    pingPhotoId?: string | null;
  } = {},
): L.DivIcon {
  const {
    leadPhotoId = null,
    hoverActive = false,
    moving = false,
    justPlacedId = null,
    pingPhotoId = null,
  } = options;
  const lead = group.photos[0];
  const stack = document.createElement('div');
  stack.className = 'fp-photo-map-marker-stack';
  if (group.photos.length === 1) stack.classList.add('fp-photo-map-marker-stack--single');
  else if (group.photos.length === 2) stack.classList.add('fp-photo-map-marker-stack--pair');
  if (hoverActive && leadPhotoId !== null && lead.attachment._id === leadPhotoId) {
    stack.classList.add('fp-photo-map-marker-stack--highlight');
  }
  if (moving) stack.classList.add('fp-photo-map-marker-stack--moving');
  if (justPlacedId !== null && lead.attachment._id === justPlacedId) {
    stack.classList.add('fp-photo-map-marker-stack--drop');
  }
  if (pingPhotoId !== null && lead.attachment._id === pingPhotoId) {
    stack.classList.add('fp-photo-map-marker-stack--ping');
  }
  stack.style.setProperty('--fp-photo-task-color', taskColor(lead));

  const preview = document.createElement('div');
  preview.className = 'fp-photo-map-marker-preview';
  if (lead.url) preview.style.backgroundImage = `url("${lead.url}")`;
  else preview.classList.add('fp-photo-map-marker-preview--empty');
  stack.append(preview);

  if (group.photos.length >= 2 && group.photos[1].url) {
    stack.style.setProperty('--fp-stack-img-1', `url("${group.photos[1].url}")`);
  }
  if (group.photos.length >= 3 && group.photos[2].url) {
    stack.style.setProperty('--fp-stack-img-2', `url("${group.photos[2].url}")`);
  }

  if (group.photos.length > 1) {
    const count = document.createElement('span');
    count.className = 'fp-photo-map-marker-count';
    count.textContent = String(group.photos.length);
    stack.append(count);
  }

  if (lead.task) {
    const taskBadge = document.createElement('span');
    taskBadge.className = 'fp-photo-map-marker-task';
    taskBadge.setAttribute('aria-hidden', 'true');
    stack.append(taskBadge);
  }

  // The shell scales the whole marker about the icon anchor — 25% smaller in
  // general, even more on phones — so the marker keeps pointing at its spot
  // without touching any of the stack's internal pixel sizes.
  const shell = document.createElement('div');
  shell.className = 'fp-photo-map-marker-shell';
  shell.append(stack);

  return L.divIcon({
    html: shell,
    className: 'fp-photo-map-leaflet-icon',
    iconSize: [116, 132],
    iconAnchor: [58, 116],
  });
}

function clusterPhotos(map: L.Map, photos: MapPhoto[]): PhotoGroup[] {
  const groups: PhotoGroup[] = [];
  for (const photo of photos) {
    if (!hasLocation(photo)) continue;
    const point = map.latLngToContainerPoint([
      photo.attachment.latitude,
      photo.attachment.longitude,
    ]);
    const existing = groups.find((group) => {
      const groupPoint = map.latLngToContainerPoint([group.latitude, group.longitude]);
      return point.distanceTo(groupPoint) <= markerOverlapPx;
    });
    if (existing) {
      existing.photos.push(photo);
      continue;
    }
    groups.push({
      latitude: photo.attachment.latitude,
      longitude: photo.attachment.longitude,
      photos: [photo],
    });
  }
  return groups;
}

function locationSnapshot(photo: MapPhoto): (PhotoLocation & { source: 'exif' | 'manual' }) | null {
  if (!hasLocation(photo) || !photo.attachment.locationSource) return null;
  return {
    latitude: photo.attachment.latitude,
    longitude: photo.attachment.longitude,
    source: photo.attachment.locationSource,
  };
}

function eventClientPosition(event: Event): { left: number; top: number } {
  const touchEvent = event as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  if (touch) return { left: touch.clientX, top: touch.clientY };
  const mouseEvent = event as MouseEvent;
  return { left: mouseEvent.clientX, top: mouseEvent.clientY };
}

export function ProjectPhotoMap({
  project,
  role,
  userId,
}: {
  project: Doc<'projects'>;
  role: ProjectRole;
  userId: string;
}) {
  const canEdit = role !== 'viewer';
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const standardLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const fitLinkRef = useRef<HTMLAnchorElement | null>(null);
  const layerToggleRef = useRef<HTMLButtonElement | null>(null);
  const hasFittedRef = useRef(false);
  const legacyMigrationStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { notify } = useNotify();
  const convex = useConvex();
  const photoRows = useQuery(api.attachments.listProjectPhotos, { projectId: project._id });
  const tasks = useQuery(api.tasks.listByProject, { projectId: project._id });
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const completeUpload = useMutation(api.attachments.completeUpload);
  const setPhotoLocation = useMutation(api.attachments.setPhotoLocation);
  const clearPhotoLocation = useMutation(api.attachments.clearPhotoLocation);
  const restoreOriginalLocation = useMutation(api.attachments.restoreOriginalLocation);
  const assignPhoto = useMutation(api.attachments.assignPhoto);
  const trashPhoto = useMutation(api.attachments.trashPhoto);
  const restorePhoto = useMutation(api.attachments.restorePhoto);
  const unassignLegacyPhotos = useMutation(api.attachments.unassignLegacyPhotos);

  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [viewportRevision, setViewportRevision] = useState(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<MapPhoto[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [movingPhoto, setMovingPhoto] = useState<MapPhoto | null>(null);
  const [photosPanelOpen, setPhotosPanelOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');
  const [deleteTarget, setDeleteTarget] = useState<MapPhoto | null>(null);
  const [drilledId, setDrilledId] = useState<string | null>(null);
  // The photo currently on top of its stack marker: the LAST photo hovered in
  // the list stays on top until another one is hovered. `hoverActive` keeps
  // the enlarge/fan-out affordance transient (hover-only).
  const [leadPhotoId, setLeadPhotoId] = useState<string | null>(null);
  const [hoverActive, setHoverActive] = useState(false);
  // Brief per-photo animation flags: drop-in after placement, ping after locate.
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [pingPhotoId, setPingPhotoId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const undoScope = `${project._id}:${userId}`;
  const [undoCount, setUndoCount] = useState(() => readPhotoUndo(undoScope).length);
  const [redoCount, setRedoCount] = useState(() => readPhotoRedo(undoScope).length);

  const photos = useMemo(() => photoRows ?? [], [photoRows]);
  const filteredPhotos = useMemo(
    () =>
      photos.filter((photo) => {
        if (filter === 'assigned') return photo.task !== null;
        if (filter === 'unassigned') return photo.task === null;
        return true;
      }),
    [filter, photos],
  );
  const mappedPhotos = useMemo(() => filteredPhotos.filter(hasLocation), [filteredPhotos]);
  const unmappedPhotos = useMemo(
    () => filteredPhotos.filter((photo) => !hasLocation(photo)),
    [filteredPhotos],
  );
  const selectedPhoto = selectedPhotos[0] ?? null;
  const panelVisible = photosPanelOpen || selectedPhotos.length > 0;

  // The right pane is the list, the selection and the task picker together, so
  // dismissing it clears all three.
  const closePhotosPanel = useCallback(() => {
    setSelectedPhotos([]);
    setPhotosPanelOpen(false);
    setTaskPickerOpen(false);
    setDrilledId(null);
  }, []);

  // Re-sync selection and the move target against the live query result so a
  // stale snapshot (e.g. after a restore) never feeds a stale
  // expectedPhotoUpdatedAt into a later mutation, and the detail panel shows
  // fresh coordinates.
  useEffect(() => {
    if (photoRows === undefined) return;
    setSelectedPhotos((current) => {
      if (current.length === 0) return current;
      let changed = false;
      const next = current.map((photo) => {
        const live = photoRows.find(
          (candidate) => candidate.attachment._id === photo.attachment._id,
        );
        if (!live || live === photo) return photo;
        changed = true;
        return live;
      });
      return changed ? next : current;
    });
    setMovingPhoto((current) => {
      if (!current) return current;
      const live = photoRows.find(
        (candidate) => candidate.attachment._id === current.attachment._id,
      );
      if (!live || live === current) return current;
      const positionChanged =
        live.attachment.latitude !== current.attachment.latitude ||
        live.attachment.longitude !== current.attachment.longitude;
      if (positionChanged) {
        // The move (or restore) committed: exit move mode only now, so the
        // placed marker drops in directly where it landed instead of briefly
        // re-rendering at the pre-move position.
        return null;
      }
      return live;
    });
  }, [photoRows]);

  const groups = useMemo(() => {
    void viewportRevision;
    if (!mapInstance || !mapReady) return [];
    const candidates = movingPhoto
      ? mappedPhotos.filter((photo) => photo.attachment._id !== movingPhoto.attachment._id)
      : mappedPhotos;
    const clustered = clusterPhotos(mapInstance, candidates);
    if (!leadPhotoId) return clustered;
    return clustered.map((group) => {
      const index = group.photos.findIndex((p) => p.attachment._id === leadPhotoId);
      if (index <= 0) return group;
      return {
        ...group,
        photos: [
          group.photos[index],
          ...group.photos.slice(0, index),
          ...group.photos.slice(index + 1),
        ],
      };
    });
  }, [mapInstance, mapReady, mappedPhotos, movingPhoto, leadPhotoId, viewportRevision]);

  const fitPhotos = useCallback(() => {
    const map = mapRef.current;
    if (!map || mappedPhotos.length === 0) return;
    const bounds = L.latLngBounds(
      mappedPhotos.map(
        (photo) => [photo.attachment.latitude!, photo.attachment.longitude!] as L.LatLngTuple,
      ),
    );
    map.fitBounds(bounds, { padding: [72, 72], maxZoom: 18 });
  }, [mappedPhotos]);

  const fitPhotosRef = useRef(fitPhotos);
  fitPhotosRef.current = fitPhotos;

  const selectedPhotoRef = useRef(selectedPhoto);
  selectedPhotoRef.current = selectedPhoto;

  const pushUndo = useCallback(
    (operation: PhotoUndoOperation) => {
      clearPhotoRedo(undoScope);
      setRedoCount(0);
      setUndoCount(pushPhotoUndo(undoScope, operation).length);
    },
    [undoScope],
  );

  const handleMove = useCallback(
    async (photo: MapPhoto, location: PhotoLocation) => {
      try {
        const result = await setPhotoLocation({
          attachmentId: photo.attachment._id,
          latitude: location.latitude,
          longitude: location.longitude,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'location',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
          previousLocation: locationSnapshot(photo),
          nextLocation: { ...location, source: 'manual' },
        });
        setJustPlacedId(photo.attachment._id);
        window.setTimeout(() => {
          setJustPlacedId((current) => (current === photo.attachment._id ? null : current));
        }, 500);
        notify({ tone: 'success', message: 'Photo location updated.' });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photo location could not be updated.'),
        });
      }
    },
    [notify, pushUndo, setPhotoLocation],
  );

  const handleRestoreOriginal = useCallback(
    async (photo: MapPhoto) => {
      try {
        const result = await restoreOriginalLocation({
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'location',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
          previousLocation: locationSnapshot(photo),
          nextLocation: {
            latitude: photo.attachment.originalLatitude!,
            longitude: photo.attachment.originalLongitude!,
            source: 'exif',
          },
        });
        notify({ tone: 'success', message: 'Original GPS location restored.' });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The original location could not be restored.'),
        });
      }
    },
    [notify, pushUndo, restoreOriginalLocation],
  );

  const handleRemoveFromMap = useCallback(
    async (photo: MapPhoto) => {
      try {
        const result = await clearPhotoLocation({
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'location',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
          previousLocation: locationSnapshot(photo),
          nextLocation: null,
        });
        setContextMenu(null);
        notify({ tone: 'success', message: 'Photo removed from the map.' });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photo could not be removed from the map.'),
        });
      }
    },
    [clearPhotoLocation, notify, pushUndo],
  );

  const handleAssignment = useCallback(
    async (photo: MapPhoto, taskId: Id<'tasks'> | undefined) => {
      try {
        const result = await assignPhoto({
          attachmentId: photo.attachment._id,
          taskId,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'assignment',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
          previousTaskId: photo.attachment.taskId ?? null,
          nextTaskId: taskId ?? null,
        });
        setTaskPickerOpen(false);
        setContextMenu(null);
        notify({
          tone: 'success',
          message: taskId ? 'Photo assigned to task.' : 'Photo unassigned.',
        });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photo task could not be updated.'),
        });
      }
    },
    [assignPhoto, notify, pushUndo],
  );

  const handleTrash = useCallback(
    async (photo: MapPhoto) => {
      try {
        const result = await trashPhoto({
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'trash',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
        });
        setSelectedPhotos([]);
        setContextMenu(null);
        setTaskPickerOpen(false);
        setMovingPhoto((current) =>
          current?.attachment._id === photo.attachment._id ? null : current,
        );
        notify({ tone: 'success', message: 'Photo removed. Use Undo to restore it.' });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photo could not be removed.'),
        });
      }
    },
    [notify, pushUndo, trashPhoto],
  );

  const handleUndo = useCallback(async () => {
    const operation = popPhotoUndo(undoScope);
    if (!operation) return;
    setUndoCount(readPhotoUndo(undoScope).length);
    try {
      let result: { photoUpdatedAt: number };
      if (operation.kind === 'trash') {
        result = await restorePhoto({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.kind === 'assignment') {
        result = await assignPhoto({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          taskId: operation.previousTaskId ? (operation.previousTaskId as Id<'tasks'>) : undefined,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.previousLocation === null) {
        result = await clearPhotoLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.previousLocation.source === 'exif') {
        result = await restoreOriginalLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else {
        result = await setPhotoLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          latitude: operation.previousLocation.latitude,
          longitude: operation.previousLocation.longitude,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      }
      if (supportsPhotoRedo(operation)) {
        setRedoCount(
          pushPhotoRedo(undoScope, { ...operation, expectedPhotoUpdatedAt: result.photoUpdatedAt })
            .length,
        );
      } else {
        clearPhotoRedo(undoScope);
        setRedoCount(0);
      }
      notify({ tone: 'success', message: 'Change undone.' });
    } catch (error) {
      setUndoCount(pushPhotoUndo(undoScope, operation).length);
      notify({
        tone: 'error',
        message: userFacingError(error, 'Undo is no longer available because this photo changed.'),
      });
    }
  }, [
    assignPhoto,
    clearPhotoLocation,
    notify,
    restoreOriginalLocation,
    restorePhoto,
    setPhotoLocation,
    undoScope,
  ]);

  const handleRedo = useCallback(async () => {
    const operation = popPhotoRedo(undoScope);
    if (!operation) return;
    setRedoCount(readPhotoRedo(undoScope).length);
    try {
      let result: { photoUpdatedAt: number };
      if (operation.kind === 'trash') {
        result = await trashPhoto({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.kind === 'assignment') {
        result = await assignPhoto({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          taskId: operation.nextTaskId ? (operation.nextTaskId as Id<'tasks'>) : undefined,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.nextLocation === null) {
        result = await clearPhotoLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else if (operation.nextLocation.source === 'exif') {
        result = await restoreOriginalLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      } else {
        result = await setPhotoLocation({
          attachmentId: operation.attachmentId as Id<'attachments'>,
          latitude: operation.nextLocation.latitude,
          longitude: operation.nextLocation.longitude,
          expectedPhotoUpdatedAt: operation.expectedPhotoUpdatedAt,
        });
      }
      setUndoCount(
        pushPhotoUndo(undoScope, { ...operation, expectedPhotoUpdatedAt: result.photoUpdatedAt })
          .length,
      );
      notify({ tone: 'success', message: 'Change redone.' });
    } catch (error) {
      setRedoCount(pushPhotoRedo(undoScope, operation).length);
      notify({
        tone: 'error',
        message: userFacingError(error, 'Redo is no longer available because this photo changed.'),
      });
    }
  }, [
    assignPhoto,
    clearPhotoLocation,
    notify,
    restoreOriginalLocation,
    setPhotoLocation,
    trashPhoto,
    undoScope,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      if (key === 'escape' && !typing) {
        if (contextMenu) setContextMenu(null);
        else if (movingPhoto) setMovingPhoto(null);
        else if (taskPickerOpen) setTaskPickerOpen(false);
        else if (drilledId) setDrilledId(null);
        else if (selectedPhotos.length > 0) {
          setSelectedPhotos([]);
          setTaskPickerOpen(false);
          setPhotosPanelOpen(true);
        } else if (photosPanelOpen) setPhotosPanelOpen(false);
        return;
      }
      if (!canEdit || !(event.ctrlKey || event.metaKey) || (key !== 'z' && key !== 'y') || typing) {
        return;
      }
      event.preventDefault();
      if (key === 'z' && !event.shiftKey) void handleUndo();
      else if (key === 'y' || (key === 'z' && event.shiftKey)) void handleRedo();
    };
    globalThis.document.addEventListener('keydown', onKeyDown);
    return () => globalThis.document.removeEventListener('keydown', onKeyDown);
  }, [
    canEdit,
    contextMenu,
    drilledId,
    handleRedo,
    handleUndo,
    movingPhoto,
    photosPanelOpen,
    selectedPhotos.length,
    taskPickerOpen,
  ]);

  // Dismiss the photo context menu on any press outside it. The listener is
  // attached after the press that opened the menu has been dispatched, so it
  // never closes the menu on the same gesture.
  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    globalThis.document.addEventListener('pointerdown', onPointerDown);
    return () => globalThis.document.removeEventListener('pointerdown', onPointerDown);
  }, [contextMenu]);

  const uploadPhotos = useCallback(
    async (files: File[]) => {
      if (!canEdit || uploading) return;
      setUploading(true);
      try {
        let unmapped = 0;
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          const location = await extractPhotoLocation(file);
          const upload = await generateUploadUrl({ projectId: project._id });
          const response = await fetch(upload.uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!response.ok) throw new Error('A photo could not be uploaded. Please try again.');
          const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
          const attachmentId = await completeUpload({
            projectId: project._id,
            kind: 'photo',
            uploadClaimId: upload.uploadClaimId,
            storageRef: storageId,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            ...(location
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  originalLatitude: location.originalLatitude,
                  originalLongitude: location.originalLongitude,
                  locationSource: location.source,
                }
              : {}),
          });
          const photoState = await convex.query(api.attachments.getPhotoMapState, { attachmentId });
          if (photoState.photoUpdatedAt !== undefined) {
            pushUndo({
              kind: 'trash',
              attachmentId,
              expectedPhotoUpdatedAt: photoState.photoUpdatedAt,
            });
          }
          if (!location) unmapped += 1;
        }
        notify({
          tone: unmapped ? 'warning' : 'success',
          message: unmapped
            ? `${unmapped} photo${unmapped === 1 ? '' : 's'} could not be assigned to a location.`
            : 'Photos added to the map.',
        });
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photos could not be uploaded.'),
        });
      } finally {
        setUploading(false);
      }
    },
    [canEdit, completeUpload, convex, generateUploadUrl, notify, project._id, pushUndo, uploading],
  );

  useEffect(() => {
    if (!canEdit || legacyMigrationStartedRef.current) return;
    legacyMigrationStartedRef.current = true;
    void unassignLegacyPhotos({ projectId: project._id })
      .then((count) => {
        if (count > 0) {
          notify({
            tone: 'success',
            message: `${count} existing photo${count === 1 ? '' : 's'} marked unassigned for the map.`,
          });
        }
      })
      .catch(() => undefined);
  }, [canEdit, notify, project._id, unassignLegacyPhotos]);

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;
    const map = L.map(mapHostRef.current, { zoomControl: false, attributionControl: true }).setView(
      initialMapView,
      initialMapZoom,
    );
    const standardLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
    );
    standardLayerRef.current = standardLayer;
    satelliteLayerRef.current = satelliteLayer;
    const zoomControl = L.control.zoom({ position: 'bottomright' }).addTo(map);
    const zoomContainer = zoomControl.getContainer();
    if (zoomContainer) {
      const link = L.DomUtil.create('a', 'fp-leaflet-fit', zoomContainer) as HTMLAnchorElement;
      link.href = '#';
      link.setAttribute('role', 'button');
      link.title = 'Fit photos to view';
      link.setAttribute('aria-label', 'Fit photos to view');
      link.innerHTML = fitIconSvg;
      L.DomEvent.on(link, 'click', L.DomEvent.stop);
      L.DomEvent.on(link, 'click', () => fitPhotosRef.current());
      fitLinkRef.current = link;
    }
    const LayerToggle = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const button = L.DomUtil.create('button', 'fp-leaflet-layer-toggle');
        button.type = 'button';
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.disableScrollPropagation(button);
        L.DomEvent.on(button, 'click', () =>
          setMapStyle((style) => (style === 'satellite' ? 'standard' : 'satellite')),
        );
        layerToggleRef.current = button;
        return button;
      },
    });
    new LayerToggle().addTo(map);
    map.on('contextmenu', (event) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target && target.closest && target.closest('.leaflet-marker-icon')) return;
      const photo = selectedPhotoRef.current;
      if (!photo) return;
      const { left, top } = eventClientPosition(event.originalEvent as Event);
      setContextMenu({ left, top, photo });
    });
    markerLayerRef.current = L.layerGroup().addTo(map);
    const refresh = () => setViewportRevision((revision) => revision + 1);
    map.on('zoomend moveend', refresh);
    mapRef.current = map;
    setMapInstance(map);
    setMapReady(true);
    return () => {
      map.off('zoomend moveend', refresh);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      setMapInstance(null);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const standard = standardLayerRef.current;
    const satellite = satelliteLayerRef.current;
    if (!standard || !satellite) return;
    const showSatellite = mapStyle === 'satellite';
    if (showSatellite) {
      if (map.hasLayer(standard)) map.removeLayer(standard);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(standard)) standard.addTo(map);
    }
  }, [mapStyle]);

  useEffect(() => {
    const button = layerToggleRef.current;
    if (!button) return;
    const showSatellite = mapStyle === 'satellite';
    button.setAttribute('aria-pressed', String(showSatellite));
    button.title = showSatellite ? 'Show street map' : 'Show satellite view';
    button.innerHTML = showSatellite ? `${streetIconSvg}Map` : `${satelliteIconSvg}Satellite`;
  }, [mapStyle]);

  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const group of groups) {
      const marker = L.marker([group.latitude, group.longitude], {
        icon: createPhotoIcon(group, { leadPhotoId, hoverActive, justPlacedId, pingPhotoId }),
      });
      let longPressTimer: number | null = null;
      let suppressNextClick = false;
      const clearLongPress = () => {
        if (longPressTimer !== null) window.clearTimeout(longPressTimer);
        longPressTimer = null;
      };
      const armLongPress = (originalEvent: Event) => {
        clearLongPress();
        longPressTimer = window.setTimeout(() => {
          suppressNextClick = true;
          showContextMenu(originalEvent);
        }, 550);
      };
      const showContextMenu = (originalEvent: Event) => {
        clearLongPress();
        const { left, top } = eventClientPosition(originalEvent);
        setContextMenu({ left, top, photo: group.photos[0] });
      };
      marker.on('click', () => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (movingPhoto) return;
        setSelectedPhotos(group.photos);
        setTaskPickerOpen(false);
        setContextMenu(null);
      });
      marker.on('contextmenu', (event) => {
        showContextMenu(event.originalEvent as Event);
      });
      marker.on('mousedown', (event) => {
        const original = event.originalEvent as unknown as Event;
        const pointerType = (original as PointerEvent).pointerType;
        const isTouch = 'touches' in original || pointerType === 'touch';
        if (!isTouch || movingPhoto) return;
        armLongPress(original);
      });
      marker.on('mouseup mouseout dragstart', clearLongPress);
      marker.addTo(layer); // Touch: mousedown never fires on touch-action:none elements, so arm
      // the long-press directly on the icon.
      const icon = marker.getElement();
      if (icon) {
        L.DomEvent.on(icon, 'touchstart', (event: Event) => {
          if (movingPhoto) return;
          armLongPress(event);
        });
        L.DomEvent.on(icon, 'touchend touchmove touchcancel', clearLongPress);
      }
    }
  }, [groups, hoverActive, justPlacedId, leadPhotoId, movingPhoto, pingPhotoId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !movingPhoto || !hasLocation(movingPhoto)) return;
    const latitude = movingPhoto.attachment.latitude ?? map.getCenter().lat;
    const longitude = movingPhoto.attachment.longitude ?? map.getCenter().lng;
    const marker = L.marker([latitude, longitude], {
      icon: createPhotoIcon({ latitude, longitude, photos: [movingPhoto] }, { moving: true }),
      draggable: true,
      autoPan: true,
      zIndexOffset: 1000,
    });
    marker.on('dragend', () => {
      const latlng = marker.getLatLng();
      const previousLat = movingPhoto.attachment.latitude;
      const previousLng = movingPhoto.attachment.longitude;
      const actuallyMoved =
        previousLat === undefined ||
        previousLng === undefined ||
        Math.abs(latlng.lat - previousLat) > 1e-6 ||
        Math.abs(latlng.lng - previousLng) > 1e-6;
      if (actuallyMoved) {
        // Exit happens via the live-data effect once the new position lands,
        // so the photo never flashes back to its pre-move spot.
        void handleMove(movingPhoto, { latitude: latlng.lat, longitude: latlng.lng });
      } else {
        setMovingPhoto(null);
      }
    });
    marker.on('contextmenu', (event) => {
      const { left, top } = eventClientPosition(event.originalEvent as Event);
      setContextMenu({ left, top, photo: movingPhoto });
    });
    marker.addTo(map);
    const icon = marker.getElement();
    if (icon) {
      let longPressTimer: number | null = null;
      const clearLongPress = () => {
        if (longPressTimer !== null) window.clearTimeout(longPressTimer);
        longPressTimer = null;
      };
      L.DomEvent.on(icon, 'touchstart', (event: Event) => {
        clearLongPress();
        longPressTimer = window.setTimeout(() => {
          const { left, top } = eventClientPosition(event);
          setContextMenu({ left, top, photo: movingPhoto });
        }, 550);
      });
      L.DomEvent.on(icon, 'touchend touchmove touchcancel', clearLongPress);
    }
    return () => {
      marker.remove();
    };
  }, [handleMove, movingPhoto]);

  // Click-to-place: an unmapped photo has no marker, so in move mode the map
  // waits for a click and that spot becomes the location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !movingPhoto || hasLocation(movingPhoto)) return;
    const onMapClick = (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target && target.closest && target.closest('.leaflet-marker-icon')) return;
      void handleMove(movingPhoto, { latitude: event.latlng.lat, longitude: event.latlng.lng });
      setMovingPhoto(null);
    };
    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [handleMove, movingPhoto]);

  // A click on bare map means "let me see the map", so it closes the right
  // pane. Marker clicks select a photo instead, and in move mode the click
  // above places one, so neither should dismiss anything.
  useEffect(() => {
    if (!mapInstance || !panelVisible || movingPhoto) return;
    const onMapClick = (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target && target.closest && target.closest('.leaflet-marker-icon')) return;
      closePhotosPanel();
    };
    mapInstance.on('click', onMapClick);
    return () => {
      mapInstance.off('click', onMapClick);
    };
  }, [closePhotosPanel, mapInstance, movingPhoto, panelVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setMoveLocked = (locked: boolean) => {
      if (locked) {
        map.dragging.disable();
        map.boxZoom.disable();
      } else {
        map.dragging.enable();
        map.boxZoom.enable();
      }
    };
    setMoveLocked(movingPhoto !== null);
    return () => {
      if (mapRef.current === map) setMoveLocked(false);
    };
  }, [movingPhoto]);

  useEffect(() => {
    const link = fitLinkRef.current;
    if (!link) return;
    if (mappedPhotos.length === 0) {
      link.classList.add('leaflet-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    } else {
      link.classList.remove('leaflet-disabled');
      link.removeAttribute('aria-disabled');
      link.tabIndex = 0;
    }
  }, [mappedPhotos.length]);

  useEffect(() => {
    if (hasFittedRef.current || mappedPhotos.length === 0 || !mapReady) return;
    fitPhotos();
    hasFittedRef.current = true;
  }, [fitPhotos, mapReady, mappedPhotos.length]);

  const openTaskPicker = (photo: MapPhoto) => {
    setSelectedPhotos([photo]);
    setTaskSearch('');
    setTaskPickerOpen(true);
    setContextMenu(null);
  };

  const handleSelectPhoto = useCallback((photo: MapPhoto) => {
    setSelectedPhotos([photo]);
    setTaskPickerOpen(false);
    const map = mapRef.current;
    if (map && hasLocation(photo)) {
      map.flyTo(
        [photo.attachment.latitude!, photo.attachment.longitude!],
        Math.max(map.getZoom(), 16),
      );
    }
  }, []);

  const handleLocatePhoto = useCallback(
    (photo: MapPhoto) => {
      const map = mapRef.current;
      if (!map || !hasLocation(photo)) return;
      map.flyTo(
        [photo.attachment.latitude!, photo.attachment.longitude!],
        Math.max(map.getZoom(), 16),
      );
      setPingPhotoId(photo.attachment._id);
      window.setTimeout(() => {
        setPingPhotoId((current) => (current === photo.attachment._id ? null : current));
      }, 1400);
      // Phones: hide the drawer so the user can actually see the located photo
      // on the map; the Photos toolbar button reopens it.
      if (window.matchMedia('(max-width: 767px)').matches) closePhotosPanel();
    },
    [closePhotosPanel],
  );

  return (
    <section
      className="relative z-0 flex min-h-0 flex-1 flex-col bg-app"
      aria-label="Project photo map"
    >
      <ActionBar label="Map tools" onOpenNav={() => useProject.getState().toggleSidebarMobile()}>
        <ActionBarGroup>
          <ActionBarButton
            icon={<Undo2 />}
            label="Undo"
            labelFrom="lg"
            title="Undo (Ctrl/Cmd+Z)"
            disabled={!canEdit || undoCount === 0}
            onClick={() => void handleUndo()}
          />
          <ActionBarButton
            icon={<Redo2 />}
            label="Redo"
            labelFrom="lg"
            title="Redo (Ctrl/Cmd+Y)"
            disabled={!canEdit || redoCount === 0}
            onClick={() => void handleRedo()}
          />

          <ActionBarSeparator />

          <ActionBarButton
            icon={<Camera />}
            label="Add photos"
            disabled={!canEdit || uploading}
            onClick={() => fileInputRef.current?.click()}
          />
          <Dropdown
            align="left"
            trigger={
              <ActionBarButton
                icon={<Filter />}
                label="Filter"
                aria-label="Filter photos"
                active={filter !== 'all'}
                menu
              />
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Show photos</DropdownLabel>
                {(['all', 'assigned', 'unassigned'] as const).map((option) => (
                  <DropdownItem
                    key={option}
                    onClick={() => {
                      setFilter(option);
                      close();
                    }}
                    className={filter === option ? 'bg-accent-soft text-accent' : undefined}
                  >
                    {option === 'all'
                      ? 'All photos'
                      : option === 'assigned'
                        ? 'Assigned'
                        : 'Unassigned'}
                  </DropdownItem>
                ))}
                {filter !== 'all' && (
                  <DropdownItem
                    className="mt-1 border-t border-line pt-2 text-danger hover:text-danger"
                    onClick={() => {
                      setFilter('all');
                      close();
                    }}
                  >
                    <X /> Clear filter
                  </DropdownItem>
                )}
              </>
            )}
          </Dropdown>
        </ActionBarGroup>

        <ActionBarGroup align="end">
          <ActionBarButton
            icon={<Images />}
            label="Photos"
            aria-label={panelVisible ? 'Close photos panel' : 'Show photos list'}
            aria-pressed={panelVisible}
            active={panelVisible}
            title="Photos"
            onClick={() => (panelVisible ? closePhotosPanel() : setPhotosPanelOpen(true))}
          />
        </ActionBarGroup>
      </ActionBar>

      <div
        className={cn(
          'relative min-h-0 flex-1 isolate',
          movingPhoto && 'cursor-crosshair',
          (photosPanelOpen || selectedPhotos.length > 0) && 'fp-map-panel-open',
        )}
      >
        <div ref={mapHostRef} className="h-full w-full" />

        <MapPhotoPanel
          photos={filteredPhotos}
          selectedPhotos={selectedPhotos}
          canEdit={canEdit}
          tasks={tasks ?? []}
          listOpen={photosPanelOpen}
          pickerOpen={taskPickerOpen}
          setPickerOpen={setTaskPickerOpen}
          taskSearch={taskSearch}
          setTaskSearch={setTaskSearch}
          drilledId={drilledId}
          setDrilledId={setDrilledId}
          onSelect={handleSelectPhoto}
          onLocate={handleLocatePhoto}
          onPlace={(photo) => {
            // Entering move mode from the panel closes the drawer: on phones
            // the full-width drawer would otherwise cover the map the user
            // needs to click or drag.
            setSelectedPhotos([]);
            setTaskPickerOpen(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
            setMovingPhoto(photo);
          }}
          onAssign={(photo, taskId) => void handleAssignment(photo, taskId)}
          onDelete={(photo) => setDeleteTarget(photo)}
          onMove={(photo) => {
            setSelectedPhotos([]);
            setTaskPickerOpen(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
            setMovingPhoto(photo);
          }}
          onRemoveFromMap={(photo) => void handleRemoveFromMap(photo)}
          onRestoreOriginal={(photo) => void handleRestoreOriginal(photo)}
          onClose={() => {
            setSelectedPhotos([]);
            setTaskPickerOpen(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
          }}
          onBackToList={() => {
            setSelectedPhotos([]);
            setTaskPickerOpen(false);
            setDrilledId(null);
            setPhotosPanelOpen(true);
          }}
          onHoverPhoto={(photo) => {
            setLeadPhotoId(photo.attachment._id);
            setHoverActive(true);
          }}
          onHoverEnd={() => setHoverActive(false)}
        />

        {mappedPhotos.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-lg border border-line bg-surface px-5 py-4 text-center shadow-e3">
              <MapPinOff className="mx-auto mb-2 size-5 text-t3" />
              <p className="text-sm font-semibold text-t1">No mapped photos</p>
              <p className="mt-1 text-xs leading-5 text-t2">
                Add a phone photo with GPS, or choose an unmapped photo and use Move location.
              </p>
            </div>
          </div>
        )}

        {contextMenu && canEdit && (
          <div
            ref={contextMenuRef}
            className="fixed z-[1100] w-52 rounded-lg border border-line bg-surface p-1 shadow-e3"
            style={{ left: contextMenu.left, top: contextMenu.top }}
            role="menu"
          >
            {movingPhoto ? (
              <>
                <button
                  type="button"
                  disabled={movingPhoto.attachment.originalLatitude === undefined}
                  title={
                    movingPhoto.attachment.originalLatitude === undefined
                      ? 'This photo has no original GPS location.'
                      : undefined
                  }
                  className="fp-map-context-item disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    void handleRestoreOriginal(movingPhoto);
                    setContextMenu(null);
                  }}
                >
                  <RotateCcw />
                  {movingPhoto.attachment.originalLatitude === undefined
                    ? 'Restore original GPS location'
                    : `Restore original GPS location (${movingPhoto.attachment.originalLatitude.toFixed(5)}, ${movingPhoto.attachment.originalLongitude!.toFixed(5)})`}
                </button>
                <button
                  type="button"
                  className="fp-map-context-item"
                  onClick={() => {
                    setMovingPhoto(null);
                    setContextMenu(null);
                  }}
                >
                  <X /> Cancel move
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="fp-map-context-item"
                  onClick={() => openTaskPicker(contextMenu.photo)}
                >
                  <Link2 /> {contextMenu.photo.task ? 'Reassign task' : 'Assign task'}
                </button>
                {contextMenu.photo.task && (
                  <button
                    type="button"
                    className="fp-map-context-item"
                    onClick={() => void handleAssignment(contextMenu.photo, undefined)}
                  >
                    <Link2Off /> Unassign task
                  </button>
                )}
                <button
                  type="button"
                  className="fp-map-context-item"
                  onClick={() => {
                    setMovingPhoto(contextMenu.photo);
                    setContextMenu(null);
                  }}
                >
                  <Move /> Move location
                </button>
                {hasLocation(contextMenu.photo) && (
                  <button
                    type="button"
                    className="fp-map-context-item"
                    onClick={() => void handleRemoveFromMap(contextMenu.photo)}
                  >
                    <MapPinOff /> Remove from map
                  </button>
                )}
                <button
                  type="button"
                  disabled={contextMenu.photo.attachment.originalLatitude === undefined}
                  title={
                    contextMenu.photo.attachment.originalLatitude === undefined
                      ? 'This photo has no original GPS location.'
                      : undefined
                  }
                  className="fp-map-context-item disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    void handleRestoreOriginal(contextMenu.photo);
                    setContextMenu(null);
                  }}
                >
                  <RotateCcw />
                  {contextMenu.photo.attachment.originalLatitude === undefined
                    ? 'Restore original GPS location'
                    : `Restore original GPS location (${contextMenu.photo.attachment.originalLatitude.toFixed(5)}, ${contextMenu.photo.attachment.originalLongitude!.toFixed(5)})`}
                </button>
                <button
                  type="button"
                  className="fp-map-context-item text-danger hover:text-danger"
                  onClick={() => void handleTrash(contextMenu.photo)}
                >
                  <Trash2 /> Delete photo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <footer className="fp-statusbar flex shrink-0 items-center px-3" aria-label="Map statistics">
        {filter !== 'all' && <span className="text-[11px] text-t3">Filtered</span>}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-t3">
          <span className="font-mono tabular-nums">
            {filteredPhotos.length} {filteredPhotos.length === 1 ? 'photo' : 'photos'}
          </span>
          <span className="font-mono tabular-nums">{mappedPhotos.length} mapped</span>
          {unmappedPhotos.length > 0 && (
            <span className="font-mono tabular-nums text-warn">
              {unmappedPhotos.length} unmapped
            </span>
          )}
        </div>
      </footer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.attachment.fileName ?? 'photo'}?`}
        description="The photo is removed from the project. You can restore it with Undo."
        confirmLabel="Delete photo"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void handleTrash(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void uploadPhotos(files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
