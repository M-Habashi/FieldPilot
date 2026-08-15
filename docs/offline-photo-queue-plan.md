# Offline Photo Queue Implementation Plan

## Overview

Enable offline photo upload and editing by extending the existing outbox pattern with a persistent IndexedDB queue. Photos and edits sync via the existing `uploadPhotoForm` transport when connectivity returns.

---

## Directory Structure

```
src/
├── lib/
│   ├── offline-queue/           # NEW: Offline sync engine
│   │   ├── db.ts                # IndexedDB schema & connection
│   │   ├── queue.ts             # Queue operations (enqueue, peek, dequeue)
│   │   ├── sync.ts              # Online detection & upload orchestration
│   │   ├── types.ts             # Queue item types
│   │   └── __tests__/
│   │       ├── db.test.ts
│   │       ├── queue.test.ts
│   │       └── sync.test.ts
│   │
│   ├── photo-upload-transport.ts    # EXISTING: Unchanged
│   ├── photo-upload-diagnostics.ts  # EXISTING: Unchanged
│   └── ...
│
├── components/
│   └── projects/
│       ├── ProjectPhotoMap.tsx      # MODIFY: Hook into queue
│       └── OfflinePhotoBadge.tsx    # NEW: Pending upload indicator
│
└── hooks/
    └── useOfflineQueue.ts           # NEW: React hook for queue state
```

---

## Phase 1: IndexedDB Schema

**File:** `src/lib/offline-queue/db.ts`

Two object stores:

### Store: `photos`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` (UUID) | Client-generated local ID |
| `projectId` | `string` | Owning project |
| `file` | `Blob` | Materialized via existing transport |
| `filename` | `string` | Original name |
| `contentType` | `string` | MIME type |
| `status` | `'pending' \| 'uploading' \| 'failed'` | Sync state |
| `createdAt` | `number` | Timestamp |
| `retryCount` | `number` | Backoff tracking |
| `clientDiagnostics` | `PhotoUploadDiagnosticEvent` | Pre-upload diagnostics |

### Store: `operations`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` | Operation ID |
| `photoId` | `string` | References queued or server photo |
| `type` | `'setLocation' \| 'assignTask' \| 'trash' \| 'restore'` | Edit kind |
| `payload` | `LocationPayload \| TaskPayload \| null` | Operation data |
| `status` | `'pending' \| 'syncing' \| 'failed'` | Sync state |
| `createdAt` | `number` | Timestamp |
| `expectedPhotoUpdatedAt` | `number?` | For conflict resolution |

---

## Phase 2: Queue Operations

**File:** `src/lib/offline-queue/queue.ts`

| Function | Purpose |
|----------|---------|
| `enqueuePhoto(file, projectId)` | Store materialized photo, return local ID |
| `enqueueOperation(photoId, op)` | Queue edit for existing or pending photo |
| `getPendingPhotos()` | All photos awaiting upload |
| `getOperationsForPhoto(photoId)` | Edits to apply after upload |
| `markUploaded(photoId, serverId)` | Transition to synced, remap operations |
| `markFailed(photoId, error)` | Increment retry, schedule backoff |

---

## Phase 3: Sync Engine

**File:** `src/lib/offline-queue/sync.ts`

```typescript
// Online detection
window.addEventListener('online', processQueue);
// Also poll on interval + visibility change

async function processQueue() {
  const photos = await getPendingPhotos();
  for (const photo of photos) {
    // 1. Upload via existing uploadPhotoForm
    // 2. On success: apply queued operations via Convex mutations
    // 3. On failure: exponential backoff, max 5 retries
  }
}
```

### Integration Point

Existing `uploadPhotos` callback in `ProjectPhotoMap.tsx` becomes:

```typescript
// BEFORE: Direct upload
const response = await uploadPhotoForm('/api/photo-upload', authToken, form);

// AFTER: Queue-first
if (isOnline) {
  await uploadAndSync(photo);  // Immediate
} else {
  await enqueuePhoto(photo);   // Deferred
}
```

---

## Phase 4: UI Integration

### Hook: `useOfflineQueue`

**File:** `src/hooks/useOfflineQueue.ts`

Provides:
- `pendingCount`: Badge indicator
- `isOnline`: Network status
- `forceSync()`: Manual retry

### Component: `OfflinePhotoBadge`

**File:** `src/components/projects/OfflinePhotoBadge.tsx`

- Shows pending count on map markers
- "Waiting to upload" state in photo panel

---

## What Stays Unchanged

| Component | Reason |
|-----------|--------|
| `photo-upload-transport.ts` | Core invariant: FileReader materialization, XHR upload |
| `photo-upload-diagnostics.ts` | Same diagnostics, deferred |
| Server API (`/api/photo-upload`) | No changes needed |
| Convex mutations | Called after upload, same as now |

---

## Open Questions

1. **Edit operations offline**: Should users be able to move/assign photos that are still pending upload? (Adds complexity: operations reference local IDs, remapped after upload)

2. **Storage limits**: IndexedDB is ~GBs, but should we cap at e.g. 100MB with LRU eviction?

3. **Conflict resolution**: If a photo is edited offline, then edited by another user online, last-write-wins or prompt?

---

## Testing Requirements

Per `AGENTS.md`, any change touching the photo upload pipeline must run:

```bash
pnpm test -- src/lib/photo-upload-transport.test.ts
pnpm typecheck
pnpm lint
```

Additional tests for the queue:

```bash
pnpm test -- src/lib/offline-queue/
```

---

## Implementation Order

| Step | File | Dependencies |
|------|------|--------------|
| 1 | `types.ts` | None |
| 2 | `db.ts` | `types.ts` |
| 3 | `queue.ts` | `db.ts` |
| 4 | `sync.ts` | `queue.ts`, existing transport |
| 5 | `useOfflineQueue.ts` | `sync.ts` |
| 6 | `OfflinePhotoBadge.tsx` | `useOfflineQueue.ts` |
| 7 | Modify `ProjectPhotoMap.tsx` | All above |
