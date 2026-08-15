import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteOfflinePhotoQueueDatabaseForTests } from './db';
import {
  claimNextQueuedPhoto,
  enqueueMaterializedPhoto,
  getOfflinePhotoQueueSummary,
  listQueuedPhotoUploads,
  markQueuedPhotoFailed,
  retryFailedPhotoUploads,
} from './queue';

function testFile(name = 'IMG_1001.jpg') {
  return new File([new Uint8Array([0xff, 0xd8, 0x00, 0xff, 0xd9])], name, {
    type: 'image/jpeg',
    lastModified: 1_720_000_000_000,
  });
}

async function enqueue(clientUploadId: string, userId = 'user-a', projectId = 'project-a') {
  const file = testFile();
  return await enqueueMaterializedPhoto({
    clientUploadId,
    projectId,
    userId,
    file,
    contentType: file.type,
    clientDiagnostics: { attemptId: clientUploadId, size: file.size, stage: 'selection' },
    now: 100,
  });
}

beforeEach(async () => {
  await deleteOfflinePhotoQueueDatabaseForTests();
});

afterEach(async () => {
  await deleteOfflinePhotoQueueDatabaseForTests();
});

describe('offline photo queue', () => {
  it('persists the materialized bytes and file metadata', async () => {
    const source = await enqueue('upload-1');
    const [stored] = await listQueuedPhotoUploads('user-a', 'project-a');

    expect(stored).toMatchObject({
      clientUploadId: 'upload-1',
      filename: source.filename,
      contentType: 'image/jpeg',
      lastModified: 1_720_000_000_000,
      status: 'pending',
    });
    expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(
      new Uint8Array(await source.blob.arrayBuffer()),
    );
  });

  it('claims each photo at most once across overlapping processors', async () => {
    await enqueue('upload-1');
    await enqueue('upload-2');

    const claims = await Promise.all([
      claimNextQueuedPhoto('user-a', 1_000),
      claimNextQueuedPhoto('user-a', 1_000),
    ]);

    expect(new Set(claims.map((claim) => claim?.clientUploadId))).toEqual(
      new Set(['upload-1', 'upload-2']),
    );
  });

  it('recovers an uploading photo after its lease expires', async () => {
    await enqueue('upload-1');
    expect((await claimNextQueuedPhoto('user-a', 1_000))?.clientUploadId).toBe('upload-1');
    expect(await claimNextQueuedPhoto('user-a', 130_999)).toBeNull();
    expect((await claimNextQueuedPhoto('user-a', 131_000))?.clientUploadId).toBe('upload-1');
  });

  it('retains exhausted failures until a user explicitly retries', async () => {
    await enqueue('upload-1');
    for (let retry = 0; retry < 5; retry += 1) {
      await markQueuedPhotoFailed(
        'upload-1',
        { kind: 'network', retryable: true, message: 'offline' },
        1_000 + retry * 100_000,
      );
    }

    const [failed] = await listQueuedPhotoUploads('user-a');
    expect(failed).toMatchObject({
      status: 'failed',
      failureKind: 'retry-exhausted',
      retryCount: 5,
    });
    expect(await claimNextQueuedPhoto('user-a', 9_999_999)).toBeNull();

    await retryFailedPhotoUploads('user-a', 'project-a');
    expect((await claimNextQueuedPhoto('user-a', 10_000_000))?.clientUploadId).toBe('upload-1');
  });

  it('isolates queue state by signed-in user and project', async () => {
    await enqueue('upload-a', 'user-a', 'project-a');
    await enqueue('upload-b', 'user-b', 'project-a');
    await enqueue('upload-c', 'user-a', 'project-b');

    expect(await getOfflinePhotoQueueSummary('user-a', 'project-a')).toMatchObject({
      pendingCount: 1,
      totalCount: 1,
    });
    expect((await claimNextQueuedPhoto('user-b', 1_000))?.clientUploadId).toBe('upload-b');
  });
});
