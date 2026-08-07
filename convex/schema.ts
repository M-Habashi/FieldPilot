import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { markupData, pageCalibration } from './lib/markup';

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
    // Retained for older task records already stored in the shared development deployment.
    quantityUnit: v.optional(v.string()),
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
    .index('by_storageRef', ['storageRef']),

  pendingUploads: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    purpose: v.union(v.literal('attachment'), v.literal('plan')),
    createdAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_user_project_purpose', ['userId', 'projectId', 'purpose']),
});
