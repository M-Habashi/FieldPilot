import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

function createTest() {
  return convexTest(schema, modules);
}

type TestInstance = ReturnType<typeof createTest>;

async function seedUser(t: TestInstance, name: string, email: string) {
  return await t.run(async (ctx) => await ctx.db.insert('users', { name, email }));
}

async function seedMembership(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  addedBy: Id<'users'>,
  role: 'admin' | 'member',
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role,
      addedBy,
      joinedAt: Date.now(),
    });
  });
}

describe('projects, memberships, and invitations', () => {
  it('creates, lists, renames, invites, accepts, counts accepted members, and leaves safely', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Owner User', 'owner@example.com');
    const memberId = await seedUser(t, 'Member User', 'Member@Example.com');
    const outsiderId = await seedUser(t, 'Outsider User', 'outsider@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const outsider = t.withIdentity({ subject: outsiderId });

    await expect(t.mutation(api.projects.create, { name: 'No identity' })).rejects.toThrow(
      'Unauthenticated',
    );

    const projectId = await owner.mutation(api.projects.create, { name: '  Initial Project  ' });
    await expect(owner.mutation(api.projects.create, { name: '   ' })).rejects.toThrow(
      'Project name is required',
    );
    let ownerProjects = await owner.query(api.projects.listMine);
    expect(ownerProjects).toHaveLength(1);
    expect(ownerProjects[0].project?.name).toBe('Initial Project');
    expect(ownerProjects[0].membership.role).toBe('owner');
    expect(ownerProjects[0].memberCount).toBe(1);

    await owner.mutation(api.projects.rename, { projectId, name: 'Renamed Project' });
    ownerProjects = await owner.query(api.projects.listMine);
    expect(ownerProjects[0].project?.name).toBe('Renamed Project');
    await expect(
      outsider.mutation(api.projects.rename, { projectId, name: 'Unauthorized rename' }),
    ).rejects.toThrow('Not authorized');
    await expect(
      owner.mutation(api.invitations.create, { projectId, email: 'not-an-email' }),
    ).rejects.toThrow('valid email address');
    await expect(
      owner.mutation(api.invitations.create, { projectId, email: 'missing@example.com' }),
    ).rejects.toThrow('There is no account associated with this email.');
    await t.run(async (ctx) => {
      expect(await ctx.db.query('projectInvitations').collect()).toEqual([]);
    });
    await expect(
      owner.mutation(api.invitations.create, { projectId, email: 'owner@example.com' }),
    ).rejects.toThrow('already a member');

    const invitationId = await owner.mutation(api.invitations.create, {
      projectId,
      email: ' MEMBER@example.com ',
    });
    ownerProjects = await owner.query(api.projects.listMine);
    expect(ownerProjects[0].memberCount).toBe(1);
    await expect(
      owner.mutation(api.invitations.create, { projectId, email: 'member@example.com' }),
    ).rejects.toThrow('already pending');

    const notifications = await member.query(api.invitations.listMine);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].invitation._id).toBe(invitationId);
    expect(notifications[0].projectName).toBe('Renamed Project');
    expect(notifications[0].inviterName).toBe('Owner User');
    expect(await outsider.query(api.invitations.listMine)).toEqual([]);
    await expect(outsider.mutation(api.invitations.accept, { invitationId })).rejects.toThrow(
      'another email address',
    );

    expect(await member.mutation(api.invitations.accept, { invitationId })).toBe(projectId);
    await expect(member.mutation(api.invitations.accept, { invitationId })).rejects.toThrow(
      'no longer available',
    );
    expect(await member.query(api.invitations.listMine)).toEqual([]);
    const memberProjects = await member.query(api.projects.listMine);
    expect(memberProjects).toHaveLength(1);
    expect(memberProjects[0].membership.role).toBe('member');
    expect(memberProjects[0].memberCount).toBe(2);
    ownerProjects = await owner.query(api.projects.listMine);
    expect(ownerProjects[0].memberCount).toBe(2);

    await expect(
      member.mutation(api.projects.rename, { projectId, name: 'Member rename' }),
    ).rejects.toThrow('Insufficient project permissions');
    await member.mutation(api.projects.leave, { projectId });
    expect(await member.query(api.projects.listMine)).toEqual([]);
    ownerProjects = await owner.query(api.projects.listMine);
    expect(ownerProjects[0].memberCount).toBe(1);
    await expect(owner.mutation(api.projects.leave, { projectId })).rejects.toThrow(
      'owner cannot leave',
    );
  });
});

