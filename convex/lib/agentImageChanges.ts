import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { CONTENT_EDITOR_ROLES, requireProjectRole } from './authz';

export const agentImageChange = v.object({
  photoId: v.id('attachments'),
  photoUpdatedAt: v.number(),
  fileName: v.optional(v.string()),
  taskNumber: v.optional(v.union(v.number(), v.null())),
  location: v.optional(
    v.union(v.object({ latitude: v.number(), longitude: v.number() }), v.null()),
  ),
  suggestedLocation: v.optional(
    v.union(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyMeters: v.optional(v.number()),
      }),
      v.null(),
    ),
  ),
  trashed: v.optional(v.boolean()),
});

export type AgentImageChange = {
  photoId: Id<'attachments'>;
  photoUpdatedAt: number;
  fileName?: string;
  taskNumber?: number | null;
  location?: { latitude: number; longitude: number } | null;
  suggestedLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  } | null;
  trashed?: boolean;
};

type ImageUndoEntry = {
  photoId: Id<'attachments'>;
  expectedPhotoUpdatedAt: number;
  before: {
    fileName: string;
    taskId?: Id<'tasks'>;
    latitude?: number;
    longitude?: number;
    locationSource?: 'exif' | 'manual' | 'device';
    locationUpdatedAt?: number;
    suggestedLatitude?: number;
    suggestedLongitude?: number;
    suggestedAccuracy?: number;
    deletedAt?: number;
    photoUpdatedAt?: number;
  };
};

export type AgentImageUndoData = { version: 1; entries: ImageUndoEntry[] };

function assertCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Photo latitude must be between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Photo longitude must be between -180 and 180');
  }
}

function hasChange(change: AgentImageChange) {
  return (
    change.taskNumber !== undefined ||
    change.fileName !== undefined ||
    change.location !== undefined ||
    change.suggestedLocation !== undefined ||
    change.trashed !== undefined
  );
}

export async function executeAgentImageChanges(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  changes: AgentImageChange[],
) {
  await requireProjectRole(ctx, projectId, CONTENT_EDITOR_ROLES, userId);
  if (changes.length < 1 || changes.length > 25) {
    throw new Error('Change between one and 25 photos per call');
  }
  if (new Set(changes.map((change) => change.photoId)).size !== changes.length) {
    throw new Error('Put all edits for one photo in a single change');
  }

  const taskNumbers = [
    ...new Set(
      changes.flatMap((change) =>
        typeof change.taskNumber === 'number' ? [change.taskNumber] : [],
      ),
    ),
  ];
  const tasks = await Promise.all(
    taskNumbers.map(async (taskNumber) => {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_project_seq', (q) => q.eq('projectId', projectId).eq('seq', taskNumber))
        .unique();
      if (!task) throw new Error(`Task #${taskNumber} was not found in this project`);
      return task;
    }),
  );
  const taskByNumber = new Map(tasks.map((task) => [task.seq, task]));
  const photos = await Promise.all(changes.map((change) => ctx.db.get(change.photoId)));

  for (const [index, change] of changes.entries()) {
    const photo = photos[index];
    if (!photo || photo.projectId !== projectId || photo.kind !== 'photo') {
      throw new Error(`Photo ${index + 1} was not found in this project`);
    }
    if (!hasChange(change)) throw new Error(`No changes were supplied for ${photo.fileName}`);
    const currentVersion = photo.photoUpdatedAt ?? photo.createdAt;
    if (currentVersion !== change.photoUpdatedAt) {
      throw new Error(`${photo.fileName} changed after it was inspected; inspect it again`);
    }
    if (change.location) assertCoordinates(change.location.latitude, change.location.longitude);
    if (change.suggestedLocation) {
      assertCoordinates(change.suggestedLocation.latitude, change.suggestedLocation.longitude);
      if (
        change.suggestedLocation.accuracyMeters !== undefined &&
        (!Number.isFinite(change.suggestedLocation.accuracyMeters) ||
          change.suggestedLocation.accuracyMeters < 0)
      ) {
        throw new Error('Suggested-location accuracy must be non-negative');
      }
    }
    if (change.fileName !== undefined) {
      const fileName = change.fileName.trim();
      const hasControlCharacter = [...fileName].some((character) => character.charCodeAt(0) < 32);
      if (!fileName || fileName.length > 240 || /[\\/]/.test(fileName) || hasControlCharacter) {
        throw new Error('Photo filename is invalid');
      }
    }
  }

  const undoEntries: ImageUndoEntry[] = [];
  const summaries: string[] = [];
  for (const [index, change] of changes.entries()) {
    const photo = photos[index]!;
    const labels: string[] = [];
    const patch: Record<string, unknown> = {};
    if (change.fileName !== undefined) {
      patch.fileName = change.fileName.trim();
      labels.push('renamed');
    }
    if (change.taskNumber !== undefined) {
      patch.taskId =
        change.taskNumber === null ? undefined : taskByNumber.get(change.taskNumber)?._id;
      patch.photoMapVersion = 1;
      labels.push(
        change.taskNumber === null ? 'unassigned task' : `assigned Task #${change.taskNumber}`,
      );
    }
    if (change.location !== undefined) {
      if (change.location === null) {
        patch.latitude = undefined;
        patch.longitude = undefined;
        patch.locationSource = undefined;
        patch.locationUpdatedAt = undefined;
        labels.push('cleared map location');
      } else {
        patch.latitude = change.location.latitude;
        patch.longitude = change.location.longitude;
        patch.locationSource = 'manual';
        labels.push('set map location');
      }
    }
    if (change.suggestedLocation !== undefined) {
      if (change.suggestedLocation === null) {
        patch.suggestedLatitude = undefined;
        patch.suggestedLongitude = undefined;
        patch.suggestedAccuracy = undefined;
        labels.push('cleared suggested location');
      } else {
        patch.suggestedLatitude = change.suggestedLocation.latitude;
        patch.suggestedLongitude = change.suggestedLocation.longitude;
        patch.suggestedAccuracy = change.suggestedLocation.accuracyMeters;
        labels.push('set suggested location');
      }
    }
    if (change.trashed !== undefined) {
      patch.deletedAt = change.trashed ? Date.now() : undefined;
      labels.push(change.trashed ? 'moved to trash' : 'restored from trash');
    }
    const nextVersion = Math.max(Date.now(), (photo.photoUpdatedAt ?? photo.createdAt) + 1);
    if (change.location && change.location !== null) patch.locationUpdatedAt = nextVersion;
    patch.photoUpdatedAt = nextVersion;
    undoEntries.push({
      photoId: photo._id,
      expectedPhotoUpdatedAt: nextVersion,
      before: {
        fileName: photo.fileName,
        taskId: photo.taskId,
        latitude: photo.latitude,
        longitude: photo.longitude,
        locationSource: photo.locationSource,
        locationUpdatedAt: photo.locationUpdatedAt,
        suggestedLatitude: photo.suggestedLatitude,
        suggestedLongitude: photo.suggestedLongitude,
        suggestedAccuracy: photo.suggestedAccuracy,
        deletedAt: photo.deletedAt,
        photoUpdatedAt: photo.photoUpdatedAt,
      },
    });
    await ctx.db.patch(photo._id, patch);
    summaries.push(`${photo.fileName}: ${labels.join(', ')}`);
  }

  return {
    summary:
      summaries.length === 1
        ? `Changed photo ${summaries[0]}`
        : `Changed ${summaries.length} photos: ${summaries.join('; ')}`,
    undoData: { version: 1, entries: undoEntries } satisfies AgentImageUndoData,
  };
}

