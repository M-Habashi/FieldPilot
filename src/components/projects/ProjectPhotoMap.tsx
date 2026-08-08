import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  Filter,
  ImagePlus,
  Images,
  Link2,
  MapPinOff,
  MapPinPlus,
  Move,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useBackGuard } from '../../hooks/useBackGuard';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import {
  extractPhotoLocation,
  extractPhotoTakenAt,
  type PhotoLocation,
} from '../../lib/photo-location';
import {
  isPhotoFreshEnough,
  isUsableDeviceLocation,
  readDeviceLocation,
  type DeviceLocation,
  type DeviceLocationResult,
} from '../../lib/device-location';
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
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Dropdown, DropdownItem, DropdownLabel } from '../ui/dropdown-menu';
import { useNotify } from '../ui/use-notify';
import { MapPhotoPanel } from './MapPhotoPanel';

type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
type PhotoFilter = 'all' | 'assigned' | 'unassigned' | `task:${string}`;
type PhotoLocationAccessIssue = 'denied' | 'unavailable';

function taskPhotoFilter(taskId: string): PhotoFilter {
  return `task:${taskId}`;
}

function taskIdFromPhotoFilter(filter: PhotoFilter): string | null {
  return filter.startsWith('task:') ? filter.slice(5) : null;
}

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

interface PendingDeviceLocationRequest {
  promise: Promise<DeviceLocationResult>;
}

interface PendingLocationlessCapture {
  files: File[];
  locationRequest: PendingDeviceLocationRequest;
}

const initialMapView: L.LatLngExpression = [20, 0];
const initialMapZoom = 2;
const markerOverlapPx = 56;
const nativeCaptureFreshnessMs = 2 * 60 * 1000;

function isLikelyNativeCameraCapture(file: File, now = Date.now()): boolean {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) return false;
  const age = now - file.lastModified;
  return age >= -30_000 && age <= nativeCaptureFreshnessMs;
}

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
  if (moving) {
    // An SVG outline rather than a dashed CSS border: only a stroke can follow
    // the marker's rounded corners and be animated round the loop.
    const ants = document.createElement('div');
    ants.className = 'fp-photo-map-marker-ants';
    ants.setAttribute('aria-hidden', 'true');
    ants.innerHTML =
      '<svg viewBox="0 0 98 98" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="95" height="95" rx="18" /></svg>';
    stack.append(ants);
  }
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

function suggestedLocation(photo: MapPhoto): PhotoLocation | null {
  const { suggestedLatitude, suggestedLongitude } = photo.attachment;
  if (suggestedLatitude === undefined || suggestedLongitude === undefined) return null;
  return { latitude: suggestedLatitude, longitude: suggestedLongitude };
}

