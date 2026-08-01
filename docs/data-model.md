# Ownership, authorization, and Convex schema

Status: the schema, Google authentication, authorization helpers, and initial queries/mutations are
deployed to the Convex development environment. The viewer still uses local persistence until the
Phase 2 client-data migration is implemented.

## Terminology

- **Ownership** answers who controls a project. An owner can manage membership, transfer ownership,
  and delete the project.
- **Membership** answers whether a user may access a project and which operations they may perform.
- **Authorship** records who created a task, note, or attachment. It is immutable audit data and does
  not grant access by itself.
- **Assignment** identifies who is expected to perform a task. It is independent of ownership and
  authorship.

Access is inherited through the project relationship:

```text
User ──< ProjectMember >── Project
                              └── Sheet
                                   └── Task
                                        ├── Note
                                        └── Attachment
```

A task does not need its own `ownerId`. Its `projectId` determines its authorization boundary, while
`createdBy` preserves authorship.

## Initial roles

| Operation                                       | Owner | Admin | Member | Viewer |
| ----------------------------------------------- | :---: | :---: | :----: | :----: |
| View project data                               |  Yes  |  Yes  |  Yes   |  Yes   |
| Create and update tasks, notes, and attachments |  Yes  |  Yes  |  Yes   |   No   |
| Manage sheets and project settings              |  Yes  |  Yes  |   No   |   No   |
| Invite, remove, or change non-owner members     |  Yes  |  Yes  |   No   |   No   |
| Transfer ownership or delete the project        |  Yes  |  No   |   No   |   No   |

The first project creator is inserted as its owner in the same mutation that creates the project.
The application must never trust a role supplied by the client; every public Convex function reads
membership from the database.

## Implemented tables

Convex-generated `_id` and `_creationTime` fields are omitted below. Explicit timestamps remain in
the model so imported local records can preserve their original dates.

### `users`

Provided by the selected authentication integration and extended only when the UI needs profile
fields.

```ts
{
  name?: string
  email?: string
  image?: string
}
```

Do not use an email address as a foreign key. All references use `Id<'users'>`.

### `projects`

```ts
{
  name: string
  code?: string
  createdBy: Id<'users'>
  nextTaskSeq: number
  createdAt: number
  updatedAt: number
  archivedAt?: number
}
```

Indexes: `by_createdBy`, optionally a search index on `name` when the dashboard needs it.

`nextTaskSeq` is incremented in the same Convex mutation that inserts a task. Concurrent mutations
are retried transactionally, so sequence allocation remains server-owned and unique within a
project. Deleted sequence numbers are never reused.

### `projectMembers`

```ts
{
  projectId: Id<'projects'>;
  userId: Id<'users'>;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  addedBy: Id<'users'>;
  joinedAt: number;
}
```

Indexes: `by_project`, `by_user`, and compound `by_project_user`. Mutations enforce one membership
per user/project and at least one owner. Ownership transfer changes the old and new owner roles in a
single mutation.

An invitation table can be added with the invitation workflow; it should store a normalized email,
project, intended role, inviter, expiry, and a hashed one-time token—not a plaintext token.

### `sheets`

```ts
{
  projectId: Id<'projects'>
  name: string
  number: string
  discipline?: string
  sourceFileRef: string
  pageIndex: number
  width: number
  height: number
  version: number
  createdBy: Id<'users'>
  createdAt: number
  updatedAt: number
}
```

Indexes: `by_project`, compound `by_project_number`, and compound `by_project_sourceFileRef`.

`sourceFileRef` is intentionally provider-neutral in this design draft. The concrete schema may use
a Convex storage ID or an R2 object key after the file-storage decision in
[`providers.md`](providers.md).

### `tasks`

```ts
{
  projectId: Id<'projects'>
  sheetId: Id<'sheets'>
  seq: number
  x: number
  y: number
  title: string
  description: string
  status: 'open' | 'in-progress' | 'done' | 'verified'
  priority: 1 | 2 | 3
  category: string
  color?: string
  assigneeText?: string
  assigneeUserId?: Id<'users'>
  dueDate?: string
  createdBy: Id<'users'>
  createdAt: number
  updatedAt: number
}
```

Indexes: `by_project`, `by_sheet`, compound `by_project_seq`, and compound indexes for the first task
list filters actually implemented (for example `by_project_status`). Avoid adding speculative
indexes for every field.

`projectId` is deliberately denormalized onto tasks for efficient project-wide task lists and
authorization. The create/move mutations must verify that `sheet.projectId === task.projectId`.
Coordinates remain normalized to `0..1` relative to the PDF page box.

`assigneeText` preserves the current free-text workflow. `assigneeUserId` becomes the preferred
field once real assignment ships; the text field can remain for external contacts.

### `notes`

```ts
{
  projectId: Id<'projects'>
  taskId: Id<'tasks'>
  authorId: Id<'users'>
  text: string
  createdAt: number
  editedAt?: number
}
```

Indexes: `by_task` and, when an activity feed is implemented, compound `by_project_createdAt`.

Notes are separate documents rather than an array on a task. `authorId` is set from the authenticated
caller and is never accepted as a client argument.

### `attachments`

```ts
{
  projectId: Id<'projects'>;
  taskId: Id<'tasks'>;
  kind: 'photo' | 'file';
  storageRef: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: Id<'users'>;
  createdAt: number;
}
```

Indexes: `by_task` and compound `by_project_createdAt` for the project photo gallery.

The concrete validator for `storageRef` is finalized with the storage provider. Upload completion is
a server mutation that verifies membership before attaching an uploaded object to a task.

## Server-assigned fields

Clients must not choose any of the following values:

- `createdBy`, `authorId`, or `uploadedBy`
- membership role for themselves
- project/task relationship without server validation
- `seq` or `nextTaskSeq`
- authoritative creation/update timestamps

The server derives identity from the authenticated Convex context and validates membership before
every read or write.

## Local-data import

The current version-1 JSON export remains a supported migration input. An authenticated import
mutation will:

1. Create a new project owned by the importer.
2. Create one sheet for each referenced PDF page.
3. Map task `page` numbers to real `sheetId` values.
4. Allocate or preserve task sequence values while advancing `nextTaskSeq` past the maximum.
5. Split embedded task notes and photos into their own documents.
6. Assign the authenticated importer as `createdBy`, `authorId`, and `uploadedBy` for legacy records
   that have no authorship data.
7. Preserve original timestamps and record that the data came from a legacy local import.

The local TypeScript model should not invent a `local-user` identifier before authentication is
available. Authorship becomes required when records cross the Convex mutation boundary.

## Mutation boundaries

The existing Zustand action names provide a useful migration seam, but Zustand becomes UI state
only. Convex owns persistent operations such as:

- `projects.create`, `projects.update`, `projects.archive`
- `members.add`, `members.changeRole`, `members.remove`, `members.transferOwnership`
- `sheets.createFromPdf`, `sheets.update`, `sheets.archive`
- `tasks.create`, `tasks.update`, `tasks.move`, `tasks.remove`
- `notes.create`, `notes.update`, `notes.remove`
- `attachments.completeUpload`, `attachments.remove`

Shared helpers such as `requireUser`, `requireProjectMember`, and `requireProjectRole` should be used
at the start of every public query and mutation.