function parseUndoData(value: unknown): AgentImageUndoData {
  if (!value || typeof value !== 'object') throw new Error('Image Undo data is missing');
  const candidate = value as Partial<AgentImageUndoData>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
    throw new Error('Image Undo data is invalid');
  }
  return candidate as AgentImageUndoData;
}

export async function undoAgentImageChanges(
  ctx: MutationCtx,
  rawUndoData: unknown,
  userId: Id<'users'>,
) {
  const undoData = parseUndoData(rawUndoData);
  const photos = await Promise.all(undoData.entries.map((entry) => ctx.db.get(entry.photoId)));
  for (const [index, entry] of undoData.entries.entries()) {
    const photo = photos[index];
    if (!photo || photo.kind !== 'photo') throw new Error('An AI-edited photo no longer exists');
    await requireProjectRole(ctx, photo.projectId, CONTENT_EDITOR_ROLES, userId);
    if ((photo.photoUpdatedAt ?? photo.createdAt) !== entry.expectedPhotoUpdatedAt) {
      throw new Error(`${photo.fileName} changed after the AI job and cannot be undone safely`);
    }
  }
  for (const entry of [...undoData.entries].reverse()) {
    // Convex omits undefined values nested inside the persisted Undo payload,
    // so spell out every mutable field here to also clear fields that did not
    // exist before the AI change.
    await ctx.db.patch(entry.photoId, {
      fileName: entry.before.fileName,
      taskId: entry.before.taskId,
      latitude: entry.before.latitude,
      longitude: entry.before.longitude,
      locationSource: entry.before.locationSource,
      locationUpdatedAt: entry.before.locationUpdatedAt,
      suggestedLatitude: entry.before.suggestedLatitude,
      suggestedLongitude: entry.before.suggestedLongitude,
      suggestedAccuracy: entry.before.suggestedAccuracy,
      deletedAt: entry.before.deletedAt,
      photoUpdatedAt: entry.before.photoUpdatedAt,
    });
  }
}
