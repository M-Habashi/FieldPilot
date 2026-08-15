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
  return await t.run(async (ctx) =>
    ctx.db.insert('users', { name, email: email.trim().toLowerCase() }),
  );
}

async function seedMembership(
  t: TestInstance,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  addedBy: Id<'users'>,
  role: 'admin' | 'member' | 'viewer',
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
  it('stores a project-wide task attribute layout for owners and admins', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Layout Owner', 'layout-owner@example.com');
    const adminId = await seedUser(t, 'Layout Admin', 'layout-admin@example.com');
    const memberId = await seedUser(t, 'Layout Member', 'layout-member@example.com');
    const viewerId = await seedUser(t, 'Layout Viewer', 'layout-viewer@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const admin = t.withIdentity({ subject: adminId });
    const member = t.withIdentity({ subject: memberId });
    const viewer = t.withIdentity({ subject: viewerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Attribute Layout' });
    await seedMembership(t, projectId, adminId, ownerId, 'admin');
    await seedMembership(t, projectId, memberId, ownerId, 'member');
    await seedMembership(t, projectId, viewerId, ownerId, 'viewer');

    const settings = [
      { key: 'quantity' as const, visible: true },
      { key: 'plan' as const, visible: true },
      { key: 'location' as const, visible: false },
      { key: 'startDate' as const, visible: true },
      { key: 'dueDate' as const, visible: true },
      { key: 'manpower' as const, visible: false },
      { key: 'cost' as const, visible: true },
      { key: 'tags' as const, visible: true },
    ];
    await admin.mutation(api.projects.updateTaskAttributeSettings, { projectId, settings });
    expect((await viewer.query(api.projects.get, { projectId }))?.taskAttributeSettings).toEqual(
      settings,
    );

    await expect(
      member.mutation(api.projects.updateTaskAttributeSettings, { projectId, settings }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(
      owner.mutation(api.projects.updateTaskAttributeSettings, {
        projectId,
        settings: [...settings.slice(0, -1), { key: 'cost', visible: false }],
      }),
    ).rejects.toThrow('include every configurable attribute once');
  });

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
    ).rejects.toThrow('No FieldPilot account uses this email address.');
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
  it('lets viewers read project content but rejects every content write', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Role Owner', 'role-owner@example.com');
    const viewerId = await seedUser(t, 'Role Viewer', 'role-viewer@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const viewer = t.withIdentity({ subject: viewerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Role Project' });
    await seedMembership(t, projectId, viewerId, ownerId, 'viewer');
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Role Plan',
      number: 'R-001',
      sourceFileRef: '/demo/role-plan.pdf',
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

    expect(await viewer.query(api.tasks.listByPdf, { sheetId })).toHaveLength(1);
    await expect(
      viewer.mutation(api.tasks.create, { projectId, sheetId, x: 0.2, y: 0.2 }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(
      viewer.mutation(api.tasks.update, { taskId, title: 'Viewer edit' }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(viewer.mutation(api.tasks.remove, { taskId })).rejects.toThrow(
      'Insufficient project permissions',
    );
    await expect(
      viewer.mutation(api.notes.create, { taskId, text: 'Viewer note' }),
    ).rejects.toThrow('Insufficient project permissions');
    await expect(viewer.mutation(api.attachments.generateUploadUrl, { projectId })).rejects.toThrow(
      'Insufficient project permissions',
    );
  });

  it('rejects claiming a project plan as an attachment', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Storage Owner', 'storage-owner@example.com');
    const memberId = await seedUser(t, 'Storage Member', 'storage-member@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const member = t.withIdentity({ subject: memberId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Protected Storage' });
    await seedMembership(t, projectId, memberId, ownerId, 'member');

    const planUpload = await owner.mutation(api.sheets.generateUploadUrl, { projectId });
    const planStorageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(['%PDF-1.7 protected'], { type: 'application/pdf' })),
    );
    const [sheetId] = await owner.mutation(api.sheets.completePdfUpload, {
      projectId,
      uploadClaimId: planUpload.uploadClaimId,
      storageId: planStorageId,
      fileName: 'Protected.pdf',
      pages: [{ name: 'Protected', number: 'P-001', pageIndex: 0, width: 1000, height: 1000 }],
    });
    const taskId = await member.mutation(api.tasks.create, {
      projectId,
      sheetId,
      x: 0.5,
      y: 0.5,
    });
    await expect(
      member.mutation(api.attachments.completeUpload, {
        taskId,
        kind: 'file',
        storageRef: planStorageId,
        fileName: 'stolen-plan.pdf',
        contentType: 'application/pdf',
        size: 18,
      }),
    ).rejects.toThrow(/does not belong|already in use/);

    await member.mutation(api.tasks.remove, { taskId });
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get('_storage', planStorageId)).not.toBeNull();
      expect(await ctx.db.get(sheetId)).not.toBeNull();
      expect(await ctx.db.query('attachments').collect()).toEqual([]);
    });
  });

  it('keeps photo evidence and clears its task assignment when a task is deleted', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Photo Owner', 'photo-owner@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Photo Evidence' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Photo Plan',
      number: 'P-101',
      sourceFileRef: '/demo/photo-plan.pdf',
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
    const photoBlob = new Blob(['photo evidence'], { type: 'image/jpeg' });
    const storageRef = await t.run(async (ctx) => await ctx.storage.store(photoBlob));
    const attachmentId = await owner.mutation(api.attachments.completeUpload, {
      taskId,
      kind: 'photo',
      storageRef,
      fileName: 'evidence.jpg',
      contentType: photoBlob.type,
      size: photoBlob.size,
    });

    await owner.mutation(api.tasks.remove, { taskId });

    await t.run(async (ctx) => {
      const attachment = await ctx.db.get(attachmentId);
      expect(attachment).toMatchObject({ kind: 'photo', projectId, storageRef });
      expect(attachment?.taskId).toBeUndefined();
      expect(await ctx.db.system.get('_storage', storageRef)).not.toBeNull();
    });
  });

  it('stores an unassigned photo at its EXIF location and lists it to project members', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Map Owner', 'map-owner@example.com');
    const viewerId = await seedUser(t, 'Map Viewer', 'map-viewer@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const viewer = t.withIdentity({ subject: viewerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Mapped Photos' });
    await seedMembership(t, projectId, viewerId, ownerId, 'viewer');
    const photoBlob = new Blob(['map photo'], { type: 'image/jpeg' });
    const storageRef = await t.run(async (ctx) => await ctx.storage.store(photoBlob));

    const attachmentId = await owner.mutation(api.attachments.completeUpload, {
      projectId,
      kind: 'photo',
      storageRef,
      fileName: 'site.jpg',
      contentType: photoBlob.type,
      size: photoBlob.size,
      latitude: 39.7684,
      longitude: -86.1581,
      originalLatitude: 39.7684,
      originalLongitude: -86.1581,
      locationSource: 'exif',
    });

    const photos = await viewer.query(api.attachments.listProjectPhotos, { projectId });
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      attachment: {
        _id: attachmentId,
        latitude: 39.7684,
        longitude: -86.1581,
        originalLatitude: 39.7684,
        originalLongitude: -86.1581,
        locationSource: 'exif',
        locationUpdatedAt: expect.any(Number),
      },
      task: null,
    });
    expect(photos[0].attachment.taskId).toBeUndefined();
    expect(await viewer.query(api.attachments.getPhotoMapState, { attachmentId })).toEqual({
      photoUpdatedAt: expect.any(Number),
    });
  });

  it('keeps a photo location independent from task assignment and rejects stale photo edits', async () => {
    const t = createTest();
    const ownerId = await seedUser(t, 'Photo Map Owner', 'photo-map-owner@example.com');
    const owner = t.withIdentity({ subject: ownerId });
    const projectId = await owner.mutation(api.projects.create, { name: 'Photo Map Updates' });
    const sheetId = await owner.mutation(api.sheets.create, {
      projectId,
      name: 'Photo Map Plan',
      number: 'M-101',
      sourceFileRef: '/demo/photo-map-plan.pdf',
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
    const photoBlob = new Blob(['movable photo'], { type: 'image/jpeg' });
    const storageRef = await t.run(async (ctx) => await ctx.storage.store(photoBlob));
    const attachmentId = await owner.mutation(api.attachments.completeUpload, {
      projectId,
      kind: 'photo',
      storageRef,
      fileName: 'movable.jpg',
      contentType: photoBlob.type,
      size: photoBlob.size,
      latitude: 39.7684,
      longitude: -86.1581,
      originalLatitude: 39.7684,
      originalLongitude: -86.1581,
      locationSource: 'exif',
    });
    const originalVersion = await t.run(
      async (ctx) => (await ctx.db.get(attachmentId))?.photoUpdatedAt,
    );
    expect(originalVersion).toEqual(expect.any(Number));

    const moved = await owner.mutation(api.attachments.setPhotoLocation, {
      attachmentId,
      latitude: 40.0,
      longitude: -85.0,
      expectedPhotoUpdatedAt: originalVersion,
    });
    await expect(
      owner.mutation(api.attachments.assignPhoto, {
        attachmentId,
        taskId,
        expectedPhotoUpdatedAt: originalVersion,
      }),
    ).rejects.toThrow('This photo changed before it could be undone.');

    await owner.mutation(api.attachments.assignPhoto, {
      attachmentId,
      taskId,
      expectedPhotoUpdatedAt: moved.photoUpdatedAt,
    });
    const photos = await owner.query(api.attachments.listProjectPhotos, { projectId });
    expect(photos[0]).toMatchObject({
      attachment: { _id: attachmentId, latitude: 40, longitude: -85, locationSource: 'manual' },
      task: { _id: taskId },
    });
  });

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
    const planUpload = await admin.mutation(api.sheets.generateUploadUrl, { projectId });
    expect(planUpload.uploadUrl).toContain('/api/storage/upload');

    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(['%PDF-1.7 demo'], { type: 'application/pdf' })),
    );
    const upload = {
      projectId,
      uploadClaimId: planUpload.uploadClaimId,
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
      sourceFileRef: '/demo/test-plan-a101.pdf',
      pageIndex: 0,
      width: 2400,
      height: 1800,
      version: 1,
    });
    await expect(
      owner.mutation(api.sheets.create, {
        projectId,
        name: 'External tracker',
        number: 'A-102',
        sourceFileRef: 'https://tracker.example/plan.pdf',
        pageIndex: 1,
        width: 2400,
        height: 1800,
      }),
    ).rejects.toThrow('same-origin application path');
    const memberPlans = await member.query(api.sheets.listByProjectWithMetadata, { projectId });
    expect(memberPlans).toHaveLength(1);
    expect(memberPlans[0].plan).toMatchObject({
      _id: sheetId,
      name: 'Ground Floor Plan',
      number: 'A-101',
      discipline: 'Architectural',
      sourceFileRef: '/demo/test-plan-a101.pdf',
      pageIndex: 0,
      width: 2400,
      height: 1800,
      version: 1,
    });
    expect(memberPlans[0].createdByName).toBe('Plan Owner');
    const workspace = await member.query(api.sheets.getPdfWorkspace, { sheetId });
    expect(workspace.pdfUrl).toBe('/demo/test-plan-a101.pdf');
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
    const attachmentBlob = new Blob(['detail'], { type: 'application/pdf' });
    const attachmentStorageId = await t.run(async (ctx) => await ctx.storage.store(attachmentBlob));
    await member.mutation(api.attachments.completeUpload, {
      taskId,
      kind: 'file',
      storageRef: attachmentStorageId,
      fileName: 'detail.pdf',
      contentType: 'application/pdf',
      size: attachmentBlob.size,
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
    });
    expect(await member.query(api.notes.listByTask, { taskId })).toMatchObject([
      { text: 'Plan-linked note' },
    ]);
    expect(await member.query(api.attachments.listByTask, { taskId })).toHaveLength(1);

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
      sourceFileRef: '/demo/delete-plan.pdf',
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
    const photoBlob = new Blob(['photo'], { type: 'image/jpeg' });
    const photoStorageId = await t.run(async (ctx) => await ctx.storage.store(photoBlob));
    await owner.mutation(api.attachments.completeUpload, {
      taskId,
      kind: 'photo',
      storageRef: photoStorageId,
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      size: photoBlob.size,
    });
    const diagnostic = {
      projectId,
      attemptId: 'delete-project-diagnostic',
      phase: 'failed' as const,
      stage: 'backend-complete' as const,
      errorName: 'TestError',
    };
    await expect(t.mutation(api.photoUploadDiagnostics.record, diagnostic)).rejects.toThrow(
      'Unauthenticated',
    );
    await owner.mutation(api.photoUploadDiagnostics.record, diagnostic);

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
      expect(await ctx.db.query('photoUploadDiagnostics').collect()).toEqual([]);
    });
  });
});
