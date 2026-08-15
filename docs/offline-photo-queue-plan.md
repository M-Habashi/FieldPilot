# Offline Photo Queue Implementation Plan

## Goal and first-release scope

Make map photo uploads durable when the browser is offline, the connection drops, the page reloads,
or the upload response is lost. The first release queues uploads only. Offline location, assignment,
trash, restore, and undo operations are deferred until upload reliability has been proven on physical
phones.

The queue is foreground-driven: it resumes while FieldPilot is open. It does not add a service worker
or replace the protected `XMLHttpRequest` multipart transport.

## Non-negotiable upload path

Every selected photo follows this order, whether the browser appears online or offline:

1. Validate the picker-backed file's name, media type, and size.
2. Materialize it with `materializePhotoUploadFile` and its `FileReader.readAsDataURL` path.
3. Run selection diagnostics against that browser-owned `File`.
4. Persist those exact bytes, plus the filename, MIME type, and `lastModified`, in IndexedDB.
5. Reconstruct one browser-owned `File` from the persisted bytes for an upload attempt.
6. Run attempt diagnostics on that reconstructed `File`.
7. Append that same reconstructed `File` to `FormData`.
8. Send it through the unchanged `uploadPhotoForm` XHR transport.
9. Parse GPS server-side from the unchanged original bytes.

The online signal starts a sync attempt; it never decides whether the photo is persisted first.

## Architecture

```text
src/
├── lib/offline-photo-queue/
│   ├── db.ts                 IndexedDB schema and migrations
│   ├── queue.ts              Atomic enqueue, claim, retry, complete operations
│   ├── sync.ts               XHR orchestration and response classification
│   ├── types.ts              Durable record and completion types
│   └── *.test.ts
├── hooks/useOfflinePhotoQueue.ts
├── components/projects/
│   ├── OfflinePhotoBadge.tsx
│   ├── ProjectApp.tsx        One signed-in sync coordinator
│   └── ProjectPhotoMap.tsx   Materialize, diagnose, then enqueue
├── lib/photo-upload-transport.ts    Unchanged
└── lib/photo-upload-diagnostics.ts  Unchanged

convex/
├── schema.ts                 Idempotency field and index
├── attachments.ts            Atomic idempotent attachment completion
├── photoUploads.ts           Duplicate-storage cleanup
└── photoUploadHttp.ts        Accept the persistent client upload ID
```

## Durable photo record

The `photos` object store uses `clientUploadId` as its key.

| Field                                     | Purpose                                                     |
| ----------------------------------------- | ----------------------------------------------------------- |
| `clientUploadId`                          | Stable UUID used for queue identity and server idempotency  |
| `projectId`, `userId`                     | Prevent cross-project and cross-account replay              |
| `blob`                                    | Materialized, byte-preserving photo data                    |
| `filename`, `contentType`, `lastModified` | Metadata used to reconstruct the upload `File`              |
| `status`                                  | `pending`, `uploading`, or `failed`                         |
| `createdAt`, `updatedAt`                  | Stable ordering and UI state                                |
| `leaseUntil`                              | Recovers an `uploading` item after a crash or closed page   |
| `retryCount`, `nextAttemptAt`             | Bounded exponential retry state                             |
| `failureKind`, `lastError`                | Distinguishes network, auth, server, and permanent failures |
| `clientDiagnostics`                       | Diagnostics captured from the materialized selection bytes  |

Queue claims and state changes are IndexedDB transactions. Expired upload leases are eligible again.
An in-process guard and transactional claims prevent duplicate work from overlapping triggers and
tabs; server idempotency remains the final safety boundary.

## Server idempotency

`clientUploadId` is submitted with every retry. Attachment completion atomically looks up an existing
photo for the authenticated user and client upload ID before inserting. A duplicate request returns
the original attachment ID. If a retry already stored a second Convex blob before discovering the
completed attachment, the action deletes that redundant blob.

The ID is scoped to the authenticated uploader and checked against the project. It is not a substitute
for project authorization.

## Sync triggers and retry policy

One coordinator is mounted at the signed-in application level. It requests sync after enqueue and on:

- browser `online` events;
- tab visibility returning to `visible`;
- a bounded foreground interval;
- auth-token refresh;
- manual retry.

Network errors, timeouts, HTTP 429, and HTTP 5xx use exponential backoff. After five automatic
failures the bytes remain stored and the user can retry manually. HTTP 401 pauses until authentication
refreshes. Other HTTP 4xx responses are retained as needs-attention failures rather than retried in a
loop.

No token or deployment credential is stored in IndexedDB.

## Storage safety

Unsynced photos are never evicted with LRU or other automatic cleanup. The app requests persistent
browser storage when available. If IndexedDB rejects an enqueue because of quota or browser policy,
the picker file remains in the current page and the user receives a specific message to free storage
and select it again.

## UI behavior

- Selecting a valid photo saves it locally before any network attempt.
- The map action bar shows waiting, uploading, offline, or needs-retry state with a count.
- Failed uploads explain that their photos remain on the device and provide a Retry action.
- A successful upload preserves the existing success notice, upload undo entry, and locationless-photo
  placement prompt whenever the map is mounted.
- Queued photos are not presented as map markers in the first release because they do not yet have a
  server attachment or a local optimistic map model.

## Deferred offline editing

Offline edits require a second design phase covering local photo models, operation coalescing,
`photoUpdatedAt` chaining, undo/redo semantics, and user-visible conflict resolution. Silent
last-write-wins is not the default because it can overwrite a collaborator's changes.

## Verification

Automated checks:

```text
pnpm test -- src/lib/photo-upload-transport.test.ts
pnpm test -- src/lib/offline-photo-queue/
pnpm typecheck
pnpm lint
pnpm format:check
```

Queue tests cover byte and metadata preservation, quota failure, expired-lease recovery, retry
classification, ambiguous successful uploads, idempotency, account isolation, and concurrent claims.

Before production deployment, upload the same known GPS-bearing original through the deployed site
from at least one physical phone. Confirm `/api/photo-upload` reports `exifStatus: "found"`,
`hasExifLocation: true`, and creates exactly one mapped marker even if the response is interrupted and
retried.