function locationSnapshot(
  photo: MapPhoto,
): (PhotoLocation & { source: 'exif' | 'manual' | 'device' }) | null {
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
  const mobilePhotoInputRef = useRef<HTMLInputElement>(null);
  const pendingLocationlessCaptureRef = useRef<PendingLocationlessCapture | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const moveMarkerRef = useRef<L.Marker | null>(null);
  const coarsePointerRef = useRef(false);
  const touchPreviewRef = useRef<{ photoId: string; element: HTMLElement } | null>(null);
  const clearTouchPreview = useCallback(() => {
    const preview = touchPreviewRef.current;
    if (!preview) return;
    preview.element.classList.remove('fp-photo-map-marker-stack--touch-preview');
    preview.element.closest('.leaflet-marker-icon')?.removeAttribute('aria-pressed');
    touchPreviewRef.current = null;
  }, []);
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
  const [taskFocusRequested, setTaskFocusRequested] = useState(false);
  const [movingPhoto, setMovingPhoto] = useState<MapPhoto | null>(null);
  // Where the move marker currently sits, mirrored out of Leaflet so the
  // confirm button never has to reach into the map to find it.
  const [movePosition, setMovePosition] = useState<PhotoLocation | null>(null);
  const [photosPanelOpen, setPhotosPanelOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');
  const [deleteTarget, setDeleteTarget] = useState<MapPhoto | null>(null);
  const [checkingCaptureLocation, setCheckingCaptureLocation] = useState(false);
  const [locationAccessIssue, setLocationAccessIssue] = useState<PhotoLocationAccessIssue | null>(
    null,
  );
  // Photos that arrived without a location, held so the upload can offer to
  // place them straight away rather than leaving them in a list to be found.
  const [placePromptIds, setPlacePromptIds] = useState<Id<'attachments'>[]>([]);
  const [drilledId, setDrilledId] = useState<string | null>(null);
  // The last photo chosen in the stack pane stays on top. Hover is tracked
  // separately so desktop users can preview another row without replacing
  // that persistent selection.
  const [leadPhotoId, setLeadPhotoId] = useState<string | null>(null);
  const [hoverPhotoId, setHoverPhotoId] = useState<string | null>(null);
  const activeLeadPhotoId = hoverPhotoId ?? leadPhotoId;
  const hoverActive = hoverPhotoId !== null;
  // Brief per-photo animation flags: drop-in after placement, ping after locate.
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [pingPhotoId, setPingPhotoId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Android's system photo picker has no camera entry, and `multiple` suppresses
  // the camera on the gallery input anyway, so a phone needs its own capture
  // button to reach the camera at all. Keyed off a coarse pointer rather than
  // width: this is about having a usable camera, not a narrow viewport.
  const [showCameraButton, setShowCameraButton] = useState(false);
  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    coarsePointerRef.current = coarsePointer;
    setShowCameraButton(coarsePointer);
  }, []);
  const undoScope = `${project._id}:${userId}`;
  const [undoCount, setUndoCount] = useState(() => readPhotoUndo(undoScope).length);
  const [redoCount, setRedoCount] = useState(() => readPhotoRedo(undoScope).length);

  const photos = useMemo(() => photoRows ?? [], [photoRows]);
  const filteredPhotos = useMemo(
    () =>
      photos.filter((photo) => {
        if (filter === 'assigned') return photo.task !== null;
        if (filter === 'unassigned') return photo.task === null;
        const taskId = taskIdFromPhotoFilter(filter);
        if (taskId) return photo.task?._id === taskId;
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
    setTaskFocusRequested(false);
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
    if (!activeLeadPhotoId) return clustered;
    return clustered.map((group) => {
      const index = group.photos.findIndex((p) => p.attachment._id === activeLeadPhotoId);
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
  }, [activeLeadPhotoId, mapInstance, mapReady, mappedPhotos, movingPhoto, viewportRevision]);

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

  const movingPhotoRef = useRef(movingPhoto);
  movingPhotoRef.current = movingPhoto;
  const movingPhotoId = movingPhoto?.attachment._id ?? null;

  const pushUndo = useCallback(
    (operation: PhotoUndoOperation) => {
      clearPhotoRedo(undoScope);
      setRedoCount(0);
      setUndoCount(pushPhotoUndo(undoScope, operation).length);
    },
    [undoScope],
  );

  const handleMove = useCallback(
    async (photo: MapPhoto, location: PhotoLocation, source: 'manual' | 'device' = 'manual') => {
      try {
        const result = await setPhotoLocation({
          attachmentId: photo.attachment._id,
          latitude: location.latitude,
          longitude: location.longitude,
          source,
          expectedPhotoUpdatedAt: photo.attachment.photoUpdatedAt,
        });
        pushUndo({
          kind: 'location',
          attachmentId: photo.attachment._id,
          expectedPhotoUpdatedAt: result.photoUpdatedAt,
          previousLocation: locationSnapshot(photo),
          nextLocation: { ...location, source },
        });
        setJustPlacedId(photo.attachment._id);
        window.setTimeout(() => {
          setJustPlacedId((current) => (current === photo.attachment._id ? null : current));
        }, 500);
        notify({ tone: 'success', message: 'Photo location updated.' });
        return true;
      } catch (error) {
        notify({
          tone: 'error',
          message: userFacingError(error, 'The photo location could not be updated.'),
        });
        return false;
      }
    },
    [notify, pushUndo, setPhotoLocation],
  );

  // Commits the marker where the user left it. Move mode is cleared here rather
  // than left to the live-data effect: confirming without dragging leaves the
  // coordinates unchanged, so that effect would see no change and strand the
  // user in move mode.
  const handleConfirmMove = useCallback(async () => {
    const photo = movingPhoto;
    if (!photo) return;
    // The marker is authoritative while it exists; `movePosition` covers the
    // case where its layer has been rebuilt since the last drag.
    const marker = moveMarkerRef.current;
    const latlng = marker ? marker.getLatLng() : null;
    const target = latlng ? { latitude: latlng.lat, longitude: latlng.lng } : movePosition;
    if (!target) return;
    const suggestion = suggestedLocation(photo);
    // Left sitting on the device suggestion, the coordinate is still that GPS
    // fix rather than a point picked off the basemap by eye.
    const atSuggestion =
      suggestion !== null &&
      Math.abs(target.latitude - suggestion.latitude) < 1e-6 &&
      Math.abs(target.longitude - suggestion.longitude) < 1e-6;
    const placed = await handleMove(photo, target, atSuggestion ? 'device' : 'manual');
    // Only on success: a failed write should leave the marker where it is so
    // the position is not silently lost.
    if (placed) setMovingPhoto(null);
  }, [handleMove, movePosition, movingPhoto]);

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
        setTaskFocusRequested(false);
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
        setTaskFocusRequested(false);
        setMovingPhoto((current) =>
          current?.attachment._id === photo.attachment._id ? null : current,
        );
        notify({ tone: 'success', message: 'Photo deleted.' });
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
          source: operation.previousLocation.source,
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
          source: operation.nextLocation.source,
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

  // One level of "go back", innermost layer first. Shared by Escape and the
  // phone's back gesture so both unwind the UI in the same order.
  const dismissTopLayer = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    else if (movingPhoto) setMovingPhoto(null);
    else if (drilledId) setDrilledId(null);
    else if (selectedPhotos.length > 0) {
      setSelectedPhotos([]);
      setTaskFocusRequested(false);
      setPhotosPanelOpen(true);
    } else if (photosPanelOpen) setPhotosPanelOpen(false);
  }, [contextMenu, drilledId, movingPhoto, photosPanelOpen, selectedPhotos.length]);

  useBackGuard(
    contextMenu !== null ||
      movingPhoto !== null ||
      drilledId !== null ||
      selectedPhotos.length > 0 ||
      photosPanelOpen,
    dismissTopLayer,
  );

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
        dismissTopLayer();
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
  }, [canEdit, dismissTopLayer, handleRedo, handleUndo]);

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
    async (
      files: File[],
      {
        fromCamera = false,
        deviceLocationRequest,
        continueWithoutLocation = false,
      }: {
        fromCamera?: boolean;
        deviceLocationRequest?: PendingDeviceLocationRequest;
        continueWithoutLocation?: boolean;
      } = {},
    ) => {
      if (!canEdit || uploading) return;
      setUploading(true);
      try {
        let unmapped = 0;
        let suggested = 0;
        const unmappedIds: Id<'attachments'>[] = [];
        // `undefined` means "not asked yet". One read serves the whole batch,
        // and a failure is remembered so a denied prompt or a timeout is not
        // retried per photo.
        let deviceResult: DeviceLocationResult | undefined = undefined;
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          const exifLocation = await extractPhotoLocation(file);
          // Fall back to the uploader's own position, but only for a photo
          // taken moments ago — see PHOTO_FRESHNESS_WINDOW_MS. A camera capture
          // or fresh mobile picker upload can use that fix directly. Desktop
          // gallery files keep the more cautious suggestion behavior.
          let devicePhotoLocation: DeviceLocation | null = null;
          let suggestion: DeviceLocation | null = null;
          let takenAt: number | null = null;
          let freshEnough = fromCamera;
          if (!exifLocation) {
            takenAt = await extractPhotoTakenAt(file);
            const now = Date.now();
            const useDeviceAsLocation = fromCamera || deviceLocationRequest !== undefined;
            freshEnough = fromCamera || isPhotoFreshEnough(takenAt, now);
            // A camera capture was created by this very tap, so it is fresh
            // whether or not the camera bothered to write a timestamp.
            if (freshEnough && (fromCamera || deviceLocationRequest)) {
              if (deviceResult === undefined) {
                deviceResult = await (deviceLocationRequest?.promise ?? readDeviceLocation());
              }
              if (deviceResult.status === 'ok') {
                // A fresh mobile photo came from this device's current area.
                // Even a coarse iOS fix is more useful than forcing the user
                // to place every field photo manually.
                if (useDeviceAsLocation) devicePhotoLocation = deviceResult.location;
                else if (isUsableDeviceLocation(deviceResult.location)) {
                  suggestion = deviceResult.location;
                }
              }
            }
          }
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
            ...(exifLocation
              ? {
                  latitude: exifLocation.latitude,
                  longitude: exifLocation.longitude,
                  originalLatitude: exifLocation.originalLatitude,
                  originalLongitude: exifLocation.originalLongitude,
                  locationSource: exifLocation.source,
                }
              : devicePhotoLocation
                ? {
                    latitude: devicePhotoLocation.latitude,
                    longitude: devicePhotoLocation.longitude,
                    locationSource: 'device' as const,
                  }
                : {}),
            ...(suggestion
              ? {
                  suggestedLatitude: suggestion.latitude,
                  suggestedLongitude: suggestion.longitude,
                  suggestedAccuracy: suggestion.accuracy,
                }
              : {}),
          });
          const photoState = await convex.query(api.attachments.getPhotoMapState, {
            attachmentId,
          });
          if (photoState.photoUpdatedAt !== undefined) {
            pushUndo({
              kind: 'trash',
              attachmentId,
              expectedPhotoUpdatedAt: photoState.photoUpdatedAt,
            });
          }
          if (!exifLocation && !devicePhotoLocation) {
            unmapped += 1;
            unmappedIds.push(attachmentId);
          }
          if (suggestion) suggested += 1;
        }
        const plural = unmapped === 1 ? '' : 's';
        const summary = !unmapped
          ? 'Photos added to the map.'
          : continueWithoutLocation
            ? `${unmapped} photo${plural} added without a map location.`
            : suggested
              ? `${unmapped} photo${plural} need a location — ${suggested} can be placed where you are now.`
              : `${unmapped} photo${plural} could not be assigned to a location.`;
        notify({
          tone: unmapped && !continueWithoutLocation ? 'warning' : 'success',
          message: summary,
        });
        if (unmappedIds.length && !continueWithoutLocation) {
          setPlacePromptIds(unmappedIds);
        }
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
    // Leaflet's default prefix is a flag icon plus the library name; the plain
    // link says the same thing in a third of the width.
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com/" target="_blank" rel="noreferrer">Leaflet</a>',
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
    clearTouchPreview();
    layer.clearLayers();
    for (const group of groups) {
      const marker = L.marker([group.latitude, group.longitude], {
        icon: createPhotoIcon(group, {
          leadPhotoId: activeLeadPhotoId,
          hoverActive,
          justPlacedId,
          pingPhotoId,
        }),
      });
      let touchPreviewElement: HTMLElement | null = null;
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
        clearTouchPreview();
        const { left, top } = eventClientPosition(originalEvent);
        setContextMenu({ left, top, photo: group.photos[0] });
      };
      marker.on('click', () => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (movingPhoto) return;
        const leadPhotoId = group.photos[0].attachment._id;
        const alreadyPreviewing =
          touchPreviewRef.current?.photoId === leadPhotoId &&
          touchPreviewRef.current.element === touchPreviewElement;
        if (coarsePointerRef.current && touchPreviewElement && !alreadyPreviewing) {
          // Preserve the useful first-tap preview without putting it in React
          // state. One class mutation animates this marker in place; the
          // Leaflet layer and every other photo marker remain untouched.
          clearTouchPreview();
          touchPreviewElement.classList.add('fp-photo-map-marker-stack--touch-preview');
          touchPreviewElement.closest('.leaflet-marker-icon')?.setAttribute('aria-pressed', 'true');
          touchPreviewRef.current = { photoId: leadPhotoId, element: touchPreviewElement };
          setContextMenu(null);
          return;
        }
        clearTouchPreview();
        setSelectedPhotos(group.photos);
        setTaskFocusRequested(false);
        setContextMenu(null);
      });
      marker.on('contextmenu', (event) => {
        event.originalEvent.preventDefault();
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
        touchPreviewElement = icon.querySelector<HTMLElement>('.fp-photo-map-marker-stack');
        L.DomEvent.on(icon, 'touchstart', (event: Event) => {
          if (movingPhoto) return;
          armLongPress(event);
        });
        L.DomEvent.on(icon, 'touchend touchmove touchcancel', clearLongPress);
      }
    }
    return clearTouchPreview;
  }, [
    activeLeadPhotoId,
    clearTouchPreview,
    groups,
    hoverActive,
    justPlacedId,
    movingPhoto,
    pingPhotoId,
  ]);

  // Move mode always puts a draggable marker on the map, whether or not the
  // photo already has a location: an unmapped photo starts at its device
  // suggestion, or at the centre of the view. Dragging only repositions the
  // marker — nothing is written until the user confirms — so the position can
  // be fine-tuned, which matters most on a phone.
  useEffect(() => {
    const map = mapRef.current;
    const movingPhoto = movingPhotoRef.current;
    if (!map || !movingPhoto) {
      moveMarkerRef.current = null;
      setMovePosition(null);
      return;
    }
    const suggestion = suggestedLocation(movingPhoto);
    const preferred = hasLocation(movingPhoto)
      ? { latitude: movingPhoto.attachment.latitude, longitude: movingPhoto.attachment.longitude }
      : suggestion;
    // Entering move mode never pans or zooms — the user keeps the view they
    // framed. A start point outside that view would put the marker somewhere
    // invisible, so it falls back to the middle of the screen instead.
    const start =
      preferred && map.getBounds().contains([preferred.latitude, preferred.longitude])
        ? preferred
        : { latitude: map.getCenter().lat, longitude: map.getCenter().lng };
    const center: L.LatLngExpression = [start.latitude, start.longitude];
    const layers: L.Layer[] = [];
    setMovePosition(start);

    // Only meaningful before placement: once placed, the photo's own accuracy
    // is whatever the user chose, not the device's.
    const accuracy = movingPhoto.attachment.suggestedAccuracy;
    if (!hasLocation(movingPhoto) && suggestion && accuracy !== undefined) {
      layers.push(
        L.circle([suggestion.latitude, suggestion.longitude], {
          radius: accuracy,
          interactive: false,
          className: 'fp-photo-map-suggestion-range',
        }),
      );
    }

    const marker = L.marker(center, {
      icon: createPhotoIcon(
        { latitude: start.latitude, longitude: start.longitude, photos: [movingPhoto] },
        { moving: true },
      ),
      draggable: true,
      autoPan: true,
      zIndexOffset: 1000,
    });
    marker.on('contextmenu', (event) => {
      event.originalEvent.preventDefault();
      const { left, top } = eventClientPosition(event.originalEvent as Event);
      setContextMenu({ left, top, photo: movingPhoto });
    });
    // Mirrored into state so the confirm button has the position even if the
    // marker layer is torn down between the drag and the tap.
    marker.on('dragend', () => {
      const latlng = marker.getLatLng();
      setMovePosition({ latitude: latlng.lat, longitude: latlng.lng });
    });
    layers.push(marker);
    for (const layer of layers) layer.addTo(map);
    moveMarkerRef.current = marker;

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
      for (const layer of layers) layer.remove();
      if (moveMarkerRef.current === marker) moveMarkerRef.current = null;
    };
    // Keyed on the id, not the object: live query updates replace `movingPhoto`
    // constantly, and rebuilding the marker each time would snap it back to its
    // start and throw away the position the user had dragged it to.
  }, [movingPhotoId]);

  // A click on bare map means "let me see the map". It folds away any marker
  // highlight as well as closing the right pane. Marker clicks select a photo
  // instead, and in move mode the double-tap below handles exits, so neither
  // should dismiss anything here.
  useEffect(() => {
    if (!mapInstance) return;
    const onMapClick = (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target && target.closest && target.closest('.leaflet-marker-icon')) return;
      clearTouchPreview();
      if (hoverPhotoId) setHoverPhotoId(null);
      if (panelVisible && !movingPhoto) closePhotosPanel();
    };
    mapInstance.on('click', onMapClick);
    return () => {
      mapInstance.off('click', onMapClick);
    };
  }, [clearTouchPreview, closePhotosPanel, hoverPhotoId, mapInstance, movingPhoto, panelVisible]);

  // In move mode the map still pans with one finger — only a drag that starts
  // on the photo marker moves the photo, which Leaflet already keeps separate.
  // Box zoom stays off because its drag gesture would fight the marker's, and
  // double-click zoom stays off so a double tap can mean "leave move mode".
  // Touch browsers never fire `dblclick`, so the double tap is detected from
  // two bare-map clicks landing close together in time and space instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !movingPhoto) return;
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    let lastTapAt = 0;
    let lastTapPoint: L.Point | null = null;
    const onMapClick = (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target && target.closest && target.closest('.leaflet-marker-icon')) return;
      const now = Date.now();
      const point = map.mouseEventToContainerPoint(event.originalEvent as MouseEvent);
      const isDoubleTap =
        now - lastTapAt <= 400 && lastTapPoint !== null && point.distanceTo(lastTapPoint) <= 32;
      lastTapAt = now;
      lastTapPoint = point;
      if (isDoubleTap) setMovingPhoto(null);
    };
    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
      if (mapRef.current === map) {
        map.boxZoom.enable();
        map.doubleClickZoom.enable();
      }
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

  const openTaskAssignment = (photo: MapPhoto) => {
    setSelectedPhotos([photo]);
    setTaskFocusRequested(true);
    setContextMenu(null);
  };

  const handleMobilePhotoSelection = useCallback(
    async (files: File[]) => {
      const [file] = files;
      if (!file) return;
      if (files.length !== 1 || !isLikelyNativeCameraCapture(file)) {
        void uploadPhotos(files);
        return;
      }

      setCheckingCaptureLocation(true);
      const locationRequest: PendingDeviceLocationRequest = {
        promise: readDeviceLocation(),
      };
      const result = await locationRequest.promise;
      setCheckingCaptureLocation(false);

      if (result.status === 'ok') {
        void uploadPhotos(files, { fromCamera: true, deviceLocationRequest: locationRequest });
        return;
      }

      pendingLocationlessCaptureRef.current = { files, locationRequest };
      setLocationAccessIssue(
        result.status === 'failed' && result.code === 1 ? 'denied' : 'unavailable',
      );
    },
    [uploadPhotos],
  );

  const handleSelectPhoto = useCallback((photo: MapPhoto) => {
    setSelectedPhotos([photo]);
    setTaskFocusRequested(false);
    const map = mapRef.current;
    if (map && hasLocation(photo)) {
      map.flyTo(
        [photo.attachment.latitude!, photo.attachment.longitude!],
        Math.max(map.getZoom(), 16),
      );
    }
  }, []);

  const handleSelectStackPhoto = useCallback((photo: MapPhoto) => {
    const photoId = photo.attachment._id;
    setLeadPhotoId(photoId);
    setHoverPhotoId(null);
    setDrilledId(photoId);
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

          {showCameraButton ? (
            <ActionBarButton
              icon={<Camera />}
              label="Add photos"
              disabled={!canEdit || uploading || checkingCaptureLocation}
              onClick={() => mobilePhotoInputRef.current?.click()}
            />
          ) : (
            <ActionBarButton
              icon={<ImagePlus />}
              label="Add photos"
              disabled={!canEdit || uploading}
              onClick={() => fileInputRef.current?.click()}
            />
          )}
          <Dropdown
            align="left"
            className="max-h-[min(70vh,24rem)] overflow-y-auto"
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
                {(tasks?.length ?? 0) > 0 && (
                  <>
                    <DropdownLabel>Task</DropdownLabel>
                    {tasks?.map((task) => {
                      const option = taskPhotoFilter(task._id);
                      return (
                        <DropdownItem
                          key={task._id}
                          onClick={() => {
                            setFilter(option);
                            close();
                          }}
                          className={cn(
                            'whitespace-nowrap',
                            filter === option && 'bg-accent-soft text-accent',
                          )}
                        >
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: task.color ?? '#64748b' }}
                          />
                          <span className="truncate">
                            #{task.seq} {task.title || 'Untitled task'}
                          </span>
                        </DropdownItem>
                      );
                    })}
                  </>
                )}
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
          focusTaskSelect={taskFocusRequested}
          onTaskSelectFocused={() => setTaskFocusRequested(false)}
          drilledId={drilledId}
          setDrilledId={setDrilledId}
          onSelectStackPhoto={handleSelectStackPhoto}
          onSelect={handleSelectPhoto}
          onLocate={handleLocatePhoto}
          onPlace={(photo) => {
            // Entering move mode from the panel closes the drawer: on phones
            // the full-width drawer would otherwise cover the map the user
            // needs to click or drag.
            setSelectedPhotos([]);
            setTaskFocusRequested(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
            setMovingPhoto(photo);
          }}
          onAssign={(photo, taskId) => void handleAssignment(photo, taskId)}
          onDelete={(photo) => setDeleteTarget(photo)}
          onMove={(photo) => {
            setSelectedPhotos([]);
            setTaskFocusRequested(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
            setMovingPhoto(photo);
          }}
          onRemoveFromMap={(photo) => void handleRemoveFromMap(photo)}
          onRestoreOriginal={(photo) => void handleRestoreOriginal(photo)}
          onClose={() => {
            setSelectedPhotos([]);
            setTaskFocusRequested(false);
            setDrilledId(null);
            setPhotosPanelOpen(false);
          }}
          onBackToList={() => {
            setSelectedPhotos([]);
            setTaskFocusRequested(false);
            setDrilledId(null);
            setPhotosPanelOpen(true);
          }}
          onHoverPhoto={(photo) => {
            setHoverPhotoId(photo.attachment._id);
          }}
          onHoverEnd={() => setHoverPhotoId(null)}
        />

        {/* Move mode needs a visible commit on a phone: dragging alone cannot
            place a photo that is already where the user wants it, and there is
            no keyboard to press Escape with. Rendered through a portal to the
            body so no Leaflet pane, control, or ancestor stacking context can
            sit on top of it and swallow the tap — inside the map container it
            lay beneath the map's own controls and the touch never landed. */}
        {movingPhoto &&
          canEdit &&
          createPortal(
            <div className="fixed bottom-6 left-1/2 z-[1200] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pl-3 pr-1.5 shadow-e3">
              <span className="shrink-0 whitespace-nowrap text-xs text-t2">
                <span className="sm:hidden">Drag the photo</span>
                <span className="hidden sm:inline">Drag the photo to position it</span>
              </span>
              <Button size="sm" onClick={() => void handleConfirmMove()}>
                <MapPinPlus /> Place here
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMovingPhoto(null)}>
                Cancel
              </Button>
            </div>,
            document.body,
          )}

        {mappedPhotos.length === 0 && !movingPhoto && (
          <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-lg border border-line bg-surface px-5 py-4 text-center shadow-e3">
              <MapPinOff className="mx-auto mb-2 size-5 text-t3" />
              <p className="text-sm font-semibold text-t1">No mapped photos</p>
              <p className="mt-1 text-xs leading-5 text-t2">
                Take a photo on site, add one with GPS, or choose an unmapped photo and use Move
                location.
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
                      ? 'This photo has no original location.'
                      : undefined
                  }
                  className="fp-map-context-item disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    void handleRestoreOriginal(movingPhoto);
                    setContextMenu(null);
                  }}
                >
                  <RotateCcw />
                  Restore original location
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
                  onClick={() => openTaskAssignment(contextMenu.photo)}
                >
                  <Link2 /> Assign Task
                </button>
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
                      ? 'This photo has no original location.'
                      : undefined
                  }
                  className="fp-map-context-item disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    void handleRestoreOriginal(contextMenu.photo);
                    setContextMenu(null);
                  }}
                >
                  <RotateCcw />
                  Restore original location
                </button>
                <button
                  type="button"
                  className="fp-map-context-item text-danger hover:text-danger"
                  onClick={() => {
                    setDeleteTarget(contextMenu.photo);
                    setContextMenu(null);
                  }}
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
        open={locationAccessIssue !== null}
        title={locationAccessIssue === 'denied' ? 'Location access denied' : 'Location unavailable'}
        description={
          locationAccessIssue === 'denied'
            ? 'FieldPilot can’t place this photo on the map automatically because location access is off. To enable automatic placement, allow location access for this browser in your phone’s settings.'
            : 'FieldPilot can’t get your current location, so this photo won’t be placed on the map automatically. Check location access for this browser in your phone’s settings.'
        }
        confirmLabel="Continue anyway"
        showCancel={false}
        onCancel={() => {
          setLocationAccessIssue(null);
          pendingLocationlessCaptureRef.current = null;
        }}
        onConfirm={() => {
          const pendingCapture = pendingLocationlessCaptureRef.current;
          setLocationAccessIssue(null);
          pendingLocationlessCaptureRef.current = null;
          if (!pendingCapture) return;
          void uploadPhotos(pendingCapture.files, {
            fromCamera: true,
            deviceLocationRequest: pendingCapture.locationRequest,
            continueWithoutLocation: true,
          });
        }}
      />

      <ConfirmDialog
        open={placePromptIds.length > 0}
        title={
          placePromptIds.length === 1
            ? 'This photo has no location'
            : `${placePromptIds.length} photos have no location`
        }
        description={
          placePromptIds.length === 1
            ? 'Place it on the map now, or leave it in the Photos list for later.'
            : 'Place the first one now — the rest stay in the Photos list until you place them.'
        }
        confirmLabel="Place now"
        onCancel={() => setPlacePromptIds([])}
        onConfirm={() => {
          const [first] = placePromptIds;
          setPlacePromptIds([]);
          // Resolved against live data: the upload's own row may not have
          // reached the query yet when the prompt is answered quickly.
          const photo = photos.find((candidate) => candidate.attachment._id === first);
          if (!photo) return;
          closePhotosPanel();
          setMovingPhoto(photo);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Are you sure you want to delete this photo?"
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

      {/* With neither `capture` nor `multiple`, iPhone presents its own native
          source chooser instead of FieldPilot duplicating that decision. */}
      <input
        ref={mobilePhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) void handleMobilePhotoSelection(files);
        }}
      />
    </section>
  );
}
