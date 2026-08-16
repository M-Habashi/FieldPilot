import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { markupData, pageCalibration } from './lib/markup';
import {
  customTaskAttributeType,
  taskAttributeLayoutItem,
  taskAttributeSetting,
} from './lib/taskAttributes';

export const projectRole = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
);

export const invitationStatus = v.union(v.literal('pending'), v.literal('accepted'));

export const taskStatus = v.union(
  v.literal('open'),
  v.literal('in-progress'),
  v.literal('done'),
  v.literal('verified'),
);

export const taskPriority = v.union(v.literal(1), v.literal(2), v.literal(3));

export default defineSchema({
  ...authTables,

  projects: defineTable({
    name: v.string(),
    code: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
    createdBy: v.id('users'),
    nextTaskSeq: v.number(),
    taskAttributeSettings: v.optional(v.array(taskAttributeSetting)),
    taskAttributeLayout: v.optional(v.array(taskAttributeLayoutItem)),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  }).index('by_createdBy', ['createdBy']),

  projectMembers: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: projectRole,
    addedBy: v.id('users'),
    joinedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_user', ['userId'])
    .index('by_project_user', ['projectId', 'userId']),

  projectInvitations: defineTable({
    projectId: v.id('projects'),
    email: v.string(),
    invitedBy: v.id('users'),
    status: invitationStatus,
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedBy: v.optional(v.id('users')),
  })
    .index('by_project', ['projectId'])
    .index('by_email_status', ['email', 'status'])
    .index('by_project_email_status', ['projectId', 'email', 'status']),

  sheets: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    number: v.string(),
    discipline: v.optional(v.string()),
    sourceFileRef: v.string(),
    sourceStorageId: v.optional(v.id('_storage')),
    sourceFileName: v.optional(v.string()),
    sourceFileSize: v.optional(v.number()),
    sourceContentType: v.optional(v.string()),
    pageIndex: v.number(),
    width: v.number(),
    height: v.number(),
    version: v.number(),
    calibration: v.optional(pageCalibration),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_project_number', ['projectId', 'number'])
    .index('by_project_sourceFileRef', ['projectId', 'sourceFileRef'])
    .index('by_sourceStorageId', ['sourceStorageId']),

  markups: defineTable({
    projectId: v.id('projects'),
    sheetId: v.id('sheets'),
    clientId: v.string(),
    data: markupData,
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_sheet', ['sheetId'])
    .index('by_project_client', ['projectId', 'clientId']),

  tasks: defineTable({
    projectId: v.id('projects'),
    sheetId: v.id('sheets'),
    seq: v.number(),
    x: v.number(),
    y: v.number(),
    title: v.string(),
    description: v.string(),
    status: taskStatus,
    priority: taskPriority,
    category: v.string(),
    color: v.optional(v.string()),
    plannedQuantity: v.optional(v.number()),
    completedQuantity: v.optional(v.number()),
    quantityUnit: v.optional(v.string()),
    quantityItemId: v.optional(v.id('quantityItems')),
    startDate: v.optional(v.string()),
    locationText: v.optional(v.string()),
    manpowerCount: v.optional(v.number()),
    costMinor: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assigneeText: v.optional(v.string()),
    assigneeUserId: v.optional(v.id('users')),
    dueDate: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_sheet', ['sheetId'])
    .index('by_project_seq', ['projectId', 'seq'])
    .index('by_project_status', ['projectId', 'status']),

  quantityItems: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    defaultUnit: v.string(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  }).index('by_project', ['projectId']),

  taskQuantities: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    quantityItemId: v.optional(v.id('quantityItems')),
    plannedQuantity: v.optional(v.number()),
    completedQuantity: v.optional(v.number()),
    quantityUnit: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_task', ['taskId'])
    .index('by_quantity_item', ['quantityItemId']),

  taskActivityEvents: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    actorId: v.id('users'),
    kind: v.union(
      v.literal('attribute_changed'),
      v.literal('quantity_added'),
      v.literal('quantity_changed'),
      v.literal('quantity_removed'),
      v.literal('photo_removed'),
    ),
    fieldKey: v.optional(v.string()),
    fieldLabel: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    summary: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_task_createdAt', ['taskId', 'createdAt']),

  taskAttributeDefinitions: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    type: customTaskAttributeType,
    unit: v.optional(v.string()),
    options: v.optional(
      v.array(v.object({ id: v.string(), label: v.string(), active: v.boolean() })),
    ),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  }).index('by_project', ['projectId']),

  taskAttributeValues: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    definitionId: v.id('taskAttributeDefinitions'),
    textValue: v.optional(v.string()),
    numberValue: v.optional(v.number()),
    dateValue: v.optional(v.string()),
    booleanValue: v.optional(v.boolean()),
    selectOptionId: v.optional(v.string()),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_task', ['taskId'])
    .index('by_definition', ['definitionId'])
    .index('by_task_definition', ['taskId', 'definitionId']),

  notes: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    authorId: v.id('users'),
    text: v.string(),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index('by_task', ['taskId'])
    .index('by_project_createdAt', ['projectId', 'createdAt']),

  attachments: defineTable({
    projectId: v.id('projects'),
    taskId: v.optional(v.id('tasks')),
    kind: v.union(v.literal('photo'), v.literal('file')),
    storageRef: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    uploadedBy: v.id('users'),
    clientUploadId: v.optional(v.string()),
    createdAt: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    originalLatitude: v.optional(v.number()),
    originalLongitude: v.optional(v.number()),
    // Where the uploader's device was when the photo was uploaded. Only a
    // suggestion for placing an unmapped photo — never a location on its own,
    // because it says where the uploader stood, not where the camera was.
    suggestedLatitude: v.optional(v.number()),
    suggestedLongitude: v.optional(v.number()),
    suggestedAccuracy: v.optional(v.number()),
    locationSource: v.optional(
      v.union(v.literal('exif'), v.literal('manual'), v.literal('device')),
    ),
    locationUpdatedAt: v.optional(v.number()),
    photoUpdatedAt: v.optional(v.number()),
    photoMapVersion: v.optional(v.literal(1)),
    deletedAt: v.optional(v.number()),
  })
    .index('by_task', ['taskId'])
    .index('by_project_createdAt', ['projectId', 'createdAt'])
    .index('by_storageRef', ['storageRef'])
    .index('by_uploadedBy_clientUploadId', ['uploadedBy', 'clientUploadId']),

  photoUploadDiagnostics: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    attemptId: v.string(),
    phase: v.union(
      v.literal('selected'),
      v.literal('storage-uploaded'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    stage: v.optional(
      v.union(
        v.literal('selection'),
        v.literal('upload-url'),
        v.literal('backend-received'),
        v.literal('storage-persisted'),
        v.literal('storage-upload'),
        v.literal('backend-complete'),
        v.literal('post-complete'),
      ),
    ),
    contentType: v.optional(v.string()),
    extension: v.optional(v.string()),
    size: v.optional(v.number()),
    fileNamePattern: v.optional(
      v.union(v.literal('numeric'), v.literal('img-prefixed'), v.literal('other')),
    ),
    lastModifiedAgeMs: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    platform: v.optional(v.string()),
    effectiveConnectionType: v.optional(v.string()),
    online: v.optional(v.boolean()),
    httpStatus: v.optional(v.number()),
    exifStatus: v.optional(
      v.union(v.literal('found'), v.literal('missing'), v.literal('unreadable')),
    ),
    byteFingerprint: v.optional(v.string()),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_project_createdAt', ['projectId', 'createdAt'])
    .index('by_user_createdAt', ['userId', 'createdAt']),

  pendingUploads: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    purpose: v.union(v.literal('attachment'), v.literal('plan')),
    createdAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_user_project_purpose', ['userId', 'projectId', 'purpose']),

  // AI chat history. Conversations are per user per project: each project
  // member talks to their own assistant thread, never a shared channel.
  chatMessages: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_project_user', ['projectId', 'userId']),
});
