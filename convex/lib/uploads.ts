import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export type UploadPurpose = 'attachment' | 'plan';

const UPLOAD_CLAIM_MAX_AGE_MS = 15 * 60 * 1000;

export async function issueUploadClaim(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  purpose: UploadPurpose,
) {
  const now = Date.now();
  const previousClaims = await ctx.db
    .query('pendingUploads')
    .withIndex('by_user_project_purpose', (q) =>
      q.eq('userId', userId).eq('projectId', projectId).eq('purpose', purpose),
    )
    .collect();
  await Promise.all(
    previousClaims
      .filter((claim) => now - claim.createdAt > UPLOAD_CLAIM_MAX_AGE_MS)
      .map((claim) => ctx.db.delete(claim._id)),
  );

  const uploadClaimId = await ctx.db.insert('pendingUploads', {
    projectId,
    userId,
    purpose,
    createdAt: now,
  });
  return {
    uploadUrl: await ctx.storage.generateUploadUrl(),
    uploadClaimId,
  };
}

export async function consumeUploadClaim(
  ctx: MutationCtx,
  args: {
    uploadClaimId: Id<'pendingUploads'>;
    storageId: Id<'_storage'>;
    projectId: Id<'projects'>;
    userId: Id<'users'>;
    purpose: UploadPurpose;
  },
) {
  const claim = await ctx.db.get(args.uploadClaimId);
  if (
    claim === null ||
    claim.projectId !== args.projectId ||
    claim.userId !== args.userId ||
    claim.purpose !== args.purpose ||
    Date.now() - claim.createdAt > UPLOAD_CLAIM_MAX_AGE_MS
  ) {
    throw new Error('This upload session is invalid or has expired. Upload the file again.');
  }

  const storedFile = await ctx.db.system.get('_storage', args.storageId);
  if (storedFile === null || storedFile._creationTime < claim.createdAt) {
    throw new Error('The uploaded file does not belong to this upload session.');
  }

  // A storage object may have exactly one owning record (apart from the intentional multi-page
  // sheet rows created together below). This blocks claiming a plan or another project's attachment
  // by copying a storage ID from a bearer URL and later deleting the victim record's blob.
  const [existingSheet, existingAttachment] = await Promise.all([
    ctx.db
      .query('sheets')
      .withIndex('by_sourceStorageId', (q) => q.eq('sourceStorageId', args.storageId))
      .first(),
    ctx.db
      .query('attachments')
      .withIndex('by_storageRef', (q) => q.eq('storageRef', args.storageId))
      .first(),
  ]);
  if (existingSheet !== null || existingAttachment !== null) {
    throw new Error('This uploaded file is already in use.');
  }

  await ctx.db.delete(claim._id);
  return storedFile;
}