describe('plan metadata permissions and cleanup', () => {
  it('uploads, updates, and removes a multi-page PDF as one plan', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Upload Owner', 'upload-owner@example.com');
    const adminId = await seedUser(t, 'Upload Admin', 'upload-admin@example.com');
    const memberId = await seedUser(t, 'Upload Member', 'upload-member@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const admin = t.withIdentity({ subject: adminId });
    const member = t.withIdentity({ subject: memberId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Upload Project' });
    await seedMembership(t, projectId, adminId, ownerId, 'admin');
    await seedMembership(t, projectId, memberId, ownerId, 'member');

    await expect(member.mutation(api.sheets.generateUploadUrl, { projectId })).rejects.toThrow(
      'Insufficient project permissions',
    );
    expect(await admin.mutation(api.sheets.generateUploadUrl, { projectId })).toContain(
      '/api/storage/upload',
    );

    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(['%PDF-1.7 demo'], { type: 'application/pdf' })),
    );
    const upload = {
      projectId,
      storageId,
      fileName: 'Level Plans.pdf',
      pages: [
        { name: 'Level Plans', number: 'A-101', pageIndex: 0, width: 2400, height: 1800 },
        { name: 'Level Plans', number: 'A-102', pageIndex: 1, width: 2400, height: 1800 },
      ],
    };

    await expect(member.mutation(api.sheets.completePdfUpload, upload)).rejects.toThrow(
      'Insufficient project permissions',
    );
    const sheetIds = await admin.mutation(api.sheets.completePdfUpload, upload);
    expect(sheetIds).toHaveLength(2);

    const plans = await member.query(api.sheets.listByProjectWithMetadata, { projectId });
    expect(plans).toHaveLength(2);
    expect(plans.map(({ plan }) => plan.pageIndex)).toEqual([0, 1]);
    expect(plans[0].plan).toMatchObject({
      sourceFileRef: storageId,
      sourceStorageId: storageId,
      sourceFileName: 'Level Plans.pdf',
      sourceContentType: 'application/pdf',
    });

    await expect(
      member.mutation(api.sheets.updatePdf, {
        sheetId: sheetIds[0],
        name: 'Member edit',
        discipline: null,
        version: 2,
      }),
    ).rejects.toThrow('Insufficient project permissions');
    await admin.mutation(api.sheets.updatePdf, {
      sheetId: sheetIds[0],
      name: 'Updated Level Plans',
      discipline: 'Architecture',
      version: 2,
    });
    const updatedPlans = await member.query(api.sheets.listByProjectWithMetadata, { projectId });
    expect(updatedPlans.map(({ plan }) => plan.name)).toEqual([
      'Updated Level Plans',
      'Updated Level Plans',
    ]);
    expect(updatedPlans.map(({ plan }) => plan.version)).toEqual([2, 2]);
    expect(updatedPlans.map(({ plan }) => plan.discipline)).toEqual([
      'Architecture',
      'Architecture',
    ]);

    await expect(member.mutation(api.sheets.removePdf, { sheetId: sheetIds[0] })).rejects.toThrow(
      'Insufficient project permissions',
    );
    await admin.mutation(api.sheets.removePdf, { sheetId: sheetIds[0] });
    expect(await member.query(api.sheets.listByProjectWithMetadata, { projectId })).toEqual([]);
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get('_storage', storageId)).toBeNull();
    });
  });

  it('lets members read metadata while only owners/admins edit or remove plans', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Plan Owner', 'plan-owner@example.com');
    const adminId = await seedUser(t, 'Plan Admin', 'plan-admin@example.com');
    const memberId = await seedUser(t, 'Plan Member', 'plan-member@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const admin = t.withIdentity({ subject: adminId });
    const member = t.withIdentity({ subject: memberId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Plans Project' });
    await seedMembership(t, projectId, adminId, ownerId, 'admin');
    await seedMembership(t, projectId, memberId, ownerId, 'member');

    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Ground Floor Plan',
      number: 'A-101',
      discipline: 'Architectural',
      sourceFileRef: 'storage:plan-a101',
      pageIndex: 0,
      width: 2400,
      height: 1800,
      version: 1,
    });
    const memberPlans = await member.query(api.sheets.listByProjectWithMetadata, { projectId });
    expect(memberPlans).toHaveLength(1);
    expect(memberPlans[0].plan).toMatchObject({
      _id: sheetId,
      name: 'Ground Floor Plan',
      number: 'A-101',
      discipline: 'Architectural',
      sourceFileRef: 'storage:plan-a101',
      pageIndex: 0,
      width: 2400,
      height: 1800,
      version: 1,
    });
    expect(memberPlans[0].createdByName).toBe('Plan Owner');
    const workspace = await member.query(api.sheets.getPdfWorkspace, { sheetId });
    expect(workspace.pdfUrl).toBe('storage:plan-a101');
    expect(workspace.pages.map((page) => page._id)).toEqual([sheetId]);

    await expect(
      member.mutation(api.sheets.update, { sheetId, name: 'Member edit' }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(member.mutation(api.sheets.remove, { sheetId })).rejects.toThrow(
      'Insufficient project permissions',
    );

    await admin.mutation(api.sheets.update, {
      sheetId,
      name: 'Updated Ground Floor',
      number: 'A-101.1',
      discipline: 'Architecture',
      version: 2,
    });
    await expect(admin.mutation(api.sheets.update, { sheetId, version: 1.5 })).rejects.toThrow(
      'positive whole number',
    );
    const updatedPlans = await member.query(api.sheets.listByProjectWithMetadata, { projectId });
    expect(updatedPlans[0].plan).toMatchObject({
      name: 'Updated Ground Floor',
      number: 'A-101.1',
      discipline: 'Architecture',
      version: 2,
    });

    const taskId = await member.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.25,
      y: 0.75,
      title: 'Plan-linked task',
    });
    await member.mutation(api.tasks.update, {
      taskId,
      x: 0.4,
      y: 0.6,
      title: 'Saved pin',
      description: 'This description is stored in Convex.',
      status: 'in-progress',
      priority: 1,
      category: 'structural',
      color: '#dc2626',
      assigneeText: 'Site team',
      dueDate: '2026-08-15',
    });
    await member.mutation(api.notes.create, { taskId, text: 'Plan-linked note' });
    await member.mutation(api.attachments.completeUpload, {
      taskId,
      kind: 'file',
      storageRef: 'storage:attachment',
      fileName: 'detail.pdf',
      contentType: 'application/pdf',
      size: 1234,
    });

    const workspaceTasks = await member.query(api.tasks.listByPdf, { sheetId });
    expect(workspaceTasks).toHaveLength(1);
    expect(workspaceTasks[0]).toMatchObject({
      page: 1,
      task: {
        _id: taskId,
        x: 0.4,
        y: 0.6,
        title: 'Saved pin',
        description: 'This description is stored in Convex.',
        status: 'in-progress',
        priority: 1,
        category: 'structural',
        color: '#dc2626',
        assigneeText: 'Site team',
        dueDate: '2026-08-15',
      },
      notes: [{ text: 'Plan-linked note' }],
      photos: [],
    });

    await admin.mutation(api.sheets.remove, { sheetId });
    expect(await member.query(api.sheets.listByProjectWithMetadata, { projectId })).toEqual([]);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(sheetId)).toBeNull();
      expect(await ctx.db.get(taskId)).toBeNull();
      expect(await ctx.db.query('notes').collect()).toEqual([]);
      expect(await ctx.db.query('attachments').collect()).toEqual([]);
    });
  });

  it('requires the exact case-sensitive project name and cascades owner deletion', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Delete Owner', 'delete-owner@example.com');
    const adminId = await seedUser(t, 'Delete Admin', 'delete-admin@example.com');
    const inviteeId = await seedUser(t, 'Delete Invitee', 'delete-invitee@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const admin = t.withIdentity({ subject: adminId });
    const invitee = t.withIdentity({ subject: inviteeId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Case Sensitive Project' });
    await seedMembership(t, projectId, adminId, ownerId, 'admin');
    const invitationId = await owner.mutation(api.invitations.create, {
      projectId,
      email: 'delete-invitee@example.com',
    });
    await invitee.mutation(api.invitations.accept, { invitationId });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Deletion Plan',
      number: 'D-001',
      sourceFileRef: 'storage:delete-plan',
      pageIndex: 0,
      width: 1000,
      height: 1000,
    });
    const taskId = await owner.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.5,
    });
    await owner.mutation(api.notes.create, { taskId, text: 'Delete with project' });
    await owner.mutation(api.attachments.completeUpload, {
      taskId,
      kind: 'photo',
      storageRef: 'storage:delete-photo',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      size: 4321,
    });

    await expect(
      owner.mutation(api.projects.remove, {
        projectId,
        confirmationName: 'case sensitive project',
      }),
    ).rejects.toThrow('does not match exactly');
    expect(await owner.query(api.projects.get, { projectId })).not.toBeNull();
    await expect(
      admin.mutation(api.projects.remove, {
        projectId,
        confirmationName: 'Case Sensitive Project',
      }),
    ).rejects.toThrow('Insufficient project permissions');

    await owner.mutation(api.projects.remove, {
      projectId,
      confirmationName: 'Case Sensitive Project',
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(projectId)).toBeNull();
      expect(await ctx.db.get(sheetId)).toBeNull();
      expect(await ctx.db.get(taskId)).toBeNull();
      expect(await ctx.db.query('projectMembers').collect()).toEqual([]);
      expect(await ctx.db.query('projectInvitations').collect()).toEqual([]);
      expect(await ctx.db.query('notes').collect()).toEqual([]);
      expect(await ctx.db.query('attachments').collect()).toEqual([]);
    });
  });
});
