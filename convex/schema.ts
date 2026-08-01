import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const projectRole = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
);

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

  sheets: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    number: v.string(),
    discipline: v.optional(v.string()),
    sourceFileRef: v.string(),
    pageIndex: v.number(),
    width: v.number(),
    height: v.number(),
    version: v.number(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_project_number', ['projectId', 'number'])
    .index('by_project_sourceFileRef', ['projectId', 'sourceFileRef']),

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
    taskId: v.id('tasks'),
    kind: v.union(v.literal('photo'), v.literal('file')),
    storageRef: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    uploadedBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_task', ['taskId'])
    .index('by_project_createdAt', ['projectId', 'createdAt']),
});
